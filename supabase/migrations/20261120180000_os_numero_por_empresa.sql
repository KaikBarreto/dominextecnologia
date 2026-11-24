-- Numeração de OS por empresa (contador próprio de cada tenant) + renumeração
-- de todas as OS existentes.
-- ----------------------------------------------------------------------------
-- Por quê: service_orders.order_number vinha de UMA sequência global
-- (service_orders_order_number_seq) compartilhada por todos os tenants. Cada
-- empresa via a numeração "pulando" (a Glacial tinha 1.118 registros numerados
-- de 1 a 13.567) e o número da OS denunciava o volume dos outros clientes.
--
-- O que muda:
--  1. service_order_number_counters(company_id, scope): contador por empresa.
--     scope = 'os' (OS de verdade) ou 'tarefa' (tarefas, que moram na mesma
--     tabela com entry_type='tarefa'). Tarefa não aparece com número na tela;
--     se dividisse o contador com a OS, a numeração de OS da empresa voltaria a
--     ter buracos (na Glacial, 494 de 1.118 linhas são tarefas).
--  2. A sequência global sai do DEFAULT. O número é SEMPRE dado pelo servidor
--     no BEFORE INSERT (trg_service_orders_zz_order_number, último da fila
--     alfabética, depois de company_id/created_by preenchidos). Valor mandado
--     pelo client é ignorado (só service_role/postgres pode fixar número).
--  3. A verdade é o maior número EM USO: next_service_order_number trava a
--     linha do contador e só então lê o maior número existente na empresa (+
--     reservas vivas). Por isso o número do topo volta a ser usado quando a OS
--     do topo é excluída ou quando a reserva do topo vence/é liberada. Buraco no
--     meio não é reaproveitado (exceto no mesmo transação, item 6).
--  4. Reserva (formulário de OS): continua reservando o número definitivo ao
--     abrir, agora no contador da empresa. Reserva vencida/liberada deixa de
--     segurar número. Nova RPC release_service_order_number para o front
--     devolver o número ao fechar o formulário sem salvar. Reserva liberada que
--     volta a ser usada ganha o próximo número da empresa (sem erro).
--  5. Recuo ao excluir: gatilho por statement ajusta o contador.
--  6. Exclusão + criação no MESMO transação (regenerar visitas de contrato/
--     PMOC) reaproveita os números liberados, do menor para o maior.
--     regenerate_contract_visits passa a apagar ANTES de criar.
--  7. Renumeração: row_number() por (empresa, scope) na ordem
--     (created_at, order_number, id). Número antigo fica em legacy_order_number.
--  8. UNIQUE (company_id, scope, order_number) só depois da renumeração.
--
-- Lock: a migration pega ACCESS EXCLUSIVE em service_orders logo no começo
-- (lock_timeout 5s) para não fazer upgrade de lock no meio (deadlock 40P01 já
-- visto nessa tabela). Se estourar o lock_timeout, nada é aplicado: rodar de
-- novo em horário mais calmo.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '180s';
-- Dispara agora eventos de FK adiados (a FK reserva->OS é DEFERRABLE): ALTER
-- TABLE falha com 55006 se houver evento pendente na tabela.
SET CONSTRAINTS public.service_order_number_reservations_service_order_id_fkey IMMEDIATE;

-- Tabela nova ANTES de travar service_orders: o REFERENCES companies pede
-- lock em companies e não pode esperar com a OS travada para todos.
-- 1) Contador por empresa ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_order_number_counters (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'os' CHECK (scope IN ('os','tarefa')),
  next_value integer NOT NULL DEFAULT 1 CHECK (next_value > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, scope)
);
COMMENT ON TABLE public.service_order_number_counters IS
 'Próximo número de OS/tarefa por empresa. Trava de alocação + cache: a verdade é o maior número em uso (ver next_service_order_number). Sem acesso do client.';
ALTER TABLE public.service_order_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_order_number_counters FROM PUBLIC, anon, authenticated;

-- Travas na ordem: OS, reservas, lançamentos (texto do número, item 5b).
LOCK TABLE public.service_orders IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.service_order_number_reservations IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.financial_transactions IN SHARE ROW EXCLUSIVE MODE;

-- 2) Colunas novas -----------------------------------------------------------
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS legacy_order_number integer;
COMMENT ON COLUMN public.service_orders.legacy_order_number IS
 'Número da OS na numeração global antiga (antes de 2026-11-20). NULL para OS criada depois da numeração por empresa.';
COMMENT ON COLUMN public.service_orders.order_number IS
 'Número sequencial por empresa (scope os/tarefa), atribuído pelo servidor no INSERT. Não é único entre empresas: toda busca por número precisa de company_id.';

ALTER TABLE public.service_order_number_reservations ADD COLUMN IF NOT EXISTS released_at timestamptz;
COMMENT ON COLUMN public.service_order_number_reservations.released_at IS
 'Reserva não consumida que devolveu o número (formulário fechado, venceu ou virada de numeração). Se o mesmo pedido voltar, ganha o próximo número da empresa.';

-- 3) Funções do contador -------------------------------------------------------

-- Maior número ainda segurado na empresa/scope: OS existentes + reservas vivas
-- (não consumidas, não liberadas, não vencidas). Usa o índice único
-- (company_id, (entry_type='tarefa'), order_number) em busca reversa.
CREATE OR REPLACE FUNCTION public.service_order_number_in_use_max_internal(p_company_id uuid, p_scope text)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  SELECT GREATEST(
    COALESCE((
      SELECT so.order_number FROM public.service_orders so
       WHERE so.company_id = p_company_id
         AND (so.entry_type = 'tarefa') = (p_scope = 'tarefa')
       ORDER BY so.order_number DESC
       LIMIT 1
    ), 0),
    CASE WHEN p_scope = 'os' THEN COALESCE((
      SELECT max(r.order_number) FROM public.service_order_number_reservations r
       WHERE r.company_id = p_company_id
         AND r.consumed_at IS NULL AND r.released_at IS NULL
         AND r.expires_at > clock_timestamp()
    ), 0) ELSE 0 END
  );
$fn$;
REVOKE ALL ON FUNCTION public.service_order_number_in_use_max_internal(uuid,text) FROM PUBLIC, anon, authenticated;

-- Trava (e cria, se faltar) a linha do contador. Usada por quem precisa travar
-- o contador ANTES de travar uma reserva, na mesma ordem de next_*_number
-- (contador -> reserva), para não haver deadlock.
CREATE OR REPLACE FUNCTION public.service_order_number_counter_lock_internal(p_company_id uuid, p_scope text DEFAULT 'os')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  PERFORM 1 FROM public.service_order_number_counters c
   WHERE c.company_id = p_company_id AND c.scope = p_scope FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.service_order_number_counters (company_id, scope, next_value)
    VALUES (p_company_id, p_scope, 1) ON CONFLICT (company_id, scope) DO NOTHING;
    PERFORM 1 FROM public.service_order_number_counters c
     WHERE c.company_id = p_company_id AND c.scope = p_scope FOR UPDATE;
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.service_order_number_counter_lock_internal(uuid,text) FROM PUBLIC, anon, authenticated;

-- Consome e devolve o próximo número da empresa. Atômica por empresa: trava a
-- linha do contador (FOR UPDATE) e SÓ DEPOIS, em outro statement (snapshot
-- novo no READ COMMITTED), lê o maior número em uso. Inserts concorrentes da
-- mesma empresa esperam essa trava até o commit, então nunca repetem número.
-- Uso interno (gatilho/RPCs SECURITY DEFINER): não é exposta ao client, senão
-- qualquer usuário queimaria número de outra empresa.
CREATE OR REPLACE FUNCTION public.next_service_order_number(p_company_id uuid, p_scope text DEFAULT 'os')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_scope  text := CASE WHEN p_scope = 'tarefa' THEN 'tarefa' ELSE 'os' END;
  v_locked integer;
  v_max    integer;
  v_num    integer;
  v_freed  jsonb;
  v_key    text;
  v_rest   jsonb;
  v_pref   integer;
  v_held   jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível identificar a empresa da OS.' USING ERRCODE = '23502';
  END IF;

  SELECT c.next_value INTO v_locked
    FROM public.service_order_number_counters c
   WHERE c.company_id = p_company_id AND c.scope = v_scope
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.service_order_number_counters (company_id, scope, next_value)
    VALUES (p_company_id, v_scope, 1)
    ON CONFLICT (company_id, scope) DO NOTHING;
    SELECT c.next_value INTO v_locked
      FROM public.service_order_number_counters c
     WHERE c.company_id = p_company_id AND c.scope = v_scope
     FOR UPDATE;
  END IF;

  -- Statement novo depois da trava: enxerga o que foi commitado por quem
  -- segurava o contador.
  v_max := public.service_order_number_in_use_max_internal(p_company_id, v_scope);

  -- Reserva vencida acima do topo deixa de segurar o número: ele vai ser
  -- reemitido agora (o UNIQUE parcial das reservas exige a liberação).
  IF v_scope = 'os' THEN
    UPDATE public.service_order_number_reservations r
       SET released_at = clock_timestamp()
     WHERE r.company_id = p_company_id
       AND r.consumed_at IS NULL AND r.released_at IS NULL
       AND r.expires_at <= clock_timestamp()
       AND r.order_number > v_max;
  END IF;

  -- Números liberados por exclusão NESTE transação (ex.: regenerar visitas do
  -- contrato apaga as futuras e recria): reaproveita do menor para o maior.
  v_key := p_company_id::text || ':' || v_scope;
  v_freed := COALESCE(NULLIF(current_setting('app.service_order_numbers_freed', true), '')::jsonb, '{}'::jsonb);
  -- regenerate_contract_visits informa o número que a visita nova deve herdar
  -- (o da visita antiga cujo código curto ela herda) e segura esses números
  -- para que as outras visitas não os peguem antes.
  v_pref := NULLIF(current_setting('app.service_order_number_preferred', true), '')::integer;
  v_held := COALESCE(NULLIF(current_setting('app.service_order_numbers_held', true), '')::jsonb, '[]'::jsonb);
  IF v_freed ? v_key THEN
    SELECT f.n INTO v_num
      FROM (SELECT (e.value #>> '{}')::integer AS n FROM jsonb_array_elements(v_freed -> v_key) e) f
     WHERE f.n <= v_max
       AND (f.n = v_pref OR NOT (v_held @> jsonb_build_array(f.n)))
       AND NOT EXISTS (SELECT 1 FROM public.service_orders so
                        WHERE so.company_id = p_company_id
                          AND (so.entry_type = 'tarefa') = (v_scope = 'tarefa')
                          AND so.order_number = f.n)
       AND NOT EXISTS (SELECT 1 FROM public.service_order_number_reservations r
                        WHERE r.company_id = p_company_id AND v_scope = 'os'
                          AND r.order_number = f.n
                          AND r.consumed_at IS NULL AND r.released_at IS NULL)
     ORDER BY (f.n = v_pref) DESC NULLS LAST, f.n
     LIMIT 1;
    -- Mantém na lista só o que ainda pode ser usado depois deste.
    SELECT COALESCE(jsonb_agg(to_jsonb(f.n) ORDER BY f.n), '[]'::jsonb) INTO v_rest
      FROM (SELECT (e.value #>> '{}')::integer AS n FROM jsonb_array_elements(v_freed -> v_key) e) f
     WHERE f.n <= v_max AND f.n IS DISTINCT FROM v_num;
    v_freed := CASE WHEN jsonb_array_length(v_rest) = 0 THEN v_freed - v_key
                    ELSE jsonb_set(v_freed, ARRAY[v_key], v_rest) END;
    PERFORM set_config('app.service_order_numbers_freed', v_freed::text, true);
  END IF;

  IF v_num IS NULL THEN
    v_num := v_max + 1;
  END IF;

  UPDATE public.service_order_number_counters
     SET next_value = GREATEST(v_max, v_num) + 1, updated_at = now()
   WHERE company_id = p_company_id AND scope = v_scope
     AND next_value IS DISTINCT FROM GREATEST(v_max, v_num) + 1;

  RETURN v_num;
END;
$fn$;
REVOKE ALL ON FUNCTION public.next_service_order_number(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_service_order_number(uuid,text) TO service_role;

-- Recua o contador para (maior em uso + 1) quando isso for menor. Nunca
-- aumenta, nunca fica abaixo de um número em uso. Trava antes de ler o max.
CREATE OR REPLACE FUNCTION public.service_order_number_recede_internal(p_company_id uuid, p_scope text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE v_locked integer; v_max integer;
BEGIN
  SELECT c.next_value INTO v_locked
    FROM public.service_order_number_counters c
   WHERE c.company_id = p_company_id AND c.scope = p_scope
   FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_max := public.service_order_number_in_use_max_internal(p_company_id, p_scope);
  IF v_max + 1 < v_locked THEN
    UPDATE public.service_order_number_counters
       SET next_value = v_max + 1, updated_at = now()
     WHERE company_id = p_company_id AND scope = p_scope;
  END IF;
  RETURN v_max;
END;
$fn$;
REVOKE ALL ON FUNCTION public.service_order_number_recede_internal(uuid,text) FROM PUBLIC, anon, authenticated;

-- Gatilho por STATEMENT de DELETE: um cálculo por empresa/scope (exclusão em
-- cascata de cliente/empresa apaga muitas de uma vez). Ordem fixa por
-- (company_id, scope) evita deadlock entre deletes multi-empresa. Registra os
-- números do meio liberados para reuso no mesmo transação (GUC local).
CREATE OR REPLACE FUNCTION public.service_order_number_recede_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  r       record;
  v_max   integer;
  v_freed jsonb;
  v_key   text;
  v_list  jsonb;
BEGIN
  v_freed := COALESCE(NULLIF(current_setting('app.service_order_numbers_freed', true), '')::jsonb, '{}'::jsonb);
  FOR r IN
    SELECT d.company_id,
           CASE WHEN d.entry_type = 'tarefa' THEN 'tarefa' ELSE 'os' END AS scope,
           array_agg(DISTINCT d.order_number) AS nums
      FROM deleted_rows d
     WHERE d.company_id IS NOT NULL AND d.order_number IS NOT NULL
     GROUP BY 1, 2
     ORDER BY 1, 2
  LOOP
    v_max := public.service_order_number_recede_internal(r.company_id, r.scope);
    IF v_max IS NULL THEN CONTINUE; END IF; -- sem contador (empresa sendo apagada)
    v_key := r.company_id::text || ':' || r.scope;
    SELECT COALESCE(jsonb_agg(to_jsonb(x.n) ORDER BY x.n), '[]'::jsonb) INTO v_list
      FROM (
        SELECT DISTINCT u.n
          FROM unnest(r.nums || COALESCE(ARRAY(
                 SELECT (e.value #>> '{}')::integer FROM jsonb_array_elements(v_freed -> v_key) e
               ), '{}'::integer[])) AS u(n)
         WHERE u.n <= v_max
         ORDER BY u.n
         LIMIT 2000
      ) x;
    v_freed := CASE WHEN jsonb_array_length(v_list) = 0 THEN v_freed - v_key
                    ELSE jsonb_set(v_freed, ARRAY[v_key], v_list) END;
  END LOOP;
  PERFORM set_config('app.service_order_numbers_freed', v_freed::text, true);
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.service_order_number_recede_on_delete() FROM PUBLIC, anon, authenticated;

-- 4) Reserva -------------------------------------------------------------------
-- Mesma assinatura/segurança da versão viva (bundle antigo em cache continua
-- chamando). Muda só a origem do número (contador da empresa) e a reserva
-- liberada, que volta com o próximo número em vez de erro.
CREATE OR REPLACE FUNCTION public.reserve_service_order_number(p_company_id uuid, p_user_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_row public.service_order_number_reservations; v_number integer;
BEGIN
 IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id
    OR p_company_id IS DISTINCT FROM public.get_user_company_id(auth.uid())
    OR public.tenant_subscription_allows_access(p_company_id) IS DISTINCT FROM true
    OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid()
      AND p.company_id=p_company_id AND p.is_active IS TRUE)
    OR NOT (public.is_admin_or_gestor(auth.uid()) OR EXISTS(
      SELECT 1 FROM public.user_permissions up WHERE up.user_id=auth.uid() AND up.is_active
      AND (up.permissions ? '*' OR up.permissions ? 'fn:create_os')
    ))
 THEN RAISE EXCEPTION 'Não foi possível acessar a numeração nesta sessão.' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL THEN
   RAISE EXCEPTION 'Solicitação de numeração inválida.' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('service-order-number-id:'||p_request_id::text,0));
 SELECT * INTO v_row FROM public.service_order_number_reservations WHERE id=p_request_id FOR UPDATE;
 IF FOUND THEN
   IF v_row.company_id IS DISTINCT FROM p_company_id OR v_row.user_id IS DISTINCT FROM auth.uid() THEN
     RAISE EXCEPTION 'Não foi possível acessar a numeração nesta sessão.' USING ERRCODE='42501';
   END IF;
   IF v_row.consumed_at IS NOT NULL THEN
     RAISE EXCEPTION 'Este número já pertence a uma OS salva.' USING ERRCODE='OSN03';
   END IF;
   IF v_row.expires_at<=clock_timestamp() THEN
     RAISE EXCEPTION 'A reserva do número expirou.' USING ERRCODE='OSN02';
   END IF;
   IF v_row.released_at IS NOT NULL THEN
     -- Número devolvido (formulário fechado ou virada para numeração por
     -- empresa): o mesmo pedido continua válido com o próximo número.
     v_number:=public.next_service_order_number(p_company_id,'os');
     UPDATE public.service_order_number_reservations
        SET order_number=v_number, released_at=NULL
      WHERE id=v_row.id RETURNING * INTO v_row;
   END IF;
 ELSE
   IF EXISTS(SELECT 1 FROM public.service_orders WHERE id=p_request_id) THEN
     RAISE EXCEPTION 'Este preenchimento já pertence a uma OS salva.' USING ERRCODE='OSN03';
   END IF;
   v_number:=public.next_service_order_number(p_company_id,'os');
   INSERT INTO public.service_order_number_reservations(id,company_id,user_id,order_number)
   VALUES(p_request_id,p_company_id,auth.uid(),v_number) RETURNING * INTO v_row;
 END IF;
 RETURN jsonb_build_object('reservation_id',v_row.id,'order_number',v_row.order_number,'expires_at',v_row.expires_at);
END $function$;

-- Devolve o número de um formulário fechado sem salvar. Idempotente: reserva
-- inexistente, de outro usuário, já consumida ou já liberada devolve false.
CREATE OR REPLACE FUNCTION public.release_service_order_number(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE v_row public.service_order_number_reservations; v_company uuid;
BEGIN
  IF auth.uid() IS NULL OR p_request_id IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('service-order-number-id:'||p_request_id::text,0));
  -- Ordem de trava igual à de next_service_order_number (contador -> reserva):
  -- lê a empresa sem trava, trava o contador, depois trava e revalida a reserva.
  SELECT r.company_id INTO v_company FROM public.service_order_number_reservations r WHERE r.id = p_request_id;
  IF NOT FOUND OR v_company IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN RETURN false; END IF;
  PERFORM public.service_order_number_counter_lock_internal(v_company, 'os');
  SELECT * INTO v_row FROM public.service_order_number_reservations WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_row.user_id IS DISTINCT FROM auth.uid()
     OR v_row.company_id IS DISTINCT FROM public.get_user_company_id(auth.uid())
     OR v_row.consumed_at IS NOT NULL OR v_row.released_at IS NOT NULL THEN
    RETURN false;
  END IF;
  UPDATE public.service_order_number_reservations SET released_at = clock_timestamp() WHERE id = v_row.id;
  PERFORM public.service_order_number_recede_internal(v_row.company_id, 'os');
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.release_service_order_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_service_order_number(uuid) TO authenticated, service_role;

-- Gatilho de numeração (substitui o guard da reserva). Mesmo nome de função,
-- mesma segurança/search_path/grants; o gatilho muda de nome para rodar POR
-- ÚLTIMO (zz), depois de company_id e created_by preenchidos.
CREATE OR REPLACE FUNCTION public.guard_service_order_number_reservation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
 v_res public.service_order_number_reservations;
 v_owner_fk_cleanup boolean:=false;
 v_priv boolean:=auth.role()='service_role' OR (auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin'));
 v_scope text:=CASE WHEN NEW.entry_type='tarefa' THEN 'tarefa' ELSE 'os' END;
 v_reserved jsonb;
BEGIN
 IF NEW.company_id IS NULL THEN
   RAISE EXCEPTION 'Não foi possível identificar a empresa da OS.' USING ERRCODE='23502';
 END IF;
 IF TG_OP='UPDATE' THEN
   SELECT * INTO v_res FROM public.service_order_number_reservations WHERE service_order_id=OLD.id;
   IF FOUND THEN
     -- A FK created_by usa ON DELETE SET NULL. Depois de excluir auth.users,
     -- preserva a OS e permite somente essa limpeza; usuário vivo não pode apagar a origem.
     v_owner_fk_cleanup:=NEW.created_by IS NULL AND OLD.created_by=v_res.user_id
       AND NEW.id=OLD.id AND NEW.company_id=OLD.company_id AND NEW.order_number=OLD.order_number
       AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_res.user_id);
     IF NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM v_res.company_id
        OR (NEW.created_by IS DISTINCT FROM v_res.user_id AND NOT v_owner_fk_cleanup) THEN
       RAISE EXCEPTION 'A numeração e a origem da OS salva não podem ser alteradas.' USING ERRCODE='42501';
     END IF;
   END IF;
   IF NEW.company_id IS DISTINCT FROM OLD.company_id
      OR v_scope IS DISTINCT FROM (CASE WHEN OLD.entry_type='tarefa' THEN 'tarefa' ELSE 'os' END) THEN
     -- Mudou de empresa ou de OS<->tarefa: entra na sequência de destino.
     NEW.order_number:=public.next_service_order_number(NEW.company_id,v_scope);
   ELSIF NEW.order_number IS DISTINCT FROM OLD.order_number THEN
     IF NOT v_priv THEN
       RAISE EXCEPTION 'A numeração da OS não pode ser alterada.' USING ERRCODE='42501';
     END IF;
     IF NEW.order_number IS NULL OR NEW.order_number<=0 THEN
       NEW.order_number:=public.next_service_order_number(NEW.company_id,v_scope);
     END IF;
   END IF;
   IF v_res.id IS NOT NULL AND NEW.order_number IS DISTINCT FROM v_res.order_number THEN
     UPDATE public.service_order_number_reservations SET order_number=NEW.order_number WHERE id=v_res.id;
   END IF;
 ELSE
   PERFORM pg_advisory_xact_lock(hashtextextended('service-order-number-id:'||NEW.id::text,0));
   SELECT * INTO v_res FROM public.service_order_number_reservations WHERE id=NEW.id FOR UPDATE;
   IF FOUND THEN
     IF auth.uid() IS NULL OR v_res.user_id IS DISTINCT FROM auth.uid()
        OR NEW.company_id IS DISTINCT FROM v_res.company_id
        OR COALESCE(NEW.created_by,auth.uid()) IS DISTINCT FROM v_res.user_id
        OR public.tenant_subscription_allows_access(v_res.company_id) IS DISTINCT FROM true
        OR NEW.entry_type IS DISTINCT FROM 'os' THEN
       RAISE EXCEPTION 'Não foi possível usar a numeração nesta sessão.' USING ERRCODE='42501';
     END IF;
     IF v_res.consumed_at IS NOT NULL THEN
       RAISE EXCEPTION 'Este número já pertence a uma OS salva.' USING ERRCODE='OSN03';
     END IF;
     IF v_res.expires_at<=clock_timestamp() THEN
       RAISE EXCEPTION 'A reserva do número expirou.' USING ERRCODE='OSN02';
     END IF;
     -- Revalida permissão/perfil (podem ter mudado desde que o modal abriu) e,
     -- se a reserva foi liberada (ex.: emitida antes da numeração por empresa),
     -- re-reserva com o próximo número da empresa.
     v_reserved:=public.reserve_service_order_number(v_res.company_id,v_res.user_id,v_res.id);
     NEW.created_by:=v_res.user_id;
     NEW.order_number:=(v_reserved->>'order_number')::integer;
     UPDATE public.service_order_number_reservations
       SET service_order_id=NEW.id,consumed_at=clock_timestamp() WHERE id=v_res.id;
   ELSIF NEW.order_number IS NULL OR NEW.order_number<=0 OR NOT v_priv THEN
     -- Número é sempre do servidor: valor vindo do client é ignorado.
     NEW.order_number:=public.next_service_order_number(NEW.company_id,v_scope);
   END IF;
 END IF;
 -- Número fixado por service_role/postgres não pode tomar o de reserva viva.
 IF v_priv AND v_scope='os' AND EXISTS(
   SELECT 1 FROM public.service_order_number_reservations r
    WHERE r.company_id=NEW.company_id AND r.order_number=NEW.order_number
      AND r.consumed_at IS NULL AND r.released_at IS NULL
      AND r.expires_at>clock_timestamp() AND r.id<>NEW.id) THEN
   RAISE EXCEPTION 'Este número pertence a uma reserva de OS.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.guard_service_order_number_reservation() FROM PUBLIC, anon, authenticated, service_role;

-- 5) Renumeração (uma vez só: pula se o índice único por empresa já existe) ---
DROP TRIGGER IF EXISTS guard_service_order_number_reservation ON public.service_orders;

DO $renumber$
DECLARE
  v_rows bigint; v_res_synced bigint; v_res_released bigint; v_counters bigint;
  v_ft_link bigint; v_ft_match bigint; v_notif bigint;
  v_t0 timestamptz := clock_timestamp();
BEGIN
  IF to_regclass('public.service_orders_company_scope_order_number_key') IS NOT NULL THEN
    RAISE NOTICE 'Renumeração já aplicada; nada a fazer.';
    RETURN;
  END IF;

  -- Gatilhos BEFORE UPDATE por linha que disparariam com SET order_number:
  --  - update_service_orders_updated_at: mexeria em updated_at das 3.7k OS;
  --  - trg_guard_contract_visit_customization: refaz checagem de competência
  --    do contrato (pode barrar dado legado) — número não é campo de contrato;
  --  - trg_ensure_public_short_code / trg_service_orders_track_pause_resume /
  --    guard_service_business_core_v1: no-op para esta mudança, desligados
  --    para não rodar 3.7k vezes e não depender de dado legado.
  -- Os AFTER UPDATE têm lista de colunas (status, agenda...) e não disparam.
  -- DISABLE dentro do transação com ACCESS EXCLUSIVE: ninguém mais enxerga o
  -- gatilho desligado; religados antes do COMMIT.
  ALTER TABLE public.service_orders DISABLE TRIGGER update_service_orders_updated_at;
  ALTER TABLE public.service_orders DISABLE TRIGGER trg_guard_contract_visit_customization;
  ALTER TABLE public.service_orders DISABLE TRIGGER trg_ensure_public_short_code;
  ALTER TABLE public.service_orders DISABLE TRIGGER trg_service_orders_track_pause_resume;
  ALTER TABLE public.service_orders DISABLE TRIGGER guard_service_business_core_v1;

  WITH ordered AS (
    SELECT so.id,
           row_number() OVER (
             PARTITION BY so.company_id, (so.entry_type = 'tarefa')
             ORDER BY so.created_at, so.order_number, so.id
           )::integer AS rn
      FROM public.service_orders so
  )
  UPDATE public.service_orders so
     SET legacy_order_number = COALESCE(so.legacy_order_number, so.order_number),
         order_number = o.rn
    FROM ordered o
   WHERE so.id = o.id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  ALTER TABLE public.service_orders ENABLE TRIGGER update_service_orders_updated_at;
  ALTER TABLE public.service_orders ENABLE TRIGGER trg_guard_contract_visit_customization;
  ALTER TABLE public.service_orders ENABLE TRIGGER trg_ensure_public_short_code;
  ALTER TABLE public.service_orders ENABLE TRIGGER trg_service_orders_track_pause_resume;
  ALTER TABLE public.service_orders ENABLE TRIGGER guard_service_business_core_v1;

  -- Reservas: o UNIQUE global de número sai (número agora repete entre
  -- empresas). Gatilho de núcleo das reservas desligado: é a migration (sem
  -- usuário) mexendo em ledger de todas as empresas.
  ALTER TABLE public.service_order_number_reservations
    DROP CONSTRAINT IF EXISTS service_order_number_reservations_order_number_key;
  ALTER TABLE public.service_order_number_reservations DISABLE TRIGGER guard_service_business_core_v1;

  -- Consumidas com OS viva acompanham o número novo da OS.
  UPDATE public.service_order_number_reservations r
     SET order_number = so.order_number
    FROM public.service_orders so
   WHERE so.id = r.service_order_id
     AND r.order_number IS DISTINCT FROM so.order_number;
  GET DIAGNOSTICS v_res_synced = ROW_COUNT;

  -- Não consumidas (formulário aberto antes da virada): devolvem o número
  -- global antigo. Se o formulário for salvo, a OS ganha o próximo número da
  -- empresa naquela hora (sem erro e sem buraco se for abandonado).
  UPDATE public.service_order_number_reservations r
     SET released_at = clock_timestamp()
   WHERE r.consumed_at IS NULL AND r.released_at IS NULL;
  GET DIAGNOSTICS v_res_released = ROW_COUNT;

  ALTER TABLE public.service_order_number_reservations ENABLE TRIGGER guard_service_business_core_v1;

  INSERT INTO public.service_order_number_counters (company_id, scope, next_value)
  SELECT so.company_id,
         CASE WHEN so.entry_type = 'tarefa' THEN 'tarefa' ELSE 'os' END,
         max(so.order_number) + 1
    FROM public.service_orders so
   GROUP BY 1, 2
  ON CONFLICT (company_id, scope) DO UPDATE SET next_value = EXCLUDED.next_value, updated_at = now();
  GET DIAGNOSTICS v_counters = ROW_COUNT;

  -- Textos GERADOS PELO SISTEMA que citam o número da OS. A numeração nova
  -- cobre a mesma faixa da antiga dentro da empresa: "OS #12" passaria a
  -- apontar para outra OS. Só formatos do sistema (nunca texto livre) e só
  -- quando o vínculo é seguro; o resto fica como está.
  -- Gatilhos de financial_transactions que disparam num UPDATE de description
  -- (sem lista de colunas) desligados dentro do transação: updated_at, recálculo
  -- de recebido do pai, base de recorrência e as travas de imutabilidade/
  -- tesouraria/PDV (a mudança é só de texto). Religados logo abaixo.
  ALTER TABLE public.financial_transactions DISABLE TRIGGER update_financial_transactions_updated_at;
  ALTER TABLE public.financial_transactions DISABLE TRIGGER trg_recalc_amount_received;
  ALTER TABLE public.financial_transactions DISABLE TRIGGER capture_financial_recurrence_base;
  ALTER TABLE public.financial_transactions DISABLE TRIGGER guard_direct_purchase_financial_immutable;
  ALTER TABLE public.financial_transactions DISABLE TRIGGER pdv_supplier_purchase_payment_guard_v4;
  ALTER TABLE public.financial_transactions DISABLE TRIGGER tg_pdv_guard_legacy_receivable_writer_v2;
  ALTER TABLE public.financial_transactions DISABLE TRIGGER tg_pdv_receivable_financial_immutable_v2;
  ALTER TABLE public.financial_transactions DISABLE TRIGGER tg_zz_pdv_financial_treasury_v2;

  -- (1) "OS #N · <cliente>" (rótulo do seletor de OS usado como descrição),
  -- com vínculo real financial_transactions.service_order_id.
  UPDATE public.financial_transactions ft
     SET description = regexp_replace(ft.description, '^OS #\d+', 'OS #' || so.order_number)
    FROM public.service_orders so
   WHERE so.id = ft.service_order_id AND so.company_id = ft.company_id
     AND ft.description ~ '^OS #\d+ · '
     AND (substring(ft.description FROM '^OS #(\d+)'))::integer = so.legacy_order_number;
  GET DIAGNOSTICS v_ft_link = ROW_COUNT;

  -- (2) Formatos do sistema SEM vínculo (sem service_order_id): casa por
  -- empresa + número antigo + mesmo cliente, e só se der exatamente UMA OS.
  -- "Receita - OS Nº N", "Parcela OS Nº N", "Custo de Materiais/Mão de Obra -
  -- OS Nº N" (importação do sistema antigo), "Recebimento parcial — OS #N · "
  -- e "OS #N · " sem vínculo.
  WITH cand AS (
    SELECT ft.id, ft.company_id, ft.customer_id,
           (substring(ft.description FROM 'OS (?:#|Nº )(\d+)'))::integer AS n
      FROM public.financial_transactions ft
     WHERE ft.service_order_id IS NULL
       AND (ft.description ~ '^Receita - OS Nº \d+$'
         OR ft.description ~ '^Parcela OS Nº \d+'
         OR ft.description ~ 'Custo de (Materiais|Mão de Obra) - OS Nº \d+$'
         OR ft.description ~ '^Recebimento parcial — OS #\d+ · '
         OR ft.description ~ '^OS #\d+ · ')
  ), m AS (
    SELECT c.id, c.n, min(so.order_number) AS novo, count(*) AS qtd
      FROM cand c
      JOIN public.service_orders so
        ON so.company_id = c.company_id AND so.legacy_order_number = c.n
       AND (c.customer_id IS NULL OR so.customer_id = c.customer_id)
     GROUP BY c.id, c.n
  )
  UPDATE public.financial_transactions ft
     SET description = regexp_replace(ft.description, '(OS (?:#|Nº ))' || m.n || '(?!\d)', '\1' || m.novo)
    FROM m
   WHERE m.id = ft.id AND m.qtd = 1;
  GET DIAGNOSTICS v_ft_match = ROW_COUNT;

  ALTER TABLE public.financial_transactions ENABLE TRIGGER update_financial_transactions_updated_at;
  ALTER TABLE public.financial_transactions ENABLE TRIGGER trg_recalc_amount_received;
  ALTER TABLE public.financial_transactions ENABLE TRIGGER capture_financial_recurrence_base;
  ALTER TABLE public.financial_transactions ENABLE TRIGGER guard_direct_purchase_financial_immutable;
  ALTER TABLE public.financial_transactions ENABLE TRIGGER pdv_supplier_purchase_payment_guard_v4;
  ALTER TABLE public.financial_transactions ENABLE TRIGGER tg_pdv_guard_legacy_receivable_writer_v2;
  ALTER TABLE public.financial_transactions ENABLE TRIGGER tg_pdv_receivable_financial_immutable_v2;
  ALTER TABLE public.financial_transactions ENABLE TRIGGER tg_zz_pdv_financial_treasury_v2;

  -- (3) Notificação "Novo chamado #N" com vínculo explícito (entity_id = OS).
  -- user_notifications não tem gatilho de UPDATE (nada é reenviado).
  UPDATE public.user_notifications u
     SET title   = regexp_replace(u.title,   '#' || so.legacy_order_number || '(?!\d)', '#' || so.order_number, 'g'),
         message = regexp_replace(u.message, '#' || so.legacy_order_number || '(?!\d)', '#' || so.order_number, 'g')
    FROM public.service_orders so
   WHERE u.entity_type = 'service_order' AND so.id = u.entity_id AND so.company_id = u.company_id
     AND so.legacy_order_number IS DISTINCT FROM so.order_number
     AND (u.title ~ ('#' || so.legacy_order_number || '(?!\d)') OR u.message ~ ('#' || so.legacy_order_number || '(?!\d)'));
  GET DIAGNOSTICS v_notif = ROW_COUNT;
  RAISE NOTICE 'Textos com número de OS reescritos: % lançamentos por vínculo, % por empresa+número antigo+cliente, % notificações',
    v_ft_link, v_ft_match, v_notif;

  RAISE NOTICE 'Numeração por empresa: % OS/tarefas renumeradas, % reservas consumidas sincronizadas, % reservas abertas liberadas, % contadores, %',
    v_rows, v_res_synced, v_res_released, v_counters, clock_timestamp() - v_t0;
END $renumber$;

-- Uma reserva viva por número dentro da empresa (consumidas ficam fora: a OS
-- já garante o número; liberadas não seguram número).
CREATE UNIQUE INDEX IF NOT EXISTS service_order_number_reservations_company_number_live_key
  ON public.service_order_number_reservations (company_id, order_number)
  WHERE consumed_at IS NULL AND released_at IS NULL;

-- 6) Sequência global sai do DEFAULT (fica no banco, sem uso, para rollback).
-- DEFAULT 0 é só sentinela: mantém order_number opcional no Insert do
-- types.ts gerado; o gatilho troca 0/NULL pelo próximo número da empresa.
ALTER TABLE public.service_orders ALTER COLUMN order_number SET DEFAULT 0;

-- 7) Unicidade por empresa/scope (só depois da renumeração) + busca pelo antigo
CREATE UNIQUE INDEX IF NOT EXISTS service_orders_company_scope_order_number_key
  ON public.service_orders (company_id, (entry_type = 'tarefa'), order_number);
CREATE INDEX IF NOT EXISTS service_orders_company_legacy_order_number_idx
  ON public.service_orders (company_id, legacy_order_number)
  WHERE legacy_order_number IS NOT NULL;

-- 8) Gatilhos -----------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_service_orders_zz_order_number ON public.service_orders;
CREATE TRIGGER trg_service_orders_zz_order_number
  BEFORE INSERT OR UPDATE OF id, order_number, company_id, created_by, entry_type ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_service_order_number_reservation();

DROP TRIGGER IF EXISTS trg_service_orders_number_recede_on_delete ON public.service_orders;
CREATE TRIGGER trg_service_orders_number_recede_on_delete
  AFTER DELETE ON public.service_orders
  REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.service_order_number_recede_on_delete();

-- 9) RPCs que citavam a sequência global / que queimavam número -------------
-- 9a) Agenda com override: sem reserva, o número vem do gatilho (NULL).
DO $patch$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.schedule_create_service_order_with_override(jsonb,text,jsonb,uuid[])'::regprocedure) INTO v_def;
  IF position('order_number_seq' IN v_def) = 0 THEN
    RAISE NOTICE 'schedule_create_service_order_with_override já sem sequência global.';
  ELSE
    v_new := replace(v_def,
      $s$    ELSE nextval('public.service_orders_order_number_seq'::regclass) END,$s$,
      $s$    ELSE NULL::integer END,$s$);
    IF v_new = v_def THEN RAISE EXCEPTION 'Definição inesperada de schedule_create_service_order_with_override'; END IF;
    EXECUTE v_new;
  END IF;
END $patch$;

-- 9b) Regenerar visitas do contrato: apaga as visitas substituídas ANTES de
-- criar as novas, para que as novas reaproveitem os números liberados (antes
-- criava primeiro e cada regeneração queimava um bloco de números no meio).
-- A checagem de competência (guard_contract_visit_customization) só fica mais
-- folgada: a visita automática antiga já não coexiste com a nova.
-- Além disso: visitas criadas em ordem de data; a visita que herda o código
-- curto (preserve_code) de uma antiga herda também o NÚMERO dela (e o código
-- passa a ser herdado de verdade); as demais pegam os números livres restantes.
DO $patch$
DECLARE v_def text; v_new text; v_block text; v_anchor text; v_block_new text; v_s text; v_r text;
BEGIN
  SELECT pg_get_functiondef('public.regenerate_contract_visits(uuid,jsonb,uuid[],boolean)'::regprocedure) INTO v_def;
  v_block :=
    '  IF array_length(p_delete_ids, 1) IS NOT NULL THEN'||chr(10)||
    '    DELETE FROM public.service_order_assignees  WHERE service_order_id = ANY(p_delete_ids);'||chr(10)||
    '    DELETE FROM public.service_order_equipment  WHERE service_order_id = ANY(p_delete_ids);'||chr(10)||
    '    DELETE FROM public.form_responses           WHERE service_order_id = ANY(p_delete_ids);'||chr(10)||
    '    DELETE FROM public.os_photos                WHERE service_order_id = ANY(p_delete_ids);'||chr(10)||
    '    DELETE FROM public.service_ratings          WHERE service_order_id = ANY(p_delete_ids);'||chr(10)||
    '    DELETE FROM public.service_order_activities WHERE service_order_id = ANY(p_delete_ids);'||chr(10)||
    '    DELETE FROM public.service_orders           WHERE id = ANY(p_delete_ids);'||chr(10)||
    '    GET DIAGNOSTICS v_deleted = ROW_COUNT;'||chr(10)||
    '  END IF;'||chr(10);
  v_anchor := '  IF p_orders IS NOT NULL AND jsonb_typeof(p_orders) = ''array'' THEN'||chr(10);
  IF position('-- numeracao: apaga antes de criar' IN v_def) > 0 THEN
    RAISE NOTICE 'regenerate_contract_visits já apaga antes de criar.';
  ELSIF position(v_block IN v_def) = 0 OR position(v_anchor IN v_def) = 0
        OR position(v_anchor IN v_def) > position(v_block IN v_def) THEN
    RAISE EXCEPTION 'Definição inesperada de regenerate_contract_visits';
  ELSE
    -- Antes de apagar: mapa codigo curto -> numero das visitas antigas e lista
    -- dos numeros que serao herdados (segurados para as outras nao pegarem).
    v_block_new := replace(v_block,
      '  IF array_length(p_delete_ids, 1) IS NOT NULL THEN'||chr(10),
      '  IF array_length(p_delete_ids, 1) IS NOT NULL THEN'||chr(10)||
      '    SELECT COALESCE(jsonb_object_agg(so.public_short_code, so.order_number), ''{}''::jsonb) INTO v_preserved_numbers'||chr(10)||
      '      FROM public.service_orders so WHERE so.id = ANY(p_delete_ids) AND so.public_short_code IS NOT NULL;'||chr(10)||
      '    SELECT COALESCE(jsonb_agg(v_preserved_numbers -> (o.value->>''preserve_code'')), ''[]''::jsonb) INTO v_held'||chr(10)||
      '      FROM jsonb_array_elements(p_orders) o WHERE v_preserved_numbers ? (o.value->>''preserve_code'');'||chr(10)||
      '    PERFORM set_config(''app.service_order_numbers_held'', v_held::text, true);'||chr(10));
    v_new := replace(v_def, chr(10)||v_block, '');
    v_new := replace(v_new, v_anchor,
      '  -- numeracao: apaga antes de criar, para as visitas novas reaproveitarem'||chr(10)||
      '  -- os numeros liberados (next_service_order_number).'||chr(10)||
      v_block_new||chr(10)||v_anchor);
    IF position(v_block_new IN v_new) = 0 OR position(v_block_new IN v_new) > position(v_anchor IN v_new) THEN
      RAISE EXCEPTION 'Reordenação de regenerate_contract_visits falhou';
    END IF;
    -- Variáveis novas.
    v_s := '  v_created_orders jsonb := ''[]''::jsonb;'||chr(10);
    v_r := v_s||'  v_preserved_numbers jsonb := ''{}''::jsonb;'||chr(10)||'  v_held jsonb := ''[]''::jsonb;'||chr(10);
    IF (length(v_new)-length(replace(v_new,v_s,'')))/length(v_s) <> 1 THEN RAISE EXCEPTION 'regenerate: declare inesperado'; END IF;
    v_new := replace(v_new, v_s, v_r);
    -- Visitas criadas em ordem de data (números livres em ordem de data).
    v_s := '    FOR v_order IN SELECT value FROM jsonb_array_elements(p_orders)'||chr(10)||'    LOOP'||chr(10);
    v_r := '    FOR v_order IN SELECT o.value FROM jsonb_array_elements(p_orders) WITH ORDINALITY o(value, ord)'||chr(10)||
           '                    ORDER BY (o.value#>>''{os,scheduled_date}'')::date, o.ord'||chr(10)||'    LOOP'||chr(10);
    IF (length(v_new)-length(replace(v_new,v_s,'')))/length(v_s) <> 1 THEN RAISE EXCEPTION 'regenerate: loop inesperado'; END IF;
    v_new := replace(v_new, v_s, v_r);
    -- A visita que herda o código curto herda o número da antiga.
    v_s := '      INSERT INTO public.service_orders ('||chr(10);
    v_r := '      PERFORM set_config(''app.service_order_number_preferred'', COALESCE(v_preserved_numbers ->> NULLIF(v_order->>''preserve_code'',''''), ''''), true);'||chr(10)||v_s;
    IF (length(v_new)-length(replace(v_new,v_s,'')))/length(v_s) <> 1 THEN RAISE EXCEPTION 'regenerate: insert inesperado'; END IF;
    v_new := replace(v_new, v_s, v_r);
    v_s := '      RETURNING id INTO v_os_id;'||chr(10);
    v_r := v_s||'      PERFORM set_config(''app.service_order_number_preferred'', '''', true);'||chr(10);
    IF (length(v_new)-length(replace(v_new,v_s,'')))/length(v_s) <> 1 THEN RAISE EXCEPTION 'regenerate: returning inesperado'; END IF;
    v_new := replace(v_new, v_s, v_r);
    -- Código curto herdado de fato: antes o UPDATE exigia public_short_code IS
    -- NULL, mas ensure_public_short_code já preenche um código novo no INSERT,
    -- então o link antigo do cliente quebrava em toda regeneração. Como a
    -- visita antiga agora é apagada ANTES, o código está livre para herdar.
    v_s := '          AND public_short_code IS NULL;'||chr(10);
    v_r := '          AND public_short_code IS DISTINCT FROM v_code;'||chr(10);
    IF (length(v_new)-length(replace(v_new,v_s,'')))/length(v_s) <> 1 THEN RAISE EXCEPTION 'regenerate: preserve_code inesperado'; END IF;
    v_new := replace(v_new, v_s, v_r);
    v_s := '  IF jsonb_array_length(v_created_orders) > 0 THEN'||chr(10);
    v_r := '  PERFORM set_config(''app.service_order_numbers_held'', '''', true);'||chr(10)||v_s;
    IF (length(v_new)-length(replace(v_new,v_s,'')))/length(v_s) <> 1 THEN RAISE EXCEPTION 'regenerate: fim do loop inesperado'; END IF;
    v_new := replace(v_new, v_s, v_r);
    EXECUTE v_new;
  END IF;
END $patch$;

-- Volta a FK ao modo original (INITIALLY DEFERRED).
SET CONSTRAINTS public.service_order_number_reservations_service_order_id_fkey DEFERRED;

COMMIT;

-- Numeração de ORÇAMENTO por empresa + renumeração de todos os orçamentos.
-- ----------------------------------------------------------------------------
-- Por quê: quotes.quote_number vinha da sequência GLOBAL quotes_quote_number_seq,
-- compartilhada por todos os tenants (mesmo problema da OS, ver
-- 20261120180000_os_numero_por_empresa.sql). Mesmo desenho:
--  - quote_number_counters(company_id) + next_quote_number(company_id): trava a
--    linha do contador e só depois lê o maior número em uso (orçamentos +
--    reservas vivas). O topo volta a ser usado quando o último orçamento é
--    excluído ou quando a reserva do topo vence/é devolvida.
--  - Número sempre dado pelo servidor no BEFORE INSERT
--    (trg_quotes_zz_quote_number, último da fila alfabética). Valor do client é
--    ignorado; só service_role/postgres pode fixar número.
--  - Reserva do formulário continua dando o número definitivo ao abrir; agora
--    no contador da empresa. Reserva devolvida/vencida-e-reaproveitada ganha o
--    próximo número da empresa em vez de erro. Nova RPC release_quote_number.
--  - create_reserved_quote checava "número já existe" SEM company_id (com
--    número repetido entre empresas viraria falso QNR03): agora presa à empresa.
--  - Renumeração: row_number() por empresa em (created_at, quote_number, id);
--    número antigo em legacy_quote_number. Orçamento não tem versões/revisões
--    (sem parent/version em quotes): 1 número = 1 orçamento.
--  - UNIQUE (company_id, quote_number) só depois da renumeração.
-- Gatilhos desligados no renumber: update_quotes_updated_at (não mexer em
-- updated_at) e guard_service_business_core_v1 (no-op para a migration). O
-- guard de aprovação (trg_guard_quote_approval_revert) é UPDATE OF status e
-- não dispara; os AFTER UPDATE têm lista de colunas que não inclui o número.
-- quotes não está na publicação do realtime.
-- ----------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
-- FK reserva->orçamento é DEFERRABLE: dispara eventos pendentes antes do ALTER.
SET CONSTRAINTS public.quote_number_reservations_quote_id_fkey IMMEDIATE;

-- Tabela nova ANTES das travas (o REFERENCES companies pede lock em companies).
-- 1) Contador -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_number_counters (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  next_value integer NOT NULL DEFAULT 1 CHECK (next_value > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.quote_number_counters IS
 'Próximo número de orçamento por empresa. Trava de alocação + cache: a verdade é o maior número em uso (ver next_quote_number). Sem acesso do client.';
ALTER TABLE public.quote_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_number_counters FROM PUBLIC, anon, authenticated;

-- Travas: orçamentos, reservas e, para reescrever textos com o número (item
-- 5b), lançamentos e OS (só escrita bloqueada; leitura segue).
LOCK TABLE public.quotes IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.quote_number_reservations IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.financial_transactions IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.service_orders IN SHARE ROW EXCLUSIVE MODE;

-- 2) Colunas --------------------------------------------------------------------
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS legacy_quote_number integer;
COMMENT ON COLUMN public.quotes.legacy_quote_number IS
 'Número do orçamento na numeração global antiga (antes de 2026-11-20). NULL para orçamento criado depois.';
COMMENT ON COLUMN public.quotes.quote_number IS
 'Número sequencial por empresa, atribuído pelo servidor. Não é único entre empresas: toda busca por número precisa de company_id.';
ALTER TABLE public.quote_number_reservations ADD COLUMN IF NOT EXISTS released_at timestamptz;
COMMENT ON COLUMN public.quote_number_reservations.released_at IS
 'Reserva não consumida que devolveu o número. Se o mesmo pedido voltar, ganha o próximo número da empresa.';

-- 3) Funções do contador ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quote_number_in_use_max_internal(p_company_id uuid)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  SELECT GREATEST(
    COALESCE((SELECT q.quote_number FROM public.quotes q
               WHERE q.company_id = p_company_id
               ORDER BY q.quote_number DESC LIMIT 1), 0),
    COALESCE((SELECT max(r.quote_number) FROM public.quote_number_reservations r
               WHERE r.company_id = p_company_id
                 AND r.consumed_at IS NULL AND r.released_at IS NULL
                 AND r.expires_at > clock_timestamp()), 0)
  );
$fn$;
REVOKE ALL ON FUNCTION public.quote_number_in_use_max_internal(uuid) FROM PUBLIC, anon, authenticated;

-- Trava (e cria, se faltar) a linha do contador; quem precisa travar uma
-- reserva trava o contador ANTES (mesma ordem de next_quote_number).
CREATE OR REPLACE FUNCTION public.quote_number_counter_lock_internal(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  PERFORM 1 FROM public.quote_number_counters c WHERE c.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.quote_number_counters (company_id, next_value) VALUES (p_company_id, 1)
    ON CONFLICT (company_id) DO NOTHING;
    PERFORM 1 FROM public.quote_number_counters c WHERE c.company_id = p_company_id FOR UPDATE;
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.quote_number_counter_lock_internal(uuid) FROM PUBLIC, anon, authenticated;

-- Atômica por empresa (trava o contador antes de ler o max). Interna: não é
-- exposta ao client para ninguém queimar número de outra empresa.
CREATE OR REPLACE FUNCTION public.next_quote_number(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE v_locked integer; v_max integer;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível identificar a empresa do orçamento.' USING ERRCODE = '23502';
  END IF;
  SELECT c.next_value INTO v_locked FROM public.quote_number_counters c
   WHERE c.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.quote_number_counters (company_id, next_value) VALUES (p_company_id, 1)
    ON CONFLICT (company_id) DO NOTHING;
    SELECT c.next_value INTO v_locked FROM public.quote_number_counters c
     WHERE c.company_id = p_company_id FOR UPDATE;
  END IF;
  v_max := public.quote_number_in_use_max_internal(p_company_id);
  -- Reserva vencida acima do topo deixa de segurar o número (UNIQUE parcial).
  UPDATE public.quote_number_reservations r
     SET released_at = clock_timestamp()
   WHERE r.company_id = p_company_id
     AND r.consumed_at IS NULL AND r.released_at IS NULL
     AND r.expires_at <= clock_timestamp()
     AND r.quote_number > v_max;
  UPDATE public.quote_number_counters
     SET next_value = v_max + 2, updated_at = now()
   WHERE company_id = p_company_id AND next_value IS DISTINCT FROM v_max + 2;
  RETURN v_max + 1;
END;
$fn$;
REVOKE ALL ON FUNCTION public.next_quote_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_quote_number(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.quote_number_recede_internal(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE v_locked integer; v_max integer;
BEGIN
  SELECT c.next_value INTO v_locked FROM public.quote_number_counters c
   WHERE c.company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_max := public.quote_number_in_use_max_internal(p_company_id);
  IF v_max + 1 < v_locked THEN
    UPDATE public.quote_number_counters SET next_value = v_max + 1, updated_at = now()
     WHERE company_id = p_company_id;
  END IF;
  RETURN v_max;
END;
$fn$;
REVOKE ALL ON FUNCTION public.quote_number_recede_internal(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.quote_number_recede_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE v_company uuid;
BEGIN
  FOR v_company IN
    SELECT DISTINCT d.company_id FROM deleted_rows d WHERE d.company_id IS NOT NULL ORDER BY 1
  LOOP
    PERFORM public.quote_number_recede_internal(v_company);
  END LOOP;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.quote_number_recede_on_delete() FROM PUBLIC, anon, authenticated;

-- 4) Reserva ------------------------------------------------------------------------
-- Mesma assinatura/segurança da versão viva (bundle antigo continua chamando).
CREATE OR REPLACE FUNCTION public.reserve_quote_number(p_company_id uuid, p_user_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_row public.quote_number_reservations; v_number integer; v_expiry timestamptz;
BEGIN
 PERFORM public.quote_number_assert_access(p_company_id,p_user_id);
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'Solicitação de numeração inválida.' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('quote-number:'||p_request_id::text,0));
 -- Contador antes da reserva (mesma ordem de next_quote_number): reviver uma
 -- reserva vencida pelo rascunho não corre com quem está emitindo número.
 PERFORM public.quote_number_counter_lock_internal(p_company_id);
 SELECT * INTO v_row FROM public.quote_number_reservations WHERE id=p_request_id FOR UPDATE;
 IF FOUND THEN
   IF v_row.company_id IS DISTINCT FROM p_company_id OR v_row.user_id IS DISTINCT FROM auth.uid() THEN
     RAISE EXCEPTION 'Não foi possível acessar a numeração nesta sessão.' USING ERRCODE='42501';
   END IF;
   IF v_row.consumed_at IS NOT NULL THEN RAISE EXCEPTION 'Este número já pertence a um orçamento salvo.' USING ERRCODE='QNR03'; END IF;
   IF v_row.expires_at<=clock_timestamp() THEN
     SELECT expires_at INTO v_expiry FROM public.quote_form_drafts
       WHERE company_id=p_company_id AND user_id=auth.uid() AND expires_at>clock_timestamp()
       AND lower(payload->>'numberRequestId')=p_request_id::text;
     IF v_expiry IS NULL THEN RAISE EXCEPTION 'A reserva de número expirou. Inicie outro orçamento.' USING ERRCODE='QNR02'; END IF;
     UPDATE public.quote_number_reservations SET expires_at=v_expiry WHERE id=p_request_id RETURNING * INTO v_row;
   END IF;
   -- Número devolvido (formulário descartado, virada por empresa) ou já
   -- reaproveitado por outro orçamento: o pedido continua com o próximo número.
   IF v_row.released_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.quotes
        WHERE company_id=p_company_id AND quote_number=v_row.quote_number) THEN
     v_number:=public.next_quote_number(p_company_id);
     UPDATE public.quote_number_reservations SET quote_number=v_number, released_at=NULL
      WHERE id=p_request_id RETURNING * INTO v_row;
   END IF;
 ELSE
   v_number:=public.next_quote_number(p_company_id);
   INSERT INTO public.quote_number_reservations(id,company_id,user_id,quote_number)
   VALUES(p_request_id,p_company_id,auth.uid(),v_number) RETURNING * INTO v_row;
 END IF;
 RETURN jsonb_build_object('reservation_id',v_row.id,'quote_number',v_row.quote_number,'expires_at',v_row.expires_at);
END $function$;

CREATE OR REPLACE FUNCTION public.release_quote_number(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE v_row public.quote_number_reservations; v_company uuid;
BEGIN
  IF auth.uid() IS NULL OR p_request_id IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('quote-number:'||p_request_id::text,0));
  -- Ordem contador -> reserva (igual a next_quote_number).
  SELECT r.company_id INTO v_company FROM public.quote_number_reservations r WHERE r.id = p_request_id;
  IF NOT FOUND OR v_company IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN RETURN false; END IF;
  PERFORM public.quote_number_counter_lock_internal(v_company);
  SELECT * INTO v_row FROM public.quote_number_reservations WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_row.user_id IS DISTINCT FROM auth.uid()
     OR v_row.company_id IS DISTINCT FROM public.get_user_company_id(auth.uid())
     OR v_row.consumed_at IS NOT NULL OR v_row.released_at IS NOT NULL THEN
    RETURN false;
  END IF;
  UPDATE public.quote_number_reservations SET released_at = clock_timestamp() WHERE id = v_row.id;
  PERFORM public.quote_number_recede_internal(v_row.company_id);
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.release_quote_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_quote_number(uuid) TO authenticated, service_role;

-- Gatilho de numeração (mesmo nome de função, gatilho renomeado para rodar por
-- último, depois de company_id preenchido).
CREATE OR REPLACE FUNCTION public.guard_reserved_quote_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
 v_res public.quote_number_reservations;
 v_priv boolean:=auth.role()='service_role' OR (auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin'));
BEGIN
 IF NEW.company_id IS NULL THEN
   RAISE EXCEPTION 'Não foi possível identificar a empresa do orçamento.' USING ERRCODE='23502';
 END IF;
 IF TG_OP='UPDATE' THEN
   SELECT * INTO v_res FROM public.quote_number_reservations WHERE quote_id=OLD.id;
   IF FOUND AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM v_res.company_id
      OR NEW.created_by IS DISTINCT FROM v_res.user_id) THEN
     RAISE EXCEPTION 'A numeração e a origem do orçamento salvo não podem ser alteradas.' USING ERRCODE='42501';
   END IF;
   IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
     NEW.quote_number:=public.next_quote_number(NEW.company_id);
   ELSIF NEW.quote_number IS DISTINCT FROM OLD.quote_number THEN
     IF NOT v_priv THEN
       RAISE EXCEPTION 'A numeração do orçamento não pode ser alterada.' USING ERRCODE='42501';
     END IF;
     IF NEW.quote_number IS NULL OR NEW.quote_number<=0 THEN NEW.quote_number:=public.next_quote_number(NEW.company_id); END IF;
   END IF;
   IF v_res.id IS NOT NULL AND NEW.quote_number IS DISTINCT FROM v_res.quote_number THEN
     UPDATE public.quote_number_reservations SET quote_number=NEW.quote_number WHERE id=v_res.id;
   END IF;
 ELSE
   -- create_reserved_quote consome a reserva (quote_id=NEW.id) antes do INSERT.
   SELECT * INTO v_res FROM public.quote_number_reservations WHERE quote_id=NEW.id AND consumed_at IS NOT NULL;
   IF FOUND THEN
     IF v_res.company_id IS DISTINCT FROM NEW.company_id OR v_res.user_id IS DISTINCT FROM NEW.created_by THEN
       RAISE EXCEPTION 'Este número pertence a uma reserva de orçamento.' USING ERRCODE='42501';
     END IF;
     NEW.quote_number:=v_res.quote_number;
   ELSIF NEW.quote_number IS NULL OR NEW.quote_number<=0 OR NOT v_priv THEN
     -- Número é sempre do servidor: valor vindo do client é ignorado.
     NEW.quote_number:=public.next_quote_number(NEW.company_id);
   END IF;
 END IF;
 IF v_priv AND EXISTS(SELECT 1 FROM public.quote_number_reservations r
    WHERE r.company_id=NEW.company_id AND r.quote_number=NEW.quote_number
      AND r.consumed_at IS NULL AND r.released_at IS NULL AND r.expires_at>clock_timestamp()) THEN
   RAISE EXCEPTION 'Este número pertence a uma reserva de orçamento.' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.guard_reserved_quote_number() FROM PUBLIC, anon, authenticated;

-- 5) Renumeração (uma vez só) ----------------------------------------------------
DROP TRIGGER IF EXISTS guard_reserved_quote_number ON public.quotes;

DO $renumber$
DECLARE v_rows bigint; v_synced bigint; v_released bigint; v_counters bigint; v_t0 timestamptz := clock_timestamp();
  v_ft bigint; v_os bigint; v_notif bigint;
BEGIN
  IF to_regclass('public.quotes_company_quote_number_key') IS NOT NULL THEN
    RAISE NOTICE 'Renumeração de orçamentos já aplicada; nada a fazer.';
    RETURN;
  END IF;

  ALTER TABLE public.quotes DISABLE TRIGGER update_quotes_updated_at;
  ALTER TABLE public.quotes DISABLE TRIGGER guard_service_business_core_v1;
  WITH ordered AS (
    SELECT q.id, row_number() OVER (PARTITION BY q.company_id ORDER BY q.created_at, q.quote_number, q.id)::integer AS rn
      FROM public.quotes q
  )
  UPDATE public.quotes q
     SET legacy_quote_number = COALESCE(q.legacy_quote_number, q.quote_number),
         quote_number = o.rn
    FROM ordered o
   WHERE q.id = o.id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ALTER TABLE public.quotes ENABLE TRIGGER update_quotes_updated_at;
  ALTER TABLE public.quotes ENABLE TRIGGER guard_service_business_core_v1;

  ALTER TABLE public.quote_number_reservations DROP CONSTRAINT IF EXISTS quote_number_reservations_quote_number_key;
  ALTER TABLE public.quote_number_reservations DISABLE TRIGGER guard_service_business_core_v1;
  UPDATE public.quote_number_reservations r
     SET quote_number = q.quote_number
    FROM public.quotes q
   WHERE q.id = r.quote_id AND r.quote_number IS DISTINCT FROM q.quote_number;
  GET DIAGNOSTICS v_synced = ROW_COUNT;
  -- Formulários abertos antes da virada devolvem o número global: ao salvar,
  -- ganham o próximo número da empresa (sem erro, sem buraco se abandonados).
  UPDATE public.quote_number_reservations SET released_at = clock_timestamp()
   WHERE consumed_at IS NULL AND released_at IS NULL;
  GET DIAGNOSTICS v_released = ROW_COUNT;
  ALTER TABLE public.quote_number_reservations ENABLE TRIGGER guard_service_business_core_v1;

  INSERT INTO public.quote_number_counters (company_id, next_value)
  SELECT company_id, max(quote_number) + 1 FROM public.quotes GROUP BY company_id
  ON CONFLICT (company_id) DO UPDATE SET next_value = EXCLUDED.next_value, updated_at = now();
  GET DIAGNOSTICS v_counters = ROW_COUNT;

  -- Textos GERADOS PELO SISTEMA que citam o número do orçamento (mesma razão
  -- da OS: o número novo cobre a faixa antiga). Só formatos do sistema e só com
  -- vínculo seguro; o resto fica como está.
  --   "Orçamento #N" / "Orçamento #N (i/n)" / "Tarifa do recebimento —
  --   Orçamento #N" (conversão do orçamento, respond_quote_public) e
  --   "Orçamento Nº N" (cobrança a partir do orçamento).
  -- Vínculo, em ordem de preferência: quotes.financial_transaction_id = lançamento;
  -- mesmo installment_group_id do lançamento vinculado; senão empresa + número
  -- antigo + cliente compatível, e só se der exatamente UM orçamento.
  ALTER TABLE public.financial_transactions DISABLE TRIGGER update_financial_transactions_updated_at;
  ALTER TABLE public.financial_transactions DISABLE TRIGGER trg_recalc_amount_received;
  ALTER TABLE public.financial_transactions DISABLE TRIGGER capture_financial_recurrence_base;
  ALTER TABLE public.financial_transactions DISABLE TRIGGER guard_direct_purchase_financial_immutable;
  ALTER TABLE public.financial_transactions DISABLE TRIGGER pdv_supplier_purchase_payment_guard_v4;
  ALTER TABLE public.financial_transactions DISABLE TRIGGER tg_pdv_guard_legacy_receivable_writer_v2;
  ALTER TABLE public.financial_transactions DISABLE TRIGGER tg_pdv_receivable_financial_immutable_v2;
  ALTER TABLE public.financial_transactions DISABLE TRIGGER tg_zz_pdv_financial_treasury_v2;

  WITH cand AS (
    SELECT ft.id, ft.company_id, ft.customer_id, ft.installment_group_id,
           (substring(ft.description FROM 'Orçamento (?:#|Nº )(\d+)'))::integer AS n
      FROM public.financial_transactions ft
     WHERE ft.description ~ '^Orçamento #\d+$'
        OR ft.description ~ '^Orçamento #\d+ \(\d+/\d+\)$'
        OR ft.description ~ '^Tarifa do recebimento — Orçamento #\d+$'
        OR ft.description ~ '^Orçamento Nº \d+$'
  ), link AS (
    SELECT DISTINCT ON (c.id) c.id, c.n, q.quote_number AS novo
      FROM cand c
      JOIN public.financial_transactions lf
        ON lf.company_id = c.company_id
       AND (lf.id = c.id OR (c.installment_group_id IS NOT NULL AND lf.installment_group_id = c.installment_group_id))
      JOIN public.quotes q ON q.financial_transaction_id = lf.id AND q.company_id = c.company_id
     WHERE q.legacy_quote_number = c.n
     ORDER BY c.id, (lf.id = c.id) DESC
  ), num AS (
    SELECT c.id, c.n, min(q.quote_number) AS novo, count(*) AS qtd
      FROM cand c
      JOIN public.quotes q ON q.company_id = c.company_id AND q.legacy_quote_number = c.n
       AND (c.customer_id IS NULL OR q.customer_id IS NULL OR q.customer_id = c.customer_id)
     WHERE NOT EXISTS (SELECT 1 FROM link l WHERE l.id = c.id)
     GROUP BY c.id, c.n
  ), alvo AS (
    SELECT id, n, novo FROM link
    UNION ALL SELECT id, n, novo FROM num WHERE qtd = 1
  )
  UPDATE public.financial_transactions ft
     SET description = regexp_replace(ft.description, '(Orçamento (?:#|Nº ))' || a.n || '(?!\d)', '\1' || a.novo)
    FROM alvo a
   WHERE a.id = ft.id;
  GET DIAGNOSTICS v_ft = ROW_COUNT;

  ALTER TABLE public.financial_transactions ENABLE TRIGGER update_financial_transactions_updated_at;
  ALTER TABLE public.financial_transactions ENABLE TRIGGER trg_recalc_amount_received;
  ALTER TABLE public.financial_transactions ENABLE TRIGGER capture_financial_recurrence_base;
  ALTER TABLE public.financial_transactions ENABLE TRIGGER guard_direct_purchase_financial_immutable;
  ALTER TABLE public.financial_transactions ENABLE TRIGGER pdv_supplier_purchase_payment_guard_v4;
  ALTER TABLE public.financial_transactions ENABLE TRIGGER tg_pdv_guard_legacy_receivable_writer_v2;
  ALTER TABLE public.financial_transactions ENABLE TRIGGER tg_pdv_receivable_financial_immutable_v2;
  ALTER TABLE public.financial_transactions ENABLE TRIGGER tg_zz_pdv_financial_treasury_v2;

  -- OS "Gerada do Orçamento #N" (generate_service_order_from_quote), pelo
  -- vínculo service_orders.quote_id. Gatilhos BEFORE UPDATE sem lista de
  -- colunas desligados (updated_at, guard de núcleo, contrato, código curto,
  -- pausa); os AFTER têm lista de colunas e não disparam.
  ALTER TABLE public.service_orders DISABLE TRIGGER update_service_orders_updated_at;
  ALTER TABLE public.service_orders DISABLE TRIGGER guard_service_business_core_v1;
  ALTER TABLE public.service_orders DISABLE TRIGGER trg_guard_contract_visit_customization;
  ALTER TABLE public.service_orders DISABLE TRIGGER trg_ensure_public_short_code;
  ALTER TABLE public.service_orders DISABLE TRIGGER trg_service_orders_track_pause_resume;
  UPDATE public.service_orders so
     SET description = regexp_replace(so.description, '(Gerada do Orçamento #)' || q.legacy_quote_number || '(?!\d)', '\1' || q.quote_number)
    FROM public.quotes q
   WHERE q.id = so.quote_id AND q.company_id = so.company_id
     AND so.description ~ ('Gerada do Orçamento #' || q.legacy_quote_number || '(?!\d)')
     AND q.legacy_quote_number IS DISTINCT FROM q.quote_number;
  GET DIAGNOSTICS v_os = ROW_COUNT;
  ALTER TABLE public.service_orders ENABLE TRIGGER update_service_orders_updated_at;
  ALTER TABLE public.service_orders ENABLE TRIGGER guard_service_business_core_v1;
  ALTER TABLE public.service_orders ENABLE TRIGGER trg_guard_contract_visit_customization;
  ALTER TABLE public.service_orders ENABLE TRIGGER trg_ensure_public_short_code;
  ALTER TABLE public.service_orders ENABLE TRIGGER trg_service_orders_track_pause_resume;

  -- Notificação "aprovou o orçamento #N" com vínculo explícito (quote=<id> no link).
  UPDATE public.user_notifications u
     SET message = regexp_replace(u.message, '(orçamento #)' || q.legacy_quote_number || '(?!\d)', '\1' || q.quote_number)
    FROM public.quotes q
   WHERE u.action_url ~ 'quote=[0-9a-f-]{36}'
     AND q.id = (substring(u.action_url FROM 'quote=([0-9a-f-]{36})'))::uuid
     AND q.company_id = u.company_id
     AND u.message ~ ('orçamento #' || q.legacy_quote_number || '(?!\d)')
     AND q.legacy_quote_number IS DISTINCT FROM q.quote_number;
  GET DIAGNOSTICS v_notif = ROW_COUNT;
  RAISE NOTICE 'Textos com número de orçamento reescritos: % lançamentos, % OS, % notificações', v_ft, v_os, v_notif;

  RAISE NOTICE 'Orçamentos por empresa: % renumerados, % reservas sincronizadas, % reservas abertas liberadas, % contadores, %',
    v_rows, v_synced, v_released, v_counters, clock_timestamp() - v_t0;
END $renumber$;

CREATE UNIQUE INDEX IF NOT EXISTS quote_number_reservations_company_number_live_key
  ON public.quote_number_reservations (company_id, quote_number)
  WHERE consumed_at IS NULL AND released_at IS NULL;

-- DEFAULT 0 = sentinela (Insert opcional no types.ts); o gatilho atribui o número.
ALTER TABLE public.quotes ALTER COLUMN quote_number SET DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS quotes_company_quote_number_key
  ON public.quotes (company_id, quote_number);
CREATE INDEX IF NOT EXISTS quotes_company_legacy_quote_number_idx
  ON public.quotes (company_id, legacy_quote_number) WHERE legacy_quote_number IS NOT NULL;

-- 6) Gatilhos --------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_quotes_zz_quote_number ON public.quotes;
CREATE TRIGGER trg_quotes_zz_quote_number
  BEFORE INSERT OR UPDATE OF id, quote_number, company_id, created_by ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.guard_reserved_quote_number();

DROP TRIGGER IF EXISTS trg_quotes_number_recede_on_delete ON public.quotes;
CREATE TRIGGER trg_quotes_number_recede_on_delete
  AFTER DELETE ON public.quotes
  REFERENCING OLD TABLE AS deleted_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.quote_number_recede_on_delete();

-- 7) create_reserved_quote: checagem de número presa à empresa + reserva
-- devolvida/reaproveitada ganha o próximo número (patch na definição viva).
DO $patch$
DECLARE v_def text; v_new text; v_old text; v_rep text;
BEGIN
  SELECT pg_get_functiondef('public.create_reserved_quote(uuid,jsonb,jsonb,uuid,uuid)'::regprocedure) INTO v_def;
  v_old :=
    ' IF EXISTS(SELECT 1 FROM public.quotes WHERE quote_number=v_res.quote_number) THEN'||chr(10)||
    '   RAISE EXCEPTION ''Este número não está mais disponível. Inicie outro orçamento.'' USING ERRCODE=''QNR03'';'||chr(10)||
    ' END IF;'||chr(10);
  v_rep :=
    ' -- numeracao por empresa: reserva devolvida ou numero ja reaproveitado'||chr(10)||
    ' -- ganha o proximo numero da empresa (checagem presa a company_id).'||chr(10)||
    ' SELECT * INTO v_res FROM public.quote_number_reservations WHERE id=p_reservation_id;'||chr(10)||
    ' IF v_res.released_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.quotes WHERE company_id=p_company_id AND quote_number=v_res.quote_number) THEN'||chr(10)||
    '   UPDATE public.quote_number_reservations SET quote_number=public.next_quote_number(p_company_id),released_at=NULL'||chr(10)||
    '    WHERE id=p_reservation_id RETURNING * INTO v_res;'||chr(10)||
    ' END IF;'||chr(10);
  IF position('numeracao por empresa' IN v_def) > 0 THEN
    RAISE NOTICE 'create_reserved_quote já ajustada.';
  ELSIF position(v_old IN v_def) = 0
     OR position(' SELECT * INTO v_res FROM public.quote_number_reservations WHERE id=p_reservation_id FOR UPDATE;'||chr(10) IN v_def) = 0 THEN
    RAISE EXCEPTION 'Definição inesperada de create_reserved_quote';
  ELSE
    v_new := replace(v_def, v_old, v_rep);
    -- Contador antes da reserva (mesma ordem de next_quote_number).
    v_new := replace(v_new,
      ' SELECT * INTO v_res FROM public.quote_number_reservations WHERE id=p_reservation_id FOR UPDATE;'||chr(10),
      ' PERFORM public.quote_number_counter_lock_internal(p_company_id);'||chr(10)||
      ' SELECT * INTO v_res FROM public.quote_number_reservations WHERE id=p_reservation_id FOR UPDATE;'||chr(10));
    EXECUTE v_new;
  END IF;
END $patch$;

SET CONSTRAINTS public.quote_number_reservations_quote_id_fkey DEFERRED;

COMMIT;

-- ESTOQUE / PRESENÇA POR LOCAL — a AUSÊNCIA vira FATO GRAVADO (correção de bug de produção)
--
-- Bug provado pelo cliente (Engetec, 2026-09-30):
--   No cadastro do material, aba "Locais deste material", o usuário DESMARCA um local,
--   salva, e o material continua aparecendo naquele local (com quantidade 0). Reabrindo
--   o modal o checkbox voltou marcado.
--
-- Causa raiz (assimetria leitura x escrita):
--   * LEITURA (src/hooks/useInventory.ts, getPresenceForStock): quando NÃO existe linha em
--     inventory_stock_levels para o par (material × local), o front assume presente=true.
--     Isso foi decisão de rollout da 20260722160000 ("não some com nada").
--   * ESCRITA (set_inventory_presence / set_stock_materials): o "desmarcar" era um
--     UPDATE ... SET is_present=false WHERE <par existe>. Se a linha do par NÃO existe,
--     o UPDATE não acha nada -> NO-OP SILENCIOSO -> a leitura cai no default true ->
--     o material "volta".
--   * Quando o par não existe? O backfill da 20260722160000 cobriu a matriz material×local
--     de 2026-07-22. NÃO cobre material criado depois (createItem só cria level via
--     register_inventory_movement, e só com quantidade inicial > 0) nem LOCAL criado depois.
--     O cliente criou local novo + materiais novos — bate 100% com o sintoma.
--
-- Correção: em vez de UPDATE-only, MATERIALIZAR a ausência.
--   Todo local (ou material, no eixo espelhado) fora da lista marcada ganha linha
--   is_present=false / quantity=0 via INSERT ... ON CONFLICT DO UPDATE. "Ausente" passa a
--   ser um FATO GRAVADO, não a ausência de um fato. O default permissivo da leitura passa
--   a valer só para pares que ninguém nunca configurou.
--   Volume: no máximo (nº de locais da empresa) linhas por material — irrelevante.
--
-- Invariantes preservados:
--   * Trava presence_has_balance (não desmarcar local/material com quantity > 0) continua
--     ANTES de qualquer escrita, intocada.
--   * Validação de tenant (get_user_company_id / is_super_admin) intocada.
--   * ACL por local (can_access_stock, migration 20260814225028) intocada — as funções aqui
--     são recriadas a partir da DEFINIÇÃO VIVA em produção (pg_get_functiondef), que é a
--     versão COM ACL, e não da 20260722160000 (que é anterior à ACL).
--   * inventory.quantity continua espelho da SUM dos levels (trigger trg_sync_inventory_quantity
--     intocado; as linhas materializadas entram com quantity=0, não mexem na soma).
--   * Escrita de is_present continua privilégio das RPCs security-definer.
--
-- Itens desta migration:
--   1. set_inventory_presence  — materializa ausência (eixo local).
--   2. set_stock_materials     — materializa ausência (eixo material).
--   3. view inventory_low_stock — passa a ignorar material ausente do local.
--   4. notify_low_stock_on_level_update — não notifica material ausente do local.
--   5. guard_inventory_presence_write — passa a cobrir INSERT (normaliza is_present=true
--      quando o autor não é o owner), fechando o portão que o client usa em
--      updateStockLevelMinQuantity. E CONSERTA o guard do UPDATE, que estava INERTE desde
--      2026-07-22: a função era SECURITY DEFINER, e dentro dela current_user é sempre o
--      owner — então `current_user <> 'postgres'` nunca era verdade. Detalhe e prova na §5.
--
-- SEM backfill de dados: o conserto é no caminho de escrita. Um backfill aqui só poderia
-- repetir a matriz "tudo presente" da 20260722160000 — exatamente o que causa a confusão.
-- Os pares quebrados se materializam no próximo salvamento do usuário.
--
-- Migration idempotente (CREATE OR REPLACE / DROP TRIGGER IF EXISTS antes do CREATE).

------------------------------------------------------------
-- 1. set_inventory_presence(p_inventory_id, p_stock_ids)
--    Define exatamente em quais locais o material está presente.
--    Recriada a partir da definição viva (20260814225028 §7.5, com guard de ACL).
--    ÚNICA mudança: o UPDATE final vira INSERT ... ON CONFLICT DO UPDATE (materialização).
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_inventory_presence(
  p_inventory_id uuid,
  p_stock_ids    uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id   uuid;
  v_user_company uuid;
  v_blocked      text;
  v_valid_ids    uuid[];
  v_sid          uuid;
BEGIN
  -- empresa dona do item
  SELECT company_id INTO v_company_id FROM public.inventory WHERE id = p_inventory_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item de estoque nao encontrado: %', p_inventory_id USING ERRCODE = 'no_data_found';
  END IF;

  v_user_company := get_user_company_id(auth.uid());
  IF NOT (v_company_id = v_user_company OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: item de outra empresa' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- só locais que realmente pertencem à empresa (ignora ids intrusos/de outra empresa)
  SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[]) INTO v_valid_ids
    FROM public.stocks s
   WHERE s.company_id = v_company_id
     AND s.id = ANY (COALESCE(p_stock_ids, ARRAY[]::uuid[]));

  -- ACL: usuário restrito não pode marcar presença em local que não acessa
  FOREACH v_sid IN ARRAY v_valid_ids LOOP
    IF NOT public.can_access_stock(auth.uid(), v_sid) THEN
      RAISE EXCEPTION 'sem acesso a este local de estoque' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- TRAVA: não deixar desmarcar (remover presença de) local com saldo > 0
  SELECT string_agg(s.name, ', ' ORDER BY s.name) INTO v_blocked
    FROM public.inventory_stock_levels l
    JOIN public.stocks s ON s.id = l.stock_id
   WHERE l.inventory_id = p_inventory_id
     AND l.company_id  = v_company_id
     AND l.is_present   = true
     AND l.quantity     > 0
     AND NOT (l.stock_id = ANY (v_valid_ids));

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION 'presence_has_balance: %', v_blocked USING ERRCODE = 'check_violation';
  END IF;

  -- garante levels dos locais marcados (qty=0 on-demand) e marca presente
  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity, is_present)
  SELECT v_company_id, p_inventory_id, sid, 0, true
    FROM unnest(v_valid_ids) AS sid
  ON CONFLICT (inventory_id, stock_id) DO UPDATE SET is_present = true
    WHERE inventory_stock_levels.is_present IS DISTINCT FROM true;

  -- MATERIALIZA A AUSÊNCIA nos demais locais da empresa.
  -- Antes era UPDATE-only e virava no-op quando a linha do par não existia (bug Engetec).
  -- Agora o "ausente" é linha gravada: qty=0, is_present=false.
  -- Sem saldo em nenhuma delas — garantido pela trava presence_has_balance acima.
  -- O escopo continua "todos os locais da empresa" (mesmo do UPDATE antigo): filtrar por
  -- can_access_stock aqui recriaria um no-op silencioso, que é justamente o bug em correção.
  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity, is_present)
  SELECT v_company_id, p_inventory_id, s.id, 0, false
    FROM public.stocks s
   WHERE s.company_id = v_company_id
     AND NOT (s.id = ANY (v_valid_ids))
  ON CONFLICT (inventory_id, stock_id) DO UPDATE SET is_present = false
    WHERE inventory_stock_levels.is_present IS DISTINCT FROM false;
END;
$$;

COMMENT ON FUNCTION public.set_inventory_presence(uuid, uuid[]) IS
  'Define os locais em que um material esta presente (is_present). Materializa a AUSENCIA (linha qty=0/is_present=false) nos locais nao marcados — desmarcar nunca e no-op. Bloqueia desmarcar local com saldo>0 (presence_has_balance). Valida tenant e ACL do local (can_access_stock).';

GRANT EXECUTE ON FUNCTION public.set_inventory_presence(uuid, uuid[]) TO authenticated, service_role;

------------------------------------------------------------
-- 2. set_stock_materials(p_stock_id, p_inventory_ids)
--    Configura o catálogo inteiro de um local (eixo espelhado: materiais).
--    Recriada a partir da definição viva (20260814225028 §7.3, com guard de ACL).
--    ÚNICA mudança: o UPDATE final vira INSERT ... ON CONFLICT DO UPDATE (materialização).
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_stock_materials(
  p_stock_id     uuid,
  p_inventory_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id   uuid;
  v_user_company uuid;
  v_blocked      text;
  v_valid_ids    uuid[];
BEGIN
  -- empresa dona do estoque
  SELECT company_id INTO v_company_id FROM public.stocks WHERE id = p_stock_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque nao encontrado: %', p_stock_id USING ERRCODE = 'no_data_found';
  END IF;

  v_user_company := get_user_company_id(auth.uid());
  IF NOT (v_company_id = v_user_company OR is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: estoque de outra empresa' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ACL: usuário restrito não configura catálogo de local que não acessa
  IF NOT public.can_access_stock(auth.uid(), p_stock_id) THEN
    RAISE EXCEPTION 'sem acesso a este local de estoque' USING ERRCODE = '42501';
  END IF;

  -- só materiais que pertencem à empresa (ignora ids intrusos/de outra empresa)
  SELECT COALESCE(array_agg(i.id), ARRAY[]::uuid[]) INTO v_valid_ids
    FROM public.inventory i
   WHERE i.company_id = v_company_id
     AND i.id = ANY (COALESCE(p_inventory_ids, ARRAY[]::uuid[]));

  -- TRAVA: não desmarcar material com saldo > 0 neste local
  SELECT string_agg(i.name, ', ' ORDER BY i.name) INTO v_blocked
    FROM public.inventory_stock_levels l
    JOIN public.inventory i ON i.id = l.inventory_id
   WHERE l.stock_id   = p_stock_id
     AND l.company_id = v_company_id
     AND l.is_present = true
     AND l.quantity   > 0
     AND NOT (l.inventory_id = ANY (v_valid_ids));

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION 'presence_has_balance: %', v_blocked USING ERRCODE = 'check_violation';
  END IF;

  -- garante levels dos materiais marcados e marca presente
  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity, is_present)
  SELECT v_company_id, iid, p_stock_id, 0, true
    FROM unnest(v_valid_ids) AS iid
  ON CONFLICT (inventory_id, stock_id) DO UPDATE SET is_present = true
    WHERE inventory_stock_levels.is_present IS DISTINCT FROM true;

  -- MATERIALIZA A AUSÊNCIA dos demais materiais da empresa NESTE local.
  -- Mesmo defeito do eixo oposto: UPDATE-only virava no-op quando o par (material × local)
  -- ainda não tinha linha — material novo continuava aparecendo no local.
  INSERT INTO public.inventory_stock_levels (company_id, inventory_id, stock_id, quantity, is_present)
  SELECT v_company_id, i.id, p_stock_id, 0, false
    FROM public.inventory i
   WHERE i.company_id = v_company_id
     AND NOT (i.id = ANY (v_valid_ids))
  ON CONFLICT (inventory_id, stock_id) DO UPDATE SET is_present = false
    WHERE inventory_stock_levels.is_present IS DISTINCT FROM false;
END;
$$;

COMMENT ON FUNCTION public.set_stock_materials(uuid, uuid[]) IS
  'Configura o catalogo (presenca) de um local inteiro. Materializa a AUSENCIA (linha qty=0/is_present=false) dos materiais nao marcados — desmarcar nunca e no-op. Bloqueia desmarcar material com saldo>0 (presence_has_balance). Valida tenant e ACL do local (can_access_stock).';

GRANT EXECUTE ON FUNCTION public.set_stock_materials(uuid, uuid[]) TO authenticated, service_role;

------------------------------------------------------------
-- 3. View inventory_low_stock: respeitar presença.
--    Antes: material AUSENTE de um local, mas com min_quantity gravado lá, ainda contava
--    como "abaixo do mínimo" — inflava o banner "N materiais abaixo do mínimo" e a sugestão
--    de requisição de compra com material que nem pertence ao local.
--    CREATE OR REPLACE (não DROP): mesmas colunas, mesma ordem, mesmos tipos — então os
--    GRANTs existentes são preservados (DROP levaria os GRANTs junto).
--    Contrato de colunas consumido por src/hooks/useLowStock.ts: company_id, inventory_id,
--    material_name, material_sku, stock_id, stock_name, quantity, min_quantity, unit,
--    deficit, cost_price — INALTERADO.
------------------------------------------------------------

CREATE OR REPLACE VIEW public.inventory_low_stock
WITH (security_invoker = true)
AS
SELECT
  isl.company_id,
  isl.inventory_id,
  i.name        AS material_name,
  i.sku         AS material_sku,
  isl.stock_id,
  s.name        AS stock_name,
  isl.quantity,
  isl.min_quantity,
  i.unit,
  (isl.min_quantity - isl.quantity) AS deficit,
  i.cost_price
FROM public.inventory_stock_levels isl
JOIN public.inventory i ON i.id = isl.inventory_id
JOIN public.stocks    s ON s.id = isl.stock_id
WHERE isl.min_quantity IS NOT NULL
  AND isl.min_quantity > 0
  AND isl.quantity < isl.min_quantity
  AND isl.is_present = true
ORDER BY s.name, i.name;

-- Reemitido por segurança (idempotente): se um dia esta seção virar DROP + CREATE,
-- o GRANT tem que vir junto, senão a tela de estoque baixo quebra com permission denied.
GRANT SELECT ON public.inventory_low_stock TO authenticated, service_role;

------------------------------------------------------------
-- 4. notify_low_stock_on_level_update: não notificar material ausente do local.
--    Recriada a partir da definição viva (20260721180000 §2), com saída antecipada
--    quando NEW.is_present = false. Sem isso, mexer no min_quantity de um par ausente
--    dispararia "Estoque baixo" pro admin sobre material que nem pertence àquele local.
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_low_stock_on_level_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_material_name text;
  v_stock_name    text;
  v_was_below     boolean;
  v_is_below      boolean;
BEGIN
  -- Material AUSENTE deste local não gera alerta (presença manda mais que mínimo).
  IF NEW.is_present IS FALSE THEN
    RETURN NEW;
  END IF;

  -- Sem mínimo configurado (ou mínimo <= 0) => nada a monitorar.
  IF NEW.min_quantity IS NULL OR NEW.min_quantity <= 0 THEN
    RETURN NEW;
  END IF;

  -- Estado atual: abaixo do mínimo?
  v_is_below := NEW.quantity < NEW.min_quantity;

  IF NOT v_is_below THEN
    RETURN NEW; -- continua ok, nada a notificar
  END IF;

  -- Estado anterior: já estava abaixo? (usa o mínimo vigente na época).
  -- Se OLD.min_quantity é NULL/<=0, não havia monitoramento antes => tratamos
  -- como "não estava abaixo" para permitir a primeira notificação.
  v_was_below := (
    OLD.min_quantity IS NOT NULL
    AND OLD.min_quantity > 0
    AND OLD.quantity < OLD.min_quantity
  );

  -- Só notifica na TRANSIÇÃO ok -> abaixo (anti-spam principal).
  IF v_was_below THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT i.name INTO v_material_name
  FROM public.inventory i
  WHERE i.id = NEW.inventory_id;

  SELECT s.name INTO v_stock_name
  FROM public.stocks s
  WHERE s.id = NEW.stock_id;

  -- Insere 1 notificação por usuário ADMIN ativo da empresa.
  -- Anti-dup extra: pula se já há notificação NÃO-LIDA do mesmo tipo, material
  -- e local para aquele usuário nas últimas 24h (evita re-notificar em ping-pong
  -- de saldo dentro de um dia). O casamento por material/local é feito pela
  -- action_url que carrega os ids em querystring.
  INSERT INTO public.user_notifications (
    user_id, type, title, message, action_url, icon, expires_at
  )
  SELECT DISTINCT
    p.user_id,
    'inventory_low_stock',
    'Estoque baixo',
    'O material "' || COALESCE(NULLIF(v_material_name, ''), 'sem nome')
      || '" está abaixo do mínimo em '
      || COALESCE(NULLIF(v_stock_name, ''), 'estoque')
      || ' (' || trim(to_char(NEW.quantity, 'FM999999990.####'))
      || '/' || trim(to_char(NEW.min_quantity, 'FM999999990.####')) || ').',
    '/inventory?low=1&material=' || NEW.inventory_id::text
      || '&stock=' || NEW.stock_id::text,
    'AlertTriangle',
    now() + interval '30 days'
  FROM public.profiles p
  JOIN public.user_roles ur
    ON ur.user_id = p.user_id
   AND ur.role = 'admin'::app_role
  WHERE p.company_id = NEW.company_id
    AND p.user_id IS NOT NULL
    AND COALESCE(p.is_active, true) = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_notifications un
      WHERE un.user_id = p.user_id
        AND un.type = 'inventory_low_stock'
        AND un.read_at IS NULL
        AND un.created_at > now() - interval '24 hours'
        AND un.action_url = '/inventory?low=1&material=' || NEW.inventory_id::text
          || '&stock=' || NEW.stock_id::text
    );

  RETURN NEW;
END;
$function$;

-- Trigger inalterado (AFTER UPDATE OF quantity, min_quantity). Reemitido idempotente
-- só para a migration ser autocontida.
DROP TRIGGER IF EXISTS trg_notify_low_stock ON public.inventory_stock_levels;
CREATE TRIGGER trg_notify_low_stock
  AFTER UPDATE OF quantity, min_quantity ON public.inventory_stock_levels
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_low_stock_on_level_update();

------------------------------------------------------------
-- 5. Guard de presença: cobrir o INSERT **e voltar a funcionar no UPDATE**.
--
--    5.a) O buraco conhecido: guard_inventory_presence_write só rodava BEFORE UPDATE, mas o
--         client insere linha direto em inventory_stock_levels (useInventory.ts,
--         updateStockLevelMinQuantity, quando o par ainda não tem level). Esse INSERT não era
--         guardado. Ninguém abusa hoje porque o insert omite a coluna (cai no DEFAULT true),
--         mas bastava o client mandar is_present=false pra escrever presença sem passar por RPC.
--
--    5.b) O buraco DESCOBERTO ao testar (2026-09-30): o guard do UPDATE era INERTE desde a
--         20260722160000. A função era SECURITY DEFINER — e dentro de uma função SECURITY
--         DEFINER o `current_user` é SEMPRE o OWNER da função ('postgres'). Ou seja,
--         `current_user <> 'postgres'` nunca era verdade e o RAISE nunca disparava.
--         Provado em produção (transação revertida):
--           trigger SECURITY DEFINER  -> current_user dentro do trigger = 'postgres'
--           trigger SECURITY INVOKER  -> current_user dentro do trigger = 'service_role'
--         e um UPDATE de is_present feito como service_role passava batido.
--         Correção: a função vira SECURITY INVOKER (não precisa de privilégio nenhum — só lê
--         NEW/OLD e levanta exceção). Aí o `current_user` volta a ser o papel REAL do autor.
--         Contraprova de que isso não quebra as RPCs: DML executado DENTRO de uma função
--         SECURITY DEFINER com owner postgres faz o trigger invoker enxergar
--         current_user='postgres' (também provado em produção, transação revertida).
--
--    5.c) Teste de autoria: `pg_has_role(current_user, 'postgres', 'MEMBER')` em vez de
--         comparar string. Cobre postgres E superusuário (supabase_admin, editor SQL do
--         dashboard, futuras migrations) e continua excluindo anon/authenticated/service_role.
--
--    Uma função, dois comportamentos por TG_OP:
--      * UPDATE: mudar is_present sem autoridade de owner levanta presence_write_forbidden
--        (é o comportamento que a 20260722160000 sempre quis ter — agora ele existe de fato).
--      * INSERT: NÃO levanta exceção — apenas NORMALIZA is_present := true. Levantar erro
--        quebraria o fluxo legítimo de estoque mínimo inline, que insere o level sem saber
--        de presença.
--    Conferido antes de ligar: nenhum ponto do front escreve is_present (só lê —
--    useInventory.ts:141 e useCompanyDataExport.ts). Nenhuma edge function toca a tabela.
------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_inventory_presence_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_is_owner boolean := pg_has_role(current_user, 'postgres', 'MEMBER');
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Presença só nasce via RPC. Insert de fora normaliza pro default permissivo,
    -- sem erro (não quebra o insert de min_quantity inline do client).
    IF NOT v_is_owner THEN
      NEW.is_present := true;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: só bloqueia quando a presença de fato MUDA e o autor não tem autoridade de owner
  -- (as RPCs security-definer rodam como owner e passam livremente).
  IF NEW.is_present IS DISTINCT FROM OLD.is_present
     AND NOT v_is_owner THEN
    RAISE EXCEPTION 'presence_write_forbidden: presenca de material so pode ser alterada via RPC'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_inventory_presence_write() IS
  'Guarda a coluna is_present de inventory_stock_levels. BEFORE UPDATE: bloqueia mudanca sem autoridade de owner (presence_write_forbidden). BEFORE INSERT: normaliza is_present=true fora do owner, sem erro. SECURITY INVOKER de proposito: como SECURITY DEFINER o current_user seria sempre o owner e o guard nunca dispararia.';

-- UPDATE: trigger existente, reemitido idêntico (idempotência).
DROP TRIGGER IF EXISTS trg_guard_inventory_presence_write ON public.inventory_stock_levels;
CREATE TRIGGER trg_guard_inventory_presence_write
  BEFORE UPDATE ON public.inventory_stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_presence_write();

-- INSERT: trigger novo.
DROP TRIGGER IF EXISTS trg_guard_inventory_presence_insert ON public.inventory_stock_levels;
CREATE TRIGGER trg_guard_inventory_presence_insert
  BEFORE INSERT ON public.inventory_stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_presence_write();

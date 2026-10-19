-- ===========================================================================
-- Segunda camada de defesa: revoga o GRANT legado de `anon` nas tabelas nucleo
-- ---------------------------------------------------------------------------
-- POR QUE (e o que esta migration NAO e)
--   Isto NAO fecha buraco aberto. Hoje `anon` nao le uma linha dessas tabelas:
--   todas estao com RLS habilitada e nenhuma tem policy permissiva de `anon`
--   que funcione. O que existe e TRANCA UNICA: a RLS e a unica coisa segurando,
--   porque o GRANT de tabela continua la, herdado do ALTER DEFAULT PRIVILEGES
--   antigo do projeto (role postgres, schema public, tipo tabela, concede
--   `anon=arwdxtm` em TODA tabela nova).
--
--   Com GRANT presente, basta alguem criar no futuro uma policy sem `TO
--   authenticated` (omitir o TO cai em `TO public`, que INCLUI `anon`) pra
--   virar vazamento de verdade, sem revisao de GRANT nenhuma no caminho. Foi
--   exatamente assim que nasceu o furo de `inventory_stock_levels`: um loop
--   generico de policies na migration 20260721160000. Revogando o GRANT, uma
--   policy frouxa futura passa a dar "permission denied" em vez de vazar.
--
-- ESCOPO: SO o `anon`.
--   `authenticated` NAO e tocado em nenhuma linha daqui. Nessas tabelas o
--   `authenticated` e o caminho vivo do app inteiro (hooks de estoque,
--   financeiro, clientes); revogar derrubaria o produto. Quem filtra o
--   `authenticated` e a RLS por company_id, nao o GRANT.
--
-- O QUE FOI MEDIDO ANTES DE REVOGAR (prod, 2026-10-18)
--   1. Policies: das 13 relacoes abaixo, so `customers` tinha policy de `anon`
--      ("Public can view customer by portal token"). Ela esta MORTA: le
--      current_setting('request.headers.x-portal-token') e o PostgREST nunca
--      cria GUC por header (ele expoe `request.headers` como UM json). Provado
--      por HTTP real: GET /rest/v1/customers como anon, com token de portal
--      ATIVO no header, devolveu [] antes do revoke. As demais 12 relacoes nao
--      tem policy de `anon` nem de `public`.
--   2. Superficie publica: Portal do Cliente, portal PMOC/contrato, OS publica
--      e proposta publica chegam nessas tabelas por RPC SECURITY DEFINER
--      (get_portal_data, get_public_os, get_quote_public_payload,
--      respond_quote_public) ou por edge function com service_role
--      (pmoc-portal-share, self-register, create-company). SECURITY DEFINER
--      roda como owner e NAO consulta o GRANT do chamador, entao revogar a
--      TABELA nao afeta nenhum desses caminhos. O que morre e so o acesso
--      direto por PostgREST como `anon`, que e precisamente o alvo.
--   3. Triggers: as 4 funcoes de trigger sem SECURITY DEFINER que citam essas
--      tabelas (guard_customer_stock_level_scope, on_employee_deactivated,
--      reclassify_deleted_financial_subcategory, sync_inventory_supplier_name)
--      vivem em inventory_stock_levels, employees, financial_categories e
--      inventory, e nenhuma dessas hospedeiras tem policy de ESCRITA pra
--      `anon`/`public`. Logo `anon` nao dispara nenhuma delas.
--   4. Realtime: nenhuma dessas relacoes esta na publication supabase_realtime,
--      entao nao ha subscription publica dependendo do GRANT.
--   5. Embed do PostgREST: nenhuma pagina publica faz select com `customers(...)`
--      aninhado como anon (a pagina de proposta usa RPC). Isso importa porque
--      embed sem privilegio na tabela aninhada devolve 403 na query INTEIRA, nao
--      null; se houvesse um, o revoke derrubaria a tela.
--
-- JA LIMPAS (nenhuma acao aqui, so registro): company_settings, profiles e
--   inventory_count_number_counters ja estavam sem `anon` no ACL.
--
-- NAO RESOLVIDO AQUI (decisao de Tech Lead/CEO): o ALTER DEFAULT PRIVILEGES que
--   GERA essa divida continua ativo, entao toda tabela nova nasce com `anon`.
--   Mexer nele muda o comportamento de todas as migrations futuras do projeto e
--   nao cabe num revoke pontual.
--
-- Idempotente: REVOKE repetido nao falha, e cada relacao e checada com
-- to_regclass antes (ambiente novo sem a tabela nao quebra o push).
-- ===========================================================================

DO $$
DECLARE
  v_rel   text;
  v_lista text[] := ARRAY[
    -- as 7 tabelas-nucleo do briefing
    'public.customers',
    'public.inventory',
    'public.stocks',
    'public.inventory_stock_levels',
    'public.inventory_movements',
    'public.financial_transactions',
    'public.financial_accounts',
    -- mesmo vetor nas tabelas que o modulo PDV passou a tocar
    'public.suppliers',
    'public.material_groups',
    'public.inventory_counts',
    'public.inventory_count_items',
    'public.inventory_count_stocks',
    'public.inventory_count_divergences'  -- view security_invoker=true
  ];
  v_tocadas int := 0;
  v_ausentes int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RAISE NOTICE 'role anon nao existe neste ambiente; nada a revogar';
    RETURN;
  END IF;

  FOREACH v_rel IN ARRAY v_lista LOOP
    IF to_regclass(v_rel) IS NULL THEN
      v_ausentes := v_ausentes + 1;
      RAISE NOTICE 'relacao ausente, ignorada: %', v_rel;
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON %s FROM anon', v_rel);
    v_tocadas := v_tocadas + 1;
    RAISE NOTICE 'anon revogado em %', v_rel;
  END LOOP;

  RAISE NOTICE 'revoke concluido: % relacoes tocadas, % ausentes', v_tocadas, v_ausentes;
END $$;

-- Prova no proprio push: se sobrou qualquer privilegio de `anon` em qualquer
-- uma das relacoes da lista, a migration aborta em vez de passar verde.
DO $$
DECLARE
  v_sobrou text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    RETURN;
  END IF;

  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_sobrou
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN (
       'customers','inventory','stocks','inventory_stock_levels','inventory_movements',
       'financial_transactions','financial_accounts','suppliers','material_groups',
       'inventory_counts','inventory_count_items','inventory_count_stocks',
       'inventory_count_divergences'
     )
     AND (
       has_table_privilege('anon', c.oid, 'SELECT')
       OR has_table_privilege('anon', c.oid, 'INSERT')
       OR has_table_privilege('anon', c.oid, 'UPDATE')
       OR has_table_privilege('anon', c.oid, 'DELETE')
     );

  IF v_sobrou IS NOT NULL THEN
    RAISE EXCEPTION 'anon ainda tem privilegio em: %', v_sobrou;
  END IF;

  RAISE NOTICE 'verificado: anon sem SELECT/INSERT/UPDATE/DELETE em todas as relacoes da lista';
END $$;

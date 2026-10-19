-- Onda 1 do PDV, 4a rodada: cofre do Zerar Sistema + aperto de policy anon
--
-- Quatro dividas levantadas na auditoria. Duas exigiam codigo, duas estavam
-- JA FECHADAS por migration anterior e ficam aqui so documentadas, com a
-- medicao que prova o fechamento (pra ninguem reabrir o item no mes que vem).
--
-- ---------------------------------------------------------------------------
-- DIVIDA 4 (CORRIGIDA AQUI): Zerar Sistema desconfigurava o cofre do PDV.
--   company_settings.pdv_cash_account_id e ON DELETE SET NULL. O step
--   'financial_movements' do reset apagava financial_accounts e recriava
--   "Caixa Geral", mas nao repunha o ponteiro: a empresa saia do reset sem
--   conta de caixa configurada e o operador nao conseguia abrir caixa, sem
--   nenhuma mensagem explicando. Detalhe das travas no corpo da funcao.
--
--   Caminhos que apagam financial_accounts: medidos DOIS, em pg_proc.
--     a) reset_system_step  -> corrigido aqui;
--     b) admin_delete_company -> NAO precisa de conserto: ele apaga tambem
--        public.company_settings e public.companies na mesma transacao, logo
--        nao existe ponteiro sobrevivente pra repor. Verificado por
--        pg_get_functiondef, nao por suposicao.
--
-- ---------------------------------------------------------------------------
-- DIVIDA 6 (CORRIGIDA AQUI): duas policies anon cuja propria condicao nao
-- sustentava o acesso -- so nao vazavam porque a RLS da tabela de dentro
-- continha a subquery. Seguranca de segunda ordem: quebra no dia em que
-- alguem "otimizar" a subquery pra um join.
--
--   6a) technician_locations / "Public can view technician_locations via
--       shared OS": predicado era
--         service_order_id IN (SELECT id FROM service_orders)
--       isto e, "existe a OS". Sem condicao nenhuma.
--
--       Medicao ANTES (chave anon real, PostgREST):
--         GET /technician_locations            -> 42501 permission denied
--                                                 for table service_ratings
--       O 42501 vem da OUTRA policy anon da tabela ("via portal"), que
--       referencia service_ratings -- tabela sem GRANT de SELECT pra anon.
--       Avaliar policy exige privilegio nas tabelas citadas nela, entao
--       HOJE anon nao le UMA linha de technician_locations: erra antes.
--       Medicao isolada, em transacao revertida, dropando a policy "via
--       portal" e deixando so a frouxa: SET ROLE anon -> count = 0, porque
--       service_orders nao tem NENHUMA policy alcancando anon (medido: as 2
--       policies de service_orders sao {authenticated}).
--
--       Portanto a superficie anon desta policy e comprovadamente ZERO e
--       dropa-la nao pode regredir portal nenhum. E o que fazemos: DROP.
--       Nao ha predicado "apertado" a escrever aqui porque NAO EXISTE token
--       no caminho da OS publica -- o mapa publico le pela RPC SECURITY
--       DEFINER get_public_os(uuid). Ver RELATORIO no fim do arquivo.
--
--   6b) quote_items / "Public view quote_items via quote": exigia apenas
--       q.token IS NOT NULL, ou seja "algum orcamento com token", nao o seu.
--
--       Medicao ANTES (chave anon real, PostgREST):
--         com x-share-token do orcamento A -> 46 itens (os de A)
--         sem header                        -> 0
--         itens do orcamento B com token A  -> 0
--         total visivel com token A         -> 46
--       Nao vazava, mas a contencao era 100% da RLS de quotes (cujas policies
--       anon sao token-gated). O predicado passa a casar o token com o
--       PROPRIO orcamento sendo lido.
--
--       Aceita as DUAS formas de GUC de proposito:
--         current_setting('request.headers.x-share-token', true)
--         current_setting('request.headers', true)::json ->> 'x-share-token'
--       As duas convivem nas policies de public.quotes desta casa e nao da
--       pra saber de fora qual delas o PostgREST desta versao popula. Aceitar
--       as duas e estritamente mais apertado que o que havia antes e remove
--       qualquer risco de derrubar o portal por apostar na forma errada.
--       nullif(...,'') antes do ::json evita 22P02 se o GUC vier vazio.
--
-- ---------------------------------------------------------------------------
-- DIVIDA 6d (JA ESTAVA FECHADA -- so o residuo de privilegio morto e tratado
-- aqui): "149 relacoes com SELECT de anon".
--
--   Medicao de hoje, tres metodos independentes e concordantes:
--     has_table_privilege('anon', oid, 'SELECT') .......... 13 relacoes
--     pg_class.relacl ~ '(^|,)anon='  ..................... 13 relacoes
--     information_schema.table_privileges (grantee=anon) ... 13 relacoes
--   Nenhuma VIEW: 0 de 6 views do schema public tem SELECT pra anon, e todas
--   as 6 estao com security_invoker ligado (contract_activity_execution=on,
--   contract_health_status, cost_resources_with_rate, inventory_count_
--   divergences, inventory_low_stock, salespeople_basic = true).
--
--   Quem fechou: 20261018211000_revoga_anon_acidental_no_schema_public, JA
--   APLICADA em producao (confirmado em supabase_migrations.schema_migrations).
--   Ela revogou 135 relacoes (133 tabelas + 2 views: contract_health_status e
--   inventory_low_stock) e preservou 13 de proposito. Nao ha 149 a revogar.
--
--   O que SOBRA e e tratado aqui: privilegio MORTO nas 13 preservadas. Varias
--   carregam INSERT/UPDATE/DELETE pra anon sem nenhuma policy permissiva que
--   alcance anon naquele comando. Hoje a RLS nega -- e tranca unica, nao porta
--   aberta -- mas o GRANT deixa a tabela a UMA policy de distancia de virar
--   buraco de escrita. Mesmo achado que a 20261018211000 ja tinha corrigido em
--   subscription_modules/subscription_plans ("revogar so SELECT deixa a parte
--   pior aberta").
--
--   Classificacao medida par (relacao, privilegio) contra pg_policy, por
--   comando: 48 pares concedidos a anon, 16 COM policy (ficam), 32 SEM policy
--   (revogados abaixo). Os 32 sao, por construcao, inalcancaveis hoje: RLS
--   esta ligada nas 13 e nao existe policy permissiva alcancando anon naquele
--   comando, entao revogar o GRANT NAO pode mudar comportamento -- muda so a
--   forma do erro (0 linhas / 0 afetadas passa a 42501).
--
--   As duas unicas revogacoes de SELECT (service_orders e form_responses)
--   foram checadas no codigo antes, porque e nelas que o "[] -> 42501" poderia
--   virar tela quebrada:
--     . service_orders: SELECT de anon devolve [] hoje (medido). A OS publica
--       NAO le essa tabela por PostgREST: TechnicianOS.tsx roteia
--       isAuthenticated === false para fetchPublicOS(), que chama a RPC
--       SECURITY DEFINER get_public_os/get_public_os_by_code. As leituras
--       diretas (fetchServiceOrder, fetchTechnicianProfile, fetchFormResponses)
--       rodam no ramo autenticado, e as que podem cair no cliente anon
--       desestruturam so `data` ou tem catch que degrada pra lista vazia.
--     . form_responses: SELECT de anon devolve [] hoje (medido). O checklist da
--       OS publica vem dentro do payload de get_public_os (confirmado:
--       pg_get_functiondef cita form_responses, os_photos e
--       service_order_equipment). O GRANT de INSERT -- que tem policy anon de
--       verdade -- e PRESERVADO.
--
--   service_orders e caso especial e vale registrar: a 20261018211000 preservou
--   a tabela por causa da policy de INSERT anon do portal ('origin=portal').
--   Essa policy NAO EXISTE MAIS hoje (medido: as 2 policies restantes sao
--   {authenticated}) e o GRANT de INSERT pra anon tambem nao (medido:
--   has_table_privilege = false). Nao fomos nos: ja estava assim. Consequencia
--   de PRODUCAO, fora do alcance de migration, no RELATORIO no fim do arquivo.
--
-- ---------------------------------------------------------------------------
-- DIVIDA 7 (JA ESTAVA FECHADA -- nada a fazer): "16 policies {public} que ja
-- exigem login".
--
--   Medicao de hoje em TODOS os schemas (pg_policy com 0 = ANY(polroles) e
--   expressao citando auth.uid/get_user_company_id/has_role/is_super_admin):
--   ZERO policies. Em public sobraram 10 policies {public} e as 10 sao
--   publicas de verdade, nenhuma exige login:
--     blog_categories (SELECT true), blog_posts (SELECT status='published'),
--     blog_post_comments (SELECT is_approved, INSERT true),
--     blog_post_likes (SELECT/INSERT/DELETE), nfse_tiers, whatsapp_tiers,
--     proposal_templates (SELECT true).
--   Converter essas pra TO authenticated derrubaria o blog e a tabela de
--   precos do site. Ficam como estao, de proposito.
--
-- ---------------------------------------------------------------------------
-- DIVIDA 6e: fora de escopo por decisao do Tech Lead. Nada aqui toca o
-- EVENT TRIGGER tg_evt_funcao_nova_sem_public nem a sua funcao.
--
-- Idempotente: CREATE OR REPLACE, DROP POLICY IF EXISTS antes de CREATE
-- POLICY, REVOKE (no-op quando o privilegio ja saiu) e laco que recalcula a
-- guarda a cada execucao.


-- ===========================================================================
-- PARTE A -- DIVIDA 4: reset_system_step repoe o cofre do PDV
--
-- Recriada a partir da definicao VIVA (pg_get_functiondef), nao de arquivo:
-- a funcao acumula steps de varias migrations e transcrever a mao perderia
-- trecho. A unica diferenca em relacao ao que estava em producao e o bloco
-- "COFRE DO PDV" dentro do step 'financial_movements' (+ duas variaveis no
-- DECLARE). Os outros 12 steps vao byte a byte iguais.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.reset_system_step(p_company_id uuid, p_step text, p_audit_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_master boolean;
  v_is_tenant_admin boolean;
  v_counts jsonb := '{}'::jsonb;
  v_n bigint;
  v_cash_account_id uuid;
  v_repointed integer;
BEGIN
  -- Validacao basica
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa nao informada.' USING ERRCODE = '22023';
  END IF;
  IF p_step IS NULL THEN
    RAISE EXCEPTION 'Step nao informado.' USING ERRCODE = '22023';
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sem permissao pra zerar o sistema (sessao nao autenticada).'
      USING ERRCODE = '42501';
  END IF;

  -- Permissao (mesma regra do audit_start)
  v_is_master := public.has_role(v_user_id, 'super_admin'::public.app_role);

  IF NOT v_is_master THEN
    v_is_tenant_admin := (
      public.has_role(v_user_id, 'admin'::public.app_role)
      AND p_company_id = public.get_user_company_id(v_user_id)
    );

    IF NOT v_is_tenant_admin THEN
      RAISE EXCEPTION 'Sem permissao pra zerar o sistema (apenas o administrador da empresa pode).'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ============================================================
  -- STEPS
  -- ============================================================

  IF p_step = 'service_orders' THEN
    DELETE FROM public.os_photos
      WHERE service_order_id IN (
        SELECT id FROM public.service_orders WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{os_photos}', to_jsonb(v_n));

    DELETE FROM public.form_responses
      WHERE service_order_id IN (
        SELECT id FROM public.service_orders WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{form_responses}', to_jsonb(v_n));

    DELETE FROM public.service_order_assignees
      WHERE service_order_id IN (
        SELECT id FROM public.service_orders WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{service_order_assignees}', to_jsonb(v_n));

    DELETE FROM public.service_order_equipment
      WHERE service_order_id IN (
        SELECT id FROM public.service_orders WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{service_order_equipment}', to_jsonb(v_n));

    DELETE FROM public.service_ratings
      WHERE service_order_id IN (
        SELECT id FROM public.service_orders WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{service_ratings}', to_jsonb(v_n));

    DELETE FROM public.service_costs WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{service_costs}', to_jsonb(v_n));

    DELETE FROM public.service_materials WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{service_materials}', to_jsonb(v_n));

    DELETE FROM public.service_gifts
      WHERE service_id IN (
        SELECT id FROM public.service_types WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{service_gifts}', to_jsonb(v_n));

    DELETE FROM public.cost_resource_items
      WHERE resource_id IN (
        SELECT id FROM public.cost_resources WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{cost_resource_items}', to_jsonb(v_n));

    UPDATE public.inventory_movements SET service_order_id = NULL
      WHERE service_order_id IN (
        SELECT id FROM public.service_orders WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{inventory_movements_nullified}', to_jsonb(v_n));

    DELETE FROM public.service_orders WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{service_orders}', to_jsonb(v_n));

  ELSIF p_step = 'contracts' THEN
    DELETE FROM public.pmoc_contract_documents_custom WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{pmoc_contract_documents_custom}', to_jsonb(v_n));

    DELETE FROM public.pmoc_documents WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{pmoc_documents}', to_jsonb(v_n));

    DELETE FROM public.pmoc_schedules
      WHERE contract_id IN (
        SELECT id FROM public.contracts WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{pmoc_schedules}', to_jsonb(v_n));

    DELETE FROM public.contract_occurrences
      WHERE contract_id IN (
        SELECT id FROM public.contracts WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{contract_occurrences}', to_jsonb(v_n));

    DELETE FROM public.contract_items
      WHERE contract_id IN (
        SELECT id FROM public.contracts WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{contract_items}', to_jsonb(v_n));

    UPDATE public.service_orders SET contract_id = NULL
      WHERE contract_id IN (
        SELECT id FROM public.contracts WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{service_orders_contract_nullified}', to_jsonb(v_n));

    UPDATE public.financial_transactions SET contract_id = NULL
      WHERE contract_id IN (
        SELECT id FROM public.contracts WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{financial_transactions_contract_nullified}', to_jsonb(v_n));

    DELETE FROM public.contracts WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{contracts}', to_jsonb(v_n));

  ELSIF p_step = 'quotes' THEN
    DELETE FROM public.quote_item_materials
      WHERE quote_item_id IN (
        SELECT qi.id FROM public.quote_items qi
        JOIN public.quotes q ON q.id = qi.quote_id
        WHERE q.company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{quote_item_materials}', to_jsonb(v_n));

    DELETE FROM public.quote_items
      WHERE quote_id IN (
        SELECT id FROM public.quotes WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{quote_items}', to_jsonb(v_n));

    DELETE FROM public.quotes WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{quotes}', to_jsonb(v_n));

  ELSIF p_step = 'equipment' THEN
    DELETE FROM public.equipment WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{equipment}', to_jsonb(v_n));

  ELSIF p_step = 'custom_configs' THEN
    DELETE FROM public.form_responses
      WHERE question_id IN (
        SELECT q.id FROM public.form_questions q
        JOIN public.form_templates t ON t.id = q.template_id
        WHERE t.company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{form_responses}', to_jsonb(v_n));

    DELETE FROM public.form_template_service_types
      WHERE template_id IN (
        SELECT id FROM public.form_templates WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{form_template_service_types}', to_jsonb(v_n));

    DELETE FROM public.form_questions
      WHERE template_id IN (
        SELECT id FROM public.form_templates WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{form_questions}', to_jsonb(v_n));

    DELETE FROM public.form_templates WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{form_templates}', to_jsonb(v_n));

    DELETE FROM public.crm_stages WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{crm_stages}', to_jsonb(v_n));

    -- ACL por funil: o funil padrao sobrevive ao reset, a ACL dele nao pode
    -- sobreviver: a empresa acordaria do reset com o funil escondido.
    DELETE FROM public.crm_pipeline_access a
     WHERE a.pipeline_id IN (
       SELECT p.id FROM public.crm_pipelines p WHERE p.company_id = p_company_id
     );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{crm_pipeline_access}', to_jsonb(v_n));

    DELETE FROM public.crm_pipelines p
     WHERE p.company_id = p_company_id
       AND NOT p.is_default
       AND NOT EXISTS (SELECT 1 FROM public.crm_stages s WHERE s.pipeline_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.pipeline_id = p.id);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{crm_pipelines}', to_jsonb(v_n));

    -- Onda 1 de Projetos: obra que ficou sem NENHUMA frente depois da
    -- limpeza de funis e casca vazia. Obra com frente sobrevivente fica.
    DELETE FROM public.projects pr
     WHERE pr.company_id = p_company_id
       AND NOT EXISTS (
         SELECT 1 FROM public.crm_pipelines cp WHERE cp.project_id = pr.id
       );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{projects}', to_jsonb(v_n));

    DELETE FROM public.cost_resource_items
      WHERE resource_id IN (
        SELECT id FROM public.cost_resources WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{cost_resource_items}', to_jsonb(v_n));

    DELETE FROM public.cost_resources WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{cost_resources}', to_jsonb(v_n));

  ELSIF p_step = 'pdv' THEN
    -- =========================================================================
    -- PDV e Loja (add-on pago). Apaga venda, caixa, terminal e fiado.
    --
    -- VALVULA DE EXPURGO. `pdv_orders` tem um BEFORE DELETE
    -- (tg_pdv_orders_block_delete) que recusa apagar pedido que saiu do
    -- rascunho: e o que impede o operador de sumir com uma venda paga pelo
    -- PostgREST (RLS negando DELETE devolveria 204 silencioso, por isso a
    -- regra vive em gatilho). Sem abrir essa valvula o step aborta no primeiro
    -- pedido pago e o "Zerar Sistema" mentiria pro usuario.
    --
    -- A valvula e NOMINAL e TRANSACIONAL: `set_config(..., is_local => true)`
    -- vale so dentro desta transacao, e o gatilho so libera quando o GUC bate
    -- com a company_id da propria linha. Nao da pra contrabandear pelo
    -- PostgREST: `set_config` vive em pg_catalog (nao esta em schema exposto)
    -- e cada request do PostgREST e uma transacao separada.
    --
    -- Por que NAO usar `pg_has_role(current_user,'postgres','MEMBER')` como
    -- nos guards de estoque: estes gatilhos sao SECURITY DEFINER com owner
    -- postgres, entao current_user e SEMPRE postgres dentro deles e a
    -- checagem ficaria INERTE (foi exatamente o que matou o guard de presenca
    -- de 22/07 a 30/09/2026). Alem disso um "valvula de owner" liberaria
    -- apagar venda paga pra qualquer RPC SECURITY DEFINER do sistema; a
    -- nominal libera so este expurgo, so desta empresa, so nesta transacao.
    -- =========================================================================
    PERFORM set_config('app.pdv_purge_company', p_company_id::text, true);

    -- 1) Fiado ANTES do pedido. customer_credit_ledger.order_id e SET NULL:
    --    apagar o pedido primeiro transformaria a divida do cliente em linha
    --    orfa sem venda de origem, em vez de apagar a divida.
    DELETE FROM public.customer_credit_ledger WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{customer_credit_ledger}', to_jsonb(v_n));

    -- 2) Item e pagamento saem por CASCADE do pedido (order_id ON DELETE
    --    CASCADE). Contamos antes e NAO apagamos explicitamente de proposito:
    --    no caminho do CASCADE o gatilho tg_pdv_order_items_block_change ve o
    --    pedido pai ja invisivel e libera; num DELETE explicito ele barraria o
    --    item de pedido pago. Mesmo resultado com uma valvula aberta a menos.
    SELECT count(*) INTO v_n FROM public.pdv_order_items WHERE company_id = p_company_id;
    v_counts := jsonb_set(v_counts, '{pdv_order_items}', to_jsonb(v_n));

    SELECT count(*) INTO v_n FROM public.pdv_order_payments WHERE company_id = p_company_id;
    v_counts := jsonb_set(v_counts, '{pdv_order_payments}', to_jsonb(v_n));

    DELETE FROM public.pdv_orders WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{pdv_orders}', to_jsonb(v_n));

    -- 3) Caixa. pdv_cash_movements.session_id e CASCADE, mesma logica de cima.
    SELECT count(*) INTO v_n FROM public.pdv_cash_movements WHERE company_id = p_company_id;
    v_counts := jsonb_set(v_counts, '{pdv_cash_movements}', to_jsonb(v_n));

    DELETE FROM public.pdv_cash_sessions WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{pdv_cash_sessions}', to_jsonb(v_n));

    -- 4) Terminal vem DEPOIS de pedido e sessao de proposito: assim o proprio
    --    tg_pdv_terminals_block_delete (que recusa terminal com historico) nao
    --    acha mais historico e passa SEM valvula nenhuma.
    DELETE FROM public.pdv_terminals WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{pdv_terminals}', to_jsonb(v_n));

    -- 5) Numeracao do cupom volta pro 1. Zerar o historico e deixar o proximo
    --    cupom nascer nº 848 e exatamente a mentira que este step existe pra
    --    nao contar. Seguro porque os pedidos (unique company_id+number)
    --    sairam nesta mesma transacao.
    DELETE FROM public.pdv_order_number_counters WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{pdv_order_number_counters}', to_jsonb(v_n));

    -- 6) pdv_barcode_counters NAO entra aqui. O codigo de barras gerado mora
    --    em inventory.barcode (unique por company_id+barcode) e o catalogo
    --    sobrevive a este step: zerar o contador aqui faria o proximo codigo
    --    gerado colidir com produto que continua cadastrado. O reset dele vive
    --    no step 'materials', que e onde o inventory de fato vai embora.

    PERFORM set_config('app.pdv_purge_company', '', true);

  ELSIF p_step = 'financial_movements' THEN
    DELETE FROM public.financial_transaction_attachments
      WHERE transaction_id IN (
        SELECT id FROM public.financial_transactions WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{financial_transaction_attachments}', to_jsonb(v_n));

    DELETE FROM public.financial_transactions WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{financial_transactions}', to_jsonb(v_n));

    DELETE FROM public.credit_card_bills WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{credit_card_bills}', to_jsonb(v_n));

    DELETE FROM public.financial_accounts WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{financial_accounts}', to_jsonb(v_n));

    INSERT INTO public.financial_accounts (
      company_id, name, type, initial_balance, is_active, sort_order, color, icon
    ) VALUES (
      p_company_id, 'Caixa Geral', 'caixa', 0, true, 0, '#3b82f6', 'Landmark'
    )
    RETURNING id INTO v_cash_account_id;
    v_counts := jsonb_set(v_counts, '{financial_accounts_recreated}', to_jsonb(1));

    -- =====================================================================
    -- COFRE DO PDV: repor o ponteiro company_settings.pdv_cash_account_id.
    --
    -- company_settings.pdv_cash_account_id e ON DELETE SET NULL. O DELETE
    -- acima, portanto, ZERA o ponteiro em silencio e a conta recriada logo
    -- acima nao e apontada por ninguem. Resultado medido: depois de zerar,
    -- pdv_open_cash_session nao acha conta configurada e o operador NAO
    -- CONSEGUE ABRIR CAIXA, sem nenhuma mensagem dizendo o que fazer.
    --
    -- Tres travas de proposito:
    --   a) so empresa COM o modulo 'pdv' em company_modules. Empresa sem o
    --      add-on nao ganha ponteiro que ela nao pediu;
    --   b) so quando o ponteiro NAO aponta pra conta valida. "Valida" usa o
    --      MESMO teste do pdv_open_cash_session (existe + mesma empresa +
    --      type <> 'cartao'), pra nao haver duas definicoes de valido no
    --      sistema. Cobre o NULL do SET NULL e tambem o ponteiro podre que
    --      sobreviveu apontando pra conta de outra empresa (a FK nao e
    --      escopada por company_id);
    --   c) UPDATE escopado em company_id = p_company_id, entao a linha orfa
    --      de company_settings com company_id NULL que existe em producao
    --      nunca e tocada.
    -- =====================================================================
    IF EXISTS (
      SELECT 1 FROM public.company_modules cm
       WHERE cm.company_id = p_company_id
         AND cm.module_code = 'pdv'
    ) THEN
      UPDATE public.company_settings cs
         SET pdv_cash_account_id = v_cash_account_id
       WHERE cs.company_id = p_company_id
         AND NOT EXISTS (
           SELECT 1 FROM public.financial_accounts fa
            WHERE fa.id         = cs.pdv_cash_account_id
              AND fa.company_id = p_company_id
              AND fa.type      <> 'cartao'
         );
      GET DIAGNOSTICS v_repointed = ROW_COUNT;
      v_counts := jsonb_set(v_counts, '{pdv_cash_account_repointed}', to_jsonb(v_repointed));
    ELSE
      v_counts := jsonb_set(v_counts, '{pdv_cash_account_repointed}', to_jsonb(0));
    END IF;

  ELSIF p_step = 'financial_categories' THEN
    DELETE FROM public.financial_categories
      WHERE company_id = p_company_id
        AND COALESCE(is_system, false) = false;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{financial_categories}', to_jsonb(v_n));

    -- Centros de custo: mesmo grupo de cadastro financeiro. Sem este sweep o
    -- "Zerar Sistema" deixava centro de custo orfao no tenant.
    --
    -- A nulificacao explicita ANTES do DELETE nao e redundante com o
    -- ON DELETE SET NULL da FK: o gatilho BEFORE DELETE
    -- prevent_delete_cost_center_in_use roda ANTES da acao referencial e
    -- abortaria o step inteiro se o centro ainda estivesse em uso. Isso
    -- acontece de verdade quando o usuario marca "categorias financeiras" SEM
    -- marcar "movimentacoes" (os flags sao independentes na UI). Mesmo padrao
    -- ja usado no step 'contracts' logo acima.
    UPDATE public.financial_transactions
       SET cost_center_id = NULL
     WHERE company_id = p_company_id
       AND cost_center_id IS NOT NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{financial_transactions_cost_center_nullified}', to_jsonb(v_n));

    DELETE FROM public.cost_centers WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{cost_centers}', to_jsonb(v_n));

  ELSIF p_step = 'employees' THEN
    DELETE FROM public.time_sheets WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{time_sheets}', to_jsonb(v_n));

    DELETE FROM public.time_records WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{time_records}', to_jsonb(v_n));

    DELETE FROM public.time_schedules WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{time_schedules}', to_jsonb(v_n));

    DELETE FROM public.salesperson_sales WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{salesperson_sales}', to_jsonb(v_n));
    v_counts := jsonb_set(v_counts, '{salesperson_advances_skipped}', 'true'::jsonb);
    v_counts := jsonb_set(v_counts, '{salesperson_payments_skipped}', 'true'::jsonb);

    DELETE FROM public.team_members
      WHERE team_id IN (
        SELECT id FROM public.teams WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{team_members}', to_jsonb(v_n));

    DELETE FROM public.teams WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{teams}', to_jsonb(v_n));

    DELETE FROM public.responsible_technicians WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{responsible_technicians}', to_jsonb(v_n));

    DELETE FROM public.employee_movements
      WHERE employee_id IN (
        SELECT id FROM public.employees WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{employee_movements}', to_jsonb(v_n));

    DELETE FROM public.time_settings WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{time_settings}', to_jsonb(v_n));

    UPDATE public.financial_transactions SET employee_id = NULL
      WHERE employee_id IN (
        SELECT id FROM public.employees WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{financial_transactions_employee_nullified}', to_jsonb(v_n));

    DELETE FROM public.employees WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{employees}', to_jsonb(v_n));

  ELSIF p_step = 'stock' THEN
    DELETE FROM public.inventory_movements
      WHERE inventory_id IN (
        SELECT id FROM public.inventory WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{inventory_movements}', to_jsonb(v_n));

  ELSIF p_step = 'materials' THEN
    -- Módulo de Compras (raiz compras CASCADE -> compra_materiais,
    -- compra_cotacoes, compra_cotacao_precos). compra_materiais.inventory_id
    -- é SET NULL, então a compra sobrevive a um DELETE de inventory; por isso
    -- apagamos compras explicitamente aqui, antes do inventory.
    DELETE FROM public.compras WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{compras}', to_jsonb(v_n));

    DELETE FROM public.inventory WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{inventory}', to_jsonb(v_n));

    -- Contador do codigo de barras interno acompanha o catalogo: o numero
    -- gerado mora em inventory.barcode, que acabou de ir embora. Se ficasse
    -- de pe, o proximo produto cadastrado nasceria com codigo no meio da
    -- faixa, sem produto nenhum antes dele.
    DELETE FROM public.pdv_barcode_counters WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{pdv_barcode_counters}', to_jsonb(v_n));

  ELSIF p_step = 'customers' THEN
    DELETE FROM public.pmoc_contract_documents_custom WHERE company_id = p_company_id;
    DELETE FROM public.pmoc_documents WHERE company_id = p_company_id;
    DELETE FROM public.pmoc_schedules
      WHERE contract_id IN (
        SELECT id FROM public.contracts WHERE company_id = p_company_id
      );
    DELETE FROM public.contract_occurrences
      WHERE contract_id IN (
        SELECT id FROM public.contracts WHERE company_id = p_company_id
      );
    DELETE FROM public.contract_items
      WHERE contract_id IN (
        SELECT id FROM public.contracts WHERE company_id = p_company_id
      );

    DELETE FROM public.os_photos
      WHERE service_order_id IN (
        SELECT id FROM public.service_orders WHERE company_id = p_company_id
      );
    DELETE FROM public.form_responses
      WHERE service_order_id IN (
        SELECT id FROM public.service_orders WHERE company_id = p_company_id
      );
    DELETE FROM public.service_order_assignees
      WHERE service_order_id IN (
        SELECT id FROM public.service_orders WHERE company_id = p_company_id
      );
    DELETE FROM public.service_order_equipment
      WHERE service_order_id IN (
        SELECT id FROM public.service_orders WHERE company_id = p_company_id
      );
    DELETE FROM public.service_ratings
      WHERE service_order_id IN (
        SELECT id FROM public.service_orders WHERE company_id = p_company_id
      );

    UPDATE public.financial_transactions SET customer_id = NULL
      WHERE customer_id IN (
        SELECT id FROM public.customers WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{financial_transactions_customer_nullified}', to_jsonb(v_n));

    DELETE FROM public.service_orders WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{service_orders_cascade}', to_jsonb(v_n));

    DELETE FROM public.contracts WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{contracts_cascade}', to_jsonb(v_n));

    DELETE FROM public.lead_interactions
      WHERE lead_id IN (
        SELECT l.id FROM public.leads l
        JOIN public.customers c ON c.id = l.customer_id
        WHERE c.company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{lead_interactions}', to_jsonb(v_n));

    DELETE FROM public.leads WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{leads}', to_jsonb(v_n));

    DELETE FROM public.customer_portals
      WHERE customer_id IN (
        SELECT id FROM public.customers WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{customer_portals}', to_jsonb(v_n));

    DELETE FROM public.customer_contacts
      WHERE customer_id IN (
        SELECT id FROM public.customers WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{customer_contacts}', to_jsonb(v_n));

    DELETE FROM public.customer_origins WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{customer_origins}', to_jsonb(v_n));

    DELETE FROM public.equipment WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{equipment_cascade}', to_jsonb(v_n));

    DELETE FROM public.customers WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{customers}', to_jsonb(v_n));

  ELSE
    RAISE EXCEPTION 'Step desconhecido: %', p_step USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'step', p_step,
    'audit_id', p_audit_id,
    'deleted_counts', v_counts
  );
END;
$function$;


-- REVOKE antes do GRANT por lei da casa: "FROM anon" sozinho e insuficiente,
-- porque o privilegio chega por PUBLIC (anon pertence a PUBLIC) e nao como
-- entrada explicita. ACL restaurada identica a que estava em producao antes
-- desta migration (medida com has_function_privilege, nao lendo proacl):
-- anon=false, authenticated=true, service_role=true.
REVOKE ALL ON FUNCTION public.reset_system_step(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_system_step(uuid, text, uuid) TO authenticated, service_role;


-- ===========================================================================
-- PARTE B -- DIVIDA 6: policies anon que agora se sustentam sozinhas
-- ===========================================================================

-- 6a) technician_locations: a policy SEM CONDICAO sai. A policy "via portal"
--     continua (ela tem condicao propria e nao foi pedida nesta rodada);
--     superficie anon das duas e comprovadamente zero hoje.
DROP POLICY IF EXISTS "Public can view technician_locations via shared OS"
  ON public.technician_locations;

-- 6b) quote_items: o token tem que ser o DESTE orcamento.
DROP POLICY IF EXISTS "Public view quote_items via quote" ON public.quote_items;
CREATE POLICY "Public view quote_items via quote"
  ON public.quote_items
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
        FROM public.quotes q
       WHERE q.id = quote_items.quote_id
         AND q.token IS NOT NULL
         AND (
              q.token = nullif(current_setting('request.headers.x-share-token', true), '')
           OR q.token = (nullif(current_setting('request.headers', true), '')::json ->> 'x-share-token')
         )
    )
  );


-- ===========================================================================
-- PARTE C -- DIVIDA 6d: revoga os 32 privilegios MORTOS de anon
--
-- Lista NOMINAL (nao recalculada em tempo de execucao, pra nao revogar algo
-- que nasceu depois e ninguem auditou). Duas travas antes de cada REVOKE:
--   1) a relacao tem que estar com RLS LIGADA. Sem RLS, o GRANT e o unico
--      controle e revogar seria mudanca de comportamento, nao limpeza;
--   2) nao pode existir policy PERMISSIVA alcancando anon ('anon' explicito
--      ou PUBLIC, que inclui anon) naquele comando -- recalculado AGORA, nao
--      na auditoria. Se alguem criou a policy no meio do caminho, o par e
--      PULADO e sai um NOTICE, nunca um portal derrubado.
-- ===========================================================================

DO $$
DECLARE
  -- (relacao, privilegio) concedidos a anon SEM policy que os alcance.
  v_pares text[][] := ARRAY[
    ['blog_categories','DELETE'], ['blog_categories','INSERT'], ['blog_categories','UPDATE'],
    ['blog_post_comments','DELETE'], ['blog_post_comments','UPDATE'],
    ['blog_post_likes','UPDATE'],
    ['blog_posts','DELETE'], ['blog_posts','INSERT'], ['blog_posts','UPDATE'],
    ['form_responses','DELETE'], ['form_responses','SELECT'], ['form_responses','UPDATE'],
    ['nfse_tiers','DELETE'], ['nfse_tiers','INSERT'], ['nfse_tiers','UPDATE'],
    ['proposal_templates','DELETE'], ['proposal_templates','INSERT'], ['proposal_templates','UPDATE'],
    ['quote_items','DELETE'], ['quote_items','INSERT'], ['quote_items','UPDATE'],
    ['quotes','DELETE'], ['quotes','INSERT'],
    ['service_orders','DELETE'], ['service_orders','SELECT'], ['service_orders','UPDATE'],
    ['technician_locations','DELETE'], ['technician_locations','INSERT'], ['technician_locations','UPDATE'],
    ['whatsapp_tiers','DELETE'], ['whatsapp_tiers','INSERT'], ['whatsapp_tiers','UPDATE']
  ];
  v_rel        text;
  v_priv       text;
  v_polchar    "char";
  v_oid        oid;
  v_rls        boolean;
  v_revogados  integer := 0;
  v_pulados    integer := 0;
  i            integer;
BEGIN
  FOR i IN 1 .. array_length(v_pares, 1) LOOP
    v_rel  := v_pares[i][1];
    v_priv := v_pares[i][2];

    v_polchar := CASE v_priv
                   WHEN 'SELECT' THEN 'r'
                   WHEN 'INSERT' THEN 'a'
                   WHEN 'UPDATE' THEN 'w'
                   WHEN 'DELETE' THEN 'd'
                 END;
    IF v_polchar IS NULL THEN
      RAISE EXCEPTION 'privilegio nao previsto na lista: %', v_priv;
    END IF;

    v_oid := to_regclass('public.' || quote_ident(v_rel));
    IF v_oid IS NULL THEN
      RAISE NOTICE 'public.% nao existe mais, par (%,%) ignorado', v_rel, v_rel, v_priv;
      v_pulados := v_pulados + 1;
      CONTINUE;
    END IF;

    -- Nada a fazer se o privilegio ja saiu (reaplicacao da migration).
    IF NOT has_table_privilege('anon', v_oid, v_priv) THEN
      CONTINUE;
    END IF;

    -- Trava 1: RLS ligada.
    SELECT c.relrowsecurity INTO v_rls FROM pg_class c WHERE c.oid = v_oid;
    IF NOT v_rls THEN
      RAISE NOTICE 'public.% esta SEM RLS, revogacao de % abortada nela', v_rel, v_priv;
      v_pulados := v_pulados + 1;
      CONTINUE;
    END IF;

    -- Trava 2: ganhou policy permissiva alcancando anon neste comando?
    IF EXISTS (
      SELECT 1
        FROM pg_policy p
       WHERE p.polrelid = v_oid
         AND p.polpermissive
         AND p.polcmd IN ('*', v_polchar)
         AND (0 = ANY (p.polroles)
              OR EXISTS (SELECT 1 FROM unnest(p.polroles) r
                          WHERE r <> 0 AND pg_get_userbyid(r) = 'anon'))
    ) THEN
      RAISE NOTICE 'public.% ganhou policy anon para %, revogacao abortada nela', v_rel, v_priv;
      v_pulados := v_pulados + 1;
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE %s ON TABLE public.%I FROM anon', v_priv, v_rel);
    v_revogados := v_revogados + 1;
  END LOOP;

  RAISE NOTICE 'privilegio morto de anon revogado em % par(es); % pulado(s)',
    v_revogados, v_pulados;
END $$;


-- ===========================================================================
-- RELATORIO -- achados FORA do alcance desta migration (src/, decisao do Lead)
--
-- 1) REGRESSAO EM PRODUCAO, cliente-facing, nao nossa: "Abrir chamado" no
--    Portal PMOC publico esta quebrado.
--    src/pages/public/PmocPublicPortal.tsx:474 faz
--      supabaseAnon.from('service_orders').insert(...)
--    e o comentario acima da linha cita a policy "Public can create portal
--    tickets", que NAO EXISTE MAIS. Probe com a chave anon real e payload
--    vazio (nao cria linha): 42501 permission denied for table service_orders.
--    O cliente ve o toast de erro. O lado do banco JA tem a substituicao
--    pronta e executavel por anon -- create_contract_portal_ticket(text,text)
--    e create_customer_portal_ticket(text,text,text,uuid) -- mas NENHUM
--    arquivo de src/ chama nenhuma das duas (grep: 0 ocorrencias). Falta so o
--    lado do cliente trocar o insert pela RPC. Correcao e em src/, fora do
--    meu escopo.
--
-- 2) Mapa de rastreio publico nao mostra o tecnico pro cliente anonimo.
--    src/components/schedule/PublicTrackingMap.tsx:59 le technician_locations
--    com o client `supabase` (anon, sem sessao) em vez da RPC -- e essa
--    leitura devolve 42501 hoje (ver medicao da 6a). O endereco do cliente na
--    mesma tela ja vem por get_public_os. Conserto proprio: devolver a ultima
--    posicao dentro de get_public_os e trocar o fetch -- RPC nova + src/.
--    Enquanto nao for feito, nao existe caminho anon legitimo pra essa tabela,
--    o que e justamente por que o DROP da 6a nao regride nada.
--
-- 3) blog_post_likes: policy "Anyone can delete own likes" e DELETE para
--    {public} com USING (true), e anon tem o GRANT de DELETE (preservado aqui
--    de proposito, porque TEM policy). Na pratica anon pode apagar QUALQUER
--    like do blog, nao so o seu -- a tabela tem session_id e o predicado nao
--    o usa. Dado de engajamento de blog publico, severidade baixa; apertar
--    pra session_id exigiria saber como o client identifica a sessao, entao
--    fica como achado para o Lead decidir.
--
-- 4) company_settings tem 1 linha com company_id NULL (63 empresas, 64
--    linhas). Pre-existente, nao tocada: todo UPDATE da Parte A e escopado em
--    company_id = p_company_id.
-- ===========================================================================

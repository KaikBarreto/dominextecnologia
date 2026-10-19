-- ===========================================================================
-- "Zerar Sistema" aprende o PDV  (step 'pdv')
--
-- Pedido por: 🛡️ Dev Plataforma & Multi-tenant (18/10/2026)
-- Executor:   🗄️ Dev Database (este arquivo e a migration pronta)
-- Arquivo: supabase/migrations/20261018173000_pdv_zerar_sistema_step_e_valvula.sql
--   (o timestamp 20261018170000 sugerido JA estava ocupado por
--    `importacao_financeira_vencimento`, aplicada por outra sessao sem arquivo
--    neste worktree; 171000 e 172000 foram usados pelas migrations de GRANT de
--    `anon`. Usar timestamp ocupado faz o `db push` pular a migration PRA
--    SEMPRE, porque o historico do CLI e a fonte da verdade.)
--
-- REVISAO DO DEV DATABASE antes de aplicar (18/10/2026), tudo medido em prod:
--   1) DIFF contra a definicao VIVA (pg_get_functiondef), nao contra a migration
--      de origem: o arquivo e ADICAO PURA. 88 linhas novas (branch 'pdv' + o
--      DELETE de pdv_barcode_counters no 'materials'), zero alteracao no resto.
--      O guard de permissao do topo (super_admin OU admin da propria empresa)
--      fica intacto, e `anon` nao executa a funcao.
--   2) VALVULA: set_config(..., is_local => true) comprovadamente NAO sobrevive
--      ao COMMIT. Teste com controle na MESMA conexao: com is_local=true, o
--      current_setting depois do COMMIT volta vazio; com is_local=false, volta
--      'empresa-X'. E `app.pdv_purge_company` nao e alcancavel pelo PostgREST:
--      `set_config` e `current_setting` vivem em pg_catalog e dao 404/PGRST202
--      no /rest/v1/rpc, e TODAS as 8 funcoes do schema public que chamam
--      set_config usam nome de GUC LITERAL, nenhuma aceita o nome por
--      parametro, entao nao ha como mirar essa chave de fora.
--   3) ORDEM: confirmada contra as FKs reais, e ela nao e so preferivel, e
--      FORCADA. pdv_cash_sessions.terminal_id e pdv_orders.terminal_id sao
--      NO ACTION, e pdv_orders.cash_session_id tambem: terminal e sessao NAO
--      PODEM sair antes de pedido. Fiado antes de pedido porque
--      customer_credit_ledger.order_id e SET NULL (apagar o pedido primeiro
--      viraria divida orfa, nao divida apagada). E o step 'pdv' antes de
--      financial_movements/stock/materials/customers porque
--      pdv_order_payments.financial_transaction_id, pdv_cash_movements.
--      financial_transaction_id, customer_credit_ledger.financial_transaction_id,
--      pdv_order_items.inventory_id, pdv_orders.customer_id, pdv_orders.stock_id,
--      pdv_terminals.stock_id e pdv_order_payments.financial_account_id sao
--      todos SET NULL: rodar o financeiro antes REESCREVERIA o livro-razao do
--      PDV em vez de apaga-lo. O pipeline do front (RESET_PIPELINE em
--      src/hooks/useResetSystem.ts) ja chama os steps nessa mesma ordem.
--
-- PROBLEMA: reset_system_step enumera tabela por tabela e nao conhece as 9
-- tabelas da Onda 1 do PDV. Hoje o tenant manda zerar, a tela diz que zerou, e
-- venda, caixa e fiado do cliente continuam no banco. Falha silenciosa em
-- recurso destrutivo.
--
-- O QUE ENTRA:
--   1) Valvula nominal e transacional no gatilho tg_pdv_orders_block_delete,
--      sem a qual o step aborta no primeiro pedido pago (medido: 42501).
--   2) Branch ELSIF p_step = 'pdv' no reset_system_step, entre 'custom_configs'
--      e 'financial_movements'.
--   3) DELETE de pdv_barcode_counters no branch 'materials' (NAO no 'pdv').
--
-- JA MEDIDO EM PRODUCAO, em transacao revertida, contra o schema real:
--   • sem a valvula: step aborta com 42501 no pedido nº 847 pago
--   • com a valvula: as 8 tabelas do expurgo vao a zero; empresa, catalogo,
--     clientes e pdv_barcode_counters sobrevivem; o GUC nao vaza
--   • step 'materials' depois: inventory 1->0 e pdv_barcode_counters 1->0
--   • 'Step desconhecido' continua recusado (22023)
--
-- O FRONT JA ESTA PRONTO E ESPERA ESTE SQL (release atual):
--   src/hooks/useResetSystem.ts        -> flag `delete_pdv`, step 'pdv'
--   src/components/settings/ResetSystemDialog.tsx -> grupo "PDV e Loja"
--   src/lib/i18n/messages/app/settings.ts -> rotulos nos 4 idiomas
-- Ordem de deploy: este SQL PRIMEIRO (adicionar um ELSIF nao endurece contrato
-- nenhum, o front antigo nao chama 'pdv'), o front depois no push.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Valvula de expurgo no bloqueio de DELETE de pedido fechado.
--
-- Por que precisa: tg_pdv_orders_block_delete recusa apagar pedido fora do
-- rascunho. Isso existe pra o operador nao sumir com venda paga pelo
-- PostgREST (RLS negando DELETE devolveria 204 silencioso, por isso a regra
-- vive em gatilho). O expurgo legitimo precisa de uma porta nomeada.
--
-- Por que NOMINAL + TRANSACIONAL (e nao "valvula de owner"):
--   • set_config(..., is_local => true) morre no fim da transacao;
--   • o gatilho so libera quando o GUC bate com a company_id DA LINHA, ou
--     seja, libera uma empresa, nao a tabela;
--   • nao da pra contrabandear pelo PostgREST: set_config vive em pg_catalog
--     (schema nao exposto) e cada request e uma transacao propria;
--   • pg_has_role(current_user,'postgres','MEMBER') NAO serve aqui: este
--     gatilho e SECURITY DEFINER com owner postgres, entao current_user e
--     SEMPRE postgres dentro dele e a checagem ficaria INERTE (foi o que
--     matou o guard de presenca de 22/07 a 30/09/2026). E valvula de owner
--     liberaria apagar venda paga pra QUALQUER RPC SECURITY DEFINER.
--
-- A valvula de cascade que ja existia (empresa inexistente) fica onde esta:
-- ela e o que faz admin_delete_company passar, e foi medida funcionando.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pdv_block_delete_of_closed_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Valvula do CASCADE de exclusao de empresa (admin_delete_company).
  IF NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = OLD.company_id) THEN
    RETURN OLD;
  END IF;

  -- Valvula do expurgo do "Zerar Sistema" (reset_system_step, step 'pdv').
  -- Nominal: libera somente a empresa nomeada no GUC, somente nesta transacao.
  IF coalesce(current_setting('app.pdv_purge_company', true), '') = OLD.company_id::text THEN
    RETURN OLD;
  END IF;

  IF OLD.status <> 'rascunho' THEN
    RAISE EXCEPTION 'Pedido nº % não pode ser excluído porque já saiu do rascunho. Cancele o pedido (o cancelamento estorna estoque e financeiro e preserva o histórico).', OLD.number
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END
$function$;

COMMENT ON FUNCTION public.pdv_block_delete_of_closed_order() IS
  'Recusa DELETE de pedido do PDV fora do rascunho (cancelar e status, nao exclusao). Duas valvulas: empresa inexistente (cascade de admin_delete_company) e GUC app.pdv_purge_company igual a company_id da linha (expurgo do Zerar Sistema, transaction-local).';

-- ---------------------------------------------------------------------------
-- 2) reset_system_step com o branch 'pdv' + contador de codigo de barras no
--    branch 'materials'. Definicao COMPLETA (a funcao e monolitica).
-- ---------------------------------------------------------------------------
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
    );
    v_counts := jsonb_set(v_counts, '{financial_accounts_recreated}', to_jsonb(1));

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
$function$
;

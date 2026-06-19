-- =====================================================================
-- Migration: Zerar Sistema — incluir o módulo de Compras no step 'materials'
-- Autor: dev-database (despachado pelo Tech Lead)
--
-- Por quê:
--   O módulo novo de Compras (compras / compra_materiais / compra_cotacoes /
--   compra_cotacao_precos — migration 20260619180000) NÃO era apagado pelo
--   reset_system_step. Resultado: um "Zerar Sistema" deixava compras órfãs.
--   Pior, compra_materiais.inventory_id é ON DELETE SET NULL, então mesmo
--   apagando o estoque (step 'materials' deleta public.inventory) a compra
--   sobrevivia, só perdendo o vínculo com o material.
--
-- O que muda:
--   Step 'materials' passa a apagar public.compras do tenant ANTES de apagar
--   public.inventory. O CASCADE da raiz `compras` cobre compra_materiais,
--   compra_cotacoes e compra_cotacao_precos — basta deletar `compras`.
--   (Ordem irrelevante de fato, pois inventory_id é SET NULL; deletamos antes
--   por clareza.)
--
-- suppliers NÃO entra em nenhum step (ver recomendação no relatório). É
-- cadastro de fornecedor, não estoque/consumo — segue o mesmo critério que já
-- preserva equipment-catalog/cadastros e que a própria migration 20260619180000
-- adotou ("suppliers NÃO é dropada").
--
-- Assinatura INALTERADA: reset_system_step(p_company_id uuid, p_step text,
-- p_audit_id uuid). Frontend (useResetSystem.ts) segue chamando os 3 args.
-- NÃO precisa regenerar types.ts.
--
-- Corpo dos demais steps é idêntico à versão vigente (hotfix
-- 20260524035423). Único delta: bloco de compras dentro do step 'materials'.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.reset_system_step(
  p_company_id uuid,
  p_step text,
  p_audit_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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

    DELETE FROM public.cost_resource_items
      WHERE resource_id IN (
        SELECT id FROM public.cost_resources WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{cost_resource_items}', to_jsonb(v_n));

    DELETE FROM public.cost_resources WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{cost_resources}', to_jsonb(v_n));

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
$$;

GRANT EXECUTE ON FUNCTION public.reset_system_step(uuid, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.reset_system_step(uuid, text, uuid) IS
  'Executa UM step do reset_system (idempotente). Step ''materials'' agora apaga tambem public.compras (CASCADE cobre compra_materiais/compra_cotacoes/compra_cotacao_precos). suppliers NAO e apagado.';

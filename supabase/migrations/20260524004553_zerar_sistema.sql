-- =====================================================================
-- Migration: Zerar Sistema (paridade EcoSistema)
-- Autor: dev-database (despachado pelo Tech Lead)
-- Plano: docs/planos/2026-05-23-zerar-sistema.md
--
-- Entregas:
--   1) Tabela destructive_actions_audit (com RLS, sem INSERT policy)
--   2) RPC reset_system_audit_start  (audita e retorna audit_id)
--   3) RPC reset_system_step          (executa um step, retorna deleted_counts)
--
-- Helpers de auth usados:
--   - has_role(auth.uid(), 'super_admin'::app_role)  (equivalente a isMaster)
--   - has_role(auth.uid(), 'admin'::app_role)        (admin do tenant)
--   NOTA: is_master_admin() NAO existe no schema do Dominex. Usamos
--   has_role(..., 'super_admin'::app_role) em todos os locais.
--
-- Notas de schema:
--   - financial_accounts NAO tem coluna 'is_default'; usamos sort_order=0
--     e is_active=true para a Caixa Geral recriada.
--   - contract_health_status e uma VIEW, NAO uma tabela — NAO deletamos dela.
--   - pmoc_schedules NAO tem company_id direto; filtramos via contract_id.
--   - salesperson_advances/payments NAO tem company_id (sao globais da Auctus);
--     pulamos no step employees. Mantemos apenas salesperson_sales (que tem
--     company_id) — checar com Tech Lead se faz sentido apagar comissoes.
--   - service_costs/materials/gifts/cost_resource_items sao catalogos por
--     service_type, nao consumos de OS individual. Mantivemos no step
--     service_orders conforme plano original — filtram por company_id.
-- =====================================================================

-- =====================================================================
-- 1) TABELA destructive_actions_audit
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.destructive_actions_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  company_name_snapshot text,
  company_email_snapshot text,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_email text,
  performed_by_role text,
  action_type text NOT NULL CHECK (action_type IN ('reset_system')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_destructive_audit_company
  ON public.destructive_actions_audit (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_destructive_audit_user
  ON public.destructive_actions_audit (performed_by, created_at DESC);

ALTER TABLE public.destructive_actions_audit ENABLE ROW LEVEL SECURITY;

-- Policy de leitura: super_admin (Auctus) OU admin do mesmo tenant.
DROP POLICY IF EXISTS "select_own_company_or_master" ON public.destructive_actions_audit;
CREATE POLICY "select_own_company_or_master"
  ON public.destructive_actions_audit
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      AND public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

-- service_role full access (edge functions / supabase internals)
DROP POLICY IF EXISTS "service_role_full_access_destructive_audit"
  ON public.destructive_actions_audit;
CREATE POLICY "service_role_full_access_destructive_audit"
  ON public.destructive_actions_audit
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- SEM policy de INSERT/UPDATE/DELETE para authenticated.
-- Insercao acontece apenas via RPC SECURITY DEFINER.

COMMENT ON TABLE public.destructive_actions_audit IS
  'Log imutavel de acoes destrutivas (reset_system). Insercao apenas via RPC SECURITY DEFINER.';


-- =====================================================================
-- 2) RPC reset_system_audit_start
-- =====================================================================
-- Verifica permissao, captura snapshot do contexto e cria 1 row na audit.
-- Retorna o audit_id pra ser usado nos steps seguintes.

CREATE OR REPLACE FUNCTION public.reset_system_audit_start(
  p_company_id uuid,
  p_options jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_audit_id uuid;
  v_user_id uuid := auth.uid();
  v_is_master boolean;
  v_is_tenant_admin boolean;
  v_company_name text;
  v_company_email text;
  v_user_email text;
  v_user_role text;
BEGIN
  -- Validacao basica
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa nao informada.' USING ERRCODE = '22023';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sem permissao pra zerar o sistema (sessao nao autenticada).'
      USING ERRCODE = '42501';
  END IF;

  -- Permissao: super_admin global OU admin do tenant alvo
  v_is_master := public.has_role(v_user_id, 'super_admin'::public.app_role);

  IF v_is_master THEN
    v_user_role := 'super_admin';
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_user_id
        AND ur.role = 'admin'::public.app_role
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_user_id
        AND p.company_id = p_company_id
    )
    INTO v_is_tenant_admin;

    IF NOT v_is_tenant_admin THEN
      RAISE EXCEPTION 'Sem permissao pra zerar o sistema (apenas o administrador da empresa pode).'
        USING ERRCODE = '42501';
    END IF;

    v_user_role := 'admin';
  END IF;

  -- Snapshots
  SELECT c.name, c.email INTO v_company_name, v_company_email
  FROM public.companies c WHERE c.id = p_company_id;

  SELECT u.email INTO v_user_email FROM auth.users u WHERE u.id = v_user_id;

  -- Insere row de auditoria (SECURITY DEFINER contorna ausencia de policy INSERT)
  INSERT INTO public.destructive_actions_audit (
    company_id,
    company_name_snapshot,
    company_email_snapshot,
    performed_by,
    performed_by_email,
    performed_by_role,
    action_type,
    payload
  ) VALUES (
    p_company_id,
    v_company_name,
    v_company_email,
    v_user_id,
    v_user_email,
    v_user_role,
    'reset_system',
    COALESCE(p_options, '{}'::jsonb)
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_system_audit_start(uuid, jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.reset_system_audit_start(uuid, jsonb) IS
  'Inicia uma sessao de reset_system: valida permissao, captura snapshot e cria audit row. Retorna audit_id.';


-- =====================================================================
-- 3) RPC reset_system_step
-- =====================================================================
-- Executa UM step (filtrado por p_step). Idempotente. Retorna jsonb com
-- { step, deleted_counts: { tabela: N, ... } }.
--
-- Steps esperados (ordem do frontend respeitando FKs):
--   service_orders, contracts, quotes, equipment, custom_configs,
--   financial_movements, financial_categories, employees, stock,
--   materials, customers

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
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_user_id
        AND ur.role = 'admin'::public.app_role
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_user_id
        AND p.company_id = p_company_id
    )
    INTO v_is_tenant_admin;

    IF NOT v_is_tenant_admin THEN
      RAISE EXCEPTION 'Sem permissao pra zerar o sistema (apenas o administrador da empresa pode).'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ============================================================
  -- STEPS
  -- ============================================================

  IF p_step = 'service_orders' THEN
    -- Filhos primeiro
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

    -- Catalogos por company (service_costs/materials/gifts sao por service_type,
    -- mas tem company_id direto e o plano pediu para ir junto com OS).
    DELETE FROM public.service_costs WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{service_costs}', to_jsonb(v_n));

    DELETE FROM public.service_materials WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{service_materials}', to_jsonb(v_n));

    -- service_gifts NAO tem company_id direto; filtra via service_id -> service_types
    DELETE FROM public.service_gifts
      WHERE service_id IN (
        SELECT id FROM public.service_types WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{service_gifts}', to_jsonb(v_n));

    -- cost_resource_items via cost_resources(company_id)
    DELETE FROM public.cost_resource_items
      WHERE resource_id IN (
        SELECT id FROM public.cost_resources WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{cost_resource_items}', to_jsonb(v_n));

    -- inventory_movements.service_order_id e SET NULL automatico, mas
    -- nullify explicitamente pra ficar consistente nos counts.
    UPDATE public.inventory_movements SET service_order_id = NULL
      WHERE service_order_id IN (
        SELECT id FROM public.service_orders WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{inventory_movements_nullified}', to_jsonb(v_n));

    -- Pmoc schedules e contract_occurrences apontam pra service_orders com SET NULL;
    -- deixa o DELETE seguinte cuidar.

    -- Finalmente: service_orders
    DELETE FROM public.service_orders WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{service_orders}', to_jsonb(v_n));

  ELSIF p_step = 'contracts' THEN
    -- PMOC docs custom (FK -> contracts)
    DELETE FROM public.pmoc_contract_documents_custom WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{pmoc_contract_documents_custom}', to_jsonb(v_n));

    DELETE FROM public.pmoc_documents WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{pmoc_documents}', to_jsonb(v_n));

    -- pmoc_schedules nao tem company_id; filtra via contract_id
    DELETE FROM public.pmoc_schedules
      WHERE contract_id IN (
        SELECT id FROM public.contracts WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{pmoc_schedules}', to_jsonb(v_n));

    -- contract_occurrences (FK -> contracts; sem company_id direto)
    DELETE FROM public.contract_occurrences
      WHERE contract_id IN (
        SELECT id FROM public.contracts WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{contract_occurrences}', to_jsonb(v_n));

    -- contract_items (FK -> contracts)
    DELETE FROM public.contract_items
      WHERE contract_id IN (
        SELECT id FROM public.contracts WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{contract_items}', to_jsonb(v_n));

    -- NOTA: contract_health_status e VIEW, NAO deletamos.

    -- Nullify FKs em service_orders.contract_id (NO ACTION default)
    -- pra permitir DELETE de contracts mesmo se OS nao foi marcada.
    UPDATE public.service_orders SET contract_id = NULL
      WHERE contract_id IN (
        SELECT id FROM public.contracts WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{service_orders_contract_nullified}', to_jsonb(v_n));

    -- Nullify FKs em financial_transactions.contract_id (SET NULL ja, mas explicito)
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
    -- service_orders.equipment_id e SET NULL; deixa cascadear.
    -- contract_items.equipment_id e SET NULL (provavelmente); idem.
    DELETE FROM public.equipment WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{equipment}', to_jsonb(v_n));

  ELSIF p_step = 'custom_configs' THEN
    -- form_responses nao tem company_id direto; se step service_orders nao rodou,
    -- pode haver responses orfas. Apaga via question_id.
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

    -- cost_resource_items filhos (idempotente se ja rodou em service_orders)
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

    -- Recria Caixa Geral default
    INSERT INTO public.financial_accounts (
      company_id, name, type, initial_balance, is_active, sort_order, color, icon
    ) VALUES (
      p_company_id, 'Caixa Geral', 'caixa', 0, true, 0, '#3b82f6', 'Landmark'
    );
    v_counts := jsonb_set(v_counts, '{financial_accounts_recreated}', to_jsonb(1));

  ELSIF p_step = 'financial_categories' THEN
    -- Apaga apenas categorias custom (is_system=false ou NULL).
    -- Categorias system geralmente tem company_id NULL (globais) e nao serao tocadas
    -- pelo filtro de company_id; mesmo assim, dupla protecao com is_system.
    DELETE FROM public.financial_categories
      WHERE company_id = p_company_id
        AND COALESCE(is_system, false) = false;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{financial_categories}', to_jsonb(v_n));

  ELSIF p_step = 'employees' THEN
    -- Filhos de employees
    DELETE FROM public.time_sheets WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{time_sheets}', to_jsonb(v_n));

    DELETE FROM public.time_records WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{time_records}', to_jsonb(v_n));

    DELETE FROM public.time_schedules WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{time_schedules}', to_jsonb(v_n));

    -- salesperson_sales tem company_id; advances/payments NAO tem (sao globais).
    -- Apagamos so o que tem company_id pra nao corromper vendedores Auctus.
    DELETE FROM public.salesperson_sales WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{salesperson_sales}', to_jsonb(v_n));
    -- salesperson_advances e salesperson_payments: pulados (sem company_id direto).
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

    -- employee_movements (filtra via employee)
    DELETE FROM public.employee_movements
      WHERE employee_id IN (
        SELECT id FROM public.employees WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{employee_movements}', to_jsonb(v_n));

    DELETE FROM public.time_settings WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{time_settings}', to_jsonb(v_n));

    -- Nullify FK financial_transactions.employee_id (provavelmente SET NULL ja)
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
    -- Zera movimentacoes mantendo o cadastro
    DELETE FROM public.inventory_movements
      WHERE inventory_id IN (
        SELECT id FROM public.inventory WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{inventory_movements}', to_jsonb(v_n));

  ELSIF p_step = 'materials' THEN
    -- inventory CASCADE em inventory_movements; idempotente se 'stock' ja rodou.
    DELETE FROM public.inventory WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{inventory}', to_jsonb(v_n));

  ELSIF p_step = 'customers' THEN
    -- Antes de apagar customers, garantir que dependentes NOT NULL/RESTRICT foram limpos.
    -- service_orders.customer_id = NOT NULL RESTRICT
    -- contracts.customer_id     = NOT NULL (NO ACTION default)
    -- equipment.customer_id     = NOT NULL CASCADE (cascade automatico)
    -- leads.customer_id         = CASCADE (cascade automatico)
    -- customer_contacts/portals/etc = CASCADE
    -- financial_transactions.customer_id = SET NULL (cascade automatico)
    --
    -- Se o usuario nao marcou OS/contratos, ainda assim precisamos eliminar
    -- referencias bloqueantes pra honrar "zerar clientes" — DELETE em cascata
    -- defensiva sobre service_orders e contracts deste tenant.

    -- Limpa PMOC docs/schedules/occurrences orfaos (se contracts ainda existir)
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

    -- Limpa filhos de service_orders orfaos (se SOs ainda existir)
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

    -- Nullify FK customer_id em financial_transactions (SET NULL ja, mas explicito)
    UPDATE public.financial_transactions SET customer_id = NULL
      WHERE customer_id IN (
        SELECT id FROM public.customers WHERE company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{financial_transactions_customer_nullified}', to_jsonb(v_n));

    -- Agora pode deletar contratos/SOs (libera RESTRICT do customer_id)
    DELETE FROM public.service_orders WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{service_orders_cascade}', to_jsonb(v_n));

    DELETE FROM public.contracts WHERE company_id = p_company_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{contracts_cascade}', to_jsonb(v_n));

    -- Agora os customers (CASCADE em equipment/leads/customer_contacts/portals)
    DELETE FROM public.lead_interactions
      WHERE lead_id IN (
        SELECT l.id FROM public.leads l
        JOIN public.customers c ON c.id = l.customer_id
        WHERE c.company_id = p_company_id
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := jsonb_set(v_counts, '{lead_interactions}', to_jsonb(v_n));

    -- leads.customer_id = CASCADE; mesmo assim apaga leads do tenant por completude
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
  'Executa UM step do reset_system (idempotente). p_step in {service_orders, contracts, quotes, equipment, custom_configs, financial_movements, financial_categories, employees, stock, materials, customers}.';

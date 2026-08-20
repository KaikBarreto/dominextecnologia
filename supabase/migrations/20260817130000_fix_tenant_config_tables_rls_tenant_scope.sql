-- =============================================================================
-- Fix RLS em lote: tabelas de config/catálogo por tenant — tenant scope no management
-- =============================================================================
--
-- Mesmo furo do incidente `equipment_field_config` (migration 20260817120000):
-- a policy `FOR ALL` "System managers can manage <tabela>" checava APENAS
-- `can_manage_system(auth.uid())` SEM filtrar `company_id`. Como ALL vale também
-- pra SELECT e é PERMISSIVA (OR com a SELECT companion), todo admin/gestor lia
-- (e podia editar/apagar) o catálogo de config de TODAS as empresas — vazamento
-- cross-tenant confirmado na auditoria.
--
-- Auditoria encontrou o MESMO padrão nestas 7 tabelas (todas com coluna
-- `company_id` confirmada via information_schema, e todas com uma SELECT
-- companion tenant-scoped correta que é PRESERVADA):
--   1. company_settings
--   2. crm_stages
--   3. customer_origins
--   4. equipment_categories
--   5. os_statuses
--   6. service_types
--   7. task_types
--
-- Fix (mesmo predicado ratificado pelo Plataforma na 20260817120000):
--   amarra o management ao `company_id` do tenant, preservando o bypass do
--   super_admin Auctus (is_super_admin) no USING e no WITH CHECK.
--
-- NÃO toca nas policies SELECT dedicadas (já tenant-scoped e corretas).
--
-- Idempotente: DROP POLICY IF EXISTS antes do CREATE POLICY.
-- =============================================================================

BEGIN;

-- 1. company_settings ---------------------------------------------------------
DROP POLICY IF EXISTS "System managers can manage company_settings" ON public.company_settings;
CREATE POLICY "System managers can manage company_settings"
  ON public.company_settings
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.can_manage_system(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.can_manage_system(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  );

-- 2. crm_stages ---------------------------------------------------------------
DROP POLICY IF EXISTS "System managers can manage crm_stages" ON public.crm_stages;
CREATE POLICY "System managers can manage crm_stages"
  ON public.crm_stages
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.can_manage_system(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.can_manage_system(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  );

-- 3. customer_origins ---------------------------------------------------------
DROP POLICY IF EXISTS "System managers can manage customer_origins" ON public.customer_origins;
CREATE POLICY "System managers can manage customer_origins"
  ON public.customer_origins
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.can_manage_system(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.can_manage_system(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  );

-- 4. equipment_categories -----------------------------------------------------
DROP POLICY IF EXISTS "System managers can manage equipment_categories" ON public.equipment_categories;
CREATE POLICY "System managers can manage equipment_categories"
  ON public.equipment_categories
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.can_manage_system(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.can_manage_system(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  );

-- 5. os_statuses --------------------------------------------------------------
DROP POLICY IF EXISTS "System managers can manage os_statuses" ON public.os_statuses;
CREATE POLICY "System managers can manage os_statuses"
  ON public.os_statuses
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.can_manage_system(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.can_manage_system(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  );

-- 6. service_types ------------------------------------------------------------
DROP POLICY IF EXISTS "System managers can manage service_types" ON public.service_types;
CREATE POLICY "System managers can manage service_types"
  ON public.service_types
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.can_manage_system(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.can_manage_system(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  );

-- 7. task_types ---------------------------------------------------------------
DROP POLICY IF EXISTS "System managers can manage task_types" ON public.task_types;
CREATE POLICY "System managers can manage task_types"
  ON public.task_types
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.can_manage_system(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.can_manage_system(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()))
  );

-- -----------------------------------------------------------------------------
-- Audit pós-fix: pra cada policy recriada, garante que USING e WITH CHECK
-- carregam o filtro `company_id` (aborta a transação inteira senão).
-- -----------------------------------------------------------------------------

DO $audit$
DECLARE
  v_tbl        text;
  v_policy     text;
  v_qual       text;
  v_with_check text;
  v_tables     text[] := ARRAY[
    'company_settings',
    'crm_stages',
    'customer_origins',
    'equipment_categories',
    'os_statuses',
    'service_types',
    'task_types'
  ];
BEGIN
  RAISE NOTICE '======================================';
  RAISE NOTICE 'FIX RLS tenant-scope — config tables:';
  FOREACH v_tbl IN ARRAY v_tables LOOP
    v_policy := 'System managers can manage ' || v_tbl;

    SELECT qual, with_check
      INTO v_qual, v_with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = v_tbl
        AND policyname = v_policy;

    RAISE NOTICE '  [%] USING: % | WITH CHECK: %', v_tbl, v_qual, v_with_check;

    IF v_qual IS NULL THEN
      RAISE EXCEPTION 'Policy "%" not found after CREATE.', v_policy;
    END IF;
    IF v_qual NOT LIKE '%company_id%' OR v_with_check NOT LIKE '%company_id%' THEN
      RAISE EXCEPTION 'Policy "%" is NOT tenant-scoped (missing company_id in USING/WITH CHECK).', v_policy;
    END IF;
  END LOOP;
  RAISE NOTICE '======================================';
END $audit$;

COMMIT;

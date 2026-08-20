-- =============================================================================
-- Fix RLS: equipment_field_config — tenant scope no management
-- =============================================================================
--
-- Vazamento entre tenants confirmado: a policy `FOR ALL` "System managers can
-- manage equipment_field_config" checava APENAS `can_manage_system(auth.uid())`
-- sem filtrar `company_id`. Como ALL vale também pra SELECT, todo admin/gestor
-- lia (e podia mexer em) o catálogo de campos customizados de TODAS as empresas.
--
-- Mesmo tipo de fix da migration 20260523180000 (form_templates/form_questions):
-- amarra o management ao `company_id` do tenant, preservando o bypass do
-- super_admin Auctus (is_super_admin) no USING e no WITH CHECK.
--
-- NÃO toca na policy SELECT dedicada "Users view own company
-- equipment_field_config" (já tenant-scoped e correta).
--
-- Idempotente: DROP POLICY IF EXISTS antes do CREATE POLICY.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "System managers can manage equipment_field_config" ON public.equipment_field_config;

CREATE POLICY "System managers can manage equipment_field_config"
  ON public.equipment_field_config
  FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.can_manage_system(auth.uid())
      AND company_id = public.get_user_company_id(auth.uid())
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.can_manage_system(auth.uid())
      AND company_id = public.get_user_company_id(auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- Audit pós-fix: garante que a policy foi recriada com predicado tenant-scoped.
-- -----------------------------------------------------------------------------

DO $audit$
DECLARE
  v_qual       text;
  v_with_check text;
BEGIN
  SELECT qual, with_check
    INTO v_qual, v_with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'equipment_field_config'
      AND policyname = 'System managers can manage equipment_field_config';

  RAISE NOTICE '======================================';
  RAISE NOTICE 'FIX RLS equipment_field_config:';
  RAISE NOTICE '  USING      : %', v_qual;
  RAISE NOTICE '  WITH CHECK : %', v_with_check;
  RAISE NOTICE '======================================';

  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'Policy "System managers can manage equipment_field_config" not found after CREATE.';
  END IF;
  IF v_qual NOT LIKE '%company_id%' OR v_with_check NOT LIKE '%company_id%' THEN
    RAISE EXCEPTION 'Policy predicate is NOT tenant-scoped (missing company_id in USING/WITH CHECK).';
  END IF;
END $audit$;

COMMIT;

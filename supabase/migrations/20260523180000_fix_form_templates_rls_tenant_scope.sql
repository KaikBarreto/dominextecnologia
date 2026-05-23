-- =============================================================================
-- Fix RLS: form_templates / form_questions — tenant scope no management
-- =============================================================================
--
-- Bug latente descoberto na auditoria da Onda D (PMOC v1.9.x):
--
-- As policies "System managers can manage form_templates" e
-- "System managers can manage form_questions" (criadas em 20260308210630)
-- usam `FOR ALL` checando APENAS `can_manage_system(auth.uid())` — sem
-- filtrar `company_id`. Isso significa que, hoje, um admin/gestor do
-- tenant A pode dar UPDATE/DELETE em template ou pergunta do tenant B
-- se descobrir o UUID. As policies SELECT já estão tenant-scoped
-- (vide migration 20260418163700: "Users view own company form_*").
--
-- Esta migration **substitui** as policies de management para amarrar
-- também ao `company_id` do tenant — sem perder o caminho de
-- super_admin. Não toca nas policies SELECT (já corretas), nem nas
-- policies anon (Public view via OS portal / shared OS) que pertencem
-- à camada de portal público (Onda C).
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE POLICY.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. form_templates — management amarrado a company_id
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "System managers can manage form_templates" ON public.form_templates;
DROP POLICY IF EXISTS "Managers manage own company form_templates" ON public.form_templates;

CREATE POLICY "Managers manage own company form_templates"
  ON public.form_templates
  FOR ALL
  TO authenticated
  USING (
    (
      company_id = public.get_user_company_id(auth.uid())
      AND public.can_manage_system(auth.uid())
    )
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    (
      company_id = public.get_user_company_id(auth.uid())
      AND public.can_manage_system(auth.uid())
    )
    OR public.is_super_admin(auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 2. form_questions — management amarrado ao company_id do template pai
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "System managers can manage form_questions" ON public.form_questions;
DROP POLICY IF EXISTS "Managers manage own company form_questions" ON public.form_questions;

CREATE POLICY "Managers manage own company form_questions"
  ON public.form_questions
  FOR ALL
  TO authenticated
  USING (
    (
      EXISTS (
        SELECT 1 FROM public.form_templates ft
        WHERE ft.id = form_questions.template_id
          AND ft.company_id = public.get_user_company_id(auth.uid())
      )
      AND public.can_manage_system(auth.uid())
    )
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.form_templates ft
        WHERE ft.id = form_questions.template_id
          AND ft.company_id = public.get_user_company_id(auth.uid())
      )
      AND public.can_manage_system(auth.uid())
    )
    OR public.is_super_admin(auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 3. Audit pós-fix
-- -----------------------------------------------------------------------------

DO $audit$
DECLARE
  v_old_templates int;
  v_old_questions int;
  v_new_templates int;
  v_new_questions int;
BEGIN
  SELECT count(*) INTO v_old_templates
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'form_templates'
      AND policyname = 'System managers can manage form_templates';

  SELECT count(*) INTO v_old_questions
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'form_questions'
      AND policyname = 'System managers can manage form_questions';

  SELECT count(*) INTO v_new_templates
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'form_templates'
      AND policyname = 'Managers manage own company form_templates';

  SELECT count(*) INTO v_new_questions
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'form_questions'
      AND policyname = 'Managers manage own company form_questions';

  RAISE NOTICE '======================================';
  RAISE NOTICE 'FIX RLS form_templates / form_questions:';
  RAISE NOTICE '  Old "System managers can manage form_templates" remaining: %', v_old_templates;
  RAISE NOTICE '  Old "System managers can manage form_questions" remaining: %', v_old_questions;
  RAISE NOTICE '  New "Managers manage own company form_templates" created:  %', v_new_templates;
  RAISE NOTICE '  New "Managers manage own company form_questions" created:  %', v_new_questions;
  RAISE NOTICE '======================================';

  IF v_old_templates > 0 OR v_old_questions > 0 THEN
    RAISE EXCEPTION 'Old vulnerable policies still exist — DROP failed.';
  END IF;
  IF v_new_templates = 0 OR v_new_questions = 0 THEN
    RAISE EXCEPTION 'New tenant-scoped policies were NOT created.';
  END IF;
END $audit$;

COMMIT;

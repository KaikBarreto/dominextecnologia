-- =============================================================================
-- Menor privilegio no painel master: empresas e modulos
-- =============================================================================
-- A migration de hardening consolidou a semantica historica de companies, na
-- qual qualquer linha em admin_permissions liberava UPDATE global. Isso inclui
-- permissoes sem relacao com empresas (por exemplo, admin_crm) e permitiria
-- alterar billing, quotas e entitlements via REST direto.
--
-- Ao mesmo tempo, admin_empresas podia escrever company_modules sem poder ler
-- o estado atual. O formulario precisa dessa leitura para calcular o diff; sem
-- ela, pode tentar duplicar uma linha UNIQUE ou deixar modulo antigo habilitado.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

DROP POLICY IF EXISTS "Admin users can update companies" ON public.companies;
DROP POLICY IF EXISTS "Company admins can update companies" ON public.companies;

CREATE POLICY "Company admins can update companies"
  ON public.companies FOR UPDATE TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_admin_permission((SELECT auth.uid()), 'admin_empresas')
  )
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_admin_permission((SELECT auth.uid()), 'admin_empresas')
  );

DROP POLICY IF EXISTS "Company admins can view all company modules"
  ON public.company_modules;

CREATE POLICY "Company admins can view all company modules"
  ON public.company_modules FOR SELECT TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_admin_permission((SELECT auth.uid()), 'admin_empresas')
  );

DO $audit$
DECLARE
  v_companies_qual text;
  v_companies_check text;
  v_modules_qual text;
BEGIN
  SELECT qual, with_check
    INTO v_companies_qual, v_companies_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'companies'
    AND policyname = 'Company admins can update companies'
    AND cmd = 'UPDATE'
    AND roles = ARRAY['authenticated']::name[];

  IF v_companies_qual IS NULL
     OR v_companies_check IS NULL
     OR v_companies_qual NOT LIKE '%has_admin_permission%admin_empresas%'
     OR v_companies_check NOT LIKE '%has_admin_permission%admin_empresas%'
     OR v_companies_qual LIKE '%is_admin_user%'
     OR v_companies_check LIKE '%is_admin_user%'
  THEN
    RAISE EXCEPTION 'policy granular de UPDATE em companies ausente ou incorreta';
  END IF;

  SELECT qual
    INTO v_modules_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'company_modules'
    AND policyname = 'Company admins can view all company modules'
    AND cmd = 'SELECT'
    AND roles = ARRAY['authenticated']::name[];

  IF v_modules_qual IS NULL
     OR v_modules_qual NOT LIKE '%has_admin_permission%admin_empresas%'
  THEN
    RAISE EXCEPTION 'policy de leitura de company_modules para admin_empresas ausente';
  END IF;
END
$audit$;

COMMIT;

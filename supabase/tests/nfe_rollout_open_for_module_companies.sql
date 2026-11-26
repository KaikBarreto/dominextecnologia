-- Fixtures ficticias e rollback integral.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $contract$
DECLARE
  v_default text;
  v_source text;
BEGIN
  FOREACH v_default IN ARRAY ARRAY['enabled', 'homologation_approved', 'production_approved']
  LOOP
    IF (
      SELECT column_default
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'company_nfe_settings'
         AND column_name = v_default
    ) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'default da coluna % nao esta aberto', v_default;
    END IF;
  END LOOP;

  IF has_function_privilege('anon', 'public.nfe_bootstrap_company(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.nfe_bootstrap_company(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'bootstrap interno da NF-e ficou exposto ao navegador';
  END IF;

  SELECT pg_get_functiondef('public.nfe_bootstrap_company(uuid)'::regprocedure)
    INTO v_source;
  IF position('company_has_module(p_company_id, ''nfe'')' in v_source) = 0
     OR position('ON CONFLICT (company_id) DO UPDATE' in v_source) = 0 THEN
    RAISE EXCEPTION 'bootstrap perdeu entitlement ou idempotencia';
  END IF;
END;
$contract$;

DO $behavior$
DECLARE
  v_plan_company uuid := 'b2513000-0000-4000-8000-000000000001';
  v_trial_company uuid := 'b2513000-0000-4000-8000-000000000002';
  v_addon_company uuid := 'b2513000-0000-4000-8000-000000000003';
  v_without_module uuid := 'b2513000-0000-4000-8000-000000000004';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.companies (
    id, name, business_core, subscription_status, subscription_plan
  ) VALUES
    (v_plan_company, 'NF-e Plano Ficticia', 'services', 'active', 'master'),
    (v_trial_company, 'NF-e Trial Ficticia', 'services', 'testing', 'personalizado'),
    (v_addon_company, 'NF-e Addon Ficticia', 'services', 'active', 'personalizado'),
    (v_without_module, 'Sem NF-e Ficticia', 'services', 'active', 'personalizado');

  IF NOT EXISTS (
    SELECT 1 FROM public.company_nfe_settings settings
     WHERE settings.company_id = v_plan_company
       AND settings.enabled
       AND settings.homologation_approved
       AND settings.production_approved
  ) THEN
    RAISE EXCEPTION 'empresa futura com NF-e no plano nao foi liberada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.company_nfe_settings settings
     WHERE settings.company_id = v_trial_company
       AND settings.enabled
       AND settings.homologation_approved
       AND settings.production_approved
  ) THEN
    RAISE EXCEPTION 'empresa futura em trial nao foi liberada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.company_nfe_settings settings
     WHERE settings.company_id IN (v_addon_company, v_without_module)
  ) THEN
    RAISE EXCEPTION 'empresa sem entitlement recebeu configuracao de NF-e';
  END IF;

  INSERT INTO public.company_modules (company_id, module_code)
  VALUES (v_addon_company, 'nfe');

  IF NOT EXISTS (
    SELECT 1 FROM public.company_nfe_settings settings
     WHERE settings.company_id = v_addon_company
       AND settings.enabled
       AND settings.homologation_approved
       AND settings.production_approved
  ) THEN
    RAISE EXCEPTION 'ativacao futura do addon NF-e nao liberou a empresa';
  END IF;

  UPDATE public.company_nfe_settings
     SET enabled = false,
         homologation_approved = false,
         production_approved = false
   WHERE company_id = v_addon_company;

  IF EXISTS (
    SELECT 1 FROM public.company_nfe_settings settings
     WHERE settings.company_id = v_addon_company
       AND (NOT settings.enabled
         OR NOT settings.homologation_approved
         OR NOT settings.production_approved)
  ) THEN
    RAISE EXCEPTION 'gravacao posterior conseguiu fechar o rollout da NF-e';
  END IF;

  IF public.nfe_bootstrap_company(v_without_module) IS TRUE
     OR EXISTS (
       SELECT 1 FROM public.company_nfe_settings settings
        WHERE settings.company_id = v_without_module
     ) THEN
    RAISE EXCEPTION 'bootstrap direto ignorou o entitlement do modulo';
  END IF;
END;
$behavior$;

ROLLBACK;

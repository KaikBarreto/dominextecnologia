-- Libera a NF-e (modelo 55) para toda empresa que possui o modulo `nfe`.
--
-- A liberacao manual de rollout deixa de existir somente para NF-e. Certificado,
-- cadastro fiscal, permissao do usuario, assinatura e entitlement do modulo
-- continuam validados no fluxo de emissao. NFC-e permanece com seus gates.
--
-- Rollback operacional:
--   1. remover os tres triggers de bootstrap e o trigger de rollout aberto;
--   2. restaurar os defaults dos tres campos para false;
--   3. restaurar os gates do Edge antes de voltar a marcar empresas como false.

BEGIN;

ALTER TABLE public.company_nfe_settings
  ALTER COLUMN enabled SET DEFAULT true,
  ALTER COLUMN homologation_approved SET DEFAULT true,
  ALTER COLUMN production_approved SET DEFAULT true;

CREATE OR REPLACE FUNCTION public.tg_keep_nfe_rollout_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  NEW.enabled := true;
  NEW.homologation_approved := true;
  NEW.production_approved := true;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.tg_keep_nfe_rollout_open() IS
  'Mantem abertos os antigos gates manuais de rollout da NF-e. Nao altera NFC-e nem os pre-requisitos fiscais obrigatorios.';

REVOKE ALL ON FUNCTION public.tg_keep_nfe_rollout_open() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS tg_keep_nfe_rollout_open ON public.company_nfe_settings;
CREATE TRIGGER tg_keep_nfe_rollout_open
  BEFORE INSERT OR UPDATE OF enabled, homologation_approved, production_approved
  ON public.company_nfe_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_keep_nfe_rollout_open();

CREATE OR REPLACE FUNCTION public.nfe_bootstrap_company(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF p_company_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.companies company WHERE company.id = p_company_id
  ) THEN
    RETURN false;
  END IF;

  -- Serializa backfill, ativacao de addon e mudanca de plano por empresa.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('nfe-bootstrap:' || p_company_id::text, 0)
  );

  IF public.company_has_module(p_company_id, 'nfe') IS NOT TRUE THEN
    RETURN false;
  END IF;

  INSERT INTO public.company_nfe_settings (
    company_id,
    enabled,
    homologation_approved,
    production_approved
  ) VALUES (
    p_company_id,
    true,
    true,
    true
  )
  ON CONFLICT (company_id) DO UPDATE
     SET enabled = true,
         homologation_approved = true,
         production_approved = true;

  RETURN true;
END;
$function$;

COMMENT ON FUNCTION public.nfe_bootstrap_company(uuid) IS
  'Provisiona de forma idempotente a configuracao aberta de NF-e para empresa com entitlement vigente do modulo nfe.';

REVOKE ALL ON FUNCTION public.nfe_bootstrap_company(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nfe_bootstrap_company(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_bootstrap_nfe_from_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM public.nfe_bootstrap_company(NEW.id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_bootstrap_nfe_from_company() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS tg_companies_bootstrap_nfe ON public.companies;
CREATE TRIGGER tg_companies_bootstrap_nfe
  AFTER INSERT OR UPDATE OF subscription_status, subscription_expires_at, subscription_plan
  ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_bootstrap_nfe_from_company();

CREATE OR REPLACE FUNCTION public.tg_bootstrap_nfe_from_addon()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.module_code = 'nfe' THEN
    PERFORM public.nfe_bootstrap_company(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_bootstrap_nfe_from_addon() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS tg_company_modules_bootstrap_nfe ON public.company_modules;
CREATE TRIGGER tg_company_modules_bootstrap_nfe
  AFTER INSERT OR UPDATE OF company_id, module_code
  ON public.company_modules
  FOR EACH ROW
  WHEN (NEW.module_code = 'nfe')
  EXECUTE FUNCTION public.tg_bootstrap_nfe_from_addon();

CREATE OR REPLACE FUNCTION public.tg_bootstrap_nfe_from_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  IF COALESCE(NEW.included_modules, '[]'::jsonb) ? 'nfe' THEN
    FOR v_company_id IN
      SELECT company.id
        FROM public.companies company
       WHERE company.subscription_plan = NEW.code
       ORDER BY company.id
    LOOP
      PERFORM public.nfe_bootstrap_company(v_company_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_bootstrap_nfe_from_plan() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS tg_subscription_plans_bootstrap_nfe ON public.subscription_plans;
CREATE TRIGGER tg_subscription_plans_bootstrap_nfe
  AFTER INSERT OR UPDATE OF code, included_modules
  ON public.subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_bootstrap_nfe_from_plan();

-- Libera imediatamente todas as empresas atuais cobertas pela mesma funcao de
-- entitlement usada pela autorizacao fiscal (trial, plano ou addon).
DO $backfill$
DECLARE
  v_company_id uuid;
BEGIN
  FOR v_company_id IN
    SELECT company.id
      FROM public.companies company
     WHERE public.company_has_module(company.id, 'nfe') IS TRUE
     ORDER BY company.id
  LOOP
    PERFORM public.nfe_bootstrap_company(v_company_id);
  END LOOP;
END;
$backfill$;

COMMIT;

-- =============================================================================
-- public.company_has_module(p_company_id uuid, p_module_code text) -> boolean
--
-- Checagem SERVER-SIDE de acesso a módulo por EMPRESA. Espelha a regra do hook
-- client `src/hooks/useCompanyModules.ts` (função hasModule), EXCETO o ramo
-- super_admin — que é por-USUÁRIO e não cabe numa função por-empresa.
--
-- Regra (mesma ordem do hook):
--   1. TRIAL ativo libera QUALQUER módulo:
--        subscription_status = 'testing' E
--        (subscription_expires_at IS NULL  -- trial sem data = não expirou
--         OR subscription_expires_at > now())
--   2. OU addon avulso: existe linha em company_modules (company_id, module_code).
--   3. OU incluso no plano atual: p_module_code ∈ subscription_plans.included_modules
--        do plano companies.subscription_plan (default 'start' quando ausente,
--        igual ao hook: `company?.subscription_plan || 'start'`).
--   senão FALSE.
--
-- SECURITY DEFINER + STABLE + SET search_path = public:
--   - DEFINER pra poder ser chamada de contexto público (portal) sem RLS travar
--     a leitura de companies/company_modules/subscription_plans.
--   - STABLE: só lê, resultado constante dentro da mesma statement.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.company_has_module(
  p_company_id uuid,
  p_module_code text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_status       text;
  v_expires_at   timestamptz;
  v_plan         text;
  v_trial_active boolean;
BEGIN
  IF p_company_id IS NULL OR p_module_code IS NULL THEN
    RETURN false;
  END IF;

  SELECT c.subscription_status,
         c.subscription_expires_at,
         COALESCE(NULLIF(c.subscription_plan, ''), 'start')
    INTO v_status, v_expires_at, v_plan
  FROM public.companies c
  WHERE c.id = p_company_id;

  -- Empresa inexistente => sem acesso.
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 1) Trial ativo libera tudo (espelha isTrialActive do hook).
  v_trial_active := (v_status = 'testing')
    AND (v_expires_at IS NULL OR v_expires_at > now());
  IF v_trial_active THEN
    RETURN true;
  END IF;

  -- 2) Addon avulso em company_modules.
  IF EXISTS (
    SELECT 1
    FROM public.company_modules cm
    WHERE cm.company_id = p_company_id
      AND cm.module_code = p_module_code
  ) THEN
    RETURN true;
  END IF;

  -- 3) Incluso no plano atual (subscription_plans.included_modules é jsonb array).
  IF EXISTS (
    SELECT 1
    FROM public.subscription_plans sp
    WHERE sp.code = v_plan
      AND sp.included_modules ? p_module_code
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

-- GRANT EXECUTE: a RPC é chamada tanto em contexto autenticado quanto pelo
-- service_role (edge functions / get_portal_data SECURITY DEFINER). Sem isto =
-- "permission denied" em runtime.
GRANT EXECUTE ON FUNCTION public.company_has_module(uuid, text)
  TO authenticated, service_role, anon;

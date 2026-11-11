-- O Caixa v2 acompanha o módulo PDV ativo.
--
-- O rollout inicial usava uma feature flag separada. Isso fazia a empresa
-- receber o menu, a conta de dinheiro e o primeiro terminal, mas ainda assim
-- ficar bloqueada na entrada do Caixa quando não estivesse numa allowlist.
-- O contexto público continua validando sessão, tenant, assinatura, módulo e
-- permissão antes de chegar a este helper interno.

BEGIN;

CREATE OR REPLACE FUNCTION public.pdv_direct_sale_v2_enabled_internal(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT p_company_id IS NOT NULL
     AND public.tenant_subscription_allows_access(p_company_id) IS TRUE
     AND public.company_has_module(p_company_id, 'pdv') IS TRUE
$function$;

COMMENT ON FUNCTION public.pdv_direct_sale_v2_enabled_internal(uuid) IS
  'Gate interno canônico do Caixa v2: acompanha assinatura válida e módulo PDV ativo, sem allowlist paralela.';

REVOKE ALL ON FUNCTION public.pdv_direct_sale_v2_enabled_internal(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_direct_sale_v2_enabled_internal(uuid)
  TO service_role;

COMMIT;

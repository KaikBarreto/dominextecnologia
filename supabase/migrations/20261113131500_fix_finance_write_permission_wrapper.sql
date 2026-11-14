-- Corrige INSERT/UPDATE manual no Financeiro para usuários autenticados.
--
-- As policies v3 chamavam pdv_has_explicit_action_permission_v2 diretamente,
-- mas essa função aceita um user_id arbitrário e, corretamente, não concede
-- EXECUTE a authenticated. A chamada dentro da policy terminava em 42501 antes
-- de concluir a autorização, inclusive para administradores do tenant.
--
-- O wrapper abaixo não recebe identidade do cliente: usa somente auth.uid() e
-- executa a função privada como SECURITY DEFINER. As demais travas da policy
-- (tenant, assinatura, origem não-PDV e vínculo com o tenant) permanecem iguais.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_manage_finance_transactions_current_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT COALESCE(
    auth.uid() IS NOT NULL
    AND (
      public.is_admin_or_gestor(auth.uid())
      OR public.pdv_has_explicit_action_permission_v2(
        auth.uid(),
        'fn:manage_finance'
      )
    ),
    false
  );
$function$;

REVOKE ALL ON FUNCTION public.can_manage_finance_transactions_current_user()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_finance_transactions_current_user()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.can_manage_finance_transactions_current_user() IS
  'Gate RLS seguro para criar e editar lançamentos: usa somente auth.uid() e não expõe consulta de permissão de outro usuário.';

DROP POLICY IF EXISTS "Scoped non PDV financial transaction inserts v3"
  ON public.financial_transactions;
CREATE POLICY "Scoped non PDV financial transaction inserts v3"
  ON public.financial_transactions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      company_id = public.get_user_company_id(auth.uid())
      AND public.tenant_subscription_allows_access(company_id)
      AND origin IS DISTINCT FROM 'pdv'
      AND pdv_financial_role IS NULL
      AND pdv_cash_session_id IS NULL
      AND public.can_manage_finance_transactions_current_user()
    )
  );

DROP POLICY IF EXISTS "Scoped non PDV financial transaction updates v3"
  ON public.financial_transactions;
CREATE POLICY "Scoped non PDV financial transaction updates v3"
  ON public.financial_transactions FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      company_id = public.get_user_company_id(auth.uid())
      AND public.tenant_subscription_allows_access(company_id)
      AND origin IS DISTINCT FROM 'pdv'
      AND pdv_financial_role IS NULL
      AND pdv_cash_session_id IS NULL
      AND public.can_manage_finance_transactions_current_user()
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      company_id = public.get_user_company_id(auth.uid())
      AND public.tenant_subscription_allows_access(company_id)
      AND origin IS DISTINCT FROM 'pdv'
      AND pdv_financial_role IS NULL
      AND pdv_cash_session_id IS NULL
    )
  );

COMMIT;

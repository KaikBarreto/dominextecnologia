-- Corrige a leitura do livro financeiro quebrada pela policy v3.
--
-- A migration 20261108030000_pdv_finance_closure.sql passou a chamar
-- pdv_can_read_financial_transaction_v3(...) dentro da policy de SELECT, mas
-- revogou EXECUTE da role authenticated. O PostgreSQL verifica esse privilegio
-- antes de avaliar a funcao e, por isso, toda consulta autenticada terminava em
-- SQLSTATE 42501 (inclusive o Financeiro fora do PDV).
--
-- Nao concedemos EXECUTE na funcao de tres argumentos: ela aceita um user_id
-- arbitrario e nao deve virar uma API publica. Este wrapper usa sempre o
-- auth.uid() da sessao e expoe somente a decisao necessaria para a RLS.

BEGIN;
CREATE OR REPLACE FUNCTION public.pdv_can_read_financial_transaction_current_user_v3(
  p_company_id uuid,
  p_transaction_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  SELECT public.pdv_can_read_financial_transaction_v3(
    auth.uid(),
    p_company_id,
    p_transaction_id
  );
$fn$;
REVOKE ALL ON FUNCTION public.pdv_can_read_financial_transaction_current_user_v3(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_can_read_financial_transaction_current_user_v3(uuid, uuid)
  TO authenticated, service_role;
COMMENT ON FUNCTION public.pdv_can_read_financial_transaction_current_user_v3(uuid, uuid) IS
  'Wrapper RLS seguro: avalia leitura financeira exclusivamente para auth.uid(); nao aceita identidade escolhida pelo cliente.';
DROP POLICY IF EXISTS "Scoped financial transaction reads v3"
  ON public.financial_transactions;
CREATE POLICY "Scoped financial transaction reads v3"
  ON public.financial_transactions FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.tenant_subscription_allows_access(company_id)
      AND public.pdv_can_read_financial_transaction_current_user_v3(company_id, id)
    )
  );
COMMIT;

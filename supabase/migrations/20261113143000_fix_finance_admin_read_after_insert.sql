-- Corrige o retorno dos lancamentos criados por administradores e gestores.
--
-- O cliente usa INSERT ... RETURNING para recuperar os IDs das parcelas. A
-- policy de SELECT relia financial_transactions pelo ID, mas essa nova linha
-- ainda nao fica visivel para uma segunda consulta durante o proprio comando.
-- O helper devolvia FALSE, o PostgreSQL respondia 42501 e desfazia a operacao.
-- A policy tambem nao alinhava admin/gestor com a permissao do INSERT.
--
-- A decisao continua presa ao tenant e a assinatura antes de qualquer papel.
-- Usuarios sem papel administrativo preservam os gates de Financeiro e o
-- isolamento por caixa para transacoes originadas no PDV.

BEGIN;

CREATE OR REPLACE FUNCTION public.pdv_can_read_financial_transaction_v3(
  p_user_id uuid,
  p_company_id uuid,
  p_transaction_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_transaction public.financial_transactions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL
     OR public.get_user_company_id(p_user_id) IS DISTINCT FROM p_company_id
     OR public.tenant_subscription_allows_access(p_company_id) IS DISTINCT FROM TRUE
  THEN
    RETURN FALSE;
  END IF;

  SELECT transaction.*
    INTO v_transaction
    FROM public.financial_transactions transaction
   WHERE transaction.id = p_transaction_id
     AND transaction.company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF public.is_super_admin(p_user_id)
     OR public.is_admin_or_gestor(p_user_id)
     OR public.pdv_has_explicit_action_permission_v2(
       p_user_id,
       'fn:operate_other_pdv_cash'
     )
  THEN
    RETURN TRUE;
  END IF;

  IF v_transaction.origin IS DISTINCT FROM 'pdv' THEN
    RETURN public.user_has_permission(p_user_id, 'screen:finance')
      OR public.pdv_has_explicit_action_permission_v2(
        p_user_id,
        'fn:view_finance_totals'
      );
  END IF;

  IF v_transaction.pdv_cash_session_id IS NOT NULL THEN
    RETURN public.pdv_can_access_cash_session_v3(
      p_user_id,
      p_company_id,
      v_transaction.pdv_cash_session_id
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.pdv_order_payments payment
      JOIN public.pdv_orders orders
        ON orders.id = payment.order_id
       AND orders.company_id = payment.company_id
      JOIN public.pdv_cash_sessions session
        ON session.id = orders.cash_session_id
       AND session.company_id = orders.company_id
       AND session.terminal_id = orders.terminal_id
     WHERE payment.company_id = p_company_id
       AND (
         payment.receivable_transaction_id = p_transaction_id
         OR payment.settlement_transaction_id = p_transaction_id
       )
       AND public.pdv_can_access_cash_session_v3(
         p_user_id,
         p_company_id,
         session.id
       )
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.can_read_financial_transaction_row_current_user_v4(
  p_company_id uuid,
  p_transaction_id uuid,
  p_origin text,
  p_pdv_cash_session_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL
     OR public.get_user_company_id(v_user_id) IS DISTINCT FROM p_company_id
     OR public.tenant_subscription_allows_access(p_company_id) IS DISTINCT FROM TRUE
  THEN
    RETURN FALSE;
  END IF;

  IF public.is_super_admin(v_user_id)
     OR public.is_admin_or_gestor(v_user_id)
     OR public.pdv_has_explicit_action_permission_v2(
       v_user_id,
       'fn:operate_other_pdv_cash'
     )
  THEN
    RETURN TRUE;
  END IF;

  -- Usa os campos da propria linha avaliada pela policy. Consultar novamente
  -- financial_transactions aqui nao enxerga a linha durante INSERT RETURNING.
  IF p_origin IS DISTINCT FROM 'pdv' THEN
    RETURN public.user_has_permission(v_user_id, 'screen:finance')
      OR public.pdv_has_explicit_action_permission_v2(
        v_user_id,
        'fn:manage_finance'
      )
      OR public.pdv_has_explicit_action_permission_v2(
        v_user_id,
        'fn:view_finance_totals'
      );
  END IF;

  IF p_pdv_cash_session_id IS NOT NULL THEN
    RETURN public.pdv_can_access_cash_session_v3(
      v_user_id,
      p_company_id,
      p_pdv_cash_session_id
    );
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.pdv_order_payments payment
      JOIN public.pdv_orders orders
        ON orders.id = payment.order_id
       AND orders.company_id = payment.company_id
      JOIN public.pdv_cash_sessions session
        ON session.id = orders.cash_session_id
       AND session.company_id = orders.company_id
       AND session.terminal_id = orders.terminal_id
     WHERE payment.company_id = p_company_id
       AND (
         payment.receivable_transaction_id = p_transaction_id
         OR payment.settlement_transaction_id = p_transaction_id
       )
       AND public.pdv_can_access_cash_session_v3(
         v_user_id,
         p_company_id,
         session.id
       )
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.can_read_financial_transaction_row_current_user_v4(
  uuid,
  uuid,
  text,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_financial_transaction_row_current_user_v4(
  uuid,
  uuid,
  text,
  uuid
) TO authenticated, service_role;

DROP POLICY IF EXISTS "Scoped financial transaction reads v3"
  ON public.financial_transactions;
CREATE POLICY "Scoped financial transaction reads v3"
  ON public.financial_transactions FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.tenant_subscription_allows_access(company_id)
      AND public.can_read_financial_transaction_row_current_user_v4(
        company_id,
        id,
        origin,
        pdv_cash_session_id
      )
    )
  );

REVOKE ALL ON FUNCTION public.pdv_can_read_financial_transaction_v3(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMIT;

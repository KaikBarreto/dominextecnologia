-- Resumo para decidir crédito no PDV: mesma dívida assinada dos writers v2.
-- Não disponibiliza extrato, transações ou contexto de outros caixas ao cliente.
BEGIN;

CREATE OR REPLACE FUNCTION public.pdv_get_customer_credit_summary_v3(p_customer_id uuid)
RETURNS TABLE (credit_limit numeric, debt numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_limit numeric;
BEGIN
  -- Contexto canônico: JWT, perfil/empresa, vigência, módulo e tela do PDV.
  -- false permite o mesmo resumo no caixa simples e no fluxo de balcão.
  SELECT * INTO v_context
    FROM public.pdv_counter_context_v2('screen:pdv', NULL, false);

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles profile
     WHERE profile.user_id = v_context.user_id
       AND profile.company_id = v_context.company_id
       AND profile.is_active IS TRUE
  ) OR EXISTS (
    SELECT 1 FROM public.user_permissions permission
     WHERE permission.user_id = v_context.user_id
       AND permission.is_active IS DISTINCT FROM true
  ) OR NOT (
    public.is_admin_or_gestor(v_context.user_id)
    OR public.is_super_admin(v_context.user_id)
    OR public.pdv_has_explicit_action_permission_v2(
      v_context.user_id, 'fn:complete_direct_sale'
    ) IS TRUE
    OR public.pdv_has_explicit_action_permission_v2(
      v_context.user_id, 'fn:cover_pdv_order'
    ) IS TRUE
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para consultar o crédito no caixa.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_customer_credit_summary_forbidden';
  END IF;

  SELECT customer.credit_limit INTO v_limit
    FROM public.customers customer
   WHERE customer.id = p_customer_id
     AND customer.company_id = v_context.company_id
     AND customer.is_deleted IS FALSE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado nesta empresa.'
      USING ERRCODE = 'P0002', DETAIL = 'code=pdv_customer_credit_summary_customer_not_found';
  END IF;

  -- Deliberadamente agregado por cliente/empresa, como o limite do writer.
  -- Filtrar pelo caixa subestimaria a dívida e permitiria exceder o limite.
  -- O saldo é assinado: crédito negativo não é truncado para zero.
  RETURN QUERY
  SELECT v_limit, round(COALESCE(sum(statement.amount), 0), 2)
    FROM public.pdv_customer_credit_statement_v2(p_customer_id) statement;
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_get_customer_credit_summary_v3(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_get_customer_credit_summary_v3(uuid)
  TO authenticated, service_role;

-- Nenhum consumidor frontend/Edge legítimo usa o extrato detalhado.
-- Os writers SECURITY DEFINER e o resumo acima o invocam pelo owner.
-- Mantém service_role e owner; fecha qualquer grant de rollout legado à API.
REVOKE ALL ON FUNCTION public.pdv_customer_credit_statement_v2(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.pdv_get_customer_credit_summary_v3(uuid) IS
  'Resumo interno de decisão de crédito do PDV. Uma linha: limite nullable e dívida assinada canônica da empresa. Sem IDs, extrato, descrições ou dados de outros caixas. JWT ativo, módulo/vigência e capacidades de concluir/cobrir venda obrigatórios.';

COMMIT;

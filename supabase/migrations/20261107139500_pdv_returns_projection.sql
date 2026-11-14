-- W5-01: projeção mínima para o fluxo de devoluções no detalhe do pedido.
-- Expõe somente o histórico comercial e os recebíveis do próprio pedido que
-- ainda podem ser abatidos. Custos, CMV, documentos e dados de contato ficam
-- deliberadamente fora deste contrato.

CREATE OR REPLACE FUNCTION public.pdv_get_return_context_v2(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_order public.pdv_orders%ROWTYPE;
  v_history jsonb;
  v_receivables jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_returns_context_v2(NULL);

  IF NOT public.is_admin_or_gestor(v_context.user_id)
     AND NOT public.is_super_admin(v_context.user_id)
     AND public.pdv_has_explicit_action_permission_v2(v_context.user_id, 'fn:return_pdv_order') IS DISTINCT FROM TRUE
     AND public.pdv_has_explicit_action_permission_v2(v_context.user_id, 'fn:reverse_pdv_return') IS DISTINCT FROM TRUE
     AND public.pdv_has_explicit_action_permission_v2(v_context.user_id, 'fn:cancel_pdv_order_residual') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem permissão para consultar devoluções.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_return_projection_permission_denied';
  END IF;

  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_order_id => p_order_id
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso ao local de estoque deste pedido.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_return_projection_stock_denied';
  END IF;

  SELECT orders.* INTO v_order
    FROM public.pdv_orders orders
   WHERE orders.id = p_order_id
     AND orders.company_id = v_context.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'code=pdv_return_order_not_found';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', header.id,
      'event_kind', header.event_kind,
      'occurred_on', header.occurred_on,
      'reason', header.reason,
      'commercial_total', header.commercial_total,
      'reversal_of_id', header.reversal_of_id,
      'item_count', COALESCE(item_totals.item_count, 0),
      'quantity', COALESCE(item_totals.quantity, 0),
      'can_reverse', header.event_kind = 'return'
        AND NOT EXISTS (
          SELECT 1 FROM public.pdv_commercial_returns reversal
           WHERE reversal.company_id = v_context.company_id
             AND reversal.reversal_of_id = header.id
        )
    ) ORDER BY header.occurred_on DESC, header.created_at DESC, header.id DESC), '[]'::jsonb)
    INTO v_history
    FROM public.pdv_commercial_returns header
    LEFT JOIN LATERAL (
      SELECT count(*)::integer item_count, COALESCE(sum(item.quantity), 0)::numeric quantity
        FROM public.pdv_commercial_return_items item
       WHERE item.commercial_return_id = header.id
    ) item_totals ON TRUE
   WHERE header.company_id = v_context.company_id
     AND header.order_id = v_order.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', transaction.id,
      'description', transaction.description,
      'due_date', transaction.due_date,
      'open_amount', public.pdv_party_obligation_open_v2(transaction.id)
    ) ORDER BY transaction.due_date NULLS LAST, transaction.id), '[]'::jsonb)
    INTO v_receivables
    FROM public.pdv_order_payments payment
    JOIN public.financial_transactions transaction
      ON transaction.id = payment.receivable_transaction_id
     AND transaction.company_id = v_context.company_id
     AND transaction.customer_id = v_order.customer_id
     AND transaction.parent_transaction_id IS NULL
     AND transaction.cancelled_at IS NULL
   WHERE payment.company_id = v_context.company_id
     AND payment.order_id = v_order.id
     AND public.pdv_party_obligation_open_v2(transaction.id) > 0;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'customer_id', v_order.customer_id,
    'history', v_history,
    'receivables', v_receivables
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_get_return_context_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_return_context_v2(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.pdv_get_return_context_v2(uuid) IS
  'W5 projection: return/reversal history and open order receivables only; never exposes CMV, costs, limits, documents or contacts.';

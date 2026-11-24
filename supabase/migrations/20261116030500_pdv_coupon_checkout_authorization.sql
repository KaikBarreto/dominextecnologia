-- A revisão promocional só pode ser consultada depois da autorização completa
-- da empresa, local e abertura. Preserva replay e o writer financeiro canônico.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE FUNCTION public.pdv_coupon_checkout_order_internal_v1(
  p_order_id uuid,p_terminal_id uuid,p_cash_session_id uuid,p_cash_account_id uuid,
  p_idempotency_key text
) RETURNS public.pdv_orders LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE ctx record; session public.pdv_cash_sessions; o public.pdv_orders;
BEGIN
  SELECT * INTO ctx FROM public.pdv_counter_context_v2('screen:pdv','fn:cover_pdv_order',true);
  session:=public.pdv_assert_cash_session_actor_v3(p_cash_session_id,p_cash_account_id,false);
  IF session.terminal_id IS DISTINCT FROM p_terminal_id THEN
    RAISE EXCEPTION 'Use a abertura correta deste caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_session_invalid';
  END IF;
  PERFORM public.pdv_lock_treasury_account(ctx.company_id,p_cash_account_id);
  SELECT * INTO o FROM public.pdv_orders orders
    WHERE orders.id=p_order_id AND orders.company_id=ctx.company_id
      AND orders.contract_version=2 AND orders.operation_mode_snapshot='counter'
      AND orders.target_terminal_id=p_terminal_id
      AND (orders.cash_session_id IS NULL OR orders.cash_session_id=p_cash_session_id)
      AND (orders.terminal_id IS NULL OR orders.terminal_id=p_terminal_id)
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este pedido pertence a outro caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_terminal_mismatch';
  END IF;
  -- Revogação/troca de contexto enquanto aguardava um lock falha fechado.
  SELECT * INTO ctx FROM public.pdv_counter_context_v2('screen:pdv','fn:cover_pdv_order',true);
  session:=public.pdv_assert_cash_session_actor_v3(p_cash_session_id,p_cash_account_id,false);
  IF o.company_id IS DISTINCT FROM ctx.company_id
     OR session.terminal_id IS DISTINCT FROM p_terminal_id
     OR session.cash_account_id IS DISTINCT FROM p_cash_account_id THEN
    RAISE EXCEPTION 'Use a abertura correta deste caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_session_invalid';
  END IF;
  IF o.stock_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.pdv_terminals t
      WHERE t.id=p_terminal_id AND t.company_id=ctx.company_id
        AND t.is_active IS TRUE AND t.stock_id=o.stock_id
        AND public.can_access_stock(ctx.user_id,t.stock_id)
  ) THEN
    RAISE EXCEPTION 'O local deste pedido não está acessível neste caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_stock_denied';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_operation_requests r
    WHERE r.company_id=ctx.company_id AND r.operation_type='counter.cover.v2'
      AND r.idempotency_key=p_idempotency_key AND r.created_by IS DISTINCT FROM ctx.user_id
  ) THEN
    RAISE EXCEPTION 'Esta confirmação pertence a outro operador.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_replay_forbidden';
  END IF;
  RETURN o;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_coupon_checkout_order_internal_v1(uuid,uuid,uuid,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_cover_existing_order_v2(
  p_order_id uuid,p_terminal_id uuid,p_cash_session_id uuid,p_cash_account_id uuid,
  p_payments jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE o public.pdv_orders;
BEGIN
  o:=public.pdv_coupon_checkout_order_internal_v1(p_order_id,p_terminal_id,
    p_cash_session_id,p_cash_account_id,p_idempotency_key);
  IF o.coupon_id IS NOT NULL OR o.coupon_revision_v1<>0 THEN
    RAISE EXCEPTION 'O desconto do pedido mudou. Reabra o recebimento para conferir o total.'
      USING ERRCODE='40001',DETAIL='code=pdv_coupon_conflict';
  END IF;
  RETURN public.pdv_cover_existing_order_coupon_core_v1(p_order_id,p_terminal_id,
    p_cash_session_id,p_cash_account_id,p_payments,p_idempotency_key);
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_cover_existing_order_coupon_v1(
  p_order_id uuid,p_terminal_id uuid,p_cash_session_id uuid,p_cash_account_id uuid,
  p_payments jsonb,p_idempotency_key text,p_expected_coupon_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE o public.pdv_orders;
BEGIN
  o:=public.pdv_coupon_checkout_order_internal_v1(p_order_id,p_terminal_id,
    p_cash_session_id,p_cash_account_id,p_idempotency_key);
  IF o.coupon_revision_v1 IS DISTINCT FROM p_expected_coupon_revision THEN
    RAISE EXCEPTION 'O desconto do pedido mudou. Reabra o recebimento para conferir o total.'
      USING ERRCODE='40001',DETAIL='code=pdv_coupon_conflict';
  END IF;
  RETURN public.pdv_cover_existing_order_coupon_core_v1(p_order_id,p_terminal_id,
    p_cash_session_id,p_cash_account_id,p_payments,p_idempotency_key);
END $fn$;
COMMIT;

-- Torna retries de reembolso/estorno realmente idempotentes e impede a
-- emissão de voucher para cliente inativo. A correção é aditiva: as RPCs
-- originais permanecem intactas, mas ficam internas atrás de wrappers que
-- devolvem primeiro o resultado já concluído para a mesma chave e payload.

BEGIN;

ALTER FUNCTION public.pdv_request_return_refund_v2(uuid,uuid,numeric,text,uuid,uuid,text)
  RENAME TO pdv_request_return_refund_v2_before_retry_fix;
ALTER FUNCTION public.pdv_reverse_return_refund_v2(uuid,text,text)
  RENAME TO pdv_reverse_return_refund_v2_before_retry_fix;
ALTER FUNCTION public.pdv_reverse_return_voucher_v2(uuid,text,text)
  RENAME TO pdv_reverse_return_voucher_v2_before_retry_fix;

CREATE OR REPLACE FUNCTION public.pdv_request_return_refund_v2(
  p_return_id uuid,p_original_payment_id uuid,p_amount numeric,p_reason text,
  p_account_id uuid,p_cash_session_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_payload jsonb; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:refund_pdv_return');
  PERFORM public.pdv_assert_order_cash_access_v2(
    (SELECT return_header.order_id FROM public.pdv_commercial_returns return_header WHERE return_header.id=p_return_id),
    auth.uid()
  );
  IF p_cash_session_id IS NOT NULL
     AND public.pdv_current_actor_can_access_session_v3(p_cash_session_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Escolha um caixa aberto por você.'
      USING ERRCODE='42501',DETAIL='code=pdv_refund_cash_denied';
  END IF;
  v_payload:=jsonb_build_object(
    'return_id',p_return_id,'payment_id',p_original_payment_id,
    'amount',round(p_amount,2),'reason',NULLIF(btrim(COALESCE(p_reason,'')),''),
    'account_id',p_account_id,'cash_session_id',p_cash_session_id
  );
  SELECT request.result INTO v_result
    FROM public.pdv_operation_requests request
   WHERE request.company_id=v_context.company_id
     AND request.operation_type='after_sale.refund.request.v2'
     AND request.idempotency_key=p_idempotency_key
     AND request.payload_hash=public.pdv_operation_payload_hash(v_payload)
     AND request.status='completed';
  IF v_result IS NOT NULL THEN
    RETURN v_result||jsonb_build_object('idempotent',true);
  END IF;
  RETURN public.pdv_request_return_refund_v2_before_retry_fix(
    p_return_id,p_original_payment_id,p_amount,p_reason,p_account_id,p_cash_session_id,p_idempotency_key
  );
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_reverse_return_refund_v2(
  p_refund_id uuid,p_reason text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_payload jsonb; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:reverse_pdv_refund');
  PERFORM public.pdv_assert_order_cash_access_v2(
    (SELECT return_header.order_id
       FROM public.pdv_refunds refund
       JOIN public.pdv_commercial_returns return_header ON return_header.id=refund.commercial_return_id
      WHERE refund.id=p_refund_id),
    auth.uid()
  );
  v_payload:=jsonb_build_object(
    'refund_id',p_refund_id,'reason',NULLIF(btrim(COALESCE(p_reason,'')),'')
  );
  SELECT request.result INTO v_result
    FROM public.pdv_operation_requests request
   WHERE request.company_id=v_context.company_id
     AND request.operation_type='after_sale.refund.reverse.v2'
     AND request.idempotency_key=p_idempotency_key
     AND request.payload_hash=public.pdv_operation_payload_hash(v_payload)
     AND request.status='completed';
  IF v_result IS NOT NULL THEN
    RETURN v_result||jsonb_build_object('idempotent',true);
  END IF;
  RETURN public.pdv_reverse_return_refund_v2_before_retry_fix(
    p_refund_id,p_reason,p_idempotency_key
  );
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_reverse_return_voucher_v2(
  p_voucher_id uuid,p_reason text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_payload jsonb; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:reverse_pdv_after_sale');
  PERFORM public.pdv_assert_order_cash_access_v2(
    (SELECT return_header.order_id
       FROM public.pdv_vouchers voucher
       JOIN public.pdv_commercial_returns return_header ON return_header.id=voucher.source_commercial_return_id
      WHERE voucher.id=p_voucher_id),
    auth.uid()
  );
  v_payload:=jsonb_build_object(
    'voucher_id',p_voucher_id,'reason',NULLIF(btrim(COALESCE(p_reason,'')),'')
  );
  SELECT request.result INTO v_result
    FROM public.pdv_operation_requests request
   WHERE request.company_id=v_context.company_id
     AND request.operation_type='after_sale.voucher.reverse.v2'
     AND request.idempotency_key=p_idempotency_key
     AND request.payload_hash=public.pdv_operation_payload_hash(v_payload)
     AND request.status='completed';
  IF v_result IS NOT NULL THEN
    RETURN v_result||jsonb_build_object('idempotent',true);
  END IF;
  RETURN public.pdv_reverse_return_voucher_v2_before_retry_fix(
    p_voucher_id,p_reason,p_idempotency_key
  );
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_guard_voucher_active_customer_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.customers customer
     WHERE customer.id=NEW.customer_id
       AND customer.company_id=NEW.company_id
       AND COALESCE(customer.is_deleted,false)=false
  ) THEN
    RAISE EXCEPTION 'O cliente deste voucher não está ativo.'
      USING ERRCODE='23514',DETAIL='code=pdv_voucher_customer_inactive';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS guard_pdv_voucher_active_customer_v2 ON public.pdv_vouchers;
CREATE TRIGGER guard_pdv_voucher_active_customer_v2
  BEFORE INSERT ON public.pdv_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_voucher_active_customer_v2();

REVOKE ALL ON FUNCTION
  public.pdv_request_return_refund_v2_before_retry_fix(uuid,uuid,numeric,text,uuid,uuid,text),
  public.pdv_reverse_return_refund_v2_before_retry_fix(uuid,text,text),
  public.pdv_reverse_return_voucher_v2_before_retry_fix(uuid,text,text),
  public.pdv_guard_voucher_active_customer_v2()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION
  public.pdv_request_return_refund_v2(uuid,uuid,numeric,text,uuid,uuid,text),
  public.pdv_reverse_return_refund_v2(uuid,text,text),
  public.pdv_reverse_return_voucher_v2(uuid,text,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION
  public.pdv_request_return_refund_v2(uuid,uuid,numeric,text,uuid,uuid,text),
  public.pdv_reverse_return_refund_v2(uuid,text,text),
  public.pdv_reverse_return_voucher_v2(uuid,text,text)
  TO authenticated,service_role;

COMMIT;

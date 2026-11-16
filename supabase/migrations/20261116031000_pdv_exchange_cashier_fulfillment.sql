-- A troca e o recebimento normal usam a mesma entrega integral no caixa.
-- O snapshot do pedido define duas/três etapas; configuração atual não reescreve história.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $shared_cashier$
DECLARE definition text; first_position integer; last_position integer; delivery_block text; replacement text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_cover_existing_order_core_015_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure) INTO definition;
 first_position:=position('  IF v_order.status=''entregue'' THEN' IN definition);
 last_position:=position('  v_result:=jsonb_build_object(' IN definition);
 IF first_position=0 OR last_position<=first_position
  OR position('pdv_complete_delivery_internal_v2' IN definition)=0
  OR position('pdv_apply_settlement_fifo_v2' IN definition)=0
  OR position('pdv_capture_delivery_receipt_internal_v2' IN definition)=0 THEN
  RAISE EXCEPTION 'A entrega integral do caixa mudou; revise antes de compartilhar a rotina'; END IF;
 delivery_block:=substring(definition FROM first_position FOR last_position-first_position);
 EXECUTE format($helper_definition$
CREATE FUNCTION public.pdv_complete_cashier_fulfillment_internal_v1(p_company_id uuid,p_order_id uuid,p_request_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $helper$
DECLARE v_context record; v_order public.pdv_orders; v_request public.pdv_operation_requests;
 v_request_id uuid:=p_request_id; v_lines jsonb; v_delivery jsonb; v_delivery_id uuid; v_snapshot_id uuid; v_settlement uuid;
BEGIN
 SELECT * INTO v_request FROM public.pdv_operation_requests WHERE id=p_request_id AND company_id=p_company_id FOR UPDATE;
 IF NOT FOUND OR ((v_request.operation_type='counter.cover.v2' AND v_request.status='completed'
   AND v_request.resource_type='pdv_order' AND v_request.resource_id=p_order_id)
  OR (v_request.operation_type='after_sale.exchange.cover.v3' AND v_request.status='pending'
   AND EXISTS(SELECT 1 FROM public.pdv_exchanges x WHERE x.company_id=p_company_id AND x.operation_request_id=p_request_id AND x.new_order_id=p_order_id))) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Não foi possível confirmar a tentativa do recebimento.' USING ERRCODE='55000',DETAIL='code=pdv_counter_request_missing'; END IF;
 SELECT * INTO v_order FROM public.pdv_orders WHERE id=p_order_id AND company_id=p_company_id FOR UPDATE;
 IF NOT FOUND OR v_order.contract_version IS DISTINCT FROM 2 OR v_order.operation_mode_snapshot IS DISTINCT FROM 'counter'
  OR v_order.fulfillment_mode_snapshot IS DISTINCT FROM 'cashier' THEN
  RAISE EXCEPTION 'Este pedido não está configurado para retirada no caixa.' USING ERRCODE='23514',DETAIL='code=pdv_counter_cashier_delivery_mismatch'; END IF;
 IF v_request.operation_type='counter.cover.v2' THEN
  SELECT * INTO v_context FROM public.pdv_counter_context_v2('screen:pdv','fn:cover_pdv_order',true);
 ELSE
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:cover_pdv_exchange');
 END IF;
 IF v_context.company_id IS DISTINCT FROM p_company_id OR v_context.user_id IS DISTINCT FROM p_actor_id THEN
  RAISE EXCEPTION 'Seu perfil não permite confirmar a retirada deste pedido.' USING ERRCODE='42501'; END IF;
 PERFORM public.pdv_assert_order_cash_access_v2(v_order.id,p_actor_id);
 IF public.pdv_has_stock_access_scope_v2(p_actor_id,p_company_id,p_order_id=>v_order.id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Seu perfil não permite retirar os materiais deste pedido.' USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied'; END IF;
%s
 RETURN jsonb_build_object('order_id',v_order.id,'order_number',v_order.number,'status','entregue',
  'paid_at',v_order.paid_at,'delivery_id',v_delivery_id,'receipt_snapshot_id',v_snapshot_id);
END $helper$;
$helper_definition$,delivery_block);
 replacement:=$replacement$  -- PDV_SHARED_CASHIER_FULFILLMENT_V1: kernel/FIFO/comprovante compartilhados.
  v_delivery:=public.pdv_complete_cashier_fulfillment_internal_v1(v_context.company_id,v_order.id,v_request_id,v_context.user_id);
  v_delivery_id:=(v_delivery->>'delivery_id')::uuid;
  v_snapshot_id:=(v_delivery->>'receipt_snapshot_id')::uuid;
  SELECT order_row.* INTO v_order FROM public.pdv_orders order_row WHERE order_row.id=p_order_id AND order_row.company_id=v_context.company_id;

$replacement$;
 -- Mantém guards, snapshot de modo, forma do resultado e recurso pdv_order.
 definition:=left(definition,first_position-1)||replacement||substring(definition FROM last_position);
 EXECUTE definition;
END $shared_cashier$;
REVOKE ALL ON FUNCTION public.pdv_complete_cashier_fulfillment_internal_v1(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $exchange_cashier$
DECLARE definition text; anchor text; replacement text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_cover_exchange_order_target_base_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer,uuid)'::regprocedure) INTO definition;
 anchor:=$anchor$  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_exchange',v_exchange,v_result); RETURN v_result;$anchor$;
 replacement:=$replacement$  -- PDV_EXCHANGE_CASHIER_FULFILLMENT_V1: entrega compõe a mesma transação da troca.
  IF v_order.fulfillment_mode_snapshot='cashier' THEN
    v_result:=v_result||public.pdv_complete_cashier_fulfillment_internal_v1(v_context.company_id,v_order.id,v_claim.request_id,v_context.user_id);
  ELSE
    v_result:=v_result||jsonb_build_object('order_id',v_order.id,'order_number',v_order.number,'status','liberado_retirada');
  END IF;
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_exchange',v_exchange,v_result); RETURN v_result;$replacement$;
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
  OR position('PDV_EXCHANGE_ATOMIC_RESERVATION_V1' IN definition)=0
  OR position('PDV_EXCHANGE_TARGET_CASH_V2' IN definition)=0
  OR position('after_sale.exchange.cover.v3' IN definition)=0 THEN
  RAISE EXCEPTION 'A confirmação canônica da troca mudou; revise antes de compor a entrega'; END IF;
 EXECUTE replace(definition,anchor,replacement);
END $exchange_cashier$;
COMMIT;

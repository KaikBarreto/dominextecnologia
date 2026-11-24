-- Composição do desconto promocional antes de qualquer cobertura financeira.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $direct$
DECLARE s text; a text; b text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure) INTO s;
 IF position('PDV_COUPON_CHECKOUT_V1' IN s)>0 THEN RETURN; END IF;
 a:=$a$'items','order_discount_amount','notes','transaction_date'$a$;
 b:=$b$'items','order_discount_amount','notes','transaction_date','coupon_id','coupon_discount_cents'$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A estrutura do carrinho mudou antes da integração do cupom.'; END IF; s:=replace(s,a,b);
 a:=$a$'transaction_date',v_transaction_date
    ),
    'payments', v_payments$a$;
 b:=$b$'transaction_date',v_transaction_date
    )||public.pdv_coupon_hash_meta_internal_v1(p_cart),
    'payments', v_payments$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'O hash da venda mudou antes da integração do cupom.'; END IF; s:=replace(s,a,b);
 a:=$a$  IF (SELECT round(COALESCE(sum(item.total),0),2)$a$;
 b:=$b$  -- PDV_COUPON_CHECKOUT_V1: rateio promocional apenas nos itens elegíveis.
  IF NULLIF(p_cart->>'coupon_id','') IS NOT NULL THEN
    v_result:=public.pdv_apply_order_coupon_internal_v1(v_order_id,(p_cart->>'coupon_id')::uuid,NULLIF(p_cart->>'coupon_discount_cents','')::bigint);
    v_total:=(v_result->>'total')::numeric;
    v_order_discount:=(v_result->>'discount_amount')::numeric;
    PERFORM public.pdv_consume_order_coupon_internal_v1(v_order_id);
  ELSIF COALESCE(NULLIF(p_cart->>'coupon_discount_cents','')::bigint,0)<>0 THEN
    RAISE EXCEPTION 'Selecione um cupom válido.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_invalid';
  END IF;

  IF (SELECT round(COALESCE(sum(item.total),0),2)$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A conferência dos itens mudou antes da integração do cupom.'; END IF; s:=replace(s,a,b);
 EXECUTE s;
END $direct$;
DO $counter$
DECLARE s text; a text; b text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_cover_existing_order_base_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure) INTO s;
 a:=$a$  IF v_order.stock_id IS NULL$a$;
 b:=$b$  -- PDV_COUPON_CHECKOUT_V1: pedido ainda pendente; uso desfaz se o pagamento falhar.
  PERFORM public.pdv_consume_order_coupon_internal_v1(v_order.id);
  IF v_order.stock_id IS NULL$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A validação do pedido mudou antes da integração do cupom.'; END IF; s:=replace(s,a,b);
 EXECUTE s;
END $counter$;
COMMIT;

-- Mesma ordem de venda direta/troca: inventário/local/reservas -> cupom -> cobertura.
-- Move exclusivamente o consumo já publicado em30100; a transação continua
-- revertendo reservas, utilização e pagamentos se a promoção falhar.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $counter_coupon_order$
DECLARE
  definition text;
  consume_block constant text := $consume$  -- PDV_COUPON_CHECKOUT_V1: pedido ainda pendente; uso desfaz se o pagamento falhar.
  PERFORM public.pdv_consume_order_coupon_internal_v1(v_order.id);
$consume$;
  reservation_end constant text := $anchor$    END IF;
  END LOOP;

  -- PDV_MULTIPLE_VOUCHERS_V4: ordem global estável antes de qualquer consumo.$anchor$;
  consume_count integer; anchor_count integer;
BEGIN
  SELECT pg_get_functiondef('public.pdv_cover_existing_order_base_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure) INTO definition;
  consume_count:=(length(definition)-length(replace(definition,consume_block,'')))/length(consume_block);
  IF position('pdv_reserve_stock_internal_v2' IN definition)=0
    OR position('FOR v_payment IN SELECT value FROM jsonb_array_elements(v_payments) LOOP' IN definition)=0 THEN
    RAISE EXCEPTION 'A reserva ou a cobertura canônica mudou; revise a ordem de bloqueios antes de aplicar.';
  END IF;
  IF position('PDV_COUNTER_COUPON_LOCK_ORDER_V1' IN definition)>0 THEN
    IF consume_count<>1
      OR position('pdv_reserve_stock_internal_v2' IN definition)>=position(consume_block IN definition)
      OR position(consume_block IN definition)>=position('-- PDV_MULTIPLE_VOUCHERS_V4:' IN definition) THEN
      RAISE EXCEPTION 'A ordem de estoque e cupom do balcão mudou; revise antes de aplicar.';
    END IF;
    RETURN;
  END IF;
  anchor_count:=(length(definition)-length(replace(definition,reservation_end,'')))/length(reservation_end);
  IF consume_count<>1 OR anchor_count<>1 THEN
    RAISE EXCEPTION 'As âncoras do consumo promocional do balcão mudaram (consumo %, reserva %); revise antes de aplicar.',consume_count,anchor_count;
  END IF;
  definition:=replace(definition,consume_block,'');
  definition:=replace(definition,reservation_end,$placement$    END IF;
  END LOOP;

  -- PDV_COUNTER_COUPON_LOCK_ORDER_V1: o estoque já está bloqueado/reservado.
$placement$||consume_block||$placement$
  -- PDV_MULTIPLE_VOUCHERS_V4: ordem global estável antes de qualquer consumo.$placement$);
  IF position('pdv_reserve_stock_internal_v2' IN definition)>=position(consume_block IN definition)
    OR position(consume_block IN definition)>=position('-- PDV_MULTIPLE_VOUCHERS_V4:' IN definition)
    OR position('-- PDV_MULTIPLE_VOUCHERS_V4:' IN definition)>=position('FOR v_payment IN SELECT value FROM jsonb_array_elements(v_payments) LOOP' IN definition) THEN
    RAISE EXCEPTION 'O consumo do cupom precisa ocorrer após a reserva e antes da cobertura.';
  END IF;
  -- CREATE OR REPLACE conserva owner, ACL, assinatura, autorização e replay.
  EXECUTE definition;
END $counter_coupon_order$;
COMMIT;

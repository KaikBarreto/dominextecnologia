-- Um estoque compartilhado não concede acesso aos comprovantes de outro caixa.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $patch$
DECLARE definition text; anchor text; replacement text;
BEGIN
  SELECT pg_get_functiondef('public.pdv_get_delivery_receipt_snapshot_v2(uuid)'::regprocedure)
    INTO definition;
  IF position('PDV_DELIVERY_RECEIPT_CASH_SCOPE_V4' IN definition) = 0 THEN
    anchor := 'SELECT snapshot.* INTO v_row FROM public.pdv_delivery_receipt_snapshots snapshot';
    replacement := $new$-- PDV_DELIVERY_RECEIPT_CASH_SCOPE_V4
  PERFORM public.pdv_assert_order_cash_access_v2(delivery.order_id,v_context.user_id)
    FROM public.pdv_deliveries delivery
    WHERE delivery.id=p_delivery_id AND delivery.company_id=v_context.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seu perfil não permite consultar este comprovante.'
      USING ERRCODE='42501',DETAIL='code=pdv_delivery_receipt_cash_denied';
  END IF;
  SELECT snapshot.* INTO v_row FROM public.pdv_delivery_receipt_snapshots snapshot$new$;
    IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 THEN
      RAISE EXCEPTION 'A leitura de retirada mudou; revise o isolamento de caixa antes de aplicar.';
    END IF;
    EXECUTE replace(definition,anchor,replacement);
  END IF;
END
$patch$;

COMMIT;

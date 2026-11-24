-- O mesmo trigger atende stocks e inventory. Campos exclusivos de stocks só
-- podem ser preparados dentro desse ramo; mantém tenant, papéis e ACL intactos.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $customer_stock_record_shape$
DECLARE definition text; anchor text; replacement text;
BEGIN
 SELECT pg_get_functiondef('public.guard_customer_scoped_stock_write()'::regprocedure) INTO definition;
 anchor:=$anchor$  IF TG_TABLE_NAME = 'stocks' AND NEW.is_default THEN
    RAISE EXCEPTION 'Estoque de cliente não pode ser o estoque principal.' USING ERRCODE = '23514';
  END IF;$anchor$;
 replacement:=$replacement$  IF TG_TABLE_NAME = 'stocks' THEN
    IF NEW.is_default THEN
      RAISE EXCEPTION 'Estoque de cliente não pode ser o estoque principal.' USING ERRCODE = '23514';
    END IF;
  END IF;$replacement$;
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN
  RAISE EXCEPTION 'A proteção do estoque de cliente mudou; revise antes de ajustar o formato do registro';
 END IF;
 EXECUTE replace(definition,anchor,replacement);
END $customer_stock_record_shape$;
-- A rotina só é executada por triggers existentes, nunca pela API.
REVOKE ALL ON FUNCTION public.guard_customer_scoped_stock_write() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;

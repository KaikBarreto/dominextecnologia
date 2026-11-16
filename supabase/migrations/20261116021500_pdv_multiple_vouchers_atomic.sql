-- Uma operação pode consumir vouchers distintos; cada voucher permanece único
-- na operação. Estornos continuam únicos pela entrada original (reversal_of_id).
BEGIN;
DO $constraint$
DECLARE v_columns text[];
BEGIN
  SELECT array_agg(a.attname::text ORDER BY u.n) INTO v_columns
    FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY u(attnum,n)
    JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=u.attnum
   WHERE c.conrelid='public.pdv_voucher_entries'::regclass
     AND c.conname='pdv_voucher_entries_operation_request_id_key' AND c.contype='u';
  IF v_columns IS DISTINCT FROM ARRAY['operation_request_id']::text[] THEN
    RAISE EXCEPTION 'Constraint de idempotência do voucher mudou; revisar antes de migrar';
  END IF;
  ALTER TABLE public.pdv_voucher_entries DROP CONSTRAINT pdv_voucher_entries_operation_request_id_key;
  ALTER TABLE public.pdv_voucher_entries ADD CONSTRAINT pdv_voucher_entries_operation_voucher_key UNIQUE(operation_request_id,voucher_id);
END $constraint$;
DO $direct_vouchers$
DECLARE v_src text; v_old text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure) INTO v_src;
  IF position('PDV_MULTIPLE_VOUCHERS_V4' in v_src)>0 THEN RETURN; END IF;
  v_old:=$anchor$     GROUP BY payment->>'method'
    HAVING count(*) > 1 AND payment->>'method' <> 'fiado'$anchor$;
  v_new:=$anchor$    GROUP BY payment->>'method',CASE WHEN payment->>'method'='voucher' THEN payment->>'reference_id' END
    HAVING count(*)>1 AND payment->>'method'<>'fiado'$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora de vouchers mudou: direct_vouchers'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  v_old:=$anchor$ORDER BY lower(btrim(payment->>'method')),$anchor$;
  v_new:=$anchor$ORDER BY lower(btrim(payment->>'method')),
      CASE WHEN payment->>'method'='voucher' THEN NULLIF(payment->>'reference_id','')::uuid END NULLS FIRST,$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora de vouchers mudou: direct_vouchers'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  v_old:=$anchor$  FOR v_payment IN SELECT value FROM jsonb_array_elements(v_payments) LOOP$anchor$;
  v_new:=$anchor$  -- PDV_MULTIPLE_VOUCHERS_V4: ordem global estável antes de qualquer consumo.
  -- Trigger append-only conserva a verificação de saldo sob o mesmo row lock.
  PERFORM 1 FROM public.pdv_vouchers voucher
   WHERE voucher.company_id=v_company AND voucher.id IN(
     SELECT NULLIF(payment->>'reference_id','')::uuid
       FROM jsonb_array_elements(v_payments) payment WHERE payment->>'method'='voucher'
   ) ORDER BY voucher.id FOR UPDATE;
  FOR v_payment IN SELECT value FROM jsonb_array_elements(v_payments) LOOP$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora de vouchers mudou: direct_vouchers'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  EXECUTE v_src;
END $direct_vouchers$;
DO $counter_vouchers$
DECLARE v_src text; v_old text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.pdv_cover_existing_order_base_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure) INTO v_src;
  IF position('PDV_MULTIPLE_VOUCHERS_V4' in v_src)>0 THEN RETURN; END IF;
  v_old:=$anchor$    GROUP BY payment->>'method' HAVING count(*)>1 AND payment->>'method'<>'fiado'$anchor$;
  v_new:=$anchor$    GROUP BY payment->>'method',CASE WHEN payment->>'method'='voucher' THEN payment->>'reference_id' END
    HAVING count(*)>1 AND payment->>'method'<>'fiado'$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora de vouchers mudou: counter_vouchers'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  v_old:=$anchor$ORDER BY lower(btrim(payment->>'method')),$anchor$;
  v_new:=$anchor$ORDER BY lower(btrim(payment->>'method')),
      CASE WHEN payment->>'method'='voucher' THEN NULLIF(payment->>'reference_id','')::uuid END NULLS FIRST,$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora de vouchers mudou: counter_vouchers'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  v_old:=$anchor$  FOR v_payment IN SELECT value FROM jsonb_array_elements(v_payments) LOOP$anchor$;
  v_new:=$anchor$  -- PDV_MULTIPLE_VOUCHERS_V4: ordem global estável antes de qualquer consumo.
  -- Trigger append-only conserva a verificação de saldo sob o mesmo row lock.
  PERFORM 1 FROM public.pdv_vouchers voucher
   WHERE voucher.company_id=v_context.company_id AND voucher.id IN(
     SELECT NULLIF(payment->>'reference_id','')::uuid
       FROM jsonb_array_elements(v_payments) payment WHERE payment->>'method'='voucher'
   ) ORDER BY voucher.id FOR UPDATE;
  FOR v_payment IN SELECT value FROM jsonb_array_elements(v_payments) LOOP$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora de vouchers mudou: counter_vouchers'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  EXECUTE v_src;
END $counter_vouchers$;
COMMIT;

-- Fiado sem vencimento é intenção explícita. Omissão mantém o contrato antigo
-- e o mesmo hash de replay; NULL não é reinterpretado nas solicitações antigas.
BEGIN;
CREATE OR REPLACE FUNCTION public.pdv_resolve_fiado_due_date_v4(p_payment jsonb,p_fallback date)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE v_date text:=NULLIF(p_payment->>'due_date','');
BEGIN
  IF p_payment?'due_date_mode' AND (jsonb_typeof(p_payment->'due_date_mode')<>'string'
     OR p_payment->>'due_date_mode'<>'none' OR p_payment->>'method' IS DISTINCT FROM 'fiado'
     OR v_date IS NOT NULL) THEN
    RAISE EXCEPTION 'Revise o vencimento do fiado.' USING ERRCODE='22023',DETAIL='code=pdv_fiado_due_date_invalid';
  END IF;
  IF p_payment->>'due_date_mode'='none' THEN RETURN NULL; END IF;
  IF v_date IS NOT NULL AND v_date!~'^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Informe uma data de vencimento válida.' USING ERRCODE='22023',DETAIL='code=pdv_fiado_due_date_invalid';
  END IF;
  RETURN COALESCE(v_date::date,p_fallback);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RAISE EXCEPTION 'Informe uma data de vencimento válida.' USING ERRCODE='22023',DETAIL='code=pdv_fiado_due_date_invalid';
END $fn$;
CREATE OR REPLACE FUNCTION public.pdv_validate_fiado_dates_v4(p_payments jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE v_payment jsonb;
BEGIN
  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    PERFORM public.pdv_resolve_fiado_due_date_v4(v_payment,NULL);
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payments) p WHERE p->>'due_date_mode'='none')
    AND (SELECT count(*) FROM jsonb_array_elements(p_payments) p WHERE p->>'method'='fiado')>1 THEN
    RAISE EXCEPTION 'Informe o primeiro vencimento para parcelar o fiado.' USING ERRCODE='22023',DETAIL='code=pdv_fiado_installments_due_required';
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_resolve_fiado_due_date_v4(jsonb,date),public.pdv_validate_fiado_dates_v4(jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- Helpers internos: executados pelos writers SECURITY DEFINER, sem nova API de mutação.
DO $direct_due$
DECLARE v_src text; v_old text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure) INTO v_src;
  IF position('PDV_EXPLICIT_DUE_DATE_V4' in v_src)>0 THEN RETURN; END IF;
  v_old:=$anchor$'method','amount','change_amount','account_id','due_date','reference_id'$anchor$;
  v_new:=$anchor$'method','amount','change_amount','account_id','due_date','reference_id','due_date_mode'$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora do vencimento mudou: direct_due'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  v_old:=$anchor$jsonb_agg(jsonb_build_object(
      'method'$anchor$;
  v_new:=$anchor$jsonb_agg((jsonb_build_object(
      'method'$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora do vencimento mudou: direct_due'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  v_old:=$anchor$'reference_id', NULLIF(payment->>'reference_id','')::uuid$anchor$;
  v_new:=$anchor$'reference_id', NULLIF(payment->>'reference_id','')::uuid) || CASE WHEN payment->>'due_date_mode'='none' THEN jsonb_build_object('due_date_mode','none') ELSE '{}'::jsonb END$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora do vencimento mudou: direct_due'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  v_old:=$anchor$  v_payments := COALESCE(v_payments, '[]'::jsonb);$anchor$;
  v_new:=$anchor$  -- PDV_EXPLICIT_DUE_DATE_V4
  PERFORM public.pdv_validate_fiado_dates_v4(p_payments);
  v_payments := COALESCE(v_payments, '[]'::jsonb);$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora do vencimento mudou: direct_due'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  v_old:=$anchor$v_due_date := COALESCE(
        NULLIF(v_payment->>'due_date','')::date,
        (v_transaction_date + interval '1 month')::date
      );$anchor$;
  v_new:=$anchor$v_due_date := public.pdv_resolve_fiado_due_date_v4(v_payment,(v_transaction_date + interval '1 month')::date);$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora do vencimento mudou: direct_due'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  EXECUTE v_src;
END $direct_due$;

DO $counter_due$
DECLARE v_src text; v_old text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.pdv_cover_existing_order_base_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure) INTO v_src;
  IF position('PDV_EXPLICIT_DUE_DATE_V4' in v_src)>0 THEN RETURN; END IF;
  v_old:=$anchor$'method','amount','account_id','due_date','reference_id'$anchor$;
  v_new:=$anchor$'method','amount','account_id','due_date','reference_id','due_date_mode'$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora do vencimento mudou: counter_due'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  v_old:=$anchor$jsonb_agg(jsonb_build_object(
      'method'$anchor$;
  v_new:=$anchor$jsonb_agg((jsonb_build_object(
      'method'$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora do vencimento mudou: counter_due'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  v_old:=$anchor$'reference_id',NULLIF(payment->>'reference_id','')::uuid$anchor$;
  v_new:=$anchor$'reference_id',NULLIF(payment->>'reference_id','')::uuid) || CASE WHEN payment->>'due_date_mode'='none' THEN jsonb_build_object('due_date_mode','none') ELSE '{}'::jsonb END$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora do vencimento mudou: counter_due'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  v_old:=$anchor$  SELECT array_agg(account_id ORDER BY account_id) INTO v_account_ids FROM($anchor$;
  v_new:=$anchor$  -- PDV_EXPLICIT_DUE_DATE_V4
  PERFORM public.pdv_validate_fiado_dates_v4(p_payments);
  SELECT array_agg(account_id ORDER BY account_id) INTO v_account_ids FROM($anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora do vencimento mudou: counter_due'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  v_old:=$anchor$v_due_date:=COALESCE(NULLIF(v_payment->>'due_date','')::date,(v_today+interval '1 month')::date);$anchor$;
  v_new:=$anchor$v_due_date:=public.pdv_resolve_fiado_due_date_v4(v_payment,(v_today+interval '1 month')::date);$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora do vencimento mudou: counter_due'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  EXECUTE v_src;
END $counter_due$;

DO $legacy_due$
DECLARE v_src text; v_old text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.pdv_settle_order(uuid,jsonb,text,date)'::regprocedure) INTO v_src;
  IF position('PDV_EXPLICIT_DUE_DATE_V4' in v_src)>0 THEN RETURN; END IF;
  v_old:=$anchor$v_due := COALESCE(NULLIF(v_pay->>'due_date', '')::date, (v_eff_date + interval '1 month')::date);$anchor$;
  v_new:=$anchor$v_due := public.pdv_resolve_fiado_due_date_v4(v_pay,(v_eff_date + interval '1 month')::date);$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora do vencimento mudou: legacy_due'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  v_old:=$anchor$  -- Daqui pra baixo GRAVA.$anchor$;
  v_new:=$anchor$  -- PDV_EXPLICIT_DUE_DATE_V4
  PERFORM public.pdv_validate_fiado_dates_v4(p_payments);

  -- Daqui pra baixo GRAVA.$anchor$;
  IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Âncora do vencimento mudou: legacy_due'; END IF;
  v_src:=replace(v_src,v_old,v_new);
  EXECUTE v_src;
END $legacy_due$;

COMMIT;

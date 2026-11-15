BEGIN;
ALTER TABLE public.ledger_asaas ADD COLUMN IF NOT EXISTS asaas_transfer_id text;
CREATE INDEX IF NOT EXISTS admin_ledger_transfer_id ON public.ledger_asaas(asaas_transfer_id) WHERE asaas_transfer_id IS NOT NULL;
CREATE FUNCTION public.record_admin_asaas_ledger(p_entries jsonb,p_source text DEFAULT 'webhook')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE e jsonb; previous public.ledger_asaas%ROWTYPE; financial public.admin_financial_transactions%ROWTYPE;
 key text; payment_id text; transfer_id text; event_type text; movement_type text; value numeric; family text[]; n integer:=0; candidate_count integer; canonical_key text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF p_source IS NULL OR p_source NOT IN ('webhook','sync') OR p_entries IS NULL OR jsonb_typeof(p_entries)<>'array' OR jsonb_array_length(p_entries)>30 THEN RAISE EXCEPTION 'invalid_movements'; END IF;
 FOR e IN SELECT item FROM jsonb_array_elements(p_entries) AS x(item) ORDER BY item->>'asaas_transaction_id' LOOP
  key:=e->>'asaas_transaction_id';payment_id:=nullif(e->>'asaas_payment_id','');transfer_id:=coalesce(nullif(e->>'asaas_transfer_id',''),e->'raw_payload'->>'transferId');event_type:=e->>'asaas_event_type';value:=(e->>'amount')::numeric;
  IF key IS NULL OR event_type IS NULL OR value IS NULL OR value<=0 OR value::text IN ('NaN','Infinity','-Infinity') OR value<>round(value,2) OR e->>'direction' IS NULL OR e->>'direction' NOT IN ('credit','debit') THEN RAISE EXCEPTION 'invalid_movement'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_asaas:'||coalesce(payment_id,transfer_id,key),0));
  movement_type:=CASE WHEN e->>'direction'='credit' THEN 'income' ELSE 'expense' END;
  family:=CASE WHEN event_type IN ('PAYMENT_RECEIVED','PAYMENT_CONFIRMED') THEN ARRAY['PAYMENT_RECEIVED','PAYMENT_CONFIRMED'] WHEN event_type IN ('TRANSFER','TRANSFER_DONE') THEN ARRAY['TRANSFER','TRANSFER_DONE'] WHEN event_type IN ('PAYMENT_REFUND','PAYMENT_REFUNDED') THEN ARRAY['PAYMENT_REFUND','PAYMENT_REFUNDED'] ELSE ARRAY[event_type] END;
  SELECT * INTO previous FROM public.ledger_asaas WHERE asaas_transaction_id=key FOR UPDATE;
  IF NOT FOUND AND (payment_id IS NOT NULL OR transfer_id IS NOT NULL) THEN
   SELECT count(*) INTO candidate_count FROM public.ledger_asaas l WHERE
    (CASE WHEN payment_id IS NOT NULL THEN l.asaas_payment_id=payment_id ELSE coalesce(l.asaas_transfer_id,l.raw_payload->>'transferId',l.raw_payload->'transfer'->>'id')=transfer_id END)
    AND l.direction=e->>'direction' AND l.amount=value AND (l.asaas_event_type=ANY(family) OR (l.asaas_event_type IS NULL AND e->>'direction'='credit' AND event_type='PAYMENT_RECEIVED'));
   IF candidate_count>1 THEN RAISE EXCEPTION 'ambiguous_movement_identity'; END IF;
   IF candidate_count=1 THEN
    SELECT * INTO previous FROM public.ledger_asaas l WHERE
     (CASE WHEN payment_id IS NOT NULL THEN l.asaas_payment_id=payment_id ELSE coalesce(l.asaas_transfer_id,l.raw_payload->>'transferId',l.raw_payload->'transfer'->>'id')=transfer_id END)
     AND l.direction=e->>'direction' AND l.amount=value AND (l.asaas_event_type=ANY(family) OR (l.asaas_event_type IS NULL AND e->>'direction'='credit' AND event_type='PAYMENT_RECEIVED')) FOR UPDATE;
   END IF;
  END IF;
  IF previous.id IS NOT NULL AND previous.amount<>value THEN RAISE EXCEPTION 'movement_amount_conflict'; END IF;
  canonical_key:=CASE WHEN event_type IN ('PAYMENT_RECEIVED','PAYMENT_CONFIRMED') THEN payment_id WHEN event_type='PAYMENT_FEE' THEN payment_id||'_fee' WHEN event_type='RECEIVABLE_ANTICIPATION_FEE' THEN payment_id||'_anticipation_fee' ELSE key END;
  SELECT * INTO financial FROM public.admin_financial_transactions WHERE (id=previous.admin_financial_transaction_id OR asaas_transaction_id=canonical_key OR asaas_transaction_id=key) AND type=movement_type AND amount=value ORDER BY (id=previous.admin_financial_transaction_id) DESC NULLS LAST LIMIT 1;
  IF financial.id IS NULL AND event_type ~ '_FEE$' THEN
   INSERT INTO public.admin_financial_transactions(type,category,amount,description,asaas_transaction_id,transaction_date,reference_type)
   VALUES('expense',CASE WHEN event_type='RECEIVABLE_ANTICIPATION_FEE' THEN 'asaas_anticipation_fee' ELSE 'asaas_fee' END,value,coalesce(e->>'description','Tarifa Asaas'),coalesce(canonical_key,key),(e->>'occurred_at')::timestamptz,'asaas_fee')
   ON CONFLICT DO NOTHING;
   SELECT * INTO financial FROM public.admin_financial_transactions WHERE asaas_transaction_id=coalesce(canonical_key,key) AND type='expense' AND amount=value;
   IF financial.id IS NULL THEN RAISE EXCEPTION 'fee_identity_conflict'; END IF;
  END IF;
  IF previous.id IS NULL THEN
   INSERT INTO public.ledger_asaas(asaas_transaction_id,asaas_payment_id,asaas_transfer_id,asaas_event_type,direction,amount,occurred_at,description,category,status,source,admin_financial_transaction_id,raw_payload)
   VALUES(key,payment_id,transfer_id,event_type,e->>'direction',value,(e->>'occurred_at')::timestamptz,e->>'description',financial.category,CASE WHEN financial.id IS NOT NULL THEN 'auto_categorized' ELSE 'pending_categorization' END,p_source,financial.id,coalesce(e->'raw_payload','{}'));
  ELSE
   UPDATE public.ledger_asaas SET
    asaas_transaction_id=CASE WHEN p_source='sync' THEN key ELSE asaas_transaction_id END,
    asaas_transfer_id=coalesce(asaas_transfer_id,transfer_id),
    asaas_event_type=CASE WHEN source='sync' AND p_source='webhook' THEN asaas_event_type ELSE event_type END,
    source=CASE WHEN source='sync' THEN source ELSE p_source END,
    raw_payload=CASE WHEN source='sync' AND p_source='webhook' THEN raw_payload WHEN p_source='webhook' AND coalesce(raw_payload->'payment'->>'status',raw_payload->>'status')='RECEIVED' AND e->'raw_payload'->'payment'->>'status'='CONFIRMED' THEN raw_payload ELSE coalesce(e->'raw_payload',raw_payload) END,
    occurred_at=CASE WHEN p_source='sync' OR (source='webhook' AND coalesce(raw_payload->'payment'->>'status',raw_payload->>'status','')<>'RECEIVED') THEN (e->>'occurred_at')::timestamptz ELSE occurred_at END,
    description=coalesce(description,e->>'description'),
    status=CASE WHEN status='manually_categorized' THEN status WHEN financial.id IS NOT NULL THEN 'auto_categorized' ELSE status END,
    category=CASE WHEN status='manually_categorized' THEN category ELSE coalesce(financial.category,category) END,
    admin_financial_transaction_id=coalesce(admin_financial_transaction_id,financial.id),updated_at=now()
   WHERE id=previous.id;
  END IF;
  n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'recorded',n);
END;$fn$;
REVOKE ALL ON FUNCTION public.record_admin_asaas_ledger(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_admin_asaas_ledger(jsonb,text) TO service_role;
COMMIT;

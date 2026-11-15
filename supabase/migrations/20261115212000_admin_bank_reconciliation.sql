BEGIN;
CREATE TABLE public.admin_bank_reconciliation_requests (
 id uuid PRIMARY KEY, transaction_id uuid NOT NULL REFERENCES public.admin_bank_transactions(id),
 actor_id uuid NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.admin_bank_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bank_transaction_id uuid NOT NULL REFERENCES public.admin_bank_transactions(id),
 admin_transaction_id uuid REFERENCES public.admin_financial_transactions(id) ON DELETE SET NULL,
 amount numeric(18,2) NOT NULL CHECK(amount>0 AND amount::text NOT IN ('NaN','Infinity','-Infinity')),
 created_financial boolean NOT NULL DEFAULT false, original_transaction jsonb,
 active boolean NOT NULL DEFAULT true, created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
 reversed_by uuid, reversed_at timestamptz
);
CREATE INDEX admin_bank_allocations_movement ON public.admin_bank_allocations(bank_transaction_id) WHERE active;
CREATE INDEX admin_bank_allocations_financial ON public.admin_bank_allocations(admin_transaction_id) WHERE active;
CREATE TABLE public.admin_bank_transfers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 debit_bank_transaction_id uuid REFERENCES public.admin_bank_transactions(id), credit_bank_transaction_id uuid REFERENCES public.admin_bank_transactions(id),
 debit_ledger_id uuid REFERENCES public.ledger_asaas(id), credit_ledger_id uuid REFERENCES public.ledger_asaas(id),
 amount numeric(18,2) NOT NULL CHECK(amount>0), active boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL DEFAULT auth.uid(),created_at timestamptz NOT NULL DEFAULT now(),reversed_by uuid,reversed_at timestamptz,
 CHECK(num_nonnulls(debit_bank_transaction_id,debit_ledger_id)=1),CHECK(num_nonnulls(credit_bank_transaction_id,credit_ledger_id)=1)
);
CREATE UNIQUE INDEX admin_transfer_debit_bank_unique ON public.admin_bank_transfers(debit_bank_transaction_id) WHERE active;
CREATE UNIQUE INDEX admin_transfer_credit_bank_unique ON public.admin_bank_transfers(credit_bank_transaction_id) WHERE active;
CREATE UNIQUE INDEX admin_transfer_debit_ledger_unique ON public.admin_bank_transfers(debit_ledger_id) WHERE active;
CREATE UNIQUE INDEX admin_transfer_credit_ledger_unique ON public.admin_bank_transfers(credit_ledger_id) WHERE active;
ALTER TABLE public.admin_bank_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_bank_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_bank_reconciliation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_bank_allocations_read ON public.admin_bank_allocations FOR SELECT TO authenticated USING (public.can_read_admin_financial(auth.uid()));
CREATE POLICY admin_bank_transfers_read ON public.admin_bank_transfers FOR SELECT TO authenticated USING (public.can_read_admin_financial(auth.uid()));
REVOKE ALL ON public.admin_bank_allocations,public.admin_bank_transfers,public.admin_bank_reconciliation_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.admin_bank_allocations,public.admin_bank_transfers TO authenticated;
GRANT ALL ON public.admin_bank_allocations,public.admin_bank_transfers,public.admin_bank_reconciliation_requests TO service_role;
CREATE VIEW public.admin_bank_reconciliation_movements WITH(security_invoker=true) AS
SELECT b.*,coalesce(a.allocated_amount,0) allocated_amount,
 CASE WHEN t.id IS NOT NULL THEN 'transferred' WHEN coalesce(a.allocated_amount,0)>=abs(b.amount) THEN 'reconciled' WHEN coalesce(a.allocated_amount,0)>0 THEN 'partial' ELSE 'pending' END reconciliation_status,
 t.id transfer_id
FROM public.admin_bank_transactions b
LEFT JOIN LATERAL(SELECT sum(amount) allocated_amount FROM public.admin_bank_allocations WHERE bank_transaction_id=b.id AND active) a ON true
LEFT JOIN public.admin_bank_transfers t ON t.active AND (t.credit_bank_transaction_id=b.id OR t.debit_bank_transaction_id=b.id);
REVOKE ALL ON public.admin_bank_reconciliation_movements FROM PUBLIC,anon;
GRANT SELECT ON public.admin_bank_reconciliation_movements TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_reconcile_bank_transaction(p_request_id uuid,p_transaction_id uuid,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE b public.admin_bank_transactions%ROWTYPE; previous public.admin_bank_reconciliation_requests%ROWTYPE;
 tx public.admin_financial_transactions%ROWTYPE; item jsonb; v_amount numeric; v_sum numeric:=0; v_available numeric; v_type text; v_created boolean; v_tx_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_manage_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF p_request_id IS NULL OR p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid_allocation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('bank_request:'||p_request_id::text,0));
 SELECT * INTO previous FROM public.admin_bank_reconciliation_requests WHERE id=p_request_id;
 IF FOUND THEN
  IF previous.transaction_id IS DISTINCT FROM p_transaction_id OR previous.actor_id IS DISTINCT FROM auth.uid() OR previous.payload IS DISTINCT FROM p_items THEN RAISE EXCEPTION 'request_conflict'; END IF;
  RETURN jsonb_build_object('ok',true,'already_processed',true);
 END IF;
 SELECT * INTO b FROM public.admin_bank_transactions WHERE id=p_transaction_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'movement_not_found'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_bank_transfers WHERE active AND (credit_bank_transaction_id=b.id OR debit_bank_transaction_id=b.id)) THEN RAISE EXCEPTION 'movement_is_transfer'; END IF;
 SELECT abs(b.amount)-coalesce(sum(amount),0) INTO v_available FROM public.admin_bank_allocations WHERE bank_transaction_id=b.id AND active;
 IF v_available<=0 THEN RAISE EXCEPTION 'already_reconciled'; END IF;
 v_type:=CASE WHEN b.amount>0 THEN 'income' ELSE 'expense' END;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY coalesce(value->>'transaction_id','') LOOP
  v_amount:=(item->>'amount')::numeric;
  IF v_amount IS NULL OR v_amount<=0 OR v_amount::text IN ('NaN','Infinity','-Infinity') OR v_amount<>round(v_amount,2) THEN RAISE EXCEPTION 'invalid_allocation'; END IF;
  v_sum:=v_sum+v_amount;
  IF v_sum>v_available THEN RAISE EXCEPTION 'allocation_exceeds_movement'; END IF;
  v_created:=nullif(item->>'transaction_id','') IS NULL;
  IF NOT v_created THEN
   SELECT * INTO tx FROM public.admin_financial_transactions WHERE id=(item->>'transaction_id')::uuid FOR UPDATE;
   IF NOT FOUND OR tx.type<>v_type OR tx.asaas_transaction_id IS NOT NULL OR coalesce((to_jsonb(tx)->>'voided')::boolean,false) THEN RAISE EXCEPTION 'incompatible_financial_transaction'; END IF;
   IF v_amount>tx.amount-(SELECT coalesce(sum(amount),0) FROM public.admin_bank_allocations WHERE admin_transaction_id=tx.id AND active) THEN RAISE EXCEPTION 'allocation_exceeds_financial_transaction'; END IF;
   v_tx_id:=tx.id;
  ELSE
   IF item->>'category' IN ('sale','first_sale','renewal','upgrade') THEN RAISE EXCEPTION 'company_payment_required'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.admin_financial_categories c WHERE c.name=item->>'category' AND c.type=v_type AND coalesce((to_jsonb(c)->>'is_active')::boolean,true)) THEN RAISE EXCEPTION 'invalid_category'; END IF;
   INSERT INTO public.admin_financial_transactions(type,category,amount,transaction_date,description,reference_type,created_by)
   VALUES(v_type,item->>'category',v_amount,b.occurred_at,coalesce(nullif(item->>'description',''),b.description),'admin_bank_classification',auth.uid()) RETURNING * INTO tx;
   v_tx_id:=tx.id;
  END IF;
  INSERT INTO public.admin_bank_allocations(bank_transaction_id,admin_transaction_id,amount,created_financial,original_transaction)
  VALUES(b.id,v_tx_id,v_amount,v_created,to_jsonb(tx));
 END LOOP;
 INSERT INTO public.admin_bank_reconciliation_requests(id,transaction_id,actor_id,payload) VALUES(p_request_id,b.id,auth.uid(),p_items);
 RETURN jsonb_build_object('ok',true,'allocated',v_sum,'remaining',v_available-v_sum);
END;$fn$;

CREATE OR REPLACE FUNCTION public.admin_unreconcile_bank_transaction(p_transaction_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE allocation public.admin_bank_allocations%ROWTYPE; tx public.admin_financial_transactions%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_manage_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 PERFORM 1 FROM public.admin_bank_transactions WHERE id=p_transaction_id FOR UPDATE;
 FOR allocation IN SELECT * FROM public.admin_bank_allocations WHERE bank_transaction_id=p_transaction_id AND active ORDER BY admin_transaction_id FOR UPDATE LOOP
  IF allocation.created_financial THEN
   SELECT * INTO tx FROM public.admin_financial_transactions WHERE id=allocation.admin_transaction_id FOR UPDATE;
   IF NOT FOUND OR (to_jsonb(tx)-'updated_at') IS DISTINCT FROM (allocation.original_transaction-'updated_at') OR tx.reference_type<>'admin_bank_classification' OR tx.amount IS DISTINCT FROM (allocation.original_transaction->>'amount')::numeric OR tx.category IS DISTINCT FROM allocation.original_transaction->>'category' OR tx.description IS DISTINCT FROM allocation.original_transaction->>'description' OR EXISTS(SELECT 1 FROM public.admin_bank_allocations WHERE active AND admin_transaction_id=tx.id AND id<>allocation.id) THEN RAISE EXCEPTION 'financial_transaction_changed'; END IF;
   UPDATE public.admin_bank_allocations SET active=false,reversed_at=now(),reversed_by=auth.uid() WHERE id=allocation.id;
   DELETE FROM public.admin_financial_transactions WHERE id=tx.id;
  ELSE
   UPDATE public.admin_bank_allocations SET active=false,reversed_at=now(),reversed_by=auth.uid() WHERE id=allocation.id;
  END IF;
 END LOOP;
 UPDATE public.admin_bank_transfers SET active=false,reversed_at=now(),reversed_by=auth.uid() WHERE active AND (debit_bank_transaction_id=p_transaction_id OR credit_bank_transaction_id=p_transaction_id);
END;$fn$;

CREATE OR REPLACE FUNCTION public.admin_bank_match_candidates(p_transaction_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE b public.admin_bank_transactions%ROWTYPE; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_read_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 SELECT * INTO b FROM public.admin_bank_transactions WHERE id=p_transaction_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'movement_not_found'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(candidates)),'[]'::jsonb) INTO result FROM (
  SELECT t.id,t.description,t.category,t.transaction_date,t.amount, t.amount-coalesce(a.allocated,0) available
  FROM public.admin_financial_transactions t
  LEFT JOIN LATERAL(SELECT sum(amount) allocated FROM public.admin_bank_allocations WHERE admin_transaction_id=t.id AND active)a ON true
  WHERE t.type=CASE WHEN b.amount>0 THEN 'income' ELSE 'expense' END AND t.asaas_transaction_id IS NULL AND NOT coalesce((to_jsonb(t)->>'voided')::boolean,false)
  AND t.transaction_date>=b.occurred_at-interval '90 days' AND t.transaction_date<b.occurred_at+interval '91 days'
  AND t.amount>coalesce(a.allocated,0) ORDER BY abs(t.amount-abs(b.amount)),t.transaction_date DESC,t.id LIMIT 30
 ) candidates;
 RETURN result;
END;$fn$;
REVOKE ALL ON FUNCTION public.admin_reconcile_bank_transaction(uuid,uuid,jsonb),public.admin_unreconcile_bank_transaction(uuid),public.admin_bank_match_candidates(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_reconcile_bank_transaction(uuid,uuid,jsonb),public.admin_unreconcile_bank_transaction(uuid),public.admin_bank_match_candidates(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_bank_transfer_candidates(p_transaction_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE b public.admin_bank_transactions%ROWTYPE; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_read_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 SELECT * INTO b FROM public.admin_bank_transactions WHERE id=p_transaction_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'movement_not_found'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) INTO result FROM (
 SELECT t.id,'bank'::text source,t.description,t.occurred_at,t.amount,a.name account_name
 FROM public.admin_bank_transactions t JOIN public.admin_bank_accounts a ON a.id=t.bank_account_id
 WHERE t.bank_account_id<>b.bank_account_id AND t.amount=-b.amount AND abs(extract(epoch FROM t.occurred_at-b.occurred_at))<=604800
 AND NOT EXISTS(SELECT 1 FROM public.admin_bank_allocations WHERE active AND bank_transaction_id=t.id)
 AND NOT EXISTS(SELECT 1 FROM public.admin_bank_transfers WHERE active AND (debit_bank_transaction_id=t.id OR credit_bank_transaction_id=t.id))
 UNION ALL
 SELECT l.id,'asaas',coalesce(l.raw_payload->>'description','Movimento Asaas'),l.occurred_at,CASE WHEN l.direction='credit' THEN l.amount ELSE -l.amount END,'Asaas'
 FROM public.admin_realized_asaas_movements l
 WHERE l.amount=abs(b.amount) AND l.direction=CASE WHEN b.amount>0 THEN 'debit' ELSE 'credit' END
 AND abs(extract(epoch FROM l.occurred_at-b.occurred_at))<=604800
 AND NOT EXISTS(SELECT 1 FROM public.admin_bank_transfers WHERE active AND (debit_ledger_id=l.id OR credit_ledger_id=l.id))
 ORDER BY occurred_at DESC LIMIT 50
 ) c;
 RETURN result;
END;$fn$;
CREATE OR REPLACE FUNCTION public.admin_match_bank_transfer(p_transaction_id uuid,p_counterpart_id uuid,p_counterpart_source text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE b public.admin_bank_transactions%ROWTYPE; other public.admin_bank_transactions%ROWTYPE; l public.ledger_asaas%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_manage_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF p_counterpart_source NOT IN ('bank','asaas') OR p_counterpart_source IS NULL OR p_counterpart_id IS NULL THEN RAISE EXCEPTION 'invalid_transfer'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_bank_transfer',0));
 PERFORM 1 FROM public.admin_bank_transactions WHERE id=p_transaction_id OR (p_counterpart_source='bank' AND id=p_counterpart_id) ORDER BY id FOR UPDATE;
 SELECT * INTO b FROM public.admin_bank_transactions WHERE id=p_transaction_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'movement_not_found'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_bank_transfers WHERE active AND ((debit_bank_transaction_id=b.id AND ((p_counterpart_source='bank' AND credit_bank_transaction_id=p_counterpart_id) OR (p_counterpart_source='asaas' AND credit_ledger_id=p_counterpart_id))) OR (credit_bank_transaction_id=b.id AND ((p_counterpart_source='bank' AND debit_bank_transaction_id=p_counterpart_id) OR (p_counterpart_source='asaas' AND debit_ledger_id=p_counterpart_id))))) THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_bank_allocations WHERE active AND bank_transaction_id=b.id) OR EXISTS(SELECT 1 FROM public.admin_bank_transfers WHERE active AND (debit_bank_transaction_id=b.id OR credit_bank_transaction_id=b.id)) THEN RAISE EXCEPTION 'movement_already_linked'; END IF;
 IF p_counterpart_source='bank' THEN
  SELECT * INTO other FROM public.admin_bank_transactions WHERE id=p_counterpart_id;
  IF NOT FOUND OR other.bank_account_id=b.bank_account_id OR other.amount<>-b.amount OR abs(extract(epoch FROM other.occurred_at-b.occurred_at))>604800 THEN RAISE EXCEPTION 'transfer_mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM public.admin_bank_allocations WHERE active AND bank_transaction_id=other.id) OR EXISTS(SELECT 1 FROM public.admin_bank_transfers WHERE active AND (debit_bank_transaction_id=other.id OR credit_bank_transaction_id=other.id)) THEN RAISE EXCEPTION 'movement_already_linked'; END IF;
  INSERT INTO public.admin_bank_transfers(debit_bank_transaction_id,credit_bank_transaction_id,amount)
  VALUES(CASE WHEN b.amount<0 THEN b.id ELSE other.id END,CASE WHEN b.amount>0 THEN b.id ELSE other.id END,abs(b.amount));
 ELSE
  SELECT * INTO l FROM public.ledger_asaas WHERE id=p_counterpart_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.admin_realized_asaas_movements WHERE id=l.id) OR l.amount<>abs(b.amount) OR l.direction<>(CASE WHEN b.amount>0 THEN 'debit' ELSE 'credit' END) OR abs(extract(epoch FROM l.occurred_at-b.occurred_at))>604800 THEN RAISE EXCEPTION 'transfer_mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM public.admin_bank_transfers WHERE active AND (debit_ledger_id=l.id OR credit_ledger_id=l.id)) THEN RAISE EXCEPTION 'movement_already_linked'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.admin_financial_categories c WHERE c.name=l.category AND c.type=CASE WHEN l.direction='credit' THEN 'income' ELSE 'expense' END AND c.affects_result=false) THEN RAISE EXCEPTION 'classify_asaas_transfer_first'; END IF;
  INSERT INTO public.admin_bank_transfers(debit_bank_transaction_id,credit_bank_transaction_id,debit_ledger_id,credit_ledger_id,amount)
  VALUES(CASE WHEN b.amount<0 THEN b.id END,CASE WHEN b.amount>0 THEN b.id END,CASE WHEN b.amount>0 THEN l.id END,CASE WHEN b.amount<0 THEN l.id END,abs(b.amount));
 END IF;
END;$fn$;
REVOKE ALL ON FUNCTION public.admin_bank_transfer_candidates(uuid),public.admin_match_bank_transfer(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_bank_transfer_candidates(uuid),public.admin_match_bank_transfer(uuid,uuid,text) TO authenticated;
COMMIT;

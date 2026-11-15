BEGIN;
CREATE OR REPLACE FUNCTION public.admin_categorize_ledger(p_ledger_id uuid,p_category text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_ledger public.ledger_asaas%ROWTYPE; v_tx public.admin_financial_transactions%ROWTYPE; v_type text; v_tx_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_manage_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 SELECT * INTO v_ledger FROM public.ledger_asaas WHERE id=p_ledger_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'movement_not_found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_realized_asaas_movements WHERE id=p_ledger_id) THEN RAISE EXCEPTION 'movement_not_settled'; END IF;
 v_type:=CASE WHEN v_ledger.direction='credit' THEN 'income' ELSE 'expense' END;
 IF p_category IN ('sale','first_sale','renewal','upgrade') THEN RAISE EXCEPTION 'company_payment_required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_financial_categories WHERE name=p_category AND type=v_type AND is_active) THEN RAISE EXCEPTION 'invalid_category'; END IF;
 v_tx_id:=v_ledger.admin_financial_transaction_id;
 IF v_tx_id IS NULL AND v_ledger.asaas_transaction_id IS NOT NULL THEN
  SELECT id INTO v_tx_id FROM public.admin_financial_transactions WHERE asaas_transaction_id=v_ledger.asaas_transaction_id;
 END IF;
 IF v_tx_id IS NOT NULL THEN
  SELECT * INTO v_tx FROM public.admin_financial_transactions WHERE id=v_tx_id FOR UPDATE;
  IF NOT FOUND OR v_tx.type<>v_type OR v_tx.amount<>v_ledger.amount OR v_tx.category IN ('sale','first_sale','renewal','upgrade') THEN RAISE EXCEPTION 'linked_movement_mismatch'; END IF;
  UPDATE public.admin_financial_transactions SET category=p_category WHERE id=v_tx_id;
 ELSE
  INSERT INTO public.admin_financial_transactions(type,category,amount,transaction_date,description,asaas_transaction_id,reference_type,created_by)
  VALUES(v_type,p_category,v_ledger.amount,v_ledger.occurred_at,v_ledger.description,v_ledger.asaas_transaction_id,'asaas_ledger_categorized',auth.uid()) RETURNING id INTO v_tx_id;
 END IF;
 UPDATE public.ledger_asaas SET category=p_category,status='manually_categorized',admin_financial_transaction_id=v_tx_id WHERE id=p_ledger_id;
END;$fn$;
REVOKE ALL ON FUNCTION public.admin_categorize_ledger(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_categorize_ledger(uuid,text) TO authenticated;
COMMIT;

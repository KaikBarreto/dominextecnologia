-- OS e Contas a Receber compartilham a mesma baixa atômica e idempotente.
-- O canal financeiro só recebe uma dívida existente, preserva o tratamento de
-- cobrança online da tela e não autoriza faturar/criar OS sem permissão própria.
BEGIN;
DROP FUNCTION public.bill_os_receive_payment(uuid,uuid,uuid,numeric,numeric,numeric,uuid,text,date,date,text,numeric,text,text);
CREATE OR REPLACE FUNCTION public.bill_os_receive_payment(
 p_os_id uuid,p_request_id uuid,p_transaction_id uuid DEFAULT NULL,p_total numeric DEFAULT NULL,
 p_received numeric DEFAULT 0,p_expected_received numeric DEFAULT NULL,p_account_id uuid DEFAULT NULL,
 p_method text DEFAULT NULL,p_paid_date date DEFAULT NULL,p_due_date date DEFAULT NULL,
 p_category text DEFAULT NULL,p_fee numeric DEFAULT 0,p_fee_category text DEFAULT NULL,p_notes text DEFAULT NULL,
 p_from_finance boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_so public.service_orders%ROWTYPE; v_parent public.financial_transactions%ROWTYPE;
 v_previous public.os_commercial_requests%ROWTYPE; v_payload jsonb; v_result jsonb;
 v_payment_id uuid; v_remaining numeric; v_today date;
BEGIN
 -- Receber uma conta já faturada exige permissão financeira; criar dívida continua
 -- exigindo também a permissão da OS. Nenhuma identidade é aceita do cliente.
 IF auth.uid() IS NULL OR NOT public.can_manage_finance_transactions_current_user() OR NOT EXISTS(
  SELECT 1 FROM public.service_orders so WHERE so.id=p_os_id AND so.entry_type IS DISTINCT FROM 'tarefa'
   AND (public.is_super_admin(auth.uid()) OR (so.company_id=public.get_user_company_id(auth.uid())
    AND public.tenant_subscription_allows_access(so.company_id)
    AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.company_id=so.company_id AND p.is_active)))
 ) THEN RAISE EXCEPTION 'Sem permissão para receber nesta conta.' USING ERRCODE='42501'; END IF;
 IF COALESCE(p_from_finance,false) THEN
  IF p_transaction_id IS NULL THEN
   RAISE EXCEPTION 'Selecione uma conta já faturada.' USING ERRCODE='OSC03';
  END IF;
 ELSIF NOT public.can_work_os_commercial(p_os_id) OR NOT (
  public.is_super_admin(auth.uid()) OR public.is_admin_or_gestor(auth.uid()) OR EXISTS(
   SELECT 1 FROM public.user_permissions WHERE user_id=auth.uid() AND is_active
    AND (permissions ? '*' OR permissions ? 'fn:os_finish_revenue'))
 ) THEN RAISE EXCEPTION 'Sem permissão para faturar a OS.' USING ERRCODE='42501'; END IF;
 PERFORM public._lock_os_commercial(p_os_id);
 SELECT * INTO v_so FROM public.service_orders WHERE id=p_os_id FOR UPDATE;
 v_payload:=jsonb_build_object('operation','receive','parent',p_transaction_id,'total',p_total,'received',p_received,
  'expected_received',p_expected_received,'account',p_account_id,'method',p_method,'date',p_paid_date,
  'due',p_due_date,'category',p_category,'fee',p_fee,'fee_category',p_fee_category,'notes',p_notes);
 IF COALESCE(p_from_finance,false) THEN v_payload:=v_payload||jsonb_build_object('from_finance',true); END IF;
 SELECT * INTO v_previous FROM public.os_commercial_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_previous.user_id<>auth.uid() OR v_previous.service_order_id<>p_os_id OR v_previous.payload<>v_payload THEN
   RAISE EXCEPTION 'Não foi possível reenviar este recebimento.' USING ERRCODE='OSC03';
  END IF;
  RETURN v_previous.result;
 END IF;
 IF v_so.status='cancelada' OR p_received IS NULL OR p_received<0 OR p_fee IS NULL OR p_fee<0
  OR p_received::text IN ('NaN','Infinity','-Infinity') OR p_fee::text IN ('NaN','Infinity','-Infinity')
  OR p_received<>round(p_received,2) OR p_fee<>round(p_fee,2) THEN
  RAISE EXCEPTION 'Confira o valor recebido.' USING ERRCODE='OSC03';
 END IF;
 IF NOT COALESCE(p_from_finance,false) AND (public._os_charge_pending(p_os_id) OR EXISTS(SELECT 1 FROM public._os_related_charges(p_os_id) c
  WHERE upper(btrim(c.status)) NOT IN ('REFUNDED','CANCELLED','CANCELED','CHARGEBACK')
   AND (p_transaction_id IS NULL OR c.source_type IN ('service_order','quote')
    OR (c.source_type='receivable' AND c.source_id=p_transaction_id)
    OR c.id=(SELECT tenant_charge_id FROM public.financial_transactions WHERE id=p_transaction_id AND company_id=v_so.company_id)))) THEN
  RAISE EXCEPTION 'Esta OS já tem cobrança. Confira o recebimento no Financeiro.' USING ERRCODE='OSC02';
 END IF;
 SELECT (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.company_settings WHERE company_id=v_so.company_id),'America/Sao_Paulo'))::date INTO v_today;
 IF p_received>0 AND (p_paid_date IS NULL OR p_paid_date>v_today OR p_method IS NULL OR p_method NOT IN ('dinheiro','pix','cartao_debito','cartao_credito','transferencia','boleto','cheque') OR p_account_id IS NULL
  OR NOT public.can_use_bank_accounts(auth.uid()) OR NOT EXISTS (SELECT 1 FROM public.financial_accounts
   WHERE id=p_account_id AND company_id=v_so.company_id AND is_active AND type IN ('banco','caixa'))) THEN
  RAISE EXCEPTION 'Confira a conta, a forma e a data do recebimento.' USING ERRCODE='OSC03';
 END IF;
 IF p_fee>p_received OR (p_fee>0 AND NOT EXISTS (SELECT 1 FROM public.financial_categories
   WHERE company_id=v_so.company_id AND name=p_fee_category AND type='saida' AND is_active)) THEN
  RAISE EXCEPTION 'Confira a tarifa do recebimento.' USING ERRCODE='OSC03';
 END IF;
 IF p_transaction_id IS NULL THEN
  IF EXISTS(SELECT 1 FROM public._os_financial_roots(p_os_id)) THEN
   RAISE EXCEPTION 'A OS já foi faturada. Atualize para receber o saldo.' USING ERRCODE='OSC01';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.financial_categories WHERE company_id=v_so.company_id AND name=p_category AND type='entrada' AND is_active) THEN
   RAISE EXCEPTION 'Escolha uma categoria de receita ativa no Financeiro.' USING ERRCODE='OSC03';
  END IF;
  IF COALESCE(v_so.total_value,0)<=0 AND NOT EXISTS(SELECT 1 FROM public.service_order_budget_items WHERE service_order_id=p_os_id) THEN
   IF NOT public.can_price_os(auth.uid()) THEN RAISE EXCEPTION 'Sem permissão para informar preços na OS.' USING ERRCODE='42501'; END IF;
   IF p_total IS NULL OR p_total<=0 OR p_total::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'Informe o valor total da OS.' USING ERRCODE='OSC03';
   END IF;
   -- OS sem orçamento: o valor lançado passa a ser seu item comercial canônico.
   PERFORM public._sync_os_budget_internal(p_os_id,jsonb_build_array(jsonb_build_object('item_type','servico',
    'description',format('Serviços da OS #%s',v_so.order_number),'quantity',1,'unit_price',round(p_total,2),'pricing_mode','manual')),'{}');
   SELECT * INTO v_so FROM public.service_orders WHERE id=p_os_id;
  END IF;
  IF p_total IS DISTINCT FROM v_so.total_value THEN
   RAISE EXCEPTION 'O valor da OS mudou. Confira antes de faturar.' USING ERRCODE='OSC01';
  END IF;
  INSERT INTO public.financial_transactions(company_id,service_order_id,customer_id,transaction_type,
   amount,description,category,transaction_date,due_date,is_paid,created_by,origin,notes)
  VALUES(v_so.company_id,p_os_id,v_so.customer_id,'entrada',v_so.total_value,format('OS #%s',v_so.order_number),
   p_category,COALESCE(p_due_date,v_today),COALESCE(p_due_date,v_today),false,auth.uid(),'geral',p_notes) RETURNING * INTO v_parent;
 ELSE
  SELECT * INTO v_parent FROM public.financial_transactions WHERE id=p_transaction_id AND company_id=v_so.company_id
   AND id IN (SELECT id FROM public._os_financial_roots(p_os_id)) AND transaction_type='entrada' AND parent_transaction_id IS NULL
   AND cancelled_at IS NULL FOR UPDATE;
  IF NOT FOUND OR v_parent.is_paid OR p_expected_received IS DISTINCT FROM v_parent.amount_received OR p_received<=0 THEN
   RAISE EXCEPTION 'O saldo mudou. Confira antes de receber.' USING ERRCODE='OSC01';
  END IF;
 END IF;
 IF v_parent.origin='pdv' OR v_parent.pdv_financial_role IS NOT NULL OR v_parent.pdv_cash_session_id IS NOT NULL
  OR v_parent.payment_group_id IS NOT NULL OR v_parent.transfer_pair_id IS NOT NULL THEN
  RAISE EXCEPTION 'Receba esta conta pelo fluxo de origem.' USING ERRCODE='OSC02';
 END IF;
 IF v_parent.service_order_id IS NULL THEN
  UPDATE public.financial_transactions SET service_order_id=p_os_id WHERE id=v_parent.id;
  v_parent.service_order_id:=p_os_id;
 END IF;
 v_remaining:=v_parent.amount-COALESCE(v_parent.amount_received,0);
 IF p_received>v_remaining THEN RAISE EXCEPTION 'O recebimento excede o saldo da OS.' USING ERRCODE='OSC03'; END IF;
 IF p_received>0 THEN
  IF p_received=v_remaining AND COALESCE(v_parent.amount_received,0)=0 THEN
   UPDATE public.financial_transactions SET is_paid=true,paid_date=p_paid_date,account_id=p_account_id,payment_method=p_method,notes=COALESCE(p_notes,notes)
    WHERE id=v_parent.id;
   v_payment_id:=v_parent.id;
  ELSE
   INSERT INTO public.financial_transactions(company_id,parent_transaction_id,customer_id,transaction_type,amount,
    description,category,transaction_date,due_date,paid_date,is_paid,account_id,payment_method,created_by,origin,notes,cost_center_id)
   VALUES(v_so.company_id,v_parent.id,v_so.customer_id,'entrada',p_received,format('Recebimento parcial — OS #%s',v_so.order_number),
    'Recebimento parcial',p_paid_date,p_paid_date,p_paid_date,true,p_account_id,p_method,auth.uid(),'geral',p_notes,v_parent.cost_center_id) RETURNING id INTO v_payment_id;
   -- O trigger existente recalcula amount_received da mãe a partir das filhas.
   IF p_due_date IS NOT NULL THEN UPDATE public.financial_transactions SET due_date=p_due_date WHERE id=v_parent.id; END IF;
  END IF;
 END IF;
 IF p_fee>0 THEN
  INSERT INTO public.financial_transactions(company_id,parent_transaction_id,customer_id,transaction_type,amount,
   description,category,transaction_date,due_date,paid_date,is_paid,account_id,payment_method,created_by,origin,notes,cost_center_id)
  VALUES(v_so.company_id,v_payment_id,v_so.customer_id,'saida',p_fee,format('Tarifa do recebimento — OS #%s',v_so.order_number),
   p_fee_category,p_paid_date,p_paid_date,p_paid_date,true,p_account_id,p_method,auth.uid(),'geral',p_notes,v_parent.cost_center_id);
 END IF;
 -- O orçamento convertido também passa a apontar para esta dívida da OS.
 UPDATE public.quotes q SET financial_transaction_id=v_parent.id,financial_generated_at=now()
  WHERE q.id=v_so.quote_id AND q.company_id=v_so.company_id AND q.converted_to_os_id=p_os_id
   AND NOT EXISTS(SELECT 1 FROM public.financial_transactions existing
    WHERE existing.id=q.financial_transaction_id AND existing.company_id=v_so.company_id AND existing.cancelled_at IS NULL);
 v_result:=jsonb_build_object('transaction_id',v_parent.id,'received_now',p_received,'remaining',v_remaining-p_received);
 INSERT INTO public.os_commercial_requests VALUES(p_request_id,p_os_id,auth.uid(),v_payload,v_result,now());
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.bill_os_receive_payment(uuid,uuid,uuid,numeric,numeric,numeric,uuid,text,date,date,text,numeric,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bill_os_receive_payment(uuid,uuid,uuid,numeric,numeric,numeric,uuid,text,date,date,text,numeric,text,text,boolean) TO authenticated;

COMMIT;

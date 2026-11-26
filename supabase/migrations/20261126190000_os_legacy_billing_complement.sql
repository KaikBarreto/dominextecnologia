-- OS com preço comercial maior que o faturamento legado: lançar só a diferença,
-- preservando valores, datas, contas e recibos dos pagamentos já confirmados.
BEGIN;
SET LOCAL lock_timeout='10s';

CREATE FUNCTION public._os_manual_complement_allowed(p_os_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH source AS (SELECT * FROM public.service_orders WHERE id=p_os_id),
 roots AS (SELECT * FROM public._os_financial_roots(p_os_id))
 SELECT EXISTS(SELECT 1 FROM source s WHERE s.status<>'cancelada' AND s.entry_type<>'tarefa'
  AND s.total_value>0 AND s.total_value::text NOT IN ('NaN','Infinity','-Infinity')
  AND s.total_value>(SELECT COALESCE(sum(amount),0) FROM roots)
  AND EXISTS(SELECT 1 FROM roots) AND NOT public._os_charge_pending(s.id)
  AND NOT EXISTS(SELECT 1 FROM public._os_related_charges(s.id) c
   WHERE upper(btrim(c.status)) NOT IN ('CANCELLED','CANCELED','REFUNDED','CHARGEBACK'))
  AND NOT EXISTS(SELECT 1 FROM roots f WHERE f.tenant_charge_id IS NOT NULL OR f.asaas_payment_id IS NOT NULL
   OR f.origin IS DISTINCT FROM 'geral' OR f.transfer_pair_id IS NOT NULL OR f.pdv_financial_role IS NOT NULL
   OR f.installment_group_id IS NOT NULL OR COALESCE(f.installment_total,1)<>1
   OR (f.customer_id IS NOT NULL AND f.customer_id IS DISTINCT FROM s.customer_id)
   OR EXISTS(SELECT 1 FROM public.pdv_receivable_settlement_allocations a WHERE a.receivable_transaction_id=f.id)
   OR EXISTS(SELECT 1 FROM public.pdv_party_credit_entries e WHERE e.target_financial_transaction_id=f.id)));
$$;
REVOKE ALL ON FUNCTION public._os_manual_complement_allowed(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_os_financial_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_so public.service_orders%ROWTYPE; v_other public.financial_transactions%ROWTYPE;
 v_parent public.financial_transactions%ROWTYPE; v_complement boolean;
BEGIN
 IF NEW.cancelled_at IS NOT NULL OR NEW.transaction_type<>'entrada' THEN RETURN NEW; END IF;
 IF NEW.parent_transaction_id IS NOT NULL THEN
  IF NEW.category='Recebimento parcial' AND (NEW.is_paid IS DISTINCT FROM true OR NEW.paid_date IS NULL)
   AND EXISTS(SELECT 1 FROM public.financial_transactions p WHERE p.id=NEW.parent_transaction_id AND p.company_id=NEW.company_id AND p.service_order_id IS NOT NULL) THEN
   RAISE EXCEPTION 'Para desfazer este recebimento, cancele ou exclua o pagamento correspondente.' USING ERRCODE='OSC03';
  END IF;
  -- Trava também as baixas vindas diretamente de Contas a Receber.
  IF NEW.category='Recebimento parcial' AND (TG_OP='INSERT' OR
   (TG_OP='UPDATE' AND (NEW.amount,NEW.cancelled_at,NEW.parent_transaction_id) IS DISTINCT FROM (OLD.amount,OLD.cancelled_at,OLD.parent_transaction_id))) THEN
   SELECT * INTO v_parent FROM public.financial_transactions WHERE id=NEW.parent_transaction_id FOR UPDATE;
   IF v_parent.company_id IS DISTINCT FROM NEW.company_id OR v_parent.transaction_type<>'entrada' THEN
    RAISE EXCEPTION 'O recebimento não corresponde a esta conta.' USING ERRCODE='OSC03';
   END IF;
   IF NEW.tenant_charge_id IS NULL AND v_parent.service_order_id IS NOT NULL AND
    public._os_charge_pending(v_parent.service_order_id) THEN
    RAISE EXCEPTION 'A emissão da cobrança está sendo conferida. Aguarde antes de receber manualmente.' USING ERRCODE='OSC02';
   END IF;
   IF v_parent.service_order_id IS NOT NULL AND (
    NEW.amount<=0 OR NEW.amount>v_parent.amount-COALESCE((SELECT sum(f.amount)
     FROM public.financial_transactions f WHERE f.parent_transaction_id=v_parent.id AND f.id<>NEW.id
      AND f.company_id=v_parent.company_id AND f.category='Recebimento parcial' AND f.transaction_type='entrada'
      AND f.cancelled_at IS NULL),0) OR (v_parent.is_paid AND COALESCE(v_parent.amount_received,0)=0)) THEN
    RAISE EXCEPTION 'O saldo mudou. Confira os recebimentos desta conta.' USING ERRCODE='OSC01';
   END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.service_order_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.amount IS DISTINCT FROM OLD.amount THEN
  RAISE EXCEPTION 'Para mudar o valor desta OS, cancele o faturamento e ajuste o orçamento antes de faturar novamente.' USING ERRCODE='OSC02';
 END IF;
 IF TG_OP='UPDATE' AND NEW.is_paid AND NOT OLD.is_paid AND NEW.tenant_charge_id IS NULL
  AND public._os_charge_pending(NEW.service_order_id) THEN
  RAISE EXCEPTION 'A emissão da cobrança está sendo conferida. Aguarde antes de receber manualmente.' USING ERRCODE='OSC02';
 END IF;
 IF TG_OP='UPDATE' AND OLD.is_paid AND NOT NEW.is_paid AND COALESCE(OLD.amount_received,0)>0
  AND COALESCE(current_setting('app.pdv_receivable_recalc',true),'')<>NEW.id::text THEN
  RAISE EXCEPTION 'Para desfazer a quitação parcial, cancele os pagamentos correspondentes.' USING ERRCODE='OSC02';
 END IF;
 -- Edições de uma conta existente não representam outra dívida.
 IF TG_OP='UPDATE' AND NEW.service_order_id IS NOT DISTINCT FROM OLD.service_order_id
  AND OLD.cancelled_at IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO v_so FROM public.service_orders WHERE id=NEW.service_order_id AND company_id=NEW.company_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de serviço indisponível nesta empresa.' USING ERRCODE='42501'; END IF;
 PERFORM public._lock_os_commercial(v_so.id);
 IF NEW.installment_group_id IS NOT NULL AND (NEW.installment_number IS NULL OR NEW.installment_total IS NULL
  OR NEW.installment_number NOT BETWEEN 1 AND NEW.installment_total OR NEW.installment_total NOT BETWEEN 2 AND 120) THEN
  RAISE EXCEPTION 'Confira o número e o total de parcelas.' USING ERRCODE='OSC03';
 END IF;
 -- Um lançamento antigo quitado pelo valor de uma entrada não quita toda a OS.
 -- Somente o complemento exato do preço comercial pode abrir outra raiz manual.
 v_complement:=TG_OP='INSERT' AND NEW.installment_group_id IS NULL
  AND COALESCE(NEW.installment_total,1)=1 AND NEW.tenant_charge_id IS NULL AND NEW.asaas_payment_id IS NULL
  AND NEW.origin='geral' AND NEW.transfer_pair_id IS NULL AND NEW.pdv_financial_role IS NULL
  AND NEW.customer_id IS NOT DISTINCT FROM v_so.customer_id
  AND public._os_manual_complement_allowed(v_so.id)
  AND NEW.amount=v_so.total_value-(SELECT COALESCE(sum(amount),0) FROM public._os_financial_roots(v_so.id));
 FOR v_other IN SELECT * FROM public._os_financial_roots(v_so.id) WHERE id<>NEW.id LOOP
  IF v_complement THEN CONTINUE; END IF;
  -- Parcelamento é uma dívida distribuída em raízes, com números distintos.
  IF NEW.installment_group_id IS NOT NULL AND NEW.installment_group_id=v_other.installment_group_id
   AND NEW.installment_number IS NOT NULL AND v_other.installment_number IS DISTINCT FROM NEW.installment_number
   AND NEW.installment_total=v_other.installment_total THEN CONTINUE; END IF;
  RAISE EXCEPTION 'Esta OS já tem uma conta a receber. Use a conta existente para registrar o pagamento.' USING ERRCODE='OSC02';
 END LOOP;
 IF NEW.installment_group_id IS NOT NULL AND COALESCE(v_so.total_value,0)>0 AND
  NEW.amount+COALESCE((SELECT sum(amount) FROM public._os_financial_roots(v_so.id) WHERE id<>NEW.id),0)>v_so.total_value THEN
  RAISE EXCEPTION 'As parcelas excedem o valor comercial da OS.' USING ERRCODE='OSC03';
 END IF;
 IF NEW.tenant_charge_id IS NULL AND (public._os_charge_pending(v_so.id) OR EXISTS(SELECT 1 FROM public._os_related_charges(v_so.id)
  WHERE upper(btrim(status)) NOT IN ('CANCELLED','CANCELED','REFUNDED','CHARGEBACK'))) THEN
  RAISE EXCEPTION 'Esta OS já tem cobrança. Confira o recebimento no Financeiro.' USING ERRCODE='OSC02';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_os_financial_origin() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_os_manual_receivables(p_os_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_complement boolean;
BEGIN
 IF NOT public.can_work_os_commercial(p_os_id) OR NOT public.can_manage_finance_transactions_current_user() THEN
  RAISE EXCEPTION 'Sem acesso ao financeiro da OS.' USING ERRCODE='42501';
 END IF;
 v_complement:=public._os_manual_complement_allowed(p_os_id);
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'amount',f.amount,
  'amount_received',COALESCE(f.amount_received,0),'is_paid',f.is_paid,'due_date',f.due_date,
  'installment_total',f.installment_total,'can_complement',v_complement,'has_live_charge',EXISTS(
   SELECT 1 FROM public._os_related_charges(p_os_id) c WHERE upper(btrim(c.status)) NOT IN ('CANCELLED','CANCELED','REFUNDED','CHARGEBACK')
    AND (c.source_type IN ('service_order','quote') OR c.id=f.tenant_charge_id OR (c.source_type='receivable' AND c.source_id=f.id)))) ORDER BY f.due_date,f.created_at)
  FROM public._os_financial_roots(p_os_id) f),'[]'::jsonb);
END;
$$;

CREATE FUNCTION public.complement_os_manual_billing(
 p_os_id uuid,p_request_id uuid,p_expected_total numeric,p_expected_billed numeric,p_due_date date,p_category text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_so public.service_orders%ROWTYPE; v_previous public.os_commercial_requests%ROWTYPE;
 v_billed numeric; v_difference numeric; v_id uuid; v_payload jsonb; v_result jsonb; v_today date;
BEGIN
 IF NOT public.can_work_os_commercial(p_os_id) OR NOT public.can_manage_finance_transactions_current_user()
  OR NOT (public.is_super_admin(auth.uid()) OR public.is_admin_or_gestor(auth.uid()) OR EXISTS(
   SELECT 1 FROM public.user_permissions WHERE user_id=auth.uid() AND is_active
    AND (permissions ? '*' OR permissions ? 'fn:os_finish_revenue'))) THEN
  RAISE EXCEPTION 'Sem permissão para faturar a OS.' USING ERRCODE='42501';
 END IF;
 PERFORM public._lock_os_commercial(p_os_id);
 SELECT * INTO v_so FROM public.service_orders WHERE id=p_os_id FOR UPDATE;
 v_payload:=jsonb_build_object('operation','complement','total',p_expected_total,'billed',p_expected_billed,'due',p_due_date,'category',p_category);
 SELECT * INTO v_previous FROM public.os_commercial_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_previous.user_id<>auth.uid() OR v_previous.service_order_id<>p_os_id OR v_previous.payload<>v_payload THEN
   RAISE EXCEPTION 'Confira os dados deste complemento.' USING ERRCODE='OSC03';
  END IF;
  RETURN v_previous.result;
 END IF;
 SELECT COALESCE(sum(amount),0) INTO v_billed FROM public._os_financial_roots(p_os_id);
 IF p_expected_total IS DISTINCT FROM v_so.total_value OR p_expected_billed IS DISTINCT FROM v_billed THEN
  RAISE EXCEPTION 'O faturamento mudou. Confira os valores atualizados.' USING ERRCODE='OSC01';
 END IF;
 IF NOT public._os_manual_complement_allowed(p_os_id) THEN
  RAISE EXCEPTION 'Confira a diferença e os vínculos no Financeiro.' USING ERRCODE='OSC04';
 END IF;
 SELECT (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.company_settings WHERE company_id=v_so.company_id),'America/Sao_Paulo'))::date INTO v_today;
 IF p_request_id IS NULL OR p_due_date IS NULL OR p_due_date NOT BETWEEN '2000-01-01'::date AND (v_today+interval '15 years')::date
  OR NOT EXISTS(SELECT 1 FROM public.financial_categories WHERE company_id=v_so.company_id AND name=p_category AND type='entrada' AND is_active) THEN
  RAISE EXCEPTION 'Confira a categoria e o vencimento.' USING ERRCODE='OSC03';
 END IF;
 v_difference:=v_so.total_value-v_billed;
 INSERT INTO public.financial_transactions(company_id,service_order_id,customer_id,transaction_type,amount,
  description,category,transaction_date,due_date,is_paid,created_by,origin)
 VALUES(v_so.company_id,p_os_id,v_so.customer_id,'entrada',v_difference,
  format('Complemento da OS #%s',v_so.order_number),p_category,p_due_date,p_due_date,false,auth.uid(),'geral') RETURNING id INTO v_id;
 v_result:=jsonb_build_object('transaction_id',v_id,'amount',v_difference,'billed_total',v_so.total_value);
 INSERT INTO public.os_commercial_requests VALUES(p_request_id,p_os_id,auth.uid(),v_payload,v_result,now());
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.complement_os_manual_billing(uuid,uuid,numeric,numeric,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complement_os_manual_billing(uuid,uuid,numeric,numeric,date,text) TO authenticated;

-- Antes da conclusão, somente a consulta interna autorizada pode abrir o recibo.
CREATE OR REPLACE FUNCTION public.get_os_commercial_document(p_os_id uuid,p_public boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE so public.service_orders%ROWTYPE; summary jsonb; payments jsonb; received numeric; currency text;
BEGIN
 SELECT * INTO so FROM public.service_orders WHERE id=p_os_id;
 IF NOT FOUND OR so.entry_type='tarefa' OR so.customer_id IS NULL OR NOT public.pdv_company_access_entitled_internal(so.company_id) THEN RETURN NULL; END IF;
 IF NOT COALESCE(p_public,true) AND NOT public.can_work_os_commercial(p_os_id) THEN RAISE EXCEPTION 'Sem acesso à ordem de serviço.' USING ERRCODE='42501'; END IF;
 IF so.status<>'concluida' THEN
  IF COALESCE(p_public,true) THEN RETURN NULL; END IF;
  IF NOT public._can_read_payment_receipt(so.company_id) THEN
   RAISE EXCEPTION 'Sem acesso aos recebimentos desta OS.' USING ERRCODE='42501';
  END IF;
 END IF;
 SELECT cs.currency INTO currency FROM public.company_settings cs WHERE cs.company_id=so.company_id;
 IF so.show_values_to_customer THEN
  SELECT jsonb_build_object('currency',COALESCE(currency,'BRL'),'items',COALESCE(jsonb_agg(jsonb_build_object(
   'description',b.description,'quantity',b.quantity,'unit_price',b.unit_price,'total_price',b.total_price,'item_type',b.item_type) ORDER BY b.position),'[]'),
   'total',COALESCE(so.total_value,0),'adjustment',COALESCE(so.total_value,0)-COALESCE(sum(b.total_price),0)) INTO summary
   FROM public.service_order_budget_items b WHERE b.service_order_id=so.id AND b.company_id=so.company_id;
 END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.paid_date,p.reference),'[]'),COALESCE(sum(p.amount),0) INTO payments,received FROM public._os_confirmed_payments(p_os_id) p;
 RETURN jsonb_build_object('summary',summary,'receipt',CASE WHEN received>0 THEN public._os_receipt_context(p_os_id)||jsonb_build_object(
  'received',received,'received_total',received,'remaining',CASE WHEN so.show_values_to_customer THEN GREATEST(0,so.total_value-received) END,
  'is_partial',received<so.total_value,'scope','consolidated','payments',payments) ELSE NULL END);
END;
$$;


NOTIFY pgrst,'reload schema';
COMMIT;

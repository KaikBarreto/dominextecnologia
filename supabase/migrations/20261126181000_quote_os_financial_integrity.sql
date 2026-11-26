-- Uma venda, uma dívida: portas manuais, orçamento e cobrança compartilham origem.
BEGIN;
SET LOCAL lock_timeout='10s';

-- Uma emissão no gateway cruza duas transações. A reserva persistida impede
-- que outro caminho fature durante essa janela. Resultado desconhecido fica
-- bloqueado para reconciliação, nunca expira criando outra cobrança às cegas.
CREATE TABLE public.os_charge_reservations (
 origin_id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 request_id uuid NOT NULL UNIQUE,source_type text NOT NULL,source_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.os_charge_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.os_charge_reservations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.os_charge_reservations TO service_role;

CREATE FUNCTION public._os_charge_pending(p_os_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.os_charge_reservations r JOIN public.service_orders so
  ON r.origin_id=COALESCE(so.quote_id,so.id) AND r.company_id=so.company_id WHERE so.id=p_os_id);
$$;
REVOKE ALL ON FUNCTION public._os_charge_pending(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.reserve_commercial_charge(p_company_id uuid,p_source_type text,p_source_id uuid,p_request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_origin uuid; v_os uuid; v_quote uuid; v_row public.financial_transactions%ROWTYPE;
BEGIN
 IF p_source_type='service_order' THEN
  SELECT id,quote_id,COALESCE(quote_id,id) INTO v_os,v_quote,v_origin FROM public.service_orders WHERE id=p_source_id AND company_id=p_company_id;
 ELSIF p_source_type='quote' THEN
  SELECT id,converted_to_os_id,id INTO v_quote,v_os,v_origin FROM public.quotes WHERE id=p_source_id AND company_id=p_company_id;
 ELSIF p_source_type='receivable' THEN
  SELECT * INTO v_row FROM public.financial_transactions WHERE id=p_source_id AND company_id=p_company_id
   AND transaction_type='entrada' AND parent_transaction_id IS NULL AND cancelled_at IS NULL AND NOT is_paid;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT id,quote_id,COALESCE(quote_id,id) INTO v_os,v_quote,v_origin FROM public.service_orders WHERE id=v_row.service_order_id AND company_id=p_company_id;
  IF v_origin IS NULL THEN
   SELECT id,converted_to_os_id,id INTO v_quote,v_os,v_origin FROM public.quotes WHERE company_id=p_company_id
    AND (financial_transaction_id=p_source_id OR financial_transaction_id IN (SELECT id FROM public.financial_transactions
      WHERE company_id=p_company_id AND installment_group_id=v_row.installment_group_id)) LIMIT 1;
  END IF;
  v_origin:=COALESCE(v_origin,p_source_id);
 END IF;
 IF v_origin IS NULL OR NOT public.tenant_subscription_allows_access(p_company_id) THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('os-commercial:'||v_origin::text,0));
 IF EXISTS(SELECT 1 FROM public.os_charge_reservations WHERE origin_id=v_origin) THEN RETURN false; END IF;
 IF p_source_type<>'receivable' AND (
  (v_os IS NOT NULL AND NOT public.validate_os_charge_origin(p_company_id,v_os))
  OR EXISTS(SELECT 1 FROM public.quotes q WHERE q.id=v_quote AND q.company_id=p_company_id AND q.financial_transaction_id IS NOT NULL)
  OR EXISTS(SELECT 1 FROM public.tenant_charges c WHERE c.company_id=p_company_id AND c.source_type='quote' AND c.source_id=v_quote
    AND upper(btrim(c.status)) NOT IN ('CANCELLED','CANCELED','REFUNDED','CHARGEBACK'))) THEN RETURN false; END IF;
 INSERT INTO public.os_charge_reservations(origin_id,company_id,request_id,source_type,source_id)
 VALUES(v_origin,p_company_id,p_request_id,p_source_type,p_source_id);
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_commercial_charge(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_commercial_charge(uuid,text,uuid,uuid) TO service_role;
CREATE FUNCTION public.release_commercial_charge(p_company_id uuid,p_request_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 DELETE FROM public.os_charge_reservations WHERE company_id=p_company_id AND request_id=p_request_id;
$$;
REVOKE ALL ON FUNCTION public.release_commercial_charge(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_commercial_charge(uuid,uuid) TO service_role;

CREATE FUNCTION public.guard_os_financial_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_so public.service_orders%ROWTYPE; v_other public.financial_transactions%ROWTYPE;
 v_parent public.financial_transactions%ROWTYPE;
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
 FOR v_other IN SELECT * FROM public._os_financial_roots(v_so.id) WHERE id<>NEW.id LOOP
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
CREATE TRIGGER guard_os_financial_origin BEFORE INSERT OR UPDATE ON public.financial_transactions
 FOR EACH ROW EXECUTE FUNCTION public.guard_os_financial_origin();

-- A guarda anterior se aplicava também às filhas manuais e impedia editar
-- recebimentos anteriores ao emitir uma cobrança do saldo da mesma conta.
CREATE OR REPLACE FUNCTION public.block_os_manual_revenue_when_charged() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.service_order_id IS NOT NULL AND NEW.transaction_type='entrada'
  AND NEW.parent_transaction_id IS NULL AND NEW.tenant_charge_id IS NULL AND NEW.cancelled_at IS NULL
  AND (TG_OP='INSERT' OR OLD.cancelled_at IS NOT NULL OR NEW.service_order_id IS DISTINCT FROM OLD.service_order_id)
  AND EXISTS(SELECT 1 FROM public._os_related_charges(NEW.service_order_id)
   WHERE upper(btrim(status)) NOT IN ('CANCELLED','CANCELED','REFUNDED','CHARGEBACK')) THEN
  RAISE EXCEPTION 'Esta OS já tem cobrança. Confira o recebimento no Financeiro.' USING ERRCODE='OSC02';
 END IF;
 RETURN NEW;
END;
$$;

CREATE TABLE public.quote_financial_requests (
 request_id uuid PRIMARY KEY,quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quote_financial_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_financial_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.quote_financial_requests TO service_role;

-- Linhas enviadas pelo hook são somente intenção. Posse, cliente, total,
-- agrupamento, estado financeiro e permissões são reconciliados no servidor.
-- Identificador entre aspas preserva compatibilidade com o splitter de CLIs
-- anteriores, que interpretava o sufixo atomic como o início de BEGIN ATOMIC.
CREATE FUNCTION public."approve_quote_financial_atomic"(
 p_quote_id uuid,p_request_id uuid,p_mode text,p_rows jsonb,p_fee numeric DEFAULT 0,p_fee_category text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_q public.quotes%ROWTYPE; v_previous public.quote_financial_requests%ROWTYPE;
 v_payload jsonb:=jsonb_build_object('mode',p_mode,'rows',p_rows,'fee',p_fee,'fee_category',p_fee_category);
 v_result jsonb; v_row jsonb; v_count integer; v_group uuid; v_id uuid; v_first uuid;
 v_total numeric; v_sum numeric; v_today date; v_i integer:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_manage_finance_transactions_current_user() THEN
  RAISE EXCEPTION 'Sem permissão para aprovar o financeiro.' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('os-commercial:'||p_quote_id::text,0));
 SELECT * INTO v_q FROM public.quotes WHERE id=p_quote_id AND
  (public.is_super_admin(auth.uid()) OR (company_id=public.get_user_company_id(auth.uid())
   AND public.tenant_subscription_allows_access(company_id))) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Orçamento indisponível.' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_previous FROM public.quote_financial_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF v_previous.quote_id<>p_quote_id OR v_previous.user_id<>auth.uid() OR v_previous.payload<>v_payload THEN
   RAISE EXCEPTION 'Confira os dados desta aprovação.' USING ERRCODE='OSC03';
  END IF;
  RETURN v_previous.result;
 END IF;
 IF EXISTS(SELECT 1 FROM public.os_charge_reservations WHERE origin_id=p_quote_id AND company_id=v_q.company_id)
  OR v_q.financial_generated_at IS NOT NULL OR v_q.financial_transaction_id IS NOT NULL
  OR v_q.status NOT IN ('rascunho','enviado','aprovado','convertido')
  OR (v_q.converted_to_os_id IS NOT NULL AND (EXISTS(SELECT 1 FROM public._os_financial_roots(v_q.converted_to_os_id))
   OR EXISTS(SELECT 1 FROM public._os_related_charges(v_q.converted_to_os_id)
    WHERE upper(btrim(status)) NOT IN ('CANCELLED','CANCELED','REFUNDED','CHARGEBACK'))))
  OR EXISTS(SELECT 1 FROM public.tenant_charges WHERE company_id=v_q.company_id AND source_type='quote' AND source_id=p_quote_id
   AND upper(btrim(status)) NOT IN ('CANCELLED','CANCELED','REFUNDED','CHARGEBACK')) THEN
  RAISE EXCEPTION 'O orçamento já foi faturado ou alterado. Confira o financeiro antes de continuar.' USING ERRCODE='OSC02';
 END IF;
 v_total:=round(COALESCE(v_q.total_value,v_q.total_price,0),2);
 IF p_mode IS NULL OR p_mode NOT IN ('a_receber','recebido') OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 60 OR v_total<=0
  OR v_total::text IN ('NaN','Infinity','-Infinity') OR p_fee IS NULL OR p_fee<0 OR p_fee>v_total
  OR p_fee::text IN ('NaN','Infinity','-Infinity') OR p_fee<>round(p_fee,2) THEN
  RAISE EXCEPTION 'Confira o valor e as condições de recebimento.' USING ERRCODE='OSC03';
 END IF;
 v_count:=jsonb_array_length(p_rows);
 IF (p_mode='recebido' AND v_count<>1) OR (p_mode='a_receber' AND p_fee<>0) THEN
  RAISE EXCEPTION 'Confira as parcelas e a tarifa de recebimento.' USING ERRCODE='OSC03';
 END IF;
 SELECT sum((value->>'amount')::numeric) INTO v_sum FROM jsonb_array_elements(p_rows);
 IF v_sum IS DISTINCT FROM v_total THEN RAISE EXCEPTION 'O valor do orçamento mudou. Atualize antes de aprovar.' USING ERRCODE='OSC01'; END IF;
 SELECT (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.company_settings WHERE company_id=v_q.company_id),'America/Sao_Paulo'))::date INTO v_today;
 IF v_count>1 THEN v_group:=gen_random_uuid(); END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  v_i:=v_i+1;
  IF COALESCE((v_row->>'amount')::numeric,0)<=0 OR (v_row->>'amount')::numeric<>round((v_row->>'amount')::numeric,2)
   OR NOT EXISTS(SELECT 1 FROM public.financial_categories WHERE company_id=v_q.company_id AND name=v_row->>'category' AND type='entrada' AND is_active)
   OR NULLIF(v_row->>'transaction_date','') IS NULL
   OR (v_row->>'transaction_date')::date NOT BETWEEN '2000-01-01'::date AND (v_today+interval '15 years')::date THEN
   RAISE EXCEPTION 'Confira o valor, a categoria e o vencimento.' USING ERRCODE='OSC03';
  END IF;
  IF NULLIF(v_row->>'account_id','') IS NOT NULL AND (NOT public.can_use_bank_accounts(auth.uid()) OR NOT EXISTS(
   SELECT 1 FROM public.financial_accounts WHERE id=(v_row->>'account_id')::uuid AND company_id=v_q.company_id AND is_active AND type IN ('banco','caixa'))) THEN
   RAISE EXCEPTION 'Confira a conta de recebimento.' USING ERRCODE='42501';
  END IF;
  IF NULLIF(v_row->>'cost_center_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.cost_centers
   WHERE id=(v_row->>'cost_center_id')::uuid AND company_id=v_q.company_id) THEN
   RAISE EXCEPTION 'Centro de custo indisponível nesta empresa.' USING ERRCODE='42501';
  END IF;
  IF p_mode='recebido' AND (NULLIF(v_row->>'account_id','') IS NULL OR NULLIF(v_row->>'paid_date','') IS NULL
   OR (v_row->>'paid_date')::date>v_today OR (v_row->>'paid_date')::date<>(v_row->>'transaction_date')::date
   OR COALESCE(v_row->>'payment_method','') NOT IN ('dinheiro','pix','cartao_debito','cartao_credito','transferencia','boleto','cheque')) THEN
   RAISE EXCEPTION 'Confira a conta, a forma e a data do recebimento.' USING ERRCODE='OSC03';
  END IF;
  INSERT INTO public.financial_transactions(company_id,service_order_id,customer_id,transaction_type,amount,
   description,category,account_id,cost_center_id,transaction_date,due_date,paid_date,is_paid,payment_method,notes,created_by,
   installment_group_id,installment_number,installment_total)
  VALUES(v_q.company_id,v_q.converted_to_os_id,v_q.customer_id,'entrada',(v_row->>'amount')::numeric,
   format('Orçamento #%s%s',v_q.quote_number,CASE WHEN v_count>1 THEN format(' (%s/%s)',v_i,v_count) ELSE '' END),
   v_row->>'category',NULLIF(v_row->>'account_id','')::uuid,NULLIF(v_row->>'cost_center_id','')::uuid,
   (v_row->>'transaction_date')::date,(v_row->>'transaction_date')::date,
   CASE WHEN p_mode='recebido' THEN (v_row->>'paid_date')::date END,p_mode='recebido',
   CASE WHEN p_mode='recebido' THEN v_row->>'payment_method' END,v_row->>'notes',auth.uid(),
   v_group,CASE WHEN v_count>1 THEN v_i END,CASE WHEN v_count>1 THEN v_count END) RETURNING id INTO v_id;
  v_first:=COALESCE(v_first,v_id);
 END LOOP;
 IF p_fee>0 THEN
  IF NOT EXISTS(SELECT 1 FROM public.financial_categories WHERE company_id=v_q.company_id AND name=p_fee_category AND type='saida' AND is_active) THEN
   RAISE EXCEPTION 'Confira a categoria da tarifa.' USING ERRCODE='OSC03';
  END IF;
  INSERT INTO public.financial_transactions(company_id,parent_transaction_id,transaction_type,amount,description,category,
   customer_id,account_id,cost_center_id,transaction_date,paid_date,is_paid,payment_method,created_by)
  SELECT company_id,id,'saida',p_fee,format('Tarifa do recebimento — Orçamento #%s',v_q.quote_number),p_fee_category,
   customer_id,account_id,cost_center_id,transaction_date,paid_date,true,payment_method,auth.uid()
   FROM public.financial_transactions WHERE id=v_first;
 END IF;
 UPDATE public.quotes SET status=CASE WHEN converted_to_os_id IS NULL THEN 'aprovado' ELSE status END,
  financial_generated_at=now(),financial_transaction_id=v_first,
  receivable_installments=v_count,receivable_first_due_date=(p_rows->0->>'transaction_date')::date WHERE id=p_quote_id;
 v_result:=jsonb_build_object('mode',p_mode,'count',v_count,'primaryId',v_first);
 INSERT INTO public.quote_financial_requests VALUES(p_request_id,p_quote_id,auth.uid(),v_payload,v_result,now());
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public."approve_quote_financial_atomic"(uuid,uuid,text,jsonb,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public."approve_quote_financial_atomic"(uuid,uuid,text,jsonb,numeric,text) TO authenticated;

-- Preflight da edge usa a mesma origem do relatório, incluindo orçamento.
CREATE FUNCTION public.validate_os_charge_origin(p_company_id uuid,p_os_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.service_orders WHERE id=p_os_id AND company_id=p_company_id)
  OR NOT public.tenant_subscription_allows_access(p_company_id) THEN RETURN false; END IF;
 RETURN NOT EXISTS(SELECT 1 FROM public._os_financial_roots(p_os_id))
  AND NOT EXISTS(SELECT 1 FROM public._os_related_charges(p_os_id) WHERE upper(btrim(status)) NOT IN ('CANCELLED','CANCELED','REFUNDED','CHARGEBACK'));
END;
$$;
REVOKE ALL ON FUNCTION public.validate_os_charge_origin(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_os_charge_origin(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

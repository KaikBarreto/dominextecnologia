-- Cancelamento do restante nunca entregue com origem financeira própria.
-- Preserva o contrato v2; não cria devolução comercial, estoque ou CMV.
-- Primeira fatia: cliente identificado, dinheiro/Pix/transferência liquidados,
-- fiado totalmente aberto. Legado, saldo/voucher e fiado recebido falham fechado.
BEGIN;

ALTER TABLE public.pdv_order_residual_cancellations
  ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  ADD COLUMN residual_amount numeric(14,2) CHECK(residual_amount>=0),
  ADD COLUMN financial_contract_version smallint CHECK(financial_contract_version=3),
  ADD COLUMN occurred_on date,
  ADD COLUMN financial_plan jsonb,
  ADD CONSTRAINT pdv_residual_financial_shape CHECK(
    (financial_contract_version IS NULL AND customer_id IS NULL AND residual_amount IS NULL AND occurred_on IS NULL AND financial_plan IS NULL)
    OR (financial_contract_version IS NOT NULL AND financial_contract_version=3 AND customer_id IS NOT NULL AND residual_amount IS NOT NULL AND residual_amount>0
      AND lower(residual_amount::text) NOT IN('nan','infinity','-infinity') AND occurred_on IS NOT NULL AND financial_plan IS NOT NULL AND jsonb_typeof(financial_plan)='object'));


ALTER TABLE public.pdv_party_credit_entries
  ADD COLUMN source_residual_cancellation_id uuid REFERENCES public.pdv_order_residual_cancellations(id) ON DELETE RESTRICT,
  ADD CONSTRAINT pdv_party_credit_source_xor CHECK(num_nonnulls(source_commercial_return_id,source_residual_cancellation_id)<=1);
ALTER TABLE public.pdv_return_dispositions
  ALTER COLUMN commercial_return_id DROP NOT NULL,
  ADD COLUMN residual_cancellation_id uuid REFERENCES public.pdv_order_residual_cancellations(id) ON DELETE RESTRICT,
  ADD CONSTRAINT pdv_return_disposition_source_xor CHECK(num_nonnulls(commercial_return_id,residual_cancellation_id)=1);
ALTER TABLE public.pdv_vouchers
  ALTER COLUMN source_commercial_return_id DROP NOT NULL,
  ADD COLUMN source_residual_cancellation_id uuid REFERENCES public.pdv_order_residual_cancellations(id) ON DELETE RESTRICT,
  ADD CONSTRAINT pdv_voucher_source_xor CHECK(num_nonnulls(source_commercial_return_id,source_residual_cancellation_id)=1);
ALTER TABLE public.pdv_refunds
  ALTER COLUMN commercial_return_id DROP NOT NULL,
  ADD COLUMN residual_cancellation_id uuid REFERENCES public.pdv_order_residual_cancellations(id) ON DELETE RESTRICT,
  ADD CONSTRAINT pdv_refund_source_xor CHECK(num_nonnulls(commercial_return_id,residual_cancellation_id)=1);
ALTER TABLE public.pdv_return_value_events
  ALTER COLUMN commercial_return_id DROP NOT NULL,
  ADD COLUMN residual_cancellation_id uuid REFERENCES public.pdv_order_residual_cancellations(id) ON DELETE RESTRICT,
  ADD CONSTRAINT pdv_return_value_source_xor CHECK(num_nonnulls(commercial_return_id,residual_cancellation_id)=1);
CREATE INDEX idx_pdv_credit_residual_source ON public.pdv_party_credit_entries(company_id,source_residual_cancellation_id)
  WHERE source_residual_cancellation_id IS NOT NULL;
CREATE INDEX idx_pdv_disposition_residual_source ON public.pdv_return_dispositions(company_id,residual_cancellation_id)
  WHERE residual_cancellation_id IS NOT NULL;
CREATE INDEX idx_pdv_value_residual_source ON public.pdv_return_value_events(company_id,residual_cancellation_id)
  WHERE residual_cancellation_id IS NOT NULL;

-- Porta interna de origem: nunca cria um fato de devolução. O valor positivo
-- é o limite de passivo a destinar, sem efeito em receita/CMV reconhecidos.
CREATE FUNCTION public.pdv_value_source_internal_v3(p_return_id uuid,p_residual_id uuid)
RETURNS TABLE(id uuid,company_id uuid,order_id uuid,customer_id uuid,value_amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF num_nonnulls(p_return_id,p_residual_id)<>1 THEN
    RAISE EXCEPTION 'Selecione uma única origem para o valor.' USING ERRCODE='22023'; END IF;
  RETURN QUERY
    SELECT h.id,h.company_id,h.order_id,h.customer_id,abs(h.commercial_total)
    FROM public.pdv_commercial_returns h WHERE h.id=p_return_id AND h.event_kind='return'
    UNION ALL
    SELECT c.id,c.company_id,c.order_id,c.customer_id,c.residual_amount
    FROM public.pdv_order_residual_cancellations c WHERE c.id=p_residual_id AND c.financial_contract_version=3;
END $fn$;
CREATE FUNCTION public.pdv_value_order_internal_v3(p_return_id uuid,p_residual_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT order_id FROM public.pdv_value_source_internal_v3(p_return_id,p_residual_id);
$fn$;
CREATE FUNCTION public.pdv_refund_order_internal_v3(p_refund_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT public.pdv_value_order_internal_v3(r.commercial_return_id,r.residual_cancellation_id)
    FROM public.pdv_refunds r WHERE r.id=p_refund_id;
$fn$;
CREATE FUNCTION public.pdv_voucher_order_internal_v3(p_voucher_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT public.pdv_value_order_internal_v3(v.source_commercial_return_id,v.source_residual_cancellation_id)
    FROM public.pdv_vouchers v WHERE v.id=p_voucher_id;
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_value_credit_entry_internal_v3(p_company_id uuid, p_customer_id uuid, p_source_return_id uuid, p_source_residual_id uuid, p_entry_kind text, p_amount numeric, p_occurred_on date, p_description text, p_target_transaction_id uuid, p_reversal_of_id uuid, p_idempotency_key text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_claim record; v_entry uuid; v_original public.pdv_party_credit_entries%ROWTYPE;
BEGIN
  IF p_source_residual_id IS NOT NULL THEN
    IF p_company_id IS DISTINCT FROM (SELECT company_id FROM public.pdv_returns_context_v2(NULL))
      OR public.pdv_has_stock_access_scope_v2(auth.uid(),p_company_id,
        p_order_id=>public.pdv_value_order_internal_v3(NULL,p_source_residual_id)) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'A origem financeira está indisponível para seu perfil.' USING ERRCODE='42501'; END IF;
    PERFORM public.pdv_assert_order_cash_access_v2(public.pdv_value_order_internal_v3(NULL,p_source_residual_id),auth.uid());
  END IF;
  IF public.pdv_party_accounts_v2_enabled_internal(p_company_id) IS DISTINCT FROM TRUE
    OR NOT EXISTS(SELECT 1 FROM public.pdv_value_source_internal_v3(p_source_return_id,p_source_residual_id) header
      WHERE header.company_id=p_company_id AND header.customer_id=p_customer_id) THEN
    RAISE EXCEPTION 'A conta de crédito da devolução não está disponível.'
      USING ERRCODE='42501',DETAIL='code=pdv_return_credit_source_invalid'; END IF;
  IF p_entry_kind NOT IN('credit','application','reversal') OR p_amount IS NULL OR p_amount=0
    OR p_amount<>round(p_amount,2) OR lower(p_amount::text) IN('nan','infinity','-infinity') THEN
    RAISE EXCEPTION 'Movimento financeiro da devolução inválido.' USING ERRCODE='22023'; END IF;
  IF p_entry_kind='credit' AND (p_amount<=0 OR p_target_transaction_id IS NOT NULL OR p_reversal_of_id IS NOT NULL)
    OR p_entry_kind='application' AND (p_amount>=0 OR p_target_transaction_id IS NULL OR p_reversal_of_id IS NOT NULL)
    OR p_entry_kind='reversal' AND p_reversal_of_id IS NULL THEN
    RAISE EXCEPTION 'Formato financeiro da devolução inválido.' USING ERRCODE='22023'; END IF;
  IF p_entry_kind='reversal' THEN
    SELECT * INTO v_original FROM public.pdv_party_credit_entries entry
     WHERE entry.id=p_reversal_of_id AND entry.company_id=p_company_id FOR UPDATE;
    IF NOT FOUND OR num_nonnulls(v_original.source_commercial_return_id,v_original.source_residual_cancellation_id)<>1 OR p_amount<>-v_original.amount
      OR v_original.source_commercial_return_id IS DISTINCT FROM p_source_return_id
      OR v_original.source_residual_cancellation_id IS DISTINCT FROM p_source_residual_id
      OR p_target_transaction_id IS DISTINCT FROM v_original.target_financial_transaction_id
      OR EXISTS(SELECT 1 FROM public.pdv_party_credit_entries reversal WHERE reversal.reversal_of_id=v_original.id) THEN
      RAISE EXCEPTION 'Crédito da devolução não pode ser compensado.'
        USING ERRCODE='23514',DETAIL='code=pdv_return_credit_not_reversible'; END IF;
  END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(p_company_id,
    CASE WHEN p_entry_kind='reversal' THEN 'commercial.return.credit.reverse.v2'
         ELSE 'commercial.return.credit.post.v2' END,p_idempotency_key,
    jsonb_build_object('customer_id',p_customer_id,'source_return_id',p_source_return_id,
      'entry_kind',p_entry_kind,'amount',p_amount,'occurred_on',p_occurred_on,
      'description',p_description,'target_transaction_id',p_target_transaction_id,
      'reversal_of_id',p_reversal_of_id)
      ||CASE WHEN p_source_residual_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('source_residual_id',p_source_residual_id) END);
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN (v_claim.stored_result->>'entry_id')::uuid; END IF;
    RAISE EXCEPTION 'O movimento financeiro da devolução já está em processamento.' USING ERRCODE='55000'; END IF;
  IF p_entry_kind='reversal' AND p_source_return_id IS NOT NULL THEN
    PERFORM set_config('app.pdv_return_credit_reverse',v_original.source_commercial_return_id::text,true);
  END IF;
  INSERT INTO public.pdv_party_credit_entries(company_id,party_type,customer_id,entry_kind,amount,
    occurred_on,description,target_financial_transaction_id,reversal_of_id,operation_request_id,
    metadata,source_commercial_return_id,source_residual_cancellation_id,created_by)
  VALUES(p_company_id,'customer',p_customer_id,p_entry_kind,p_amount,p_occurred_on,p_description,
    p_target_transaction_id,p_reversal_of_id,v_claim.request_id,
    jsonb_build_object('source',CASE WHEN p_source_residual_id IS NULL THEN 'commercial_return_v2' ELSE 'order_residual_cancellation_v3' END),p_source_return_id,p_source_residual_id,auth.uid())
  RETURNING id INTO v_entry;
  IF p_entry_kind='reversal' THEN PERFORM set_config('app.pdv_return_credit_reverse','',true); END IF;
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_party_credit_entry',v_entry,
    jsonb_build_object('ok',true,'entry_id',v_entry));
  RETURN v_entry;
END $function$;

CREATE OR REPLACE FUNCTION public.pdv_return_credit_entry_internal_v2(p_company_id uuid,p_customer_id uuid,p_source_return_id uuid,p_entry_kind text,p_amount numeric,p_occurred_on date,p_description text,p_target_transaction_id uuid,p_reversal_of_id uuid,p_idempotency_key text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT public.pdv_value_credit_entry_internal_v3(p_company_id,p_customer_id,p_source_return_id,NULL,p_entry_kind,p_amount,p_occurred_on,p_description,p_target_transaction_id,p_reversal_of_id,p_idempotency_key);
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_free_value_internal_v3(p_company_id uuid, p_user_id uuid, p_return_id uuid, p_residual_id uuid, p_amount numeric, p_key_prefix text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_remaining numeric(14,2):=round(p_amount,2); v_disposition record; v_take numeric(14,2);
  v_residual numeric(14,2); v_credit record; v_reverse_app uuid; v_reverse_credit uuid;
  v_new_credit uuid; v_new_application uuid; v_index integer:=0; v_unallocated numeric(14,2);
  v_customer_id uuid;
BEGIN
  IF v_remaining<=0 THEN RAISE EXCEPTION 'Valor de realocação inválido.' USING ERRCODE='22023'; END IF;
  SELECT header.customer_id INTO v_customer_id FROM public.pdv_value_source_internal_v3(p_return_id,p_residual_id) header
   WHERE header.company_id=p_company_id;
  IF NOT FOUND OR v_customer_id IS NULL THEN RAISE EXCEPTION 'Devolução sem cliente para realocação.'
    USING ERRCODE='23514',DETAIL='code=pdv_return_value_customer_required'; END IF;
  -- Ordem canônica: cliente antes do livro de crédito e da devolução. Assim
  -- troca, refund e voucher serializam com W4 no mesmo saldo.
  PERFORM customer.id FROM public.customers customer
   WHERE customer.id=v_customer_id AND customer.company_id=p_company_id ORDER BY customer.id FOR UPDATE;
  PERFORM h.id FROM public.pdv_commercial_returns h WHERE h.id=p_return_id FOR UPDATE;
  PERFORM c.id FROM public.pdv_order_residual_cancellations c WHERE c.id=p_residual_id FOR UPDATE;
  SELECT round(header.value_amount
      -COALESCE((SELECT sum(disposition.amount) FROM public.pdv_return_dispositions disposition
        WHERE disposition.commercial_return_id IS NOT DISTINCT FROM p_return_id
          AND disposition.residual_cancellation_id IS NOT DISTINCT FROM p_residual_id),0)
      -COALESCE((SELECT sum(value.amount) FROM public.pdv_return_value_events value
        WHERE value.commercial_return_id IS NOT DISTINCT FROM p_return_id
          AND value.residual_cancellation_id IS NOT DISTINCT FROM p_residual_id),0),2)
    INTO v_unallocated FROM public.pdv_value_source_internal_v3(p_return_id,p_residual_id) header
   WHERE header.company_id=p_company_id;
  IF v_unallocated IS NULL OR v_unallocated<0 THEN RAISE EXCEPTION 'A conciliação do valor devolvido está inconsistente.'
    USING ERRCODE='55000',DETAIL='code=pdv_return_value_reconciliation_required'; END IF;
  v_remaining:=GREATEST(v_remaining-v_unallocated,0);
  FOR v_disposition IN
    SELECT disposition.* FROM public.pdv_return_dispositions disposition
     WHERE disposition.company_id=p_company_id AND disposition.commercial_return_id IS NOT DISTINCT FROM p_return_id
       AND disposition.residual_cancellation_id IS NOT DISTINCT FROM p_residual_id
       AND disposition.amount>0
       AND NOT EXISTS(SELECT 1 FROM public.pdv_return_dispositions reversal
         WHERE reversal.reversal_of_id=disposition.id)
     ORDER BY disposition.id FOR UPDATE OF disposition
  LOOP
    EXIT WHEN v_remaining=0; v_index:=v_index+1;
    v_take:=LEAST(v_remaining,v_disposition.amount); v_residual:=v_disposition.amount-v_take;
    v_reverse_app:=NULL;
    IF v_disposition.application_entry_id IS NOT NULL THEN
      SELECT * INTO v_credit FROM public.pdv_party_credit_entries WHERE id=v_disposition.application_entry_id FOR UPDATE;
      v_reverse_app:=public.pdv_value_credit_entry_internal_v3(p_company_id,v_credit.customer_id,p_return_id,p_residual_id,
        'reversal',-v_credit.amount,public.company_today(p_company_id),'Realocação de devolução',
        v_credit.target_financial_transaction_id,v_credit.id,p_key_prefix||':ra:'||v_index::text);
    END IF;
    SELECT * INTO v_credit FROM public.pdv_party_credit_entries WHERE id=v_disposition.credit_entry_id FOR UPDATE;
    v_reverse_credit:=public.pdv_value_credit_entry_internal_v3(p_company_id,v_credit.customer_id,p_return_id,p_residual_id,
      'reversal',-v_credit.amount,public.company_today(p_company_id),'Realocação de devolução',
      v_credit.target_financial_transaction_id,v_credit.id,p_key_prefix||':rc:'||v_index::text);
    INSERT INTO public.pdv_return_dispositions(company_id,commercial_return_id,residual_cancellation_id,disposition_kind,amount,
      receivable_transaction_id,credit_entry_id,application_entry_id,reversal_credit_entry_id,
      reversal_application_entry_id,reversal_of_id)
    VALUES(p_company_id,p_return_id,p_residual_id,v_disposition.disposition_kind,-v_disposition.amount,
      v_disposition.receivable_transaction_id,v_disposition.credit_entry_id,v_disposition.application_entry_id,
      v_reverse_credit,v_reverse_app,v_disposition.id);
    IF v_residual>0 THEN
      v_new_credit:=public.pdv_value_credit_entry_internal_v3(p_company_id,v_credit.customer_id,p_return_id,p_residual_id,
        'credit',v_residual,public.company_today(p_company_id),'Crédito residual da devolução',NULL,NULL,
        p_key_prefix||':nc:'||v_index::text);
      v_new_application:=NULL;
      IF v_disposition.disposition_kind='receivable_reduction' THEN
        v_new_application:=public.pdv_value_credit_entry_internal_v3(p_company_id,v_credit.customer_id,p_return_id,p_residual_id,
          'application',-v_residual,public.company_today(p_company_id),'Abatimento residual da devolução',
          v_disposition.receivable_transaction_id,NULL,p_key_prefix||':na:'||v_index::text);
      END IF;
      INSERT INTO public.pdv_return_dispositions(company_id,commercial_return_id,residual_cancellation_id,disposition_kind,amount,
        receivable_transaction_id,credit_entry_id,application_entry_id)
      VALUES(p_company_id,p_return_id,p_residual_id,v_disposition.disposition_kind,v_residual,
        v_disposition.receivable_transaction_id,v_new_credit,v_new_application);
    END IF;
    v_remaining:=v_remaining-v_take;
  END LOOP;
  IF v_remaining<>0 THEN RAISE EXCEPTION 'A devolução não possui valor livre para este destino.'
    USING ERRCODE='23514',DETAIL='code=pdv_return_value_not_available'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.pdv_free_return_value_internal_v2(p_company_id uuid,p_user_id uuid,p_return_id uuid,p_amount numeric,p_key_prefix text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT public.pdv_free_value_internal_v3(p_company_id,p_user_id,p_return_id,NULL,p_amount,p_key_prefix);
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_issue_value_voucher_internal_v3(p_return_id uuid, p_residual_id uuid, p_amount numeric, p_expires_on date, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_context record; v_claim record; v_return record;
  v_voucher uuid:=gen_random_uuid(); v_entry uuid; v_code text; v_attempt integer:=0; v_result jsonb;
  v_customer_id uuid;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:issue_pdv_voucher');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_order_id => public.pdv_value_order_internal_v3(p_return_id,p_residual_id)
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque desta devolução.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied';
  END IF;
  IF p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2)
    OR lower(p_amount::text) IN('nan','infinity','-infinity') OR p_amount>999999999.99 THEN RAISE EXCEPTION 'Informe um valor válido em centavos.'
    USING ERRCODE='22023',DETAIL='code=pdv_voucher_amount_invalid'; END IF;
  SELECT header.customer_id INTO v_customer_id FROM public.pdv_value_source_internal_v3(p_return_id,p_residual_id) header
   WHERE header.company_id=v_context.company_id;
  IF NOT FOUND OR v_customer_id IS NULL THEN RAISE EXCEPTION 'Devolução não encontrada ou sem cliente.' USING ERRCODE='P0002'; END IF;
  PERFORM customer.id FROM public.customers customer
   WHERE customer.id=v_customer_id AND customer.company_id=v_context.company_id ORDER BY customer.id FOR UPDATE;
  PERFORM h.id FROM public.pdv_commercial_returns h WHERE h.id=p_return_id FOR UPDATE;
  PERFORM c.id FROM public.pdv_order_residual_cancellations c WHERE c.id=p_residual_id FOR UPDATE;
  SELECT * INTO v_return FROM public.pdv_value_source_internal_v3(p_return_id,p_residual_id) header
   WHERE header.company_id=v_context.company_id;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.pdv_commercial_returns r WHERE r.reversal_of_id=p_return_id) THEN
    RAISE EXCEPTION 'Devolução não encontrada ou já compensada.' USING ERRCODE='P0002'; END IF;
  IF v_return.customer_id IS NULL THEN RAISE EXCEPTION 'O voucher exige cliente identificado.' USING ERRCODE='23514'; END IF;
  IF p_expires_on IS NOT NULL AND p_expires_on<public.company_today(v_context.company_id) THEN
    RAISE EXCEPTION 'A validade não pode estar no passado.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'after_sale.voucher.issue.v2',
    p_idempotency_key,jsonb_build_object('return_id',p_return_id,'amount',round(p_amount,2),'expires_on',p_expires_on)
      ||CASE WHEN p_residual_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('residual_cancellation_id',p_residual_id) END);
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'Este voucher já está em processamento.' USING ERRCODE='55000'; END IF;
  PERFORM public.pdv_free_value_internal_v3(v_context.company_id,v_context.user_id,p_return_id,p_residual_id,p_amount,
    'vch:'||v_claim.request_id::text);
  LOOP
    v_attempt:=v_attempt+1; v_code:='DV-'||upper(substr(encode(gen_random_bytes(10),'hex'),1,16));
    BEGIN
      INSERT INTO public.pdv_vouchers(id,company_id,customer_id,public_code,source_commercial_return_id,source_residual_cancellation_id,
        issued_on,expires_on,created_by)
      VALUES(v_voucher,v_context.company_id,v_return.customer_id,v_code,p_return_id,p_residual_id,
        public.company_today(v_context.company_id),p_expires_on,v_context.user_id); EXIT;
    EXCEPTION WHEN unique_violation THEN IF v_attempt>=5 THEN RAISE; END IF; END;
  END LOOP;
  INSERT INTO public.pdv_voucher_entries(company_id,voucher_id,entry_kind,amount,operation_request_id,
    description,created_by)
  VALUES(v_context.company_id,v_voucher,'issue',round(p_amount,2),v_claim.request_id,
    'Voucher de devolução',v_context.user_id) RETURNING id INTO v_entry;
  INSERT INTO public.pdv_return_value_events(company_id,commercial_return_id,residual_cancellation_id,destination_kind,amount,
    resource_id,operation_request_id,created_by)
  VALUES(v_context.company_id,p_return_id,p_residual_id,'voucher',round(p_amount,2),v_voucher,v_claim.request_id,v_context.user_id);
  v_result:=jsonb_build_object('ok',true,'voucher_id',v_voucher,'voucher_entry_id',v_entry,
    'public_code',v_code,'amount',round(p_amount,2),'balance',round(p_amount,2),'expires_on',p_expires_on,'idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_voucher',v_voucher,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.pdv_issue_return_voucher_core_015_v2(p_return_id uuid,p_amount numeric,p_expires_on date,p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.pdv_issue_value_voucher_internal_v3(p_return_id,NULL,p_amount,p_expires_on,p_idempotency_key);
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_request_value_refund_internal_v3(p_return_id uuid, p_residual_id uuid, p_original_payment_id uuid, p_amount numeric, p_reason text, p_account_id uuid, p_cash_session_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_context record; v_claim record; v_return record;
  v_payment public.pdv_order_payments%ROWTYPE; v_refund uuid:=gen_random_uuid(); v_requested uuid;
  v_reason text; v_prior numeric; v_settlement jsonb; v_result jsonb; v_customer_id uuid;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:refund_pdv_return');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_order_id => public.pdv_value_order_internal_v3(p_return_id,p_residual_id)
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque desta devolução.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied';
  END IF;
  v_reason:=NULLIF(btrim(COALESCE(p_reason,'')),'');
  IF p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2)
    OR lower(p_amount::text) IN('nan','infinity','-infinity') OR p_amount>999999999.99
    OR v_reason IS NULL OR char_length(v_reason)>500 THEN
    RAISE EXCEPTION 'Informe valor e motivo válidos.' USING ERRCODE='22023',DETAIL='code=pdv_refund_payload_invalid'; END IF;
  -- Mesma ordem de W1/W2: empresa/conta antes de qualquer pedido ou pagamento.
  IF p_account_id IS NOT NULL THEN
    PERFORM public.pdv_lock_treasury_account(v_context.company_id,p_account_id);
  END IF;
  SELECT header.customer_id INTO v_customer_id FROM public.pdv_value_source_internal_v3(p_return_id,p_residual_id) header
   WHERE header.company_id=v_context.company_id;
  IF NOT FOUND OR v_customer_id IS NULL THEN RAISE EXCEPTION 'Devolução não encontrada ou sem cliente.' USING ERRCODE='P0002'; END IF;
  PERFORM customer.id FROM public.customers customer
   WHERE customer.id=v_customer_id AND customer.company_id=v_context.company_id ORDER BY customer.id FOR UPDATE;
  PERFORM h.id FROM public.pdv_commercial_returns h WHERE h.id=p_return_id FOR UPDATE;
  PERFORM c.id FROM public.pdv_order_residual_cancellations c WHERE c.id=p_residual_id FOR UPDATE;
  SELECT * INTO v_return FROM public.pdv_value_source_internal_v3(p_return_id,p_residual_id) header
   WHERE header.company_id=v_context.company_id;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.pdv_commercial_returns r WHERE r.reversal_of_id=p_return_id) THEN
    RAISE EXCEPTION 'Devolução não encontrada ou já compensada.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_payment FROM public.pdv_order_payments payment
   WHERE payment.id=p_original_payment_id AND payment.company_id=v_context.company_id
     AND payment.order_id=v_return.order_id FOR UPDATE;
  IF NOT FOUND OR v_payment.method NOT IN('dinheiro','pix','transferencia','debito','credito')
    OR (v_payment.contract_version=2 AND (v_payment.coverage_status IS DISTINCT FROM 'authorized'
      OR v_payment.settlement_status IS DISTINCT FROM 'settled' OR v_payment.settled_at IS NULL)) THEN
    RAISE EXCEPTION 'Escolha uma forma realmente paga no pedido original.'
      USING ERRCODE='23514',DETAIL='code=pdv_refund_original_payment_invalid'; END IF;
  SELECT COALESCE(sum(refund.amount),0) INTO v_prior FROM public.pdv_refunds refund
   WHERE refund.original_payment_id=p_original_payment_id
     AND NOT EXISTS(SELECT 1 FROM public.pdv_refund_events event WHERE event.refund_id=refund.id AND event.event_kind='reversed');
  IF v_prior+p_amount>v_payment.amount THEN RAISE EXCEPTION 'O reembolso supera o valor desta forma de pagamento.'
    USING ERRCODE='23514',DETAIL='code=pdv_refund_payment_amount_exceeded'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'after_sale.refund.request.v2',
    p_idempotency_key,jsonb_build_object('return_id',p_return_id,'payment_id',p_original_payment_id,
      'amount',round(p_amount,2),'reason',v_reason,'account_id',p_account_id,'cash_session_id',p_cash_session_id)
      ||CASE WHEN p_residual_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('residual_cancellation_id',p_residual_id) END);
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'Este reembolso já está em processamento.' USING ERRCODE='55000'; END IF;
  PERFORM public.pdv_free_value_internal_v3(v_context.company_id,v_context.user_id,p_return_id,p_residual_id,p_amount,
    'ref:'||v_claim.request_id::text);
  INSERT INTO public.pdv_refunds(id,company_id,commercial_return_id,residual_cancellation_id,customer_id,original_payment_id,
    method,amount,requested_on,reason,operation_request_id,created_by)
  VALUES(v_refund,v_context.company_id,p_return_id,p_residual_id,v_return.customer_id,p_original_payment_id,
    v_payment.method,round(p_amount,2),public.company_today(v_context.company_id),v_reason,v_claim.request_id,v_context.user_id);
  INSERT INTO public.pdv_refund_events(company_id,refund_id,event_kind,operation_request_id,metadata,created_by)
  VALUES(v_context.company_id,v_refund,'requested',v_claim.request_id,jsonb_build_object('account_id',p_account_id,'cash_session_id',p_cash_session_id),v_context.user_id) RETURNING id INTO v_requested;
  INSERT INTO public.pdv_return_value_events(company_id,commercial_return_id,residual_cancellation_id,destination_kind,amount,
    resource_id,operation_request_id,created_by)
  VALUES(v_context.company_id,p_return_id,p_residual_id,'refund',round(p_amount,2),v_refund,v_claim.request_id,v_context.user_id);
  IF v_payment.method='dinheiro' THEN
    v_settlement:=public.pdv_settle_refund_internal_v2(v_context.company_id,v_context.user_id,v_refund,
      p_account_id,p_cash_session_id,v_claim.request_id);
  ELSE v_settlement:=jsonb_build_object('status','pending'); END IF;
  v_result:=jsonb_build_object('ok',true,'refund_id',v_refund,'requested_event_id',v_requested,
    'method',v_payment.method,'amount',round(p_amount,2),'status',v_settlement->>'status',
    'financial_transaction_id',v_settlement->>'financial_transaction_id','idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_refund',v_refund,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.pdv_request_return_refund_core_015_v2(p_return_id uuid,p_original_payment_id uuid,p_amount numeric,p_reason text,p_account_id uuid,p_cash_session_id uuid,p_idempotency_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.pdv_request_value_refund_internal_v3(p_return_id,NULL,p_original_payment_id,p_amount,p_reason,p_account_id,p_cash_session_id,p_idempotency_key);
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_guard_after_sale_relationship_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_return record; v_order public.pdv_orders%ROWTYPE; v_exchange public.pdv_exchanges%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='pdv_vouchers' THEN
    SELECT * INTO v_return FROM public.pdv_value_source_internal_v3(NEW.source_commercial_return_id,NEW.source_residual_cancellation_id) header;
    IF NOT FOUND OR v_return.company_id<>NEW.company_id
      OR v_return.customer_id IS DISTINCT FROM NEW.customer_id THEN RAISE EXCEPTION 'Voucher não pertence à devolução.'
      USING ERRCODE='23514',DETAIL='code=pdv_voucher_return_mismatch'; END IF;
  ELSIF TG_TABLE_NAME='pdv_refunds' THEN
    SELECT * INTO v_return FROM public.pdv_value_source_internal_v3(NEW.commercial_return_id,CASE WHEN TG_TABLE_NAME='pdv_refunds' THEN (to_jsonb(NEW)->>'residual_cancellation_id')::uuid END) header;
    IF NOT FOUND OR v_return.company_id<>NEW.company_id
      OR v_return.customer_id IS DISTINCT FROM NEW.customer_id
      OR NOT EXISTS(SELECT 1 FROM public.pdv_order_payments payment WHERE payment.id=NEW.original_payment_id
        AND payment.company_id=NEW.company_id AND payment.order_id=v_return.order_id AND payment.method=NEW.method) THEN
      RAISE EXCEPTION 'Reembolso não corresponde à devolução e ao pagamento original.'
        USING ERRCODE='23514',DETAIL='code=pdv_refund_source_mismatch'; END IF;
  ELSIF TG_TABLE_NAME='pdv_exchanges' THEN
    SELECT * INTO v_return FROM public.pdv_value_source_internal_v3(NEW.commercial_return_id,CASE WHEN TG_TABLE_NAME='pdv_refunds' THEN (to_jsonb(NEW)->>'residual_cancellation_id')::uuid END) header;
    SELECT * INTO v_order FROM public.pdv_orders orders WHERE orders.id=NEW.new_order_id;
    IF v_return.id IS NULL OR v_order.id IS NULL OR v_return.company_id<>NEW.company_id OR v_return.order_id<>NEW.original_order_id
      OR v_return.customer_id IS DISTINCT FROM NEW.customer_id OR v_order.company_id<>NEW.company_id
      OR v_order.customer_id IS DISTINCT FROM NEW.customer_id THEN RAISE EXCEPTION 'Troca não corresponde aos pedidos e à devolução.'
      USING ERRCODE='23514',DETAIL='code=pdv_exchange_source_mismatch'; END IF;
  ELSIF TG_TABLE_NAME='pdv_exchange_value_applications' THEN
    SELECT * INTO v_exchange FROM public.pdv_exchanges exchange WHERE exchange.id=NEW.exchange_id;
    IF NOT FOUND OR v_exchange.company_id<>NEW.company_id OR
      (NEW.source_kind='voucher' AND NOT EXISTS(SELECT 1 FROM public.pdv_voucher_entries entry
        WHERE entry.id=NEW.voucher_entry_id AND entry.company_id=NEW.company_id AND entry.order_id=v_exchange.new_order_id)) OR
      (NEW.source_kind='customer_credit' AND NOT EXISTS(SELECT 1 FROM public.pdv_party_credit_entries entry
        WHERE entry.id=NEW.party_credit_entry_id AND entry.company_id=NEW.company_id
          AND entry.customer_id=v_exchange.customer_id)) THEN RAISE EXCEPTION 'A fonte de valor não pertence à troca.'
      USING ERRCODE='23514',DETAIL='code=pdv_exchange_application_mismatch'; END IF;
  ELSIF TG_TABLE_NAME='pdv_order_payments' AND NEW.contract_version=2
      AND NEW.coverage_kind IN('voucher','customer_credit') THEN
    SELECT * INTO v_order FROM public.pdv_orders orders WHERE orders.id=NEW.order_id;
    IF NOT FOUND OR v_order.company_id<>NEW.company_id OR
      (NEW.coverage_kind='voucher' AND NOT EXISTS(SELECT 1 FROM public.pdv_voucher_entries entry
        JOIN public.pdv_vouchers voucher ON voucher.id=entry.voucher_id
        WHERE entry.id=NEW.voucher_entry_id AND entry.company_id=NEW.company_id AND entry.order_id=NEW.order_id
          AND voucher.customer_id IS NOT DISTINCT FROM v_order.customer_id)) OR
      (NEW.coverage_kind='customer_credit' AND NOT EXISTS(SELECT 1 FROM public.pdv_party_credit_entries entry
        WHERE entry.id=NEW.party_credit_entry_id AND entry.company_id=NEW.company_id
          AND entry.customer_id=v_order.customer_id AND entry.entry_kind='application')) THEN
      RAISE EXCEPTION 'A cobertura não pertence ao pedido.'
        USING ERRCODE='23514',DETAIL='code=pdv_order_value_source_mismatch'; END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.pdv_guard_after_sale_append_only_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_company uuid:=COALESCE(OLD.company_id,NEW.company_id); v_original record; v_balance numeric;
BEGIN
  IF TG_OP='DELETE' AND (NOT EXISTS(SELECT 1 FROM public.companies WHERE id=v_company)
    OR COALESCE(current_setting('app.pdv_purge_company',true),'')=v_company::text) THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND OLD.created_by IS NOT NULL AND NEW.created_by IS NULL
    AND NOT EXISTS(SELECT 1 FROM auth.users users WHERE users.id=OLD.created_by)
    AND (to_jsonb(NEW)-'created_by')=(to_jsonb(OLD)-'created_by') THEN RETURN NEW; END IF;
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'O histórico do pós-venda é imutável; registre uma compensação.'
    USING ERRCODE='55000',DETAIL='code=pdv_after_sale_append_only'; END IF;
  IF TG_TABLE_NAME='pdv_return_value_events' AND NEW.reversal_of_id IS NOT NULL THEN
    SELECT * INTO v_original FROM public.pdv_return_value_events WHERE id=NEW.reversal_of_id FOR UPDATE;
    IF NOT FOUND OR v_original.company_id<>NEW.company_id OR v_original.commercial_return_id IS DISTINCT FROM NEW.commercial_return_id
      OR v_original.residual_cancellation_id IS DISTINCT FROM NEW.residual_cancellation_id
      OR v_original.destination_kind<>NEW.destination_kind OR v_original.resource_id<>NEW.resource_id
      OR NEW.amount<>-v_original.amount THEN RAISE EXCEPTION 'A compensação não corresponde ao destino original.'
      USING ERRCODE='23514',DETAIL='code=pdv_after_sale_reversal_mismatch'; END IF;
  ELSIF TG_TABLE_NAME='pdv_return_value_events' THEN
    IF (NEW.destination_kind='voucher' AND NOT EXISTS(SELECT 1 FROM public.pdv_vouchers resource
          WHERE resource.id=NEW.resource_id AND resource.company_id=NEW.company_id
            AND resource.source_commercial_return_id IS NOT DISTINCT FROM NEW.commercial_return_id
            AND resource.source_residual_cancellation_id IS NOT DISTINCT FROM NEW.residual_cancellation_id))
      OR (NEW.destination_kind='refund' AND NOT EXISTS(SELECT 1 FROM public.pdv_refunds resource
          WHERE resource.id=NEW.resource_id AND resource.company_id=NEW.company_id
            AND resource.commercial_return_id IS NOT DISTINCT FROM NEW.commercial_return_id
            AND resource.residual_cancellation_id IS NOT DISTINCT FROM NEW.residual_cancellation_id)) THEN
      RAISE EXCEPTION 'O destino financeiro não pertence à devolução.'
        USING ERRCODE='23514',DETAIL='code=pdv_after_sale_resource_mismatch'; END IF;
  ELSIF TG_TABLE_NAME='pdv_voucher_entries' THEN
    PERFORM 1 FROM public.pdv_vouchers voucher WHERE voucher.id=NEW.voucher_id
      AND voucher.company_id=NEW.company_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Voucher não encontrado nesta empresa.' USING ERRCODE='P0002'; END IF;
    IF NEW.entry_kind='reversal' THEN
      SELECT * INTO v_original FROM public.pdv_voucher_entries WHERE id=NEW.reversal_of_id FOR UPDATE;
      IF NOT FOUND OR v_original.company_id<>NEW.company_id OR v_original.voucher_id<>NEW.voucher_id
        OR v_original.entry_kind='reversal' OR NEW.amount<>-v_original.amount
        OR NEW.order_id IS DISTINCT FROM v_original.order_id THEN RAISE EXCEPTION 'Estorno de voucher inválido.'
        USING ERRCODE='23514',DETAIL='code=pdv_voucher_reversal_mismatch'; END IF;
    END IF;
    SELECT COALESCE(sum(entry.amount),0) INTO v_balance FROM public.pdv_voucher_entries entry
      WHERE entry.voucher_id=NEW.voucher_id;
    IF v_balance+NEW.amount<0 THEN RAISE EXCEPTION 'O voucher não possui saldo suficiente.'
      USING ERRCODE='23514',DETAIL='code=pdv_voucher_insufficient'; END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.pdv_reverse_party_credit_entry_v2(p_entry_id uuid, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_context record; v_claim record; v_original public.pdv_party_credit_entries%ROWTYPE;
  v_party uuid; v_entry uuid; v_reason text; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_party_account_context_v2(TRUE);
  v_reason:=NULLIF(btrim(COALESCE(p_reason,'')),'');
  IF v_reason IS NULL OR char_length(v_reason)>500 THEN RAISE EXCEPTION 'Informe o motivo do estorno.'
    USING ERRCODE='22023',DETAIL='code=pdv_party_credit_reason_invalid'; END IF;
  SELECT * INTO v_original FROM public.pdv_party_credit_entries entry
   WHERE entry.id=p_entry_id AND entry.company_id=v_context.company_id FOR UPDATE;
  IF NOT FOUND OR v_original.entry_kind='reversal' THEN
    RAISE EXCEPTION 'Movimento não encontrado ou não estornável.' USING ERRCODE='P0002',DETAIL='code=pdv_party_credit_not_reversible';
  END IF;
  IF num_nonnulls(v_original.source_commercial_return_id,v_original.source_residual_cancellation_id)>0 THEN
    RAISE EXCEPTION 'Este crédito pertence a uma devolução e deve ser compensado por ela.'
      USING ERRCODE='23514',DETAIL='code=pdv_return_credit_reverse_public_forbidden';
  END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(
    v_context.company_id,'party.credit.reverse.v2',p_idempotency_key,
    jsonb_build_object('entry_id',p_entry_id,'reason',v_reason));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',TRUE); END IF;
    RAISE EXCEPTION 'Este estorno já está em processamento.' USING ERRCODE='55000',DETAIL='code=pdv_party_credit_in_progress';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_party_credit_entries reversal
    WHERE reversal.reversal_of_id=v_original.id) THEN
    RAISE EXCEPTION 'Este movimento já foi estornado.'
      USING ERRCODE='23514',DETAIL='code=pdv_party_credit_already_reversed';
  END IF;
  v_party:=COALESCE(v_original.customer_id,v_original.supplier_id);
  IF v_original.party_type='customer' THEN
    PERFORM 1 FROM public.customers WHERE id=v_party ORDER BY id FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.suppliers WHERE id=v_party ORDER BY id FOR UPDATE;
  END IF;
  INSERT INTO public.pdv_party_credit_entries(company_id,party_type,customer_id,supplier_id,
    entry_kind,amount,occurred_on,description,target_financial_transaction_id,
    reversal_of_id,operation_request_id,created_by)
  VALUES(v_context.company_id,v_original.party_type,v_original.customer_id,v_original.supplier_id,
    'reversal',-v_original.amount,public.company_today(v_context.company_id),v_reason,
    v_original.target_financial_transaction_id,v_original.id,v_claim.request_id,v_context.user_id)
  RETURNING id INTO v_entry;
  v_result:=jsonb_build_object('ok',TRUE,'entry_id',v_entry,'reversal_of_id',p_entry_id,
    'available_credit',public.pdv_party_available_credit_v2(v_context.company_id,
      v_original.party_type,v_party),'idempotent',FALSE);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_party_credit_entry',v_entry,v_result);
  RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.pdv_confirm_return_refund_v2(p_refund_id uuid, p_account_id uuid, p_confirmation_reference text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN PERFORM public.pdv_assert_order_cash_access_v2(public.pdv_refund_order_internal_v3(p_refund_id),auth.uid()); RETURN public.pdv_confirm_return_refund_core_015_v2(p_refund_id,p_account_id,p_confirmation_reference,p_idempotency_key); END $function$;

CREATE OR REPLACE FUNCTION public.pdv_confirm_return_refund_base_v2(p_refund_id uuid, p_account_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_context record; v_claim record; v_refund public.pdv_refunds%ROWTYPE; v_settlement jsonb; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:confirm_pdv_refund');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id,
       p_order_id => public.pdv_refund_order_internal_v3(p_refund_id)
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque deste reembolso.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied';
  END IF;
  SELECT * INTO v_refund FROM public.pdv_refunds refund WHERE refund.id=p_refund_id
    AND refund.company_id=v_context.company_id FOR UPDATE;
  IF NOT FOUND OR v_refund.method='dinheiro' THEN RAISE EXCEPTION 'Reembolso pendente não encontrado.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'after_sale.refund.confirm.v2',
    p_idempotency_key,jsonb_build_object('refund_id',p_refund_id,'account_id',p_account_id));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'A confirmação já está em processamento.' USING ERRCODE='55000'; END IF;
  v_settlement:=public.pdv_settle_refund_internal_v2(v_context.company_id,v_context.user_id,p_refund_id,
    p_account_id,NULL,v_claim.request_id);
  v_result:=jsonb_build_object('ok',true,'refund_id',p_refund_id,'status','settled',
    'financial_transaction_id',v_settlement->>'financial_transaction_id','idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_refund',p_refund_id,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.pdv_confirm_return_refund_core_015_v2(p_refund_id uuid, p_account_id uuid, p_confirmation_reference text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_context record; v_refund public.pdv_refunds%ROWTYPE; v_claim record; v_base jsonb;
  v_reference text; v_hash text; v_redacted text; v_event uuid; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:confirm_pdv_refund');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id,
       p_order_id => public.pdv_refund_order_internal_v3(p_refund_id)
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque deste reembolso.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied';
  END IF;
  SELECT * INTO v_refund FROM public.pdv_refunds refund WHERE refund.id=p_refund_id
    AND refund.company_id=v_context.company_id;
  IF NOT FOUND OR v_refund.method='dinheiro' THEN RAISE EXCEPTION 'Reembolso pendente não encontrado.' USING ERRCODE='P0002'; END IF;
  v_reference:=NULLIF(btrim(COALESCE(p_confirmation_reference,'')),'');
  IF v_refund.method IN('pix','debito','credito') AND
    (v_reference IS NULL OR char_length(v_reference) NOT BETWEEN 6 AND 120) THEN
    RAISE EXCEPTION 'Informe a referência da confirmação externa.'
      USING ERRCODE='22023',DETAIL='code=pdv_refund_confirmation_reference_required'; END IF;
  IF v_reference IS NOT NULL AND (char_length(v_reference)>120 OR v_reference~'[[:cntrl:]]') THEN
    RAISE EXCEPTION 'A referência externa é inválida.' USING ERRCODE='22023'; END IF;
  v_hash:=CASE WHEN v_reference IS NULL THEN NULL ELSE
    encode(extensions.digest(convert_to(v_reference,'UTF8'),'sha256'),'hex') END;
  v_redacted:=CASE WHEN v_reference IS NULL THEN NULL
    ELSE '••••'||right(v_reference,LEAST(4,char_length(v_reference))) END;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,
    'after_sale.refund.confirm.external.v2',p_idempotency_key,
    jsonb_build_object('refund_id',p_refund_id,'account_id',p_account_id,'reference_hash',v_hash));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'A confirmação já está em processamento.' USING ERRCODE='55000'; END IF;
  v_base:=public.pdv_confirm_return_refund_base_v2(p_refund_id,p_account_id,
    'external-confirm:'||v_claim.request_id::text);
  SELECT event.id INTO v_event FROM public.pdv_refund_events event
   WHERE event.refund_id=p_refund_id AND event.event_kind='settled' FOR UPDATE;
  IF v_reference IS NOT NULL THEN
    INSERT INTO public.pdv_refund_confirmation_references(company_id,refund_id,refund_event_id,
      reference_hash,reference_redacted,operation_request_id,created_by)
    VALUES(v_context.company_id,p_refund_id,v_event,v_hash,v_redacted,v_claim.request_id,v_context.user_id);
  END IF;
  v_result:=v_base||jsonb_build_object('confirmation_reference_redacted',v_redacted,'idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_refund',p_refund_id,v_result);
  RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.pdv_reverse_return_refund_v2(p_refund_id uuid, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_context record; v_payload jsonb; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:reverse_pdv_refund');
  PERFORM public.pdv_assert_order_cash_access_v2(
    public.pdv_refund_order_internal_v3(p_refund_id),
    auth.uid()
  );
  v_payload:=jsonb_build_object(
    'refund_id',p_refund_id,'reason',NULLIF(btrim(COALESCE(p_reason,'')),'')
  );
  SELECT request.result INTO v_result
    FROM public.pdv_operation_requests request
   WHERE request.company_id=v_context.company_id
     AND request.operation_type='after_sale.refund.reverse.v2'
     AND request.idempotency_key=p_idempotency_key
     AND request.payload_hash=public.pdv_operation_payload_hash(v_payload)
     AND request.status='completed';
  IF v_result IS NOT NULL THEN
    RETURN v_result||jsonb_build_object('idempotent',true);
  END IF;
  RETURN public.pdv_reverse_return_refund_v2_before_retry_fix(
    p_refund_id,p_reason,p_idempotency_key
  );
END $function$;

CREATE OR REPLACE FUNCTION public.pdv_reverse_return_refund_v2_before_retry_fix(p_refund_id uuid, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN PERFORM public.pdv_assert_order_cash_access_v2(public.pdv_refund_order_internal_v3(p_refund_id),auth.uid()); RETURN public.pdv_reverse_return_refund_core_015_v2(p_refund_id,p_reason,p_idempotency_key); END $function$;

CREATE OR REPLACE FUNCTION public.pdv_reverse_return_refund_core_015_v2(p_refund_id uuid, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_context record; v_claim record; v_refund public.pdv_refunds%ROWTYPE; v_settled public.pdv_refund_events%ROWTYPE;
  v_original public.financial_transactions%ROWTYPE; v_original_custody public.pdv_cash_custody_entries%ROWTYPE;
  v_session public.pdv_cash_sessions%ROWTYPE; v_financial uuid; v_custody uuid; v_event uuid; v_value record;
  v_reason text; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:reverse_pdv_refund');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id,
       p_order_id => public.pdv_refund_order_internal_v3(p_refund_id)
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque deste reembolso.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied';
  END IF;
  v_reason:=NULLIF(btrim(COALESCE(p_reason,'')),'');
  IF v_reason IS NULL OR char_length(v_reason)>500 THEN RAISE EXCEPTION 'Informe o motivo do estorno.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_refund FROM public.pdv_refunds refund WHERE refund.id=p_refund_id
    AND refund.company_id=v_context.company_id FOR UPDATE;
  SELECT * INTO v_settled FROM public.pdv_refund_events event WHERE event.refund_id=p_refund_id
    AND event.event_kind='settled' FOR UPDATE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.pdv_refund_events event WHERE event.reversal_of_id=v_settled.id) THEN
    RAISE EXCEPTION 'Reembolso liquidado não encontrado ou já estornado.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'after_sale.refund.reverse.v2',
    p_idempotency_key,jsonb_build_object('refund_id',p_refund_id,'reason',v_reason));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'Este estorno já está em processamento.' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_original FROM public.financial_transactions transaction
   WHERE transaction.id=v_settled.financial_transaction_id FOR UPDATE;
  PERFORM public.pdv_lock_treasury_account(v_context.company_id,v_original.account_id);
  IF v_settled.custody_entry_id IS NOT NULL THEN
    SELECT * INTO v_original_custody FROM public.pdv_cash_custody_entries entry
     WHERE entry.id=v_settled.custody_entry_id FOR UPDATE;
    SELECT * INTO v_session FROM public.pdv_cash_sessions session WHERE session.id=v_original_custody.session_id FOR UPDATE;
    IF v_session.status<>'aberta' THEN RAISE EXCEPTION 'O caixa original já fechou; faça compensação pós-fechamento.'
      USING ERRCODE='42501',DETAIL='code=pdv_refund_reverse_closed_cash'; END IF;
    PERFORM set_config('app.pdv_treasury_custody_delta',jsonb_build_object(
      'company_id',v_context.company_id,'account_id',v_original.account_id,'request_id',v_claim.request_id,
      'delta',v_refund.amount)::text,true);
  END IF;
  INSERT INTO public.financial_transactions(company_id,transaction_type,description,amount,category,
    transaction_date,paid_date,is_paid,account_id,customer_id,origin,payment_method,created_by,notes,
    pdv_financial_role,pdv_settlement_group_id,pdv_cash_session_id)
  VALUES(v_context.company_id,'entrada'::public.transaction_type,'Estorno de reembolso do PDV',v_refund.amount,
    'Estorno de reembolso do PDV',public.company_today(v_context.company_id),public.company_today(v_context.company_id),true,
    v_original.account_id,v_refund.customer_id,'pdv',v_refund.method,v_context.user_id,v_reason,
    'pdv_refund_reversal',v_refund.id,CASE WHEN v_settled.custody_entry_id IS NOT NULL THEN v_original_custody.session_id END) RETURNING id INTO v_financial;
  IF v_settled.custody_entry_id IS NOT NULL THEN
    PERFORM set_config('app.pdv_treasury_custody_delta','',true);
    INSERT INTO public.pdv_cash_custody_entries(company_id,session_id,cash_account_id,operation_request_id,
      entry_kind,amount,source_type,source_id,financial_transaction_id,reversal_of_id,metadata,created_by)
    VALUES(v_context.company_id,v_original_custody.session_id,v_original.account_id,v_claim.request_id,
      'reversal',v_refund.amount,'pdv_refund',v_refund.id,v_financial,v_original_custody.id,
      jsonb_build_object('reason',v_reason),v_context.user_id) RETURNING id INTO v_custody;
  END IF;
  INSERT INTO public.pdv_refund_events(company_id,refund_id,event_kind,financial_transaction_id,custody_entry_id,
    reversal_of_id,operation_request_id,metadata,created_by)
  VALUES(v_context.company_id,p_refund_id,'reversed',v_financial,v_custody,v_settled.id,v_claim.request_id,
    jsonb_build_object('reason',v_reason),v_context.user_id) RETURNING id INTO v_event;
  SELECT * INTO v_value FROM public.pdv_return_value_events value
   WHERE value.destination_kind='refund' AND value.resource_id=p_refund_id AND value.amount>0 FOR UPDATE;
  INSERT INTO public.pdv_return_value_events(company_id,commercial_return_id,residual_cancellation_id,destination_kind,amount,
    resource_id,reversal_of_id,operation_request_id,created_by)
  VALUES(v_context.company_id,v_refund.commercial_return_id,v_refund.residual_cancellation_id,'refund',-v_refund.amount,p_refund_id,
    v_value.id,v_claim.request_id,v_context.user_id);
  v_result:=jsonb_build_object('ok',true,'refund_id',p_refund_id,'status','reversed',
    'financial_transaction_id',v_financial,'custody_entry_id',v_custody,'idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_refund',p_refund_id,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.pdv_reverse_return_voucher_v2(p_voucher_id uuid, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_context record; v_payload jsonb; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:reverse_pdv_after_sale');
  PERFORM public.pdv_assert_order_cash_access_v2(
    public.pdv_voucher_order_internal_v3(p_voucher_id),
    auth.uid()
  );
  v_payload:=jsonb_build_object(
    'voucher_id',p_voucher_id,'reason',NULLIF(btrim(COALESCE(p_reason,'')),'')
  );
  SELECT request.result INTO v_result
    FROM public.pdv_operation_requests request
   WHERE request.company_id=v_context.company_id
     AND request.operation_type='after_sale.voucher.reverse.v2'
     AND request.idempotency_key=p_idempotency_key
     AND request.payload_hash=public.pdv_operation_payload_hash(v_payload)
     AND request.status='completed';
  IF v_result IS NOT NULL THEN
    RETURN v_result||jsonb_build_object('idempotent',true);
  END IF;
  RETURN public.pdv_reverse_return_voucher_v2_before_retry_fix(
    p_voucher_id,p_reason,p_idempotency_key
  );
END $function$;

CREATE OR REPLACE FUNCTION public.pdv_reverse_return_voucher_v2_before_retry_fix(p_voucher_id uuid, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN PERFORM public.pdv_assert_order_cash_access_v2(public.pdv_voucher_order_internal_v3(p_voucher_id),auth.uid()); RETURN public.pdv_reverse_return_voucher_core_015_v2(p_voucher_id,p_reason,p_idempotency_key); END $function$;

CREATE OR REPLACE FUNCTION public.pdv_reverse_return_voucher_core_015_v2(p_voucher_id uuid, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_context record; v_claim record; v_voucher public.pdv_vouchers%ROWTYPE; v_issue public.pdv_voucher_entries%ROWTYPE;
  v_entry uuid; v_value record; v_reason text; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:reverse_pdv_after_sale');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id,
       p_order_id => public.pdv_voucher_order_internal_v3(p_voucher_id)
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque deste voucher.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied';
  END IF;
  v_reason:=NULLIF(btrim(COALESCE(p_reason,'')),'');
  IF v_reason IS NULL OR char_length(v_reason)>500 THEN RAISE EXCEPTION 'Informe o motivo do estorno.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_voucher FROM public.pdv_vouchers voucher WHERE voucher.id=p_voucher_id
    AND voucher.company_id=v_context.company_id FOR UPDATE;
  SELECT * INTO v_issue FROM public.pdv_voucher_entries entry WHERE entry.voucher_id=p_voucher_id
    AND entry.entry_kind='issue' FOR UPDATE;
  IF NOT FOUND OR public.pdv_voucher_balance_internal_v2(p_voucher_id)<>v_issue.amount
    OR EXISTS(SELECT 1 FROM public.pdv_voucher_entries entry WHERE entry.reversal_of_id=v_issue.id) THEN
    RAISE EXCEPTION 'Voucher não encontrado, utilizado ou já estornado.'
      USING ERRCODE='23514',DETAIL='code=pdv_voucher_not_reversible'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'after_sale.voucher.reverse.v2',
    p_idempotency_key,jsonb_build_object('voucher_id',p_voucher_id,'reason',v_reason));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'Este estorno já está em processamento.' USING ERRCODE='55000'; END IF;
  INSERT INTO public.pdv_voucher_entries(company_id,voucher_id,entry_kind,amount,order_id,reversal_of_id,
    operation_request_id,description,created_by)
  VALUES(v_context.company_id,p_voucher_id,'reversal',-v_issue.amount,NULL,v_issue.id,v_claim.request_id,
    v_reason,v_context.user_id) RETURNING id INTO v_entry;
  SELECT * INTO v_value FROM public.pdv_return_value_events value WHERE value.destination_kind='voucher'
    AND value.resource_id=p_voucher_id AND value.amount>0 FOR UPDATE;
  INSERT INTO public.pdv_return_value_events(company_id,commercial_return_id,residual_cancellation_id,destination_kind,amount,
    resource_id,reversal_of_id,operation_request_id,created_by)
  VALUES(v_context.company_id,v_voucher.source_commercial_return_id,v_voucher.source_residual_cancellation_id,'voucher',-v_issue.amount,p_voucher_id,
    v_value.id,v_claim.request_id,v_context.user_id);
  v_result:=jsonb_build_object('ok',true,'voucher_id',p_voucher_id,'voucher_entry_id',v_entry,
    'balance',0,'idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_voucher',p_voucher_id,v_result); RETURN v_result;
END $function$;

CREATE OR REPLACE FUNCTION public.pdv_search_vouchers_v2(p_query text, p_customer_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_context record; v_query text; v_pattern text; v_total bigint;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:view_pdv_after_sale');
  v_query:=upper(NULLIF(btrim(COALESCE(p_query,'')),''));
  IF p_limit IS NULL OR p_offset IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset<0
    OR (p_customer_id IS NULL AND (v_query IS NULL OR char_length(v_query)<8)) THEN
    RAISE EXCEPTION 'Informe código/cliente e paginação válidos.'
      USING ERRCODE='22023',DETAIL='code=pdv_voucher_search_invalid'; END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customers customer
    WHERE customer.id=p_customer_id AND customer.company_id=v_context.company_id AND customer.is_deleted IS FALSE) THEN
    RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE='P0002'; END IF;
  -- Rate limit continua obrigatório na borda HTTP. No banco, a busca sem
  -- cliente exige prefixo longo e trata metacaracteres como texto literal.
  v_pattern:=CASE WHEN v_query IS NULL THEN NULL ELSE
    replace(replace(replace(v_query,'\','\\'),'%','\%'),'_','\_') END;
  SELECT count(*) INTO v_total FROM public.pdv_vouchers voucher
   WHERE voucher.company_id=v_context.company_id AND (p_customer_id IS NULL OR voucher.customer_id=p_customer_id)
     AND public.pdv_has_stock_access_scope_v2(v_context.user_id,v_context.company_id,
       p_order_id=>public.pdv_value_order_internal_v3(voucher.source_commercial_return_id,voucher.source_residual_cancellation_id)) IS TRUE
     AND (v_query IS NULL OR voucher.public_code LIKE v_pattern||'%' ESCAPE '\');
  RETURN jsonb_build_object('items',COALESCE((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'voucher_id',CASE WHEN row.can_disclose THEN row.voucher_id END,
    'public_code',CASE WHEN row.can_disclose THEN row.public_code
      ELSE left(row.public_code,3)||'••••'||right(row.public_code,4) END,
    'customer_id',CASE WHEN row.can_disclose THEN row.customer_id END,
    'customer_name',CASE WHEN row.can_disclose THEN row.customer_name END,
    'balance',CASE WHEN row.can_disclose THEN row.balance END,
    'expires_on',row.expires_on,'status',row.status))
    ORDER BY row.public_code) FROM (SELECT voucher.id voucher_id,voucher.public_code,voucher.customer_id,
      customer.name customer_name,public.pdv_voucher_balance_internal_v2(voucher.id) balance,voucher.expires_on,
      (p_customer_id IS NOT NULL OR voucher.public_code=v_query) can_disclose,
      CASE WHEN public.pdv_voucher_balance_internal_v2(voucher.id)<=0 THEN 'exhausted'
        WHEN voucher.expires_on IS NOT NULL AND voucher.expires_on<public.company_today(v_context.company_id) THEN 'expired'
        ELSE 'active' END status
      FROM public.pdv_vouchers voucher JOIN public.customers customer ON customer.id=voucher.customer_id
     WHERE voucher.company_id=v_context.company_id AND (p_customer_id IS NULL OR voucher.customer_id=p_customer_id)
       AND public.pdv_has_stock_access_scope_v2(v_context.user_id,v_context.company_id,
         p_order_id=>public.pdv_value_order_internal_v3(voucher.source_commercial_return_id,voucher.source_residual_cancellation_id)) IS TRUE
       AND (v_query IS NULL OR voucher.public_code LIKE v_pattern||'%' ESCAPE '\')
     ORDER BY voucher.public_code LIMIT p_limit OFFSET p_offset) row),'[]'::jsonb),
    'total',v_total,'limit',p_limit,'offset',p_offset);
END $function$;

-- Pure read model; writer obtains canonical locks before recomputing this plan.
CREATE FUNCTION public.pdv_residual_plan_internal_v3(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c record; o public.pdv_orders%ROWTYPE; p record; f public.financial_transactions%ROWTYPE;
  total numeric:=0; delivered numeric:=0; residual numeric; debt numeric:=0; take numeric;
  covered numeric:=0; debt_lines jsonb:='[]'; paid_lines jsonb:='[]'; plan jsonb;
BEGIN
  SELECT * INTO c FROM public.pdv_returns_context_v2('fn:cancel_pdv_order_residual');
  PERFORM public.pdv_assert_order_cash_access_v2(p_order_id,c.user_id);
  IF public.pdv_has_stock_access_scope_v2(c.user_id,c.company_id,p_order_id=>p_order_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais deste pedido.' USING ERRCODE='42501',DETAIL='code=pdv_return_stock_denied'; END IF;
  SELECT * INTO o FROM public.pdv_orders WHERE id=p_order_id AND company_id=c.company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE='P0002'; END IF;
  IF o.contract_version IS DISTINCT FROM 2 OR o.status NOT IN('liberado_retirada','retirada_parcial') THEN
    RAISE EXCEPTION 'Este pedido precisa de revisão antes do cancelamento do restante.' USING ERRCODE='23514',DETAIL='code=pdv_residual_source_unsupported'; END IF;
  IF o.customer_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.customers customer
      WHERE customer.id=o.customer_id AND customer.company_id=c.company_id AND customer.is_deleted IS FALSE) THEN
    RAISE EXCEPTION 'Identifique o cliente antes de destinar o valor do restante.' USING ERRCODE='23514',DETAIL='code=pdv_residual_customer_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_commercial_returns WHERE order_id=p_order_id)
    OR EXISTS(SELECT 1 FROM public.pdv_order_residual_cancellations WHERE order_id=p_order_id)
    OR EXISTS(SELECT 1 FROM public.pdv_order_items WHERE order_id=p_order_id AND contract_version IS DISTINCT FROM 2)
    OR EXISTS(SELECT 1 FROM public.pdv_delivery_items di JOIN public.pdv_deliveries d ON d.id=di.delivery_id
      WHERE d.order_id=p_order_id AND (di.recognition_contract_version IS DISTINCT FROM 2
        OR di.commercial_amount_snapshot IS NULL)) THEN
    RAISE EXCEPTION 'O histórico deste pedido precisa de conciliação antes de cancelar o restante.' USING ERRCODE='23514',DETAIL='code=pdv_residual_source_unsupported'; END IF;
  SELECT COALESCE(sum(item.total),0) INTO total FROM public.pdv_order_items item WHERE item.order_id=p_order_id;
  SELECT COALESCE(sum(di.commercial_amount_snapshot),0) INTO delivered FROM public.pdv_delivery_items di
    JOIN public.pdv_deliveries d ON d.id=di.delivery_id WHERE d.order_id=p_order_id;
  IF lower(total::text) IN('nan','infinity','-infinity') OR lower(delivered::text) IN('nan','infinity','-infinity')
    OR total<>o.total OR delivered<0 OR delivered>=total OR EXISTS(
    SELECT 1 FROM public.pdv_order_items item
    LEFT JOIN LATERAL(SELECT sum(di.quantity) quantity,sum(di.commercial_amount_snapshot) amount
      FROM public.pdv_delivery_items di JOIN public.pdv_deliveries d ON d.id=di.delivery_id
      WHERE d.order_id=p_order_id AND di.order_item_id=item.id) received ON true
    WHERE item.order_id=p_order_id AND (COALESCE(received.quantity,0)>item.quantity
      OR COALESCE(received.amount,0)>item.total)) THEN
    RAISE EXCEPTION 'Confira as entregas e os valores deste pedido antes de cancelar.' USING ERRCODE='23514',DETAIL='code=pdv_residual_snapshot_mismatch'; END IF;
  residual:=round(total-delivered,2);
  FOR p IN SELECT * FROM public.pdv_order_payments payment WHERE payment.order_id=p_order_id
      ORDER BY payment.receivable_transaction_id NULLS LAST,payment.id LOOP
    IF p.company_id<>c.company_id OR p.contract_version IS DISTINCT FROM 2 OR p.coverage_status<>'authorized'
      OR p.method NOT IN('dinheiro','pix','transferencia','fiado') OR p.amount<>round(p.amount,2)
      OR lower(p.amount::text) IN('nan','infinity','-infinity')
      OR EXISTS(SELECT 1 FROM public.pdv_refunds refund WHERE refund.original_payment_id=p.id) THEN
      RAISE EXCEPTION 'A origem da cobertura exige revisão financeira antes do cancelamento.' USING ERRCODE='23514',DETAIL='code=pdv_residual_source_unsupported'; END IF;
    covered:=covered+p.amount;
    IF p.method='fiado' THEN
      SELECT * INTO f FROM public.financial_transactions WHERE id=p.receivable_transaction_id;
      IF NOT FOUND OR f.company_id<>c.company_id OR f.customer_id IS DISTINCT FROM o.customer_id
        OR f.pdv_financial_role IS DISTINCT FROM 'pdv_receivable_principal' OR f.amount<>p.amount
        OR f.cancelled_at IS NOT NULL OR f.is_paid IS TRUE OR COALESCE(f.amount_received,0)<>0
        OR p.coverage_kind<>'receivable' OR p.settlement_status<>'open'
        OR public.pdv_party_obligation_open_v2(f.id)<>p.amount
        OR EXISTS(SELECT 1 FROM public.pdv_receivable_settlement_allocations a WHERE a.receivable_transaction_id=f.id)
        OR EXISTS(SELECT 1 FROM public.pdv_party_credit_entries e WHERE e.target_financial_transaction_id=f.id) THEN
        RAISE EXCEPTION 'O fiado já possui recebimento ou ajuste e precisa de conciliação.' USING ERRCODE='23514',DETAIL='code=pdv_residual_receivable_unsupported'; END IF;
      take:=LEAST(p.amount,GREATEST(residual-debt,0));
      IF take>0 THEN
        debt:=debt+take;
        debt_lines:=debt_lines||jsonb_build_array(jsonb_build_object('payment_id',p.id,
          'receivable_transaction_id',f.id,'amount',take));
      END IF;
    ELSE
      SELECT * INTO f FROM public.financial_transactions WHERE id=p.settlement_transaction_id;
      IF NOT FOUND OR f.company_id<>c.company_id OR f.transaction_type::text<>'entrada'
        OR f.customer_id IS DISTINCT FROM o.customer_id OR f.is_paid IS DISTINCT FROM TRUE
        OR f.cancelled_at IS NOT NULL OR f.amount<>p.amount OR f.payment_method IS DISTINCT FROM p.method
        OR f.pdv_financial_role IS DISTINCT FROM 'pdv_receivable_settlement'
        OR p.settlement_status<>'settled' OR p.settled_at IS NULL
        OR p.financial_account_id IS DISTINCT FROM f.account_id
        OR p.coverage_kind IS DISTINCT FROM (CASE p.method WHEN 'dinheiro' THEN 'cash' WHEN 'pix' THEN 'pix' ELSE 'transfer' END)
        OR EXISTS(SELECT 1 FROM public.financial_transactions child WHERE child.pdv_settlement_group_id=f.pdv_settlement_group_id
          AND child.pdv_financial_role='pdv_receivable_reversal') THEN
        RAISE EXCEPTION 'Não foi possível comprovar a liquidação do pagamento original.' USING ERRCODE='23514',DETAIL='code=pdv_residual_settlement_unsupported'; END IF;
      paid_lines:=paid_lines||jsonb_build_array(jsonb_build_object('payment_id',p.id,'method',p.method,
        'amount',p.amount,'account_id',f.account_id,'settlement_transaction_id',f.id));
    END IF;
  END LOOP;
  IF covered<>total THEN RAISE EXCEPTION 'A cobertura deste pedido precisa ser conciliada.' USING ERRCODE='23514',DETAIL='code=pdv_residual_coverage_mismatch'; END IF;
  plan:=jsonb_build_object('order_id',p_order_id,'customer_id',o.customer_id,'order_total',total,
    'delivered_amount',delivered,'residual_amount',residual,'receivable_reduction_amount',debt,
    'paid_disposition_amount',residual-debt,'receivable_reductions',debt_lines,'original_payments',paid_lines);
  RETURN plan||jsonb_build_object('plan_hash',public.pdv_operation_payload_hash(plan));
END $fn$;

CREATE FUNCTION public.pdv_get_order_residual_plan_v3(p_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT public.pdv_residual_plan_internal_v3(p_order_id);
$fn$;

CREATE FUNCTION public.pdv_cancel_order_residual_v3(p_order_id uuid,p_reason text,p_dispositions jsonb,
  p_expected_plan_hash text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c record; o public.pdv_orders%ROWTYPE; claim record; plan jsonb; reason text; normalized jsonb;
  line jsonb; reduction jsonb; account uuid; cancel_id uuid:=gen_random_uuid(); entry uuid; application uuid;
  result jsonb; resources jsonb:='[]'; resource jsonb; reservation record; released numeric:=0;
  delivered_quantity numeric; idx integer:=0; v_amount numeric; total_dispositions numeric; source_available numeric;
BEGIN
  SELECT * INTO c FROM public.pdv_returns_context_v2('fn:cancel_pdv_order_residual');
  PERFORM public.pdv_assert_order_cash_access_v2(p_order_id,c.user_id);
  IF public.pdv_has_stock_access_scope_v2(c.user_id,c.company_id,p_order_id=>p_order_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais deste pedido.' USING ERRCODE='42501',DETAIL='code=pdv_return_stock_denied'; END IF;
  reason:=NULLIF(btrim(COALESCE(p_reason,'')),'');
  IF reason IS NULL OR char_length(reason)>500 OR p_expected_plan_hash IS NULL
    OR jsonb_typeof(p_dispositions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_dispositions)>10 THEN
    RAISE EXCEPTION 'Confira o motivo e o destino de todo o valor recebido.' USING ERRCODE='22023',DETAIL='code=pdv_residual_payload_invalid'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_dispositions) d WHERE jsonb_typeof(d)<>'object'
      OR (d-ARRAY['kind','original_payment_id','amount','account_id','cash_session_id','expires_on'])<>'{}'
      OR NOT(d?'kind' AND d?'original_payment_id' AND d?'amount')
      OR d->>'kind' IS NULL OR d->>'kind' NOT IN('customer_credit','voucher','refund')) THEN
    RAISE EXCEPTION 'Confira o formato dos destinos financeiros.' USING ERRCODE='22023',DETAIL='code=pdv_residual_payload_invalid'; END IF;
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',d->>'kind','original_payment_id',(d->>'original_payment_id')::uuid,
      'amount',(d->>'amount')::numeric,'account_id',NULLIF(d->>'account_id','')::uuid,
      'cash_session_id',NULLIF(d->>'cash_session_id','')::uuid,'expires_on',NULLIF(d->>'expires_on','')::date)
      ORDER BY d->>'kind',(d->>'original_payment_id')::uuid,COALESCE(d->>'account_id','')),'[]')
      INTO normalized FROM jsonb_array_elements(p_dispositions) d;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Confira os valores e os destinos financeiros.' USING ERRCODE='22023',DETAIL='code=pdv_residual_payload_invalid'; END;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(normalized) d WHERE (d->>'amount')::numeric IS NULL
      OR (d->>'amount')::numeric<=0 OR (d->>'amount')::numeric<>round((d->>'amount')::numeric,2)
      OR lower(d->>'amount') IN('nan','infinity','-infinity') OR (d->>'amount')::numeric>999999999.99
      OR d->>'original_payment_id' IS NULL OR (d->>'kind'<>'refund' AND (d->>'account_id' IS NOT NULL OR d->>'cash_session_id' IS NOT NULL))
      OR (d->>'kind'<>'voucher' AND d->>'expires_on' IS NOT NULL))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(normalized) d GROUP BY d->>'kind',d->>'original_payment_id' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Informe destinos distintos e valores positivos em centavos.' USING ERRCODE='22023',DETAIL='code=pdv_residual_payload_invalid'; END IF;
  -- Permissão de destino é independente da permissão de cancelar.
  PERFORM public.pdv_party_account_context_v2(TRUE);
  FOR line IN SELECT value FROM jsonb_array_elements(normalized) LOOP
    IF line->>'kind'='voucher' THEN PERFORM public.pdv_after_sale_context_v2('fn:issue_pdv_voucher'); END IF;
    IF line->>'kind'='refund' THEN
      PERFORM public.pdv_after_sale_context_v2('fn:refund_pdv_return');
      IF line->>'cash_session_id' IS NULL AND NOT public.is_admin_or_gestor(c.user_id) AND NOT public.is_super_admin(c.user_id)
        AND public.pdv_has_explicit_action_permission_v2(c.user_id,'fn:use_bank_accounts') IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Seu perfil não permite usar a conta bancária de reembolso.' USING ERRCODE='42501'; END IF;
      IF line->>'cash_session_id' IS NOT NULL
        AND public.pdv_current_actor_can_access_session_v3((line->>'cash_session_id')::uuid) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Escolha um caixa aberto por você.' USING ERRCODE='42501',DETAIL='code=pdv_refund_cash_denied'; END IF;
    END IF;
  END LOOP;
  SELECT * INTO claim FROM public.pdv_claim_operation_request(c.company_id,'commercial.order.cancel_residual.v3',p_idempotency_key,
    jsonb_build_object('order_id',p_order_id,'reason',reason,'dispositions',normalized,'expected_plan_hash',p_expected_plan_hash));
  IF claim.is_replay THEN
    IF claim.request_status='completed' THEN RETURN claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'Este cancelamento já está sendo processado.' USING ERRCODE='55000'; END IF;
  -- Treasury -> customer -> receivable/settlement -> order -> inventory/stock -> reservation.
  FOR account IN SELECT DISTINCT (d->>'account_id')::uuid FROM jsonb_array_elements(normalized) d
      WHERE d->>'account_id' IS NOT NULL ORDER BY 1 LOOP
    PERFORM public.pdv_lock_treasury_account(c.company_id,account);
  END LOOP;
  SELECT * INTO o FROM public.pdv_orders WHERE id=p_order_id AND company_id=c.company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE='P0002'; END IF;
  PERFORM customer.id FROM public.customers customer WHERE customer.id=o.customer_id AND customer.company_id=c.company_id FOR UPDATE;
  PERFORM ft.id FROM public.financial_transactions ft WHERE ft.company_id=c.company_id AND ft.id IN(
    SELECT COALESCE(p.receivable_transaction_id,p.settlement_transaction_id) FROM public.pdv_order_payments p WHERE p.order_id=p_order_id)
    ORDER BY ft.id FOR UPDATE;
  SELECT * INTO o FROM public.pdv_orders WHERE id=p_order_id AND company_id=c.company_id FOR UPDATE;
  plan:=public.pdv_residual_plan_internal_v3(p_order_id);
  IF plan->>'plan_hash' IS DISTINCT FROM p_expected_plan_hash THEN
    RAISE EXCEPTION 'Os valores do pedido mudaram. Atualize os destinos antes de continuar.' USING ERRCODE='40001',DETAIL='code=pdv_residual_plan_changed'; END IF;
  SELECT COALESCE(sum((d->>'amount')::numeric),0) INTO total_dispositions FROM jsonb_array_elements(normalized) d;
  IF total_dispositions<>(plan->>'paid_disposition_amount')::numeric THEN
    RAISE EXCEPTION 'Distribua exatamente o valor já recebido que pertence ao restante.' USING ERRCODE='23514',DETAIL='code=pdv_residual_disposition_total_mismatch'; END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(normalized) LOOP
    SELECT (p->>'amount')::numeric INTO source_available FROM jsonb_array_elements(plan->'original_payments') p
      WHERE p->>'payment_id'=line->>'original_payment_id';
    SELECT sum((d->>'amount')::numeric) INTO v_amount FROM jsonb_array_elements(normalized) d
      WHERE d->>'original_payment_id'=line->>'original_payment_id';
    IF source_available IS NULL OR v_amount>source_available THEN
      RAISE EXCEPTION 'O destino supera o valor comprovado do pagamento original.' USING ERRCODE='23514',DETAIL='code=pdv_residual_payment_mismatch'; END IF;
  END LOOP;
  PERFORM i.id FROM public.inventory i JOIN public.pdv_order_items oi ON oi.inventory_id=i.id
    WHERE oi.order_id=p_order_id ORDER BY i.id FOR UPDATE OF i;
  PERFORM s.id FROM public.stocks s WHERE s.id IN(SELECT r.stock_id FROM public.pdv_stock_reservation_items r
    JOIN public.pdv_order_items oi ON oi.id=r.order_item_id WHERE oi.order_id=p_order_id) ORDER BY s.id FOR UPDATE;
  PERFORM l.id FROM public.inventory_stock_levels l WHERE (l.inventory_id,l.stock_id) IN(
    SELECT r.inventory_id,r.stock_id FROM public.pdv_stock_reservation_items r
    JOIN public.pdv_order_items oi ON oi.id=r.order_item_id WHERE oi.order_id=p_order_id)
    ORDER BY l.inventory_id,l.stock_id FOR UPDATE;
  SELECT COALESCE(sum(di.quantity),0) INTO delivered_quantity FROM public.pdv_delivery_items di
    JOIN public.pdv_deliveries d ON d.id=di.delivery_id WHERE d.order_id=p_order_id;
  FOR reservation IN SELECT r.id,r.reserved_quantity-r.consumed_quantity-r.released_quantity residual
    FROM public.pdv_stock_reservation_items r JOIN public.pdv_order_items oi ON oi.id=r.order_item_id
    WHERE oi.order_id=p_order_id AND r.state IN('guaranteed','conflict')
      AND r.reserved_quantity-r.consumed_quantity-r.released_quantity>0
    ORDER BY r.inventory_id,r.stock_id,r.id FOR UPDATE OF r LOOP
    PERFORM public.pdv_release_stock_reservation_internal_v2(c.company_id,reservation.id,reservation.residual);
    released:=released+reservation.residual;
  END LOOP;
  INSERT INTO public.pdv_order_residual_cancellations(id,company_id,order_id,reason,released_quantity,
    delivered_quantity,operation_request_id,created_by,customer_id,residual_amount,financial_contract_version,occurred_on,financial_plan)
  VALUES(cancel_id,c.company_id,p_order_id,reason,released,delivered_quantity,claim.request_id,c.user_id,o.customer_id,
    (plan->>'residual_amount')::numeric,3,public.company_today(c.company_id),plan||jsonb_build_object('dispositions',normalized));
  FOR reduction IN SELECT value FROM jsonb_array_elements(plan->'receivable_reductions') LOOP
    idx:=idx+1; v_amount:=(reduction->>'amount')::numeric;
    entry:=public.pdv_value_credit_entry_internal_v3(c.company_id,o.customer_id,NULL,cancel_id,'credit',v_amount,
      public.company_today(c.company_id),'Abatimento do restante não entregue',NULL,NULL,'res:'||cancel_id||':c:'||idx);
    application:=public.pdv_value_credit_entry_internal_v3(c.company_id,o.customer_id,NULL,cancel_id,'application',-v_amount,
      public.company_today(c.company_id),'Abatimento do restante não entregue',(reduction->>'receivable_transaction_id')::uuid,NULL,'res:'||cancel_id||':a:'||idx);
    INSERT INTO public.pdv_return_dispositions(company_id,residual_cancellation_id,disposition_kind,amount,
      receivable_transaction_id,credit_entry_id,application_entry_id)
    VALUES(c.company_id,cancel_id,'receivable_reduction',v_amount,(reduction->>'receivable_transaction_id')::uuid,entry,application);
  END LOOP;
  FOR line IN SELECT value FROM jsonb_array_elements(normalized) LOOP
    idx:=idx+1; v_amount:=(line->>'amount')::numeric;
    IF line->>'kind'='customer_credit' THEN
      entry:=public.pdv_value_credit_entry_internal_v3(c.company_id,o.customer_id,NULL,cancel_id,'credit',v_amount,
        public.company_today(c.company_id),'Crédito do restante não entregue',NULL,NULL,'res:'||cancel_id||':c:'||idx);
      INSERT INTO public.pdv_return_dispositions(company_id,residual_cancellation_id,disposition_kind,amount,credit_entry_id)
      VALUES(c.company_id,cancel_id,'customer_credit',v_amount,entry);
      resource:=jsonb_build_object('kind','customer_credit','credit_entry_id',entry,'amount',v_amount);
    ELSIF line->>'kind'='voucher' THEN
      resource:=public.pdv_issue_value_voucher_internal_v3(NULL,cancel_id,v_amount,(line->>'expires_on')::date,'res:'||cancel_id||':v:'||idx)
        ||jsonb_build_object('kind','voucher');
    ELSIF line->>'kind'='refund' THEN
      resource:=public.pdv_request_value_refund_internal_v3(NULL,cancel_id,(line->>'original_payment_id')::uuid,v_amount,reason,
        (line->>'account_id')::uuid,(line->>'cash_session_id')::uuid,'res:'||cancel_id||':r:'||idx)||jsonb_build_object('kind','refund');
    ELSE
      RAISE EXCEPTION 'Escolha um destino financeiro válido.' USING ERRCODE='22023',DETAIL='code=pdv_residual_payload_invalid';
    END IF;
    resources:=resources||jsonb_build_array(resource||jsonb_build_object('original_payment_id',line->>'original_payment_id'));
  END LOOP;
  UPDATE public.pdv_orders SET status=CASE WHEN delivered_quantity=0 THEN 'cancelado' ELSE 'cancelado_parcial' END,
    cancelled_at=now(),cancelled_reason=reason,cancelled_by=c.user_id,updated_at=now() WHERE id=p_order_id;
  result:=jsonb_build_object('ok',true,'cancellation_id',cancel_id,'order_id',p_order_id,'released_quantity',released,
    'delivered_quantity',delivered_quantity,'residual_amount',plan->'residual_amount',
    'receivable_reduction_amount',plan->'receivable_reduction_amount','paid_disposition_amount',plan->'paid_disposition_amount',
    'resources',resources,'idempotent',false);
  PERFORM public.pdv_complete_operation_request(claim.request_id,'pdv_order_residual_cancellation',cancel_id,result);
  RETURN result;
END $fn$;

-- Every residual-origin row remains bound to the same tenant/customer/order.
CREATE FUNCTION public.pdv_guard_residual_source_v3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE source_id uuid; source record; original record; entry public.pdv_party_credit_entries%ROWTYPE;
BEGIN
  source_id:=COALESCE((to_jsonb(NEW)->>'source_residual_cancellation_id')::uuid,(to_jsonb(NEW)->>'residual_cancellation_id')::uuid);
  IF source_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO source FROM public.pdv_value_source_internal_v3(NULL,source_id);
  IF NOT FOUND OR source.company_id<>NEW.company_id THEN
    RAISE EXCEPTION 'A origem financeira não pertence a esta empresa.' USING ERRCODE='23514',DETAIL='code=pdv_residual_source_mismatch'; END IF;
  IF TG_TABLE_NAME='pdv_party_credit_entries' THEN
    IF NEW.party_type<>'customer' OR NEW.customer_id IS DISTINCT FROM source.customer_id THEN
      RAISE EXCEPTION 'O crédito não pertence ao cliente deste cancelamento.' USING ERRCODE='23514'; END IF;
    IF NEW.reversal_of_id IS NOT NULL THEN
      SELECT * INTO entry FROM public.pdv_party_credit_entries WHERE id=NEW.reversal_of_id;
      IF entry.source_residual_cancellation_id IS DISTINCT FROM source_id THEN
        RAISE EXCEPTION 'A compensação financeira possui outra origem.' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='pdv_return_dispositions' THEN
    SELECT * INTO entry FROM public.pdv_party_credit_entries WHERE id=NEW.credit_entry_id;
    IF entry.company_id<>NEW.company_id OR entry.source_residual_cancellation_id IS DISTINCT FROM source_id
      OR entry.entry_kind<>'credit' OR entry.amount<>abs(NEW.amount) THEN
      RAISE EXCEPTION 'O destino financeiro não corresponde ao crédito original.' USING ERRCODE='23514'; END IF;
    IF NEW.application_entry_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pdv_party_credit_entries app
        JOIN public.pdv_order_payments payment ON payment.receivable_transaction_id=app.target_financial_transaction_id
        WHERE app.id=NEW.application_entry_id AND app.company_id=NEW.company_id
          AND app.source_residual_cancellation_id=source_id AND app.amount=-abs(NEW.amount)
          AND app.target_financial_transaction_id=NEW.receivable_transaction_id AND payment.order_id=source.order_id) THEN
      RAISE EXCEPTION 'O abatimento não pertence ao fiado deste pedido.' USING ERRCODE='23514'; END IF;
    IF NEW.reversal_of_id IS NOT NULL THEN
      SELECT * INTO original FROM public.pdv_return_dispositions WHERE id=NEW.reversal_of_id;
      IF original.company_id<>NEW.company_id OR original.residual_cancellation_id IS DISTINCT FROM source_id
        OR NEW.amount<>-original.amount OR NEW.credit_entry_id<>original.credit_entry_id THEN
        RAISE EXCEPTION 'A compensação não corresponde ao destino financeiro.' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER guard_pdv_credit_residual_source BEFORE INSERT ON public.pdv_party_credit_entries
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_residual_source_v3();
CREATE TRIGGER guard_pdv_disposition_residual_source BEFORE INSERT ON public.pdv_return_dispositions
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_residual_source_v3();

CREATE FUNCTION public.pdv_residual_projection_internal_v3(p_order_id uuid,p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE cancellation public.pdv_order_residual_cancellations%ROWTYPE; allocated numeric;
BEGIN
  SELECT * INTO cancellation FROM public.pdv_order_residual_cancellations
    WHERE order_id=p_order_id AND company_id=p_company_id AND financial_contract_version=3;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(sum(amount),0) INTO allocated FROM (
    SELECT amount FROM public.pdv_return_dispositions WHERE residual_cancellation_id=cancellation.id
    UNION ALL SELECT amount FROM public.pdv_return_value_events WHERE residual_cancellation_id=cancellation.id) allocated_values;
  RETURN jsonb_build_object('cancellation_id',cancellation.id,'order_id',p_order_id,'reason',cancellation.reason,
    'source_kind','order_residual_cancellation_v3','source_event_ref','pdv_order_residual_cancellation:'||cancellation.id,
    'occurred_on',cancellation.occurred_on,'residual_amount',cancellation.residual_amount,
    'financial_plan',cancellation.financial_plan,'unallocated_amount',cancellation.residual_amount-allocated,
    'financial_status',CASE WHEN cancellation.residual_amount=allocated THEN 'allocated' ELSE 'pending_disposition' END,
    'dispositions',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at,d.id)
      FROM public.pdv_return_dispositions d WHERE d.residual_cancellation_id=cancellation.id),'[]'),
    'vouchers',COALESCE((SELECT jsonb_agg(jsonb_build_object('voucher_id',v.id,'public_code',v.public_code,
      'balance',public.pdv_voucher_balance_internal_v2(v.id),'expires_on',v.expires_on) ORDER BY v.created_at,v.id)
      FROM public.pdv_vouchers v WHERE v.source_residual_cancellation_id=cancellation.id),'[]'),
    'refunds',COALESCE((SELECT jsonb_agg(jsonb_build_object('refund_id',r.id,'method',r.method,'amount',r.amount,
      'status',CASE WHEN EXISTS(SELECT 1 FROM public.pdv_refund_events e WHERE e.refund_id=r.id AND e.event_kind='reversed') THEN 'reversed'
        WHEN EXISTS(SELECT 1 FROM public.pdv_refund_events e WHERE e.refund_id=r.id AND e.event_kind='settled') THEN 'settled' ELSE 'pending' END)
      ORDER BY r.created_at,r.id) FROM public.pdv_refunds r WHERE r.residual_cancellation_id=cancellation.id),'[]'));
END $fn$;

CREATE FUNCTION public.pdv_get_order_residual_cancellation_v3(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ctx record;
BEGIN
  SELECT * INTO ctx FROM public.pdv_returns_context_v2(NULL);
  PERFORM public.pdv_assert_order_cash_access_v2(p_order_id,ctx.user_id);
  IF public.pdv_has_stock_access_scope_v2(ctx.user_id,ctx.company_id,p_order_id=>p_order_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais deste pedido.' USING ERRCODE='42501'; END IF;
  RETURN public.pdv_residual_projection_internal_v3(p_order_id,ctx.company_id);
END $fn$;

DO $reset_residual$
DECLARE signature regprocedure; src text; changed text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.reset_system_step(uuid,text,uuid)'::regprocedure,'public.admin_delete_company(uuid)'::regprocedure] LOOP
    src:=pg_get_functiondef(signature);
    changed:=replace(src,'AND source_commercial_return_id IS NOT NULL',
      'AND num_nonnulls(source_commercial_return_id,source_residual_cancellation_id)>0');
    changed:=replace(changed,'''commercial.order.cancel_residual.v2''',
      '''commercial.order.cancel_residual.v2'',''commercial.order.cancel_residual.v3''');
    IF changed=src THEN RAISE EXCEPTION 'Âncora de limpeza do cancelamento mudou: %',signature; END IF;
    IF signature='public.reset_system_step(uuid,text,uuid)'::regprocedure THEN
      IF position('IF EXISTS(SELECT 1 FROM public.pdv_commercial_returns WHERE company_id=p_company_id) THEN' in changed)=0 THEN
        RAISE EXCEPTION 'Âncora da proteção financeira mudou'; END IF;
      changed:=replace(changed,'IF EXISTS(SELECT 1 FROM public.pdv_commercial_returns WHERE company_id=p_company_id) THEN',
        'IF EXISTS(SELECT 1 FROM public.pdv_commercial_returns WHERE company_id=p_company_id) OR EXISTS(SELECT 1 FROM public.pdv_order_residual_cancellations WHERE company_id=p_company_id AND financial_contract_version=3) THEN');
    END IF;
    EXECUTE changed;
  END LOOP;
END $reset_residual$;

CREATE OR REPLACE FUNCTION public.pdv_guard_financial_treasury_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_account_ids uuid[];
  v_transaction_id uuid;
  v_account_id uuid;
  v_balance numeric;
  v_custody numeric;
  v_old_effect numeric;
  v_new_effect numeric;
  v_planned_custody_delta numeric := 0;
  v_planned_context jsonb;
  v_planned_request_id uuid;
  v_refund record; v_refund_session uuid; v_expected_hash text;
BEGIN
  v_company_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;
  v_transaction_id := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.id END;

  -- A empresa pai ja ausente identifica exclusivamente o cascade do tenant.
  -- Precisa escapar antes de consultar custodia ou adquirir lock, inclusive
  -- para lancamentos sem vinculo com o PDV.
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM public.companies company WHERE company.id = OLD.company_id
  ) THEN
    RETURN OLD;
  END IF;

  -- O expurgo nominal do Zerar Sistema e transaction-local e segue o mesmo
  -- contrato dos guards PDV existentes.
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND COALESCE(current_setting('app.pdv_purge_company', true), '') = OLD.company_id::text
  THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- ON DELETE SET NULL da conta v1 ocorre como trigger referencial aninhado,
  -- depois que a conta pai deixou de estar visivel. Nao ha saldo a reservar
  -- nessa conta; o lifecycle legado permanece compativel.
  IF TG_OP = 'UPDATE'
     AND OLD.account_id IS NOT NULL
     AND NEW.account_id IS NULL
     AND pg_trigger_depth() > 1
     AND NOT EXISTS (
       SELECT 1 FROM public.financial_accounts account
        WHERE account.id = OLD.account_id
     )
  THEN
    RETURN NEW;
  END IF;

  -- Fora dos cascades controlados, fato financeiro ligado a custodia e
  -- imutavel. A reversao cria outro fato e outra linha de custodia.
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND EXISTS (
       SELECT 1 FROM public.pdv_cash_custody_entries entry
        WHERE entry.financial_transaction_id = v_transaction_id
     )
  THEN
    RAISE EXCEPTION 'Este lançamento pertence à custódia do caixa e não pode ser alterado ou excluído. Registre uma reversão.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CUSTODY_FINANCIAL_IMMUTABLE';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Não é possível transferir um lançamento financeiro entre empresas.'
      USING ERRCODE = '42501', DETAIL = 'PDV_FINANCIAL_COMPANY_IMMUTABLE';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_account_ids := ARRAY[NEW.account_id]::uuid[];
  ELSIF TG_OP = 'UPDATE' THEN
    v_account_ids := ARRAY[OLD.account_id, NEW.account_id]::uuid[];
  ELSE
    v_account_ids := ARRAY[OLD.account_id]::uuid[];
  END IF;

  SELECT COALESCE(array_agg(account_id ORDER BY account_id), ARRAY[]::uuid[])
    INTO v_account_ids
    FROM (
      SELECT DISTINCT account_id
        FROM unnest(v_account_ids) AS requested(account_id)
       WHERE account_id IS NOT NULL
    ) deduplicated;

  -- A porta trava todas as contas tocadas antes de o saldo mudar. Para UPDATE
  -- A->B, a ordem por UUID elimina inversao concorrente B->A.
  IF cardinality(v_account_ids) > 0 THEN
    PERFORM public.pdv_lock_treasury_accounts(v_company_id, v_account_ids);
  END IF;

  -- As RPCs canonicas informam somente o delta de custodia que sera gravado
  -- na MESMA transacao logo depois do fato financeiro. Escritas genericas nao
  -- possuem esse contexto e, portanto, usam delta zero.
  BEGIN
    v_planned_context := NULLIF(
      current_setting('app.pdv_treasury_custody_delta', true), ''
    )::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    v_planned_context := NULL;
  END;
  BEGIN
    v_planned_request_id := NULLIF(v_planned_context->>'request_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_planned_request_id := NULL;
  END;

  FOR v_account_id IN
    SELECT account_id FROM unnest(v_account_ids) AS affected(account_id)
  LOOP
    SELECT round(
      account.initial_balance
      + COALESCE(sum(
          CASE
            WHEN transaction.transaction_type = 'entrada' THEN transaction.amount
            ELSE -transaction.amount
          END
        ) FILTER (
          WHERE transaction.is_paid IS TRUE
            AND transaction.cancelled_at IS NULL
        ), 0),
      2
    )
      INTO v_balance
      FROM public.financial_accounts account
      LEFT JOIN public.financial_transactions transaction
        ON transaction.company_id = account.company_id
       AND transaction.account_id = account.id
     WHERE account.id = v_account_id
       AND account.company_id = v_company_id
     GROUP BY account.initial_balance;

    v_old_effect := 0;
    IF TG_OP IN ('UPDATE', 'DELETE')
       AND OLD.account_id = v_account_id
       AND OLD.is_paid IS TRUE
       AND OLD.cancelled_at IS NULL
    THEN
      v_old_effect := CASE
        WHEN OLD.transaction_type = 'entrada' THEN OLD.amount ELSE -OLD.amount
      END;
    END IF;

    v_new_effect := 0;
    IF TG_OP IN ('INSERT', 'UPDATE')
       AND NEW.account_id = v_account_id
       AND NEW.is_paid IS TRUE
       AND NEW.cancelled_at IS NULL
    THEN
      v_new_effect := CASE
        WHEN NEW.transaction_type = 'entrada' THEN NEW.amount ELSE -NEW.amount
      END;
    END IF;

    SELECT round(COALESCE(sum(entry.amount), 0), 2)
      INTO v_custody
      FROM public.pdv_cash_custody_entries entry
      JOIN public.pdv_cash_sessions session ON session.id = entry.session_id
     WHERE entry.company_id = v_company_id
       AND entry.cash_account_id = v_account_id
       AND session.company_id = v_company_id
       AND session.status = 'aberta'
       AND session.contract_version = 2;

    v_planned_custody_delta := 0;
    IF v_planned_context->>'company_id' = v_company_id::text
       AND v_planned_context->>'account_id' = v_account_id::text
       AND EXISTS (
         SELECT 1 FROM public.pdv_operation_requests request
          WHERE request.id = v_planned_request_id
            AND request.company_id = v_company_id
            AND request.status = 'pending'
            AND request.operation_type IN (
              'cash.event.v2', 'cash.reverse.v2', 'cash.close.v2'
            )
       )
    THEN
      BEGIN
        v_planned_custody_delta := round(
          COALESCE((v_planned_context->>'delta')::numeric, 0), 2
        );
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        v_planned_custody_delta := 0;
      END;
    END IF;

    -- Refund delta is derived from a persisted immutable source + pending
    -- canonical request/hash. A browser-controlled setting is not authorization.
    IF TG_OP='INSERT' AND NEW.pdv_financial_role IN('pdv_refund','pdv_refund_reversal')
      AND NEW.payment_method='dinheiro' THEN
      v_planned_custody_delta:=0;
      SELECT refund.*,requested.metadata requested_metadata INTO v_refund
        FROM public.pdv_refunds refund JOIN public.pdv_refund_events requested
          ON requested.refund_id=refund.id AND requested.event_kind='requested'
        WHERE refund.id=NEW.pdv_settlement_group_id AND refund.company_id=v_company_id;
      IF NOT FOUND OR NEW.amount<>v_refund.amount OR NEW.account_id<>v_account_id
        OR NEW.customer_id IS DISTINCT FROM v_refund.customer_id OR NEW.is_paid IS DISTINCT FROM TRUE
        OR NEW.cancelled_at IS NOT NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'O reembolso não corresponde à origem financeira.' USING ERRCODE='23514',DETAIL='code=pdv_refund_treasury_source_mismatch'; END IF;
      IF NEW.pdv_financial_role='pdv_refund' THEN
        v_refund_session:=(v_refund.requested_metadata->>'cash_session_id')::uuid;
        v_expected_hash:=public.pdv_operation_payload_hash(jsonb_build_object('return_id',v_refund.commercial_return_id,
          'payment_id',v_refund.original_payment_id,'amount',v_refund.amount,'reason',v_refund.reason,
          'account_id',v_account_id,'cash_session_id',v_refund_session)
          ||CASE WHEN v_refund.residual_cancellation_id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('residual_cancellation_id',v_refund.residual_cancellation_id) END);
        IF NEW.transaction_type::text<>'saida' OR (v_refund.requested_metadata->>'account_id')::uuid IS DISTINCT FROM v_account_id
          OR NOT EXISTS(SELECT 1 FROM public.pdv_operation_requests request
            WHERE request.id=v_refund.operation_request_id AND request.company_id=v_company_id
              AND request.created_by=auth.uid() AND request.status='pending'
              AND request.operation_type='after_sale.refund.request.v2' AND request.payload_hash=v_expected_hash)
          OR EXISTS(SELECT 1 FROM public.pdv_refund_events event WHERE event.refund_id=v_refund.id AND event.event_kind IN('settled','reversed')) THEN
          RAISE EXCEPTION 'A solicitação do reembolso não corresponde ao caixa e ao valor.' USING ERRCODE='23514',DETAIL='code=pdv_refund_treasury_request_mismatch'; END IF;
        v_planned_custody_delta:=-v_refund.amount;
      ELSE
        SELECT custody.session_id INTO v_refund_session
          FROM public.pdv_refund_events settled JOIN public.pdv_cash_custody_entries custody ON custody.id=settled.custody_entry_id
          WHERE settled.refund_id=v_refund.id AND settled.event_kind='settled' AND custody.cash_account_id=v_account_id
            AND custody.company_id=v_company_id AND custody.amount=-v_refund.amount;
        v_expected_hash:=public.pdv_operation_payload_hash(jsonb_build_object('refund_id',v_refund.id,'reason',NEW.notes));
        IF NEW.transaction_type::text<>'entrada' OR v_refund_session IS NULL OR NOT EXISTS(
          SELECT 1 FROM public.pdv_operation_requests request WHERE request.id=v_planned_request_id
            AND request.company_id=v_company_id AND request.created_by=auth.uid() AND request.status='pending'
            AND request.operation_type='after_sale.refund.reverse.v2' AND request.payload_hash=v_expected_hash) THEN
          RAISE EXCEPTION 'O estorno do reembolso não corresponde ao caixa original.' USING ERRCODE='23514',DETAIL='code=pdv_refund_treasury_request_mismatch'; END IF;
        v_planned_custody_delta:=v_refund.amount;
      END IF;
      IF NEW.pdv_cash_session_id IS DISTINCT FROM v_refund_session OR NOT EXISTS(SELECT 1 FROM public.pdv_cash_sessions session WHERE session.id=v_refund_session
        AND session.company_id=v_company_id AND session.cash_account_id=v_account_id
        AND session.status='aberta' AND session.contract_version=2)
        OR public.pdv_current_actor_can_access_session_v3(v_refund_session) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'O caixa do reembolso está indisponível para seu perfil.' USING ERRCODE='42501',DETAIL='code=pdv_refund_cash_denied'; END IF;
    END IF;

    -- A consulta ainda enxerga OLD no UPDATE/DELETE e nao enxerga NEW no
    -- INSERT; por isso o proprio delta e removido/adicionado exatamente uma vez.
    v_balance := round(v_balance - v_old_effect + v_new_effect, 2);
    v_custody := round(v_custody + v_planned_custody_delta, 2);

    IF EXISTS (
      SELECT 1 FROM public.pdv_cash_sessions session
       WHERE session.company_id = v_company_id
         AND session.cash_account_id = v_account_id
         AND session.status = 'aberta'
         AND session.contract_version = 2
    ) AND v_balance < v_custody THEN
      RAISE EXCEPTION 'Este lançamento deixaria o cofre sem saldo para o dinheiro reservado nos caixas abertos.'
        USING ERRCODE = '23514', DETAIL = 'PDV_TREASURY_CUSTODY_RESERVED';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION public.pdv_assert_refund_cash_pair_v3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE signed_amount numeric;
BEGIN
  -- SQL NULL is not TRUE in PL/pgSQL IF. Legacy entries have no PDV role
  -- and may have no payment method; they must never enter this assertion.
  IF NEW.pdv_financial_role IS NULL
    OR NEW.pdv_financial_role NOT IN('pdv_refund','pdv_refund_reversal')
    OR NEW.payment_method IS DISTINCT FROM 'dinheiro' THEN RETURN NULL; END IF;
  signed_amount:=CASE WHEN NEW.pdv_financial_role='pdv_refund' THEN -NEW.amount ELSE NEW.amount END;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_refund_events event
    JOIN public.pdv_cash_custody_entries custody ON custody.id=event.custody_entry_id
    JOIN public.pdv_refunds refund ON refund.id=event.refund_id
    JOIN public.pdv_operation_requests request ON request.id=event.operation_request_id
    WHERE event.financial_transaction_id=NEW.id AND event.company_id=NEW.company_id
      AND event.refund_id=NEW.pdv_settlement_group_id AND refund.company_id=NEW.company_id
      AND refund.amount=NEW.amount AND refund.method='dinheiro'
      AND event.event_kind=CASE WHEN NEW.pdv_financial_role='pdv_refund' THEN 'settled' ELSE 'reversed' END
      AND custody.company_id=NEW.company_id AND custody.financial_transaction_id=NEW.id
      AND custody.cash_account_id=NEW.account_id AND custody.amount=signed_amount AND custody.session_id=NEW.pdv_cash_session_id
      AND custody.operation_request_id=request.id AND custody.source_type='pdv_refund' AND custody.source_id=refund.id
      AND request.company_id=NEW.company_id AND request.status='completed') THEN
    RAISE EXCEPTION 'O dinheiro devolvido e a custódia do caixa precisam ser confirmados juntos.'
      USING ERRCODE='23514',DETAIL='code=pdv_refund_cash_pair_required'; END IF;
  RETURN NULL;
END $fn$;
CREATE CONSTRAINT TRIGGER pdv_refund_cash_pair_v3 AFTER INSERT ON public.financial_transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.pdv_assert_refund_cash_pair_v3();

-- Voucher search, payment options and both canonical payment writers resolve
-- stock scope from the actual source order, for either financial origin.
DO $voucher_scope$
DECLARE signature regprocedure; src text; changed text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.pdv_apply_voucher_to_order_core_015_v2(uuid,uuid,numeric,text)'::regprocedure,
    'public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure,
    'public.pdv_cover_existing_order_base_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure,
    'public.pdv_get_customer_payment_options_v3(uuid)'::regprocedure] LOOP
    src:=pg_get_functiondef(signature);
    changed:=replace(src,'p_return_id=>v_voucher.source_commercial_return_id',
      'p_order_id=>public.pdv_value_order_internal_v3(v_voucher.source_commercial_return_id,v_voucher.source_residual_cancellation_id)');
    changed:=replace(changed,'p_return_id=>voucher.source_commercial_return_id',
      'p_order_id=>public.pdv_value_order_internal_v3(voucher.source_commercial_return_id,voucher.source_residual_cancellation_id)');
    changed:=regexp_replace(changed,
      'p_return_id => \(SELECT voucher.source_commercial_return_id FROM public.pdv_vouchers voucher\s+WHERE voucher.id=p_voucher_id AND voucher.company_id=v_context.company_id\)',
      'p_order_id => public.pdv_voucher_order_internal_v3(p_voucher_id)','g');
    IF changed=src THEN RAISE EXCEPTION 'Âncora da origem do voucher mudou: %',signature; END IF;
    EXECUTE changed;
  END LOOP;
END $voucher_scope$;

-- Additive reader contract: old `returns` array keeps only actual returns.
DO $residual_reader$
DECLARE signature regprocedure; src text; anchor text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.pdv_get_after_sale_context_core_015_v2(uuid)'::regprocedure,
    'public.pdv_get_after_sale_workspace_core_015_v2(uuid)'::regprocedure] LOOP
    src:=pg_get_functiondef(signature);
    anchor:='RETURN jsonb_build_object(';
    IF position(anchor in src)=0 THEN RAISE EXCEPTION 'Âncora de leitura do pós-venda mudou'; END IF;
    src:=replace(src,anchor,anchor||chr(10)||
      '''residual_cancellation'',public.pdv_residual_projection_internal_v3(p_order_id,v_context.company_id),');
    EXECUTE src;
  END LOOP;
END $residual_reader$;

CREATE OR REPLACE FUNCTION public.pdv_settle_refund_internal_v2(p_company_id uuid, p_user_id uuid, p_refund_id uuid, p_account_id uuid, p_cash_session_id uuid, p_operation_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_refund public.pdv_refunds%ROWTYPE; v_payment public.pdv_order_payments%ROWTYPE;
  v_session public.pdv_cash_sessions%ROWTYPE; v_position numeric(14,2); v_financial uuid; v_custody uuid;
  v_event uuid; v_snapshot jsonb;
BEGIN
  SELECT * INTO v_refund FROM public.pdv_refunds refund
   WHERE refund.id=p_refund_id AND refund.company_id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reembolso não encontrado.' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_refund_events event WHERE event.refund_id=p_refund_id
    AND event.event_kind IN('settled','reversed')) THEN RAISE EXCEPTION 'Este reembolso já foi processado.'
    USING ERRCODE='23505',DETAIL='code=pdv_refund_already_processed'; END IF;
  SELECT * INTO v_payment FROM public.pdv_order_payments payment WHERE payment.id=v_refund.original_payment_id FOR UPDATE;
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'Informe a conta que liquidará o reembolso.' USING ERRCODE='22023'; END IF;
  PERFORM public.pdv_lock_treasury_account(p_company_id,p_account_id);
  IF v_refund.method='dinheiro' THEN
    SELECT * INTO v_session FROM public.pdv_cash_sessions session
     WHERE session.id=p_cash_session_id AND session.company_id=p_company_id
       AND session.cash_account_id=p_account_id FOR UPDATE;
    IF NOT FOUND OR v_session.status<>'aberta' OR v_session.contract_version IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'Escolha um caixa v2 aberto para devolver o dinheiro.'
        USING ERRCODE='42501',DETAIL='code=pdv_refund_cash_session_invalid'; END IF;
    IF v_session.opened_by IS DISTINCT FROM p_user_id AND NOT public.is_admin_or_gestor(p_user_id)
       AND NOT public.is_super_admin(p_user_id) THEN RAISE EXCEPTION 'Você não pode usar o caixa de outro operador.'
       USING ERRCODE='42501',DETAIL='code=pdv_refund_cash_session_forbidden'; END IF;
    v_snapshot:=public.pdv_cash_snapshot_v2_internal(p_company_id,p_account_id);
    IF COALESCE((v_snapshot->>'reconciliation_required')::boolean,true) THEN
      RAISE EXCEPTION 'A custódia precisa ser conciliada antes do reembolso.'
        USING ERRCODE='55000',DETAIL='code=pdv_refund_reconciliation_required'; END IF;
    SELECT COALESCE(position.custody_amount,0) INTO v_position
      FROM public.pdv_cash_custody_position(p_company_id,p_cash_session_id) position;
    IF round(COALESCE(v_position,0),2)<v_refund.amount THEN RAISE EXCEPTION 'A gaveta não possui dinheiro suficiente.'
      USING ERRCODE='23514',DETAIL='code=pdv_refund_cash_insufficient'; END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.financial_accounts account WHERE account.id=p_account_id
      AND account.company_id=p_company_id AND account.is_active IS TRUE AND account.type='banco') THEN
      RAISE EXCEPTION 'A conta bancária do reembolso não está disponível.' USING ERRCODE='42501'; END IF;
    IF v_refund.method IN('pix','transferencia') AND v_payment.financial_account_id IS NOT NULL
      AND v_payment.financial_account_id<>p_account_id THEN RAISE EXCEPTION 'Use a conta original deste pagamento.'
      USING ERRCODE='23514',DETAIL='code=pdv_refund_original_account_mismatch'; END IF;
  END IF;
  IF v_refund.method='dinheiro' THEN
    PERFORM set_config('app.pdv_treasury_custody_delta',jsonb_build_object(
      'company_id',p_company_id,'account_id',p_account_id,'request_id',p_operation_request_id,
      'delta',-v_refund.amount)::text,true);
  END IF;
  INSERT INTO public.financial_transactions(company_id,transaction_type,description,amount,category,
    transaction_date,paid_date,is_paid,account_id,customer_id,origin,payment_method,created_by,notes,
    pdv_financial_role,pdv_settlement_group_id,pdv_cash_session_id)
  VALUES(p_company_id,'saida'::public.transaction_type,'Reembolso de devolução do PDV',v_refund.amount,
    'Reembolso de venda do PDV',public.company_today(p_company_id),public.company_today(p_company_id),true,
    p_account_id,v_refund.customer_id,'pdv',v_refund.method,p_user_id,
    'Reembolso liquidado; referência interna '||v_refund.id::text,'pdv_refund',v_refund.id,CASE WHEN v_refund.method='dinheiro' THEN p_cash_session_id END)
  RETURNING id INTO v_financial;
  IF v_refund.method='dinheiro' THEN
    PERFORM set_config('app.pdv_treasury_custody_delta','',true);
    INSERT INTO public.pdv_cash_custody_entries(company_id,session_id,cash_account_id,operation_request_id,
      entry_kind,amount,source_type,source_id,financial_transaction_id,metadata,created_by)
    VALUES(p_company_id,p_cash_session_id,p_account_id,p_operation_request_id,'refund',-v_refund.amount,
      'pdv_refund',v_refund.id,v_financial,jsonb_build_object('refund_id',v_refund.id),p_user_id)
    RETURNING id INTO v_custody;
  END IF;
  INSERT INTO public.pdv_refund_events(company_id,refund_id,event_kind,financial_transaction_id,
    custody_entry_id,operation_request_id,metadata,created_by)
  VALUES(p_company_id,p_refund_id,'settled',v_financial,v_custody,p_operation_request_id,
    jsonb_build_object('method',v_refund.method),p_user_id) RETURNING id INTO v_event;
  RETURN jsonb_build_object('refund_event_id',v_event,'financial_transaction_id',v_financial,
    'custody_entry_id',v_custody,'status','settled');
END $function$;

CREATE OR REPLACE FUNCTION public.pdv_customer_credit_statement_v2(p_customer_id uuid)
 RETURNS TABLE(entry_id uuid, source_type text, amount numeric, occurred_at timestamp with time zone, description text, financial_transaction_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_context record;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  IF NOT EXISTS (
    SELECT 1 FROM public.customers customer
     WHERE customer.id = p_customer_id
       AND customer.company_id = v_context.company_id
  ) THEN
    RAISE EXCEPTION 'Cliente não encontrado nesta empresa.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_RECEIVABLE_CUSTOMER_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT * FROM (
    SELECT transaction.id, 'receivable'::text, transaction.amount::numeric,
           (transaction.transaction_date::timestamp
             AT TIME ZONE COALESCE(settings.timezone, 'America/Sao_Paulo')),
           transaction.description, transaction.id
      FROM public.financial_transactions transaction
      LEFT JOIN public.company_settings settings
        ON settings.company_id = transaction.company_id
     WHERE transaction.company_id = v_context.company_id
       AND transaction.customer_id = p_customer_id
       AND transaction.transaction_type::text = 'entrada'
       AND transaction.parent_transaction_id IS NULL
       AND transaction.cancelled_at IS NULL
       AND transaction.category IS DISTINCT FROM 'Recebimento parcial'
       AND NOT EXISTS (
         SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
          WHERE allocation.settlement_transaction_id = transaction.id
       )

    UNION ALL

    SELECT child.id, 'legacy_settlement'::text, (-child.amount)::numeric,
           (COALESCE(child.paid_date, child.transaction_date)::timestamp
             AT TIME ZONE COALESCE(settings.timezone, 'America/Sao_Paulo')),
           child.description, child.id
      FROM public.financial_transactions child
      JOIN public.financial_transactions parent
        ON parent.id = child.parent_transaction_id
       AND parent.company_id = child.company_id
       AND (child.customer_id IS NULL OR parent.customer_id = child.customer_id)
      LEFT JOIN public.company_settings settings
        ON settings.company_id = child.company_id
     WHERE child.company_id = v_context.company_id
       AND parent.customer_id = p_customer_id
       AND child.category = 'Recebimento parcial'
       AND child.transaction_type::text = 'entrada'
       AND child.cancelled_at IS NULL
       AND child.pdv_financial_role IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
          WHERE allocation.settlement_transaction_id = child.id
            AND allocation.receivable_transaction_id = parent.id
       )

    UNION ALL

    SELECT md5('pdv-legacy-direct-settlement:' || parent.id::text)::uuid,
           'legacy_direct_settlement'::text, (-parent.amount)::numeric,
           (COALESCE(parent.paid_date, parent.transaction_date)::timestamp
             AT TIME ZONE COALESCE(settings.timezone, 'America/Sao_Paulo')),
           'Quitação direta: ' || parent.description, parent.id
      FROM public.financial_transactions parent
      LEFT JOIN public.company_settings settings
        ON settings.company_id = parent.company_id
     WHERE parent.company_id = v_context.company_id
       AND parent.customer_id = p_customer_id
       AND parent.transaction_type::text = 'entrada'
       AND parent.parent_transaction_id IS NULL
       AND parent.cancelled_at IS NULL
       AND parent.category IS DISTINCT FROM 'Recebimento parcial'
       AND parent.is_paid IS TRUE
       AND NOT EXISTS (
         SELECT 1 FROM public.financial_transactions child
          WHERE child.parent_transaction_id = parent.id
            AND child.category = 'Recebimento parcial'
            AND child.transaction_type::text = 'entrada'
            AND child.cancelled_at IS NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
          WHERE allocation.receivable_transaction_id = parent.id
       )

    UNION ALL

    SELECT allocation.id, 'settlement'::text, (-allocation.amount)::numeric,
           (COALESCE(settlement.paid_date, settlement.transaction_date)::timestamp
             AT TIME ZONE COALESCE(settings.timezone, 'America/Sao_Paulo')),
           settlement.description,
           allocation.settlement_transaction_id
      FROM public.pdv_receivable_settlement_allocations allocation
      JOIN public.financial_transactions settlement
        ON settlement.id = allocation.settlement_transaction_id
      LEFT JOIN public.company_settings settings
        ON settings.company_id = settlement.company_id
     WHERE allocation.company_id = v_context.company_id
       AND allocation.customer_id = p_customer_id

    UNION ALL

    SELECT ledger.id, 'legacy_ledger'::text, ledger.amount::numeric,
           ledger.created_at, COALESCE(ledger.notes, 'Ajuste legado'),
           ledger.financial_transaction_id
      FROM public.customer_credit_ledger ledger
     WHERE ledger.company_id = v_context.company_id
       AND ledger.customer_id = p_customer_id
       AND (
         ledger.kind = 'ajuste'
         OR ledger.financial_transaction_id IS NULL
       )
    UNION ALL

    SELECT entry.id, 'party_credit_position'::text, (-entry.amount)::numeric,
           (entry.occurred_on::timestamp
             AT TIME ZONE COALESCE(settings.timezone, 'America/Sao_Paulo')),
           entry.description, NULL::uuid
      FROM public.pdv_party_credit_entries entry
      LEFT JOIN public.company_settings settings ON settings.company_id=entry.company_id
     WHERE entry.company_id=v_context.company_id
       AND entry.party_type='customer' AND entry.customer_id=p_customer_id
       -- Credit/adjustment and their reversals change total signed position.
       -- Application and reversal of application have a target and only move
       -- existing credit to/from an obligation; legacy credit is already in
       -- the legacy branch above. Neither operation represents cash received.
       AND entry.target_financial_transaction_id IS NULL
  ) statement
  ORDER BY occurred_at, entry_id;
END
$function$;

DO $acl$
DECLARE proc regprocedure;
BEGIN
  FOR proc IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN('pdv_value_source_internal_v3','pdv_value_order_internal_v3',
      'pdv_refund_order_internal_v3','pdv_voucher_order_internal_v3','pdv_value_credit_entry_internal_v3',
      'pdv_free_value_internal_v3','pdv_issue_value_voucher_internal_v3','pdv_request_value_refund_internal_v3',
      'pdv_residual_plan_internal_v3','pdv_residual_projection_internal_v3','pdv_guard_residual_source_v3','pdv_assert_refund_cash_pair_v3') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',proc);
  END LOOP;
END $acl$;
REVOKE ALL ON FUNCTION public.pdv_cancel_order_residual_v3(uuid,text,jsonb,text,text),
  public.pdv_get_order_residual_plan_v3(uuid),public.pdv_get_order_residual_cancellation_v3(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_cancel_order_residual_v3(uuid,text,jsonb,text,text),
  public.pdv_get_order_residual_plan_v3(uuid),public.pdv_get_order_residual_cancellation_v3(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_customer_credit_statement_v2(uuid) FROM PUBLIC,anon,authenticated;
COMMIT;

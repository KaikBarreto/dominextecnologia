-- Redestina exclusivamente valor livre de cancelamento residual já registrado.
-- A proveniência usa os resultados imutáveis dos requests concluídos; não cria
-- devolução física, não reabre reserva, não reaplica fiado e não altera o plano original.
-- Rollback lógico: revogar EXECUTE do novo writer; manter todos os livros/resultados.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';

CREATE FUNCTION public.pdv_residual_disposition_plan_internal_v4(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE ctx record; source public.pdv_order_residual_cancellations%ROWTYPE;
  payment record; original record; resource jsonb; resources jsonb; payments jsonb:='[]'; states jsonb:='[]';
  v_amount numeric; budget numeric; active numeric; initial_amount numeric; free numeric; total_free numeric:=0;
  total_budget numeric:=0; allocated numeric; outside_refunds numeric; valid boolean; alive boolean;
  privileged boolean; credit boolean; voucher boolean; refund boolean; bank boolean; plan jsonb;
BEGIN
  SELECT * INTO ctx FROM public.pdv_after_sale_context_v2('fn:view_pdv_after_sale');
  PERFORM public.pdv_party_account_context_v2(TRUE);
  PERFORM public.pdv_assert_order_cash_access_v2(p_order_id,ctx.user_id);
  IF public.pdv_has_stock_access_scope_v2(ctx.user_id,ctx.company_id,p_order_id=>p_order_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais deste pedido.' USING ERRCODE='42501',DETAIL='code=pdv_redisposition_access_denied'; END IF;
  SELECT * INTO source FROM public.pdv_order_residual_cancellations
    WHERE order_id=p_order_id AND company_id=ctx.company_id AND financial_contract_version=3;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.id=source.customer_id AND c.company_id=ctx.company_id AND c.is_deleted IS FALSE)
    OR jsonb_typeof(source.financial_plan->'dispositions') IS DISTINCT FROM 'array'
    OR jsonb_typeof(source.financial_plan->'original_payments') IS DISTINCT FROM 'array'
    OR NOT EXISTS(SELECT 1 FROM public.pdv_operation_requests request WHERE request.id=source.operation_request_id
      AND request.company_id=ctx.company_id AND request.operation_type='commercial.order.cancel_residual.v3'
      AND request.status='completed' AND request.resource_type='pdv_order_residual_cancellation' AND request.resource_id=source.id
      AND request.result->>'cancellation_id'=source.id::text AND jsonb_typeof(request.result->'resources')='array') THEN
    RAISE EXCEPTION 'O histórico financeiro precisa de conciliação antes de escolher um novo destino.' USING ERRCODE='55000',DETAIL='code=pdv_redisposition_reconciliation_required'; END IF;
  -- Cada recurso conserva seu pagamento de origem inclusive após estorno.
  SELECT COALESCE(jsonb_agg(item.resource||jsonb_build_object('initial',request.id=source.operation_request_id)
    ORDER BY request.created_at,request.id,item.ordinality),'[]') INTO resources
  FROM public.pdv_operation_requests request
  CROSS JOIN LATERAL jsonb_array_elements(request.result->'resources') WITH ORDINALITY item(resource,ordinality)
  WHERE request.company_id=ctx.company_id AND request.status='completed'
    AND request.resource_type='pdv_order_residual_cancellation' AND request.resource_id=source.id
    AND request.result->>'cancellation_id'=source.id::text AND request.result->>'order_id'=p_order_id::text
    AND (request.id=source.operation_request_id AND request.operation_type='commercial.order.cancel_residual.v3'
      OR request.operation_type='after_sale.residual.reallocate.v4');
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(resources) r WHERE r->>'kind' NOT IN('customer_credit','voucher','refund')
    OR r->>'kind' IS NULL OR r->>'original_payment_id' IS NULL OR r->>'amount' IS NULL)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(resources) r WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(source.financial_plan->'dispositions') d
      WHERE d->>'original_payment_id'=r->>'original_payment_id')) THEN
    RAISE EXCEPTION 'Não foi possível comprovar a origem dos valores.' USING ERRCODE='55000',DETAIL='code=pdv_redisposition_reconciliation_required'; END IF;
  FOR payment IN SELECT (d->>'original_payment_id')::uuid id,sum((d->>'amount')::numeric) budget
    FROM jsonb_array_elements(source.financial_plan->'dispositions') d GROUP BY 1 ORDER BY 1 LOOP
    budget:=payment.budget; active:=0; initial_amount:=0;
    SELECT p.*,ft.account_id original_account_id INTO original FROM public.pdv_order_payments p
      JOIN public.financial_transactions ft ON ft.id=p.settlement_transaction_id
      WHERE p.id=payment.id AND p.company_id=ctx.company_id AND p.order_id=p_order_id
        AND p.contract_version=2 AND p.method IN('dinheiro','pix','transferencia') AND p.coverage_status='authorized'
        AND p.settlement_status='settled' AND p.settled_at IS NOT NULL
        AND ft.company_id=ctx.company_id AND ft.customer_id=source.customer_id AND ft.is_paid IS TRUE AND ft.cancelled_at IS NULL
        AND ft.pdv_financial_role='pdv_receivable_settlement' AND ft.amount=p.amount AND ft.payment_method=p.method
        AND ft.account_id=p.financial_account_id
        AND EXISTS(SELECT 1 FROM jsonb_array_elements(source.financial_plan->'original_payments') fp
          WHERE fp->>'payment_id'=p.id::text AND (fp->>'amount')::numeric=p.amount AND fp->>'account_id'=ft.account_id::text
            AND fp->>'settlement_transaction_id'=ft.id::text AND fp->>'method'=p.method);
    IF NOT FOUND OR budget IS NULL OR budget<=0 OR budget>original.amount THEN
      RAISE EXCEPTION 'O pagamento original precisa de conciliação.' USING ERRCODE='55000',DETAIL='code=pdv_redisposition_reconciliation_required'; END IF;
    FOR resource IN SELECT r FROM jsonb_array_elements(resources) r WHERE r->>'original_payment_id'=payment.id::text LOOP
      v_amount:=(resource->>'amount')::numeric; valid:=false; alive:=false;
      IF v_amount<=0 OR v_amount<>round(v_amount,2) OR lower(v_amount::text) IN('nan','infinity','-infinity') THEN
        RAISE EXCEPTION 'Valor histórico inválido.' USING ERRCODE='55000',DETAIL='code=pdv_redisposition_reconciliation_required'; END IF;
      IF resource->>'kind'='customer_credit' THEN
        SELECT true,NOT EXISTS(SELECT 1 FROM public.pdv_party_credit_entries reversal WHERE reversal.reversal_of_id=e.id)
          INTO valid,alive FROM public.pdv_party_credit_entries e WHERE e.id=(resource->>'credit_entry_id')::uuid
          AND e.company_id=ctx.company_id AND e.source_residual_cancellation_id=source.id AND e.customer_id=source.customer_id
          AND e.entry_kind='credit' AND e.amount=v_amount;
      ELSIF resource->>'kind'='voucher' THEN
        SELECT true,NOT EXISTS(SELECT 1 FROM public.pdv_voucher_entries reversal WHERE reversal.reversal_of_id=issue.id)
          INTO valid,alive FROM public.pdv_vouchers v JOIN public.pdv_voucher_entries issue ON issue.voucher_id=v.id AND issue.entry_kind='issue'
          WHERE v.id=(resource->>'voucher_id')::uuid AND v.company_id=ctx.company_id AND v.source_residual_cancellation_id=source.id
            AND v.customer_id=source.customer_id AND issue.amount=v_amount;
      ELSIF resource->>'kind'='refund' THEN
        SELECT true,NOT EXISTS(SELECT 1 FROM public.pdv_refund_events reversal WHERE reversal.refund_id=r.id AND reversal.event_kind='reversed')
          INTO valid,alive FROM public.pdv_refunds r WHERE r.id=(resource->>'refund_id')::uuid AND r.company_id=ctx.company_id
          AND r.residual_cancellation_id=source.id AND r.customer_id=source.customer_id AND r.original_payment_id=payment.id AND r.amount=v_amount;
      END IF;
      IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'Recurso financeiro não corresponde à origem.' USING ERRCODE='55000',DETAIL='code=pdv_redisposition_reconciliation_required'; END IF;
      IF (resource->>'initial')::boolean THEN initial_amount:=initial_amount+v_amount; END IF;
      IF alive THEN active:=active+v_amount; END IF;
      states:=states||jsonb_build_array(resource||jsonb_build_object('active',alive));
    END LOOP;
    SELECT COALESCE(sum(r.amount),0) INTO outside_refunds FROM public.pdv_refunds r
      WHERE r.original_payment_id=payment.id AND r.residual_cancellation_id IS DISTINCT FROM source.id
        AND NOT EXISTS(SELECT 1 FROM public.pdv_refund_events e WHERE e.refund_id=r.id AND e.event_kind='reversed');
    free:=budget-active;
    IF initial_amount<>budget OR free<0 OR budget+outside_refunds>original.amount THEN
      RAISE EXCEPTION 'Os destinos históricos precisam de conciliação.' USING ERRCODE='55000',DETAIL='code=pdv_redisposition_reconciliation_required'; END IF;
    total_budget:=total_budget+budget; total_free:=total_free+free;
    payments:=payments||jsonb_build_array(jsonb_build_object('payment_id',payment.id,'method',original.method,
      'account_id',original.original_account_id,'budget_amount',budget,'available_amount',free));
  END LOOP;
  SELECT COALESCE(sum(allocation.amount),0) INTO allocated FROM (
    SELECT d.amount FROM public.pdv_return_dispositions d WHERE d.residual_cancellation_id=source.id
    UNION ALL SELECT e.amount FROM public.pdv_return_value_events e WHERE e.residual_cancellation_id=source.id) allocation;
  IF total_budget IS DISTINCT FROM (source.financial_plan->>'paid_disposition_amount')::numeric
    OR total_free<>source.residual_amount-allocated THEN
    RAISE EXCEPTION 'A pendência financeira precisa de conciliação.' USING ERRCODE='55000',DETAIL='code=pdv_redisposition_reconciliation_required'; END IF;
  privileged:=public.is_admin_or_gestor(ctx.user_id) OR public.is_super_admin(ctx.user_id);
  credit:=true; voucher:=privileged OR public.pdv_has_explicit_action_permission_v2(ctx.user_id,'fn:issue_pdv_voucher');
  refund:=privileged OR public.pdv_has_explicit_action_permission_v2(ctx.user_id,'fn:refund_pdv_return');
  bank:=privileged OR public.pdv_has_explicit_action_permission_v2(ctx.user_id,'fn:use_bank_accounts');
  plan:=jsonb_build_object('order_id',p_order_id,'cancellation_id',source.id,'customer_id',source.customer_id,
    'free_amount',total_free,'payments',payments,'resource_states',states);
  RETURN (plan-'resource_states')||jsonb_build_object('plan_hash',public.pdv_operation_payload_hash(plan),
    'capabilities',jsonb_build_object('customer_credit',credit,'voucher',voucher,'refund',refund),
    'cash_options',CASE WHEN refund THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('session_id',s.id,'terminal_id',s.terminal_id,'account_id',s.cash_account_id,'label',t.name) ORDER BY s.id)
      FROM public.pdv_orders o JOIN public.pdv_cash_sessions s ON s.id=o.cash_session_id
      JOIN public.pdv_terminals t ON t.id=s.terminal_id
      WHERE o.id=p_order_id AND o.company_id=ctx.company_id AND s.company_id=ctx.company_id AND s.status='aberta' AND s.contract_version=2
        AND s.terminal_id=o.terminal_id AND t.is_active IS TRUE AND public.can_access_stock(ctx.user_id,t.stock_id)
        AND public.pdv_current_actor_can_access_session_v3(s.id) IS TRUE),'[]') ELSE '[]'::jsonb END,
    'bank_options',CASE WHEN refund AND bank THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('account_id',a.id,'label',a.name) ORDER BY a.id)
      FROM public.financial_accounts a WHERE a.company_id=ctx.company_id AND a.is_active IS TRUE AND a.type='banco'
        AND EXISTS(SELECT 1 FROM jsonb_array_elements(payments) p WHERE p->>'account_id'=a.id::text AND p->>'method' IN('pix','transferencia'))),'[]') ELSE '[]'::jsonb END);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_residual_disposition_plan_internal_v4(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.pdv_get_residual_disposition_plan_v4(p_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT public.pdv_residual_disposition_plan_internal_v4(p_order_id)
$fn$;
REVOKE ALL ON FUNCTION public.pdv_get_residual_disposition_plan_v4(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_get_residual_disposition_plan_v4(uuid) TO authenticated;

CREATE FUNCTION public.pdv_reallocate_residual_value_v4(p_order_id uuid,p_dispositions jsonb,p_expected_plan_hash text,p_idempotency_key text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ctx record; claim record; source public.pdv_order_residual_cancellations%ROWTYPE;
  normalized jsonb; line jsonb; payment jsonb; plan jsonb; reason text; account uuid; total numeric; v_amount numeric;
  entry uuid; resource jsonb; resources jsonb:='[]'; idx integer:=0; result jsonb;
BEGIN
  SELECT * INTO ctx FROM public.pdv_after_sale_context_v2('fn:view_pdv_after_sale');
  PERFORM public.pdv_party_account_context_v2(TRUE);
  PERFORM public.pdv_assert_order_cash_access_v2(p_order_id,ctx.user_id);
  IF public.pdv_has_stock_access_scope_v2(ctx.user_id,ctx.company_id,p_order_id=>p_order_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais deste pedido.' USING ERRCODE='42501',DETAIL='code=pdv_redisposition_access_denied'; END IF;
  reason:=NULLIF(btrim(COALESCE(p_reason,'')),'');
  IF reason IS NULL OR length(reason)>500 OR p_expected_plan_hash IS NULL
    OR jsonb_typeof(p_dispositions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_dispositions) NOT BETWEEN 1 AND 10
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_dispositions) d WHERE jsonb_typeof(d)<>'object'
      OR (d-ARRAY['kind','original_payment_id','amount','account_id','cash_session_id','expires_on'])<>'{}'
      OR NOT(d?'kind' AND d?'original_payment_id' AND d?'amount') OR d->>'kind' IS NULL
      OR d->>'kind' NOT IN('customer_credit','voucher','refund')) THEN
    RAISE EXCEPTION 'Confira os valores e os destinos financeiros.' USING ERRCODE='22023',DETAIL='code=pdv_redisposition_payload_invalid'; END IF;
  BEGIN
    SELECT jsonb_agg(jsonb_build_object('kind',d->>'kind','original_payment_id',(d->>'original_payment_id')::uuid,
      'amount',(d->>'amount')::numeric,'account_id',NULLIF(d->>'account_id','')::uuid,
      'cash_session_id',NULLIF(d->>'cash_session_id','')::uuid,'expires_on',NULLIF(d->>'expires_on','')::date)
      ORDER BY d->>'kind',(d->>'original_payment_id')::uuid) INTO normalized FROM jsonb_array_elements(p_dispositions) d;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Confira os valores e os destinos financeiros.' USING ERRCODE='22023',DETAIL='code=pdv_redisposition_payload_invalid'; END;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(normalized) d WHERE d->>'original_payment_id' IS NULL OR d->>'amount' IS NULL
    OR (d->>'amount')::numeric<=0 OR (d->>'amount')::numeric<>round((d->>'amount')::numeric,2)
    OR lower(d->>'amount') IN('nan','infinity','-infinity') OR (d->>'amount')::numeric>999999999.99
    OR (d->>'kind'<>'refund' AND (d->>'account_id' IS NOT NULL OR d->>'cash_session_id' IS NOT NULL))
    OR (d->>'kind'<>'voucher' AND d->>'expires_on' IS NOT NULL))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(normalized) d GROUP BY d->>'kind',d->>'original_payment_id' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Informe destinos distintos e valores positivos em centavos.' USING ERRCODE='22023',DETAIL='code=pdv_redisposition_payload_invalid'; END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(normalized) LOOP
    IF line->>'kind'='voucher' THEN PERFORM public.pdv_after_sale_context_v2('fn:issue_pdv_voucher'); END IF;
    IF line->>'kind'='refund' THEN
      PERFORM public.pdv_after_sale_context_v2('fn:refund_pdv_return');
      IF line->>'cash_session_id' IS NULL AND NOT public.is_admin_or_gestor(ctx.user_id) AND NOT public.is_super_admin(ctx.user_id)
        AND public.pdv_has_explicit_action_permission_v2(ctx.user_id,'fn:use_bank_accounts') IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Seu perfil não permite usar a conta bancária de reembolso.' USING ERRCODE='42501'; END IF;
    END IF;
  END LOOP;
  SELECT * INTO source FROM public.pdv_order_residual_cancellations WHERE order_id=p_order_id AND company_id=ctx.company_id AND financial_contract_version=3;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cancelamento não encontrado.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO claim FROM public.pdv_claim_operation_request(ctx.company_id,'after_sale.residual.reallocate.v4',p_idempotency_key,
    jsonb_build_object('order_id',p_order_id,'cancellation_id',source.id,'dispositions',normalized,'expected_plan_hash',p_expected_plan_hash,'reason',reason));
  IF claim.is_replay THEN
    IF claim.request_status='completed' THEN RETURN claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'A destinação ainda está sendo processada.' USING ERRCODE='55000',DETAIL='code=pdv_redisposition_in_progress'; END IF;
  -- Ordem comum com refund e saldo: tesouraria -> cliente -> FT -> pedido -> origem.
  FOR account IN SELECT DISTINCT (d->>'account_id')::uuid FROM jsonb_array_elements(normalized) d WHERE d->>'account_id' IS NOT NULL ORDER BY 1 LOOP
    PERFORM public.pdv_lock_treasury_account(ctx.company_id,account);
  END LOOP;
  PERFORM c.id FROM public.customers c WHERE c.id=source.customer_id AND c.company_id=ctx.company_id FOR UPDATE;
  PERFORM ft.id FROM public.financial_transactions ft WHERE ft.company_id=ctx.company_id AND ft.id IN(
    SELECT COALESCE(p.receivable_transaction_id,p.settlement_transaction_id) FROM public.pdv_order_payments p WHERE p.order_id=p_order_id) ORDER BY ft.id FOR UPDATE;
  PERFORM o.id FROM public.pdv_orders o WHERE o.id=p_order_id AND o.company_id=ctx.company_id FOR UPDATE;
  PERFORM c.id FROM public.pdv_order_residual_cancellations c WHERE c.id=source.id AND c.company_id=ctx.company_id FOR UPDATE;
  PERFORM p.id FROM public.pdv_order_payments p WHERE p.order_id=p_order_id AND p.company_id=ctx.company_id ORDER BY p.id FOR UPDATE;
  plan:=public.pdv_residual_disposition_plan_internal_v4(p_order_id);
  IF plan->>'plan_hash' IS DISTINCT FROM p_expected_plan_hash THEN RAISE EXCEPTION 'Os valores mudaram. Confira o novo destino novamente.' USING ERRCODE='40001',DETAIL='code=pdv_redisposition_plan_changed'; END IF;
  SELECT sum((d->>'amount')::numeric) INTO total FROM jsonb_array_elements(normalized) d;
  IF (plan->>'free_amount')::numeric<=0 OR total<>(plan->>'free_amount')::numeric THEN
    RAISE EXCEPTION 'Distribua exatamente o valor que aguarda destino.' USING ERRCODE='23514',DETAIL='code=pdv_redisposition_total_mismatch'; END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(normalized) LOOP
    SELECT p INTO payment FROM jsonb_array_elements(plan->'payments') p WHERE p->>'payment_id'=line->>'original_payment_id';
    SELECT sum((d->>'amount')::numeric) INTO v_amount FROM jsonb_array_elements(normalized) d WHERE d->>'original_payment_id'=line->>'original_payment_id';
    IF payment IS NULL OR v_amount>(payment->>'available_amount')::numeric THEN
      RAISE EXCEPTION 'O destino supera o saldo liberado deste pagamento.' USING ERRCODE='23514',DETAIL='code=pdv_redisposition_payment_exceeded'; END IF;
    IF line->>'kind'='refund' THEN
      IF line->>'account_id' IS DISTINCT FROM payment->>'account_id' THEN RAISE EXCEPTION 'Confirme a conta original do pagamento.' USING ERRCODE='42501',DETAIL='code=pdv_redisposition_account_denied'; END IF;
      IF payment->>'method'='dinheiro' THEN
        IF line->>'cash_session_id' IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'cash_options') c
          WHERE c->>'session_id'=line->>'cash_session_id' AND c->>'account_id'=line->>'account_id') THEN
          RAISE EXCEPTION 'O caixa original precisa estar aberto e autorizado para devolver em dinheiro.' USING ERRCODE='42501',DETAIL='code=pdv_redisposition_cash_unavailable'; END IF;
        PERFORM public.pdv_assert_cash_session_actor_v3((line->>'cash_session_id')::uuid,(line->>'account_id')::uuid,true);
      ELSIF line->>'cash_session_id' IS NOT NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'bank_options') b WHERE b->>'account_id'=line->>'account_id') THEN
        RAISE EXCEPTION 'A conta original não está disponível para este reembolso.' USING ERRCODE='42501',DETAIL='code=pdv_redisposition_account_denied';
      END IF;
    END IF;
  END LOOP;
  FOR line IN SELECT value FROM jsonb_array_elements(normalized) LOOP
    idx:=idx+1; v_amount:=(line->>'amount')::numeric;
    IF line->>'kind'='customer_credit' THEN
      entry:=public.pdv_value_credit_entry_internal_v3(ctx.company_id,source.customer_id,NULL,source.id,'credit',v_amount,public.company_today(ctx.company_id),
        'Nova destinação do restante não retirado',NULL,NULL,'red:'||claim.request_id||':c:'||idx);
      INSERT INTO public.pdv_return_dispositions(company_id,residual_cancellation_id,disposition_kind,amount,credit_entry_id)
        VALUES(ctx.company_id,source.id,'customer_credit',v_amount,entry);
      resource:=jsonb_build_object('credit_entry_id',entry,'amount',v_amount);
    ELSIF line->>'kind'='voucher' THEN
      resource:=public.pdv_issue_value_voucher_internal_v3(NULL,source.id,v_amount,(line->>'expires_on')::date,'red:'||claim.request_id||':v:'||idx);
    ELSE
      resource:=public.pdv_request_value_refund_internal_v3(NULL,source.id,(line->>'original_payment_id')::uuid,v_amount,reason,
        (line->>'account_id')::uuid,(line->>'cash_session_id')::uuid,'red:'||claim.request_id||':r:'||idx);
    END IF;
    resources:=resources||jsonb_build_array(resource||jsonb_build_object('kind',line->>'kind','original_payment_id',line->>'original_payment_id'));
  END LOOP;
  result:=jsonb_build_object('ok',true,'order_id',p_order_id,'cancellation_id',source.id,'allocated_amount',total,'resources',resources,'idempotent',false);
  PERFORM public.pdv_complete_operation_request(claim.request_id,'pdv_order_residual_cancellation',source.id,result);
  -- Reconciliar após todos os recursos e o resultado com proveniência existirem.
  plan:=public.pdv_residual_disposition_plan_internal_v4(p_order_id);
  IF (plan->>'free_amount')::numeric<>0 THEN RAISE EXCEPTION 'A destinação não fechou os valores.' USING ERRCODE='23514',DETAIL='code=pdv_redisposition_reconciliation_required'; END IF;
  RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_reallocate_residual_value_v4(uuid,jsonb,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_reallocate_residual_value_v4(uuid,jsonb,text,text,text) TO authenticated;
COMMIT;

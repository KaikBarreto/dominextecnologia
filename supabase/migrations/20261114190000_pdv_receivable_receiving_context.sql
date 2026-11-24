-- Registra o caixa que efetivamente recebeu uma baixa bancária do PDV,
-- inclusive parcial, sem transformar Pix/transferência em dinheiro da gaveta.
-- Não infere custódia de registros históricos nem faz backfill.
BEGIN;

-- Helper interno: vínculo explícito + tenant + operador antes de qualquer
-- replay/estorno. Financeiro geral sem vínculo PDV continua aceitando banco
-- sem caixa; recebimentos PDV antigos sem prova permanecem bloqueados.
CREATE OR REPLACE FUNCTION public.pdv_assert_receivable_receiving_context_v5(
 p_settlement_id uuid,p_account_id uuid,p_session_id uuid
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_original public.financial_transactions%ROWTYPE;
 v_method text; v_requires_context boolean; v_proven boolean; v_count bigint;
BEGIN
 SELECT * INTO v_context FROM public.pdv_cash_v2_context();
 SELECT transaction.* INTO v_original FROM public.financial_transactions transaction
  WHERE transaction.id=p_settlement_id AND transaction.company_id=v_context.company_id
    AND transaction.account_id=p_account_id
    AND transaction.pdv_financial_role='pdv_receivable_settlement';
 IF NOT FOUND THEN
  RAISE EXCEPTION 'O recebimento não foi encontrado nesta conta.'
   USING ERRCODE='P0002',DETAIL='code=pdv_party_account_settlement_not_found';
 END IF;
 SELECT count(*),(array_agg(allocation.settlement_method ORDER BY allocation.id))[1],
   bool_or(principal.origin='pdv'),
   bool_and(COALESCE(allocation.metadata->>'receiving_cash_session_id'=v_original.pdv_cash_session_id::text,false))
 INTO v_count,v_method,v_requires_context,v_proven
 FROM public.pdv_receivable_settlement_allocations allocation
 JOIN public.financial_transactions principal ON principal.id=allocation.receivable_transaction_id
  AND principal.company_id=allocation.company_id AND principal.customer_id=allocation.customer_id
 WHERE allocation.company_id=v_context.company_id
   AND allocation.settlement_transaction_id=p_settlement_id
   AND allocation.allocation_kind='settlement';
 IF v_count=0 THEN
  RAISE EXCEPTION 'O recebimento não possui parcelas válidas.'
   USING ERRCODE='P0002',DETAIL='code=pdv_party_account_settlement_not_found';
 END IF;
 IF v_method='dinheiro' THEN
  PERFORM public.pdv_assert_cash_session_actor_v3(v_original.pdv_cash_session_id,NULL,false);
 ELSIF v_original.pdv_cash_session_id IS NULL THEN
  IF v_requires_context OR p_session_id IS NOT NULL THEN
   RAISE EXCEPTION 'Este recebimento anterior não identifica o caixa que recebeu. Peça a revisão de um responsável.'
    USING ERRCODE='42501',DETAIL='code=pdv_receivable_receiving_context_missing';
  END IF;
 ELSE
  IF v_proven IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Este recebimento anterior não identifica o caixa que recebeu. Peça a revisão de um responsável.'
    USING ERRCODE='42501',DETAIL='code=pdv_receivable_receiving_context_missing';
  END IF;
  IF p_session_id IS DISTINCT FROM v_original.pdv_cash_session_id THEN
   RAISE EXCEPTION 'Use o caixa identificado neste recebimento.'
    USING ERRCODE='42501',DETAIL='code=pdv_receivable_receiving_context_mismatch';
  END IF;
  PERFORM public.pdv_assert_cash_session_actor_v3(v_original.pdv_cash_session_id,NULL,false);
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_assert_receivable_receiving_context_v5(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;

-- Financeiro recebe o contexto explícito antes de inserir alocações/sincronizar coberturas.
DO $patch$
DECLARE v_source text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_create_receivable_financial_v2(uuid,uuid,uuid,uuid,uuid,text,numeric,date,text,uuid,boolean)'::regprocedure) INTO v_source;
 IF position($old$    pdv_financial_role, pdv_settlement_group_id
$old$ IN v_source)=0 THEN RAISE EXCEPTION 'Contrato de pdv_create_receivable_financial_v2 mudou; revisão necessária'; END IF;
 v_source:=replace(v_source,$old$    pdv_financial_role, pdv_settlement_group_id
$old$,$new$    pdv_financial_role, pdv_settlement_group_id, pdv_cash_session_id
$new$);
 IF position($old$    p_outer_request_id
  ) RETURNING id INTO v_financial_id;$old$ IN v_source)=0 THEN RAISE EXCEPTION 'Contrato de pdv_create_receivable_financial_v2 mudou; revisão necessária'; END IF;
 v_source:=replace(v_source,$old$    p_outer_request_id
  ) RETURNING id INTO v_financial_id;$old$,$new$    p_outer_request_id, p_session_id
  ) RETURNING id INTO v_financial_id;$new$);
 EXECUTE v_source;
END $patch$;

-- Baixa valida caixa recebedor; banco geral sem obrigação PDV segue aceitando NULL. A alocação física não muda.
DO $patch$
DECLARE v_source text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_settle_receivables_v2(jsonb,text,uuid,uuid,date,text,text)'::regprocedure) INTO v_source;
 IF position($old$  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request($old$ IN v_source)=0 THEN RAISE EXCEPTION 'Contrato de pdv_settle_receivables_v2 mudou; revisão necessária'; END IF;
 v_source:=replace(v_source,$old$  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request($old$,$new$  IF p_method<>'dinheiro' AND p_session_id IS NULL AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_normalized_allocations) item
    JOIN public.financial_transactions principal ON principal.id=(item->>'receivable_id')::uuid
      AND principal.company_id=v_context.company_id
    WHERE principal.origin='pdv'
  ) THEN
    RAISE EXCEPTION 'Escolha o caixa que está recebendo este pagamento.'
      USING ERRCODE='22023',DETAIL='code=pdv_receivable_receiving_context_required';
  END IF;
  IF p_session_id IS NOT NULL THEN
    PERFORM public.pdv_assert_cash_session_actor_v3(p_session_id,NULL,false);
  END IF;
  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request($new$);
 IF position($old$  ELSIF p_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Pix e transferência não movimentam a gaveta do caixa.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_BANK_SESSION_NOT_ALLOWED';
  END IF;$old$ IN v_source)=0 THEN RAISE EXCEPTION 'Contrato de pdv_settle_receivables_v2 mudou; revisão necessária'; END IF;
 v_source:=replace(v_source,$old$  ELSIF p_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Pix e transferência não movimentam a gaveta do caixa.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_BANK_SESSION_NOT_ALLOWED';
  END IF;$old$,$new$  ELSIF p_session_id IS NOT NULL THEN
    -- PDV_RECEIVABLE_RECEIVING_CONTEXT_V5: atendimento não é custódia física.
    PERFORM public.pdv_assert_cash_session_actor_v3(p_session_id,NULL,true);
  ELSIF EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_normalized_allocations) item
    JOIN public.financial_transactions principal ON principal.id=(item->>'receivable_id')::uuid
      AND principal.company_id=v_context.company_id
    WHERE principal.origin='pdv'
  ) THEN
    RAISE EXCEPTION 'Escolha o caixa que está recebendo este pagamento.'
      USING ERRCODE='22023',DETAIL='code=pdv_receivable_receiving_context_required';
  END IF;$new$);
 IF position($old$      jsonb_build_object('notes', v_normalized_notes),$old$ IN v_source)=0 THEN RAISE EXCEPTION 'Contrato de pdv_settle_receivables_v2 mudou; revisão necessária'; END IF;
 v_source:=replace(v_source,$old$      jsonb_build_object('notes', v_normalized_notes),$old$,$new$      jsonb_build_object('notes', v_normalized_notes,'receiving_cash_session_id',p_session_id),$new$);
 IF position($old$    'cash_session_id', CASE WHEN p_method = 'dinheiro' THEN p_session_id ELSE NULL END,$old$ IN v_source)=0 THEN RAISE EXCEPTION 'Contrato de pdv_settle_receivables_v2 mudou; revisão necessária'; END IF;
 v_source:=replace(v_source,$old$    'cash_session_id', CASE WHEN p_method = 'dinheiro' THEN p_session_id ELSE NULL END,$old$,$new$    'cash_session_id', p_session_id,$new$);
 IF position($old$  v_result := jsonb_build_object($old$ IN v_source)=0 THEN RAISE EXCEPTION 'Contrato de pdv_settle_receivables_v2 mudou; revisão necessária'; END IF;
 v_source:=replace(v_source,$old$  v_result := jsonb_build_object($old$,$new$  IF EXISTS(SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
    JOIN public.pdv_order_payments payment ON payment.receivable_transaction_id=allocation.receivable_transaction_id
      AND payment.company_id=allocation.company_id AND payment.contract_version=2
    WHERE allocation.company_id=v_context.company_id AND allocation.settlement_transaction_id=v_financial_id) THEN
    PERFORM public.pdv_apply_settlement_fifo_v2(v_context.company_id,v_financial_id);
  END IF;
  v_result := jsonb_build_object($new$);
 EXECUTE v_source;
END $patch$;

-- Estorno usa vínculo comprovado antes de replay e mantém dinheiro físico exclusivo do método dinheiro.
DO $patch$
DECLARE v_source text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_reverse_receivable_settlement_v2(uuid,uuid,uuid,text,text)'::regprocedure) INTO v_source;
 IF position($old$  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request($old$ IN v_source)=0 THEN RAISE EXCEPTION 'Contrato de pdv_reverse_receivable_settlement_v2 mudou; revisão necessária'; END IF;
 v_source:=replace(v_source,$old$  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request($old$,$new$  PERFORM public.pdv_assert_receivable_receiving_context_v5(p_settlement_transaction_id,p_account_id,p_session_id);
  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request($new$);
 IF position($old$  IF v_method <> 'dinheiro' AND p_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Estorno bancário não movimenta a gaveta.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_BANK_SESSION_NOT_ALLOWED';
  END IF;$old$ IN v_source)=0 THEN RAISE EXCEPTION 'Contrato de pdv_reverse_receivable_settlement_v2 mudou; revisão necessária'; END IF;
 v_source:=replace(v_source,$old$  IF v_method <> 'dinheiro' AND p_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Estorno bancário não movimenta a gaveta.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_BANK_SESSION_NOT_ALLOWED';
  END IF;$old$,$new$  -- Contexto bancário validado pelo helper; não gera movimento de gaveta.$new$);
 IF position($old$      v_allocation.id, jsonb_build_object('reason', btrim(p_reason)),$old$ IN v_source)=0 THEN RAISE EXCEPTION 'Contrato de pdv_reverse_receivable_settlement_v2 mudou; revisão necessária'; END IF;
 v_source:=replace(v_source,$old$      v_allocation.id, jsonb_build_object('reason', btrim(p_reason)),$old$,$new$      v_allocation.id, jsonb_build_object('reason', btrim(p_reason),'receiving_cash_session_id',p_session_id),$new$);
 IF position($old$  v_result := jsonb_build_object($old$ IN v_source)=0 THEN RAISE EXCEPTION 'Contrato de pdv_reverse_receivable_settlement_v2 mudou; revisão necessária'; END IF;
 v_source:=replace(v_source,$old$  v_result := jsonb_build_object($old$,$new$  FOR v_allocation IN
    SELECT application.id FROM public.pdv_settlement_applications application
     WHERE application.company_id=v_context.company_id
       AND application.settlement_transaction_id=p_settlement_transaction_id
       AND application.application_kind='settlement'
     ORDER BY application.application_sequence,application.id
  LOOP
    PERFORM public.pdv_reverse_settlement_application_v2(v_context.company_id,v_allocation.id,v_reversal_id);
  END LOOP;
  v_result := jsonb_build_object($new$);
 EXECUTE v_source;
END $patch$;

-- Quitação integral não substitui o atendimento efetivo pela origem do pedido.
DO $patch$
DECLARE v_source text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_attach_order_session_to_financial_v2()'::regprocedure) INTO v_source;
 IF position($old$    v_transaction_id:=NEW.settlement_transaction_id;$old$ IN v_source)=0 THEN RAISE EXCEPTION 'Contrato de pdv_attach_order_session_to_financial_v2 mudou; revisão necessária'; END IF;
 v_source:=replace(v_source,$old$    v_transaction_id:=NEW.settlement_transaction_id;$old$,$new$    v_transaction_id:=NEW.settlement_transaction_id;
    -- Uma baixa pode ter sido atendida em outro caixa autorizado. O vínculo
    -- explícito, persistido antes das alocações, prevalece sobre o pedido.
    IF EXISTS(
      SELECT 1 FROM public.financial_transactions settlement
      JOIN public.pdv_cash_sessions receiving ON receiving.id=settlement.pdv_cash_session_id
        AND receiving.company_id=settlement.company_id AND receiving.contract_version=2
      WHERE settlement.id=v_transaction_id AND settlement.company_id=NEW.company_id
        AND settlement.pdv_financial_role='pdv_receivable_settlement'
        AND EXISTS(SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
          WHERE allocation.company_id=settlement.company_id
            AND allocation.settlement_transaction_id=settlement.id
            AND allocation.metadata->>'receiving_cash_session_id'=receiving.id::text)
    ) THEN RETURN NEW; END IF;
$new$);
 EXECUTE v_source;
END $patch$;

-- Wrapper conserva a validação de cliente/tenant, e o core valida a custódia
-- explícita antes do replay. Não usa NULL como um suposto caixa histórico.
CREATE OR REPLACE FUNCTION public.pdv_party_reverse_receivable_settlement_v2(
 p_customer_id uuid,p_settlement_transaction_id uuid,p_account_id uuid,
 p_session_id uuid,p_reason text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record;
BEGIN
 SELECT * INTO v_context FROM public.pdv_party_account_context_v2(FALSE);
 PERFORM public.pdv_assert_party_v2(v_context.company_id,'customer',p_customer_id);
 IF NOT EXISTS(SELECT 1 FROM public.financial_transactions transaction
   JOIN public.pdv_receivable_settlement_allocations allocation
    ON allocation.settlement_transaction_id=transaction.id AND allocation.company_id=transaction.company_id
   WHERE transaction.id=p_settlement_transaction_id AND transaction.company_id=v_context.company_id
     AND transaction.customer_id=p_customer_id AND allocation.customer_id=p_customer_id) THEN
  RAISE EXCEPTION 'O recebimento não pertence a este cliente.'
   USING ERRCODE='P0002',DETAIL='code=pdv_party_account_settlement_not_found';
 END IF;
 RETURN public.pdv_reverse_receivable_settlement_v2(p_settlement_transaction_id,p_account_id,
   p_session_id,p_reason,p_idempotency_key);
END $fn$;

-- Extrato separa contexto de atendimento e gaveta; banco geral continua visível sem caixa. Históricos sem prova não oferecem estorno.
DO $patch$
DECLARE v_source text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_party_account_statement_v3(text,uuid,text,integer,integer)'::regprocedure) INTO v_source;
 IF position($old$      allocation.cash_session_id,allocation.settlement_method,$old$ IN v_source)=0 THEN RAISE EXCEPTION 'Contrato de pdv_party_account_statement_v3 mudou; revisão necessária'; END IF;
 v_source:=replace(v_source,$old$      allocation.cash_session_id,allocation.settlement_method,$old$,$new$      settlement.pdv_cash_session_id,allocation.settlement_method,$new$);
 IF position($old$      AND public.pdv_can_access_cash_session_v3(v_context.user_id,v_context.company_id,
            settlement.pdv_cash_session_id)$old$ IN v_source)=0 THEN RAISE EXCEPTION 'Contrato de pdv_party_account_statement_v3 mudou; revisão necessária'; END IF;
 v_source:=replace(v_source,$old$      AND public.pdv_can_access_cash_session_v3(v_context.user_id,v_context.company_id,
            settlement.pdv_cash_session_id)$old$,$new$      AND (public.pdv_can_access_cash_session_v3(v_context.user_id,v_context.company_id,
            settlement.pdv_cash_session_id) OR (settlement.pdv_cash_session_id IS NULL AND NOT EXISTS(
          SELECT 1 FROM public.pdv_receivable_settlement_allocations a
          JOIN public.financial_transactions principal ON principal.id=a.receivable_transaction_id
            AND principal.company_id=a.company_id
          WHERE a.company_id=v_context.company_id AND a.settlement_transaction_id=settlement.id
            AND principal.origin='pdv'
        )))$new$);
 IF position($old$      'can_reverse',page.can_reverse)$old$ IN v_source)=0 THEN RAISE EXCEPTION 'Contrato de pdv_party_account_statement_v3 mudou; revisão necessária'; END IF;
 v_source:=replace(v_source,$old$      'can_reverse',page.can_reverse)$old$,$new$      'requires_cash_session',CASE WHEN page.source_type='obligation' THEN EXISTS(
        SELECT 1 FROM public.financial_transactions principal WHERE principal.id=page.id
          AND principal.company_id=v_context.company_id AND principal.origin='pdv'
      ) ELSE page.cash_session_id IS NOT NULL END,
      'can_reverse',page.can_reverse AND (page.source_type<>'settlement'
        OR page.settlement_method='dinheiro' OR page.cash_session_id IS NULL OR (
          SELECT bool_and(COALESCE(a.metadata->>'receiving_cash_session_id'=page.cash_session_id::text,false))
          FROM public.pdv_receivable_settlement_allocations a
          WHERE a.company_id=v_context.company_id AND a.settlement_transaction_id=page.id
            AND a.allocation_kind='settlement'
        )))$new$);
 EXECUTE v_source;
END $patch$;

COMMIT;

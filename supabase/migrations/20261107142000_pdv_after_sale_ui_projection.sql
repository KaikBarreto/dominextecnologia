-- W5-02B: projeção segura para UI, confirmação externa e voucher em pedido comum.
BEGIN;

CREATE TABLE public.pdv_refund_confirmation_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  refund_id uuid NOT NULL REFERENCES public.pdv_refunds(id) ON DELETE RESTRICT,
  refund_event_id uuid NOT NULL REFERENCES public.pdv_refund_events(id) ON DELETE RESTRICT,
  reference_hash text NOT NULL CHECK(reference_hash ~ '^[0-9a-f]{64}$'),
  reference_redacted text NOT NULL CHECK(char_length(reference_redacted) BETWEEN 1 AND 32),
  operation_request_id uuid NOT NULL UNIQUE REFERENCES public.pdv_operation_requests(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(refund_event_id)
);

ALTER TABLE public.pdv_refund_confirmation_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_refund_confirmation_references FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_refund_confirmation_references FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX idx_pdv_refund_confirmation_refund
  ON public.pdv_refund_confirmation_references(company_id,refund_id,created_at,id);

CREATE OR REPLACE FUNCTION public.pdv_guard_refund_confirmation_reference_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_refund public.pdv_refunds%ROWTYPE; v_event public.pdv_refund_events%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' AND (NOT EXISTS(SELECT 1 FROM public.companies WHERE id=OLD.company_id)
    OR COALESCE(current_setting('app.pdv_purge_company',true),'')=OLD.company_id::text) THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND OLD.created_by IS NOT NULL AND NEW.created_by IS NULL
    AND NOT EXISTS(SELECT 1 FROM auth.users users WHERE users.id=OLD.created_by)
    AND (to_jsonb(NEW)-'created_by')=(to_jsonb(OLD)-'created_by') THEN RETURN NEW; END IF;
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'A confirmação externa é imutável.'
    USING ERRCODE='55000',DETAIL='code=pdv_refund_confirmation_append_only'; END IF;
  SELECT * INTO v_refund FROM public.pdv_refunds refund WHERE refund.id=NEW.refund_id FOR UPDATE;
  SELECT * INTO v_event FROM public.pdv_refund_events event WHERE event.id=NEW.refund_event_id FOR UPDATE;
  IF v_refund.id IS NULL OR v_event.id IS NULL OR v_refund.company_id<>NEW.company_id
    OR v_event.company_id<>NEW.company_id OR v_event.refund_id<>NEW.refund_id OR v_event.event_kind<>'settled'
    OR v_refund.method NOT IN('pix','transferencia','debito','credito')
    OR NOT EXISTS(SELECT 1 FROM public.pdv_operation_requests request
      WHERE request.id=NEW.operation_request_id AND request.company_id=NEW.company_id) THEN
    RAISE EXCEPTION 'A referência não corresponde a um reembolso externo liquidado.'
      USING ERRCODE='23514',DETAIL='code=pdv_refund_confirmation_mismatch'; END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_search_vouchers_v2(
  p_query text,p_customer_id uuid DEFAULT NULL,p_limit integer DEFAULT 20,p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
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
       p_return_id=>voucher.source_commercial_return_id) IS TRUE
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
         p_return_id=>voucher.source_commercial_return_id) IS TRUE
       AND (v_query IS NULL OR voucher.public_code LIKE v_pattern||'%' ESCAPE '\')
     ORDER BY voucher.public_code LIMIT p_limit OFFSET p_offset) row),'[]'::jsonb),
    'total',v_total,'limit',p_limit,'offset',p_offset);
END $fn$;

-- Projeta somente o valor que o helper de 141000 consegue liberar de fato.
-- O cálculo percorre as disposições na mesma ordem canônica do writer e para
-- no primeiro lançamento que já não pode ser integralmente estornado. Isso é
-- intencional: uma reversão parcial do livro de crédito violaria o vínculo
-- append-only e poderia ressuscitar crédito já consumido em outra operação.
CREATE OR REPLACE FUNCTION public.pdv_return_reallocatable_amounts_internal_v2(
  p_company_id uuid,p_return_id uuid
) RETURNS TABLE(unallocated_amount numeric,reallocatable_amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE
  v_header public.pdv_commercial_returns%ROWTYPE;
  v_disposition public.pdv_return_dispositions%ROWTYPE;
  v_credit public.pdv_party_credit_entries%ROWTYPE;
  v_application public.pdv_party_credit_entries%ROWTYPE;
  v_available_credit numeric(14,2);
  v_unallocated numeric(14,2);
  v_reallocatable numeric(14,2);
BEGIN
  SELECT * INTO v_header FROM public.pdv_commercial_returns header
   WHERE header.id=p_return_id AND header.company_id=p_company_id AND header.event_kind='return';
  IF NOT FOUND OR v_header.customer_id IS NULL OR EXISTS(
    SELECT 1 FROM public.pdv_commercial_returns reversal WHERE reversal.reversal_of_id=v_header.id
  ) THEN
    unallocated_amount:=0; reallocatable_amount:=0; RETURN NEXT; RETURN;
  END IF;

  SELECT round(abs(v_header.commercial_total)
      -COALESCE((SELECT sum(disposition.amount) FROM public.pdv_return_dispositions disposition
        WHERE disposition.commercial_return_id=v_header.id),0)
      -COALESCE((SELECT sum(value.amount) FROM public.pdv_return_value_events value
        WHERE value.commercial_return_id=v_header.id),0),2)
    INTO v_unallocated;
  IF v_unallocated<0 THEN
    unallocated_amount:=0; reallocatable_amount:=0; RETURN NEXT; RETURN;
  END IF;

  v_unallocated:=GREATEST(v_unallocated,0);
  v_reallocatable:=v_unallocated;
  v_available_credit:=public.pdv_party_available_credit_v2(
    p_company_id,'customer',v_header.customer_id);

  FOR v_disposition IN
    SELECT disposition.* FROM public.pdv_return_dispositions disposition
     WHERE disposition.company_id=p_company_id
       AND disposition.commercial_return_id=v_header.id
       AND disposition.amount>0
       AND NOT EXISTS(SELECT 1 FROM public.pdv_return_dispositions reversal
         WHERE reversal.reversal_of_id=disposition.id)
     ORDER BY disposition.id
  LOOP
    SELECT * INTO v_credit FROM public.pdv_party_credit_entries entry
     WHERE entry.id=v_disposition.credit_entry_id
       AND entry.company_id=p_company_id
       AND entry.customer_id=v_header.customer_id;
    IF NOT FOUND OR v_credit.amount<>v_disposition.amount OR EXISTS(
      SELECT 1 FROM public.pdv_party_credit_entries reversal WHERE reversal.reversal_of_id=v_credit.id
    ) THEN EXIT; END IF;

    IF v_disposition.disposition_kind='customer_credit' THEN
      -- O writer estorna o lançamento original inteiro antes de recriar seu
      -- residual. Se qualquer parte desse crédito já saiu, essa disposição
      -- não é prometida como disponível pela projeção.
      IF v_available_credit<v_credit.amount THEN EXIT; END IF;
      v_available_credit:=round(v_available_credit-v_credit.amount,2);
    ELSE
      SELECT * INTO v_application FROM public.pdv_party_credit_entries entry
       WHERE entry.id=v_disposition.application_entry_id
         AND entry.company_id=p_company_id
         AND entry.customer_id=v_header.customer_id;
      IF NOT FOUND OR v_application.amount<>-v_disposition.amount
        OR v_application.target_financial_transaction_id IS DISTINCT FROM v_disposition.receivable_transaction_id
        OR EXISTS(SELECT 1 FROM public.pdv_party_credit_entries reversal
          WHERE reversal.reversal_of_id=v_application.id)
        OR NOT EXISTS(SELECT 1 FROM public.financial_transactions transaction
          WHERE transaction.id=v_application.target_financial_transaction_id
            AND transaction.company_id=p_company_id AND transaction.customer_id=v_header.customer_id
            AND transaction.parent_transaction_id IS NULL AND transaction.cancelled_at IS NULL)
      THEN EXIT; END IF;
    END IF;

    v_reallocatable:=round(v_reallocatable+v_disposition.amount,2);
  END LOOP;

  unallocated_amount:=v_unallocated;
  reallocatable_amount:=LEAST(v_reallocatable,abs(v_header.commercial_total));
  RETURN NEXT;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_get_after_sale_workspace_v2(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_order public.pdv_orders%ROWTYPE; v_admin boolean;
  v_issue boolean; v_request boolean; v_confirm boolean; v_reverse_refund boolean;
  v_reverse_voucher boolean; v_exchange boolean; v_apply boolean; v_bank boolean; v_credit boolean;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:view_pdv_after_sale');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_order_id => p_order_id
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque deste pedido.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied';
  END IF;
  SELECT * INTO v_order FROM public.pdv_orders orders WHERE orders.id=p_order_id
    AND orders.company_id=v_context.company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE='P0002'; END IF;
  v_admin:=public.is_admin_or_gestor(v_context.user_id) OR public.is_super_admin(v_context.user_id);
  v_issue:=v_admin OR public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:issue_pdv_voucher');
  v_request:=v_admin OR public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:refund_pdv_return');
  v_confirm:=v_admin OR public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:confirm_pdv_refund');
  v_reverse_refund:=v_admin OR public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:reverse_pdv_refund');
  v_reverse_voucher:=v_admin OR public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:reverse_pdv_after_sale');
  v_exchange:=v_admin OR public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:cover_pdv_exchange');
  v_apply:=v_admin OR public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:cover_pdv_order');
  v_bank:=v_admin OR public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:use_bank_accounts');
  v_credit:=v_admin OR public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:approve_pdv_credit');
  RETURN jsonb_build_object(
    'order',jsonb_build_object('order_id',v_order.id,'order_number',v_order.number,
      'customer_id',v_order.customer_id,'status',v_order.status),
    'capabilities',jsonb_build_object('view',true,'issue_voucher',v_issue,'request_refund',v_request,
      'confirm_refund',v_confirm,'reverse_refund',v_reverse_refund,'reverse_voucher',v_reverse_voucher,
      'create_exchange',v_exchange,'apply_voucher',v_apply,'search_voucher',true,
      'use_bank_accounts',v_bank,'approve_credit',v_credit,'direct_sale_voucher',false),
    'cash_options',CASE WHEN v_request OR v_exchange THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'session_id',session.id,'terminal_id',terminal.id,'terminal_name',terminal.name,
      'account_id',session.cash_account_id,'label',terminal.name) ORDER BY terminal.name,session.id)
      FROM public.pdv_cash_sessions session JOIN public.pdv_terminals terminal ON terminal.id=session.terminal_id
      WHERE session.company_id=v_context.company_id AND session.status='aberta' AND session.contract_version=2
        AND (terminal.stock_id IS NULL OR public.pdv_has_stock_access_scope_v2(
          v_context.user_id,v_context.company_id,p_stock_id=>terminal.stock_id) IS TRUE)
        AND (session.opened_by=v_context.user_id OR v_admin)),'[]'::jsonb) ELSE '[]'::jsonb END,
    'account_options',CASE WHEN v_bank THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'account_id',account.id,'label',account.name,'methods',jsonb_build_array('pix','transferencia'))
      ORDER BY account.name,account.id) FROM public.financial_accounts account
      WHERE account.company_id=v_context.company_id AND account.is_active IS TRUE AND account.type='banco'),'[]'::jsonb)
      ELSE '[]'::jsonb END,
    -- Lista canônica para escolher a ação sem promover permissão: cada item
    -- declara separadamente se serve para troca e/ou aplicação de voucher.
    'order_candidates',CASE WHEN (v_exchange OR v_apply) AND v_order.customer_id IS NOT NULL THEN
      COALESCE((SELECT jsonb_agg(jsonb_build_object('order_id',candidate.id,
        'order_number',candidate.number,'total',candidate.total,'status',candidate.status,
        'created_at',candidate.created_at,'can_exchange',candidate.can_exchange,
        'can_apply_voucher',candidate.can_apply_voucher) ORDER BY candidate.created_at,candidate.id)
      FROM (SELECT candidate.id,candidate.number,candidate.total,candidate.status,candidate.created_at,
        (v_exchange AND NOT EXISTS(SELECT 1 FROM public.pdv_order_payments payment
          WHERE payment.order_id=candidate.id)) can_exchange,
        (v_apply AND NOT EXISTS(SELECT 1 FROM public.pdv_order_payments payment
          WHERE payment.order_id=candidate.id AND (payment.contract_version IS DISTINCT FROM 2
            OR payment.coverage_kind<>'voucher'))) can_apply_voucher
      FROM public.pdv_orders candidate WHERE candidate.company_id=v_context.company_id
        AND candidate.customer_id=v_order.customer_id AND candidate.id<>v_order.id
        AND public.pdv_has_stock_access_scope_v2(v_context.user_id,v_context.company_id,
          p_order_id=>candidate.id) IS TRUE
        AND candidate.contract_version=2 AND candidate.operation_mode_snapshot='counter'
        AND candidate.status='aguardando_pagamento'
        AND ((v_exchange AND NOT EXISTS(SELECT 1 FROM public.pdv_order_payments payment
              WHERE payment.order_id=candidate.id))
          OR (v_apply AND NOT EXISTS(SELECT 1 FROM public.pdv_order_payments payment
              WHERE payment.order_id=candidate.id AND (payment.contract_version IS DISTINCT FROM 2
                OR payment.coverage_kind<>'voucher'))))
      ORDER BY candidate.created_at,candidate.id LIMIT 50) candidate),'[]'::jsonb)
      ELSE '[]'::jsonb END,
    'exchange_candidates',CASE WHEN v_exchange AND v_order.customer_id IS NOT NULL THEN COALESCE((SELECT jsonb_agg(
      jsonb_build_object('order_id',candidate.id,'order_number',candidate.number,'total',candidate.total,
        'status',candidate.status,'created_at',candidate.created_at) ORDER BY candidate.created_at,candidate.id)
      FROM (SELECT candidate.id,candidate.number,candidate.total,candidate.status,candidate.created_at
      FROM public.pdv_orders candidate WHERE candidate.company_id=v_context.company_id
        AND candidate.customer_id=v_order.customer_id AND candidate.id<>v_order.id
        AND public.pdv_has_stock_access_scope_v2(v_context.user_id,v_context.company_id,
          p_order_id=>candidate.id) IS TRUE
        AND candidate.contract_version=2 AND candidate.operation_mode_snapshot='counter'
        AND candidate.status='aguardando_pagamento'
        AND NOT EXISTS(SELECT 1 FROM public.pdv_order_payments payment WHERE payment.order_id=candidate.id)
      ORDER BY candidate.created_at,candidate.id LIMIT 50) candidate),'[]'::jsonb) ELSE '[]'::jsonb END,
    'returns',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'return_id',header.id,'occurred_on',header.occurred_on,'reason',header.reason,
      'returned_value',abs(header.commercial_total),
      'allocated_value',round(abs(header.commercial_total)-calc.reallocatable_amount,2),
      'unallocated_amount',calc.unallocated_amount,
      'reallocatable_amount',calc.reallocatable_amount,
      'available_amount',calc.reallocatable_amount,
      -- Alias temporário para consumidores W5-02B anteriores a este contrato.
      'allocatable_value',calc.reallocatable_amount,
      'eligible_payments',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'payment_id',payment.id,'method',payment.method,'paid_amount',payment.amount,
        'refunded_amount',COALESCE(refunded.amount,0),
        'available_amount',GREATEST(round(payment.amount-COALESCE(refunded.amount,0),2),0)) ORDER BY payment.created_at,payment.id)
        FROM public.pdv_order_payments payment LEFT JOIN LATERAL(SELECT sum(refund.amount) amount
          FROM public.pdv_refunds refund WHERE refund.original_payment_id=payment.id
            AND NOT EXISTS(SELECT 1 FROM public.pdv_refund_events reversed
              WHERE reversed.refund_id=refund.id AND reversed.event_kind='reversed')) refunded ON true
        WHERE payment.company_id=v_context.company_id AND payment.order_id=v_order.id
          AND payment.method IN('dinheiro','pix','transferencia','debito','credito')
          AND (payment.contract_version IS DISTINCT FROM 2 OR (payment.coverage_status='authorized'
            AND payment.settlement_status='settled' AND payment.settled_at IS NOT NULL))
          AND payment.amount>COALESCE(refunded.amount,0)),'[]'::jsonb),
      'vouchers',COALESCE((SELECT jsonb_agg(jsonb_build_object('voucher_id',voucher.id,
        'public_code',voucher.public_code,'issued_on',voucher.issued_on,'expires_on',voucher.expires_on,
        'balance',balance.amount,'status',CASE WHEN balance.amount<=0 THEN 'exhausted'
          WHEN voucher.expires_on IS NOT NULL AND voucher.expires_on<public.company_today(v_context.company_id) THEN 'expired'
          ELSE 'active' END,'can_reverse',v_reverse_voucher AND balance.amount=issue.amount
            AND NOT EXISTS(SELECT 1 FROM public.pdv_voucher_entries reversal WHERE reversal.reversal_of_id=issue.id))
        ORDER BY voucher.created_at,voucher.id) FROM public.pdv_vouchers voucher
        JOIN public.pdv_voucher_entries issue ON issue.voucher_id=voucher.id AND issue.entry_kind='issue'
        CROSS JOIN LATERAL(SELECT public.pdv_voucher_balance_internal_v2(voucher.id) amount) balance
        WHERE voucher.source_commercial_return_id=header.id),'[]'::jsonb),
      'refunds',COALESCE((SELECT jsonb_agg(jsonb_build_object('refund_id',refund.id,'method',refund.method,
        'amount',refund.amount,'requested_on',refund.requested_on,'status',state.status,
        'can_confirm',v_confirm AND state.status='pending' AND refund.method<>'dinheiro',
        'requires_confirmation_reference',refund.method IN('pix','debito','credito'),
        'can_reverse',v_reverse_refund AND state.status='settled' AND (refund.method<>'dinheiro' OR EXISTS(
          SELECT 1 FROM public.pdv_refund_events settled
          JOIN public.pdv_cash_custody_entries custody ON custody.id=settled.custody_entry_id
          JOIN public.pdv_cash_sessions session ON session.id=custody.session_id
          WHERE settled.refund_id=refund.id AND settled.event_kind='settled' AND session.status='aberta')),
        'confirmation_reference_redacted',reference.reference_redacted) ORDER BY refund.created_at,refund.id)
        FROM public.pdv_refunds refund CROSS JOIN LATERAL(SELECT CASE
          WHEN EXISTS(SELECT 1 FROM public.pdv_refund_events event WHERE event.refund_id=refund.id AND event.event_kind='reversed') THEN 'reversed'
          WHEN EXISTS(SELECT 1 FROM public.pdv_refund_events event WHERE event.refund_id=refund.id AND event.event_kind='settled') THEN 'settled'
          ELSE 'pending' END status) state
        LEFT JOIN public.pdv_refund_confirmation_references reference ON reference.refund_id=refund.id
        WHERE refund.commercial_return_id=header.id),'[]'::jsonb),
      'exchanges',COALESCE((SELECT jsonb_agg(jsonb_build_object('exchange_id',exchange.id,
        'new_order_id',exchange.new_order_id,'new_order_number',new_order.number,
        'voucher_amount',exchange.applied_voucher_amount,'credit_amount',exchange.applied_credit_amount,
        'difference_amount',exchange.difference_amount) ORDER BY exchange.created_at,exchange.id)
        FROM public.pdv_exchanges exchange JOIN public.pdv_orders new_order ON new_order.id=exchange.new_order_id
        WHERE exchange.commercial_return_id=header.id
          AND public.pdv_has_stock_access_scope_v2(v_context.user_id,v_context.company_id,
            p_order_id=>new_order.id) IS TRUE),'[]'::jsonb)) ORDER BY header.occurred_on,header.id)
      FROM public.pdv_commercial_returns header
      CROSS JOIN LATERAL public.pdv_return_reallocatable_amounts_internal_v2(
        header.company_id,header.id) calc
      WHERE header.company_id=v_context.company_id AND header.order_id=v_order.id AND header.event_kind='return'),
      '[]'::jsonb));
END $fn$;

CREATE TRIGGER trg_pdv_refund_confirmation_append_only
BEFORE INSERT OR UPDATE OR DELETE ON public.pdv_refund_confirmation_references
FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_refund_confirmation_reference_v2();

-- Preserva a implementação liquidante de 141000 como helper owner-only.
DO $rename_confirm_base$
BEGIN
  IF to_regprocedure('public.pdv_confirm_return_refund_base_v2(uuid,uuid,text)') IS NULL THEN
    ALTER FUNCTION public.pdv_confirm_return_refund_v2(uuid,uuid,text)
      RENAME TO pdv_confirm_return_refund_base_v2;
  END IF;
END $rename_confirm_base$;

REVOKE ALL ON FUNCTION public.pdv_confirm_return_refund_base_v2(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_confirm_return_refund_v2(
  p_refund_id uuid,p_account_id uuid,p_confirmation_reference text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $fn$
DECLARE v_context record; v_refund public.pdv_refunds%ROWTYPE; v_claim record; v_base jsonb;
  v_reference text; v_hash text; v_redacted text; v_event uuid; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:confirm_pdv_refund');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id,
       p_return_id => (SELECT refund.commercial_return_id FROM public.pdv_refunds refund
                        WHERE refund.id=p_refund_id AND refund.company_id=v_context.company_id)
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
END $fn$;

-- Compatibilidade: chamadas antigas continuam válidas para transferência;
-- Pix/cartão falham fechado porque a sobrecarga de 4 args exige referência.
CREATE OR REPLACE FUNCTION public.pdv_confirm_return_refund_v2(
  p_refund_id uuid,p_account_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT public.pdv_confirm_return_refund_v2(p_refund_id,p_account_id,NULL,p_idempotency_key);
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_apply_voucher_to_order_v2(
  p_order_id uuid,p_voucher_id uuid,p_amount numeric,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_claim record; v_order public.pdv_orders%ROWTYPE;
  v_voucher public.pdv_vouchers%ROWTYPE; v_customer_id uuid; v_entry uuid; v_payment uuid;
  v_applied numeric(14,2); v_balance numeric(14,2); v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:cover_pdv_order');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_order_id => p_order_id
     ) IS DISTINCT FROM TRUE
     OR public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id,
       p_return_id => (SELECT voucher.source_commercial_return_id FROM public.pdv_vouchers voucher
                        WHERE voucher.id=p_voucher_id AND voucher.company_id=v_context.company_id)
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque desta operação.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied';
  END IF;
  IF p_amount IS NULL OR lower(p_amount::text) IN('nan','infinity','-infinity') THEN
    RAISE EXCEPTION 'Informe um valor válido em centavos.'
      USING ERRCODE='22023',DETAIL='code=pdv_voucher_application_amount_invalid'; END IF;
  IF p_amount<=0 OR p_amount>999999999.99 OR p_amount<>round(p_amount,2) THEN
    RAISE EXCEPTION 'Informe um valor válido em centavos.'
      USING ERRCODE='22023',DETAIL='code=pdv_voucher_application_amount_invalid'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,
    'after_sale.voucher.apply_order.v2',p_idempotency_key,
    jsonb_build_object('order_id',p_order_id,'voucher_id',p_voucher_id,'amount',p_amount));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'A aplicação do voucher já está em processamento.' USING ERRCODE='55000'; END IF;
  SELECT orders.customer_id INTO v_customer_id FROM public.pdv_orders orders
   WHERE orders.id=p_order_id AND orders.company_id=v_context.company_id;
  IF NOT FOUND OR v_customer_id IS NULL THEN RAISE EXCEPTION 'Pedido com cliente não encontrado.' USING ERRCODE='P0002'; END IF;
  PERFORM customer.id FROM public.customers customer WHERE customer.id=v_customer_id
    AND customer.company_id=v_context.company_id AND customer.is_deleted IS FALSE ORDER BY customer.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente do pedido não está disponível.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_order FROM public.pdv_orders orders WHERE orders.id=p_order_id
    AND orders.company_id=v_context.company_id FOR UPDATE;
  IF v_order.contract_version IS DISTINCT FROM 2 OR v_order.status<>'aguardando_pagamento'
    OR v_order.operation_mode_snapshot<>'counter' THEN
    RAISE EXCEPTION 'O pedido não está elegível para voucher.'
      USING ERRCODE='23514',DETAIL='code=pdv_voucher_order_not_eligible'; END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_order_payments payment WHERE payment.order_id=v_order.id
    AND (payment.contract_version IS DISTINCT FROM 2 OR payment.coverage_kind<>'voucher')) THEN
    RAISE EXCEPTION 'O pedido já possui outra forma de cobertura.' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_voucher FROM public.pdv_vouchers voucher WHERE voucher.id=p_voucher_id
    AND voucher.company_id=v_context.company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Voucher inválido, vencido, incompatível ou sem saldo.'
    USING ERRCODE='23514',DETAIL='code=pdv_voucher_application_invalid'; END IF;
  v_balance:=public.pdv_voucher_balance_internal_v2(p_voucher_id);
  SELECT round(COALESCE(sum(payment.amount),0),2) INTO v_applied FROM public.pdv_order_payments payment
   WHERE payment.order_id=v_order.id AND payment.contract_version=2 AND payment.coverage_kind='voucher';
  IF v_voucher.customer_id IS DISTINCT FROM v_order.customer_id
    OR (v_voucher.expires_on IS NOT NULL AND v_voucher.expires_on<public.company_today(v_context.company_id))
    OR v_balance<p_amount OR v_applied+p_amount>v_order.total THEN
    RAISE EXCEPTION 'Voucher inválido, vencido, incompatível ou sem saldo.'
      USING ERRCODE='23514',DETAIL='code=pdv_voucher_application_invalid'; END IF;
  INSERT INTO public.pdv_voucher_entries(company_id,voucher_id,entry_kind,amount,order_id,
    operation_request_id,description,created_by)
  VALUES(v_context.company_id,p_voucher_id,'redeem',-p_amount,v_order.id,v_claim.request_id,
    'Uso em pedido comum do PDV',v_context.user_id) RETURNING id INTO v_entry;
  INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,change_amount,created_by,
    contract_version,coverage_kind,coverage_status,settlement_status,authorized_at,settled_at,voucher_entry_id)
  VALUES(v_context.company_id,v_order.id,'voucher',p_amount,0,v_context.user_id,2,'voucher',
    'authorized','settled',now(),now(),v_entry) RETURNING id INTO v_payment;
  v_result:=jsonb_build_object('ok',true,'order_id',v_order.id,'voucher_id',p_voucher_id,
    'voucher_entry_id',v_entry,'payment_id',v_payment,'applied_amount',p_amount,
    'remaining_order_amount',round(v_order.total-v_applied-p_amount,2),
    'voucher_balance',round(v_balance-p_amount,2),'idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_order',v_order.id,v_result);
  RETURN v_result;
END $fn$;

-- Integra voucher pré-aplicado à cobertura atômica do balcão sem mudar a assinatura existente.
DO $patch_counter_cover$
DECLARE v_src text; v_old text; v_new text;
BEGIN
  SELECT pg_get_functiondef('public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure) INTO v_src;
  IF position('PDV_VOUCHER_PREAPPLIED_V21' in v_src)=0 THEN
    v_old:='  v_payment_total numeric(14,2):=0; v_fiado_total numeric(14,2):=0;';
    v_new:='  -- PDV_VOUCHER_PREAPPLIED_V21'||chr(10)||v_old||chr(10)||'  v_existing_voucher numeric(14,2):=0;';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Declaração da cobertura mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);
    v_old:='  IF EXISTS(SELECT 1 FROM public.pdv_order_payments payment'||chr(10)||
      '             WHERE payment.order_id=v_order.id) THEN'||chr(10)||
      '    RAISE EXCEPTION ''Este pedido já possui cobertura registrada.'''||chr(10)||
      '      USING ERRCODE=''23514'',DETAIL=''code=pdv_counter_order_already_covered'';'||chr(10)||'  END IF;';
    v_new:='  SELECT round(COALESCE(sum(payment.amount),0),2) INTO v_existing_voucher'||chr(10)||
      '    FROM public.pdv_order_payments payment WHERE payment.order_id=v_order.id'||chr(10)||
      '      AND payment.contract_version=2 AND payment.coverage_kind=''voucher'''||chr(10)||
      '      AND payment.coverage_status=''authorized'' AND payment.settlement_status=''settled'';'||chr(10)||
      '  IF v_existing_voucher>0 AND public.pdv_after_sale_v2_enabled_internal(v_context.company_id) IS DISTINCT FROM true THEN'||chr(10)||
      '    RAISE EXCEPTION ''A cobertura por voucher ainda não está liberada para esta empresa.'''||chr(10)||
      '      USING ERRCODE=''42501'',DETAIL=''code=pdv_after_sale_rollout_disabled'';'||chr(10)||
      '  END IF;'||chr(10)||
      '  IF EXISTS(SELECT 1 FROM public.pdv_order_payments payment WHERE payment.order_id=v_order.id'||chr(10)||
      '    AND (payment.contract_version IS DISTINCT FROM 2 OR payment.coverage_kind<>''voucher'')) THEN'||chr(10)||
      '    RAISE EXCEPTION ''Este pedido já possui outra cobertura registrada.'''||chr(10)||
      '      USING ERRCODE=''23514'',DETAIL=''code=pdv_counter_order_already_covered'';'||chr(10)||'  END IF;';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Guarda da cobertura mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);
    v_old:='    INTO v_payment_total,v_fiado_total FROM jsonb_array_elements(v_payments) payment;';
    v_new:=v_old||chr(10)||'  v_payment_total:=round(v_payment_total+v_existing_voucher,2);';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Totalização da cobertura mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new);
    v_old:='     OR (v_order.total>0 AND (jsonb_array_length(v_payments)=0 OR v_payment_total<>v_order.total)) THEN';
    v_new:='     OR (v_order.total>0 AND ((jsonb_array_length(v_payments)=0 AND v_existing_voucher=0)'||chr(10)||
      '       OR v_payment_total<>v_order.total)) THEN';
    IF position(v_old in v_src)=0 THEN RAISE EXCEPTION 'Validação do total da cobertura mudou'; END IF;
    v_src:=replace(v_src,v_old,v_new); EXECUTE v_src;
  END IF;
END $patch_counter_cover$;

DO $patch_lifecycle$
DECLARE v_src text; v_anchor text; v_insert text;
BEGIN
  SELECT pg_get_functiondef('public.reset_system_step(uuid,text,uuid)'::regprocedure) INTO v_src;
  IF position('PDV_REFUND_CONFIRMATION_RESET_V2' in v_src)=0 THEN
    v_anchor:='-- PDV_AFTER_SALE_VALUE_RESET_V2';
    v_insert:='-- PDV_REFUND_CONFIRMATION_RESET_V2'||chr(10)||
      '    DELETE FROM public.pdv_refund_confirmation_references WHERE company_id=p_company_id;'||chr(10)||'    '||v_anchor;
    IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Âncora reset W5-02 mudou'; END IF;
    v_src:=replace(v_src,v_anchor,v_insert); EXECUTE v_src;
  END IF;
  SELECT pg_get_functiondef('public.admin_delete_company(uuid)'::regprocedure) INTO v_src;
  IF position('PDV_REFUND_CONFIRMATION_ADMIN_DELETE_V2' in v_src)=0 THEN
    v_anchor:='-- PDV_AFTER_SALE_VALUE_ADMIN_DELETE_V2';
    v_insert:='-- PDV_REFUND_CONFIRMATION_ADMIN_DELETE_V2'||chr(10)||
      '  DELETE FROM public.pdv_refund_confirmation_references WHERE company_id=p_company_id;'||chr(10)||'  '||v_anchor;
    IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Âncora admin delete W5-02 mudou'; END IF;
    v_src:=replace(v_src,v_anchor,v_insert); EXECUTE v_src;
  END IF;
END $patch_lifecycle$;

REVOKE ALL ON FUNCTION public.pdv_guard_refund_confirmation_reference_v2(),
  public.pdv_confirm_return_refund_base_v2(uuid,uuid,text),
  public.pdv_return_reallocatable_amounts_internal_v2(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_get_after_sale_workspace_v2(uuid),
  public.pdv_search_vouchers_v2(text,uuid,integer,integer),
  public.pdv_apply_voucher_to_order_v2(uuid,uuid,numeric,text),
  public.pdv_confirm_return_refund_v2(uuid,uuid,text,text),public.pdv_confirm_return_refund_v2(uuid,uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_after_sale_workspace_v2(uuid),
  public.pdv_search_vouchers_v2(text,uuid,integer,integer),
  public.pdv_apply_voucher_to_order_v2(uuid,uuid,numeric,text),
  public.pdv_confirm_return_refund_v2(uuid,uuid,text,text),public.pdv_confirm_return_refund_v2(uuid,uuid,text)
  TO authenticated,service_role;

COMMENT ON FUNCTION public.pdv_get_after_sale_workspace_v2(uuid) IS 'Projeção segura W5-02B sem custo, CMV ou saldo bancário.';
COMMENT ON FUNCTION public.pdv_apply_voucher_to_order_v2(uuid,uuid,numeric,text) IS
  'Aplica voucher em pedido v2 de balcão; venda direta permanece capability explícita false.';

COMMIT;

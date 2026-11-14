-- Fechamento financeiro P0 do PDV: limite protegido, baixa de fiado no livro
-- canonico e liquidacao conciliavel das autorizacoes de cartao.
BEGIN;

-- O limite participa de decisao de credito. Editar a ficha do cliente nao
-- concede, sozinho, o direito de aumentar esse limite.
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_credit_limit_scale_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_credit_limit_scale_check CHECK (
  credit_limit IS NULL OR (
    credit_limit BETWEEN 0 AND 99999999.99
    AND credit_limit = round(credit_limit, 2)
  )
);

CREATE OR REPLACE FUNCTION public.pdv_guard_customer_credit_limit_v3()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_user uuid:=auth.uid();
BEGIN
  IF TG_OP='UPDATE' AND NEW.credit_limit IS NOT DISTINCT FROM OLD.credit_limit THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'A empresa do cliente nao pode ser alterada.'
      USING ERRCODE='23514',DETAIL='code=pdv_credit_limit_tenant_immutable';
  END IF;
  -- auth.uid nulo representa somente rotinas privilegiadas/migrations; usuarios
  -- autenticados sempre passam pelo gate abaixo.
  IF v_user IS NOT NULL
     AND public.get_user_company_id(v_user) IS DISTINCT FROM NEW.company_id
  THEN
    RAISE EXCEPTION 'O cliente nao pertence a sua empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_credit_limit_tenant_denied';
  END IF;
  IF v_user IS NOT NULL
     AND NOT public.is_admin_or_gestor(v_user)
     AND NOT public.is_super_admin(v_user)
     AND public.pdv_has_explicit_action_permission_v2(v_user,'fn:manage_party_credit') IS DISTINCT FROM TRUE
  THEN
    RAISE EXCEPTION 'Voce nao tem permissao para alterar o limite de fiado.'
      USING ERRCODE='42501',DETAIL='code=pdv_credit_limit_permission_denied';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS tg_pdv_guard_customer_credit_limit_v3 ON public.customers;
CREATE TRIGGER tg_pdv_guard_customer_credit_limit_v3
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_customer_credit_limit_v3();

CREATE OR REPLACE FUNCTION public.pdv_can_access_cash_session_v3(
  p_user_id uuid,p_company_id uuid,p_session_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT COALESCE(EXISTS(
    SELECT 1 FROM public.pdv_cash_sessions session
    JOIN public.pdv_terminals terminal
      ON terminal.id=session.terminal_id AND terminal.company_id=session.company_id
    WHERE session.id=p_session_id AND session.company_id=p_company_id
      AND session.contract_version=2
      AND (session.opened_by=p_user_id
        OR public.is_super_admin(p_user_id)
        OR public.pdv_has_explicit_action_permission_v2(p_user_id,'fn:operate_other_pdv_cash'))
  ),FALSE);
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_can_read_financial_transaction_v3(
  p_user_id uuid,p_company_id uuid,p_transaction_id uuid
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_transaction public.financial_transactions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR public.get_user_company_id(p_user_id) IS DISTINCT FROM p_company_id
     OR public.tenant_subscription_allows_access(p_company_id) IS DISTINCT FROM TRUE THEN RETURN FALSE; END IF;
  SELECT transaction.* INTO v_transaction FROM public.financial_transactions transaction
   WHERE transaction.id=p_transaction_id AND transaction.company_id=p_company_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF public.is_super_admin(p_user_id)
     OR public.pdv_has_explicit_action_permission_v2(p_user_id,'fn:operate_other_pdv_cash') THEN RETURN TRUE; END IF;
  IF v_transaction.origin IS DISTINCT FROM 'pdv' THEN
    RETURN public.user_has_permission(p_user_id,'screen:finance')
      OR public.pdv_has_explicit_action_permission_v2(p_user_id,'fn:view_finance_totals');
  END IF;
  IF v_transaction.pdv_cash_session_id IS NOT NULL THEN
    RETURN public.pdv_can_access_cash_session_v3(p_user_id,p_company_id,v_transaction.pdv_cash_session_id);
  END IF;
  RETURN EXISTS(
    SELECT 1 FROM public.pdv_order_payments payment
    JOIN public.pdv_orders orders ON orders.id=payment.order_id AND orders.company_id=payment.company_id
    JOIN public.pdv_cash_sessions session ON session.id=orders.cash_session_id
      AND session.company_id=orders.company_id AND session.terminal_id=orders.terminal_id
    WHERE payment.company_id=p_company_id
      AND (payment.receivable_transaction_id=p_transaction_id
        OR payment.settlement_transaction_id=p_transaction_id)
      AND public.pdv_can_access_cash_session_v3(p_user_id,p_company_id,session.id)
  );
END $fn$;

DROP POLICY IF EXISTS "Users can view entitled own company financial_transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can insert entitled own company financial_transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can update entitled own company financial_transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Managers can delete entitled own company financial_transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Users manage own company financial_transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Financeiro can manage transactions" ON public.financial_transactions;

CREATE POLICY "Scoped financial transaction reads v3"
  ON public.financial_transactions FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.tenant_subscription_allows_access(company_id)
      AND public.pdv_can_read_financial_transaction_v3(auth.uid(),company_id,id)
    )
  );
CREATE POLICY "Scoped non PDV financial transaction inserts v3"
  ON public.financial_transactions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      company_id=public.get_user_company_id(auth.uid())
      AND public.tenant_subscription_allows_access(company_id)
      AND origin IS DISTINCT FROM 'pdv' AND pdv_financial_role IS NULL AND pdv_cash_session_id IS NULL
      AND (public.is_admin_or_gestor(auth.uid())
        OR public.pdv_has_explicit_action_permission_v2(auth.uid(),'fn:manage_finance'))
    )
  );
CREATE POLICY "Scoped non PDV financial transaction updates v3"
  ON public.financial_transactions FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      company_id=public.get_user_company_id(auth.uid())
      AND public.tenant_subscription_allows_access(company_id)
      AND origin IS DISTINCT FROM 'pdv'
      AND pdv_financial_role IS NULL AND pdv_cash_session_id IS NULL
      AND (public.is_admin_or_gestor(auth.uid())
        OR public.pdv_has_explicit_action_permission_v2(auth.uid(),'fn:manage_finance'))
    )
  ) WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      company_id=public.get_user_company_id(auth.uid())
      AND public.tenant_subscription_allows_access(company_id)
      AND origin IS DISTINCT FROM 'pdv' AND pdv_financial_role IS NULL AND pdv_cash_session_id IS NULL
    )
  );
CREATE POLICY "Scoped non PDV financial transaction deletes v3"
  ON public.financial_transactions FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      company_id=public.get_user_company_id(auth.uid())
      AND public.tenant_subscription_allows_access(company_id)
      AND origin IS DISTINCT FROM 'pdv'
      AND pdv_financial_role IS NULL AND pdv_cash_session_id IS NULL
      AND public.can_delete_finance(auth.uid())
    )
  );

-- Extrato v3: o segmento e aplicado antes da paginacao e os recebimentos
-- canonicos aparecem com a chave necessaria para estorno compensatorio.
CREATE OR REPLACE FUNCTION public.pdv_party_account_statement_v3(
  p_party_type text,p_party_id uuid,p_segment text DEFAULT 'accounts',
  p_limit integer DEFAULT 50,p_offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_entries jsonb; v_total bigint;
BEGIN
  SELECT * INTO v_context FROM public.pdv_party_account_context_v2(FALSE);
  PERFORM public.pdv_assert_party_v2(v_context.company_id,p_party_type,p_party_id);
  IF p_segment NOT IN('accounts','balance') THEN
    RAISE EXCEPTION 'Tipo de extrato invalido.' USING ERRCODE='22023',DETAIL='code=pdv_party_account_segment_invalid';
  END IF;
  IF p_limit IS NULL OR p_offset IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset<0 THEN
    RAISE EXCEPTION 'Paginacao invalida.' USING ERRCODE='22023',DETAIL='code=pdv_party_account_pagination_invalid';
  END IF;
  WITH rows AS (
    SELECT transaction.id,'obligation'::text source_type,transaction.amount::numeric amount,
      transaction.transaction_date occurred_on,transaction.description,transaction.due_date,
      transaction.is_paid,public.pdv_party_obligation_open_v2(transaction.id) open_amount,
      CASE WHEN public.pdv_party_obligation_open_v2(transaction.id)=0 AND transaction.is_paid IS TRUE THEN 'paid'
           WHEN public.pdv_party_obligation_open_v2(transaction.id)=0 THEN 'closed_by_credit'
           WHEN COALESCE(transaction.amount_received,0)>0 THEN 'partial' ELSE 'open' END account_status,
      NULL::uuid account_id,NULL::uuid cash_session_id,NULL::text settlement_method,FALSE can_reverse
    FROM public.financial_transactions transaction
    WHERE p_segment='accounts' AND transaction.company_id=v_context.company_id
      AND transaction.parent_transaction_id IS NULL AND transaction.cancelled_at IS NULL
      AND (transaction.pdv_financial_role IS NULL OR transaction.pdv_financial_role NOT IN(
        'pdv_receivable_settlement','pdv_receivable_reversal','pdv_card_fee',
        'pdv_refund','pdv_refund_reversal','pdv_custody_transfer'
      ))
      AND ((p_party_type='customer' AND transaction.customer_id=p_party_id AND transaction.transaction_type::text='entrada')
        OR (p_party_type='supplier' AND transaction.supplier_id=p_party_id AND transaction.transaction_type::text='saida'))
      AND (transaction.origin IS DISTINCT FROM 'pdv' OR EXISTS(
        SELECT 1 FROM public.pdv_order_payments payment
        JOIN public.pdv_orders orders ON orders.id=payment.order_id AND orders.company_id=payment.company_id
        JOIN public.pdv_cash_sessions session ON session.id=orders.cash_session_id
          AND session.company_id=orders.company_id AND session.terminal_id=orders.terminal_id
        WHERE payment.company_id=v_context.company_id
          AND payment.receivable_transaction_id=transaction.id
          AND public.pdv_can_access_cash_session_v3(v_context.user_id,v_context.company_id,session.id)
      ))
    UNION ALL
    SELECT entry.id,entry.entry_kind,entry.amount,entry.occurred_on,entry.description,
      NULL::date,NULL::boolean,NULL::numeric,NULL::text,NULL::uuid,NULL::uuid,NULL::text,
      entry.entry_kind IN('credit','adjustment','application')
        AND NOT EXISTS(SELECT 1 FROM public.pdv_party_credit_entries reversal WHERE reversal.reversal_of_id=entry.id)
    FROM public.pdv_party_credit_entries entry
    WHERE p_segment='balance' AND entry.company_id=v_context.company_id AND entry.party_type=p_party_type
      AND ((p_party_type='customer' AND entry.customer_id=p_party_id)
        OR (p_party_type='supplier' AND entry.supplier_id=p_party_id))
    UNION ALL
    SELECT settlement.id,
      CASE WHEN settlement.pdv_financial_role='pdv_receivable_reversal' THEN 'settlement_reversal' ELSE 'settlement' END,
      CASE WHEN settlement.pdv_financial_role='pdv_receivable_reversal' THEN -abs(settlement.amount) ELSE settlement.amount END,
      COALESCE(settlement.paid_date,settlement.transaction_date),settlement.description,
      NULL::date,TRUE,NULL::numeric,NULL::text,settlement.account_id,
      allocation.cash_session_id,allocation.settlement_method,
      settlement.pdv_financial_role='pdv_receivable_settlement'
        AND NOT EXISTS(SELECT 1 FROM public.pdv_receivable_settlement_allocations reversal
          JOIN public.pdv_receivable_settlement_allocations original ON original.id=reversal.reversal_of_id
          WHERE original.settlement_transaction_id=settlement.id)
    FROM public.financial_transactions settlement
    JOIN LATERAL (
      SELECT (array_agg(a.cash_session_id ORDER BY a.id))[1] cash_session_id,
             (array_agg(a.settlement_method ORDER BY a.id))[1] settlement_method
      FROM public.pdv_receivable_settlement_allocations a
      WHERE a.company_id=v_context.company_id AND a.customer_id=p_party_id
        AND a.settlement_transaction_id=settlement.id
    ) allocation ON TRUE
    WHERE p_segment='balance' AND p_party_type='customer'
      AND settlement.company_id=v_context.company_id AND settlement.customer_id=p_party_id
      AND settlement.pdv_financial_role IN('pdv_receivable_settlement','pdv_receivable_reversal')
      AND public.pdv_can_access_cash_session_v3(v_context.user_id,v_context.company_id,
            settlement.pdv_cash_session_id)
    UNION ALL
    SELECT md5('pdv-legacy-credit-balance:'||p_party_id::text)::uuid,
      CASE WHEN sum(ledger.amount)>0 THEN 'legacy_debt_balance' ELSE 'legacy_credit_balance' END,
      round(abs(sum(ledger.amount)),2),(max(ledger.created_at) AT TIME ZONE COALESCE(max(settings.timezone),'America/Sao_Paulo'))::date,
      CASE WHEN sum(ledger.amount)>0 THEN 'Divida liquida anterior' ELSE 'Credito liquido anterior' END,
      NULL::date,NULL::boolean,CASE WHEN sum(ledger.amount)>0 THEN round(sum(ledger.amount),2) ELSE NULL::numeric END,
      NULL::text,NULL::uuid,NULL::uuid,NULL::text,FALSE
    FROM public.customer_credit_ledger ledger
    LEFT JOIN public.company_settings settings ON settings.company_id=ledger.company_id
    WHERE p_party_type='customer' AND ledger.company_id=v_context.company_id
      AND ledger.customer_id=p_party_id AND ledger.financial_transaction_id IS NULL
    HAVING sum(ledger.amount)<>0
      AND p_segment=CASE WHEN sum(ledger.amount)>0 THEN 'accounts' ELSE 'balance' END
  ), page AS (
    SELECT * FROM rows ORDER BY occurred_on DESC,id DESC LIMIT p_limit OFFSET p_offset
  )
  SELECT (SELECT count(*) FROM rows),COALESCE(jsonb_agg(jsonb_build_object(
      'id',page.id,'source_type',page.source_type,'amount',page.amount,'occurred_on',page.occurred_on,
      'description',page.description,'due_date',page.due_date,'is_paid',page.is_paid,
      'open_amount',page.open_amount,'account_status',page.account_status,'account_id',page.account_id,
      'cash_session_id',page.cash_session_id,'settlement_method',page.settlement_method,
      'can_reverse',page.can_reverse) ORDER BY page.occurred_on DESC,page.id DESC),'[]'::jsonb)
    INTO v_total,v_entries FROM page;
  RETURN jsonb_build_object('summary',public.pdv_party_account_summary_v2(p_party_type,p_party_id),
    'entries',v_entries,'total_count',v_total,'limit',p_limit,'offset',p_offset);
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_party_receivable_options_v3(p_customer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_accounts jsonb; v_sessions jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_party_account_context_v2(FALSE);
  PERFORM public.pdv_assert_party_v2(v_context.company_id,'customer',p_customer_id);
  IF NOT public.pdv_can_manage_receivables_v2(v_context.user_id,FALSE) THEN
    RAISE EXCEPTION 'Voce nao tem permissao para receber contas.' USING ERRCODE='42501',DETAIL='code=pdv_receivable_settlement_forbidden';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',account.id,'name',account.name,'type',account.type)
    ORDER BY account.sort_order,account.name),'[]'::jsonb) INTO v_accounts
  FROM public.financial_accounts account
  WHERE account.company_id=v_context.company_id AND account.is_active
    AND (account.type='caixa' OR (account.type='banco' AND public.can_use_bank_accounts(v_context.user_id)));
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',session.id,'cash_account_id',session.cash_account_id,
      'label',COALESCE(terminal.name,'Caixa '||left(session.id::text,8))) ORDER BY session.opened_at DESC),'[]'::jsonb)
    INTO v_sessions
  FROM public.pdv_cash_sessions session
  LEFT JOIN public.pdv_terminals terminal ON terminal.id=session.terminal_id AND terminal.company_id=session.company_id
  WHERE session.company_id=v_context.company_id AND session.contract_version=2 AND session.status='aberta'
    AND public.pdv_can_access_cash_session_v3(v_context.user_id,v_context.company_id,session.id);
  RETURN jsonb_build_object('accounts',v_accounts,'cash_sessions',v_sessions);
END $fn$;

-- As primitivas genericas nao ficam acessiveis pelo cliente: somente os
-- wrappers abaixo conhecem cliente, empresa e a sessao/terminal permitidos.
REVOKE EXECUTE ON FUNCTION public.pdv_settle_receivables_v2(jsonb,text,uuid,uuid,date,text,text)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pdv_reverse_receivable_settlement_v2(uuid,uuid,uuid,text,text)
  FROM authenticated;

CREATE OR REPLACE FUNCTION public.pdv_party_settle_receivables_v2(
  p_customer_id uuid,p_allocations jsonb,p_method text,p_account_id uuid,
  p_session_id uuid,p_received_on date,p_notes text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record;
BEGIN
  SELECT * INTO v_context FROM public.pdv_party_account_context_v2(FALSE);
  PERFORM public.pdv_assert_party_v2(v_context.company_id,'customer',p_customer_id);
  IF lower(btrim(COALESCE(p_method,'')))='dinheiro'
     AND public.pdv_can_access_cash_session_v3(v_context.user_id,v_context.company_id,p_session_id)
         IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Voce nao pode receber neste caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_receivable_cash_session_forbidden';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_allocations,'[]'::jsonb)) item
    JOIN public.financial_transactions transaction ON transaction.id=(item->>'receivable_id')::uuid
    WHERE transaction.customer_id IS DISTINCT FROM p_customer_id
      OR transaction.company_id IS DISTINCT FROM v_context.company_id
      OR (transaction.origin='pdv' AND NOT EXISTS(
        SELECT 1 FROM public.pdv_order_payments payment
        JOIN public.pdv_orders orders ON orders.id=payment.order_id AND orders.company_id=payment.company_id
        JOIN public.pdv_cash_sessions session ON session.id=orders.cash_session_id
          AND session.company_id=orders.company_id AND session.terminal_id=orders.terminal_id
        WHERE payment.company_id=v_context.company_id
          AND payment.receivable_transaction_id=transaction.id
          AND public.pdv_can_access_cash_session_v3(v_context.user_id,v_context.company_id,session.id)
      ))
  ) THEN
    RAISE EXCEPTION 'Uma conta nao pertence a este cliente ou caixa.'
      USING ERRCODE='23514',DETAIL='code=pdv_party_account_receivable_mismatch';
  END IF;
  RETURN public.pdv_settle_receivables_v2(p_allocations,p_method,p_account_id,p_session_id,
    p_received_on,p_notes,p_idempotency_key);
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_party_reverse_receivable_settlement_v2(
  p_customer_id uuid,p_settlement_transaction_id uuid,p_account_id uuid,
  p_session_id uuid,p_reason text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_original_session uuid; v_method text;
BEGIN
  SELECT * INTO v_context FROM public.pdv_party_account_context_v2(FALSE);
  PERFORM public.pdv_assert_party_v2(v_context.company_id,'customer',p_customer_id);
  SELECT transaction.pdv_cash_session_id,(array_agg(allocation.settlement_method ORDER BY allocation.id))[1]
    INTO v_original_session,v_method
  FROM public.financial_transactions transaction
  JOIN public.pdv_receivable_settlement_allocations allocation
    ON allocation.settlement_transaction_id=transaction.id AND allocation.company_id=transaction.company_id
  WHERE transaction.id=p_settlement_transaction_id AND transaction.company_id=v_context.company_id
    AND transaction.customer_id=p_customer_id
  GROUP BY transaction.pdv_cash_session_id;
  IF NOT FOUND OR public.pdv_can_access_cash_session_v3(v_context.user_id,v_context.company_id,v_original_session)
      IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Recebimento nao encontrado neste caixa.'
      USING ERRCODE='P0002',DETAIL='code=pdv_party_account_settlement_not_found';
  END IF;
  IF v_method='dinheiro' AND public.pdv_can_access_cash_session_v3(
      v_context.user_id,v_context.company_id,p_session_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Voce nao pode estornar neste caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_receivable_cash_session_forbidden';
  END IF;
  RETURN public.pdv_reverse_receivable_settlement_v2(p_settlement_transaction_id,p_account_id,
    p_session_id,p_reason,p_idempotency_key);
END $fn$;

-- Liquidacao de cartao: autorizacao nao e caixa. O fato financeiro nasce
-- somente na conciliacao e a taxa vira uma saida separada na mesma conta.
CREATE TABLE public.pdv_card_settlement_details(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL UNIQUE REFERENCES public.pdv_order_payments(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.pdv_orders(id) ON DELETE RESTRICT,
  gross_amount numeric(14,2) NOT NULL CHECK(gross_amount>0 AND gross_amount=round(gross_amount,2)),
  fee_amount numeric(14,2) NOT NULL CHECK(fee_amount>=0 AND fee_amount<=gross_amount AND fee_amount=round(fee_amount,2)),
  net_amount numeric(14,2) GENERATED ALWAYS AS (gross_amount-fee_amount) STORED,
  bank_account_id uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  settlement_transaction_id uuid NOT NULL UNIQUE REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,
  fee_transaction_id uuid UNIQUE REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,
  acquirer text NOT NULL CHECK(char_length(btrim(acquirer)) BETWEEN 2 AND 80),
  nsu text NOT NULL CHECK(char_length(btrim(nsu)) BETWEEN 1 AND 80),
  installments smallint NOT NULL CHECK(installments BETWEEN 1 AND 36),
  settled_on date NOT NULL,
  operation_request_id uuid NOT NULL UNIQUE REFERENCES public.pdv_operation_requests(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,acquirer,nsu)
);
ALTER TABLE public.pdv_card_settlement_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_card_settlement_details FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_card_settlement_details FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.pdv_card_settlement_details TO service_role;

CREATE OR REPLACE FUNCTION public.pdv_card_settlement_context_v3()
RETURNS TABLE(user_id uuid,company_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_user uuid:=auth.uid(); v_company uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sessao expirada.' USING ERRCODE='42501',DETAIL='code=pdv_card_auth_required'; END IF;
  SELECT profile.company_id INTO v_company FROM public.profiles profile
   WHERE profile.user_id=v_user AND profile.is_active IS TRUE;
  IF v_company IS NULL OR public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM TRUE
     OR public.company_has_module(v_company,'pdv') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'A liquidacao de cartao nao esta disponivel.' USING ERRCODE='42501',DETAIL='code=pdv_card_company_denied';
  END IF;
  IF NOT public.is_super_admin(v_user)
     AND public.pdv_has_explicit_action_permission_v2(v_user,'fn:settle_pdv_card') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Voce nao tem permissao para liquidar cartoes.' USING ERRCODE='42501',DETAIL='code=pdv_card_permission_denied';
  END IF;
  RETURN QUERY SELECT v_user,v_company;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_list_open_card_authorizations_v3()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_payments jsonb; v_accounts jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_card_settlement_context_v3();
  IF public.can_use_bank_accounts(v_context.user_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Voce nao pode usar contas bancarias.' USING ERRCODE='42501',DETAIL='code=pdv_card_bank_permission_denied';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',payment.id,'order_id',orders.id,'order_number',orders.number,
      'customer_name',COALESCE(customer.name,'Consumidor final'),'method',payment.method,'amount',payment.amount,
      'authorized_at',payment.authorized_at) ORDER BY payment.authorized_at,payment.id),'[]'::jsonb)
    INTO v_payments
  FROM public.pdv_order_payments payment
  JOIN public.pdv_orders orders ON orders.id=payment.order_id AND orders.company_id=payment.company_id
  JOIN public.pdv_cash_sessions session ON session.id=orders.cash_session_id
    AND session.company_id=orders.company_id AND session.terminal_id=orders.terminal_id
  LEFT JOIN public.customers customer ON customer.id=orders.customer_id AND customer.company_id=orders.company_id
  WHERE payment.company_id=v_context.company_id AND payment.contract_version=2
    AND payment.coverage_kind='card_authorization' AND payment.coverage_status='authorized'
    AND payment.settlement_status='open' AND payment.settlement_transaction_id IS NULL
    AND public.pdv_can_access_cash_session_v3(v_context.user_id,v_context.company_id,session.id);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',account.id,'name',account.name)
    ORDER BY account.sort_order,account.name),'[]'::jsonb) INTO v_accounts
  FROM public.financial_accounts account
  WHERE account.company_id=v_context.company_id AND account.is_active AND account.type='banco';
  RETURN jsonb_build_object('payments',v_payments,'accounts',v_accounts,
    'company_today',public.company_today(v_context.company_id));
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_settle_card_authorization_v3(
  p_payment_id uuid,p_account_id uuid,p_settled_on date,p_acquirer text,p_nsu text,
  p_installments integer,p_fee_amount numeric,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_claim record; v_payment public.pdv_order_payments%ROWTYPE;
  v_order public.pdv_orders%ROWTYPE; v_gross numeric(14,2); v_fee numeric(14,2);
  v_settlement uuid; v_fee_tx uuid; v_category text:='Taxa de cartao PDV'; v_result jsonb;
  v_date date; v_acquirer text; v_nsu text;
BEGIN
  SELECT * INTO v_context FROM public.pdv_card_settlement_context_v3();
  IF public.can_use_bank_accounts(v_context.user_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Voce nao pode usar contas bancarias.' USING ERRCODE='42501',DETAIL='code=pdv_card_bank_permission_denied';
  END IF;
  v_date:=COALESCE(p_settled_on,public.company_today(v_context.company_id));
  v_acquirer:=NULLIF(btrim(COALESCE(p_acquirer,'')),''); v_nsu:=NULLIF(btrim(COALESCE(p_nsu,'')),'');
  v_fee:=round(COALESCE(p_fee_amount,0),2);
  IF v_date>public.company_today(v_context.company_id) OR v_acquirer IS NULL OR char_length(v_acquirer)>80
     OR v_nsu IS NULL OR char_length(v_nsu)>80 OR p_installments NOT BETWEEN 1 AND 36 OR v_fee<0 THEN
    RAISE EXCEPTION 'Revise os dados da liquidacao.' USING ERRCODE='22023',DETAIL='code=pdv_card_input_invalid';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.financial_accounts account WHERE account.id=p_account_id
      AND account.company_id=v_context.company_id AND account.is_active AND account.type='banco') THEN
    RAISE EXCEPTION 'Conta bancaria invalida.' USING ERRCODE='P0002',DETAIL='code=pdv_card_account_invalid';
  END IF;
  SELECT payment.* INTO v_payment
  FROM public.pdv_order_payments payment JOIN public.pdv_orders orders ON orders.id=payment.order_id
  WHERE payment.id=p_payment_id AND payment.company_id=v_context.company_id AND orders.company_id=v_context.company_id
  FOR UPDATE OF payment,orders;
  IF FOUND THEN
    SELECT orders.* INTO v_order
      FROM public.pdv_orders orders
     WHERE orders.id=v_payment.order_id;
  END IF;
  IF NOT FOUND OR v_payment.contract_version IS DISTINCT FROM 2 OR v_payment.coverage_kind<>'card_authorization'
     OR v_payment.coverage_status<>'authorized' THEN
    RAISE EXCEPTION 'Autorizacao nao encontrada.' USING ERRCODE='P0002',DETAIL='code=pdv_card_authorization_not_found';
  END IF;
  IF v_order.cash_session_id IS NULL OR v_order.terminal_id IS NULL
     OR NOT EXISTS(SELECT 1 FROM public.pdv_cash_sessions session
       WHERE session.id=v_order.cash_session_id AND session.company_id=v_context.company_id
         AND session.terminal_id=v_order.terminal_id AND session.contract_version=2)
     OR public.pdv_can_access_cash_session_v3(v_context.user_id,v_context.company_id,v_order.cash_session_id)
        IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Este cartao pertence a outro caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_card_cash_session_denied';
  END IF;
  v_gross:=round(v_payment.amount,2);
  IF v_fee>v_gross THEN RAISE EXCEPTION 'A taxa nao pode superar o valor bruto.' USING ERRCODE='22023',DETAIL='code=pdv_card_fee_invalid'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'card.settle.v3',p_idempotency_key,
    jsonb_build_object('payment_id',p_payment_id,'account_id',p_account_id,'settled_on',v_date,
      'acquirer',v_acquirer,'nsu',v_nsu,'installments',p_installments,'fee_amount',v_fee));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',TRUE); END IF;
    RAISE EXCEPTION 'Liquidacao em processamento.' USING ERRCODE='55000',DETAIL='code=pdv_card_in_progress';
  END IF;
  IF v_payment.settlement_status<>'open' OR v_payment.settlement_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta autorizacao ja foi liquidada.' USING ERRCODE='23505',DETAIL='code=pdv_card_already_settled';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_card_settlement_details detail WHERE detail.company_id=v_context.company_id
      AND detail.acquirer=v_acquirer AND detail.nsu=v_nsu) THEN
    RAISE EXCEPTION 'Este NSU ja foi conciliado.' USING ERRCODE='23505',DETAIL='code=pdv_card_nsu_duplicated';
  END IF;
  INSERT INTO public.financial_transactions(company_id,transaction_type,description,amount,category,
    transaction_date,paid_date,is_paid,account_id,customer_id,origin,payment_method,created_by,
    pdv_financial_role,pdv_settlement_group_id,pdv_cash_session_id)
  VALUES(v_context.company_id,'entrada'::public.transaction_type,'Liquidacao de cartao, pedido PDV nº '||v_order.number,
    v_gross,'Recebimento parcial',v_date,v_date,TRUE,p_account_id,v_order.customer_id,'pdv',v_payment.method,
    v_context.user_id,'pdv_receivable_settlement',v_claim.request_id,v_order.cash_session_id)
  RETURNING id INTO v_settlement;
  IF v_fee>0 THEN
    INSERT INTO public.financial_categories(company_id,name,type,color,icon,dre_group,is_system,is_active)
    VALUES(v_context.company_id,v_category,'saida','#ef4444','CreditCard','opex',TRUE,TRUE)
    ON CONFLICT(company_id,name) DO NOTHING;
    INSERT INTO public.financial_transactions(company_id,transaction_type,description,amount,category,
      transaction_date,paid_date,is_paid,account_id,customer_id,origin,payment_method,created_by,
      pdv_financial_role,pdv_settlement_group_id,pdv_cash_session_id)
    VALUES(v_context.company_id,'saida'::public.transaction_type,'Taxa da liquidacao de cartao, pedido PDV nº '||v_order.number,
      v_fee,v_category,v_date,v_date,TRUE,p_account_id,v_order.customer_id,'pdv',v_payment.method,
      v_context.user_id,'pdv_card_fee',v_claim.request_id,v_order.cash_session_id)
    RETURNING id INTO v_fee_tx;
  END IF;
  UPDATE public.pdv_order_payments SET financial_account_id=p_account_id,
    settlement_transaction_id=v_settlement,settlement_status='settled',settled_at=now()
  WHERE id=v_payment.id;
  INSERT INTO public.pdv_card_settlement_details(company_id,payment_id,order_id,gross_amount,fee_amount,
    bank_account_id,settlement_transaction_id,fee_transaction_id,acquirer,nsu,installments,settled_on,
    operation_request_id,created_by)
  VALUES(v_context.company_id,v_payment.id,v_order.id,v_gross,v_fee,p_account_id,v_settlement,v_fee_tx,
    v_acquirer,v_nsu,p_installments,v_date,v_claim.request_id,v_context.user_id);
  PERFORM public.pdv_apply_settlement_fifo_v2(v_context.company_id,v_settlement);
  IF NOT EXISTS(SELECT 1 FROM public.pdv_order_payments p WHERE p.order_id=v_order.id
      AND p.contract_version=2 AND p.settlement_status IN('open','partial')) THEN
    UPDATE public.pdv_orders SET paid_at=COALESCE(paid_at,now()) WHERE id=v_order.id;
  END IF;
  v_result:=jsonb_build_object('ok',TRUE,'payment_id',v_payment.id,'order_id',v_order.id,
    'settlement_transaction_id',v_settlement,'fee_transaction_id',v_fee_tx,'gross_amount',v_gross,
    'fee_amount',v_fee,'net_amount',v_gross-v_fee,'idempotent',FALSE);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'financial_transaction',v_settlement,v_result);
  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.pdv_guard_customer_credit_limit_v3() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_can_access_cash_session_v3(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_can_read_financial_transaction_v3(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_party_account_statement_v3(text,uuid,text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_party_receivable_options_v3(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_card_settlement_context_v3() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_list_open_card_authorizations_v3() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_settle_card_authorization_v3(uuid,uuid,date,text,text,integer,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_party_account_statement_v3(text,uuid,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_party_receivable_options_v3(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_list_open_card_authorizations_v3() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_settle_card_authorization_v3(uuid,uuid,date,text,text,integer,numeric,text) TO authenticated;

COMMIT;

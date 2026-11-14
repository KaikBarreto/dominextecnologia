BEGIN;

SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';

CREATE OR REPLACE FUNCTION public.pdv_assert_cash_session_actor_v3(
  p_session_id uuid,p_cash_account_id uuid DEFAULT NULL,p_require_open boolean DEFAULT false,
  p_history_context boolean DEFAULT false
) RETURNS public.pdv_cash_sessions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_session public.pdv_cash_sessions%ROWTYPE;
BEGIN
  IF p_history_context THEN
    SELECT * INTO v_context FROM public.pdv_cash_history_context_v2();
  ELSE
    SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  END IF;
  SELECT s.* INTO v_session FROM public.pdv_cash_sessions s
   WHERE s.id=p_session_id AND s.company_id=v_context.company_id AND s.contract_version=2
     AND (p_cash_account_id IS NULL OR s.cash_account_id=p_cash_account_id)
     AND (NOT p_require_open OR s.status='aberta')
     AND (s.opened_by=v_context.user_id OR public.pdv_can_operate_other_cash_v2(v_context.user_id));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa indisponível para este operador.'
      USING ERRCODE='42501',DETAIL='PDV_CASH_SESSION_FORBIDDEN';
  END IF;
  RETURN v_session;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_assert_cash_session_actor_v3(uuid,uuid,boolean,boolean)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_completed_cash_operation_replay_v3(
  p_operation_type text,p_idempotency_key text,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  SELECT request.result INTO v_result
    FROM public.pdv_operation_requests request
   WHERE request.company_id=v_context.company_id
     AND request.operation_type=p_operation_type
     AND request.idempotency_key=p_idempotency_key
     AND request.payload_hash=public.pdv_operation_payload_hash(p_payload)
     AND request.created_by=v_context.user_id
     AND request.status='completed';
  RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_completed_cash_operation_replay_v3(text,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;

-- Writers: a verificacao acontece antes de lock, claim idempotente ou leitura
-- de detalhes. Os cores antigos ficam owner-only.
ALTER FUNCTION public.pdv_record_cash_event_v2(uuid,uuid,text,numeric,text,text,text)
  RENAME TO pdv_record_cash_event_core_018_v2;
ALTER FUNCTION public.pdv_reverse_cash_event_v2(uuid,uuid,text,text)
  RENAME TO pdv_reverse_cash_event_core_018_v2;
ALTER FUNCTION public.pdv_close_cash_session_v2(uuid,uuid,numeric,text,text)
  RENAME TO pdv_close_cash_session_core_018_v2;
ALTER FUNCTION public.pdv_reopen_cash_session_v2(uuid,uuid,text,text)
  RENAME TO pdv_reopen_cash_session_core_018_v2;
REVOKE ALL ON FUNCTION public.pdv_record_cash_event_core_018_v2(uuid,uuid,text,numeric,text,text,text),
  public.pdv_reverse_cash_event_core_018_v2(uuid,uuid,text,text),
  public.pdv_close_cash_session_core_018_v2(uuid,uuid,numeric,text,text),
  public.pdv_reopen_cash_session_core_018_v2(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

-- Implementacoes estaticas: mesmas regras financeiras/idempotentes das originais,
-- trocando somente o gate implicito de cargo pela capacidade nominal.
CREATE OR REPLACE FUNCTION public.pdv_record_cash_event_explicit_core_018_v2(
  p_session_id uuid,
  p_cash_account_id uuid,
  p_entry_kind text,
  p_amount numeric,
  p_description text,
  p_notes text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_claim record;
  v_session public.pdv_cash_sessions;
  v_snapshot jsonb;
  v_position numeric(14,2) := 0;
  v_signed_amount numeric(14,2);
  v_entry_id uuid;
  v_financial_id uuid;
  v_today date;
  v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();

  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Conta do caixa não informada.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_ACCOUNT_REQUIRED';
  END IF;
  IF p_entry_kind NOT IN (
    'cash_receipt', 'cash_payment', 'refund', 'supply', 'withdrawal'
  ) THEN
    RAISE EXCEPTION 'Tipo de evento de caixa inválido.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_EVENT_KIND_INVALID';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'Informe um valor maior que zero, com até duas casas decimais.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_EVENT_AMOUNT_INVALID';
  END IF;

  PERFORM public.pdv_lock_treasury_account(v_context.company_id, p_cash_account_id);

  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request(
      v_context.company_id,
      'cash.event.v2',
      p_idempotency_key,
      jsonb_build_object(
        'session_id', p_session_id,
        'cash_account_id', p_cash_account_id,
        'entry_kind', p_entry_kind,
        'amount', round(p_amount, 2),
        'description', NULLIF(btrim(COALESCE(p_description, '')), ''),
        'notes', NULLIF(btrim(COALESCE(p_notes, '')), '')
      )
    );

  IF v_claim.is_replay THEN
    IF v_claim.request_status = 'completed' THEN
      RETURN v_claim.stored_result;
    END IF;
    RAISE EXCEPTION 'Este evento de caixa já está sendo processado ou requer revisão.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CASH_EVENT_IN_PROGRESS';
  END IF;

  SELECT session.* INTO v_session
    FROM public.pdv_cash_sessions session
   WHERE session.id = p_session_id
     AND session.company_id = v_context.company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_CASH_SESSION_NOT_FOUND';
  END IF;
  IF v_session.contract_version IS DISTINCT FROM 2
     OR v_session.cash_account_id <> p_cash_account_id
  THEN
    RAISE EXCEPTION 'Este caixa não usa o contrato de custódia informado.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_CONTRACT_MISMATCH';
  END IF;
  IF v_session.status <> 'aberta' THEN
    RAISE EXCEPTION 'Este caixa já foi fechado e não aceita novos lançamentos.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_CLOSED';
  END IF;
  IF v_session.opened_by IS DISTINCT FROM v_context.user_id
     AND public.pdv_can_operate_other_cash_v2(v_context.user_id) IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Você não pode movimentar o caixa de outro operador.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_FORBIDDEN';
  END IF;

  v_snapshot := public.pdv_cash_snapshot_v2_internal(
    v_context.company_id, p_cash_account_id
  );
  IF COALESCE((v_snapshot->>'reconciliation_required')::boolean, true) THEN
    RAISE EXCEPTION 'A custódia precisa ser conciliada antes de registrar outro evento.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CASH_RECONCILIATION_REQUIRED';
  END IF;

  SELECT COALESCE(position.custody_amount, 0)
    INTO v_position
    FROM public.pdv_cash_custody_position(v_context.company_id, p_session_id) position;
  v_position := COALESCE(v_position, 0);

  v_signed_amount := CASE
    WHEN p_entry_kind IN ('cash_receipt', 'supply') THEN round(p_amount, 2)
    ELSE -round(p_amount, 2)
  END;

  IF v_signed_amount < 0 AND abs(v_signed_amount) > v_position THEN
    RAISE EXCEPTION 'O valor é maior que o dinheiro disponível nesta gaveta.'
      USING ERRCODE = '23514', DETAIL = 'PDV_CASH_CUSTODY_INSUFFICIENT';
  END IF;

  IF p_entry_kind = 'supply'
     AND COALESCE((v_session.cash_policy_snapshot->>'strict_tracking')::boolean, true)
     AND p_amount > (v_snapshot->>'available')::numeric
  THEN
    RAISE EXCEPTION 'O suprimento é maior que o disponível no cofre.'
      USING ERRCODE = '23514', DETAIL = 'PDV_TREASURY_AVAILABLE_INSUFFICIENT';
  END IF;

  IF p_entry_kind IN ('cash_receipt', 'cash_payment', 'refund') THEN
    IF NULLIF(btrim(COALESCE(p_description, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Descreva o evento financeiro do caixa.'
        USING ERRCODE = '22023', DETAIL = 'PDV_CASH_DESCRIPTION_REQUIRED';
    END IF;

    v_today := public.company_today(v_context.company_id);
    PERFORM set_config(
      'app.pdv_treasury_custody_delta',
      jsonb_build_object(
        'company_id', v_context.company_id,
        'account_id', p_cash_account_id,
        'request_id', v_claim.request_id,
        'delta', v_signed_amount
      )::text,
      true
    );
    INSERT INTO public.financial_transactions (
      company_id, transaction_type, description, amount,
      transaction_date, paid_date, is_paid, account_id, origin,
      created_by, notes
    ) VALUES (
      v_context.company_id,
      CASE WHEN p_entry_kind = 'cash_receipt'
        THEN 'entrada'::public.transaction_type
        ELSE 'saida'::public.transaction_type
      END,
      btrim(p_description), round(p_amount, 2), v_today, v_today, true,
      p_cash_account_id, 'pdv', v_context.user_id,
      NULLIF(btrim(COALESCE(p_notes, '')), '')
    ) RETURNING id INTO v_financial_id;
    PERFORM set_config('app.pdv_treasury_custody_delta', '', true);
  END IF;

  INSERT INTO public.pdv_cash_custody_entries (
    company_id, session_id, cash_account_id, operation_request_id,
    entry_kind, amount, source_type, source_id,
    financial_transaction_id, metadata, created_by
  ) VALUES (
    v_context.company_id, p_session_id, p_cash_account_id,
    v_claim.request_id, p_entry_kind, v_signed_amount,
    CASE
      WHEN v_financial_id IS NULL THEN 'pdv_operation_request'
      ELSE 'financial_transaction'
    END,
    COALESCE(v_financial_id, v_claim.request_id),
    v_financial_id,
    jsonb_build_object('notes', NULLIF(btrim(COALESCE(p_notes, '')), '')),
    v_context.user_id
  ) RETURNING id INTO v_entry_id;

  v_result := jsonb_build_object(
    'ok', true,
    'entry_id', v_entry_id,
    'session_id', p_session_id,
    'entry_kind', p_entry_kind,
    'amount', v_signed_amount,
    'financial_transaction_id', v_financial_id,
    'custody_after', round(v_position + v_signed_amount, 2),
    'idempotent', false
  );
  PERFORM public.pdv_complete_operation_request(
    v_claim.request_id, 'pdv_cash_custody_entry', v_entry_id, v_result
  );
  RETURN v_result;
END
$fn$;


CREATE OR REPLACE FUNCTION public.pdv_reverse_cash_event_explicit_core_018_v2(
  p_entry_id uuid,
  p_cash_account_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_claim record;
  v_entry public.pdv_cash_custody_entries%ROWTYPE;
  v_session public.pdv_cash_sessions%ROWTYPE;
  v_original public.financial_transactions%ROWTYPE;
  v_position numeric(14,2) := 0;
  v_reversal_amount numeric(14,2);
  v_reversal_transaction uuid;
  v_reversal_entry uuid;
  v_today date;
  v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Conta do caixa não informada.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_ACCOUNT_REQUIRED';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da reversão.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_REVERSAL_REASON_REQUIRED';
  END IF;

  PERFORM public.pdv_lock_treasury_account(v_context.company_id, p_cash_account_id);

  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request(
      v_context.company_id,
      'cash.reverse.v2',
      p_idempotency_key,
      jsonb_build_object(
        'entry_id', p_entry_id,
        'cash_account_id', p_cash_account_id,
        'reason', btrim(p_reason)
      )
    );
  IF v_claim.is_replay THEN
    IF v_claim.request_status = 'completed' THEN
      RETURN v_claim.stored_result;
    END IF;
    RAISE EXCEPTION 'Esta reversão já está sendo processada ou requer revisão.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CASH_REVERSAL_IN_PROGRESS';
  END IF;

  SELECT entry.* INTO v_entry
    FROM public.pdv_cash_custody_entries entry
   WHERE entry.id = p_entry_id
     AND entry.company_id = v_context.company_id
     AND entry.cash_account_id = p_cash_account_id
   FOR UPDATE;
  IF NOT FOUND OR v_entry.financial_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Evento financeiro de caixa não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_CASH_EVENT_NOT_FOUND';
  END IF;
  IF v_entry.entry_kind = 'reversal' OR EXISTS (
    SELECT 1 FROM public.pdv_cash_custody_entries reversal
     WHERE reversal.reversal_of_id = v_entry.id
  ) THEN
    RAISE EXCEPTION 'Este evento já foi revertido.'
      USING ERRCODE = '23505', DETAIL = 'PDV_CASH_EVENT_ALREADY_REVERSED';
  END IF;

  SELECT session.* INTO v_session
    FROM public.pdv_cash_sessions session
   WHERE session.id = v_entry.session_id
     AND session.company_id = v_context.company_id
   FOR UPDATE;
  IF v_session.status <> 'aberta' OR v_session.contract_version IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Eventos de caixa fechado exigem uma compensação pós-fechamento própria.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_REVERSAL_CLOSED_SESSION';
  END IF;
  IF v_session.opened_by IS DISTINCT FROM v_context.user_id
     AND public.pdv_can_operate_other_cash_v2(v_context.user_id) IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Você não pode reverter evento do caixa de outro operador.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_FORBIDDEN';
  END IF;

  SELECT transaction.* INTO v_original
    FROM public.financial_transactions transaction
   WHERE transaction.id = v_entry.financial_transaction_id
     AND transaction.company_id = v_context.company_id
     AND transaction.account_id = p_cash_account_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento financeiro original não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_CASH_FINANCIAL_NOT_FOUND';
  END IF;

  v_reversal_amount := -v_entry.amount;
  SELECT COALESCE(position.custody_amount, 0)
    INTO v_position
    FROM public.pdv_cash_custody_position(v_context.company_id, v_session.id) position;
  v_position := round(COALESCE(v_position, 0), 2);
  IF v_reversal_amount < 0 AND abs(v_reversal_amount) > v_position THEN
    RAISE EXCEPTION 'A gaveta não possui dinheiro suficiente para esta reversão.'
      USING ERRCODE = '23514', DETAIL = 'PDV_CASH_REVERSAL_INSUFFICIENT_CUSTODY';
  END IF;

  v_today := public.company_today(v_context.company_id);
  PERFORM set_config(
    'app.pdv_treasury_custody_delta',
    jsonb_build_object(
      'company_id', v_context.company_id,
      'account_id', p_cash_account_id,
      'request_id', v_claim.request_id,
      'delta', v_reversal_amount
    )::text,
    true
  );
  INSERT INTO public.financial_transactions (
    company_id, transaction_type, description, amount, category,
    transaction_date, paid_date, is_paid, account_id, origin,
    created_by, notes
  ) VALUES (
    v_context.company_id,
    CASE WHEN v_original.transaction_type::text = 'entrada'
      THEN 'saida'::public.transaction_type
      ELSE 'entrada'::public.transaction_type
    END,
    'Reversão: ' || v_original.description,
    v_original.amount,
    v_original.category,
    v_today, v_today, true, p_cash_account_id, 'pdv', v_context.user_id,
    btrim(p_reason) || ' | Lançamento original: ' || v_original.id::text
  ) RETURNING id INTO v_reversal_transaction;
  PERFORM set_config('app.pdv_treasury_custody_delta', '', true);

  INSERT INTO public.pdv_cash_custody_entries (
    company_id, session_id, cash_account_id, operation_request_id,
    entry_kind, amount, source_type, source_id,
    financial_transaction_id, reversal_of_id, metadata, created_by
  ) VALUES (
    v_context.company_id, v_session.id, p_cash_account_id,
    v_claim.request_id, 'reversal', v_reversal_amount,
    'financial_transaction', v_reversal_transaction,
    v_reversal_transaction, v_entry.id,
    jsonb_build_object(
      'reason', btrim(p_reason),
      'original_financial_transaction_id', v_original.id
    ),
    v_context.user_id
  ) RETURNING id INTO v_reversal_entry;

  v_result := jsonb_build_object(
    'ok', true,
    'entry_id', v_reversal_entry,
    'reversal_of_entry_id', v_entry.id,
    'financial_transaction_id', v_reversal_transaction,
    'amount', v_reversal_amount,
    'idempotent', false
  );
  PERFORM public.pdv_complete_operation_request(
    v_claim.request_id, 'pdv_cash_custody_entry', v_reversal_entry, v_result
  );
  RETURN v_result;
END
$fn$;


CREATE OR REPLACE FUNCTION public.pdv_close_cash_session_explicit_core_018_v2(
  p_session_id uuid,
  p_cash_account_id uuid,
  p_counted_amount numeric,
  p_notes text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_claim record;
  v_session public.pdv_cash_sessions;
  v_expected numeric(14,2) := 0;
  v_difference numeric(14,2);
  v_adjustment_id uuid;
  v_adjustment_kind text;
  v_today date;
  v_final numeric(14,2);
  v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();

  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Conta do caixa não informada.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_ACCOUNT_REQUIRED';
  END IF;
  IF p_counted_amount IS NULL OR p_counted_amount < 0
     OR p_counted_amount <> round(p_counted_amount, 2)
  THEN
    RAISE EXCEPTION 'Informe o valor contado, com até duas casas decimais.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_COUNTED_AMOUNT_INVALID';
  END IF;

  PERFORM public.pdv_lock_treasury_account(v_context.company_id, p_cash_account_id);

  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request(
      v_context.company_id,
      'cash.close.v2',
      p_idempotency_key,
      jsonb_build_object(
        'session_id', p_session_id,
        'cash_account_id', p_cash_account_id,
        'counted_amount', round(p_counted_amount, 2),
        'notes', NULLIF(btrim(COALESCE(p_notes, '')), '')
      )
    );

  IF v_claim.is_replay THEN
    IF v_claim.request_status = 'completed' THEN
      RETURN v_claim.stored_result;
    END IF;
    RAISE EXCEPTION 'Este fechamento já está sendo processado ou requer revisão.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CASH_CLOSE_IN_PROGRESS';
  END IF;

  SELECT session.* INTO v_session
    FROM public.pdv_cash_sessions session
   WHERE session.id = p_session_id
     AND session.company_id = v_context.company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_CASH_SESSION_NOT_FOUND';
  END IF;
  IF v_session.contract_version IS DISTINCT FROM 2
     OR v_session.cash_account_id <> p_cash_account_id
  THEN
    RAISE EXCEPTION 'Este caixa não usa o contrato de custódia informado.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_CONTRACT_MISMATCH';
  END IF;
  IF v_session.status <> 'aberta' THEN
    RAISE EXCEPTION 'Este caixa já foi fechado.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_CLOSED';
  END IF;
  IF v_session.opened_by IS DISTINCT FROM v_context.user_id
     AND public.pdv_can_operate_other_cash_v2(v_context.user_id) IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Você não pode fechar o caixa de outro operador.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_FORBIDDEN';
  END IF;

  SELECT COALESCE(position.custody_amount, 0)
    INTO v_expected
    FROM public.pdv_cash_custody_position(v_context.company_id, p_session_id) position;
  v_expected := round(COALESCE(v_expected, 0), 2);
  IF v_expected < 0 THEN
    RAISE EXCEPTION 'A custódia deste caixa está inconsistente e precisa ser conciliada.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CASH_RECONCILIATION_REQUIRED';
  END IF;

  v_difference := round(p_counted_amount - v_expected, 2);
  v_today := public.company_today(v_context.company_id);

  IF v_difference <> 0 THEN
    INSERT INTO public.financial_categories (
      company_id, name, type, dre_group, icon, color
    ) VALUES (
      v_context.company_id, 'Quebra de caixa', 'ambos', 'opex', 'Scale', '#f59e0b'
    ) ON CONFLICT (company_id, name) DO NOTHING;

    PERFORM set_config(
      'app.pdv_treasury_custody_delta',
      jsonb_build_object(
        'company_id', v_context.company_id,
        'account_id', p_cash_account_id,
        'request_id', v_claim.request_id,
        'delta', v_difference
      )::text,
      true
    );
    INSERT INTO public.financial_transactions (
      company_id, transaction_type, description, amount, category,
      transaction_date, paid_date, is_paid, account_id, origin,
      created_by, notes
    ) VALUES (
      v_context.company_id,
      CASE WHEN v_difference > 0
        THEN 'entrada'::public.transaction_type
        ELSE 'saida'::public.transaction_type
      END,
      CASE WHEN v_difference > 0
        THEN 'Sobra de caixa no fechamento'
        ELSE 'Falta de caixa no fechamento'
      END,
      abs(v_difference), 'Quebra de caixa', v_today, v_today, true,
      p_cash_account_id, 'pdv', v_context.user_id,
      'Esperado ' || public.pdv_fmt_brl(v_expected)
        || ', contado ' || public.pdv_fmt_brl(p_counted_amount)
        || COALESCE('. ' || NULLIF(btrim(COALESCE(p_notes, '')), ''), '')
    ) RETURNING id INTO v_adjustment_id;
    PERFORM set_config('app.pdv_treasury_custody_delta', '', true);
  END IF;

  -- O valor contado retorna fisicamente ao cofre, mas nao cria transacao:
  -- continua dentro da mesma conta financeira da empresa.
  IF p_counted_amount > 0 THEN
    INSERT INTO public.pdv_cash_custody_entries (
      company_id, session_id, cash_account_id, operation_request_id,
      entry_kind, amount, source_type, source_id, metadata, created_by
    ) VALUES (
      v_context.company_id, p_session_id, p_cash_account_id,
      v_claim.request_id, 'closing_return', -round(p_counted_amount, 2),
      'pdv_cash_session', p_session_id,
      jsonb_build_object('notes', NULLIF(btrim(COALESCE(p_notes, '')), '')),
      v_context.user_id
    );
  END IF;

  IF v_difference < 0 THEN
    v_adjustment_kind := 'shortage';
  ELSIF v_difference > 0 THEN
    v_adjustment_kind := 'surplus';
  END IF;

  IF v_adjustment_kind IS NOT NULL THEN
    INSERT INTO public.pdv_cash_custody_entries (
      company_id, session_id, cash_account_id, operation_request_id,
      entry_kind, amount, source_type, source_id,
      financial_transaction_id, created_by
    ) VALUES (
      v_context.company_id, p_session_id, p_cash_account_id,
      v_claim.request_id, v_adjustment_kind, v_difference,
      'financial_transaction', v_adjustment_id, v_adjustment_id,
      v_context.user_id
    );
  END IF;

  SELECT COALESCE(position.custody_amount, 0)
    INTO v_final
    FROM public.pdv_cash_custody_position(v_context.company_id, p_session_id) position;
  v_final := round(COALESCE(v_final, 0), 2);
  IF v_final <> 0 THEN
    RAISE EXCEPTION 'O fechamento não zerou a custódia da gaveta.'
      USING ERRCODE = '23514', DETAIL = 'PDV_CASH_CLOSE_NOT_BALANCED';
  END IF;

  UPDATE public.pdv_cash_sessions
     SET status = 'fechada',
         closed_by = v_context.user_id,
         closed_at = now(),
         counted_amount = round(p_counted_amount, 2),
         expected_amount = v_expected,
         difference = v_difference,
         notes = COALESCE(NULLIF(btrim(COALESCE(p_notes, '')), ''), notes)
   WHERE id = p_session_id
  RETURNING * INTO v_session;

  v_result := jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'expected_amount', v_expected,
    'counted_amount', round(p_counted_amount, 2),
    'difference', v_difference,
    'closing_return', round(p_counted_amount, 2),
    'adjustment_kind', v_adjustment_kind,
    'adjustment_transaction_id', v_adjustment_id,
    'closed_at', v_session.closed_at,
    'idempotent', false
  );
  PERFORM public.pdv_complete_operation_request(
    v_claim.request_id, 'pdv_cash_session', v_session.id, v_result
  );
  RETURN v_result;
END
$fn$;


CREATE OR REPLACE FUNCTION public.pdv_reopen_cash_session_explicit_core_018_v2(
  p_source_session_id uuid,
  p_cash_account_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_claim record;
  v_source public.pdv_cash_sessions%ROWTYPE;
  v_continuation public.pdv_cash_sessions%ROWTYPE;
  v_settings record;
  v_terminal record;
  v_snapshot jsonb;
  v_result jsonb;
  v_opening numeric(14,2);
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_history_context_v2();

  IF NOT public.is_super_admin(v_context.user_id)
     AND public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:reopen_pdv_cash') IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Voce nao tem permissao para reabrir caixas.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_REOPEN_FORBIDDEN';
  END IF;
  IF p_source_session_id IS NULL OR p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Informe o caixa que deseja reabrir.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_SESSION_REQUIRED';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Informe um motivo entre 3 e 500 caracteres.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_REOPEN_REASON_INVALID';
  END IF;

  PERFORM public.pdv_lock_treasury_account(v_context.company_id, p_cash_account_id);

  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request(
      v_context.company_id,
      'cash.reopen.v2',
      p_idempotency_key,
      jsonb_build_object(
        'source_session_id', p_source_session_id,
        'cash_account_id', p_cash_account_id,
        'reason', btrim(p_reason)
      )
    );
  IF v_claim.is_replay THEN
    IF v_claim.request_status = 'completed' THEN
      RETURN v_claim.stored_result;
    END IF;
    RAISE EXCEPTION 'Esta reabertura ja esta sendo processada ou requer revisao.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CASH_REOPEN_IN_PROGRESS';
  END IF;

  SELECT session.* INTO v_source
    FROM public.pdv_cash_sessions session
   WHERE session.id = p_source_session_id
     AND session.company_id = v_context.company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa fechado nao encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_CASH_SESSION_NOT_FOUND';
  END IF;
  IF v_source.contract_version IS DISTINCT FROM 2
     OR v_source.cash_account_id IS DISTINCT FROM p_cash_account_id THEN
    RAISE EXCEPTION 'Este caixa nao usa o contrato de custodia informado.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_CONTRACT_MISMATCH';
  END IF;
  IF v_source.status <> 'fechada' OR v_source.closed_at IS NULL OR v_source.counted_amount IS NULL THEN
    RAISE EXCEPTION 'Somente um caixa fechado pode ser reaberto.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_REOPEN_SOURCE_NOT_CLOSED';
  END IF;
  IF v_source.opened_by IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles profile
     WHERE profile.user_id = v_source.opened_by
       AND profile.company_id = v_context.company_id
       AND COALESCE(profile.is_active, true)
  ) THEN
    RAISE EXCEPTION 'O operador original nao esta ativo para continuar este caixa.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_REOPEN_OPERATOR_INACTIVE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pdv_cash_sessions continuation
     WHERE continuation.company_id = v_context.company_id
       AND continuation.reopened_from_session_id = v_source.id
  ) THEN
    RAISE EXCEPTION 'Este caixa ja foi reaberto.'
      USING ERRCODE = '23505', DETAIL = 'PDV_CASH_ALREADY_REOPENED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pdv_cash_sessions newer
     WHERE newer.company_id = v_context.company_id
       AND newer.id <> v_source.id
       AND newer.opened_at > v_source.closed_at
       AND (newer.terminal_id = v_source.terminal_id OR newer.opened_by = v_source.opened_by)
  ) THEN
    RAISE EXCEPTION 'Existe um caixa mais recente neste terminal ou para este operador.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_REOPEN_NOT_LATEST';
  END IF;

  SELECT terminal.id, terminal.name, terminal.is_active, terminal.stock_id
    INTO v_terminal
    FROM public.pdv_terminals terminal
   WHERE terminal.id = v_source.terminal_id
     AND terminal.company_id = v_context.company_id;
  IF NOT FOUND OR NOT v_terminal.is_active THEN
    RAISE EXCEPTION 'O terminal deste caixa esta desativado.'
      USING ERRCODE = '42501', DETAIL = 'PDV_TERMINAL_INACTIVE';
  END IF;
  IF v_terminal.stock_id IS NOT NULL
     AND public.pdv_has_stock_access_scope_v2(
       v_source.opened_by, v_context.company_id, p_stock_id => v_terminal.stock_id
     ) IS DISTINCT FROM TRUE
  THEN
    RAISE EXCEPTION 'O operador original nao tem mais acesso ao estoque deste terminal.'
      USING ERRCODE = '42501', DETAIL = 'PDV_TERMINAL_STOCK_FORBIDDEN';
  END IF;

  SELECT settings.pdv_cash_account_id,
         COALESCE(settings.pdv_strict_cash_tracking, true) AS strict_tracking,
         COALESCE(NULLIF(btrim(settings.pdv_mode), ''), 'simples') AS pdv_mode,
         account.name AS account_name,
         account.type AS account_type,
         account.is_active AS account_active
    INTO v_settings
    FROM public.company_settings settings
    JOIN public.financial_accounts account
      ON account.id = settings.pdv_cash_account_id
     AND account.company_id = settings.company_id
   WHERE settings.company_id = v_context.company_id;

  IF NOT FOUND OR v_settings.pdv_cash_account_id IS DISTINCT FROM p_cash_account_id
     OR v_settings.account_type <> 'caixa' OR NOT v_settings.account_active THEN
    RAISE EXCEPTION 'A conta original nao e mais o cofre ativo configurado.'
      USING ERRCODE = '42501', DETAIL = 'PDV_TREASURY_ACCOUNT_MISMATCH';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pdv_cash_sessions session
     WHERE session.company_id = v_context.company_id
       AND session.terminal_id = v_source.terminal_id
       AND session.status = 'aberta'
  ) THEN
    RAISE EXCEPTION 'Este terminal ja possui um caixa aberto.'
      USING ERRCODE = '23505', DETAIL = 'PDV_TERMINAL_SESSION_ALREADY_OPEN';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pdv_cash_sessions session
     WHERE session.company_id = v_context.company_id
       AND session.opened_by = v_source.opened_by
       AND session.status = 'aberta'
       AND session.contract_version = 2
  ) THEN
    RAISE EXCEPTION 'O operador original ja possui um caixa aberto.'
      USING ERRCODE = '23505', DETAIL = 'PDV_OPERATOR_SESSION_ALREADY_OPEN';
  END IF;

  v_opening := round(v_source.counted_amount, 2);
  v_snapshot := public.pdv_cash_snapshot_v2_internal(v_context.company_id, p_cash_account_id);
  IF COALESCE((v_snapshot->>'reconciliation_required')::boolean, true) THEN
    RAISE EXCEPTION 'A custodia precisa ser conciliada antes de reabrir o caixa.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CASH_RECONCILIATION_REQUIRED';
  END IF;
  IF v_settings.strict_tracking AND v_opening > (v_snapshot->>'available')::numeric THEN
    RAISE EXCEPTION 'O cofre nao possui o valor contado para reabrir este caixa.'
      USING ERRCODE = '23514', DETAIL = 'PDV_TREASURY_AVAILABLE_INSUFFICIENT';
  END IF;

  INSERT INTO public.pdv_cash_sessions (
    company_id, terminal_id, opened_by, opening_amount, status,
    cash_account_id, cash_account_name_snapshot, cash_policy_snapshot,
    contract_version, reopened_from_session_id, reopened_at, reopened_by,
    reopen_reason
  ) VALUES (
    v_context.company_id, v_source.terminal_id, v_source.opened_by,
    v_opening, 'aberta', p_cash_account_id, v_settings.account_name,
    jsonb_build_object('strict_tracking', v_settings.strict_tracking, 'pdv_mode', v_settings.pdv_mode),
    2, v_source.id, now(), v_context.user_id, btrim(p_reason)
  ) RETURNING * INTO v_continuation;

  INSERT INTO public.pdv_cash_custody_entries (
    company_id, session_id, cash_account_id, operation_request_id,
    entry_kind, amount, source_type, source_id, metadata, created_by
  ) VALUES (
    v_context.company_id, v_continuation.id, p_cash_account_id,
    v_claim.request_id, 'opening', v_opening,
    'pdv_cash_session', v_continuation.id,
    jsonb_build_object('reopened_from_session_id', v_source.id, 'reason', btrim(p_reason)),
    v_context.user_id
  );

  v_result := jsonb_build_object(
    'ok', true,
    'source_session_id', v_source.id,
    'session_id', v_continuation.id,
    'terminal_id', v_continuation.terminal_id,
    'operator_id', v_continuation.opened_by,
    'opening_amount', v_opening,
    'opened_at', v_continuation.opened_at,
    'idempotent', false
  );
  PERFORM public.pdv_complete_operation_request(
    v_claim.request_id, 'pdv_cash_session', v_continuation.id, v_result
  );
  RETURN v_result;
END
$fn$;


REVOKE ALL ON FUNCTION public.pdv_record_cash_event_explicit_core_018_v2(uuid,uuid,text,numeric,text,text,text),
  public.pdv_reverse_cash_event_explicit_core_018_v2(uuid,uuid,text,text),
  public.pdv_close_cash_session_explicit_core_018_v2(uuid,uuid,numeric,text,text),
  public.pdv_reopen_cash_session_explicit_core_018_v2(uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.pdv_record_cash_event_v2(p_session_id uuid,p_cash_account_id uuid,
  p_entry_kind text,p_amount numeric,p_description text,p_notes text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_replay jsonb;
BEGIN
  PERFORM public.pdv_assert_cash_session_actor_v3(p_session_id,p_cash_account_id,false);
  v_replay:=public.pdv_completed_cash_operation_replay_v3('cash.event.v2',p_idempotency_key,
    jsonb_build_object('session_id',p_session_id,'cash_account_id',p_cash_account_id,
      'entry_kind',p_entry_kind,'amount',round(p_amount,2),
      'description',NULLIF(btrim(COALESCE(p_description,'')),''),
      'notes',NULLIF(btrim(COALESCE(p_notes,'')),'')));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM public.pdv_assert_cash_session_actor_v3(p_session_id,p_cash_account_id,true);
  RETURN public.pdv_record_cash_event_explicit_core_018_v2(p_session_id,p_cash_account_id,p_entry_kind,
    p_amount,p_description,p_notes,p_idempotency_key);
END $fn$;

CREATE FUNCTION public.pdv_reverse_cash_event_v2(p_entry_id uuid,p_cash_account_id uuid,
  p_reason text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_session_id uuid; v_session_status text; v_replay jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  SELECT e.session_id,s.status INTO v_session_id,v_session_status FROM public.pdv_cash_custody_entries e
   JOIN public.pdv_cash_sessions s ON s.id=e.session_id AND s.company_id=e.company_id
   WHERE e.id=p_entry_id AND e.company_id=v_context.company_id
     AND e.cash_account_id=p_cash_account_id AND s.contract_version=2
     AND (s.opened_by=v_context.user_id OR public.pdv_can_operate_other_cash_v2(v_context.user_id));
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Evento indisponível para este operador.'
      USING ERRCODE='42501',DETAIL='PDV_CASH_SESSION_FORBIDDEN';
  END IF;
  v_replay:=public.pdv_completed_cash_operation_replay_v3('cash.reverse.v2',p_idempotency_key,
    jsonb_build_object('entry_id',p_entry_id,'cash_account_id',p_cash_account_id,
      'reason',btrim(p_reason)));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF v_session_status<>'aberta' THEN
    RAISE EXCEPTION 'Este caixa já foi fechado e não aceita novos lançamentos.'
      USING ERRCODE='42501',DETAIL='PDV_CASH_SESSION_CLOSED';
  END IF;
  RETURN public.pdv_reverse_cash_event_explicit_core_018_v2(p_entry_id,p_cash_account_id,p_reason,p_idempotency_key);
END $fn$;

CREATE FUNCTION public.pdv_close_cash_session_v2(p_session_id uuid,p_cash_account_id uuid,
  p_counted_amount numeric,p_notes text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_replay jsonb;
BEGIN
  PERFORM public.pdv_assert_cash_session_actor_v3(p_session_id,p_cash_account_id,false);
  v_replay:=public.pdv_completed_cash_operation_replay_v3('cash.close.v2',p_idempotency_key,
    jsonb_build_object('session_id',p_session_id,'cash_account_id',p_cash_account_id,
      'counted_amount',round(p_counted_amount,2),
      'notes',NULLIF(btrim(COALESCE(p_notes,'')),'')));
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM public.pdv_assert_cash_session_actor_v3(p_session_id,p_cash_account_id,true);
  RETURN public.pdv_close_cash_session_explicit_core_018_v2(p_session_id,p_cash_account_id,p_counted_amount,
    p_notes,p_idempotency_key);
END $fn$;

CREATE FUNCTION public.pdv_reopen_cash_session_v2(p_source_session_id uuid,p_cash_account_id uuid,
  p_reason text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF NOT public.is_super_admin(v_uid)
     AND public.pdv_has_explicit_action_permission_v2(v_uid,'fn:reopen_pdv_cash') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para reabrir caixas.'
      USING ERRCODE='42501',DETAIL='PDV_CASH_REOPEN_FORBIDDEN';
  END IF;
  PERFORM public.pdv_assert_cash_session_actor_v3(p_source_session_id,p_cash_account_id,false,true);
  RETURN public.pdv_reopen_cash_session_explicit_core_018_v2(p_source_session_id,p_cash_account_id,
    p_reason,p_idempotency_key);
END $fn$;

REVOKE ALL ON FUNCTION public.pdv_record_cash_event_v2(uuid,uuid,text,numeric,text,text,text),
  public.pdv_reverse_cash_event_v2(uuid,uuid,text,text),
  public.pdv_close_cash_session_v2(uuid,uuid,numeric,text,text),
  public.pdv_reopen_cash_session_v2(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_record_cash_event_v2(uuid,uuid,text,numeric,text,text,text),
  public.pdv_reverse_cash_event_v2(uuid,uuid,text,text),
  public.pdv_close_cash_session_v2(uuid,uuid,numeric,text,text),
  public.pdv_reopen_cash_session_v2(uuid,uuid,text,text) TO authenticated,service_role;

-- Leituras: substituem wrappers 015 e nao dependem dos gates legados de
-- cargos amplos ou permissoes genericas de edicao.
ALTER FUNCTION public.pdv_list_cash_sessions_v2(text,uuid,uuid,integer,integer)
  RENAME TO pdv_list_cash_sessions_wrapper_015_v2;
ALTER FUNCTION public.pdv_cash_session_detail_v2(uuid)
  RENAME TO pdv_cash_session_detail_wrapper_015_v2;
ALTER FUNCTION public.pdv_cash_history_v2(uuid,uuid,integer,integer)
  RENAME TO pdv_cash_history_wrapper_015_v2;
ALTER FUNCTION public.pdv_cash_session_report_v2(uuid)
  RENAME TO pdv_cash_session_report_wrapper_015_v2;
REVOKE ALL ON FUNCTION public.pdv_list_cash_sessions_wrapper_015_v2(text,uuid,uuid,integer,integer),
  public.pdv_cash_session_detail_wrapper_015_v2(uuid),
  public.pdv_cash_history_wrapper_015_v2(uuid,uuid,integer,integer),
  public.pdv_cash_session_report_wrapper_015_v2(uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_cash_session_projection_v3(p_session_id uuid,p_report boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_session public.pdv_cash_sessions%ROWTYPE; v_terminal text; v_operator text; v_closed_by text;
  v_position numeric:=0; v_opening numeric:=0; v_receipts numeric:=0; v_payments numeric:=0;
  v_supplies numeric:=0; v_withdrawals numeric:=0; v_refunds numeric:=0; v_entries jsonb:='[]'::jsonb;
BEGIN
  v_session:=public.pdv_assert_cash_session_actor_v3(p_session_id,NULL,false,p_report);
  IF p_report AND v_session.status<>'fechada' THEN
    RAISE EXCEPTION 'Caixa fechado não encontrado.' USING ERRCODE='P0002',DETAIL='PDV_CASH_SESSION_NOT_FOUND';
  END IF;
  SELECT t.name,COALESCE(NULLIF(btrim(o.full_name),''),NULLIF(btrim(o.email),''),'Operador'),
    COALESCE(NULLIF(btrim(c.full_name),''),NULLIF(btrim(c.email),''),'Operador')
    INTO v_terminal,v_operator,v_closed_by
    FROM public.pdv_terminals t
    LEFT JOIN public.profiles o ON o.user_id=v_session.opened_by AND o.company_id=v_session.company_id
    LEFT JOIN public.profiles c ON c.user_id=v_session.closed_by AND c.company_id=v_session.company_id
    WHERE t.id=v_session.terminal_id AND t.company_id=v_session.company_id;
  SELECT round(COALESCE(sum(e.amount),0),2),
    round(COALESCE(sum(e.amount) FILTER(WHERE e.entry_kind='opening'),0),2),
    round(COALESCE(sum(e.amount) FILTER(WHERE e.entry_kind='cash_receipt'),0),2),
    round(abs(COALESCE(sum(e.amount) FILTER(WHERE e.entry_kind='cash_payment'),0)),2),
    round(COALESCE(sum(e.amount) FILTER(WHERE e.entry_kind='supply'),0),2),
    round(abs(COALESCE(sum(e.amount) FILTER(WHERE e.entry_kind='withdrawal'),0)),2),
    round(abs(COALESCE(sum(e.amount) FILTER(WHERE e.entry_kind='refund'),0)),2)
    INTO v_position,v_opening,v_receipts,v_payments,v_supplies,v_withdrawals,v_refunds
    FROM public.pdv_cash_custody_entries e WHERE e.company_id=v_session.company_id
      AND e.session_id=v_session.id AND e.cash_account_id=v_session.cash_account_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.entry_kind,
    'amount',round(e.amount,2),'created_at',e.created_at,'created_by',e.created_by,
    'source_type',e.source_type,'source_id',e.source_id,'reversal_of_id',e.reversal_of_id,
    'description',f.description,'notes',COALESCE(NULLIF(f.notes,''),NULLIF(e.metadata->>'notes','')),
    'payment_method',f.payment_method,'transaction_type',f.transaction_type,'order_id',p.order_id,
    'financial_transaction_id',e.financial_transaction_id)
    ORDER BY CASE WHEN p_report THEN NULL ELSE e.created_at END DESC,e.created_at,e.id),'[]'::jsonb)
    INTO v_entries FROM public.pdv_cash_custody_entries e
    LEFT JOIN public.financial_transactions f ON f.id=e.financial_transaction_id AND f.company_id=e.company_id
    LEFT JOIN LATERAL(
      SELECT payment.order_id
      FROM public.pdv_order_payments payment
      WHERE payment.company_id=e.company_id
        AND (payment.settlement_transaction_id=e.financial_transaction_id
          OR payment.financial_transaction_id=e.financial_transaction_id)
      ORDER BY CASE WHEN payment.settlement_transaction_id=e.financial_transaction_id THEN 0 ELSE 1 END,
        payment.received_at,payment.id
      LIMIT 1
    ) p ON true
    WHERE e.company_id=v_session.company_id AND e.session_id=v_session.id
      AND e.cash_account_id=v_session.cash_account_id;
  IF NOT p_report THEN
    RETURN jsonb_build_object('session_id',v_session.id,'position',v_position,'opening_amount',v_opening,
      'cash_receipts',v_receipts,'cash_payments',v_payments,'supplies',v_supplies,
      'withdrawals',v_withdrawals,'refunds',v_refunds,'entries',v_entries);
  END IF;
  RETURN jsonb_build_object('session_id',v_session.id,'terminal_name',v_terminal,
    'operator_name',v_operator,'closed_by_name',v_closed_by,'opened_at',v_session.opened_at,
    'closed_at',v_session.closed_at,'cash_account_name',v_session.cash_account_name_snapshot,
    'opening_amount',v_opening,'expected_amount',v_session.expected_amount,
    'counted_amount',v_session.counted_amount,'difference',v_session.difference,
    'cash_receipts',v_receipts,'cash_payments',v_payments,'supplies',v_supplies,
    'withdrawals',v_withdrawals,'refunds',v_refunds,'final_position',v_position,
    'notes',v_session.notes,'entries',v_entries);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_cash_session_projection_v3(uuid,boolean)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.pdv_cash_session_detail_v2(p_session_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT public.pdv_cash_session_projection_v3(p_session_id,false);
$fn$;
CREATE FUNCTION public.pdv_cash_session_report_v2(p_session_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT public.pdv_cash_session_projection_v3(p_session_id,true);
$fn$;

CREATE FUNCTION public.pdv_list_cash_sessions_v2(p_status text,p_terminal_id uuid DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,p_page integer DEFAULT 0,p_page_size integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_can_other boolean; v_rows jsonb:='[]'::jsonb; v_has_more boolean:=false;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  v_can_other:=public.pdv_can_operate_other_cash_v2(v_context.user_id);
  p_status:=lower(btrim(COALESCE(p_status,'')));
  IF p_status NOT IN('aberta','fechada') OR p_page IS NULL OR p_page<0
     OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Filtros de caixa inválidos.' USING ERRCODE='22023',DETAIL='PDV_CASH_LIST_FILTER_INVALID';
  END IF;
  IF NOT v_can_other THEN
    IF p_operator_id IS NOT NULL AND p_operator_id IS DISTINCT FROM v_context.user_id THEN
      RAISE EXCEPTION 'Você não pode consultar outro operador.' USING ERRCODE='42501',DETAIL='PDV_CASH_SESSION_FORBIDDEN';
    END IF;
    p_operator_id:=v_context.user_id;
  END IF;
  WITH authorized AS(
    SELECT s.*,t.name terminal_name,
      COALESCE(NULLIF(btrim(p.full_name),''),NULLIF(btrim(p.email),''),'Operador') operator_name,
      row_number() OVER(ORDER BY CASE WHEN p_status='aberta' THEN s.opened_at END,
        CASE WHEN p_status='fechada' THEN s.closed_at END DESC,s.id) ordinal
    FROM public.pdv_cash_sessions s JOIN public.pdv_terminals t ON t.id=s.terminal_id AND t.company_id=s.company_id
    LEFT JOIN public.profiles p ON p.user_id=s.opened_by AND p.company_id=s.company_id
    WHERE s.company_id=v_context.company_id AND s.contract_version=2 AND s.status=p_status
      AND (v_can_other OR s.opened_by=v_context.user_id)
      AND (p_terminal_id IS NULL OR s.terminal_id=p_terminal_id)
      AND (p_operator_id IS NULL OR s.opened_by=p_operator_id)
  ),paged AS(SELECT * FROM authorized WHERE ordinal>p_page*p_page_size
    AND ordinal<=p_page*p_page_size+p_page_size+1)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',x.id,'company_id',x.company_id,
    'terminal_id',x.terminal_id,'terminal_name',x.terminal_name,'opened_by',x.opened_by,
    'operator_name',x.operator_name,'opened_at',x.opened_at,'opening_amount',round(x.opening_amount,2),
    'cash_account_id',x.cash_account_id,'cash_account_name_snapshot',x.cash_account_name_snapshot,
    'contract_version',x.contract_version,'status',x.status,'closed_at',x.closed_at,
    'counted_amount',x.counted_amount,'expected_amount',x.expected_amount,'difference',x.difference,
    'notes',x.notes) ORDER BY x.ordinal) FILTER(WHERE x.ordinal<=p_page*p_page_size+p_page_size),'[]'::jsonb),
    count(*)>p_page_size INTO v_rows,v_has_more FROM paged x;
  RETURN jsonb_build_object('rows',v_rows,'has_more',v_has_more,'can_manage_others',v_can_other);
END $fn$;

CREATE FUNCTION public.pdv_cash_history_v2(p_terminal_id uuid DEFAULT NULL,p_operator_id uuid DEFAULT NULL,
  p_page integer DEFAULT 0,p_page_size integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_can_other boolean; v_terminals jsonb:='[]'::jsonb;
  v_rows jsonb:='[]'::jsonb; v_has_more boolean:=false;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_history_context_v2();
  v_can_other:=public.pdv_can_operate_other_cash_v2(v_context.user_id);
  IF p_page IS NULL OR p_page<0 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Paginação inválida.' USING ERRCODE='22023',DETAIL='PDV_CASH_LIST_PAGE_INVALID';
  END IF;
  IF NOT v_can_other THEN
    IF p_operator_id IS NOT NULL AND p_operator_id IS DISTINCT FROM v_context.user_id THEN
      RAISE EXCEPTION 'Você não pode consultar outro operador.' USING ERRCODE='42501',DETAIL='PDV_CASH_SESSION_FORBIDDEN';
    END IF;
    p_operator_id:=v_context.user_id;
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name)
    ORDER BY t.sort_order,t.name,t.id),'[]'::jsonb) INTO v_terminals
    FROM public.pdv_terminals t WHERE t.company_id=v_context.company_id
      AND (v_can_other OR EXISTS(
        SELECT 1 FROM public.pdv_cash_sessions own_session
        WHERE own_session.company_id=t.company_id AND own_session.terminal_id=t.id
          AND own_session.contract_version=2 AND own_session.opened_by=v_context.user_id
      ));
  WITH authorized AS(
    SELECT s.*,t.name terminal_name,
      COALESCE(NULLIF(btrim(p.full_name),''),NULLIF(btrim(p.email),''),'Operador') operator_name,
      EXISTS(SELECT 1 FROM public.pdv_cash_sessions n WHERE n.company_id=s.company_id
        AND n.reopened_from_session_id=s.id) was_reopened,
      row_number() OVER(ORDER BY s.closed_at DESC,s.id) ordinal
    FROM public.pdv_cash_sessions s JOIN public.pdv_terminals t ON t.id=s.terminal_id AND t.company_id=s.company_id
    LEFT JOIN public.profiles p ON p.user_id=s.opened_by AND p.company_id=s.company_id
    WHERE s.company_id=v_context.company_id AND s.contract_version=2 AND s.status='fechada'
      AND (v_can_other OR s.opened_by=v_context.user_id)
      AND (p_terminal_id IS NULL OR s.terminal_id=p_terminal_id)
      AND (p_operator_id IS NULL OR s.opened_by=p_operator_id)
  ),paged AS(SELECT * FROM authorized WHERE ordinal>p_page*p_page_size
    AND ordinal<=p_page*p_page_size+p_page_size+1)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',x.id,'company_id',x.company_id,
    'terminal_id',x.terminal_id,'terminal_name',x.terminal_name,'opened_by',x.opened_by,
    'operator_name',x.operator_name,'opened_at',x.opened_at,'opening_amount',round(x.opening_amount,2),
    'cash_account_id',x.cash_account_id,'cash_account_name_snapshot',x.cash_account_name_snapshot,
    'contract_version',x.contract_version,'status',x.status,'closed_at',x.closed_at,
    'counted_amount',x.counted_amount,'expected_amount',x.expected_amount,'difference',x.difference,
    'notes',x.notes,'was_reopened',x.was_reopened) ORDER BY x.ordinal)
    FILTER(WHERE x.ordinal<=p_page*p_page_size+p_page_size),'[]'::jsonb),count(*)>p_page_size
    INTO v_rows,v_has_more FROM paged x;
  RETURN jsonb_build_object('terminals',v_terminals,'rows',v_rows,'has_more',v_has_more,
    'can_manage_others',v_can_other);
END $fn$;

REVOKE ALL ON FUNCTION public.pdv_list_cash_sessions_v2(text,uuid,uuid,integer,integer),
  public.pdv_cash_session_detail_v2(uuid),public.pdv_cash_history_v2(uuid,uuid,integer,integer),
  public.pdv_cash_session_report_v2(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_list_cash_sessions_v2(text,uuid,uuid,integer,integer),
  public.pdv_cash_session_detail_v2(uuid),public.pdv_cash_history_v2(uuid,uuid,integer,integer),
  public.pdv_cash_session_report_v2(uuid) TO authenticated,service_role;

COMMIT;

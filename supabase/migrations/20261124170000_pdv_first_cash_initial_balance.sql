-- Primeira abertura: saldo patrimonial e reserva de troco na mesma transação.
-- Não cria receita, não altera empresas com histórico e não infere valor real.
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.pdv_can_initialize_treasury_v2(p_cash_account_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
DECLARE v_context record;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  IF public.can_manage_bank_accounts(v_context.user_id) IS DISTINCT FROM TRUE THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.financial_accounts account
    JOIN public.company_settings settings ON settings.company_id = account.company_id
      AND settings.pdv_cash_account_id = account.id
    WHERE account.id = p_cash_account_id AND account.company_id = v_context.company_id
      AND account.type = 'caixa' AND account.is_active IS TRUE AND account.initial_balance = 0
  ) AND NOT EXISTS (
    SELECT 1 FROM public.financial_transactions transaction
    WHERE transaction.company_id = v_context.company_id AND transaction.account_id = p_cash_account_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.pdv_cash_sessions session WHERE session.company_id = v_context.company_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.pdv_operation_requests request
    WHERE request.company_id = v_context.company_id
      AND request.operation_type = 'cash.initialize.v2' AND request.status = 'completed'
  );
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_initialize_and_open_cash_v2(
  p_terminal_id uuid, p_cash_account_id uuid, p_opening_amount numeric,
  p_initial_balance numeric, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
DECLARE v_context record; v_claim record; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  IF public.can_manage_bank_accounts(v_context.user_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar o saldo inicial.'
      USING ERRCODE = '42501', DETAIL = 'PDV_TREASURY_INITIALIZATION_FORBIDDEN';
  END IF;
  IF p_initial_balance IS NULL OR p_initial_balance::text IN ('NaN','Infinity','-Infinity')
     OR p_initial_balance < 0 OR p_initial_balance > 999999999999.99
     OR p_initial_balance <> round(p_initial_balance, 2)
     OR p_opening_amount IS NULL OR p_opening_amount::text IN ('NaN','Infinity','-Infinity')
     OR p_opening_amount < 0 OR p_opening_amount > p_initial_balance
     OR p_opening_amount <> round(p_opening_amount, 2) THEN
    RAISE EXCEPTION 'Informe o dinheiro total existente e um troco que caiba nesse valor.'
      USING ERRCODE = '22023', DETAIL = 'PDV_TREASURY_INITIAL_BALANCE_INVALID';
  END IF;

  PERFORM public.pdv_lock_treasury_account(v_context.company_id, p_cash_account_id);
  -- O row lock também serializa com ajustes diretos do Financeiro.
  PERFORM 1 FROM public.financial_accounts WHERE id = p_cash_account_id
    AND company_id = v_context.company_id FOR UPDATE;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(
    v_context.company_id, 'cash.initialize.v2', p_idempotency_key,
    jsonb_build_object('terminal_id', p_terminal_id, 'cash_account_id', p_cash_account_id,
      'opening_amount', p_opening_amount, 'initial_balance', p_initial_balance,
      'actor_id', v_context.user_id)
  );
  IF v_claim.is_replay THEN
    IF v_claim.request_status = 'completed' THEN RETURN v_claim.stored_result; END IF;
    RAISE EXCEPTION 'A abertura está sendo conferida. Tente novamente.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CASH_OPEN_IN_PROGRESS';
  END IF;
  IF public.pdv_can_initialize_treasury_v2(p_cash_account_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'O cofre já possui histórico. Confira o saldo no Financeiro antes de abrir.'
      USING ERRCODE = '55000', DETAIL = 'PDV_TREASURY_ALREADY_INITIALIZED';
  END IF;

  UPDATE public.financial_accounts SET initial_balance = p_initial_balance
    WHERE id = p_cash_account_id AND company_id = v_context.company_id;
  v_result := public.pdv_open_cash_session_v2(p_terminal_id, p_cash_account_id,
    p_opening_amount, 'initialize:' || v_claim.request_id::text);
  IF (v_result->>'ok')::boolean IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Confira o histórico dos caixas antes de continuar.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CASH_RECONCILIATION_REQUIRED';
  END IF;
  -- Auditoria: valor declarado, autor autenticado e data ficam na operação;
  -- a abertura mantém o fato canônico de custódia. Saldo inicial não é venda.
  v_result := v_result || jsonb_build_object('initial_balance', p_initial_balance,
    'initialized_by', v_context.user_id, 'initialized_at', now());
  PERFORM public.pdv_complete_operation_request(v_claim.request_id, 'pdv_cash_session',
    (v_result->>'session_id')::uuid, v_result);
  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.pdv_can_initialize_treasury_v2(uuid),
  public.pdv_initialize_and_open_cash_v2(uuid,uuid,numeric,numeric,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pdv_can_initialize_treasury_v2(uuid),
  public.pdv_initialize_and_open_cash_v2(uuid,uuid,numeric,numeric,text) TO authenticated;
COMMIT;

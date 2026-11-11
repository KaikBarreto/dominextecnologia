-- Historico de caixa v2: leitura propria, relatorio por sessao e reabertura
-- auditavel como uma NOVA sessao de continuacao.
--
-- A sessao fechada, sua custodia e a quebra financeira permanecem imutaveis.
-- Reabrir apenas reserva novamente no cofre o valor contado no fechamento e
-- cria uma abertura ligada ao caixa anterior. Nenhum fato de DRE/DFC e apagado.

BEGIN;

ALTER TABLE public.pdv_cash_sessions
  ADD COLUMN IF NOT EXISTS reopened_from_session_id uuid
    REFERENCES public.pdv_cash_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reopen_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pdv_cash_sessions_reopened_from
  ON public.pdv_cash_sessions (reopened_from_session_id)
  WHERE reopened_from_session_id IS NOT NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pdv_cash_sessions'::regclass
       AND conname = 'pdv_cash_sessions_reopen_audit_check'
  ) THEN
    ALTER TABLE public.pdv_cash_sessions
      ADD CONSTRAINT pdv_cash_sessions_reopen_audit_check CHECK (
        (
          reopened_from_session_id IS NULL
          AND reopened_at IS NULL
          AND reopened_by IS NULL
          AND reopen_reason IS NULL
        ) OR (
          reopened_from_session_id IS NOT NULL
          AND reopened_at IS NOT NULL
          AND reopen_reason IS NOT NULL
          AND char_length(btrim(reopen_reason)) BETWEEN 3 AND 500
          AND reopened_from_session_id <> id
        )
      );
  END IF;
END
$constraints$;

COMMENT ON COLUMN public.pdv_cash_sessions.reopened_from_session_id IS
  'Sessao fechada que originou esta continuacao. A origem permanece fechada e imutavel.';
COMMENT ON COLUMN public.pdv_cash_sessions.reopen_reason IS
  'Motivo informado na reabertura auditavel. Nunca substitui a observacao do fechamento anterior.';

CREATE OR REPLACE FUNCTION public.pdv_assert_cash_reopen_source_company_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NEW.reopened_from_session_id IS NOT NULL THEN
    PERFORM public.pdv_assert_ref_company(
      'public.pdv_cash_sessions',
      NEW.reopened_from_session_id,
      NEW.company_id,
      'O caixa reaberto'
    );
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS tg_zz_pdv_cash_reopen_source_company_v2
  ON public.pdv_cash_sessions;
CREATE TRIGGER tg_zz_pdv_cash_reopen_source_company_v2
  BEFORE INSERT OR UPDATE OF company_id, reopened_from_session_id
  ON public.pdv_cash_sessions
  FOR EACH ROW EXECUTE FUNCTION public.pdv_assert_cash_reopen_source_company_v2();

REVOKE ALL ON FUNCTION public.pdv_assert_cash_reopen_source_company_v2()
  FROM PUBLIC, anon, authenticated, service_role;

-- Contexto exclusivo das leituras do historico. Diferente do contexto dos
-- writers, aceita a tela de historico sem conceder permissao para operar caixa.
CREATE OR REPLACE FUNCTION public.pdv_cash_history_context_v2()
RETURNS TABLE (user_id uuid, company_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessao expirada. Entre novamente para continuar.'
      USING ERRCODE = '42501', DETAIL = 'PDV_AUTH_REQUIRED';
  END IF;

  v_company := public.get_user_company_id(v_user);
  IF v_company IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles profile
     WHERE profile.user_id = v_user
       AND profile.company_id = v_company
       AND COALESCE(profile.is_active, true)
  ) THEN
    RAISE EXCEPTION 'Seu usuario nao esta ativo em nenhuma empresa.'
      USING ERRCODE = '42501', DETAIL = 'PDV_ACTIVE_COMPANY_REQUIRED';
  END IF;

  IF public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'A assinatura da empresa nao permite consultar o caixa agora.'
      USING ERRCODE = '42501', DETAIL = 'PDV_SUBSCRIPTION_INACTIVE';
  END IF;
  IF NOT public.company_has_module(v_company, 'pdv') THEN
    RAISE EXCEPTION 'O modulo PDV e Loja nao esta ativo nesta empresa.'
      USING ERRCODE = '42501', DETAIL = 'PDV_MODULE_INACTIVE';
  END IF;
  IF NOT public.user_has_permission(v_user, 'screen:pdv_cash_history')
     AND NOT public.user_has_permission(v_user, 'screen:pdv')
  THEN
    RAISE EXCEPTION 'Voce nao tem permissao para consultar o historico de caixa.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_HISTORY_FORBIDDEN';
  END IF;

  RETURN QUERY SELECT v_user, v_company;
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_cash_history_context_v2()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pdv_cash_history_v2(
  p_terminal_id uuid DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_can_manage boolean := false;
  v_terminals jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_history_context_v2();

  IF p_page IS NULL OR p_page < 0
     OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100 THEN
    RAISE EXCEPTION 'Paginacao de caixas invalida.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_LIST_PAGE_INVALID';
  END IF;

  v_can_manage := public.is_admin_or_gestor(v_context.user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_permissions permission
       WHERE permission.user_id = v_context.user_id
         AND permission.is_active
         AND (
           permission.permissions ? '*'
           OR permission.permissions ? 'fn:edit_pdv_sales'
         )
    );

  IF p_terminal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pdv_terminals terminal
     WHERE terminal.id = p_terminal_id
       AND terminal.company_id = v_context.company_id
  ) THEN
    RAISE EXCEPTION 'Terminal nao encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_TERMINAL_NOT_FOUND';
  END IF;

  IF p_operator_id IS NOT NULL THEN
    IF NOT v_can_manage AND p_operator_id IS DISTINCT FROM v_context.user_id THEN
      RAISE EXCEPTION 'Voce nao pode consultar os caixas de outro operador.'
        USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_FORBIDDEN';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles profile
       WHERE profile.user_id = p_operator_id
         AND profile.company_id = v_context.company_id
    ) THEN
      RAISE EXCEPTION 'Operador nao encontrado.'
        USING ERRCODE = 'P0002', DETAIL = 'PDV_OPERATOR_NOT_FOUND';
    END IF;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', terminal.id, 'name', terminal.name)
      ORDER BY terminal.sort_order, terminal.name, terminal.id
    ),
    '[]'::jsonb
  ) INTO v_terminals
  FROM public.pdv_terminals terminal
  WHERE terminal.company_id = v_context.company_id;

  WITH authorized AS (
    SELECT
      session.id,
      session.company_id,
      session.terminal_id,
      session.opened_by,
      session.opened_at,
      session.opening_amount,
      session.cash_account_id,
      session.cash_account_name_snapshot,
      session.contract_version,
      session.status,
      session.closed_at,
      session.counted_amount,
      session.expected_amount,
      session.difference,
      session.notes,
      terminal.name AS terminal_name,
      COALESCE(NULLIF(btrim(profile.full_name), ''), NULLIF(btrim(profile.email), ''), 'Operador') AS operator_name,
      EXISTS (
        SELECT 1 FROM public.pdv_cash_sessions continuation
         WHERE continuation.company_id = session.company_id
           AND continuation.reopened_from_session_id = session.id
      ) AS was_reopened,
      row_number() OVER (ORDER BY session.closed_at DESC, session.id) AS ordinal
    FROM public.pdv_cash_sessions session
    JOIN public.pdv_terminals terminal
      ON terminal.id = session.terminal_id
     AND terminal.company_id = session.company_id
    LEFT JOIN public.profiles profile
      ON profile.user_id = session.opened_by
     AND profile.company_id = session.company_id
    WHERE session.company_id = v_context.company_id
      AND session.contract_version = 2
      AND session.status = 'fechada'
      AND (v_can_manage OR session.opened_by = v_context.user_id)
      AND (p_terminal_id IS NULL OR session.terminal_id = p_terminal_id)
      AND (p_operator_id IS NULL OR session.opened_by = p_operator_id)
  ), paged AS (
    SELECT * FROM authorized
     WHERE ordinal > (p_page * p_page_size)
       AND ordinal <= (p_page * p_page_size) + p_page_size + 1
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', row.id,
          'company_id', row.company_id,
          'terminal_id', row.terminal_id,
          'terminal_name', row.terminal_name,
          'opened_by', row.opened_by,
          'operator_name', row.operator_name,
          'opened_at', row.opened_at,
          'opening_amount', round(row.opening_amount, 2),
          'cash_account_id', row.cash_account_id,
          'cash_account_name_snapshot', row.cash_account_name_snapshot,
          'contract_version', row.contract_version,
          'status', row.status,
          'closed_at', row.closed_at,
          'counted_amount', row.counted_amount,
          'expected_amount', row.expected_amount,
          'difference', row.difference,
          'notes', row.notes,
          'was_reopened', row.was_reopened
        ) ORDER BY row.ordinal
      ) FILTER (WHERE row.ordinal <= (p_page * p_page_size) + p_page_size),
      '[]'::jsonb
    ),
    count(*) > p_page_size
  INTO v_rows, v_has_more
  FROM paged row;

  RETURN jsonb_build_object(
    'terminals', v_terminals,
    'rows', v_rows,
    'has_more', v_has_more,
    'can_manage_others', v_can_manage
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_cash_session_report_v2(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_session public.pdv_cash_sessions%ROWTYPE;
  v_terminal_name text;
  v_operator_name text;
  v_closed_by_name text;
  v_can_manage boolean := false;
  v_position numeric(14,2) := 0;
  v_opening numeric(14,2) := 0;
  v_cash_receipts numeric(14,2) := 0;
  v_cash_payments numeric(14,2) := 0;
  v_supplies numeric(14,2) := 0;
  v_withdrawals numeric(14,2) := 0;
  v_refunds numeric(14,2) := 0;
  v_entries jsonb := '[]'::jsonb;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Informe o caixa que deseja consultar.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_SESSION_REQUIRED';
  END IF;
  SELECT * INTO v_context FROM public.pdv_cash_history_context_v2();

  v_can_manage := public.is_admin_or_gestor(v_context.user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_permissions permission
       WHERE permission.user_id = v_context.user_id
         AND permission.is_active
         AND (permission.permissions ? '*' OR permission.permissions ? 'fn:edit_pdv_sales')
    );

  SELECT session.*
    INTO v_session
    FROM public.pdv_cash_sessions session
    JOIN public.pdv_terminals terminal
      ON terminal.id = session.terminal_id AND terminal.company_id = session.company_id
    LEFT JOIN public.profiles opener
      ON opener.user_id = session.opened_by AND opener.company_id = session.company_id
    LEFT JOIN public.profiles closer
      ON closer.user_id = session.closed_by AND closer.company_id = session.company_id
   WHERE session.id = p_session_id
     AND session.company_id = v_context.company_id
     AND session.contract_version = 2
     AND session.status = 'fechada';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa fechado nao encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_CASH_SESSION_NOT_FOUND';
  END IF;
  SELECT terminal.name,
         COALESCE(NULLIF(btrim(opener.full_name), ''), NULLIF(btrim(opener.email), ''), 'Operador'),
         COALESCE(NULLIF(btrim(closer.full_name), ''), NULLIF(btrim(closer.email), ''), 'Operador')
    INTO v_terminal_name, v_operator_name, v_closed_by_name
    FROM public.pdv_terminals terminal
    LEFT JOIN public.profiles opener
      ON opener.user_id = v_session.opened_by AND opener.company_id = v_session.company_id
    LEFT JOIN public.profiles closer
      ON closer.user_id = v_session.closed_by AND closer.company_id = v_session.company_id
   WHERE terminal.id = v_session.terminal_id
     AND terminal.company_id = v_session.company_id;
  IF NOT v_can_manage AND v_session.opened_by IS DISTINCT FROM v_context.user_id THEN
    RAISE EXCEPTION 'Voce nao pode consultar o caixa de outro operador.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_FORBIDDEN';
  END IF;

  SELECT
    round(COALESCE(sum(entry.amount), 0), 2),
    round(COALESCE(sum(entry.amount) FILTER (WHERE entry.entry_kind = 'opening'), 0), 2),
    round(COALESCE(sum(entry.amount) FILTER (WHERE entry.entry_kind = 'cash_receipt'), 0), 2),
    round(abs(COALESCE(sum(entry.amount) FILTER (WHERE entry.entry_kind = 'cash_payment'), 0)), 2),
    round(COALESCE(sum(entry.amount) FILTER (WHERE entry.entry_kind = 'supply'), 0), 2),
    round(abs(COALESCE(sum(entry.amount) FILTER (WHERE entry.entry_kind = 'withdrawal'), 0)), 2),
    round(abs(COALESCE(sum(entry.amount) FILTER (WHERE entry.entry_kind = 'refund'), 0)), 2)
  INTO v_position, v_opening, v_cash_receipts, v_cash_payments,
       v_supplies, v_withdrawals, v_refunds
  FROM public.pdv_cash_custody_entries entry
  WHERE entry.company_id = v_context.company_id
    AND entry.session_id = v_session.id
    AND entry.cash_account_id = v_session.cash_account_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', entry.id,
      'kind', entry.entry_kind,
      'amount', round(entry.amount, 2),
      'created_at', entry.created_at,
      'description', transaction.description,
      'notes', COALESCE(NULLIF(transaction.notes, ''), NULLIF(entry.metadata->>'notes', '')),
      'payment_method', transaction.payment_method
    ) ORDER BY entry.created_at, entry.id
  ), '[]'::jsonb)
  INTO v_entries
  FROM public.pdv_cash_custody_entries entry
  LEFT JOIN public.financial_transactions transaction
    ON transaction.id = entry.financial_transaction_id
   AND transaction.company_id = entry.company_id
  WHERE entry.company_id = v_context.company_id
    AND entry.session_id = v_session.id
    AND entry.cash_account_id = v_session.cash_account_id;

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'terminal_name', v_terminal_name,
    'operator_name', v_operator_name,
    'closed_by_name', v_closed_by_name,
    'opened_at', v_session.opened_at,
    'closed_at', v_session.closed_at,
    'cash_account_name', v_session.cash_account_name_snapshot,
    'opening_amount', v_opening,
    'expected_amount', v_session.expected_amount,
    'counted_amount', v_session.counted_amount,
    'difference', v_session.difference,
    'cash_receipts', v_cash_receipts,
    'cash_payments', v_cash_payments,
    'supplies', v_supplies,
    'withdrawals', v_withdrawals,
    'refunds', v_refunds,
    'final_position', v_position,
    'notes', v_session.notes,
    'entries', v_entries
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_reopen_cash_session_v2(
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

  IF NOT public.is_admin_or_gestor(v_context.user_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_permissions permission
        WHERE permission.user_id = v_context.user_id
          AND permission.is_active
          AND (permission.permissions ? '*' OR permission.permissions ? 'fn:reopen_pdv_cash')
     )
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

REVOKE ALL ON FUNCTION public.pdv_cash_history_v2(uuid,uuid,integer,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_cash_session_report_v2(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_reopen_cash_session_v2(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pdv_cash_history_v2(uuid,uuid,integer,integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_cash_session_report_v2(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_reopen_cash_session_v2(uuid,uuid,text,text)
  TO authenticated;

COMMENT ON FUNCTION public.pdv_reopen_cash_session_v2(uuid,uuid,text,text) IS
  'Cria uma sessao de continuacao auditavel com o contado anterior como abertura; nao altera fechamento, financeiro, DRE ou DFC anteriores.';

COMMIT;

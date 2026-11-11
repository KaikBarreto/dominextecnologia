-- Projecao somente leitura do livro de custodia de uma sessao de caixa v2.
--
-- A tabela `pdv_cash_custody_entries` continua sem SELECT para authenticated.
-- Esta RPC entrega apenas o recorte da sessao validada, depois dos mesmos
-- gates de tenant, assinatura, modulo e tela usados pelos writers v2.

-- Sessao de caixa e fato financeiro operacional. O cliente pode ler o recorte
-- autorizado, mas toda escrita passa pelas RPCs canonicas (legada ou v2).
REVOKE INSERT, UPDATE, DELETE ON public.pdv_cash_sessions FROM authenticated;
GRANT SELECT ON public.pdv_cash_sessions TO authenticated;

CREATE OR REPLACE FUNCTION public.pdv_cash_session_detail_v2(
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_session public.pdv_cash_sessions%ROWTYPE;
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

  SELECT * INTO v_context FROM public.pdv_cash_v2_context();

  SELECT session.* INTO v_session
    FROM public.pdv_cash_sessions session
   WHERE session.id = p_session_id
     AND session.company_id = v_context.company_id;

  IF NOT FOUND THEN
    -- A mesma resposta serve para id inexistente e sessao de outro tenant.
    RAISE EXCEPTION 'Caixa não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_CASH_SESSION_NOT_FOUND';
  END IF;

  IF v_session.contract_version IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Este caixa não usa o contrato novo.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_CONTRACT_MISMATCH';
  END IF;

  IF v_session.opened_by IS DISTINCT FROM v_context.user_id
     AND NOT public.is_admin_or_gestor(v_context.user_id)
     AND NOT EXISTS (
       SELECT 1
         FROM public.user_permissions permission
        WHERE permission.user_id = v_context.user_id
          AND permission.is_active
          AND (
            permission.permissions ? '*'
            OR permission.permissions ? 'fn:edit_pdv_sales'
          )
     )
  THEN
    RAISE EXCEPTION 'Você não pode consultar o caixa de outro operador.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_FORBIDDEN';
  END IF;

  SELECT
    round(COALESCE(sum(entry.amount), 0), 2),
    round(COALESCE(sum(entry.amount) FILTER (
      WHERE entry.entry_kind = 'opening'
    ), 0), 2),
    round(COALESCE(sum(entry.amount) FILTER (
      WHERE entry.entry_kind = 'cash_receipt'
    ), 0), 2),
    round(abs(COALESCE(sum(entry.amount) FILTER (
      WHERE entry.entry_kind = 'cash_payment'
    ), 0)), 2),
    round(COALESCE(sum(entry.amount) FILTER (
      WHERE entry.entry_kind = 'supply'
    ), 0), 2),
    round(abs(COALESCE(sum(entry.amount) FILTER (
      WHERE entry.entry_kind = 'withdrawal'
    ), 0)), 2),
    round(abs(COALESCE(sum(entry.amount) FILTER (
      WHERE entry.entry_kind = 'refund'
    ), 0)), 2)
  INTO
    v_position,
    v_opening,
    v_cash_receipts,
    v_cash_payments,
    v_supplies,
    v_withdrawals,
    v_refunds
  FROM public.pdv_cash_custody_entries entry
  WHERE entry.company_id = v_context.company_id
    AND entry.session_id = v_session.id
    AND entry.cash_account_id = v_session.cash_account_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', entry.id,
        'kind', entry.entry_kind,
        'amount', round(entry.amount, 2),
        'created_at', entry.created_at,
        'created_by', entry.created_by,
        'source_type', entry.source_type,
        'source_id', entry.source_id,
        'reversal_of_id', entry.reversal_of_id,
        'description', transaction.description,
        'notes', COALESCE(
          NULLIF(transaction.notes, ''),
          NULLIF(entry.metadata->>'notes', '')
        ),
        'payment_method', transaction.payment_method,
        'transaction_type', transaction.transaction_type,
        'order_id', payment.order_id,
        'financial_transaction_id', entry.financial_transaction_id
      )
      ORDER BY entry.created_at DESC, entry.id DESC
    ),
    '[]'::jsonb
  )
  INTO v_entries
  FROM public.pdv_cash_custody_entries entry
  LEFT JOIN public.financial_transactions transaction
    ON transaction.id = entry.financial_transaction_id
   AND transaction.company_id = entry.company_id
  LEFT JOIN public.pdv_order_payments payment
    ON payment.financial_transaction_id = entry.financial_transaction_id
   AND payment.company_id = entry.company_id
  WHERE entry.company_id = v_context.company_id
    AND entry.session_id = v_session.id
    AND entry.cash_account_id = v_session.cash_account_id;

  RETURN jsonb_build_object(
    'session_id', v_session.id,
    'position', v_position,
    'opening_amount', v_opening,
    'cash_receipts', v_cash_receipts,
    'cash_payments', v_cash_payments,
    'supplies', v_supplies,
    'withdrawals', v_withdrawals,
    'refunds', v_refunds,
    'entries', v_entries
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_cash_session_detail_v2(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_cash_session_detail_v2(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.pdv_cash_session_detail_v2(uuid) IS
  'Projecao read-only e multi-tenant do livro de custodia de uma sessao v2. A tabela base permanece inacessivel ao cliente.';

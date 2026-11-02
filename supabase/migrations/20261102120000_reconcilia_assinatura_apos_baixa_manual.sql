-- Corrige assinaturas recorrentes cujo ciclo foi baixado (inclusive como
-- RECEIVED_IN_CASH no painel Asaas), mas o espelho local continuou `overdue`
-- e com o primeiro vencimento congelado.
--
-- A partir desta entrega o webhook mantém o estado sincronizado. Este backfill
-- cuida somente dos registros já existentes e nunca reativa canceladas,
-- pausadas ou pendentes.

WITH subscription_state AS (
  SELECT
    s.id,
    EXISTS (
      SELECT 1
      FROM public.tenant_charges c
      WHERE c.subscription_id = s.id
        AND c.company_id = s.company_id
        AND upper(btrim(c.status)) = 'OVERDUE'
    ) AS has_overdue,
    (
      SELECT min(c.due_date)
      FROM public.tenant_charges c
      WHERE c.subscription_id = s.id
        AND c.company_id = s.company_id
        AND c.due_date IS NOT NULL
        AND upper(btrim(c.status)) IN (
          'PENDING',
          'PENDING_CREATION',
          'AWAITING_RISK_ANALYSIS',
          'AWAITING_PAYMENT',
          'OVERDUE'
        )
    ) AS next_open_due,
    (
      SELECT min(candidate)
      FROM (
        SELECT CASE s.cycle
          WHEN 'WEEKLY' THEN s.next_due_date + (occurrence * 7)
          WHEN 'BIWEEKLY' THEN s.next_due_date + (occurrence * 14)
          WHEN 'MONTHLY' THEN (s.next_due_date + (occurrence || ' months')::interval)::date
          WHEN 'QUARTERLY' THEN (s.next_due_date + ((occurrence * 3) || ' months')::interval)::date
          WHEN 'SEMIANNUALLY' THEN (s.next_due_date + ((occurrence * 6) || ' months')::interval)::date
          WHEN 'YEARLY' THEN (s.next_due_date + ((occurrence * 12) || ' months')::interval)::date
          ELSE NULL
        END AS candidate
        FROM generate_series(0, 240) AS occurrence
      ) grid
      WHERE candidate >= current_date
    ) AS next_grid_due
  FROM public.tenant_subscriptions s
  WHERE s.status IN ('active', 'overdue')
    AND s.deleted_at IS NULL
)
UPDATE public.tenant_subscriptions s
SET
  status = CASE WHEN state.has_overdue THEN 'overdue' ELSE 'active' END,
  next_due_date = COALESCE(state.next_open_due, state.next_grid_due, s.next_due_date),
  updated_at = now()
FROM subscription_state state
WHERE s.id = state.id
  AND (
    s.status IS DISTINCT FROM CASE WHEN state.has_overdue THEN 'overdue' ELSE 'active' END
    OR s.next_due_date IS DISTINCT FROM COALESCE(state.next_open_due, state.next_grid_due, s.next_due_date)
  );

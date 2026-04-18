-- Add due_day column to financial_accounts.
-- Stores the calendar day the bill is due (1-31).
-- When set, computeBillDates uses it directly instead of payment_due_days offset.
-- due_day < closing_day → vencimento no mês seguinte ao fechamento.
ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS due_day INTEGER CHECK (due_day BETWEEN 1 AND 31);

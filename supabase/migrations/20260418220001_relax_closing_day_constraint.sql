-- Relax closing_day constraint to allow days 29-31.
-- computeBillDates clamps to the last day of the month to handle shorter months safely.
ALTER TABLE public.financial_accounts
  DROP CONSTRAINT IF EXISTS financial_accounts_closing_day_check;

ALTER TABLE public.financial_accounts
  ADD CONSTRAINT financial_accounts_closing_day_check CHECK (closing_day BETWEEN 1 AND 31);

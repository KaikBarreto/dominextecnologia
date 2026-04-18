-- Add credit card support columns to financial_accounts
ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS closing_day integer,
  ADD COLUMN IF NOT EXISTS payment_due_days integer,
  ADD COLUMN IF NOT EXISTS credit_limit numeric;

-- Add credit_card_bill_date to financial_transactions (which "bill" the txn belongs to)
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS credit_card_bill_date date;

CREATE INDEX IF NOT EXISTS idx_ft_credit_card_bill
  ON public.financial_transactions(account_id, credit_card_bill_date)
  WHERE credit_card_bill_date IS NOT NULL;

-- Credit card bills table (one row per cycle per card)
CREATE TABLE IF NOT EXISTS public.credit_card_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  reference_month date NOT NULL, -- first day of the month the bill belongs to
  closing_date date NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'open', -- open | closed | partial | paid
  amount_paid numeric NOT NULL DEFAULT 0,
  paid_at timestamptz,
  payment_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, reference_month)
);

CREATE INDEX IF NOT EXISTS idx_ccb_company ON public.credit_card_bills(company_id);
CREATE INDEX IF NOT EXISTS idx_ccb_account ON public.credit_card_bills(account_id);

ALTER TABLE public.credit_card_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company credit card bills"
  ON public.credit_card_bills FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can create credit card bills for their company"
  ON public.credit_card_bills FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can update their company credit card bills"
  ON public.credit_card_bills FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can delete their company credit card bills"
  ON public.credit_card_bills FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE TRIGGER trg_ccb_updated_at
  BEFORE UPDATE ON public.credit_card_bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
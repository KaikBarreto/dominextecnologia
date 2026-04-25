-- Credit card billing support
-- Adds closing_day, payment_due_days, credit_limit to financial_accounts
-- Adds credit_card_bill_date to financial_transactions
-- Creates credit_card_bills table for invoice tracking

ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS closing_day INTEGER CHECK (closing_day BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS payment_due_days INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(10,2);

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS credit_card_bill_date DATE;

CREATE TABLE IF NOT EXISTS public.credit_card_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  reference_month DATE NOT NULL,
  closing_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'paid', 'partial')),
  amount_paid DECIMAL(10,2) DEFAULT 0,
  payment_transaction_id UUID REFERENCES public.financial_transactions(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (account_id, reference_month)
);

ALTER TABLE public.credit_card_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their company credit card bills"
  ON public.credit_card_bills
  FOR ALL
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- Seed a system category for credit card bill payments so DRE can filter it out
INSERT INTO public.financial_categories (company_id, name, type, color, icon, is_system, dre_group, sort_order)
SELECT DISTINCT fa.company_id, 'Pagamento de Fatura', 'saida', '#6366f1', 'credit-card', true, NULL, 99
FROM public.financial_accounts fa
WHERE fa.type = 'cartao'
ON CONFLICT DO NOTHING;

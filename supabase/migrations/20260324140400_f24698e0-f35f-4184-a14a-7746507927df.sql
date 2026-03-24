
-- Create financial_accounts table
CREATE TABLE public.financial_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'banco',
  bank_name TEXT,
  initial_balance NUMERIC NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  icon TEXT DEFAULT 'Landmark',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company accounts"
  ON public.financial_accounts FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Managers can manage own company accounts"
  ON public.financial_accounts FOR ALL
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND can_manage_system(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND can_manage_system(auth.uid()));

-- Add account_id and transfer_pair_id to financial_transactions
ALTER TABLE public.financial_transactions
  ADD COLUMN account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  ADD COLUMN transfer_pair_id UUID;

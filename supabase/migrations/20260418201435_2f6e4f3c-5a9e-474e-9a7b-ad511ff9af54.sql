ALTER TABLE public.financial_transactions
ADD COLUMN IF NOT EXISTS parent_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_parent
  ON public.financial_transactions(parent_transaction_id);
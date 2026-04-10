
ALTER TABLE public.financial_transactions
  DROP CONSTRAINT financial_transactions_contract_id_fkey,
  ADD CONSTRAINT financial_transactions_contract_id_fkey
    FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE CASCADE;

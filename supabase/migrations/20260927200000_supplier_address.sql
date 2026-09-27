ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS address text;

COMMENT ON COLUMN public.suppliers.address IS
  'Endereço livre do fornecedor, exibido na ficha e usado pela busca.';

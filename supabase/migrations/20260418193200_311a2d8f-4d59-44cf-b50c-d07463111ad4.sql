ALTER TABLE public.financial_accounts
ADD COLUMN IF NOT EXISTS institution_code int,
ADD COLUMN IF NOT EXISTS institution_name text,
ADD COLUMN IF NOT EXISTS institution_ispb text;
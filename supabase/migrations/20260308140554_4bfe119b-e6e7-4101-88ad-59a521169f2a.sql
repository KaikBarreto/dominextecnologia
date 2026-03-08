
-- Allow quotes without a customer (manual prospect info)
ALTER TABLE public.quotes ALTER COLUMN customer_id DROP NOT NULL;

-- Add manual prospect fields for quotes without a linked customer
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS prospect_name text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS prospect_phone text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS prospect_email text;

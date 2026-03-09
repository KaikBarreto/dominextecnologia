ALTER TABLE public.quotes 
  ADD COLUMN IF NOT EXISTS card_discount_rate numeric NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS card_installments integer NOT NULL DEFAULT 10;
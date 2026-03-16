
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS show_name_in_documents boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_cnpj_in_documents boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_address_in_documents boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_phone_in_documents boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_email_in_documents boolean NOT NULL DEFAULT true;

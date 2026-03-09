
-- Add company_id to company_settings for multi-tenant isolation
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Link existing settings row to the existing company
UPDATE public.company_settings SET company_id = '478ee686-12dd-40a8-880a-a7375764a5a0' WHERE company_id IS NULL;

-- Sync data from company_settings to companies table for Empresa Kaik Barreto
UPDATE public.companies SET 
  cnpj = cs.document,
  phone = cs.phone,
  address = CONCAT_WS(', ', cs.address, 'Nº ' || cs.address_number, cs.complement, cs.neighborhood, cs.city || '/' || cs.state, 'CEP: ' || cs.zip_code)
FROM public.company_settings cs 
WHERE companies.id = cs.company_id 
  AND cs.company_id = '478ee686-12dd-40a8-880a-a7375764a5a0';

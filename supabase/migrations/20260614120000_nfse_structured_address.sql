-- Notas Fiscais (NFS-e via Fisqal): endereço ESTRUTURADO de prestador e tomador.
-- A emissão de NFS-e exige número, bairro e código IBGE do município de forma
-- estruturada (os campos flat address/city/state/zip_code não bastam).
--
-- Migration ADITIVA e NULLABLE: zero risco de regressão, não toca em nenhum
-- campo existente, não faz backfill, não adiciona NOT NULL.
--
-- Observado no schema real (prod) ANTES de escrever:
--   * `neighborhood` JÁ EXISTE em customers e companies -> IF NOT EXISTS pula.
--   * `street_number` e `ibge_municipality_code` NÃO existem em nenhuma das duas.
-- Todos os ADD usam IF NOT EXISTS pra serem idempotentes (rodar 2x não quebra).

-- Tomador (cliente do tenant)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS street_number text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS ibge_municipality_code text;

-- Prestador (empresa). Apenas DDL aditiva nullable; NÃO há sync de dados com
-- company_settings (esses campos fiscais não existem lá e o módulo NFS-e lê
-- direto de companies), portanto nenhum trigger de espelhamento é necessário.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS street_number text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS ibge_municipality_code text;

COMMENT ON COLUMN public.customers.street_number IS 'Número do logradouro (NFS-e Fisqal)';
COMMENT ON COLUMN public.customers.neighborhood IS 'Bairro (NFS-e Fisqal)';
COMMENT ON COLUMN public.customers.ibge_municipality_code IS 'Código IBGE do município (NFS-e Fisqal)';
COMMENT ON COLUMN public.companies.street_number IS 'Número do logradouro do prestador (NFS-e Fisqal)';
COMMENT ON COLUMN public.companies.neighborhood IS 'Bairro do prestador (NFS-e Fisqal)';
COMMENT ON COLUMN public.companies.ibge_municipality_code IS 'Código IBGE do município do prestador (NFS-e Fisqal)';

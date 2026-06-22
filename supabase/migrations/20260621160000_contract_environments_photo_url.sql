-- =============================================================================
-- PMOC: foto do ambiente em contract_environments
-- -----------------------------------------------------------------------------
-- Adiciona a coluna `photo_url` para guardar a URL pública da foto do ambiente
-- (hospedada no bucket público de Storage `equipment-files`, via getPublicUrl).
-- Coluna nullable, sem default. NÃO mexe em RLS: a tabela já tem RLS por
-- company_id (4 ops + service_role + super_admin) e a coluna nova é coberta
-- pelas policies de linha existentes.
--
-- Idempotente (ADD COLUMN IF NOT EXISTS).
-- =============================================================================

ALTER TABLE public.contract_environments
  ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN public.contract_environments.photo_url IS
  'URL pública da foto do ambiente no Storage (bucket equipment-files). Opcional.';

-- Atribuição first/last touch do cadastro público.
-- Guarda apenas UTMs sanitizadas, hostname do referrer, página, idioma e data.
-- Não armazena IP, query string completa nem dados de navegação entre sessões.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS acquisition_attribution jsonb;

COMMENT ON COLUMN public.companies.acquisition_attribution IS
  'First/last touch de aquisição do cadastro: source, medium, campaign, referrer_host, page_path, locale e captured_at. Sem IP.';

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_acquisition_attribution_object;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_acquisition_attribution_object
  CHECK (
    acquisition_attribution IS NULL
    OR jsonb_typeof(acquisition_attribution) = 'object'
  );

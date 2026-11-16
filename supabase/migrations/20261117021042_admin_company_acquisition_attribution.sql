-- Optional acquisition metadata, compatible with registrations without attribution.
-- Uses existing company RLS; public registration writes only through self-register.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS acquisition_attribution jsonb;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.companies'::regclass AND conname='companies_acquisition_attribution_object') THEN
  ALTER TABLE public.companies ADD CONSTRAINT companies_acquisition_attribution_object
  CHECK(acquisition_attribution IS NULL OR jsonb_typeof(acquisition_attribution)='object');
 END IF;
END $$;
COMMENT ON COLUMN public.companies.acquisition_attribution IS 'Acquisition first/last touch supplied at signup. Allowlisted UTMs, click IDs, campaign/referral parameters, referrer hostname and entry path; no full query string, IP or device fingerprint. Historical missing data is not inferred.';

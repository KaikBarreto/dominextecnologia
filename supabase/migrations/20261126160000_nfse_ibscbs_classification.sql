-- IBS/CBS da NFS-e: defaults da empresa + snapshot da emissão.
ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS nfse_ibscbs_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nfse_ibscbs_cindop text,
  ADD COLUMN IF NOT EXISTS nfse_ibscbs_cst text,
  ADD COLUMN IF NOT EXISTS nfse_ibscbs_cclasstrib text,
  ADD COLUMN IF NOT EXISTS nfse_ibscbs_indfinal text NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS nfse_ibscbs_inddest text NOT NULL DEFAULT '0';

ALTER TABLE public.company_fiscal_settings
  ADD CONSTRAINT company_fiscal_settings_nfse_ibscbs_format_check CHECK (
    (nfse_ibscbs_cindop IS NULL OR nfse_ibscbs_cindop ~ '^[0-9]{6}$')
    AND (nfse_ibscbs_cst IS NULL OR nfse_ibscbs_cst ~ '^[0-9]{3}$')
    AND (nfse_ibscbs_cclasstrib IS NULL OR nfse_ibscbs_cclasstrib ~ '^[0-9]{6}$')
    AND nfse_ibscbs_indfinal IN ('0', '1')
    AND nfse_ibscbs_inddest IN ('0', '1')
    AND (NOT nfse_ibscbs_ativo OR (
      nfse_ibscbs_cindop IS NOT NULL
      AND nfse_ibscbs_cst IS NOT NULL
      AND nfse_ibscbs_cclasstrib IS NOT NULL
    ))
  );

ALTER TABLE public.nfse_emissions
  ADD COLUMN IF NOT EXISTS ibscbs_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ibscbs_cindop text,
  ADD COLUMN IF NOT EXISTS ibscbs_cst text,
  ADD COLUMN IF NOT EXISTS ibscbs_cclasstrib text,
  ADD COLUMN IF NOT EXISTS ibscbs_indfinal text NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS ibscbs_inddest text NOT NULL DEFAULT '0';

ALTER TABLE public.nfse_emissions
  ADD CONSTRAINT nfse_emissions_ibscbs_format_check CHECK (
    ibscbs_indfinal IN ('0', '1')
    AND ibscbs_inddest IN ('0', '1')
  );

COMMENT ON COLUMN public.company_fiscal_settings.nfse_ibscbs_cindop IS
  'cIndOp da NFS-e nacional (6 dígitos), default da empresa.';
COMMENT ON COLUMN public.nfse_emissions.ibscbs_cclasstrib IS
  'Snapshot do cClassTrib IBS/CBS enviado na DPS.';

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS white_label_logo_surface text NOT NULL DEFAULT 'auto';

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_white_label_logo_surface_check;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_white_label_logo_surface_check
  CHECK (white_label_logo_surface IN ('auto', 'system', 'light', 'dark'));

COMMENT ON COLUMN public.company_settings.white_label_logo_surface IS
  'Fundo do logo white-label nos shells do app: auto, system, light ou dark.';

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS report_header_bg_color text DEFAULT '#1e293b',
  ADD COLUMN IF NOT EXISTS report_header_text_color text DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS report_header_logo_size integer DEFAULT 80,
  ADD COLUMN IF NOT EXISTS report_header_show_logo_bg boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS report_status_bar_color text DEFAULT '#16a34a';
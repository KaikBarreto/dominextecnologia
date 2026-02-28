
-- Company settings table
CREATE TABLE public.company_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  document text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip_code text,
  logo_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view company_settings" ON public.company_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admin/gestor can manage company_settings" ON public.company_settings FOR ALL USING (is_admin_or_gestor(auth.uid())) WITH CHECK (is_admin_or_gestor(auth.uid()));

CREATE TRIGGER update_company_settings_updated_at BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default row
INSERT INTO public.company_settings (name) VALUES ('');

-- Set install_date field config to not visible by default
UPDATE public.equipment_field_config SET is_visible = false WHERE field_key = 'install_date';

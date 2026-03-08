
-- Add neighborhood and complement to company_settings
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS neighborhood text;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS complement text;

-- Create employees table
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cpf text,
  phone text,
  email text,
  position text,
  salary numeric DEFAULT 0,
  hire_date date,
  address text,
  pix_key text,
  photo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage employees" ON public.employees
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create employee_movements table
CREATE TABLE public.employee_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL DEFAULT 0,
  description text,
  payment_method text,
  payment_details jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage employee_movements" ON public.employee_movements
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Create employee-photos storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-photos', 'employee-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view employee photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'employee-photos');

CREATE POLICY "Authenticated users can upload employee photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'employee-photos');

CREATE POLICY "Authenticated users can update employee photos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'employee-photos');

CREATE POLICY "Authenticated users can delete employee photos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'employee-photos');

-- Create company-logos storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view company logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'company-logos');

CREATE POLICY "Authenticated users can upload company logos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "Authenticated users can update company logos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'company-logos');

CREATE POLICY "Authenticated users can delete company logos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'company-logos');

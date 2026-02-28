
-- Add new fields to customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS company_name text;

-- OS config table (single-row settings)
CREATE TABLE public.os_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  number_prefix text NOT NULL DEFAULT 'OS',
  number_format text NOT NULL DEFAULT '{prefix}-{year}-{number}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.os_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view os_config"
ON public.os_config FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin/gestor can manage os_config"
ON public.os_config FOR ALL
USING (is_admin_or_gestor(auth.uid()))
WITH CHECK (is_admin_or_gestor(auth.uid()));

-- Insert default config
INSERT INTO public.os_config (number_prefix, number_format) VALUES ('OS', '{prefix}-{year}-{number}');

-- OS required fields by status
CREATE TABLE public.os_required_fields (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status_key text NOT NULL,
  field_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(status_key, field_name)
);

ALTER TABLE public.os_required_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view os_required_fields"
ON public.os_required_fields FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin/gestor can manage os_required_fields"
ON public.os_required_fields FOR ALL
USING (is_admin_or_gestor(auth.uid()))
WITH CHECK (is_admin_or_gestor(auth.uid()));

-- OS SLA config per service type
CREATE TABLE public.os_sla_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_type_id uuid REFERENCES public.service_types(id) ON DELETE CASCADE,
  deadline_hours integer NOT NULL DEFAULT 24,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(service_type_id)
);

ALTER TABLE public.os_sla_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view os_sla_config"
ON public.os_sla_config FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin/gestor can manage os_sla_config"
ON public.os_sla_config FOR ALL
USING (is_admin_or_gestor(auth.uid()))
WITH CHECK (is_admin_or_gestor(auth.uid()));

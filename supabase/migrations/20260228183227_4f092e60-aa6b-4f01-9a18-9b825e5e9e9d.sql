
-- Create service_types table with configurable colors
CREATE TABLE public.service_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;

-- RLS policies - all authenticated users can read, admin/gestor can modify
CREATE POLICY "Authenticated users can view service types"
  ON public.service_types FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin/gestor can insert service types"
  ON public.service_types FOR INSERT
  WITH CHECK (public.is_admin_or_gestor(auth.uid()));

CREATE POLICY "Admin/gestor can update service types"
  ON public.service_types FOR UPDATE
  USING (public.is_admin_or_gestor(auth.uid()));

CREATE POLICY "Admin/gestor can delete service types"
  ON public.service_types FOR DELETE
  USING (public.is_admin_or_gestor(auth.uid()));

-- Add service_type_id to form_templates to link forms to service types
ALTER TABLE public.form_templates
  ADD COLUMN service_type_id UUID REFERENCES public.service_types(id) ON DELETE SET NULL;

-- Add service_type_id to service_orders for colored legend
ALTER TABLE public.service_orders
  ADD COLUMN service_type_id UUID REFERENCES public.service_types(id) ON DELETE SET NULL;

-- Seed default service types matching os_type enum colors
INSERT INTO public.service_types (name, color, description) VALUES
  ('Manutenção Preventiva', '#22c55e', 'Manutenção programada para prevenção'),
  ('Manutenção Corretiva', '#ef4444', 'Correção de problemas e defeitos'),
  ('Instalação', '#3b82f6', 'Instalação de novos equipamentos'),
  ('Visita Técnica', '#f59e0b', 'Visita para avaliação técnica');

-- Trigger for updated_at
CREATE TRIGGER update_service_types_updated_at
  BEFORE UPDATE ON public.service_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

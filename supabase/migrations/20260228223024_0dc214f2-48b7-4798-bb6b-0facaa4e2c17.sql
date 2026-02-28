
-- =============================================
-- PMOC Plans: define recurrence rules
-- =============================================
CREATE TABLE public.pmoc_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  frequency_months integer NOT NULL DEFAULT 1,
  next_generation_date date NOT NULL,
  status text NOT NULL DEFAULT 'ativo',
  contract_id uuid REFERENCES public.pmoc_contracts(id) ON DELETE SET NULL,
  technician_id uuid,
  service_type_id uuid REFERENCES public.service_types(id) ON DELETE SET NULL,
  form_template_id uuid REFERENCES public.form_templates(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pmoc_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage pmoc_plans"
  ON public.pmoc_plans FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER update_pmoc_plans_updated_at
  BEFORE UPDATE ON public.pmoc_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- PMOC Items: equipment linked to plans
-- =============================================
CREATE TABLE public.pmoc_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES public.pmoc_plans(id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(plan_id, equipment_id)
);

ALTER TABLE public.pmoc_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage pmoc_items"
  ON public.pmoc_items FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================
-- PMOC Generated OS: history of auto-generated orders
-- =============================================
CREATE TABLE public.pmoc_generated_os (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES public.pmoc_plans(id) ON DELETE CASCADE,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  scheduled_for date NOT NULL
);

ALTER TABLE public.pmoc_generated_os ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pmoc_generated_os"
  ON public.pmoc_generated_os FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert pmoc_generated_os"
  ON public.pmoc_generated_os FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================
-- Add signature fields to service_orders
-- =============================================
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS require_tech_signature boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_client_signature boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS tech_signature text;

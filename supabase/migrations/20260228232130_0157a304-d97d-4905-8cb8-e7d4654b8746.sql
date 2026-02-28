
-- Junction table to store multiple equipment + questionnaire per service order
CREATE TABLE public.service_order_equipment (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  form_template_id UUID REFERENCES public.form_templates(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(service_order_id, equipment_id)
);

ALTER TABLE public.service_order_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view service_order_equipment"
ON public.service_order_equipment FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert service_order_equipment"
ON public.service_order_equipment FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete service_order_equipment"
ON public.service_order_equipment FOR DELETE
USING (auth.uid() IS NOT NULL);

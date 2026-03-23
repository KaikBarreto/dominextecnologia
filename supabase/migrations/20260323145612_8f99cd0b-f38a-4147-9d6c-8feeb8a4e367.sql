
ALTER TABLE public.form_responses ADD COLUMN equipment_id uuid REFERENCES public.equipment(id) ON DELETE SET NULL;

CREATE INDEX idx_form_responses_equipment_id ON public.form_responses(equipment_id);

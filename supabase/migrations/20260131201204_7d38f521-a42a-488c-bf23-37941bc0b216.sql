-- Create CRM stages table for customizable pipeline columns
CREATE TABLE public.crm_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'muted',
  position INTEGER NOT NULL DEFAULT 0,
  is_won BOOLEAN NOT NULL DEFAULT false,
  is_lost BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view crm_stages" 
ON public.crm_stages 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin/gestor can manage crm_stages" 
ON public.crm_stages 
FOR ALL 
USING (is_admin_or_gestor(auth.uid()))
WITH CHECK (is_admin_or_gestor(auth.uid()));

-- Insert default stages based on current enum
INSERT INTO public.crm_stages (name, color, position, is_won, is_lost) VALUES
  ('Lead', 'muted', 0, false, false),
  ('Proposta', 'info', 1, false, false),
  ('Negociação', 'warning', 2, false, false),
  ('Fechado (Ganho)', 'success', 3, true, false),
  ('Fechado (Perdido)', 'destructive', 4, false, true);

-- Add stage_id column to leads table (nullable initially for migration)
ALTER TABLE public.leads ADD COLUMN stage_id UUID REFERENCES public.crm_stages(id);

-- Create trigger for timestamps
CREATE TRIGGER update_crm_stages_updated_at
BEFORE UPDATE ON public.crm_stages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Create form templates table
CREATE TABLE public.form_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create form questions table
CREATE TABLE public.form_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'boolean', -- boolean, text, number, photo, select
  options JSONB, -- for select type questions
  is_required BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create form responses table (answers for each OS)
CREATE TABLE public.form_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.form_questions(id) ON DELETE CASCADE,
  response_value TEXT,
  response_photo_url TEXT,
  responded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_by UUID
);

-- Add template_id to service_orders
ALTER TABLE public.service_orders ADD COLUMN form_template_id UUID REFERENCES public.form_templates(id);

-- Enable RLS
ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_responses ENABLE ROW LEVEL SECURITY;

-- Policies for form_templates
CREATE POLICY "Authenticated users can view form_templates" 
ON public.form_templates FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin/gestor can manage form_templates" 
ON public.form_templates FOR ALL 
USING (is_admin_or_gestor(auth.uid()))
WITH CHECK (is_admin_or_gestor(auth.uid()));

-- Policies for form_questions
CREATE POLICY "Authenticated users can view form_questions" 
ON public.form_questions FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin/gestor can manage form_questions" 
ON public.form_questions FOR ALL 
USING (is_admin_or_gestor(auth.uid()))
WITH CHECK (is_admin_or_gestor(auth.uid()));

-- Policies for form_responses (technicians can respond)
CREATE POLICY "Authenticated users can view form_responses" 
ON public.form_responses FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create form_responses" 
ON public.form_responses FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own form_responses" 
ON public.form_responses FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Allow public access for technician form (no auth required for viewing questions)
CREATE POLICY "Public can view active templates" 
ON public.form_templates FOR SELECT USING (is_active = true);

CREATE POLICY "Public can view template questions" 
ON public.form_questions FOR SELECT USING (true);

CREATE POLICY "Public can submit responses" 
ON public.form_responses FOR INSERT WITH CHECK (true);

-- Triggers
CREATE TRIGGER update_form_templates_updated_at
BEFORE UPDATE ON public.form_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
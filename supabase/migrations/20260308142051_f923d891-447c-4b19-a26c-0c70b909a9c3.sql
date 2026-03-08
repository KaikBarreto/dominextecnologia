
-- Create proposal_templates table
CREATE TABLE public.proposal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  preview_color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view proposal_templates" ON public.proposal_templates FOR SELECT USING (true);
CREATE POLICY "Admin/gestor can manage proposal_templates" ON public.proposal_templates FOR ALL USING (is_admin_or_gestor(auth.uid())) WITH CHECK (is_admin_or_gestor(auth.uid()));

-- Seed 3 templates
INSERT INTO public.proposal_templates (name, slug, description, preview_color) VALUES
  ('Clássico', 'classico', 'Layout profissional corporativo com tabelas e bordas sutis', '#1e293b'),
  ('Moderno', 'moderno', 'Visual tech/startup com cards arredondados e cores vibrantes', '#3b82f6'),
  ('Minimalista', 'minimalista', 'Design clean estilo Apple com tipografia grande', '#6b7280');

-- Add proposal_template_id to quotes
ALTER TABLE public.quotes ADD COLUMN proposal_template_id uuid REFERENCES public.proposal_templates(id);

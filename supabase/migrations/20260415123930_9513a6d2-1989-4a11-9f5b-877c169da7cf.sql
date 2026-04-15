
-- Admin CRM Stages
CREATE TABLE public.admin_crm_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  position INTEGER NOT NULL DEFAULT 0,
  is_won BOOLEAN NOT NULL DEFAULT false,
  is_lost BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_crm_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can manage admin_crm_stages" ON public.admin_crm_stages FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Admin Leads
CREATE TABLE public.admin_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  company_name TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  value NUMERIC DEFAULT 0,
  probability INTEGER DEFAULT 50,
  expected_close_date DATE,
  source TEXT,
  stage_id UUID REFERENCES public.admin_crm_stages(id) ON DELETE SET NULL,
  notes TEXT,
  loss_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can manage admin_leads" ON public.admin_leads FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Admin Lead Interactions
CREATE TABLE public.admin_lead_interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.admin_leads(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL,
  description TEXT,
  next_action TEXT,
  next_action_date DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_lead_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins can manage admin_lead_interactions" ON public.admin_lead_interactions FOR ALL TO authenticated USING (has_role(auth.uid(), 'super_admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Default admin CRM stages
INSERT INTO public.admin_crm_stages (name, color, position, is_won, is_lost) VALUES
  ('Novo Lead', '#6B7280', 0, false, false),
  ('Contato Feito', '#3B82F6', 1, false, false),
  ('Demonstração', '#8B5CF6', 2, false, false),
  ('Proposta Enviada', '#F59E0B', 3, false, false),
  ('Negociação', '#EF4444', 4, false, false),
  ('Fechado (Ganho)', '#22C55E', 5, true, false),
  ('Fechado (Perdido)', '#DC2626', 6, false, true);

-- Default company origins
INSERT INTO public.company_origins (name, icon, color) VALUES
  ('Tráfego Pago', 'Megaphone', '#EF4444'),
  ('Site/Google', 'Globe', '#3B82F6'),
  ('Facebook/Instagram', 'Share2', '#8B5CF6'),
  ('ChatGPT/IAs', 'Zap', '#F59E0B'),
  ('Indicação', 'UserPlus', '#22C55E'),
  ('BNI', 'Handshake', '#EC4899'),
  ('Parceiro', 'Users', '#06B6D4'),
  ('Feira/Evento', 'MapPin', '#F97316'),
  ('Outros', 'Star', '#6B7280')
ON CONFLICT DO NOTHING;

-- Update demo and tutorial companies to "Outros"
UPDATE public.companies SET origin = 'Outros' WHERE origin IN ('demo', 'tutorial', 'Demo', 'Tutorial');

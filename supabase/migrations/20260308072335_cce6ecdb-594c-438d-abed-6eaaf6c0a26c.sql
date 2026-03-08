
-- 1. Create companies table
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cnpj text,
  email text,
  phone text,
  address text,
  contact_name text,
  origin text,
  subscription_status text NOT NULL DEFAULT 'testing',
  subscription_plan text DEFAULT 'starter',
  subscription_value numeric DEFAULT 0,
  subscription_expires_at timestamptz,
  billing_cycle text DEFAULT 'monthly',
  max_users integer DEFAULT 5,
  trial_days integer DEFAULT 14,
  notes text,
  logo_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Add company_id to profiles FIRST (before policies reference it)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- 3. Create get_user_company_id function
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id
$$;

-- 4. RLS for companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage companies" ON public.companies
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own company" ON public.companies
FOR SELECT TO authenticated
USING (id = public.get_user_company_id(auth.uid()));

-- 5. Create company_origins table
CREATE TABLE public.company_origins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text DEFAULT 'Globe',
  color text DEFAULT '#6B7280',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.company_origins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view origins" ON public.company_origins FOR SELECT USING (true);
CREATE POLICY "Super admins can manage origins" ON public.company_origins
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 6. Create subscription_plans table
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  max_users integer DEFAULT 5,
  description text,
  features jsonb DEFAULT '[]',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active plans" ON public.subscription_plans FOR SELECT USING (true);
CREATE POLICY "Super admins can manage plans" ON public.subscription_plans
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 7. Updated_at trigger
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Seed data
INSERT INTO public.company_origins (name, icon, color) VALUES
  ('Google', 'Search', '#4285F4'),
  ('Site', 'Globe', '#10B981'),
  ('Instagram', 'Instagram', '#E4405F'),
  ('Facebook', 'Facebook', '#1877F2'),
  ('WhatsApp', 'MessageCircle', '#25D366'),
  ('YouTube', 'Youtube', '#FF0000'),
  ('Indicação', 'Users', '#8B5CF6'),
  ('Outros', 'HelpCircle', '#6B7280');

INSERT INTO public.subscription_plans (code, name, price, max_users, description, features) VALUES
  ('starter', 'Starter', 197, 5, 'Para até 5 técnicos', '["OS ilimitadas","App para técnicos","Painel do gestor","Relatórios básicos","Suporte por email"]'),
  ('pro', 'Pro', 497, 20, 'Até 20 técnicos', '["Tudo do Starter +","Rastreamento em tempo real","Manutenções recorrentes","Avaliações de cliente","API de integração","Suporte prioritário"]'),
  ('enterprise', 'Enterprise', 0, 999, 'Técnicos ilimitados', '["Tudo do Pro +","Múltiplas filiais","Gestão de frotas","SLA com alertas","Onboarding dedicado","Gestor de conta"]');

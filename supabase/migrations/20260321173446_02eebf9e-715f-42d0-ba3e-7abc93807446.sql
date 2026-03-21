
-- Tabela de catálogo de módulos/adicionais
CREATE TABLE public.subscription_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  price numeric DEFAULT 0,
  type text DEFAULT 'module' CHECK (type IN ('module', 'addon')),
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.subscription_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active modules"
  ON public.subscription_modules FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Super admins can manage modules"
  ON public.subscription_modules FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Tabela de módulos ativos por empresa
CREATE TABLE public.company_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  module_code text NOT NULL,
  quantity int DEFAULT 1,
  activated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, module_code)
);

ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company modules"
  ON public.company_modules FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage company_modules"
  ON public.company_modules FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Public can view company modules"
  ON public.company_modules FOR SELECT
  TO public
  USING (true);

-- Adicionar included_modules aos planos e extra_users às empresas
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS included_modules jsonb DEFAULT '[]';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS extra_users int DEFAULT 0;

-- Seed dos módulos
INSERT INTO public.subscription_modules (code, name, description, price, type, sort_order) VALUES
  ('basic', 'Módulo Básico', 'OS, Agenda, Dashboard, Orçamentos, Serviços, Mapa, Clientes, Equipamentos, Estoque, Contratos/PMOC, Financeiro Básico + 5 Usuários', 200, 'module', 1),
  ('rh', 'Funcionários / RH', 'Gestão de funcionários, ponto eletrônico, movimentações financeiras de colaboradores', 100, 'module', 2),
  ('crm', 'CRM', 'Funil de vendas, leads, interações e webhooks de captação', 50, 'module', 3),
  ('nfe', 'Emissão de Notas Fiscais', 'Emissão de NF-e e NFS-e integrada ao sistema', 100, 'module', 4),
  ('finance_advanced', 'Financeiro Avançado', 'DRE - Demonstrativo de Resultado, Contas a Pagar e a Receber', 50, 'addon', 5),
  ('pricing_advanced', 'Precificação Avançada', 'BDI, Custos Globais de recursos, precificação detalhada de serviços', 50, 'addon', 6),
  ('customer_portal', 'Portal do Cliente', 'Área exclusiva para o cliente acompanhar OS e equipamentos', 50, 'addon', 7),
  ('white_label', 'White Label', 'Personalização completa da marca: logo, cores e ícone', 50, 'addon', 8),
  ('extra_user', 'Usuário Extra', 'Adicional por usuário acima do limite do plano', 50, 'addon', 9);

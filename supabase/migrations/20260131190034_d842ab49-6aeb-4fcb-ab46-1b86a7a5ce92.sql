-- Enum para roles do sistema
CREATE TYPE public.app_role AS ENUM ('admin', 'gestor', 'tecnico', 'comercial', 'financeiro');

-- Enum para status de OS
CREATE TYPE public.os_status AS ENUM ('pendente', 'em_andamento', 'concluida', 'cancelada');

-- Enum para tipo de OS
CREATE TYPE public.os_type AS ENUM ('manutencao_preventiva', 'manutencao_corretiva', 'instalacao', 'visita_tecnica');

-- Enum para tipo de cliente
CREATE TYPE public.customer_type AS ENUM ('pf', 'pj');

-- Enum para tipo de transação financeira
CREATE TYPE public.transaction_type AS ENUM ('entrada', 'saida');

-- Enum para status do lead no CRM
CREATE TYPE public.lead_status AS ENUM ('lead', 'proposta', 'negociacao', 'fechado_ganho', 'fechado_perdido');

-- Tabela de perfis de usuários
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de roles de usuários (separada para segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, role)
);

-- Tabela de clientes
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_type customer_type NOT NULL DEFAULT 'pj',
  name TEXT NOT NULL,
  document TEXT, -- CPF ou CNPJ
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de equipamentos
CREATE TABLE public.equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  capacity TEXT, -- BTUs, HP, etc
  location TEXT, -- Onde está instalado
  install_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de ordens de serviço
CREATE TABLE public.service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT NOT NULL,
  equipment_id UUID REFERENCES public.equipment(id) ON DELETE SET NULL,
  technician_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  os_type os_type NOT NULL DEFAULT 'manutencao_corretiva',
  status os_status NOT NULL DEFAULT 'pendente',
  scheduled_date DATE,
  scheduled_time TIME,
  description TEXT,
  diagnosis TEXT,
  solution TEXT,
  parts_used JSONB DEFAULT '[]'::jsonb,
  labor_hours DECIMAL(5,2),
  labor_value DECIMAL(10,2),
  parts_value DECIMAL(10,2),
  total_value DECIMAL(10,2),
  check_in_time TIMESTAMP WITH TIME ZONE,
  check_in_location JSONB,
  check_out_time TIMESTAMP WITH TIME ZONE,
  check_out_location JSONB,
  client_signature TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de fotos da OS
CREATE TABLE public.os_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE CASCADE NOT NULL,
  photo_url TEXT NOT NULL,
  photo_type TEXT DEFAULT 'durante', -- antes, durante, depois
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de estoque
CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  unit TEXT DEFAULT 'un',
  quantity DECIMAL(10,2) DEFAULT 0,
  min_quantity DECIMAL(10,2) DEFAULT 0,
  cost_price DECIMAL(10,2),
  sale_price DECIMAL(10,2),
  supplier TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de movimentações de estoque
CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE NOT NULL,
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL, -- entrada, saida
  quantity DECIMAL(10,2) NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de transações financeiras
CREATE TABLE public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type transaction_type NOT NULL,
  category TEXT,
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  paid_date DATE,
  is_paid BOOLEAN DEFAULT false,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  receipt_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de leads/oportunidades CRM
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status lead_status NOT NULL DEFAULT 'lead',
  value DECIMAL(10,2),
  probability INTEGER DEFAULT 50,
  expected_close_date DATE,
  source TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de interações CRM
CREATE TABLE public.lead_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  interaction_type TEXT NOT NULL, -- ligacao, email, visita, whatsapp
  description TEXT,
  next_action TEXT,
  next_action_date DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de contratos PMOC
CREATE TABLE public.pmoc_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  contract_number TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  monthly_value DECIMAL(10,2),
  maintenance_frequency TEXT, -- mensal, bimestral, trimestral
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de agendamentos PMOC
CREATE TABLE public.pmoc_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES public.pmoc_contracts(id) ON DELETE CASCADE NOT NULL,
  equipment_id UUID REFERENCES public.equipment(id) ON DELETE CASCADE NOT NULL,
  scheduled_month INTEGER NOT NULL, -- 1-12
  scheduled_year INTEGER NOT NULL,
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmoc_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmoc_schedules ENABLE ROW LEVEL SECURITY;

-- Função para verificar role (security definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Função para verificar se é admin ou gestor
CREATE OR REPLACE FUNCTION public.is_admin_or_gestor(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'gestor')
  )
$$;

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_equipment_updated_at BEFORE UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_service_orders_updated_at BEFORE UPDATE ON public.service_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_financial_transactions_updated_at BEFORE UPDATE ON public.financial_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pmoc_contracts_updated_at BEFORE UPDATE ON public.pmoc_contracts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies para profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin_or_gestor(auth.uid()));

-- RLS Policies para user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies para customers (todos autenticados podem ver)
CREATE POLICY "Authenticated users can view customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and gestors can manage customers" ON public.customers FOR ALL USING (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY "Comercial can manage customers" ON public.customers FOR ALL USING (public.has_role(auth.uid(), 'comercial'));

-- RLS Policies para equipment
CREATE POLICY "Authenticated users can view equipment" ON public.equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and gestors can manage equipment" ON public.equipment FOR ALL USING (public.is_admin_or_gestor(auth.uid()));

-- RLS Policies para service_orders
CREATE POLICY "Users can view own assigned OS" ON public.service_orders FOR SELECT USING (auth.uid() = technician_id OR auth.uid() = created_by);
CREATE POLICY "Admins and gestors can view all OS" ON public.service_orders FOR SELECT USING (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY "Admins and gestors can manage OS" ON public.service_orders FOR ALL USING (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY "Technicians can update own assigned OS" ON public.service_orders FOR UPDATE USING (auth.uid() = technician_id);

-- RLS Policies para os_photos
CREATE POLICY "Users can view OS photos" ON public.os_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can add photos to OS" ON public.os_photos FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies para inventory
CREATE POLICY "Authenticated users can view inventory" ON public.inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage inventory" ON public.inventory FOR ALL USING (public.is_admin_or_gestor(auth.uid()));

-- RLS Policies para inventory_movements
CREATE POLICY "Authenticated users can view movements" ON public.inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create movements" ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies para financial_transactions
CREATE POLICY "Financeiro can manage transactions" ON public.financial_transactions FOR ALL USING (public.has_role(auth.uid(), 'financeiro') OR public.is_admin_or_gestor(auth.uid()));

-- RLS Policies para leads
CREATE POLICY "Comercial can manage leads" ON public.leads FOR ALL USING (public.has_role(auth.uid(), 'comercial') OR public.is_admin_or_gestor(auth.uid()));
CREATE POLICY "Users can view assigned leads" ON public.leads FOR SELECT USING (auth.uid() = assigned_to);

-- RLS Policies para lead_interactions
CREATE POLICY "Users can view lead interactions" ON public.lead_interactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Comercial can manage interactions" ON public.lead_interactions FOR ALL USING (public.has_role(auth.uid(), 'comercial') OR public.is_admin_or_gestor(auth.uid()));

-- RLS Policies para PMOC
CREATE POLICY "Authenticated users can view PMOC contracts" ON public.pmoc_contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage PMOC contracts" ON public.pmoc_contracts FOR ALL USING (public.is_admin_or_gestor(auth.uid()));

CREATE POLICY "Authenticated users can view PMOC schedules" ON public.pmoc_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage PMOC schedules" ON public.pmoc_schedules FOR ALL USING (public.is_admin_or_gestor(auth.uid()));

-- Função para criar profile automaticamente no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para criar profile no signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- =============================================
-- Bloco 1: Admin Users + Financeiro Admin
-- =============================================

-- 1) admin_permissions
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_admin_permissions_user ON public.admin_permissions(user_id);

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view admin_permissions"
  ON public.admin_permissions FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert admin_permissions"
  ON public.admin_permissions FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update admin_permissions"
  ON public.admin_permissions FOR UPDATE
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete admin_permissions"
  ON public.admin_permissions FOR DELETE
  USING (public.is_super_admin(auth.uid()));

-- Allow each user to view their own permissions (for useAdminPermissions hook)
CREATE POLICY "Users can view their own admin_permissions"
  ON public.admin_permissions FOR SELECT
  USING (auth.uid() = user_id);

-- 2) admin_financial_categories
CREATE TABLE IF NOT EXISTS public.admin_financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  label text NOT NULL,
  type text NOT NULL CHECK (type IN ('income','expense')),
  color text NOT NULL DEFAULT '#10b981',
  icon text,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_financial_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view admin_financial_categories"
  ON public.admin_financial_categories FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert admin_financial_categories"
  ON public.admin_financial_categories FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update admin_financial_categories"
  ON public.admin_financial_categories FOR UPDATE
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete non-system admin_financial_categories"
  ON public.admin_financial_categories FOR DELETE
  USING (public.is_super_admin(auth.uid()) AND is_system = false);

CREATE TRIGGER trg_admin_financial_categories_updated_at
  BEFORE UPDATE ON public.admin_financial_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Add user_id to salespeople
ALTER TABLE public.salespeople
  ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_salespeople_user_id
  ON public.salespeople(user_id)
  WHERE user_id IS NOT NULL;

-- 4) Seed default admin financial categories
INSERT INTO public.admin_financial_categories (name, label, type, color, icon, is_system, sort_order) VALUES
  ('sale', 'Vendas', 'income', '#10b981', 'TrendingUp', true, 1),
  ('first_sale', 'Venda Nova', 'income', '#22c55e', 'Sparkles', true, 2),
  ('renewal', 'Renovações', 'income', '#06b6d4', 'RefreshCw', true, 3),
  ('upgrade', 'Upgrade', 'income', '#8b5cf6', 'ArrowUp', true, 4),
  ('partner_contribution', 'Aporte de Sócios', 'income', '#f59e0b', 'HandCoins', true, 5),
  ('other_income', 'Outras Receitas', 'income', '#64748b', 'Plus', true, 6),
  ('salary', 'Salários', 'expense', '#ef4444', 'Users', true, 10),
  ('commission', 'Comissões', 'expense', '#f97316', 'Percent', true, 11),
  ('advance', 'Adiantamentos', 'expense', '#eab308', 'Wallet', true, 12),
  ('marketing', 'Marketing', 'expense', '#ec4899', 'Megaphone', true, 13),
  ('development', 'Desenvolvimento', 'expense', '#6366f1', 'Code', true, 14),
  ('infrastructure', 'Infraestrutura', 'expense', '#0ea5e9', 'Server', true, 15),
  ('tools', 'Ferramentas', 'expense', '#14b8a6', 'Wrench', true, 16),
  ('administrative', 'Administrativo', 'expense', '#a855f7', 'Briefcase', true, 17),
  ('impostos', 'Impostos', 'expense', '#dc2626', 'Receipt', true, 18),
  ('asaas_fee', 'Taxa Asaas', 'expense', '#7c3aed', 'CreditCard', true, 19),
  ('other_expense', 'Outras Despesas', 'expense', '#64748b', 'Minus', true, 20)
ON CONFLICT (name) DO NOTHING;
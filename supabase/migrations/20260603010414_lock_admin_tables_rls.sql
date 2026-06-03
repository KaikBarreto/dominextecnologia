-- v1.9.26 frente 2: lock RLS das admin_* tables.
-- Decisão CEO 2026-06-02: tabelas admin_* são SHARED entre vendedores Auctus
-- (não isoladas por vendedor), mas RLS precisa garantir que SÓ super_admin OU
-- usuários com entrada em admin_permissions consigam ler/escrever.
--
-- Helper canônico já existente: public.is_admin_user(user_id) — retorna true sse
--   is_super_admin(user_id) OR EXISTS (admin_permissions WHERE user_id = ...)
-- Reaproveitamos esse helper em vez de criar duplicata `is_admin_panel_user`.
--
-- Escopo desta migration:
--   1. admin_crm_stages — abrir manage pra is_admin_user (hoje só super_admin).
--   2. admin_financial_categories — abrir INSERT/UPDATE/DELETE pra is_admin_user
--      (hoje só super_admin), preservando guard is_system=false no DELETE.
--   3. admin_financial_transactions — abrir INSERT/UPDATE/DELETE pra is_admin_user
--      (hoje só super_admin).
--   4. admin_leads, admin_lead_interactions — já corretas (super_admin OR
--      has_admin_permission('admin_crm')). Não tocar.
--   5. admin_permissions — já correta. Não tocar.
--
-- Idempotente: DROP POLICY IF EXISTS antes de CREATE.

-- =============================================================================
-- admin_crm_stages
-- =============================================================================

ALTER TABLE public.admin_crm_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can manage admin_crm_stages" ON public.admin_crm_stages;
DROP POLICY IF EXISTS "Admin CRM users can view admin_crm_stages" ON public.admin_crm_stages;
DROP POLICY IF EXISTS "Admin panel users manage admin_crm_stages" ON public.admin_crm_stages;

CREATE POLICY "Admin panel users manage admin_crm_stages"
  ON public.admin_crm_stages FOR ALL TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

-- =============================================================================
-- admin_financial_categories
-- =============================================================================

ALTER TABLE public.admin_financial_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin users can view admin_financial_categories" ON public.admin_financial_categories;
DROP POLICY IF EXISTS "Super admins can insert admin_financial_categories" ON public.admin_financial_categories;
DROP POLICY IF EXISTS "Super admins can update admin_financial_categories" ON public.admin_financial_categories;
DROP POLICY IF EXISTS "Super admins can delete non-system admin_financial_categories" ON public.admin_financial_categories;
DROP POLICY IF EXISTS "Admin panel users view admin_financial_categories" ON public.admin_financial_categories;
DROP POLICY IF EXISTS "Admin panel users insert admin_financial_categories" ON public.admin_financial_categories;
DROP POLICY IF EXISTS "Admin panel users update admin_financial_categories" ON public.admin_financial_categories;
DROP POLICY IF EXISTS "Admin panel users delete non-system admin_financial_categories" ON public.admin_financial_categories;

CREATE POLICY "Admin panel users view admin_financial_categories"
  ON public.admin_financial_categories FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Admin panel users insert admin_financial_categories"
  ON public.admin_financial_categories FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user(auth.uid()));

CREATE POLICY "Admin panel users update admin_financial_categories"
  ON public.admin_financial_categories FOR UPDATE TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

-- DELETE preserva guard de categoria de sistema (is_system=false).
CREATE POLICY "Admin panel users delete non-system admin_financial_categories"
  ON public.admin_financial_categories FOR DELETE TO authenticated
  USING (public.is_admin_user(auth.uid()) AND (is_system = false));

-- =============================================================================
-- admin_financial_transactions
-- =============================================================================

ALTER TABLE public.admin_financial_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin users can view admin_financial_transactions" ON public.admin_financial_transactions;
DROP POLICY IF EXISTS "Super admins can insert admin_financial_transactions" ON public.admin_financial_transactions;
DROP POLICY IF EXISTS "Super admins can update admin_financial_transactions" ON public.admin_financial_transactions;
DROP POLICY IF EXISTS "Super admins can delete admin_financial_transactions" ON public.admin_financial_transactions;
DROP POLICY IF EXISTS "Admin panel users view admin_financial_transactions" ON public.admin_financial_transactions;
DROP POLICY IF EXISTS "Admin panel users insert admin_financial_transactions" ON public.admin_financial_transactions;
DROP POLICY IF EXISTS "Admin panel users update admin_financial_transactions" ON public.admin_financial_transactions;
DROP POLICY IF EXISTS "Admin panel users delete admin_financial_transactions" ON public.admin_financial_transactions;

CREATE POLICY "Admin panel users view admin_financial_transactions"
  ON public.admin_financial_transactions FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Admin panel users insert admin_financial_transactions"
  ON public.admin_financial_transactions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user(auth.uid()));

CREATE POLICY "Admin panel users update admin_financial_transactions"
  ON public.admin_financial_transactions FOR UPDATE TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

CREATE POLICY "Admin panel users delete admin_financial_transactions"
  ON public.admin_financial_transactions FOR DELETE TO authenticated
  USING (public.is_admin_user(auth.uid()));

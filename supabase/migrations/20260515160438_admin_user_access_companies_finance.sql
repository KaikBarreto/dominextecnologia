-- =============================================================
-- Painel master Auctus: abrir leitura/edição pra "admin do painel"
-- (vendedor admin) em companies + financeiro admin.
-- =============================================================
-- Contexto:
--   Hoje as tabelas companies, company_payments,
--   admin_financial_transactions e admin_financial_categories
--   estao restritas a is_super_admin(). Resultado: vendedor admin
--   (ex: Maicon) abre o painel master e ve telas vazias.
--
-- Decisao aprovada pelo CEO:
--   - companies: vendedor admin pode VER todas as empresas e
--     EDITAR (UPDATE). INSERT/DELETE continuam super_admin only.
--   - company_payments, admin_financial_transactions,
--     admin_financial_categories: vendedor admin pode VER
--     (SELECT). INSERT/UPDATE/DELETE continuam super_admin only.
--   - Domiflix: fora do escopo. Continua super_admin no banco;
--     sidebar filtra no frontend.
--
-- Helper public.is_admin_user(uuid) ja existe na migration
-- 20260512205543 e cobre super_admin + qualquer linha em
-- admin_permissions.
--
-- A policy "Users can view own company" (tenant comum acessa
-- a propria empresa) e PRESERVADA — nao mexer.
-- =============================================================


-- -----------------------------------------------------------------
-- Parte 1: companies
-- -----------------------------------------------------------------
-- Drop a policy antiga FOR ALL super_admin e cria 4 explicitas.
-- A policy "Users can view own company" e PRESERVADA.
DROP POLICY IF EXISTS "Super admins can manage companies" ON public.companies;
-- Limpar possiveis re-runs:
DROP POLICY IF EXISTS "Admin users and own company can view companies" ON public.companies;
DROP POLICY IF EXISTS "Super admins can insert companies" ON public.companies;
DROP POLICY IF EXISTS "Admin users can update companies" ON public.companies;
DROP POLICY IF EXISTS "Super admins can delete companies" ON public.companies;

-- SELECT: admin do painel master OU usuario do tenant da propria empresa.
-- Substitui o antigo "Users can view own company" tambem (consolidado).
DROP POLICY IF EXISTS "Users can view own company" ON public.companies;

CREATE POLICY "Admin users and own company can view companies"
  ON public.companies FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user(auth.uid())
    OR id = public.get_user_company_id(auth.uid())
  );

-- INSERT: so super_admin (criar empresa nova e funcao de master Auctus)
CREATE POLICY "Super admins can insert companies"
  ON public.companies FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

-- UPDATE: admin do painel master pode editar dados de empresa
CREATE POLICY "Admin users can update companies"
  ON public.companies FOR UPDATE
  TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

-- DELETE: so super_admin
CREATE POLICY "Super admins can delete companies"
  ON public.companies FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));


-- -----------------------------------------------------------------
-- Parte 2: company_payments
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "Super admins can manage company_payments" ON public.company_payments;
DROP POLICY IF EXISTS "Admin users can view company_payments" ON public.company_payments;
DROP POLICY IF EXISTS "Super admins can insert company_payments" ON public.company_payments;
DROP POLICY IF EXISTS "Super admins can update company_payments" ON public.company_payments;
DROP POLICY IF EXISTS "Super admins can delete company_payments" ON public.company_payments;

CREATE POLICY "Admin users can view company_payments"
  ON public.company_payments FOR SELECT
  TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Super admins can insert company_payments"
  ON public.company_payments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update company_payments"
  ON public.company_payments FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete company_payments"
  ON public.company_payments FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));


-- -----------------------------------------------------------------
-- Parte 3: admin_financial_transactions
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "Super admins can manage admin_financial_transactions" ON public.admin_financial_transactions;
DROP POLICY IF EXISTS "Admin users can view admin_financial_transactions" ON public.admin_financial_transactions;
DROP POLICY IF EXISTS "Super admins can insert admin_financial_transactions" ON public.admin_financial_transactions;
DROP POLICY IF EXISTS "Super admins can update admin_financial_transactions" ON public.admin_financial_transactions;
DROP POLICY IF EXISTS "Super admins can delete admin_financial_transactions" ON public.admin_financial_transactions;

CREATE POLICY "Admin users can view admin_financial_transactions"
  ON public.admin_financial_transactions FOR SELECT
  TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Super admins can insert admin_financial_transactions"
  ON public.admin_financial_transactions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update admin_financial_transactions"
  ON public.admin_financial_transactions FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete admin_financial_transactions"
  ON public.admin_financial_transactions FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));


-- -----------------------------------------------------------------
-- Parte 4: admin_financial_categories
-- -----------------------------------------------------------------
-- A policy de DELETE original tinha condicao especial (is_system = false).
-- Preservar essa restricao na nova policy de DELETE.
DROP POLICY IF EXISTS "Super admins can view admin_financial_categories" ON public.admin_financial_categories;
DROP POLICY IF EXISTS "Super admins can insert admin_financial_categories" ON public.admin_financial_categories;
DROP POLICY IF EXISTS "Super admins can update admin_financial_categories" ON public.admin_financial_categories;
DROP POLICY IF EXISTS "Super admins can delete non-system admin_financial_categories" ON public.admin_financial_categories;
DROP POLICY IF EXISTS "Admin users can view admin_financial_categories" ON public.admin_financial_categories;
DROP POLICY IF EXISTS "Super admins can delete admin_financial_categories" ON public.admin_financial_categories;

CREATE POLICY "Admin users can view admin_financial_categories"
  ON public.admin_financial_categories FOR SELECT
  TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Super admins can insert admin_financial_categories"
  ON public.admin_financial_categories FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update admin_financial_categories"
  ON public.admin_financial_categories FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete non-system admin_financial_categories"
  ON public.admin_financial_categories FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()) AND is_system = false);

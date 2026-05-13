-- =============================================================
-- salespeople: leitura aberta pra "admin do painel master Auctus"
-- =============================================================
-- Contexto: o painel admin Auctus tem dois tipos de usuário:
--   1) super_admin (Kaik) -> full access
--   2) "admin_user" (ex: vendedor admin Maicon) -> usuário com pelo
--      menos uma linha em admin_permissions, normalmente vendedor da
--      Auctus que opera o painel.
--
-- Hoje as 4 tabelas de vendas (salespeople, salesperson_sales,
-- salesperson_advances, salesperson_payments) tem policy `FOR ALL`
-- apenas para is_super_admin(). Resultado: vendedor admin (Maicon)
-- abre a tela "Gerar Link de Cadastro" e o dropdown "Vendedor" vem
-- vazio porque o SELECT em salespeople retorna 0 linhas (RLS barra).
--
-- Solução (Caminho B aprovado pelo CEO):
--   - Criar helper public.is_admin_user(uuid)
--   - Quebrar policy "FOR ALL super_admin" em SELECT/INSERT/UPDATE/DELETE
--   - SELECT fica aberto a is_admin_user
--   - INSERT/UPDATE/DELETE seguem só pra is_super_admin
--   - Criar view salespeople_basic (security_invoker=true) com APENAS
--     colunas não-sensíveis (sem salary, monthly_goal, notes,
--     no_commission). O front muda os 5 callers de dropdown/lookup
--     pra ler dessa view; quem precisa de salário (telas financeiras)
--     continua usando a tabela base e cai na RLS normal.
--
-- A blindagem real de salário é client-side (front pede só colunas
-- da view). Defesa em profundidade fica como YAGNI por ora — todos
-- os admin_users da Auctus são internos. Se virar marketplace de
-- afiliados externos, refatora pra view security_definer.
-- =============================================================


-- -----------------------------------------------------------------
-- Parte 1: helper is_admin_user
-- -----------------------------------------------------------------
-- Retorna true se _user_id é super_admin OU tem qualquer linha em
-- admin_permissions. Usar em policies de leitura quando quisermos
-- abrir dado pro time admin do painel master sem precisar criar
-- role nova.
CREATE OR REPLACE FUNCTION public.is_admin_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.admin_permissions WHERE user_id = _user_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_user(uuid) TO authenticated, service_role;


-- -----------------------------------------------------------------
-- Parte 2: policies em salespeople
-- -----------------------------------------------------------------
-- Drop a policy antiga FOR ALL e cria 4 explícitas.
DROP POLICY IF EXISTS "Super admins manage salespeople" ON public.salespeople;
-- Também limpar possíveis re-runs desta migration:
DROP POLICY IF EXISTS "Admin users can view salespeople" ON public.salespeople;
DROP POLICY IF EXISTS "Super admins can insert salespeople" ON public.salespeople;
DROP POLICY IF EXISTS "Super admins can update salespeople" ON public.salespeople;
DROP POLICY IF EXISTS "Super admins can delete salespeople" ON public.salespeople;

CREATE POLICY "Admin users can view salespeople"
  ON public.salespeople FOR SELECT
  TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Super admins can insert salespeople"
  ON public.salespeople FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update salespeople"
  ON public.salespeople FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete salespeople"
  ON public.salespeople FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));


-- -----------------------------------------------------------------
-- Parte 3: view salespeople_basic (sem colunas sensíveis)
-- -----------------------------------------------------------------
-- security_invoker = true => view herda RLS da tabela base com a
-- identidade do caller. Como salespeople agora libera SELECT pra
-- is_admin_user, a view funciona pra vendedor admin.
DROP VIEW IF EXISTS public.salespeople_basic;

CREATE VIEW public.salespeople_basic
WITH (security_invoker = true)
AS
SELECT
  id,
  name,
  email,
  referral_code,
  is_active,
  user_id
FROM public.salespeople;

GRANT SELECT ON public.salespeople_basic TO authenticated;

COMMENT ON VIEW public.salespeople_basic IS
  'View blindada de salespeople para dropdowns/lookups no painel admin. NUNCA adicionar salary, monthly_goal, notes ou outras colunas sensíveis aqui.';


-- -----------------------------------------------------------------
-- Parte 4: bonus — mesma regra em salesperson_sales
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "Super admins manage salesperson_sales" ON public.salesperson_sales;
DROP POLICY IF EXISTS "Admin users can view salesperson_sales" ON public.salesperson_sales;
DROP POLICY IF EXISTS "Super admins can insert salesperson_sales" ON public.salesperson_sales;
DROP POLICY IF EXISTS "Super admins can update salesperson_sales" ON public.salesperson_sales;
DROP POLICY IF EXISTS "Super admins can delete salesperson_sales" ON public.salesperson_sales;

CREATE POLICY "Admin users can view salesperson_sales"
  ON public.salesperson_sales FOR SELECT
  TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Super admins can insert salesperson_sales"
  ON public.salesperson_sales FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update salesperson_sales"
  ON public.salesperson_sales FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete salesperson_sales"
  ON public.salesperson_sales FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));


-- -----------------------------------------------------------------
-- Parte 5: bonus — mesma regra em salesperson_advances
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "Super admins manage salesperson_advances" ON public.salesperson_advances;
DROP POLICY IF EXISTS "Admin users can view salesperson_advances" ON public.salesperson_advances;
DROP POLICY IF EXISTS "Super admins can insert salesperson_advances" ON public.salesperson_advances;
DROP POLICY IF EXISTS "Super admins can update salesperson_advances" ON public.salesperson_advances;
DROP POLICY IF EXISTS "Super admins can delete salesperson_advances" ON public.salesperson_advances;

CREATE POLICY "Admin users can view salesperson_advances"
  ON public.salesperson_advances FOR SELECT
  TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Super admins can insert salesperson_advances"
  ON public.salesperson_advances FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update salesperson_advances"
  ON public.salesperson_advances FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete salesperson_advances"
  ON public.salesperson_advances FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));


-- -----------------------------------------------------------------
-- Parte 6: bonus — mesma regra em salesperson_payments
-- -----------------------------------------------------------------
DROP POLICY IF EXISTS "Super admins manage salesperson_payments" ON public.salesperson_payments;
DROP POLICY IF EXISTS "Admin users can view salesperson_payments" ON public.salesperson_payments;
DROP POLICY IF EXISTS "Super admins can insert salesperson_payments" ON public.salesperson_payments;
DROP POLICY IF EXISTS "Super admins can update salesperson_payments" ON public.salesperson_payments;
DROP POLICY IF EXISTS "Super admins can delete salesperson_payments" ON public.salesperson_payments;

CREATE POLICY "Admin users can view salesperson_payments"
  ON public.salesperson_payments FOR SELECT
  TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Super admins can insert salesperson_payments"
  ON public.salesperson_payments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update salesperson_payments"
  ON public.salesperson_payments FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete salesperson_payments"
  ON public.salesperson_payments FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

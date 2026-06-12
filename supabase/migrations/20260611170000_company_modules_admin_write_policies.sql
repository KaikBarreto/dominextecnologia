-- =============================================================================
-- company_modules: escrita pra usuário admin não-super com permissão da tela
-- Empresas ('admin_empresas').
--
-- Por quê: o modal de criar/editar empresa no painel admin Auctus agora monta
-- plano "Personalizado" fazendo INSERT/DELETE direto em company_modules do
-- client. Hoje só super_admin tem escrita ("Super admins can manage
-- company_modules", FOR ALL) — um admin com permissão admin_empresas abre o
-- modal mas a escrita falharia silenciosamente na RLS.
--
-- Padrão Forma A (igual às tabelas admin_*, ref. 20260611150000):
--   has_role(auth.uid(), 'super_admin') OR has_admin_permission(auth.uid(), 'admin_empresas')
--
-- NÃO mexe nas policies existentes:
--   - "Super admins can manage company_modules" (ALL, super_admin) — intacta
--   - "Users can view own company modules" (SELECT, tenant) — intacta; o
--     gating de módulos do tenant continua funcionando.
-- Tenant comum continua SEM escrita (nenhuma policy nova o alcança).
-- =============================================================================

-- INSERT
DROP POLICY IF EXISTS "Admins with admin_empresas can insert company_modules"
  ON public.company_modules;
CREATE POLICY "Admins with admin_empresas can insert company_modules"
  ON public.company_modules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_empresas')
  );

-- UPDATE
DROP POLICY IF EXISTS "Admins with admin_empresas can update company_modules"
  ON public.company_modules;
CREATE POLICY "Admins with admin_empresas can update company_modules"
  ON public.company_modules
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_empresas')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_empresas')
  );

-- DELETE
DROP POLICY IF EXISTS "Admins with admin_empresas can delete company_modules"
  ON public.company_modules;
CREATE POLICY "Admins with admin_empresas can delete company_modules"
  ON public.company_modules
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_empresas')
  );

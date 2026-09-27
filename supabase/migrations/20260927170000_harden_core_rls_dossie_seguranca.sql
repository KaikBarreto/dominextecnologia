-- =============================================================================
-- Hardening RLS das 10 tabelas apontadas no dossie de seguranca (2026-09-27)
-- =============================================================================
--
-- O scanner externo marcou respostas REST vazias (200 + []) como tabelas
-- "legiveis sem autenticacao". RLS ja estava habilitado na maior parte delas,
-- mas a auditoria das migrations encontrou riscos reais que justificam uma
-- consolidacao:
--   * policies antigas foram acumuladas de forma aditiva (OR), deixando regras
--     mais amplas anularem regras tenant-scoped posteriores;
--   * company_settings ainda podia ser lida por anon quando a empresa tivesse
--     qualquer portal ativo, sem o token do portal;
--   * user_permissions podia ser administrada cross-tenant;
--   * managers de tenant podiam atribuir super_admin em user_roles;
--   * a policy de bootstrap mais recente nao amarrava user_id/role ao caller;
--   * anon mantinha privilegio de tabela, embora RLS normalmente devolvesse [].
--
-- Estrategia:
--   1. transacao unica (rollback automatico se qualquer assert falhar);
--   2. ENABLE + FORCE RLS nas tabelas sensiveis;
--   3. remove TODAS as policies dessas 10 tabelas e recria uma matriz explicita;
--   4. revoga acesso direto de anon/PUBLIC e concede apenas o minimo a
--      authenticated (service_role conserva o bypass/privilegios do Supabase);
--   5. mantem acesso publico somente por RPCs/edge functions com payload
--      allowlisted e validacao propria, nunca por SELECT direto nestas tabelas.
--
-- Nao ha alteracao de colunas/tipos: src/integrations/supabase/types.ts nao
-- precisa ser regenerado.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- RLS tambem vale para o owner nao-superuser. postgres/service_role continuam
-- cobertos pelas regras nativas de superuser/BYPASSRLS do Supabase.
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.company_modules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_modules   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.companies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events      FORCE ROW LEVEL SECURITY;

-- Elimina policies legadas/duplicadas. A transacao so confirma depois que a
-- matriz completa abaixo e os asserts finais estiverem instalados.
DO $drop_policies$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'profiles',
        'user_roles',
        'user_permissions',
        'admin_permissions',
        'active_sessions',
        'company_settings',
        'user_preferences',
        'company_modules',
        'companies',
        'usage_events'
      ])
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );
  END LOOP;
END
$drop_policies$;

-- A API anon nao precisa de acesso direto a nenhuma destas tabelas. Portais,
-- OS/propostas publicas e cadastro usam RPCs/edge functions especificas.
REVOKE ALL PRIVILEGES ON TABLE
  public.profiles,
  public.user_roles,
  public.user_permissions,
  public.admin_permissions,
  public.active_sessions,
  public.company_settings,
  public.user_preferences,
  public.company_modules,
  public.companies,
  public.usage_events
FROM anon, PUBLIC;

-- Privilegios de tabela sao a primeira barreira; RLS abaixo decide as linhas.
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT SELECT, INSERT ON public.usage_events TO authenticated;

-- ----------------------------------------------------------------------------
-- profiles: own-row; gestores do sistema somente no proprio tenant; super
-- admin global. O proprio usuario nao pode trocar company_id para escalar tenant.
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own unassigned profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND company_id IS NULL
  );

CREATE POLICY "Users can update own profile without changing tenant"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND company_id IS NOT DISTINCT FROM public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "User managers can view tenant profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    public.can_manage_system((SELECT auth.uid()))
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "User managers can update tenant profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    public.can_manage_system((SELECT auth.uid()))
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  )
  WITH CHECK (
    public.can_manage_system((SELECT auth.uid()))
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "Super admins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())));

CREATE POLICY "Super admins can update all profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())))
  WITH CHECK (public.is_super_admin((SELECT auth.uid())));

-- ----------------------------------------------------------------------------
-- user_roles: own-row para leitura; manager somente no tenant e nunca concede,
-- altera ou remove super_admin; super_admin mantem administracao global.
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "User managers can view tenant roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    public.can_manage_users((SELECT auth.uid()))
    AND public.get_profile_company_id(user_id) = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "User managers can insert tenant roles except super admin"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_users((SELECT auth.uid()))
    AND role <> 'super_admin'::public.app_role
    AND public.get_profile_company_id(user_id) = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "User managers can update tenant roles except super admin"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (
    public.can_manage_users((SELECT auth.uid()))
    AND role <> 'super_admin'::public.app_role
    AND public.get_profile_company_id(user_id) = public.get_user_company_id((SELECT auth.uid()))
  )
  WITH CHECK (
    public.can_manage_users((SELECT auth.uid()))
    AND role <> 'super_admin'::public.app_role
    AND public.get_profile_company_id(user_id) = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "User managers can delete tenant roles except super admin"
  ON public.user_roles FOR DELETE TO authenticated
  USING (
    public.can_manage_users((SELECT auth.uid()))
    AND role <> 'super_admin'::public.app_role
    AND public.get_profile_company_id(user_id) = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "Super admins can manage all user roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())))
  WITH CHECK (public.is_super_admin((SELECT auth.uid())));

-- Bootstrap preservado apenas para o primeiro admin: nunca permite escrever
-- role para outro user_id nem criar papel diferente de admin.
CREATE POLICY "First user can bootstrap own admin role"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    public.can_bootstrap_admin()
    AND (SELECT auth.uid()) = user_id
    AND role = 'admin'::public.app_role
  );

-- ----------------------------------------------------------------------------
-- user_permissions: o alvo precisa pertencer ao tenant do manager. Super admin
-- continua global; usuario comum le apenas a propria ACL.
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own permissions"
  ON public.user_permissions FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "User managers can view tenant permissions"
  ON public.user_permissions FOR SELECT TO authenticated
  USING (
    public.can_manage_users((SELECT auth.uid()))
    AND public.get_profile_company_id(user_id) = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "User managers can insert tenant permissions"
  ON public.user_permissions FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_users((SELECT auth.uid()))
    AND public.get_profile_company_id(user_id) = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "User managers can update tenant permissions"
  ON public.user_permissions FOR UPDATE TO authenticated
  USING (
    public.can_manage_users((SELECT auth.uid()))
    AND public.get_profile_company_id(user_id) = public.get_user_company_id((SELECT auth.uid()))
  )
  WITH CHECK (
    public.can_manage_users((SELECT auth.uid()))
    AND public.get_profile_company_id(user_id) = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "User managers can delete tenant permissions"
  ON public.user_permissions FOR DELETE TO authenticated
  USING (
    public.can_manage_users((SELECT auth.uid()))
    AND public.get_profile_company_id(user_id) = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "Super admins can manage all user permissions"
  ON public.user_permissions FOR ALL TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())))
  WITH CHECK (public.is_super_admin((SELECT auth.uid())));

-- ----------------------------------------------------------------------------
-- admin_permissions: ACL do painel master. O usuario le as proprias permissoes;
-- somente super_admin concede/remove permissoes de outros usuarios.
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own admin permissions"
  ON public.admin_permissions FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Super admins can manage admin permissions"
  ON public.admin_permissions FOR ALL TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())))
  WITH CHECK (public.is_super_admin((SELECT auth.uid())));

-- ----------------------------------------------------------------------------
-- active_sessions: token de sessao e estritamente own-row.
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own active sessions"
  ON public.active_sessions FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own active sessions"
  ON public.active_sessions FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own active sessions"
  ON public.active_sessions FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own active sessions"
  ON public.active_sessions FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- company_settings: leitura pelo tenant; escrita por gestor do proprio tenant;
-- super_admin global. Sem SELECT anon direto: portais usam get_portal_data e
-- demais payloads publicos allowlisted.
-- ----------------------------------------------------------------------------
CREATE POLICY "Tenant users can view own company settings"
  ON public.company_settings FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id((SELECT auth.uid())));

CREATE POLICY "System managers can insert own company settings"
  ON public.company_settings FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_system((SELECT auth.uid()))
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "System managers can update own company settings"
  ON public.company_settings FOR UPDATE TO authenticated
  USING (
    public.can_manage_system((SELECT auth.uid()))
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  )
  WITH CHECK (
    public.can_manage_system((SELECT auth.uid()))
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "System managers can delete own company settings"
  ON public.company_settings FOR DELETE TO authenticated
  USING (
    public.can_manage_system((SELECT auth.uid()))
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  );

CREATE POLICY "Super admins can manage all company settings"
  ON public.company_settings FOR ALL TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())))
  WITH CHECK (public.is_super_admin((SELECT auth.uid())));

-- ----------------------------------------------------------------------------
-- user_preferences: preferencia pessoal, nao tenant; estritamente own-row.
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own preferences"
  ON public.user_preferences FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.user_preferences FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own preferences"
  ON public.user_preferences FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- company_modules: tenant le seus modulos. Escrita cross-tenant do painel exige
-- super_admin ou a permissao granular admin_empresas.
-- ----------------------------------------------------------------------------
CREATE POLICY "Tenant users can view own company modules"
  ON public.company_modules FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id((SELECT auth.uid())));

CREATE POLICY "Super admins can manage all company modules"
  ON public.company_modules FOR ALL TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())))
  WITH CHECK (public.is_super_admin((SELECT auth.uid())));

CREATE POLICY "Company admins can insert company modules"
  ON public.company_modules FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_admin_permission((SELECT auth.uid()), 'admin_empresas')
  );

CREATE POLICY "Company admins can update company modules"
  ON public.company_modules FOR UPDATE TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_admin_permission((SELECT auth.uid()), 'admin_empresas')
  )
  WITH CHECK (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_admin_permission((SELECT auth.uid()), 'admin_empresas')
  );

CREATE POLICY "Company admins can delete company modules"
  ON public.company_modules FOR DELETE TO authenticated
  USING (
    public.is_super_admin((SELECT auth.uid()))
    OR public.has_admin_permission((SELECT auth.uid()), 'admin_empresas')
  );

-- ----------------------------------------------------------------------------
-- companies: tenant le a propria empresa; painel master le globalmente;
-- vendedor le empresas de sua carteira. Mutacao exige permissao adequada.
-- ----------------------------------------------------------------------------
CREATE POLICY "Tenant users can view own company"
  ON public.companies FOR SELECT TO authenticated
  USING (id = public.get_user_company_id((SELECT auth.uid())));

CREATE POLICY "Admin users can view all companies"
  ON public.companies FOR SELECT TO authenticated
  USING (public.is_admin_user((SELECT auth.uid())));

CREATE POLICY "Salespeople can view assigned companies"
  ON public.companies FOR SELECT TO authenticated
  USING (salesperson_id = public.current_salesperson_id());

CREATE POLICY "Super admins can insert companies"
  ON public.companies FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin((SELECT auth.uid())));

CREATE POLICY "Admin users can update companies"
  ON public.companies FOR UPDATE TO authenticated
  USING (public.is_admin_user((SELECT auth.uid())))
  WITH CHECK (public.is_admin_user((SELECT auth.uid())));

CREATE POLICY "Super admins can delete companies"
  ON public.companies FOR DELETE TO authenticated
  USING (public.is_super_admin((SELECT auth.uid())));

-- ----------------------------------------------------------------------------
-- usage_events: leitura cross-tenant apenas no painel admin; escrita client-side
-- exige company_id do tenant autenticado. service_role conserva bypass para
-- eventos de sistema.
-- ----------------------------------------------------------------------------
CREATE POLICY "Admin users can view usage events"
  ON public.usage_events FOR SELECT TO authenticated
  USING (public.is_admin_user((SELECT auth.uid())));

CREATE POLICY "Users can insert own company usage events"
  ON public.usage_events FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND company_id = public.get_user_company_id((SELECT auth.uid()))
  );

-- ----------------------------------------------------------------------------
-- Asserts de seguranca: qualquer divergencia aborta e reverte a migration.
-- ----------------------------------------------------------------------------
DO $audit$
DECLARE
  v_table text;
  v_tables constant text[] := ARRAY[
    'profiles',
    'user_roles',
    'user_permissions',
    'admin_permissions',
    'active_sessions',
    'company_settings',
    'user_preferences',
    'company_modules',
    'companies',
    'usage_events'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS/FORCE RLS ausente em public.%', v_table;
    END IF;

    IF has_table_privilege('anon', format('public.%I', v_table), 'SELECT') THEN
      RAISE EXCEPTION 'anon ainda possui SELECT em public.%', v_table;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table
        AND (
          'public' = ANY (roles)
          OR 'anon' = ANY (roles)
        )
    ) THEN
      RAISE EXCEPTION 'policy TO PUBLIC/anon detectada em public.%', v_table;
    END IF;
  END LOOP;
END
$audit$;

COMMIT;

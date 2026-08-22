-- =====================================================================
-- Recebimento do Cliente Final via Asaas — RLS (Onda 1)
-- =====================================================================
-- Regra-lei: segurança é RLS, não filtro client. Isolamento por company_id
-- usando os helpers REAIS do codebase:
--   get_user_company_id(auth.uid())  → company do usuário
--   is_super_admin(auth.uid())       → bypass de super admin
--
-- MEMÓRIA CRÍTICA DO TIME (incidente VS PROJECT 2026-08-20): política ALL
-- sem o predicado de company_id em USING **E** WITH CHECK VAZA cross-tenant.
-- Aqui toda política ALL carrega o predicado nos DOIS lados.
--
-- service_role (edge) tem acesso total (webhook, provisionamento, criação
-- de cobrança rodam server-side com service_role).
-- =====================================================================


-- =====================================================================
-- tenant_payment_accounts
-- =====================================================================
ALTER TABLE public.tenant_payment_accounts ENABLE ROW LEVEL SECURITY;

-- Edge (provisionamento / gravação de referências do Vault) roda server-side.
DROP POLICY IF EXISTS "service_role_full_access_tenant_payment_accounts" ON public.tenant_payment_accounts;
CREATE POLICY "service_role_full_access_tenant_payment_accounts"
  ON public.tenant_payment_accounts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Usuário da company gerencia a conta da própria company; super admin bypassa.
-- Predicado idêntico em USING e WITH CHECK (anti-vazamento cross-tenant).
DROP POLICY IF EXISTS "Company can manage own payment account" ON public.tenant_payment_accounts;
CREATE POLICY "Company can manage own payment account"
  ON public.tenant_payment_accounts FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
  );


-- =====================================================================
-- tenant_charges
-- =====================================================================
ALTER TABLE public.tenant_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_tenant_charges" ON public.tenant_charges;
CREATE POLICY "service_role_full_access_tenant_charges"
  ON public.tenant_charges FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Company can manage own charges" ON public.tenant_charges;
CREATE POLICY "Company can manage own charges"
  ON public.tenant_charges FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
  );


-- =====================================================================
-- tenant_payment_webhook_events
-- =====================================================================
-- Escrita SÓ via service_role (edge). Usuário autenticado só LÊ os eventos
-- da própria company (auditoria/diagnóstico); super admin lê tudo.
-- Sem política de INSERT/UPDATE/DELETE para authenticated = negado por padrão.
-- =====================================================================
ALTER TABLE public.tenant_payment_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_tenant_payment_webhook_events" ON public.tenant_payment_webhook_events;
CREATE POLICY "service_role_full_access_tenant_payment_webhook_events"
  ON public.tenant_payment_webhook_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Company can view own webhook events" ON public.tenant_payment_webhook_events;
CREATE POLICY "Company can view own webhook events"
  ON public.tenant_payment_webhook_events FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
  );

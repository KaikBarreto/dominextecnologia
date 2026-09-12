-- tenant_charges e tenant_subscriptions são espelho de gateway de pagamento
-- externo (Asaas). Toda escrita tem que passar pela edge function
-- (service_role), que sincroniza os dois lados. Com policy `FOR ALL` pra
-- `authenticated`, qualquer usuário da empresa podia UPDATE/DELETE direto via
-- PostgREST: a linha some do nosso banco, mas a cobrança continua viva e
-- pagável no gateway — o sistema acha que não existe, o cliente paga assim
-- mesmo.
--
-- Regra-lei: uma policy por comando, nunca `FOR ALL` (policies permissivas
-- somam por OR e uma `FOR ALL` sombreia qualquer restrição futura).
--
-- Front confirmado: só leitura nesses dois caminhos (useTenantCharges,
-- useQuoteChargedIds, useTenantSubscriptions) — zero .insert/.update/.upsert/
-- .delete no repo. Restringir `authenticated` a SELECT é seguro.

-- 1) tenant_charges ---------------------------------------------------------

DROP POLICY IF EXISTS "Company can manage own charges" ON public.tenant_charges;

CREATE POLICY "Company can view own charges"
  ON public.tenant_charges FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR company_id = (SELECT public.get_user_company_id(auth.uid()))
  );

-- ACL: authenticated só precisa de SELECT (escrita é via edge/service_role).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tenant_charges FROM authenticated;
GRANT SELECT ON public.tenant_charges TO authenticated;

-- anon não tem policy nenhuma nesta tabela (RLS já bloqueia por padrão), mas
-- o pg_default_acl deste schema concede grants amplos em tabela nova — fecha
-- o ACL também, defesa em profundidade.
REVOKE ALL ON public.tenant_charges FROM anon;

-- 2) tenant_subscriptions ----------------------------------------------------

DROP POLICY IF EXISTS "Company can manage own subscriptions" ON public.tenant_subscriptions;

CREATE POLICY "Company can view own subscriptions"
  ON public.tenant_subscriptions FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR company_id = (SELECT public.get_user_company_id(auth.uid()))
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tenant_subscriptions FROM authenticated;
GRANT SELECT ON public.tenant_subscriptions TO authenticated;

REVOKE ALL ON public.tenant_subscriptions FROM anon;

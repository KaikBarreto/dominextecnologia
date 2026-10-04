-- ============================================================================
-- Vigencia canonica da assinatura + enforcement RLS no nucleo critico
-- ============================================================================
-- Cobertura desta etapa: customers, service_orders e financial_transactions.
-- As policies anon dos portais publicos nao sao alteradas. service_role segue
-- com BYPASSRLS e os fluxos de checkout continuam operando em companies/edges.
-- As demais tabelas autenticadas ficam para uma expansao auditada posterior.

CREATE OR REPLACE FUNCTION public.tenant_subscription_allows_access(
  _company_id uuid,
  _at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
     FROM public.companies AS company
     WHERE company.id = _company_id
       -- Evita usar a RPC para sondar a vigencia de outro tenant. Policies ja
       -- comparam company_id, mas a funcao public tambem precisa se defender.
       AND (
         (SELECT auth.role()) = 'service_role'
         OR (SELECT public.is_super_admin(auth.uid()))
         OR _company_id = (SELECT public.get_user_company_id(auth.uid()))
       )
       AND (
         (
           company.subscription_status = 'pending_payment'
           AND company.payment_lock_bypass IS TRUE
         )
         OR (
           company.subscription_status = 'testing'
           AND company.subscription_expires_at IS NOT NULL
           AND (company.subscription_expires_at AT TIME ZONE 'UTC')::date
               >= (_at AT TIME ZONE 'UTC')::date
         )
         OR (
           company.subscription_status = 'active'
           AND (
             company.subscription_expires_at IS NULL
             OR (company.subscription_expires_at AT TIME ZONE 'UTC')::date + 1
                >= (_at AT TIME ZONE 'UTC')::date
           )
         )
       )
  );
$function$;

COMMENT ON FUNCTION public.tenant_subscription_allows_access(uuid, timestamptz) IS
  'Fonte canonica de entitlement do tenant atual: trial vale ate o vencimento; assinatura active tem 1 dia de carencia; pending_payment exige bypass explicito; status desconhecido/inactive falha fechado; outro tenant nao pode ser sondado.';

REVOKE ALL ON FUNCTION public.tenant_subscription_allows_access(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_subscription_allows_access(uuid, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.tenant_subscription_allows_access(uuid, timestamptz)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- customers: remove todas as policies autenticadas permissivas conhecidas para
-- que nenhuma policy paralela transforme o gate em OR e reabra o acesso.
-- A policy anon "Public can view customer by portal token" fica intacta.
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers visible to own company" ON public.customers;
DROP POLICY IF EXISTS "Users view own company customers" ON public.customers;
DROP POLICY IF EXISTS "Users insert own company customers" ON public.customers;
DROP POLICY IF EXISTS "Users update own company customers" ON public.customers;
DROP POLICY IF EXISTS "Users delete own company customers" ON public.customers;

CREATE POLICY "Users view entitled own company customers"
  ON public.customers FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
    )
  );

CREATE POLICY "Users insert entitled own company customers"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
    )
  );

CREATE POLICY "Users update entitled own company customers"
  ON public.customers FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
    )
  );

CREATE POLICY "Users delete entitled own company customers"
  ON public.customers FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
    )
  );

-- ---------------------------------------------------------------------------
-- service_orders: a policy RESTRICTIVE de visibilidade de tarefas permanece e
-- continua estreitando esta policy. A policy anon do portal permanece intacta.
-- ---------------------------------------------------------------------------
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service orders visible to own company" ON public.service_orders;
DROP POLICY IF EXISTS "Users manage own company service_orders" ON public.service_orders;

CREATE POLICY "Users manage entitled own company service_orders"
  ON public.service_orders FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
    )
  );

-- ---------------------------------------------------------------------------
-- financial_transactions: preserva a exigencia adicional de can_delete_finance
-- no DELETE e acrescenta vigencia a SELECT/INSERT/UPDATE/DELETE.
-- ---------------------------------------------------------------------------
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own company financial_transactions"
  ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can insert own company financial_transactions"
  ON public.financial_transactions;
DROP POLICY IF EXISTS "Users can update own company financial_transactions"
  ON public.financial_transactions;
DROP POLICY IF EXISTS "Managers can delete own company financial_transactions"
  ON public.financial_transactions;

CREATE POLICY "Users can view entitled own company financial_transactions"
  ON public.financial_transactions FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
    )
  );

CREATE POLICY "Users can insert entitled own company financial_transactions"
  ON public.financial_transactions FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
    )
  );

CREATE POLICY "Users can update entitled own company financial_transactions"
  ON public.financial_transactions FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
    )
  )
  WITH CHECK (
    (SELECT public.is_super_admin(auth.uid()))
    OR (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
    )
  );

CREATE POLICY "Managers can delete entitled own company financial_transactions"
  ON public.financial_transactions FOR DELETE TO authenticated
  USING (
    (
      (SELECT public.is_super_admin(auth.uid()))
      OR (
        company_id = (SELECT public.get_user_company_id(auth.uid()))
        AND public.tenant_subscription_allows_access(company_id)
      )
    )
    AND (SELECT public.can_delete_finance(auth.uid()))
  );

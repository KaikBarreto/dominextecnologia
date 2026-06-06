-- ============================================================
-- Asaas — Bloco 1: schema de fundação (clone adaptado do EcoSistema)
-- Decisões: docs/decisoes/2026-06-04-asaas.md
--
-- Escopo desta migration (ADITIVO E NÃO-DESTRUTIVO):
--   1. ALTER companies: colunas de integração Asaas + ltv + payment_method.
--   2. CREATE subscription_payments (cada cobrança Asaas da assinatura SaaS).
--   3. CREATE subscription_cancellation_requests (pedidos de cancelamento).
--   4. ALTER company_payments: asaas_payment_id (nullable, sem unique —
--      há pagamentos manuais sem ele).
--   5. RLS nas 2 tabelas novas seguindo o padrão de company_payments
--      (helpers is_admin_user / is_super_admin / get_user_company_id).
--
-- IMPORTANTE: asaas_customer_id e asaas_payment_id são IDs GLOBAIS da
-- Asaas (cus_* / pay_* / aut_* / sub_*). UNIQUE global é correto aqui —
-- NÃO usar company_id no unique (não é dado de tenant, é id externo).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS antes de CREATE.
-- ============================================================


-- =============================================================================
-- 1. companies — colunas de integração Asaas
-- =============================================================================

-- Cliente Asaas (cus_*). Um company_id ↔ no máximo um customer Asaas.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;

-- ID da recorrência: sub_* (cartão) ou aut_* (PIX automático).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT;

-- Próximo valor após downgrade agendado.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS pending_subscription_value NUMERIC(14,2);

-- LTV acumulado (somatório de cobranças confirmadas). NOT NULL DEFAULT 0.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ltv NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Método de pagamento corrente da assinatura (PIX / CREDIT_CARD / BOLETO).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Índice ÚNICO PARCIAL: garante 1 customer Asaas por empresa, mas permite
-- múltiplas empresas com asaas_customer_id NULL (ainda não integradas).
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_asaas_customer_id
  ON public.companies (asaas_customer_id)
  WHERE asaas_customer_id IS NOT NULL;

-- Índice simples parcial pra lookup por recorrência (webhook resolve company).
CREATE INDEX IF NOT EXISTS idx_companies_asaas_subscription_id
  ON public.companies (asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL;


-- =============================================================================
-- 2. subscription_payments — cada cobrança Asaas da assinatura SaaS Auctus
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  asaas_customer_id TEXT,
  asaas_payment_id TEXT UNIQUE,             -- pay_* ou aut_* (id global Asaas)
  amount NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING/OVERDUE/RECEIVED/CONFIRMED/CANCELLED
  billing_type TEXT,                        -- PIX/BOLETO/CREDIT_CARD
  billing_cycle TEXT,                       -- monthly/yearly
  due_date DATE,
  paid_at TIMESTAMPTZ,
  pix_qr_code TEXT,
  pix_copy_paste TEXT,
  pix_expiration_date TIMESTAMPTZ,
  invoice_url TEXT,
  payment_method TEXT,
  type TEXT,                                -- primeira_venda/renovacao
  ltv_credited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_company_created
  ON public.subscription_payments (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_status
  ON public.subscription_payments (status);

-- updated_at automático (reaproveita helper canônico do projeto).
DROP TRIGGER IF EXISTS update_subscription_payments_updated_at ON public.subscription_payments;
CREATE TRIGGER update_subscription_payments_updated_at
  BEFORE UPDATE ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================================
-- 3. subscription_cancellation_requests — pedidos de cancelamento da assinatura
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_cancellation_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id),
  reason TEXT NOT NULL,
  reason_details TEXT,
  status TEXT NOT NULL DEFAULT 'approved',  -- pending/approved/resolved
  scheduled_cancellation_date DATE,
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES auth.users(id),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_cancellation_requests_company_created
  ON public.subscription_cancellation_requests (company_id, created_at DESC);

DROP TRIGGER IF EXISTS update_subscription_cancellation_requests_updated_at ON public.subscription_cancellation_requests;
CREATE TRIGGER update_subscription_cancellation_requests_updated_at
  BEFORE UPDATE ON public.subscription_cancellation_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================================
-- 4. company_payments — asaas_payment_id (nullable, SEM unique)
-- =============================================================================
-- Pagamentos manuais (lançados pelo painel master) não têm id Asaas, então
-- a coluna é apenas nullable e sem constraint de unicidade.
ALTER TABLE public.company_payments
  ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT;


-- =============================================================================
-- 5. RLS — subscription_payments
-- =============================================================================
-- Regra a implementar (brief Bloco 1):
--   SELECT  → admin do painel (super_admin + vendedor admin) OU tenant da
--             própria empresa.
--   INSERT/UPDATE/DELETE → só service_role (tenant NÃO escreve cobrança).
--
-- ASSUNÇÃO (documentada pro Tech Lead reconciliar com a spec da Plataforma):
--   O brief disse "SELECT → super_admin (tudo)". A tabela irmã de billing
--   (company_payments) usa public.is_admin_user() no SELECT — que cobre
--   super_admin + vendedor admin (admin_permissions). Adotei is_admin_user()
--   pra manter consistência com company_payments: se o vendedor admin vê os
--   pagamentos manuais da empresa, deve ver também as cobranças Asaas dela.
--   Se a Plataforma quiser restringir a super_admin estrito, trocar
--   is_admin_user → is_super_admin nas policies de SELECT.
--
--   service_role bypassa RLS por padrão no Supabase, então NÃO criamos
--   policy explícita pra ele — a ausência de policy de INSERT/UPDATE/DELETE
--   pra authenticated já bloqueia o tenant (RLS nega por default).

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin users and own company view subscription_payments" ON public.subscription_payments;

-- SELECT: admin do painel master (super_admin + vendedor admin) OU
-- usuário do tenant cuja empresa = company_id da cobrança.
CREATE POLICY "Admin users and own company view subscription_payments"
  ON public.subscription_payments FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
  );

-- INSERT/UPDATE/DELETE: nenhuma policy pra authenticated → bloqueado.
-- Escrita só via service_role (edge functions do webhook Asaas), que bypassa RLS.


-- =============================================================================
-- 6. RLS — subscription_cancellation_requests
-- =============================================================================
-- Regra a implementar (brief Bloco 1):
--   SELECT → admin do painel + tenant da própria empresa.
--   INSERT → tenant pra própria empresa (+ service_role bypassa).
--   UPDATE → admin do painel / service_role.
--
-- ASSUNÇÃO: mesmo racional — is_admin_user() no lado admin pra alinhar com
-- company_payments. Plataforma reconcilia se quiser super_admin estrito.

ALTER TABLE public.subscription_cancellation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin users and own company view cancellation_requests" ON public.subscription_cancellation_requests;
DROP POLICY IF EXISTS "Own company creates cancellation_requests" ON public.subscription_cancellation_requests;
DROP POLICY IF EXISTS "Admin users update cancellation_requests" ON public.subscription_cancellation_requests;

-- SELECT: admin do painel OU tenant da própria empresa.
CREATE POLICY "Admin users and own company view cancellation_requests"
  ON public.subscription_cancellation_requests FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
  );

-- INSERT: tenant cria pedido pra própria empresa (super_admin/vendedor admin
-- também podem, ex: registrar pedido por telefone). service_role bypassa.
CREATE POLICY "Own company creates cancellation_requests"
  ON public.subscription_cancellation_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin_user(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
  );

-- UPDATE: só admin do painel (processar/resolver). service_role bypassa.
-- Tenant NÃO edita o próprio pedido depois de criado.
CREATE POLICY "Admin users update cancellation_requests"
  ON public.subscription_cancellation_requests FOR UPDATE
  TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

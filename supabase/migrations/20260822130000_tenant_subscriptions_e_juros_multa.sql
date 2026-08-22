-- =====================================================================
-- Motor de Cobranças — CAMADA 1 (fundação DB): juros/multa + assinaturas
-- =====================================================================
-- CONTEXTO: evolução do módulo Cobranças (recebimento do cliente final via
-- Asaas, modelo BYO — o TENANT usa a conta Asaas dele). Esta camada prepara
-- o banco para:
--   (A) juros/multa por atraso em toda cobrança (config default na conta);
--   (B) ASSINATURAS recorrentes (tenant_subscriptions) + ligação da cobrança
--       gerada à assinatura que a originou (tenant_charges.subscription_id).
--
-- Decisão CEO (2026-08-22): default 2% multa + 1% juros/mês (Asaas: teto 10%
-- de juros). Override por cobrança/assinatura depois.
--
-- Helpers de RLS REAIS confirmados no schema:
--   get_user_company_id(auth.uid())  → uuid da company do usuário logado
--   is_super_admin(auth.uid())       → bypass de super admin
-- Trigger de updated_at REAL: public.update_updated_at_column()
-- Tabela real de clientes do tenant: public.customers (mesma FK que
--   tenant_charges.customer_id já usa).
--
-- SEGREDOS: cartão tokenizado e autorização Pix Automático NUNCA entram em
-- claro no banco. Só guardamos a REFERÊNCIA ao Vault (credit_card_token_name)
-- e o ID de autorização opaco do Asaas (pix_auto_authorization_id).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, DROP TRIGGER/POLICY IF EXISTS antes de CREATE.
-- =====================================================================


-- =====================================================================
-- 1) Config de juros/multa DEFAULT na conta do tenant
-- =====================================================================
-- Percentuais que a edge aplica em toda cobrança (objetos fine/interest do
-- Asaas) quando o cliente atrasa. Overridáveis por cobrança/assinatura.
-- =====================================================================
ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS default_fine_percent numeric(5,2) NOT NULL DEFAULT 2.00;

ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS default_interest_percent numeric(5,2) NOT NULL DEFAULT 1.00;

COMMENT ON COLUMN public.tenant_payment_accounts.default_fine_percent IS
  'Multa % padrão do tenant aplicada por atraso (objeto fine do Asaas). Default 2.00. Overridável por cobrança/assinatura.';
COMMENT ON COLUMN public.tenant_payment_accounts.default_interest_percent IS
  'Juros % ao mês padrão do tenant por atraso (objeto interest do Asaas). Default 1.00. Asaas impõe teto de 10%. Overridável por cobrança/assinatura.';


-- =====================================================================
-- 2) tenant_subscriptions — assinaturas recorrentes
-- =====================================================================
-- Uma assinatura no Asaas gera cobranças recorrentes automaticamente. Cada
-- cobrança gerada aponta de volta pra cá via tenant_charges.subscription_id.
--
-- asaas_subscription_id é UNIQUE mas NULLABLE: a assinatura nasce local
-- ('pending') antes da edge criá-la no Asaas. Múltiplos NULL são permitidos
-- numa UNIQUE do Postgres — sem conflito de sentinela.
--
-- billing_type usa o vocabulário Asaas em MAIÚSCULO (consistente com
-- tenant_charges.billing_type), com PIX_AUTO adicionado para Pix Automático.
-- source_type: origem da assinatura (avulso = criada direto; contract/quote =
-- derivada de um contrato/orçamento). source_id referencia o registro-fonte
-- (sem FK rígida — fontes heterogêneas).
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id            uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  asaas_subscription_id  text UNIQUE,
  source_type            text CHECK (source_type IN ('avulso','contract','quote')),
  source_id              uuid,
  cycle                  text NOT NULL
                           CHECK (cycle IN ('WEEKLY','BIWEEKLY','MONTHLY','QUARTERLY','SEMIANNUALLY','YEARLY')),
  value                  numeric(14,2) NOT NULL CHECK (value > 0),
  billing_type           text NOT NULL
                           CHECK (billing_type IN ('BOLETO','PIX','CREDIT_CARD','PIX_AUTO')),
  next_due_date          date,
  status                 text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','active','paused','cancelled','overdue')),
  -- Override do default da conta. NULL = usa o default_fine/interest_percent.
  fine_percent           numeric(5,2),
  interest_percent       numeric(5,2),
  -- SÓ referência ao Vault (nome do secret). NUNCA o dado do cartão.
  credit_card_token_name text,
  -- ID opaco de autorização do Pix Automático retornado pelo Asaas.
  pix_auto_authorization_id text,
  description            text,
  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_subscriptions IS
  'Assinaturas recorrentes que o tenant emite ao cliente final via Asaas (BYO). Uma assinatura gera cobranças recorrentes (tenant_charges.subscription_id aponta de volta). asaas_subscription_id NULL enquanto pending (ainda não criada no Asaas).';
COMMENT ON COLUMN public.tenant_subscriptions.asaas_subscription_id IS
  'ID da assinatura no Asaas. NULL enquanto status=pending (antes da edge criar no Asaas). UNIQUE.';
COMMENT ON COLUMN public.tenant_subscriptions.source_type IS
  'Origem da assinatura: avulso (criada direto), contract (derivada de contrato), quote (derivada de orçamento).';
COMMENT ON COLUMN public.tenant_subscriptions.billing_type IS
  'Meio de cobrança recorrente (vocabulário Asaas maiúsculo): BOLETO, PIX, CREDIT_CARD, PIX_AUTO (Pix Automático).';
COMMENT ON COLUMN public.tenant_subscriptions.fine_percent IS
  'Override da multa % para esta assinatura. NULL = usa tenant_payment_accounts.default_fine_percent.';
COMMENT ON COLUMN public.tenant_subscriptions.interest_percent IS
  'Override do juros % ao mês para esta assinatura. NULL = usa tenant_payment_accounts.default_interest_percent.';
COMMENT ON COLUMN public.tenant_subscriptions.credit_card_token_name IS
  'NOME do secret no Supabase Vault que guarda o token do cartão recorrente. NUNCA o dado do cartão em claro.';
COMMENT ON COLUMN public.tenant_subscriptions.pix_auto_authorization_id IS
  'ID opaco da autorização do Pix Automático retornado pelo Asaas. Referência de consentimento, não dado sensível de conta.';

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_company
  ON public.tenant_subscriptions (company_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status
  ON public.tenant_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_customer
  ON public.tenant_subscriptions (customer_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_asaas_subscription_id
  ON public.tenant_subscriptions (asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL;

-- updated_at automático (reusa o padrão real do codebase).
DROP TRIGGER IF EXISTS trg_tenant_subscriptions_updated_at ON public.tenant_subscriptions;
CREATE TRIGGER trg_tenant_subscriptions_updated_at
  BEFORE UPDATE ON public.tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =====================================================================
-- 3) tenant_charges.subscription_id — liga a cobrança à assinatura
-- =====================================================================
-- Cobranças geradas por uma assinatura apontam pra ela. NULL = cobrança
-- avulsa/pontual (não recorrente). ON DELETE SET NULL: apagar a assinatura
-- não destrói o histórico de cobranças (elas viram avulsas órfãs).
-- =====================================================================
ALTER TABLE public.tenant_charges
  ADD COLUMN IF NOT EXISTS subscription_id uuid
    REFERENCES public.tenant_subscriptions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tenant_charges.subscription_id IS
  'Assinatura (tenant_subscriptions) que gerou esta cobrança. NULL = cobrança avulsa/pontual.';

CREATE INDEX IF NOT EXISTS idx_tenant_charges_subscription
  ON public.tenant_charges (subscription_id)
  WHERE subscription_id IS NOT NULL;


-- =====================================================================
-- 4) RLS de tenant_subscriptions
-- =====================================================================
-- Regra-lei: segurança é RLS, não filtro client. Isolamento por company_id.
--
-- MEMÓRIA CRÍTICA DO TIME (incidente VS PROJECT 2026-08-20): política ALL sem
-- o predicado de company_id em USING **E** WITH CHECK VAZA cross-tenant. Aqui
-- a política ALL carrega o predicado nos DOIS lados. Bypass de super admin.
--
-- service_role (edge) tem acesso total (criação/gestão de assinatura e
-- processamento de webhook rodam server-side com service_role).
-- (tenant_charges já tem RLS; a coluna subscription_id herda automaticamente.)
-- =====================================================================
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_tenant_subscriptions" ON public.tenant_subscriptions;
CREATE POLICY "service_role_full_access_tenant_subscriptions"
  ON public.tenant_subscriptions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Company can manage own subscriptions" ON public.tenant_subscriptions;
CREATE POLICY "Company can manage own subscriptions"
  ON public.tenant_subscriptions FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company_id(auth.uid())
  );

-- =====================================================================
-- Recebimento do Cliente Final via Asaas — Fundação (Onda 1)
-- =====================================================================
-- CONTEXTO: NOVA feature — o TENANT (empresa de HVAC) cobra os CLIENTES
-- FINAIS dele online, gerando link de pagamento (Pix/boleto/cartão) e
-- dando baixa automática no recebível quando o cliente paga.
--
-- Modelo: "traga sua conta" (BYO) — cada tenant usa a CONTA ASAAS DELE.
-- A API key vive no Supabase Vault (NUNCA no banco em claro). Aqui só
-- guardamos a REFERÊNCIA (nome do secret). Repasse puro (Auctus não entra
-- na transação).
--
-- NÃO CONFUNDIR com a integração Asaas existente (asaas-webhook,
-- subscription_payments, admin_financial_transactions) — aquela é a AUCTUS
-- cobrando a MENSALIDADE dos tenants (conta-mãe Auctus). Esta é o INVERSO.
-- São domínios separados; tabelas separadas.
--
-- Helpers de RLS confirmados no schema real:
--   get_user_company_id(auth.uid())  → uuid da company do usuário logado
--   is_super_admin(auth.uid())       → bypass de super admin
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- DROP TRIGGER IF EXISTS antes de CREATE.
-- =====================================================================


-- =====================================================================
-- 1) tenant_payment_accounts — 1 linha por company
-- =====================================================================
-- Guarda a config de recebimento do tenant. NENHUMA coluna guarda segredo
-- em claro: apenas o NOME do secret no Vault (vault_secret_name) e o NOME
-- do token do webhook (webhook_auth_token_name).
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tenant_payment_accounts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  provider                text NOT NULL DEFAULT 'asaas',
  mode                    text NOT NULL DEFAULT 'byo' CHECK (mode IN ('byo','subaccount')),
  asaas_account_id        text,
  wallet_id               text,
  -- SÓ a referência ao secret no Vault (ex 'tenant_asaas_key_<company_id>').
  -- NUNCA a chave em si.
  vault_secret_name       text,
  -- SÓ a referência ao token do webhook no Vault. NUNCA o token em si.
  webhook_auth_token_name text,
  asaas_webhook_id        text,
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','active','rejected','disabled')),
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_payment_accounts IS
  'Config de recebimento do tenant (BYO Asaas). 1 linha por company. Segredos vivem no Vault; aqui só a referência (vault_secret_name / webhook_auth_token_name).';
COMMENT ON COLUMN public.tenant_payment_accounts.vault_secret_name IS
  'NOME do secret no Supabase Vault que guarda a API key do tenant. NUNCA a chave em claro.';
COMMENT ON COLUMN public.tenant_payment_accounts.webhook_auth_token_name IS
  'NOME do secret no Vault que guarda o token de autenticação do webhook Asaas. NUNCA o token em claro.';

CREATE INDEX IF NOT EXISTS idx_tenant_payment_accounts_company
  ON public.tenant_payment_accounts (company_id);


-- =====================================================================
-- 2) tenant_charges — cobrança emitida
-- =====================================================================
-- Onda 1 só usa source_type='avulso', mas o CHECK já contempla os 3 tipos
-- pra não travar as ondas futuras (quote, contract_installment).
--
-- asaas_payment_id é UNIQUE mas NULLABLE: a cobrança nasce local (antes de
-- ser criada no Asaas pela edge) com asaas_payment_id NULL. Múltiplos NULL
-- são permitidos numa UNIQUE do Postgres, então não há conflito de sentinela.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tenant_charges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  asaas_payment_id  text UNIQUE,
  source_type       text NOT NULL DEFAULT 'avulso'
                      CHECK (source_type IN ('avulso','quote','contract_installment')),
  source_id         uuid,
  customer_id       uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  value             numeric(14,2) NOT NULL CHECK (value > 0),
  net_value         numeric(14,2),
  billing_type      text CHECK (billing_type IN ('PIX','BOLETO','CREDIT_CARD','UNDEFINED')),
  -- Espelha o status do Asaas (PENDING/RECEIVED/CONFIRMED/OVERDUE/REFUNDED/...).
  -- PENDING_CREATION = estado local antes de existir no Asaas.
  status            text NOT NULL DEFAULT 'PENDING_CREATION',
  due_date          date,
  payment_date      timestamptz,
  public_short_code text UNIQUE,
  invoice_url       text,
  pix_copy_paste    text,
  boleto_url        text,
  description       text,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_charges IS
  'Cobrança que o tenant emite ao cliente final via Asaas (BYO). source_type avulso na Onda 1; quote/contract_installment reservados para ondas futuras. asaas_payment_id NULL enquanto PENDING_CREATION.';
COMMENT ON COLUMN public.tenant_charges.status IS
  'Espelha o status do Asaas. PENDING_CREATION = local, ainda não criada no Asaas. Depois: PENDING/RECEIVED/CONFIRMED/OVERDUE/REFUNDED/etc.';

CREATE INDEX IF NOT EXISTS idx_tenant_charges_company
  ON public.tenant_charges (company_id);
CREATE INDEX IF NOT EXISTS idx_tenant_charges_status
  ON public.tenant_charges (status);
CREATE INDEX IF NOT EXISTS idx_tenant_charges_asaas_payment_id
  ON public.tenant_charges (asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_charges_customer
  ON public.tenant_charges (customer_id);

-- public_short_code: reusa o gerador/trigger genérico já existente
-- (generate_public_short_code(12) + ensure_public_short_code()), o mesmo
-- padrão das 4 tabelas de link amigável. Estável: nunca regenera código emitido.
DROP TRIGGER IF EXISTS trg_ensure_public_short_code ON public.tenant_charges;
CREATE TRIGGER trg_ensure_public_short_code
  BEFORE INSERT OR UPDATE ON public.tenant_charges
  FOR EACH ROW EXECUTE FUNCTION public.ensure_public_short_code();


-- =====================================================================
-- 3) tenant_payment_webhook_events — idempotência do webhook
-- =====================================================================
-- Espelha o padrão do webhook SaaS (idempotência por id global do Asaas).
-- Escrita SÓ via service_role (edge). company_id é resolvido no processamento
-- (o webhook chega sem contexto de auth; a edge descobre o tenant pelo
-- asaas_payment_id / conta).
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tenant_payment_webhook_events (
  event_id          text PRIMARY KEY,
  company_id        uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  event_type        text,
  payload_hash      text,
  raw_payload       jsonb,
  asaas_payment_id  text,
  status            text NOT NULL DEFAULT 'received'
                      CHECK (status IN ('received','processing','processed','failed','skipped')),
  retry_count       int NOT NULL DEFAULT 0,
  last_error        text,
  received_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_payment_webhook_events IS
  'Idempotência dos eventos do webhook Asaas do tenant. event_id (PK) = id do evento Asaas; reentrega vira no-op. Escrita só via service_role (edge). company_id resolvido no processamento.';

CREATE INDEX IF NOT EXISTS idx_tenant_payment_webhook_events_company
  ON public.tenant_payment_webhook_events (company_id);
CREATE INDEX IF NOT EXISTS idx_tenant_payment_webhook_events_asaas_payment
  ON public.tenant_payment_webhook_events (asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_tenant_payment_webhook_events_status
  ON public.tenant_payment_webhook_events (status);


-- =====================================================================
-- 3b) Trigger de imutabilidade do payload/event_id do webhook
-- =====================================================================
-- Espelha o padrão de imutabilidade de webhook: uma vez recebido, o evento
-- (event_id, raw_payload, payload_hash, asaas_payment_id, received_at) é
-- FATO HISTÓRICO — não pode ser reescrito. Só campos operacionais de
-- processamento podem mudar (status, retry_count, last_error, company_id
-- quando resolvido). Protege contra reprocessamento adulterar o registro
-- do que o Asaas de fato enviou.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.prevent_tenant_webhook_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_id IS DISTINCT FROM OLD.event_id THEN
    RAISE EXCEPTION '[tenant_payment_webhook_events] event_id é imutável (% -> %)', OLD.event_id, NEW.event_id;
  END IF;
  IF NEW.raw_payload IS DISTINCT FROM OLD.raw_payload THEN
    RAISE EXCEPTION '[tenant_payment_webhook_events] raw_payload é imutável (evento %)', OLD.event_id;
  END IF;
  IF NEW.payload_hash IS DISTINCT FROM OLD.payload_hash THEN
    RAISE EXCEPTION '[tenant_payment_webhook_events] payload_hash é imutável (evento %)', OLD.event_id;
  END IF;
  IF NEW.asaas_payment_id IS DISTINCT FROM OLD.asaas_payment_id THEN
    RAISE EXCEPTION '[tenant_payment_webhook_events] asaas_payment_id é imutável (evento %)', OLD.event_id;
  END IF;
  IF NEW.event_type IS DISTINCT FROM OLD.event_type THEN
    RAISE EXCEPTION '[tenant_payment_webhook_events] event_type é imutável (evento %)', OLD.event_id;
  END IF;
  IF NEW.received_at IS DISTINCT FROM OLD.received_at THEN
    RAISE EXCEPTION '[tenant_payment_webhook_events] received_at é imutável (evento %)', OLD.event_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_tenant_webhook_event_mutation() IS
  'Trigger BEFORE UPDATE: congela event_id/raw_payload/payload_hash/asaas_payment_id/event_type/received_at do webhook do tenant (fato histórico). Só status/retry_count/last_error/company_id podem mudar no reprocessamento.';

DROP TRIGGER IF EXISTS trg_prevent_tenant_webhook_event_mutation ON public.tenant_payment_webhook_events;
CREATE TRIGGER trg_prevent_tenant_webhook_event_mutation
  BEFORE UPDATE ON public.tenant_payment_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_webhook_event_mutation();


-- =====================================================================
-- 4) updated_at automático (reusa handle_updated_at / set_updated_at real)
-- =====================================================================
-- O codebase usa public.update_updated_at_column() em vários triggers
-- (confirmado no asaas_fundacao_schema: update_subscription_payments_updated_at).
-- =====================================================================
DROP TRIGGER IF EXISTS trg_tenant_payment_accounts_updated_at ON public.tenant_payment_accounts;
CREATE TRIGGER trg_tenant_payment_accounts_updated_at
  BEFORE UPDATE ON public.tenant_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_tenant_charges_updated_at ON public.tenant_charges;
CREATE TRIGGER trg_tenant_charges_updated_at
  BEFORE UPDATE ON public.tenant_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

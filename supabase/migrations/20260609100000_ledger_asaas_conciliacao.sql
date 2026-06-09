-- ============================================================
-- Conciliação bancária Asaas — FASE A (só schema, aditivo)
-- Decisão CEO 2026-06-09. Clone adaptado do EcoSistema (ledger_asaas).
--
-- ledger_asaas é o ESPELHO de TODA movimentação da conta Asaas (créditos
-- e débitos: cobranças recebidas, tarifas, transferências, estornos, etc.).
-- É a base da conciliação: cada movimento entra aqui e, quando categorizado,
-- gera/aponta um lançamento em admin_financial_transactions.
--
-- Diferenças vs. clone EcoSistema (seguimos a spec Dominex, não 1:1):
--   - amount >= 0 (permite movimento zerado), description/asaas_event_type
--     NULLáveis, status inclui 'manually_categorized', e ganhamos as colunas
--     de ligação category / admin_financial_transaction_id / company_id.
--   - RLS espelha admin_financial_transactions (helper is_admin_user), NÃO
--     o "authenticated USING(true)" do EcoSistema — aqui é dado financeiro
--     ADMIN Auctus, só admin/super_admin lê.
--
-- Idempotente: CREATE TABLE/INDEX/TRIGGER IF [NOT] EXISTS + DROP IF EXISTS.
-- ============================================================

-- =============================================================================
-- 1) Tabela ledger_asaas
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ledger_asaas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- id do movimento (financialTransaction) no Asaas. UNIQUE = idempotência do sync.
  asaas_transaction_id TEXT UNIQUE,
  -- tipo do evento/movimento Asaas (ex: PAYMENT_FEE, PIX_CREDIT, TRANSFER, ...).
  asaas_event_type TEXT,
  -- pay_* se o movimento está ligado a uma cobrança; null se não.
  asaas_payment_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  occurred_at TIMESTAMPTZ NOT NULL,
  description TEXT,
  -- categoria atribuída = name de admin_financial_categories; null = não categorizado.
  category TEXT,
  status TEXT NOT NULL DEFAULT 'pending_categorization'
    CHECK (status IN ('auto_categorized', 'pending_categorization', 'manually_categorized')),
  source TEXT NOT NULL DEFAULT 'sync'
    CHECK (source IN ('webhook', 'sync', 'manual')),
  -- lançamento categorizado correspondente, se houver.
  admin_financial_transaction_id UUID REFERENCES public.admin_financial_transactions(id) ON DELETE SET NULL,
  -- empresa, se o movimento for identificável a uma.
  company_id UUID REFERENCES public.companies(id),
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ledger_asaas IS
  'Espelho de toda movimentação da conta Asaas (base da conciliação bancária admin Auctus). Cada movimento, quando categorizado, aponta um lançamento em admin_financial_transactions.';
COMMENT ON COLUMN public.ledger_asaas.asaas_transaction_id IS
  'ID do movimento/financialTransaction no Asaas. UNIQUE garante idempotência do sync.';
COMMENT ON COLUMN public.ledger_asaas.category IS
  'name de admin_financial_categories atribuída ao movimento; NULL = ainda não categorizado.';
COMMENT ON COLUMN public.ledger_asaas.raw_payload IS
  'Payload original do webhook/extrato Asaas, preservado para auditoria.';

-- Índices: feed por data, fila de pendentes, lookup por cobrança.
CREATE INDEX IF NOT EXISTS idx_ledger_asaas_occurred_at
  ON public.ledger_asaas(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_asaas_status
  ON public.ledger_asaas(status);

CREATE INDEX IF NOT EXISTS idx_ledger_asaas_payment
  ON public.ledger_asaas(asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;

-- Trigger updated_at (padrão do projeto: update_updated_at_column()).
DROP TRIGGER IF EXISTS trg_ledger_asaas_updated_at ON public.ledger_asaas;
CREATE TRIGGER trg_ledger_asaas_updated_at
  BEFORE UPDATE ON public.ledger_asaas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 2) RLS — espelha admin_financial_transactions (helper is_admin_user).
--    Dado financeiro ADMIN Auctus, NÃO multi-tenant. Tenant comum não acessa.
--    service_role full pros edges de sync/webhook.
-- =============================================================================

ALTER TABLE public.ledger_asaas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_ledger_asaas" ON public.ledger_asaas;
CREATE POLICY "service_role_full_access_ledger_asaas"
  ON public.ledger_asaas FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin panel users view ledger_asaas" ON public.ledger_asaas;
CREATE POLICY "Admin panel users view ledger_asaas"
  ON public.ledger_asaas FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Admin panel users insert ledger_asaas" ON public.ledger_asaas;
CREATE POLICY "Admin panel users insert ledger_asaas"
  ON public.ledger_asaas FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Admin panel users update ledger_asaas" ON public.ledger_asaas;
CREATE POLICY "Admin panel users update ledger_asaas"
  ON public.ledger_asaas FOR UPDATE TO authenticated
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Admin panel users delete ledger_asaas" ON public.ledger_asaas;
CREATE POLICY "Admin panel users delete ledger_asaas"
  ON public.ledger_asaas FOR DELETE TO authenticated
  USING (public.is_admin_user(auth.uid()));

-- =============================================================================
-- 3) Seed categorias guarda-chuva (idempotente via ON CONFLICT name).
--    Colunas reais de admin_financial_categories: name, label, type, color
--    (NOT NULL), icon, is_system, sort_order, is_active. Seguimos o padrão
--    das categorias existentes (other_income/other_expense já usam #64748b).
-- =============================================================================

INSERT INTO public.admin_financial_categories
  (name, label, type, color, icon, is_system, sort_order)
VALUES
  ('outras_receitas', 'Outras Receitas', 'income',  '#64748b', 'Plus',  true, 7),
  ('outras_despesas', 'Outras Despesas', 'expense', '#64748b', 'Minus', true, 21)
ON CONFLICT (name) DO NOTHING;

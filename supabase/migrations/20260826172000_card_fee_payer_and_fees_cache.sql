-- =====================================================================
-- card_fee_payer + cache/override de taxa de cartão em tenant_payment_accounts
-- =====================================================================
-- CONTEXTO: a tela de Nova cobrança vai permitir escolher quem paga a taxa
-- do cartão (empresa absorve OU cliente paga via repasse automático). Para o
-- repasse ser exato usamos a taxa real da conta Asaas do tenant
-- (GET /v3/myAccount/fees), cacheada aqui, com possibilidade de override
-- manual. Plano: docs/planos/2026-08-26-repasse-taxa-cartao-cobranca.md
--
-- COLUNAS NOVAS:
--   card_fee_payer     text  NOT NULL DEFAULT 'company'  CHECK in (company,customer)
--                      → preferência padrão do toggle na cobrança.
--   card_fee_override  jsonb NULL  → override manual da tabela de taxa
--                      { operationValue, oneInstallment, upToSix,
--                        upToTwelve, upToTwentyOne }. Vazio = usar taxa real.
--   card_fees_cache    jsonb NULL  → resposta cacheada de myAccount/fees.
--   card_fees_synced_at timestamptz NULL → quando o cache foi atualizado.
--
-- RLS: nenhuma policy nova. As colunas herdam as policies existentes da
-- tabela tenant_payment_accounts (escopo por company_id). Nada é afrouxado.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + guarda do CHECK por catálogo.
-- =====================================================================

DO $$
DECLARE
  v_total int;
BEGIN

  SELECT count(*) INTO v_total FROM public.tenant_payment_accounts;
  RAISE NOTICE '=== ANTES === contas de pagamento existentes: %', v_total;

  -- ──────────────────────────────────────────────────────────────────
  -- 1. Colunas novas (idempotente)
  -- ──────────────────────────────────────────────────────────────────
  ALTER TABLE public.tenant_payment_accounts
    ADD COLUMN IF NOT EXISTS card_fee_payer      text        NOT NULL DEFAULT 'company',
    ADD COLUMN IF NOT EXISTS card_fee_override   jsonb,
    ADD COLUMN IF NOT EXISTS card_fees_cache     jsonb,
    ADD COLUMN IF NOT EXISTS card_fees_synced_at timestamptz;

  RAISE NOTICE 'ALTER TABLE: 4 colunas garantidas.';

  -- ──────────────────────────────────────────────────────────────────
  -- 2. CHECK de domínio em card_fee_payer (guarda p/ re-execução)
  -- ──────────────────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.tenant_payment_accounts'::regclass
       AND conname  = 'tenant_payment_accounts_card_fee_payer_check'
  ) THEN
    ALTER TABLE public.tenant_payment_accounts
      ADD CONSTRAINT tenant_payment_accounts_card_fee_payer_check
      CHECK (card_fee_payer IN ('company', 'customer'));
    RAISE NOTICE 'CHECK card_fee_payer IN (company,customer) criado.';
  ELSE
    RAISE NOTICE 'CHECK card_fee_payer já existia — no-op.';
  END IF;

  -- ──────────────────────────────────────────────────────────────────
  -- 3. Comentários
  -- ──────────────────────────────────────────────────────────────────
  COMMENT ON COLUMN public.tenant_payment_accounts.card_fee_payer IS
    'Quem paga a taxa do cartão por padrão na cobrança: company (empresa absorve) ou customer (repasse ao cliente).';
  COMMENT ON COLUMN public.tenant_payment_accounts.card_fee_override IS
    'Override manual da tabela de taxa de cartão. NULL = usar a taxa real do Asaas (card_fees_cache) ou fallback.';
  COMMENT ON COLUMN public.tenant_payment_accounts.card_fees_cache IS
    'Cache da resposta de GET /v3/myAccount/fees (bloco creditCard) da conta Asaas do tenant.';
  COMMENT ON COLUMN public.tenant_payment_accounts.card_fees_synced_at IS
    'Timestamp da última sincronização de card_fees_cache com o Asaas.';

  -- ──────────────────────────────────────────────────────────────────
  -- 4. Prova: domínio válido em todas as linhas
  -- ──────────────────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.tenant_payment_accounts
     WHERE card_fee_payer NOT IN ('company', 'customer')
  ) THEN
    RAISE EXCEPTION 'FALHA: existe card_fee_payer fora do domínio esperado.';
  END IF;

  RAISE NOTICE 'Migration concluída com sucesso.';

END $$;

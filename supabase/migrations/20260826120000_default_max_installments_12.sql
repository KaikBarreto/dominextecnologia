-- =====================================================================
-- default_max_installments: DEFAULT 1 → 12 em tenant_payment_accounts
-- =====================================================================
-- CONTEXTO: o DEFAULT 1 (à vista) escondia o seletor de parcelas na UI
-- do módulo Cobranças (seletor só aparece quando default_max_installments > 1).
-- O CEO quer que parcelamento em até 12× seja oferecido por padrão, podendo
-- o tenant reduzir nas Configurações de Recebimentos.
--
-- ESTRATÉGIA:
--   1. Diagnóstico (RAISE NOTICE) — quantas contas em 1/NULL antes do backfill.
--   2. ALTER COLUMN DEFAULT → 12 (novas contas já nascem com 12).
--   3. UPDATE backfill de linhas com 1 ou NULL (= nunca configurado de propósito).
--      Quem tiver >= 2 fica intocado.
--   4. COMMENT atualizado.
--   5. Prova: SELECT do column_default e COUNT de contas ainda <= 1.
--
-- Idempotente: ALTER SET DEFAULT é idempotente; UPDATE com WHERE <= 1 no-ops
-- se já executado.
-- =====================================================================

DO $$
DECLARE
  v_count_null   int;
  v_count_one    int;
  v_count_other  int;
  v_rows_updated int;
BEGIN

  -- ──────────────────────────────────────────────────────────────────
  -- 1. Diagnóstico: estado ANTES do backfill
  -- ──────────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_count_null
    FROM public.tenant_payment_accounts
   WHERE default_max_installments IS NULL;

  SELECT count(*) INTO v_count_one
    FROM public.tenant_payment_accounts
   WHERE default_max_installments = 1;

  SELECT count(*) INTO v_count_other
    FROM public.tenant_payment_accounts
   WHERE default_max_installments > 1;

  RAISE NOTICE '=== ANTES DO BACKFILL ===';
  RAISE NOTICE 'Contas com default_max_installments IS NULL : %', v_count_null;
  RAISE NOTICE 'Contas com default_max_installments = 1     : %', v_count_one;
  RAISE NOTICE 'Contas com default_max_installments > 1     : %', v_count_other;

  -- ──────────────────────────────────────────────────────────────────
  -- 2. Alterar DEFAULT da coluna para 12
  --    (novas contas criadas após esta migration já nascem com 12)
  -- ──────────────────────────────────────────────────────────────────
  ALTER TABLE public.tenant_payment_accounts
    ALTER COLUMN default_max_installments SET DEFAULT 12;

  RAISE NOTICE 'ALTER TABLE: column default alterado para 12.';

  -- ──────────────────────────────────────────────────────────────────
  -- 3. Backfill: atualizar contas que nunca foram configuradas
  --    (NULL ou 1 = valor padrão antigo, não escolha explícita)
  --    Contas com >= 2 foram configuradas propositalmente → intocadas.
  -- ──────────────────────────────────────────────────────────────────
  UPDATE public.tenant_payment_accounts
     SET default_max_installments = 12
   WHERE default_max_installments IS NULL
      OR default_max_installments <= 1;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  RAISE NOTICE 'UPDATE backfill: % linha(s) atualizada(s) para 12.', v_rows_updated;

  -- ──────────────────────────────────────────────────────────────────
  -- 4. COMMENT atualizado
  -- ──────────────────────────────────────────────────────────────────
  COMMENT ON COLUMN public.tenant_payment_accounts.default_max_installments IS
    'Máximo de parcelas oferecido no cartão. Default 12; o tenant ajusta nas Configurações de Recebimentos.';

  RAISE NOTICE 'COMMENT atualizado na coluna default_max_installments.';

  -- ──────────────────────────────────────────────────────────────────
  -- 5. Prova pós-backfill: contas ainda <= 1 devem ser 0
  -- ──────────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_count_one
    FROM public.tenant_payment_accounts
   WHERE default_max_installments IS NULL
      OR default_max_installments <= 1;

  RAISE NOTICE '=== PROVA PÓS-BACKFILL ===';
  RAISE NOTICE 'Contas com default_max_installments <= 1 ou NULL: % (esperado: 0)', v_count_one;

  IF v_count_one <> 0 THEN
    RAISE EXCEPTION 'FALHA: ainda existem % conta(s) com default_max_installments <= 1 após o backfill!', v_count_one;
  END IF;

  RAISE NOTICE 'Migration concluída com sucesso.';

END $$;

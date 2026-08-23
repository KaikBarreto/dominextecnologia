-- 20260823170000_cobrancas_flags_default_on.sql
-- Mudança de decisão (CEO 2026-08-23): a POSSIBILIDADE de usar cartão recorrente /
-- Pix Automático passa a vir ATIVA por padrão pra TODOS os tenants.
--
-- Contexto: na migration 20260823160000 as colunas
--   tenant_payment_accounts.card_recurring_enabled
--   tenant_payment_accounts.pix_auto_enabled
-- nasceram como feature dormente (DEFAULT false, ligada manualmente pela Dominex).
--
-- Nova regra: o gate real NÃO é um flag da Dominex — é a habilitação na conta
-- Asaas do próprio tenant. Se o tenant não liberou lá, o Asaas nega na geração e
-- o app trata com mensagem + passo a passo (responsabilidade de outro Dev).
-- Portanto esses flags viram "ligado por padrão" e permanecem apenas como
-- interruptor de emergência da Dominex (raramente usado).
--
-- Idempotente: SET DEFAULT e UPDATE são seguros de rodar 2x.

-- 1) Novo DEFAULT = true
ALTER TABLE public.tenant_payment_accounts
  ALTER COLUMN card_recurring_enabled SET DEFAULT true;

ALTER TABLE public.tenant_payment_accounts
  ALTER COLUMN pix_auto_enabled SET DEFAULT true;

-- 2) Backfill das linhas existentes que ficaram em false pelo default antigo.
-- Backfill total é intencional: a possibilidade fica ativa pra todos; quem
-- realmente bloqueia é o Asaas na geração da cobrança.
DO $$
DECLARE
  v_card INT;
  v_pix  INT;
BEGIN
  UPDATE public.tenant_payment_accounts
    SET card_recurring_enabled = true
    WHERE card_recurring_enabled = false;
  GET DIAGNOSTICS v_card = ROW_COUNT;

  UPDATE public.tenant_payment_accounts
    SET pix_auto_enabled = true
    WHERE pix_auto_enabled = false;
  GET DIAGNOSTICS v_pix = ROW_COUNT;

  RAISE NOTICE 'Backfill flags cobrancas: card_recurring_enabled % linhas, pix_auto_enabled % linhas', v_card, v_pix;
END $$;

-- 3) COMMENTs refletindo o novo significado
COMMENT ON COLUMN public.tenant_payment_accounts.card_recurring_enabled IS
  'Ativo por padrão. Interruptor de emergência da Dominex; o gate real é a habilitação na conta Asaas do tenant (o Asaas nega a geração se não liberado).';

COMMENT ON COLUMN public.tenant_payment_accounts.pix_auto_enabled IS
  'Ativo por padrão. Interruptor de emergência da Dominex; o gate real é a habilitação na conta Asaas do tenant (o Asaas nega a geração se não liberado).';

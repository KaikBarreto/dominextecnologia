-- ============================================================
-- Asaas — Bloco 2b: chave de idempotência da receita no painel master
-- Decisões: docs/decisoes/2026-06-04-asaas.md
--
-- O webhook Asaas (PAYMENT_RECEIVED/CONFIRMED) registra a receita da
-- assinatura SaaS em admin_financial_transactions. Reentrega de webhook
-- (Asaas reenvia o mesmo evento até receber 200) pode duplicar a receita.
--
-- Solução: gravar o id global Asaas (pay_* / aut_*) na transação e impor
-- unicidade via índice ÚNICO PARCIAL. O webhook faz INSERT ... ON CONFLICT
-- DO NOTHING usando essa coluna como chave — a 2ª entrega vira no-op.
--
-- Por que parcial (WHERE asaas_transaction_id IS NOT NULL): lançamentos
-- manuais do painel master (sem origem Asaas) seguem com a coluna NULL e
-- não disputam o índice — múltiplos NULL são permitidos.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
-- ============================================================

ALTER TABLE public.admin_financial_transactions
  ADD COLUMN IF NOT EXISTS asaas_transaction_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_financial_transactions_asaas_id
  ON public.admin_financial_transactions (asaas_transaction_id)
  WHERE asaas_transaction_id IS NOT NULL;

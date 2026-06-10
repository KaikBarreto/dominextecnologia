-- =============================================================================
-- companies: colunas do ALVO de um downgrade agendado
-- =============================================================================
-- Por quê: hoje só `pending_subscription_value` (numeric) existe e guarda o
-- VALOR que a assinatura vai passar a custar na próxima renovação. Mas downgrade
-- não é só preço: muda plano, ciclo, módulos liberados e teto de usuários.
-- Estas colunas guardam o ESTADO-ALVO completo. O webhook do Asaas, ao confirmar
-- o pagamento da renovação, aplica esse alvo na empresa e LIMPA as colunas
-- (volta a NULL). Enquanto NULL, não há downgrade pendente.
--
-- Todas nullable + IF NOT EXISTS: rodar 2x não quebra; empresa sem downgrade
-- agendado simplesmente tem tudo NULL.
-- =============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS pending_plan_code    TEXT,
  ADD COLUMN IF NOT EXISTS pending_billing_cycle TEXT,
  ADD COLUMN IF NOT EXISTS pending_modules      JSONB,
  ADD COLUMN IF NOT EXISTS pending_max_users    INTEGER;

COMMENT ON COLUMN public.companies.pending_plan_code IS
  'Alvo de downgrade agendado: código do plano a aplicar na próxima renovação. NULL = sem downgrade pendente.';
COMMENT ON COLUMN public.companies.pending_billing_cycle IS
  'Alvo de downgrade agendado: ciclo de cobrança (MONTHLY/YEARLY) a aplicar na próxima renovação.';
COMMENT ON COLUMN public.companies.pending_modules IS
  'Alvo de downgrade agendado: módulos liberados (JSONB) a aplicar na próxima renovação.';
COMMENT ON COLUMN public.companies.pending_max_users IS
  'Alvo de downgrade agendado: teto de usuários a aplicar na próxima renovação.';

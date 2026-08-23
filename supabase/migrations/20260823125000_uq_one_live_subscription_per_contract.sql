-- =====================================================================
-- Cobranças — Onda C: rede de segurança contra double-billing de contrato
-- =====================================================================
-- CONTEXTO: um contrato pode virar faturamento recorrente (uma
-- tenant_subscriptions com source_type='contract', source_id = id do contrato).
-- Se dois cliques simultâneos criarem duas assinaturas VIVAS pro mesmo
-- contrato, o cliente final é cobrado em dobro (double-billing).
--
-- A aplicação já checa antes de criar, mas checagem em app não protege
-- contra corrida (dois requests lendo "não existe" ao mesmo tempo, ambos
-- inserindo). A garantia REAL tem que estar no banco.
--
-- SOLUÇÃO: índice único PARCIAL que permite, no máximo, UMA linha VIVA por
-- (company_id, source_id) quando a origem é um contrato.
--
-- "VIVA" = qualquer status que NÃO seja 'cancelled'. O CHECK real da coluna
-- (migration 20260822130000) é:
--   status IN ('pending','active','paused','cancelled','overdue')
-- Logo, contam como vivas: pending, active, paused, overdue.
-- Cancelada some do índice → libera o contrato pra um novo faturamento.
-- Esse é o comportamento desejado.
--
-- PREDICADO IMUTÁVEL: comparação de coluna com literais de texto
-- (source_type = 'contract' AND status <> 'cancelled') é IMMUTABLE — pré-
-- requisito do Postgres para o WHERE de um índice parcial. Sem funções,
-- sem now(), sem nada volátil.
--
-- Idempotente: CREATE UNIQUE INDEX IF NOT EXISTS.
-- =====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_subscriptions_one_live_per_contract
  ON public.tenant_subscriptions (company_id, source_id)
  WHERE source_type = 'contract' AND status <> 'cancelled';

COMMENT ON INDEX public.uq_tenant_subscriptions_one_live_per_contract IS
  'Rede de segurança anti double-billing: no máximo UMA assinatura viva (status <> cancelled) por (company_id, source_id) quando source_type=contract. Cancelar a assinatura libera o contrato para novo faturamento recorrente.';

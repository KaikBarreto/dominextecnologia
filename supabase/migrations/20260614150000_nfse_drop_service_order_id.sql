-- Remove a integração OS↔Nota Fiscal (NFS-e).
-- Decisão CEO 2026-06-14: a coluna service_order_id (FK -> service_orders) e seu
-- índice foram criados pra uma integração que não vai existir. Tabela vazia
-- (sem emissões reais, sem chave Fisqal), drop é seguro.
-- IMPORTANTE: manter financial_transaction_id (esse não é OS).

DROP INDEX IF EXISTS public.idx_nfse_emissions_service_order_id;

ALTER TABLE public.nfse_emissions DROP COLUMN IF EXISTS service_order_id;

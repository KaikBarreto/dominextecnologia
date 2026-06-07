-- =============================================================================
-- PMOC — Liberar doc_type 'certificado' no Certificado de Conformidade individual
-- =============================================================================
-- Contexto:
--   Vamos gerar o Certificado de Conformidade individualmente (edge function
--   nova) que insere em pmoc_documents com doc_type = 'certificado'. Hoje a CHECK
--   constraint pmoc_documents_doc_type_check NÃO permite esse valor.
--
-- Escopo desta migration (SQL puro):
--   1. Expandir CHECK de pmoc_documents.doc_type pra aceitar 'certificado' como
--      quarto doc_type válido, mantendo TODOS os valores já permitidos
--      ('dossie_pmoc', 'cronograma_anual', 'termo_rt').
--
-- Idempotente (DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT). Espelha o padrão da
-- Onda E (20260523193848_pmoc_v1_9_x_termo_rt_separado.sql). UMA transação.
-- Sem coluna nova → não exige regen de types.ts.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Expandir doc_type aceito em pmoc_documents
-- -----------------------------------------------------------------------------
-- Antes: CHECK (doc_type IN ('dossie_pmoc', 'cronograma_anual', 'termo_rt'))
-- Agora: + 'certificado'
-- -----------------------------------------------------------------------------

ALTER TABLE public.pmoc_documents
  DROP CONSTRAINT IF EXISTS pmoc_documents_doc_type_check;

ALTER TABLE public.pmoc_documents
  ADD CONSTRAINT pmoc_documents_doc_type_check
  CHECK (doc_type IN ('dossie_pmoc', 'cronograma_anual', 'termo_rt', 'certificado'));

COMMENT ON COLUMN public.pmoc_documents.doc_type IS
  'Tipo do documento PMOC. Valores: dossie_pmoc (capa+termo+certificado), '
  'cronograma_anual (12 meses), termo_rt (Termo de Responsabilidade Técnica '
  'standalone), certificado (Certificado de Conformidade standalone). '
  'Imutável após INSERT (trigger pmoc_documents_block_immutable_update).';

COMMIT;

-- =============================================================================
-- FIM da migration — doc_type 'certificado' liberado.
-- =============================================================================

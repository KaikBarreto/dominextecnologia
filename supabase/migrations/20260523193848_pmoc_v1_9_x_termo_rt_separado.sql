-- =============================================================================
-- PMOC v1.9.x — Onda E: Termo RT como documento separado + assinatura embedada
-- =============================================================================
-- Plano mestre: docs/planos/2026-05-23-pmoc-v1.9-arquitetura.md
-- Refinamento do CEO (Onda E):
--   - TRT vira documento gerável e baixável individualmente.
--   - responsible_technicians.signature_image_url é embedada AUTOMATICAMENTE em
--     todos os PDFs sempre que existir — sem botão extra.
--   - Hash de cache leva em conta a assinatura: se o RT atualiza a assinatura,
--     todos os PDFs daquele contrato regeneram na próxima geração.
--
-- Escopo desta migration (SQL puro):
--   1. Expandir CHECK de pmoc_documents.doc_type pra aceitar 'termo_rt' como
--      terceiro doc_type válido (além de 'dossie_pmoc' e 'cronograma_anual').
--
-- Toda a migration é UMA transação (BEGIN/COMMIT). Idempotente (DROP CONSTRAINT
-- IF EXISTS + ADD CONSTRAINT). Após apply: regen types.ts.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Expandir doc_type aceito em pmoc_documents
-- -----------------------------------------------------------------------------
-- Original (Onda C): CHECK (doc_type IN ('dossie_pmoc', 'cronograma_anual'))
-- Onda E: + 'termo_rt'
-- -----------------------------------------------------------------------------

ALTER TABLE public.pmoc_documents
  DROP CONSTRAINT IF EXISTS pmoc_documents_doc_type_check;

ALTER TABLE public.pmoc_documents
  ADD CONSTRAINT pmoc_documents_doc_type_check
  CHECK (doc_type IN ('dossie_pmoc', 'cronograma_anual', 'termo_rt'));

COMMENT ON COLUMN public.pmoc_documents.doc_type IS
  'Tipo do documento PMOC. Valores: dossie_pmoc (capa+termo+certificado), '
  'cronograma_anual (12 meses), termo_rt (Termo de Responsabilidade Técnica '
  'standalone). Imutável após INSERT (trigger pmoc_documents_block_immutable_update).';

COMMIT;

-- =============================================================================
-- FIM da migration PMOC v1.9.x — Onda E.
--
-- Próximos passos (não-SQL, fora desta migration):
--   1. Regenerar src/integrations/supabase/types.ts (CHECK não muda o tipo
--      TypeScript do campo, mas regen é a régua do projeto).
--   2. Deploy das edge functions:
--      → supabase functions deploy generate-pmoc-trt-pdf       (NOVA)
--      → supabase functions deploy generate-pmoc-dossie-pdf    (embed assinatura)
--      → supabase functions deploy generate-pmoc-cronograma-pdf (assinatura no rodapé do hash)
--      → supabase functions deploy pmoc-portal-share           (3º doc_type no payload)
--   3. Smoke test:
--      - RT COM assinatura → TRT mostra imagem embedada acima da linha.
--      - RT SEM assinatura → TRT mostra linha pontilhada vazia (estado pendente).
--      - Atualizar signature_image_url do RT → próxima geração regenera (cache miss).
-- =============================================================================

-- Amplia o CHECK de pmoc_documents.doc_type para aceitar 'planilha'.
-- Por quê: a Fase 4 (Planilha PMOC) insere com doc_type='planilha' via edge function;
-- a constraint atual rejeitava o valor e o download standalone falhava no INSERT.
-- Migração aditiva: só amplia o domínio do CHECK, não invalida linhas existentes.

ALTER TABLE public.pmoc_documents
  DROP CONSTRAINT IF EXISTS pmoc_documents_doc_type_check;

ALTER TABLE public.pmoc_documents
  ADD CONSTRAINT pmoc_documents_doc_type_check
  CHECK (doc_type IN ('dossie_pmoc', 'cronograma_anual', 'termo_rt', 'certificado', 'planilha'));

-- PMOC: validade (vencimento) dos documentos de conformidade TRT e Certificado.
-- Cada documento gerado passa a ter valid_until = data de geração + duração configurável
-- por empresa (default 12 meses). Permite alertar quando a conformidade está vencida.
--
-- RLS: nenhuma policy nova necessária. As colunas adicionadas herdam as policies
-- multi-tenant (por company_id) já existentes em pmoc_documents e
-- company_pmoc_document_templates. Coluna nova não exige policy própria no Postgres.

-- 1) Data de vencimento por documento gerado (nullable: só TRT/Certificado têm validade).
ALTER TABLE public.pmoc_documents
  ADD COLUMN IF NOT EXISTS valid_until date;

-- 2) Duração da validade configurável por empresa, para TRT e Certificado.
ALTER TABLE public.company_pmoc_document_templates
  ADD COLUMN IF NOT EXISTS termo_rt_validity_months integer NOT NULL DEFAULT 12;

ALTER TABLE public.company_pmoc_document_templates
  ADD COLUMN IF NOT EXISTS certificado_validity_months integer NOT NULL DEFAULT 12;

-- 3) Backfill: documentos TRT/Certificado já gerados recebem validade de 12 meses
--    a partir da geração (não há config histórica de duração). Data calculada em
--    timezone America/Sao_Paulo (UTC-3) antes de truncar para date.
UPDATE public.pmoc_documents
SET valid_until = (generated_at AT TIME ZONE 'America/Sao_Paulo')::date + interval '12 months'
WHERE doc_type IN ('termo_rt', 'certificado')
  AND valid_until IS NULL;

-- 4) Comentários das colunas novas.
COMMENT ON COLUMN public.pmoc_documents.valid_until IS
  'Data de vencimento do documento de conformidade (TRT/Certificado). NULL para tipos sem validade.';

COMMENT ON COLUMN public.company_pmoc_document_templates.termo_rt_validity_months IS
  'Duracao da validade do Termo de Responsabilidade Tecnica em meses (default 12).';

COMMENT ON COLUMN public.company_pmoc_document_templates.certificado_validity_months IS
  'Duracao da validade do Certificado de Conformidade em meses (default 12).';

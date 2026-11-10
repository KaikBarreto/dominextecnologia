-- Validade específica do Certificado de Conformidade por contrato PMOC.
-- NULL mantém a herança do padrão definido pela empresa.

BEGIN;

ALTER TABLE public.pmoc_contract_documents_custom
  ADD COLUMN IF NOT EXISTS certificado_validity_months integer;

ALTER TABLE public.pmoc_contract_documents_custom
  DROP CONSTRAINT IF EXISTS pmoc_custom_certificado_validity_months_check;

ALTER TABLE public.pmoc_contract_documents_custom
  ADD CONSTRAINT pmoc_custom_certificado_validity_months_check
  CHECK (
    certificado_validity_months IS NULL
    OR certificado_validity_months BETWEEN 1 AND 60
  );

COMMENT ON COLUMN public.pmoc_contract_documents_custom.certificado_validity_months IS
  'Validade, em meses, do Certificado de Conformidade deste contrato. '
  'NULL herda company_pmoc_document_templates.certificado_validity_months.';

COMMIT;

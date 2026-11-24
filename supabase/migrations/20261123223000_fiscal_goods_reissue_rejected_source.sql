-- A rejeição é terminal e permanece imutável, mas não bloqueia uma nova
-- tentativa fiscal para a mesma venda ou compra.
DROP INDEX IF EXISTS public.uq_nfe_documents_company_source;
CREATE UNIQUE INDEX uq_nfe_documents_company_source
ON public.nfe_documents(company_id, source_type, source_id)
WHERE source_id IS NOT NULL AND status NOT IN ('cancelled', 'rejected');

DROP INDEX IF EXISTS public.uq_nfce_documents_company_source;
CREATE UNIQUE INDEX uq_nfce_documents_company_source
ON public.nfce_documents(company_id, source_type, source_id)
WHERE source_id IS NOT NULL AND status NOT IN ('cancelled', 'rejected');

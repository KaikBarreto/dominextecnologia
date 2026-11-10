-- Documentos PMOC emitidos diretamente de uma Ordem de Servico concluida.
-- Cada versao e uma fotografia imutavel: PDF, nome e dados de emissao nao
-- acompanham alteracoes futuras no cliente, RT, produto ou equipamento.

CREATE TABLE public.service_order_pmoc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  doc_type text NOT NULL CHECK (
    doc_type IN ('relatorio_servico', 'certificado_conformidade')
  ),
  version integer NOT NULL CHECK (version > 0),
  content_hash text NOT NULL CHECK (length(content_hash) = 64),
  pdf_storage_path text NOT NULL CHECK (length(trim(pdf_storage_path)) > 0),
  file_name text NOT NULL CHECK (
    length(trim(file_name)) > 0 AND file_name ~* '\.pdf$'
  ),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  valid_until date,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (service_order_id, doc_type, version),
  UNIQUE (service_order_id, doc_type, content_hash)
);

COMMENT ON TABLE public.service_order_pmoc_documents IS
  'Versoes imutaveis de relatorios de servico e certificados PMOC emitidos por OS concluida.';
COMMENT ON COLUMN public.service_order_pmoc_documents.snapshot IS
  'Snapshot auditavel dos dados usados na emissao; nunca deve ser recalculado a partir dos cadastros atuais.';

CREATE INDEX idx_service_order_pmoc_docs_order_type
  ON public.service_order_pmoc_documents(service_order_id, doc_type, version DESC);
CREATE INDEX idx_service_order_pmoc_docs_company_generated
  ON public.service_order_pmoc_documents(company_id, generated_at DESC);
CREATE INDEX idx_service_order_pmoc_docs_hash
  ON public.service_order_pmoc_documents(service_order_id, doc_type, content_hash);

CREATE OR REPLACE FUNCTION public.service_order_pmoc_documents_validate_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT so.company_id
    INTO v_company_id
    FROM public.service_orders so
   WHERE so.id = NEW.service_order_id;

  IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Empresa do documento nao corresponde a empresa da ordem de servico.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_service_order_pmoc_documents_company
  BEFORE INSERT ON public.service_order_pmoc_documents
  FOR EACH ROW EXECUTE FUNCTION public.service_order_pmoc_documents_validate_company();

CREATE OR REPLACE FUNCTION public.service_order_pmoc_documents_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Documentos PMOC emitidos por OS sao imutaveis.'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER trg_service_order_pmoc_documents_no_update
  BEFORE UPDATE ON public.service_order_pmoc_documents
  FOR EACH ROW EXECUTE FUNCTION public.service_order_pmoc_documents_block_mutation();

ALTER TABLE public.service_order_pmoc_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_service_order_pmoc_documents"
  ON public.service_order_pmoc_documents
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_select_service_order_pmoc_documents"
  ON public.service_order_pmoc_documents
  FOR SELECT TO authenticated
  USING (
    (
      company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.tenant_subscription_allows_access(company_id)
    )
    OR public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  );
REVOKE ALL ON public.service_order_pmoc_documents FROM anon, authenticated;
GRANT SELECT ON public.service_order_pmoc_documents TO authenticated;
GRANT ALL ON public.service_order_pmoc_documents TO service_role;

-- O bucket e compartilhado com documentos PMOC contratuais. Endurecer a
-- policy existente evita que uma assinatura vencida contorne o gate da tabela
-- acessando diretamente o objeto; URLs assinadas continuam sendo emitidas
-- somente pelas edges autenticadas via service_role.
DROP POLICY IF EXISTS "pmoc_docs_storage_select_own_company" ON storage.objects;
CREATE POLICY "pmoc_docs_storage_select_own_company"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'pmoc-documents'
    AND (
      (
        (storage.foldername(name))[1]::uuid = public.get_user_company_id((SELECT auth.uid()))
        AND public.tenant_subscription_allows_access((storage.foldername(name))[1]::uuid)
      )
      OR public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    )
  );

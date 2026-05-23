-- =============================================================================
-- PMOC v1.9.x — Onda C: Dossiê PMOC + Cronograma Anual + Editor Rich-Text
-- =============================================================================
-- Plano mestre: docs/planos/2026-05-23-pmoc-v1.9-arquitetura.md
-- Plano da onda: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md
-- Regras de RLS (VINCULANTE): docs/planos/2026-05-23-pmoc-onda-C-rls-rules.md
--
-- Escopo desta migration:
--   1. Tabela pmoc_contract_documents_custom (textos rich editáveis do gestor)
--      + RLS (SELECT tenant / INSERT-UPDATE admin-gestor / DELETE admin)
--      + Triggers (updated_by + updated_at automáticos, anti-tenant-jump,
--                  coerência company_id vs contract_id)
--      + CHECK de tamanho (50KB)
--   2. Tabela pmoc_documents (versões imutáveis de PDFs gerados)
--      + RLS (SELECT tenant / INSERT service_role only / UPDATE só notes /
--             DELETE super_admin)
--      + Triggers (imutabilidade exceto notes, coerência company_id vs
--                  contract_id)
--      + Índices (lookup última versão)
--      + CHECK de notes (500 chars)
--   3. Função compartilhada pmoc_enforce_company_match_via_contract
--      (SECURITY DEFINER + search_path = public) usada por ambas as tabelas.
--   4. Função compartilhada raise_company_immutable (helper anti-tenant-jump).
--   5. Bucket storage pmoc-documents (privado, 5MB, application/pdf)
--      + Policy SELECT por (foldername[1] = company_id)
--      + 3 Policies INSERT/UPDATE/DELETE explicitamente negadas pra
--        authenticated (service_role bypassa por design Supabase).
--
-- Toda a migration é UMA transação (BEGIN/COMMIT). ROLLBACK automático se
-- algum step falhar.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Helper compartilhado: raise_company_immutable
--    Usado pelo trigger anti-tenant-jump em pmoc_contract_documents_custom.
--    Pode ser reusado por futuras tabelas multi-tenant. Idempotente.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.raise_company_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'company_id é imutável após criação do registro'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

COMMENT ON FUNCTION public.raise_company_immutable() IS
  'Helper genérico anti-tenant-jump: levanta exceção quando uma trigger detecta '
  'tentativa de alterar company_id de um registro multi-tenant. Reusado pelas '
  'tabelas da Onda C (pmoc_contract_documents_custom) e futuras.';

-- -----------------------------------------------------------------------------
-- 0b. Helper compartilhado: pmoc_enforce_company_match_via_contract
--     Valida que company_id da linha bate com contracts.company_id.
--     SECURITY DEFINER pra enxergar contracts.company_id independente da RLS
--     da sessão atual (mensagem de erro fica clara, evita cross-tenant via
--     INSERT com par (company_id, contract_id) inconsistente).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pmoc_enforce_company_match_via_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contract_company uuid;
BEGIN
  SELECT company_id INTO contract_company
    FROM public.contracts
    WHERE id = NEW.contract_id;

  IF contract_company IS NULL THEN
    RAISE EXCEPTION 'Contrato % não encontrado', NEW.contract_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF contract_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'company_id difere de contracts.company_id (cross-tenant blocked)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pmoc_enforce_company_match_via_contract() IS
  'Valida coerência company_id ↔ contracts.company_id em pmoc_documents e '
  'pmoc_contract_documents_custom. SECURITY DEFINER pra bypassar RLS na leitura '
  'de contracts (mensagem de erro clara). Lição do incidente 1.8.4.';

-- =============================================================================
-- §2. Tabela pmoc_contract_documents_custom (editor rich)
-- =============================================================================
-- Armazena os HTMLs editados pelo gestor de Termo RT e Certificado.
-- Quando o campo é NULL, a edge function de geração usa o template padrão.
-- "Restaurar texto padrão" do UI = setar NULL aqui.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pmoc_contract_documents_custom (
  contract_id            uuid PRIMARY KEY REFERENCES public.contracts(id) ON DELETE CASCADE,
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  termo_rt_content       text,
  certificado_content    text,
  termo_rt_updated_at    timestamptz,
  certificado_updated_at timestamptz,
  updated_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pmoc_custom_termo_rt_size
    CHECK (termo_rt_content IS NULL OR length(termo_rt_content) <= 50000),
  CONSTRAINT pmoc_custom_certificado_size
    CHECK (certificado_content IS NULL OR length(certificado_content) <= 50000)
);

COMMENT ON TABLE public.pmoc_contract_documents_custom IS
  'Textos rich-text (HTML) editados pelo gestor para Termo de Responsabilidade '
  'Técnica e Certificado de Conformidade do PMOC. Quando NULL, edge function '
  'usa template padrão. Sanitização HTML obrigatória server-side antes de '
  'gerar PDF (regra Plataforma §2.7).';

COMMENT ON COLUMN public.pmoc_contract_documents_custom.termo_rt_content IS
  'HTML rich do Termo RT. Limite 50KB. Sanitizado server-side antes de gerar '
  'PDF (DOMPurify whitelist). NULL = usa template padrão.';

COMMENT ON COLUMN public.pmoc_contract_documents_custom.certificado_content IS
  'HTML rich do Certificado de Conformidade. Limite 50KB. Sanitizado server-side '
  'antes de gerar PDF. NULL = usa template padrão.';

CREATE INDEX IF NOT EXISTS idx_pmoc_custom_company
  ON public.pmoc_contract_documents_custom(company_id);

-- ---- Trigger updated_by + updated_at automáticos
CREATE OR REPLACE FUNCTION public.pmoc_custom_set_updated_by()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_by := auth.uid();
  IF TG_OP = 'INSERT' THEN
    IF NEW.termo_rt_content    IS NOT NULL THEN NEW.termo_rt_updated_at    := now(); END IF;
    IF NEW.certificado_content IS NOT NULL THEN NEW.certificado_updated_at := now(); END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.termo_rt_content    IS DISTINCT FROM OLD.termo_rt_content    THEN NEW.termo_rt_updated_at    := now(); END IF;
    IF NEW.certificado_content IS DISTINCT FROM OLD.certificado_content THEN NEW.certificado_updated_at := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pmoc_custom_set_updated_by() IS
  'Preenche updated_by (auth.uid()) e marca *_updated_at quando o conteúdo '
  'correspondente muda. Não confia em payload do client.';

DROP TRIGGER IF EXISTS trg_pmoc_custom_set_updated_by ON public.pmoc_contract_documents_custom;
CREATE TRIGGER trg_pmoc_custom_set_updated_by
  BEFORE INSERT OR UPDATE ON public.pmoc_contract_documents_custom
  FOR EACH ROW
  EXECUTE FUNCTION public.pmoc_custom_set_updated_by();

-- ---- Trigger anti-tenant-jump (bloqueia UPDATE de company_id)
DROP TRIGGER IF EXISTS trg_pmoc_custom_prevent_company_change ON public.pmoc_contract_documents_custom;
CREATE TRIGGER trg_pmoc_custom_prevent_company_change
  BEFORE UPDATE OF company_id ON public.pmoc_contract_documents_custom
  FOR EACH ROW
  WHEN (OLD.company_id IS DISTINCT FROM NEW.company_id)
  EXECUTE FUNCTION public.raise_company_immutable();

-- ---- Trigger coerência company_id ↔ contracts.company_id
DROP TRIGGER IF EXISTS trg_pmoc_custom_enforce_company_match ON public.pmoc_contract_documents_custom;
CREATE TRIGGER trg_pmoc_custom_enforce_company_match
  BEFORE INSERT OR UPDATE OF company_id, contract_id ON public.pmoc_contract_documents_custom
  FOR EACH ROW
  EXECUTE FUNCTION public.pmoc_enforce_company_match_via_contract();

-- ---- RLS
ALTER TABLE public.pmoc_contract_documents_custom ENABLE ROW LEVEL SECURITY;

-- service_role full access (padrão do projeto pra edge functions / cron)
DROP POLICY IF EXISTS "service_role_full_access_pmoc_custom" ON public.pmoc_contract_documents_custom;
CREATE POLICY "service_role_full_access_pmoc_custom"
  ON public.pmoc_contract_documents_custom FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- SELECT — qualquer usuário autenticado do tenant
DROP POLICY IF EXISTS "pmoc_custom_tenant_select" ON public.pmoc_contract_documents_custom;
CREATE POLICY "pmoc_custom_tenant_select"
  ON public.pmoc_contract_documents_custom FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- INSERT — admin OU gestor do tenant (ou super_admin)
DROP POLICY IF EXISTS "pmoc_custom_admin_gestor_insert" ON public.pmoc_contract_documents_custom;
CREATE POLICY "pmoc_custom_admin_gestor_insert"
  ON public.pmoc_contract_documents_custom FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      company_id = public.get_user_company_id(auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'gestor'::app_role)
      )
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- UPDATE — admin OU gestor do tenant (ou super_admin)
DROP POLICY IF EXISTS "pmoc_custom_admin_gestor_update" ON public.pmoc_contract_documents_custom;
CREATE POLICY "pmoc_custom_admin_gestor_update"
  ON public.pmoc_contract_documents_custom FOR UPDATE
  TO authenticated
  USING (
    (
      company_id = public.get_user_company_id(auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'gestor'::app_role)
      )
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (
      company_id = public.get_user_company_id(auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'gestor'::app_role)
      )
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- DELETE — só admin (gestor não apaga) ou super_admin
DROP POLICY IF EXISTS "pmoc_custom_admin_delete" ON public.pmoc_contract_documents_custom;
CREATE POLICY "pmoc_custom_admin_delete"
  ON public.pmoc_contract_documents_custom FOR DELETE
  TO authenticated
  USING (
    (
      company_id = public.get_user_company_id(auth.uid())
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- =============================================================================
-- §1. Tabela pmoc_documents (versões imutáveis de PDFs gerados)
-- =============================================================================
-- Cada regeneração de PDF gera uma nova linha (version+1). Conteúdo idêntico
-- (mesmo content_hash) reusa a versão existente (cache hit na edge function).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pmoc_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contract_id      uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  doc_type         text NOT NULL CHECK (doc_type IN ('dossie_pmoc', 'cronograma_anual')),
  version          integer NOT NULL,
  content_hash     text NOT NULL,
  pdf_storage_path text NOT NULL,
  generated_at     timestamptz NOT NULL DEFAULT now(),
  generated_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes            text,
  CONSTRAINT pmoc_documents_version_positive CHECK (version >= 1),
  CONSTRAINT pmoc_documents_notes_size CHECK (notes IS NULL OR length(notes) <= 500),
  UNIQUE (contract_id, doc_type, version)
);

COMMENT ON TABLE public.pmoc_documents IS
  'Versões imutáveis dos PDFs PMOC gerados (dossiê e cronograma anual). '
  'INSERT via edge function (service_role). UPDATE só de `notes`. DELETE só '
  'super_admin (auditoria forçada). Lição incidente 1.8.4.';

COMMENT ON COLUMN public.pmoc_documents.content_hash IS
  'SHA-256 dos campos dinâmicos. Mesmo hash = reusar versão (cache).';

COMMENT ON COLUMN public.pmoc_documents.pdf_storage_path IS
  'Path no bucket pmoc-documents. Convenção: {company_id}/{contract_id}/{doc_type}-v{n}.pdf';

-- Lookup última versão por contrato + doc_type (usado por pmoc-portal-share)
CREATE INDEX IF NOT EXISTS idx_pmoc_docs_contract_type
  ON public.pmoc_documents(contract_id, doc_type, version DESC);

-- Lookup auxiliar pra queries de tenant (super_admin Auctus, audit)
CREATE INDEX IF NOT EXISTS idx_pmoc_docs_company_contract_type
  ON public.pmoc_documents(company_id, contract_id, doc_type, version DESC);

-- ---- Trigger imutabilidade exceto `notes`
CREATE OR REPLACE FUNCTION public.pmoc_documents_block_immutable_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id              IS DISTINCT FROM OLD.id              THEN RAISE EXCEPTION 'pmoc_documents.id é imutável'              USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NEW.company_id      IS DISTINCT FROM OLD.company_id      THEN RAISE EXCEPTION 'pmoc_documents.company_id é imutável'      USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NEW.contract_id     IS DISTINCT FROM OLD.contract_id     THEN RAISE EXCEPTION 'pmoc_documents.contract_id é imutável'     USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NEW.doc_type        IS DISTINCT FROM OLD.doc_type        THEN RAISE EXCEPTION 'pmoc_documents.doc_type é imutável'        USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NEW.version         IS DISTINCT FROM OLD.version         THEN RAISE EXCEPTION 'pmoc_documents.version é imutável'         USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NEW.content_hash    IS DISTINCT FROM OLD.content_hash    THEN RAISE EXCEPTION 'pmoc_documents.content_hash é imutável'    USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NEW.pdf_storage_path IS DISTINCT FROM OLD.pdf_storage_path THEN RAISE EXCEPTION 'pmoc_documents.pdf_storage_path é imutável' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NEW.generated_at    IS DISTINCT FROM OLD.generated_at    THEN RAISE EXCEPTION 'pmoc_documents.generated_at é imutável'    USING ERRCODE = 'insufficient_privilege'; END IF;
  IF NEW.generated_by    IS DISTINCT FROM OLD.generated_by    THEN RAISE EXCEPTION 'pmoc_documents.generated_by é imutável'    USING ERRCODE = 'insufficient_privilege'; END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pmoc_documents_block_immutable_update() IS
  'Bloqueia UPDATE de qualquer campo de pmoc_documents EXCETO notes. Versões '
  'são fotografias auditáveis — só notes muda (anotação operacional).';

DROP TRIGGER IF EXISTS trg_pmoc_documents_block_immutable_update ON public.pmoc_documents;
CREATE TRIGGER trg_pmoc_documents_block_immutable_update
  BEFORE UPDATE ON public.pmoc_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.pmoc_documents_block_immutable_update();

-- ---- Trigger coerência company_id ↔ contracts.company_id (mesmo helper)
DROP TRIGGER IF EXISTS trg_pmoc_documents_enforce_company_match ON public.pmoc_documents;
CREATE TRIGGER trg_pmoc_documents_enforce_company_match
  BEFORE INSERT OR UPDATE OF company_id, contract_id ON public.pmoc_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.pmoc_enforce_company_match_via_contract();

-- ---- RLS
ALTER TABLE public.pmoc_documents ENABLE ROW LEVEL SECURITY;

-- service_role full access (edge function de geração insere com service_role)
DROP POLICY IF EXISTS "service_role_full_access_pmoc_documents" ON public.pmoc_documents;
CREATE POLICY "service_role_full_access_pmoc_documents"
  ON public.pmoc_documents FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- SELECT — qualquer usuário autenticado do tenant (auditoria operacional)
DROP POLICY IF EXISTS "pmoc_docs_tenant_select" ON public.pmoc_documents;
CREATE POLICY "pmoc_docs_tenant_select"
  ON public.pmoc_documents FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- INSERT — explicitamente NEGADO pra authenticated (só edge function via
-- service_role insere). Plataforma §1.4 preferência "service_role exclusivo".
DROP POLICY IF EXISTS "pmoc_docs_no_authenticated_insert" ON public.pmoc_documents;
CREATE POLICY "pmoc_docs_no_authenticated_insert"
  ON public.pmoc_documents FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- UPDATE — admin/gestor do tenant (mas o trigger de imutabilidade bloqueia
-- modificação de qualquer campo EXCETO notes — UPDATE só funciona pra notes).
DROP POLICY IF EXISTS "pmoc_docs_notes_update" ON public.pmoc_documents;
CREATE POLICY "pmoc_docs_notes_update"
  ON public.pmoc_documents FOR UPDATE
  TO authenticated
  USING (
    (
      company_id = public.get_user_company_id(auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'gestor'::app_role)
      )
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (
      company_id = public.get_user_company_id(auth.uid())
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'gestor'::app_role)
      )
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- DELETE — só super_admin Auctus (auditoria forçada, ex.: pedido LGPD)
DROP POLICY IF EXISTS "pmoc_docs_super_admin_delete" ON public.pmoc_documents;
CREATE POLICY "pmoc_docs_super_admin_delete"
  ON public.pmoc_documents FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- =============================================================================
-- §3. Bucket storage pmoc-documents
-- =============================================================================
-- Privado, 5MB, application/pdf.
-- SELECT por (foldername[1] = company_id).
-- INSERT/UPDATE/DELETE explicitamente negados pra authenticated (service_role
-- da edge function faz upload).
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pmoc-documents',
  'pmoc-documents',
  false,
  5242880,  -- 5 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Convenção de path: {company_id}/{contract_id}/{doc_type}-v{n}.pdf
-- Primeira pasta = company_id (storage.foldername(name)[1]).

-- SELECT — usuários autenticados do tenant dono (foldername[1] = company_id)
DROP POLICY IF EXISTS "pmoc_docs_storage_select_own_company" ON storage.objects;
CREATE POLICY "pmoc_docs_storage_select_own_company"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'pmoc-documents'
    AND (
      (storage.foldername(name))[1]::uuid = public.get_user_company_id(auth.uid())
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

-- INSERT/UPDATE/DELETE — explicitamente NEGADOS pra authenticated.
-- Edge functions usam service_role e bypassam essas policies por design.
-- Justificativa: PDF é artefato gerado, NÃO editado manualmente. Permitir
-- upload por usuário abre brecha pra subir PDF forjado (ex: certificado fake).

DROP POLICY IF EXISTS "pmoc_docs_storage_no_authenticated_insert" ON storage.objects;
CREATE POLICY "pmoc_docs_storage_no_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id <> 'pmoc-documents');

DROP POLICY IF EXISTS "pmoc_docs_storage_no_authenticated_update" ON storage.objects;
CREATE POLICY "pmoc_docs_storage_no_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id <> 'pmoc-documents');

DROP POLICY IF EXISTS "pmoc_docs_storage_no_authenticated_delete" ON storage.objects;
CREATE POLICY "pmoc_docs_storage_no_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id <> 'pmoc-documents');

COMMIT;

-- =============================================================================
-- FIM da migration PMOC v1.9.x — Onda C.
--
-- Próximos passos (não-SQL, fora desta migration):
--   1. Regenerar src/integrations/supabase/types.ts
--      → supabase gen types typescript --linked > src/integrations/supabase/types.ts
--   2. Deploy das edge functions:
--      → supabase functions deploy generate-pmoc-dossie-pdf
--      → supabase functions deploy generate-pmoc-cronograma-pdf
--      → supabase functions deploy pmoc-portal-share --no-verify-jwt
--   3. Limpar @ts-expect-error em:
--      - src/hooks/usePmocDocuments.ts:46
--      - src/hooks/usePmocContractCustomDocs.ts:43 e :91
--   4. Audit: contar pmoc_documents (0 inicial), pmoc_contract_documents_custom
--      (0 inicial), e bucket pmoc-documents existe.
--   5. Executar os 10 cenários cross-tenant da §7 das RLS rules da Onda C.
-- =============================================================================

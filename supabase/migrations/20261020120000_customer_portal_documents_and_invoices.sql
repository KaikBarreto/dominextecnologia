-- Documentos e notas fiscais no Portal do Cliente.
--
-- Entrega tres origens no mesmo portal:
--   1. NFS-e autorizadas emitidas pelo Dominex (nfse_emissions);
--   2. notas/documentos enviados manualmente (customer_documents);
--   3. anexos de contratos ja liberados para o portal (contract_attachments).
--
-- Arquivos manuais ficam em bucket privado. O payload publico nunca recebe
-- storage_path; o download passa pela edge customer-portal-document-download,
-- que revalida token, sessao e permissao antes de gerar URL temporaria.

BEGIN;

CREATE TABLE public.customer_documents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id           uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  document_kind         text NOT NULL CHECK (document_kind IN ('invoice', 'document')),
  document_type         text NOT NULL DEFAULT 'other'
                                  CHECK (document_type IN ('nfse', 'nfe_product', 'contract', 'other')),
  title                 text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  description           text CHECK (description IS NULL OR char_length(description) <= 500),
  document_number       text CHECK (document_number IS NULL OR char_length(document_number) <= 80),
  issue_date            date,
  amount                numeric(14,2) CHECK (amount IS NULL OR amount >= 0),
  storage_path          text NOT NULL UNIQUE,
  file_name             text NOT NULL CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 255),
  mime_type             text,
  size_bytes            bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  is_visible_in_portal  boolean NOT NULL DEFAULT true,
  uploaded_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_documents_customer_kind_created_idx
  ON public.customer_documents (customer_id, document_kind, created_at DESC);
CREATE INDEX customer_documents_company_id_idx
  ON public.customer_documents (company_id);

COMMENT ON TABLE public.customer_documents IS
  'Arquivos manuais vinculados ao cliente: notas fiscais externas e documentos avulsos exibiveis no portal.';
COMMENT ON COLUMN public.customer_documents.storage_path IS
  'Caminho privado no bucket customer-documents. Nunca expor no payload do portal.';

CREATE OR REPLACE FUNCTION public.set_customer_document_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_company_id uuid;
BEGIN
  SELECT c.company_id INTO v_customer_company_id
    FROM public.customers c
   WHERE c.id = NEW.customer_id
     AND COALESCE(c.is_deleted, false) = false;

  IF v_customer_company_id IS NULL THEN
    RAISE EXCEPTION 'Cliente nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    IF v_customer_company_id IS DISTINCT FROM public.get_user_company_id(auth.uid())
       AND NOT public.is_super_admin(auth.uid())
    THEN
      RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;
    NEW.company_id := v_customer_company_id;
    IF TG_OP = 'INSERT' THEN
      NEW.uploaded_by := auth.uid();
    END IF;
  ELSIF NEW.company_id IS DISTINCT FROM v_customer_company_id THEN
    RAISE EXCEPTION 'Empresa do documento diverge da empresa do cliente'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.storage_path NOT LIKE v_customer_company_id::text || '/' || NEW.customer_id::text || '/%' THEN
    RAISE EXCEPTION 'Caminho do arquivo diverge da empresa ou do cliente'
      USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_set_customer_document_owner
  BEFORE INSERT OR UPDATE ON public.customer_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_customer_document_owner();

ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_documents_select_own_company
  ON public.customer_documents FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id(auth.uid()))
    OR (SELECT public.is_super_admin(auth.uid()))
  );

CREATE POLICY customer_documents_insert_own_company
  ON public.customer_documents FOR INSERT TO authenticated
  WITH CHECK (
    (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.user_has_permission(auth.uid(), 'fn:edit_customer')
    )
    OR (SELECT public.is_super_admin(auth.uid()))
  );

CREATE POLICY customer_documents_update_own_company
  ON public.customer_documents FOR UPDATE TO authenticated
  USING (
    (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.user_has_permission(auth.uid(), 'fn:edit_customer')
    )
    OR (SELECT public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.user_has_permission(auth.uid(), 'fn:edit_customer')
    )
    OR (SELECT public.is_super_admin(auth.uid()))
  );

CREATE POLICY customer_documents_delete_own_company
  ON public.customer_documents FOR DELETE TO authenticated
  USING (
    (
      company_id = (SELECT public.get_user_company_id(auth.uid()))
      AND public.user_has_permission(auth.uid(), 'fn:edit_customer')
    )
    OR (SELECT public.is_super_admin(auth.uid()))
  );

CREATE POLICY customer_documents_service_role_full_access
  ON public.customer_documents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_documents TO authenticated;
GRANT ALL ON public.customer_documents TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer-documents',
  'customer-documents',
  false,
  15728640,
  ARRAY[
    'application/pdf',
    'application/xml',
    'text/xml',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY customer_documents_storage_select_own_company
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'customer-documents'
    AND (
      (storage.foldername(name))[1]::uuid = (SELECT public.get_user_company_id(auth.uid()))
      OR (SELECT public.is_super_admin(auth.uid()))
    )
  );

CREATE POLICY customer_documents_storage_insert_own_company
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'customer-documents'
    AND (
      (
        (storage.foldername(name))[1]::uuid = (SELECT public.get_user_company_id(auth.uid()))
        AND public.user_has_permission(auth.uid(), 'fn:edit_customer')
      )
      OR (SELECT public.is_super_admin(auth.uid()))
    )
  );

CREATE POLICY customer_documents_storage_update_own_company
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'customer-documents'
    AND (
      (
        (storage.foldername(name))[1]::uuid = (SELECT public.get_user_company_id(auth.uid()))
        AND public.user_has_permission(auth.uid(), 'fn:edit_customer')
      )
      OR (SELECT public.is_super_admin(auth.uid()))
    )
  )
  WITH CHECK (
    bucket_id = 'customer-documents'
    AND (
      (
        (storage.foldername(name))[1]::uuid = (SELECT public.get_user_company_id(auth.uid()))
        AND public.user_has_permission(auth.uid(), 'fn:edit_customer')
      )
      OR (SELECT public.is_super_admin(auth.uid()))
    )
  );

CREATE POLICY customer_documents_storage_delete_own_company
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'customer-documents'
    AND (
      (
        (storage.foldername(name))[1]::uuid = (SELECT public.get_user_company_id(auth.uid()))
        AND public.user_has_permission(auth.uid(), 'fn:edit_customer')
      )
      OR (SELECT public.is_super_admin(auth.uid()))
    )
  );

-- Duas novas chaves sensiveis de permissao. Comecam desligadas inclusive em
-- portais existentes: a empresa precisa liberar fiscal/documentos de forma
-- explicita para nao expor historico ao publicar esta migration.
ALTER TABLE public.customer_portals
  ALTER COLUMN permissions SET DEFAULT jsonb_build_object(
    'service_orders', true,
    'equipment', true,
    'contracts', true,
    'charges', true,
    'invoices', false,
    'documents', false,
    'ticket_requests', true
  );

ALTER TABLE public.customer_portals
  DROP CONSTRAINT IF EXISTS customer_portals_permissions_shape;

UPDATE public.customer_portals
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                     || jsonb_build_object(
                       'invoices', COALESCE((permissions->>'invoices')::boolean, false),
                       'documents', COALESCE((permissions->>'documents')::boolean, false)
                     );

ALTER TABLE public.customer_portals
  ADD CONSTRAINT customer_portals_permissions_shape CHECK (
    jsonb_typeof(permissions) = 'object'
    AND (permissions - ARRAY[
      'service_orders', 'equipment', 'contracts', 'charges',
      'invoices', 'documents', 'ticket_requests'
    ]::text[]) = '{}'::jsonb
    AND (NOT (permissions ? 'service_orders') OR jsonb_typeof(permissions->'service_orders') = 'boolean')
    AND (NOT (permissions ? 'equipment') OR jsonb_typeof(permissions->'equipment') = 'boolean')
    AND (NOT (permissions ? 'contracts') OR jsonb_typeof(permissions->'contracts') = 'boolean')
    AND (NOT (permissions ? 'charges') OR jsonb_typeof(permissions->'charges') = 'boolean')
    AND (NOT (permissions ? 'invoices') OR jsonb_typeof(permissions->'invoices') = 'boolean')
    AND (NOT (permissions ? 'documents') OR jsonb_typeof(permissions->'documents') = 'boolean')
    AND (NOT (permissions ? 'ticket_requests') OR jsonb_typeof(permissions->'ticket_requests') = 'boolean')
  );

CREATE OR REPLACE FUNCTION public.normalize_customer_portal_permissions(p_permissions jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'service_orders', COALESCE((p_permissions->>'service_orders')::boolean, true),
    'equipment', COALESCE((p_permissions->>'equipment')::boolean, true),
    'contracts', COALESCE((p_permissions->>'contracts')::boolean, true),
    'charges', COALESCE((p_permissions->>'charges')::boolean, true),
    -- Conteudo fiscal/documental e sensivel: chave ausente falha fechado.
    'invoices', COALESCE((p_permissions->>'invoices')::boolean, false),
    'documents', COALESCE((p_permissions->>'documents')::boolean, false),
    'ticket_requests', COALESCE((p_permissions->>'ticket_requests')::boolean, true)
  )
$$;

COMMENT ON COLUMN public.customer_portals.permissions IS
  'Allowlist por portal: service_orders, equipment, contracts, charges, invoices, documents e ticket_requests.';

-- Preserva a implementacao consolidada de acesso/senha/assinatura e a envolve
-- apenas para acrescentar os novos arrays. A funcao core deixa de ser chamavel
-- diretamente por anon/authenticated, evitando qualquer bypass do wrapper.
ALTER FUNCTION public.get_portal_data(text, text)
  RENAME TO get_portal_data_before_customer_documents;

REVOKE ALL ON FUNCTION public.get_portal_data_before_customer_documents(text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_data_before_customer_documents(text, text)
  TO service_role;

CREATE FUNCTION public.get_portal_data(
  p_token text,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_payload jsonb;
  v_customer_id uuid;
  v_company_id uuid;
  v_permissions jsonb;
  v_invoices jsonb := '[]'::jsonb;
  v_documents jsonb := '[]'::jsonb;
BEGIN
  v_payload := public.get_portal_data_before_customer_documents(p_token, p_session_token);

  IF v_payload IS NULL OR COALESCE(v_payload->>'access', '') <> 'granted' THEN
    RETURN v_payload;
  END IF;

  v_customer_id := NULLIF(v_payload #>> '{customer,id}', '')::uuid;
  v_company_id := NULLIF(v_payload #>> '{customer,company_id}', '')::uuid;
  v_permissions := public.normalize_customer_portal_permissions(v_payload->'permissions');

  IF COALESCE((v_permissions->>'invoices')::boolean, false) THEN
    SELECT COALESCE(jsonb_agg(rows.item ORDER BY rows.sort_date DESC NULLS LAST, rows.sort_created DESC), '[]'::jsonb)
      INTO v_invoices
      FROM (
        SELECT jsonb_build_object(
          'id', cd.id,
          'source', 'manual',
          'title', cd.title,
          'description', cd.description,
          'document_type', cd.document_type,
          'document_number', cd.document_number,
          'issue_date', cd.issue_date,
          'amount', cd.amount,
          'file_name', cd.file_name,
          'mime_type', cd.mime_type,
          'size_bytes', cd.size_bytes,
          'created_at', cd.created_at
        ) AS item,
        cd.issue_date AS sort_date,
        cd.created_at AS sort_created
          FROM public.customer_documents cd
         WHERE cd.company_id = v_company_id
           AND cd.customer_id = v_customer_id
           AND cd.document_kind = 'invoice'
           AND cd.is_visible_in_portal

        UNION ALL

        SELECT jsonb_build_object(
          'id', ne.id,
          'source', 'dominex_nfse',
          'title', COALESCE(NULLIF(ne.descricao_servico, ''), 'Nota fiscal de serviço'),
          'description', ne.descricao_servico,
          'document_type', 'nfse',
          'document_number', ne.numero_nfse,
          'issue_date', COALESCE(ne.emitida_em::date, ne.data_competencia, ne.created_at::date),
          'amount', ne.valor_servico,
          'file_name', CASE WHEN ne.numero_nfse IS NOT NULL THEN 'NFS-e-' || ne.numero_nfse || '.pdf' ELSE 'NFS-e.pdf' END,
          'mime_type', 'application/pdf',
          'size_bytes', NULL,
          'created_at', ne.created_at
        ) AS item,
        COALESCE(ne.emitida_em::date, ne.data_competencia, ne.created_at::date) AS sort_date,
        ne.created_at AS sort_created
          FROM public.nfse_emissions ne
         WHERE ne.company_id = v_company_id
           AND ne.customer_id = v_customer_id
           AND ne.status = 'autorizada'
      ) rows;
  END IF;

  IF COALESCE((v_permissions->>'documents')::boolean, false) THEN
    SELECT COALESCE(jsonb_agg(rows.item ORDER BY rows.sort_created DESC), '[]'::jsonb)
      INTO v_documents
      FROM (
        SELECT jsonb_build_object(
          'id', cd.id,
          'source', 'manual',
          'title', cd.title,
          'description', cd.description,
          'document_type', cd.document_type,
          'file_name', cd.file_name,
          'mime_type', cd.mime_type,
          'size_bytes', cd.size_bytes,
          'created_at', cd.created_at
        ) AS item,
        cd.created_at AS sort_created
          FROM public.customer_documents cd
         WHERE cd.company_id = v_company_id
           AND cd.customer_id = v_customer_id
           AND cd.document_kind = 'document'
           AND cd.is_visible_in_portal

        UNION ALL

        SELECT jsonb_build_object(
          'id', ca.id,
          'source', 'contract_attachment',
          'title', ca.display_name,
          'description', ct.name,
          'document_type', 'contract',
          'file_name', ca.display_name,
          'mime_type', ca.mime_type,
          'size_bytes', ca.size_bytes,
          'created_at', ca.created_at
        ) AS item,
        ca.created_at AS sort_created
          FROM public.contract_attachments ca
          JOIN public.contracts ct ON ct.id = ca.contract_id
         WHERE ca.company_id = v_company_id
           AND ct.company_id = v_company_id
           AND ct.customer_id = v_customer_id
           AND COALESCE(ct.portal_documents_released, false)
      ) rows;
  END IF;

  RETURN jsonb_set(
    jsonb_set(
      jsonb_set(v_payload, '{permissions}', v_permissions, true),
      '{invoices}', v_invoices, true
    ),
    '{documents}', v_documents, true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_data(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_portal_data(text, text)
  TO anon, authenticated, service_role;

-- Recria explicitamente o overload legado para ele apontar ao wrapper novo,
-- inclusive em sessoes que ja tenham resolvido/cacheado a funcao anterior.
CREATE OR REPLACE FUNCTION public.get_portal_data(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT public.get_portal_data(p_token, NULL)
$$;

REVOKE ALL ON FUNCTION public.get_portal_data(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_portal_data(text)
  TO anon, authenticated, service_role;

COMMIT;

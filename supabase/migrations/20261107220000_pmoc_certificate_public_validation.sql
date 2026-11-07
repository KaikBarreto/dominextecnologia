-- Numeração pública e validação dos certificados PMOC.
--
-- O número é monotônico por empresa e a reserva é idempotente pelo hash do
-- conteúdo. O token público é uma capability aleatória: ele permite validar
-- um certificado sem tornar a sequência enumerável nem abrir leitura anon nas
-- tabelas privadas de documentos.

CREATE TABLE public.pmoc_certificate_number_counters (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pmoc_certificate_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  certificate_number bigint NOT NULL CHECK (certificate_number > 0),
  validation_token text NOT NULL DEFAULT rtrim(
    translate(encode(gen_random_bytes(12), 'base64'), '+/', '-_'),
    '='
  ) CHECK (validation_token ~ '^[A-Za-z0-9_-]{16}$'),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  source_kind text NOT NULL CHECK (source_kind IN ('service_order', 'contract')),
  source_id uuid NOT NULL,
  service_order_document_id uuid REFERENCES public.service_order_pmoc_documents(id) ON DELETE CASCADE,
  contract_document_id uuid REFERENCES public.pmoc_documents(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'active')),
  issuer_name text,
  holder_name text,
  source_label text,
  issued_at timestamptz,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  CONSTRAINT pmoc_certificate_validations_company_number_unique
    UNIQUE (company_id, certificate_number),
  CONSTRAINT pmoc_certificate_validations_idempotency_unique
    UNIQUE (company_id, source_kind, idempotency_key),
  CONSTRAINT pmoc_certificate_validations_token_unique
    UNIQUE (validation_token),
  CONSTRAINT pmoc_certificate_validations_document_kind_check CHECK (
    status = 'reserved'
    OR (
      source_kind = 'service_order'
      AND service_order_document_id IS NOT NULL
      AND contract_document_id IS NULL
    )
    OR (
      source_kind = 'contract'
      AND contract_document_id IS NOT NULL
      AND service_order_document_id IS NULL
    )
  )
);

CREATE INDEX idx_pmoc_certificate_validations_company_created
  ON public.pmoc_certificate_validations(company_id, created_at DESC);

ALTER TABLE public.pmoc_certificate_number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmoc_certificate_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_pmoc_certificate_number_counters"
  ON public.pmoc_certificate_number_counters
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access_pmoc_certificate_validations"
  ON public.pmoc_certificate_validations
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.pmoc_certificate_number_counters FROM anon, authenticated;
REVOKE ALL ON public.pmoc_certificate_validations FROM anon, authenticated;
GRANT ALL ON public.pmoc_certificate_number_counters TO service_role;
GRANT ALL ON public.pmoc_certificate_validations TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_pmoc_certificate_validation(
  p_company_id uuid,
  p_idempotency_key text,
  p_source_kind text,
  p_source_id uuid
)
RETURNS TABLE (
  certificate_number bigint,
  validation_token text,
  validation_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_number bigint;
  v_token text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operacao restrita ao backend.' USING ERRCODE = '42501';
  END IF;
  IF p_company_id IS NULL OR p_source_id IS NULL
     OR p_source_kind NOT IN ('service_order', 'contract')
     OR p_idempotency_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Reserva de certificado invalida.' USING ERRCODE = '22023';
  END IF;

  SELECT v.certificate_number, v.validation_token
    INTO v_number, v_token
    FROM public.pmoc_certificate_validations v
   WHERE v.company_id = p_company_id
     AND v.source_kind = p_source_kind
     AND v.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.pmoc_certificate_validations v
       WHERE v.company_id = p_company_id
         AND v.source_kind = p_source_kind
         AND v.idempotency_key = p_idempotency_key
         AND v.source_id = p_source_id
    ) THEN
      RAISE EXCEPTION 'Chave idempotente associada a outra origem.' USING ERRCODE = '23514';
    END IF;
    RETURN QUERY SELECT v_number, v_token, 'PMOC-' || lpad(v_number::text, 6, '0');
    RETURN;
  END IF;

  INSERT INTO public.pmoc_certificate_number_counters (company_id)
  VALUES (p_company_id)
  ON CONFLICT (company_id) DO NOTHING;

  -- O lock por empresa lineariza emissões concorrentes sem serializar tenants.
  PERFORM 1
    FROM public.pmoc_certificate_number_counters c
   WHERE c.company_id = p_company_id
   FOR UPDATE;

  -- Outra chamada do mesmo hash pode ter concluído enquanto aguardávamos o lock.
  SELECT v.certificate_number, v.validation_token
    INTO v_number, v_token
    FROM public.pmoc_certificate_validations v
   WHERE v.company_id = p_company_id
     AND v.source_kind = p_source_kind
     AND v.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.pmoc_certificate_validations v
       WHERE v.company_id = p_company_id
         AND v.source_kind = p_source_kind
         AND v.idempotency_key = p_idempotency_key
         AND v.source_id = p_source_id
    ) THEN
      RAISE EXCEPTION 'Chave idempotente associada a outra origem.' USING ERRCODE = '23514';
    END IF;
    RETURN QUERY SELECT v_number, v_token, 'PMOC-' || lpad(v_number::text, 6, '0');
    RETURN;
  END IF;

  UPDATE public.pmoc_certificate_number_counters c
     SET last_number = c.last_number + 1,
         updated_at = now()
   WHERE c.company_id = p_company_id
  RETURNING c.last_number INTO v_number;

  INSERT INTO public.pmoc_certificate_validations (
    company_id,
    certificate_number,
    idempotency_key,
    source_kind,
    source_id
  ) VALUES (
    p_company_id,
    v_number,
    p_idempotency_key,
    p_source_kind,
    p_source_id
  )
  RETURNING pmoc_certificate_validations.validation_token INTO v_token;

  RETURN QUERY SELECT v_number, v_token, 'PMOC-' || lpad(v_number::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_pmoc_certificate_validation(
  p_company_id uuid,
  p_idempotency_key text,
  p_source_kind text,
  p_document_id uuid,
  p_issuer_name text,
  p_holder_name text,
  p_source_label text,
  p_issued_at timestamptz,
  p_valid_until date
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operacao restrita ao backend.' USING ERRCODE = '42501';
  END IF;

  IF p_source_kind = 'service_order' THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.service_order_pmoc_documents d
       WHERE d.id = p_document_id
         AND d.company_id = p_company_id
         AND d.doc_type = 'certificado_conformidade'
         AND d.content_hash = p_idempotency_key
    ) THEN
      RAISE EXCEPTION 'Documento de OS nao corresponde a reserva.' USING ERRCODE = '23514';
    END IF;
  ELSIF p_source_kind = 'contract' THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.pmoc_documents d
       WHERE d.id = p_document_id
         AND d.company_id = p_company_id
         AND d.doc_type = 'certificado'
         AND d.content_hash = p_idempotency_key
    ) THEN
      RAISE EXCEPTION 'Documento contratual nao corresponde a reserva.' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Origem do certificado invalida.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pmoc_certificate_validations v
     SET status = 'active',
         service_order_document_id = CASE WHEN p_source_kind = 'service_order' THEN p_document_id ELSE NULL END,
         contract_document_id = CASE WHEN p_source_kind = 'contract' THEN p_document_id ELSE NULL END,
         issuer_name = nullif(trim(p_issuer_name), ''),
         holder_name = nullif(trim(p_holder_name), ''),
         source_label = nullif(trim(p_source_label), ''),
         issued_at = p_issued_at,
         valid_until = p_valid_until,
         finalized_at = COALESCE(v.finalized_at, now())
   WHERE v.company_id = p_company_id
     AND v.source_kind = p_source_kind
     AND v.idempotency_key = p_idempotency_key
     AND (
       v.status = 'reserved'
       OR (p_source_kind = 'service_order' AND v.service_order_document_id = p_document_id)
       OR (p_source_kind = 'contract' AND v.contract_document_id = p_document_id)
     );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_pmoc_certificate_validation(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_pmoc_certificate_validation(uuid, text, text, uuid, text, text, text, timestamptz, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_pmoc_certificate_validation(uuid, text, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_pmoc_certificate_validation(uuid, text, text, uuid, text, text, text, timestamptz, date)
  TO service_role;

COMMENT ON TABLE public.pmoc_certificate_validations IS
  'Registro privado que sustenta a validação pública por capability token; números são lineares por empresa e reservas são idempotentes.';

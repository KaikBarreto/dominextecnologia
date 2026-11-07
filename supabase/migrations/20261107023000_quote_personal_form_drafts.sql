-- Rascunho pessoal da criação de orçamento. Nunca é um orçamento comercial.
-- Uma composição por usuário/empresa, com CAS, retry idempotente e TTL de 30 dias.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

CREATE SEQUENCE public.quote_form_draft_revision_seq;
REVOKE ALL ON SEQUENCE public.quote_form_draft_revision_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.quote_form_drafts (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb,
  revision bigint NOT NULL DEFAULT nextval('public.quote_form_draft_revision_seq'::regclass) CHECK (revision > 0),
  last_request_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  PRIMARY KEY (company_id, user_id),
  CONSTRAINT quote_form_drafts_payload_check CHECK (
    payload IS NULL OR (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 1048576)
  )
);
CREATE INDEX quote_form_drafts_expiration_idx ON public.quote_form_drafts(expires_at);
COMMENT ON TABLE public.quote_form_drafts IS 'Rascunho automático pessoal de criação, expira 30 dias após a última escrita. NULL é tombstone de descarte/conclusão; revision impede ressurreição por outra aba.';
ALTER TABLE public.quote_form_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own unexpired quote form draft" ON public.quote_form_drafts
  FOR SELECT TO authenticated USING (
    user_id = (SELECT auth.uid())
    AND company_id = (SELECT public.get_user_company_id(auth.uid()))
    AND expires_at > now()
    AND public.tenant_subscription_allows_access(company_id)
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.company_id = quote_form_drafts.company_id AND p.is_active IS TRUE)
  );
REVOKE ALL ON public.quote_form_drafts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.quote_form_drafts TO authenticated;

-- Parâmetros de identidade são ASSERTIONS, não uma seleção de tenant/usuário.
-- Impedem que requests em fila sobreviventes ao logout gravem no próximo login.
CREATE FUNCTION public.quote_form_draft_assert_access(p_company_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id
     OR p_company_id IS DISTINCT FROM public.get_user_company_id(auth.uid())
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.company_id = p_company_id AND p.is_active IS TRUE)
     OR public.tenant_subscription_allows_access(p_company_id) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'Rascunho indisponível para esta sessão.' USING ERRCODE = '42501'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.quote_form_draft_assert_access(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_quote_form_draft(p_company_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
DECLARE v_row public.quote_form_drafts;
BEGIN
  PERFORM public.quote_form_draft_assert_access(p_company_id, p_user_id);
  SELECT * INTO v_row FROM public.quote_form_drafts WHERE company_id = p_company_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('payload', NULL, 'revision', 0, 'updated_at', NULL, 'expires_at', NULL); END IF;
  RETURN jsonb_build_object('payload', CASE WHEN v_row.expires_at > now() THEN v_row.payload ELSE NULL END,
    'revision', v_row.revision, 'updated_at', v_row.updated_at, 'expires_at', v_row.expires_at);
END $fn$;
REVOKE ALL ON FUNCTION public.get_quote_form_draft(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_quote_form_draft(uuid, uuid) TO authenticated;

CREATE FUNCTION public.save_quote_form_draft(
  p_company_id uuid, p_user_id uuid, p_payload jsonb,
  p_expected_revision bigint, p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
DECLARE v_row public.quote_form_drafts; v_now timestamptz := clock_timestamp();
BEGIN
  PERFORM public.quote_form_draft_assert_access(p_company_id, p_user_id);
  IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0
     OR (p_payload IS NOT NULL AND (jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text) > 1048576))
  THEN RAISE EXCEPTION 'Rascunho inválido.' USING ERRCODE = '22023'; END IF;
  -- Revisões usam sequência global, não reiniciam após a limpeza física (evita ABA).
  -- Serializa também a criação quando ainda não há linha para FOR UPDATE.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_user_id::text, 0));
  SELECT * INTO v_row FROM public.quote_form_drafts WHERE company_id = p_company_id AND user_id = auth.uid() FOR UPDATE;
  IF FOUND AND v_row.last_request_id = p_request_id THEN
    IF v_row.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Pedido de rascunho inválido.' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('revision', v_row.revision, 'updated_at', v_row.updated_at, 'expires_at', v_row.expires_at);
  END IF;
  IF COALESCE(v_row.revision, 0) <> p_expected_revision THEN
    RAISE EXCEPTION 'O rascunho foi alterado em outra sessão.' USING ERRCODE = '40001';
  END IF;
  INSERT INTO public.quote_form_drafts(company_id,user_id,payload,revision,last_request_id,updated_at,expires_at)
    VALUES(p_company_id,auth.uid(),p_payload,nextval('public.quote_form_draft_revision_seq'::regclass),p_request_id,v_now,v_now+interval '30 days')
    ON CONFLICT(company_id,user_id) DO UPDATE SET payload=EXCLUDED.payload,revision=EXCLUDED.revision,
      last_request_id=EXCLUDED.last_request_id,updated_at=EXCLUDED.updated_at,expires_at=EXCLUDED.expires_at
    RETURNING * INTO v_row;
  RETURN jsonb_build_object('revision', v_row.revision, 'updated_at', v_row.updated_at, 'expires_at', v_row.expires_at);
END $fn$;
REVOKE ALL ON FUNCTION public.save_quote_form_draft(uuid,uuid,jsonb,bigint,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_quote_form_draft(uuid,uuid,jsonb,bigint,uuid) TO authenticated;

-- Expiração é efetiva na leitura mesmo sem cron. O job remove os dados físicos.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('expire-personal-quote-form-drafts', '20 3 * * *',
      $job$DELETE FROM public.quote_form_drafts WHERE expires_at <= now();$job$);
  END IF;
END $cron$;
COMMIT;

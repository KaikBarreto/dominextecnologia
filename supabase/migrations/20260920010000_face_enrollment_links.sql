-- =============================================================================
-- Biometria facial do ponto - Onda 2A
-- Link individual, curto e de uso unico para cadastro facial.
--
-- O navegador envia somente 3 embeddings de 128 dimensoes. Imagens e frames
-- nunca chegam ao banco. O token bruto aparece uma unica vez para o gestor;
-- no banco fica somente SHA-256(token), como capability revogavel.
-- =============================================================================

CREATE TABLE public.employee_face_enrollment_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT employee_face_enrollment_tokens_employee_company_fkey
    FOREIGN KEY (employee_id, company_id)
    REFERENCES public.employees(id, company_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT employee_face_enrollment_tokens_hash_check
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),

  CONSTRAINT employee_face_enrollment_tokens_expiry_check
    CHECK (expires_at > created_at)
);

CREATE INDEX employee_face_enrollment_tokens_employee_idx
  ON public.employee_face_enrollment_tokens (employee_id, created_at DESC);

CREATE INDEX employee_face_enrollment_tokens_active_idx
  ON public.employee_face_enrollment_tokens (token_hash, expires_at)
  WHERE used_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.employee_face_enrollment_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.employee_face_enrollment_tokens
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employee_face_enrollment_tokens
  TO service_role;

COMMENT ON TABLE public.employee_face_enrollment_tokens IS
  'Capabilities de uso unico para cadastro facial. Guarda somente SHA-256 do token; RLS sem policies e acesso direto exclusivo de service_role.';

-- ----------------------------------------------------------------------------
-- Gestor autenticado gera o link. Um novo link revoga os anteriores ainda
-- ativos do mesmo funcionario. TTL fixo de 24 horas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_employee_face_enrollment_link(
  p_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id      uuid;
  v_employee_active boolean;
  v_ponto_enabled   boolean;
  v_is_authorized   boolean := false;
  v_token           text;
  v_token_hash      text;
  v_expires_at      timestamptz := now() + interval '24 hours';
BEGIN
  SELECT e.company_id, e.is_active, e.ponto_enabled
    INTO v_company_id, v_employee_active, v_ponto_enabled
  FROM public.employees e
  WHERE e.id = p_employee_id
  FOR UPDATE;

  IF v_company_id IS NOT NULL THEN
    IF public.is_super_admin(auth.uid()) THEN
      v_is_authorized := true;
    ELSIF public.get_user_company_id(auth.uid()) IS NOT NULL
          AND public.get_user_company_id(auth.uid()) = v_company_id
          AND (
            public.user_has_permission(auth.uid(), 'fn:manage_employees')
            OR public.user_has_permission(auth.uid(), 'fn:manage_timeclock')
          ) THEN
      v_is_authorized := true;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Funcionario nao encontrado ou sem permissao para cadastrar biometria'
      USING ERRCODE = '42501';
  END IF;

  IF v_employee_active IS DISTINCT FROM true OR v_ponto_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Ative o ponto do funcionario antes de cadastrar a biometria'
      USING ERRCODE = '22023';
  END IF;

  IF public.company_has_module(v_company_id, 'rh') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O modulo de RH nao esta ativo para esta empresa'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.employee_face_enrollment_tokens
  SET revoked_at = now()
  WHERE employee_id = p_employee_id
    AND used_at IS NULL
    AND revoked_at IS NULL;

  -- 256 bits aleatorios. O valor bruto nunca e persistido.
  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.employee_face_enrollment_tokens (
    employee_id,
    company_id,
    token_hash,
    created_by,
    expires_at
  ) VALUES (
    p_employee_id,
    v_company_id,
    v_token_hash,
    auth.uid(),
    v_expires_at
  );

  -- Retencao minima: capabilities antigas nao precisam ficar para sempre.
  DELETE FROM public.employee_face_enrollment_tokens
  WHERE company_id = v_company_id
    AND expires_at < now() - interval '30 days';

  RETURN jsonb_build_object(
    'token', v_token,
    'expires_at', v_expires_at
  );
END;
$$;

COMMENT ON FUNCTION public.create_employee_face_enrollment_link(uuid) IS
  'Gera capability facial de uso unico por 24 horas para funcionario ativo do mesmo tenant. Revoga links anteriores e retorna o token bruto uma unica vez.';

REVOKE ALL ON FUNCTION public.create_employee_face_enrollment_link(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_employee_face_enrollment_link(uuid)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- Contexto publico minimo, acessivel apenas pela edge com service_role.
-- Token invalido, expirado, usado, revogado, funcionario inativo ou modulo
-- desligado retornam NULL de forma indistinguivel.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_face_enrollment_context(
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'employee_first_name', split_part(btrim(e.name), ' ', 1),
    'company_name', coalesce(nullif(btrim(cs.name), ''), nullif(btrim(c.name), ''), 'Empresa'),
    'language', CASE
      WHEN btrim(cs.language) IN ('pt-br', 'en', 'es', 'fr') THEN btrim(cs.language)
      ELSE 'pt-br'
    END,
    'white_label_enabled', coalesce(cs.white_label_enabled, false),
    'white_label_primary_color', cs.white_label_primary_color,
    'white_label_logo_url', cs.white_label_logo_url,
    'logo_url', cs.logo_url,
    'model_version', 'face-api@1.7.15/dlib-128d-v1',
    'embedding_dimension', 128,
    'required_captures', 3,
    'expires_at', t.expires_at
  )
  INTO v_result
  FROM public.employee_face_enrollment_tokens t
  JOIN public.employees e
    ON e.id = t.employee_id
   AND e.company_id = t.company_id
  JOIN public.companies c ON c.id = t.company_id
  LEFT JOIN public.company_settings cs ON cs.company_id = t.company_id
  WHERE t.token_hash = p_token_hash
    AND t.used_at IS NULL
    AND t.revoked_at IS NULL
    AND t.expires_at > now()
    AND e.is_active = true
    AND e.ponto_enabled = true
    AND public.company_has_module(t.company_id, 'rh') = true
  LIMIT 1;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_face_enrollment_context(text) IS
  'Retorna contexto publico minimo de uma capability facial ativa. Nunca retorna employee_id, company_id, template ou token.';

REVOKE ALL ON FUNCTION public.get_face_enrollment_context(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_face_enrollment_context(text)
  TO service_role;

-- ----------------------------------------------------------------------------
-- Consome a capability e grava exatamente 3 embeddings face-api/dlib 128d.
-- Validacao duplicada na edge e no banco: a edge melhora a resposta; o banco
-- e a fronteira final contra payload adulterado e corrida de replay.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_employee_face_enrollment(
  p_token_hash text,
  p_model_version text,
  p_templates jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token          public.employee_face_enrollment_tokens%ROWTYPE;
  v_template       jsonb;
  v_embedding      double precision[];
  v_quality_score  numeric;
  v_norm            double precision;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Link de cadastro facial invalido ou expirado'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_token
  FROM public.employee_face_enrollment_tokens
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF v_token.id IS NULL
     OR v_token.used_at IS NOT NULL
     OR v_token.revoked_at IS NOT NULL
     OR v_token.expires_at <= now() THEN
    RAISE EXCEPTION 'Link de cadastro facial invalido ou expirado'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = v_token.employee_id
      AND e.company_id = v_token.company_id
      AND e.is_active = true
      AND e.ponto_enabled = true
  ) OR public.company_has_module(v_token.company_id, 'rh') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Link de cadastro facial invalido ou expirado'
      USING ERRCODE = '22023';
  END IF;

  IF p_model_version IS DISTINCT FROM 'face-api@1.7.15/dlib-128d-v1' THEN
    RAISE EXCEPTION 'Versao do modelo facial nao suportada'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_templates) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_templates) <> 3 THEN
    RAISE EXCEPTION 'O cadastro facial exige exatamente 3 capturas'
      USING ERRCODE = '22023';
  END IF;

  FOR v_template IN SELECT value FROM jsonb_array_elements(p_templates)
  LOOP
    IF jsonb_typeof(v_template) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_template->'embedding') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_template->'embedding') <> 128 THEN
      RAISE EXCEPTION 'Embedding facial invalido'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_template->'embedding') AS item(value)
      WHERE jsonb_typeof(item.value) <> 'number'
    ) THEN
      RAISE EXCEPTION 'Embedding facial contem valor nao numerico'
        USING ERRCODE = '22023';
    END IF;

    SELECT array_agg((item.value #>> '{}')::double precision ORDER BY item.ordinality)
    INTO v_embedding
    FROM jsonb_array_elements(v_template->'embedding')
      WITH ORDINALITY AS item(value, ordinality);

    IF EXISTS (
      SELECT 1 FROM unnest(v_embedding) AS coordinate(value)
      WHERE abs(coordinate.value) > 4
    ) THEN
      RAISE EXCEPTION 'Embedding facial fora da faixa esperada'
        USING ERRCODE = '22023';
    END IF;

    SELECT sqrt(sum(coordinate.value * coordinate.value))
      INTO v_norm
    FROM unnest(v_embedding) AS coordinate(value);

    IF v_norm IS NULL OR v_norm NOT BETWEEN 0.5 AND 2 THEN
      RAISE EXCEPTION 'Embedding facial vazio ou sem variacao'
        USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(v_template->'quality_score') <> 'number' THEN
      RAISE EXCEPTION 'Qualidade da captura invalida'
        USING ERRCODE = '22023';
    END IF;

    v_quality_score := (v_template->>'quality_score')::numeric;
    IF v_quality_score NOT BETWEEN 0 AND 1 THEN
      RAISE EXCEPTION 'Qualidade da captura precisa estar entre 0 e 1'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  DELETE FROM public.employee_face_templates
  WHERE employee_id = v_token.employee_id;

  FOR v_template IN SELECT value FROM jsonb_array_elements(p_templates)
  LOOP
    SELECT array_agg((item.value #>> '{}')::double precision ORDER BY item.ordinality)
    INTO v_embedding
    FROM jsonb_array_elements(v_template->'embedding')
      WITH ORDINALITY AS item(value, ordinality);

    INSERT INTO public.employee_face_templates (
      employee_id,
      company_id,
      embedding,
      model_version,
      quality_score
    ) VALUES (
      v_token.employee_id,
      v_token.company_id,
      v_embedding,
      p_model_version,
      (v_template->>'quality_score')::numeric
    );
  END LOOP;

  UPDATE public.employee_face_enrollment_tokens
  SET used_at = now()
  WHERE id = v_token.id;

  -- A resposta publica precisa apenas saber que as 3 capturas foram gravadas.
  RETURN 3;
END;
$$;

COMMENT ON FUNCTION public.complete_employee_face_enrollment(text, text, jsonb) IS
  'Consome atomicamente uma capability de uso unico e substitui os 3 templates faciais do funcionario. Service-role only; nunca recebe nem guarda foto.';

REVOKE ALL ON FUNCTION public.complete_employee_face_enrollment(text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_employee_face_enrollment(text, text, jsonb)
  TO service_role;

-- Exclusao administrativa tambem revoga qualquer link que ainda esteja ativo.
CREATE OR REPLACE FUNCTION public.delete_employee_face_templates(
  p_employee_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id    uuid;
  v_is_authorized boolean := false;
  v_deleted       integer;
BEGIN
  SELECT e.company_id INTO v_company_id
  FROM public.employees e
  WHERE e.id = p_employee_id
  FOR UPDATE;

  IF v_company_id IS NOT NULL THEN
    IF public.is_super_admin(auth.uid()) THEN
      v_is_authorized := true;
    ELSIF public.get_user_company_id(auth.uid()) IS NOT NULL
          AND public.get_user_company_id(auth.uid()) = v_company_id
          AND (
            public.user_has_permission(auth.uid(), 'fn:manage_employees')
            OR public.user_has_permission(auth.uid(), 'fn:manage_timeclock')
          ) THEN
      v_is_authorized := true;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Funcionario nao encontrado ou sem permissao para excluir biometria'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.employee_face_enrollment_tokens
  SET revoked_at = coalesce(revoked_at, now())
  WHERE employee_id = p_employee_id
    AND used_at IS NULL;

  DELETE FROM public.employee_face_templates
  WHERE employee_id = p_employee_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_employee_face_templates(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_employee_face_templates(uuid)
  TO authenticated;

-- O soft delete ja apagava templates. Agora revoga tambem capabilities.
CREATE OR REPLACE FUNCTION public.delete_face_templates_on_employee_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_active IS DISTINCT FROM false AND NEW.is_active = false THEN
    UPDATE public.employee_face_enrollment_tokens
    SET revoked_at = coalesce(revoked_at, now())
    WHERE employee_id = NEW.id
      AND used_at IS NULL;

    DELETE FROM public.employee_face_templates
    WHERE employee_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_face_templates_on_employee_archive()
  FROM PUBLIC, anon, authenticated, service_role;

-- Falha a propria migration se um grant publico sensivel escapar. Assim o CI
-- do deploy prova o contrato de acesso no PostgreSQL que realmente o executa.
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.employee_face_enrollment_tokens', 'SELECT')
     OR has_table_privilege('anon', 'public.employee_face_enrollment_tokens', 'INSERT')
     OR has_table_privilege('anon', 'public.employee_face_enrollment_tokens', 'UPDATE')
     OR has_table_privilege('anon', 'public.employee_face_enrollment_tokens', 'DELETE')
     OR has_table_privilege('authenticated', 'public.employee_face_enrollment_tokens', 'SELECT')
     OR has_table_privilege('authenticated', 'public.employee_face_enrollment_tokens', 'INSERT')
     OR has_table_privilege('authenticated', 'public.employee_face_enrollment_tokens', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.employee_face_enrollment_tokens', 'DELETE') THEN
    RAISE EXCEPTION 'employee_face_enrollment_tokens exposta para role de navegador';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.employee_face_enrollment_tokens'::regclass
      AND relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS desativada em employee_face_enrollment_tokens';
  END IF;

  IF has_function_privilege('anon', 'public.create_employee_face_enrollment_link(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.create_employee_face_enrollment_link(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grant invalido em create_employee_face_enrollment_link';
  END IF;

  IF has_function_privilege('anon', 'public.get_face_enrollment_context(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_face_enrollment_context(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_face_enrollment_context(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grant invalido em get_face_enrollment_context';
  END IF;

  IF has_function_privilege('anon', 'public.complete_employee_face_enrollment(text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.complete_employee_face_enrollment(text,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.complete_employee_face_enrollment(text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grant invalido em complete_employee_face_enrollment';
  END IF;
END;
$$;

-- =============================================================================
-- Biometria facial do Ponto - Onda 3
-- Reconhecimento 1:N no quiosque, prova curta de uso unico e alinhamento da
-- autorizacao administrativa com o CRUD de funcionarios (admin/gestor).
-- =============================================================================

ALTER TABLE public.time_settings
  ADD COLUMN kiosk_require_face boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.time_settings.kiosk_require_face IS
  'Quando true, o quiosque exige identificacao facial em operacao normal. Falha tecnica continua liberando contingencia manual para nao bloquear a jornada.';

CREATE OR REPLACE FUNCTION public.can_manage_employee_face_biometrics(
  p_company_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_super_admin(auth.uid())
    OR (
      public.get_user_company_id(auth.uid()) = p_company_id
      AND (
        public.is_admin_or_gestor(auth.uid())
        OR public.user_has_permission(auth.uid(), 'fn:manage_employees')
        OR public.user_has_permission(auth.uid(), 'fn:manage_timeclock')
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_employee_face_biometrics(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.can_manage_employee_face_biometrics(uuid) IS
  'Autorizacao interna do CRUD facial: super admin ou usuario do tenant que seja admin/gestor ou tenha permissao explicita de funcionarios/ponto.';

-- O CRUD de Funcionarios permite admin/gestor diretamente. As RPCs faciais
-- antigas verificavam apenas permissoes granulares e podiam negar um gestor
-- que enxergava legitimamente a tela.
CREATE OR REPLACE FUNCTION public.get_employee_face_template_status(
  p_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id    uuid;
  v_count         integer;
  v_model_version text;
  v_created_at    timestamptz;
BEGIN
  SELECT e.company_id INTO v_company_id
  FROM public.employees e
  WHERE e.id = p_employee_id;

  IF v_company_id IS NULL
     OR public.can_manage_employee_face_biometrics(v_company_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Funcionario nao encontrado ou sem permissao para consultar biometria'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer,
         CASE WHEN min(t.model_version) = max(t.model_version)
              THEN min(t.model_version) ELSE NULL END,
         max(t.created_at)
    INTO v_count, v_model_version, v_created_at
  FROM public.employee_face_templates t
  WHERE t.employee_id = p_employee_id;

  RETURN jsonb_build_object(
    'enrolled', v_count BETWEEN 3 AND 5,
    'template_count', v_count,
    'model_version', v_model_version,
    'created_at', v_created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_employee_face_template_status(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_employee_face_template_status(uuid)
  TO authenticated;

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
  v_token           text;
  v_token_hash      text;
  v_expires_at      timestamptz := now() + interval '24 hours';
BEGIN
  SELECT e.company_id, e.is_active, e.ponto_enabled
    INTO v_company_id, v_employee_active, v_ponto_enabled
  FROM public.employees e
  WHERE e.id = p_employee_id
  FOR UPDATE;

  IF v_company_id IS NULL
     OR public.can_manage_employee_face_biometrics(v_company_id) IS DISTINCT FROM true THEN
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

  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.employee_face_enrollment_tokens (
    employee_id, company_id, token_hash, created_by, expires_at
  ) VALUES (
    p_employee_id, v_company_id, v_token_hash, auth.uid(), v_expires_at
  );

  DELETE FROM public.employee_face_enrollment_tokens
  WHERE company_id = v_company_id
    AND expires_at < now() - interval '30 days';

  RETURN jsonb_build_object('token', v_token, 'expires_at', v_expires_at);
END;
$$;

REVOKE ALL ON FUNCTION public.create_employee_face_enrollment_link(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_employee_face_enrollment_link(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_employee_face_templates(
  p_employee_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_deleted    integer;
BEGIN
  SELECT e.company_id INTO v_company_id
  FROM public.employees e
  WHERE e.id = p_employee_id
  FOR UPDATE;

  IF v_company_id IS NULL
     OR public.can_manage_employee_face_biometrics(v_company_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Funcionario nao encontrado ou sem permissao para excluir biometria'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.employee_face_enrollment_tokens
  SET revoked_at = now()
  WHERE employee_id = p_employee_id
    AND used_at IS NULL
    AND revoked_at IS NULL;

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

-- Uma tentativa guarda apenas metricas e uma prova opaca curta. O embedding
-- efemero nunca e persistido e o token bruto nunca entra no banco.
CREATE TABLE public.employee_face_match_attempts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id      uuid,
  model_version    text NOT NULL,
  quality_score    numeric NOT NULL,
  status           text NOT NULL,
  candidate_count  smallint NOT NULL DEFAULT 0,
  best_distance    double precision,
  second_distance  double precision,
  expected_type    text,
  proof_hash       text UNIQUE,
  expires_at       timestamptz,
  consumed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT employee_face_match_attempts_employee_company_fkey
    FOREIGN KEY (employee_id, company_id)
    REFERENCES public.employees(id, company_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT employee_face_match_attempts_status_check
    CHECK (status IN ('matched', 'ambiguous', 'not_recognized', 'unavailable')),
  CONSTRAINT employee_face_match_attempts_quality_check
    CHECK (quality_score BETWEEN 0 AND 1),
  CONSTRAINT employee_face_match_attempts_candidate_count_check
    CHECK (candidate_count BETWEEN 0 AND 3),
  CONSTRAINT employee_face_match_attempts_type_check
    CHECK (expected_type IS NULL OR expected_type IN ('clock_in', 'break_start', 'break_end', 'clock_out')),
  CONSTRAINT employee_face_match_attempts_hash_check
    CHECK (proof_hash IS NULL OR proof_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT employee_face_match_attempts_proof_check
    CHECK (
      (status = 'matched' AND employee_id IS NOT NULL AND proof_hash IS NOT NULL
        AND expires_at IS NOT NULL AND expected_type IS NOT NULL)
      OR
      (status <> 'matched' AND proof_hash IS NULL AND expires_at IS NULL)
    )
);

CREATE INDEX employee_face_match_attempts_company_created_idx
  ON public.employee_face_match_attempts (company_id, created_at DESC);
CREATE INDEX employee_face_match_attempts_active_proof_idx
  ON public.employee_face_match_attempts (proof_hash, expires_at)
  WHERE status = 'matched' AND consumed_at IS NULL;

ALTER TABLE public.employee_face_match_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.employee_face_match_attempts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employee_face_match_attempts
  TO service_role;

COMMENT ON TABLE public.employee_face_match_attempts IS
  'Tentativas 1:N do quiosque. Guarda somente metricas agregadas e hash da prova curta; nunca embedding, imagem ou frame.';

CREATE OR REPLACE FUNCTION public.match_employee_face_for_kiosk(
  p_company_id uuid,
  p_model_version text,
  p_embedding jsonb,
  p_quality_score numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_embedding       double precision[];
  v_norm            double precision;
  v_candidate_ids   uuid[];
  v_distances       double precision[];
  v_best            double precision;
  v_second          double precision;
  v_status          text;
  v_employee_id     uuid;
  v_candidate_count integer := 0;
  v_timezone        text;
  v_today           date;
  v_types           text[];
  v_expected_type   text;
  v_proof           text;
  v_proof_hash      text;
  v_expires_at      timestamptz;
  v_recent_count    integer;
BEGIN
  IF public.company_has_module(p_company_id, 'rh') IS DISTINCT FROM true
     OR p_model_version IS DISTINCT FROM 'face-api@1.7.15/dlib-128d-v1'
     OR jsonb_typeof(p_embedding) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_embedding) <> 128
     OR p_quality_score IS NULL
     OR p_quality_score NOT BETWEEN 0 AND 1 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_embedding) item
    WHERE jsonb_typeof(item.value) <> 'number'
  ) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  BEGIN
    SELECT array_agg((item.value #>> '{}')::double precision ORDER BY item.ordinality)
      INTO v_embedding
    FROM jsonb_array_elements(p_embedding) WITH ORDINALITY item(value, ordinality);
  EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END;

  SELECT sqrt(sum(coordinate.value * coordinate.value))
    INTO v_norm
  FROM unnest(v_embedding) AS coordinate(value);
  IF v_norm IS NULL OR v_norm NOT BETWEEN 0.5 AND 2
     OR EXISTS (
       SELECT 1
       FROM unnest(v_embedding) AS coordinate(value)
       WHERE abs(coordinate.value) > 4
     ) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  -- Serializa apenas o contador deste tenant para o limite persistente.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));
  SELECT count(*) INTO v_recent_count
  FROM public.employee_face_match_attempts
  WHERE company_id = p_company_id
    AND created_at > now() - interval '1 minute';
  IF v_recent_count >= 120 THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;

  SELECT array_agg(r.employee_id ORDER BY r.min_distance),
         array_agg(r.min_distance ORDER BY r.min_distance)
    INTO v_candidate_ids, v_distances
  FROM (
    SELECT t.employee_id,
           min((
             SELECT sqrt(sum(power(probe.value - enrolled.value, 2)))
             FROM unnest(v_embedding) WITH ORDINALITY probe(value, ordinality)
             JOIN unnest(t.embedding) WITH ORDINALITY enrolled(value, ordinality)
               USING (ordinality)
           )) AS min_distance
    FROM public.employee_face_templates t
    JOIN public.employees e
      ON e.id = t.employee_id
     AND e.company_id = t.company_id
     AND e.is_active = true
     AND e.ponto_enabled = true
    WHERE t.company_id = p_company_id
      AND t.model_version = p_model_version
      AND cardinality(t.embedding) = 128
    GROUP BY t.employee_id
    ORDER BY min_distance
    LIMIT 3
  ) r;

  v_candidate_count := coalesce(cardinality(v_candidate_ids), 0);
  v_best := v_distances[1];
  v_second := v_distances[2];

  IF v_best IS NULL THEN
    v_status := 'unavailable';
  ELSIF v_best <= 0.48 AND (v_second IS NULL OR v_second - v_best >= 0.08) THEN
    v_status := 'matched';
    v_employee_id := v_candidate_ids[1];
  ELSIF v_best <= 0.62 THEN
    v_status := 'ambiguous';
  ELSE
    v_status := 'not_recognized';
  END IF;

  IF v_status = 'matched' THEN
    SELECT nullif(btrim(cs.timezone), '')
      INTO v_timezone
    FROM public.company_settings cs
    WHERE cs.company_id = p_company_id;

    IF v_timezone IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_timezone_names tz WHERE tz.name = v_timezone
    ) THEN
      -- Sem fuso valido nao arriscamos vincular a prova ao dia errado. A edge
      -- trata unavailable como contingencia e a batida continua pelo fluxo
      -- normal.
      v_status := 'unavailable';
      v_employee_id := NULL;
    ELSE
      v_today := (now() AT TIME ZONE v_timezone)::date;

      SELECT coalesce(array_agg(tr.type ORDER BY tr.recorded_at), ARRAY[]::text[])
        INTO v_types
      FROM public.time_records tr
      WHERE tr.company_id = p_company_id
        AND tr.employee_id = v_employee_id
        AND tr.date = v_today;

      v_expected_type := CASE
        WHEN NOT ('clock_in' = ANY(v_types)) THEN 'clock_in'
        WHEN NOT ('break_start' = ANY(v_types)) THEN 'break_start'
        WHEN NOT ('break_end' = ANY(v_types)) THEN 'break_end'
        WHEN NOT ('clock_out' = ANY(v_types)) THEN 'clock_out'
        ELSE NULL
      END;

      IF v_expected_type IS NULL THEN
        v_status := 'not_recognized';
        v_employee_id := NULL;
      ELSE
        v_proof := encode(gen_random_bytes(32), 'hex');
        v_proof_hash := encode(digest(v_proof, 'sha256'), 'hex');
        v_expires_at := now() + interval '5 minutes';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.employee_face_match_attempts (
    company_id, employee_id, model_version, quality_score, status,
    candidate_count, best_distance, second_distance, expected_type,
    proof_hash, expires_at
  ) VALUES (
    p_company_id, v_employee_id, p_model_version, p_quality_score, v_status,
    least(v_candidate_count, 3), v_best, v_second, v_expected_type,
    v_proof_hash, v_expires_at
  );

  DELETE FROM public.employee_face_match_attempts
  WHERE company_id = p_company_id
    AND created_at < now() - interval '30 days';

  IF v_status = 'matched' THEN
    RETURN jsonb_build_object(
      'status', 'matched',
      'employee_id', v_employee_id,
      'proof', v_proof
    );
  ELSIF v_status = 'ambiguous' THEN
    RETURN jsonb_build_object(
      'status', 'ambiguous',
      'candidate_ids', to_jsonb(v_candidate_ids)
    );
  END IF;
  RETURN jsonb_build_object('status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.match_employee_face_for_kiosk(uuid, text, jsonb, numeric)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_employee_face_for_kiosk(uuid, text, jsonb, numeric)
  TO service_role;

CREATE OR REPLACE FUNCTION public.consume_employee_face_match_proof(
  p_proof_hash text,
  p_company_id uuid,
  p_employee_id uuid,
  p_expected_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.employee_face_match_attempts%ROWTYPE;
BEGIN
  IF p_proof_hash IS NULL OR p_proof_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  SELECT * INTO v_attempt
  FROM public.employee_face_match_attempts
  WHERE proof_hash = p_proof_hash
  FOR UPDATE;

  IF v_attempt.id IS NULL
     OR v_attempt.status <> 'matched'
     OR v_attempt.company_id <> p_company_id
     OR v_attempt.employee_id <> p_employee_id
     OR v_attempt.expected_type <> p_expected_type
     OR v_attempt.expires_at <= now()
     OR v_attempt.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false);
  END IF;

  UPDATE public.employee_face_match_attempts
  SET consumed_at = now()
  WHERE id = v_attempt.id;

  RETURN jsonb_build_object(
    'valid', true,
    'distance', v_attempt.best_distance,
    'model_version', v_attempt.model_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_employee_face_match_proof(text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_employee_face_match_proof(text, uuid, uuid, text)
  TO service_role;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.employee_face_match_attempts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.employee_face_match_attempts', 'SELECT')
     OR has_function_privilege('anon', 'public.match_employee_face_for_kiosk(uuid,text,jsonb,numeric)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.match_employee_face_for_kiosk(uuid,text,jsonb,numeric)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.consume_employee_face_match_proof(text,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.consume_employee_face_match_proof(text,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Superficie biometrica do quiosque exposta para role de navegador';
  END IF;
END;
$$;

-- =============================================================================
-- Biometria facial do Ponto - Onda 2B
-- Calibracao 1:1 sem efeito sobre a batida.
--
-- A pessoa ja foi identificada pelo link pessoal ou pelo par quiosque+
-- funcionario e, quando aplicavel, passou pelo PIN. A edge envia um embedding
-- efemero para esta RPC service-only. O banco compara somente com os templates
-- daquele funcionario e persiste apenas metricas agregadas. O embedding da
-- tentativa, frames e fotos nunca sao armazenados.
--
-- IMPORTANTE: esta etapa NAO autentica, NAO cria prova facial e NAO altera
-- time_records. Ela existe para medir distribuicoes reais antes de escolher
-- threshold/margem para o reconhecimento automatico.
-- =============================================================================

CREATE TABLE public.employee_face_calibration_attempts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid NOT NULL,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  model_version  text NOT NULL,
  quality_score  numeric NOT NULL,
  template_count smallint NOT NULL DEFAULT 0,
  min_distance   double precision,
  avg_distance   double precision,
  status         text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT employee_face_calibration_attempts_employee_company_fkey
    FOREIGN KEY (employee_id, company_id)
    REFERENCES public.employees(id, company_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT employee_face_calibration_quality_check
    CHECK (quality_score BETWEEN 0 AND 1),

  CONSTRAINT employee_face_calibration_template_count_check
    CHECK (template_count BETWEEN 0 AND 5),

  CONSTRAINT employee_face_calibration_status_check
    CHECK (status IN ('measured', 'unavailable')),

  CONSTRAINT employee_face_calibration_distance_check
    CHECK (
      (status = 'measured'
        AND template_count > 0
        AND min_distance IS NOT NULL
        AND avg_distance IS NOT NULL
        AND min_distance >= 0
        AND avg_distance >= min_distance)
      OR
      (status = 'unavailable'
        AND template_count = 0
        AND min_distance IS NULL
        AND avg_distance IS NULL)
    )
);

CREATE INDEX employee_face_calibration_employee_created_idx
  ON public.employee_face_calibration_attempts (employee_id, created_at DESC);

CREATE INDEX employee_face_calibration_company_model_created_idx
  ON public.employee_face_calibration_attempts (company_id, model_version, created_at DESC);

ALTER TABLE public.employee_face_calibration_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.employee_face_calibration_attempts
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.employee_face_calibration_attempts
  TO service_role;

COMMENT ON TABLE public.employee_face_calibration_attempts IS
  'Metricas agregadas da calibracao facial 1:1. Nao guarda embedding, imagem ou frame e nao interfere na batida.';

CREATE OR REPLACE FUNCTION public.record_employee_face_calibration(
  p_company_id uuid,
  p_employee_id uuid,
  p_model_version text,
  p_embedding jsonb,
  p_quality_score numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_embedding      double precision[];
  v_template       record;
  v_distance       double precision;
  v_min_distance   double precision;
  v_distance_sum   double precision := 0;
  v_norm           double precision;
  v_template_count integer := 0;
  v_recent_count   integer := 0;
BEGIN
  -- A empresa e o funcionario chegam da edge, mas a FK composta e esta guarda
  -- exigem que os dois pertencam ao mesmo tenant e continuem ativos.
  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_employee_id
      AND e.company_id = p_company_id
      AND e.is_active = true
      AND e.ponto_enabled = true
    FOR UPDATE
  ) OR public.company_has_module(p_company_id, 'rh') IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  IF p_model_version IS DISTINCT FROM 'face-api@1.7.15/dlib-128d-v1'
     OR jsonb_typeof(p_embedding) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_embedding) <> 128
     OR p_quality_score IS NULL
     OR p_quality_score NOT BETWEEN 0 AND 1 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_embedding) AS coordinate(value)
    WHERE jsonb_typeof(coordinate.value) <> 'number'
  ) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  BEGIN
    SELECT array_agg((coordinate.value #>> '{}')::double precision ORDER BY coordinate.ordinality)
      INTO v_embedding
    FROM jsonb_array_elements(p_embedding)
      WITH ORDINALITY AS coordinate(value, ordinality);
  EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END;

  SELECT sqrt(sum(coordinate.value * coordinate.value))
    INTO v_norm
  FROM unnest(v_embedding) AS coordinate(value);

  IF v_norm IS NULL OR v_norm NOT BETWEEN 0.5 AND 2 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_embedding) AS coordinate(value)
    WHERE abs(coordinate.value) > 4
  ) OR NOT EXISTS (
    SELECT 1
    FROM unnest(v_embedding) AS coordinate(value)
    WHERE coordinate.value <> 0
  ) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  -- Limite persistente por funcionario. Registra tambem indisponibilidade para
  -- que quem nao tem template nao possa usar a RPC como loop barato.
  SELECT count(*) INTO v_recent_count
  FROM public.employee_face_calibration_attempts a
  WHERE a.employee_id = p_employee_id
    AND a.created_at > now() - interval '1 minute';

  IF v_recent_count >= 10 THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;

  FOR v_template IN
    SELECT t.embedding
    FROM public.employee_face_templates t
    WHERE t.employee_id = p_employee_id
      AND t.company_id = p_company_id
      AND t.model_version = p_model_version
      AND cardinality(t.embedding) = 128
  LOOP
    SELECT sqrt(sum(power(probe.value - enrolled.value, 2)))
      INTO v_distance
    FROM unnest(v_embedding) WITH ORDINALITY AS probe(value, ordinality)
    JOIN unnest(v_template.embedding) WITH ORDINALITY AS enrolled(value, ordinality)
      USING (ordinality);

    IF v_distance IS NOT NULL THEN
      v_template_count := v_template_count + 1;
      v_distance_sum := v_distance_sum + v_distance;
      v_min_distance := CASE
        WHEN v_min_distance IS NULL THEN v_distance
        ELSE least(v_min_distance, v_distance)
      END;
    END IF;
  END LOOP;

  IF v_template_count = 0 THEN
    INSERT INTO public.employee_face_calibration_attempts (
      employee_id, company_id, model_version, quality_score,
      template_count, status
    ) VALUES (
      p_employee_id, p_company_id, p_model_version, p_quality_score,
      0, 'unavailable'
    );
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  INSERT INTO public.employee_face_calibration_attempts (
    employee_id, company_id, model_version, quality_score,
    template_count, min_distance, avg_distance, status
  ) VALUES (
    p_employee_id, p_company_id, p_model_version, p_quality_score,
    v_template_count, v_min_distance,
    greatest(v_min_distance, v_distance_sum / v_template_count), 'measured'
  );

  -- Retencao enxuta. A calibracao precisa de distribuicao recente, nao de um
  -- historico biometrico permanente.
  DELETE FROM public.employee_face_calibration_attempts
  WHERE company_id = p_company_id
    AND created_at < now() - interval '90 days';

  -- Distancias nunca saem pela interface publica.
  RETURN jsonb_build_object('status', 'captured');
END;
$$;

COMMENT ON FUNCTION public.record_employee_face_calibration(uuid, uuid, text, jsonb, numeric) IS
  'Compara 1:1 dentro do tenant e persiste somente metricas agregadas para calibracao. Nao autentica e nunca devolve distancias ou templates.';

REVOKE ALL ON FUNCTION public.record_employee_face_calibration(uuid, uuid, text, jsonb, numeric)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_employee_face_calibration(uuid, uuid, text, jsonb, numeric)
  TO service_role;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.employee_face_calibration_attempts', 'SELECT')
     OR has_table_privilege('anon', 'public.employee_face_calibration_attempts', 'INSERT')
     OR has_table_privilege('anon', 'public.employee_face_calibration_attempts', 'UPDATE')
     OR has_table_privilege('anon', 'public.employee_face_calibration_attempts', 'DELETE')
     OR has_table_privilege('authenticated', 'public.employee_face_calibration_attempts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.employee_face_calibration_attempts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.employee_face_calibration_attempts', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.employee_face_calibration_attempts', 'DELETE') THEN
    RAISE EXCEPTION 'employee_face_calibration_attempts exposta para role de navegador';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.employee_face_calibration_attempts'::regclass
      AND relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS desativada em employee_face_calibration_attempts';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.record_employee_face_calibration(uuid,uuid,text,jsonb,numeric)',
       'EXECUTE'
     ) OR has_function_privilege(
       'authenticated',
       'public.record_employee_face_calibration(uuid,uuid,text,jsonb,numeric)',
       'EXECUTE'
     ) OR NOT has_function_privilege(
       'service_role',
       'public.record_employee_face_calibration(uuid,uuid,text,jsonb,numeric)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'grant invalido em record_employee_face_calibration';
  END IF;
END;
$$;

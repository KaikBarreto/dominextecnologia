-- ============================================================================
-- API Publica v1: criacao e gestao segura de cards do CRM
-- ============================================================================
-- `leads` e a fonte canonica dos cards. A API so enxerga funis comerciais
-- (`crm_pipelines.project_id IS NULL`); frentes de projetos continuam fora da
-- superficie publica. O tenant sempre nasce da integracao autenticada.

ALTER TABLE public.public_api_integrations
  DROP CONSTRAINT IF EXISTS public_api_integrations_scopes_check;

ALTER TABLE public.public_api_integrations
  ADD CONSTRAINT public_api_integrations_scopes_check CHECK (
    scopes <@ ARRAY[
      'catalogs:read',
      'availability:read',
      'customers:resolve',
      'service_orders:create',
      'service_orders:read',
      'crm_cards:read',
      'crm_cards:write'
    ]::text[]
    AND cardinality(scopes) > 0
  );

ALTER TABLE public.public_api_external_refs
  DROP CONSTRAINT IF EXISTS public_api_external_refs_type_check;

ALTER TABLE public.public_api_external_refs
  ADD CONSTRAINT public_api_external_refs_type_check
  CHECK (resource_type IN ('customer', 'service_order', 'crm_card'));

CREATE OR REPLACE FUNCTION public.public_api_crm_card_response(
  p_integration_id uuid,
  p_company_id uuid,
  p_card_id uuid,
  p_replay boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', l.id,
    'external_id', CASE
      WHEN er.external_id LIKE '__internal__:%' THEN NULL
      ELSE er.external_id
    END,
    'title', l.title,
    'pipeline_id', p.id,
    'stage_id', s.id,
    'customer_id', l.customer_id,
    'value', l.value,
    'probability', l.probability,
    'source', l.source,
    'expected_close_date', l.expected_close_date,
    'notes', l.notes,
    'created_at', l.created_at,
    'updated_at', l.updated_at,
    'idempotent_replay', p_replay
  )
  INTO v_result
  FROM public.leads l
  JOIN public.crm_pipelines p
    ON p.id = l.pipeline_id
   AND p.company_id = l.company_id
   AND p.project_id IS NULL
  LEFT JOIN public.crm_stages s
    ON s.id = l.stage_id
   AND s.pipeline_id = p.id
   AND s.company_id = l.company_id
  LEFT JOIN public.public_api_external_refs er
    ON er.integration_id = p_integration_id
   AND er.company_id = l.company_id
   AND er.resource_type = 'crm_card'
   AND er.resource_id = l.id
  WHERE l.id = p_card_id
    AND l.company_id = p_company_id;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_crm_card_response(uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_leads_company_updated_id
  ON public.leads (company_id, updated_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.public_api_get_crm_pipelines(
  p_integration_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_company_id uuid;
  v_data jsonb;
BEGIN
  v_company_id := public.public_api_assert_integration(
    p_integration_id,
    'crm_cards:read'
  );

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'color', p.color,
      'position', p.position,
      'is_default', p.is_default,
      'tracks_value', p.tracks_value,
      'stages', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'color', s.color,
          'position', s.position,
          'is_won', s.is_won,
          'is_lost', s.is_lost
        ) ORDER BY s.position, s.id)
        FROM public.crm_stages s
        WHERE s.pipeline_id = p.id
          AND s.company_id = v_company_id
      ), '[]'::jsonb)
    ) ORDER BY p.position, p.id
  ), '[]'::jsonb)
  INTO v_data
  FROM public.crm_pipelines p
  WHERE p.company_id = v_company_id
    AND p.project_id IS NULL;

  RETURN jsonb_build_object('data', v_data);
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_get_crm_pipelines(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_get_crm_pipelines(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_list_crm_cards(
  p_integration_id uuid,
  p_limit integer DEFAULT 50,
  p_cursor text DEFAULT NULL,
  p_pipeline_id uuid DEFAULT NULL,
  p_stage_id uuid DEFAULT NULL,
  p_updated_since timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_company_id uuid;
  v_limit integer;
  v_cursor_parts text[];
  v_cursor_updated_at timestamptz;
  v_cursor_id uuid;
  v_data jsonb;
  v_has_more boolean;
  v_next_cursor text;
BEGIN
  v_company_id := public.public_api_assert_integration(
    p_integration_id,
    'crm_cards:read'
  );
  v_limit := COALESCE(p_limit, 50);
  IF v_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_pagination' USING ERRCODE = '22023';
  END IF;

  IF p_pipeline_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.crm_pipelines p
    WHERE p.id = p_pipeline_id
      AND p.company_id = v_company_id
      AND p.project_id IS NULL
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'status', 404,
        'code', 'not_found',
        'title', 'Funil nao encontrado',
        'detail', 'O funil informado nao existe.'
      )
    );
  END IF;

  IF p_stage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.crm_stages s
    JOIN public.crm_pipelines p ON p.id = s.pipeline_id
    WHERE s.id = p_stage_id
      AND s.company_id = v_company_id
      AND p.company_id = v_company_id
      AND p.project_id IS NULL
      AND (p_pipeline_id IS NULL OR p.id = p_pipeline_id)
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'status', 404,
        'code', 'not_found',
        'title', 'Etapa nao encontrada',
        'detail', 'A etapa informada nao existe neste funil.'
      )
    );
  END IF;

  IF NULLIF(p_cursor, '') IS NOT NULL THEN
    v_cursor_parts := string_to_array(p_cursor, '|');
    IF cardinality(v_cursor_parts) <> 2 THEN
      RAISE EXCEPTION 'invalid_cursor' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_cursor_updated_at := v_cursor_parts[1]::timestamptz;
      v_cursor_id := v_cursor_parts[2]::uuid;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
      RAISE EXCEPTION 'invalid_cursor' USING ERRCODE = '22023';
    END;
  END IF;

  WITH filtered AS (
    SELECT l.id, l.updated_at
    FROM public.leads l
    JOIN public.crm_pipelines p
      ON p.id = l.pipeline_id
     AND p.company_id = l.company_id
     AND p.project_id IS NULL
    WHERE l.company_id = v_company_id
      AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id)
      AND (p_stage_id IS NULL OR l.stage_id = p_stage_id)
      AND (p_updated_since IS NULL OR l.updated_at >= p_updated_since)
      AND (
        v_cursor_updated_at IS NULL
        OR (l.updated_at, l.id) < (v_cursor_updated_at, v_cursor_id)
      )
    ORDER BY l.updated_at DESC, l.id DESC
    LIMIT v_limit + 1
  ), visible AS (
    SELECT * FROM filtered
    ORDER BY updated_at DESC, id DESC
    LIMIT v_limit
  )
  SELECT
    COALESCE(jsonb_agg(
      public.public_api_crm_card_response(
        p_integration_id,
        v_company_id,
        v.id,
        false
      )
      ORDER BY v.updated_at DESC, v.id DESC
    ), '[]'::jsonb),
    EXISTS (SELECT 1 FROM filtered OFFSET v_limit),
    CASE WHEN EXISTS (SELECT 1 FROM filtered OFFSET v_limit) THEN (
      SELECT last_v.updated_at::text || '|' || last_v.id::text
      FROM visible last_v
      ORDER BY last_v.updated_at ASC, last_v.id ASC
      LIMIT 1
    ) END
  INTO v_data, v_has_more, v_next_cursor
  FROM visible v;

  RETURN jsonb_build_object(
    'data', v_data,
    'next_cursor', CASE WHEN v_has_more THEN v_next_cursor ELSE NULL END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_list_crm_cards(
  uuid, integer, text, uuid, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_list_crm_cards(
  uuid, integer, text, uuid, uuid, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_get_crm_card(
  p_integration_id uuid,
  p_card_id uuid DEFAULT NULL,
  p_external_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_company_id uuid;
  v_card_id uuid;
  v_result jsonb;
BEGIN
  v_company_id := public.public_api_assert_integration(
    p_integration_id,
    'crm_cards:read'
  );
  IF (p_card_id IS NULL) = (NULLIF(btrim(p_external_id), '') IS NULL) THEN
    RAISE EXCEPTION 'invalid_identifier' USING ERRCODE = '22023';
  END IF;

  IF p_card_id IS NOT NULL THEN
    SELECT l.id
    INTO v_card_id
    FROM public.leads l
    JOIN public.crm_pipelines p
      ON p.id = l.pipeline_id
     AND p.company_id = l.company_id
     AND p.project_id IS NULL
    WHERE l.id = p_card_id
      AND l.company_id = v_company_id;
  ELSE
    SELECT er.resource_id
    INTO v_card_id
    FROM public.public_api_external_refs er
    JOIN public.leads l
      ON l.id = er.resource_id
     AND l.company_id = v_company_id
    JOIN public.crm_pipelines p
      ON p.id = l.pipeline_id
     AND p.company_id = l.company_id
     AND p.project_id IS NULL
    WHERE er.integration_id = p_integration_id
      AND er.company_id = v_company_id
      AND er.resource_type = 'crm_card'
      AND er.external_id = btrim(p_external_id);
  END IF;

  IF v_card_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'status', 404,
        'code', 'not_found',
        'title', 'Card nao encontrado',
        'detail', 'O card informado nao existe.'
      )
    );
  END IF;

  v_result := public.public_api_crm_card_response(
    p_integration_id,
    v_company_id,
    v_card_id,
    false
  );
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_get_crm_card(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_get_crm_card(uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_create_crm_card(
  p_integration_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_company_id uuid;
  v_idem public.public_api_idempotency%ROWTYPE;
  v_card public.leads%ROWTYPE;
  v_stage_id uuid;
  v_customer_id uuid;
  v_expected_close_date date;
  v_external_id text;
  v_response jsonb;
BEGIN
  v_company_id := public.public_api_assert_integration(
    p_integration_id,
    'crm_cards:write'
  );
  IF p_idempotency_key IS NULL
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200
     OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_idempotency' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_payload) <> 'object'
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(p_payload) k
       WHERE k NOT IN (
         'external_id', 'title', 'stage_id', 'customer_id', 'value',
         'probability', 'source', 'expected_close_date', 'notes'
       )
     ) THEN
    RAISE EXCEPTION 'invalid_crm_card_payload' USING ERRCODE = '22023';
  END IF;

  -- O replay precisa ser resolvido antes de consultar etapa/cliente, pois
  -- esses recursos podem mudar depois do commit original.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'public-api-idempotency:' || p_integration_id::text || ':' || p_idempotency_key,
    0
  ));
  SELECT *
  INTO v_idem
  FROM public.public_api_idempotency
  WHERE integration_id = p_integration_id
    AND endpoint = 'create_crm_card'
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND AND v_idem.expires_at <= now() THEN
    DELETE FROM public.public_api_idempotency WHERE id = v_idem.id;
    v_idem := NULL;
  END IF;
  IF v_idem.id IS NOT NULL THEN
    IF v_idem.request_hash <> p_request_hash THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0001';
    END IF;
    IF v_idem.state = 'completed' THEN
      RETURN v_idem.response_body || jsonb_build_object('idempotent_replay', true);
    END IF;
    RAISE EXCEPTION 'request_in_progress' USING ERRCODE = 'P0001';
  END IF;

  IF length(btrim(COALESCE(p_payload->>'title', ''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE = '22023';
  END IF;
  v_stage_id := NULLIF(p_payload->>'stage_id', '')::uuid;
  IF v_stage_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.crm_stages s
    JOIN public.crm_pipelines p ON p.id = s.pipeline_id
    WHERE s.id = v_stage_id
      AND s.company_id = v_company_id
      AND p.company_id = v_company_id
      AND p.project_id IS NULL
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'status', 404,
        'code', 'not_found',
        'title', 'Etapa nao encontrada',
        'detail', 'A etapa informada nao existe em um funil comercial.'
      )
    );
  END IF;

  v_customer_id := NULLIF(p_payload->>'customer_id', '')::uuid;
  IF v_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = v_customer_id
      AND c.company_id = v_company_id
      AND NOT c.is_deleted
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'status', 404,
        'code', 'not_found',
        'title', 'Cliente nao encontrado',
        'detail', 'O cliente informado nao existe.'
      )
    );
  END IF;
  IF NULLIF(p_payload->>'value', '')::numeric < 0
     OR NULLIF(p_payload->>'value', '')::numeric > 99999999.99 THEN
    RAISE EXCEPTION 'invalid_value' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(p_payload->>'probability', '')::integer NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'invalid_probability' USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(p_payload->>'source', '')) > 200
     OR length(COALESCE(p_payload->>'notes', '')) > 10000 THEN
    RAISE EXCEPTION 'invalid_crm_card_payload' USING ERRCODE = '22023';
  END IF;
  IF p_payload ? 'expected_close_date'
     AND p_payload->>'expected_close_date' IS NOT NULL THEN
    BEGIN
      v_expected_close_date := (p_payload->>'expected_close_date')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'invalid_expected_close_date' USING ERRCODE = '22023';
    END;
    IF to_char(v_expected_close_date, 'YYYY-MM-DD')
       <> p_payload->>'expected_close_date' THEN
      RAISE EXCEPTION 'invalid_expected_close_date' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_external_id := NULLIF(btrim(p_payload->>'external_id'), '');
  IF v_external_id IS NOT NULL AND (
    length(v_external_id) > 200 OR v_external_id LIKE '__internal__:%'
  ) THEN
    RAISE EXCEPTION 'invalid_external_id' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.public_api_idempotency (
    integration_id, endpoint, idempotency_key, request_hash
  ) VALUES (
    p_integration_id, 'create_crm_card', p_idempotency_key, p_request_hash
  ) RETURNING * INTO v_idem;

  IF v_external_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'public-api-crm-card:external:' || p_integration_id::text || ':' || v_external_id,
      0
    ));
    IF EXISTS (
      SELECT 1
      FROM public.public_api_external_refs
      WHERE integration_id = p_integration_id
        AND resource_type = 'crm_card'
        AND external_id = v_external_id
    ) THEN
      RAISE EXCEPTION 'external_id_conflict' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.leads (
    company_id,
    title,
    stage_id,
    customer_id,
    value,
    probability,
    source,
    expected_close_date,
    notes
  ) VALUES (
    v_company_id,
    btrim(p_payload->>'title'),
    v_stage_id,
    v_customer_id,
    NULLIF(p_payload->>'value', '')::numeric,
    COALESCE(NULLIF(p_payload->>'probability', '')::integer, 50),
    NULLIF(btrim(p_payload->>'source'), ''),
    v_expected_close_date,
    NULLIF(p_payload->>'notes', '')
  ) RETURNING * INTO v_card;

  INSERT INTO public.public_api_external_refs (
    integration_id, company_id, resource_type, external_id, resource_id
  ) VALUES (
    p_integration_id,
    v_company_id,
    'crm_card',
    COALESCE(v_external_id, '__internal__:' || v_card.id::text),
    v_card.id
  );

  v_response := public.public_api_crm_card_response(
    p_integration_id,
    v_company_id,
    v_card.id,
    false
  );
  UPDATE public.public_api_idempotency
  SET state = 'completed',
      response_status = 201,
      response_body = v_response,
      resource_type = 'crm_card',
      resource_id = v_card.id,
      completed_at = now()
  WHERE id = v_idem.id;
  RETURN v_response;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_create_crm_card(
  uuid, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_create_crm_card(
  uuid, text, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_update_crm_card(
  p_integration_id uuid,
  p_card_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_company_id uuid;
  v_idem public.public_api_idempotency%ROWTYPE;
  v_card public.leads%ROWTYPE;
  v_previous_card public.leads%ROWTYPE;
  v_previous_stage_id uuid;
  v_previous_stage_name text;
  v_previous_pipeline_id uuid;
  v_previous_pipeline_name text;
  v_next_stage_id uuid;
  v_next_stage_name text;
  v_next_pipeline_id uuid;
  v_next_pipeline_name text;
  v_customer_id uuid;
  v_expected_close_date date;
  v_endpoint text;
  v_description jsonb;
  v_response jsonb;
BEGIN
  v_company_id := public.public_api_assert_integration(
    p_integration_id,
    'crm_cards:write'
  );
  IF p_idempotency_key IS NULL
     OR length(p_idempotency_key) NOT BETWEEN 8 AND 200
     OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_idempotency' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_payload) <> 'object'
     OR p_payload = '{}'::jsonb
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(p_payload) k
       WHERE k NOT IN (
         'title', 'stage_id', 'customer_id', 'value', 'probability',
         'source', 'expected_close_date', 'notes'
       )
     ) THEN
    RAISE EXCEPTION 'invalid_crm_card_payload' USING ERRCODE = '22023';
  END IF;

  -- Mesmo principio do create: uma resposta concluida independe do estado
  -- atual do card, da etapa e do cliente.
  v_endpoint := 'update_crm_card:' || p_card_id::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'public-api-idempotency:' || p_integration_id::text || ':' || p_idempotency_key,
    0
  ));
  SELECT *
  INTO v_idem
  FROM public.public_api_idempotency
  WHERE integration_id = p_integration_id
    AND endpoint = v_endpoint
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND AND v_idem.expires_at <= now() THEN
    DELETE FROM public.public_api_idempotency WHERE id = v_idem.id;
    v_idem := NULL;
  END IF;
  IF v_idem.id IS NOT NULL THEN
    IF v_idem.request_hash <> p_request_hash THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0001';
    END IF;
    IF v_idem.state = 'completed' THEN
      RETURN v_idem.response_body || jsonb_build_object('idempotent_replay', true);
    END IF;
    RAISE EXCEPTION 'request_in_progress' USING ERRCODE = 'P0001';
  END IF;

  SELECT l.*
  INTO v_previous_card
  FROM public.leads l
  JOIN public.crm_pipelines p
    ON p.id = l.pipeline_id
   AND p.company_id = l.company_id
   AND p.project_id IS NULL
  WHERE l.id = p_card_id
    AND l.company_id = v_company_id
  FOR UPDATE OF l;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'status', 404,
        'code', 'not_found',
        'title', 'Card nao encontrado',
        'detail', 'O card informado nao existe.'
      )
    );
  END IF;

  IF p_payload ? 'title'
     AND length(btrim(COALESCE(p_payload->>'title', ''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE = '22023';
  END IF;
  IF p_payload ? 'stage_id' THEN
    v_next_stage_id := NULLIF(p_payload->>'stage_id', '')::uuid;
    SELECT s.name, s.pipeline_id, p.name
    INTO v_next_stage_name, v_next_pipeline_id, v_next_pipeline_name
    FROM public.crm_stages s
    JOIN public.crm_pipelines p ON p.id = s.pipeline_id
    WHERE s.id = v_next_stage_id
      AND s.company_id = v_company_id
      AND p.company_id = v_company_id
      AND p.project_id IS NULL;
    IF v_next_pipeline_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'status', 404,
          'code', 'not_found',
          'title', 'Etapa nao encontrada',
          'detail', 'A etapa informada nao existe em um funil comercial.'
        )
      );
    END IF;
  ELSE
    v_next_stage_id := v_previous_card.stage_id;
  END IF;

  IF p_payload ? 'customer_id' THEN
    v_customer_id := NULLIF(p_payload->>'customer_id', '')::uuid;
    IF v_customer_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.customers c
      WHERE c.id = v_customer_id
        AND c.company_id = v_company_id
        AND NOT c.is_deleted
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'status', 404,
          'code', 'not_found',
          'title', 'Cliente nao encontrado',
          'detail', 'O cliente informado nao existe.'
        )
      );
    END IF;
  ELSE
    v_customer_id := v_previous_card.customer_id;
  END IF;
  IF p_payload ? 'value' AND (
    NULLIF(p_payload->>'value', '')::numeric < 0
    OR NULLIF(p_payload->>'value', '')::numeric > 99999999.99
  ) THEN
    RAISE EXCEPTION 'invalid_value' USING ERRCODE = '22023';
  END IF;
  IF p_payload ? 'probability'
     AND NULLIF(p_payload->>'probability', '')::integer NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'invalid_probability' USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(p_payload->>'source', '')) > 200
     OR length(COALESCE(p_payload->>'notes', '')) > 10000 THEN
    RAISE EXCEPTION 'invalid_crm_card_payload' USING ERRCODE = '22023';
  END IF;
  v_expected_close_date := v_previous_card.expected_close_date;
  IF p_payload ? 'expected_close_date' THEN
    IF p_payload->>'expected_close_date' IS NULL THEN
      v_expected_close_date := NULL;
    ELSE
      BEGIN
        v_expected_close_date := (p_payload->>'expected_close_date')::date;
      EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
        RAISE EXCEPTION 'invalid_expected_close_date' USING ERRCODE = '22023';
      END;
      IF to_char(v_expected_close_date, 'YYYY-MM-DD')
         <> p_payload->>'expected_close_date' THEN
        RAISE EXCEPTION 'invalid_expected_close_date' USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.public_api_idempotency (
    integration_id, endpoint, idempotency_key, request_hash
  ) VALUES (
    p_integration_id, v_endpoint, p_idempotency_key, p_request_hash
  ) RETURNING * INTO v_idem;

  v_previous_stage_id := v_previous_card.stage_id;
  IF v_next_stage_id IS DISTINCT FROM v_previous_stage_id THEN
    SELECT s.name, s.pipeline_id, p.name
    INTO v_previous_stage_name, v_previous_pipeline_id, v_previous_pipeline_name
    FROM public.crm_stages s
    JOIN public.crm_pipelines p ON p.id = s.pipeline_id
    WHERE s.id = v_previous_stage_id;
  END IF;

  UPDATE public.leads
  SET title = CASE
        WHEN p_payload ? 'title' THEN btrim(p_payload->>'title')
        ELSE title
      END,
      stage_id = v_next_stage_id,
      customer_id = v_customer_id,
      value = CASE
        WHEN p_payload ? 'value' THEN NULLIF(p_payload->>'value', '')::numeric
        ELSE value
      END,
      probability = CASE
        WHEN p_payload ? 'probability' THEN NULLIF(p_payload->>'probability', '')::integer
        ELSE probability
      END,
      source = CASE
        WHEN p_payload ? 'source' THEN NULLIF(btrim(p_payload->>'source'), '')
        ELSE source
      END,
      expected_close_date = CASE
        WHEN p_payload ? 'expected_close_date' THEN v_expected_close_date
        ELSE expected_close_date
      END,
      notes = CASE
        WHEN p_payload ? 'notes' THEN NULLIF(p_payload->>'notes', '')
        ELSE notes
      END,
      updated_at = now()
  WHERE id = p_card_id
    AND company_id = v_company_id
  RETURNING * INTO v_card;

  IF v_next_stage_id IS DISTINCT FROM v_previous_stage_id THEN
    v_description := jsonb_build_object(
      'from_stage_id', v_previous_stage_id,
      'from_stage_name', v_previous_stage_name,
      'to_stage_id', v_next_stage_id,
      'to_stage_name', v_next_stage_name
    );
    IF v_previous_pipeline_id IS DISTINCT FROM v_next_pipeline_id THEN
      v_description := v_description || jsonb_build_object(
        'from_pipeline_id', v_previous_pipeline_id,
        'from_pipeline_name', v_previous_pipeline_name,
        'to_pipeline_id', v_next_pipeline_id,
        'to_pipeline_name', v_next_pipeline_name
      );
    END IF;
    INSERT INTO public.lead_interactions (
      lead_id, interaction_type, description, created_by
    ) VALUES (
      p_card_id, 'mudanca_estagio', v_description::text, NULL
    );
  END IF;

  v_response := public.public_api_crm_card_response(
    p_integration_id,
    v_company_id,
    p_card_id,
    false
  );
  UPDATE public.public_api_idempotency
  SET state = 'completed',
      response_status = 200,
      response_body = v_response,
      resource_type = 'crm_card',
      resource_id = p_card_id,
      completed_at = now()
  WHERE id = v_idem.id;
  RETURN v_response;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_update_crm_card(
  uuid, uuid, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_update_crm_card(
  uuid, uuid, text, text, jsonb
) TO service_role;

COMMENT ON FUNCTION public.public_api_get_crm_pipelines(uuid) IS
  'Lista apenas funis comerciais e etapas do tenant da integracao publica.';
COMMENT ON FUNCTION public.public_api_list_crm_cards(uuid, integer, text, uuid, uuid, timestamptz) IS
  'Lista cards de funis comerciais do tenant com cursor opaco e limite maximo de 100.';
COMMENT ON FUNCTION public.public_api_get_crm_card(uuid, uuid, text) IS
  'Consulta um card comercial do tenant por UUID ou external_id da integracao.';
COMMENT ON FUNCTION public.public_api_create_crm_card(uuid, text, text, jsonb) IS
  'Cria card CRM comercial de forma idempotente e multi-tenant.';
COMMENT ON FUNCTION public.public_api_update_crm_card(uuid, uuid, text, text, jsonb) IS
  'Atualiza ou move card CRM comercial de forma idempotente e registra historico de etapa.';

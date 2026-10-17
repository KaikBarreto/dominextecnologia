-- ============================================================================
-- API Publica v1: capabilities, catalogos, disponibilidade, cliente e OS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.schedule_weekly_hours_is_valid(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
DECLARE v_key text; v_day jsonb; v_period jsonb; v_start time; v_end time;
BEGIN
  IF jsonb_typeof(p_value) <> 'object' THEN RETURN false; END IF;
  FOR v_key, v_day IN SELECT key, value FROM jsonb_each(p_value) LOOP
    IF v_key !~ '^[0-6]$' OR jsonb_typeof(v_day) <> 'array' THEN RETURN false; END IF;
    FOR v_period IN SELECT value FROM jsonb_array_elements(v_day) LOOP
      IF jsonb_typeof(v_period) <> 'array' OR jsonb_array_length(v_period) <> 2
         OR (v_period->>0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         OR (v_period->>1) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RETURN false; END IF;
      v_start := (v_period->>0)::time; v_end := (v_period->>1)::time;
      IF v_start >= v_end THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END;
$function$;

ALTER TABLE public.schedule_booking_settings
  ADD CONSTRAINT schedule_booking_settings_weekly_hours_shape_check
  CHECK (public.schedule_weekly_hours_is_valid(weekly_hours));

REVOKE ALL ON FUNCTION public.schedule_weekly_hours_is_valid(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_weekly_hours_is_valid(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_api_assert_integration(
  p_integration_id uuid,
  p_required_scope text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company_id uuid; v_scopes text[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'public_api_service_role_required' USING ERRCODE = '42501';
  END IF;
  SELECT company_id, scopes INTO v_company_id, v_scopes
    FROM public.public_api_integrations
   WHERE id = p_integration_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'public_api_integration_disabled' USING ERRCODE = '42501'; END IF;
  IF p_required_scope IS NOT NULL AND NOT (p_required_scope = ANY(v_scopes)) THEN
    RAISE EXCEPTION 'public_api_insufficient_scope' USING ERRCODE = '42501';
  END IF;
  IF NOT public.public_api_company_is_enabled(v_company_id) THEN
    RAISE EXCEPTION 'public_api_tenant_not_entitled' USING ERRCODE = '42501';
  END IF;
  RETURN v_company_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_assert_integration(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_assert_integration(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_get_capabilities(p_integration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company_id uuid; v_result jsonb;
BEGIN
  v_company_id := public.public_api_assert_integration(p_integration_id, NULL);
  SELECT jsonb_build_object(
    'integration_id', i.id,
    'scopes', i.scopes,
    'rate_limits', jsonb_build_object('general_per_minute', 60, 'availability_per_minute', 30, 'mutations_per_minute', 10),
    'idempotency_ttl_seconds', 604800,
    'booking', jsonb_build_object(
      'enabled', COALESCE(s.booking_enabled, false),
      'slot_interval_minutes', COALESCE(s.slot_interval_minutes, 30),
      'minimum_notice_minutes', COALESCE(s.minimum_notice_minutes, 120),
      'booking_horizon_days', COALESCE(s.booking_horizon_days, 60),
      'default_duration_minutes', COALESCE(s.default_duration_minutes, 120)
    )
  ) INTO v_result
  FROM public.public_api_integrations i
  LEFT JOIN public.schedule_booking_settings s ON s.company_id = i.company_id
  WHERE i.id = p_integration_id AND i.company_id = v_company_id;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_get_capabilities(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_get_capabilities(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_get_catalogs(p_integration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company_id uuid;
BEGIN
  v_company_id := public.public_api_assert_integration(p_integration_id, 'catalogs:read');
  RETURN jsonb_build_object(
    'service_types', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'description', st.description, 'color', st.color) ORDER BY st.name)
      FROM public.service_types st WHERE st.company_id = v_company_id AND st.is_active
    ), '[]'::jsonb),
    'resources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'resource_type', r.resource_type, 'resource_id', r.resource_id,
        'name', CASE WHEN r.resource_type = 'user' THEN p.full_name ELSE t.name END
      ) ORDER BY r.resource_type, CASE WHEN r.resource_type = 'user' THEN p.full_name ELSE t.name END)
      FROM public.public_api_integration_resources r
      LEFT JOIN public.profiles p ON r.resource_type = 'user' AND p.user_id = r.resource_id AND p.company_id = v_company_id
      LEFT JOIN public.teams t ON r.resource_type = 'team' AND t.id = r.resource_id AND t.company_id = v_company_id
      WHERE r.integration_id = p_integration_id AND r.company_id = v_company_id AND r.is_active
    ), '[]'::jsonb),
    'os_types', jsonb_build_array('manutencao_preventiva', 'manutencao_corretiva', 'instalacao', 'visita_tecnica')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_get_catalogs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_get_catalogs(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_slot_is_available(
  p_company_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_settings public.schedule_booking_settings%ROWTYPE; v_timezone text; v_local_start timestamp; v_local_end timestamp; v_regular boolean; v_open boolean;
BEGIN
  SELECT * INTO v_settings FROM public.schedule_booking_settings WHERE company_id = p_company_id AND booking_enabled;
  IF NOT FOUND OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_starts_at >= p_ends_at THEN RETURN false; END IF;
  SELECT timezone INTO v_timezone FROM public.company_settings WHERE company_id = p_company_id;
  IF v_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_timezone) THEN RETURN false; END IF;
  IF p_starts_at < now() + make_interval(mins => v_settings.minimum_notice_minutes)
     OR p_ends_at > now() + make_interval(days => v_settings.booking_horizon_days) THEN RETURN false; END IF;
  v_local_start := p_starts_at AT TIME ZONE v_timezone; v_local_end := p_ends_at AT TIME ZONE v_timezone;
  IF v_local_start::date <> v_local_end::date THEN RETURN false; END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_settings.weekly_hours -> extract(dow FROM v_local_start)::integer::text, '[]'::jsonb)) period
    WHERE v_local_start::time >= (period->>0)::time AND v_local_end::time <= (period->>1)::time
  ) INTO v_regular;
  SELECT EXISTS (
    SELECT 1 FROM public.schedule_booking_exceptions e
    WHERE e.company_id = p_company_id AND e.is_available
      AND e.starts_at <= p_starts_at AND e.ends_at >= p_ends_at
  ) INTO v_open;
  IF NOT (v_regular OR v_open) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.schedule_booking_exceptions e
    WHERE e.company_id = p_company_id AND NOT e.is_available
      AND tstzrange(e.starts_at, e.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN RETURN false; END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.booking_reservations r
    WHERE r.company_id = p_company_id AND r.resource_type = p_resource_type AND r.resource_id = p_resource_id
      AND r.status = 'active' AND r.slot && tstzrange(p_starts_at, p_ends_at, '[)')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_slot_is_available(uuid, text, uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_slot_is_available(uuid, text, uuid, timestamptz, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_get_availability(
  p_integration_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_duration_minutes integer,
  p_service_type_id uuid DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company_id uuid; v_settings public.schedule_booking_settings%ROWTYPE; v_slots jsonb; v_total bigint;
BEGIN
  v_company_id := public.public_api_assert_integration(p_integration_id, 'availability:read');
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to OR p_to - p_from > interval '31 days'
     OR p_duration_minutes NOT BETWEEN 5 AND 1440 THEN
    RAISE EXCEPTION 'public_api_invalid_availability_range' USING ERRCODE = '22023';
  END IF;
  IF p_service_type_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_types WHERE id = p_service_type_id AND company_id = v_company_id AND is_active
  ) THEN RAISE EXCEPTION 'public_api_service_type_not_found' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_settings FROM public.schedule_booking_settings WHERE company_id = v_company_id AND booking_enabled;
  IF NOT FOUND THEN RETURN jsonb_build_object('slots', '[]'::jsonb, 'booking_enabled', false, 'truncated', false); END IF;

  WITH candidate AS (
    SELECT r.resource_type, r.resource_id, s AS starts_at, s + make_interval(mins => p_duration_minutes) AS ends_at
    FROM public.public_api_integration_resources r
    CROSS JOIN LATERAL generate_series(
      p_from,
      p_to - make_interval(mins => p_duration_minutes),
      make_interval(mins => v_settings.slot_interval_minutes)
    ) s
    WHERE r.integration_id = p_integration_id AND r.company_id = v_company_id AND r.is_active
      AND (p_resource_id IS NULL OR r.resource_id = p_resource_id)
  ), available AS (
    SELECT * FROM candidate c
    WHERE public.public_api_slot_is_available(v_company_id, c.resource_type, c.resource_id, c.starts_at, c.ends_at)
  ), numbered AS (
    SELECT *, row_number() OVER (ORDER BY starts_at, resource_type, resource_id) AS rn, count(*) OVER () AS total FROM available
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'resource_type', resource_type, 'resource_id', resource_id,
           'starts_at', starts_at, 'ends_at', ends_at
         ) ORDER BY starts_at, resource_type, resource_id) FILTER (WHERE rn <= 5000), '[]'::jsonb),
         COALESCE(max(total), 0)
    INTO v_slots, v_total FROM numbered;
  RETURN jsonb_build_object('slots', v_slots, 'booking_enabled', true, 'truncated', v_total > 5000, 'total', v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_get_availability(uuid, timestamptz, timestamptz, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_get_availability(uuid, timestamptz, timestamptz, integer, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_resolve_customer(p_integration_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company_id uuid; v_external_id text; v_document text; v_customer_id uuid; v_matches integer; v_type public.customer_type;
BEGIN
  v_company_id := public.public_api_assert_integration(p_integration_id, 'customers:resolve');
  IF jsonb_typeof(p_payload) <> 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_payload) k
    WHERE k NOT IN ('external_id','name','customer_type','document','email','phone','celular','address','address_number','neighborhood','city','state','zip_code','complement','notes')
  ) THEN RAISE EXCEPTION 'public_api_invalid_customer_payload' USING ERRCODE = '22023'; END IF;
  v_external_id := NULLIF(btrim(p_payload->>'external_id'), '');
  v_document := NULLIF(regexp_replace(COALESCE(p_payload->>'document',''), '\D', '', 'g'), '');
  IF v_external_id IS NOT NULL OR v_document IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'public-api-customer:' || v_company_id::text || ':' || COALESCE(v_external_id, v_document), 0
    ));
  END IF;
  IF v_external_id IS NOT NULL THEN
    SELECT er.resource_id INTO v_customer_id FROM public.public_api_external_refs er
    JOIN public.customers c ON c.id = er.resource_id AND c.company_id = v_company_id AND NOT c.is_deleted
    WHERE er.integration_id = p_integration_id AND er.resource_type = 'customer' AND er.external_id = v_external_id;
  END IF;
  IF v_customer_id IS NULL AND v_document IS NOT NULL THEN
    SELECT count(*), min(id) INTO v_matches, v_customer_id FROM public.customers
    WHERE company_id = v_company_id AND NOT is_deleted AND regexp_replace(COALESCE(document,''), '\D', '', 'g') = v_document;
    IF v_matches > 1 THEN RAISE EXCEPTION 'public_api_customer_ambiguous' USING ERRCODE = 'P0001'; END IF;
  END IF;
  IF v_customer_id IS NULL THEN
    IF length(btrim(COALESCE(p_payload->>'name',''))) < 2 THEN RAISE EXCEPTION 'public_api_customer_name_required' USING ERRCODE = '22023'; END IF;
    IF COALESCE(p_payload->>'customer_type','pj') NOT IN ('pf','pj') THEN RAISE EXCEPTION 'public_api_customer_type_invalid' USING ERRCODE = '22023'; END IF;
    v_type := COALESCE(p_payload->>'customer_type','pj')::public.customer_type;
    INSERT INTO public.customers (
      company_id, name, customer_type, document, email, phone, celular, address, address_number,
      neighborhood, city, state, zip_code, complement, notes, origin
    ) VALUES (
      v_company_id, btrim(p_payload->>'name'), v_type, NULLIF(p_payload->>'document',''), NULLIF(p_payload->>'email',''),
      NULLIF(p_payload->>'phone',''), NULLIF(p_payload->>'celular',''), NULLIF(p_payload->>'address',''),
      NULLIF(p_payload->>'address_number',''), NULLIF(p_payload->>'neighborhood',''), NULLIF(p_payload->>'city',''),
      NULLIF(p_payload->>'state',''), NULLIF(p_payload->>'zip_code',''), NULLIF(p_payload->>'complement',''),
      NULLIF(p_payload->>'notes',''), 'public_api'
    ) RETURNING id INTO v_customer_id;
  END IF;
  IF v_external_id IS NOT NULL THEN
    INSERT INTO public.public_api_external_refs (integration_id, company_id, resource_type, external_id, resource_id)
    VALUES (p_integration_id, v_company_id, 'customer', v_external_id, v_customer_id)
    ON CONFLICT (integration_id, resource_type, external_id) DO UPDATE SET
      resource_id = EXCLUDED.resource_id, updated_at = now()
    WHERE public.public_api_external_refs.resource_id = EXCLUDED.resource_id;
  END IF;
  RETURN (SELECT jsonb_build_object('id', c.id, 'external_id', v_external_id, 'name', c.name, 'customer_type', c.customer_type, 'document', c.document, 'email', c.email, 'phone', c.phone, 'created_at', c.created_at) FROM public.customers c WHERE c.id = v_customer_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_resolve_customer(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_resolve_customer(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_create_service_order(
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
  v_company_id uuid; v_existing public.public_api_idempotency%ROWTYPE; v_customer_id uuid; v_customer jsonb;
  v_service_type_id uuid; v_resource_type text; v_resource_id uuid; v_starts_at timestamptz; v_ends_at timestamptz;
  v_duration integer; v_timezone text; v_os_type public.os_type; v_os public.service_orders%ROWTYPE; v_response jsonb; v_external_id text;
BEGIN
  v_company_id := public.public_api_assert_integration(p_integration_id, 'service_orders:create');
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'public_api_invalid_idempotency' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_payload) <> 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN (
      'external_id','customer_id','external_customer_id','customer','service_type_id','resource_type','resource_id',
      'starts_at','duration_minutes','os_type','description','notes','service_address','service_address_number',
      'service_neighborhood','service_city','service_state','service_zip_code'
    )
  ) THEN RAISE EXCEPTION 'public_api_invalid_service_order_payload' USING ERRCODE = '22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('public-api-idempotency:' || p_integration_id::text || ':' || p_idempotency_key, 0));
  SELECT * INTO v_existing FROM public.public_api_idempotency
   WHERE integration_id = p_integration_id AND endpoint = 'create_service_order' AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND AND v_existing.expires_at <= now() THEN DELETE FROM public.public_api_idempotency WHERE id = v_existing.id; v_existing := NULL; END IF;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.request_hash <> p_request_hash THEN RAISE EXCEPTION 'public_api_idempotency_conflict' USING ERRCODE = 'P0001'; END IF;
    IF v_existing.state = 'completed' THEN RETURN v_existing.response_body || jsonb_build_object('idempotency_replayed', true); END IF;
    RAISE EXCEPTION 'public_api_request_in_progress' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.public_api_idempotency (integration_id, endpoint, idempotency_key, request_hash)
  VALUES (p_integration_id, 'create_service_order', p_idempotency_key, p_request_hash) RETURNING * INTO v_existing;

  IF p_payload ? 'customer_id' THEN v_customer_id := (p_payload->>'customer_id')::uuid;
  ELSIF p_payload ? 'external_customer_id' THEN
    SELECT resource_id INTO v_customer_id FROM public.public_api_external_refs
    WHERE integration_id = p_integration_id AND resource_type = 'customer' AND external_id = p_payload->>'external_customer_id';
  ELSIF p_payload ? 'customer' THEN
    v_customer := public.public_api_resolve_customer(p_integration_id, p_payload->'customer');
    v_customer_id := (v_customer->>'id')::uuid;
  END IF;
  IF v_customer_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer_id AND company_id = v_company_id AND NOT is_deleted) THEN
    RAISE EXCEPTION 'public_api_customer_not_found' USING ERRCODE = 'P0001';
  END IF;
  v_service_type_id := NULLIF(p_payload->>'service_type_id','')::uuid;
  IF v_service_type_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.service_types WHERE id = v_service_type_id AND company_id = v_company_id AND is_active) THEN
    RAISE EXCEPTION 'public_api_service_type_not_found' USING ERRCODE = 'P0001';
  END IF;
  v_resource_type := p_payload->>'resource_type'; v_resource_id := NULLIF(p_payload->>'resource_id','')::uuid;
  IF v_resource_type NOT IN ('user','team') OR v_resource_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.public_api_integration_resources WHERE integration_id = p_integration_id AND company_id = v_company_id
      AND resource_type = v_resource_type AND resource_id = v_resource_id AND is_active
  ) THEN RAISE EXCEPTION 'public_api_resource_not_allowed' USING ERRCODE = 'P0001'; END IF;
  v_starts_at := (p_payload->>'starts_at')::timestamptz; v_duration := COALESCE(NULLIF(p_payload->>'duration_minutes','')::integer, 120);
  IF v_duration NOT BETWEEN 5 AND 1440 THEN RAISE EXCEPTION 'public_api_invalid_duration' USING ERRCODE = '22023'; END IF;
  v_ends_at := v_starts_at + make_interval(mins => v_duration);
  IF NOT public.public_api_slot_is_available(v_company_id, v_resource_type, v_resource_id, v_starts_at, v_ends_at) THEN
    RAISE EXCEPTION 'public_api_schedule_conflict' USING ERRCODE = 'P0001';
  END IF;
  SELECT timezone INTO v_timezone FROM public.company_settings WHERE company_id = v_company_id;
  IF v_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_timezone) THEN RAISE EXCEPTION 'public_api_company_timezone_invalid' USING ERRCODE = 'P0001'; END IF;
  IF COALESCE(p_payload->>'os_type','manutencao_corretiva') NOT IN ('manutencao_preventiva','manutencao_corretiva','instalacao','visita_tecnica') THEN RAISE EXCEPTION 'public_api_os_type_invalid' USING ERRCODE = '22023'; END IF;
  v_os_type := COALESCE(p_payload->>'os_type','manutencao_corretiva')::public.os_type;
  PERFORM set_config('app.booking_source', 'public_api', true);
  PERFORM set_config('app.booking_integration_id', p_integration_id::text, true);
  INSERT INTO public.service_orders (
    company_id, customer_id, service_type_id, technician_id, team_id, scheduled_date, scheduled_time,
    duration_minutes, os_type, status, description, notes, origin, entry_type,
    service_address, service_address_number, service_neighborhood, service_city, service_state, service_zip_code
  ) VALUES (
    v_company_id, v_customer_id, v_service_type_id,
    CASE WHEN v_resource_type = 'user' THEN v_resource_id END,
    CASE WHEN v_resource_type = 'team' THEN v_resource_id END,
    (v_starts_at AT TIME ZONE v_timezone)::date, (v_starts_at AT TIME ZONE v_timezone)::time,
    v_duration, v_os_type, 'agendada', NULLIF(p_payload->>'description',''), NULLIF(p_payload->>'notes',''),
    'public_api', 'os', NULLIF(p_payload->>'service_address',''), NULLIF(p_payload->>'service_address_number',''),
    NULLIF(p_payload->>'service_neighborhood',''), NULLIF(p_payload->>'service_city',''), NULLIF(p_payload->>'service_state',''), NULLIF(p_payload->>'service_zip_code','')
  ) RETURNING * INTO v_os;
  v_external_id := NULLIF(btrim(p_payload->>'external_id'),'');
  IF v_external_id IS NOT NULL THEN
    INSERT INTO public.public_api_external_refs (integration_id, company_id, resource_type, external_id, resource_id)
    VALUES (p_integration_id, v_company_id, 'service_order', v_external_id, v_os.id);
  END IF;
  v_response := jsonb_build_object('id', v_os.id, 'external_id', v_external_id, 'order_number', v_os.order_number,
    'status', v_os.status, 'customer_id', v_os.customer_id, 'service_type_id', v_os.service_type_id,
    'resource_type', v_resource_type, 'resource_id', v_resource_id, 'starts_at', v_starts_at, 'ends_at', v_ends_at,
    'created_at', v_os.created_at, 'idempotency_replayed', false);
  UPDATE public.public_api_idempotency SET state = 'completed', response_status = 201, response_body = v_response,
    resource_type = 'service_order', resource_id = v_os.id, completed_at = now() WHERE id = v_existing.id;
  RETURN v_response;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_create_service_order(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_create_service_order(uuid, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_get_service_order(
  p_integration_id uuid,
  p_service_order_id uuid DEFAULT NULL,
  p_external_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company_id uuid; v_id uuid;
BEGIN
  v_company_id := public.public_api_assert_integration(p_integration_id, 'service_orders:read');
  IF (p_service_order_id IS NULL) = (NULLIF(btrim(p_external_id),'') IS NULL) THEN RAISE EXCEPTION 'public_api_service_order_identifier_required' USING ERRCODE = '22023'; END IF;
  v_id := p_service_order_id;
  IF v_id IS NULL THEN SELECT resource_id INTO v_id FROM public.public_api_external_refs WHERE integration_id = p_integration_id AND resource_type = 'service_order' AND external_id = btrim(p_external_id); END IF;
  RETURN (SELECT jsonb_build_object(
    'id', so.id, 'external_id', er.external_id, 'order_number', so.order_number, 'status', so.status,
    'customer_id', so.customer_id, 'service_type_id', so.service_type_id, 'os_type', so.os_type,
    'description', so.description, 'notes', so.notes, 'scheduled_date', so.scheduled_date,
    'scheduled_time', so.scheduled_time, 'duration_minutes', so.duration_minutes,
    'technician_id', so.technician_id, 'team_id', so.team_id, 'created_at', so.created_at, 'updated_at', so.updated_at
  ) FROM public.service_orders so LEFT JOIN public.public_api_external_refs er ON er.integration_id = p_integration_id AND er.resource_type = 'service_order' AND er.resource_id = so.id
  WHERE so.id = v_id AND so.company_id = v_company_id AND so.entry_type = 'os');
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_get_service_order(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_get_service_order(uuid, uuid, text) TO service_role;

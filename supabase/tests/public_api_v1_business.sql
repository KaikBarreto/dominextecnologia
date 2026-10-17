-- Smoke transacional para ambiente ja migrado. Todos os dados sinteticos sao
-- desfeitos pelo ROLLBACK final; nao usar fora de uma conexao administrativa.
BEGIN;

DO $test$
DECLARE
  v_company_id uuid;
  v_other_company_id uuid;
  v_user_id uuid;
  v_unassigned_id uuid;
  v_agent_id uuid;
  v_round_robin_id uuid;
  v_other_integration_id uuid;
  v_key_id uuid;
  v_start timestamptz := date_trunc('hour', now() + interval '3 days');
  v_payload jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_os_id uuid;
  v_assigned_os_id uuid;
  v_customer_id uuid;
  v_customer_name text;
  v_conflict_seen boolean := false;
  v_idempotency_conflict_seen boolean := false;
  v_invalid_payload_seen boolean := false;
  v_rate jsonb;
  v_index integer;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  SELECT c.id, p.user_id
    INTO v_company_id, v_user_id
    FROM public.companies c
    JOIN public.company_settings cs ON cs.company_id = c.id
    JOIN public.profiles p ON p.company_id = c.id AND p.is_active
   WHERE cs.timezone IN (SELECT name FROM pg_timezone_names)
   ORDER BY c.created_at
   LIMIT 1;
  SELECT c.id INTO v_other_company_id
    FROM public.companies c
   WHERE c.id <> v_company_id
   ORDER BY c.created_at
   LIMIT 1;
  IF v_company_id IS NULL OR v_other_company_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'fixture_company_unavailable';
  END IF;

  UPDATE public.app_feature_flags
     SET enabled = false,
         company_allowlist = ARRAY[v_company_id, v_other_company_id],
         updated_at = now()
   WHERE key = 'public_api_v1';

  INSERT INTO public.schedule_booking_settings (
    company_id, booking_enabled, slot_interval_minutes,
    default_duration_minutes, minimum_notice_minutes, booking_horizon_days,
    weekly_hours
  ) VALUES (
    v_company_id, true, 30, 60, 0, 60,
    '{"0":[["00:00","23:59"]],"1":[["00:00","23:59"]],"2":[["00:00","23:59"]],"3":[["00:00","23:59"]],"4":[["00:00","23:59"]],"5":[["00:00","23:59"]],"6":[["00:00","23:59"]]}'::jsonb
  ) ON CONFLICT (company_id) DO UPDATE SET
    booking_enabled = EXCLUDED.booking_enabled,
    slot_interval_minutes = EXCLUDED.slot_interval_minutes,
    default_duration_minutes = EXCLUDED.default_duration_minutes,
    minimum_notice_minutes = EXCLUDED.minimum_notice_minutes,
    booking_horizon_days = EXCLUDED.booking_horizon_days,
    weekly_hours = EXCLUDED.weekly_hours;

  INSERT INTO public.public_api_integrations (
    company_id, name, scopes, distribution_mode
  ) VALUES (
    v_company_id, 'Smoke API unassigned',
    ARRAY['catalogs:read','availability:read','customers:resolve','service_orders:create','service_orders:read'],
    'unassigned'
  ) RETURNING id INTO v_unassigned_id;
  INSERT INTO public.public_api_integrations (
    company_id, name, scopes, distribution_mode
  ) VALUES (
    v_company_id, 'Smoke API agent',
    ARRAY['catalogs:read','availability:read','customers:resolve','service_orders:create','service_orders:read'],
    'agent_selects'
  ) RETURNING id INTO v_agent_id;
  INSERT INTO public.public_api_integrations (
    company_id, name, scopes, distribution_mode
  ) VALUES (
    v_company_id, 'Smoke API round robin',
    ARRAY['catalogs:read','availability:read','customers:resolve','service_orders:create','service_orders:read'],
    'round_robin'
  ) RETURNING id INTO v_round_robin_id;
  INSERT INTO public.public_api_integrations (
    company_id, name, scopes, distribution_mode
  ) VALUES (
    v_other_company_id, 'Smoke API other tenant',
    ARRAY['service_orders:read'], 'unassigned'
  ) RETURNING id INTO v_other_integration_id;

  INSERT INTO public.public_api_integration_resources (
    integration_id, company_id, resource_type, resource_id
  ) VALUES
    (v_agent_id, v_company_id, 'user', v_user_id),
    (v_round_robin_id, v_company_id, 'user', v_user_id);

  INSERT INTO public.public_api_keys (
    integration_id, public_id, secret_hash, secret_last_four
  ) VALUES (
    v_unassigned_id, 'testPublicId1234', repeat('a', 64), '1234'
  ) RETURNING id INTO v_key_id;

  v_result := public.public_api_authenticate_key(
    'testPublicId1234', repeat('a', 64), 'service_orders:create', '203.0.113.10'::inet
  );
  IF COALESCE((v_result->>'authenticated')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'valid_key_rejected: %', v_result;
  END IF;
  UPDATE public.public_api_integrations
     SET ip_allowlist = ARRAY['198.51.100.10/32'::inet]
   WHERE id = v_unassigned_id;
  v_result := public.public_api_authenticate_key(
    'testPublicId1234', repeat('a', 64), NULL, '203.0.113.10'::inet
  );
  IF v_result->>'code' <> 'ip_not_allowed' THEN
    RAISE EXCEPTION 'ip_allowlist_failed: %', v_result;
  END IF;
  UPDATE public.public_api_integrations SET ip_allowlist = '{}' WHERE id = v_unassigned_id;

  FOR v_index IN 1..61 LOOP
    v_rate := public.public_api_consume_rate_limit(v_key_id, 'general', 60, 60);
  END LOOP;
  IF COALESCE((v_rate->>'allowed')::boolean, true) IS NOT FALSE
     OR (v_rate->>'remaining')::integer <> 0 THEN
    RAISE EXCEPTION 'rate_limit_failed: %', v_rate;
  END IF;

  v_result := public.public_api_get_capabilities(v_unassigned_id);
  IF v_result->>'integration_id' <> v_unassigned_id::text
     OR v_result#>>'{booking,enabled}' <> 'true' THEN
    RAISE EXCEPTION 'capabilities_failed: %', v_result;
  END IF;
  v_result := public.public_api_get_availability(
    v_unassigned_id, v_start, v_start + interval '4 hours', 60, NULL, NULL
  );
  IF jsonb_array_length(v_result->'slots') = 0 THEN
    RAISE EXCEPTION 'availability_empty: %', v_result;
  END IF;

  v_payload := jsonb_build_object(
    'external_id', 'smoke-os-unassigned',
    'customer', jsonb_build_object(
      'external_id', 'smoke-customer',
      'name', 'Cliente Smoke API',
      'document', '52998224725',
      'phone', '+15550102030',
      'email', 'smoke-api@example.invalid'
    ),
    'os_type', 'visita_tecnica',
    'description', 'Smoke transacional da API publica',
    'scheduled_at', v_start::text,
    'duration_minutes', 60
  );
  v_result := public.public_api_create_service_order(
    v_unassigned_id, 'smoke-idem-0001', repeat('b', 64), v_payload
  );
  v_os_id := (v_result->>'id')::uuid;
  v_customer_id := (v_result#>>'{customer,id}')::uuid;
  IF v_os_id IS NULL OR v_customer_id IS NULL
     OR v_result->>'assignment_status' <> 'assignment_pending' THEN
    RAISE EXCEPTION 'create_unassigned_failed: %', v_result;
  END IF;

  v_replay := public.public_api_create_service_order(
    v_unassigned_id, 'smoke-idem-0001', repeat('b', 64), v_payload
  );
  IF v_replay->>'id' <> v_os_id::text
     OR COALESCE((v_replay->>'idempotent_replay')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'idempotent_replay_failed: %', v_replay;
  END IF;
  BEGIN
    PERFORM public.public_api_create_service_order(
      v_unassigned_id, 'smoke-idem-0001', repeat('c', 64), v_payload
    );
  EXCEPTION WHEN OTHERS THEN
    v_idempotency_conflict_seen := SQLERRM = 'idempotency_conflict';
  END;
  IF NOT v_idempotency_conflict_seen THEN RAISE EXCEPTION 'idempotency_conflict_missing'; END IF;

  v_result := public.public_api_resolve_customer(
    v_unassigned_id, jsonb_build_object('external_id', 'smoke-customer')
  );
  IF v_result->>'id' <> v_customer_id::text THEN RAISE EXCEPTION 'resolve_external_failed'; END IF;
  v_result := public.public_api_resolve_customer(
    v_unassigned_id, jsonb_build_object('document', '529.982.247-25')
  );
  IF v_result->>'id' <> v_customer_id::text THEN RAISE EXCEPTION 'resolve_document_failed'; END IF;
  v_result := public.public_api_resolve_customer(
    v_unassigned_id, jsonb_build_object('phone', '+1 555 010 2030')
  );
  IF v_result->>'id' <> v_customer_id::text THEN RAISE EXCEPTION 'resolve_phone_failed'; END IF;
  v_result := public.public_api_resolve_customer(
    v_unassigned_id, jsonb_build_object('email', 'SMOKE-API@EXAMPLE.INVALID')
  );
  IF v_result->>'id' <> v_customer_id::text THEN RAISE EXCEPTION 'resolve_email_failed'; END IF;

  v_result := public.public_api_get_service_order(v_unassigned_id, v_os_id, NULL);
  IF v_result->>'id' <> v_os_id::text THEN RAISE EXCEPTION 'get_by_id_failed'; END IF;
  v_result := public.public_api_get_service_order(v_unassigned_id, NULL, 'smoke-os-unassigned');
  IF v_result->>'id' <> v_os_id::text THEN RAISE EXCEPTION 'get_by_external_failed'; END IF;
  v_result := public.public_api_get_service_order(v_agent_id, v_os_id, NULL);
  IF v_result#>>'{error,code}' <> 'not_found' THEN RAISE EXCEPTION 'integration_isolation_failed'; END IF;
  v_result := public.public_api_get_service_order(v_other_integration_id, v_os_id, NULL);
  IF v_result#>>'{error,code}' <> 'not_found' THEN RAISE EXCEPTION 'tenant_isolation_failed'; END IF;

  SELECT name INTO v_customer_name FROM public.customers WHERE id = v_customer_id;
  v_payload := jsonb_build_object(
    'customer', jsonb_build_object('id', v_customer_id, 'name', 'Nome nao autorizado'),
    'os_type', 'visita_tecnica', 'description', 'Nao altera cliente existente',
    'scheduled_at', (v_start + interval '2 hours')::text, 'duration_minutes', 60
  );
  PERFORM public.public_api_create_service_order(
    v_unassigned_id, 'smoke-idem-0002', repeat('d', 64), v_payload
  );
  IF (SELECT name FROM public.customers WHERE id = v_customer_id) <> v_customer_name THEN
    RAISE EXCEPTION 'existing_customer_was_mutated';
  END IF;
  BEGIN
    PERFORM public.public_api_create_service_order(
      v_unassigned_id, 'smoke-idem-0003', repeat('e', 64), v_payload || '{"status":"concluida"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    v_invalid_payload_seen := SQLERRM = 'invalid_service_order_payload';
  END;
  IF NOT v_invalid_payload_seen THEN RAISE EXCEPTION 'mass_assignment_not_rejected'; END IF;

  v_payload := jsonb_build_object(
    'external_id', 'smoke-os-agent',
    'customer', jsonb_build_object('id', v_customer_id),
    'os_type', 'visita_tecnica', 'description', 'Reserva com responsavel',
    'scheduled_at', (v_start + interval '6 hours')::text, 'duration_minutes', 60,
    'resource', jsonb_build_object('type', 'user', 'id', v_user_id)
  );
  v_result := public.public_api_create_service_order(
    v_agent_id, 'smoke-idem-agent', repeat('f', 64), v_payload
  );
  v_assigned_os_id := (v_result->>'id')::uuid;
  IF v_result->>'assignment_status' <> 'assigned'
     OR NOT EXISTS (
       SELECT 1 FROM public.booking_reservations
        WHERE service_order_id = v_assigned_os_id AND status = 'active'
     ) THEN RAISE EXCEPTION 'assigned_reservation_missing: %', v_result; END IF;

  v_payload := (v_payload - 'resource' - 'external_id') || jsonb_build_object('external_id', 'smoke-os-conflict');
  BEGIN
    PERFORM public.public_api_create_service_order(
      v_round_robin_id, 'smoke-idem-conflict', repeat('1', 64), v_payload
    );
  EXCEPTION WHEN OTHERS THEN
    v_conflict_seen := SQLERRM = 'schedule_conflict';
  END;
  IF NOT v_conflict_seen THEN RAISE EXCEPTION 'schedule_conflict_missing'; END IF;

  UPDATE public.service_orders SET status = 'cancelada' WHERE id = v_assigned_os_id;
  IF EXISTS (
    SELECT 1 FROM public.booking_reservations
     WHERE service_order_id = v_assigned_os_id AND status = 'active'
  ) THEN RAISE EXCEPTION 'cancelled_reservation_still_active'; END IF;
  v_result := public.public_api_create_service_order(
    v_round_robin_id, 'smoke-idem-after-cancel', repeat('2', 64), v_payload
  );
  IF v_result->>'assignment_status' <> 'assigned' THEN
    RAISE EXCEPTION 'slot_not_released_after_cancel: %', v_result;
  END IF;

  UPDATE public.public_api_keys SET revoked_at = now() WHERE id = v_key_id;
  v_result := public.public_api_authenticate_key(
    'testPublicId1234', repeat('a', 64), NULL, '203.0.113.10'::inet
  );
  IF v_result->>'code' <> 'invalid_api_key' THEN RAISE EXCEPTION 'revoked_key_accepted'; END IF;
END
$test$;

ROLLBACK;

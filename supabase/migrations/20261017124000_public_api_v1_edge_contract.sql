-- ============================================================================
-- Alinhamento do contrato SQL com a edge publica v1
-- ============================================================================

CREATE OR REPLACE FUNCTION public.public_api_resource_slot_available(
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
  IF NOT FOUND OR p_resource_type NOT IN ('user','team','unassigned') OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_starts_at >= p_ends_at THEN RETURN false; END IF;
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
  SELECT EXISTS (SELECT 1 FROM public.schedule_booking_exceptions e WHERE e.company_id = p_company_id AND e.is_available AND e.starts_at <= p_starts_at AND e.ends_at >= p_ends_at) INTO v_open;
  IF NOT (v_regular OR v_open) OR EXISTS (
    SELECT 1 FROM public.schedule_booking_exceptions e
     WHERE e.company_id = p_company_id AND NOT e.is_available
       AND tstzrange(e.starts_at,e.ends_at,'[)') && tstzrange(p_starts_at,p_ends_at,'[)')
  ) THEN RETURN false; END IF;

  IF p_resource_type = 'unassigned' THEN RETURN true; END IF;
  IF p_resource_type = 'user' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = p_resource_id AND p.company_id = p_company_id AND p.is_active) THEN RETURN false; END IF;
    RETURN NOT EXISTS (
      SELECT 1 FROM public.booking_reservations r
       WHERE r.company_id = p_company_id AND r.resource_type = 'user' AND r.resource_id = p_resource_id
         AND r.status = 'active' AND r.slot && tstzrange(p_starts_at,p_ends_at,'[)')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.id = p_resource_id AND t.company_id = p_company_id AND COALESCE(t.is_active,true))
     OR NOT EXISTS (
       SELECT 1 FROM public.team_members tm JOIN public.profiles p ON p.user_id = tm.user_id
        WHERE tm.team_id = p_resource_id AND p.company_id = p_company_id AND p.is_active
     ) THEN RETURN false; END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.booking_reservations r
     WHERE r.company_id = p_company_id AND r.status = 'active'
       AND r.slot && tstzrange(p_starts_at,p_ends_at,'[)')
       AND (
         (r.resource_type = 'team' AND r.resource_id = p_resource_id)
         OR (r.resource_type = 'user' AND EXISTS (
           SELECT 1 FROM public.team_members tm JOIN public.profiles p ON p.user_id = tm.user_id
            WHERE tm.team_id = p_resource_id AND tm.user_id = r.resource_id
              AND p.company_id = p_company_id AND p.is_active
         ))
       )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_resource_slot_available(uuid,text,uuid,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_resource_slot_available(uuid,text,uuid,timestamptz,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_get_booking_resources(p_integration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company_id uuid;
BEGIN
  v_company_id := public.public_api_assert_integration(p_integration_id, 'catalogs:read');
  RETURN jsonb_build_object('data', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.resource_id, 'type', r.resource_type,
      'name', CASE WHEN r.resource_type = 'user' THEN p.full_name ELSE t.name END
    ) ORDER BY r.resource_type, CASE WHEN r.resource_type = 'user' THEN p.full_name ELSE t.name END)
    FROM public.public_api_integration_resources r
    LEFT JOIN public.profiles p ON r.resource_type = 'user' AND p.user_id = r.resource_id AND p.company_id = v_company_id AND p.is_active
    LEFT JOIN public.teams t ON r.resource_type = 'team' AND t.id = r.resource_id AND t.company_id = v_company_id AND COALESCE(t.is_active,true)
    WHERE r.integration_id = p_integration_id AND r.company_id = v_company_id AND r.is_active
      AND ((r.resource_type = 'user' AND p.user_id IS NOT NULL) OR (r.resource_type = 'team' AND t.id IS NOT NULL))
  ), '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_get_booking_resources(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_get_booking_resources(uuid) TO service_role;

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
DECLARE v_company_id uuid; v_settings public.schedule_booking_settings%ROWTYPE; v_timezone text; v_mode text; v_slots jsonb;
BEGIN
  v_company_id := public.public_api_assert_integration(p_integration_id, 'availability:read');
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to OR p_to-p_from > interval '31 days' OR p_duration_minutes NOT BETWEEN 15 AND 480 THEN
    RAISE EXCEPTION 'invalid_availability_range' USING ERRCODE = '22023';
  END IF;
  IF p_service_type_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.service_types WHERE id=p_service_type_id AND company_id=v_company_id AND is_active) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_settings FROM public.schedule_booking_settings WHERE company_id=v_company_id AND booking_enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_unavailable' USING ERRCODE = 'P0001'; END IF;
  SELECT timezone INTO v_timezone FROM public.company_settings WHERE company_id=v_company_id;
  SELECT distribution_mode INTO v_mode FROM public.public_api_integrations WHERE id=p_integration_id;
  IF v_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN
    RAISE EXCEPTION 'subscription_unavailable' USING ERRCODE = 'P0001';
  END IF;

  WITH resources AS (
    SELECT r.resource_type, r.resource_id,
           CASE WHEN r.resource_type='user' THEN p.full_name ELSE t.name END AS name
      FROM public.public_api_integration_resources r
      LEFT JOIN public.profiles p ON r.resource_type='user' AND p.user_id=r.resource_id AND p.company_id=v_company_id AND p.is_active
      LEFT JOIN public.teams t ON r.resource_type='team' AND t.id=r.resource_id AND t.company_id=v_company_id AND COALESCE(t.is_active,true)
     WHERE r.integration_id=p_integration_id AND r.is_active
       AND (p_resource_id IS NULL OR r.resource_id=p_resource_id)
  ), candidates AS (
    SELECT s AS starts_at, s+make_interval(mins=>p_duration_minutes) AS ends_at,
           r.resource_type, r.resource_id, r.name
      FROM generate_series(p_from,p_to-make_interval(mins=>p_duration_minutes),make_interval(mins=>v_settings.slot_interval_minutes)) s
      LEFT JOIN resources r ON v_mode <> 'unassigned'
     WHERE (v_mode='unassigned' OR r.resource_id IS NOT NULL)
  ), available AS (
    SELECT * FROM candidates c WHERE
      CASE WHEN v_mode='unassigned'
        THEN public.public_api_resource_slot_available(v_company_id,'unassigned','00000000-0000-0000-0000-000000000000',c.starts_at,c.ends_at)
        ELSE public.public_api_resource_slot_available(v_company_id,c.resource_type,c.resource_id,c.starts_at,c.ends_at)
      END
  ), shaped AS (
    SELECT DISTINCT ON (starts_at, CASE WHEN v_mode='agent_selects' THEN resource_id END)
      starts_at, ends_at,
      CASE WHEN v_mode='agent_selects' THEN jsonb_build_object('id',resource_id,'type',resource_type,'name',name) ELSE NULL END AS resource
    FROM available ORDER BY starts_at, CASE WHEN v_mode='agent_selects' THEN resource_id END, resource_id
    LIMIT 50
  )
  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('starts_at',starts_at,'ends_at',ends_at,'resource',resource)) ORDER BY starts_at),'[]'::jsonb)
    INTO v_slots FROM shaped;
  RETURN jsonb_build_object('timezone',v_timezone,'slots',v_slots);
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_get_availability(uuid,timestamptz,timestamptz,integer,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_get_availability(uuid,timestamptz,timestamptz,integer,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_customer_summary(p_customer_id uuid, p_integration_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'id', c.id,
    'external_id', (SELECT er.external_id FROM public.public_api_external_refs er WHERE er.integration_id=p_integration_id AND er.resource_type='customer' AND er.resource_id=c.id LIMIT 1),
    'name', c.name,
    'document_last_four', CASE WHEN c.document IS NULL THEN NULL ELSE right(regexp_replace(c.document,'\D','','g'),4) END,
    'phone_last_four', CASE WHEN COALESCE(c.celular,c.phone) IS NULL THEN NULL ELSE right(regexp_replace(COALESCE(c.celular,c.phone),'\D','','g'),4) END
  ) FROM public.customers c WHERE c.id=p_customer_id;
$function$;

REVOKE ALL ON FUNCTION public.public_api_customer_summary(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_customer_summary(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_resolve_customer(p_integration_id uuid,p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company_id uuid; v_ids uuid[]; v_external text; v_document text; v_phone text; v_email text;
BEGIN
  v_company_id:=public.public_api_assert_integration(p_integration_id,'customers:resolve');
  IF jsonb_typeof(p_payload)<>'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('external_id','document','phone','email')) THEN
    RAISE EXCEPTION 'invalid_customer_payload' USING ERRCODE='22023';
  END IF;
  v_external:=NULLIF(btrim(p_payload->>'external_id'),'');
  v_document:=NULLIF(regexp_replace(COALESCE(p_payload->>'document',''),'\D','','g'),'');
  v_phone:=NULLIF(regexp_replace(COALESCE(p_payload->>'phone',''),'\D','','g'),'');
  v_email:=NULLIF(lower(btrim(p_payload->>'email')),'');
  IF v_external IS NOT NULL THEN
    SELECT array_agg(er.resource_id) INTO v_ids FROM public.public_api_external_refs er JOIN public.customers c ON c.id=er.resource_id AND c.company_id=v_company_id AND NOT c.is_deleted
     WHERE er.integration_id=p_integration_id AND er.resource_type='customer' AND er.external_id=v_external;
  END IF;
  IF COALESCE(cardinality(v_ids),0)=0 AND v_document IS NOT NULL THEN
    SELECT array_agg(id) INTO v_ids FROM public.customers WHERE company_id=v_company_id AND NOT is_deleted AND regexp_replace(COALESCE(document,''),'\D','','g')=v_document;
  END IF;
  IF COALESCE(cardinality(v_ids),0)=0 AND v_phone IS NOT NULL THEN
    SELECT array_agg(id) INTO v_ids FROM public.customers
     WHERE company_id=v_company_id AND NOT is_deleted
       AND (regexp_replace(COALESCE(celular,''),'\D','','g')=v_phone
         OR regexp_replace(COALESCE(phone,''),'\D','','g')=v_phone);
  END IF;
  IF COALESCE(cardinality(v_ids),0)=0 AND v_email IS NOT NULL THEN
    SELECT array_agg(id) INTO v_ids FROM public.customers WHERE company_id=v_company_id AND NOT is_deleted AND lower(btrim(COALESCE(email,'')))=v_email;
  END IF;
  IF v_external IS NULL AND v_document IS NULL AND v_phone IS NULL AND v_email IS NULL THEN
    RAISE EXCEPTION 'invalid_customer_payload' USING ERRCODE='22023';
  END IF;
  IF COALESCE(cardinality(v_ids),0)=0 THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('status',404,'code','not_found','title','Cliente nao encontrado','detail','Nenhum cliente corresponde ao identificador informado.')); END IF;
  IF cardinality(v_ids)>1 THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('status',409,'code','ambiguous_customer','title','Cliente ambiguo','detail','Mais de um cliente corresponde ao identificador informado.')); END IF;
  RETURN public.public_api_customer_summary(v_ids[1],p_integration_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_resolve_customer(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_resolve_customer(uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_service_order_response(p_integration_id uuid,p_service_order_id uuid,p_replay boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company_id uuid; v_result jsonb;
BEGIN
  v_company_id:=public.public_api_assert_integration(p_integration_id,NULL);
  SELECT jsonb_build_object(
    'id',so.id,'external_id',CASE WHEN er.external_id LIKE '__internal__:%' THEN NULL ELSE er.external_id END,
    'order_number',so.order_number,'status',so.status,
    'customer',public.public_api_customer_summary(so.customer_id,p_integration_id),
    'scheduled_at',((so.scheduled_date+so.scheduled_time) AT TIME ZONE cs.timezone),
    'duration_minutes',so.duration_minutes,'timezone',cs.timezone,
    'assignment_status',CASE WHEN so.technician_id IS NULL AND so.team_id IS NULL THEN 'assignment_pending' ELSE 'assigned' END,
    'resource',CASE WHEN so.technician_id IS NOT NULL THEN jsonb_build_object('id',so.technician_id,'type','user','name',p.full_name)
                    WHEN so.team_id IS NOT NULL THEN jsonb_build_object('id',so.team_id,'type','team','name',t.name) END,
    'public_tracking_url','https://dominex.app/os-tecnico/'||so.public_short_code||'?modo=cliente',
    'idempotent_replay',p_replay
  ) INTO v_result
  FROM public.service_orders so
  JOIN public.public_api_external_refs er ON er.integration_id=p_integration_id AND er.resource_type='service_order' AND er.resource_id=so.id
  JOIN public.company_settings cs ON cs.company_id=so.company_id
  LEFT JOIN public.profiles p ON p.user_id=so.technician_id AND p.company_id=so.company_id
  LEFT JOIN public.teams t ON t.id=so.team_id AND t.company_id=so.company_id
  WHERE so.id=p_service_order_id AND so.company_id=v_company_id AND so.entry_type='os';
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_service_order_response(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_service_order_response(uuid,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_create_service_order(
  p_integration_id uuid,p_idempotency_key text,p_request_hash text,p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_company_id uuid; v_idem public.public_api_idempotency%ROWTYPE; v_integration public.public_api_integrations%ROWTYPE;
  v_customer jsonb; v_customer_id uuid; v_ids uuid[]; v_external_customer text; v_identity text;
  v_resource jsonb; v_resource_type text; v_resource_id uuid; v_starts timestamptz; v_ends timestamptz; v_duration integer;
  v_timezone text; v_os public.service_orders%ROWTYPE; v_response jsonb; v_external_os text; v_address jsonb; v_customer_type public.customer_type;
BEGIN
  v_company_id:=public.public_api_assert_integration(p_integration_id,'service_orders:create');
  SELECT * INTO v_integration FROM public.public_api_integrations WHERE id=p_integration_id;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 OR p_request_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_idempotency' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_payload)<>'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('external_id','customer','service_type_id','os_type','description','scheduled_at','duration_minutes','resource','service_address')) THEN RAISE EXCEPTION 'invalid_service_order_payload' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('public-api-idempotency:'||p_integration_id::text||':'||p_idempotency_key,0));
  SELECT * INTO v_idem FROM public.public_api_idempotency WHERE integration_id=p_integration_id AND endpoint='create_service_order' AND idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND AND v_idem.expires_at<=now() THEN DELETE FROM public.public_api_idempotency WHERE id=v_idem.id; v_idem:=NULL; END IF;
  IF v_idem.id IS NOT NULL THEN
    IF v_idem.request_hash<>p_request_hash THEN RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='P0001'; END IF;
    IF v_idem.state='completed' THEN RETURN v_idem.response_body||jsonb_build_object('idempotent_replay',true); END IF;
    RAISE EXCEPTION 'request_in_progress' USING ERRCODE='P0001';
  END IF;
  INSERT INTO public.public_api_idempotency(integration_id,endpoint,idempotency_key,request_hash) VALUES(p_integration_id,'create_service_order',p_idempotency_key,p_request_hash) RETURNING * INTO v_idem;

  v_customer:=p_payload->'customer';
  IF jsonb_typeof(v_customer)<>'object' THEN RAISE EXCEPTION 'invalid_customer' USING ERRCODE='22023'; END IF;
  v_external_customer:=NULLIF(btrim(v_customer->>'external_id'),'');
  v_identity:=COALESCE(v_external_customer,NULLIF(regexp_replace(COALESCE(v_customer->>'document',''),'\D','','g'),''),NULLIF(regexp_replace(COALESCE(v_customer->>'phone',''),'\D','','g'),''),NULLIF(lower(btrim(v_customer->>'email')),''));
  IF v_external_customer IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('public-api-customer:external:'||p_integration_id::text||':'||v_external_customer,0));
  END IF;
  IF v_customer ? 'id' THEN
    v_customer_id:=(v_customer->>'id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=v_customer_id AND company_id=v_company_id AND NOT is_deleted) THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0001'; END IF;
  ELSE
    IF v_identity IS NULL THEN RAISE EXCEPTION 'invalid_customer' USING ERRCODE='22023'; END IF;
    -- Todas as identidades presentes sao travadas em ordem fixa. Assim duas
    -- integracoes concorrentes com external_id diferentes, mas o mesmo CPF ou
    -- telefone, nao conseguem criar clientes duplicados.
    IF NULLIF(regexp_replace(COALESCE(v_customer->>'document',''),'\D','','g'),'') IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('public-api-customer:document:'||v_company_id::text||':'||regexp_replace(v_customer->>'document','\D','','g'),0));
    END IF;
    IF NULLIF(regexp_replace(COALESCE(v_customer->>'phone',''),'\D','','g'),'') IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('public-api-customer:phone:'||v_company_id::text||':'||regexp_replace(v_customer->>'phone','\D','','g'),0));
    END IF;
    IF NULLIF(lower(btrim(v_customer->>'email')),'') IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('public-api-customer:email:'||v_company_id::text||':'||lower(btrim(v_customer->>'email')),0));
    END IF;
    IF v_external_customer IS NOT NULL THEN
      SELECT array_agg(er.resource_id) INTO v_ids FROM public.public_api_external_refs er JOIN public.customers c ON c.id=er.resource_id AND c.company_id=v_company_id AND NOT c.is_deleted WHERE er.integration_id=p_integration_id AND er.resource_type='customer' AND er.external_id=v_external_customer;
    END IF;
    IF COALESCE(cardinality(v_ids),0)=0 AND NULLIF(v_customer->>'document','') IS NOT NULL THEN
      SELECT array_agg(id) INTO v_ids FROM public.customers WHERE company_id=v_company_id AND NOT is_deleted AND regexp_replace(COALESCE(document,''),'\D','','g')=regexp_replace(v_customer->>'document','\D','','g');
    END IF;
    IF COALESCE(cardinality(v_ids),0)=0 AND NULLIF(v_customer->>'phone','') IS NOT NULL THEN
      SELECT array_agg(id) INTO v_ids FROM public.customers
       WHERE company_id=v_company_id AND NOT is_deleted
         AND (regexp_replace(COALESCE(celular,''),'\D','','g')=regexp_replace(v_customer->>'phone','\D','','g')
           OR regexp_replace(COALESCE(phone,''),'\D','','g')=regexp_replace(v_customer->>'phone','\D','','g'));
    END IF;
    IF COALESCE(cardinality(v_ids),0)=0 AND NULLIF(v_customer->>'email','') IS NOT NULL THEN
      SELECT array_agg(id) INTO v_ids FROM public.customers WHERE company_id=v_company_id AND NOT is_deleted AND lower(btrim(COALESCE(email,'')))=lower(btrim(v_customer->>'email'));
    END IF;
    IF cardinality(v_ids)>1 THEN RAISE EXCEPTION 'ambiguous_customer' USING ERRCODE='P0001'; END IF;
    v_customer_id:=v_ids[1];
    IF v_customer_id IS NULL THEN
      IF length(btrim(COALESCE(v_customer->>'name','')))<1 THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0001'; END IF;
      v_customer_type:=CASE WHEN length(regexp_replace(COALESCE(v_customer->>'document',''),'\D','','g'))=14 THEN 'pj'::public.customer_type ELSE 'pf'::public.customer_type END;
      INSERT INTO public.customers(company_id,name,customer_type,document,phone,email,origin)
      VALUES(v_company_id,btrim(v_customer->>'name'),v_customer_type,NULLIF(v_customer->>'document',''),NULLIF(v_customer->>'phone',''),NULLIF(v_customer->>'email',''),'public_api') RETURNING id INTO v_customer_id;
    END IF;
  END IF;
  IF v_external_customer IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.public_api_external_refs WHERE integration_id=p_integration_id AND resource_type='customer' AND external_id=v_external_customer AND resource_id<>v_customer_id) THEN RAISE EXCEPTION 'external_id_conflict' USING ERRCODE='P0001'; END IF;
    INSERT INTO public.public_api_external_refs(integration_id,company_id,resource_type,external_id,resource_id)
    VALUES(p_integration_id,v_company_id,'customer',v_external_customer,v_customer_id) ON CONFLICT(integration_id,resource_type,external_id) DO NOTHING;
  END IF;

  v_starts:=(p_payload->>'scheduled_at')::timestamptz; v_duration:=(p_payload->>'duration_minutes')::integer;
  IF v_duration NOT BETWEEN 15 AND 480 THEN RAISE EXCEPTION 'invalid_duration' USING ERRCODE='22023'; END IF; v_ends:=v_starts+make_interval(mins=>v_duration);
  SELECT timezone INTO v_timezone FROM public.company_settings WHERE company_id=v_company_id;
  IF v_timezone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN RAISE EXCEPTION 'subscription_unavailable' USING ERRCODE='P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('public-api-assignment:'||p_integration_id::text||':'||v_starts::text||':'||v_ends::text,0));
  v_resource:=p_payload->'resource';
  IF v_integration.distribution_mode='agent_selects' THEN
    IF jsonb_typeof(v_resource)<>'object' THEN RAISE EXCEPTION 'invalid_resource' USING ERRCODE='P0001'; END IF;
    v_resource_type:=v_resource->>'type'; v_resource_id:=(v_resource->>'id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.public_api_integration_resources WHERE integration_id=p_integration_id AND resource_type=v_resource_type AND resource_id=v_resource_id AND is_active) THEN RAISE EXCEPTION 'invalid_resource' USING ERRCODE='P0001'; END IF;
  ELSIF v_integration.distribution_mode='round_robin' THEN
    SELECT r.resource_type,r.resource_id INTO v_resource_type,v_resource_id FROM public.public_api_integration_resources r
     WHERE r.integration_id=p_integration_id AND r.is_active AND public.public_api_resource_slot_available(v_company_id,r.resource_type,r.resource_id,v_starts,v_ends)
     ORDER BY (SELECT max(br.created_at) FROM public.booking_reservations br WHERE br.company_id=v_company_id AND br.resource_type=r.resource_type AND br.resource_id=r.resource_id) NULLS FIRST,r.resource_id LIMIT 1;
    IF v_resource_id IS NULL THEN RAISE EXCEPTION 'schedule_conflict' USING ERRCODE='P0001'; END IF;
  ELSE v_resource_type:=NULL; v_resource_id:=NULL; END IF;
  IF v_resource_id IS NOT NULL AND NOT public.public_api_resource_slot_available(v_company_id,v_resource_type,v_resource_id,v_starts,v_ends) THEN RAISE EXCEPTION 'schedule_conflict' USING ERRCODE='P0001'; END IF;
  IF v_resource_id IS NULL AND NOT public.public_api_resource_slot_available(v_company_id,'unassigned','00000000-0000-0000-0000-000000000000',v_starts,v_ends) THEN RAISE EXCEPTION 'schedule_conflict' USING ERRCODE='P0001'; END IF;

  v_address:=COALESCE(p_payload->'service_address','{}'::jsonb); v_external_os:=NULLIF(btrim(p_payload->>'external_id'),'');
  IF v_external_os LIKE '__internal__:%' THEN RAISE EXCEPTION 'invalid_service_order_payload' USING ERRCODE='22023'; END IF;
  IF v_external_os IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('public-api-service-order:external:'||p_integration_id::text||':'||v_external_os,0));
  END IF;
  IF NULLIF(p_payload->>'service_type_id','') IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.service_types st WHERE st.id=(p_payload->>'service_type_id')::uuid AND st.company_id=v_company_id AND st.is_active
  ) THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0001'; END IF;
  IF v_external_os IS NOT NULL AND EXISTS(SELECT 1 FROM public.public_api_external_refs WHERE integration_id=p_integration_id AND resource_type='service_order' AND external_id=v_external_os) THEN RAISE EXCEPTION 'external_id_conflict' USING ERRCODE='P0001'; END IF;
  PERFORM set_config('app.booking_source','public_api',true); PERFORM set_config('app.booking_integration_id',p_integration_id::text,true); PERFORM set_config('app.skip_assignee_booking_sync','true',true);
  INSERT INTO public.service_orders(company_id,customer_id,service_type_id,technician_id,team_id,scheduled_date,scheduled_time,duration_minutes,os_type,status,description,origin,entry_type,service_address,service_address_number,service_neighborhood,service_city,service_state,service_zip_code)
  VALUES(v_company_id,v_customer_id,NULLIF(p_payload->>'service_type_id','')::uuid,CASE WHEN v_resource_type='user' THEN v_resource_id END,CASE WHEN v_resource_type='team' THEN v_resource_id END,(v_starts AT TIME ZONE v_timezone)::date,(v_starts AT TIME ZONE v_timezone)::time,v_duration,(p_payload->>'os_type')::public.os_type,'agendada',btrim(p_payload->>'description'),'public_api','os',NULLIF(v_address->>'line1',''),NULLIF(v_address->>'number',''),NULLIF(v_address->>'neighborhood',''),NULLIF(v_address->>'city',''),NULLIF(v_address->>'state',''),NULLIF(v_address->>'postal_code','')) RETURNING * INTO v_os;
  IF v_resource_type='user' THEN INSERT INTO public.service_order_assignees(service_order_id,user_id) VALUES(v_os.id,v_resource_id) ON CONFLICT DO NOTHING;
  ELSIF v_resource_type='team' THEN INSERT INTO public.service_order_assignees(service_order_id,user_id) SELECT v_os.id,tm.user_id FROM public.team_members tm JOIN public.profiles p ON p.user_id=tm.user_id AND p.company_id=v_company_id AND p.is_active WHERE tm.team_id=v_resource_id ON CONFLICT DO NOTHING; END IF;
  INSERT INTO public.public_api_external_refs(integration_id,company_id,resource_type,external_id,resource_id) VALUES(p_integration_id,v_company_id,'service_order',COALESCE(v_external_os,'__internal__:'||v_os.id::text),v_os.id);
  v_response:=public.public_api_service_order_response(p_integration_id,v_os.id,false);
  UPDATE public.public_api_idempotency SET state='completed',response_status=201,response_body=v_response,resource_type='service_order',resource_id=v_os.id,completed_at=now() WHERE id=v_idem.id;
  RETURN v_response;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_create_service_order(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_create_service_order(uuid,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_get_service_order(p_integration_id uuid,p_service_order_id uuid DEFAULT NULL,p_external_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company_id uuid; v_id uuid; v_result jsonb;
BEGIN
  v_company_id:=public.public_api_assert_integration(p_integration_id,'service_orders:read');
  IF (p_service_order_id IS NULL)=(NULLIF(btrim(p_external_id),'') IS NULL) THEN RAISE EXCEPTION 'invalid_identifier' USING ERRCODE='22023'; END IF;
  SELECT er.resource_id INTO v_id FROM public.public_api_external_refs er
   JOIN public.service_orders so ON so.id=er.resource_id AND so.company_id=v_company_id AND so.entry_type='os'
   WHERE er.integration_id=p_integration_id AND er.resource_type='service_order'
     AND ((p_service_order_id IS NOT NULL AND er.resource_id=p_service_order_id) OR (p_service_order_id IS NULL AND er.external_id=btrim(p_external_id)));
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('status',404,'code','not_found','title','OS nao encontrada','detail','A ordem de servico nao existe nesta integracao.')); END IF;
  v_result:=public.public_api_service_order_response(p_integration_id,v_id,false); RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_get_service_order(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_get_service_order(uuid,uuid,text) TO service_role;

-- Helpers internos nao formam superficie RPC. As funcoes SECURITY DEFINER
-- acima os executam como owner; service_role recebe apenas endpoints finais.
REVOKE ALL ON FUNCTION public.public_api_assert_integration(uuid,text) FROM service_role;
REVOKE ALL ON FUNCTION public.public_api_company_is_enabled(uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.public_api_slot_is_available(uuid,text,uuid,timestamptz,timestamptz) FROM service_role;
REVOKE ALL ON FUNCTION public.public_api_resource_slot_available(uuid,text,uuid,timestamptz,timestamptz) FROM service_role;
REVOKE ALL ON FUNCTION public.public_api_customer_summary(uuid,uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.public_api_service_order_response(uuid,uuid,boolean) FROM service_role;

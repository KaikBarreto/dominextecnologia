-- ============================================================================
-- Agenda transacional: [start,end), locks, backfill e override interno auditado
-- ============================================================================

CREATE OR REPLACE FUNCTION public.schedule_sync_service_order_reservations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_timezone text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_slot tstzrange;
  v_resource record;
  v_override_id uuid;
  v_requested_override_id uuid;
  v_override_ids uuid[] := '{}'::uuid[];
  v_override_justification text;
  v_override_valid boolean;
  v_has_conflict boolean;
  v_preserve_non_enforced boolean;
  v_existing_override_id uuid;
  v_existing_source text;
  v_source text;
  v_integration_id uuid;
BEGIN
  UPDATE public.booking_reservations
     SET status = 'cancelled', cancelled_at = now(), updated_at = now()
   WHERE service_order_id = NEW.id AND status = 'active';

  IF NEW.entry_type IS DISTINCT FROM 'os'
     OR NEW.status::text NOT IN ('agendada', 'pendente', 'a_caminho', 'em_andamento', 'pausada')
     OR NEW.scheduled_date IS NULL
     OR NEW.scheduled_time IS NULL
     OR COALESCE(NEW.duration_minutes, 0) <= 0
     OR (NEW.technician_id IS NULL AND NEW.team_id IS NULL) THEN
    RETURN NEW;
  END IF;

  SELECT cs.timezone INTO v_timezone
    FROM public.company_settings cs
   WHERE cs.company_id = NEW.company_id;
  IF v_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_timezone) THEN
    RAISE EXCEPTION 'schedule_company_timezone_invalid' USING ERRCODE = 'P0001';
  END IF;

  v_starts_at := (NEW.scheduled_date + NEW.scheduled_time) AT TIME ZONE v_timezone;
  v_ends_at := v_starts_at + make_interval(mins => NEW.duration_minutes);
  v_slot := tstzrange(v_starts_at, v_ends_at, '[)');
  v_source := COALESCE(NULLIF(current_setting('app.booking_source', true), ''), 'internal');
  v_integration_id := NULLIF(current_setting('app.booking_integration_id', true), '')::uuid;
  v_requested_override_id := NULLIF(current_setting('app.schedule_conflict_override_id', true), '')::uuid;
  v_override_justification := NULLIF(btrim(current_setting('app.schedule_conflict_override_justification', true)), '');
  IF v_override_justification IS NOT NULL THEN
    IF auth.uid() IS NULL
       OR NOT public.has_explicit_public_api_permission(auth.uid(), 'fn:override_schedule_conflict') THEN
      RAISE EXCEPTION 'schedule_override_permission_denied' USING ERRCODE = '42501';
    END IF;
    IF length(v_override_justification) NOT BETWEEN 10 AND 1000 THEN
      RAISE EXCEPTION 'schedule_override_justification_required' USING ERRCODE = '22023';
    END IF;
  END IF;

  FOR v_resource IN
    SELECT DISTINCT resource_type, resource_id
      FROM (
        SELECT 'user'::text, NEW.technician_id
        UNION ALL
        SELECT 'user'::text, soa.user_id
          FROM public.service_order_assignees soa
         WHERE soa.service_order_id = NEW.id
        UNION ALL
        SELECT 'user'::text, tm.user_id
          FROM public.team_members tm
          JOIN public.profiles p ON p.user_id = tm.user_id
         WHERE tm.team_id = NEW.team_id
           AND p.company_id = NEW.company_id
           AND p.is_active
        UNION ALL
        SELECT 'team'::text, NEW.team_id
      ) AS resources(resource_type, resource_id)
     WHERE resource_id IS NOT NULL
     ORDER BY resource_type, resource_id
  LOOP
    v_override_id := v_requested_override_id;
    IF v_resource.resource_type = 'user' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.profiles p
         WHERE p.user_id = v_resource.resource_id
           AND p.company_id = NEW.company_id
           AND p.is_active
      ) THEN
        RAISE EXCEPTION 'schedule_resource_not_in_tenant' USING ERRCODE = 'P0001';
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM public.teams t
         WHERE t.id = v_resource.resource_id
           AND t.company_id = NEW.company_id
           AND COALESCE(t.is_active, true)
      ) THEN
        RAISE EXCEPTION 'schedule_resource_not_in_tenant' USING ERRCODE = 'P0001';
      END IF;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
      'booking:' || NEW.company_id::text || ':' || v_resource.resource_type || ':' || v_resource.resource_id::text,
      0
    ));

    v_override_valid := false;
    v_preserve_non_enforced := false;
    v_existing_override_id := NULL;
    v_existing_source := NULL;
    SELECT true, r.override_id, r.source
      INTO v_preserve_non_enforced, v_existing_override_id, v_existing_source
      FROM public.booking_reservations r
     WHERE r.service_order_id = NEW.id
       AND r.resource_type = v_resource.resource_type
       AND r.resource_id = v_resource.resource_id
       AND NOT r.conflict_enforced
       AND r.slot = v_slot
     LIMIT 1;
    v_preserve_non_enforced := COALESCE(v_preserve_non_enforced, false);
    IF v_override_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.schedule_conflict_overrides o
         WHERE o.id = v_override_id
           AND o.company_id = NEW.company_id
           AND o.service_order_id = NEW.id
           AND (
             (o.resource_type = v_resource.resource_type AND o.resource_id = v_resource.resource_id)
             OR (o.resource_type = 'team' AND o.resource_id = NEW.team_id)
           )
           AND o.requested_slot = v_slot
           AND o.used_at IS NULL
      ) INTO v_override_valid;
    END IF;

    SELECT (
      EXISTS (
        SELECT 1 FROM public.booking_reservations r
         WHERE r.company_id = NEW.company_id
           AND r.resource_type = v_resource.resource_type
           AND r.resource_id = v_resource.resource_id
           AND r.status = 'active'
           AND r.service_order_id <> NEW.id
           AND r.slot && v_slot
      )
      OR EXISTS (
        SELECT 1 FROM public.schedule_booking_exceptions e
         WHERE e.company_id = NEW.company_id
           AND NOT e.is_available
           AND tstzrange(e.starts_at, e.ends_at, '[)') && v_slot
      )
    ) INTO v_has_conflict;

    IF NOT v_override_valid AND NOT v_preserve_non_enforced AND v_has_conflict THEN
      IF v_override_justification IS NULL THEN
        RAISE EXCEPTION 'public_api_schedule_conflict' USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO public.schedule_conflict_overrides (
        company_id, service_order_id, resource_type, resource_id,
        requested_slot, justification, authorized_by
      ) VALUES (
        NEW.company_id, NEW.id, v_resource.resource_type, v_resource.resource_id,
        v_slot, v_override_justification, auth.uid()
      ) RETURNING id INTO v_override_id;
      v_override_valid := true;
    END IF;

    IF v_override_valid AND v_override_id IS NOT NULL THEN
      v_override_ids := array_append(v_override_ids, v_override_id);
    END IF;

    INSERT INTO public.booking_reservations (
      company_id, service_order_id, integration_id,
      resource_type, resource_id, slot, status, source,
      conflict_enforced, override_id, cancelled_at, updated_at
    ) VALUES (
      NEW.company_id, NEW.id, v_integration_id,
      v_resource.resource_type, v_resource.resource_id, v_slot, 'active',
      CASE WHEN v_preserve_non_enforced THEN v_existing_source ELSE v_source END,
      NOT (v_override_valid OR v_preserve_non_enforced),
      CASE WHEN v_override_valid THEN v_override_id WHEN v_preserve_non_enforced THEN v_existing_override_id END,
      NULL, now()
    )
    ON CONFLICT (service_order_id, resource_type, resource_id)
    DO UPDATE SET
      company_id = EXCLUDED.company_id,
      integration_id = EXCLUDED.integration_id,
      slot = EXCLUDED.slot,
      status = 'active',
      source = EXCLUDED.source,
      conflict_enforced = EXCLUDED.conflict_enforced,
      override_id = EXCLUDED.override_id,
      cancelled_at = NULL,
      updated_at = now();

  END LOOP;
  IF cardinality(v_override_ids) > 0 THEN
    UPDATE public.schedule_conflict_overrides SET used_at = now() WHERE id = ANY(v_override_ids);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_sync_service_order_reservations() FROM PUBLIC, anon, authenticated;

-- Backfill deliberadamente fora da exclusion: sobreposicoes historicas sao
-- preservadas. A checagem sob advisory lock olha estas linhas e impede que uma
-- nova reserva atravesse um legado.
WITH tenant_timezones AS (
  SELECT c.id AS company_id,
         CASE WHEN EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = cs.timezone)
              THEN cs.timezone ELSE 'UTC' END AS timezone
    FROM public.companies c
    LEFT JOIN public.company_settings cs ON cs.company_id = c.id
), existing_slots AS (
  SELECT so.id AS service_order_id, so.company_id, resources.resource_type, resources.resource_id,
         tstzrange(
           (so.scheduled_date + so.scheduled_time) AT TIME ZONE tz.timezone,
           ((so.scheduled_date + so.scheduled_time) AT TIME ZONE tz.timezone)
             + make_interval(mins => greatest(so.duration_minutes, 1)),
           '[)'
         ) AS slot
    FROM public.service_orders so
    JOIN tenant_timezones tz ON tz.company_id = so.company_id
    CROSS JOIN LATERAL (
      SELECT 'user'::text AS resource_type, so.technician_id AS resource_id
      UNION
      SELECT 'user'::text, soa.user_id
        FROM public.service_order_assignees soa
       WHERE soa.service_order_id = so.id
      UNION
      SELECT 'user'::text, tm.user_id
        FROM public.team_members tm
        JOIN public.profiles p ON p.user_id = tm.user_id AND p.company_id = so.company_id AND p.is_active
       WHERE tm.team_id = so.team_id
      UNION
      SELECT 'team'::text, so.team_id
    ) AS resources
   WHERE so.entry_type = 'os'
     AND so.status::text IN ('agendada', 'pendente', 'a_caminho', 'em_andamento', 'pausada')
     AND so.scheduled_date IS NOT NULL
     AND so.scheduled_time IS NOT NULL
     AND resources.resource_id IS NOT NULL
)
INSERT INTO public.booking_reservations (
  company_id, service_order_id, resource_type, resource_id, slot,
  status, source, conflict_enforced
)
SELECT company_id, service_order_id, resource_type, resource_id, slot,
       'active', 'legacy_backfill', false
  FROM existing_slots
ON CONFLICT (service_order_id, resource_type, resource_id) DO NOTHING;

CREATE TRIGGER sync_service_order_booking_reservations
AFTER INSERT OR UPDATE OF
  scheduled_date, scheduled_time, duration_minutes, status,
  technician_id, team_id, entry_type, company_id
ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.schedule_sync_service_order_reservations();

CREATE OR REPLACE FUNCTION public.schedule_resync_from_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF current_setting('app.skip_assignee_booking_sync', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.service_orders
     SET technician_id = technician_id
   WHERE id = COALESCE(NEW.service_order_id, OLD.service_order_id);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE TRIGGER sync_booking_after_service_order_assignee
AFTER INSERT OR UPDATE OR DELETE ON public.service_order_assignees
FOR EACH ROW EXECUTE FUNCTION public.schedule_resync_from_assignee();

REVOKE ALL ON FUNCTION public.schedule_resync_from_assignee() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.schedule_book_service_order(
  p_service_order_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_override_justification text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_timezone text;
  v_status text;
  v_override_id uuid;
  v_reservation public.booking_reservations%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'schedule_auth_required' USING ERRCODE = '42501'; END IF;
  IF p_resource_type NOT IN ('technician', 'user', 'team') OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_starts_at >= p_ends_at THEN
    RAISE EXCEPTION 'schedule_invalid_request' USING ERRCODE = '22023';
  END IF;
  IF extract(epoch FROM (p_ends_at - p_starts_at)) / 60 NOT BETWEEN 15 AND 480
     OR mod(extract(epoch FROM (p_ends_at - p_starts_at))::integer, 60) <> 0 THEN
    RAISE EXCEPTION 'schedule_invalid_duration' USING ERRCODE = '22023';
  END IF;

  SELECT so.company_id, so.status::text INTO v_company_id, v_status
    FROM public.service_orders so
   WHERE so.id = p_service_order_id
     AND so.company_id = public.get_user_company_id(v_user_id)
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'schedule_service_order_not_found' USING ERRCODE = 'P0001'; END IF;
  IF v_status NOT IN ('agendada', 'pendente', 'a_caminho', 'em_andamento', 'pausada') THEN
    RAISE EXCEPTION 'schedule_service_order_status_not_bookable' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.tenant_subscription_allows_access(v_company_id) THEN
    RAISE EXCEPTION 'schedule_tenant_not_entitled' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.is_admin_or_gestor(v_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
       WHERE up.user_id = v_user_id AND up.is_active
         AND (up.permissions ? '*' OR up.permissions ? 'fn:edit_os')
    )
  ) THEN
    RAISE EXCEPTION 'schedule_edit_permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT cs.timezone INTO v_timezone FROM public.company_settings cs WHERE cs.company_id = v_company_id;
  IF v_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_timezone) THEN
    RAISE EXCEPTION 'schedule_company_timezone_invalid' USING ERRCODE = 'P0001';
  END IF;

  p_resource_type := CASE WHEN p_resource_type = 'technician' THEN 'user' ELSE p_resource_type END;
  IF p_resource_type = 'team' AND NOT EXISTS (
    SELECT 1 FROM public.team_members tm
    JOIN public.profiles p ON p.user_id = tm.user_id
    WHERE tm.team_id = p_resource_id AND p.company_id = v_company_id AND p.is_active
  ) THEN
    RAISE EXCEPTION 'schedule_team_without_active_members' USING ERRCODE = 'P0001';
  END IF;

  -- Retry semantico: reagendar para o mesmo recurso/slot devolve a reserva
  -- existente e nao cria uma segunda autorizacao de override.
  SELECT * INTO v_reservation
    FROM public.booking_reservations
   WHERE service_order_id = p_service_order_id
     AND resource_type = p_resource_type
     AND resource_id = p_resource_id
     AND status = 'active'
     AND slot = tstzrange(p_starts_at, p_ends_at, '[)');
  IF FOUND THEN
    RETURN jsonb_build_object(
      'service_order_id', p_service_order_id,
      'reservation_id', v_reservation.id,
      'resource_type', p_resource_type,
      'resource_id', p_resource_id,
      'starts_at', lower(v_reservation.slot),
      'ends_at', upper(v_reservation.slot),
      'overridden', v_reservation.override_id IS NOT NULL,
      'override_id', v_reservation.override_id
    );
  END IF;

  IF p_override_justification IS NOT NULL THEN
    IF NOT public.has_explicit_public_api_permission(v_user_id, 'fn:override_schedule_conflict') THEN
      RAISE EXCEPTION 'schedule_override_permission_denied' USING ERRCODE = '42501';
    END IF;
    IF length(btrim(p_override_justification)) < 10 THEN
      RAISE EXCEPTION 'schedule_override_justification_required' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.schedule_conflict_overrides (
      company_id, service_order_id, resource_type, resource_id,
      requested_slot, justification, authorized_by
    ) VALUES (
      v_company_id, p_service_order_id, p_resource_type, p_resource_id,
      tstzrange(p_starts_at, p_ends_at, '[)'), btrim(p_override_justification), v_user_id
    ) RETURNING id INTO v_override_id;
    PERFORM set_config('app.schedule_conflict_override_id', v_override_id::text, true);
  END IF;
  PERFORM set_config('app.booking_source', 'internal', true);
  PERFORM set_config('app.skip_assignee_booking_sync', 'true', true);

  DELETE FROM public.service_order_assignees WHERE service_order_id = p_service_order_id;
  IF p_resource_type = 'user' THEN
    INSERT INTO public.service_order_assignees (service_order_id, user_id)
    VALUES (p_service_order_id, p_resource_id)
    ON CONFLICT (service_order_id, user_id) DO NOTHING;
  ELSE
    INSERT INTO public.service_order_assignees (service_order_id, user_id)
    SELECT p_service_order_id, tm.user_id
      FROM public.team_members tm
      JOIN public.profiles p ON p.user_id = tm.user_id
     WHERE tm.team_id = p_resource_id AND p.company_id = v_company_id AND p.is_active
    ON CONFLICT (service_order_id, user_id) DO NOTHING;
  END IF;

  UPDATE public.service_orders SET
    scheduled_date = (p_starts_at AT TIME ZONE v_timezone)::date,
    scheduled_time = (p_starts_at AT TIME ZONE v_timezone)::time,
    duration_minutes = (extract(epoch FROM (p_ends_at - p_starts_at)) / 60)::integer,
    technician_id = CASE WHEN p_resource_type = 'user' THEN p_resource_id END,
    team_id = CASE WHEN p_resource_type = 'team' THEN p_resource_id END,
    updated_at = now()
  WHERE id = p_service_order_id;

  SELECT * INTO v_reservation
    FROM public.booking_reservations
   WHERE service_order_id = p_service_order_id
     AND resource_type = p_resource_type
     AND resource_id = p_resource_id
     AND status = 'active';

  RETURN jsonb_build_object(
    'service_order_id', p_service_order_id,
    'reservation_id', v_reservation.id,
    'resource_type', p_resource_type,
    'resource_id', p_resource_id,
    'starts_at', lower(v_reservation.slot),
    'ends_at', upper(v_reservation.slot),
    'overridden', v_override_id IS NOT NULL,
    'override_id', v_override_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_book_service_order(uuid, text, uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.schedule_book_service_order(uuid, text, uuid, timestamptz, timestamptz, text) TO authenticated;

COMMENT ON FUNCTION public.schedule_book_service_order(uuid, text, uuid, timestamptz, timestamptz, text) IS
  'Atualiza horario e um unico user/team atomicamente, preservando o status bloqueador atual e sincronizando service_order_assignees. Equipe reserva todos os membros ativos sob locks determinísticos. Conflito reverte tudo. Override exige fn:override_schedule_conflict explicita e justificativa; service_role/API publica nao executa.';

-- Criacao interna com override precisa nascer na mesma transacao da OS, dos
-- assignees e da reserva. A API publica nunca recebe EXECUTE nesta funcao.
CREATE OR REPLACE FUNCTION public.schedule_create_service_order_with_override(
  p_order jsonb,
  p_override_justification text,
  p_equipment_items jsonb DEFAULT '[]'::jsonb,
  p_assignee_user_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_order public.service_orders%ROWTYPE;
  v_item jsonb;
  v_equipment_id uuid;
  v_form_template_id uuid;
  v_team_id uuid := NULLIF(p_order->>'team_id', '')::uuid;
  v_technician_id uuid := NULLIF(p_order->>'technician_id', '')::uuid;
  v_duration integer := COALESCE(NULLIF(p_order->>'duration_minutes', '')::integer, 120);
  v_status text := COALESCE(NULLIF(p_order->>'status', ''), 'pendente');
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'schedule_auth_required' USING ERRCODE = '42501'; END IF;
  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL OR NOT public.tenant_subscription_allows_access(v_company_id) THEN
    RAISE EXCEPTION 'schedule_tenant_not_entitled' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.is_admin_or_gestor(v_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
       WHERE up.user_id = v_user_id AND up.is_active
         AND (up.permissions ? '*' OR up.permissions ? 'fn:create_os')
    )
  ) THEN RAISE EXCEPTION 'schedule_create_permission_denied' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_explicit_public_api_permission(v_user_id, 'fn:override_schedule_conflict') THEN
    RAISE EXCEPTION 'schedule_override_permission_denied' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_override_justification, ''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'schedule_override_justification_required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_order) <> 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_order) key
     WHERE key NOT IN (
       'customer_id','equipment_id','technician_id','team_id','os_type','service_type_id','status',
       'scheduled_date','scheduled_time','duration_minutes','description','notes','form_template_id',
       'require_tech_signature','require_client_signature','generate_nps_survey',
       'service_address','service_address_number','service_neighborhood','service_city','service_state',
       'service_zip_code','service_latitude','service_longitude','lead_id','show_in_schedule'
     )
  ) THEN RAISE EXCEPTION 'schedule_invalid_order_payload' USING ERRCODE = '22023'; END IF;
  IF NULLIF(p_order->>'customer_id', '') IS NULL
     OR NULLIF(p_order->>'scheduled_date', '') IS NULL
     OR NULLIF(p_order->>'scheduled_time', '') IS NULL
     OR (v_team_id IS NULL AND v_technician_id IS NULL)
     OR v_duration NOT BETWEEN 15 AND 480
     OR v_status NOT IN ('agendada','pendente','a_caminho','em_andamento','pausada') THEN
    RAISE EXCEPTION 'schedule_invalid_order_payload' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = (p_order->>'customer_id')::uuid AND c.company_id = v_company_id AND NOT c.is_deleted
  ) THEN RAISE EXCEPTION 'schedule_customer_not_found' USING ERRCODE = 'P0001'; END IF;
  IF v_team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.teams t WHERE t.id = v_team_id AND t.company_id = v_company_id AND COALESCE(t.is_active, true)
  ) THEN RAISE EXCEPTION 'schedule_resource_not_in_tenant' USING ERRCODE = 'P0001'; END IF;
  IF v_team_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = v_technician_id AND p.company_id = v_company_id AND p.is_active
  ) THEN RAISE EXCEPTION 'schedule_resource_not_in_tenant' USING ERRCODE = 'P0001'; END IF;
  IF NULLIF(p_order->>'equipment_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.equipment e WHERE e.id = (p_order->>'equipment_id')::uuid AND e.company_id = v_company_id
  ) THEN RAISE EXCEPTION 'schedule_equipment_not_found' USING ERRCODE = 'P0001'; END IF;
  IF NULLIF(p_order->>'service_type_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_types st WHERE st.id = (p_order->>'service_type_id')::uuid AND st.company_id = v_company_id AND st.is_active
  ) THEN RAISE EXCEPTION 'schedule_service_type_not_found' USING ERRCODE = 'P0001'; END IF;
  IF NULLIF(p_order->>'form_template_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.form_templates ft WHERE ft.id = (p_order->>'form_template_id')::uuid AND ft.company_id = v_company_id
  ) THEN RAISE EXCEPTION 'schedule_form_template_not_found' USING ERRCODE = 'P0001'; END IF;
  IF NULLIF(p_order->>'lead_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = (p_order->>'lead_id')::uuid AND l.company_id = v_company_id
  ) THEN RAISE EXCEPTION 'schedule_lead_not_found' USING ERRCODE = 'P0001'; END IF;

  PERFORM set_config('app.booking_source', 'internal', true);
  PERFORM set_config('app.schedule_conflict_override_justification', btrim(p_override_justification), true);

  INSERT INTO public.service_orders (
    company_id, customer_id, equipment_id, technician_id, team_id, os_type, service_type_id, status,
    scheduled_date, scheduled_time, duration_minutes, description, notes, form_template_id,
    require_tech_signature, require_client_signature, generate_nps_survey,
    service_address, service_address_number, service_neighborhood, service_city, service_state,
    service_zip_code, service_latitude, service_longitude, lead_id, show_in_schedule,
    created_by, origin, entry_type
  ) VALUES (
    v_company_id, (p_order->>'customer_id')::uuid, NULLIF(p_order->>'equipment_id', '')::uuid,
    CASE WHEN v_team_id IS NULL THEN v_technician_id END, v_team_id,
    COALESCE(NULLIF(p_order->>'os_type', ''), 'manutencao_corretiva')::public.os_type,
    NULLIF(p_order->>'service_type_id', '')::uuid, v_status::public.os_status,
    (p_order->>'scheduled_date')::date, (p_order->>'scheduled_time')::time, v_duration,
    NULLIF(p_order->>'description', ''), NULLIF(p_order->>'notes', ''), NULLIF(p_order->>'form_template_id', '')::uuid,
    COALESCE((p_order->>'require_tech_signature')::boolean, false),
    COALESCE((p_order->>'require_client_signature')::boolean, false),
    NULLIF(p_order->>'generate_nps_survey', '')::boolean,
    NULLIF(p_order->>'service_address', ''), NULLIF(p_order->>'service_address_number', ''),
    NULLIF(p_order->>'service_neighborhood', ''), NULLIF(p_order->>'service_city', ''),
    NULLIF(p_order->>'service_state', ''), NULLIF(p_order->>'service_zip_code', ''),
    NULLIF(p_order->>'service_latitude', '')::double precision,
    NULLIF(p_order->>'service_longitude', '')::double precision,
    NULLIF(p_order->>'lead_id', '')::uuid, COALESCE((p_order->>'show_in_schedule')::boolean, true),
    v_user_id, 'manual', 'os'
  ) RETURNING * INTO v_order;

  IF jsonb_typeof(COALESCE(p_equipment_items, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_equipment_items, '[]'::jsonb)) > 100 THEN
    RAISE EXCEPTION 'schedule_invalid_equipment_items' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_equipment_items, '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_item) key WHERE key NOT IN ('equipment_id','form_template_id')) THEN
      RAISE EXCEPTION 'schedule_invalid_equipment_items' USING ERRCODE = '22023';
    END IF;
    v_equipment_id := NULLIF(v_item->>'equipment_id', '')::uuid;
    v_form_template_id := NULLIF(v_item->>'form_template_id', '')::uuid;
    IF v_equipment_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.equipment e WHERE e.id = v_equipment_id AND e.company_id = v_company_id
    ) THEN RAISE EXCEPTION 'schedule_equipment_not_found' USING ERRCODE = 'P0001'; END IF;
    IF v_form_template_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.form_templates ft WHERE ft.id = v_form_template_id AND ft.company_id = v_company_id
    ) THEN RAISE EXCEPTION 'schedule_form_template_not_found' USING ERRCODE = 'P0001'; END IF;
    INSERT INTO public.service_order_equipment (service_order_id, equipment_id, form_template_id)
    VALUES (v_order.id, v_equipment_id, v_form_template_id);
  END LOOP;

  IF cardinality(COALESCE(p_assignee_user_ids, '{}'::uuid[])) > 100
     OR EXISTS (
       SELECT 1 FROM unnest(COALESCE(p_assignee_user_ids, '{}'::uuid[])) candidate
        WHERE NOT EXISTS (
          SELECT 1 FROM public.profiles p
           WHERE p.user_id = candidate AND p.company_id = v_company_id AND p.is_active
        )
     ) THEN RAISE EXCEPTION 'schedule_resource_not_in_tenant' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.service_order_assignees (service_order_id, user_id)
  SELECT v_order.id, candidate
    FROM unnest(COALESCE(p_assignee_user_ids, '{}'::uuid[])) candidate
  ON CONFLICT (service_order_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'status', v_order.status);
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_create_service_order_with_override(jsonb,text,jsonb,uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.schedule_create_service_order_with_override(jsonb,text,jsonb,uuid[]) TO authenticated;

COMMENT ON FUNCTION public.schedule_create_service_order_with_override(jsonb,text,jsonb,uuid[]) IS
  'Cria OS interna, equipamentos, assignees, overrides auditados e reservas na mesma transacao. Exige fn:override_schedule_conflict explicita; nunca executavel pela API publica/service_role.';

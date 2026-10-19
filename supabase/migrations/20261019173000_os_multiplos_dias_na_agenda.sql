-- Jornadas da OS: uma única ordem pode ocupar datas, horários e durações
-- diferentes. A API Pública continua usando somente a jornada canônica de um
-- dia; o plano detalhado e os RPCs abaixo pertencem ao fluxo interno.

CREATE OR REPLACE FUNCTION public.schedule_plan_is_valid(p_plan jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_item jsonb;
  v_date date;
  v_time time;
  v_duration integer;
  v_seen_dates date[] := '{}'::date[];
  v_previous_date date;
BEGIN
  IF jsonb_typeof(p_plan) <> 'array' OR jsonb_array_length(p_plan) > 31 THEN
    RETURN false;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_plan)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR NOT (v_item ? 'date' AND v_item ? 'time' AND v_item ? 'duration_minutes')
       OR (v_item->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
       OR (v_item->>'time') !~ '^\d{2}:\d{2}(:\d{2})?$' THEN
      RETURN false;
    END IF;

    BEGIN
      v_date := (v_item->>'date')::date;
      v_time := (v_item->>'time')::time;
      v_duration := (v_item->>'duration_minutes')::integer;
    EXCEPTION WHEN OTHERS THEN
      RETURN false;
    END;

    IF v_duration NOT BETWEEN 15 AND 480
       OR v_date = ANY(v_seen_dates)
       OR (v_previous_date IS NOT NULL AND v_date <= v_previous_date) THEN
      RETURN false;
    END IF;
    v_seen_dates := array_append(v_seen_dates, v_date);
    v_previous_date := v_date;
  END LOOP;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_plan_is_valid(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_plan_is_valid(jsonb) TO authenticated;

ALTER TABLE public.service_orders
  ADD COLUMN schedule_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN scheduled_days integer GENERATED ALWAYS AS (
    greatest(jsonb_array_length(schedule_plan), 1)
  ) STORED;

ALTER TABLE public.service_orders
  ADD CONSTRAINT service_orders_schedule_plan_check
  CHECK (public.schedule_plan_is_valid(schedule_plan));

COMMENT ON COLUMN public.service_orders.schedule_plan IS
  'Jornadas internas da OS: array de {date,time,duration_minutes}, com no máximo uma jornada por data.';
COMMENT ON COLUMN public.service_orders.scheduled_days IS
  'Quantidade derivada de jornadas da OS; vale 1 para planos legados/vazios.';

-- Uma reserva por recurso já não basta: cada jornada precisa do próprio range
-- para não bloquear a noite entre dois dias de atendimento.
ALTER TABLE public.booking_reservations
  ADD COLUMN slot_index integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT booking_reservations_slot_index_check CHECK (slot_index BETWEEN 0 AND 30);

-- A constraint original não recebeu nome explícito e o PostgreSQL pode truncar
-- o identificador gerado. Localizamos pela definição para não depender desse
-- nome físico.
DO $block$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT c.conname
    INTO v_constraint_name
    FROM pg_constraint c
   WHERE c.conrelid = 'public.booking_reservations'::regclass
     AND c.contype = 'u'
     AND (
       SELECT array_agg(a.attname ORDER BY key_column.ordinality)
         FROM unnest(c.conkey) WITH ORDINALITY AS key_column(attnum, ordinality)
         JOIN pg_attribute a
           ON a.attrelid = c.conrelid
          AND a.attnum = key_column.attnum
     ) = ARRAY['service_order_id', 'resource_type', 'resource_id']::name[]
   LIMIT 1;

  IF v_constraint_name IS NULL THEN
    RAISE EXCEPTION 'booking_reservations_resource_unique_not_found';
  END IF;

  EXECUTE format(
    'ALTER TABLE public.booking_reservations DROP CONSTRAINT %I',
    v_constraint_name
  );
END;
$block$;

ALTER TABLE public.booking_reservations
  ADD CONSTRAINT booking_reservations_order_resource_slot_key
  UNIQUE (service_order_id, resource_type, resource_id, slot_index);

CREATE OR REPLACE FUNCTION public.schedule_sync_service_order_reservations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_timezone text;
  v_plan jsonb;
  v_plan_context text;
  v_slot_item jsonb;
  v_slot_index integer := -1;
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

  v_plan_context := NULLIF(current_setting('app.schedule_plan', true), '');
  v_plan := CASE WHEN v_plan_context IS NOT NULL THEN v_plan_context::jsonb ELSE NEW.schedule_plan END;
  IF v_plan = '[]'::jsonb THEN
    v_plan := jsonb_build_array(jsonb_build_object(
      'date', NEW.scheduled_date,
      'time', NEW.scheduled_time,
      'duration_minutes', NEW.duration_minutes
    ));
  END IF;
  IF NOT public.schedule_plan_is_valid(v_plan) OR jsonb_array_length(v_plan) = 0 THEN
    RAISE EXCEPTION 'schedule_invalid_plan' USING ERRCODE = '22023';
  END IF;

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

  FOR v_slot_item IN SELECT value FROM jsonb_array_elements(v_plan)
  LOOP
    v_slot_index := v_slot_index + 1;
    v_starts_at := (((v_slot_item->>'date')::date + (v_slot_item->>'time')::time) AT TIME ZONE v_timezone);
    v_ends_at := v_starts_at + make_interval(mins => (v_slot_item->>'duration_minutes')::integer);
    v_slot := tstzrange(v_starts_at, v_ends_at, '[)');

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
         AND r.slot_index = v_slot_index
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
        resource_type, resource_id, slot_index, slot, status, source,
        conflict_enforced, override_id, cancelled_at, updated_at
      ) VALUES (
        NEW.company_id, NEW.id, v_integration_id,
        v_resource.resource_type, v_resource.resource_id, v_slot_index, v_slot, 'active',
        CASE WHEN v_preserve_non_enforced THEN v_existing_source ELSE v_source END,
        NOT (v_override_valid OR v_preserve_non_enforced),
        CASE WHEN v_override_valid THEN v_override_id WHEN v_preserve_non_enforced THEN v_existing_override_id END,
        NULL, now()
      )
      ON CONFLICT (service_order_id, resource_type, resource_id, slot_index)
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
  END LOOP;

  IF cardinality(v_override_ids) > 0 THEN
    UPDATE public.schedule_conflict_overrides SET used_at = now() WHERE id = ANY(v_override_ids);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER sync_service_order_booking_reservations ON public.service_orders;
CREATE TRIGGER sync_service_order_booking_reservations
AFTER INSERT OR UPDATE OF
  scheduled_date, scheduled_time, duration_minutes, schedule_plan, status,
  technician_id, team_id, entry_type, company_id
ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.schedule_sync_service_order_reservations();

CREATE OR REPLACE FUNCTION public.schedule_book_service_order_plan(
  p_service_order_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_schedule_plan jsonb,
  p_override_justification text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_result jsonb;
  v_first jsonb;
  v_duration integer;
BEGIN
  IF NOT public.schedule_plan_is_valid(p_schedule_plan) OR jsonb_array_length(p_schedule_plan) = 0 THEN
    RAISE EXCEPTION 'schedule_invalid_plan' USING ERRCODE = '22023';
  END IF;
  v_first := p_schedule_plan->0;
  v_duration := (v_first->>'duration_minutes')::integer;

  PERFORM set_config('app.schedule_plan', p_schedule_plan::text, true);
  IF p_override_justification IS NOT NULL THEN
    PERFORM set_config('app.schedule_conflict_override_justification', btrim(p_override_justification), true);
  END IF;

  v_result := public.schedule_book_service_order(
    p_service_order_id,
    p_resource_type,
    p_resource_id,
    p_starts_at,
    p_starts_at + make_interval(mins => v_duration),
    NULL
  );

  UPDATE public.service_orders
     SET schedule_plan = p_schedule_plan,
         scheduled_date = (v_first->>'date')::date,
         scheduled_time = (v_first->>'time')::time,
         duration_minutes = v_duration,
         updated_at = now()
   WHERE id = p_service_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'schedule_service_order_not_found' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_result || jsonb_build_object('schedule_plan', p_schedule_plan);
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_book_service_order_plan(uuid,text,uuid,timestamptz,jsonb,text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.schedule_book_service_order_plan(uuid,text,uuid,timestamptz,jsonb,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.schedule_create_service_order_plan_with_override(
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
  v_result jsonb;
  v_service_order_id uuid;
  v_plan jsonb := COALESCE(p_order->'schedule_plan', '[]'::jsonb);
  v_first jsonb;
BEGIN
  IF NOT public.schedule_plan_is_valid(v_plan) OR jsonb_array_length(v_plan) = 0 THEN
    RAISE EXCEPTION 'schedule_invalid_order_payload' USING ERRCODE = '22023';
  END IF;
  v_first := v_plan->0;
  PERFORM set_config('app.schedule_plan', v_plan::text, true);

  v_result := public.schedule_create_service_order_with_override(
    (p_order - 'schedule_plan' - 'scheduled_days') || jsonb_build_object(
      'scheduled_date', v_first->>'date',
      'scheduled_time', v_first->>'time',
      'duration_minutes', (v_first->>'duration_minutes')::integer
    ),
    p_override_justification,
    p_equipment_items,
    p_assignee_user_ids
  );

  v_service_order_id := NULLIF(v_result->>'id', '')::uuid;
  IF v_service_order_id IS NULL THEN
    RAISE EXCEPTION 'schedule_service_order_not_found' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.service_orders
     SET schedule_plan = v_plan,
         scheduled_date = (v_first->>'date')::date,
         scheduled_time = (v_first->>'time')::time,
         duration_minutes = (v_first->>'duration_minutes')::integer,
         updated_at = now()
   WHERE id = v_service_order_id;

  RETURN v_result || jsonb_build_object('schedule_plan', v_plan);
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_create_service_order_plan_with_override(jsonb,text,jsonb,uuid[])
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.schedule_create_service_order_plan_with_override(jsonb,text,jsonb,uuid[])
  TO authenticated;

COMMENT ON FUNCTION public.schedule_book_service_order_plan(uuid,text,uuid,timestamptz,jsonb,text) IS
  'Reagenda atomicamente o plano interno de jornadas de uma OS, com conflito e override por jornada.';
COMMENT ON FUNCTION public.schedule_create_service_order_plan_with_override(jsonb,text,jsonb,uuid[]) IS
  'Cria com override auditado uma OS interna com jornadas independentes; não é executável pela API pública/service_role.';

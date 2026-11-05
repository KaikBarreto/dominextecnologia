-- Jornadas internas de OS podem ocupar até um dia completo. A API Pública
-- permanece limitada a 480 minutos pelo contrato próprio de disponibilidade.

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

    IF v_duration NOT BETWEEN 15 AND 1440
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

-- Os RPCs abaixo são exclusivos do fluxo autenticado interno. Reaproveitamos
-- a definição vigente para preservar as validações de tenant, permissão,
-- conflito e auditoria, substituindo somente o teto de duração.
DO $block$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated_definition text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.schedule_book_service_order(uuid,text,uuid,timestamptz,timestamptz,text)'::regprocedure,
    'public.schedule_create_service_order_with_override(jsonb,text,jsonb,uuid[])'::regprocedure
  ]
  LOOP
    SELECT pg_get_functiondef(v_signature) INTO v_definition;
    IF strpos(v_definition, 'BETWEEN 15 AND 480') = 0 THEN
      RAISE EXCEPTION 'internal_schedule_duration_guard_not_found: %', v_signature::text;
    END IF;

    v_updated_definition := replace(
      v_definition,
      'BETWEEN 15 AND 480',
      'BETWEEN 15 AND 1440'
    );
    EXECUTE v_updated_definition;
  END LOOP;
END;
$block$;

COMMENT ON FUNCTION public.schedule_plan_is_valid(jsonb) IS
  'Valida jornadas internas da OS, com duracao entre 15 minutos e 24 horas por data.';

BEGIN;

-- A assinatura dos argumentos permanece igual, mas a resposta passa a trazer
-- contagens. PostgreSQL exige recriar a função quando o RETURNS TABLE muda.
DROP FUNCTION IF EXISTS public.get_schedule_calendar_indicators(date, date, uuid, uuid[], uuid);

CREATE FUNCTION public.get_schedule_calendar_indicators(
  p_start_date date,
  p_end_date date,
  p_customer_id uuid DEFAULT NULL,
  p_equipment_ids uuid[] DEFAULT NULL,
  p_exclude_service_order_id uuid DEFAULT NULL
)
RETURNS TABLE (
  schedule_date date,
  has_contract_occurrence boolean,
  has_service_order boolean,
  contract_occurrence_matches_equipment boolean,
  service_order_matches_equipment boolean,
  contract_occurrence_count integer,
  service_order_count integer,
  contract_occurrence_equipment_count integer,
  service_order_equipment_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'invalid_schedule_calendar_range'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_end_date - p_start_date > 62 THEN
    RAISE EXCEPTION 'schedule_calendar_range_too_large'
      USING ERRCODE = 'program_limit_exceeded';
  END IF;

  RETURN QUERY
  WITH candidate_orders AS (
    SELECT
      so.id,
      so.contract_id,
      so.origin,
      so.contract_reference_date,
      so.contract_visit_customized_at,
      so.customer_id,
      so.scheduled_date,
      so.schedule_plan,
      (
        COALESCE(cardinality(p_equipment_ids), 0) > 0
        AND (
          so.equipment_id = ANY(p_equipment_ids)
          OR EXISTS (
            SELECT 1
            FROM public.service_order_equipment soe
            WHERE soe.service_order_id = so.id
              AND soe.equipment_id = ANY(p_equipment_ids)
          )
        )
      ) AS matches_selected_equipment
    FROM public.service_orders so
    WHERE so.entry_type IS DISTINCT FROM 'tarefa'
      AND so.status IS DISTINCT FROM 'cancelada'::public.os_status
      AND (p_exclude_service_order_id IS NULL OR so.id <> p_exclude_service_order_id)
      AND (
        so.scheduled_date BETWEEN p_start_date AND p_end_date
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(COALESCE(so.schedule_plan, '[]'::jsonb)) = 'array'
                THEN COALESCE(so.schedule_plan, '[]'::jsonb)
              ELSE '[]'::jsonb
            END
          ) slot
          WHERE (slot->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
            AND (slot->>'date')::date BETWEEN p_start_date AND p_end_date
        )
      )
  ), visible_orders AS (
    SELECT *
    FROM candidate_orders
    WHERE (p_customer_id IS NULL OR candidate_orders.customer_id = p_customer_id)
      AND (
        p_customer_id IS NOT NULL
        OR COALESCE(cardinality(p_equipment_ids), 0) = 0
        OR candidate_orders.matches_selected_equipment
      )
  ), occupied_days AS (
    SELECT
      visible_orders.id,
      visible_orders.matches_selected_equipment,
      (
        visible_orders.contract_id IS NOT NULL
        AND (
          visible_orders.origin = 'contract'
          OR (
            visible_orders.contract_reference_date IS NOT NULL
            AND visible_orders.contract_visit_customized_at IS NOT NULL
          )
        )
      ) AS is_contract_occurrence,
      COALESCE(slot.occupied_date, visible_orders.scheduled_date) AS occupied_date
    FROM visible_orders
    LEFT JOIN LATERAL (
      SELECT (item->>'date')::date AS occupied_date
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(COALESCE(visible_orders.schedule_plan, '[]'::jsonb)) = 'array'
            AND jsonb_array_length(COALESCE(visible_orders.schedule_plan, '[]'::jsonb)) > 0
            THEN visible_orders.schedule_plan
          ELSE jsonb_build_array(jsonb_build_object('date', visible_orders.scheduled_date))
        END
      ) item
      WHERE (item->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
    ) slot ON true
  )
  SELECT
    occupied_days.occupied_date AS schedule_date,
    count(DISTINCT occupied_days.id) FILTER (
      WHERE occupied_days.is_contract_occurrence
    ) > 0 AS has_contract_occurrence,
    count(DISTINCT occupied_days.id) FILTER (
      WHERE NOT occupied_days.is_contract_occurrence
    ) > 0 AS has_service_order,
    count(DISTINCT occupied_days.id) FILTER (
      WHERE occupied_days.is_contract_occurrence
        AND occupied_days.matches_selected_equipment
    ) > 0 AS contract_occurrence_matches_equipment,
    count(DISTINCT occupied_days.id) FILTER (
      WHERE NOT occupied_days.is_contract_occurrence
        AND occupied_days.matches_selected_equipment
    ) > 0 AS service_order_matches_equipment,
    count(DISTINCT occupied_days.id) FILTER (
      WHERE occupied_days.is_contract_occurrence
    )::integer AS contract_occurrence_count,
    count(DISTINCT occupied_days.id) FILTER (
      WHERE NOT occupied_days.is_contract_occurrence
    )::integer AS service_order_count,
    count(DISTINCT occupied_days.id) FILTER (
      WHERE occupied_days.is_contract_occurrence
        AND occupied_days.matches_selected_equipment
    )::integer AS contract_occurrence_equipment_count,
    count(DISTINCT occupied_days.id) FILTER (
      WHERE NOT occupied_days.is_contract_occurrence
        AND occupied_days.matches_selected_equipment
    )::integer AS service_order_equipment_count
  FROM occupied_days
  WHERE occupied_days.occupied_date BETWEEN p_start_date AND p_end_date
  GROUP BY occupied_days.occupied_date
  ORDER BY occupied_days.occupied_date;
END;
$function$;

COMMENT ON FUNCTION public.get_schedule_calendar_indicators(date, date, uuid, uuid[], uuid) IS
  'Resume dias ocupados e quantidades de visitas contratuais ou OSs visiveis ao usuario, com contexto opcional de cliente/equipamento, para marcadores do DatePicker.';

REVOKE ALL ON FUNCTION public.get_schedule_calendar_indicators(date, date, uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_schedule_calendar_indicators(date, date, uuid, uuid[], uuid) TO authenticated;

COMMIT;

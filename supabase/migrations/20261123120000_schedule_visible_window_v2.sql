-- Agenda v2: paginação por cursor, projeção enxuta e leitura sem teto total.
--
-- A v1 serializava a linha inteira de service_orders para só depois remover
-- snapshots, assinaturas e localizações. Em empresas com dados
-- reais isso fazia 77 entradas levarem mais de 13 segundos. A v2:
--   * filtra service_orders uma única vez por página (RLS continua ativa);
--   * pagina dentro da RPC, sem recalcular o payload completo via Range;
--   * projeta apenas as colunas do contrato antes de convertê-las para JSON;
--   * agrega responsáveis somente para a página corrente;
--   * mantém a v1 como wrapper compatível para clientes ainda em rollout.

CREATE OR REPLACE FUNCTION public.schedule_visible_entries_v2(
  p_start_date date,
  p_end_date date,
  p_after_scheduled_date date DEFAULT NULL,
  p_after_scheduled_time time without time zone DEFAULT NULL,
  p_after_scheduled_time_is_null boolean DEFAULT NULL,
  p_after_order_number integer DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_page_size integer DEFAULT 500
)
RETURNS TABLE(
  entry jsonb,
  cursor_scheduled_date date,
  cursor_scheduled_time time without time zone,
  cursor_scheduled_time_is_null boolean,
  cursor_order_number integer,
  cursor_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'schedule_auth_required' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_end_date < p_start_date
     OR (p_end_date - p_start_date) > 62
     OR p_page_size IS NULL
     OR p_page_size < 1
     OR p_page_size > 1000 THEN
    RAISE EXCEPTION 'schedule_invalid_visible_range' USING ERRCODE = '22023';
  END IF;

  IF p_after_scheduled_date IS NULL THEN
    IF p_after_scheduled_time IS NOT NULL
       OR p_after_scheduled_time_is_null IS NOT NULL
       OR p_after_order_number IS NOT NULL
       OR p_after_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule_invalid_cursor' USING ERRCODE = '22023';
    END IF;
  ELSIF p_after_scheduled_time_is_null IS NULL
        OR p_after_order_number IS NULL
        OR p_after_id IS NULL
        OR (NOT p_after_scheduled_time_is_null AND p_after_scheduled_time IS NULL)
        OR (p_after_scheduled_time_is_null AND p_after_scheduled_time IS NOT NULL) THEN
    RAISE EXCEPTION 'schedule_invalid_cursor' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH paged_orders AS MATERIALIZED (
    SELECT
      so.admin_indirect_rate,
      so.bdi,
      so.check_in_by,
      so.check_in_time,
      so.check_out_by,
      so.check_out_time,
      so.client_signature_at,
      so.client_signed_by,
      so.commercial_adjustment,
      so.company_id,
      so.completed_at,
      so.contract_id,
      so.contract_reference_date,
      so.contract_visit_customized_at,
      so.created_at,
      so.created_by,
      so.crm_automation_action_key,
      so.crm_automation_rule_id,
      so.crm_checklist_id,
      so.customer_id,
      so.description,
      so.diagnosis,
      so.displacement_cost,
      so.distance_km,
      so.duration_minutes,
      so.entry_type,
      so.equipment_id,
      so.form_template_id,
      so.generate_nps_survey,
      so.id,
      so.km_cost,
      so.labor_hours,
      so.labor_value,
      so.lead_id,
      so.notes,
      so.order_number,
      so.legacy_order_number,
      so.origin,
      so.os_type,
      so.partial_finish,
      so.parts_used,
      so.parts_value,
      so.paused_at,
      so.pmoc_conformity_notes,
      so.pmoc_conformity_status,
      so.profit_rate,
      so.public_short_code,
      so.quote_id,
      so.recurrence_end_date,
      so.recurrence_group_id,
      so.recurrence_indeterminate,
      so.recurrence_interval,
      so.recurrence_type,
      so.recurrence_weekdays,
      so.require_client_signature,
      so.require_tech_signature,
      so.resumed_at,
      so.schedule_plan,
      so.scheduled_date,
      so.scheduled_days,
      so.scheduled_time,
      so.service_address,
      so.service_address_number,
      so.service_city,
      so.service_latitude,
      so.service_longitude,
      so.service_neighborhood,
      so.service_state,
      so.service_type_id,
      so.service_zip_code,
      so.show_in_schedule,
      so.solution,
      so.started_at,
      so.status,
      so.task_title,
      so.task_type_id,
      so.tax_rate,
      so.team_id,
      so.tech_signature_at,
      so.tech_signed_by,
      so.technician_id,
      so.total_cost,
      so.total_value,
      so.updated_at,
      so.use_bdi,
      so.snapshot_data->'customer' AS snapshot_customer,
      so.snapshot_data->'equipment' AS snapshot_equipment,
      so.snapshot_data->'form_template' AS snapshot_form_template,
      so.snapshot_data->'service_type' AS snapshot_service_type
    FROM public.service_orders so
    WHERE (so.entry_type IS DISTINCT FROM 'tarefa' OR so.show_in_schedule)
      AND (
        so.scheduled_date BETWEEN p_start_date AND p_end_date
        OR (
          so.scheduled_days > 1
          AND so.scheduled_date <= p_end_date
          AND (so.schedule_plan->-1->>'date') >= p_start_date::text
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(so.schedule_plan, '[]'::jsonb)) slot
            WHERE (slot->>'date')::date BETWEEN p_start_date AND p_end_date
          )
        )
        OR (
          CURRENT_DATE >= p_start_date
          AND so.status IN ('pendente', 'a_caminho', 'em_andamento')
          AND so.resumed_at IS NOT NULL
          AND so.scheduled_date < so.resumed_at::date
          AND so.resumed_at < (p_end_date + 1)::timestamp
        )
      )
      AND (
        p_after_scheduled_date IS NULL
        OR (
          so.scheduled_date,
          so.scheduled_time IS NULL,
          COALESCE(so.scheduled_time, time '00:00:00'),
          so.order_number,
          so.id
        ) > (
          p_after_scheduled_date,
          p_after_scheduled_time_is_null,
          COALESCE(p_after_scheduled_time, time '00:00:00'),
          p_after_order_number,
          p_after_id
        )
      )
    ORDER BY
      so.scheduled_date,
      so.scheduled_time IS NULL,
      so.scheduled_time,
      so.order_number,
      so.id
    LIMIT p_page_size
  ),
  assignees AS MATERIALIZED (
    SELECT
      soa.service_order_id,
      jsonb_agg(DISTINCT soa.user_id ORDER BY soa.user_id) AS user_ids
    FROM public.service_order_assignees soa
    JOIN paged_orders visible ON visible.id = soa.service_order_id
    GROUP BY soa.service_order_id
  )
  SELECT
    to_jsonb(payload)
    || jsonb_build_object(
      'customer', CASE WHEN c.id IS NULL THEN so.snapshot_customer ELSE jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'phone', c.phone,
        'celular', c.celular,
        'email', c.email,
        'document', c.document,
        'address', c.address,
        'address_number', c.address_number,
        'complement', c.complement,
        'neighborhood', c.neighborhood,
        'city', c.city,
        'state', c.state,
        'zip_code', c.zip_code,
        'company_name', c.company_name,
        'customer_type', c.customer_type
      ) END,
      'equipment', CASE WHEN e.id IS NULL THEN so.snapshot_equipment ELSE jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'brand', e.brand,
        'model', e.model
      ) END,
      'form_template', CASE WHEN ft.id IS NULL THEN so.snapshot_form_template ELSE jsonb_build_object(
        'id', ft.id,
        'name', ft.name
      ) END,
      'service_type', CASE WHEN st.id IS NULL THEN so.snapshot_service_type ELSE jsonb_build_object(
        'id', st.id,
        'name', st.name,
        'color', st.color,
        'number_prefix', st.number_prefix
      ) END,
      'contract', CASE WHEN ct.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', ct.id,
        'name', ct.name,
        'is_pmoc', ct.is_pmoc
      ) END,
      '_assignee_user_ids', COALESCE(a.user_ids, '[]'::jsonb)
    ) AS entry,
    so.scheduled_date AS cursor_scheduled_date,
    so.scheduled_time AS cursor_scheduled_time,
    so.scheduled_time IS NULL AS cursor_scheduled_time_is_null,
    so.order_number AS cursor_order_number,
    so.id AS cursor_id
  FROM paged_orders so
  CROSS JOIN LATERAL (
    SELECT
      so.admin_indirect_rate,
      so.bdi,
      so.check_in_by,
      so.check_in_time,
      so.check_out_by,
      so.check_out_time,
      so.client_signature_at,
      so.client_signed_by,
      so.commercial_adjustment,
      so.company_id,
      so.completed_at,
      so.contract_id,
      so.contract_reference_date,
      so.contract_visit_customized_at,
      so.created_at,
      so.created_by,
      so.crm_automation_action_key,
      so.crm_automation_rule_id,
      so.crm_checklist_id,
      so.customer_id,
      so.description,
      so.diagnosis,
      so.displacement_cost,
      so.distance_km,
      so.duration_minutes,
      so.entry_type,
      so.equipment_id,
      so.form_template_id,
      so.generate_nps_survey,
      so.id,
      so.km_cost,
      so.labor_hours,
      so.labor_value,
      so.lead_id,
      so.notes,
      so.order_number,
      so.legacy_order_number,
      so.origin,
      so.os_type,
      so.partial_finish,
      so.parts_used,
      so.parts_value,
      so.paused_at,
      so.pmoc_conformity_notes,
      so.pmoc_conformity_status,
      so.profit_rate,
      so.public_short_code,
      so.quote_id,
      so.recurrence_end_date,
      so.recurrence_group_id,
      so.recurrence_indeterminate,
      so.recurrence_interval,
      so.recurrence_type,
      so.recurrence_weekdays,
      so.require_client_signature,
      so.require_tech_signature,
      so.resumed_at,
      so.schedule_plan,
      so.scheduled_date,
      so.scheduled_days,
      so.scheduled_time,
      so.service_address,
      so.service_address_number,
      so.service_city,
      so.service_latitude,
      so.service_longitude,
      so.service_neighborhood,
      so.service_state,
      so.service_type_id,
      so.service_zip_code,
      so.show_in_schedule,
      so.solution,
      so.started_at,
      so.status,
      so.task_title,
      so.task_type_id,
      so.tax_rate,
      so.team_id,
      so.tech_signature_at,
      so.tech_signed_by,
      so.technician_id,
      so.total_cost,
      so.total_value,
      so.updated_at,
      so.use_bdi
  ) payload
  LEFT JOIN public.customers c ON c.id = so.customer_id
  LEFT JOIN public.equipment e ON e.id = so.equipment_id
  LEFT JOIN public.form_templates ft ON ft.id = so.form_template_id
  LEFT JOIN public.service_types st ON st.id = so.service_type_id
  LEFT JOIN public.contracts ct ON ct.id = so.contract_id
  LEFT JOIN assignees a ON a.service_order_id = so.id
  ORDER BY
    so.scheduled_date,
    so.scheduled_time IS NULL,
    so.scheduled_time,
    so.order_number,
    so.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_visible_entries_v2(
  date, date, date, time without time zone, boolean, integer, uuid, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_visible_entries_v2(
  date, date, date, time without time zone, boolean, integer, uuid, integer
) TO authenticated;

COMMENT ON FUNCTION public.schedule_visible_entries_v2(
  date, date, date, time without time zone, boolean, integer, uuid, integer
) IS
  'Lista a janela visível da Agenda com paginação keyset, projeção enxuta e RLS do chamador.';

-- Compatibilidade durante o rollout: clientes v1 continuam sem teto total,
-- mas passam a consumir o mesmo plano otimizado da v2.
CREATE OR REPLACE FUNCTION public.schedule_visible_entries_v1(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE(entry jsonb)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  page_row record;
  page_count integer;
  after_scheduled_date date := NULL;
  after_scheduled_time time without time zone := NULL;
  after_scheduled_time_is_null boolean := NULL;
  after_order_number integer := NULL;
  after_id uuid := NULL;
BEGIN
  LOOP
    page_count := 0;

    FOR page_row IN
      SELECT *
      FROM public.schedule_visible_entries_v2(
        p_start_date => p_start_date,
        p_end_date => p_end_date,
        p_after_scheduled_date => after_scheduled_date,
        p_after_scheduled_time => after_scheduled_time,
        p_after_scheduled_time_is_null => after_scheduled_time_is_null,
        p_after_order_number => after_order_number,
        p_after_id => after_id,
        p_page_size => 500
      )
    LOOP
      entry := page_row.entry;
      after_scheduled_date := page_row.cursor_scheduled_date;
      after_scheduled_time := page_row.cursor_scheduled_time;
      after_scheduled_time_is_null := page_row.cursor_scheduled_time_is_null;
      after_order_number := page_row.cursor_order_number;
      after_id := page_row.cursor_id;
      page_count := page_count + 1;
      RETURN NEXT;
    END LOOP;

    EXIT WHEN page_count < 500;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_visible_entries_v1(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_visible_entries_v1(date, date) TO authenticated;

COMMENT ON FUNCTION public.schedule_visible_entries_v1(date, date) IS
  'Compatibilidade da Agenda v1 sobre o plano paginado e otimizado da v2.';

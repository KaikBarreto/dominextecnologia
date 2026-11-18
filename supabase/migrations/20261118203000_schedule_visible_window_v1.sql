-- Agenda: entrega somente a janela civil visível, com relacionamentos e
-- responsáveis já agregados. A função é SECURITY INVOKER de propósito: as
-- policies atuais de service_orders e das entidades relacionadas continuam
-- sendo a fronteira multi-tenant.

CREATE INDEX IF NOT EXISTS idx_service_orders_company_scheduled_date
  ON public.service_orders (company_id, scheduled_date)
  WHERE scheduled_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_company_critical_schedule
  ON public.service_orders (company_id, scheduled_date)
  WHERE status NOT IN ('concluida'::public.os_status, 'cancelada'::public.os_status)
    AND scheduled_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_company_portal_open
  ON public.service_orders (company_id, created_at DESC)
  WHERE origin = 'portal'
    AND status NOT IN ('concluida'::public.os_status, 'cancelada'::public.os_status);

CREATE INDEX IF NOT EXISTS idx_service_orders_company_active_resumed
  ON public.service_orders (company_id, resumed_at)
  WHERE resumed_at IS NOT NULL
    AND status IN ('pendente', 'a_caminho', 'em_andamento');

CREATE INDEX IF NOT EXISTS idx_service_orders_company_multiday_window
  ON public.service_orders (
    company_id,
    scheduled_date,
    ((schedule_plan->-1->>'date'))
  )
  WHERE scheduled_days > 1;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_company_paid_date
  ON public.financial_transactions (company_id, is_paid, transaction_date)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_credit_card_bills_company_open_due
  ON public.credit_card_bills (company_id, due_date)
  WHERE status <> 'paid';

CREATE INDEX IF NOT EXISTS idx_service_ratings_order
  ON public.service_ratings (service_order_id);

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'schedule_auth_required' USING ERRCODE = '42501';
  END IF;

  IF p_start_date IS NULL
     OR p_end_date IS NULL
     OR p_end_date < p_start_date
     OR (p_end_date - p_start_date) > 62 THEN
    RAISE EXCEPTION 'schedule_invalid_visible_range' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidate_ids AS MATERIALIZED (
    SELECT visible.id
    FROM public.service_orders visible
    WHERE visible.scheduled_date BETWEEN p_start_date AND p_end_date

    UNION

    SELECT multiday.id
    FROM public.service_orders multiday
    WHERE multiday.scheduled_days > 1
      AND multiday.scheduled_date <= p_end_date
      AND (multiday.schedule_plan->-1->>'date') >= p_start_date::text
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(multiday.schedule_plan, '[]'::jsonb)) slot
        WHERE (slot->>'date')::date BETWEEN p_start_date AND p_end_date
      )

    UNION

    SELECT resumed.id
    FROM public.service_orders resumed
    WHERE resumed.status IN ('pendente', 'a_caminho', 'em_andamento')
      AND resumed.resumed_at IS NOT NULL
      AND resumed.scheduled_date < resumed.resumed_at::date
      AND resumed.resumed_at < (p_end_date + 1)::timestamp
      AND CURRENT_DATE >= p_start_date
  )
  SELECT
    (
      to_jsonb(so)
      - 'snapshot_data'
      - 'client_signature'
      - 'client_signed_location'
      - 'tech_signature'
      - 'tech_signed_location'
      - 'check_in_location'
      - 'check_out_location'
    )
    || jsonb_build_object(
      'customer', CASE WHEN c.id IS NULL THEN so.snapshot_data->'customer' ELSE jsonb_build_object(
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
      'equipment', CASE WHEN e.id IS NULL THEN so.snapshot_data->'equipment' ELSE jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'brand', e.brand,
        'model', e.model
      ) END,
      'form_template', CASE WHEN ft.id IS NULL THEN so.snapshot_data->'form_template' ELSE jsonb_build_object(
        'id', ft.id,
        'name', ft.name
      ) END,
      'service_type', CASE WHEN st.id IS NULL THEN so.snapshot_data->'service_type' ELSE jsonb_build_object(
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
      '_assignee_user_ids', COALESCE(assignees.user_ids, '[]'::jsonb)
    ) AS entry
  FROM candidate_ids candidate
  JOIN public.service_orders so ON so.id = candidate.id
  LEFT JOIN public.customers c ON c.id = so.customer_id
  LEFT JOIN public.equipment e ON e.id = so.equipment_id
  LEFT JOIN public.form_templates ft ON ft.id = so.form_template_id
  LEFT JOIN public.service_types st ON st.id = so.service_type_id
  LEFT JOIN public.contracts ct ON ct.id = so.contract_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(DISTINCT soa.user_id) AS user_ids
    FROM public.service_order_assignees soa
    WHERE soa.service_order_id = so.id
  ) assignees ON true
  WHERE (so.entry_type IS DISTINCT FROM 'tarefa' OR so.show_in_schedule)
  ORDER BY so.scheduled_date, so.scheduled_time, so.order_number, so.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.schedule_visible_entries_v1(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_visible_entries_v1(date, date) TO authenticated;

COMMENT ON FUNCTION public.schedule_visible_entries_v1(date, date) IS
  'Lista a janela visível da Agenda (máximo 63 dias), respeitando RLS e incluindo jornadas múltiplas e retomadas ativas.';

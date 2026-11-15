-- Normaliza a URL pública devolvida pela API v1 para a origem canônica.
-- A assinatura e o schema da resposta permanecem iguais; muda apenas o host.
CREATE OR REPLACE FUNCTION public.public_api_service_order_response(
  p_integration_id uuid,
  p_service_order_id uuid,
  p_replay boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_company_id uuid;
  v_result jsonb;
BEGIN
  v_company_id := public.public_api_assert_integration(p_integration_id, NULL);

  SELECT jsonb_build_object(
    'id', so.id,
    'external_id', CASE WHEN er.external_id LIKE '__internal__:%' THEN NULL ELSE er.external_id END,
    'order_number', so.order_number,
    'status', so.status,
    'customer', public.public_api_customer_summary(so.customer_id, p_integration_id),
    'scheduled_at', ((so.scheduled_date + so.scheduled_time) AT TIME ZONE cs.timezone),
    'duration_minutes', so.duration_minutes,
    'timezone', cs.timezone,
    'assignment_status', CASE
      WHEN so.technician_id IS NULL AND so.team_id IS NULL THEN 'assignment_pending'
      ELSE 'assigned'
    END,
    'resource', CASE
      WHEN so.technician_id IS NOT NULL THEN jsonb_build_object(
        'id', so.technician_id,
        'type', 'user',
        'name', p.full_name
      )
      WHEN so.team_id IS NOT NULL THEN jsonb_build_object(
        'id', so.team_id,
        'type', 'team',
        'name', t.name
      )
    END,
    'public_tracking_url', 'https://www.dominex.app/os-tecnico/' || so.public_short_code || '?modo=cliente',
    'idempotent_replay', p_replay
  )
  INTO v_result
  FROM public.service_orders so
  JOIN public.public_api_external_refs er
    ON er.integration_id = p_integration_id
   AND er.resource_type = 'service_order'
   AND er.resource_id = so.id
  JOIN public.company_settings cs ON cs.company_id = so.company_id
  LEFT JOIN public.profiles p
    ON p.user_id = so.technician_id
   AND p.company_id = so.company_id
  LEFT JOIN public.teams t
    ON t.id = so.team_id
   AND t.company_id = so.company_id
  WHERE so.id = p_service_order_id
    AND so.company_id = v_company_id
    AND so.entry_type = 'os';

  RETURN v_result;
END;
$function$;

-- Helper interno: endpoints SECURITY DEFINER o chamam como owner.
REVOKE ALL ON FUNCTION public.public_api_service_order_response(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

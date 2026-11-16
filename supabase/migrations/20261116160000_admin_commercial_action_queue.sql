-- Fila comercial da Equipe. SECURITY INVOKER preserva as policies de CRM: a
-- RPC só compõe linhas que o chamador já pode ler, sem ampliar acesso.
CREATE OR REPLACE FUNCTION public.admin_commercial_action_queue(
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 8
)
RETURNS TABLE (
  lead_id uuid,
  company_name text,
  contact_name text,
  pipeline_id uuid,
  responsible_name text,
  next_action text,
  next_action_at date,
  last_interaction_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  WITH queue AS (
    SELECT
      l.id AS lead_id,
      l.company_name::text,
      l.contact_name::text,
      l.pipeline_id,
      sp.name::text AS responsible_name,
      planned.next_action::text,
      planned.next_action_date::date AS next_action_at,
      last_event.created_at AS last_interaction_at,
      CASE
        WHEN planned.next_action_date IS NOT NULL AND planned.next_action_date <= current_date THEN 0
        WHEN last_event.created_at IS NULL THEN 1
        WHEN planned.next_action_date IS NOT NULL THEN 2
        ELSE 3
      END AS priority_group
    FROM public.admin_leads l
    LEFT JOIN public.admin_crm_stages s ON s.id = l.stage_id
    LEFT JOIN public.salespeople_basic sp ON sp.user_id = l.responsible_id
    LEFT JOIN LATERAL (
      SELECT i.created_at
      FROM public.admin_lead_interactions i
      WHERE i.lead_id = l.id
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT 1
    ) last_event ON true
    LEFT JOIN LATERAL (
      SELECT i.next_action, i.next_action_date
      FROM public.admin_lead_interactions i
      WHERE i.lead_id = l.id
        AND (NULLIF(btrim(i.next_action), '') IS NOT NULL OR i.next_action_date IS NOT NULL)
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT 1
    ) planned ON true
    WHERE COALESCE(s.is_won, false) = false
      AND COALESCE(s.is_lost, false) = false
  )
  SELECT
    q.lead_id,
    q.company_name,
    q.contact_name,
    q.pipeline_id,
    q.responsible_name,
    q.next_action,
    q.next_action_at,
    q.last_interaction_at,
    count(*) OVER () AS total_count
  FROM queue q
  ORDER BY
    q.priority_group,
    q.next_action_at ASC NULLS LAST,
    q.last_interaction_at ASC NULLS FIRST,
    q.lead_id
  OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 50);
$fn$;

COMMENT ON FUNCTION public.admin_commercial_action_queue(integer, integer) IS
  'Fila paginada de leads abertos para Equipe. Última interação inclui qualquer registro e não deve ser tratada como contato confirmado. SECURITY INVOKER preserva RLS.';

REVOKE ALL ON FUNCTION public.admin_commercial_action_queue(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_commercial_action_queue(integer, integer) TO authenticated, service_role;

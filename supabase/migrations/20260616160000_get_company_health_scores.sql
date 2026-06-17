-- Health Score (painel admin Auctus): classifica cada empresa por RECÊNCIA da última
-- atividade em usage_events em 4 faixas (healthy/attention/at_risk/inactive).
-- Clone adaptado do EcoSistema ao schema Dominex.
-- SECURITY DEFINER + cross-tenant: guard inline com is_admin_user — não-admin recebe 0 linhas.

CREATE OR REPLACE FUNCTION public.get_company_health_scores()
RETURNS TABLE (
  company_id uuid,
  company_name text,
  subscription_status text,
  subscription_plan text,
  last_activity_at timestamptz,
  events_7d bigint,
  events_14d bigint,
  events_30d bigint,
  health_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.subscription_status,
    c.subscription_plan,
    max_event.last_activity_at,
    COALESCE(counts.events_7d, 0),
    COALESCE(counts.events_14d, 0),
    COALESCE(counts.events_30d, 0),
    CASE
      WHEN max_event.last_activity_at IS NULL THEN 'inactive'
      WHEN max_event.last_activity_at >= now() - interval '7 days' THEN 'healthy'
      WHEN max_event.last_activity_at >= now() - interval '14 days' THEN 'attention'
      WHEN max_event.last_activity_at >= now() - interval '30 days' THEN 'at_risk'
      ELSE 'inactive'
    END AS health_status
  FROM public.companies c
  LEFT JOIN LATERAL (
    SELECT MAX(ue.created_at) AS last_activity_at
    FROM public.usage_events ue
    WHERE ue.company_id = c.id
  ) max_event ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE ue2.created_at >= now() - interval '7 days')  AS events_7d,
      COUNT(*) FILTER (WHERE ue2.created_at >= now() - interval '14 days') AS events_14d,
      COUNT(*) FILTER (WHERE ue2.created_at >= now() - interval '30 days') AS events_30d
    FROM public.usage_events ue2
    WHERE ue2.company_id = c.id
      AND ue2.created_at >= now() - interval '30 days'
  ) counts ON true
  -- GUARD de admin: a função expõe dados cross-tenant; só admin Auctus vê.
  -- Aplicado no WHERE => não-admin recebe ZERO linhas (avaliado uma vez por ser STABLE).
  WHERE public.is_admin_user(auth.uid())
  ORDER BY c.name;
$$;

-- O guard interno é quem restringe a admin; expõe execução a authenticated.
GRANT EXECUTE ON FUNCTION public.get_company_health_scores() TO authenticated, service_role;

-- Índice usage_events(company_id, created_at DESC) já existe como
-- idx_usage_events_company_id_created_at; recriado idempotente por segurança.
CREATE INDEX IF NOT EXISTS idx_usage_events_company_id_created_at
  ON public.usage_events USING btree (company_id, created_at DESC);

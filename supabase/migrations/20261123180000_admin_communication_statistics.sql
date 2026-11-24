-- =============================================================================
-- Painel Auctus > Admin > Estatísticas > Comunicações
-- Observabilidade agregada das filas de e-mail e WhatsApp.
--
-- Esta RPC cruza tenants de propósito. O guard interno de super_admin é a
-- fronteira de segurança; a resposta não contém e-mail, telefone, conteúdo da
-- mensagem nem identificador externo do provedor.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_communication_statistics(
  p_from       date DEFAULT NULL,
  p_to         date DEFAULT NULL,
  p_channel    text DEFAULT 'all',
  p_company_id uuid DEFAULT NULL,
  p_timezone   text DEFAULT 'America/Sao_Paulo'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_tz      text;
  v_channel text;
  v_from    date;
  v_to      date;
  v_start   timestamptz;
  v_end     timestamptz;
  v_result  jsonb;
BEGIN
  -- Nada cross-tenant roda antes desta validação estrita.
  PERFORM public._assert_super_admin();

  v_tz := COALESCE(NULLIF(btrim(p_timezone), ''), 'America/Sao_Paulo');
  v_channel := lower(COALESCE(NULLIF(btrim(p_channel), ''), 'all'));
  IF v_channel NOT IN ('all', 'email', 'whatsapp') THEN
    RAISE EXCEPTION 'Canal inválido.' USING ERRCODE = '22023';
  END IF;

  v_to := COALESCE(p_to, (now() AT TIME ZONE v_tz)::date);
  v_from := COALESCE(p_from, date_trunc('month', v_to::timestamp)::date);
  IF v_from > v_to THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22023';
  END IF;

  v_start := (v_from::timestamp) AT TIME ZONE v_tz;
  v_end := ((v_to + 1)::timestamp) AT TIME ZONE v_tz;

  WITH desired_channels(channel) AS (
    SELECT 'email'::text WHERE v_channel IN ('all', 'email')
    UNION ALL
    SELECT 'whatsapp'::text WHERE v_channel IN ('all', 'whatsapp')
  ),
  raw_jobs AS (
    SELECT
      'email'::text AS channel,
      d.company_id,
      d.event_type AS event_key,
      d.status,
      d.attempts,
      d.next_attempt_at,
      d.last_error_code,
      d.created_at,
      d.updated_at
    FROM public.customer_email_deliveries d
    WHERE v_channel IN ('all', 'email')
      AND (p_company_id IS NULL OR d.company_id = p_company_id)
      AND (
        (d.created_at >= v_start AND d.created_at < v_end)
        OR d.status IN ('pending', 'processing', 'retry')
      )

    UNION ALL

    SELECT
      'whatsapp'::text,
      j.company_id,
      j.event_key,
      j.status,
      j.attempts,
      j.next_attempt_at,
      j.last_error_code,
      j.created_at,
      j.updated_at
    FROM public.whatsapp_send_jobs j
    WHERE v_channel IN ('all', 'whatsapp')
      AND (p_company_id IS NULL OR j.company_id = p_company_id)
      AND (
        (j.created_at >= v_start AND j.created_at < v_end)
        OR j.status IN ('pending', 'processing', 'retry')
      )
  ),
  classified AS (
    SELECT r.*,
      CASE
        WHEN r.channel = 'email' AND r.status = 'sent' THEN 'success'
        WHEN r.channel = 'whatsapp' AND r.status IN ('sent', 'delivered', 'read') THEN 'success'
        WHEN r.status IN ('pending', 'processing', 'retry') THEN 'queue'
        WHEN r.status IN ('failed', 'skipped_quota') THEN 'failed'
        ELSE 'skipped'
      END AS outcome,
      CASE
        WHEN r.status = 'skipped_quota'
          OR COALESCE(r.last_error_code, '') ~* '(quota|rate.?limit|429)'
          THEN 'Limite de envio atingido'
        WHEN COALESCE(r.last_error_code, '') ~* '(auth|unauthor|forbidden|401|403|token)'
          THEN 'Falha de autenticação no provedor'
        WHEN COALESCE(r.last_error_code, '') ~* '(config|from_email|sender|domain|dns)'
          THEN 'Configuração do remetente inválida'
        WHEN COALESCE(r.last_error_code, '') ~* '(recipient|email|phone|number|contact)'
          THEN 'Destinatário inválido ou indisponível'
        WHEN COALESCE(r.last_error_code, '') ~* '(timeout|network|fetch|connection|5[0-9][0-9])'
          THEN 'Provedor temporariamente indisponível'
        ELSE 'Falha no processamento'
      END AS safe_error
    FROM raw_jobs r
  ),
  period_jobs AS (
    SELECT * FROM classified
    WHERE created_at >= v_start AND created_at < v_end
  ),
  channel_summary AS (
    SELECT dc.channel,
      count(p.company_id) AS total,
      count(p.company_id) FILTER (WHERE p.outcome = 'success') AS success,
      count(p.company_id) FILTER (WHERE p.outcome = 'failed') AS failed,
      count(p.company_id) FILTER (WHERE p.outcome = 'skipped') AS skipped
    FROM desired_channels dc
    LEFT JOIN period_jobs p ON p.channel = dc.channel
    GROUP BY dc.channel
  ),
  current_queue AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE channel = 'email') AS email,
      count(*) FILTER (WHERE channel = 'whatsapp') AS whatsapp,
      count(*) FILTER (WHERE next_attempt_at <= now()) AS ready,
      min(created_at) AS oldest_created_at
    FROM classified
    WHERE outcome = 'queue'
  ),
  days AS (
    SELECT gs::date AS bucket
    FROM generate_series(v_from, v_to, interval '1 day') gs
  ),
  daily_counts AS (
    SELECT
      (created_at AT TIME ZONE v_tz)::date AS bucket,
      channel,
      count(*) AS total,
      count(*) FILTER (WHERE outcome = 'success') AS success,
      count(*) FILTER (WHERE outcome = 'failed') AS failed
    FROM period_jobs
    GROUP BY 1, 2
  ),
  series AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'bucket', d.bucket,
        'channel', dc.channel,
        'total', COALESCE(x.total, 0),
        'success', COALESCE(x.success, 0),
        'failed', COALESCE(x.failed, 0)
      ) ORDER BY d.bucket, dc.channel
    ) AS rows
    FROM days d
    CROSS JOIN desired_channels dc
    LEFT JOIN daily_counts x ON x.bucket = d.bucket AND x.channel = dc.channel
  ),
  company_ranking AS (
    SELECT
      c.company_id,
      co.name AS company_name,
      count(*) AS total,
      count(*) FILTER (WHERE c.channel = 'email') AS email,
      count(*) FILTER (WHERE c.channel = 'whatsapp') AS whatsapp,
      count(*) FILTER (WHERE c.outcome = 'success') AS success,
      count(*) FILTER (WHERE c.outcome = 'failed') AS failed,
      max(c.updated_at) AS last_activity
    FROM period_jobs c
    JOIN public.companies co ON co.id = c.company_id
    GROUP BY c.company_id, co.name
    ORDER BY count(*) DESC, co.name
    LIMIT 100
  ),
  recent_failures AS (
    SELECT p.channel, p.company_id, co.name AS company_name, p.event_key,
           p.status, p.attempts, p.safe_error, p.updated_at
    FROM period_jobs p
    JOIN public.companies co ON co.id = p.company_id
    WHERE p.outcome = 'failed' OR p.status = 'retry'
    ORDER BY p.updated_at DESC
    LIMIT 50
  ),
  grouped_errors AS (
    SELECT channel, safe_error, count(*) AS total, max(updated_at) AS last_seen_at
    FROM period_jobs
    WHERE outcome = 'failed' OR status = 'retry'
    GROUP BY channel, safe_error
    ORDER BY count(*) DESC, safe_error
  ),
  email_quota AS (
    SELECT
      co.id AS company_id,
      co.name AS company_name,
      COALESCE(s.enabled, false) AS enabled,
      COALESCE(u.accepted_count, 0) AS used,
      greatest(COALESCE(s.monthly_limit_override, sp.monthly_customer_email_limit, 0), 0) AS limit
    FROM public.companies co
    LEFT JOIN public.customer_email_settings s ON s.company_id = co.id
    LEFT JOIN public.subscription_plans sp ON sp.code = co.subscription_plan
    LEFT JOIN public.customer_email_monthly_usage u
      ON u.company_id = co.id
     AND u.period_month = date_trunc('month', now() AT TIME ZONE v_tz)::date
    WHERE v_channel IN ('all', 'email')
      AND (p_company_id IS NULL OR co.id = p_company_id)
      AND (COALESCE(s.enabled, false) OR COALESCE(u.accepted_count, 0) > 0)
    ORDER BY COALESCE(u.accepted_count, 0) DESC, co.name
    LIMIT 100
  ),
  connections AS (
    SELECT w.company_id, co.name AS company_name, w.provider, w.status,
           w.last_seen_at, w.consecutive_failures,
           (w.last_error IS NOT NULL) AS has_error
    FROM public.whatsapp_connections w
    JOIN public.companies co ON co.id = w.company_id
    WHERE v_channel IN ('all', 'whatsapp')
      AND (p_company_id IS NULL OR w.company_id = p_company_id)
    ORDER BY co.name, w.provider
  ),
  companies_filter AS (
    SELECT DISTINCT co.id, co.name
    FROM public.companies co
    WHERE co.is_internal_account IS NOT TRUE
      AND (
        EXISTS (SELECT 1 FROM public.customer_email_settings s WHERE s.company_id = co.id)
        OR EXISTS (SELECT 1 FROM public.whatsapp_connections w WHERE w.company_id = co.id)
      )
    ORDER BY co.name
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to, 'timezone', v_tz),
    'filters', jsonb_build_object(
      'channel', v_channel,
      'company_id', p_company_id,
      'companies', COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM companies_filter f), '[]'::jsonb)
    ),
    'summary', jsonb_build_object(
      'total', COALESCE((SELECT sum(total) FROM channel_summary), 0),
      'success', COALESCE((SELECT sum(success) FROM channel_summary), 0),
      'failed', COALESCE((SELECT sum(failed) FROM channel_summary), 0),
      'skipped', COALESCE((SELECT sum(skipped) FROM channel_summary), 0),
      'channels', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.channel) FROM channel_summary s), '[]'::jsonb)
    ),
    'queue', COALESCE((SELECT to_jsonb(q) FROM current_queue q), '{}'::jsonb),
    'series', COALESCE((SELECT rows FROM series), '[]'::jsonb),
    'recent_failures', COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM recent_failures f), '[]'::jsonb),
    'errors', COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM grouped_errors e), '[]'::jsonb),
    'companies', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM company_ranking r), '[]'::jsonb),
    'email_quota', COALESCE((SELECT jsonb_agg(to_jsonb(q)) FROM email_quota q), '[]'::jsonb),
    'whatsapp_connections', COALESCE((SELECT jsonb_agg(to_jsonb(w)) FROM connections w), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_admin_communication_statistics(date, date, text, uuid, text) IS
  'Painel master de comunicações: métricas agregadas das filas de e-mail e WhatsApp, sem PII. SECURITY DEFINER com gate interno de super_admin.';

REVOKE ALL ON FUNCTION public.get_admin_communication_statistics(date, date, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_communication_statistics(date, date, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_communication_statistics(date, date, text, uuid, text)
  TO authenticated, service_role;

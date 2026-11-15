-- Previsão conservadora e somente leitura da PRÓXIMA renovação SaaS.
CREATE OR REPLACE FUNCTION public.admin_subscription_forecast(p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start OR p_end-p_start>365 THEN RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22007'; END IF;
  IF coalesce(auth.role(),'') <> 'service_role' AND (auth.uid() IS NULL OR NOT public.can_read_admin_financial(auth.uid())) THEN RAISE EXCEPTION 'Acesso restrito.' USING ERRCODE = '42501'; END IF;
  WITH candidates AS (
    SELECT c.id, (c.subscription_expires_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
      CASE WHEN COALESCE(c.pending_subscription_value, 0) > 0 THEN c.pending_subscription_value
        ELSE public.get_company_effective_subscription_value(c.id) END AS monthly_value,
      lower(COALESCE(c.pending_billing_cycle, c.billing_cycle, 'monthly')) AS billing_cycle,
      CASE WHEN lower(COALESCE(c.subscription_status, '')) <> 'active' THEN 'not_active'
        WHEN COALESCE((to_jsonb(c)->>'is_test_account')::boolean, false) THEN 'test_account'
        WHEN nullif(to_jsonb(c)->>'billing_managed_by_group_id','') IS NOT NULL THEN 'billing_managed_by_group'
        WHEN EXISTS (SELECT 1 FROM public.subscription_payments sp WHERE sp.company_id = c.id AND upper(COALESCE(sp.status, '')) IN ('PENDING', 'OVERDUE', 'CONFIRMED', 'AWAITING_RISK_ANALYSIS') AND sp.paid_at IS NULL)  THEN 'open_charge_exists'
        WHEN EXISTS (SELECT 1 FROM public.subscription_payments sp WHERE sp.company_id=c.id AND sp.due_date=(c.subscription_expires_at AT TIME ZONE 'America/Sao_Paulo')::date AND (sp.paid_at IS NOT NULL OR upper(sp.status) IN ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH'))) THEN 'cycle_charge_exists'
        ELSE NULL END AS base_skip
    FROM public.companies c WHERE (c.subscription_expires_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_start AND p_end
  ), classified AS (
    SELECT *, COALESCE(base_skip, CASE WHEN monthly_value <= 0 THEN 'invalid_price' END) AS skipped_reason,
      CASE WHEN billing_cycle IN ('yearly', 'annual') THEN round(monthly_value * 12 * 0.8, 2) ELSE monthly_value END AS income FROM candidates
  ), days AS (SELECT day, sum(income) AS income, count(*) AS count FROM classified WHERE skipped_reason IS NULL GROUP BY day),
  skipped AS (SELECT skipped_reason, count(*) AS count FROM classified WHERE skipped_reason IS NOT NULL GROUP BY skipped_reason)
  SELECT jsonb_build_object('days', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', day, 'income', income, 'count', count) ORDER BY day) FROM days), '[]'::jsonb),
    'total', COALESCE((SELECT sum(income) FROM days), 0), 'count', COALESCE((SELECT sum(count) FROM days), 0),
    'skipped_reason_counts', COALESCE((SELECT jsonb_object_agg(skipped_reason, count) FROM skipped), '{}'::jsonb), 'source', 'next_renewal_estimate') INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_subscription_forecast(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_subscription_forecast(date, date) TO authenticated, service_role;

-- Current-month cash revenue for the optional monthly x12 valuation scenario.
-- Same revenue classification as admin_valuation_metrics; never writes financial records.
-- Rollback: remove the frontend caller, then DROP FUNCTION public.admin_valuation_monthly_revenue().
CREATE OR REPLACE FUNCTION public.admin_valuation_monthly_revenue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET timezone = 'America/Sao_Paulo'
AS $function$
DECLARE
  v_start date := date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.can_read_admin_financial(auth.uid()),false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'month_start',v_start, 'as_of',now(),
    'revenue',round(coalesce(sum(t.amount),0),2), 'transaction_count',count(*)
  ) INTO v_result
  FROM public.admin_financial_transactions t
  LEFT JOIN public.admin_financial_categories c ON c.name=t.category
  WHERE t.type='income' AND c.affects_result IS DISTINCT FROM false
    AND t.category NOT IN ('partner_contribution','aporte_socio')
    AND t.transaction_date>=v_start::timestamptz AND t.transaction_date<=now()
    ;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_valuation_monthly_revenue() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_valuation_monthly_revenue() TO authenticated;
COMMENT ON FUNCTION public.admin_valuation_monthly_revenue() IS 'Read-only admin financial revenue for the current partial month in Brasilia, excluding capital contributions. Cash receipts, not ARR.';

-- Keep ARR exactly equal to the displayed (cent-rounded) MRR × 12.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.admin_valuation_metrics()'::regprocedure) INTO definition;
  definition:=replace(definition,'''arr'',round(coalesce(sum(monthly_value),0)*12,2)', '''arr'',round(coalesce(sum(monthly_value),0),2)*12');
  EXECUTE definition;
END $$;

-- Read-only valuation inputs. No financial records, prices or reconciliation states are changed.
-- MRR is the CURRENT monthly registration value, not cash received or an annual installment.
-- Rollback: remove the report caller, then DROP FUNCTION public.admin_valuation_metrics().
CREATE OR REPLACE FUNCTION public.admin_valuation_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public SET timezone = 'America/Sao_Paulo'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_end date := date_trunc('month', v_today)::date - 1;
  v_start date := (date_trunc('month', v_today) - interval '12 months')::date;
  v_current jsonb; v_financial jsonb; v_history jsonb; v_cash jsonb;
  v_metrics jsonb := '[]'::jsonb;
  v_retention jsonb := jsonb_build_object('month',null,'churn_pct',null,'nrr_pct',null,'mrr_growth_pct',null);
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.can_read_admin_financial(auth.uid()),false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  WITH eligible AS (
    SELECT c.id,c.billing_cycle,c.subscription_expires_at,
      greatest(0,CASE WHEN coalesce(c.custom_price,0)>0 AND (c.custom_price_permanent IS TRUE OR coalesce(c.custom_price_months,0)>coalesce(c.custom_price_payments_made,0))
        THEN c.custom_price ELSE coalesce(c.subscription_value,0) END) AS monthly_value
    FROM public.companies c
    WHERE c.subscription_status='active' AND coalesce(c.is_internal_account,false)=false AND coalesce(c.is_demo,false)=false
      AND EXISTS(SELECT 1 FROM public.company_payments p WHERE p.company_id=c.id AND p.amount>0 AND p.payment_date<=now() AND true)
  ), active AS (
    SELECT * FROM eligible WHERE subscription_expires_at>=now()
  ), ranked AS (
    SELECT *,row_number() OVER(ORDER BY monthly_value DESC,id) rank FROM active
  )
  SELECT jsonb_build_object(
    'mrr',round(coalesce(sum(monthly_value),0),2),
    'arr',round(coalesce(sum(monthly_value),0)*12,2),
    'active_customers',count(*),
    'annual_customers',count(*) FILTER(WHERE billing_cycle='yearly'),
    'missing_value_customers',count(*) FILTER(WHERE monthly_value<=0),
    'overdue_active_customers',(SELECT count(*) FROM eligible WHERE subscription_expires_at<now() OR subscription_expires_at IS NULL),
    'top1_pct',round(100*sum(monthly_value) FILTER(WHERE rank=1)/nullif(sum(monthly_value),0),2),
    'top5_pct',round(100*sum(monthly_value) FILTER(WHERE rank<=5)/nullif(sum(monthly_value),0),2)
  ) INTO v_current FROM ranked;

  -- Reuse the DFC realized bank ledger, including external accounts and transfer elimination.
  v_cash:=public.admin_cash_flow_report_v2(v_start,v_end,null);
  WITH valid_tx AS MATERIALIZED (
    SELECT t.type,t.category,t.amount,t.transaction_date AS cash_at
    FROM public.admin_financial_transactions t WHERE true
  ), classified AS (
    SELECT t.*,date_trunc('month',cash_at)::date AS month,
      t.category IN ('partner_contribution','aporte_socio') AS capital,
      c.affects_result IS DISTINCT FROM false AS affects,
      CASE WHEN t.type='income' THEN 'revenue'
        WHEN c.dre_bucket IN ('revenue_reduction','tax','cpv','opex','non_operating') THEN c.dre_bucket
        ELSE 'opex' END AS bucket,
      c.name IS NULL OR c.dre_bucket IS NULL OR t.category IN ('despesa_nao_categorizada','receita_indefinida') AS unclassified
    FROM valid_tx t LEFT JOIN public.admin_financial_categories c ON c.name=t.category
    WHERE cash_at>=v_start::timestamptz AND cash_at<(v_end+1)::timestamptz
  ), totals AS (
    SELECT month,
      coalesce(sum(amount) FILTER(WHERE type='income' AND affects AND NOT capital),0) revenue,
      coalesce(sum(amount) FILTER(WHERE type='income' AND affects AND NOT capital AND category IN ('sale','first_sale','renewal','upgrade')),0) recurring_receipts,
      coalesce(sum(CASE WHEN type='income' THEN amount ELSE -amount END) FILTER(WHERE affects AND NOT capital AND bucket<>'non_operating'),0) operating_result,
      coalesce(sum(abs(amount)) FILTER(WHERE affects AND NOT capital AND unclassified),0) unclassified_amount,
      coalesce(sum(amount) FILTER(WHERE type='income' AND capital),0) capital_excluded
    FROM classified GROUP BY month
  ), cash_months AS (
    SELECT date_trunc('month',d.day)::date AS month,sum(d.realized_income-d.realized_expense) net_cash
    FROM jsonb_to_recordset(coalesce(v_cash->'days','[]')) AS d(day date,realized_income numeric,realized_expense numeric) GROUP BY 1
  ), months AS (
    SELECT g::date AS month,coalesce(t.revenue,0) revenue,coalesce(t.recurring_receipts,0) recurring_receipts,
      coalesce(t.operating_result,0) operating_result,coalesce(t.unclassified_amount,0) unclassified_amount,
      coalesce(t.capital_excluded,0) capital_excluded,coalesce(b.net_cash,0) net_cash
    FROM generate_series(v_start::timestamp,v_end::timestamp,interval '1 month') g
    LEFT JOIN totals t ON t.month=g::date LEFT JOIN cash_months b ON b.month=g::date
  ), overdue AS (
    SELECT coalesce(sum(p.amount),0) amount,count(*) n FROM public.subscription_payments p
    JOIN public.companies c ON c.id=p.company_id
    WHERE coalesce(c.is_internal_account,false)=false AND coalesce(c.is_demo,false)=false AND p.status IN ('PENDING','OVERDUE','CREATED') AND p.paid_at IS NULL AND p.due_date<v_today
      AND p.amount>0
  ), coverage AS (
    SELECT least(12,greatest(0,(extract(year from age(v_end+1,date_trunc('month',min(cash_at))::date))*12
      +extract(month from age(v_end+1,date_trunc('month',min(cash_at))::date)))))::int n
    FROM valid_tx WHERE cash_at<(v_end+1)::timestamptz
  )
  SELECT jsonb_build_object(
    'revenue',round(sum(revenue),2),'recurring_receipts',round(sum(recurring_receipts),2),
    'other_receipts',round(sum(revenue-recurring_receipts),2),'operating_result',round(sum(operating_result),2),
    'operating_margin_pct',round(100*sum(operating_result)/nullif(sum(revenue),0),2),
    'net_cash',round(sum(net_cash),2),'observed_months',coalesce((SELECT n FROM coverage),0),
    'unclassified_amount',round(sum(unclassified_amount),2),'capital_excluded',round(sum(capital_excluded),2),
    'overdue_amount',(SELECT amount FROM overdue),'overdue_count',(SELECT n FROM overdue),
    'cash_first_movement',v_cash->'first_movement'
  ),jsonb_agg(jsonb_build_object('month',month,'revenue',round(revenue,2),'operating_result',round(operating_result,2),'net_cash',round(net_cash,2),'mrr',null) ORDER BY month)
  INTO v_financial,v_history FROM months;

  v_warnings:=v_warnings||jsonb_build_array('O histórico mensal de MRR, churn e retenção ainda não está disponível nesta base. Esses indicadores não são estimados a partir do status atual das empresas.');
  IF (v_current->>'annual_customers')::int>0 THEN
    v_warnings:=v_warnings||jsonb_build_array('O MRR usa o valor mensal cadastrado, inclusive nos anuais. Descontos anuais negociados podem não estar refletidos em cadastros antigos; ajuste o MRR na simulação quando necessário. Parcelas e recebimentos antecipados não são somados ao MRR.');
  END IF;
  IF (v_current->>'overdue_active_customers')::int>0 THEN
    v_warnings:=v_warnings||jsonb_build_array('Empresas com status ativo, mas vencidas ou sem vencimento, ficam fora do MRR cadastral desta estimativa.');
  END IF;
  IF (v_current->>'missing_value_customers')::int>0 THEN
    v_warnings:=v_warnings||jsonb_build_array('Há clientes ativos e pagos sem valor mensal positivo no cadastro. O MRR pode estar incompleto.');
  END IF;
  IF (v_financial->>'observed_months')::int<12 THEN
    v_warnings:=v_warnings||jsonb_build_array('A base tem menos de 12 meses de registros financeiros. Meses anteriores ao início aparecem zerados; o resultado não é anualizado automaticamente.');
  END IF;
  IF (v_financial->>'unclassified_amount')::numeric>0 THEN
    v_warnings:=v_warnings||jsonb_build_array('Há lançamentos sem classificação suficiente no período; eles continuam incluídos no resultado. Revise as categorias antes de usar o método por resultado.');
  END IF;
  v_warnings:=v_warnings||jsonb_build_array('Receita e resultado seguem as datas de caixa do DRE. Aportes de sócios são excluídos nesta análise; distribuição de lucros fica fora do resultado operacional. O resultado não representa EBITDA nem lucro por competência.',
    'Cobranças vencidas são valores abertos no cadastro de cobranças, não uma taxa de inadimplência nem confirmação de perda. Cobranças antigas ou duplicadas exigem revisão.',
    'Variação de caixa vem do DFC realizado e inclui movimentos não operacionais. O extrato pode cobrir menos meses que o DRE.');
  RETURN jsonb_build_object('as_of',now(),'period_start',v_start,'period_end',v_end,'current',v_current,
    'financial',v_financial,'history',v_history,'retention',v_retention,'warnings',v_warnings);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_valuation_metrics() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_valuation_metrics() TO authenticated;
COMMENT ON FUNCTION public.admin_valuation_metrics() IS 'Admin-only valuation inputs: current registered monthly MRR and last 12 closed months of cash-basis results. Read-only; not a market valuation.';

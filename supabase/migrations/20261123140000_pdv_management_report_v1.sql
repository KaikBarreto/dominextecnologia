-- Central gerencial dos Relatorios da Loja.
--
-- Uma unica RPC entrega comparacao, tendencia, pagamentos e caixas sem expor
-- IDs operacionais. As mesmas travas dos relatorios existentes sao aplicadas
-- antes de qualquer leitura. O escopo de estoque entra no fato antes das
-- agregacoes; CMV desconhecido em qualquer fato deixa CMV/margem NULL.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.pdv_management_report_v1(p_from date,p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_context record;
  v_sees_all boolean;
  v_timezone text:='America/Sao_Paulo';
  v_days integer;
  v_previous_from date;
  v_previous_to date;
  v_result jsonb;
BEGIN
  IF public.pdv_can_operate_other_cash_v2(auth.uid()) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Seu perfil não permite consultar dados de outros caixas.'
      USING ERRCODE='42501',DETAIL='code=pdv_cross_cash_report_denied';
  END IF;
  IF public.pdv_current_actor_has_explicit_permission_v3('fn:view_finance_totals') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Seu perfil não permite consultar totais financeiros.'
      USING ERRCODE='42501',DETAIL='code=pdv_finance_report_denied';
  END IF;
  SELECT * INTO v_context FROM public.pdv_reports_context_v2('screen:pdv_reports',true);

  IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_to-p_from>365 THEN
    RAISE EXCEPTION 'Período inválido: consulte no máximo 366 dias.'
      USING ERRCODE='22023',DETAIL='code=pdv_management_report_period_invalid';
  END IF;

  v_days:=p_to-p_from+1;
  v_previous_to:=p_from-1;
  v_previous_from:=v_previous_to-(v_days-1);
  v_sees_all:=public.is_super_admin(v_context.user_id) IS TRUE
    OR public.is_admin_or_gestor(v_context.user_id) IS TRUE;

  v_timezone:=COALESCE(NULLIF((
    SELECT settings.timezone FROM public.company_settings settings
     WHERE settings.company_id=v_context.company_id
     ORDER BY settings.updated_at DESC LIMIT 1
  ),''),'America/Sao_Paulo');
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names zone WHERE zone.name=v_timezone) THEN
    v_timezone:='America/Sao_Paulo';
  END IF;

  WITH accessible AS MATERIALIZED (
    SELECT stock.id FROM public.stocks stock
     WHERE stock.company_id=v_context.company_id
       AND public.can_access_stock(v_context.user_id,stock.id) IS TRUE
  ), facts AS MATERIALIZED (
    SELECT fact.*
      FROM public.pdv_commercial_facts_v2(v_context.company_id) fact
     WHERE fact.event_date BETWEEN v_previous_from AND p_to
       AND (fact.stock_id IN (SELECT accessible.id FROM accessible)
         OR (fact.stock_id IS NULL AND v_sees_all))
  ), current_facts AS MATERIALIZED (
    SELECT * FROM facts WHERE event_date BETWEEN p_from AND p_to
  ), previous_facts AS MATERIALIZED (
    SELECT * FROM facts WHERE event_date BETWEEN v_previous_from AND v_previous_to
  ), current_totals AS (
    SELECT count(DISTINCT order_id) FILTER(WHERE event_kind='delivery')::integer orders_count,
      COALESCE(sum(net_quantity),0) quantity,
      round(COALESCE(sum(net_revenue),0),2) revenue,
      CASE WHEN count(*)=0 THEN 0
           WHEN bool_or(NOT cost_known) THEN NULL
           ELSE round(COALESCE(sum(net_cmv),0),2) END cmv,
      count(DISTINCT event_id) FILTER(WHERE event_kind='return')::integer returns_count,
      round(abs(COALESCE(sum(net_revenue) FILTER(WHERE event_kind='return'),0)),2) returns_impact
    FROM current_facts
  ), previous_totals AS (
    SELECT count(DISTINCT order_id) FILTER(WHERE event_kind='delivery')::integer orders_count,
      COALESCE(sum(net_quantity),0) quantity,
      round(COALESCE(sum(net_revenue),0),2) revenue,
      CASE WHEN count(*)=0 THEN 0
           WHEN bool_or(NOT cost_known) THEN NULL
           ELSE round(COALESCE(sum(net_cmv),0),2) END cmv,
      count(DISTINCT event_id) FILTER(WHERE event_kind='return')::integer returns_count,
      round(abs(COALESCE(sum(net_revenue) FILTER(WHERE event_kind='return'),0)),2) returns_impact
    FROM previous_facts
  ), days AS (
    SELECT day::date event_date FROM generate_series(p_from,p_to,interval '1 day') day
  ), daily AS (
    SELECT days.event_date,
      count(DISTINCT fact.order_id) FILTER(WHERE fact.event_kind='delivery')::integer orders_count,
      round(COALESCE(sum(fact.net_revenue),0),2) revenue,
      CASE WHEN count(fact.event_id)=0 THEN 0
           WHEN bool_or(NOT fact.cost_known) THEN NULL
           ELSE round(COALESCE(sum(fact.net_cmv),0),2) END cmv
    FROM days LEFT JOIN current_facts fact ON fact.event_date=days.event_date
    GROUP BY days.event_date
  ), delivered_orders AS MATERIALIZED (
    SELECT DISTINCT order_id FROM current_facts WHERE event_kind='delivery'
  ), payment_grouped AS (
    SELECT payment.method,count(DISTINCT payment.order_id)::integer orders_count,
      round(sum(payment.amount),2) amount
    FROM public.pdv_order_payments payment
    JOIN delivered_orders delivered ON delivered.order_id=payment.order_id
    WHERE payment.company_id=v_context.company_id
      AND (payment.contract_version IS DISTINCT FROM 2 OR payment.coverage_status='authorized')
    GROUP BY payment.method
  ), payment_total AS (
    SELECT round(COALESCE(sum(amount),0),2) amount FROM payment_grouped
  ), cash_totals AS (
    SELECT count(*)::integer closed_sessions,
      round(COALESCE(sum(session.expected_amount),0),2) expected,
      round(COALESCE(sum(session.counted_amount),0),2) counted,
      round(COALESCE(sum(session.difference),0),2) difference,
      round(abs(COALESCE(sum(session.difference) FILTER(WHERE session.difference<0),0)),2) shortage,
      round(COALESCE(sum(session.difference) FILTER(WHERE session.difference>0),0),2) surplus
    FROM public.pdv_cash_sessions session
    JOIN public.pdv_terminals terminal
      ON terminal.id=session.terminal_id AND terminal.company_id=session.company_id
    WHERE session.company_id=v_context.company_id AND session.status='fechada'
      AND (session.closed_at AT TIME ZONE v_timezone)::date BETWEEN p_from AND p_to
      AND (terminal.stock_id IN (SELECT accessible.id FROM accessible)
        OR (terminal.stock_id IS NULL AND v_sees_all))
  )
  SELECT jsonb_build_object(
    'scope','pdv_management','from',p_from,'to',p_to,
    'previous_from',v_previous_from,'previous_to',v_previous_to,
    'current',jsonb_build_object(
      'orders_count',current_totals.orders_count,'quantity',current_totals.quantity,
      'revenue',current_totals.revenue,'cmv',current_totals.cmv,
      'margin',CASE WHEN current_totals.cmv IS NULL THEN NULL ELSE round(current_totals.revenue-current_totals.cmv,2) END,
      'margin_rate',CASE WHEN current_totals.cmv IS NULL OR current_totals.revenue=0 THEN NULL
                         ELSE round((current_totals.revenue-current_totals.cmv)/current_totals.revenue,4) END,
      'average_ticket',CASE WHEN current_totals.orders_count=0 THEN 0
                            ELSE round(current_totals.revenue/current_totals.orders_count,2) END,
      'returns_count',current_totals.returns_count,'returns_impact',current_totals.returns_impact
    ),
    'previous',jsonb_build_object(
      'orders_count',previous_totals.orders_count,'quantity',previous_totals.quantity,
      'revenue',previous_totals.revenue,'cmv',previous_totals.cmv,
      'margin',CASE WHEN previous_totals.cmv IS NULL THEN NULL ELSE round(previous_totals.revenue-previous_totals.cmv,2) END,
      'margin_rate',CASE WHEN previous_totals.cmv IS NULL OR previous_totals.revenue=0 THEN NULL
                         ELSE round((previous_totals.revenue-previous_totals.cmv)/previous_totals.revenue,4) END,
      'average_ticket',CASE WHEN previous_totals.orders_count=0 THEN 0
                            ELSE round(previous_totals.revenue/previous_totals.orders_count,2) END,
      'returns_count',previous_totals.returns_count,'returns_impact',previous_totals.returns_impact
    ),
    'daily',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'date',daily.event_date,'orders_count',daily.orders_count,'revenue',daily.revenue,
      'cmv',daily.cmv,'margin',CASE WHEN daily.cmv IS NULL THEN NULL ELSE round(daily.revenue-daily.cmv,2) END
    ) ORDER BY daily.event_date) FROM daily),'[]'::jsonb),
    'payments',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'method',payment_grouped.method,'orders_count',payment_grouped.orders_count,
      'amount',payment_grouped.amount,
      'share',CASE WHEN payment_total.amount=0 THEN 0 ELSE round(payment_grouped.amount/payment_total.amount,4) END
    ) ORDER BY payment_grouped.amount DESC,payment_grouped.method)
      FROM payment_grouped CROSS JOIN payment_total),'[]'::jsonb),
    'payment_total',(SELECT amount FROM payment_total),
    'cash',jsonb_build_object(
      'closed_sessions',cash_totals.closed_sessions,'expected',cash_totals.expected,
      'counted',cash_totals.counted,'difference',cash_totals.difference,
      'shortage',cash_totals.shortage,'surplus',cash_totals.surplus
    )
  ) INTO v_result
  FROM current_totals CROSS JOIN previous_totals CROSS JOIN cash_totals;

  RETURN v_result;
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_management_report_v1(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_management_report_v1(date,date) TO authenticated,service_role;

COMMENT ON FUNCTION public.pdv_management_report_v1(date,date) IS
  'Central gerencial do PDV. Vendas por competencia de entrega/devolucao, pagamentos dos pedidos entregues no periodo e caixas por fechamento local. Compara periodo anterior equivalente. Escopo de estoque antes das agregacoes e CMV desconhecido fail-closed.';

COMMIT;

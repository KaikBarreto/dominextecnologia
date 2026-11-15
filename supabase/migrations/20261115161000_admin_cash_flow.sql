BEGIN;
CREATE OR REPLACE VIEW public.admin_realized_asaas_movements WITH (security_invoker=true) AS
SELECT l.* FROM public.ledger_asaas l
WHERE NOT (l.source='webhook' AND coalesce(l.raw_payload->'payment'->>'status', l.raw_payload->'raw_payload'->'payment'->>'status',l.raw_payload->>'status','') IN ('CONFIRMED','PENDING','AWAITING_RISK_ANALYSIS'))
AND NOT (l.source='webhook' AND l.asaas_payment_id IS NOT NULL AND EXISTS (
 SELECT 1 FROM public.ledger_asaas synced
 WHERE synced.source='sync' AND synced.id<>l.id AND synced.asaas_payment_id=l.asaas_payment_id
 AND synced.direction=l.direction AND synced.amount=l.amount
 AND (synced.asaas_event_type=l.asaas_event_type OR (l.asaas_event_type IS NULL AND l.direction='credit' AND synced.asaas_event_type='PAYMENT_RECEIVED'))
));
GRANT SELECT ON public.admin_realized_asaas_movements TO authenticated,service_role;
COMMENT ON VIEW public.admin_realized_asaas_movements IS 'Movimentos liquidados; webhook de cobrança confirmada/pendente não é caixa. O sync do extrato torna o movimento realizado sem apagar histórico.';
CREATE TABLE IF NOT EXISTS public.admin_cash_flow_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 direction text NOT NULL CHECK(direction IN ('credit','debit')),
 description text NOT NULL CHECK(length(trim(description))>0),
 amount numeric(18,2) NOT NULL CHECK(amount>0 AND amount::text NOT IN ('NaN','Infinity','-Infinity')),
 due_date date NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','settled','cancelled')),
 ledger_id uuid REFERENCES public.ledger_asaas(id),
 created_by uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((status='settled' AND ledger_id IS NOT NULL) OR (status<>'settled' AND ledger_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_cash_flow_plans_ledger_unique ON public.admin_cash_flow_plans(ledger_id) WHERE ledger_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.validate_admin_cash_flow_plan() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $trigger$
BEGIN
 IF NEW.status='settled' AND NOT EXISTS(SELECT 1 FROM public.admin_realized_asaas_movements l WHERE l.id=NEW.ledger_id AND l.direction=NEW.direction AND l.amount=NEW.amount) THEN
  RAISE EXCEPTION 'plan_movement_mismatch';
 END IF;
 RETURN NEW;
END;$trigger$;
DROP TRIGGER IF EXISTS validate_admin_cash_flow_plan ON public.admin_cash_flow_plans;
CREATE TRIGGER validate_admin_cash_flow_plan BEFORE INSERT OR UPDATE ON public.admin_cash_flow_plans FOR EACH ROW EXECUTE FUNCTION public.validate_admin_cash_flow_plan();
ALTER TABLE public.admin_cash_flow_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_cash_flow_plans_access ON public.admin_cash_flow_plans;
CREATE POLICY admin_cash_flow_plans_access ON public.admin_cash_flow_plans FOR ALL TO authenticated USING ((public.is_super_admin(auth.uid()) OR (EXISTS(SELECT 1 FROM public.admin_permissions WHERE user_id=auth.uid() AND permission='admin_financeiro') AND EXISTS(SELECT 1 FROM public.admin_permissions WHERE user_id=auth.uid() AND permission='admin_financeiro_totais') AND EXISTS(SELECT 1 FROM public.admin_permissions WHERE user_id=auth.uid() AND permission='admin_financeiro_lancamentos')))) WITH CHECK ((public.is_super_admin(auth.uid()) OR (EXISTS(SELECT 1 FROM public.admin_permissions WHERE user_id=auth.uid() AND permission='admin_financeiro') AND EXISTS(SELECT 1 FROM public.admin_permissions WHERE user_id=auth.uid() AND permission='admin_financeiro_totais') AND EXISTS(SELECT 1 FROM public.admin_permissions WHERE user_id=auth.uid() AND permission='admin_financeiro_lancamentos'))));
DROP POLICY IF EXISTS admin_cash_flow_plans_read ON public.admin_cash_flow_plans;
CREATE POLICY admin_cash_flow_plans_read ON public.admin_cash_flow_plans FOR SELECT TO authenticated USING ((public.is_super_admin(auth.uid()) OR (EXISTS(SELECT 1 FROM public.admin_permissions WHERE user_id=auth.uid() AND permission='admin_financeiro') AND EXISTS(SELECT 1 FROM public.admin_permissions WHERE user_id=auth.uid() AND permission='admin_financeiro_totais'))));
GRANT SELECT,INSERT,UPDATE ON public.admin_cash_flow_plans TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_cash_flow_report(p_start date,p_end date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT ((public.is_super_admin(auth.uid()) OR (EXISTS(SELECT 1 FROM public.admin_permissions WHERE user_id=auth.uid() AND permission='admin_financeiro') AND EXISTS(SELECT 1 FROM public.admin_permissions WHERE user_id=auth.uid() AND permission='admin_financeiro_totais')))) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end-p_start>365 THEN RAISE EXCEPTION 'invalid_period'; END IF;
 WITH realized AS (
  SELECT (occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
    sum(CASE WHEN direction='credit' THEN amount ELSE 0 END) income,
    sum(CASE WHEN direction='debit' THEN amount ELSE 0 END) expense
  FROM public.admin_realized_asaas_movements WHERE occurred_at >= p_start::timestamp AT TIME ZONE 'America/Sao_Paulo' AND occurred_at < (p_end+1)::timestamp AT TIME ZONE 'America/Sao_Paulo' GROUP BY 1
 ), confirmed AS (
  SELECT DISTINCT ON (l.asaas_payment_id,l.direction,l.amount)
    l.direction,l.amount,coalesce(l.raw_payload->'payment'->>'estimatedCreditDate',l.raw_payload->'raw_payload'->'payment'->>'estimatedCreditDate',l.raw_payload->>'estimatedCreditDate') credit_date
  FROM public.ledger_asaas l
  WHERE l.source='webhook' AND l.asaas_payment_id IS NOT NULL
  AND coalesce(l.raw_payload->'payment'->>'status',l.raw_payload->'raw_payload'->'payment'->>'status',l.raw_payload->>'status')='CONFIRMED'
  AND NOT EXISTS(SELECT 1 FROM public.admin_realized_asaas_movements settled WHERE settled.asaas_payment_id=l.asaas_payment_id AND settled.direction='credit' AND settled.asaas_event_type IN ('PAYMENT_RECEIVED','PAYMENT_CONFIRMED','RECEIVABLE_ANTICIPATION_GROSS_CREDIT'))
  ORDER BY l.asaas_payment_id,l.direction,l.amount,l.created_at DESC,l.id
 ), expected AS (
  SELECT due_date AS day, 'credit'::text direction, amount FROM public.subscription_payments sp
  WHERE due_date BETWEEN p_start AND p_end AND upper(status) IN ('PENDING','OVERDUE','AWAITING_RISK_ANALYSIS')
  AND paid_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.admin_realized_asaas_movements l WHERE l.asaas_payment_id=sp.asaas_payment_id AND l.direction='credit' AND l.asaas_event_type IN ('PAYMENT_RECEIVED','PAYMENT_CONFIRMED','RECEIVABLE_ANTICIPATION_GROSS_CREDIT'))
  UNION ALL
  SELECT credit_date::date,direction,amount FROM confirmed WHERE credit_date ~ '^\d{4}-\d{2}-\d{2}$' AND credit_date BETWEEN p_start::text AND p_end::text
  UNION ALL
  SELECT due_date,direction,amount FROM public.admin_cash_flow_plans WHERE status='pending' AND due_date BETWEEN p_start AND p_end
 ), forecast AS (
  SELECT day,sum(CASE WHEN direction='credit' THEN amount ELSE 0 END) income,sum(CASE WHEN direction='debit' THEN amount ELSE 0 END) expense FROM expected GROUP BY day
 ), days AS (
  SELECT d::date AS day,coalesce(r.income,0) realized_income,coalesce(r.expense,0) realized_expense,coalesce(f.income,0) pending_income,coalesce(f.expense,0) pending_expense
  FROM generate_series(p_start::timestamp,p_end::timestamp,'1 day') d LEFT JOIN realized r ON r.day=d::date LEFT JOIN forecast f ON f.day=d::date
 )
 SELECT jsonb_build_object(
  'opening_balance',(SELECT coalesce(sum(CASE WHEN direction='credit' THEN amount ELSE -amount END),0) FROM public.admin_realized_asaas_movements WHERE occurred_at < p_start::timestamp AT TIME ZONE 'America/Sao_Paulo'),
  'first_movement',(SELECT min(occurred_at) FROM public.ledger_asaas),
  'days',(SELECT coalesce(jsonb_agg(to_jsonb(days) ORDER BY day),'[]'::jsonb) FROM days),
  'overdue_income',(SELECT coalesce(sum(amount),0) FROM public.subscription_payments WHERE due_date<p_start AND upper(status) IN ('PENDING','OVERDUE') AND paid_at IS NULL),
  'confirmed_without_date',(SELECT coalesce(sum(amount),0) FROM confirmed WHERE direction='credit' AND (credit_date IS NULL OR credit_date !~ '^\d{4}-\d{2}-\d{2}$')),
  'plans_count',(SELECT count(*) FROM public.admin_cash_flow_plans WHERE due_date BETWEEN p_start AND p_end),
  'plans',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY due_date,id),'[]'::jsonb) FROM (SELECT id,direction,description,amount,due_date,status FROM public.admin_cash_flow_plans WHERE due_date BETWEEN p_start AND p_end ORDER BY due_date,id LIMIT 500)p)
 ) INTO v_result;
 RETURN v_result;
END;$fn$;
REVOKE ALL ON FUNCTION public.admin_cash_flow_report(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_cash_flow_report(date,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_ledger_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT ((public.is_super_admin(auth.uid()) OR (EXISTS(SELECT 1 FROM public.admin_permissions WHERE user_id=auth.uid() AND permission='admin_financeiro') AND EXISTS(SELECT 1 FROM public.admin_permissions WHERE user_id=auth.uid() AND permission='admin_financeiro_totais')))) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 RETURN (SELECT jsonb_build_object('balance',coalesce(sum(CASE WHEN direction='credit' THEN amount ELSE -amount END),0),'count',count(*),'pending_count',count(*) FILTER(WHERE status IN ('pending_categorization','partially_categorized')),'last_imported_at',max(created_at)) FROM public.admin_realized_asaas_movements);
END;$fn$;
REVOKE ALL ON FUNCTION public.admin_ledger_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_ledger_summary() TO authenticated;
COMMIT;

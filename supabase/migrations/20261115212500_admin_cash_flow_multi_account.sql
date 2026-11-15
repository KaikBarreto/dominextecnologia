BEGIN;
ALTER TABLE public.admin_cash_flow_plans ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.admin_bank_accounts(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS admin_cash_flow_plans_account_due ON public.admin_cash_flow_plans(bank_account_id,due_date);
-- Mantém o endpoint antigo estritamente Asaas: planos externos jamais entram
-- nele enquanto integrações ainda o consomem.
DO $old$
DECLARE definition text; rewritten text; scope text := '(bank_account_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_bank_accounts a WHERE a.id=admin_cash_flow_plans.bank_account_id AND a.account_kind=''asaas''))';
BEGIN
 SELECT pg_get_functiondef('public.admin_cash_flow_report(date,date)'::regprocedure) INTO definition;
 rewritten := replace(definition, 'FROM public.admin_cash_flow_plans WHERE status=''pending'' AND due_date BETWEEN p_start AND p_end', 'FROM public.admin_cash_flow_plans WHERE status=''pending'' AND due_date BETWEEN p_start AND p_end AND '||scope);
 rewritten := replace(rewritten, 'FROM public.admin_cash_flow_plans WHERE due_date BETWEEN p_start AND p_end', 'FROM public.admin_cash_flow_plans WHERE due_date BETWEEN p_start AND p_end AND '||scope);
 IF rewritten=definition THEN RAISE EXCEPTION 'admin_cash_flow_report_contract_changed'; END IF;
 EXECUTE rewritten;
END;$old$;

ALTER TABLE public.admin_cash_flow_plans ADD COLUMN bank_transaction_id uuid REFERENCES public.admin_bank_transactions(id);
DO $constraint$
DECLARE constraint_name text;
BEGIN
 FOR constraint_name IN SELECT conname FROM pg_constraint WHERE conrelid='public.admin_cash_flow_plans'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%ledger_id%' LOOP
  EXECUTE format('ALTER TABLE public.admin_cash_flow_plans DROP CONSTRAINT %I',constraint_name);
 END LOOP;
END;$constraint$;
ALTER TABLE public.admin_cash_flow_plans ADD CONSTRAINT admin_plan_settlement_source CHECK((status='settled' AND num_nonnulls(ledger_id,bank_transaction_id)=1) OR (status<>'settled' AND num_nonnulls(ledger_id,bank_transaction_id)=0));
CREATE UNIQUE INDEX admin_plan_bank_transaction_unique ON public.admin_cash_flow_plans(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.validate_admin_cash_flow_plan() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $fn$
BEGIN
 IF NEW.status='settled' THEN
  IF NEW.ledger_id IS NOT NULL THEN
   IF (NEW.bank_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_bank_accounts WHERE id=NEW.bank_account_id AND account_kind='asaas')) OR NOT EXISTS(SELECT 1 FROM public.admin_realized_asaas_movements l WHERE l.id=NEW.ledger_id AND l.direction=NEW.direction AND l.amount=NEW.amount) THEN RAISE EXCEPTION 'plan_movement_mismatch'; END IF;
  ELSIF NEW.bank_transaction_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.admin_bank_transactions b WHERE b.id=NEW.bank_transaction_id AND b.bank_account_id=NEW.bank_account_id AND b.amount=CASE WHEN NEW.direction='credit' THEN NEW.amount ELSE -NEW.amount END) THEN RAISE EXCEPTION 'plan_movement_mismatch'; END IF;
  ELSE RAISE EXCEPTION 'plan_movement_mismatch'; END IF;
 END IF;
 RETURN NEW;
END;$fn$;

CREATE OR REPLACE FUNCTION public.admin_cash_flow_report_v2(p_start date,p_end date,p_account_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE result jsonb; asaas_report jsonb:='{}'; include_asaas boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_read_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end-p_start>365 THEN RAISE EXCEPTION 'invalid_period'; END IF;
 IF p_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_bank_accounts WHERE id=p_account_id) THEN RAISE EXCEPTION 'bank_account_not_found'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.admin_bank_accounts WHERE account_kind='asaas' AND (p_account_id IS NULL OR id=p_account_id)) INTO include_asaas;
 IF include_asaas THEN asaas_report:=public.admin_cash_flow_report(p_start,p_end); END IF;
 WITH accounts AS (SELECT * FROM public.admin_bank_accounts WHERE p_account_id IS NULL OR id=p_account_id),
 transfers AS (
  SELECT t.* FROM public.admin_bank_transfers t WHERE t.active
  AND coalesce((SELECT b.amount FROM public.admin_bank_transactions b WHERE b.id=t.debit_bank_transaction_id AND b.amount<0),(SELECT -l.amount FROM public.admin_realized_asaas_movements l WHERE l.id=t.debit_ledger_id AND l.direction='debit'))=-t.amount
  AND coalesce((SELECT b.amount FROM public.admin_bank_transactions b WHERE b.id=t.credit_bank_transaction_id AND b.amount>0),(SELECT l.amount FROM public.admin_realized_asaas_movements l WHERE l.id=t.credit_ledger_id AND l.direction='credit'))=t.amount
 ), movements AS (
  SELECT (l.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS day, CASE WHEN l.direction='credit' THEN l.amount ELSE -l.amount END AS amount,l.occurred_at AS at_time,
   p_account_id IS NULL AND EXISTS(SELECT 1 FROM transfers t WHERE t.debit_ledger_id=l.id OR t.credit_ledger_id=l.id) AS internal_transfer
  FROM public.admin_realized_asaas_movements l WHERE include_asaas
  UNION ALL
  SELECT (b.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date,b.amount,b.occurred_at,
   p_account_id IS NULL AND EXISTS(SELECT 1 FROM transfers t WHERE t.debit_bank_transaction_id=b.id OR t.credit_bank_transaction_id=b.id)
  FROM public.admin_bank_transactions b JOIN accounts a ON a.id=b.bank_account_id WHERE a.account_kind='external'
 ), realized AS (
  SELECT day,coalesce(sum(amount) FILTER(WHERE amount>0 AND NOT internal_transfer),0) AS income,
   coalesce(-sum(amount) FILTER(WHERE amount<0 AND NOT internal_transfer),0) AS expense,
   coalesce(sum(amount) FILTER(WHERE internal_transfer),0) AS balance_adjustment
  FROM movements WHERE day BETWEEN p_start AND p_end GROUP BY day
 ), opening_adjustments AS (
  SELECT opening_balance_date AS day,sum(opening_balance) AS amount FROM accounts
  WHERE account_kind='external' AND opening_balance_date>p_start AND opening_balance_date<=p_end GROUP BY opening_balance_date
 ), plans AS (
  SELECT p.* FROM public.admin_cash_flow_plans p WHERE p_account_id IS NULL OR p.bank_account_id=p_account_id OR (p.bank_account_id IS NULL AND include_asaas)
 ), external_forecast AS (
  SELECT p.due_date AS day,sum(p.amount) FILTER(WHERE p.direction='credit') AS income,sum(p.amount) FILTER(WHERE p.direction='debit') AS expense
  FROM plans p JOIN accounts a ON a.id=p.bank_account_id WHERE a.account_kind='external' AND p.status='pending' AND p.due_date BETWEEN p_start AND p_end GROUP BY p.due_date
 ), asaas_forecast AS (
  SELECT * FROM jsonb_to_recordset(coalesce(asaas_report->'days','[]')) AS d(day date,pending_income numeric,pending_expense numeric)
 ), days AS (
  SELECT d::date AS day,coalesce(r.income,0) AS realized_income,coalesce(r.expense,0) AS realized_expense,
   coalesce(f.pending_income,0)+coalesce(e.income,0) AS pending_income,coalesce(f.pending_expense,0)+coalesce(e.expense,0) AS pending_expense,
   coalesce(r.balance_adjustment,0)+coalesce(o.amount,0) AS balance_adjustment
  FROM generate_series(p_start::timestamp,p_end::timestamp,'1 day') d
  LEFT JOIN realized r ON r.day=d::date LEFT JOIN asaas_forecast f ON f.day=d::date
  LEFT JOIN external_forecast e ON e.day=d::date LEFT JOIN opening_adjustments o ON o.day=d::date
 ), opening AS (
  SELECT coalesce(sum(amount),0) AS amount FROM movements WHERE day<p_start
  UNION ALL SELECT coalesce(sum(opening_balance),0) FROM accounts WHERE account_kind='external' AND (opening_balance_date<=p_start OR opening_balance_date IS NULL)
 )
 SELECT jsonb_build_object(
  'opening_balance',(SELECT coalesce(sum(amount),0) FROM opening),
  'first_movement',(SELECT min(at_time) FROM movements),
  'days',(SELECT coalesce(jsonb_agg(to_jsonb(days) ORDER BY day),'[]') FROM days),
  'overdue_income',coalesce((asaas_report->>'overdue_income')::numeric,0)+(SELECT coalesce(sum(p.amount),0) FROM plans p JOIN accounts a ON a.id=p.bank_account_id WHERE a.account_kind='external' AND p.status='pending' AND p.direction='credit' AND p.due_date<p_start),
  'confirmed_without_date',coalesce((asaas_report->>'confirmed_without_date')::numeric,0),
  'plans_count',(SELECT count(*) FROM plans WHERE due_date BETWEEN p_start AND p_end),
  'plans',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY due_date,id),'[]') FROM (SELECT id,direction,description,amount,due_date,status,bank_account_id FROM plans WHERE due_date BETWEEN p_start AND p_end ORDER BY due_date,id LIMIT 500)p)
 ) INTO result;
 RETURN result;
END;$fn$;
REVOKE ALL ON FUNCTION public.admin_cash_flow_report_v2(date,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_cash_flow_report_v2(date,date,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_cash_flow_plan(p_request_id uuid,p_direction text,p_description text,p_amount numeric,p_due_date date,p_bank_account_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE previous public.admin_cash_flow_plans%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_manage_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF p_request_id IS NULL OR p_amount IS NULL OR p_amount<>round(p_amount,2) THEN RAISE EXCEPTION 'invalid_plan'; END IF;
 IF p_bank_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_bank_accounts WHERE id=p_bank_account_id AND is_active) THEN RAISE EXCEPTION 'bank_account_not_found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('admin_plan:'||p_request_id::text,0));
 SELECT * INTO previous FROM public.admin_cash_flow_plans WHERE id=p_request_id;
 IF FOUND THEN
  IF previous.created_by IS DISTINCT FROM auth.uid() OR previous.direction IS DISTINCT FROM p_direction OR previous.description IS DISTINCT FROM btrim(p_description) OR previous.amount IS DISTINCT FROM p_amount OR previous.due_date IS DISTINCT FROM p_due_date OR previous.bank_account_id IS DISTINCT FROM p_bank_account_id THEN RAISE EXCEPTION 'request_conflict'; END IF;
  RETURN previous.id;
 END IF;
 INSERT INTO public.admin_cash_flow_plans(id,direction,description,amount,due_date,bank_account_id,created_by) VALUES(p_request_id,p_direction,btrim(p_description),p_amount,p_due_date,p_bank_account_id,auth.uid());
 RETURN p_request_id;
END;$fn$;
REVOKE ALL ON FUNCTION public.admin_create_cash_flow_plan(uuid,text,text,numeric,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_create_cash_flow_plan(uuid,text,text,numeric,date,uuid) TO authenticated;

COMMIT;

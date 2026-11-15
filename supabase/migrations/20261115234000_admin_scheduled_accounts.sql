BEGIN;

ALTER TABLE public.admin_cash_flow_plans
  ADD COLUMN IF NOT EXISTS counterparty text,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.admin_financial_categories(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS series_id uuid,
  ADD COLUMN IF NOT EXISTS series_anchor_day smallint,
  ADD COLUMN IF NOT EXISTS series_occurrence integer,
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

ALTER TABLE public.admin_cash_flow_plans
  DROP CONSTRAINT IF EXISTS admin_cash_flow_plans_counterparty_length,
  ADD CONSTRAINT admin_cash_flow_plans_counterparty_length CHECK (counterparty IS NULL OR length(btrim(counterparty)) <= 240),
  DROP CONSTRAINT IF EXISTS admin_cash_flow_plans_notes_length,
  ADD CONSTRAINT admin_cash_flow_plans_notes_length CHECK (notes IS NULL OR length(notes) <= 5000),
  DROP CONSTRAINT IF EXISTS admin_cash_flow_plans_version_check,
  ADD CONSTRAINT admin_cash_flow_plans_version_check CHECK (version > 0),
  DROP CONSTRAINT IF EXISTS admin_cash_flow_plans_series_shape,
  ADD CONSTRAINT admin_cash_flow_plans_series_shape CHECK (
    (series_id IS NULL AND series_anchor_day IS NULL AND series_occurrence IS NULL)
    OR (series_id IS NOT NULL AND series_anchor_day BETWEEN 1 AND 31 AND series_occurrence >= 1)
  );

CREATE UNIQUE INDEX IF NOT EXISTS admin_cash_flow_plans_request_unique
  ON public.admin_cash_flow_plans(request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS admin_cash_flow_plans_series_occurrence_unique
  ON public.admin_cash_flow_plans(series_id, series_occurrence) WHERE series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS admin_cash_flow_plans_schedule_list
  ON public.admin_cash_flow_plans(direction, status, due_date, bank_account_id, id);
CREATE INDEX IF NOT EXISTS admin_cash_flow_plans_category_id
  ON public.admin_cash_flow_plans(category_id) WHERE category_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_cash_flow_plan_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS admin_cash_flow_plan_touch ON public.admin_cash_flow_plans;
CREATE TRIGGER admin_cash_flow_plan_touch
BEFORE UPDATE ON public.admin_cash_flow_plans
FOR EACH ROW EXECUTE FUNCTION public.admin_cash_flow_plan_touch();

CREATE OR REPLACE FUNCTION public.admin_scheduled_account_due_date(
  p_base_due_date date,
  p_anchor_day integer,
  p_month_offset integer
) RETURNS date LANGUAGE sql IMMUTABLE SET search_path=public AS $fn$
  SELECT month_start + LEAST(p_anchor_day, extract(day FROM (month_start + interval '1 month - 1 day'))::integer) - 1
  FROM (SELECT (date_trunc('month', p_base_due_date)::date + make_interval(months => p_month_offset))::date AS month_start) month;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_assert_scheduled_account_input(
  p_direction text,
  p_description text,
  p_category_id uuid,
  p_amount numeric,
  p_due_date date,
  p_bank_account_id uuid
) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE expected_category_type text;
BEGIN
  IF p_direction IS NULL OR p_direction NOT IN ('credit','debit') OR nullif(btrim(p_description),'') IS NULL
     OR p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount,2) OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_due_date IS NULL THEN
    RAISE EXCEPTION 'invalid_scheduled_account';
  END IF;
  expected_category_type := CASE WHEN p_direction='credit' THEN 'income' ELSE 'expense' END;
  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.admin_financial_categories c WHERE c.id=p_category_id AND c.type=expected_category_type
  ) THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;
  IF p_bank_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.admin_bank_accounts a WHERE a.id=p_bank_account_id AND a.is_active
  ) THEN
    RAISE EXCEPTION 'bank_account_not_found';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_list_scheduled_accounts(
  p_direction text DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_search text DEFAULT NULL,
  p_account_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 30
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_read_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF p_direction IS NOT NULL AND p_direction NOT IN ('credit','debit') THEN RAISE EXCEPTION 'invalid_direction'; END IF;
  IF p_status NOT IN ('all','open','overdue','settled','cancelled') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF p_start IS NOT NULL AND p_end IS NOT NULL AND p_end < p_start THEN RAISE EXCEPTION 'invalid_period'; END IF;
  IF p_page IS NULL OR p_page_size IS NULL OR p_page < 1 OR p_page_size < 1 OR p_page_size > 100 THEN RAISE EXCEPTION 'invalid_pagination'; END IF;
  WITH base AS (
    SELECT p.*, c.label AS category_label, a.name AS bank_account_name,
      CASE WHEN p.status='pending' AND p.due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'overdue'
           WHEN p.status='pending' THEN 'open' ELSE p.status END AS display_status
    FROM public.admin_cash_flow_plans p
    LEFT JOIN public.admin_financial_categories c ON c.id=p.category_id
    LEFT JOIN public.admin_bank_accounts a ON a.id=p.bank_account_id
    WHERE (p_direction IS NULL OR p.direction=p_direction)
      AND (p_start IS NULL OR p.due_date >= p_start)
      AND (p_end IS NULL OR p.due_date <= p_end)
      AND (p_account_id IS NULL OR p.bank_account_id=p_account_id OR (p.bank_account_id IS NULL AND EXISTS(SELECT 1 FROM public.admin_bank_accounts selected_account WHERE selected_account.id=p_account_id AND selected_account.account_kind='asaas')))
      AND (nullif(btrim(p_search),'') IS NULL OR p.description ILIKE '%'||btrim(p_search)||'%' OR p.counterparty ILIKE '%'||btrim(p_search)||'%')
  ), filtered AS (
    SELECT * FROM base WHERE p_status='all' OR (p_status='open' AND status='pending') OR (p_status<>'open' AND display_status=p_status)
  ), summary AS (
    SELECT count(*) FILTER (WHERE status='pending') AS open_count,
      coalesce(sum(amount) FILTER (WHERE status='pending'),0) AS open_amount,
      count(*) FILTER (WHERE display_status='overdue') AS overdue_count,
      coalesce(sum(amount) FILTER (WHERE display_status='overdue'),0) AS overdue_amount,
      count(*) FILTER (WHERE display_status='settled') AS settled_count,
      coalesce(sum(amount) FILTER (WHERE display_status='settled'),0) AS settled_amount,
      count(*) FILTER (WHERE display_status='cancelled') AS cancelled_count,
      coalesce(sum(amount) FILTER (WHERE display_status='cancelled'),0) AS cancelled_amount
    FROM base
  )
  SELECT jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.due_date,row.id) FROM (
      SELECT id,direction,description,counterparty,category_id,category_label,amount,due_date,status,display_status,
        bank_account_id,bank_account_name,notes,series_id,series_occurrence,version,created_at,updated_at,settled_at
      FROM filtered ORDER BY due_date,id OFFSET (p_page-1)*p_page_size LIMIT p_page_size
    ) row),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),
    'page',p_page,'page_size',p_page_size,
    'summary',(SELECT to_jsonb(summary) FROM summary)
  ) INTO result;
  RETURN result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_save_scheduled_account(
  p_request_id uuid,
  p_id uuid DEFAULT NULL,
  p_expected_version integer DEFAULT NULL,
  p_scope text DEFAULT 'one',
  p_direction text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_counterparty text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_bank_account_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_occurrences integer DEFAULT 1
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE existing public.admin_cash_flow_plans%ROWTYPE;
DECLARE source_plan public.admin_cash_flow_plans%ROWTYPE;
DECLARE row_plan public.admin_cash_flow_plans%ROWTYPE;
DECLARE v_series_id uuid;
DECLARE v_anchor integer;
DECLARE v_id uuid;
DECLARE v_ids jsonb := '[]'::jsonb;
DECLARE v_created integer := 0;
DECLARE v_updated integer := 0;
DECLARE v_index integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF p_scope IS NULL OR p_scope NOT IN ('one','future') OR p_request_id IS NULL OR p_occurrences IS NULL OR p_occurrences NOT BETWEEN 1 AND 60 OR (p_id IS NULL AND p_scope <> 'one') THEN RAISE EXCEPTION 'invalid_scheduled_account'; END IF;
  PERFORM public.admin_assert_scheduled_account_input(p_direction,p_description,p_category_id,p_amount,p_due_date,p_bank_account_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_scheduled_account:'||p_request_id::text,0));

  IF p_id IS NULL THEN
    SELECT * INTO existing FROM public.admin_cash_flow_plans WHERE request_id=p_request_id FOR UPDATE;
    IF FOUND THEN
      IF existing.created_by IS DISTINCT FROM auth.uid() OR existing.direction IS DISTINCT FROM p_direction
         OR existing.description IS DISTINCT FROM btrim(p_description) OR existing.counterparty IS DISTINCT FROM nullif(btrim(p_counterparty),'')
         OR existing.category_id IS DISTINCT FROM p_category_id OR existing.amount IS DISTINCT FROM p_amount
         OR existing.due_date IS DISTINCT FROM p_due_date OR existing.bank_account_id IS DISTINCT FROM p_bank_account_id
         OR existing.notes IS DISTINCT FROM nullif(p_notes,'')
         OR (SELECT count(*) FROM public.admin_cash_flow_plans q WHERE (existing.series_id IS NOT NULL AND q.series_id=existing.series_id) OR (existing.series_id IS NULL AND q.id=existing.id)) <> p_occurrences THEN
        RAISE EXCEPTION 'request_conflict';
      END IF;
      RETURN jsonb_build_object('series_id',existing.series_id,'account_ids',coalesce((SELECT jsonb_agg(id ORDER BY series_occurrence) FROM public.admin_cash_flow_plans WHERE series_id=existing.series_id),jsonb_build_array(existing.id)),'created_count',0,'updated_count',0);
    END IF;
    v_series_id := CASE WHEN p_occurrences > 1 THEN gen_random_uuid() ELSE NULL END;
    v_anchor := extract(day FROM p_due_date)::integer;
    FOR v_index IN 0..p_occurrences-1 LOOP
      v_id := CASE WHEN v_index=0 THEN p_request_id ELSE gen_random_uuid() END;
      INSERT INTO public.admin_cash_flow_plans(id,request_id,direction,description,counterparty,category_id,amount,due_date,bank_account_id,notes,series_id,series_anchor_day,series_occurrence,created_by)
      VALUES(v_id,CASE WHEN v_index=0 THEN p_request_id ELSE NULL END,p_direction,btrim(p_description),nullif(btrim(p_counterparty),''),p_category_id,p_amount,
        public.admin_scheduled_account_due_date(p_due_date,v_anchor,v_index),p_bank_account_id,nullif(p_notes,''),v_series_id,CASE WHEN v_series_id IS NULL THEN NULL ELSE v_anchor END,CASE WHEN v_series_id IS NULL THEN NULL ELSE v_index+1 END,auth.uid());
      v_ids := v_ids || to_jsonb(v_id); v_created := v_created+1;
    END LOOP;
    RETURN jsonb_build_object('series_id',v_series_id,'account_ids',v_ids,'created_count',v_created,'updated_count',0);
  END IF;

  SELECT * INTO source_plan FROM public.admin_cash_flow_plans WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scheduled_account_not_found'; END IF;
  IF source_plan.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'stale_scheduled_account'; END IF;
  IF source_plan.status <> 'pending' THEN RAISE EXCEPTION 'scheduled_account_not_open'; END IF;

  IF p_scope='one' THEN
    UPDATE public.admin_cash_flow_plans SET direction=p_direction,description=btrim(p_description),counterparty=nullif(btrim(p_counterparty),''),category_id=p_category_id,
      amount=p_amount,due_date=p_due_date,bank_account_id=p_bank_account_id,notes=nullif(p_notes,'') WHERE id=source_plan.id RETURNING * INTO row_plan;
    RETURN jsonb_build_object('series_id',row_plan.series_id,'account_ids',jsonb_build_array(row_plan.id),'created_count',0,'updated_count',1);
  END IF;

  IF source_plan.series_id IS NULL THEN RAISE EXCEPTION 'scheduled_account_has_no_series'; END IF;
  PERFORM 1 FROM public.admin_cash_flow_plans WHERE series_id=source_plan.series_id AND status='pending' AND series_occurrence>=source_plan.series_occurrence ORDER BY series_occurrence FOR UPDATE;
  v_anchor := CASE WHEN p_due_date=source_plan.due_date THEN source_plan.series_anchor_day ELSE extract(day FROM p_due_date)::integer END;
  FOR row_plan IN SELECT * FROM public.admin_cash_flow_plans WHERE series_id=source_plan.series_id AND status='pending' AND series_occurrence>=source_plan.series_occurrence ORDER BY series_occurrence FOR UPDATE LOOP
    UPDATE public.admin_cash_flow_plans SET direction=p_direction,description=btrim(p_description),counterparty=nullif(btrim(p_counterparty),''),category_id=p_category_id,
      amount=p_amount,due_date=public.admin_scheduled_account_due_date(p_due_date,v_anchor,row_plan.series_occurrence-source_plan.series_occurrence),bank_account_id=p_bank_account_id,
      notes=nullif(p_notes,''),series_anchor_day=v_anchor WHERE id=row_plan.id;
    v_ids := v_ids || to_jsonb(row_plan.id); v_updated := v_updated+1;
  END LOOP;
  RETURN jsonb_build_object('series_id',source_plan.series_id,'account_ids',v_ids,'created_count',0,'updated_count',v_updated);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_cancel_scheduled_account(p_id uuid,p_expected_version integer,p_scope text DEFAULT 'one')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE source_plan public.admin_cash_flow_plans%ROWTYPE; v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF p_scope IS NULL OR p_scope NOT IN ('one','future') THEN RAISE EXCEPTION 'invalid_scope'; END IF;
  SELECT * INTO source_plan FROM public.admin_cash_flow_plans WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scheduled_account_not_found'; END IF;
  IF source_plan.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'stale_scheduled_account'; END IF;
  IF source_plan.status <> 'pending' THEN RAISE EXCEPTION 'scheduled_account_not_open'; END IF;
  IF p_scope='one' THEN
    UPDATE public.admin_cash_flow_plans SET status='cancelled' WHERE id=source_plan.id; GET DIAGNOSTICS v_count=ROW_COUNT;
  ELSE
    IF source_plan.series_id IS NULL THEN RAISE EXCEPTION 'scheduled_account_has_no_series'; END IF;
    PERFORM 1 FROM public.admin_cash_flow_plans WHERE series_id=source_plan.series_id AND status='pending' AND series_occurrence>=source_plan.series_occurrence ORDER BY series_occurrence FOR UPDATE;
    UPDATE public.admin_cash_flow_plans SET status='cancelled' WHERE series_id=source_plan.series_id AND status='pending' AND series_occurrence>=source_plan.series_occurrence; GET DIAGNOSTICS v_count=ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('cancelled_count',v_count);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_settle_scheduled_account(
  p_id uuid,p_expected_version integer,p_ledger_id uuid DEFAULT NULL,p_bank_transaction_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE source_plan public.admin_cash_flow_plans%ROWTYPE; changed_plan public.admin_cash_flow_plans%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF num_nonnulls(p_ledger_id,p_bank_transaction_id) > 1 THEN RAISE EXCEPTION 'invalid_settlement_source'; END IF;
  SELECT * INTO source_plan FROM public.admin_cash_flow_plans WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scheduled_account_not_found'; END IF;
  IF source_plan.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'stale_scheduled_account'; END IF;
  IF p_ledger_id IS NULL AND p_bank_transaction_id IS NULL THEN
    IF source_plan.status <> 'settled' THEN RAISE EXCEPTION 'scheduled_account_not_settled'; END IF;
    UPDATE public.admin_cash_flow_plans SET status='pending',ledger_id=NULL,bank_transaction_id=NULL,settled_at=NULL WHERE id=source_plan.id RETURNING * INTO changed_plan;
  ELSE
    IF source_plan.status <> 'pending' THEN RAISE EXCEPTION 'scheduled_account_not_open'; END IF;
    UPDATE public.admin_cash_flow_plans SET status='settled',ledger_id=p_ledger_id,bank_transaction_id=p_bank_transaction_id,settled_at=now() WHERE id=source_plan.id RETURNING * INTO changed_plan;
  END IF;
  RETURN jsonb_build_object('id',changed_plan.id,'status',changed_plan.status,'version',changed_plan.version);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_scheduled_account_due_date(date,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_assert_scheduled_account_input(text,text,uuid,numeric,date,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_cash_flow_plan_touch() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_scheduled_account_due_date(date,integer,integer) FROM authenticated;
REVOKE ALL ON FUNCTION public.admin_assert_scheduled_account_input(text,text,uuid,numeric,date,uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.admin_list_scheduled_accounts(text,date,date,text,text,uuid,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_save_scheduled_account(uuid,uuid,integer,text,text,text,text,uuid,numeric,date,uuid,text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_cancel_scheduled_account(uuid,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_settle_scheduled_account(uuid,integer,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_list_scheduled_accounts(text,date,date,text,text,uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_scheduled_account(uuid,uuid,integer,text,text,text,text,uuid,numeric,date,uuid,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_scheduled_account(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_settle_scheduled_account(uuid,integer,uuid,uuid) TO authenticated;

COMMIT;

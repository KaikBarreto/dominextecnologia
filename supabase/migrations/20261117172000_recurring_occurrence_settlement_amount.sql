BEGIN;
ALTER TABLE public.financial_transactions ADD COLUMN IF NOT EXISTS recurrence_base_amount numeric(18,2);
ALTER TABLE public.admin_cash_flow_plans ADD COLUMN IF NOT EXISTS series_base_amount numeric(18,2);
-- O snapshot nasce com a série; edição individual nunca redefine sua base.
CREATE OR REPLACE FUNCTION public.capture_financial_recurrence_base() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $fn$
BEGIN
 IF NEW.installment_group_id IS NOT NULL AND NEW.recurrence_base_amount IS NULL THEN
  IF TG_OP='UPDATE' AND OLD.installment_group_id=NEW.installment_group_id THEN NEW.recurrence_base_amount:=coalesce(OLD.recurrence_base_amount,OLD.amount);
  ELSE NEW.recurrence_base_amount:=NEW.amount; END IF;
 END IF;
 RETURN NEW;
END;$fn$;
DROP TRIGGER IF EXISTS capture_financial_recurrence_base ON public.financial_transactions;
CREATE TRIGGER capture_financial_recurrence_base BEFORE INSERT OR UPDATE ON public.financial_transactions
 FOR EACH ROW EXECUTE FUNCTION public.capture_financial_recurrence_base();
CREATE OR REPLACE FUNCTION public.capture_admin_series_base() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $fn$
BEGIN
 IF NEW.series_id IS NOT NULL AND NEW.series_base_amount IS NULL THEN
  IF TG_OP='UPDATE' AND OLD.series_id=NEW.series_id THEN NEW.series_base_amount:=coalesce(OLD.series_base_amount,OLD.amount);
  ELSE NEW.series_base_amount:=NEW.amount; END IF;
 END IF;
 RETURN NEW;
END;$fn$;
DROP TRIGGER IF EXISTS capture_admin_series_base ON public.admin_cash_flow_plans;
CREATE TRIGGER capture_admin_series_base BEFORE INSERT OR UPDATE ON public.admin_cash_flow_plans
 FOR EACH ROW EXECUTE FUNCTION public.capture_admin_series_base();
REVOKE ALL ON FUNCTION public.capture_financial_recurrence_base(),public.capture_admin_series_base() FROM PUBLIC,anon,authenticated;
-- O valor realizado pertence à ocorrência. Ajuste, baixa e tarifa são atômicos.
-- INVOKER mantém as policies de escrita, assinatura e isolamento do financeiro.
CREATE OR REPLACE FUNCTION public.settle_financial_occurrence(
  p_id uuid, p_expected_amount numeric, p_occurrence_amount numeric,
  p_account_id uuid, p_payment_method text DEFAULT NULL, p_paid_date date DEFAULT NULL,
  p_update_future boolean DEFAULT false, p_fee_amount numeric DEFAULT 0,
  p_fee_category text DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $fn$
DECLARE
  source public.financial_transactions%ROWTYPE;
  changed public.financial_transactions%ROWTYPE;
  destination public.financial_accounts%ROWTYPE;
  series uuid;
  paid_on date;
  future_count integer := 0;
  base_amount numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_admin_or_gestor(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.user_permissions up WHERE up.user_id=auth.uid() AND up.is_active
        AND (up.permissions ? '*' OR up.permissions @> '"fn:manage_finance"'::jsonb)
    )
  ) THEN RAISE EXCEPTION 'Seu perfil não permite gerenciar o financeiro.'; END IF;
  IF p_occurrence_amount IS NULL OR p_occurrence_amount <= 0
    OR p_occurrence_amount::text IN ('NaN','Infinity','-Infinity')
    OR p_occurrence_amount <> round(p_occurrence_amount,2)
    OR p_fee_amount IS NULL OR p_fee_amount < 0
    OR p_fee_amount::text IN ('NaN','Infinity','-Infinity') OR p_fee_amount <> round(p_fee_amount,2)
  THEN RAISE EXCEPTION 'Informe um valor positivo com até duas casas decimais e uma tarifa válida.'; END IF;
  SELECT t.installment_group_id INTO series FROM public.financial_transactions t
    WHERE t.id=p_id AND t.company_id=public.get_user_company_id(auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta indisponível. Atualize a lista e tente novamente.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('financial_occurrence:'||coalesce(series,p_id)::text,0));
  SELECT * INTO source FROM public.financial_transactions t
    WHERE t.id=p_id AND t.company_id=public.get_user_company_id(auth.uid()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta indisponível. Atualize a lista e tente novamente.'; END IF;
  IF source.amount IS DISTINCT FROM p_expected_amount THEN
    RAISE EXCEPTION 'O valor desta conta mudou. Atualize a lista e confira os dados antes de confirmar.';
  END IF;
  IF coalesce(source.is_paid,false) OR source.paid_date IS NOT NULL OR source.cancelled_at IS NOT NULL
    OR source.payment_group_id IS NOT NULL OR source.amount_received <> 0
    OR EXISTS(SELECT 1 FROM public.financial_transactions f WHERE f.parent_transaction_id=source.id)
  THEN RAISE EXCEPTION 'Esta conta já tem baixa, recebimento ou vínculo anterior. Confira seu histórico antes de ajustar o valor.'; END IF;
  IF source.origin IS DISTINCT FROM 'geral' OR source.parent_transaction_id IS NOT NULL
    OR source.transfer_pair_id IS NOT NULL OR source.payroll_kind IS NOT NULL OR source.employee_id IS NOT NULL
    OR source.credit_card_bill_date IS NOT NULL OR source.bill_id IS NOT NULL
    OR source.contract_id IS NOT NULL OR source.service_order_id IS NOT NULL
    OR source.transaction_type NOT IN ('entrada','saida')
    OR EXISTS(SELECT 1 FROM public.financial_accounts a WHERE a.id=source.account_id AND a.type='cartao')
    OR EXISTS(SELECT 1 FROM public.credit_card_bills b WHERE b.payment_transaction_id=source.id)
    OR EXISTS(SELECT 1 FROM public.employee_movements e WHERE e.financial_transaction_id=source.id)
    OR EXISTS(SELECT 1 FROM public.reconciliation_matches r WHERE r.financial_transaction_id=source.id)
  THEN RAISE EXCEPTION 'Ajuste indisponível para cartão, folha, conciliação ou lançamento gerado por outro fluxo. Use o fluxo de origem.'; END IF;
  PERFORM 1 FROM public.tenant_charges c WHERE c.company_id=source.company_id
    AND (c.id=source.tenant_charge_id OR c.asaas_payment_id=source.asaas_payment_id
      OR (c.source_type='receivable' AND c.source_id=source.id)) FOR UPDATE;
  IF (source.asaas_payment_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.tenant_charges c WHERE c.company_id=source.company_id AND c.asaas_payment_id=source.asaas_payment_id
    )) OR (source.tenant_charge_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.tenant_charges c WHERE c.company_id=source.company_id AND c.id=source.tenant_charge_id
    )) OR EXISTS(
    SELECT 1 FROM public.tenant_charges c WHERE c.company_id=source.company_id
      AND (c.id=source.tenant_charge_id OR c.asaas_payment_id=source.asaas_payment_id
        OR (c.source_type='receivable' AND c.source_id=source.id))
      AND upper(trim(coalesce(c.status,''))) NOT IN ('CANCELLED','CANCELED','REFUNDED','CHARGEBACK','DELETED')
  ) THEN RAISE EXCEPTION 'Esta conta tem uma cobrança online ativa. Encerre a cobrança antes de ajustar o valor.'; END IF;
  SELECT * INTO destination FROM public.financial_accounts a
    WHERE a.id=p_account_id AND a.company_id=source.company_id FOR SHARE;
  IF NOT FOUND OR destination.is_active IS NOT TRUE OR destination.type='cartao' THEN
    RAISE EXCEPTION 'Selecione um caixa ou conta bancária ativa da sua empresa.';
  END IF;
  paid_on := coalesce(p_paid_date,public.company_today(source.company_id));
  IF paid_on > public.company_today(source.company_id) THEN RAISE EXCEPTION 'A data da baixa não pode estar no futuro.'; END IF;
  IF p_fee_amount > 0 AND (source.transaction_type <> 'entrada' OR NOT EXISTS(
    SELECT 1 FROM public.financial_categories c WHERE c.company_id=source.company_id
      AND c.name=p_fee_category AND c.type='saida' AND c.is_system AND c.dre_group='impostos'
  )) THEN RAISE EXCEPTION 'Confira a categoria de tarifa do recebimento antes de confirmar.'; END IF;
  base_amount:=coalesce(source.recurrence_base_amount,source.amount);
  IF p_update_future AND source.installment_group_id IS NULL THEN
    RAISE EXCEPTION 'Esta conta não possui uma série identificada. O ajuste deve valer somente para ela.';
  END IF;
  IF source.installment_group_id IS NOT NULL THEN
    PERFORM 1 FROM public.financial_transactions t WHERE t.company_id=source.company_id
      AND t.installment_group_id=source.installment_group_id ORDER BY t.id FOR UPDATE;
    UPDATE public.financial_transactions t SET recurrence_base_amount=CASE WHEN p_update_future THEN p_occurrence_amount ELSE base_amount END
      WHERE t.company_id=source.company_id AND t.installment_group_id=source.installment_group_id
        AND NOT coalesce(t.is_paid,false) AND t.cancelled_at IS NULL
        AND (t.recurrence_base_amount IS NULL OR p_update_future);
  END IF;
  IF p_update_future AND p_occurrence_amount <> source.amount THEN
    PERFORM 1 FROM public.financial_transactions t WHERE t.company_id=source.company_id
      AND t.installment_group_id=source.installment_group_id ORDER BY t.id FOR UPDATE;
    UPDATE public.financial_transactions t SET amount=p_occurrence_amount
    WHERE t.company_id=source.company_id AND t.installment_group_id=source.installment_group_id
      AND t.transaction_type=source.transaction_type AND t.due_date>source.due_date
      AND t.amount=base_amount AND NOT coalesce(t.is_paid,false) AND t.paid_date IS NULL
      AND t.amount_received=0 AND t.cancelled_at IS NULL AND t.payment_group_id IS NULL
      AND t.origin='geral' AND t.parent_transaction_id IS NULL AND t.transfer_pair_id IS NULL
      AND t.payroll_kind IS NULL AND t.employee_id IS NULL AND t.bill_id IS NULL
      AND t.credit_card_bill_date IS NULL AND t.contract_id IS NULL AND t.service_order_id IS NULL
      AND t.tenant_charge_id IS NULL AND t.asaas_payment_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.financial_transactions f WHERE f.parent_transaction_id=t.id)
      AND NOT EXISTS(SELECT 1 FROM public.financial_accounts a WHERE a.id=t.account_id AND a.type='cartao')
      AND NOT EXISTS(SELECT 1 FROM public.credit_card_bills b WHERE b.payment_transaction_id=t.id)
      AND NOT EXISTS(SELECT 1 FROM public.employee_movements e WHERE e.financial_transaction_id=t.id)
      AND NOT EXISTS(SELECT 1 FROM public.reconciliation_matches r WHERE r.financial_transaction_id=t.id)
      AND NOT EXISTS(SELECT 1 FROM public.tenant_charges c WHERE c.company_id=t.company_id
        AND c.source_type='receivable' AND c.source_id=t.id
        AND upper(trim(coalesce(c.status,''))) NOT IN ('CANCELLED','CANCELED','REFUNDED','CHARGEBACK','DELETED'));
    GET DIAGNOSTICS future_count=ROW_COUNT;
  END IF;
  UPDATE public.financial_transactions SET amount=p_occurrence_amount,is_paid=true,paid_date=paid_on,
    account_id=p_account_id,payment_method=coalesce(p_payment_method,source.payment_method),notes=coalesce(p_notes,source.notes)
    WHERE id=source.id AND company_id=source.company_id RETURNING * INTO changed;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não foi possível confirmar a baixa. Atualize a lista e tente novamente.'; END IF;
  IF p_fee_amount > 0 THEN
    INSERT INTO public.financial_transactions(company_id,transaction_type,amount,description,category,customer_id,
      account_id,cost_center_id,payment_method,transaction_date,paid_date,is_paid,notes,created_by,parent_transaction_id)
    VALUES(source.company_id,'saida',p_fee_amount,'Tarifa do recebimento, '||source.description,p_fee_category,source.customer_id,
      p_account_id,source.cost_center_id,p_payment_method,paid_on,paid_on,true,p_notes,auth.uid(),source.id);
  END IF;
  RETURN to_jsonb(changed)||jsonb_build_object('updated_future_count',future_count);
END;$fn$;
REVOKE ALL ON FUNCTION public.settle_financial_occurrence(uuid,numeric,numeric,uuid,text,date,boolean,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settle_financial_occurrence(uuid,numeric,numeric,uuid,text,date,boolean,numeric,text,text) TO authenticated,service_role;

-- Chamadas antigas continuam compatíveis; parâmetros novos são opcionais.
DROP FUNCTION IF EXISTS public.admin_settle_scheduled_account(uuid,integer,uuid,uuid);
CREATE OR REPLACE FUNCTION public.admin_settle_scheduled_account(
  p_id uuid,p_expected_version integer,p_ledger_id uuid DEFAULT NULL,p_bank_transaction_id uuid DEFAULT NULL,
  p_settled_amount numeric DEFAULT NULL,p_update_future boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE source public.admin_cash_flow_plans%ROWTYPE; changed public.admin_cash_flow_plans%ROWTYPE;
  series uuid; realized numeric; base_amount numeric; future_count integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_admin_financial(auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF num_nonnulls(p_ledger_id,p_bank_transaction_id)>1 THEN RAISE EXCEPTION 'invalid_settlement_source'; END IF;
  IF coalesce(p_ledger_id,p_bank_transaction_id) IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('admin_reconcile_movement:'||coalesce(p_ledger_id,p_bank_transaction_id)::text,0));
  END IF;
  SELECT p.series_id INTO series FROM public.admin_cash_flow_plans p WHERE p.id=p_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('admin_scheduled_settlement:'||coalesce(series,p_id)::text,0));
  SELECT * INTO source FROM public.admin_cash_flow_plans WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scheduled_account_not_found'; END IF;
  IF source.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'stale_scheduled_account'; END IF;
  IF p_ledger_id IS NULL AND p_bank_transaction_id IS NULL THEN
    IF source.status<>'settled' OR p_settled_amount IS NOT NULL OR p_update_future THEN RAISE EXCEPTION 'invalid_unsettlement'; END IF;
    UPDATE public.admin_cash_flow_plans SET status='pending',ledger_id=NULL,bank_transaction_id=NULL,settled_at=NULL
      WHERE id=source.id RETURNING * INTO changed;
  ELSE
    IF source.status<>'pending' OR source.ledger_id IS NOT NULL OR source.bank_transaction_id IS NOT NULL THEN RAISE EXCEPTION 'scheduled_account_not_open'; END IF;
    realized:=coalesce(p_settled_amount,source.amount);
    IF realized<=0 OR realized::text IN ('NaN','Infinity','-Infinity') OR realized<>round(realized,2) THEN RAISE EXCEPTION 'invalid_settled_amount'; END IF;
    IF p_update_future AND source.series_id IS NULL THEN RAISE EXCEPTION 'scheduled_account_has_no_series'; END IF;
    IF p_ledger_id IS NOT NULL THEN
      PERFORM 1 FROM public.ledger_asaas WHERE id=p_ledger_id FOR UPDATE;
      IF NOT EXISTS(SELECT 1 FROM public.admin_realized_asaas_movements m WHERE m.id=p_ledger_id
        AND m.amount=realized AND m.direction=source.direction)
        OR public.admin_reconcile_asaas_is_neutral(p_ledger_id) THEN RAISE EXCEPTION 'plan_movement_mismatch'; END IF;
    ELSE
      PERFORM 1 FROM public.admin_bank_transactions b WHERE b.id=p_bank_transaction_id
        AND b.bank_account_id=source.bank_account_id
        AND b.amount=CASE WHEN source.direction='credit' THEN realized ELSE -realized END FOR UPDATE;
      IF NOT FOUND OR EXISTS(SELECT 1 FROM public.admin_bank_transfers t WHERE t.active
        AND (t.debit_bank_transaction_id=p_bank_transaction_id OR t.credit_bank_transaction_id=p_bank_transaction_id)) THEN RAISE EXCEPTION 'plan_movement_mismatch'; END IF;
    END IF;
    base_amount:=coalesce(source.series_base_amount,source.amount);
    IF source.series_id IS NOT NULL THEN
      PERFORM 1 FROM public.admin_cash_flow_plans p WHERE p.series_id=source.series_id ORDER BY p.id FOR UPDATE;
      UPDATE public.admin_cash_flow_plans p SET series_base_amount=CASE WHEN p_update_future THEN realized ELSE base_amount END
        WHERE p.series_id=source.series_id AND p.status='pending' AND (p.series_base_amount IS NULL OR p_update_future);
    END IF;
    IF p_update_future AND realized<>source.amount THEN
      PERFORM 1 FROM public.admin_cash_flow_plans p WHERE p.series_id=source.series_id ORDER BY p.id FOR UPDATE;
      UPDATE public.admin_cash_flow_plans p SET amount=realized
        WHERE p.series_id=source.series_id AND p.series_occurrence>source.series_occurrence
          AND p.status='pending' AND p.amount=base_amount AND p.direction=source.direction
          AND p.ledger_id IS NULL AND p.bank_transaction_id IS NULL;
      GET DIAGNOSTICS future_count=ROW_COUNT;
    END IF;
    UPDATE public.admin_cash_flow_plans SET amount=realized,status='settled',ledger_id=p_ledger_id,
      bank_transaction_id=p_bank_transaction_id,settled_at=now() WHERE id=source.id RETURNING * INTO changed;
  END IF;
  RETURN jsonb_build_object('id',changed.id,'status',changed.status,'version',changed.version,'updated_future_count',future_count);
END;$fn$;
REVOKE ALL ON FUNCTION public.admin_settle_scheduled_account(uuid,integer,uuid,uuid,numeric,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_settle_scheduled_account(uuid,integer,uuid,uuid,numeric,boolean) TO authenticated,service_role;
COMMIT;

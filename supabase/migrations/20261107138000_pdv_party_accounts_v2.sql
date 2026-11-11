-- W4-01/W4-02: contas de cliente/fornecedor e credito separado de divida.
-- Expand only: dividas continuam em financial_transactions; este ledger guarda
-- somente credito/adiantamento e sua aplicacao, sem caixa, DRE ou DFC novos.
BEGIN;

CREATE TABLE public.pdv_party_credit_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  party_type text NOT NULL CHECK (party_type IN ('customer','supplier')),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
  entry_kind text NOT NULL CHECK (
    entry_kind IN ('credit','adjustment','application','reversal')
  ),
  amount numeric(14,2) NOT NULL CHECK (
    amount <> 0 AND amount=round(amount,2)
    AND lower(amount::text) NOT IN ('nan','infinity','-infinity')
  ),
  occurred_on date NOT NULL,
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 500),
  target_financial_transaction_id uuid
    REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  reversal_of_id uuid REFERENCES public.pdv_party_credit_entries(id) ON DELETE CASCADE,
  operation_request_id uuid NOT NULL REFERENCES public.pdv_operation_requests(id) ON DELETE CASCADE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_party_credit_party_check CHECK (
    (party_type='customer' AND customer_id IS NOT NULL AND supplier_id IS NULL)
    OR (party_type='supplier' AND supplier_id IS NOT NULL AND customer_id IS NULL)
  ),
  CONSTRAINT pdv_party_credit_kind_shape_check CHECK (
    (entry_kind='credit' AND amount > 0
      AND target_financial_transaction_id IS NULL AND reversal_of_id IS NULL)
    OR (entry_kind='adjustment' AND target_financial_transaction_id IS NULL
      AND reversal_of_id IS NULL)
    OR (entry_kind='application' AND amount < 0
      AND target_financial_transaction_id IS NOT NULL AND reversal_of_id IS NULL)
    OR (entry_kind='reversal' AND reversal_of_id IS NOT NULL)
  ),
  CONSTRAINT pdv_party_credit_reversal_unique UNIQUE (reversal_of_id),
  CONSTRAINT pdv_party_credit_request_unique UNIQUE (operation_request_id)
);

CREATE INDEX idx_pdv_party_credit_customer
  ON public.pdv_party_credit_entries(company_id,customer_id,occurred_on,id)
  WHERE customer_id IS NOT NULL;
CREATE INDEX idx_pdv_party_credit_supplier
  ON public.pdv_party_credit_entries(company_id,supplier_id,occurred_on,id)
  WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_pdv_party_credit_target
  ON public.pdv_party_credit_entries(company_id,target_financial_transaction_id)
  WHERE target_financial_transaction_id IS NOT NULL;

ALTER TABLE public.pdv_party_credit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_party_credit_entries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_party_credit_entries FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO public.app_feature_flags(key,enabled,contract_allowlist,company_allowlist)
VALUES('pdv_party_accounts_v2',false,'{}'::uuid[],'{}'::uuid[])
ON CONFLICT(key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pdv_party_accounts_v2_enabled_internal(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT COALESCE((SELECT flag.enabled OR p_company_id=ANY(flag.company_allowlist)
    FROM public.app_feature_flags flag WHERE flag.key='pdv_party_accounts_v2'),FALSE);
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_party_account_context_v2(p_write boolean)
RETURNS TABLE(user_id uuid,company_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_user uuid:=auth.uid(); v_company uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Entre novamente.'
      USING ERRCODE='42501',DETAIL='code=pdv_party_account_auth_required';
  END IF;
  SELECT profile.company_id INTO v_company
    FROM public.profiles profile
   WHERE profile.user_id=v_user AND profile.is_active IS TRUE;
  IF v_company IS NULL OR public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'O acesso financeiro desta empresa está indisponível.'
      USING ERRCODE='42501',DETAIL='code=pdv_party_account_company_denied';
  END IF;
  IF public.company_has_module(v_company,'pdv') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'O módulo PDV e Loja não está ativo nesta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_party_account_module_denied';
  END IF;
  IF public.pdv_party_accounts_v2_enabled_internal(v_company) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'A nova conta de saldos ainda não está liberada para esta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_party_account_rollout_disabled';
  END IF;
  IF NOT public.is_admin_or_gestor(v_user) AND NOT public.is_super_admin(v_user)
     AND (
       public.pdv_has_explicit_action_permission_v2(v_user,'screen:customers') IS DISTINCT FROM TRUE
       OR public.pdv_has_explicit_action_permission_v2(
            v_user,CASE WHEN p_write THEN 'fn:manage_party_credit'
                        ELSE 'fn:view_customer_financial' END
          ) IS DISTINCT FROM TRUE
     )
  THEN
    RAISE EXCEPTION 'Você não tem permissão para acessar esta conta.'
      USING ERRCODE='42501',DETAIL='code=pdv_party_account_permission_denied';
  END IF;
  RETURN QUERY SELECT v_user,v_company;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_assert_party_v2(
  p_company_id uuid,p_party_type text,p_party_id uuid
)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF p_party_type='customer' THEN
    IF NOT EXISTS(SELECT 1 FROM public.customers customer
      WHERE customer.id=p_party_id AND customer.company_id=p_company_id
        AND customer.is_deleted IS FALSE) THEN
      RAISE EXCEPTION 'Cliente não encontrado nesta empresa.'
        USING ERRCODE='P0002',DETAIL='code=pdv_party_account_party_not_found';
    END IF;
  ELSIF p_party_type='supplier' THEN
    IF NOT EXISTS(SELECT 1 FROM public.suppliers supplier
      WHERE supplier.id=p_party_id AND supplier.company_id=p_company_id) THEN
      RAISE EXCEPTION 'Fornecedor não encontrado nesta empresa.'
        USING ERRCODE='P0002',DETAIL='code=pdv_party_account_party_not_found';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de conta inválido.'
      USING ERRCODE='22023',DETAIL='code=pdv_party_account_type_invalid';
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_party_available_credit_v2(
  p_company_id uuid,p_party_type text,p_party_id uuid
)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
  SELECT round(
    COALESCE((SELECT sum(entry.amount)
      FROM public.pdv_party_credit_entries entry
     WHERE entry.company_id=p_company_id AND entry.party_type=p_party_type
       AND ((p_party_type='customer' AND entry.customer_id=p_party_id)
         OR (p_party_type='supplier' AND entry.supplier_id=p_party_id))),0)
    + CASE WHEN p_party_type='customer' THEN GREATEST(-COALESCE((
        SELECT sum(ledger.amount) FROM public.customer_credit_ledger ledger
         WHERE ledger.company_id=p_company_id AND ledger.customer_id=p_party_id
           AND ledger.financial_transaction_id IS NULL
      ),0),0) ELSE 0 END,
    2
  );
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_party_obligation_open_v2(p_transaction_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
  SELECT round(GREATEST(transaction.amount-
    CASE
      WHEN transaction.transaction_type::text='entrada' THEN GREATEST(
        public.pdv_receivable_received_total_v2(transaction.id),
        COALESCE(transaction.amount_received,0),
        CASE WHEN transaction.is_paid IS TRUE THEN transaction.amount ELSE 0 END
      )
      ELSE GREATEST(
        COALESCE(transaction.amount_received,0),
        CASE WHEN transaction.is_paid IS TRUE THEN transaction.amount ELSE 0 END
      )
    END,0),2)
  FROM public.financial_transactions transaction
  WHERE transaction.id=p_transaction_id;
$fn$;

-- W1A passa a considerar aplicacoes de credito sem criar uma liquidacao de caixa.
CREATE OR REPLACE FUNCTION public.pdv_receivable_monetary_total_v2(
  p_receivable_id uuid,p_exclude_legacy_child_id uuid DEFAULT NULL
)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
  SELECT round(
    COALESCE((SELECT sum(child.amount) FROM public.financial_transactions child
      WHERE child.parent_transaction_id=p_receivable_id
        AND child.id IS DISTINCT FROM p_exclude_legacy_child_id
        AND child.category='Recebimento parcial'
        AND child.transaction_type::text='entrada'
        AND child.cancelled_at IS NULL AND child.pdv_financial_role IS NULL
        AND NOT EXISTS(SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
          WHERE allocation.settlement_transaction_id=child.id
            AND allocation.receivable_transaction_id=p_receivable_id)),0)
    + COALESCE((SELECT sum(allocation.amount)
        FROM public.pdv_receivable_settlement_allocations allocation
       WHERE allocation.receivable_transaction_id=p_receivable_id),0),2);
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_receivable_received_total_v2(
  p_receivable_id uuid,p_exclude_legacy_child_id uuid DEFAULT NULL
)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
  SELECT round(
    public.pdv_receivable_monetary_total_v2(p_receivable_id,p_exclude_legacy_child_id)
    - COALESCE((SELECT sum(entry.amount)
        FROM public.pdv_party_credit_entries entry
       WHERE entry.target_financial_transaction_id=p_receivable_id),0),2);
$fn$;

CREATE OR REPLACE FUNCTION public.recalc_amount_received(p_parent_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_total numeric(14,2); v_monetary_total numeric(14,2);
  v_amount numeric(14,2); v_last_paid date;
BEGIN
  IF p_parent_id IS NULL THEN RETURN; END IF;
  SELECT public.pdv_receivable_received_total_v2(p_parent_id),
    public.pdv_receivable_monetary_total_v2(p_parent_id),GREATEST(
    COALESCE((SELECT max(child.paid_date) FROM public.financial_transactions child
      WHERE child.parent_transaction_id=p_parent_id AND child.category='Recebimento parcial'
        AND child.transaction_type::text='entrada' AND child.cancelled_at IS NULL
        AND child.pdv_financial_role IS NULL
        AND NOT EXISTS(SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
          WHERE allocation.settlement_transaction_id=child.id
            AND allocation.receivable_transaction_id=p_parent_id)),'-infinity'::date),
    COALESCE((SELECT max(settlement.paid_date)
      FROM public.pdv_receivable_settlement_allocations allocation
      JOIN public.financial_transactions settlement ON settlement.id=allocation.settlement_transaction_id
      WHERE allocation.receivable_transaction_id=p_parent_id AND allocation.amount>0),'-infinity'::date),
    '-infinity'::date
  ) INTO v_total,v_monetary_total,v_last_paid;
  IF v_last_paid='-infinity'::date THEN v_last_paid:=NULL; END IF;
  SELECT transaction.amount INTO v_amount FROM public.financial_transactions transaction
   WHERE transaction.id=p_parent_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM set_config('app.pdv_receivable_recalc',p_parent_id::text,true);
  UPDATE public.financial_transactions SET amount_received=v_total,
    is_paid=v_monetary_total>=v_amount,
    paid_date=CASE WHEN v_monetary_total>=v_amount THEN v_last_paid ELSE NULL END
   WHERE id=p_parent_id;
  PERFORM set_config('app.pdv_receivable_recalc','',true);
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_sync_party_receivable_payment_v2(p_receivable_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
BEGIN
  UPDATE public.pdv_order_payments payment
     SET settlement_status=CASE
           WHEN receivable.amount_received<=0 THEN 'open'
           WHEN receivable.amount_received>=receivable.amount THEN 'settled'
           ELSE 'partial' END,
         settlement_transaction_id=CASE
           WHEN receivable.amount_received>=receivable.amount
            AND COALESCE((SELECT sum(entry.amount)
              FROM public.pdv_party_credit_entries entry
             WHERE entry.target_financial_transaction_id=receivable.id),0)=0
            AND (SELECT count(DISTINCT allocation.settlement_transaction_id)
              FROM public.pdv_receivable_settlement_allocations allocation
             WHERE allocation.receivable_transaction_id=receivable.id
               AND allocation.amount>0)=1
           THEN (SELECT allocation.settlement_transaction_id
              FROM public.pdv_receivable_settlement_allocations allocation
             WHERE allocation.receivable_transaction_id=receivable.id
               AND allocation.amount>0
             ORDER BY allocation.settlement_transaction_id
             LIMIT 1)
           ELSE NULL END,
         settled_at=CASE WHEN receivable.amount_received>=receivable.amount
           THEN COALESCE(payment.settled_at,now()) ELSE NULL END
    FROM public.financial_transactions receivable
   WHERE payment.company_id=receivable.company_id
     AND payment.contract_version=2
     AND payment.receivable_transaction_id=p_receivable_id
     AND receivable.id=p_receivable_id;
END $fn$;

-- O reconciliador W1A também precisa considerar crédito W4 quando uma baixa
-- em dinheiro chega depois de uma aplicação parcial de crédito.
CREATE OR REPLACE FUNCTION public.pdv_recalc_receivable_after_allocation_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
BEGIN
  PERFORM public.recalc_amount_received(NEW.receivable_transaction_id);
  PERFORM public.pdv_sync_party_receivable_payment_v2(NEW.receivable_transaction_id);
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_guard_receivable_financial_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_id uuid:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
BEGIN
  IF TG_OP='DELETE' AND (NOT EXISTS(SELECT 1 FROM public.companies c WHERE c.id=OLD.company_id)
    OR COALESCE(current_setting('app.pdv_purge_company',true),'')=OLD.company_id::text) THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND COALESCE(current_setting('app.pdv_purge_company',true),'')=OLD.company_id::text THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE'
     AND COALESCE(current_setting('app.pdv_receivable_recalc',true),'')=OLD.id::text
     AND (to_jsonb(NEW)-ARRAY['amount_received','is_paid','paid_date','updated_at'])
       =(to_jsonb(OLD)-ARRAY['amount_received','is_paid','paid_date','updated_at'])
  THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
      WHERE allocation.receivable_transaction_id=v_id OR allocation.settlement_transaction_id=v_id)
     OR EXISTS(SELECT 1 FROM public.pdv_party_credit_entries entry
      WHERE entry.target_financial_transaction_id=v_id)
  THEN
    RAISE EXCEPTION 'Este lançamento participa de uma baixa e não pode ser alterado ou excluído. Registre um estorno.'
      USING ERRCODE='55000',DETAIL='code=pdv_party_account_financial_immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_guard_party_credit_entry_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_original public.pdv_party_credit_entries%ROWTYPE; v_target public.financial_transactions%ROWTYPE;
  v_party uuid; v_available numeric(14,2); v_open numeric(14,2);
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    IF TG_OP='DELETE' AND (NOT EXISTS(SELECT 1 FROM public.companies c WHERE c.id=OLD.company_id)
      OR COALESCE(current_setting('app.pdv_purge_company',true),'')=OLD.company_id::text) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'O histórico de crédito é imutável. Registre um estorno.'
      USING ERRCODE='55000',DETAIL='code=pdv_party_credit_immutable';
  END IF;
  v_party:=COALESCE(NEW.customer_id,NEW.supplier_id);
  PERFORM public.pdv_assert_party_v2(NEW.company_id,NEW.party_type,v_party);
  IF NEW.entry_kind='reversal' THEN
    SELECT * INTO v_original FROM public.pdv_party_credit_entries entry
     WHERE entry.id=NEW.reversal_of_id FOR UPDATE;
    IF NOT FOUND OR v_original.company_id<>NEW.company_id OR v_original.party_type<>NEW.party_type
       OR COALESCE(v_original.customer_id,v_original.supplier_id)<>v_party
       OR v_original.entry_kind='reversal' OR NEW.amount<>-v_original.amount
       OR NEW.target_financial_transaction_id IS DISTINCT FROM v_original.target_financial_transaction_id
    THEN RAISE EXCEPTION 'O estorno não corresponde ao movimento original.'
      USING ERRCODE='23514',DETAIL='code=pdv_party_credit_reversal_invalid'; END IF;
  END IF;
  IF NEW.target_financial_transaction_id IS NOT NULL THEN
    SELECT * INTO v_target FROM public.financial_transactions transaction
     WHERE transaction.id=NEW.target_financial_transaction_id
       AND transaction.company_id=NEW.company_id AND transaction.parent_transaction_id IS NULL
       AND transaction.cancelled_at IS NULL FOR UPDATE;
    IF NOT FOUND OR (NEW.party_type='customer' AND (
         v_target.customer_id IS DISTINCT FROM NEW.customer_id OR v_target.transaction_type::text<>'entrada'))
       OR (NEW.party_type='supplier' AND (
         v_target.supplier_id IS DISTINCT FROM NEW.supplier_id OR v_target.transaction_type::text<>'saida'))
    THEN RAISE EXCEPTION 'A obrigação não pertence a esta conta.'
      USING ERRCODE='23514',DETAIL='code=pdv_party_credit_target_invalid'; END IF;
    IF NEW.amount<0 THEN
      v_open:=public.pdv_party_obligation_open_v2(v_target.id);
      IF -NEW.amount>v_open THEN RAISE EXCEPTION 'O crédito ultrapassa o valor em aberto.'
        USING ERRCODE='23514',DETAIL='code=pdv_party_credit_exceeds_open'; END IF;
    END IF;
  END IF;
  v_available:=public.pdv_party_available_credit_v2(NEW.company_id,NEW.party_type,v_party);
  IF v_available+NEW.amount<0 THEN RAISE EXCEPTION 'O crédito disponível é insuficiente.'
    USING ERRCODE='23514',DETAIL='code=pdv_party_credit_insufficient'; END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_pdv_party_credit_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.pdv_party_credit_entries
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_party_credit_entry_v2();

CREATE OR REPLACE FUNCTION public.pdv_recalc_after_party_credit_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_target public.financial_transactions%ROWTYPE; v_total numeric(14,2);
BEGIN
  IF NEW.target_financial_transaction_id IS NOT NULL THEN
    SELECT * INTO v_target FROM public.financial_transactions transaction
     WHERE transaction.id=NEW.target_financial_transaction_id FOR UPDATE;
    IF v_target.transaction_type::text='entrada' THEN
      PERFORM public.recalc_amount_received(NEW.target_financial_transaction_id);
      PERFORM public.pdv_sync_party_receivable_payment_v2(NEW.target_financial_transaction_id);
    ELSE
      -- Pagáveis legados não possuem a alocação W1A dos recebíveis. O delta
      -- append-only preserva pagamentos já materializados em amount_received.
      v_total:=GREATEST(LEAST(v_target.amount,
        COALESCE(v_target.amount_received,0)-NEW.amount),0);
      PERFORM set_config('app.pdv_receivable_recalc',v_target.id::text,true);
      UPDATE public.financial_transactions SET amount_received=v_total
       WHERE id=v_target.id;
      PERFORM set_config('app.pdv_receivable_recalc','',true);
    END IF;
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER trg_pdv_party_credit_recalc
  AFTER INSERT ON public.pdv_party_credit_entries
  FOR EACH ROW EXECUTE FUNCTION public.pdv_recalc_after_party_credit_v2();

-- Uma aplicação de crédito reduz a obrigação, mas não é entrada/saída de
-- dinheiro. O adaptador legado W1C continua reconhecendo a competência e
-- exclui a obrigação quitada por crédito do DRE-caixa/DFC.
DO $patch_pdv_projection$
DECLARE v_src text; v_anchor text; v_insert text;
BEGIN
  SELECT pg_get_functiondef('public.pdv_financial_projection_rows_v2(uuid)'::regprocedure)
    INTO v_src;
  IF position('pdv_party_credit_entries' in v_src)=0 THEN
    v_anchor:='     AND NOT ('||chr(10)||
      '       projection.kind = ''dre_competence''';
    v_insert:='     AND ('||chr(10)||
      '       projection.kind = ''dre_competence'''||chr(10)||
      '       OR NOT EXISTS ('||chr(10)||
      '         SELECT 1 FROM public.pdv_party_credit_entries credit_entry'||chr(10)||
      '          WHERE credit_entry.target_financial_transaction_id = transaction.id'||chr(10)||
      '       )'||chr(10)||
      '     )'||chr(10);
    IF position(v_anchor in v_src)=0 THEN
      RAISE EXCEPTION 'Âncora do adaptador W1C mudou';
    END IF;
    v_src:=replace(v_src,v_anchor,v_insert||v_anchor);
    EXECUTE v_src;
  END IF;
END $patch_pdv_projection$;

-- Legado é adaptado pelo SALDO líquido em pdv_party_available_credit_v2.
-- Migrar cada linha negativa ressuscitaria crédito já consumido por vendas
-- posteriores; o adaptador é repetível e não escreve nem duplica fatos.

CREATE OR REPLACE FUNCTION public.pdv_post_party_credit_v2(
  p_party_type text,p_party_id uuid,p_entry_kind text,p_amount numeric,
  p_occurred_on date,p_description text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_claim record; v_date date; v_description text; v_entry uuid; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_party_account_context_v2(TRUE);
  PERFORM public.pdv_assert_party_v2(v_context.company_id,p_party_type,p_party_id);
  IF p_entry_kind NOT IN ('credit','adjustment') OR p_amount IS NULL OR p_amount=0
     OR lower(p_amount::text) IN ('nan','infinity','-infinity')
     OR p_amount<>round(p_amount,2)
     OR (p_entry_kind='credit' AND p_amount<0) OR abs(p_amount)>999999999.99
  THEN RAISE EXCEPTION 'Informe um crédito ou ajuste válido.'
    USING ERRCODE='22023',DETAIL='code=pdv_party_credit_amount_invalid'; END IF;
  v_date:=COALESCE(p_occurred_on,public.company_today(v_context.company_id));
  IF v_date>public.company_today(v_context.company_id) THEN RAISE EXCEPTION 'A data não pode estar no futuro.'
    USING ERRCODE='22023',DETAIL='code=pdv_party_credit_date_invalid'; END IF;
  v_description:=NULLIF(btrim(COALESCE(p_description,'')),'');
  IF v_description IS NULL OR char_length(v_description)>500 THEN RAISE EXCEPTION 'Informe uma descrição de até 500 caracteres.'
    USING ERRCODE='22023',DETAIL='code=pdv_party_credit_description_invalid'; END IF;
  IF p_party_type='customer' THEN PERFORM 1 FROM public.customers WHERE id=p_party_id ORDER BY id FOR UPDATE;
  ELSE PERFORM 1 FROM public.suppliers WHERE id=p_party_id ORDER BY id FOR UPDATE; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(
    v_context.company_id,'party.credit.post.v2',p_idempotency_key,
    jsonb_build_object('party_type',p_party_type,'party_id',p_party_id,'entry_kind',p_entry_kind,
      'amount',round(p_amount,2),'occurred_on',v_date,'description',v_description));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',TRUE); END IF;
    RAISE EXCEPTION 'Este ajuste já está em processamento.' USING ERRCODE='55000',DETAIL='code=pdv_party_credit_in_progress';
  END IF;
  INSERT INTO public.pdv_party_credit_entries(company_id,party_type,customer_id,supplier_id,
    entry_kind,amount,occurred_on,description,operation_request_id,created_by)
  VALUES(v_context.company_id,p_party_type,CASE WHEN p_party_type='customer' THEN p_party_id END,
    CASE WHEN p_party_type='supplier' THEN p_party_id END,p_entry_kind,round(p_amount,2),
    v_date,v_description,v_claim.request_id,v_context.user_id) RETURNING id INTO v_entry;
  v_result:=jsonb_build_object('ok',TRUE,'entry_id',v_entry,'party_type',p_party_type,
    'party_id',p_party_id,'available_credit',public.pdv_party_available_credit_v2(
      v_context.company_id,p_party_type,p_party_id),'idempotent',FALSE);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_party_credit_entry',v_entry,v_result);
  RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_apply_party_credit_v2(
  p_party_type text,p_party_id uuid,p_financial_transaction_id uuid,p_amount numeric,
  p_occurred_on date,p_description text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_claim record; v_date date; v_description text; v_entry uuid; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_party_account_context_v2(TRUE);
  PERFORM public.pdv_assert_party_v2(v_context.company_id,p_party_type,p_party_id);
  IF p_amount IS NULL OR p_amount<=0 OR lower(p_amount::text) IN ('nan','infinity','-infinity')
     OR p_amount<>round(p_amount,2) OR p_amount>999999999.99 THEN RAISE EXCEPTION 'Informe um valor positivo em centavos.'
    USING ERRCODE='22023',DETAIL='code=pdv_party_credit_amount_invalid'; END IF;
  v_date:=COALESCE(p_occurred_on,public.company_today(v_context.company_id));
  IF v_date>public.company_today(v_context.company_id) THEN RAISE EXCEPTION 'A data não pode estar no futuro.'
    USING ERRCODE='22023',DETAIL='code=pdv_party_credit_date_invalid'; END IF;
  v_description:=COALESCE(NULLIF(btrim(COALESCE(p_description,'')),''),'Aplicação de crédito');
  IF char_length(v_description)>500 THEN RAISE EXCEPTION 'A descrição deve ter até 500 caracteres.'
    USING ERRCODE='22023',DETAIL='code=pdv_party_credit_description_invalid'; END IF;
  IF p_party_type='customer' THEN PERFORM 1 FROM public.customers WHERE id=p_party_id ORDER BY id FOR UPDATE;
  ELSE PERFORM 1 FROM public.suppliers WHERE id=p_party_id ORDER BY id FOR UPDATE; END IF;
  PERFORM 1 FROM public.financial_transactions WHERE id=p_financial_transaction_id ORDER BY id FOR UPDATE;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(
    v_context.company_id,'party.credit.apply.v2',p_idempotency_key,
    jsonb_build_object('party_type',p_party_type,'party_id',p_party_id,
      'financial_transaction_id',p_financial_transaction_id,'amount',round(p_amount,2),
      'occurred_on',v_date,'description',v_description));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',TRUE); END IF;
    RAISE EXCEPTION 'Esta aplicação já está em processamento.' USING ERRCODE='55000',DETAIL='code=pdv_party_credit_in_progress';
  END IF;
  INSERT INTO public.pdv_party_credit_entries(company_id,party_type,customer_id,supplier_id,
    entry_kind,amount,occurred_on,description,target_financial_transaction_id,
    operation_request_id,created_by)
  VALUES(v_context.company_id,p_party_type,CASE WHEN p_party_type='customer' THEN p_party_id END,
    CASE WHEN p_party_type='supplier' THEN p_party_id END,'application',-round(p_amount,2),
    v_date,v_description,p_financial_transaction_id,v_claim.request_id,v_context.user_id)
  RETURNING id INTO v_entry;
  v_result:=jsonb_build_object('ok',TRUE,'entry_id',v_entry,'financial_transaction_id',
    p_financial_transaction_id,'applied_amount',round(p_amount,2),'available_credit',
    public.pdv_party_available_credit_v2(v_context.company_id,p_party_type,p_party_id),'idempotent',FALSE);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_party_credit_entry',v_entry,v_result);
  RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_reverse_party_credit_entry_v2(
  p_entry_id uuid,p_reason text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_claim record; v_original public.pdv_party_credit_entries%ROWTYPE;
  v_party uuid; v_entry uuid; v_reason text; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_party_account_context_v2(TRUE);
  v_reason:=NULLIF(btrim(COALESCE(p_reason,'')),'');
  IF v_reason IS NULL OR char_length(v_reason)>500 THEN RAISE EXCEPTION 'Informe o motivo do estorno.'
    USING ERRCODE='22023',DETAIL='code=pdv_party_credit_reason_invalid'; END IF;
  SELECT * INTO v_original FROM public.pdv_party_credit_entries entry
   WHERE entry.id=p_entry_id AND entry.company_id=v_context.company_id FOR UPDATE;
  IF NOT FOUND OR v_original.entry_kind='reversal' THEN
    RAISE EXCEPTION 'Movimento não encontrado ou não estornável.' USING ERRCODE='P0002',DETAIL='code=pdv_party_credit_not_reversible';
  END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(
    v_context.company_id,'party.credit.reverse.v2',p_idempotency_key,
    jsonb_build_object('entry_id',p_entry_id,'reason',v_reason));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',TRUE); END IF;
    RAISE EXCEPTION 'Este estorno já está em processamento.' USING ERRCODE='55000',DETAIL='code=pdv_party_credit_in_progress';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_party_credit_entries reversal
    WHERE reversal.reversal_of_id=v_original.id) THEN
    RAISE EXCEPTION 'Este movimento já foi estornado.'
      USING ERRCODE='23514',DETAIL='code=pdv_party_credit_already_reversed';
  END IF;
  v_party:=COALESCE(v_original.customer_id,v_original.supplier_id);
  IF v_original.party_type='customer' THEN
    PERFORM 1 FROM public.customers WHERE id=v_party ORDER BY id FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.suppliers WHERE id=v_party ORDER BY id FOR UPDATE;
  END IF;
  INSERT INTO public.pdv_party_credit_entries(company_id,party_type,customer_id,supplier_id,
    entry_kind,amount,occurred_on,description,target_financial_transaction_id,
    reversal_of_id,operation_request_id,created_by)
  VALUES(v_context.company_id,v_original.party_type,v_original.customer_id,v_original.supplier_id,
    'reversal',-v_original.amount,public.company_today(v_context.company_id),v_reason,
    v_original.target_financial_transaction_id,v_original.id,v_claim.request_id,v_context.user_id)
  RETURNING id INTO v_entry;
  v_result:=jsonb_build_object('ok',TRUE,'entry_id',v_entry,'reversal_of_id',p_entry_id,
    'available_credit',public.pdv_party_available_credit_v2(v_context.company_id,
      v_original.party_type,v_party),'idempotent',FALSE);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_party_credit_entry',v_entry,v_result);
  RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_party_account_summary_v2(p_party_type text,p_party_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_open numeric(14,2); v_credit numeric(14,2); v_limit numeric(14,2);
  v_capacity numeric(14,2); v_can_limit boolean;
BEGIN
  SELECT * INTO v_context FROM public.pdv_party_account_context_v2(FALSE);
  PERFORM public.pdv_assert_party_v2(v_context.company_id,p_party_type,p_party_id);
  SELECT round(COALESCE(sum(public.pdv_party_obligation_open_v2(transaction.id)),0),2)
    INTO v_open FROM public.financial_transactions transaction
   WHERE transaction.company_id=v_context.company_id AND transaction.parent_transaction_id IS NULL
     AND transaction.cancelled_at IS NULL
     AND ((p_party_type='customer' AND transaction.customer_id=p_party_id
       AND transaction.transaction_type::text='entrada')
       OR (p_party_type='supplier' AND transaction.supplier_id=p_party_id
       AND transaction.transaction_type::text='saida'));
  IF p_party_type='customer' THEN
    SELECT round(v_open+GREATEST(COALESCE(sum(ledger.amount),0),0),2)
      INTO v_open FROM public.customer_credit_ledger ledger
     WHERE ledger.company_id=v_context.company_id AND ledger.customer_id=p_party_id
       AND ledger.financial_transaction_id IS NULL;
  END IF;
  v_credit:=public.pdv_party_available_credit_v2(v_context.company_id,p_party_type,p_party_id);
  v_can_limit:=public.is_admin_or_gestor(v_context.user_id) OR public.is_super_admin(v_context.user_id)
    OR public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:view_party_credit_limit');
  IF p_party_type='customer' AND v_can_limit THEN
    SELECT customer.credit_limit INTO v_limit FROM public.customers customer
     WHERE customer.id=p_party_id AND customer.company_id=v_context.company_id;
    v_capacity:=CASE WHEN v_limit IS NULL THEN NULL
      ELSE GREATEST(round(v_limit-v_open,2),0) END;
  END IF;
  RETURN jsonb_build_object('party_type',p_party_type,'party_id',p_party_id,
    'open_amount',v_open,'available_credit',v_credit,
    'credit_limit',CASE WHEN v_can_limit THEN v_limit ELSE NULL END,
    'purchase_capacity',CASE WHEN v_can_limit THEN v_capacity ELSE NULL END,
    'as_of',public.company_today(v_context.company_id));
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_party_account_statement_v2(
  p_party_type text,p_party_id uuid,p_limit integer DEFAULT 50,p_offset integer DEFAULT 0
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_entries jsonb; v_total bigint;
BEGIN
  SELECT * INTO v_context FROM public.pdv_party_account_context_v2(FALSE);
  PERFORM public.pdv_assert_party_v2(v_context.company_id,p_party_type,p_party_id);
  IF p_limit IS NULL OR p_offset IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset<0 THEN RAISE EXCEPTION 'Paginação inválida.'
    USING ERRCODE='22023',DETAIL='code=pdv_party_account_pagination_invalid'; END IF;
  WITH rows AS (
    SELECT transaction.id,'obligation'::text source_type,transaction.amount::numeric amount,
      transaction.transaction_date occurred_on,transaction.description,
      transaction.due_date,transaction.is_paid,
      public.pdv_party_obligation_open_v2(transaction.id) open_amount,
      CASE
        WHEN public.pdv_party_obligation_open_v2(transaction.id)=0
          AND transaction.is_paid IS TRUE THEN 'paid'
        WHEN public.pdv_party_obligation_open_v2(transaction.id)=0 THEN 'closed_by_credit'
        WHEN COALESCE(transaction.amount_received,0)>0 THEN 'partial'
        ELSE 'open' END account_status
    FROM public.financial_transactions transaction
    WHERE transaction.company_id=v_context.company_id AND transaction.parent_transaction_id IS NULL
      AND transaction.cancelled_at IS NULL
      AND ((p_party_type='customer' AND transaction.customer_id=p_party_id AND transaction.transaction_type::text='entrada')
        OR (p_party_type='supplier' AND transaction.supplier_id=p_party_id AND transaction.transaction_type::text='saida'))
    UNION ALL
    SELECT entry.id,entry.entry_kind,entry.amount,entry.occurred_on,entry.description,
      NULL::date,NULL::boolean,NULL::numeric,NULL::text
    FROM public.pdv_party_credit_entries entry
    WHERE entry.company_id=v_context.company_id AND entry.party_type=p_party_type
      AND ((p_party_type='customer' AND entry.customer_id=p_party_id)
        OR (p_party_type='supplier' AND entry.supplier_id=p_party_id))
    UNION ALL
    SELECT md5('pdv-legacy-credit-balance:'||p_party_id::text)::uuid,
      CASE WHEN sum(ledger.amount)>0 THEN 'legacy_debt_balance' ELSE 'legacy_credit_balance' END,
      round(abs(sum(ledger.amount)),2),
      (max(ledger.created_at) AT TIME ZONE COALESCE(max(settings.timezone),'America/Sao_Paulo'))::date,
      CASE WHEN sum(ledger.amount)>0 THEN 'Dívida líquida legada' ELSE 'Crédito líquido legado' END,
      NULL::date,NULL::boolean,
      CASE WHEN sum(ledger.amount)>0 THEN round(sum(ledger.amount),2) ELSE NULL::numeric END,
      NULL::text
    FROM public.customer_credit_ledger ledger
    LEFT JOIN public.company_settings settings ON settings.company_id=ledger.company_id
    WHERE p_party_type='customer' AND ledger.company_id=v_context.company_id
      AND ledger.customer_id=p_party_id AND ledger.financial_transaction_id IS NULL
    HAVING sum(ledger.amount)<>0
  ), page AS (
    SELECT * FROM rows ORDER BY occurred_on DESC,id DESC LIMIT p_limit OFFSET p_offset
  )
  SELECT (SELECT count(*) FROM rows),COALESCE(jsonb_agg(jsonb_build_object(
      'id',page.id,'source_type',page.source_type,'amount',page.amount,
      'occurred_on',page.occurred_on,'description',page.description,
      'due_date',page.due_date,'is_paid',page.is_paid,'open_amount',page.open_amount,
      'account_status',page.account_status)
      ORDER BY page.occurred_on DESC,page.id DESC),'[]'::jsonb)
    INTO v_total,v_entries FROM page;
  RETURN jsonb_build_object('summary',public.pdv_party_account_summary_v2(p_party_type,p_party_id),
    'entries',v_entries,'total_count',v_total,'limit',p_limit,'offset',p_offset);
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_party_settle_receivables_v2(
  p_customer_id uuid,p_allocations jsonb,p_method text,p_account_id uuid,
  p_session_id uuid,p_received_on date,p_notes text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record;
BEGIN
  SELECT * INTO v_context FROM public.pdv_party_account_context_v2(FALSE);
  PERFORM public.pdv_assert_party_v2(v_context.company_id,'customer',p_customer_id);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p_allocations,'[]'::jsonb)) item
    JOIN public.financial_transactions transaction ON transaction.id=(item->>'receivable_id')::uuid
    WHERE transaction.customer_id IS DISTINCT FROM p_customer_id
      OR transaction.company_id IS DISTINCT FROM v_context.company_id)
  THEN RAISE EXCEPTION 'Todas as parcelas devem pertencer ao cliente selecionado.'
    USING ERRCODE='23514',DETAIL='code=pdv_party_account_receivable_mismatch'; END IF;
  RETURN public.pdv_settle_receivables_v2(p_allocations,p_method,p_account_id,p_session_id,
    p_received_on,p_notes,p_idempotency_key);
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_party_reverse_receivable_settlement_v2(
  p_customer_id uuid,p_settlement_transaction_id uuid,p_account_id uuid,
  p_session_id uuid,p_reason text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record;
BEGIN
  SELECT * INTO v_context FROM public.pdv_party_account_context_v2(FALSE);
  PERFORM public.pdv_assert_party_v2(v_context.company_id,'customer',p_customer_id);
  IF NOT EXISTS(SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
    WHERE allocation.company_id=v_context.company_id AND allocation.customer_id=p_customer_id
      AND allocation.settlement_transaction_id=p_settlement_transaction_id) THEN
    RAISE EXCEPTION 'Recebimento não encontrado para este cliente.'
      USING ERRCODE='P0002',DETAIL='code=pdv_party_account_settlement_not_found';
  END IF;
  RETURN public.pdv_reverse_receivable_settlement_v2(p_settlement_transaction_id,p_account_id,
    p_session_id,p_reason,p_idempotency_key);
END $fn$;

-- Lifecycle: os resets PDV e financeiro eliminam ledger antes das requests
-- idempotentes; assim nenhum replay aponta para um recurso já removido.
DO $patch_reset$
DECLARE v_oid regprocedure; v_src text; v_anchor text; v_insert text;
BEGIN
  SELECT procedure.oid::regprocedure,pg_get_functiondef(procedure.oid) INTO v_oid,v_src
    FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
   WHERE namespace.nspname='public' AND procedure.proname='reset_system_step'
     AND pg_get_function_identity_arguments(procedure.oid)='p_company_id uuid, p_step text, p_audit_id uuid';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'reset_system_step não encontrada'; END IF;
  IF position('PDV_PARTY_ACCOUNT_PDV_RESET_V2' in v_src)=0 THEN
    v_anchor:='DELETE FROM public.customer_credit_ledger WHERE company_id = p_company_id;';
    IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Âncora do ledger legado mudou'; END IF;
    v_insert:='-- PDV_PARTY_ACCOUNT_PDV_RESET_V2'||chr(10)||
      '    DELETE FROM public.pdv_party_credit_entries WHERE company_id = p_company_id;'||chr(10)||
      '    DELETE FROM public.pdv_operation_requests request'||chr(10)||
      '     WHERE request.company_id = p_company_id'||chr(10)||
      '       AND request.operation_type IN (''party.credit.post.v2'', ''party.credit.apply.v2'', ''party.credit.reverse.v2'');'||chr(10)||
      '    '||v_anchor;
    v_src:=replace(v_src,v_anchor,v_insert);
  END IF;
  IF position('PDV_PARTY_ACCOUNT_FINANCIAL_RESET_V2' in v_src)=0 THEN
    v_anchor:='ELSIF p_step = ''financial_movements'' THEN';
    IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Âncora do reset financeiro mudou'; END IF;
    v_insert:=v_anchor||chr(10)||
      '    -- PDV_PARTY_ACCOUNT_FINANCIAL_RESET_V2'||chr(10)||
      '    PERFORM set_config(''app.pdv_purge_company'', p_company_id::text, true);'||chr(10)||
      '    DELETE FROM public.pdv_party_credit_entries WHERE company_id = p_company_id;'||chr(10)||
      '    DELETE FROM public.pdv_operation_requests request'||chr(10)||
      '     WHERE request.company_id = p_company_id'||chr(10)||
      '       AND request.operation_type IN (''party.credit.post.v2'', ''party.credit.apply.v2'', ''party.credit.reverse.v2'');';
    v_src:=replace(v_src,v_anchor,v_insert);
  END IF;
  EXECUTE v_src;
END $patch_reset$;

REVOKE ALL ON FUNCTION public.pdv_party_account_context_v2(boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_party_accounts_v2_enabled_internal(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_assert_party_v2(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_party_available_credit_v2(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_party_obligation_open_v2(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_receivable_monetary_total_v2(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_receivable_received_total_v2(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_sync_party_receivable_payment_v2(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_recalc_receivable_after_allocation_v2() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_guard_receivable_financial_v2() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_guard_party_credit_entry_v2() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_recalc_after_party_credit_v2() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.recalc_amount_received(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_amount_received(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.pdv_post_party_credit_v2(text,uuid,text,numeric,date,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_apply_party_credit_v2(text,uuid,uuid,numeric,date,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_reverse_party_credit_entry_v2(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_party_account_summary_v2(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_party_account_statement_v2(text,uuid,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_party_settle_receivables_v2(uuid,jsonb,text,uuid,uuid,date,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_party_reverse_receivable_settlement_v2(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_post_party_credit_v2(text,uuid,text,numeric,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_apply_party_credit_v2(text,uuid,uuid,numeric,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_reverse_party_credit_entry_v2(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_party_account_summary_v2(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_party_account_statement_v2(text,uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_party_settle_receivables_v2(uuid,jsonb,text,uuid,uuid,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_party_reverse_receivable_settlement_v2(uuid,uuid,uuid,uuid,text,text) TO authenticated;

COMMENT ON TABLE public.pdv_party_credit_entries IS
  'Ledger append-only de crédito/adiantamento de cliente ou fornecedor. Dívidas permanecem em financial_transactions; voucher e devolução não pertencem a esta tabela.';
COMMENT ON FUNCTION public.pdv_party_account_summary_v2(text,uuid) IS
  'Resumo seguro: purchase_capacity é somente fiado disponível (limite menos aberto). available_credit fica separado e não aumenta autorização de fiado.';
COMMENT ON FUNCTION public.pdv_receivable_received_total_v2(uuid,uuid) IS
  'Outstanding canônico: soma liquidação monetária e crédito. is_paid/paid_date permanecem exclusivamente monetários; extrato expõe closed_by_credit separadamente.';

COMMIT;

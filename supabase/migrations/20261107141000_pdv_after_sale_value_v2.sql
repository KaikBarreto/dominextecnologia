-- W5-02: vouchers, reembolsos e troca como fatos separados da devolucao.
-- A devolucao W5 continua sendo o unico fato de receita/CMV/estoque. Esta
-- migration somente realoca o valor ja devolvido e materializa caixa/DFC
-- quando um reembolso e efetivamente liquidado.
BEGIN;

INSERT INTO public.app_feature_flags(key,enabled,contract_allowlist,company_allowlist)
VALUES('pdv_after_sale_value_v2',false,'{}'::uuid[],'{}'::uuid[])
ON CONFLICT(key) DO NOTHING;

-- Reembolso e seu estorno sao fatos exclusivos de caixa/DFC: a devolucao W5
-- ja recompôs receita e CMV. A categoria de sistema usa o mecanismo estrutural
-- que a DRE global ja respeita (`dre_group = outros`). O seed canônico único
-- continua sendo seed_system_financial_categories; não criamos trigger rival.
INSERT INTO public.financial_categories(company_id,name,type,color,icon,dre_group,dfc_group,is_system,is_active)
SELECT company.id,category.name,category.type,'#64748b',category.icon,'outros','operacional',true,true
  FROM public.companies company
 CROSS JOIN (VALUES('Reembolso de venda do PDV','saida','Undo2'),
                   ('Estorno de reembolso do PDV','entrada','Redo2')) category(name,type,icon)
ON CONFLICT(company_id,name) DO UPDATE SET
  dre_group='outros',dfc_group='operacional',is_system=true,is_active=true;

DO $patch_category_seed$
DECLARE v_src text; v_anchor text; v_insert text;
BEGIN
  SELECT pg_get_functiondef('public.seed_system_financial_categories()'::regprocedure) INTO v_src;
  IF position('Reembolso de venda do PDV' in v_src)=0 THEN
    v_anchor:='  RETURN NEW;';
    v_insert:='  INSERT INTO public.financial_categories(company_id,name,type,color,icon,dre_group,dfc_group,is_system,is_active)'||chr(10)||
      '  VALUES'||chr(10)||
      '    (NEW.id,''Reembolso de venda do PDV'',''saida'',''#64748b'',''Undo2'',''outros'',''operacional'',true,true),'||chr(10)||
      '    (NEW.id,''Estorno de reembolso do PDV'',''entrada'',''#64748b'',''Redo2'',''outros'',''operacional'',true,true)'||chr(10)||
      '  ON CONFLICT(company_id,name) DO UPDATE SET dre_group=''outros'',dfc_group=''operacional'',is_system=true,is_active=true;'||chr(10)||chr(10)||
      v_anchor;
    IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Âncora do seed financeiro mudou'; END IF;
    v_src:=replace(v_src,v_anchor,v_insert); EXECUTE v_src;
  END IF;
END $patch_category_seed$;

CREATE TABLE public.pdv_return_value_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  commercial_return_id uuid NOT NULL REFERENCES public.pdv_commercial_returns(id) ON DELETE RESTRICT,
  destination_kind text NOT NULL CHECK(destination_kind IN('voucher','refund')),
  amount numeric(14,2) NOT NULL CHECK(amount<>0 AND amount=round(amount,2)
    AND lower(amount::text) NOT IN('nan','infinity','-infinity') AND abs(amount)<=999999999.99),
  resource_id uuid NOT NULL,
  reversal_of_id uuid REFERENCES public.pdv_return_value_events(id) ON DELETE RESTRICT,
  operation_request_id uuid NOT NULL REFERENCES public.pdv_operation_requests(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_return_value_event_sign_check CHECK(
    (amount>0 AND reversal_of_id IS NULL) OR (amount<0 AND reversal_of_id IS NOT NULL)
  ),
  UNIQUE(operation_request_id),
  UNIQUE(reversal_of_id)
);

CREATE TABLE public.pdv_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  public_code text NOT NULL CHECK(public_code ~ '^DV-[A-Z0-9]{16}$'),
  source_commercial_return_id uuid NOT NULL REFERENCES public.pdv_commercial_returns(id) ON DELETE RESTRICT,
  issued_on date NOT NULL,
  expires_on date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_voucher_expiry_check CHECK(expires_on IS NULL OR expires_on>=issued_on),
  UNIQUE(company_id,public_code)
);

CREATE TABLE public.pdv_voucher_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  voucher_id uuid NOT NULL REFERENCES public.pdv_vouchers(id) ON DELETE RESTRICT,
  entry_kind text NOT NULL CHECK(entry_kind IN('issue','redeem','reversal')),
  amount numeric(14,2) NOT NULL CHECK(amount<>0 AND amount=round(amount,2)
    AND lower(amount::text) NOT IN('nan','infinity','-infinity') AND abs(amount)<=999999999.99),
  order_id uuid REFERENCES public.pdv_orders(id) ON DELETE RESTRICT,
  reversal_of_id uuid REFERENCES public.pdv_voucher_entries(id) ON DELETE RESTRICT,
  operation_request_id uuid NOT NULL REFERENCES public.pdv_operation_requests(id) ON DELETE RESTRICT,
  description text NOT NULL CHECK(char_length(description) BETWEEN 1 AND 500),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_voucher_entry_shape_check CHECK(
    (entry_kind='issue' AND amount>0 AND order_id IS NULL AND reversal_of_id IS NULL)
    OR (entry_kind='redeem' AND amount<0 AND order_id IS NOT NULL AND reversal_of_id IS NULL)
    OR (entry_kind='reversal' AND reversal_of_id IS NOT NULL)
  ),
  UNIQUE(operation_request_id),
  UNIQUE(reversal_of_id)
);

CREATE TABLE public.pdv_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  commercial_return_id uuid NOT NULL REFERENCES public.pdv_commercial_returns(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  original_payment_id uuid NOT NULL REFERENCES public.pdv_order_payments(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK(method IN('dinheiro','pix','transferencia','debito','credito')),
  amount numeric(14,2) NOT NULL CHECK(amount>0 AND amount=round(amount,2)
    AND lower(amount::text) NOT IN('nan','infinity','-infinity') AND amount<=999999999.99),
  requested_on date NOT NULL,
  reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500),
  operation_request_id uuid NOT NULL REFERENCES public.pdv_operation_requests(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(operation_request_id)
);

CREATE TABLE public.pdv_refund_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  refund_id uuid NOT NULL REFERENCES public.pdv_refunds(id) ON DELETE RESTRICT,
  event_kind text NOT NULL CHECK(event_kind IN('requested','settled','reversed')),
  financial_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,
  custody_entry_id uuid REFERENCES public.pdv_cash_custody_entries(id) ON DELETE RESTRICT,
  reversal_of_id uuid REFERENCES public.pdv_refund_events(id) ON DELETE RESTRICT,
  operation_request_id uuid NOT NULL REFERENCES public.pdv_operation_requests(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_refund_event_shape_check CHECK(
    (event_kind='requested' AND financial_transaction_id IS NULL AND custody_entry_id IS NULL
      AND reversal_of_id IS NULL)
    OR (event_kind='settled' AND financial_transaction_id IS NOT NULL AND reversal_of_id IS NULL)
    OR (event_kind='reversed' AND financial_transaction_id IS NOT NULL AND reversal_of_id IS NOT NULL)
  ),
  UNIQUE(operation_request_id,event_kind),
  UNIQUE(reversal_of_id),
  UNIQUE(financial_transaction_id),
  UNIQUE(custody_entry_id)
);

CREATE TABLE public.pdv_exchanges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  commercial_return_id uuid NOT NULL REFERENCES public.pdv_commercial_returns(id) ON DELETE RESTRICT,
  original_order_id uuid NOT NULL REFERENCES public.pdv_orders(id) ON DELETE RESTRICT,
  new_order_id uuid NOT NULL REFERENCES public.pdv_orders(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  applied_voucher_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(applied_voucher_amount>=0
    AND applied_voucher_amount=round(applied_voucher_amount,2)
    AND lower(applied_voucher_amount::text) NOT IN('nan','infinity','-infinity')
    AND applied_voucher_amount<=999999999.99),
  applied_credit_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(applied_credit_amount>=0
    AND applied_credit_amount=round(applied_credit_amount,2)
    AND lower(applied_credit_amount::text) NOT IN('nan','infinity','-infinity')
    AND applied_credit_amount<=999999999.99),
  difference_amount numeric(14,2) NOT NULL CHECK(difference_amount>=0
    AND difference_amount=round(difference_amount,2)
    AND lower(difference_amount::text) NOT IN('nan','infinity','-infinity')
    AND difference_amount<=999999999.99),
  operation_request_id uuid NOT NULL REFERENCES public.pdv_operation_requests(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_exchange_orders_distinct CHECK(original_order_id<>new_order_id),
  UNIQUE(new_order_id),
  UNIQUE(operation_request_id)
);

CREATE TABLE public.pdv_exchange_value_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  exchange_id uuid NOT NULL REFERENCES public.pdv_exchanges(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK(source_kind IN('voucher','customer_credit')),
  amount numeric(14,2) NOT NULL CHECK(amount>0 AND amount=round(amount,2)
    AND lower(amount::text) NOT IN('nan','infinity','-infinity') AND amount<=999999999.99),
  voucher_entry_id uuid REFERENCES public.pdv_voucher_entries(id) ON DELETE RESTRICT,
  party_credit_entry_id uuid REFERENCES public.pdv_party_credit_entries(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_exchange_source_shape CHECK(
    (source_kind='voucher' AND voucher_entry_id IS NOT NULL AND party_credit_entry_id IS NULL)
    OR (source_kind='customer_credit' AND voucher_entry_id IS NULL AND party_credit_entry_id IS NOT NULL)
  ),
  UNIQUE(voucher_entry_id),
  UNIQUE(party_credit_entry_id)
);

ALTER TABLE public.pdv_order_payments
  ADD COLUMN IF NOT EXISTS voucher_entry_id uuid REFERENCES public.pdv_voucher_entries(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS party_credit_entry_id uuid REFERENCES public.pdv_party_credit_entries(id) ON DELETE RESTRICT;

ALTER TABLE public.pdv_order_payments DROP CONSTRAINT IF EXISTS pdv_order_payments_method_check;
ALTER TABLE public.pdv_order_payments ADD CONSTRAINT pdv_order_payments_method_check CHECK(method IN(
  'dinheiro','pix','transferencia','debito','credito','fiado','pontos','voucher','saldo_cliente'));
ALTER TABLE public.pdv_order_payments ADD CONSTRAINT pdv_order_payments_after_sale_source_check CHECK(
  (coverage_kind='voucher' AND method='voucher' AND voucher_entry_id IS NOT NULL AND party_credit_entry_id IS NULL)
  OR (coverage_kind='customer_credit' AND method='saldo_cliente' AND voucher_entry_id IS NULL AND party_credit_entry_id IS NOT NULL)
  OR (coverage_kind NOT IN('voucher','customer_credit') AND voucher_entry_id IS NULL AND party_credit_entry_id IS NULL)
  OR contract_version IS DISTINCT FROM 2
);

ALTER TABLE public.financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_pdv_role_check;
ALTER TABLE public.financial_transactions ADD CONSTRAINT financial_transactions_pdv_role_check CHECK(
  (pdv_financial_role IS NULL AND pdv_settlement_group_id IS NULL)
  OR (pdv_financial_role IN(
    'pdv_receivable_principal','pdv_receivable_settlement','pdv_receivable_reversal','pdv_card_fee',
    'pdv_cash_shortage','pdv_cash_surplus','pdv_refund','pdv_refund_reversal',
    'pdv_supplier_obligation','pdv_supplier_payment','pdv_custody_transfer'
  ) AND pdv_settlement_group_id IS NOT NULL)
);

CREATE INDEX idx_pdv_return_value_events_return ON public.pdv_return_value_events(company_id,commercial_return_id,created_at,id);
CREATE INDEX idx_pdv_vouchers_customer ON public.pdv_vouchers(company_id,customer_id,created_at,id);
CREATE INDEX idx_pdv_voucher_entries_voucher ON public.pdv_voucher_entries(company_id,voucher_id,created_at,id);
CREATE INDEX idx_pdv_refunds_return ON public.pdv_refunds(company_id,commercial_return_id,created_at,id);
CREATE INDEX idx_pdv_refund_events_refund ON public.pdv_refund_events(company_id,refund_id,created_at,id);
CREATE INDEX idx_pdv_exchanges_return ON public.pdv_exchanges(company_id,commercial_return_id,created_at,id);

ALTER TABLE public.pdv_return_value_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_return_value_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_vouchers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_voucher_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_voucher_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_refund_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_refund_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_exchanges FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_exchange_value_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_exchange_value_applications FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_return_value_events,public.pdv_vouchers,public.pdv_voucher_entries,
  public.pdv_refunds,public.pdv_refund_events,public.pdv_exchanges,
  public.pdv_exchange_value_applications FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_after_sale_v2_enabled_internal(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT COALESCE((SELECT flag.enabled OR p_company_id=ANY(flag.company_allowlist)
    FROM public.app_feature_flags flag WHERE flag.key='pdv_after_sale_value_v2'),false);
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_after_sale_context_v2(p_action text)
RETURNS TABLE(user_id uuid,company_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record;
BEGIN
  SELECT * INTO v_context FROM public.pdv_returns_context_v2(NULL);
  IF public.pdv_after_sale_v2_enabled_internal(v_context.company_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Vouchers, reembolsos e trocas ainda não estão liberados para esta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_rollout_disabled';
  END IF;
  IF NOT public.is_admin_or_gestor(v_context.user_id) AND NOT public.is_super_admin(v_context.user_id)
     AND public.pdv_has_explicit_action_permission_v2(v_context.user_id,p_action) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para esta ação.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_permission_denied';
  END IF;
  RETURN QUERY SELECT v_context.user_id,v_context.company_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_guard_after_sale_append_only_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_company uuid:=COALESCE(OLD.company_id,NEW.company_id); v_original record; v_balance numeric;
BEGIN
  IF TG_OP='DELETE' AND (NOT EXISTS(SELECT 1 FROM public.companies WHERE id=v_company)
    OR COALESCE(current_setting('app.pdv_purge_company',true),'')=v_company::text) THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND OLD.created_by IS NOT NULL AND NEW.created_by IS NULL
    AND NOT EXISTS(SELECT 1 FROM auth.users users WHERE users.id=OLD.created_by)
    AND (to_jsonb(NEW)-'created_by')=(to_jsonb(OLD)-'created_by') THEN RETURN NEW; END IF;
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'O histórico do pós-venda é imutável; registre uma compensação.'
    USING ERRCODE='55000',DETAIL='code=pdv_after_sale_append_only'; END IF;
  IF TG_TABLE_NAME='pdv_return_value_events' AND NEW.reversal_of_id IS NOT NULL THEN
    SELECT * INTO v_original FROM public.pdv_return_value_events WHERE id=NEW.reversal_of_id FOR UPDATE;
    IF NOT FOUND OR v_original.company_id<>NEW.company_id OR v_original.commercial_return_id<>NEW.commercial_return_id
      OR v_original.destination_kind<>NEW.destination_kind OR v_original.resource_id<>NEW.resource_id
      OR NEW.amount<>-v_original.amount THEN RAISE EXCEPTION 'A compensação não corresponde ao destino original.'
      USING ERRCODE='23514',DETAIL='code=pdv_after_sale_reversal_mismatch'; END IF;
  ELSIF TG_TABLE_NAME='pdv_return_value_events' THEN
    IF (NEW.destination_kind='voucher' AND NOT EXISTS(SELECT 1 FROM public.pdv_vouchers resource
          WHERE resource.id=NEW.resource_id AND resource.company_id=NEW.company_id
            AND resource.source_commercial_return_id=NEW.commercial_return_id))
      OR (NEW.destination_kind='refund' AND NOT EXISTS(SELECT 1 FROM public.pdv_refunds resource
          WHERE resource.id=NEW.resource_id AND resource.company_id=NEW.company_id
            AND resource.commercial_return_id=NEW.commercial_return_id)) THEN
      RAISE EXCEPTION 'O destino financeiro não pertence à devolução.'
        USING ERRCODE='23514',DETAIL='code=pdv_after_sale_resource_mismatch'; END IF;
  ELSIF TG_TABLE_NAME='pdv_voucher_entries' THEN
    PERFORM 1 FROM public.pdv_vouchers voucher WHERE voucher.id=NEW.voucher_id
      AND voucher.company_id=NEW.company_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Voucher não encontrado nesta empresa.' USING ERRCODE='P0002'; END IF;
    IF NEW.entry_kind='reversal' THEN
      SELECT * INTO v_original FROM public.pdv_voucher_entries WHERE id=NEW.reversal_of_id FOR UPDATE;
      IF NOT FOUND OR v_original.company_id<>NEW.company_id OR v_original.voucher_id<>NEW.voucher_id
        OR v_original.entry_kind='reversal' OR NEW.amount<>-v_original.amount
        OR NEW.order_id IS DISTINCT FROM v_original.order_id THEN RAISE EXCEPTION 'Estorno de voucher inválido.'
        USING ERRCODE='23514',DETAIL='code=pdv_voucher_reversal_mismatch'; END IF;
    END IF;
    SELECT COALESCE(sum(entry.amount),0) INTO v_balance FROM public.pdv_voucher_entries entry
      WHERE entry.voucher_id=NEW.voucher_id;
    IF v_balance+NEW.amount<0 THEN RAISE EXCEPTION 'O voucher não possui saldo suficiente.'
      USING ERRCODE='23514',DETAIL='code=pdv_voucher_insufficient'; END IF;
  END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_guard_after_sale_relationship_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_return public.pdv_commercial_returns%ROWTYPE; v_order public.pdv_orders%ROWTYPE; v_exchange public.pdv_exchanges%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='pdv_vouchers' THEN
    SELECT * INTO v_return FROM public.pdv_commercial_returns header WHERE header.id=NEW.source_commercial_return_id;
    IF NOT FOUND OR v_return.company_id<>NEW.company_id OR v_return.event_kind<>'return'
      OR v_return.customer_id IS DISTINCT FROM NEW.customer_id THEN RAISE EXCEPTION 'Voucher não pertence à devolução.'
      USING ERRCODE='23514',DETAIL='code=pdv_voucher_return_mismatch'; END IF;
  ELSIF TG_TABLE_NAME='pdv_refunds' THEN
    SELECT * INTO v_return FROM public.pdv_commercial_returns header WHERE header.id=NEW.commercial_return_id;
    IF NOT FOUND OR v_return.company_id<>NEW.company_id OR v_return.event_kind<>'return'
      OR v_return.customer_id IS DISTINCT FROM NEW.customer_id
      OR NOT EXISTS(SELECT 1 FROM public.pdv_order_payments payment WHERE payment.id=NEW.original_payment_id
        AND payment.company_id=NEW.company_id AND payment.order_id=v_return.order_id AND payment.method=NEW.method) THEN
      RAISE EXCEPTION 'Reembolso não corresponde à devolução e ao pagamento original.'
        USING ERRCODE='23514',DETAIL='code=pdv_refund_source_mismatch'; END IF;
  ELSIF TG_TABLE_NAME='pdv_exchanges' THEN
    SELECT * INTO v_return FROM public.pdv_commercial_returns header WHERE header.id=NEW.commercial_return_id;
    SELECT * INTO v_order FROM public.pdv_orders orders WHERE orders.id=NEW.new_order_id;
    IF v_return.id IS NULL OR v_order.id IS NULL OR v_return.company_id<>NEW.company_id OR v_return.order_id<>NEW.original_order_id
      OR v_return.customer_id IS DISTINCT FROM NEW.customer_id OR v_order.company_id<>NEW.company_id
      OR v_order.customer_id IS DISTINCT FROM NEW.customer_id THEN RAISE EXCEPTION 'Troca não corresponde aos pedidos e à devolução.'
      USING ERRCODE='23514',DETAIL='code=pdv_exchange_source_mismatch'; END IF;
  ELSIF TG_TABLE_NAME='pdv_exchange_value_applications' THEN
    SELECT * INTO v_exchange FROM public.pdv_exchanges exchange WHERE exchange.id=NEW.exchange_id;
    IF NOT FOUND OR v_exchange.company_id<>NEW.company_id OR
      (NEW.source_kind='voucher' AND NOT EXISTS(SELECT 1 FROM public.pdv_voucher_entries entry
        WHERE entry.id=NEW.voucher_entry_id AND entry.company_id=NEW.company_id AND entry.order_id=v_exchange.new_order_id)) OR
      (NEW.source_kind='customer_credit' AND NOT EXISTS(SELECT 1 FROM public.pdv_party_credit_entries entry
        WHERE entry.id=NEW.party_credit_entry_id AND entry.company_id=NEW.company_id
          AND entry.customer_id=v_exchange.customer_id)) THEN RAISE EXCEPTION 'A fonte de valor não pertence à troca.'
      USING ERRCODE='23514',DETAIL='code=pdv_exchange_application_mismatch'; END IF;
  ELSIF TG_TABLE_NAME='pdv_order_payments' AND NEW.contract_version=2
      AND NEW.coverage_kind IN('voucher','customer_credit') THEN
    SELECT * INTO v_order FROM public.pdv_orders orders WHERE orders.id=NEW.order_id;
    IF NOT FOUND OR v_order.company_id<>NEW.company_id OR
      (NEW.coverage_kind='voucher' AND NOT EXISTS(SELECT 1 FROM public.pdv_voucher_entries entry
        JOIN public.pdv_vouchers voucher ON voucher.id=entry.voucher_id
        WHERE entry.id=NEW.voucher_entry_id AND entry.company_id=NEW.company_id AND entry.order_id=NEW.order_id
          AND voucher.customer_id IS NOT DISTINCT FROM v_order.customer_id)) OR
      (NEW.coverage_kind='customer_credit' AND NOT EXISTS(SELECT 1 FROM public.pdv_party_credit_entries entry
        WHERE entry.id=NEW.party_credit_entry_id AND entry.company_id=NEW.company_id
          AND entry.customer_id=v_order.customer_id AND entry.entry_kind='application')) THEN
      RAISE EXCEPTION 'A cobertura não pertence ao pedido.'
        USING ERRCODE='23514',DETAIL='code=pdv_order_value_source_mismatch'; END IF;
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_pdv_return_value_append_only BEFORE INSERT OR UPDATE OR DELETE ON public.pdv_return_value_events
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_after_sale_append_only_v2();
CREATE TRIGGER trg_pdv_vouchers_append_only BEFORE UPDATE OR DELETE ON public.pdv_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_after_sale_append_only_v2();
CREATE TRIGGER trg_pdv_voucher_entries_append_only BEFORE INSERT OR UPDATE OR DELETE ON public.pdv_voucher_entries
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_after_sale_append_only_v2();
CREATE TRIGGER trg_pdv_refunds_append_only BEFORE UPDATE OR DELETE ON public.pdv_refunds
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_after_sale_append_only_v2();
CREATE TRIGGER trg_pdv_refund_events_append_only BEFORE UPDATE OR DELETE ON public.pdv_refund_events
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_after_sale_append_only_v2();
CREATE TRIGGER trg_pdv_exchanges_append_only BEFORE UPDATE OR DELETE ON public.pdv_exchanges
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_after_sale_append_only_v2();
CREATE TRIGGER trg_pdv_exchange_apps_append_only BEFORE UPDATE OR DELETE ON public.pdv_exchange_value_applications
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_after_sale_append_only_v2();
CREATE TRIGGER trg_pdv_vouchers_relationship BEFORE INSERT ON public.pdv_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_after_sale_relationship_v2();
CREATE TRIGGER trg_pdv_refunds_relationship BEFORE INSERT ON public.pdv_refunds
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_after_sale_relationship_v2();
CREATE TRIGGER trg_pdv_exchanges_relationship BEFORE INSERT ON public.pdv_exchanges
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_after_sale_relationship_v2();
CREATE TRIGGER trg_pdv_exchange_apps_relationship BEFORE INSERT ON public.pdv_exchange_value_applications
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_after_sale_relationship_v2();
CREATE TRIGGER trg_pdv_order_value_source_relationship BEFORE INSERT OR UPDATE OF company_id,order_id,
  contract_version,coverage_kind,voucher_entry_id,party_credit_entry_id ON public.pdv_order_payments
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_after_sale_relationship_v2();

CREATE OR REPLACE FUNCTION public.pdv_voucher_balance_internal_v2(p_voucher_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT round(COALESCE(sum(entry.amount),0),2) FROM public.pdv_voucher_entries entry
   WHERE entry.voucher_id=p_voucher_id;
$fn$;

-- Libera valor que W5 havia colocado em abatimento/credito. Uma disposicao
-- parcial e desfeita inteira e o residual e recriado, preservando append-only.
CREATE OR REPLACE FUNCTION public.pdv_free_return_value_internal_v2(
  p_company_id uuid,p_user_id uuid,p_return_id uuid,p_amount numeric,p_key_prefix text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_remaining numeric(14,2):=round(p_amount,2); v_disposition record; v_take numeric(14,2);
  v_residual numeric(14,2); v_credit record; v_reverse_app uuid; v_reverse_credit uuid;
  v_new_credit uuid; v_new_application uuid; v_index integer:=0; v_unallocated numeric(14,2);
  v_customer_id uuid;
BEGIN
  IF v_remaining<=0 THEN RAISE EXCEPTION 'Valor de realocação inválido.' USING ERRCODE='22023'; END IF;
  SELECT header.customer_id INTO v_customer_id FROM public.pdv_commercial_returns header
   WHERE header.id=p_return_id AND header.company_id=p_company_id AND header.event_kind='return';
  IF NOT FOUND OR v_customer_id IS NULL THEN RAISE EXCEPTION 'Devolução sem cliente para realocação.'
    USING ERRCODE='23514',DETAIL='code=pdv_return_value_customer_required'; END IF;
  -- Ordem canônica: cliente antes do livro de crédito e da devolução. Assim
  -- troca, refund e voucher serializam com W4 no mesmo saldo.
  PERFORM customer.id FROM public.customers customer
   WHERE customer.id=v_customer_id AND customer.company_id=p_company_id ORDER BY customer.id FOR UPDATE;
  SELECT round(abs(header.commercial_total)
      -COALESCE((SELECT sum(disposition.amount) FROM public.pdv_return_dispositions disposition
        WHERE disposition.commercial_return_id=header.id),0)
      -COALESCE((SELECT sum(value.amount) FROM public.pdv_return_value_events value
        WHERE value.commercial_return_id=header.id),0),2)
    INTO v_unallocated FROM public.pdv_commercial_returns header
   WHERE header.id=p_return_id AND header.company_id=p_company_id AND header.event_kind='return' FOR UPDATE;
  IF v_unallocated IS NULL OR v_unallocated<0 THEN RAISE EXCEPTION 'A conciliação do valor devolvido está inconsistente.'
    USING ERRCODE='55000',DETAIL='code=pdv_return_value_reconciliation_required'; END IF;
  v_remaining:=GREATEST(v_remaining-v_unallocated,0);
  FOR v_disposition IN
    SELECT disposition.* FROM public.pdv_return_dispositions disposition
     WHERE disposition.company_id=p_company_id AND disposition.commercial_return_id=p_return_id
       AND disposition.amount>0
       AND NOT EXISTS(SELECT 1 FROM public.pdv_return_dispositions reversal
         WHERE reversal.reversal_of_id=disposition.id)
     ORDER BY disposition.id FOR UPDATE OF disposition
  LOOP
    EXIT WHEN v_remaining=0; v_index:=v_index+1;
    v_take:=LEAST(v_remaining,v_disposition.amount); v_residual:=v_disposition.amount-v_take;
    v_reverse_app:=NULL;
    IF v_disposition.application_entry_id IS NOT NULL THEN
      SELECT * INTO v_credit FROM public.pdv_party_credit_entries WHERE id=v_disposition.application_entry_id FOR UPDATE;
      v_reverse_app:=public.pdv_return_credit_entry_internal_v2(p_company_id,v_credit.customer_id,p_return_id,
        'reversal',-v_credit.amount,public.company_today(p_company_id),'Realocação de devolução',
        v_credit.target_financial_transaction_id,v_credit.id,p_key_prefix||':ra:'||v_index::text);
    END IF;
    SELECT * INTO v_credit FROM public.pdv_party_credit_entries WHERE id=v_disposition.credit_entry_id FOR UPDATE;
    v_reverse_credit:=public.pdv_return_credit_entry_internal_v2(p_company_id,v_credit.customer_id,p_return_id,
      'reversal',-v_credit.amount,public.company_today(p_company_id),'Realocação de devolução',
      v_credit.target_financial_transaction_id,v_credit.id,p_key_prefix||':rc:'||v_index::text);
    INSERT INTO public.pdv_return_dispositions(company_id,commercial_return_id,disposition_kind,amount,
      receivable_transaction_id,credit_entry_id,application_entry_id,reversal_credit_entry_id,
      reversal_application_entry_id,reversal_of_id)
    VALUES(p_company_id,p_return_id,v_disposition.disposition_kind,-v_disposition.amount,
      v_disposition.receivable_transaction_id,v_disposition.credit_entry_id,v_disposition.application_entry_id,
      v_reverse_credit,v_reverse_app,v_disposition.id);
    IF v_residual>0 THEN
      v_new_credit:=public.pdv_return_credit_entry_internal_v2(p_company_id,v_credit.customer_id,p_return_id,
        'credit',v_residual,public.company_today(p_company_id),'Crédito residual da devolução',NULL,NULL,
        p_key_prefix||':nc:'||v_index::text);
      v_new_application:=NULL;
      IF v_disposition.disposition_kind='receivable_reduction' THEN
        v_new_application:=public.pdv_return_credit_entry_internal_v2(p_company_id,v_credit.customer_id,p_return_id,
          'application',-v_residual,public.company_today(p_company_id),'Abatimento residual da devolução',
          v_disposition.receivable_transaction_id,NULL,p_key_prefix||':na:'||v_index::text);
      END IF;
      INSERT INTO public.pdv_return_dispositions(company_id,commercial_return_id,disposition_kind,amount,
        receivable_transaction_id,credit_entry_id,application_entry_id)
      VALUES(p_company_id,p_return_id,v_disposition.disposition_kind,v_residual,
        v_disposition.receivable_transaction_id,v_new_credit,v_new_application);
    END IF;
    v_remaining:=v_remaining-v_take;
  END LOOP;
  IF v_remaining<>0 THEN RAISE EXCEPTION 'A devolução não possui valor livre para este destino.'
    USING ERRCODE='23514',DETAIL='code=pdv_return_value_not_available'; END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_issue_return_voucher_v2(
  p_return_id uuid,p_amount numeric,p_expires_on date,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $fn$
DECLARE v_context record; v_claim record; v_return public.pdv_commercial_returns%ROWTYPE;
  v_voucher uuid:=gen_random_uuid(); v_entry uuid; v_code text; v_attempt integer:=0; v_result jsonb;
  v_customer_id uuid;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:issue_pdv_voucher');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_return_id => p_return_id
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque desta devolução.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied';
  END IF;
  IF p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2)
    OR lower(p_amount::text) IN('nan','infinity','-infinity') OR p_amount>999999999.99 THEN RAISE EXCEPTION 'Informe um valor válido em centavos.'
    USING ERRCODE='22023',DETAIL='code=pdv_voucher_amount_invalid'; END IF;
  SELECT header.customer_id INTO v_customer_id FROM public.pdv_commercial_returns header
   WHERE header.id=p_return_id AND header.company_id=v_context.company_id AND header.event_kind='return';
  IF NOT FOUND OR v_customer_id IS NULL THEN RAISE EXCEPTION 'Devolução não encontrada ou sem cliente.' USING ERRCODE='P0002'; END IF;
  PERFORM customer.id FROM public.customers customer
   WHERE customer.id=v_customer_id AND customer.company_id=v_context.company_id ORDER BY customer.id FOR UPDATE;
  SELECT * INTO v_return FROM public.pdv_commercial_returns header
   WHERE header.id=p_return_id AND header.company_id=v_context.company_id AND header.event_kind='return' FOR UPDATE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.pdv_commercial_returns r WHERE r.reversal_of_id=p_return_id) THEN
    RAISE EXCEPTION 'Devolução não encontrada ou já compensada.' USING ERRCODE='P0002'; END IF;
  IF v_return.customer_id IS NULL THEN RAISE EXCEPTION 'O voucher exige cliente identificado.' USING ERRCODE='23514'; END IF;
  IF p_expires_on IS NOT NULL AND p_expires_on<public.company_today(v_context.company_id) THEN
    RAISE EXCEPTION 'A validade não pode estar no passado.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'after_sale.voucher.issue.v2',
    p_idempotency_key,jsonb_build_object('return_id',p_return_id,'amount',round(p_amount,2),'expires_on',p_expires_on));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'Este voucher já está em processamento.' USING ERRCODE='55000'; END IF;
  PERFORM public.pdv_free_return_value_internal_v2(v_context.company_id,v_context.user_id,p_return_id,p_amount,
    'vch:'||v_claim.request_id::text);
  LOOP
    v_attempt:=v_attempt+1; v_code:='DV-'||upper(substr(encode(gen_random_bytes(10),'hex'),1,16));
    BEGIN
      INSERT INTO public.pdv_vouchers(id,company_id,customer_id,public_code,source_commercial_return_id,
        issued_on,expires_on,created_by)
      VALUES(v_voucher,v_context.company_id,v_return.customer_id,v_code,p_return_id,
        public.company_today(v_context.company_id),p_expires_on,v_context.user_id); EXIT;
    EXCEPTION WHEN unique_violation THEN IF v_attempt>=5 THEN RAISE; END IF; END;
  END LOOP;
  INSERT INTO public.pdv_voucher_entries(company_id,voucher_id,entry_kind,amount,operation_request_id,
    description,created_by)
  VALUES(v_context.company_id,v_voucher,'issue',round(p_amount,2),v_claim.request_id,
    'Voucher de devolução',v_context.user_id) RETURNING id INTO v_entry;
  INSERT INTO public.pdv_return_value_events(company_id,commercial_return_id,destination_kind,amount,
    resource_id,operation_request_id,created_by)
  VALUES(v_context.company_id,p_return_id,'voucher',round(p_amount,2),v_voucher,v_claim.request_id,v_context.user_id);
  v_result:=jsonb_build_object('ok',true,'voucher_id',v_voucher,'voucher_entry_id',v_entry,
    'public_code',v_code,'amount',round(p_amount,2),'balance',round(p_amount,2),'expires_on',p_expires_on,'idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_voucher',v_voucher,v_result); RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_settle_refund_internal_v2(
  p_company_id uuid,p_user_id uuid,p_refund_id uuid,p_account_id uuid,p_cash_session_id uuid,
  p_operation_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_refund public.pdv_refunds%ROWTYPE; v_payment public.pdv_order_payments%ROWTYPE;
  v_session public.pdv_cash_sessions%ROWTYPE; v_position numeric(14,2); v_financial uuid; v_custody uuid;
  v_event uuid; v_snapshot jsonb;
BEGIN
  SELECT * INTO v_refund FROM public.pdv_refunds refund
   WHERE refund.id=p_refund_id AND refund.company_id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reembolso não encontrado.' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_refund_events event WHERE event.refund_id=p_refund_id
    AND event.event_kind IN('settled','reversed')) THEN RAISE EXCEPTION 'Este reembolso já foi processado.'
    USING ERRCODE='23505',DETAIL='code=pdv_refund_already_processed'; END IF;
  SELECT * INTO v_payment FROM public.pdv_order_payments payment WHERE payment.id=v_refund.original_payment_id FOR UPDATE;
  IF p_account_id IS NULL THEN RAISE EXCEPTION 'Informe a conta que liquidará o reembolso.' USING ERRCODE='22023'; END IF;
  PERFORM public.pdv_lock_treasury_account(p_company_id,p_account_id);
  IF v_refund.method='dinheiro' THEN
    SELECT * INTO v_session FROM public.pdv_cash_sessions session
     WHERE session.id=p_cash_session_id AND session.company_id=p_company_id
       AND session.cash_account_id=p_account_id FOR UPDATE;
    IF NOT FOUND OR v_session.status<>'aberta' OR v_session.contract_version IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'Escolha um caixa v2 aberto para devolver o dinheiro.'
        USING ERRCODE='42501',DETAIL='code=pdv_refund_cash_session_invalid'; END IF;
    IF v_session.opened_by IS DISTINCT FROM p_user_id AND NOT public.is_admin_or_gestor(p_user_id)
       AND NOT public.is_super_admin(p_user_id) THEN RAISE EXCEPTION 'Você não pode usar o caixa de outro operador.'
       USING ERRCODE='42501',DETAIL='code=pdv_refund_cash_session_forbidden'; END IF;
    v_snapshot:=public.pdv_cash_snapshot_v2_internal(p_company_id,p_account_id);
    IF COALESCE((v_snapshot->>'reconciliation_required')::boolean,true) THEN
      RAISE EXCEPTION 'A custódia precisa ser conciliada antes do reembolso.'
        USING ERRCODE='55000',DETAIL='code=pdv_refund_reconciliation_required'; END IF;
    SELECT COALESCE(position.custody_amount,0) INTO v_position
      FROM public.pdv_cash_custody_position(p_company_id,p_cash_session_id) position;
    IF round(COALESCE(v_position,0),2)<v_refund.amount THEN RAISE EXCEPTION 'A gaveta não possui dinheiro suficiente.'
      USING ERRCODE='23514',DETAIL='code=pdv_refund_cash_insufficient'; END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.financial_accounts account WHERE account.id=p_account_id
      AND account.company_id=p_company_id AND account.is_active IS TRUE AND account.type='banco') THEN
      RAISE EXCEPTION 'A conta bancária do reembolso não está disponível.' USING ERRCODE='42501'; END IF;
    IF v_refund.method IN('pix','transferencia') AND v_payment.financial_account_id IS NOT NULL
      AND v_payment.financial_account_id<>p_account_id THEN RAISE EXCEPTION 'Use a conta original deste pagamento.'
      USING ERRCODE='23514',DETAIL='code=pdv_refund_original_account_mismatch'; END IF;
  END IF;
  IF v_refund.method='dinheiro' THEN
    PERFORM set_config('app.pdv_treasury_custody_delta',jsonb_build_object(
      'company_id',p_company_id,'account_id',p_account_id,'request_id',p_operation_request_id,
      'delta',-v_refund.amount)::text,true);
  END IF;
  INSERT INTO public.financial_transactions(company_id,transaction_type,description,amount,category,
    transaction_date,paid_date,is_paid,account_id,customer_id,origin,payment_method,created_by,notes,
    pdv_financial_role,pdv_settlement_group_id)
  VALUES(p_company_id,'saida'::public.transaction_type,'Reembolso de devolução do PDV',v_refund.amount,
    'Reembolso de venda do PDV',public.company_today(p_company_id),public.company_today(p_company_id),true,
    p_account_id,v_refund.customer_id,'pdv',v_refund.method,p_user_id,
    'Reembolso liquidado; referência interna '||v_refund.id::text,'pdv_refund',v_refund.id)
  RETURNING id INTO v_financial;
  IF v_refund.method='dinheiro' THEN
    PERFORM set_config('app.pdv_treasury_custody_delta','',true);
    INSERT INTO public.pdv_cash_custody_entries(company_id,session_id,cash_account_id,operation_request_id,
      entry_kind,amount,source_type,source_id,financial_transaction_id,metadata,created_by)
    VALUES(p_company_id,p_cash_session_id,p_account_id,p_operation_request_id,'refund',-v_refund.amount,
      'pdv_refund',v_refund.id,v_financial,jsonb_build_object('refund_id',v_refund.id),p_user_id)
    RETURNING id INTO v_custody;
  END IF;
  INSERT INTO public.pdv_refund_events(company_id,refund_id,event_kind,financial_transaction_id,
    custody_entry_id,operation_request_id,metadata,created_by)
  VALUES(p_company_id,p_refund_id,'settled',v_financial,v_custody,p_operation_request_id,
    jsonb_build_object('method',v_refund.method),p_user_id) RETURNING id INTO v_event;
  RETURN jsonb_build_object('refund_event_id',v_event,'financial_transaction_id',v_financial,
    'custody_entry_id',v_custody,'status','settled');
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_request_return_refund_v2(
  p_return_id uuid,p_original_payment_id uuid,p_amount numeric,p_reason text,
  p_account_id uuid,p_cash_session_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_claim record; v_return public.pdv_commercial_returns%ROWTYPE;
  v_payment public.pdv_order_payments%ROWTYPE; v_refund uuid:=gen_random_uuid(); v_requested uuid;
  v_reason text; v_prior numeric; v_settlement jsonb; v_result jsonb; v_customer_id uuid;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:refund_pdv_return');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_return_id => p_return_id
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque desta devolução.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied';
  END IF;
  v_reason:=NULLIF(btrim(COALESCE(p_reason,'')),'');
  IF p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2)
    OR lower(p_amount::text) IN('nan','infinity','-infinity') OR p_amount>999999999.99
    OR v_reason IS NULL OR char_length(v_reason)>500 THEN
    RAISE EXCEPTION 'Informe valor e motivo válidos.' USING ERRCODE='22023',DETAIL='code=pdv_refund_payload_invalid'; END IF;
  -- Mesma ordem de W1/W2: empresa/conta antes de qualquer pedido ou pagamento.
  IF p_account_id IS NOT NULL THEN
    PERFORM public.pdv_lock_treasury_account(v_context.company_id,p_account_id);
  END IF;
  SELECT header.customer_id INTO v_customer_id FROM public.pdv_commercial_returns header
   WHERE header.id=p_return_id AND header.company_id=v_context.company_id AND header.event_kind='return';
  IF NOT FOUND OR v_customer_id IS NULL THEN RAISE EXCEPTION 'Devolução não encontrada ou sem cliente.' USING ERRCODE='P0002'; END IF;
  PERFORM customer.id FROM public.customers customer
   WHERE customer.id=v_customer_id AND customer.company_id=v_context.company_id ORDER BY customer.id FOR UPDATE;
  SELECT * INTO v_return FROM public.pdv_commercial_returns header
   WHERE header.id=p_return_id AND header.company_id=v_context.company_id AND header.event_kind='return' FOR UPDATE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.pdv_commercial_returns r WHERE r.reversal_of_id=p_return_id) THEN
    RAISE EXCEPTION 'Devolução não encontrada ou já compensada.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_payment FROM public.pdv_order_payments payment
   WHERE payment.id=p_original_payment_id AND payment.company_id=v_context.company_id
     AND payment.order_id=v_return.order_id FOR UPDATE;
  IF NOT FOUND OR v_payment.method NOT IN('dinheiro','pix','transferencia','debito','credito')
    OR (v_payment.contract_version=2 AND (v_payment.coverage_status IS DISTINCT FROM 'authorized'
      OR v_payment.settlement_status IS DISTINCT FROM 'settled' OR v_payment.settled_at IS NULL)) THEN
    RAISE EXCEPTION 'Escolha uma forma realmente paga no pedido original.'
      USING ERRCODE='23514',DETAIL='code=pdv_refund_original_payment_invalid'; END IF;
  SELECT COALESCE(sum(refund.amount),0) INTO v_prior FROM public.pdv_refunds refund
   WHERE refund.original_payment_id=p_original_payment_id
     AND NOT EXISTS(SELECT 1 FROM public.pdv_refund_events event WHERE event.refund_id=refund.id AND event.event_kind='reversed');
  IF v_prior+p_amount>v_payment.amount THEN RAISE EXCEPTION 'O reembolso supera o valor desta forma de pagamento.'
    USING ERRCODE='23514',DETAIL='code=pdv_refund_payment_amount_exceeded'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'after_sale.refund.request.v2',
    p_idempotency_key,jsonb_build_object('return_id',p_return_id,'payment_id',p_original_payment_id,
      'amount',round(p_amount,2),'reason',v_reason,'account_id',p_account_id,'cash_session_id',p_cash_session_id));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'Este reembolso já está em processamento.' USING ERRCODE='55000'; END IF;
  PERFORM public.pdv_free_return_value_internal_v2(v_context.company_id,v_context.user_id,p_return_id,p_amount,
    'ref:'||v_claim.request_id::text);
  INSERT INTO public.pdv_refunds(id,company_id,commercial_return_id,customer_id,original_payment_id,
    method,amount,requested_on,reason,operation_request_id,created_by)
  VALUES(v_refund,v_context.company_id,p_return_id,v_return.customer_id,p_original_payment_id,
    v_payment.method,round(p_amount,2),public.company_today(v_context.company_id),v_reason,v_claim.request_id,v_context.user_id);
  INSERT INTO public.pdv_refund_events(company_id,refund_id,event_kind,operation_request_id,created_by)
  VALUES(v_context.company_id,v_refund,'requested',v_claim.request_id,v_context.user_id) RETURNING id INTO v_requested;
  INSERT INTO public.pdv_return_value_events(company_id,commercial_return_id,destination_kind,amount,
    resource_id,operation_request_id,created_by)
  VALUES(v_context.company_id,p_return_id,'refund',round(p_amount,2),v_refund,v_claim.request_id,v_context.user_id);
  IF v_payment.method='dinheiro' THEN
    v_settlement:=public.pdv_settle_refund_internal_v2(v_context.company_id,v_context.user_id,v_refund,
      p_account_id,p_cash_session_id,v_claim.request_id);
  ELSE v_settlement:=jsonb_build_object('status','pending'); END IF;
  v_result:=jsonb_build_object('ok',true,'refund_id',v_refund,'requested_event_id',v_requested,
    'method',v_payment.method,'amount',round(p_amount,2),'status',v_settlement->>'status',
    'financial_transaction_id',v_settlement->>'financial_transaction_id','idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_refund',v_refund,v_result); RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_confirm_return_refund_v2(
  p_refund_id uuid,p_account_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_claim record; v_refund public.pdv_refunds%ROWTYPE; v_settlement jsonb; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:confirm_pdv_refund');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id,
       p_return_id => (SELECT refund.commercial_return_id FROM public.pdv_refunds refund
                        WHERE refund.id=p_refund_id AND refund.company_id=v_context.company_id)
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque deste reembolso.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied';
  END IF;
  SELECT * INTO v_refund FROM public.pdv_refunds refund WHERE refund.id=p_refund_id
    AND refund.company_id=v_context.company_id FOR UPDATE;
  IF NOT FOUND OR v_refund.method='dinheiro' THEN RAISE EXCEPTION 'Reembolso pendente não encontrado.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'after_sale.refund.confirm.v2',
    p_idempotency_key,jsonb_build_object('refund_id',p_refund_id,'account_id',p_account_id));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'A confirmação já está em processamento.' USING ERRCODE='55000'; END IF;
  v_settlement:=public.pdv_settle_refund_internal_v2(v_context.company_id,v_context.user_id,p_refund_id,
    p_account_id,NULL,v_claim.request_id);
  v_result:=jsonb_build_object('ok',true,'refund_id',p_refund_id,'status','settled',
    'financial_transaction_id',v_settlement->>'financial_transaction_id','idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_refund',p_refund_id,v_result); RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_reverse_return_refund_v2(
  p_refund_id uuid,p_reason text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_claim record; v_refund public.pdv_refunds%ROWTYPE; v_settled public.pdv_refund_events%ROWTYPE;
  v_original public.financial_transactions%ROWTYPE; v_original_custody public.pdv_cash_custody_entries%ROWTYPE;
  v_session public.pdv_cash_sessions%ROWTYPE; v_financial uuid; v_custody uuid; v_event uuid; v_value record;
  v_reason text; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:reverse_pdv_refund');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id,
       p_return_id => (SELECT refund.commercial_return_id FROM public.pdv_refunds refund
                        WHERE refund.id=p_refund_id AND refund.company_id=v_context.company_id)
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque deste reembolso.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied';
  END IF;
  v_reason:=NULLIF(btrim(COALESCE(p_reason,'')),'');
  IF v_reason IS NULL OR char_length(v_reason)>500 THEN RAISE EXCEPTION 'Informe o motivo do estorno.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_refund FROM public.pdv_refunds refund WHERE refund.id=p_refund_id
    AND refund.company_id=v_context.company_id FOR UPDATE;
  SELECT * INTO v_settled FROM public.pdv_refund_events event WHERE event.refund_id=p_refund_id
    AND event.event_kind='settled' FOR UPDATE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.pdv_refund_events event WHERE event.reversal_of_id=v_settled.id) THEN
    RAISE EXCEPTION 'Reembolso liquidado não encontrado ou já estornado.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'after_sale.refund.reverse.v2',
    p_idempotency_key,jsonb_build_object('refund_id',p_refund_id,'reason',v_reason));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'Este estorno já está em processamento.' USING ERRCODE='55000'; END IF;
  SELECT * INTO v_original FROM public.financial_transactions transaction
   WHERE transaction.id=v_settled.financial_transaction_id FOR UPDATE;
  PERFORM public.pdv_lock_treasury_account(v_context.company_id,v_original.account_id);
  IF v_settled.custody_entry_id IS NOT NULL THEN
    SELECT * INTO v_original_custody FROM public.pdv_cash_custody_entries entry
     WHERE entry.id=v_settled.custody_entry_id FOR UPDATE;
    SELECT * INTO v_session FROM public.pdv_cash_sessions session WHERE session.id=v_original_custody.session_id FOR UPDATE;
    IF v_session.status<>'aberta' THEN RAISE EXCEPTION 'O caixa original já fechou; faça compensação pós-fechamento.'
      USING ERRCODE='42501',DETAIL='code=pdv_refund_reverse_closed_cash'; END IF;
    PERFORM set_config('app.pdv_treasury_custody_delta',jsonb_build_object(
      'company_id',v_context.company_id,'account_id',v_original.account_id,'request_id',v_claim.request_id,
      'delta',v_refund.amount)::text,true);
  END IF;
  INSERT INTO public.financial_transactions(company_id,transaction_type,description,amount,category,
    transaction_date,paid_date,is_paid,account_id,customer_id,origin,payment_method,created_by,notes,
    pdv_financial_role,pdv_settlement_group_id)
  VALUES(v_context.company_id,'entrada'::public.transaction_type,'Estorno de reembolso do PDV',v_refund.amount,
    'Estorno de reembolso do PDV',public.company_today(v_context.company_id),public.company_today(v_context.company_id),true,
    v_original.account_id,v_refund.customer_id,'pdv',v_refund.method,v_context.user_id,v_reason,
    'pdv_refund_reversal',v_refund.id) RETURNING id INTO v_financial;
  IF v_settled.custody_entry_id IS NOT NULL THEN
    PERFORM set_config('app.pdv_treasury_custody_delta','',true);
    INSERT INTO public.pdv_cash_custody_entries(company_id,session_id,cash_account_id,operation_request_id,
      entry_kind,amount,source_type,source_id,financial_transaction_id,reversal_of_id,metadata,created_by)
    VALUES(v_context.company_id,v_original_custody.session_id,v_original.account_id,v_claim.request_id,
      'reversal',v_refund.amount,'pdv_refund',v_refund.id,v_financial,v_original_custody.id,
      jsonb_build_object('reason',v_reason),v_context.user_id) RETURNING id INTO v_custody;
  END IF;
  INSERT INTO public.pdv_refund_events(company_id,refund_id,event_kind,financial_transaction_id,custody_entry_id,
    reversal_of_id,operation_request_id,metadata,created_by)
  VALUES(v_context.company_id,p_refund_id,'reversed',v_financial,v_custody,v_settled.id,v_claim.request_id,
    jsonb_build_object('reason',v_reason),v_context.user_id) RETURNING id INTO v_event;
  SELECT * INTO v_value FROM public.pdv_return_value_events value
   WHERE value.destination_kind='refund' AND value.resource_id=p_refund_id AND value.amount>0 FOR UPDATE;
  INSERT INTO public.pdv_return_value_events(company_id,commercial_return_id,destination_kind,amount,
    resource_id,reversal_of_id,operation_request_id,created_by)
  VALUES(v_context.company_id,v_refund.commercial_return_id,'refund',-v_refund.amount,p_refund_id,
    v_value.id,v_claim.request_id,v_context.user_id);
  v_result:=jsonb_build_object('ok',true,'refund_id',p_refund_id,'status','reversed',
    'financial_transaction_id',v_financial,'custody_entry_id',v_custody,'idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_refund',p_refund_id,v_result); RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_reverse_return_voucher_v2(
  p_voucher_id uuid,p_reason text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_claim record; v_voucher public.pdv_vouchers%ROWTYPE; v_issue public.pdv_voucher_entries%ROWTYPE;
  v_entry uuid; v_value record; v_reason text; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:reverse_pdv_after_sale');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id,
       p_return_id => (SELECT voucher.source_commercial_return_id FROM public.pdv_vouchers voucher
                        WHERE voucher.id=p_voucher_id AND voucher.company_id=v_context.company_id)
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque deste voucher.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied';
  END IF;
  v_reason:=NULLIF(btrim(COALESCE(p_reason,'')),'');
  IF v_reason IS NULL OR char_length(v_reason)>500 THEN RAISE EXCEPTION 'Informe o motivo do estorno.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_voucher FROM public.pdv_vouchers voucher WHERE voucher.id=p_voucher_id
    AND voucher.company_id=v_context.company_id FOR UPDATE;
  SELECT * INTO v_issue FROM public.pdv_voucher_entries entry WHERE entry.voucher_id=p_voucher_id
    AND entry.entry_kind='issue' FOR UPDATE;
  IF NOT FOUND OR public.pdv_voucher_balance_internal_v2(p_voucher_id)<>v_issue.amount
    OR EXISTS(SELECT 1 FROM public.pdv_voucher_entries entry WHERE entry.reversal_of_id=v_issue.id) THEN
    RAISE EXCEPTION 'Voucher não encontrado, utilizado ou já estornado.'
      USING ERRCODE='23514',DETAIL='code=pdv_voucher_not_reversible'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'after_sale.voucher.reverse.v2',
    p_idempotency_key,jsonb_build_object('voucher_id',p_voucher_id,'reason',v_reason));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'Este estorno já está em processamento.' USING ERRCODE='55000'; END IF;
  INSERT INTO public.pdv_voucher_entries(company_id,voucher_id,entry_kind,amount,order_id,reversal_of_id,
    operation_request_id,description,created_by)
  VALUES(v_context.company_id,p_voucher_id,'reversal',-v_issue.amount,NULL,v_issue.id,v_claim.request_id,
    v_reason,v_context.user_id) RETURNING id INTO v_entry;
  SELECT * INTO v_value FROM public.pdv_return_value_events value WHERE value.destination_kind='voucher'
    AND value.resource_id=p_voucher_id AND value.amount>0 FOR UPDATE;
  INSERT INTO public.pdv_return_value_events(company_id,commercial_return_id,destination_kind,amount,
    resource_id,reversal_of_id,operation_request_id,created_by)
  VALUES(v_context.company_id,v_voucher.source_commercial_return_id,'voucher',-v_issue.amount,p_voucher_id,
    v_value.id,v_claim.request_id,v_context.user_id);
  v_result:=jsonb_build_object('ok',true,'voucher_id',p_voucher_id,'voucher_entry_id',v_entry,
    'balance',0,'idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_voucher',p_voucher_id,v_result); RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_cover_exchange_order_v2(
  p_return_id uuid,p_new_order_id uuid,p_voucher_id uuid,p_voucher_amount numeric,
  p_credit_amount numeric,p_difference_method text,p_difference_account_id uuid,
  p_cash_session_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_claim record; v_return public.pdv_commercial_returns%ROWTYPE;
  v_order public.pdv_orders%ROWTYPE; v_original public.pdv_orders%ROWTYPE; v_voucher public.pdv_vouchers%ROWTYPE;
  v_voucher_amount numeric(14,2); v_credit_amount numeric(14,2); v_difference numeric(14,2);
  v_method text; v_customer_id uuid;
  v_voucher_entry uuid; v_credit_entry uuid; v_credit_result jsonb; v_principal uuid; v_settlement uuid;
  v_exchange uuid:=gen_random_uuid(); v_open_credit numeric(14,2); v_session public.pdv_cash_sessions%ROWTYPE;
  v_all_settled boolean:=true; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:cover_pdv_exchange');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_return_id => p_return_id
     ) IS DISTINCT FROM TRUE
     OR public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_order_id => p_new_order_id
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque desta troca.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied';
  END IF;
  -- Valida o valor BRUTO antes de qualquer cast/round: numeric aceita NaN e,
  -- sem esta ordem, o payload especial poderia chegar aos livros persistidos.
  IF (p_voucher_amount IS NOT NULL AND (lower(p_voucher_amount::text) IN('nan','infinity','-infinity')
      OR p_voucher_amount<0 OR p_voucher_amount>999999999.99 OR p_voucher_amount<>round(p_voucher_amount,2)))
    OR (p_credit_amount IS NOT NULL AND (lower(p_credit_amount::text) IN('nan','infinity','-infinity')
      OR p_credit_amount<0 OR p_credit_amount>999999999.99 OR p_credit_amount<>round(p_credit_amount,2))) THEN
    RAISE EXCEPTION 'Valores da troca inválidos.' USING ERRCODE='22023',DETAIL='code=pdv_exchange_amount_invalid'; END IF;
  v_voucher_amount:=COALESCE(p_voucher_amount,0); v_credit_amount:=COALESCE(p_credit_amount,0);
  v_method:=NULLIF(lower(btrim(COALESCE(p_difference_method,''))), '');
  IF v_method IS NOT NULL AND v_method NOT IN('dinheiro','pix','transferencia','debito','credito','fiado') THEN
    RAISE EXCEPTION 'Forma de pagamento da diferença inválida.' USING ERRCODE='22023'; END IF;
  -- Claim/hash/replay precede qualquer leitura de estado mutável. Um retry
  -- concluído devolve exatamente o recurso original mesmo após o pedido sair
  -- de aguardando_pagamento e receber suas coberturas.
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'after_sale.exchange.cover.v2',
    p_idempotency_key,jsonb_build_object('return_id',p_return_id,'new_order_id',p_new_order_id,
      'voucher_id',p_voucher_id,'voucher_amount',v_voucher_amount,'credit_amount',v_credit_amount,
      'difference_method',v_method,'difference_account_id',p_difference_account_id,'cash_session_id',p_cash_session_id));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'Esta troca já está em processamento.' USING ERRCODE='55000'; END IF;
  -- Counter e venda direta travam tesouraria antes do pedido; a troca segue a
  -- mesma hierarquia para não criar ciclo conta -> pedido -> conta.
  IF p_difference_account_id IS NOT NULL AND v_method IN('dinheiro','pix','transferencia') THEN
    PERFORM public.pdv_lock_treasury_account(v_context.company_id,p_difference_account_id);
  END IF;
  SELECT header.customer_id INTO v_customer_id FROM public.pdv_commercial_returns header
   WHERE header.id=p_return_id AND header.company_id=v_context.company_id AND header.event_kind='return';
  IF NOT FOUND OR v_customer_id IS NULL THEN RAISE EXCEPTION 'Devolução não encontrada ou sem cliente.' USING ERRCODE='P0002'; END IF;
  -- Cliente é a trava canônica compartilhada por saldo e fiado. Ela vem antes
  -- de livros, pedido e leituras de disponibilidade/limite.
  PERFORM customer.id FROM public.customers customer
   WHERE customer.id=v_customer_id AND customer.company_id=v_context.company_id ORDER BY customer.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente da devolução não encontrado.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_return FROM public.pdv_commercial_returns header WHERE header.id=p_return_id
    AND header.company_id=v_context.company_id AND header.event_kind='return' FOR UPDATE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.pdv_commercial_returns reversal WHERE reversal.reversal_of_id=p_return_id) THEN
    RAISE EXCEPTION 'Devolução não encontrada ou já compensada.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_original FROM public.pdv_orders orders WHERE orders.id=v_return.order_id FOR UPDATE;
  SELECT * INTO v_order FROM public.pdv_orders orders WHERE orders.id=p_new_order_id
    AND orders.company_id=v_context.company_id FOR UPDATE;
  IF NOT FOUND OR v_order.id=v_original.id OR v_order.status<>'aguardando_pagamento'
    OR v_order.customer_id IS NULL OR v_order.customer_id IS DISTINCT FROM v_return.customer_id
    OR EXISTS(SELECT 1 FROM public.pdv_order_payments payment WHERE payment.order_id=v_order.id) THEN
    RAISE EXCEPTION 'O novo pedido da troca deve estar aguardando pagamento, vazio de coberturas e no mesmo cliente.'
      USING ERRCODE='23514',DETAIL='code=pdv_exchange_order_invalid'; END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_order_items item WHERE item.order_id=v_order.id AND item.inventory_id IS NOT NULL
    AND COALESCE((SELECT sum(reservation.reserved_quantity-reservation.consumed_quantity-reservation.released_quantity)
      FROM public.pdv_stock_reservation_items reservation WHERE reservation.order_item_id=item.id
        AND reservation.state='guaranteed'),0)<item.quantity) THEN
    RAISE EXCEPTION 'O novo pedido precisa estar integralmente reservado antes da troca.'
      USING ERRCODE='23514',DETAIL='code=pdv_exchange_reservation_missing'; END IF;
  v_difference:=round(v_order.total-v_voucher_amount-v_credit_amount,2);
  IF v_difference<0 OR (v_difference=0 AND v_method IS NOT NULL)
    OR (v_difference>0 AND v_method NOT IN('dinheiro','pix','transferencia','debito','credito','fiado')) THEN
    RAISE EXCEPTION 'As coberturas não fecham o total do novo pedido.'
      USING ERRCODE='23514',DETAIL='code=pdv_exchange_coverage_mismatch'; END IF;
  IF v_voucher_amount>0 THEN
    SELECT * INTO v_voucher FROM public.pdv_vouchers voucher WHERE voucher.id=p_voucher_id
      AND voucher.company_id=v_context.company_id FOR UPDATE;
    IF NOT FOUND OR v_voucher.customer_id IS DISTINCT FROM v_order.customer_id
      OR (v_voucher.expires_on IS NOT NULL AND v_voucher.expires_on<public.company_today(v_context.company_id))
      OR public.pdv_voucher_balance_internal_v2(v_voucher.id)<v_voucher_amount THEN
      RAISE EXCEPTION 'Voucher inválido, vencido ou sem saldo.' USING ERRCODE='23514',DETAIL='code=pdv_exchange_voucher_invalid'; END IF;
  ELSIF p_voucher_id IS NOT NULL THEN RAISE EXCEPTION 'Remova o voucher sem valor.' USING ERRCODE='22023'; END IF;
  IF v_credit_amount>0 AND (public.pdv_party_accounts_v2_enabled_internal(v_context.company_id) IS DISTINCT FROM true
    OR public.pdv_party_available_credit_v2(v_context.company_id,'customer',v_order.customer_id)<v_credit_amount) THEN
    RAISE EXCEPTION 'O cliente não possui saldo suficiente para a troca.'
      USING ERRCODE='23514',DETAIL='code=pdv_exchange_credit_insufficient'; END IF;
  IF v_difference>0 AND v_method IN('pix','transferencia') AND NOT EXISTS(
    SELECT 1 FROM public.financial_accounts account WHERE account.id=p_difference_account_id
      AND account.company_id=v_context.company_id AND account.is_active IS TRUE AND account.type='banco') THEN
    RAISE EXCEPTION 'Escolha uma conta bancária válida.' USING ERRCODE='42501'; END IF;
  IF v_difference>0 AND v_method='dinheiro' THEN
    SELECT * INTO v_session FROM public.pdv_cash_sessions session WHERE session.id=p_cash_session_id
      AND session.company_id=v_context.company_id AND session.cash_account_id=p_difference_account_id FOR UPDATE;
    IF NOT FOUND OR v_session.status<>'aberta' OR v_session.contract_version IS DISTINCT FROM 2 THEN
      RAISE EXCEPTION 'Escolha um caixa v2 aberto.' USING ERRCODE='42501'; END IF;
    IF v_session.opened_by IS DISTINCT FROM v_context.user_id
      AND NOT public.is_admin_or_gestor(v_context.user_id) AND NOT public.is_super_admin(v_context.user_id) THEN
      RAISE EXCEPTION 'Você não pode usar o caixa de outro operador.'
        USING ERRCODE='42501',DETAIL='code=pdv_exchange_cash_session_forbidden'; END IF;
  END IF;
  IF v_difference>0 AND v_method='fiado' THEN
    IF NOT(public.is_admin_or_gestor(v_context.user_id) OR public.is_super_admin(v_context.user_id)
      OR public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:approve_pdv_credit')) THEN
      RAISE EXCEPTION 'Você não pode aprovar a diferença no fiado.' USING ERRCODE='42501'; END IF;
    SELECT round(COALESCE(sum(statement.amount),0),2) INTO v_open_credit
      FROM public.pdv_customer_credit_statement_v2(v_order.customer_id) statement;
    IF NOT EXISTS(SELECT 1 FROM public.customers customer WHERE customer.id=v_order.customer_id
      AND customer.credit_limit IS NOT NULL AND v_open_credit+v_difference<=customer.credit_limit) THEN
      RAISE EXCEPTION 'O limite do cliente não cobre a diferença.' USING ERRCODE='23514'; END IF;
  END IF;
  IF v_voucher_amount>0 THEN
    INSERT INTO public.pdv_voucher_entries(company_id,voucher_id,entry_kind,amount,order_id,
      operation_request_id,description,created_by)
    VALUES(v_context.company_id,v_voucher.id,'redeem',-v_voucher_amount,v_order.id,v_claim.request_id,
      'Uso em troca do PDV',v_context.user_id) RETURNING id INTO v_voucher_entry;
    INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,change_amount,created_by,
      contract_version,coverage_kind,coverage_status,settlement_status,authorized_at,settled_at,voucher_entry_id)
    VALUES(v_context.company_id,v_order.id,'voucher',v_voucher_amount,0,v_context.user_id,2,'voucher',
      'authorized','settled',now(),now(),v_voucher_entry);
  END IF;
  IF v_credit_amount>0 THEN
    INSERT INTO public.financial_transactions(company_id,transaction_type,description,amount,category,
      transaction_date,due_date,is_paid,customer_id,origin,payment_method,created_by,
      pdv_financial_role,pdv_settlement_group_id)
    VALUES(v_context.company_id,'entrada'::public.transaction_type,'Cobertura por saldo na troca PDV nº '||v_order.number,
      v_credit_amount,'Venda no saldo',public.company_today(v_context.company_id),public.company_today(v_context.company_id),
      false,v_order.customer_id,'pdv','saldo_cliente',v_context.user_id,'pdv_receivable_principal',v_claim.request_id)
    RETURNING id INTO v_principal;
    v_credit_entry:=public.pdv_return_credit_entry_internal_v2(v_context.company_id,v_order.customer_id,p_return_id,
      'application',-v_credit_amount,public.company_today(v_context.company_id),'Saldo usado na troca',v_principal,NULL,
      'exc:'||v_claim.request_id::text||':credit');
    INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,change_amount,created_by,
      contract_version,coverage_kind,coverage_status,settlement_status,authorized_at,settled_at,party_credit_entry_id)
    VALUES(v_context.company_id,v_order.id,'saldo_cliente',v_credit_amount,0,v_context.user_id,2,'customer_credit',
      'authorized','settled',now(),now(),v_credit_entry);
  END IF;
  IF v_difference>0 AND v_method IN('dinheiro','pix','transferencia') THEN
    v_settlement:=public.pdv_create_receivable_financial_v2(v_context.company_id,v_context.user_id,
      v_order.customer_id,p_difference_account_id,CASE WHEN v_method='dinheiro' THEN p_cash_session_id END,
      v_method,v_difference,public.company_today(v_context.company_id),'Diferença da troca PDV nº '||v_order.number,
      v_claim.request_id,false);
    INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,change_amount,financial_account_id,
      created_by,contract_version,coverage_kind,coverage_status,settlement_status,settlement_transaction_id,
      authorized_at,settled_at)
    VALUES(v_context.company_id,v_order.id,v_method,v_difference,0,p_difference_account_id,v_context.user_id,2,
      CASE WHEN v_method='dinheiro' THEN 'cash' WHEN v_method='transferencia' THEN 'transfer' ELSE 'pix' END,
      'authorized','settled',v_settlement,now(),now());
  ELSIF v_difference>0 AND v_method IN('debito','credito') THEN
    INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,change_amount,created_by,
      contract_version,coverage_kind,coverage_status,settlement_status,authorized_at)
    VALUES(v_context.company_id,v_order.id,v_method,v_difference,0,v_context.user_id,2,'card_authorization',
      'authorized','open',now()); v_all_settled:=false;
  ELSIF v_difference>0 AND v_method='fiado' THEN
    INSERT INTO public.financial_transactions(company_id,transaction_type,description,amount,category,
      transaction_date,due_date,is_paid,customer_id,origin,payment_method,created_by,pdv_financial_role,pdv_settlement_group_id)
    VALUES(v_context.company_id,'entrada'::public.transaction_type,'Diferença no fiado da troca PDV nº '||v_order.number,
      v_difference,'Venda no fiado',public.company_today(v_context.company_id),
      (public.company_today(v_context.company_id)+interval '1 month')::date,false,v_order.customer_id,'pdv','fiado',
      v_context.user_id,'pdv_receivable_principal',v_claim.request_id) RETURNING id INTO v_principal;
    INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,change_amount,created_by,
      contract_version,coverage_kind,coverage_status,settlement_status,receivable_transaction_id,authorized_at)
    VALUES(v_context.company_id,v_order.id,'fiado',v_difference,0,v_context.user_id,2,'receivable',
      'authorized','open',v_principal,now()); v_all_settled:=false;
  END IF;
  INSERT INTO public.pdv_exchanges(id,company_id,commercial_return_id,original_order_id,new_order_id,
    customer_id,applied_voucher_amount,applied_credit_amount,difference_amount,operation_request_id,created_by)
  VALUES(v_exchange,v_context.company_id,p_return_id,v_original.id,v_order.id,v_order.customer_id,
    v_voucher_amount,v_credit_amount,v_difference,v_claim.request_id,v_context.user_id);
  IF v_voucher_entry IS NOT NULL THEN INSERT INTO public.pdv_exchange_value_applications(
    company_id,exchange_id,source_kind,amount,voucher_entry_id)
    VALUES(v_context.company_id,v_exchange,'voucher',v_voucher_amount,v_voucher_entry); END IF;
  IF v_credit_entry IS NOT NULL THEN INSERT INTO public.pdv_exchange_value_applications(
    company_id,exchange_id,source_kind,amount,party_credit_entry_id)
    VALUES(v_context.company_id,v_exchange,'customer_credit',v_credit_amount,v_credit_entry); END IF;
  UPDATE public.pdv_orders SET status='liberado_retirada',paid_at=CASE WHEN v_all_settled THEN now() END,
    cash_session_id=COALESCE(p_cash_session_id,cash_session_id),updated_at=now() WHERE id=v_order.id;
  v_result:=jsonb_build_object('ok',true,'exchange_id',v_exchange,'original_order_id',v_original.id,
    'new_order_id',v_order.id,'voucher_amount',v_voucher_amount,'credit_amount',v_credit_amount,
    'difference_amount',v_difference,'difference_method',v_method,'idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_exchange',v_exchange,v_result); RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_get_after_sale_context_v2(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_order public.pdv_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:view_pdv_after_sale');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_order_id => p_order_id
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque deste pedido.'
      USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied';
  END IF;
  SELECT * INTO v_order FROM public.pdv_orders orders WHERE orders.id=p_order_id
    AND orders.company_id=v_context.company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object(
    'order_id',v_order.id,'order_number',v_order.number,
    'returns',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'return_id',header.id,'occurred_on',header.occurred_on,'reason',header.reason,
      'commercial_total',abs(header.commercial_total),
      'vouchers',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'voucher_id',voucher.id,'public_code',voucher.public_code,'issued_on',voucher.issued_on,
        'expires_on',voucher.expires_on,'balance',public.pdv_voucher_balance_internal_v2(voucher.id))
        ORDER BY voucher.created_at,voucher.id) FROM public.pdv_vouchers voucher
        WHERE voucher.source_commercial_return_id=header.id),'[]'::jsonb),
      'refunds',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'refund_id',refund.id,'method',refund.method,'amount',refund.amount,'requested_on',refund.requested_on,
        'status',CASE
          WHEN EXISTS(SELECT 1 FROM public.pdv_refund_events event WHERE event.refund_id=refund.id AND event.event_kind='reversed') THEN 'reversed'
          WHEN EXISTS(SELECT 1 FROM public.pdv_refund_events event WHERE event.refund_id=refund.id AND event.event_kind='settled') THEN 'settled'
          ELSE 'pending' END) ORDER BY refund.created_at,refund.id)
        FROM public.pdv_refunds refund WHERE refund.commercial_return_id=header.id),'[]'::jsonb),
      'exchanges',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'exchange_id',exchange.id,'new_order_id',exchange.new_order_id,
        'new_order_number',new_order.number,'voucher_amount',exchange.applied_voucher_amount,
        'credit_amount',exchange.applied_credit_amount,'difference_amount',exchange.difference_amount)
        ORDER BY exchange.created_at,exchange.id) FROM public.pdv_exchanges exchange
        JOIN public.pdv_orders new_order ON new_order.id=exchange.new_order_id
        WHERE exchange.commercial_return_id=header.id),'[]'::jsonb)
    ) ORDER BY header.occurred_on,header.id) FROM public.pdv_commercial_returns header
      WHERE header.company_id=v_context.company_id AND header.order_id=v_order.id
        AND header.event_kind='return'),'[]'::jsonb),
    'capabilities',jsonb_build_object('voucher',true,'refund',true,'exchange',true)
  );
END $fn$;

-- O estorno do reembolso e entrada apenas na DFC. Competencia ja foi
-- recomposta pela devolucao e nao pode ser reconhecida de novo.
DO $patch_projection$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef('public.pdv_financial_projection_rows_v2(uuid)'::regprocedure) INTO v_src;
  IF position('pdv_refund_reversal' in v_src)=0 THEN
    v_src:=replace(v_src,'''pdv_receivable_settlement'',''pdv_cash_surplus''',
      '''pdv_receivable_settlement'',''pdv_cash_surplus'',''pdv_refund_reversal''');
    v_src:=replace(v_src,'''pdv_refund'',''pdv_supplier_payment''',
      '''pdv_refund'',''pdv_refund_reversal'',''pdv_supplier_payment''');
    IF position('pdv_refund_reversal' in v_src)=0 THEN RAISE EXCEPTION 'Âncora da projeção W1C mudou'; END IF;
    EXECUTE v_src;
  END IF;
END $patch_projection$;

DO $patch_reset$
DECLARE v_oid regprocedure; v_src text; v_anchor text; v_insert text;
BEGIN
  SELECT procedure.oid::regprocedure,pg_get_functiondef(procedure.oid) INTO v_oid,v_src
    FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
   WHERE namespace.nspname='public' AND procedure.proname='reset_system_step'
     AND pg_get_function_identity_arguments(procedure.oid)='p_company_id uuid, p_step text, p_audit_id uuid';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'reset_system_step não encontrada'; END IF;
  IF position('PDV_AFTER_SALE_VALUE_RESET_V2' in v_src)=0 THEN
    v_anchor:='-- PDV_RETURNS_RESET_V2';
    v_insert:='-- PDV_AFTER_SALE_VALUE_RESET_V2'||chr(10)||
      '    DELETE FROM public.pdv_exchange_value_applications WHERE company_id=p_company_id;'||chr(10)||
      '    DELETE FROM public.pdv_exchanges WHERE company_id=p_company_id;'||chr(10)||
      '    DELETE FROM public.pdv_refund_events WHERE company_id=p_company_id;'||chr(10)||
      '    DELETE FROM public.pdv_return_value_events WHERE company_id=p_company_id AND reversal_of_id IS NOT NULL;'||chr(10)||
      '    DELETE FROM public.pdv_return_value_events WHERE company_id=p_company_id;'||chr(10)||
      '    DELETE FROM public.pdv_refunds WHERE company_id=p_company_id;'||chr(10)||
      '    DELETE FROM public.pdv_cash_custody_entries WHERE company_id=p_company_id AND source_type=''pdv_refund'';'||chr(10)||
      '    DELETE FROM public.financial_transactions WHERE company_id=p_company_id'||chr(10)||
      '      AND pdv_financial_role IN(''pdv_refund'',''pdv_refund_reversal'');'||chr(10)||
      '    -- Pagamentos referenciam voucher/saldo com FK RESTRICT. O reset PDV'||chr(10)||
      '    -- ja capturou os ids financeiros W1 antes deste bloco.'||chr(10)||
      '    DELETE FROM public.pdv_order_payments WHERE company_id=p_company_id;'||chr(10)||
      '    DELETE FROM public.pdv_voucher_entries WHERE company_id=p_company_id AND reversal_of_id IS NOT NULL;'||chr(10)||
      '    DELETE FROM public.pdv_voucher_entries WHERE company_id=p_company_id;'||chr(10)||
      '    DELETE FROM public.pdv_vouchers WHERE company_id=p_company_id;'||chr(10)||
      '    DELETE FROM public.pdv_operation_requests request WHERE request.company_id=p_company_id'||chr(10)||
      '      AND request.operation_type LIKE ''after_sale.%'';'||chr(10)||
      '    '||v_anchor;
    IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Âncora do reset W5 mudou'; END IF;
    v_src:=replace(v_src,v_anchor,v_insert); EXECUTE v_src;
  END IF;
END $patch_reset$;

DO $patch_admin_delete$
DECLARE v_oid regprocedure; v_src text; v_anchor text; v_insert text;
BEGIN
  SELECT procedure.oid::regprocedure,pg_get_functiondef(procedure.oid) INTO v_oid,v_src
    FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
   WHERE namespace.nspname='public' AND procedure.proname='admin_delete_company'
     AND pg_get_function_identity_arguments(procedure.oid)='p_company_id uuid';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'admin_delete_company não encontrada'; END IF;
  IF position('PDV_AFTER_SALE_VALUE_ADMIN_DELETE_V2' in v_src)=0 THEN
    v_anchor:='DELETE FROM public.pdv_order_payments payment'||chr(10)||
      '   WHERE payment.company_id = p_company_id;';
    v_insert:='-- PDV_AFTER_SALE_VALUE_ADMIN_DELETE_V2'||chr(10)||
      '  DELETE FROM public.pdv_exchange_value_applications WHERE company_id=p_company_id;'||chr(10)||
      '  DELETE FROM public.pdv_exchanges WHERE company_id=p_company_id;'||chr(10)||
      '  DELETE FROM public.pdv_refund_events WHERE company_id=p_company_id;'||chr(10)||
      '  DELETE FROM public.pdv_return_value_events WHERE company_id=p_company_id AND reversal_of_id IS NOT NULL;'||chr(10)||
      '  DELETE FROM public.pdv_return_value_events WHERE company_id=p_company_id;'||chr(10)||
      '  DELETE FROM public.pdv_refunds WHERE company_id=p_company_id;'||chr(10)||
      '  DELETE FROM public.pdv_cash_custody_entries WHERE company_id=p_company_id AND source_type=''pdv_refund'';'||chr(10)||
      '  DELETE FROM public.financial_transactions WHERE company_id=p_company_id'||chr(10)||
      '    AND pdv_financial_role IN(''pdv_refund'',''pdv_refund_reversal'');'||chr(10)||
      '  '||v_anchor||chr(10)||
      '  DELETE FROM public.pdv_voucher_entries WHERE company_id=p_company_id AND reversal_of_id IS NOT NULL;'||chr(10)||
      '  DELETE FROM public.pdv_voucher_entries WHERE company_id=p_company_id;'||chr(10)||
      '  DELETE FROM public.pdv_vouchers WHERE company_id=p_company_id;'||chr(10)||
      '  DELETE FROM public.pdv_operation_requests request WHERE request.company_id=p_company_id'||chr(10)||
      '    AND request.operation_type LIKE ''after_sale.%'';';
    IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Âncora do admin_delete W5 mudou'; END IF;
    v_src:=replace(v_src,v_anchor,v_insert); EXECUTE v_src;
  END IF;
END $patch_admin_delete$;

REVOKE ALL ON FUNCTION public.pdv_after_sale_v2_enabled_internal(uuid),
  public.pdv_after_sale_context_v2(text),public.pdv_guard_after_sale_append_only_v2(),
  public.pdv_guard_after_sale_relationship_v2(),
  public.pdv_voucher_balance_internal_v2(uuid),public.pdv_free_return_value_internal_v2(uuid,uuid,uuid,numeric,text),
  public.pdv_settle_refund_internal_v2(uuid,uuid,uuid,uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_issue_return_voucher_v2(uuid,numeric,date,text),
  public.pdv_request_return_refund_v2(uuid,uuid,numeric,text,uuid,uuid,text),
  public.pdv_confirm_return_refund_v2(uuid,uuid,text),public.pdv_reverse_return_refund_v2(uuid,text,text),
  public.pdv_reverse_return_voucher_v2(uuid,text,text),
  public.pdv_cover_exchange_order_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text),
  public.pdv_get_after_sale_context_v2(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_issue_return_voucher_v2(uuid,numeric,date,text),
  public.pdv_request_return_refund_v2(uuid,uuid,numeric,text,uuid,uuid,text),
  public.pdv_confirm_return_refund_v2(uuid,uuid,text),public.pdv_reverse_return_refund_v2(uuid,text,text),
  public.pdv_reverse_return_voucher_v2(uuid,text,text),
  public.pdv_cover_exchange_order_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text),
  public.pdv_get_after_sale_context_v2(uuid) TO authenticated,service_role;

COMMENT ON TABLE public.pdv_vouchers IS 'Passivo de voucher separado de crédito/fiado; saldo é soma append-only de entradas.';
COMMENT ON TABLE public.pdv_refunds IS 'Pedido de reembolso originado por devolução; somente evento settled cria caixa/DFC.';
COMMENT ON TABLE public.pdv_exchanges IS 'Vínculo imutável entre devolução e novo pedido; a venda original nunca é alterada.';

COMMIT;

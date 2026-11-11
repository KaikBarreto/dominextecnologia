-- W5-01: devolucao comercial por fatia entregue e cancelamento de saldo.
-- Nao implementa refund, voucher, troca ou documento fiscal. O fato comercial
-- e independente do eventual estorno financeiro, que pertence a outra onda.
BEGIN;

INSERT INTO public.app_feature_flags(key,enabled,contract_allowlist,company_allowlist)
VALUES('pdv_returns_v2',false,'{}'::uuid[],'{}'::uuid[])
ON CONFLICT(key) DO NOTHING;

CREATE TABLE public.pdv_return_quarantine_stocks (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stock_id uuid PRIMARY KEY REFERENCES public.stocks(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,stock_id)
);

CREATE TABLE public.pdv_commercial_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.pdv_orders(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  event_kind text NOT NULL CHECK(event_kind IN('return','reversal')),
  occurred_on date NOT NULL,
  reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500),
  commercial_total numeric(14,2) NOT NULL,
  cmv_total numeric(14,2),
  reversal_of_id uuid REFERENCES public.pdv_commercial_returns(id) ON DELETE RESTRICT,
  operation_request_id uuid NOT NULL REFERENCES public.pdv_operation_requests(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_commercial_return_sign_check CHECK(
    (event_kind='return' AND commercial_total<=0 AND (cmv_total IS NULL OR cmv_total<=0))
    OR (event_kind='reversal' AND commercial_total>=0 AND (cmv_total IS NULL OR cmv_total>=0))
  ),
  CONSTRAINT pdv_commercial_return_reversal_check CHECK(
    (event_kind='return' AND reversal_of_id IS NULL)
    OR (event_kind='reversal' AND reversal_of_id IS NOT NULL)
  ),
  UNIQUE(operation_request_id),
  UNIQUE(reversal_of_id)
);

CREATE TABLE public.pdv_commercial_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  commercial_return_id uuid NOT NULL REFERENCES public.pdv_commercial_returns(id) ON DELETE CASCADE,
  delivery_item_id uuid NOT NULL REFERENCES public.pdv_delivery_items(id) ON DELETE RESTRICT,
  inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  destination text NOT NULL CHECK(destination IN('saleable','quarantine','none')),
  destination_stock_id uuid REFERENCES public.stocks(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK(quantity>0),
  commercial_amount numeric(14,2) NOT NULL,
  cmv_amount numeric(14,2),
  inventory_movement_id uuid REFERENCES public.inventory_movements(id) ON DELETE RESTRICT,
  reversal_of_item_id uuid REFERENCES public.pdv_commercial_return_items(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_commercial_return_item_shape_check CHECK(
    (inventory_id IS NULL AND destination='none' AND destination_stock_id IS NULL
      AND inventory_movement_id IS NULL)
    OR (inventory_id IS NOT NULL AND destination IN('saleable','quarantine')
      AND destination_stock_id IS NOT NULL AND inventory_movement_id IS NOT NULL)
  ),
  UNIQUE(commercial_return_id,delivery_item_id),
  UNIQUE(inventory_movement_id),
  UNIQUE(reversal_of_item_id)
);

CREATE TABLE public.pdv_return_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  commercial_return_id uuid NOT NULL REFERENCES public.pdv_commercial_returns(id) ON DELETE CASCADE,
  disposition_kind text NOT NULL CHECK(disposition_kind IN('receivable_reduction','customer_credit')),
  amount numeric(14,2) NOT NULL CHECK(amount<>0 AND amount=round(amount,2)),
  receivable_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,
  credit_entry_id uuid NOT NULL REFERENCES public.pdv_party_credit_entries(id) ON DELETE RESTRICT,
  application_entry_id uuid REFERENCES public.pdv_party_credit_entries(id) ON DELETE RESTRICT,
  reversal_credit_entry_id uuid REFERENCES public.pdv_party_credit_entries(id) ON DELETE RESTRICT,
  reversal_application_entry_id uuid REFERENCES public.pdv_party_credit_entries(id) ON DELETE RESTRICT,
  reversal_of_id uuid REFERENCES public.pdv_return_dispositions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_return_disposition_shape_check CHECK(
    (disposition_kind='customer_credit' AND receivable_transaction_id IS NULL
      AND application_entry_id IS NULL)
    OR (disposition_kind='receivable_reduction' AND receivable_transaction_id IS NOT NULL
      AND application_entry_id IS NOT NULL)
  ),
  CONSTRAINT pdv_return_disposition_reversal_check CHECK(
    (amount>0 AND reversal_of_id IS NULL AND reversal_credit_entry_id IS NULL
      AND reversal_application_entry_id IS NULL)
    OR (amount<0 AND reversal_of_id IS NOT NULL AND reversal_credit_entry_id IS NOT NULL)
  ),
  UNIQUE(reversal_of_id)
);

CREATE TABLE public.pdv_order_residual_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.pdv_orders(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500),
  released_quantity numeric NOT NULL CHECK(released_quantity>=0),
  delivered_quantity numeric NOT NULL CHECK(delivered_quantity>=0),
  operation_request_id uuid NOT NULL REFERENCES public.pdv_operation_requests(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(operation_request_id),
  UNIQUE(order_id)
);

-- Entradas W4 originadas por devolução pertencem ao agregado W5. A origem
-- impede que a RPC genérica de crédito desfaça só a parte financeira.
ALTER TABLE public.pdv_party_credit_entries
  ADD COLUMN source_commercial_return_id uuid
    REFERENCES public.pdv_commercial_returns(id) ON DELETE RESTRICT;
CREATE INDEX idx_pdv_party_credit_return_source
  ON public.pdv_party_credit_entries(company_id,source_commercial_return_id)
  WHERE source_commercial_return_id IS NOT NULL;

CREATE INDEX idx_pdv_returns_order ON public.pdv_commercial_returns(company_id,order_id,created_at,id);
CREATE INDEX idx_pdv_return_items_delivery ON public.pdv_commercial_return_items(company_id,delivery_item_id,created_at,id);
CREATE INDEX idx_pdv_return_dispositions_return ON public.pdv_return_dispositions(company_id,commercial_return_id,id);

ALTER TABLE public.pdv_return_quarantine_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_return_quarantine_stocks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_commercial_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_commercial_returns FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_commercial_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_commercial_return_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_return_dispositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_return_dispositions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_order_residual_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_order_residual_cancellations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_return_quarantine_stocks,public.pdv_commercial_returns,
  public.pdv_commercial_return_items,public.pdv_return_dispositions,
  public.pdv_order_residual_cancellations FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_returns_v2_enabled_internal(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT COALESCE((SELECT flag.enabled OR p_company_id=ANY(flag.company_allowlist)
    FROM public.app_feature_flags flag WHERE flag.key='pdv_returns_v2'),FALSE);
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_returns_context_v2(p_action text DEFAULT NULL)
RETURNS TABLE(user_id uuid,company_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_user uuid:=auth.uid(); v_company uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sua sessão expirou. Entre novamente.'
    USING ERRCODE='42501',DETAIL='code=pdv_return_auth_required'; END IF;
  SELECT profile.company_id INTO v_company FROM public.profiles profile
   WHERE profile.user_id=v_user AND profile.is_active IS TRUE;
  IF v_company IS NULL OR public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'O acesso desta empresa está indisponível.'
      USING ERRCODE='42501',DETAIL='code=pdv_return_company_denied'; END IF;
  IF public.company_has_module(v_company,'pdv') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'O módulo PDV e Loja não está ativo nesta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_return_module_denied'; END IF;
  IF public.pdv_returns_v2_enabled_internal(v_company) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'As devoluções ainda não estão liberadas para esta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_return_rollout_disabled'; END IF;
  IF NOT public.is_admin_or_gestor(v_user) AND NOT public.is_super_admin(v_user) AND (
    (public.pdv_has_explicit_action_permission_v2(v_user,'screen:pdv_orders') IS DISTINCT FROM TRUE
      AND public.pdv_has_explicit_action_permission_v2(v_user,'screen:pdv_dispatch') IS DISTINCT FROM TRUE)
    OR (p_action IS NOT NULL AND public.pdv_has_explicit_action_permission_v2(v_user,p_action) IS DISTINCT FROM TRUE)
  ) THEN RAISE EXCEPTION 'Você não tem permissão para esta ação.'
    USING ERRCODE='42501',DETAIL='code=pdv_return_permission_denied'; END IF;
  RETURN QUERY SELECT v_user,v_company;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_guard_return_append_only_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_company uuid:=COALESCE(OLD.company_id,NEW.company_id); v_header public.pdv_commercial_returns%ROWTYPE;
  v_delivery public.pdv_delivery_items%ROWTYPE; v_original public.pdv_commercial_return_items%ROWTYPE;
  v_original_header public.pdv_commercial_returns%ROWTYPE;
  v_net numeric;
BEGIN
  IF TG_OP='DELETE' AND (NOT EXISTS(SELECT 1 FROM public.companies WHERE id=v_company)
    OR COALESCE(current_setting('app.pdv_purge_company',true),'')=v_company::text) THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND TG_TABLE_NAME IN('pdv_commercial_returns','pdv_order_residual_cancellations') THEN
    IF OLD.created_by IS NOT NULL AND NEW.created_by IS NULL
      AND NOT EXISTS(SELECT 1 FROM auth.users users WHERE users.id=OLD.created_by)
      AND (to_jsonb(NEW)-'created_by')=(to_jsonb(OLD)-'created_by') THEN RETURN NEW; END IF;
  END IF;
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Devoluções são imutáveis; registre uma compensação.'
    USING ERRCODE='55000',DETAIL='code=pdv_return_append_only'; END IF;
  IF TG_TABLE_NAME='pdv_commercial_returns' THEN
    IF NEW.event_kind='reversal' THEN
      SELECT * INTO v_original_header FROM public.pdv_commercial_returns
       WHERE id=NEW.reversal_of_id FOR UPDATE;
      IF NOT FOUND OR v_original_header.event_kind<>'return'
        OR v_original_header.company_id<>NEW.company_id OR v_original_header.order_id<>NEW.order_id
        OR v_original_header.customer_id IS DISTINCT FROM NEW.customer_id
        OR NEW.commercial_total<>-v_original_header.commercial_total
        OR (v_original_header.cmv_total IS NULL AND NEW.cmv_total IS NOT NULL)
        OR (v_original_header.cmv_total IS NOT NULL AND NEW.cmv_total IS DISTINCT FROM -v_original_header.cmv_total) THEN
        RAISE EXCEPTION 'A compensação não corresponde à devolução original.'
          USING ERRCODE='23514',DETAIL='code=pdv_return_reversal_header_mismatch'; END IF;
    ELSIF NOT EXISTS(SELECT 1 FROM public.pdv_orders orders
      WHERE orders.id=NEW.order_id AND orders.company_id=NEW.company_id
        AND orders.customer_id IS NOT DISTINCT FROM NEW.customer_id) THEN
      RAISE EXCEPTION 'O pedido não pertence à devolução.' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='pdv_commercial_return_items' THEN
    SELECT * INTO v_header FROM public.pdv_commercial_returns WHERE id=NEW.commercial_return_id;
    SELECT * INTO v_delivery FROM public.pdv_delivery_items
     WHERE id=NEW.delivery_item_id FOR UPDATE;
    IF NOT FOUND OR v_header.company_id<>NEW.company_id OR v_delivery.company_id<>NEW.company_id
       OR NOT EXISTS(SELECT 1 FROM public.pdv_deliveries delivery
          WHERE delivery.id=v_delivery.delivery_id AND delivery.order_id=v_header.order_id) THEN
      RAISE EXCEPTION 'O item entregue não pertence ao pedido da devolução.'
        USING ERRCODE='23514',DETAIL='code=pdv_return_delivery_mismatch'; END IF;
    IF v_header.event_kind='return' THEN
      IF NEW.reversal_of_item_id IS NOT NULL OR NEW.commercial_amount>0 OR NEW.cmv_amount>0 THEN
        RAISE EXCEPTION 'A fatia devolvida possui sinais inválidos.' USING ERRCODE='23514'; END IF;
      SELECT COALESCE(sum(CASE WHEN header.event_kind='return' THEN item.quantity ELSE -item.quantity END),0)
        INTO v_net FROM public.pdv_commercial_return_items item
        JOIN public.pdv_commercial_returns header ON header.id=item.commercial_return_id
       WHERE item.delivery_item_id=NEW.delivery_item_id;
      IF v_net+NEW.quantity>v_delivery.quantity THEN RAISE EXCEPTION 'A quantidade devolvida supera a entregue.'
        USING ERRCODE='23514',DETAIL='code=pdv_return_quantity_exceeded'; END IF;
    ELSE
      SELECT * INTO v_original FROM public.pdv_commercial_return_items
       WHERE id=NEW.reversal_of_item_id FOR UPDATE;
      IF NOT FOUND OR v_original.delivery_item_id<>NEW.delivery_item_id
        OR v_original.quantity<>NEW.quantity OR NEW.commercial_amount<>-v_original.commercial_amount
        OR (v_original.cmv_amount IS NULL AND NEW.cmv_amount IS NOT NULL)
        OR (v_original.cmv_amount IS NOT NULL AND NEW.cmv_amount IS DISTINCT FROM -v_original.cmv_amount)
        OR NEW.destination<>v_original.destination OR NEW.destination_stock_id IS DISTINCT FROM v_original.destination_stock_id THEN
        RAISE EXCEPTION 'A compensação não corresponde à devolução original.'
          USING ERRCODE='23514',DETAIL='code=pdv_return_reversal_item_mismatch'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER trg_pdv_commercial_returns_append_only BEFORE INSERT OR UPDATE OR DELETE ON public.pdv_commercial_returns
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_return_append_only_v2();
CREATE TRIGGER trg_pdv_commercial_return_items_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pdv_commercial_return_items
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_return_append_only_v2();
CREATE TRIGGER trg_pdv_return_dispositions_append_only BEFORE UPDATE OR DELETE ON public.pdv_return_dispositions
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_return_append_only_v2();
CREATE TRIGGER trg_pdv_residual_cancellations_append_only BEFORE UPDATE OR DELETE ON public.pdv_order_residual_cancellations
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_return_append_only_v2();

-- Um local de quarentena nunca pode originar uma nova reserva de venda.
CREATE OR REPLACE FUNCTION public.pdv_guard_quarantine_reservation_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF EXISTS(SELECT 1 FROM public.pdv_return_quarantine_stocks quarantine
    WHERE quarantine.company_id=NEW.company_id AND quarantine.stock_id=NEW.stock_id) THEN
    RAISE EXCEPTION 'O local de quarentena não pode reservar mercadoria para venda.'
      USING ERRCODE='23514',DETAIL='code=pdv_return_quarantine_not_saleable'; END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER trg_pdv_quarantine_reservation_guard BEFORE INSERT OR UPDATE OF stock_id,company_id
  ON public.pdv_stock_reservation_items FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_quarantine_reservation_v2();

CREATE OR REPLACE FUNCTION public.pdv_guard_quarantine_stock_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.stocks stock WHERE stock.id=NEW.stock_id
    AND stock.company_id=NEW.company_id AND stock.customer_id IS NULL) THEN
    RAISE EXCEPTION 'O local de quarentena deve pertencer à empresa e não pode ser estoque de cliente.'
      USING ERRCODE='23514',DETAIL='code=pdv_return_quarantine_tenant_mismatch';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER trg_pdv_quarantine_stock_guard BEFORE INSERT OR UPDATE
  ON public.pdv_return_quarantine_stocks FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_quarantine_stock_v2();

-- O guard W4 continua sendo a fronteira de integridade. Apenas a compensação
-- W5, com capability transacional igual à origem, pode reverter seus créditos.
DO $patch_party_credit_guard$
DECLARE v_src text; v_anchor text; v_insert text;
BEGIN
  SELECT pg_get_functiondef('public.pdv_guard_party_credit_entry_v2()'::regprocedure) INTO v_src;
  IF position('pdv_return_credit_reverse_source' in v_src)=0 THEN
    v_anchor:='    IF NOT FOUND OR v_original.company_id<>NEW.company_id';
    v_insert:='    IF FOUND AND v_original.source_commercial_return_id IS NOT NULL'||chr(10)||
      '      AND COALESCE(current_setting(''app.pdv_return_credit_reverse'',true),'''')'||chr(10)||
      '        <>v_original.source_commercial_return_id::text THEN'||chr(10)||
      '      RAISE EXCEPTION ''Este crédito pertence a uma devolução e deve ser compensado por ela.'''||chr(10)||
      '        USING ERRCODE=''23514'',DETAIL=''code=pdv_return_credit_reverse_source'';'||chr(10)||
      '    END IF;'||chr(10);
    IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Âncora do guard W4 mudou'; END IF;
    v_src:=replace(v_src,v_anchor,v_insert||v_anchor); EXECUTE v_src;
  END IF;
END $patch_party_credit_guard$;

DO $patch_party_credit_lifecycle$
DECLARE v_src text; v_anchor text; v_insert text;
BEGIN
  SELECT pg_get_functiondef('public.pdv_guard_party_credit_entry_v2()'::regprocedure) INTO v_src;
  IF position('pdv_return_credit_created_by_lifecycle' in v_src)=0 THEN
    v_anchor:='  IF TG_OP IN (''UPDATE'',''DELETE'') THEN';
    v_insert:='  -- pdv_return_credit_created_by_lifecycle'||chr(10)||
      '  IF TG_OP=''UPDATE'' AND OLD.created_by IS NOT NULL AND NEW.created_by IS NULL'||chr(10)||
      '    AND NOT EXISTS(SELECT 1 FROM auth.users users WHERE users.id=OLD.created_by)'||chr(10)||
      '    AND (to_jsonb(NEW)-''created_by'')=(to_jsonb(OLD)-''created_by'') THEN RETURN NEW; END IF;'||chr(10);
    IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Âncora lifecycle do guard W4 mudou'; END IF;
    v_src:=replace(v_src,v_anchor,v_insert||v_anchor); EXECUTE v_src;
  END IF;
END $patch_party_credit_lifecycle$;

DO $patch_public_credit_reverse$
DECLARE v_src text; v_anchor text; v_insert text;
BEGIN
  SELECT pg_get_functiondef('public.pdv_reverse_party_credit_entry_v2(uuid,text,text)'::regprocedure) INTO v_src;
  IF position('pdv_return_credit_reverse_public_forbidden' in v_src)=0 THEN
    v_anchor:='  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(';
    v_insert:='  IF v_original.source_commercial_return_id IS NOT NULL THEN'||chr(10)||
      '    RAISE EXCEPTION ''Este crédito pertence a uma devolução e deve ser compensado por ela.'''||chr(10)||
      '      USING ERRCODE=''23514'',DETAIL=''code=pdv_return_credit_reverse_public_forbidden'';'||chr(10)||
      '  END IF;'||chr(10);
    IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Âncora da reversão pública W4 mudou'; END IF;
    v_src:=replace(v_src,v_anchor,v_insert||v_anchor); EXECUTE v_src;
  END IF;
END $patch_public_credit_reverse$;

CREATE OR REPLACE FUNCTION public.pdv_return_credit_entry_internal_v2(
  p_company_id uuid,p_customer_id uuid,p_source_return_id uuid,p_entry_kind text,
  p_amount numeric,p_occurred_on date,p_description text,p_target_transaction_id uuid,
  p_reversal_of_id uuid,p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_claim record; v_entry uuid; v_original public.pdv_party_credit_entries%ROWTYPE;
BEGIN
  IF public.pdv_party_accounts_v2_enabled_internal(p_company_id) IS DISTINCT FROM TRUE
    OR NOT EXISTS(SELECT 1 FROM public.pdv_commercial_returns header
      WHERE header.id=p_source_return_id AND header.company_id=p_company_id
        AND header.customer_id=p_customer_id) THEN
    RAISE EXCEPTION 'A conta de crédito da devolução não está disponível.'
      USING ERRCODE='42501',DETAIL='code=pdv_return_credit_source_invalid'; END IF;
  IF p_entry_kind NOT IN('credit','application','reversal') OR p_amount IS NULL OR p_amount=0
    OR p_amount<>round(p_amount,2) OR lower(p_amount::text) IN('nan','infinity','-infinity') THEN
    RAISE EXCEPTION 'Movimento financeiro da devolução inválido.' USING ERRCODE='22023'; END IF;
  IF p_entry_kind='credit' AND (p_amount<=0 OR p_target_transaction_id IS NOT NULL OR p_reversal_of_id IS NOT NULL)
    OR p_entry_kind='application' AND (p_amount>=0 OR p_target_transaction_id IS NULL OR p_reversal_of_id IS NOT NULL)
    OR p_entry_kind='reversal' AND p_reversal_of_id IS NULL THEN
    RAISE EXCEPTION 'Formato financeiro da devolução inválido.' USING ERRCODE='22023'; END IF;
  IF p_entry_kind='reversal' THEN
    SELECT * INTO v_original FROM public.pdv_party_credit_entries entry
     WHERE entry.id=p_reversal_of_id AND entry.company_id=p_company_id FOR UPDATE;
    IF NOT FOUND OR v_original.source_commercial_return_id IS NULL OR p_amount<>-v_original.amount
      OR p_target_transaction_id IS DISTINCT FROM v_original.target_financial_transaction_id
      OR EXISTS(SELECT 1 FROM public.pdv_party_credit_entries reversal WHERE reversal.reversal_of_id=v_original.id) THEN
      RAISE EXCEPTION 'Crédito da devolução não pode ser compensado.'
        USING ERRCODE='23514',DETAIL='code=pdv_return_credit_not_reversible'; END IF;
  END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(p_company_id,
    CASE WHEN p_entry_kind='reversal' THEN 'commercial.return.credit.reverse.v2'
         ELSE 'commercial.return.credit.post.v2' END,p_idempotency_key,
    jsonb_build_object('customer_id',p_customer_id,'source_return_id',p_source_return_id,
      'entry_kind',p_entry_kind,'amount',p_amount,'occurred_on',p_occurred_on,
      'description',p_description,'target_transaction_id',p_target_transaction_id,
      'reversal_of_id',p_reversal_of_id));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN (v_claim.stored_result->>'entry_id')::uuid; END IF;
    RAISE EXCEPTION 'O movimento financeiro da devolução já está em processamento.' USING ERRCODE='55000'; END IF;
  IF p_entry_kind='reversal' THEN
    PERFORM set_config('app.pdv_return_credit_reverse',v_original.source_commercial_return_id::text,true);
  END IF;
  INSERT INTO public.pdv_party_credit_entries(company_id,party_type,customer_id,entry_kind,amount,
    occurred_on,description,target_financial_transaction_id,reversal_of_id,operation_request_id,
    metadata,source_commercial_return_id,created_by)
  VALUES(p_company_id,'customer',p_customer_id,p_entry_kind,p_amount,p_occurred_on,p_description,
    p_target_transaction_id,p_reversal_of_id,v_claim.request_id,
    jsonb_build_object('source','commercial_return_v2'),p_source_return_id,auth.uid())
  RETURNING id INTO v_entry;
  IF p_entry_kind='reversal' THEN PERFORM set_config('app.pdv_return_credit_reverse','',true); END IF;
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_party_credit_entry',v_entry,
    jsonb_build_object('ok',true,'entry_id',v_entry));
  RETURN v_entry;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_get_returnable_order_v2(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_order public.pdv_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_context FROM public.pdv_returns_context_v2(NULL);
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_order_id => p_order_id
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso ao local de estoque deste pedido.'
      USING ERRCODE='42501',DETAIL='code=pdv_return_stock_denied';
  END IF;
  SELECT * INTO v_order FROM public.pdv_orders WHERE id=p_order_id AND company_id=v_context.company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'
    USING ERRCODE='P0002',DETAIL='code=pdv_return_order_not_found'; END IF;
  RETURN jsonb_build_object('order_id',v_order.id,'number',v_order.number,'customer_id',v_order.customer_id,
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'delivery_item_id',item.id,'order_item_id',item.order_item_id,'description',order_item.description,
      'item_type',item.item_type,'delivered_quantity',item.quantity,
      'returnable_quantity',item.quantity-COALESCE(net.returned,0),
      'commercial_amount',item.commercial_amount_snapshot
    ) ORDER BY delivery.created_at,item.id)
    FROM public.pdv_delivery_items item
    JOIN public.pdv_deliveries delivery ON delivery.id=item.delivery_id
    JOIN public.pdv_order_items order_item ON order_item.id=item.order_item_id
    LEFT JOIN LATERAL(SELECT sum(CASE WHEN header.event_kind='return' THEN returned.quantity ELSE -returned.quantity END) returned
      FROM public.pdv_commercial_return_items returned JOIN public.pdv_commercial_returns header ON header.id=returned.commercial_return_id
      WHERE returned.delivery_item_id=item.id) net ON true
    WHERE delivery.order_id=v_order.id AND item.recognition_contract_version=2
      AND item.quantity-COALESCE(net.returned,0)>0),'[]'::jsonb),
    'stocks',COALESCE((SELECT jsonb_agg(jsonb_build_object('stock_id',stock.id,'name',stock.name,
      'destination',CASE WHEN quarantine.stock_id IS NULL THEN 'saleable' ELSE 'quarantine' END) ORDER BY stock.name,stock.id)
      FROM public.stocks stock LEFT JOIN public.pdv_return_quarantine_stocks quarantine ON quarantine.stock_id=stock.id
      WHERE stock.company_id=v_context.company_id AND stock.customer_id IS NULL
        AND public.can_access_stock(v_context.user_id,stock.id)),'[]'::jsonb));
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_return_delivery_items_v2(
  p_order_id uuid,p_lines jsonb,p_dispositions jsonb,p_occurred_on date,p_reason text,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $fn$
DECLARE v_context record; v_order public.pdv_orders%ROWTYPE; v_claim record; v_lines jsonb; v_dispositions jsonb;
  v_line jsonb; v_disp jsonb; v_delivery public.pdv_delivery_items%ROWTYPE; v_order_item public.pdv_order_items%ROWTYPE;
  v_prior numeric; v_qty numeric; v_commercial numeric(14,2); v_cmv numeric(14,2); v_total numeric(14,2):=0;
  v_cmv_total numeric(14,2):=0; v_unknown_cmv boolean:=false; v_allocations jsonb:='[]'::jsonb;
  v_return_id uuid:=gen_random_uuid(); v_movement public.inventory_movements%ROWTYPE; v_return_item uuid;
  v_credit_entry uuid; v_application_entry uuid; v_amount numeric(14,2); v_disp_total numeric(14,2):=0;
  v_receivable uuid; v_result jsonb; v_date date; v_reason text; v_index integer:=0;
BEGIN
  SELECT * INTO v_context FROM public.pdv_returns_context_v2('fn:return_pdv_order');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_order_id => p_order_id
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso ao local de estoque deste pedido.'
      USING ERRCODE='42501',DETAIL='code=pdv_return_stock_denied';
  END IF;
  v_date:=COALESCE(p_occurred_on,public.company_today(v_context.company_id));
  v_reason:=NULLIF(btrim(COALESCE(p_reason,'')),'');
  IF v_reason IS NULL OR char_length(v_reason)>500 OR v_date>public.company_today(v_context.company_id)
    OR p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100
    OR p_dispositions IS NULL OR jsonb_typeof(p_dispositions)<>'array' OR jsonb_array_length(p_dispositions)>10 THEN
    RAISE EXCEPTION 'Revise os itens, a data, o motivo e o destino financeiro.'
      USING ERRCODE='22023',DETAIL='code=pdv_return_payload_invalid'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) line WHERE jsonb_typeof(line)<>'object'
    OR (line-ARRAY['delivery_item_id','quantity','destination','destination_stock_id']::text[])<>'{}'::jsonb
    OR NOT(line?'delivery_item_id') OR NOT(line?'quantity') OR NOT(line?'destination')) THEN
    RAISE EXCEPTION 'Revise o formato dos itens devolvidos.' USING ERRCODE='22023',DETAIL='code=pdv_return_line_shape_invalid'; END IF;
  BEGIN
    SELECT jsonb_agg(jsonb_build_object('delivery_item_id',(line->>'delivery_item_id')::uuid,
      'quantity',trim_scale((line->>'quantity')::numeric),'destination',lower(btrim(line->>'destination')),
      'destination_stock_id',NULLIF(line->>'destination_stock_id','')::uuid) ORDER BY (line->>'delivery_item_id')::uuid)
      INTO v_lines FROM jsonb_array_elements(p_lines) line;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Revise os itens e quantidades devolvidos.' USING ERRCODE='22023'; END;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_lines) line WHERE (line->>'quantity')::numeric<=0
      OR lower(line->>'quantity') IN('nan','infinity','-infinity')
      OR line->>'destination' NOT IN('saleable','quarantine','none'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_lines) line GROUP BY line->>'delivery_item_id' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Há item, quantidade ou destino inválido na devolução.' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_dispositions) disposition WHERE jsonb_typeof(disposition)<>'object'
    OR (disposition-ARRAY['kind','amount','receivable_transaction_id']::text[])<>'{}'::jsonb
    OR NOT(disposition?'kind') OR NOT(disposition?'amount')) THEN
    RAISE EXCEPTION 'Revise o destino financeiro da devolução.' USING ERRCODE='22023'; END IF;
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',lower(btrim(disposition->>'kind')),
      'amount',round((disposition->>'amount')::numeric,2),
      'receivable_transaction_id',NULLIF(disposition->>'receivable_transaction_id','')::uuid)
      ORDER BY lower(btrim(disposition->>'kind')),NULLIF(disposition->>'receivable_transaction_id','')::uuid NULLS LAST),'[]'::jsonb)
      INTO v_dispositions FROM jsonb_array_elements(p_dispositions) disposition;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Revise os valores do destino financeiro.' USING ERRCODE='22023'; END;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_dispositions) disposition
    WHERE disposition->>'kind' NOT IN('receivable_reduction','customer_credit')
      OR (disposition->>'amount')::numeric<=0
      OR lower(disposition->>'amount') IN('nan','infinity','-infinity')) THEN
    RAISE EXCEPTION 'Destino financeiro inválido.' USING ERRCODE='22023'; END IF;
  IF v_date<public.company_today(v_context.company_id)
    AND NOT public.is_admin_or_gestor(v_context.user_id) AND NOT public.is_super_admin(v_context.user_id)
    AND public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:backdate_pdv_return') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar devolução em data anterior.'
      USING ERRCODE='42501',DETAIL='code=pdv_return_backdate_forbidden'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'commercial.return.v2',p_idempotency_key,
    jsonb_build_object('order_id',p_order_id,'lines',v_lines,'dispositions',v_dispositions,'occurred_on',v_date,'reason',v_reason));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'Esta devolução já está em processamento.' USING ERRCODE='55000'; END IF;

  -- Hierarquia canônica W1/W2: cliente -> recebível -> pedido -> material ->
  -- local -> saldo/reservas -> fatia entregue. Nunca se trava delivery antes
  -- do estoque, evitando ciclo com venda direta e expedição.
  SELECT * INTO v_order FROM public.pdv_orders WHERE id=p_order_id AND company_id=v_context.company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE='P0002',DETAIL='code=pdv_return_order_not_found'; END IF;
  IF v_order.status='cancelado' THEN RAISE EXCEPTION 'Pedido cancelado não pode receber devolução.' USING ERRCODE='23514'; END IF;
  IF v_order.customer_id IS NOT NULL THEN
    PERFORM customer.id FROM public.customers customer
     WHERE customer.id=v_order.customer_id AND customer.company_id=v_context.company_id FOR UPDATE;
  END IF;
  PERFORM transaction.id FROM public.financial_transactions transaction
    JOIN (SELECT DISTINCT NULLIF(disposition->>'receivable_transaction_id','')::uuid id
      FROM jsonb_array_elements(v_dispositions) disposition) requested ON requested.id=transaction.id
   ORDER BY transaction.id FOR UPDATE OF transaction;
  SELECT * INTO v_order FROM public.pdv_orders WHERE id=p_order_id AND company_id=v_context.company_id FOR UPDATE;
  PERFORM inventory.id FROM public.inventory inventory
    JOIN (SELECT DISTINCT order_item.inventory_id id FROM jsonb_array_elements(v_lines) line
      JOIN public.pdv_delivery_items delivery_item ON delivery_item.id=(line->>'delivery_item_id')::uuid
      JOIN public.pdv_deliveries delivery ON delivery.id=delivery_item.delivery_id AND delivery.order_id=p_order_id
      JOIN public.pdv_order_items order_item ON order_item.id=delivery_item.order_item_id
      WHERE order_item.inventory_id IS NOT NULL) requested ON requested.id=inventory.id
   ORDER BY inventory.id FOR UPDATE OF inventory;
  PERFORM stock.id FROM public.stocks stock
    JOIN (SELECT DISTINCT NULLIF(line->>'destination_stock_id','')::uuid id
      FROM jsonb_array_elements(v_lines) line WHERE NULLIF(line->>'destination_stock_id','') IS NOT NULL) requested ON requested.id=stock.id
   ORDER BY stock.id FOR UPDATE OF stock;
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present)
  SELECT DISTINCT v_context.company_id,order_item.inventory_id,stock.id,0,true
    FROM jsonb_array_elements(v_lines) line
    JOIN public.pdv_delivery_items delivery_item ON delivery_item.id=(line->>'delivery_item_id')::uuid
    JOIN public.pdv_deliveries delivery ON delivery.id=delivery_item.delivery_id AND delivery.order_id=p_order_id
    JOIN public.pdv_order_items order_item ON order_item.id=delivery_item.order_item_id
    JOIN public.stocks stock ON stock.id=NULLIF(line->>'destination_stock_id','')::uuid
      AND stock.company_id=v_context.company_id AND stock.customer_id IS NULL
   WHERE order_item.inventory_id IS NOT NULL ON CONFLICT(inventory_id,stock_id) DO NOTHING;
  PERFORM level.id FROM public.inventory_stock_levels level
    JOIN (SELECT DISTINCT order_item.inventory_id,NULLIF(line->>'destination_stock_id','')::uuid stock_id
      FROM jsonb_array_elements(v_lines) line
      JOIN public.pdv_delivery_items delivery_item ON delivery_item.id=(line->>'delivery_item_id')::uuid
      JOIN public.pdv_deliveries delivery ON delivery.id=delivery_item.delivery_id AND delivery.order_id=p_order_id
      JOIN public.pdv_order_items order_item ON order_item.id=delivery_item.order_item_id
      WHERE order_item.inventory_id IS NOT NULL) requested
      ON requested.inventory_id=level.inventory_id AND requested.stock_id=level.stock_id
   ORDER BY level.inventory_id,level.stock_id FOR UPDATE OF level;
  PERFORM reservation.id FROM public.pdv_stock_reservation_items reservation
    JOIN (SELECT DISTINCT order_item.inventory_id,NULLIF(line->>'destination_stock_id','')::uuid stock_id
      FROM jsonb_array_elements(v_lines) line
      JOIN public.pdv_delivery_items delivery_item ON delivery_item.id=(line->>'delivery_item_id')::uuid
      JOIN public.pdv_deliveries delivery ON delivery.id=delivery_item.delivery_id AND delivery.order_id=p_order_id
      JOIN public.pdv_order_items order_item ON order_item.id=delivery_item.order_item_id
      WHERE order_item.inventory_id IS NOT NULL) requested
      ON requested.inventory_id=reservation.inventory_id AND requested.stock_id=reservation.stock_id
   WHERE reservation.state IN('guaranteed','conflict')
   ORDER BY reservation.inventory_id,reservation.stock_id,reservation.id FOR UPDATE OF reservation;
  PERFORM delivery_item.id FROM public.pdv_delivery_items delivery_item
    JOIN (SELECT DISTINCT (line->>'delivery_item_id')::uuid id FROM jsonb_array_elements(v_lines) line) requested
      ON requested.id=delivery_item.id
   ORDER BY delivery_item.id FOR UPDATE OF delivery_item;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    SELECT item.* INTO v_delivery
      FROM public.pdv_delivery_items item JOIN public.pdv_deliveries delivery ON delivery.id=item.delivery_id
      JOIN public.pdv_order_items order_item ON order_item.id=item.order_item_id
     WHERE item.id=(v_line->>'delivery_item_id')::uuid AND item.company_id=v_context.company_id
       AND delivery.order_id=p_order_id FOR UPDATE OF item;
    IF NOT FOUND OR v_delivery.recognition_contract_version<>2 THEN
      RAISE EXCEPTION 'Item entregue não encontrado neste pedido.' USING ERRCODE='P0002',DETAIL='code=pdv_return_delivery_not_found'; END IF;
    SELECT order_item.* INTO v_order_item
      FROM public.pdv_order_items order_item
     WHERE order_item.id=v_delivery.order_item_id;
    IF v_date<v_delivery.recognition_date THEN RAISE EXCEPTION 'A devolução não pode ser anterior à entrega.'
      USING ERRCODE='22023',DETAIL='code=pdv_return_before_delivery'; END IF;
    v_qty:=(v_line->>'quantity')::numeric;
    SELECT COALESCE(sum(CASE WHEN header.event_kind='return' THEN item.quantity ELSE -item.quantity END),0)
      INTO v_prior FROM public.pdv_commercial_return_items item
      JOIN public.pdv_commercial_returns header ON header.id=item.commercial_return_id
     WHERE item.delivery_item_id=v_delivery.id;
    IF v_prior+v_qty>v_delivery.quantity THEN RAISE EXCEPTION 'A quantidade devolvida supera a entregue.'
      USING ERRCODE='23514',DETAIL='code=pdv_return_quantity_exceeded'; END IF;
    IF v_delivery.item_type='material' THEN
      IF v_line->>'destination' NOT IN('saleable','quarantine') OR NULLIF(v_line->>'destination_stock_id','') IS NULL THEN
        RAISE EXCEPTION 'Escolha um local vendável ou de quarentena.' USING ERRCODE='22023'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.stocks stock WHERE stock.id=(v_line->>'destination_stock_id')::uuid
          AND stock.company_id=v_context.company_id AND stock.customer_id IS NULL)
        OR public.can_access_stock(v_context.user_id,(v_line->>'destination_stock_id')::uuid) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Local de estoque indisponível.' USING ERRCODE='42501',DETAIL='code=pdv_return_stock_denied'; END IF;
      IF (v_line->>'destination'='quarantine') IS DISTINCT FROM EXISTS(SELECT 1 FROM public.pdv_return_quarantine_stocks
          WHERE company_id=v_context.company_id AND stock_id=(v_line->>'destination_stock_id')::uuid) THEN
        RAISE EXCEPTION 'O local não corresponde ao destino escolhido.' USING ERRCODE='23514',DETAIL='code=pdv_return_destination_mismatch'; END IF;
    ELSIF v_line->>'destination'<>'none' OR NULLIF(v_line->>'destination_stock_id','') IS NOT NULL THEN
      RAISE EXCEPTION 'Serviços e itens livres não movimentam estoque.' USING ERRCODE='22023';
    END IF;
    v_commercial:=-(round(v_delivery.commercial_amount_snapshot*(v_prior+v_qty)/v_delivery.quantity,2)
      -round(v_delivery.commercial_amount_snapshot*v_prior/v_delivery.quantity,2));
    v_cmv:=CASE WHEN v_delivery.cmv_amount_snapshot IS NULL THEN NULL ELSE
      -(round(v_delivery.cmv_amount_snapshot*(v_prior+v_qty)/v_delivery.quantity,2)
      -round(v_delivery.cmv_amount_snapshot*v_prior/v_delivery.quantity,2)) END;
    v_total:=v_total+v_commercial;
    IF v_cmv IS NULL THEN v_unknown_cmv:=true; ELSE v_cmv_total:=v_cmv_total+v_cmv; END IF;
    v_allocations:=v_allocations||jsonb_build_array(v_line||jsonb_build_object('commercial_amount',v_commercial,
      'cmv_amount',v_cmv,'inventory_id',v_order_item.inventory_id,'item_type',v_delivery.item_type,
      'unit_cost_snapshot',v_delivery.unit_cost_snapshot,'original_movement_id',v_delivery.inventory_movement_id));
  END LOOP;
  SELECT COALESCE(sum((disposition->>'amount')::numeric),0) INTO v_disp_total FROM jsonb_array_elements(v_dispositions) disposition;
  IF v_disp_total<>-v_total THEN RAISE EXCEPTION 'Distribua todo o valor devolvido entre recebível e crédito.'
    USING ERRCODE='22023',DETAIL='code=pdv_return_disposition_total_mismatch'; END IF;
  IF v_disp_total>0 AND v_order.customer_id IS NULL THEN RAISE EXCEPTION 'Informe um cliente no pedido para gerar saldo.'
    USING ERRCODE='23514',DETAIL='code=pdv_return_customer_required'; END IF;

  INSERT INTO public.pdv_commercial_returns(id,company_id,order_id,customer_id,event_kind,occurred_on,reason,
    commercial_total,cmv_total,operation_request_id,created_by)
  VALUES(v_return_id,v_context.company_id,p_order_id,v_order.customer_id,'return',v_date,v_reason,v_total,
    CASE WHEN v_unknown_cmv THEN NULL ELSE v_cmv_total END,v_claim.request_id,v_context.user_id);
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_allocations) LOOP
    v_movement:=NULL;
    IF v_line->>'item_type'='material' THEN
      v_movement:=public.register_inventory_movement((v_line->>'inventory_id')::uuid,'entrada',(v_line->>'quantity')::numeric,
        NULL,NULLIF(v_line->>'unit_cost_snapshot','null')::numeric,
        'Devolução comercial '||v_return_id::text,NULL,(v_line->>'original_movement_id')::uuid,
        (v_line->>'destination_stock_id')::uuid);
    END IF;
    INSERT INTO public.pdv_commercial_return_items(company_id,commercial_return_id,delivery_item_id,inventory_id,
      destination,destination_stock_id,quantity,commercial_amount,cmv_amount,inventory_movement_id)
    VALUES(v_context.company_id,v_return_id,(v_line->>'delivery_item_id')::uuid,NULLIF(v_line->>'inventory_id','')::uuid,
      v_line->>'destination',NULLIF(v_line->>'destination_stock_id','')::uuid,(v_line->>'quantity')::numeric,
      (v_line->>'commercial_amount')::numeric,NULLIF(v_line->>'cmv_amount','null')::numeric,v_movement.id)
    RETURNING id INTO v_return_item;
  END LOOP;
  FOR v_disp IN SELECT value FROM jsonb_array_elements(v_dispositions) LOOP
    v_index:=v_index+1; v_amount:=(v_disp->>'amount')::numeric; v_receivable:=NULLIF(v_disp->>'receivable_transaction_id','')::uuid;
    IF v_disp->>'kind'='receivable_reduction' THEN
      IF v_receivable IS NULL OR NOT EXISTS(SELECT 1 FROM public.pdv_order_payments payment
          WHERE payment.company_id=v_context.company_id AND payment.order_id=p_order_id
            AND payment.receivable_transaction_id=v_receivable)
        OR public.pdv_party_obligation_open_v2(v_receivable)<v_amount THEN
        RAISE EXCEPTION 'O recebível não possui saldo suficiente para este abatimento.'
          USING ERRCODE='23514',DETAIL='code=pdv_return_receivable_invalid'; END IF;
    END IF;
    v_credit_entry:=public.pdv_return_credit_entry_internal_v2(v_context.company_id,v_order.customer_id,v_return_id,
      'credit',v_amount,v_date,'Crédito de devolução comercial '||v_return_id::text,NULL,NULL,
      'ret:'||v_return_id::text||':c:'||v_index::text);
    v_application_entry:=NULL;
    IF v_disp->>'kind'='receivable_reduction' THEN
      v_application_entry:=public.pdv_return_credit_entry_internal_v2(v_context.company_id,v_order.customer_id,v_return_id,
        'application',-v_amount,v_date,'Abatimento por devolução comercial '||v_return_id::text,v_receivable,NULL,
        'ret:'||v_return_id::text||':a:'||v_index::text);
    END IF;
    INSERT INTO public.pdv_return_dispositions(company_id,commercial_return_id,disposition_kind,amount,
      receivable_transaction_id,credit_entry_id,application_entry_id)
    VALUES(v_context.company_id,v_return_id,v_disp->>'kind',v_amount,v_receivable,v_credit_entry,v_application_entry);
  END LOOP;
  v_result:=jsonb_build_object('ok',true,'return_id',v_return_id,'order_id',p_order_id,
    'commercial_total',v_total,'cmv_total',CASE WHEN v_unknown_cmv THEN NULL ELSE v_cmv_total END,
    'item_count',jsonb_array_length(v_allocations),'idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_commercial_return',v_return_id,v_result);
  RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_reverse_commercial_return_v2(p_return_id uuid,p_reason text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_original public.pdv_commercial_returns%ROWTYPE; v_claim record; v_reason text;
  v_reversal_id uuid:=gen_random_uuid(); v_item record; v_level numeric; v_movement public.inventory_movements%ROWTYPE;
  v_disposition record; v_reverse_app uuid; v_reverse_credit uuid; v_result jsonb; v_unit_cost numeric;
  v_reserved numeric; v_credit_original public.pdv_party_credit_entries%ROWTYPE;
BEGIN
  SELECT * INTO v_context FROM public.pdv_returns_context_v2('fn:reverse_pdv_return');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_return_id => p_return_id
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque desta devolução.'
      USING ERRCODE='42501',DETAIL='code=pdv_return_stock_denied';
  END IF;
  v_reason:=NULLIF(btrim(COALESCE(p_reason,'')),'');
  IF v_reason IS NULL OR char_length(v_reason)>500 THEN RAISE EXCEPTION 'Informe o motivo da compensação.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_original FROM public.pdv_commercial_returns
   WHERE id=p_return_id AND company_id=v_context.company_id;
  IF NOT FOUND OR v_original.event_kind<>'return' THEN RAISE EXCEPTION 'Devolução não encontrada.'
    USING ERRCODE='P0002',DETAIL='code=pdv_return_not_found'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'commercial.return.reverse.v2',p_idempotency_key,
    jsonb_build_object('return_id',p_return_id,'reason',v_reason));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'Esta compensação já está em processamento.' USING ERRCODE='55000'; END IF;

  -- Mesma hierarquia do retorno/venda: financeiro primeiro; depois materiais,
  -- locais, saldos/reservas e somente então delivery/return rows.
  IF v_original.customer_id IS NOT NULL THEN
    PERFORM customer.id FROM public.customers customer
     WHERE customer.id=v_original.customer_id AND customer.company_id=v_context.company_id FOR UPDATE;
  END IF;
  PERFORM transaction.id FROM public.financial_transactions transaction
    JOIN (SELECT DISTINCT disposition.receivable_transaction_id id FROM public.pdv_return_dispositions disposition
      WHERE disposition.commercial_return_id=p_return_id AND disposition.receivable_transaction_id IS NOT NULL) requested
      ON requested.id=transaction.id ORDER BY transaction.id FOR UPDATE OF transaction;
  PERFORM entry.id FROM public.pdv_party_credit_entries entry
    JOIN (SELECT disposition.credit_entry_id id FROM public.pdv_return_dispositions disposition
      WHERE disposition.commercial_return_id=p_return_id
      UNION SELECT disposition.application_entry_id FROM public.pdv_return_dispositions disposition
      WHERE disposition.commercial_return_id=p_return_id AND disposition.application_entry_id IS NOT NULL) requested
      ON requested.id=entry.id ORDER BY entry.id FOR UPDATE OF entry;
  PERFORM orders.id FROM public.pdv_orders orders WHERE orders.id=v_original.order_id FOR UPDATE;
  PERFORM inventory.id FROM public.inventory inventory
    JOIN (SELECT DISTINCT item.inventory_id id FROM public.pdv_commercial_return_items item
      WHERE item.commercial_return_id=p_return_id AND item.inventory_id IS NOT NULL) requested ON requested.id=inventory.id
   ORDER BY inventory.id FOR UPDATE OF inventory;
  PERFORM stock.id FROM public.stocks stock
    JOIN (SELECT DISTINCT item.destination_stock_id id FROM public.pdv_commercial_return_items item
      WHERE item.commercial_return_id=p_return_id AND item.destination_stock_id IS NOT NULL) requested ON requested.id=stock.id
   ORDER BY stock.id FOR UPDATE OF stock;
  PERFORM level.id FROM public.inventory_stock_levels level
    JOIN (SELECT DISTINCT item.inventory_id,item.destination_stock_id stock_id FROM public.pdv_commercial_return_items item
      WHERE item.commercial_return_id=p_return_id AND item.inventory_id IS NOT NULL) requested
      ON requested.inventory_id=level.inventory_id AND requested.stock_id=level.stock_id
   ORDER BY level.inventory_id,level.stock_id FOR UPDATE OF level;
  PERFORM reservation.id FROM public.pdv_stock_reservation_items reservation
    JOIN (SELECT DISTINCT item.inventory_id,item.destination_stock_id stock_id FROM public.pdv_commercial_return_items item
      WHERE item.commercial_return_id=p_return_id AND item.inventory_id IS NOT NULL) requested
      ON requested.inventory_id=reservation.inventory_id AND requested.stock_id=reservation.stock_id
   WHERE reservation.state IN('guaranteed','conflict')
   ORDER BY reservation.inventory_id,reservation.stock_id,reservation.id FOR UPDATE OF reservation;
  PERFORM delivery_item.id FROM public.pdv_delivery_items delivery_item
    JOIN (SELECT DISTINCT item.delivery_item_id id FROM public.pdv_commercial_return_items item
      WHERE item.commercial_return_id=p_return_id) requested ON requested.id=delivery_item.id
   ORDER BY delivery_item.id FOR UPDATE OF delivery_item;
  SELECT * INTO v_original FROM public.pdv_commercial_returns
   WHERE id=p_return_id AND company_id=v_context.company_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.pdv_commercial_returns WHERE reversal_of_id=p_return_id) THEN
    RAISE EXCEPTION 'Esta devolução já foi compensada.' USING ERRCODE='23514',DETAIL='code=pdv_return_already_reversed'; END IF;
  INSERT INTO public.pdv_commercial_returns(id,company_id,order_id,customer_id,event_kind,occurred_on,reason,
    commercial_total,cmv_total,reversal_of_id,operation_request_id,created_by)
  VALUES(v_reversal_id,v_context.company_id,v_original.order_id,v_original.customer_id,'reversal',
    public.company_today(v_context.company_id),v_reason,-v_original.commercial_total,
    CASE WHEN v_original.cmv_total IS NULL THEN NULL ELSE -v_original.cmv_total END,p_return_id,v_claim.request_id,v_context.user_id);
  FOR v_item IN SELECT item.* FROM public.pdv_commercial_return_items item
    WHERE item.commercial_return_id=p_return_id ORDER BY item.destination_stock_id,item.inventory_id,item.id FOR UPDATE LOOP
    v_movement:=NULL;
    IF v_item.inventory_id IS NOT NULL THEN
      IF public.can_access_stock(v_context.user_id,v_item.destination_stock_id) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Você não possui acesso ao local devolvido.' USING ERRCODE='42501'; END IF;
      SELECT level.quantity INTO v_level FROM public.inventory_stock_levels level
       WHERE level.inventory_id=v_item.inventory_id AND level.stock_id=v_item.destination_stock_id FOR UPDATE;
      SELECT COALESCE(sum(reservation.reserved_quantity-reservation.consumed_quantity-
        reservation.released_quantity-reservation.shortage_quantity),0) INTO v_reserved
        FROM public.pdv_stock_reservation_items reservation
       WHERE reservation.company_id=v_context.company_id AND reservation.inventory_id=v_item.inventory_id
         AND reservation.stock_id=v_item.destination_stock_id AND reservation.state IN('guaranteed','conflict');
      IF COALESCE(v_level,0)-v_reserved<v_item.quantity THEN
        RAISE EXCEPTION 'O saldo devolvido está reservado ou não está mais disponível para compensação.'
        USING ERRCODE='23514',DETAIL='code=pdv_return_reversal_stock_insufficient'; END IF;
      SELECT movement.unit_cost INTO v_unit_cost FROM public.inventory_movements movement
       WHERE movement.id=v_item.inventory_movement_id;
      v_movement:=public.register_inventory_movement(v_item.inventory_id,'saida',-v_item.quantity,NULL,v_unit_cost,
        'Compensação de devolução comercial '||p_return_id::text,NULL,v_item.inventory_movement_id,v_item.destination_stock_id);
    END IF;
    INSERT INTO public.pdv_commercial_return_items(company_id,commercial_return_id,delivery_item_id,inventory_id,
      destination,destination_stock_id,quantity,commercial_amount,cmv_amount,inventory_movement_id,reversal_of_item_id)
    VALUES(v_context.company_id,v_reversal_id,v_item.delivery_item_id,v_item.inventory_id,v_item.destination,
      v_item.destination_stock_id,v_item.quantity,-v_item.commercial_amount,
      CASE WHEN v_item.cmv_amount IS NULL THEN NULL ELSE -v_item.cmv_amount END,v_movement.id,v_item.id);
  END LOOP;
  FOR v_disposition IN SELECT disposition.* FROM public.pdv_return_dispositions disposition
    WHERE disposition.commercial_return_id=p_return_id ORDER BY disposition.id FOR UPDATE LOOP
    v_reverse_app:=NULL;
    IF v_disposition.application_entry_id IS NOT NULL THEN
      SELECT * INTO v_credit_original FROM public.pdv_party_credit_entries WHERE id=v_disposition.application_entry_id;
      v_reverse_app:=public.pdv_return_credit_entry_internal_v2(v_context.company_id,v_original.customer_id,v_reversal_id,
        'reversal',-v_credit_original.amount,public.company_today(v_context.company_id),v_reason,
        v_credit_original.target_financial_transaction_id,v_credit_original.id,
        'rvr:'||v_reversal_id::text||':a:'||v_disposition.id::text);
    END IF;
    SELECT * INTO v_credit_original FROM public.pdv_party_credit_entries WHERE id=v_disposition.credit_entry_id;
    v_reverse_credit:=public.pdv_return_credit_entry_internal_v2(v_context.company_id,v_original.customer_id,v_reversal_id,
      'reversal',-v_credit_original.amount,public.company_today(v_context.company_id),v_reason,
      v_credit_original.target_financial_transaction_id,v_credit_original.id,
      'rvr:'||v_reversal_id::text||':c:'||v_disposition.id::text);
    INSERT INTO public.pdv_return_dispositions(company_id,commercial_return_id,disposition_kind,amount,
      receivable_transaction_id,credit_entry_id,application_entry_id,reversal_credit_entry_id,
      reversal_application_entry_id,reversal_of_id)
    VALUES(v_context.company_id,v_reversal_id,v_disposition.disposition_kind,-v_disposition.amount,
      v_disposition.receivable_transaction_id,v_disposition.credit_entry_id,v_disposition.application_entry_id,
      v_reverse_credit,v_reverse_app,v_disposition.id);
  END LOOP;
  v_result:=jsonb_build_object('ok',true,'return_id',v_reversal_id,'reversal_of_id',p_return_id,
    'commercial_total',-v_original.commercial_total,'idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_commercial_return',v_reversal_id,v_result);
  RETURN v_result;
END $fn$;

ALTER TABLE public.pdv_orders DROP CONSTRAINT IF EXISTS pdv_orders_status_check;
ALTER TABLE public.pdv_orders ADD CONSTRAINT pdv_orders_status_check CHECK(status IN(
  'rascunho','aguardando_pagamento','pago','liberado_retirada','retirada_parcial','entregue','cancelado','cancelado_parcial'));

CREATE OR REPLACE FUNCTION public.pdv_cancel_order_residual_v2(p_order_id uuid,p_reason text,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_order public.pdv_orders%ROWTYPE; v_claim record; v_reason text;
  v_delivered numeric; v_ordered numeric; v_released numeric:=0; v_reservation record; v_cancel uuid:=gen_random_uuid(); v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_returns_context_v2('fn:cancel_pdv_order_residual');
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_order_id => p_order_id
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso aos locais de estoque deste pedido.'
      USING ERRCODE='42501',DETAIL='code=pdv_return_stock_denied';
  END IF;
  v_reason:=NULLIF(btrim(COALESCE(p_reason,'')),'');
  IF v_reason IS NULL OR char_length(v_reason)>500 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_order FROM public.pdv_orders WHERE id=p_order_id AND company_id=v_context.company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE='P0002'; END IF;
  SELECT COALESCE(sum(item.quantity),0) INTO v_ordered FROM public.pdv_order_items item WHERE item.order_id=p_order_id;
  SELECT COALESCE(sum(item.quantity),0) INTO v_delivered FROM public.pdv_delivery_items item
    JOIN public.pdv_deliveries delivery ON delivery.id=item.delivery_id WHERE delivery.order_id=p_order_id;
  IF v_delivered>=v_ordered THEN RAISE EXCEPTION 'Pedido totalmente entregue não possui saldo para cancelar.'
    USING ERRCODE='23514',DETAIL='code=pdv_cancel_fully_delivered'; END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_order_payments payment WHERE payment.order_id=p_order_id
    AND payment.company_id=v_context.company_id AND payment.coverage_status IN('authorized','settled')) THEN
    RAISE EXCEPTION 'O saldo coberto exige uma disposição financeira explícita antes do cancelamento.'
      USING ERRCODE='23514',DETAIL='code=pdv_cancel_financial_disposition_required'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'commercial.order.cancel_residual.v2',p_idempotency_key,
    jsonb_build_object('order_id',p_order_id,'reason',v_reason));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;
    RAISE EXCEPTION 'Este cancelamento já está em processamento.' USING ERRCODE='55000'; END IF;
  FOR v_reservation IN SELECT reservation.id,
      reservation.reserved_quantity-reservation.consumed_quantity-reservation.released_quantity residual
    FROM public.pdv_stock_reservation_items reservation
    JOIN public.pdv_order_items item ON item.id=reservation.order_item_id
    WHERE item.order_id=p_order_id AND reservation.state IN('guaranteed','conflict')
      AND reservation.reserved_quantity-reservation.consumed_quantity-reservation.released_quantity>0
    ORDER BY reservation.inventory_id,reservation.stock_id,reservation.id FOR UPDATE OF reservation LOOP
    PERFORM public.pdv_release_stock_reservation_internal_v2(v_context.company_id,v_reservation.id,v_reservation.residual);
    v_released:=v_released+v_reservation.residual;
  END LOOP;
  UPDATE public.pdv_orders SET status=CASE WHEN v_delivered=0 THEN 'cancelado' ELSE 'cancelado_parcial' END,
    cancelled_at=now(),updated_at=now() WHERE id=p_order_id;
  INSERT INTO public.pdv_order_residual_cancellations(id,company_id,order_id,reason,released_quantity,
    delivered_quantity,operation_request_id,created_by)
  VALUES(v_cancel,v_context.company_id,p_order_id,v_reason,v_released,v_delivered,v_claim.request_id,v_context.user_id);
  v_result:=jsonb_build_object('ok',true,'cancellation_id',v_cancel,'order_id',p_order_id,
    'released_quantity',v_released,'delivered_quantity',v_delivered,'idempotent',false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_order_residual_cancellation',v_cancel,v_result);
  RETURN v_result;
END $fn$;

-- Competencia: a devolucao reduz receita e CMV na data do retorno. Nao ha
-- linha de DRE-caixa nem DFC, pois nenhum dinheiro foi inventado.
DO $patch_projection$
DECLARE v_src text; v_anchor text; v_insert text;
BEGIN
  SELECT pg_get_functiondef('public.pdv_financial_projection_rows_v2(uuid)'::regprocedure) INTO v_src;
  IF position('commercial_return_v2' in v_src)=0 THEN
    v_anchor:='  UNION ALL'||chr(10)||'  SELECT ''dre_competence'', transaction.id, transaction.transaction_date,';
    v_insert:='  UNION ALL'||chr(10)||
      '  SELECT ''dre_competence'', item.id, header.occurred_on,'||chr(10)||
      '         CASE WHEN header.event_kind=''return'' THEN ''commercial_return_v2'' ELSE ''commercial_return_reversal_v2'' END,'||chr(10)||
      '         item.commercial_amount, item.cmv_amount, 0::numeric, 0::numeric,'||chr(10)||
      '         jsonb_build_object(''commercial_return_id'',header.id,''delivery_item_id'',item.delivery_item_id,''contract_version'',2)'||chr(10)||
      '    FROM public.pdv_commercial_return_items item'||chr(10)||
      '    JOIN public.pdv_commercial_returns header ON header.id=item.commercial_return_id'||chr(10)||
      '   WHERE item.company_id=p_company_id'||chr(10)||chr(10);
    IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Âncora da projeção W1C mudou'; END IF;
    v_src:=replace(v_src,v_anchor,v_insert||v_anchor); EXECUTE v_src;
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
  IF position('PDV_RETURNS_RESET_V2' in v_src)=0 THEN
    v_anchor:='-- PDV_PARTY_ACCOUNT_PDV_RESET_V2'||chr(10)||
      '    DELETE FROM public.pdv_party_credit_entries WHERE company_id = p_company_id;';
    v_insert:='-- PDV_RETURNS_RESET_V2'||chr(10)||
      '    DELETE FROM public.pdv_return_dispositions WHERE company_id=p_company_id AND reversal_of_id IS NOT NULL;'||chr(10)||
      '    DELETE FROM public.pdv_return_dispositions WHERE company_id=p_company_id;'||chr(10)||
      '    DELETE FROM public.pdv_party_credit_entries WHERE company_id=p_company_id'||chr(10)||
      '      AND source_commercial_return_id IS NOT NULL AND entry_kind=''reversal'';'||chr(10)||
      '    DELETE FROM public.pdv_party_credit_entries WHERE company_id=p_company_id'||chr(10)||
      '      AND source_commercial_return_id IS NOT NULL;'||chr(10)||
      '    DELETE FROM public.pdv_commercial_return_items WHERE company_id=p_company_id AND reversal_of_item_id IS NOT NULL;'||chr(10)||
      '    DELETE FROM public.pdv_commercial_return_items WHERE company_id=p_company_id;'||chr(10)||
      '    DELETE FROM public.pdv_commercial_returns WHERE company_id=p_company_id AND reversal_of_id IS NOT NULL;'||chr(10)||
      '    DELETE FROM public.pdv_commercial_returns WHERE company_id=p_company_id;'||chr(10)||
      '    DELETE FROM public.pdv_order_residual_cancellations WHERE company_id=p_company_id;'||chr(10)||
      '    DELETE FROM public.pdv_return_quarantine_stocks WHERE company_id=p_company_id;'||chr(10)||
      '    DELETE FROM public.pdv_operation_requests request WHERE request.company_id=p_company_id'||chr(10)||
      '      AND request.operation_type IN (''commercial.return.v2'',''commercial.return.reverse.v2'',''commercial.order.cancel_residual.v2'','||chr(10)||
      '        ''commercial.return.credit.post.v2'',''commercial.return.credit.reverse.v2'');'||chr(10)||
      '    '||v_anchor;
    IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Âncora do reset PDV W4 mudou'; END IF;
    v_src:=replace(v_src,v_anchor,v_insert);
  END IF;
  IF position('PDV_RETURNS_FINANCIAL_RESET_GUARD_V2' in v_src)=0 THEN
    v_anchor:='-- PDV_PARTY_ACCOUNT_FINANCIAL_RESET_V2'||chr(10)||
      '    PERFORM set_config(''app.pdv_purge_company'', p_company_id::text, true);'||chr(10)||
      '    DELETE FROM public.pdv_party_credit_entries WHERE company_id = p_company_id;';
    v_insert:='-- PDV_PARTY_ACCOUNT_FINANCIAL_RESET_V2'||chr(10)||
      '    -- PDV_RETURNS_FINANCIAL_RESET_GUARD_V2'||chr(10)||
      '    IF EXISTS(SELECT 1 FROM public.pdv_commercial_returns WHERE company_id=p_company_id) THEN'||chr(10)||
      '      RAISE EXCEPTION ''Existem devoluções do PDV. Zere o PDV antes dos movimentos financeiros.'''||chr(10)||
      '        USING ERRCODE=''23514'',DETAIL=''code=pdv_return_financial_reset_blocked'';'||chr(10)||
      '    END IF;'||chr(10)||
      '    PERFORM set_config(''app.pdv_purge_company'', p_company_id::text, true);'||chr(10)||
      '    DELETE FROM public.pdv_party_credit_entries WHERE company_id = p_company_id'||chr(10)||
      '      AND source_commercial_return_id IS NULL;';
    IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Âncora do reset financeiro W4 mudou'; END IF;
    v_src:=replace(v_src,v_anchor,v_insert);
  END IF;
  EXECUTE v_src;
END $patch_reset$;

DO $patch_admin_delete$
DECLARE v_oid regprocedure; v_src text; v_anchor text; v_insert text;
BEGIN
  SELECT procedure.oid::regprocedure,pg_get_functiondef(procedure.oid) INTO v_oid,v_src
    FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
   WHERE namespace.nspname='public' AND procedure.proname='admin_delete_company'
     AND pg_get_function_identity_arguments(procedure.oid)='p_company_id uuid';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'admin_delete_company não encontrada'; END IF;
  IF position('PDV_RETURNS_ADMIN_DELETE_V2' in v_src)=0 THEN
    v_anchor:='DELETE FROM public.pdv_orders order_row'||chr(10)||
      '   WHERE order_row.company_id = p_company_id;';
    v_insert:='-- PDV_RETURNS_ADMIN_DELETE_V2'||chr(10)||
      '  DELETE FROM public.pdv_return_dispositions WHERE company_id=p_company_id AND reversal_of_id IS NOT NULL;'||chr(10)||
      '  DELETE FROM public.pdv_return_dispositions WHERE company_id=p_company_id;'||chr(10)||
      '  DELETE FROM public.pdv_party_credit_entries WHERE company_id=p_company_id'||chr(10)||
      '    AND source_commercial_return_id IS NOT NULL AND entry_kind=''reversal'';'||chr(10)||
      '  DELETE FROM public.pdv_party_credit_entries WHERE company_id=p_company_id'||chr(10)||
      '    AND source_commercial_return_id IS NOT NULL;'||chr(10)||
      '  DELETE FROM public.pdv_commercial_return_items WHERE company_id=p_company_id AND reversal_of_item_id IS NOT NULL;'||chr(10)||
      '  DELETE FROM public.pdv_commercial_return_items WHERE company_id=p_company_id;'||chr(10)||
      '  DELETE FROM public.pdv_commercial_returns WHERE company_id=p_company_id AND reversal_of_id IS NOT NULL;'||chr(10)||
      '  DELETE FROM public.pdv_commercial_returns WHERE company_id=p_company_id;'||chr(10)||
      '  DELETE FROM public.pdv_order_residual_cancellations WHERE company_id=p_company_id;'||chr(10)||
      '  DELETE FROM public.pdv_return_quarantine_stocks WHERE company_id=p_company_id;'||chr(10)||
      '  DELETE FROM public.pdv_operation_requests request WHERE request.company_id=p_company_id'||chr(10)||
      '    AND request.operation_type IN (''commercial.return.v2'',''commercial.return.reverse.v2'',''commercial.order.cancel_residual.v2'','||chr(10)||
      '      ''commercial.return.credit.post.v2'',''commercial.return.credit.reverse.v2'');'||chr(10)||chr(10)||
      '  '||v_anchor;
    IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Âncora do admin_delete_company mudou'; END IF;
    v_src:=replace(v_src,v_anchor,v_insert); EXECUTE v_src;
  END IF;
END $patch_admin_delete$;

REVOKE ALL ON FUNCTION public.pdv_returns_v2_enabled_internal(uuid),public.pdv_returns_context_v2(text),
  public.pdv_guard_return_append_only_v2(),public.pdv_guard_quarantine_reservation_v2(),
  public.pdv_guard_quarantine_stock_v2(),
  public.pdv_return_credit_entry_internal_v2(uuid,uuid,uuid,text,numeric,date,text,uuid,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_get_returnable_order_v2(uuid),
  public.pdv_return_delivery_items_v2(uuid,jsonb,jsonb,date,text,text),
  public.pdv_reverse_commercial_return_v2(uuid,text,text),
  public.pdv_cancel_order_residual_v2(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_returnable_order_v2(uuid),
  public.pdv_return_delivery_items_v2(uuid,jsonb,jsonb,date,text,text),
  public.pdv_reverse_commercial_return_v2(uuid,text,text),
  public.pdv_cancel_order_residual_v2(uuid,text,text) TO authenticated,service_role;

COMMENT ON TABLE public.pdv_commercial_returns IS
  'Eventos append-only de devolução comercial e compensação. Não representam refund, voucher, troca ou estorno financeiro.';
COMMENT ON TABLE public.pdv_commercial_return_items IS
  'Fatia devolvida sempre vinculada a pdv_delivery_items; quantidade líquida nunca supera a entrega.';

COMMIT;

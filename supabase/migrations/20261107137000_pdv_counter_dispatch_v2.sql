-- W3: fluxo opcional balcao -> caixa -> expedicao sobre os contratos v2.
-- Default simples: nenhuma empresa muda de comportamento nesta migration.
BEGIN;

ALTER TABLE public.pdv_orders
  DROP CONSTRAINT IF EXISTS pdv_orders_status_check;
ALTER TABLE public.pdv_orders
  ADD CONSTRAINT pdv_orders_status_check CHECK (status IN (
    'rascunho','aguardando_pagamento','pago','liberado_retirada',
    'retirada_parcial','entregue','cancelado'
  ));

COMMENT ON COLUMN public.pdv_orders.status IS
  'Fluxo v2 balcão: aguardando_pagamento -> liberado_retirada -> retirada_parcial -> entregue. Não passa por pago, pois pago aciona o legado fiscal.';

CREATE TABLE public.pdv_delivery_receipt_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL REFERENCES public.pdv_deliveries(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.pdv_orders(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,delivery_id)
);

CREATE INDEX idx_pdv_delivery_receipts_order
  ON public.pdv_delivery_receipt_snapshots(company_id,order_id,created_at,id);

ALTER TABLE public.pdv_delivery_receipt_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_delivery_receipt_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_delivery_receipt_snapshots
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_guard_delivery_receipt_snapshot_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
BEGIN
  IF TG_OP='DELETE' AND (
    NOT EXISTS(SELECT 1 FROM public.companies company WHERE company.id=OLD.company_id)
    OR NOT EXISTS(SELECT 1 FROM public.pdv_deliveries delivery WHERE delivery.id=OLD.delivery_id)
    OR COALESCE(current_setting('app.pdv_purge_company',true),'')=OLD.company_id::text
  ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'O comprovante de retirada confirmado é imutável.'
    USING ERRCODE='55000',DETAIL='code=pdv_delivery_receipt_immutable';
END
$fn$;

CREATE TRIGGER trg_pdv_delivery_receipt_snapshot_immutable
  BEFORE UPDATE OR DELETE ON public.pdv_delivery_receipt_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_delivery_receipt_snapshot_v2();

CREATE OR REPLACE FUNCTION public.pdv_counter_context_v2(
  p_screen text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_require_counter boolean DEFAULT true
)
RETURNS TABLE(user_id uuid,company_id uuid,pdv_mode text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_user uuid:=auth.uid(); v_company uuid; v_mode text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sua sessão expirou. Entre novamente.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_auth_required';
  END IF;
  v_company:=public.get_user_company_id(v_user);
  IF v_company IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.profiles profile
     WHERE profile.user_id=v_user AND profile.company_id=v_company
       AND COALESCE(profile.is_active,true)
  ) THEN
    RAISE EXCEPTION 'Seu usuário não possui uma empresa ativa.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_company_required';
  END IF;
  IF public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM true
     OR public.company_has_module(v_company,'pdv') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O módulo PDV não está disponível para esta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_module_denied';
  END IF;
  IF p_screen IS NOT NULL
     AND NOT public.is_admin_or_gestor(v_user)
     AND NOT public.is_super_admin(v_user)
     AND public.pdv_has_explicit_action_permission_v2(v_user,p_screen) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para acessar esta etapa do PDV.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_screen_denied';
  END IF;
  IF p_action IS NOT NULL
     AND NOT public.is_admin_or_gestor(v_user)
     AND NOT public.is_super_admin(v_user)
     AND public.pdv_has_explicit_action_permission_v2(v_user,p_action) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para executar esta ação do PDV.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_action_denied';
  END IF;
  SELECT settings.pdv_mode INTO v_mode
    FROM public.company_settings settings
   WHERE settings.company_id=v_company;
  v_mode:=COALESCE(v_mode,'simples');
  IF p_require_counter AND v_mode<>'balcao' THEN
    RAISE EXCEPTION 'O fluxo balcão não está ativo para esta empresa.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_mode_required';
  END IF;
  RETURN QUERY SELECT v_user,v_company,v_mode;
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_get_counter_capability_v2()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_context record;
BEGIN
  SELECT * INTO v_context FROM public.pdv_counter_context_v2(NULL,NULL,false);
  RETURN jsonb_build_object(
    'mode',v_context.pdv_mode,
    'counter_enabled',v_context.pdv_mode='balcao',
    'dispatch_enabled',v_context.pdv_mode='balcao'
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_get_workflow_settings_v2()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_context record;
BEGIN
  SELECT * INTO v_context
    FROM public.pdv_counter_context_v2('screen:pdv_settings',NULL,false);
  RETURN jsonb_build_object('pdv_mode',v_context.pdv_mode);
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_save_workflow_settings_v2(p_pdv_mode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_context record; v_mode text;
BEGIN
  SELECT * INTO v_context
    FROM public.pdv_counter_context_v2('screen:pdv_settings','fn:manage_pdv_settings',false);
  IF p_pdv_mode IS NULL OR p_pdv_mode NOT IN('simples','balcao') THEN
    RAISE EXCEPTION 'Escolha o modo simples ou balcão.'
      USING ERRCODE='22023',DETAIL='code=pdv_counter_mode_invalid';
  END IF;
  UPDATE public.company_settings
     SET pdv_mode=p_pdv_mode,updated_at=now()
   WHERE company_id=v_context.company_id
   RETURNING pdv_mode INTO v_mode;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'As configurações da empresa não estão disponíveis.'
      USING ERRCODE='P0002',DETAIL='code=pdv_counter_settings_missing';
  END IF;
  RETURN jsonb_build_object('pdv_mode',v_mode);
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_cover_existing_order_v2(
  p_order_id uuid,
  p_terminal_id uuid,
  p_cash_session_id uuid,
  p_cash_account_id uuid,
  p_payments jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_context record; v_claim record; v_order public.pdv_orders%ROWTYPE;
  v_terminal public.pdv_terminals%ROWTYPE; v_session public.pdv_cash_sessions%ROWTYPE;
  v_customer public.customers%ROWTYPE; v_payments jsonb; v_payment jsonb;
  v_account_ids uuid[]; v_account_id uuid; v_settlement_id uuid;
  v_receivable_id uuid; v_method text; v_amount numeric(14,2); v_due_date date;
  v_payment_total numeric(14,2):=0; v_fiado_total numeric(14,2):=0;
  v_open_credit numeric(14,2):=0; v_all_settled boolean; v_today date;
  v_result jsonb; v_payload jsonb; v_item record;
  v_reservation public.pdv_stock_reservation_items%ROWTYPE;
  v_reserved numeric; v_missing numeric; v_physical numeric; v_guaranteed numeric;
BEGIN
  SELECT * INTO v_context
    FROM public.pdv_counter_context_v2('screen:pdv','fn:cover_pdv_order',true);
  v_today:=public.company_today(v_context.company_id);
  IF p_order_id IS NULL OR p_terminal_id IS NULL OR p_cash_session_id IS NULL
     OR p_cash_account_id IS NULL OR p_payments IS NULL
     OR jsonb_typeof(p_payments)<>'array' OR jsonb_array_length(p_payments)>6 THEN
    RAISE EXCEPTION 'Informe pedido, caixa e coberturas válidas.'
      USING ERRCODE='22023',DETAIL='code=pdv_counter_coverage_payload_invalid';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_payments) payment
     WHERE jsonb_typeof(payment)<>'object'
        OR NOT(payment?'method') OR NOT(payment?'amount')
        OR (payment-ARRAY['method','amount','account_id','due_date']::text[])<>'{}'::jsonb
        OR lower(btrim(COALESCE(payment->>'amount',''))) IN('nan','infinity','-infinity')
  ) THEN
    RAISE EXCEPTION 'Revise as formas e os valores da cobertura.'
      USING ERRCODE='22023',DETAIL='code=pdv_counter_coverage_shape_invalid';
  END IF;
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'method',lower(btrim(payment->>'method')),
      'amount',round(NULLIF(payment->>'amount','')::numeric,2),
      'account_id',NULLIF(payment->>'account_id','')::uuid,
      'due_date',NULLIF(payment->>'due_date','')::date
    ) ORDER BY lower(btrim(payment->>'method')),
      NULLIF(payment->>'account_id','')::uuid NULLS FIRST,
      NULLIF(payment->>'due_date','')::date NULLS FIRST),'[]'::jsonb)
      INTO v_payments FROM jsonb_array_elements(p_payments) payment;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Revise as formas e os valores da cobertura.'
      USING ERRCODE='22023',DETAIL='code=pdv_counter_coverage_value_invalid';
  END;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_payments) payment
     WHERE payment->>'method' NOT IN('dinheiro','pix','transferencia','debito','credito','fiado')
        OR NULLIF(payment->>'amount','')::numeric IS NULL
        OR NULLIF(payment->>'amount','')::numeric<=0
        OR NULLIF(payment->>'amount','')::numeric<>round(NULLIF(payment->>'amount','')::numeric,2)
        OR lower(payment->>'amount') IN('nan','infinity','-infinity')
        OR (payment->>'method' IN('pix','transferencia') AND NULLIF(payment->>'account_id','')::uuid IS NULL)
        OR (payment->>'method' NOT IN('pix','transferencia') AND NULLIF(payment->>'account_id','')::uuid IS NOT NULL)
        OR (payment->>'method'<>'fiado' AND payment->>'due_date' IS NOT NULL)
  ) OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_payments) payment
    GROUP BY payment->>'method' HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'Revise as formas, contas e vencimentos da cobertura.'
      USING ERRCODE='22023',DETAIL='code=pdv_counter_coverage_invalid';
  END IF;

  SELECT array_agg(account_id ORDER BY account_id) INTO v_account_ids FROM(
    SELECT p_cash_account_id account_id UNION
    SELECT NULLIF(payment->>'account_id','')::uuid
      FROM jsonb_array_elements(v_payments) payment
     WHERE NULLIF(payment->>'account_id','')::uuid IS NOT NULL
  ) accounts;
  PERFORM public.pdv_lock_treasury_accounts(v_context.company_id,v_account_ids);

  v_payload:=jsonb_build_object(
    'order_id',p_order_id,'terminal_id',p_terminal_id,
    'cash_session_id',p_cash_session_id,'cash_account_id',p_cash_account_id,
    'payments',v_payments
  );
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(
    v_context.company_id,'counter.cover.v2',p_idempotency_key,v_payload
  );
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN
      RETURN v_claim.stored_result||jsonb_build_object('idempotent',true);
    END IF;
    RAISE EXCEPTION 'Esta cobertura já está sendo processada.'
      USING ERRCODE='55000',DETAIL='code=pdv_counter_coverage_in_progress';
  END IF;

  SELECT order_row.* INTO v_order FROM public.pdv_orders order_row
   WHERE order_row.id=p_order_id AND order_row.company_id=v_context.company_id
   FOR UPDATE;
  IF NOT FOUND OR v_order.contract_version IS DISTINCT FROM 2
     OR v_order.operation_mode_snapshot<>'counter'
     OR v_order.status<>'aguardando_pagamento' THEN
    RAISE EXCEPTION 'Este pedido não está aguardando cobertura no caixa.'
      USING ERRCODE='23514',DETAIL='code=pdv_counter_order_not_coverable';
  END IF;
  IF v_order.stock_id IS NULL
     OR public.can_access_stock(v_context.user_id,v_order.stock_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O local deste pedido não está acessível.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_stock_denied';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_order_payments payment
             WHERE payment.order_id=v_order.id) THEN
    RAISE EXCEPTION 'Este pedido já possui cobertura registrada.'
      USING ERRCODE='23514',DETAIL='code=pdv_counter_order_already_covered';
  END IF;
  SELECT terminal.* INTO v_terminal FROM public.pdv_terminals terminal
   WHERE terminal.id=p_terminal_id AND terminal.company_id=v_context.company_id
     AND terminal.is_active IS TRUE FOR UPDATE;
  IF NOT FOUND OR v_terminal.stock_id IS DISTINCT FROM v_order.stock_id
     OR public.can_access_stock(v_context.user_id,v_terminal.stock_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Use um terminal ativo do mesmo local do pedido.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_terminal_invalid';
  END IF;
  SELECT session.* INTO v_session FROM public.pdv_cash_sessions session
   WHERE session.id=p_cash_session_id AND session.company_id=v_context.company_id
     AND session.terminal_id=p_terminal_id AND session.cash_account_id=p_cash_account_id
     AND session.contract_version=2 AND session.status='aberta' FOR UPDATE;
  IF NOT FOUND OR (v_session.opened_by IS DISTINCT FROM v_context.user_id
      AND NOT public.is_admin_or_gestor(v_context.user_id)
      AND NOT public.is_super_admin(v_context.user_id)) THEN
    RAISE EXCEPTION 'Use um caixa v2 aberto por você neste terminal.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_session_invalid';
  END IF;

  SELECT round(COALESCE(sum(NULLIF(payment->>'amount','')::numeric),0),2),
         round(COALESCE(sum(NULLIF(payment->>'amount','')::numeric)
           FILTER(WHERE payment->>'method'='fiado'),0),2)
    INTO v_payment_total,v_fiado_total FROM jsonb_array_elements(v_payments) payment;
  IF (v_order.total=0 AND jsonb_array_length(v_payments)<>0)
     OR (v_order.total>0 AND (jsonb_array_length(v_payments)=0 OR v_payment_total<>v_order.total)) THEN
    RAISE EXCEPTION 'A soma das coberturas deve ser igual ao total do pedido.'
      USING ERRCODE='23514',DETAIL='code=pdv_counter_coverage_mismatch';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_payments) payment
             WHERE payment->>'method' IN('pix','transferencia'))
     AND NOT(public.is_admin_or_gestor(v_context.user_id)
       OR public.is_super_admin(v_context.user_id)
       OR public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:use_bank_accounts')) THEN
    RAISE EXCEPTION 'Você não tem permissão para receber em conta bancária.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_bank_forbidden';
  END IF;
  IF v_fiado_total>0 THEN
    IF v_order.customer_id IS NULL THEN
      RAISE EXCEPTION 'Venda no fiado exige cliente identificado.'
        USING ERRCODE='23502',DETAIL='code=pdv_counter_credit_customer_required';
    END IF;
    IF NOT public.is_admin_or_gestor(v_context.user_id)
       AND NOT public.is_super_admin(v_context.user_id)
       AND public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:approve_pdv_credit') IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Você não tem permissão para aprovar venda no fiado.'
        USING ERRCODE='42501',DETAIL='code=pdv_counter_credit_forbidden';
    END IF;
    SELECT customer.* INTO v_customer FROM public.customers customer
     WHERE customer.id=v_order.customer_id AND customer.company_id=v_context.company_id
       AND customer.is_deleted IS FALSE FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente não encontrado nesta empresa.'
        USING ERRCODE='42501',DETAIL='code=pdv_counter_customer_invalid';
    END IF;
    SELECT round(COALESCE(sum(statement.amount),0),2) INTO v_open_credit
      FROM public.pdv_customer_credit_statement_v2(v_order.customer_id) statement;
    IF v_customer.credit_limit IS NULL OR v_open_credit+v_fiado_total>v_customer.credit_limit THEN
      RAISE EXCEPTION 'O limite disponível do cliente não cobre este pedido.'
        USING ERRCODE='23514',DETAIL='code=pdv_counter_credit_limit_exceeded';
    END IF;
  ELSIF v_order.customer_id IS NOT NULL THEN
    PERFORM 1 FROM public.customers customer
     WHERE customer.id=v_order.customer_id AND customer.company_id=v_context.company_id
       AND customer.is_deleted IS FALSE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente não encontrado nesta empresa.'
        USING ERRCODE='42501',DETAIL='code=pdv_counter_customer_invalid';
    END IF;
  END IF;

  -- A cobertura do caixa e a fronteira atomica que garante o estoque do
  -- pedido comum. Reservas antecipadas transferidas do pre-pedido sao
  -- preservadas e apenas o residual faltante e completado.
  PERFORM item.id FROM public.pdv_order_items item
   WHERE item.order_id=v_order.id ORDER BY item.id FOR UPDATE OF item;
  IF EXISTS(
    SELECT 1 FROM public.pdv_order_items item
     WHERE item.order_id=v_order.id AND (
       item.contract_version IS DISTINCT FROM 2
       OR item.item_type IS NULL
       OR (item.item_type='material' AND item.inventory_id IS NULL)
     )
  ) THEN
    RAISE EXCEPTION 'Os itens deste pedido não estão preparados para reserva.'
      USING ERRCODE='23514',DETAIL='code=pdv_counter_items_not_reservable';
  END IF;
  PERFORM inventory_row.id FROM public.inventory inventory_row
   WHERE inventory_row.company_id=v_context.company_id AND EXISTS(
     SELECT 1 FROM public.pdv_order_items item
      WHERE item.order_id=v_order.id AND item.item_type='material'
        AND item.inventory_id=inventory_row.id
   ) ORDER BY inventory_row.id FOR UPDATE OF inventory_row;
  PERFORM stock.id FROM public.stocks stock
   WHERE stock.id=v_order.stock_id AND stock.company_id=v_context.company_id
   FOR UPDATE OF stock;
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity)
  SELECT v_context.company_id,item.inventory_id,v_order.stock_id,0
    FROM public.pdv_order_items item
   WHERE item.order_id=v_order.id AND item.item_type='material'
  ON CONFLICT(inventory_id,stock_id) DO NOTHING;
  PERFORM level.id FROM public.inventory_stock_levels level
   WHERE level.company_id=v_context.company_id AND level.stock_id=v_order.stock_id
     AND EXISTS(
       SELECT 1 FROM public.pdv_order_items item
        WHERE item.order_id=v_order.id AND item.item_type='material'
          AND item.inventory_id=level.inventory_id
     )
   ORDER BY level.inventory_id,level.stock_id FOR UPDATE OF level;
  PERFORM reservation.id FROM public.pdv_stock_reservation_items reservation
   WHERE reservation.company_id=v_context.company_id
     AND reservation.stock_id=v_order.stock_id
     AND EXISTS(
       SELECT 1 FROM public.pdv_order_items item
        WHERE item.order_id=v_order.id AND item.id=reservation.order_item_id
     )
     AND reservation.state IN('guaranteed','conflict')
   ORDER BY reservation.inventory_id,reservation.stock_id,reservation.id
   FOR UPDATE OF reservation;

  FOR v_item IN
    SELECT item.* FROM public.pdv_order_items item
     WHERE item.order_id=v_order.id AND item.item_type='material'
     ORDER BY item.inventory_id,item.id
  LOOP
    v_reservation:=NULL; v_reserved:=0;
    SELECT reservation.* INTO v_reservation
      FROM public.pdv_stock_reservation_items reservation
     WHERE reservation.company_id=v_context.company_id
       AND reservation.order_item_id=v_item.id
       AND reservation.stock_id=v_order.stock_id
       AND reservation.state IN('guaranteed','conflict')
     FOR UPDATE;
    IF FOUND AND v_reservation.state='conflict' THEN
      RAISE EXCEPTION 'O estoque deste pedido precisa ser reconciliado antes da cobertura.'
        USING ERRCODE='23514',DETAIL='code=pdv_counter_reservation_conflict';
    END IF;
    IF FOUND THEN
      v_reserved:=v_reservation.reserved_quantity-v_reservation.consumed_quantity
        -v_reservation.released_quantity-v_reservation.shortage_quantity;
    END IF;
    v_missing:=v_item.quantity-COALESCE(v_reserved,0);
    IF v_missing>0 THEN
      SELECT level.quantity INTO v_physical
        FROM public.inventory_stock_levels level
       WHERE level.company_id=v_context.company_id
         AND level.inventory_id=v_item.inventory_id
         AND level.stock_id=v_order.stock_id
       FOR UPDATE;
      SELECT COALESCE(sum(reservation.reserved_quantity-reservation.consumed_quantity
        -reservation.released_quantity-reservation.shortage_quantity),0)
        INTO v_guaranteed
        FROM public.pdv_stock_reservation_items reservation
       WHERE reservation.company_id=v_context.company_id
         AND reservation.inventory_id=v_item.inventory_id
         AND reservation.stock_id=v_order.stock_id
         AND reservation.state IN('guaranteed','conflict');
      IF EXISTS(
        SELECT 1 FROM public.pdv_stock_reservation_items reservation
         WHERE reservation.company_id=v_context.company_id
           AND reservation.inventory_id=v_item.inventory_id
           AND reservation.stock_id=v_order.stock_id
           AND reservation.state='conflict'
      ) OR COALESCE(v_physical,0)-v_guaranteed<v_missing THEN
        RAISE EXCEPTION 'O estoque disponível não cobre todos os materiais deste pedido.'
          USING ERRCODE='23514',DETAIL='code=pdv_counter_stock_insufficient';
      END IF;
      IF v_reservation.id IS NULL THEN
        SELECT reservation.* INTO v_reservation
          FROM public.pdv_reserve_stock_internal_v2(
            v_context.company_id,v_item.inventory_id,v_order.stock_id,
            v_item.id,NULL,v_missing,'coverage',NULL,1
          ) reservation;
      ELSE
        UPDATE public.pdv_stock_reservation_items reservation
           SET reserved_quantity=reservation.reserved_quantity+v_missing,
               updated_at=now()
         WHERE reservation.id=v_reservation.id
         RETURNING reservation.* INTO v_reservation;
      END IF;
    END IF;
  END LOOP;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(v_payments) LOOP
    v_method:=v_payment->>'method'; v_amount:=(v_payment->>'amount')::numeric;
    v_account_id:=NULLIF(v_payment->>'account_id','')::uuid;
    v_settlement_id:=NULL; v_receivable_id:=NULL;
    IF v_method IN('dinheiro','pix','transferencia') THEN
      v_account_id:=CASE WHEN v_method='dinheiro' THEN p_cash_account_id ELSE v_account_id END;
      IF v_method<>'dinheiro' AND NOT EXISTS(
        SELECT 1 FROM public.financial_accounts account
         WHERE account.id=v_account_id AND account.company_id=v_context.company_id
           AND account.is_active IS TRUE AND account.type='banco'
      ) THEN
        RAISE EXCEPTION 'A conta bancária da cobertura não está disponível.'
          USING ERRCODE='42501',DETAIL='code=pdv_counter_bank_invalid';
      END IF;
      v_settlement_id:=public.pdv_create_receivable_financial_v2(
        v_context.company_id,v_context.user_id,v_order.customer_id,v_account_id,
        CASE WHEN v_method='dinheiro' THEN p_cash_session_id ELSE NULL END,
        v_method,v_amount,v_today,'Cobertura do pedido PDV nº '||v_order.number::text,
        v_claim.request_id,false
      );
      INSERT INTO public.pdv_order_payments(
        company_id,order_id,method,amount,change_amount,financial_account_id,
        created_by,contract_version,coverage_kind,coverage_status,
        settlement_status,settlement_transaction_id,authorized_at,settled_at
      ) VALUES(
        v_context.company_id,v_order.id,v_method,v_amount,0,v_account_id,
        v_context.user_id,2,CASE v_method WHEN 'dinheiro' THEN 'cash'
          WHEN 'transferencia' THEN 'transfer' ELSE v_method END,
        'authorized','settled',v_settlement_id,now(),now()
      );
    ELSIF v_method IN('debito','credito') THEN
      INSERT INTO public.pdv_order_payments(
        company_id,order_id,method,amount,change_amount,created_by,
        contract_version,coverage_kind,coverage_status,settlement_status,authorized_at
      ) VALUES(
        v_context.company_id,v_order.id,v_method,v_amount,0,v_context.user_id,
        2,'card_authorization','authorized','open',now()
      );
    ELSE
      v_due_date:=COALESCE(NULLIF(v_payment->>'due_date','')::date,(v_today+interval '1 month')::date);
      IF v_due_date<v_today THEN
        RAISE EXCEPTION 'O vencimento do fiado não pode estar no passado.'
          USING ERRCODE='22023',DETAIL='code=pdv_counter_due_date_invalid';
      END IF;
      INSERT INTO public.financial_transactions(
        company_id,transaction_type,description,amount,category,transaction_date,
        due_date,is_paid,customer_id,origin,payment_method,created_by,
        pdv_financial_role,pdv_settlement_group_id
      ) VALUES(
        v_context.company_id,'entrada'::public.transaction_type,
        'Venda no fiado, pedido PDV nº '||v_order.number::text,v_amount,
        'Venda no fiado',v_today,v_due_date,false,v_order.customer_id,'pdv','fiado',
        v_context.user_id,'pdv_receivable_principal',v_claim.request_id
      ) RETURNING id INTO v_receivable_id;
      INSERT INTO public.pdv_order_payments(
        company_id,order_id,method,amount,change_amount,created_by,
        contract_version,coverage_kind,coverage_status,settlement_status,
        receivable_transaction_id,authorized_at
      ) VALUES(
        v_context.company_id,v_order.id,'fiado',v_amount,0,v_context.user_id,
        2,'receivable','authorized','open',v_receivable_id,now()
      );
    END IF;
  END LOOP;

  v_all_settled:=v_order.total=0 OR NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_payments) payment
     WHERE payment->>'method' IN('debito','credito','fiado')
  );
  UPDATE public.pdv_orders SET
    terminal_id=p_terminal_id,cash_session_id=p_cash_session_id,
    status='liberado_retirada',paid_at=CASE WHEN v_all_settled THEN now() ELSE NULL END,
    updated_at=now()
  WHERE id=v_order.id RETURNING * INTO v_order;
  v_result:=jsonb_build_object(
    'order_id',v_order.id,'order_number',v_order.number,'status',v_order.status,
    'paid_at',v_order.paid_at,'idempotent',false
  );
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_order',v_order.id,v_result);
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_list_cash_queue_v2()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_context record;
BEGIN
  SELECT * INTO v_context
    FROM public.pdv_counter_context_v2('screen:pdv','fn:cover_pdv_order',true);
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(queue_row)
    ORDER BY queue_row.created_at,queue_row.id)
  FROM (
    SELECT order_row.id,order_row.number,order_row.customer_id,
      customer.name AS customer_name,order_row.stock_id,stock.name AS stock_name,
      order_row.total,order_row.status,order_row.created_at,
      NOT EXISTS(
        SELECT 1 FROM public.pdv_order_items item
         WHERE item.order_id=order_row.id AND item.item_type='material'
           AND COALESCE((SELECT sum(reservation.reserved_quantity-reservation.consumed_quantity
             -reservation.released_quantity-reservation.shortage_quantity)
             FROM public.pdv_stock_reservation_items reservation
            WHERE reservation.order_item_id=item.id AND reservation.state='guaranteed'),0)<item.quantity
      ) AS reservation_ready
    FROM public.pdv_orders order_row
    LEFT JOIN public.customers customer
      ON customer.id=order_row.customer_id AND customer.company_id=order_row.company_id
    JOIN public.stocks stock
      ON stock.id=order_row.stock_id AND stock.company_id=order_row.company_id
    WHERE order_row.company_id=v_context.company_id AND order_row.contract_version=2
      AND order_row.operation_mode_snapshot='counter' AND order_row.status='aguardando_pagamento'
      AND public.can_access_stock(v_context.user_id,order_row.stock_id)
    ORDER BY order_row.created_at,order_row.id
    LIMIT 200
  ) queue_row),'[]'::jsonb);
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_list_dispatch_queue_v2()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_context record;
BEGIN
  SELECT * INTO v_context
    FROM public.pdv_counter_context_v2('screen:pdv_dispatch',NULL,true);
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(queue_row)
    ORDER BY queue_row.released_at,queue_row.id)
  FROM (
    SELECT order_row.id,order_row.number,customer.name AS recipient_name,
      order_row.stock_id,stock.name AS stock_name,order_row.status,
      order_row.updated_at AS released_at,
      (SELECT count(*) FROM public.pdv_order_items item
        WHERE item.order_id=order_row.id
          AND item.quantity>COALESCE((SELECT sum(delivery_item.quantity)
            FROM public.pdv_delivery_items delivery_item
           WHERE delivery_item.order_item_id=item.id),0)) AS remaining_items
    FROM public.pdv_orders order_row
    LEFT JOIN public.customers customer
      ON customer.id=order_row.customer_id AND customer.company_id=order_row.company_id
    JOIN public.stocks stock
      ON stock.id=order_row.stock_id AND stock.company_id=order_row.company_id
    WHERE order_row.company_id=v_context.company_id AND order_row.contract_version=2
      AND order_row.operation_mode_snapshot='counter'
      AND order_row.status IN('liberado_retirada','retirada_parcial')
      AND public.can_access_stock(v_context.user_id,order_row.stock_id)
    ORDER BY order_row.updated_at,order_row.id
    LIMIT 200
  ) queue_row),'[]'::jsonb);
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_get_dispatch_order_v2(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_context record; v_order public.pdv_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_context
    FROM public.pdv_counter_context_v2('screen:pdv_dispatch',NULL,true);
  SELECT order_row.* INTO v_order FROM public.pdv_orders order_row
   WHERE order_row.id=p_order_id AND order_row.company_id=v_context.company_id
     AND order_row.contract_version=2 AND order_row.operation_mode_snapshot='counter'
     AND order_row.status IN('liberado_retirada','retirada_parcial','entregue');
  IF NOT FOUND OR v_order.stock_id IS NULL
     OR public.can_access_stock(v_context.user_id,v_order.stock_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Pedido não encontrado na expedição.'
      USING ERRCODE='42501',DETAIL='code=pdv_dispatch_order_denied';
  END IF;
  RETURN jsonb_build_object(
    'order',jsonb_build_object('id',v_order.id,'number',v_order.number,
      'status',v_order.status,
      'customer',(SELECT CASE WHEN customer.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id',customer.id,'name',customer.name) END FROM public.customers customer
        WHERE customer.id=v_order.customer_id AND customer.company_id=v_context.company_id),
      'stock',(SELECT jsonb_build_object('id',stock.id,'name',stock.name)
        FROM public.stocks stock WHERE stock.id=v_order.stock_id)),
    'items',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',item.id,'description',item.description,'item_type',item.item_type,
      'unit',item.unit,'ordered_quantity',item.quantity,
      'delivered_quantity',COALESCE((SELECT sum(delivery_item.quantity)
        FROM public.pdv_delivery_items delivery_item WHERE delivery_item.order_item_id=item.id),0),
      'remaining_quantity',item.quantity-COALESCE((SELECT sum(delivery_item.quantity)
        FROM public.pdv_delivery_items delivery_item WHERE delivery_item.order_item_id=item.id),0),
      'reservations',CASE WHEN item.item_type='material' THEN(SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',reservation.id,'stock_id',reservation.stock_id,
        'available_quantity',GREATEST(reservation.reserved_quantity-reservation.consumed_quantity
          -reservation.released_quantity-reservation.shortage_quantity,0),
        'has_conflict',reservation.state='conflict'
      ) ORDER BY reservation.id),'[]'::jsonb) FROM public.pdv_stock_reservation_items reservation
       WHERE reservation.order_item_id=item.id AND reservation.state IN('guaranteed','conflict')
         AND public.can_access_stock(v_context.user_id,reservation.stock_id)) ELSE '[]'::jsonb END
    ) ORDER BY item.sort_order,item.id),'[]'::jsonb)
      FROM public.pdv_order_items item WHERE item.order_id=v_order.id)
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_capture_delivery_receipt_internal_v2(
  p_company_id uuid,p_delivery_id uuid,p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,extensions
AS $fn$
DECLARE v_delivery public.pdv_deliveries%ROWTYPE; v_order public.pdv_orders%ROWTYPE;
  v_snapshot jsonb; v_snapshot_id uuid;
BEGIN
  SELECT snapshot.id INTO v_snapshot_id FROM public.pdv_delivery_receipt_snapshots snapshot
   WHERE snapshot.company_id=p_company_id AND snapshot.delivery_id=p_delivery_id;
  IF FOUND THEN RETURN v_snapshot_id; END IF;
  SELECT delivery.* INTO v_delivery FROM public.pdv_deliveries delivery
   WHERE delivery.id=p_delivery_id AND delivery.company_id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Retirada não encontrada para gerar comprovante.'
      USING ERRCODE='P0002',DETAIL='code=pdv_delivery_receipt_delivery_missing';
  END IF;
  SELECT order_row.* INTO v_order FROM public.pdv_orders order_row
   WHERE order_row.id=v_delivery.order_id AND order_row.company_id=p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido da retirada não encontrado.'
      USING ERRCODE='P0002',DETAIL='code=pdv_delivery_receipt_order_missing';
  END IF;
  SELECT jsonb_build_object(
    'kind','withdrawal_non_fiscal','delivery_id',v_delivery.id,
    'withdrawn_at',v_delivery.created_at,
    'order',jsonb_build_object('id',v_order.id,'number',v_order.number,'status',v_order.status),
    'customer_name',customer.name,'stock_name',stock.name,
    'items',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'description',item.description,'unit',item.unit,'quantity',delivery_item.quantity,
      'remaining_quantity',item.quantity-(SELECT COALESCE(sum(all_delivery.quantity),0)
        FROM public.pdv_delivery_items all_delivery WHERE all_delivery.order_item_id=item.id)
    ) ORDER BY item.sort_order,item.id),'[]'::jsonb)
      FROM public.pdv_delivery_items delivery_item
      JOIN public.pdv_order_items item ON item.id=delivery_item.order_item_id
     WHERE delivery_item.delivery_id=v_delivery.id),
    'notice','Comprovante não fiscal de retirada. Reimprimir não altera estoque ou pagamento.'
  ) INTO v_snapshot
  FROM public.stocks stock
  LEFT JOIN public.customers customer ON customer.id=v_order.customer_id AND customer.company_id=p_company_id
  WHERE stock.id=v_order.stock_id AND stock.company_id=p_company_id;
  IF v_snapshot IS NULL OR jsonb_array_length(v_snapshot->'items')=0 THEN
    RAISE EXCEPTION 'A retirada não possui itens para o comprovante.'
      USING ERRCODE='23514',DETAIL='code=pdv_delivery_receipt_items_missing';
  END IF;
  INSERT INTO public.pdv_delivery_receipt_snapshots(
    company_id,delivery_id,order_id,snapshot,snapshot_hash,created_by
  ) VALUES(
    p_company_id,p_delivery_id,v_order.id,v_snapshot,
    encode(extensions.digest(convert_to(v_snapshot::text,'UTF8'),'sha256'),'hex'),p_user_id
  ) RETURNING id INTO v_snapshot_id;
  RETURN v_snapshot_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_complete_dispatch_delivery_v2(
  p_order_id uuid,p_lines jsonb,p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_context record; v_claim record; v_order public.pdv_orders%ROWTYPE;
  v_lines jsonb; v_delivery jsonb; v_delivery_id uuid; v_result jsonb; v_remaining integer;
  v_settlement uuid; v_snapshot_id uuid;
BEGIN
  SELECT * INTO v_context FROM public.pdv_counter_context_v2(
    'screen:pdv_dispatch','fn:deliver_pdv_order',true
  );
  IF p_order_id IS NULL OR p_lines IS NULL OR jsonb_typeof(p_lines)<>'array'
     OR jsonb_array_length(p_lines)=0 OR jsonb_array_length(p_lines)>100 THEN
    RAISE EXCEPTION 'Informe os itens desta retirada.'
      USING ERRCODE='22023',DETAIL='code=pdv_dispatch_payload_invalid';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_lines) line
     WHERE jsonb_typeof(line)<>'object'
        OR NOT(line?'order_item_id') OR NOT(line?'quantity')
        OR (line-ARRAY['order_item_id','reservation_id','quantity']::text[])<>'{}'::jsonb
        OR lower(btrim(COALESCE(line->>'quantity',''))) IN('nan','infinity','-infinity')
  ) THEN
    RAISE EXCEPTION 'Revise os itens e as quantidades desta retirada.'
      USING ERRCODE='22023',DETAIL='code=pdv_dispatch_line_invalid';
  END IF;
  BEGIN
    SELECT jsonb_agg(jsonb_build_object(
      'order_item_id',NULLIF(line->>'order_item_id','')::uuid,
      'reservation_id',NULLIF(line->>'reservation_id','')::uuid,
      'quantity',trim_scale(NULLIF(line->>'quantity','')::numeric)
    ) ORDER BY NULLIF(line->>'order_item_id','')::uuid,
      NULLIF(line->>'reservation_id','')::uuid NULLS FIRST)
      INTO v_lines FROM jsonb_array_elements(p_lines) line;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Revise os itens e as quantidades desta retirada.'
      USING ERRCODE='22023',DETAIL='code=pdv_dispatch_line_invalid';
  END;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_lines) line
     WHERE NULLIF(line->>'order_item_id','')::uuid IS NULL
        OR NULLIF(line->>'quantity','')::numeric IS NULL
        OR NULLIF(line->>'quantity','')::numeric<=0
        OR lower(line->>'quantity') IN('nan','infinity','-infinity')
  ) OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_lines) line
     GROUP BY NULLIF(line->>'order_item_id','')::uuid HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'Revise os itens e as quantidades desta retirada.'
      USING ERRCODE='22023',DETAIL='code=pdv_dispatch_line_invalid';
  END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(
    v_context.company_id,'dispatch.deliver.v2',p_idempotency_key,
    jsonb_build_object('order_id',p_order_id,'lines',v_lines)
  );
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN
      RETURN v_claim.stored_result||jsonb_build_object('idempotent',true);
    END IF;
    RAISE EXCEPTION 'Esta retirada já está sendo processada.'
      USING ERRCODE='55000',DETAIL='code=pdv_dispatch_in_progress';
  END IF;
  SELECT order_row.* INTO v_order FROM public.pdv_orders order_row
   WHERE order_row.id=p_order_id AND order_row.company_id=v_context.company_id
   FOR UPDATE;
  IF NOT FOUND OR v_order.contract_version IS DISTINCT FROM 2
     OR v_order.operation_mode_snapshot<>'counter'
     OR v_order.status NOT IN('liberado_retirada','retirada_parcial') THEN
    RAISE EXCEPTION 'Este pedido não está liberado para retirada.'
      USING ERRCODE='23514',DETAIL='code=pdv_dispatch_order_not_ready';
  END IF;
  IF v_order.stock_id IS NULL
     OR public.can_access_stock(v_context.user_id,v_order.stock_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O local deste pedido não está acessível.'
      USING ERRCODE='42501',DETAIL='code=pdv_dispatch_stock_denied';
  END IF;
  IF round(COALESCE((SELECT sum(payment.amount) FROM public.pdv_order_payments payment
      WHERE payment.order_id=v_order.id AND payment.contract_version=2
        AND payment.coverage_status='authorized'),0),2)<>round(v_order.total,2) THEN
    RAISE EXCEPTION 'A cobertura do pedido não está completa.'
      USING ERRCODE='23514',DETAIL='code=pdv_dispatch_coverage_incomplete';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_lines) line
    LEFT JOIN public.pdv_order_items item
      ON item.id=NULLIF(line->>'order_item_id','')::uuid
     AND item.order_id=v_order.id AND item.company_id=v_context.company_id
    LEFT JOIN public.pdv_stock_reservation_items reservation
      ON reservation.id=NULLIF(line->>'reservation_id','')::uuid
     AND reservation.company_id=v_context.company_id
     AND reservation.order_item_id=item.id
     AND reservation.stock_id=v_order.stock_id
     AND reservation.inventory_id=item.inventory_id
     AND reservation.state IN('guaranteed','conflict')
   WHERE item.id IS NULL
      OR (item.item_type='material' AND reservation.id IS NULL)
      OR (item.item_type<>'material' AND NULLIF(line->>'reservation_id','')::uuid IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Uma reserva informada não pertence a este pedido e local.'
      USING ERRCODE='23514',DETAIL='code=pdv_dispatch_reservation_scope_invalid';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_lines) line
    JOIN public.pdv_stock_reservation_items reservation
      ON reservation.id=NULLIF(line->>'reservation_id','')::uuid
   WHERE reservation.company_id=v_context.company_id
     AND public.can_access_stock(v_context.user_id,reservation.stock_id) IS DISTINCT FROM true
  ) THEN
    RAISE EXCEPTION 'Uma reserva informada pertence a um local sem acesso.'
      USING ERRCODE='42501',DETAIL='code=pdv_dispatch_reservation_stock_denied';
  END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_lines) line
    JOIN public.pdv_stock_reservation_items reservation
      ON reservation.id=NULLIF(line->>'reservation_id','')::uuid
   WHERE reservation.company_id=v_context.company_id
     AND reservation.order_item_id=NULLIF(line->>'order_item_id','')::uuid
     AND (reservation.state='conflict' OR reservation.shortage_quantity>0)
  ) THEN
    RAISE EXCEPTION 'A retirada está bloqueada porque o estoque deste material precisa ser reconciliado.'
      USING ERRCODE='23514',DETAIL='code=pdv_dispatch_reservation_conflict';
  END IF;
  v_delivery:=public.pdv_complete_delivery_internal_v2(
    v_context.company_id,v_order.id,v_claim.request_id,v_lines
  );
  v_delivery_id:=(v_delivery->>'delivery_id')::uuid;
  FOR v_settlement IN SELECT DISTINCT payment.settlement_transaction_id
    FROM public.pdv_order_payments payment
   WHERE payment.order_id=v_order.id AND payment.contract_version=2
     AND payment.settlement_status='settled' AND payment.settlement_transaction_id IS NOT NULL
  LOOP
    PERFORM public.pdv_apply_settlement_fifo_v2(v_context.company_id,v_settlement);
  END LOOP;
  SELECT count(*) INTO v_remaining FROM public.pdv_order_items item
   WHERE item.order_id=v_order.id
     AND item.quantity>COALESCE((SELECT sum(delivery_item.quantity)
       FROM public.pdv_delivery_items delivery_item WHERE delivery_item.order_item_id=item.id),0);
  UPDATE public.pdv_orders SET
    status=CASE WHEN v_remaining=0 THEN 'entregue' ELSE 'retirada_parcial' END,
    delivered_at=CASE WHEN v_remaining=0 THEN now() ELSE NULL END,
    stock_committed_at=CASE WHEN v_remaining=0 THEN now() ELSE NULL END,
    updated_at=now()
  WHERE id=v_order.id RETURNING * INTO v_order;
  v_snapshot_id:=public.pdv_capture_delivery_receipt_internal_v2(
    v_context.company_id,v_delivery_id,v_context.user_id
  );
  v_result:=jsonb_build_object(
    'order_id',v_order.id,'delivery_id',v_delivery_id,'receipt_snapshot_id',v_snapshot_id,
    'status',v_order.status,'remaining_items',v_remaining,'idempotent',false
  );
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_delivery',v_delivery_id,v_result);
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_get_delivery_receipt_snapshot_v2(p_delivery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public,extensions
AS $fn$
DECLARE v_context record; v_row public.pdv_delivery_receipt_snapshots%ROWTYPE;
BEGIN
  SELECT * INTO v_context
    FROM public.pdv_counter_context_v2('screen:pdv_dispatch',NULL,true);
  IF public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_delivery_id => p_delivery_id
     ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem acesso ao local de estoque desta retirada.'
      USING ERRCODE='42501',DETAIL='code=pdv_delivery_receipt_stock_denied';
  END IF;
  SELECT snapshot.* INTO v_row FROM public.pdv_delivery_receipt_snapshots snapshot
   WHERE snapshot.company_id=v_context.company_id AND snapshot.delivery_id=p_delivery_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O comprovante desta retirada não está disponível.'
      USING ERRCODE='P0002',DETAIL='code=pdv_delivery_receipt_not_found';
  END IF;
  IF v_row.snapshot_hash<>encode(extensions.digest(convert_to(v_row.snapshot::text,'UTF8'),'sha256'),'hex') THEN
    RAISE EXCEPTION 'O comprovante salvo requer revisão.'
      USING ERRCODE='55000',DETAIL='code=pdv_delivery_receipt_integrity_failed';
  END IF;
  RETURN v_row.snapshot;
END
$fn$;

DO $patch_reset_system_step$
DECLARE v_oid regprocedure; v_src text; v_anchor text; v_insert text;
BEGIN
  SELECT procedure.oid::regprocedure,pg_get_functiondef(procedure.oid)
    INTO v_oid,v_src
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
   WHERE namespace.nspname='public' AND procedure.proname='reset_system_step'
     AND pg_get_function_identity_arguments(procedure.oid)=
       'p_company_id uuid, p_step text, p_audit_id uuid';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'reset_system_step não encontrada'; END IF;
  IF position('PDV_COUNTER_DISPATCH_RESET_V2' in v_src)=0 THEN
    v_anchor:='DELETE FROM public.pdv_orders WHERE company_id = p_company_id;';
    v_insert:='-- PDV_COUNTER_DISPATCH_RESET_V2'||chr(10)
      ||'    DELETE FROM public.pdv_operation_requests request'||chr(10)
      ||'     WHERE request.company_id = p_company_id'||chr(10)
      ||'       AND request.operation_type IN (''counter.cover.v2'', ''dispatch.deliver.v2'');'||chr(10)
      ||'    '||v_anchor;
    IF position(v_anchor in v_src)=0 THEN
      RAISE EXCEPTION 'Âncora do reset PDV mudou';
    END IF;
    v_src:=replace(v_src,v_anchor,v_insert);
    EXECUTE v_src;
  END IF;
END
$patch_reset_system_step$;

REVOKE ALL ON FUNCTION public.pdv_guard_delivery_receipt_snapshot_v2()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_counter_context_v2(text,text,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_capture_delivery_receipt_internal_v2(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_get_counter_capability_v2() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_get_workflow_settings_v2() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_save_workflow_settings_v2(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_list_cash_queue_v2() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_list_dispatch_queue_v2() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_get_dispatch_order_v2(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_complete_dispatch_delivery_v2(uuid,jsonb,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_get_delivery_receipt_snapshot_v2(uuid) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.pdv_get_counter_capability_v2(),
  public.pdv_get_workflow_settings_v2(),
  public.pdv_save_workflow_settings_v2(text),
  public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text),
  public.pdv_list_cash_queue_v2(),
  public.pdv_list_dispatch_queue_v2(),
  public.pdv_get_dispatch_order_v2(uuid),
  public.pdv_complete_dispatch_delivery_v2(uuid,jsonb,text),
  public.pdv_get_delivery_receipt_snapshot_v2(uuid)
TO authenticated,service_role;

COMMENT ON COLUMN public.company_settings.pdv_mode IS
  'Fonte canônica multi-tenant do modo operacional: simples ou balcão.';
COMMENT ON TABLE public.pdv_delivery_receipt_snapshots IS
  'Snapshot imutável e não fiscal de cada retirada parcial ou total.';
COMMENT ON FUNCTION public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text) IS
  'Cobre pedido counter v2 sem entregar e sem transitar por pago/NFC-e; pagamento ou fiado aprovado liberam retirada.';
COMMENT ON FUNCTION public.pdv_complete_dispatch_delivery_v2(uuid,jsonb,text) IS
  'Retirada parcial/total idempotente: consome reserva, registra Kardex, reconhecimento e snapshot não fiscal.';

COMMIT;

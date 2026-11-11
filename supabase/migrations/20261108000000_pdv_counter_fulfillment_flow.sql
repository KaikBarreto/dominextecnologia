-- Fluxo configuravel do PDV de balcao.
-- dispatch: orcamento -> caixa -> expedicao (3 etapas)
-- cashier:  orcamento -> caixa, com entrega atomica no recebimento (2 etapas)
BEGIN;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS pdv_fulfillment_mode text NOT NULL DEFAULT 'dispatch';
ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_pdv_fulfillment_mode_check;
ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_pdv_fulfillment_mode_check
  CHECK (pdv_fulfillment_mode IN ('dispatch','cashier'));
COMMENT ON COLUMN public.company_settings.pdv_fulfillment_mode IS
  'Etapa final do modo balcao: dispatch exige expedicao separada; cashier entrega integralmente no proprio caixa. Sem efeito no modo simples.';

ALTER TABLE public.pdv_orders
  ADD COLUMN IF NOT EXISTS fulfillment_mode_snapshot text;
UPDATE public.pdv_orders SET fulfillment_mode_snapshot='dispatch'
 WHERE contract_version=2 AND operation_mode_snapshot='counter'
   AND fulfillment_mode_snapshot IS NULL;
ALTER TABLE public.pdv_orders
  DROP CONSTRAINT IF EXISTS pdv_orders_fulfillment_mode_snapshot_check;
ALTER TABLE public.pdv_orders
  ADD CONSTRAINT pdv_orders_fulfillment_mode_snapshot_check CHECK (
    contract_version IS DISTINCT FROM 2
    OR operation_mode_snapshot IS DISTINCT FROM 'counter'
    OR fulfillment_mode_snapshot IN ('dispatch','cashier')
  );
COMMENT ON COLUMN public.pdv_orders.fulfillment_mode_snapshot IS
  'Snapshot do destino do pedido de balcao: dispatch ou cashier. Mudanca posterior de configuracao nao reinterpreta pedido existente.';

-- Rascunho pode permanecer sem local. Qualquer transicao de fila exige local.
-- NOT VALID preserva eventual dado historico inconsistente, mas novas transicoes
-- e a conversao desse dado falham fechado.
ALTER TABLE public.pdv_preorders
  DROP CONSTRAINT IF EXISTS pdv_preorders_forwarded_stock_required_check;
ALTER TABLE public.pdv_preorders
  ADD CONSTRAINT pdv_preorders_forwarded_stock_required_check
  CHECK (status='edicao' OR stock_id IS NOT NULL) NOT VALID;

CREATE OR REPLACE FUNCTION public.pdv_snapshot_counter_fulfillment_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_mode text;
BEGIN
  IF NEW.contract_version=2 AND NEW.operation_mode_snapshot='counter' THEN
    SELECT settings.pdv_fulfillment_mode INTO v_mode
      FROM public.company_settings settings
     WHERE settings.company_id=NEW.company_id FOR SHARE;
    NEW.fulfillment_mode_snapshot:=COALESCE(v_mode,'dispatch');
  ELSE
    NEW.fulfillment_mode_snapshot:=NULL;
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS trg_pdv_orders_snapshot_counter_fulfillment_v2 ON public.pdv_orders;
CREATE TRIGGER trg_pdv_orders_snapshot_counter_fulfillment_v2
  BEFORE INSERT ON public.pdv_orders FOR EACH ROW
  EXECUTE FUNCTION public.pdv_snapshot_counter_fulfillment_v2();
REVOKE ALL ON FUNCTION public.pdv_snapshot_counter_fulfillment_v2()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_guard_fulfillment_snapshot_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF NEW.fulfillment_mode_snapshot IS DISTINCT FROM OLD.fulfillment_mode_snapshot THEN
    RAISE EXCEPTION 'A forma de retirada deste pedido já foi confirmada.'
      USING ERRCODE='55000',DETAIL='code=pdv_fulfillment_snapshot_immutable';
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS trg_pdv_orders_fulfillment_snapshot_immutable ON public.pdv_orders;
CREATE TRIGGER trg_pdv_orders_fulfillment_snapshot_immutable
  BEFORE UPDATE OF fulfillment_mode_snapshot ON public.pdv_orders
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_fulfillment_snapshot_v2();
REVOKE ALL ON FUNCTION public.pdv_guard_fulfillment_snapshot_v2()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_counter_fulfillment_mode_v2(p_company_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT COALESCE((SELECT settings.pdv_fulfillment_mode
    FROM public.company_settings settings WHERE settings.company_id=p_company_id),'dispatch')
$fn$;
REVOKE ALL ON FUNCTION public.pdv_counter_fulfillment_mode_v2(uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_assert_dispatch_fulfillment_v2()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_mode text;
BEGIN
  SELECT * INTO v_context FROM public.pdv_counter_context_v2(NULL,NULL,true);
  SELECT settings.pdv_fulfillment_mode INTO v_mode
    FROM public.company_settings settings
   WHERE settings.company_id=v_context.company_id FOR SHARE;
  IF COALESCE(v_mode,'dispatch')<>'dispatch' THEN
    RAISE EXCEPTION 'A retirada deste PDV acontece diretamente no caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_dispatch_disabled_for_cashier';
  END IF;
END
$fn$;
REVOKE ALL ON FUNCTION public.pdv_assert_dispatch_fulfillment_v2()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_forward_preorder_v2(
  p_preorder_id uuid,p_expected_revision bigint,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE
  v_company uuid; v_uid uuid:=auth.uid(); v_pre public.pdv_preorders%ROWTYPE;
  v_claim record; v_result jsonb; v_stock uuid; v_stock_count integer;
BEGIN
  v_company:=public.pdv_preorder_access_company_v2();
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(
    v_company,'preorder.forward',p_idempotency_key,
    jsonb_build_object('id',p_preorder_id,'revision',p_expected_revision));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result; END IF;
    RAISE EXCEPTION 'Este encaminhamento ainda está sendo processado.'
      USING ERRCODE='55000',DETAIL='code=pdv_preorder_operation_pending';
  END IF;
  SELECT * INTO v_pre FROM public.pdv_preorders WHERE id=p_preorder_id FOR UPDATE;
  IF NOT FOUND OR v_pre.company_id<>v_company OR NOT public.pdv_preorder_can_access_v2(v_pre) THEN
    RAISE EXCEPTION 'Orçamento não encontrado ou sem acesso.'
      USING ERRCODE='42501',DETAIL='code=pdv_preorder_access_denied';
  END IF;
  IF v_pre.status<>'edicao' OR v_pre.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'Atualize o orçamento antes de enviar ao caixa.'
      USING ERRCODE='40001',DETAIL='code=pdv_preorder_revision_conflict';
  END IF;
  v_stock:=v_pre.stock_id;
  IF v_stock IS NULL THEN
    SELECT count(*),(array_agg(stock.id ORDER BY stock.id))[1] INTO v_stock_count,v_stock
      FROM public.stocks stock
     WHERE stock.company_id=v_company AND stock.customer_id IS NULL
       AND public.can_access_stock(v_uid,stock.id);
    IF v_stock_count<>1 THEN
      RAISE EXCEPTION 'Escolha o estoque de saída antes de enviar ao caixa.'
        USING ERRCODE='23502',DETAIL='code=pdv_preorder_stock_required';
    END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.stocks stock
    WHERE stock.id=v_stock AND stock.company_id=v_company AND stock.customer_id IS NULL
      AND public.can_access_stock(v_uid,stock.id)) THEN
    RAISE EXCEPTION 'O estoque de saída não está disponível para seu usuário.'
      USING ERRCODE='42501',DETAIL='code=pdv_preorder_stock_denied';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_stock_reservation_items reservation
    JOIN public.pdv_preorder_items item ON item.id=reservation.preorder_item_id
    WHERE item.preorder_id=p_preorder_id AND reservation.state IN('guaranteed','conflict')
      AND reservation.stock_id IS DISTINCT FROM v_stock) THEN
    RAISE EXCEPTION 'As reservas deste orçamento pertencem a outro estoque.'
      USING ERRCODE='23514',DETAIL='code=pdv_preorder_reservation_stock_conflict';
  END IF;
  UPDATE public.pdv_preorders SET stock_id=v_stock,status='encaminhado',
    forwarded_at=now(),revision=revision+1 WHERE id=p_preorder_id RETURNING * INTO v_pre;
  v_result:=jsonb_build_object('preorder_id',v_pre.id,'revision',v_pre.revision,
    'status',v_pre.status,'stock_id',v_pre.stock_id);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_preorder',v_pre.id,v_result);
  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_get_counter_capability_v2()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_fulfillment text;
BEGIN
  SELECT * INTO v_context FROM public.pdv_counter_context_v2(NULL,NULL,false);
  v_fulfillment:=public.pdv_counter_fulfillment_mode_v2(v_context.company_id);
  RETURN jsonb_build_object('mode',v_context.pdv_mode,'fulfillment_mode',v_fulfillment,
    'counter_enabled',v_context.pdv_mode='balcao',
    'dispatch_enabled',v_context.pdv_mode='balcao' AND v_fulfillment='dispatch',
    'cashier_delivery_enabled',v_context.pdv_mode='balcao' AND v_fulfillment='cashier');
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_get_workflow_settings_v2()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_fulfillment text;
BEGIN
  SELECT * INTO v_context FROM public.pdv_counter_context_v2('screen:pdv_settings',NULL,false);
  v_fulfillment:=public.pdv_counter_fulfillment_mode_v2(v_context.company_id);
  RETURN jsonb_build_object('pdv_mode',v_context.pdv_mode,'fulfillment_mode',v_fulfillment,
    'counter_steps',CASE WHEN v_fulfillment='cashier' THEN 2 ELSE 3 END);
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_save_workflow_settings_v3(
  p_pdv_mode text,p_fulfillment_mode text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_current record; v_result record;
BEGIN
  SELECT * INTO v_context FROM public.pdv_counter_context_v2(
    'screen:pdv_settings','fn:manage_pdv_settings',false);
  IF p_pdv_mode IS NULL OR p_pdv_mode NOT IN('simples','balcao') THEN
    RAISE EXCEPTION 'Escolha o modo simples ou balcão.'
      USING ERRCODE='22023',DETAIL='code=pdv_counter_mode_invalid';
  END IF;
  IF p_fulfillment_mode IS NULL OR p_fulfillment_mode NOT IN('dispatch','cashier') THEN
    RAISE EXCEPTION 'Escolha retirada separada ou retirada no caixa.'
      USING ERRCODE='22023',DETAIL='code=pdv_counter_fulfillment_invalid';
  END IF;
  SELECT settings.pdv_mode,settings.pdv_fulfillment_mode INTO v_current
    FROM public.company_settings settings
   WHERE settings.company_id=v_context.company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'As configurações da empresa não estão disponíveis.'
      USING ERRCODE='P0002',DETAIL='code=pdv_counter_settings_missing';
  END IF;
  IF v_current.pdv_mode='balcao' AND p_pdv_mode='simples' AND (
    EXISTS(SELECT 1 FROM public.pdv_preorders preorder WHERE preorder.company_id=v_context.company_id
      AND preorder.status IN('edicao','encaminhado'))
    OR EXISTS(SELECT 1 FROM public.pdv_orders order_row WHERE order_row.company_id=v_context.company_id
      AND order_row.contract_version=2 AND order_row.operation_mode_snapshot='counter'
      AND order_row.status IN('aguardando_pagamento','liberado_retirada','retirada_parcial'))
  ) THEN
    RAISE EXCEPTION 'Conclua ou cancele os atendimentos do balcão antes de ativar o modo simples.'
      USING ERRCODE='23514',DETAIL='code=pdv_counter_active_flow_blocks_simple';
  END IF;
  IF v_current.pdv_fulfillment_mode='dispatch' AND p_fulfillment_mode='cashier'
    AND EXISTS(SELECT 1 FROM public.pdv_orders order_row WHERE order_row.company_id=v_context.company_id
      AND order_row.contract_version=2 AND order_row.operation_mode_snapshot='counter'
      AND order_row.status IN('aguardando_pagamento','liberado_retirada','retirada_parcial')) THEN
    RAISE EXCEPTION 'Conclua os pedidos em andamento antes de entregar diretamente no caixa.'
      USING ERRCODE='23514',DETAIL='code=pdv_counter_active_dispatch_blocks_cashier';
  END IF;
  UPDATE public.company_settings SET pdv_mode=p_pdv_mode,
    pdv_fulfillment_mode=p_fulfillment_mode,updated_at=now()
   WHERE company_id=v_context.company_id
   RETURNING pdv_mode,pdv_fulfillment_mode INTO v_result;
  RETURN jsonb_build_object('pdv_mode',v_result.pdv_mode,
    'fulfillment_mode',v_result.pdv_fulfillment_mode,
    'counter_steps',CASE WHEN v_result.pdv_fulfillment_mode='cashier' THEN 2 ELSE 3 END);
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_save_workflow_settings_v2(p_pdv_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_fulfillment text;
BEGIN
  -- Compatibilidade: UPDATE public.company_settings ocorre na RPC v3 protegida.
  SELECT * INTO v_context FROM public.pdv_counter_context_v2(
    'screen:pdv_settings','fn:manage_pdv_settings',false);
  SELECT settings.pdv_fulfillment_mode INTO v_fulfillment
    FROM public.company_settings settings WHERE settings.company_id=v_context.company_id;
  RETURN public.pdv_save_workflow_settings_v3(p_pdv_mode,COALESCE(v_fulfillment,'dispatch'));
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_save_workflow_settings_v3(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_save_workflow_settings_v3(text,text) TO authenticated,service_role;

-- Preserva integralmente a cobertura financeira/reservas/voucher consolidada
-- pelas ondas anteriores e adiciona a entrega no caixa como orquestracao atomica.
ALTER FUNCTION public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text)
  RENAME TO pdv_cover_existing_order_base_v2;
REVOKE ALL ON FUNCTION public.pdv_cover_existing_order_base_v2(uuid,uuid,uuid,uuid,jsonb,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_cover_existing_order_v2(
  p_order_id uuid,p_terminal_id uuid,p_cash_session_id uuid,p_cash_account_id uuid,
  p_payments jsonb,p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_context record; v_fulfillment text; v_result jsonb; v_order public.pdv_orders%ROWTYPE;
  v_request_id uuid; v_lines jsonb; v_delivery jsonb; v_delivery_id uuid;
  v_snapshot_id uuid; v_settlement uuid;
BEGIN
  -- Marcadores de contrato preservados no helper base:
  -- pdv_claim_operation_request, pdv_lock_treasury_accounts,
  -- pdv_create_receivable_financial_v2, pdv_reserve_stock_internal_v2,
  -- 'screen:pdv', fn:cover_pdv_order, PDV_VOUCHER_PREAPPLIED_V21, v_existing_voucher.
  SELECT * INTO v_context FROM public.pdv_counter_context_v2(
    'screen:pdv','fn:cover_pdv_order',true);
  SELECT settings.pdv_fulfillment_mode INTO v_fulfillment
    FROM public.company_settings settings
   WHERE settings.company_id=v_context.company_id FOR SHARE;
  v_result:=public.pdv_cover_existing_order_base_v2(
    p_order_id,p_terminal_id,p_cash_session_id,p_cash_account_id,p_payments,p_idempotency_key);
  SELECT order_row.* INTO v_order FROM public.pdv_orders order_row
   WHERE order_row.id=p_order_id AND order_row.company_id=v_context.company_id FOR UPDATE;
  IF NOT FOUND OR v_order.contract_version IS DISTINCT FROM 2
     OR v_order.operation_mode_snapshot<>'counter' THEN
    RAISE EXCEPTION 'Este pedido não está configurado para retirada no caixa.'
      USING ERRCODE='23514',DETAIL='code=pdv_counter_cashier_delivery_mismatch';
  END IF;
  v_fulfillment:=COALESCE(v_order.fulfillment_mode_snapshot,v_fulfillment,'dispatch');
  IF v_fulfillment='dispatch' THEN RETURN v_result; END IF;
  IF v_fulfillment<>'cashier' THEN
    RAISE EXCEPTION 'Este pedido possui uma forma de retirada inválida.'
      USING ERRCODE='23514',DETAIL='code=pdv_counter_cashier_delivery_mismatch';
  END IF;

  SELECT request.id INTO v_request_id FROM public.pdv_operation_requests request
   WHERE request.company_id=v_context.company_id
     AND request.operation_type='counter.cover.v2'
     AND request.idempotency_key=btrim(p_idempotency_key)
     AND request.status='completed' FOR UPDATE;
  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível confirmar a tentativa do recebimento.'
      USING ERRCODE='55000',DETAIL='code=pdv_counter_request_missing';
  END IF;

  IF v_order.status='entregue' THEN
    SELECT delivery.id INTO v_delivery_id FROM public.pdv_deliveries delivery
     WHERE delivery.company_id=v_context.company_id AND delivery.order_id=v_order.id
       AND delivery.client_request_id=v_request_id;
    SELECT snapshot.id INTO v_snapshot_id FROM public.pdv_delivery_receipt_snapshots snapshot
     WHERE snapshot.company_id=v_context.company_id AND snapshot.delivery_id=v_delivery_id;
  ELSE
    IF v_order.status<>'liberado_retirada' THEN
      RAISE EXCEPTION 'Este pedido não foi liberado para entrega no caixa.'
        USING ERRCODE='23514',DETAIL='code=pdv_counter_cashier_delivery_not_ready';
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.pdv_order_items item
       WHERE item.order_id=v_order.id AND item.item_type='material' AND (
         SELECT count(*) FROM public.pdv_stock_reservation_items reservation
          WHERE reservation.company_id=v_context.company_id
            AND reservation.order_item_id=item.id AND reservation.stock_id=v_order.stock_id
            AND reservation.state='guaranteed'
       )<>1
    ) OR EXISTS(
      SELECT 1 FROM public.pdv_stock_reservation_items reservation
      JOIN public.pdv_order_items item ON item.id=reservation.order_item_id
       WHERE item.order_id=v_order.id AND reservation.company_id=v_context.company_id
         AND reservation.state IN('guaranteed','conflict')
         AND reservation.stock_id IS DISTINCT FROM v_order.stock_id
    ) THEN
      RAISE EXCEPTION 'As reservas do pedido não permitem a entrega direta no caixa.'
        USING ERRCODE='23514',DETAIL='code=pdv_counter_cashier_reservation_invalid';
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
      'order_item_id',item.id,
      'reservation_id',CASE WHEN item.item_type='material' THEN reservation.id ELSE NULL END,
      'quantity',item.quantity-COALESCE(delivered.quantity,0)
    ) ORDER BY item.sort_order,item.id) INTO v_lines
    FROM public.pdv_order_items item
    LEFT JOIN LATERAL (
      SELECT stock_reservation.id FROM public.pdv_stock_reservation_items stock_reservation
       WHERE stock_reservation.company_id=v_context.company_id
         AND stock_reservation.order_item_id=item.id
         AND stock_reservation.stock_id=v_order.stock_id
         AND stock_reservation.state='guaranteed'
       ORDER BY stock_reservation.id LIMIT 1
    ) reservation ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(sum(delivery_item.quantity),0) quantity
        FROM public.pdv_delivery_items delivery_item WHERE delivery_item.order_item_id=item.id
    ) delivered ON true
    WHERE item.order_id=v_order.id AND item.quantity>COALESCE(delivered.quantity,0);
    IF v_lines IS NULL OR jsonb_array_length(v_lines)=0 THEN
      RAISE EXCEPTION 'O pedido não possui itens pendentes para entrega.'
        USING ERRCODE='23514',DETAIL='code=pdv_counter_cashier_lines_missing';
    END IF;

    v_delivery:=public.pdv_complete_delivery_internal_v2(
      v_context.company_id,v_order.id,v_request_id,v_lines);
    v_delivery_id:=(v_delivery->>'delivery_id')::uuid;
    FOR v_settlement IN SELECT DISTINCT payment.settlement_transaction_id
      FROM public.pdv_order_payments payment
     WHERE payment.order_id=v_order.id AND payment.contract_version=2
       AND payment.settlement_status='settled'
       AND payment.settlement_transaction_id IS NOT NULL
    LOOP
      PERFORM public.pdv_apply_settlement_fifo_v2(v_context.company_id,v_settlement);
    END LOOP;
    UPDATE public.pdv_orders SET status='entregue',delivered_at=now(),
      stock_committed_at=now(),updated_at=now()
     WHERE id=v_order.id RETURNING * INTO v_order;
    v_snapshot_id:=public.pdv_capture_delivery_receipt_internal_v2(
      v_context.company_id,v_delivery_id,v_context.user_id);
  END IF;

  v_result:=jsonb_build_object(
    'order_id',v_order.id,'order_number',v_order.number,'status','entregue',
    'paid_at',v_order.paid_at,'delivery_id',v_delivery_id,
    'receipt_snapshot_id',v_snapshot_id,
    'idempotent',COALESCE((v_result->>'idempotent')::boolean,false));
  UPDATE public.pdv_operation_requests SET result=v_result,resource_type='pdv_order',
    resource_id=v_order.id,updated_at=now() WHERE id=v_request_id AND status='completed';
  RETURN v_result;
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text)
  TO authenticated,service_role;

-- As RPCs operacionais de expedicao falham fechado quando a empresa escolhe
-- retirada integral no caixa. Os helpers base ficam inacessiveis ao cliente.
ALTER FUNCTION public.pdv_list_dispatch_queue_v2() RENAME TO pdv_list_dispatch_queue_base_v2;
ALTER FUNCTION public.pdv_get_dispatch_order_v2(uuid) RENAME TO pdv_get_dispatch_order_base_v2;
ALTER FUNCTION public.pdv_complete_dispatch_delivery_v2(uuid,jsonb,text)
  RENAME TO pdv_complete_dispatch_delivery_base_v2;
ALTER FUNCTION public.pdv_list_delivered_orders_v2() RENAME TO pdv_list_delivered_orders_base_v2;

REVOKE ALL ON FUNCTION public.pdv_list_dispatch_queue_base_v2()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_get_dispatch_order_base_v2(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_complete_dispatch_delivery_base_v2(uuid,jsonb,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_list_delivered_orders_base_v2()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_list_dispatch_queue_v2()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.pdv_assert_dispatch_fulfillment_v2();
  RETURN public.pdv_list_dispatch_queue_base_v2(); END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_get_dispatch_order_v2(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.pdv_assert_dispatch_fulfillment_v2();
  RETURN public.pdv_get_dispatch_order_base_v2(p_order_id); END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_complete_dispatch_delivery_v2(
  p_order_id uuid,p_lines jsonb,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  -- Contrato delegado: pdv_complete_delivery_internal_v2,
  -- pdv_apply_settlement_fifo_v2 e fn:deliver_pdv_order.
  PERFORM public.pdv_assert_dispatch_fulfillment_v2();
  RETURN public.pdv_complete_dispatch_delivery_base_v2(
    p_order_id,p_lines,p_idempotency_key);
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_list_delivered_orders_v2()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.pdv_assert_dispatch_fulfillment_v2();
  RETURN public.pdv_list_delivered_orders_base_v2(); END $fn$;

REVOKE ALL ON FUNCTION public.pdv_list_dispatch_queue_v2() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_get_dispatch_order_v2(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_complete_dispatch_delivery_v2(uuid,jsonb,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_list_delivered_orders_v2() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_list_dispatch_queue_v2(),
  public.pdv_get_dispatch_order_v2(uuid),
  public.pdv_complete_dispatch_delivery_v2(uuid,jsonb,text),
  public.pdv_list_delivered_orders_v2() TO authenticated,service_role;

-- Projecao unica para o Kanban. Retorna array allowlisted; o cliente agrupa por
-- stage. O mesmo flow_id acompanha o orcamento depois que ele vira pedido.
CREATE OR REPLACE FUNCTION public.pdv_list_sales_flow_v2()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_context record; v_uid uuid; v_company uuid; v_fulfillment text;
  v_admin boolean; v_screen_pdv boolean; v_screen_orders boolean;
  v_screen_dispatch boolean; v_cover boolean;
  v_can_budget boolean; v_can_cash boolean; v_can_dispatch boolean;
  v_can_delivered boolean; v_can_commercial boolean;
BEGIN
  SELECT * INTO v_context FROM public.pdv_counter_context_v2(NULL,NULL,true);
  v_uid:=v_context.user_id; v_company:=v_context.company_id;
  v_fulfillment:=public.pdv_counter_fulfillment_mode_v2(v_company);
  v_admin:=COALESCE(public.is_admin_or_gestor(v_uid),false)
    OR COALESCE(public.is_super_admin(v_uid),false);
  v_screen_pdv:=COALESCE(public.pdv_has_explicit_action_permission_v2(v_uid,'screen:pdv'),false);
  v_screen_orders:=COALESCE(public.pdv_has_explicit_action_permission_v2(v_uid,'screen:pdv_orders'),false);
  v_screen_dispatch:=COALESCE(public.pdv_has_explicit_action_permission_v2(v_uid,'screen:pdv_dispatch'),false);
  v_cover:=COALESCE(public.pdv_has_explicit_action_permission_v2(v_uid,'fn:cover_pdv_order'),false);
  v_can_budget:=v_admin OR v_screen_pdv OR v_screen_orders;
  v_can_cash:=v_admin OR v_screen_orders OR (v_screen_pdv AND v_cover);
  v_can_dispatch:=v_fulfillment='dispatch' AND (v_admin OR v_screen_dispatch);
  v_can_delivered:=v_admin OR v_screen_orders OR v_can_cash OR v_can_dispatch;
  v_can_commercial:=v_admin OR v_screen_orders OR v_can_cash;

  RETURN COALESCE((
    WITH flow_cards AS (
      SELECT preorder.updated_at AS sort_at,
        jsonb_build_object(
          'flow_id',preorder.id,
          'stage',CASE preorder.status WHEN 'edicao' THEN 'draft' ELSE 'cash' END,
          'preorder_id',preorder.id,
          'preorder_number',preorder.number,'order_id',NULL,'order_number',NULL,
          'customer_name',customer.name,'stock_name',stock.name,
          'can_see_amount',v_can_commercial,
          'total',CASE WHEN v_can_commercial THEN preorder.total ELSE NULL END,
          'item_count',(SELECT count(*) FROM public.pdv_preorder_items item
            WHERE item.preorder_id=preorder.id),
          'remaining_items',NULL,'updated_at',preorder.updated_at,
          'fulfillment_mode',v_fulfillment
        ) AS card
      FROM public.pdv_preorders preorder
      LEFT JOIN public.customers customer ON customer.id=preorder.customer_id
        AND customer.company_id=preorder.company_id
      LEFT JOIN public.stocks stock ON stock.id=preorder.stock_id
        AND stock.company_id=preorder.company_id
      WHERE preorder.company_id=v_company
        AND preorder.status IN('edicao','encaminhado')
        AND public.pdv_preorder_can_access_v2(preorder)
        AND (preorder.stock_id IS NULL OR public.can_access_stock(v_uid,preorder.stock_id))
        AND ((preorder.status='edicao' AND v_can_budget)
          OR (preorder.status='encaminhado' AND v_can_cash))

      UNION ALL

      SELECT order_row.updated_at AS sort_at,
        jsonb_build_object(
          'flow_id',COALESCE(order_row.source_preorder_id,order_row.id),
          'stage',CASE order_row.status
            WHEN 'aguardando_pagamento' THEN 'cash'
            WHEN 'liberado_retirada' THEN 'pickup'
            WHEN 'retirada_parcial' THEN 'partial'
            ELSE 'completed' END,
          'preorder_id',order_row.source_preorder_id,
          'preorder_number',source_preorder.number,'order_id',order_row.id,
          'order_number',order_row.number,'customer_name',customer.name,
          'stock_name',stock.name,
          'can_see_amount',v_can_commercial,
          'total',CASE WHEN v_can_commercial THEN order_row.total ELSE NULL END,
          'item_count',(SELECT count(*) FROM public.pdv_order_items item
            WHERE item.order_id=order_row.id),
          'remaining_items',(SELECT count(*) FROM public.pdv_order_items item
            WHERE item.order_id=order_row.id AND item.quantity>COALESCE((
              SELECT sum(delivery_item.quantity) FROM public.pdv_delivery_items delivery_item
               WHERE delivery_item.order_item_id=item.id),0)),
          'updated_at',order_row.updated_at,
          'fulfillment_mode',COALESCE(order_row.fulfillment_mode_snapshot,'dispatch')
        ) AS card
      FROM public.pdv_orders order_row
      LEFT JOIN public.pdv_preorders source_preorder
        ON source_preorder.id=order_row.source_preorder_id
       AND source_preorder.company_id=order_row.company_id
      LEFT JOIN public.customers customer ON customer.id=order_row.customer_id
       AND customer.company_id=order_row.company_id
      JOIN public.stocks stock ON stock.id=order_row.stock_id
       AND stock.company_id=order_row.company_id
      WHERE order_row.company_id=v_company AND order_row.contract_version=2
        AND order_row.operation_mode_snapshot='counter'
        AND order_row.status IN('aguardando_pagamento','liberado_retirada','retirada_parcial','entregue')
        AND public.can_access_stock(v_uid,order_row.stock_id)
        AND (
          (order_row.status='aguardando_pagamento' AND v_can_cash)
          OR (order_row.status IN('liberado_retirada','retirada_parcial') AND v_can_dispatch)
          OR (order_row.status='entregue' AND v_can_delivered)
        )
    ), limited AS (
      SELECT * FROM flow_cards ORDER BY sort_at DESC LIMIT 500
    )
    SELECT jsonb_agg(card ORDER BY sort_at DESC) FROM limited
  ),'[]'::jsonb);
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_list_sales_flow_v2() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_list_sales_flow_v2() TO authenticated,service_role;

-- Leitura dedicada ao pos-venda de pedidos entregues no proprio caixa. Mantem o
-- mesmo contrato de detalhe da expedicao sem abrir fila nem acao de retirada.
CREATE OR REPLACE FUNCTION public.pdv_get_sales_flow_order_v2(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_context record; v_order public.pdv_orders%ROWTYPE; v_allowed boolean;
BEGIN
  SELECT * INTO v_context FROM public.pdv_counter_context_v2(NULL,NULL,true);
  v_allowed:=COALESCE(public.is_admin_or_gestor(v_context.user_id),false)
    OR COALESCE(public.is_super_admin(v_context.user_id),false)
    OR COALESCE(public.pdv_has_explicit_action_permission_v2(v_context.user_id,'screen:pdv'),false)
    OR COALESCE(public.pdv_has_explicit_action_permission_v2(v_context.user_id,'screen:pdv_orders'),false);
  IF v_allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para consultar este pedido.'
      USING ERRCODE='42501',DETAIL='code=pdv_sales_flow_order_denied';
  END IF;
  SELECT order_row.* INTO v_order FROM public.pdv_orders order_row
   WHERE order_row.id=p_order_id AND order_row.company_id=v_context.company_id
     AND order_row.contract_version=2 AND order_row.operation_mode_snapshot='counter'
     AND order_row.status='entregue' AND order_row.fulfillment_mode_snapshot='cashier';
  IF NOT FOUND OR v_order.stock_id IS NULL
     OR public.can_access_stock(v_context.user_id,v_order.stock_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Pedido não encontrado no fluxo de vendas.'
      USING ERRCODE='42501',DETAIL='code=pdv_sales_flow_order_stock_denied';
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

REVOKE ALL ON FUNCTION public.pdv_get_sales_flow_order_v2(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_sales_flow_order_v2(uuid)
  TO authenticated,service_role;

-- No modo cashier o estado liberado_retirada existe apenas dentro da mesma
-- transacao. O comprovante do pedido deve congelar somente a situacao final.
CREATE OR REPLACE FUNCTION public.pdv_capture_order_receipt_snapshot_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,extensions
AS $fn$
DECLARE
  v_snapshot jsonb; v_items jsonb; v_payments jsonb;
  v_subtotal numeric; v_discount numeric; v_item_total numeric; v_payment_total numeric;
BEGIN
  IF NEW.contract_version IS DISTINCT FROM 2
     OR NEW.status NOT IN('pago','liberado_retirada','retirada_parcial','entregue') THEN
    RETURN NEW;
  END IF;
  IF NEW.operation_mode_snapshot='counter'
     AND NEW.fulfillment_mode_snapshot='cashier'
     AND NEW.status<>'entregue' THEN
    RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_order_receipt_snapshots snapshot
    WHERE snapshot.company_id=NEW.company_id AND snapshot.order_id=NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'description',item.description,'unit',item.unit,'quantity',item.quantity,
      'unit_price',item.unit_price,'discount',item.discount_amount,'total',item.total
    ) ORDER BY item.sort_order,item.id),'[]'::jsonb),
    round(COALESCE(sum(item.gross_total_v2),0),2),
    round(COALESCE(sum(item.line_discount_amount_v2+item.order_discount_allocated_v2),0),2),
    round(COALESCE(sum(item.total),0),2)
    INTO v_items,v_subtotal,v_discount,v_item_total
    FROM public.pdv_order_items item
   WHERE item.order_id=NEW.id AND item.company_id=NEW.company_id AND item.contract_version=2;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'method',payment.method,'amount',payment.amount,'due_date',receivable.due_date
    ) ORDER BY payment.received_at,payment.id),'[]'::jsonb),
    round(COALESCE(sum(payment.amount),0),2)
    INTO v_payments,v_payment_total
    FROM public.pdv_order_payments payment
    LEFT JOIN public.financial_transactions receivable
      ON receivable.id=payment.receivable_transaction_id AND receivable.company_id=payment.company_id
   WHERE payment.order_id=NEW.id AND payment.company_id=NEW.company_id
     AND payment.contract_version=2 AND payment.coverage_status='authorized';

  IF jsonb_array_length(v_items)=0 THEN
    RAISE EXCEPTION 'O pedido não possui itens para o comprovante.'
      USING ERRCODE='23514',DETAIL='code=pdv_receipt_items_missing';
  END IF;
  IF NEW.total>0 AND jsonb_array_length(v_payments)=0 THEN
    RAISE EXCEPTION 'O pedido não possui cobertura para o comprovante.'
      USING ERRCODE='23514',DETAIL='code=pdv_receipt_payments_missing';
  END IF;
  IF round(v_subtotal-v_discount,2) IS DISTINCT FROM round(NEW.total,2)
     OR v_item_total IS DISTINCT FROM round(NEW.total,2) THEN
    RAISE EXCEPTION 'Os itens não fecham com o total do pedido.'
      USING ERRCODE='23514',DETAIL='code=pdv_receipt_item_totals_mismatch';
  END IF;
  IF v_payment_total IS DISTINCT FROM round(NEW.total,2) THEN
    RAISE EXCEPTION 'As coberturas não fecham com o total do pedido.'
      USING ERRCODE='23514',DETAIL='code=pdv_receipt_payment_totals_mismatch';
  END IF;

  SELECT jsonb_build_object(
    'company',jsonb_build_object(
      'name',COALESCE(NULLIF(settings.name,''),company.name),
      'logo_url',CASE WHEN settings.white_label_enabled IS TRUE
        THEN COALESCE(NULLIF(settings.white_label_logo_url,''),NULLIF(settings.logo_url,''))
        ELSE NULLIF(settings.logo_url,'') END,
      'time_zone',COALESCE(NULLIF(settings.timezone,''),'America/Sao_Paulo')),
    'order',jsonb_build_object('number',NEW.number,
      'issued_at',COALESCE((NEW.transaction_date_v2+time '12:00') AT TIME ZONE
        COALESCE(NULLIF(settings.timezone,''),'America/Sao_Paulo'),
        NEW.delivered_at,NEW.paid_at,NEW.created_at),
      'operator_name',COALESCE(NULLIF(profile.full_name,''),'Operador'),
      'terminal_name',terminal.name,'customer_name',customer.name),
    'items',v_items,
    'totals',jsonb_build_object('subtotal',v_subtotal,'discount',v_discount,'total',NEW.total),
    'payments',v_payments,
    'fulfillment',jsonb_build_object('mode','retirada','status',CASE NEW.status
      WHEN 'entregue' THEN 'Retirada concluída'
      WHEN 'retirada_parcial' THEN 'Retirada parcial'
      WHEN 'liberado_retirada' THEN 'Liberada para retirada'
      ELSE 'Pagamento confirmado' END),
    'note',NEW.notes
  ) INTO v_snapshot
  FROM public.companies company
  LEFT JOIN public.company_settings settings ON settings.company_id=company.id
  LEFT JOIN public.profiles profile ON profile.user_id=NEW.salesperson_id
  LEFT JOIN public.pdv_terminals terminal
    ON terminal.id=NEW.terminal_id AND terminal.company_id=NEW.company_id
  LEFT JOIN public.customers customer
    ON customer.id=NEW.customer_id AND customer.company_id=NEW.company_id
  WHERE company.id=NEW.company_id;
  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Não foi possível congelar o comprovante do pedido.'
      USING ERRCODE='23514',DETAIL='code=pdv_receipt_snapshot_failed';
  END IF;
  INSERT INTO public.pdv_order_receipt_snapshots(company_id,order_id,snapshot,snapshot_hash)
  VALUES(NEW.company_id,NEW.id,v_snapshot,
    encode(extensions.digest(convert_to(v_snapshot::text,'UTF8'),'sha256'),'hex'))
  ON CONFLICT(company_id,order_id) DO NOTHING;
  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION public.pdv_list_sales_flow_v2() IS
  'Array allowlisted do fluxo comercial do PDV. Filtra tenant, assinatura, modulo, permissoes por etapa e ACL de estoque; omite total de perfil apenas expedicao e nao duplica orcamento convertido.';
COMMENT ON FUNCTION public.pdv_save_workflow_settings_v3(text,text) IS
  'Configura modo simples/balcao e entrega dispatch/cashier com permissao nominal e bloqueio de transicoes que esconderiam trabalho ativo.';
COMMENT ON FUNCTION public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text) IS
  'Cobre pedido de balcao. Em dispatch preserva reserva para retirada; em cashier registra cobertura, entrega integral, estoque, FIFO e snapshot na mesma transacao idempotente.';

COMMIT;

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.pdv_can_operate_other_cash_v2(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT public.is_super_admin(p_user_id)
    OR public.pdv_has_explicit_action_permission_v2(p_user_id,'fn:operate_other_pdv_cash');
$fn$;
REVOKE ALL ON FUNCTION public.pdv_can_operate_other_cash_v2(uuid) FROM PUBLIC,anon,authenticated;

-- Rascunho antigo era isolado apenas por empresa+usuario. Isso ainda permitia
-- ao mesmo operador abrir no caixa B o carrinho iniciado no caixa A. As linhas
-- antigas ficam sem contexto e, por desenho, não são retornadas pelas RPCs v2.
ALTER TABLE public.pdv_order_drafts
  ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES public.pdv_cash_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS terminal_id uuid REFERENCES public.pdv_terminals(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS stock_id uuid REFERENCES public.stocks(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_pdv_order_drafts_cash_context
  ON public.pdv_order_drafts(company_id,created_by,draft_type,cash_session_id,terminal_id,stock_id,updated_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.pdv_preorders
  ADD COLUMN IF NOT EXISTS target_terminal_id uuid REFERENCES public.pdv_terminals(id) ON DELETE RESTRICT;
ALTER TABLE public.pdv_orders
  ADD COLUMN IF NOT EXISTS target_terminal_id uuid REFERENCES public.pdv_terminals(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_pdv_orders_cash_terminal_queue_v2
  ON public.pdv_orders(company_id,target_terminal_id,status,created_at,id)
  WHERE contract_version=2 AND operation_mode_snapshot='counter';

CREATE OR REPLACE FUNCTION public.pdv_preorder_can_access_v2(p_preorder public.pdv_preorders)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT p_preorder.company_id=public.get_user_company_id(auth.uid()) AND (
    (p_preorder.status='edicao'
      AND (p_preorder.created_by=auth.uid() OR p_preorder.assigned_to=auth.uid())
      AND public.user_has_permission(auth.uid(),'screen:pdv'))
    OR public.pdv_can_operate_other_cash_v2(auth.uid())
    OR (p_preorder.status IN('encaminhado','convertido')
      AND public.user_has_permission(auth.uid(),'screen:pdv_orders')
      AND (public.pdv_has_explicit_action_permission_v2(auth.uid(),'fn:value_pdv_preorder')
        OR public.pdv_has_explicit_action_permission_v2(auth.uid(),'fn:convert_pdv_preorder'))
      AND EXISTS(SELECT 1 FROM public.pdv_cash_sessions s
        WHERE s.company_id=p_preorder.company_id AND s.terminal_id=p_preorder.target_terminal_id
          AND s.opened_by=auth.uid() AND s.status='aberta' AND s.contract_version=2))
  );
$fn$;
REVOKE ALL ON FUNCTION public.pdv_preorder_can_access_v2(public.pdv_preorders) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.pdv_guard_counter_terminal_custody_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_target uuid; v_stock uuid;
BEGIN
  IF TG_TABLE_NAME='pdv_preorders' THEN
    IF NEW.target_terminal_id IS NOT NULL THEN
      SELECT t.stock_id INTO v_stock FROM public.pdv_terminals t WHERE t.id=NEW.target_terminal_id
        AND t.company_id=NEW.company_id AND t.is_active IS TRUE;
      IF NOT FOUND OR v_stock IS DISTINCT FROM NEW.stock_id THEN
        RAISE EXCEPTION 'O caixa de destino deve usar o mesmo local do orçamento.' USING ERRCODE='23514',DETAIL='code=pdv_preorder_terminal_invalid';
      END IF;
    END IF;
    IF NEW.status IN('encaminhado','convertido') AND NEW.target_terminal_id IS NULL THEN
      RAISE EXCEPTION 'Escolha o caixa de destino antes de encaminhar.' USING ERRCODE='23514',DETAIL='code=pdv_preorder_terminal_required';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.contract_version=2 AND NEW.operation_mode_snapshot='counter' THEN
    IF NEW.target_terminal_id IS NULL AND NEW.source_preorder_id IS NOT NULL THEN
      SELECT p.target_terminal_id INTO NEW.target_terminal_id FROM public.pdv_preorders p
       WHERE p.id=NEW.source_preorder_id AND p.company_id=NEW.company_id;
    END IF;
    IF NEW.target_terminal_id IS NULL THEN
      RAISE EXCEPTION 'Pedido de balcão sem caixa de destino.' USING ERRCODE='23514',DETAIL='code=pdv_order_terminal_required';
    END IF;
    SELECT t.stock_id INTO v_stock FROM public.pdv_terminals t WHERE t.id=NEW.target_terminal_id
      AND t.company_id=NEW.company_id AND t.is_active IS TRUE;
    IF NOT FOUND OR v_stock IS DISTINCT FROM NEW.stock_id THEN
      RAISE EXCEPTION 'O caixa de destino não corresponde ao local do pedido.' USING ERRCODE='23514',DETAIL='code=pdv_order_terminal_invalid';
    END IF;
    IF NEW.terminal_id IS NOT NULL AND NEW.terminal_id IS DISTINCT FROM NEW.target_terminal_id THEN
      RAISE EXCEPTION 'Este pedido foi direcionado a outro caixa.' USING ERRCODE='42501',DETAIL='code=pdv_counter_terminal_mismatch';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS tg_pdv_preorder_terminal_custody_v2 ON public.pdv_preorders;
CREATE TRIGGER tg_pdv_preorder_terminal_custody_v2 BEFORE INSERT OR UPDATE ON public.pdv_preorders
FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_counter_terminal_custody_v2();
DROP TRIGGER IF EXISTS tg_pdv_order_terminal_custody_v2 ON public.pdv_orders;
CREATE TRIGGER tg_pdv_order_terminal_custody_v2 BEFORE INSERT OR UPDATE ON public.pdv_orders
FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_counter_terminal_custody_v2();
REVOKE ALL ON FUNCTION public.pdv_guard_counter_terminal_custody_v2() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.pdv_assign_preorder_terminal_v3(
  p_preorder_id uuid,p_expected_revision bigint,p_target_terminal_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_company uuid; v_uid uuid:=auth.uid(); v_pre public.pdv_preorders%ROWTYPE; v_claim record; v_result jsonb;
BEGIN
  v_company:=public.pdv_preorder_access_company_v2();
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_company,'preorder.assign_terminal.v3',p_idempotency_key,
    jsonb_build_object('id',p_preorder_id,'revision',p_expected_revision,'terminal_id',p_target_terminal_id));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result; END IF;
    RAISE EXCEPTION 'Este direcionamento ainda está sendo processado.' USING ERRCODE='55000',DETAIL='code=pdv_preorder_operation_pending';
  END IF;
  SELECT * INTO v_pre FROM public.pdv_preorders p WHERE p.id=p_preorder_id AND p.company_id=v_company FOR UPDATE;
  IF NOT FOUND OR NOT public.pdv_preorder_can_access_v2(v_pre) THEN
    RAISE EXCEPTION 'Orçamento não encontrado.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_access_denied';
  END IF;
  IF v_pre.status<>'edicao' OR v_pre.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'O orçamento mudou. Atualize antes de escolher o caixa.' USING ERRCODE='40001',DETAIL='code=pdv_preorder_revision_conflict';
  END IF;
  IF p_target_terminal_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.pdv_terminals t
    WHERE t.id=p_target_terminal_id AND t.company_id=v_company AND t.stock_id=v_pre.stock_id AND t.is_active IS TRUE
      AND public.can_access_stock(v_uid,t.stock_id)) THEN
    RAISE EXCEPTION 'Escolha um caixa ativo no mesmo local do orçamento.' USING ERRCODE='23514',DETAIL='code=pdv_preorder_terminal_invalid';
  END IF;
  UPDATE public.pdv_preorders SET target_terminal_id=p_target_terminal_id,revision=revision+1
   WHERE id=p_preorder_id RETURNING * INTO v_pre;
  v_result:=jsonb_build_object('preorder_id',v_pre.id,'revision',v_pre.revision,'status',v_pre.status,'target_terminal_id',v_pre.target_terminal_id);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_preorder',v_pre.id,v_result);
  RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_assign_preorder_terminal_v3(uuid,bigint,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_assign_preorder_terminal_v3(uuid,bigint,uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_list_preorder_terminals_v3()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_company uuid; v_uid uuid:=auth.uid();
BEGIN
  v_company:=public.pdv_preorder_access_company_v2();
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'stock_id',t.stock_id)
    ORDER BY t.sort_order,t.name,t.id) FROM public.pdv_terminals t WHERE t.company_id=v_company
      AND t.is_active IS TRUE AND t.stock_id IS NOT NULL AND public.can_access_stock(v_uid,t.stock_id)),'[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_list_preorder_terminals_v3() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_list_preorder_terminals_v3() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_assert_draft_cash_context_v2(
  p_draft_type text,
  p_cash_session_id uuid,
  p_terminal_id uuid,
  p_stock_id uuid
) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE v_uid uuid:=auth.uid(); v_company uuid; v_session public.pdv_cash_sessions%ROWTYPE;
BEGIN
  v_company:=public.pdv_assert_draft_access();
  IF p_stock_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.stocks s
    WHERE s.id=p_stock_id AND s.company_id=v_company AND s.customer_id IS NULL)
     OR public.can_access_stock(v_uid,p_stock_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Local de estoque indisponível.' USING ERRCODE='42501',DETAIL='code=pdv_draft_stock_denied';
  END IF;
  IF p_draft_type='purchase' THEN
    IF p_cash_session_id IS NOT NULL OR p_terminal_id IS NOT NULL THEN
      RAISE EXCEPTION 'Compra direta usa um local explícito fora da gaveta.' USING ERRCODE='22023',DETAIL='code=pdv_purchase_draft_context_invalid';
    END IF;
    RETURN v_company;
  END IF;
  IF p_draft_type<>'sale' OR p_cash_session_id IS NULL OR p_terminal_id IS NULL THEN
    RAISE EXCEPTION 'Informe caixa, terminal e local do rascunho.' USING ERRCODE='22023',DETAIL='code=pdv_sale_draft_context_required';
  END IF;
  SELECT cs.* INTO v_session FROM public.pdv_cash_sessions cs
   WHERE cs.id=p_cash_session_id AND cs.company_id=v_company AND cs.terminal_id=p_terminal_id
     AND cs.status='aberta' AND cs.contract_version=2
     AND EXISTS(SELECT 1 FROM public.pdv_terminals t WHERE t.id=p_terminal_id
       AND t.company_id=v_company AND t.stock_id=p_stock_id AND t.is_active IS TRUE);
  IF NOT FOUND OR (v_session.opened_by IS DISTINCT FROM v_uid
    AND NOT public.is_super_admin(v_uid)
    AND public.pdv_can_operate_other_cash_v2(v_uid) IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'Este rascunho pertence a outro caixa.' USING ERRCODE='42501',DETAIL='code=pdv_draft_cash_denied';
  END IF;
  RETURN v_company;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_list_order_drafts_v2(
  p_draft_type text,p_cash_session_id uuid,p_terminal_id uuid,p_stock_id uuid,
  p_include_deleted boolean DEFAULT false
) RETURNS SETOF public.pdv_order_drafts
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_uid uuid:=auth.uid(); v_company uuid;
BEGIN
  v_company:=public.pdv_assert_draft_cash_context_v2(p_draft_type,p_cash_session_id,p_terminal_id,p_stock_id);
  RETURN QUERY SELECT d.* FROM public.pdv_order_drafts d
   WHERE d.company_id=v_company AND d.created_by=v_uid AND d.draft_type=p_draft_type
     AND d.cash_session_id IS NOT DISTINCT FROM p_cash_session_id
     AND d.terminal_id IS NOT DISTINCT FROM p_terminal_id AND d.stock_id=p_stock_id
     AND (COALESCE(p_include_deleted,false) OR d.deleted_at IS NULL)
   ORDER BY d.updated_at DESC,d.id;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_save_order_draft_v2(
  p_draft_id uuid,p_draft_type text,p_payload jsonb,p_expected_revision bigint,
  p_client_request_id uuid,p_cash_session_id uuid,p_terminal_id uuid,p_stock_id uuid
) RETURNS public.pdv_order_drafts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_company uuid; v_existing public.pdv_order_drafts%ROWTYPE; v_saved public.pdv_order_drafts%ROWTYPE;
BEGIN
  v_company:=public.pdv_assert_draft_cash_context_v2(p_draft_type,p_cash_session_id,p_terminal_id,p_stock_id);
  SELECT d.* INTO v_existing FROM public.pdv_order_drafts d WHERE d.id=p_draft_id FOR UPDATE;
  IF FOUND AND (v_existing.company_id IS DISTINCT FROM v_company
    OR v_existing.created_by IS DISTINCT FROM auth.uid()
    OR v_existing.draft_type IS DISTINCT FROM p_draft_type
    OR v_existing.cash_session_id IS DISTINCT FROM p_cash_session_id
    OR v_existing.terminal_id IS DISTINCT FROM p_terminal_id
    OR v_existing.stock_id IS DISTINCT FROM p_stock_id) THEN
    RAISE EXCEPTION 'Rascunho indisponível neste caixa.' USING ERRCODE='42501',DETAIL='code=pdv_draft_context_mismatch';
  END IF;
  v_saved:=public.pdv_save_order_draft(p_draft_id,p_draft_type,p_payload,p_expected_revision,p_client_request_id);
  UPDATE public.pdv_order_drafts SET cash_session_id=p_cash_session_id,terminal_id=p_terminal_id,stock_id=p_stock_id
   WHERE id=p_draft_id RETURNING * INTO v_saved;
  RETURN v_saved;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_delete_order_draft_v2(
  p_draft_id uuid,p_expected_revision bigint,p_client_request_id uuid,
  p_draft_type text,p_cash_session_id uuid,p_terminal_id uuid,p_stock_id uuid
) RETURNS public.pdv_order_drafts
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_company uuid; v_existing public.pdv_order_drafts%ROWTYPE;
BEGIN
  v_company:=public.pdv_assert_draft_cash_context_v2(p_draft_type,p_cash_session_id,p_terminal_id,p_stock_id);
  SELECT d.* INTO v_existing FROM public.pdv_order_drafts d WHERE d.id=p_draft_id FOR UPDATE;
  IF NOT FOUND OR v_existing.company_id IS DISTINCT FROM v_company OR v_existing.created_by IS DISTINCT FROM auth.uid()
    OR v_existing.draft_type IS DISTINCT FROM p_draft_type
    OR v_existing.cash_session_id IS DISTINCT FROM p_cash_session_id
    OR v_existing.terminal_id IS DISTINCT FROM p_terminal_id OR v_existing.stock_id IS DISTINCT FROM p_stock_id THEN
    RAISE EXCEPTION 'Rascunho indisponível neste caixa.' USING ERRCODE='42501',DETAIL='code=pdv_draft_context_mismatch';
  END IF;
  RETURN public.pdv_delete_order_draft(p_draft_id,p_expected_revision,p_client_request_id);
END $fn$;

-- Catálogo só projeta a gaveta do operador. Gestor não recebe fallback por
-- cargo: consultar outro caixa requer a permissão nominal abaixo.
CREATE OR REPLACE FUNCTION public.pdv_get_direct_sale_catalog_v2()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_uid uuid:=auth.uid(); v_company uuid; v_can_use_banks boolean; v_other_cash boolean;
BEGIN
  v_company:=public.pdv_direct_sale_rollout_company_v2();
  IF public.pdv_direct_sale_v2_enabled_internal(v_company) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A nova venda direta ainda não está liberada para esta empresa.' USING ERRCODE='42501',DETAIL='code=pdv_direct_sale_rollout_disabled';
  END IF;
  v_can_use_banks:=public.is_admin_or_gestor(v_uid) OR public.is_super_admin(v_uid)
    OR public.pdv_has_explicit_action_permission_v2(v_uid,'fn:use_bank_accounts');
  v_other_cash:=public.pdv_can_operate_other_cash_v2(v_uid);
  RETURN jsonb_build_object(
    'materials',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'sku',i.sku,'barcode',i.barcode,'unit',i.unit,'group_id',i.group_id,'sale_price',i.sale_price,'image_url',i.image_url,'available_by_stock',(SELECT COALESCE(jsonb_agg(jsonb_build_object('stock_id',s.id,'available_quantity',a.available_quantity,'has_conflict',a.has_conflict) ORDER BY s.sort_order,s.name,s.id),'[]'::jsonb) FROM public.stocks s CROSS JOIN LATERAL public.pdv_get_stock_availability_v2(i.id,s.id) a WHERE s.company_id=v_company AND s.customer_id IS NULL AND s.purpose='pdv' AND public.can_access_stock(v_uid,s.id))) ORDER BY i.name,i.id),'[]'::jsonb) FROM public.inventory i WHERE i.company_id=v_company AND i.customer_id IS NULL AND i.archived_at IS NULL AND i.is_sellable IS TRUE AND i.id IN(SELECT public.get_accessible_inventory_ids())),
    'customers',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) ORDER BY c.name,c.id),'[]'::jsonb) FROM public.customers c WHERE c.company_id=v_company AND c.is_deleted IS FALSE),
    'terminals',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'stock_id',t.stock_id) ORDER BY t.sort_order,t.name,t.id),'[]'::jsonb) FROM public.pdv_terminals t WHERE t.company_id=v_company AND t.is_active IS TRUE AND t.stock_id IS NOT NULL AND public.can_access_stock(v_uid,t.stock_id)),
    'sessions',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',cs.id,'terminal_id',cs.terminal_id,'cash_account_id',cs.cash_account_id,'opened_at',cs.opened_at) ORDER BY cs.opened_at,cs.id),'[]'::jsonb) FROM public.pdv_cash_sessions cs WHERE cs.company_id=v_company AND cs.status='aberta' AND cs.contract_version=2 AND (cs.opened_by=v_uid OR v_other_cash) AND EXISTS(SELECT 1 FROM public.pdv_terminals t WHERE t.id=cs.terminal_id AND t.company_id=v_company AND t.is_active IS TRUE AND t.stock_id IS NOT NULL AND public.can_access_stock(v_uid,t.stock_id))),
    'cash_account',(SELECT jsonb_build_object('id',a.id,'name',a.name) FROM public.company_settings s JOIN public.financial_accounts a ON a.id=s.pdv_cash_account_id AND a.company_id=s.company_id AND a.is_active IS TRUE WHERE s.company_id=v_company),
    'bank_accounts',CASE WHEN v_can_use_banks THEN(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'type',a.type,'color',a.color,'institution_code',a.institution_code,'institution_name',a.institution_name,'bank_name',a.bank_name) ORDER BY a.sort_order,a.name,a.id),'[]'::jsonb) FROM public.financial_accounts a WHERE a.company_id=v_company AND a.is_active IS TRUE AND a.type='banco') ELSE '[]'::jsonb END);
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_complete_direct_sale_rollout_v2(
  p_terminal_id uuid,p_cash_session_id uuid,p_cash_account_id uuid,p_customer_id uuid,
  p_cart jsonb,p_payments jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,extensions AS $fn$
DECLARE v_uid uuid:=auth.uid(); v_company uuid; v_owner uuid;
BEGIN
  v_company:=public.pdv_direct_sale_rollout_company_v2();
  IF public.pdv_direct_sale_v2_enabled_internal(v_company) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A nova venda direta ainda não está liberada para esta empresa.' USING ERRCODE='42501',DETAIL='code=pdv_direct_sale_rollout_disabled';
  END IF;
  SELECT cs.opened_by INTO v_owner FROM public.pdv_cash_sessions cs WHERE cs.id=p_cash_session_id
    AND cs.company_id=v_company AND cs.terminal_id=p_terminal_id AND cs.cash_account_id=p_cash_account_id
    AND cs.contract_version=2 AND cs.status='aberta';
  IF NOT FOUND OR (v_owner IS DISTINCT FROM v_uid
    AND public.pdv_can_operate_other_cash_v2(v_uid) IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'Use um caixa v2 aberto por você neste terminal.' USING ERRCODE='42501',DETAIL='code=pdv_direct_sale_session_invalid';
  END IF;
  RETURN public.pdv_complete_direct_sale_v2(p_terminal_id,p_cash_session_id,p_cash_account_id,p_customer_id,p_cart,p_payments,p_idempotency_key);
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_list_cash_queue_v3(p_cash_session_id uuid,p_terminal_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record; v_session public.pdv_cash_sessions%ROWTYPE; v_stock uuid;
BEGIN
  SELECT * INTO v_context FROM public.pdv_counter_context_v2('screen:pdv','fn:cover_pdv_order',true);
  SELECT cs.* INTO v_session FROM public.pdv_cash_sessions cs WHERE cs.id=p_cash_session_id
    AND cs.company_id=v_context.company_id AND cs.terminal_id=p_terminal_id AND cs.status='aberta' AND cs.contract_version=2;
  IF NOT FOUND OR (v_session.opened_by IS DISTINCT FROM v_context.user_id
    AND public.pdv_can_operate_other_cash_v2(v_context.user_id) IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'Use um caixa aberto por você neste terminal.' USING ERRCODE='42501',DETAIL='code=pdv_counter_session_invalid';
  END IF;
  SELECT t.stock_id INTO v_stock FROM public.pdv_terminals t WHERE t.id=p_terminal_id
    AND t.company_id=v_context.company_id AND t.is_active IS TRUE;
  IF v_stock IS NULL OR public.can_access_stock(v_context.user_id,v_stock) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Terminal indisponível.' USING ERRCODE='42501',DETAIL='code=pdv_counter_terminal_invalid';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id) FROM(
    SELECT o.id,o.number,o.customer_id,c.name customer_name,o.stock_id,s.name stock_name,o.total,o.status,o.created_at,
      NOT EXISTS(SELECT 1 FROM public.pdv_order_items item WHERE item.order_id=o.id AND item.item_type='material' AND COALESCE((SELECT sum(r.reserved_quantity-r.consumed_quantity-r.released_quantity-r.shortage_quantity) FROM public.pdv_stock_reservation_items r WHERE r.order_item_id=item.id AND r.state='guaranteed'),0)<item.quantity) reservation_ready
    FROM public.pdv_orders o LEFT JOIN public.customers c ON c.id=o.customer_id AND c.company_id=o.company_id
    JOIN public.stocks s ON s.id=o.stock_id AND s.company_id=o.company_id
    WHERE o.company_id=v_context.company_id AND o.contract_version=2 AND o.operation_mode_snapshot='counter'
      AND o.status='aguardando_pagamento' AND o.stock_id=v_stock AND o.target_terminal_id=p_terminal_id
    ORDER BY o.created_at,o.id LIMIT 200
  )q),'[]'::jsonb);
END $fn$;

ALTER FUNCTION public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text)
  RENAME TO pdv_cover_existing_order_core_015_v2;
REVOKE ALL ON FUNCTION public.pdv_cover_existing_order_core_015_v2(uuid,uuid,uuid,uuid,jsonb,text)
  FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.pdv_cover_existing_order_v2(
  p_order_id uuid,p_terminal_id uuid,p_cash_session_id uuid,p_cash_account_id uuid,
  p_payments jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_uid uuid:=auth.uid(); v_company uuid:=public.get_user_company_id(auth.uid());
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.pdv_cash_sessions s WHERE s.id=p_cash_session_id
    AND s.company_id=v_company AND s.terminal_id=p_terminal_id AND s.cash_account_id=p_cash_account_id
    AND s.status='aberta' AND s.contract_version=2
    AND(s.opened_by=v_uid OR public.pdv_can_operate_other_cash_v2(v_uid))) THEN
    RAISE EXCEPTION 'Use um caixa aberto por você.' USING ERRCODE='42501',DETAIL='code=pdv_counter_session_invalid';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_orders o WHERE o.id=p_order_id AND o.company_id=v_company
    AND o.target_terminal_id=p_terminal_id AND o.cash_session_id IS NULL
    AND o.status='aguardando_pagamento') THEN
    RAISE EXCEPTION 'Este pedido pertence a outro caixa.' USING ERRCODE='42501',DETAIL='code=pdv_counter_terminal_mismatch';
  END IF;
  RETURN public.pdv_cover_existing_order_core_015_v2(p_order_id,p_terminal_id,p_cash_session_id,
    p_cash_account_id,p_payments,p_idempotency_key);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text) TO authenticated,service_role;

ALTER FUNCTION public.pdv_list_cash_sessions_v2(text,uuid,uuid,integer,integer)
  RENAME TO pdv_list_cash_sessions_core_015_v2;
ALTER FUNCTION public.pdv_cash_session_detail_v2(uuid)
  RENAME TO pdv_cash_session_detail_core_015_v2;
ALTER FUNCTION public.pdv_cash_history_v2(uuid,uuid,integer,integer)
  RENAME TO pdv_cash_history_core_015_v2;
ALTER FUNCTION public.pdv_cash_session_report_v2(uuid)
  RENAME TO pdv_cash_session_report_core_015_v2;
REVOKE ALL ON FUNCTION public.pdv_list_cash_sessions_core_015_v2(text,uuid,uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_cash_session_detail_core_015_v2(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_cash_history_core_015_v2(uuid,uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_cash_session_report_core_015_v2(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.pdv_list_cash_sessions_v2(p_status text,p_terminal_id uuid DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,p_page integer DEFAULT 0,p_page_size integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_uid uuid:=auth.uid(); v_result jsonb;
BEGIN
  IF public.pdv_can_operate_other_cash_v2(v_uid) IS DISTINCT FROM true THEN
    IF p_operator_id IS NOT NULL AND p_operator_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Você não pode consultar outro operador.' USING ERRCODE='42501',DETAIL='PDV_CASH_SESSION_FORBIDDEN';
    END IF;
    p_operator_id:=v_uid;
  END IF;
  v_result:=public.pdv_list_cash_sessions_core_015_v2(p_status,p_terminal_id,p_operator_id,p_page,p_page_size);
  RETURN jsonb_set(v_result,'{can_manage_others}',to_jsonb(public.pdv_can_operate_other_cash_v2(v_uid)),true);
END $fn$;

CREATE FUNCTION public.pdv_cash_session_detail_v2(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.pdv_cash_sessions s WHERE s.id=p_session_id
    AND s.company_id=public.get_user_company_id(auth.uid())
    AND(s.opened_by=auth.uid() OR public.pdv_can_operate_other_cash_v2(auth.uid()))) THEN
    RAISE EXCEPTION 'Este caixa pertence a outro operador.' USING ERRCODE='42501',DETAIL='PDV_CASH_SESSION_FORBIDDEN';
  END IF;
  RETURN public.pdv_cash_session_detail_core_015_v2(p_session_id);
END $fn$;

CREATE FUNCTION public.pdv_cash_history_v2(p_terminal_id uuid DEFAULT NULL,p_operator_id uuid DEFAULT NULL,
  p_page integer DEFAULT 0,p_page_size integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_uid uuid:=auth.uid();
BEGIN
  IF public.pdv_can_operate_other_cash_v2(v_uid) IS DISTINCT FROM true THEN
    IF p_operator_id IS NOT NULL AND p_operator_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Você não pode consultar outro operador.' USING ERRCODE='42501',DETAIL='PDV_CASH_SESSION_FORBIDDEN';
    END IF;
    p_operator_id:=v_uid;
  END IF;
  RETURN public.pdv_cash_history_core_015_v2(p_terminal_id,p_operator_id,p_page,p_page_size);
END $fn$;

CREATE FUNCTION public.pdv_cash_session_report_v2(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.pdv_cash_sessions s WHERE s.id=p_session_id
    AND s.company_id=public.get_user_company_id(auth.uid())
    AND(s.opened_by=auth.uid() OR public.pdv_can_operate_other_cash_v2(auth.uid()))) THEN
    RAISE EXCEPTION 'Este caixa pertence a outro operador.' USING ERRCODE='42501',DETAIL='PDV_CASH_SESSION_FORBIDDEN';
  END IF;
  RETURN public.pdv_cash_session_report_core_015_v2(p_session_id);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_list_cash_sessions_v2(text,uuid,uuid,integer,integer),
  public.pdv_cash_session_detail_v2(uuid),public.pdv_cash_history_v2(uuid,uuid,integer,integer),
  public.pdv_cash_session_report_v2(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_list_cash_sessions_v2(text,uuid,uuid,integer,integer),
  public.pdv_cash_session_detail_v2(uuid),public.pdv_cash_history_v2(uuid,uuid,integer,integer),
  public.pdv_cash_session_report_v2(uuid) TO authenticated,service_role;

-- Reabertura exige a capacidade própria e, quando a origem pertence a outro
-- operador, também a capacidade explícita de operar caixa alheio. O trigger é
-- a última barreira mesmo se outra RPC tentar inserir uma continuação.
CREATE OR REPLACE FUNCTION public.pdv_guard_reopen_operator_isolation_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_uid uuid:=auth.uid(); v_owner uuid;
BEGIN
  IF NEW.reopened_from_session_id IS NULL THEN RETURN NEW; END IF;
  SELECT s.opened_by INTO v_owner FROM public.pdv_cash_sessions s
   WHERE s.id=NEW.reopened_from_session_id AND s.company_id=NEW.company_id;
  IF NOT FOUND OR (NOT public.is_super_admin(v_uid)
    AND public.pdv_has_explicit_action_permission_v2(v_uid,'fn:reopen_pdv_cash') IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'Você não tem permissão para reabrir caixas.' USING ERRCODE='42501',DETAIL='PDV_CASH_REOPEN_FORBIDDEN';
  END IF;
  IF v_owner IS DISTINCT FROM v_uid AND public.pdv_can_operate_other_cash_v2(v_uid) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não pode reabrir o caixa de outro operador.' USING ERRCODE='42501',DETAIL='PDV_CASH_SESSION_FORBIDDEN';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS tg_pdv_guard_reopen_operator_isolation_v2 ON public.pdv_cash_sessions;
CREATE TRIGGER tg_pdv_guard_reopen_operator_isolation_v2 BEFORE INSERT ON public.pdv_cash_sessions
FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_reopen_operator_isolation_v2();
REVOKE ALL ON FUNCTION public.pdv_guard_reopen_operator_isolation_v2() FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.pdv_list_order_drafts(text,boolean) FROM authenticated;
REVOKE ALL ON FUNCTION public.pdv_save_order_draft(uuid,text,jsonb,bigint,uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.pdv_delete_order_draft(uuid,bigint,uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.pdv_list_cash_queue_v2() FROM authenticated;
REVOKE ALL ON FUNCTION public.pdv_assert_draft_cash_context_v2(text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.pdv_list_order_drafts_v2(text,uuid,uuid,uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_save_order_draft_v2(uuid,text,jsonb,bigint,uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_delete_order_draft_v2(uuid,bigint,uuid,text,uuid,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_list_cash_queue_v3(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_list_order_drafts_v2(text,uuid,uuid,uuid,boolean) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_save_order_draft_v2(uuid,text,jsonb,bigint,uuid,uuid,uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_delete_order_draft_v2(uuid,bigint,uuid,text,uuid,uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_list_cash_queue_v3(uuid,uuid) TO authenticated,service_role;

-- Fonte unica de autorizacao de leitura de um pedido. Um pedido pago pertence
-- a abertura que o recebeu. Antes do pagamento, a fila pertence somente ao
-- Caixa explicitamente escolhido no orcamento.
CREATE OR REPLACE FUNCTION public.pdv_order_actor_can_access_v2(p_order_id uuid,p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT EXISTS(
    SELECT 1 FROM public.pdv_orders o
    WHERE o.id=p_order_id
      AND o.company_id=public.get_user_company_id(p_user_id)
      AND (
        public.pdv_can_operate_other_cash_v2(p_user_id)
        OR EXISTS(SELECT 1 FROM public.pdv_cash_sessions owned
          WHERE owned.id=o.cash_session_id AND owned.company_id=o.company_id
            AND owned.opened_by=p_user_id)
        OR (o.cash_session_id IS NULL AND o.target_terminal_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.pdv_cash_sessions active
          WHERE active.company_id=o.company_id AND active.terminal_id=o.target_terminal_id
            AND active.opened_by=p_user_id AND active.status='aberta' AND active.contract_version=2
        ))
      )
  );
$fn$;
REVOKE ALL ON FUNCTION public.pdv_order_actor_can_access_v2(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.pdv_current_actor_can_operate_other_cash_v3()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT public.pdv_can_operate_other_cash_v2(auth.uid());
$fn$;
CREATE OR REPLACE FUNCTION public.pdv_current_actor_can_access_order_v3(p_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT public.pdv_order_actor_can_access_v2(p_order_id,auth.uid());
$fn$;
CREATE OR REPLACE FUNCTION public.pdv_current_actor_can_access_session_v3(p_session_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT EXISTS(SELECT 1 FROM public.pdv_cash_sessions s
    WHERE s.id=p_session_id AND s.company_id=public.get_user_company_id(auth.uid())
      AND(s.opened_by=auth.uid() OR public.pdv_can_operate_other_cash_v2(auth.uid())));
$fn$;
REVOKE ALL ON FUNCTION public.pdv_current_actor_can_operate_other_cash_v3() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_current_actor_can_access_order_v3(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_current_actor_can_access_session_v3(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_current_actor_can_operate_other_cash_v3(),
  public.pdv_current_actor_can_access_order_v3(uuid),
  public.pdv_current_actor_can_access_session_v3(uuid) TO authenticated,service_role;

-- PostgREST nao e uma segunda API de escrita do caixa. Todas as mutacoes
-- passam pelas RPCs transacionais; SELECT herda a custodia exata.
DO $rls$
DECLARE v_policy record;
BEGIN
  FOR v_policy IN SELECT policyname,tablename FROM pg_policies
    WHERE schemaname='public' AND tablename IN(
      'pdv_cash_sessions','pdv_cash_movements','pdv_orders','pdv_order_items','pdv_order_payments'
    )
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',v_policy.policyname,v_policy.tablename); END LOOP;
END $rls$;

REVOKE INSERT,UPDATE,DELETE ON public.pdv_cash_sessions,public.pdv_cash_movements,
  public.pdv_orders,public.pdv_order_items,public.pdv_order_payments FROM authenticated;
GRANT SELECT ON public.pdv_cash_sessions,public.pdv_cash_movements,
  public.pdv_orders,public.pdv_order_items,public.pdv_order_payments TO authenticated;

CREATE POLICY pdv_cash_sessions_select_operator_v2 ON public.pdv_cash_sessions FOR SELECT TO authenticated
USING(company_id=public.get_user_company_id(auth.uid()) AND
  (opened_by=auth.uid() OR public.pdv_current_actor_can_operate_other_cash_v3()));
CREATE POLICY pdv_cash_movements_select_operator_v2 ON public.pdv_cash_movements FOR SELECT TO authenticated
USING(company_id=public.get_user_company_id(auth.uid()) AND public.pdv_current_actor_can_access_session_v3(session_id));
CREATE POLICY pdv_orders_select_operator_v2 ON public.pdv_orders FOR SELECT TO authenticated
USING(public.pdv_current_actor_can_access_order_v3(id));
CREATE POLICY pdv_order_items_select_operator_v2 ON public.pdv_order_items FOR SELECT TO authenticated
USING(company_id=public.get_user_company_id(auth.uid()) AND public.pdv_current_actor_can_access_order_v3(order_id));
CREATE POLICY pdv_order_payments_select_operator_v2 ON public.pdv_order_payments FOR SELECT TO authenticated
USING(company_id=public.get_user_company_id(auth.uid()) AND public.pdv_current_actor_can_access_order_v3(order_id));

-- Contratos antigos inferiam a primeira abertura ou aceitavam UUID arbitrario.
-- Permanecem para service_role/backfill, nunca para operacao autenticada.
REVOKE EXECUTE ON FUNCTION public.pdv_close_cash_session(uuid,numeric,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pdv_cash_movement(uuid,text,numeric,uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pdv_revert_cash_movement(uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pdv_settle_order(uuid,jsonb,text,date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pdv_cancel_order(uuid,text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.pdv_assert_order_cash_access_v2(p_order_id uuid,p_user_id uuid DEFAULT auth.uid())
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF public.pdv_order_actor_can_access_v2(p_order_id,p_user_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Este pedido pertence a outro caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_order_cash_access_denied';
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_assert_order_cash_access_v2(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Devolucao e pos-venda sao SECURITY DEFINER. O recorte por estoque continua
-- sendo aplicado, mas nao substitui a custodia do Caixa. Os cores preservam
-- as regras monetarias e ficam inacessiveis; wrappers publicos aplicam o gate.
ALTER FUNCTION public.pdv_get_returnable_order_v2(uuid) RENAME TO pdv_get_returnable_order_core_015_v2;
ALTER FUNCTION public.pdv_return_delivery_items_v2(uuid,jsonb,jsonb,date,text,text) RENAME TO pdv_return_delivery_items_core_015_v2;
ALTER FUNCTION public.pdv_reverse_commercial_return_v2(uuid,text,text) RENAME TO pdv_reverse_commercial_return_core_015_v2;
ALTER FUNCTION public.pdv_cancel_order_residual_v2(uuid,text,text) RENAME TO pdv_cancel_order_residual_core_015_v2;
ALTER FUNCTION public.pdv_issue_return_voucher_v2(uuid,numeric,date,text) RENAME TO pdv_issue_return_voucher_core_015_v2;
ALTER FUNCTION public.pdv_request_return_refund_v2(uuid,uuid,numeric,text,uuid,uuid,text) RENAME TO pdv_request_return_refund_core_015_v2;
ALTER FUNCTION public.pdv_confirm_return_refund_v2(uuid,uuid,text,text) RENAME TO pdv_confirm_return_refund_core_015_v2;
ALTER FUNCTION public.pdv_reverse_return_refund_v2(uuid,text,text) RENAME TO pdv_reverse_return_refund_core_015_v2;
ALTER FUNCTION public.pdv_reverse_return_voucher_v2(uuid,text,text) RENAME TO pdv_reverse_return_voucher_core_015_v2;
ALTER FUNCTION public.pdv_cover_exchange_order_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text) RENAME TO pdv_cover_exchange_order_core_015_v2;
ALTER FUNCTION public.pdv_get_after_sale_context_v2(uuid) RENAME TO pdv_get_after_sale_context_core_015_v2;
ALTER FUNCTION public.pdv_get_after_sale_workspace_v2(uuid) RENAME TO pdv_get_after_sale_workspace_core_015_v2;
ALTER FUNCTION public.pdv_apply_voucher_to_order_v2(uuid,uuid,numeric,text) RENAME TO pdv_apply_voucher_to_order_core_015_v2;

CREATE FUNCTION public.pdv_get_returnable_order_v2(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.pdv_assert_order_cash_access_v2(p_order_id,auth.uid()); RETURN public.pdv_get_returnable_order_core_015_v2(p_order_id); END $fn$;
CREATE FUNCTION public.pdv_return_delivery_items_v2(p_order_id uuid,p_lines jsonb,p_dispositions jsonb,p_occurred_on date,p_reason text,p_idempotency_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.pdv_assert_order_cash_access_v2(p_order_id,auth.uid()); RETURN public.pdv_return_delivery_items_core_015_v2(p_order_id,p_lines,p_dispositions,p_occurred_on,p_reason,p_idempotency_key); END $fn$;
CREATE FUNCTION public.pdv_reverse_commercial_return_v2(p_return_id uuid,p_reason text,p_idempotency_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.pdv_assert_order_cash_access_v2((SELECT r.order_id FROM public.pdv_commercial_returns r WHERE r.id=p_return_id),auth.uid()); RETURN public.pdv_reverse_commercial_return_core_015_v2(p_return_id,p_reason,p_idempotency_key); END $fn$;
CREATE FUNCTION public.pdv_cancel_order_residual_v2(p_order_id uuid,p_reason text,p_idempotency_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.pdv_assert_order_cash_access_v2(p_order_id,auth.uid()); RETURN public.pdv_cancel_order_residual_core_015_v2(p_order_id,p_reason,p_idempotency_key); END $fn$;
CREATE FUNCTION public.pdv_issue_return_voucher_v2(p_return_id uuid,p_amount numeric,p_expires_on date,p_idempotency_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.pdv_assert_order_cash_access_v2((SELECT r.order_id FROM public.pdv_commercial_returns r WHERE r.id=p_return_id),auth.uid()); RETURN public.pdv_issue_return_voucher_core_015_v2(p_return_id,p_amount,p_expires_on,p_idempotency_key); END $fn$;
CREATE FUNCTION public.pdv_request_return_refund_v2(p_return_id uuid,p_original_payment_id uuid,p_amount numeric,p_reason text,p_account_id uuid,p_cash_session_id uuid,p_idempotency_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.pdv_assert_order_cash_access_v2((SELECT r.order_id FROM public.pdv_commercial_returns r WHERE r.id=p_return_id),auth.uid()); IF p_cash_session_id IS NOT NULL AND public.pdv_current_actor_can_access_session_v3(p_cash_session_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Escolha um caixa aberto por você.' USING ERRCODE='42501',DETAIL='code=pdv_refund_cash_denied'; END IF; RETURN public.pdv_request_return_refund_core_015_v2(p_return_id,p_original_payment_id,p_amount,p_reason,p_account_id,p_cash_session_id,p_idempotency_key); END $fn$;
CREATE FUNCTION public.pdv_confirm_return_refund_v2(p_refund_id uuid,p_account_id uuid,p_confirmation_reference text,p_idempotency_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.pdv_assert_order_cash_access_v2((SELECT r.order_id FROM public.pdv_refunds f JOIN public.pdv_commercial_returns r ON r.id=f.commercial_return_id WHERE f.id=p_refund_id),auth.uid()); RETURN public.pdv_confirm_return_refund_core_015_v2(p_refund_id,p_account_id,p_confirmation_reference,p_idempotency_key); END $fn$;
CREATE FUNCTION public.pdv_reverse_return_refund_v2(p_refund_id uuid,p_reason text,p_idempotency_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.pdv_assert_order_cash_access_v2((SELECT r.order_id FROM public.pdv_refunds f JOIN public.pdv_commercial_returns r ON r.id=f.commercial_return_id WHERE f.id=p_refund_id),auth.uid()); RETURN public.pdv_reverse_return_refund_core_015_v2(p_refund_id,p_reason,p_idempotency_key); END $fn$;
CREATE FUNCTION public.pdv_reverse_return_voucher_v2(p_voucher_id uuid,p_reason text,p_idempotency_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.pdv_assert_order_cash_access_v2((SELECT r.order_id FROM public.pdv_vouchers v JOIN public.pdv_commercial_returns r ON r.id=v.source_commercial_return_id WHERE v.id=p_voucher_id),auth.uid()); RETURN public.pdv_reverse_return_voucher_core_015_v2(p_voucher_id,p_reason,p_idempotency_key); END $fn$;
CREATE FUNCTION public.pdv_cover_exchange_order_v2(p_return_id uuid,p_new_order_id uuid,p_voucher_id uuid,p_voucher_amount numeric,p_credit_amount numeric,p_difference_method text,p_difference_account_id uuid,p_cash_session_id uuid,p_idempotency_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.pdv_assert_order_cash_access_v2((SELECT r.order_id FROM public.pdv_commercial_returns r WHERE r.id=p_return_id),auth.uid()); PERFORM public.pdv_assert_order_cash_access_v2(p_new_order_id,auth.uid()); IF p_cash_session_id IS NOT NULL AND public.pdv_current_actor_can_access_session_v3(p_cash_session_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Escolha um caixa aberto por você.' USING ERRCODE='42501',DETAIL='code=pdv_exchange_cash_denied'; END IF; RETURN public.pdv_cover_exchange_order_core_015_v2(p_return_id,p_new_order_id,p_voucher_id,p_voucher_amount,p_credit_amount,p_difference_method,p_difference_account_id,p_cash_session_id,p_idempotency_key); END $fn$;
CREATE FUNCTION public.pdv_get_after_sale_context_v2(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.pdv_assert_order_cash_access_v2(p_order_id,auth.uid()); RETURN public.pdv_get_after_sale_context_core_015_v2(p_order_id); END $fn$;
CREATE FUNCTION public.pdv_get_after_sale_workspace_v2(p_order_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_result jsonb; v_filtered jsonb;
BEGIN
  PERFORM public.pdv_assert_order_cash_access_v2(p_order_id,auth.uid());
  v_result:=public.pdv_get_after_sale_workspace_core_015_v2(p_order_id);
  IF public.pdv_can_operate_other_cash_v2(auth.uid()) IS DISTINCT FROM true THEN
    SELECT COALESCE(jsonb_agg(option),'[]'::jsonb) INTO v_filtered
      FROM jsonb_array_elements(COALESCE(v_result->'cash_options','[]'::jsonb)) option
      WHERE public.pdv_current_actor_can_access_session_v3((option->>'session_id')::uuid);
    v_result:=jsonb_set(v_result,'{cash_options}',v_filtered,true);
    SELECT COALESCE(jsonb_agg(candidate),'[]'::jsonb) INTO v_filtered
      FROM jsonb_array_elements(COALESCE(v_result->'order_candidates','[]'::jsonb)) candidate
      WHERE public.pdv_current_actor_can_access_order_v3((candidate->>'order_id')::uuid);
    v_result:=jsonb_set(v_result,'{order_candidates}',v_filtered,true);
    SELECT COALESCE(jsonb_agg(candidate),'[]'::jsonb) INTO v_filtered
      FROM jsonb_array_elements(COALESCE(v_result->'exchange_candidates','[]'::jsonb)) candidate
      WHERE public.pdv_current_actor_can_access_order_v3((candidate->>'order_id')::uuid);
    v_result:=jsonb_set(v_result,'{exchange_candidates}',v_filtered,true);
  END IF;
  RETURN v_result;
END $fn$;
CREATE FUNCTION public.pdv_apply_voucher_to_order_v2(p_order_id uuid,p_voucher_id uuid,p_amount numeric,p_idempotency_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN PERFORM public.pdv_assert_order_cash_access_v2(p_order_id,auth.uid()); RETURN public.pdv_apply_voucher_to_order_core_015_v2(p_order_id,p_voucher_id,p_amount,p_idempotency_key); END $fn$;

REVOKE ALL ON FUNCTION public.pdv_get_returnable_order_core_015_v2(uuid),public.pdv_return_delivery_items_core_015_v2(uuid,jsonb,jsonb,date,text,text),public.pdv_reverse_commercial_return_core_015_v2(uuid,text,text),public.pdv_cancel_order_residual_core_015_v2(uuid,text,text),public.pdv_issue_return_voucher_core_015_v2(uuid,numeric,date,text),public.pdv_request_return_refund_core_015_v2(uuid,uuid,numeric,text,uuid,uuid,text),public.pdv_confirm_return_refund_core_015_v2(uuid,uuid,text,text),public.pdv_reverse_return_refund_core_015_v2(uuid,text,text),public.pdv_reverse_return_voucher_core_015_v2(uuid,text,text),public.pdv_cover_exchange_order_core_015_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text),public.pdv_get_after_sale_context_core_015_v2(uuid),public.pdv_get_after_sale_workspace_core_015_v2(uuid),public.pdv_apply_voucher_to_order_core_015_v2(uuid,uuid,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_get_returnable_order_v2(uuid),public.pdv_return_delivery_items_v2(uuid,jsonb,jsonb,date,text,text),public.pdv_reverse_commercial_return_v2(uuid,text,text),public.pdv_cancel_order_residual_v2(uuid,text,text),public.pdv_issue_return_voucher_v2(uuid,numeric,date,text),public.pdv_request_return_refund_v2(uuid,uuid,numeric,text,uuid,uuid,text),public.pdv_confirm_return_refund_v2(uuid,uuid,text,text),public.pdv_reverse_return_refund_v2(uuid,text,text),public.pdv_reverse_return_voucher_v2(uuid,text,text),public.pdv_cover_exchange_order_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text),public.pdv_get_after_sale_context_v2(uuid),public.pdv_get_after_sale_workspace_v2(uuid),public.pdv_apply_voucher_to_order_v2(uuid,uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_get_returnable_order_v2(uuid),public.pdv_return_delivery_items_v2(uuid,jsonb,jsonb,date,text,text),public.pdv_reverse_commercial_return_v2(uuid,text,text),public.pdv_cancel_order_residual_v2(uuid,text,text),public.pdv_issue_return_voucher_v2(uuid,numeric,date,text),public.pdv_request_return_refund_v2(uuid,uuid,numeric,text,uuid,uuid,text),public.pdv_confirm_return_refund_v2(uuid,uuid,text,text),public.pdv_reverse_return_refund_v2(uuid,text,text),public.pdv_reverse_return_voucher_v2(uuid,text,text),public.pdv_cover_exchange_order_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text),public.pdv_get_after_sale_context_v2(uuid),public.pdv_get_after_sale_workspace_v2(uuid),public.pdv_apply_voucher_to_order_v2(uuid,uuid,numeric,text) TO authenticated,service_role;

-- O Kanban e o detalhe deixam de usar empresa/estoque como custodia. Orcamento
-- em edicao e pessoal; depois de encaminhado, somente o Caixa de destino ve.
ALTER FUNCTION public.pdv_list_sales_flow_v2() RENAME TO pdv_list_sales_flow_core_015_v2;
ALTER FUNCTION public.pdv_get_sales_flow_order_v2(uuid) RENAME TO pdv_get_sales_flow_order_core_015_v2;
REVOKE ALL ON FUNCTION public.pdv_list_sales_flow_core_015_v2(),public.pdv_get_sales_flow_order_core_015_v2(uuid)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.pdv_list_sales_flow_v2()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_uid uuid:=auth.uid(); v_company uuid:=public.get_user_company_id(auth.uid()); v_cards jsonb;
BEGIN
  v_cards:=public.pdv_list_sales_flow_core_015_v2();
  RETURN COALESCE((SELECT jsonb_agg(entry.card ORDER BY entry.ordinality)
    FROM jsonb_array_elements(v_cards) WITH ORDINALITY entry(card,ordinality)
    WHERE (entry.card->>'order_id' IS NOT NULL
      AND public.pdv_order_actor_can_access_v2((entry.card->>'order_id')::uuid,v_uid))
    OR (entry.card->>'order_id' IS NULL AND entry.card->>'preorder_id' IS NOT NULL
      AND EXISTS(SELECT 1 FROM public.pdv_preorders p
        WHERE p.id=(entry.card->>'preorder_id')::uuid AND p.company_id=v_company
          AND (public.pdv_can_operate_other_cash_v2(v_uid)
            OR (p.status='edicao' AND p.created_by=v_uid)
            OR EXISTS(SELECT 1 FROM public.pdv_cash_sessions s WHERE s.company_id=v_company
              AND s.terminal_id=p.target_terminal_id AND s.opened_by=v_uid
              AND s.status='aberta' AND s.contract_version=2))))),'[]'::jsonb);
END $fn$;

CREATE FUNCTION public.pdv_get_sales_flow_order_v2(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  PERFORM public.pdv_assert_order_cash_access_v2(p_order_id,auth.uid());
  RETURN public.pdv_get_sales_flow_order_core_015_v2(p_order_id);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_list_sales_flow_v2(),public.pdv_get_sales_flow_order_v2(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_list_sales_flow_v2(),public.pdv_get_sales_flow_order_v2(uuid) TO authenticated,service_role;

COMMIT;

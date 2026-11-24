-- Recuperação operacional de cupom inválido no pedido já convertido.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
ALTER TABLE public.pdv_orders ADD COLUMN coupon_revision_v1 integer NOT NULL DEFAULT 0 CHECK(coupon_revision_v1>=0);
CREATE FUNCTION public.pdv_pending_coupon_order_internal_v1(p_order_id uuid,p_terminal_id uuid,p_cash_session_id uuid,p_cash_account_id uuid)
RETURNS public.pdv_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ctx record; session public.pdv_cash_sessions; o public.pdv_orders;
BEGIN
 SELECT * INTO ctx FROM public.pdv_counter_context_v2('screen:pdv','fn:cover_pdv_order',true);
 session:=public.pdv_assert_cash_session_actor_v3(p_cash_session_id,p_cash_account_id,true);
 SELECT * INTO o FROM public.pdv_orders WHERE id=p_order_id AND company_id=ctx.company_id FOR UPDATE;
 -- Revalida após espera de lock; troca de empresa/revogação falha fechado.
 SELECT * INTO ctx FROM public.pdv_counter_context_v2('screen:pdv','fn:cover_pdv_order',true);
 session:=public.pdv_assert_cash_session_actor_v3(p_cash_session_id,p_cash_account_id,true);
 IF o.id IS NULL OR o.company_id IS DISTINCT FROM ctx.company_id OR o.contract_version<>2 OR o.operation_mode_snapshot<>'counter' OR o.status<>'aguardando_pagamento'
  OR o.target_terminal_id IS DISTINCT FROM p_terminal_id OR session.terminal_id IS DISTINCT FROM p_terminal_id
  OR o.cash_session_id IS NOT NULL OR o.terminal_id IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM public.pdv_terminals t WHERE t.id=p_terminal_id AND t.company_id=ctx.company_id AND t.is_active AND t.stock_id=o.stock_id AND public.can_access_stock(ctx.user_id,t.stock_id))
  OR EXISTS(SELECT 1 FROM public.pdv_order_payments p WHERE p.order_id=o.id)
  OR EXISTS(SELECT 1 FROM public.pdv_coupon_usages u WHERE u.order_id=o.id) THEN
  RAISE EXCEPTION 'Este pedido não está disponível para alterar o cupom neste caixa.' USING ERRCODE='42501',DETAIL='code=pdv_coupon_order_state'; END IF;
 RETURN o;
END $fn$;
CREATE FUNCTION public.pdv_order_coupon_snapshot_internal_v1(p_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('order_id',o.id,'revision',o.coupon_revision_v1,'customer_id',o.customer_id,'total',o.total,'coupon_id',o.coupon_id,'coupon_code',c.code,'discount_cents',round(o.coupon_discount_amount_v1*100)::bigint,
  'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'inventory_id',i.inventory_id,'net_cents',round((i.total+i.coupon_discount_amount_v1)*100)::bigint) ORDER BY i.id) FROM public.pdv_order_items i WHERE i.order_id=o.id),'[]'::jsonb))
 FROM public.pdv_orders o LEFT JOIN public.pdv_coupons c ON c.id=o.coupon_id AND c.company_id=o.company_id WHERE o.id=p_order_id;
$fn$;
CREATE FUNCTION public.pdv_get_pending_order_coupon_v1(p_order_id uuid,p_terminal_id uuid,p_cash_session_id uuid,p_cash_account_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM public.pdv_pending_coupon_order_internal_v1(p_order_id,p_terminal_id,p_cash_session_id,p_cash_account_id);
 RETURN public.pdv_order_coupon_snapshot_internal_v1(p_order_id);
END $fn$;
CREATE FUNCTION public.pdv_set_pending_order_coupon_v1(p_order_id uuid,p_terminal_id uuid,p_cash_session_id uuid,p_cash_account_id uuid,p_coupon_id uuid,p_expected_discount_cents bigint,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE o public.pdv_orders;
BEGIN
 o:=public.pdv_pending_coupon_order_internal_v1(p_order_id,p_terminal_id,p_cash_session_id,p_cash_account_id);
 IF p_expected_revision IS NULL OR o.coupon_revision_v1 IS DISTINCT FROM p_expected_revision THEN
  -- Replay da mesma escolha pendente, sem nova alteração/revisão nem consumo.
  IF o.coupon_revision_v1=p_expected_revision+1 AND o.coupon_id IS NOT DISTINCT FROM p_coupon_id AND round(o.coupon_discount_amount_v1*100)::bigint IS NOT DISTINCT FROM p_expected_discount_cents THEN RETURN public.pdv_order_coupon_snapshot_internal_v1(o.id); END IF;
  RAISE EXCEPTION 'O pedido mudou em outra sessão. Atualize antes de alterar o cupom.' USING ERRCODE='40001',DETAIL='code=pdv_coupon_conflict'; END IF;
 PERFORM public.pdv_apply_order_coupon_internal_v1(o.id,p_coupon_id,p_expected_discount_cents);
 UPDATE public.pdv_orders SET coupon_revision_v1=coupon_revision_v1+1 WHERE id=o.id;
 RETURN public.pdv_order_coupon_snapshot_internal_v1(o.id);
END $fn$;
-- A rota anterior permanece válida somente para pedidos sem história de cupom.
-- A implementação original conserva autoria, replay, hash e o core financeiro;
-- ambas as entradas tomam treasury→order na ordem canônica antes do guard.
ALTER FUNCTION public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text) RENAME TO pdv_cover_existing_order_coupon_core_v1;
REVOKE ALL ON FUNCTION public.pdv_cover_existing_order_coupon_core_v1(uuid,uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.pdv_cover_existing_order_v2(p_order_id uuid,p_terminal_id uuid,p_cash_session_id uuid,p_cash_account_id uuid,p_payments jsonb,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ctx record; o public.pdv_orders; session public.pdv_cash_sessions;
BEGIN
 SELECT * INTO ctx FROM public.pdv_counter_context_v2('screen:pdv','fn:cover_pdv_order',true);
 session:=public.pdv_assert_cash_session_actor_v3(p_cash_session_id,p_cash_account_id,false);
 IF session.terminal_id IS DISTINCT FROM p_terminal_id THEN RAISE EXCEPTION 'Use a abertura correta deste caixa.' USING ERRCODE='42501',DETAIL='code=pdv_coupon_order_state'; END IF;
 PERFORM public.pdv_lock_treasury_account(ctx.company_id,p_cash_account_id);
 SELECT * INTO o FROM public.pdv_orders WHERE id=p_order_id AND company_id=ctx.company_id FOR UPDATE;
 IF NOT FOUND OR o.coupon_id IS NOT NULL OR o.coupon_revision_v1<>0 THEN
  RAISE EXCEPTION 'O desconto do pedido mudou. Reabra o recebimento para conferir o total.' USING ERRCODE='40001',DETAIL='code=pdv_coupon_conflict'; END IF;
 RETURN public.pdv_cover_existing_order_coupon_core_v1(p_order_id,p_terminal_id,p_cash_session_id,p_cash_account_id,p_payments,p_idempotency_key);
END $fn$;
CREATE FUNCTION public.pdv_cover_existing_order_coupon_v1(p_order_id uuid,p_terminal_id uuid,p_cash_session_id uuid,p_cash_account_id uuid,p_payments jsonb,p_idempotency_key text,p_expected_coupon_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ctx record; o public.pdv_orders; session public.pdv_cash_sessions;
BEGIN
 SELECT * INTO ctx FROM public.pdv_counter_context_v2('screen:pdv','fn:cover_pdv_order',true);
 session:=public.pdv_assert_cash_session_actor_v3(p_cash_session_id,p_cash_account_id,false);
 IF session.terminal_id IS DISTINCT FROM p_terminal_id THEN RAISE EXCEPTION 'Use a abertura correta deste caixa.' USING ERRCODE='42501',DETAIL='code=pdv_coupon_order_state'; END IF;
 PERFORM public.pdv_lock_treasury_account(ctx.company_id,p_cash_account_id);
 SELECT * INTO o FROM public.pdv_orders WHERE id=p_order_id AND company_id=ctx.company_id FOR UPDATE;
 IF NOT FOUND OR o.coupon_revision_v1 IS DISTINCT FROM p_expected_coupon_revision THEN RAISE EXCEPTION 'O desconto do pedido mudou. Reabra o recebimento para conferir o total.' USING ERRCODE='40001',DETAIL='code=pdv_coupon_conflict'; END IF;
 RETURN public.pdv_cover_existing_order_coupon_core_v1(p_order_id,p_terminal_id,p_cash_session_id,p_cash_account_id,p_payments,p_idempotency_key);
END $fn$;
DO $queue_revision$
DECLARE s text; a text; b text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_list_cash_queue_v3(uuid,uuid)'::regprocedure) INTO s;
 a:=$a$o.total,o.status$a$; b:=$b$o.total,o.coupon_revision_v1 coupon_revision,o.status$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A fila do caixa mudou antes do controle de revisão do cupom.'; END IF; EXECUTE replace(s,a,b);
END $queue_revision$;
CREATE FUNCTION public.pdv_guard_coupon_revision_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF current_user IN ('authenticated','anon') AND ((TG_OP='INSERT' AND NEW.coupon_revision_v1<>0) OR (TG_OP='UPDATE' AND NEW.coupon_revision_v1 IS DISTINCT FROM OLD.coupon_revision_v1)) THEN
  RAISE EXCEPTION 'Atualize o cupom pelo atendimento da venda.' USING ERRCODE='42501',DETAIL='code=pdv_coupon_permission'; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER pdv_orders_coupon_revision_guard BEFORE INSERT OR UPDATE ON public.pdv_orders FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_coupon_revision_v1();
REVOKE ALL ON FUNCTION public.pdv_guard_coupon_revision_v1() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_pending_coupon_order_internal_v1(uuid,uuid,uuid,uuid),public.pdv_order_coupon_snapshot_internal_v1(uuid),public.pdv_get_pending_order_coupon_v1(uuid,uuid,uuid,uuid),public.pdv_set_pending_order_coupon_v1(uuid,uuid,uuid,uuid,uuid,bigint,integer),public.pdv_cover_existing_order_coupon_v1(uuid,uuid,uuid,uuid,jsonb,text,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_get_pending_order_coupon_v1(uuid,uuid,uuid,uuid),public.pdv_set_pending_order_coupon_v1(uuid,uuid,uuid,uuid,uuid,bigint,integer),public.pdv_cover_existing_order_coupon_v1(uuid,uuid,uuid,uuid,jsonb,text,integer) TO authenticated,service_role;
COMMIT;

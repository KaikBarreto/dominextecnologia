-- Toda liquidação de pedido com cupom confirma a mesma promoção canônica.
-- Solicitações antigas sem história de cupom preservam hash e replay exatos.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
CREATE FUNCTION public.pdv_assert_exchange_coupon_access_internal_v1(p_return_id uuid,p_new_order_id uuid,p_cash_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ctx record; source_order uuid;
BEGIN
 SELECT * INTO ctx FROM public.pdv_after_sale_context_v2('fn:cover_pdv_exchange');
 SELECT r.order_id INTO source_order FROM public.pdv_commercial_returns r
  WHERE r.id=p_return_id AND r.company_id=ctx.company_id AND r.event_kind='return';
 IF NOT FOUND THEN RAISE EXCEPTION 'A devolução não está disponível para esta troca.' USING ERRCODE='42501',DETAIL='code=pdv_exchange_order_invalid'; END IF;
 PERFORM public.pdv_assert_order_cash_access_v2(source_order,ctx.user_id);
 PERFORM public.pdv_assert_order_cash_access_v2(p_new_order_id,ctx.user_id);
 IF public.pdv_has_stock_access_scope_v2(ctx.user_id,ctx.company_id,p_return_id=>p_return_id) IS DISTINCT FROM TRUE
   OR public.pdv_has_stock_access_scope_v2(ctx.user_id,ctx.company_id,p_order_id=>p_new_order_id) IS DISTINCT FROM TRUE
   OR (p_cash_session_id IS NOT NULL AND public.pdv_current_actor_can_access_session_v3(p_cash_session_id) IS DISTINCT FROM TRUE) THEN
   RAISE EXCEPTION 'Seu perfil não tem acesso ao pedido ou ao caixa desta troca.' USING ERRCODE='42501',DETAIL='code=pdv_exchange_cash_denied';
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_assert_exchange_coupon_access_internal_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $exchange_core$
DECLARE s text; a text; b text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_cover_exchange_order_core_015_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text)'::regprocedure) INTO s;
 a:='public.pdv_cover_exchange_order_core_015_v2('; b:='public.pdv_cover_exchange_order_coupon_base_v1(';
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'O writer de troca mudou'; END IF; s:=replace(s,a,b);
 a:='p_idempotency_key text)'; b:='p_idempotency_key text, p_expected_coupon_revision integer)';
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A assinatura de troca mudou'; END IF; s:=replace(s,a,b);
 a:=$a$'difference_method',v_method,'difference_account_id',p_difference_account_id,'cash_session_id',p_cash_session_id));$a$;
 b:=$b$'difference_method',v_method,'difference_account_id',p_difference_account_id,'cash_session_id',p_cash_session_id)
      ||CASE WHEN p_expected_coupon_revision>0 THEN jsonb_build_object('coupon_revision',p_expected_coupon_revision) ELSE '{}'::jsonb END);$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'O hash da troca mudou'; END IF; s:=replace(s,a,b);
 a:=$a$IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',true); END IF;$a$;
 b:=$b$IF v_claim.request_status='completed' THEN
      PERFORM public.pdv_assert_exchange_coupon_access_internal_v1(p_return_id,p_new_order_id,p_cash_session_id);
      RETURN v_claim.stored_result||jsonb_build_object('idempotent',true);
    END IF;$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'O replay da troca mudou'; END IF; s:=replace(s,a,b);
 a:=$a$  IF EXISTS(SELECT 1 FROM public.pdv_order_items item WHERE item.order_id=v_order.id AND item.inventory_id IS NOT NULL$a$;
 b:=$b$  -- PDV_EXCHANGE_COUPON_COMMIT_V1: autoridade revalidada após espera de locks.
  PERFORM public.pdv_assert_exchange_coupon_access_internal_v1(p_return_id,p_new_order_id,p_cash_session_id);
  IF (p_expected_coupon_revision IS NULL AND (v_order.coupon_id IS NOT NULL OR v_order.coupon_revision_v1<>0))
    OR (p_expected_coupon_revision IS NOT NULL AND v_order.coupon_revision_v1 IS DISTINCT FROM p_expected_coupon_revision) THEN
    RAISE EXCEPTION 'O desconto do pedido mudou. Reabra a troca para conferir o total.' USING ERRCODE='40001',DETAIL='code=pdv_coupon_conflict';
  END IF;
  PERFORM public.pdv_consume_order_coupon_internal_v1(v_order.id);
  IF EXISTS(SELECT 1 FROM public.pdv_order_items item WHERE item.order_id=v_order.id AND item.inventory_id IS NOT NULL$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A validação de itens da troca mudou'; END IF; s:=replace(s,a,b);
 EXECUTE s;
END $exchange_core$;
REVOKE ALL ON FUNCTION public.pdv_cover_exchange_order_coupon_base_v1(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;

-- A wrapper pública anterior conserva sua autorização e sua assinatura. O core
-- privado compatível aceita replay antigo, mas não confirma promoção sem CAS.
CREATE OR REPLACE FUNCTION public.pdv_cover_exchange_order_core_015_v2(
 p_return_id uuid,p_new_order_id uuid,p_voucher_id uuid,p_voucher_amount numeric,p_credit_amount numeric,
 p_difference_method text,p_difference_account_id uuid,p_cash_session_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 RETURN public.pdv_cover_exchange_order_coupon_base_v1(p_return_id,p_new_order_id,p_voucher_id,p_voucher_amount,
  p_credit_amount,p_difference_method,p_difference_account_id,p_cash_session_id,p_idempotency_key,NULL);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_cover_exchange_order_core_015_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.pdv_cover_exchange_order_coupon_v1(
 p_return_id uuid,p_new_order_id uuid,p_voucher_id uuid,p_voucher_amount numeric,p_credit_amount numeric,
 p_difference_method text,p_difference_account_id uuid,p_cash_session_id uuid,p_idempotency_key text,p_expected_coupon_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM public.pdv_assert_exchange_coupon_access_internal_v1(p_return_id,p_new_order_id,p_cash_session_id);
 IF p_expected_coupon_revision IS NULL OR p_expected_coupon_revision<0 THEN
  RAISE EXCEPTION 'Atualize o pedido antes de confirmar a troca.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_conflict';
 END IF;
 RETURN public.pdv_cover_exchange_order_coupon_base_v1(p_return_id,p_new_order_id,p_voucher_id,p_voucher_amount,
  p_credit_amount,p_difference_method,p_difference_account_id,p_cash_session_id,p_idempotency_key,p_expected_coupon_revision);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_cover_exchange_order_coupon_v1(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_cover_exchange_order_coupon_v1(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer) TO authenticated,service_role;

-- Pré-aplicação legada consome voucher antes da liquidação: não é compatível
-- com desconto promocional mutável. Nesses pedidos, a seleção fica no checkout
-- e a transação canônica confirma cupom e todos os vouchers juntos.
DO $legacy_preapply$
DECLARE s text; a text; b text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_apply_voucher_to_order_core_015_v2(uuid,uuid,numeric,text)'::regprocedure) INTO s;
 a:=$a$  IF EXISTS(SELECT 1 FROM public.pdv_order_payments payment WHERE payment.order_id=v_order.id$a$;
 b:=$b$  IF v_order.coupon_id IS NOT NULL OR v_order.coupon_revision_v1<>0 THEN
    RAISE EXCEPTION 'Este pedido usa cupom. Aplique os vouchers ao finalizar o pagamento no caixa.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_atomic_coverage_required';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_order_payments payment WHERE payment.order_id=v_order.id$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A pré-aplicação de voucher mudou'; END IF;
 EXECUTE replace(s,a,b);
END $legacy_preapply$;

DO $workspace_snapshot$
DECLARE s text; a text; b text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_get_after_sale_workspace_core_015_v2(uuid)'::regprocedure) INTO s;
 a:=$a$candidate.id,candidate.number,candidate.total,candidate.status,candidate.created_at$a$;
 b:=a||',candidate.coupon_revision_v1';
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A seleção de pedidos do pós-venda mudou'; END IF; s:=replace(s,a,b);
 a:=$a$'created_at',candidate.created_at,'can_exchange'$a$;
 b:=$b$'created_at',candidate.created_at,'coupon_revision',candidate.coupon_revision_v1,'can_exchange'$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'O snapshot de candidatos do pós-venda mudou'; END IF; s:=replace(s,a,b);
 a:=$a$'status',candidate.status,'created_at',candidate.created_at) ORDER BY candidate.created_at,candidate.id)$a$;
 b:=$b$'status',candidate.status,'created_at',candidate.created_at,'coupon_revision',candidate.coupon_revision_v1) ORDER BY candidate.created_at,candidate.id)$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'O snapshot de candidatos da troca mudou'; END IF; s:=replace(s,a,b);
 a:=$a$v_apply AND NOT EXISTS(SELECT 1 FROM public.pdv_order_payments payment$a$;
 b:=$b$v_apply AND candidate.coupon_id IS NULL AND candidate.coupon_revision_v1=0 AND NOT EXISTS(SELECT 1 FROM public.pdv_order_payments payment$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A elegibilidade da pré-aplicação mudou'; END IF; s:=replace(s,a,b);
 EXECUTE s;
END $workspace_snapshot$;
COMMIT;

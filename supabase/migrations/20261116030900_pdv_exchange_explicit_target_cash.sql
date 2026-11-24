-- A troca pertence à abertura que recebeu o novo pedido, inclusive sem dinheiro.
-- A sessão de destino é independente da conta usada para pagar a diferença.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';

-- O terminal atual só autoriza a fila ainda sem coberturas. Pedidos históricos
-- sem vínculo comprovado falham fechado; nenhuma sessão é inferida/backfilled.
DO $read_custody$
DECLARE s text; a text; b text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_order_actor_can_access_v2(uuid,uuid)'::regprocedure) INTO s;
 a:='OR (o.cash_session_id IS NULL AND o.target_terminal_id IS NOT NULL AND EXISTS(';
 b:='OR (o.cash_session_id IS NULL AND o.status=''aguardando_pagamento'' AND NOT EXISTS(SELECT 1 FROM public.pdv_order_payments covered WHERE covered.order_id=o.id AND covered.company_id=o.company_id) AND o.target_terminal_id IS NOT NULL AND EXISTS(';
 IF (length(s)-length(replace(s,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'A autorização de leitura do pedido mudou'; END IF;
 EXECUTE replace(s,a,b);
END $read_custody$;

CREATE FUNCTION public.pdv_exchange_target_cash_snapshot_internal_v1(p_company_id uuid,p_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT COALESCE((SELECT jsonb_build_object('target_terminal_id',terminal.id,'target_cash_session_id',session.id,
  'target_cash_account_id',account.id,'target_cash_label',terminal.name)
 FROM public.pdv_orders o JOIN public.pdv_terminals terminal ON terminal.id=o.target_terminal_id AND terminal.company_id=o.company_id
 JOIN public.pdv_cash_sessions session ON session.terminal_id=terminal.id AND session.company_id=o.company_id
 JOIN public.financial_accounts account ON account.id=session.cash_account_id AND account.company_id=o.company_id
 WHERE o.id=p_order_id AND o.company_id=p_company_id AND o.contract_version=2 AND o.operation_mode_snapshot='counter'
  AND o.status='aguardando_pagamento' AND o.cash_session_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.pdv_order_payments p WHERE p.order_id=o.id AND p.company_id=o.company_id)
  AND terminal.is_active IS TRUE AND terminal.stock_id=o.stock_id
  AND session.status='aberta' AND session.contract_version=2 AND account.is_active IS TRUE AND account.type='caixa'
  AND public.pdv_order_actor_can_access_v2(o.id,auth.uid()) IS TRUE
  AND public.pdv_has_stock_access_scope_v2(auth.uid(),p_company_id,p_order_id=>o.id) IS TRUE
  AND public.pdv_current_actor_can_access_session_v3(session.id) IS TRUE),
  jsonb_build_object('target_terminal_id',NULL,'target_cash_session_id',NULL,'target_cash_account_id',NULL,'target_cash_label',NULL));
$fn$;
REVOKE ALL ON FUNCTION public.pdv_exchange_target_cash_snapshot_internal_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Um único writer financeiro: a API anterior delega ao mesmo core, com contexto
-- ausente aceito exclusivamente para replay concluído do hash histórico exato.
DO $target_core$
DECLARE s text; a text; b text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_cover_exchange_order_coupon_base_v1(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer)'::regprocedure) INTO s;
 a:='public.pdv_cover_exchange_order_coupon_base_v1('; b:='public.pdv_cover_exchange_order_target_base_v2(';
 IF (length(s)-length(replace(s,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'O writer de troca mudou'; END IF; s:=replace(s,a,b);
 a:='p_expected_coupon_revision integer)'; b:='p_expected_coupon_revision integer, p_target_cash_session_id uuid)';
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A assinatura da troca mudou'; END IF; s:=replace(s,a,b);
 a:='v_all_settled boolean:=true; v_result jsonb;';
 b:=a||' v_target_session public.pdv_cash_sessions; v_target_terminal public.pdv_terminals;';
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'O contexto da troca mudou'; END IF; s:=replace(s,a,b);
 a:=$a$v_context.company_id,'after_sale.exchange.cover.v2',$a$;
 b:=$b$v_context.company_id,CASE WHEN p_target_cash_session_id IS NULL THEN 'after_sale.exchange.cover.v2' ELSE 'after_sale.exchange.cover.v3' END,$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A identidade da troca mudou'; END IF; s:=replace(s,a,b);
 a:=$a$||CASE WHEN p_expected_coupon_revision>0 THEN jsonb_build_object('coupon_revision',p_expected_coupon_revision) ELSE '{}'::jsonb END);$a$;
 b:=$b$||CASE WHEN p_expected_coupon_revision>0 THEN jsonb_build_object('coupon_revision',p_expected_coupon_revision) ELSE '{}'::jsonb END
      ||CASE WHEN p_target_cash_session_id IS NOT NULL THEN jsonb_build_object('target_cash_session_id',p_target_cash_session_id) ELSE '{}'::jsonb END);$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'O hash da troca mudou'; END IF; s:=replace(s,a,b);
 a:=$a$RETURN v_claim.stored_result||jsonb_build_object('idempotent',true);$a$;
 b:=$b$IF p_target_cash_session_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM public.pdv_orders replay_order JOIN public.pdv_cash_sessions replay_session ON replay_session.id=replay_order.cash_session_id AND replay_session.company_id=replay_order.company_id
        WHERE replay_order.id=p_new_order_id AND replay_order.company_id=v_context.company_id
          AND replay_order.cash_session_id=p_target_cash_session_id AND replay_order.terminal_id=replay_session.terminal_id
          AND replay_order.target_terminal_id=replay_session.terminal_id
          AND public.pdv_current_actor_can_access_session_v3(replay_session.id) IS TRUE) THEN
        RAISE EXCEPTION 'O caixa desta troca não está disponível para seu perfil.' USING ERRCODE='42501',DETAIL='code=pdv_exchange_target_cash_denied';
      END IF;
      RETURN v_claim.stored_result||jsonb_build_object('idempotent',true);$b$;
 IF (length(s)-length(replace(s,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'O replay da troca mudou'; END IF; s:=replace(s,a,b);
 a:=$a$  -- Counter e venda direta travam tesouraria$a$;
 b:=$b$  IF p_target_cash_session_id IS NULL THEN
    RAISE EXCEPTION 'Atualize a tela e confirme o caixa de destino antes de concluir a troca.' USING ERRCODE='42501',DETAIL='code=pdv_exchange_target_cash_required';
  END IF;
  -- Counter e venda direta travam tesouraria$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A entrada da troca mudou'; END IF; s:=replace(s,a,b);
 a:=$a$  -- PDV_EXCHANGE_COUPON_COMMIT_V1: autoridade revalidada após espera de locks.$a$;
 b:=$b$  -- PDV_EXCHANGE_TARGET_CASH_V2: pedido -> terminal -> abertura -> estoque.
  SELECT t.* INTO v_target_terminal FROM public.pdv_terminals t WHERE t.id=v_order.target_terminal_id AND t.company_id=v_context.company_id FOR UPDATE;
  IF NOT FOUND OR v_target_terminal.is_active IS DISTINCT FROM TRUE OR v_target_terminal.stock_id IS DISTINCT FROM v_order.stock_id THEN
    RAISE EXCEPTION 'O caixa de destino mudou. Atualize o pedido antes de concluir a troca.' USING ERRCODE='42501',DETAIL='code=pdv_exchange_target_cash_denied'; END IF;
  SELECT session.* INTO v_target_session FROM public.pdv_cash_sessions session WHERE session.id=p_target_cash_session_id
    AND session.company_id=v_context.company_id AND session.terminal_id=v_target_terminal.id FOR UPDATE;
  IF NOT FOUND OR v_target_session.status IS DISTINCT FROM 'aberta' OR v_target_session.contract_version IS DISTINCT FROM 2
    OR public.pdv_current_actor_can_access_session_v3(v_target_session.id) IS DISTINCT FROM TRUE
    OR NOT EXISTS(SELECT 1 FROM public.financial_accounts account WHERE account.id=v_target_session.cash_account_id AND account.company_id=v_context.company_id AND account.is_active IS TRUE AND account.type='caixa')
    OR (v_order.cash_session_id IS NOT NULL AND v_order.cash_session_id IS DISTINCT FROM v_target_session.id)
    OR (v_order.terminal_id IS NOT NULL AND v_order.terminal_id IS DISTINCT FROM v_target_terminal.id)
    OR (v_method='dinheiro' AND (p_cash_session_id IS DISTINCT FROM v_target_session.id OR p_difference_account_id IS DISTINCT FROM v_target_session.cash_account_id))
    OR (v_method IS DISTINCT FROM 'dinheiro' AND p_cash_session_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Confirme uma abertura disponível do caixa de destino. A diferença em dinheiro deve usar essa mesma gaveta.' USING ERRCODE='42501',DETAIL='code=pdv_exchange_target_cash_denied'; END IF;
  SELECT * INTO v_context FROM public.pdv_after_sale_context_v2('fn:cover_pdv_exchange');
  PERFORM public.pdv_assert_exchange_coupon_access_internal_v1(p_return_id,p_new_order_id,p_cash_session_id);
  UPDATE public.pdv_orders SET terminal_id=v_target_terminal.id,cash_session_id=v_target_session.id,updated_at=now() WHERE id=v_order.id;
  -- PDV_EXCHANGE_COUPON_COMMIT_V1: autoridade revalidada após espera de locks.$b$;
 IF (length(s)-length(replace(s,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'A confirmação da troca mudou'; END IF; s:=replace(s,a,b);
 a:=$a$cash_session_id=COALESCE(p_cash_session_id,cash_session_id),updated_at=now() WHERE id=v_order.id;$a$;
 b:=$b$terminal_id=v_target_terminal.id,cash_session_id=v_target_session.id,updated_at=now() WHERE id=v_order.id;$b$;
 IF (length(s)-length(replace(s,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'A custódia final da troca mudou'; END IF; s:=replace(s,a,b);
 a:=$a$  PERFORM public.pdv_ensure_exchange_order_stock_internal_v1(v_context.company_id,v_order.id);$a$;
 b:=a||chr(10)||$b$  -- Revalida origem e destino após eventual espera no estoque.
  PERFORM public.pdv_assert_exchange_coupon_access_internal_v1(p_return_id,p_new_order_id,p_cash_session_id);
  IF public.pdv_current_actor_can_access_session_v3(v_target_session.id) IS DISTINCT FROM TRUE
    OR NOT EXISTS(SELECT 1 FROM public.financial_accounts account WHERE account.id=v_target_session.cash_account_id AND account.company_id=v_context.company_id AND account.is_active IS TRUE AND account.type='caixa') THEN
    RAISE EXCEPTION 'O caixa de destino mudou. Atualize o pós-venda.' USING ERRCODE='42501',DETAIL='code=pdv_exchange_target_cash_denied'; END IF;$b$;
 IF (length(s)-length(replace(s,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'A revalidação de estoque da troca mudou'; END IF;s:=replace(s,a,b);
 IF position('PDV_EXCHANGE_ATOMIC_RESERVATION_V1' IN s)=0 THEN RAISE EXCEPTION 'A reserva atômica da troca não está instalada'; END IF;
 EXECUTE s;
END $target_core$;
REVOKE ALL ON FUNCTION public.pdv_cover_exchange_order_target_base_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_cover_exchange_order_coupon_base_v1(
 p_return_id uuid,p_new_order_id uuid,p_voucher_id uuid,p_voucher_amount numeric,p_credit_amount numeric,
 p_difference_method text,p_difference_account_id uuid,p_cash_session_id uuid,p_idempotency_key text,p_expected_coupon_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 RETURN public.pdv_cover_exchange_order_target_base_v2(p_return_id,p_new_order_id,p_voucher_id,p_voucher_amount,p_credit_amount,
 p_difference_method,p_difference_account_id,p_cash_session_id,p_idempotency_key,p_expected_coupon_revision,NULL);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_cover_exchange_order_coupon_base_v1(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.pdv_cover_exchange_order_coupon_v2(
 p_return_id uuid,p_new_order_id uuid,p_voucher_id uuid,p_voucher_amount numeric,p_credit_amount numeric,
 p_difference_method text,p_difference_account_id uuid,p_cash_session_id uuid,p_idempotency_key text,p_expected_coupon_revision integer,p_target_cash_session_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM public.pdv_assert_exchange_coupon_access_internal_v1(p_return_id,p_new_order_id,p_cash_session_id);
 IF p_expected_coupon_revision IS NULL OR p_expected_coupon_revision<0 THEN
  RAISE EXCEPTION 'Atualize o pedido antes de confirmar a troca.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_conflict'; END IF;
 IF p_target_cash_session_id IS NULL THEN
  RAISE EXCEPTION 'Atualize a tela e confirme o caixa de destino antes de concluir a troca.' USING ERRCODE='42501',DETAIL='code=pdv_exchange_target_cash_required'; END IF;
 RETURN public.pdv_cover_exchange_order_target_base_v2(p_return_id,p_new_order_id,p_voucher_id,p_voucher_amount,p_credit_amount,
 p_difference_method,p_difference_account_id,p_cash_session_id,p_idempotency_key,p_expected_coupon_revision,p_target_cash_session_id);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_cover_exchange_order_coupon_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_cover_exchange_order_coupon_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer,uuid) TO authenticated,service_role;

-- Pré-aplicação isolada não deixa cobertura sem custódia: o checkout atômico
-- recebe todos os vouchers junto das demais formas. Replays antigos continuam.
DO $retire_preapply$
DECLARE s text; a text; b text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_apply_voucher_to_order_core_015_v2(uuid,uuid,numeric,text)'::regprocedure) INTO s;
 a:=$anchor$  SELECT orders.customer_id INTO v_customer_id FROM public.pdv_orders orders$anchor$;
 b:=$patch$  RAISE EXCEPTION 'Escolha os vouchers ao receber o pedido no caixa.' USING ERRCODE='42501',DETAIL='code=pdv_voucher_checkout_required';
  SELECT orders.customer_id INTO v_customer_id FROM public.pdv_orders orders$patch$;
 IF (length(s)-length(replace(s,a,'')))/length(a)<>1 OR position('IF v_claim.is_replay THEN' IN s)>position(a IN s) THEN RAISE EXCEPTION 'O replay da pré-aplicação mudou'; END IF;
 EXECUTE replace(s,a,b);
END $retire_preapply$;

DO $candidate_snapshot$
DECLARE s text; a text; b text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_get_after_sale_workspace_v2(uuid)'::regprocedure) INTO s;
 a:='  RETURN v_result;';
 b:=$patch$  SELECT jsonb_set(jsonb_set(v_result,'{order_candidates}',COALESCE((SELECT jsonb_agg(candidate||jsonb_build_object('can_apply_voucher',false)||public.pdv_exchange_target_cash_snapshot_internal_v1(public.get_user_company_id(auth.uid()),(candidate->>'order_id')::uuid)) FROM jsonb_array_elements(v_result->'order_candidates') candidate),'[]'::jsonb)),
    '{exchange_candidates}',COALESCE((SELECT jsonb_agg(candidate||public.pdv_exchange_target_cash_snapshot_internal_v1(public.get_user_company_id(auth.uid()),(candidate->>'order_id')::uuid)) FROM jsonb_array_elements(v_result->'exchange_candidates') candidate),'[]'::jsonb)) INTO v_result;
  v_result:=jsonb_set(v_result,'{capabilities,apply_voucher}','false'::jsonb);
  RETURN v_result;$patch$;
 IF (length(s)-length(replace(s,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'Leitura dos candidatos de troca mudou'; END IF;
 EXECUTE replace(s,a,b);
END $candidate_snapshot$;
COMMIT;

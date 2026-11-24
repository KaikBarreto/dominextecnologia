-- O resultado da cobertura pertence à abertura e ao ator que a confirmou.
-- Repetir a mesma intenção não depende mais do estado pré-pagamento, sem
-- permitir nova cobertura ou leitura de replay por outro operador/caixa.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $preflight$
BEGIN
  IF to_regprocedure('public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text)') IS NULL
     OR to_regprocedure('public.pdv_cover_existing_order_core_015_v2(uuid,uuid,uuid,uuid,jsonb,text)') IS NULL
     OR to_regprocedure('public.pdv_assert_cash_session_actor_v3(uuid,uuid,boolean,boolean)') IS NULL
     OR to_regprocedure('public.pdv_lock_treasury_account(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Contrato de cobertura esperado não está instalado';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.pdv_cover_existing_order_v2(
  p_order_id uuid,p_terminal_id uuid,p_cash_session_id uuid,p_cash_account_id uuid,
  p_payments jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE
  v_context record;
  v_session public.pdv_cash_sessions%ROWTYPE;
  v_order public.pdv_orders%ROWTYPE;
  v_request public.pdv_operation_requests%ROWTYPE;
  v_has_request boolean;
BEGIN
  -- Assinatura, módulo, tela, ação e modo vigentes falham fechado, inclusive
  -- em replay. Estar fechado não remove a custódia histórica da abertura.
  SELECT * INTO v_context FROM public.pdv_counter_context_v2('screen:pdv','fn:cover_pdv_order',true);
  v_session:=public.pdv_assert_cash_session_actor_v3(p_cash_session_id,p_cash_account_id,false);
  IF v_session.terminal_id IS DISTINCT FROM p_terminal_id
     OR v_session.cash_account_id IS DISTINCT FROM p_cash_account_id THEN
    RAISE EXCEPTION 'Use a abertura e a conta corretas deste caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_session_invalid';
  END IF;

  -- Mesmo lock canônico que o core toma antes do claim. Serializa também
  -- a consulta de autoria abaixo: dois atores não podem ambos observar uma
  -- chave ausente e depois receber o resultado criado pelo outro.
  PERFORM public.pdv_lock_treasury_account(v_context.company_id,p_cash_account_id);
  SELECT * INTO v_context FROM public.pdv_counter_context_v2('screen:pdv','fn:cover_pdv_order',true);
  v_session:=public.pdv_assert_cash_session_actor_v3(p_cash_session_id,p_cash_account_id,false);
  IF v_session.terminal_id IS DISTINCT FROM p_terminal_id
     OR v_session.cash_account_id IS DISTINCT FROM p_cash_account_id THEN
    RAISE EXCEPTION 'Use a abertura e a conta corretas deste caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_session_invalid';
  END IF;

  SELECT orders.* INTO v_order FROM public.pdv_orders orders
   WHERE orders.id=p_order_id AND orders.company_id=v_context.company_id
     AND orders.contract_version=2 AND orders.operation_mode_snapshot='counter'
     AND orders.target_terminal_id=p_terminal_id
     AND (orders.cash_session_id IS NULL OR orders.cash_session_id=p_cash_session_id)
     AND (orders.terminal_id IS NULL OR orders.terminal_id=p_terminal_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este pedido pertence a outro caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_terminal_mismatch';
  END IF;
  IF v_order.stock_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.pdv_terminals terminal
     WHERE terminal.id=p_terminal_id AND terminal.company_id=v_context.company_id
       AND terminal.is_active IS TRUE AND terminal.stock_id=v_order.stock_id
       AND public.can_access_stock(v_context.user_id,terminal.stock_id)
  ) THEN
    RAISE EXCEPTION 'O local deste pedido não está acessível neste caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_stock_denied';
  END IF;

  SELECT request.* INTO v_request FROM public.pdv_operation_requests request
   WHERE request.company_id=v_context.company_id AND request.operation_type='counter.cover.v2'
     AND request.idempotency_key=p_idempotency_key;
  v_has_request:=FOUND;
  IF v_has_request AND v_request.created_by IS DISTINCT FROM v_context.user_id THEN
    RAISE EXCEPTION 'Esta confirmação pertence a outro operador.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_replay_forbidden';
  END IF;
  IF NOT v_has_request AND (v_session.status<>'aberta'
      OR v_order.cash_session_id IS NOT NULL OR v_order.status<>'aguardando_pagamento') THEN
    RAISE EXCEPTION 'Este pedido não está aguardando recebimento neste caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_counter_terminal_mismatch';
  END IF;

  -- O core mantém a única normalização de pagamentos/hash/claim: payload
  -- diferente nega, request pendente nega, completed retorna o resultado
  -- canônico. Nenhuma fórmula de DRE/DFC, estoque ou cobertura é duplicada.
  RETURN public.pdv_cover_existing_order_core_015_v2(p_order_id,p_terminal_id,p_cash_session_id,
    p_cash_account_id,p_payments,p_idempotency_key);
END
$fn$;

-- CREATE OR REPLACE conserva owner/ACL existentes; nenhum grant ou rollout.
COMMIT;

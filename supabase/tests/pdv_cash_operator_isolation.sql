-- Gate P0: nenhum fato de um Caixa pode vazar para outro operador/abertura.
-- Executar apos `supabase db reset`.
BEGIN;

DO $contract$
DECLARE v_src text; v_policy text;
BEGIN
  IF has_function_privilege('authenticated','public.pdv_close_cash_session(uuid,numeric,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.pdv_cash_movement(uuid,text,numeric,uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.pdv_revert_cash_movement(uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.pdv_settle_order(uuid,jsonb,text,date)','EXECUTE')
    OR has_function_privilege('authenticated','public.pdv_cancel_order(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'writer legado ainda esta exposto a authenticated';
  END IF;

  IF has_table_privilege('authenticated','public.pdv_cash_sessions','INSERT')
    OR has_table_privilege('authenticated','public.pdv_cash_sessions','UPDATE')
    OR has_table_privilege('authenticated','public.pdv_orders','INSERT')
    OR has_table_privilege('authenticated','public.pdv_orders','UPDATE')
    OR has_table_privilege('authenticated','public.pdv_order_payments','INSERT') THEN
    RAISE EXCEPTION 'PostgREST ainda permite escrita direta em fatos de caixa';
  END IF;

  SELECT pg_get_functiondef('public.pdv_can_operate_other_cash_v2(uuid)'::regprocedure) INTO v_src;
  IF strpos(v_src,'''fn:operate_other_pdv_cash''')=0 OR strpos(v_src,'is_admin_or_gestor')>0 THEN
    RAISE EXCEPTION 'permissao entre caixas nao e nominal/fail-closed';
  END IF;

  SELECT pg_get_functiondef('public.pdv_list_cash_queue_v3(uuid,uuid)'::regprocedure) INTO v_src;
  IF strpos(v_src,'o.target_terminal_id=p_terminal_id')=0
    OR strpos(v_src,'cs.id=p_cash_session_id')=0
    OR strpos(v_src,'cs.terminal_id=p_terminal_id')=0
    OR strpos(v_src,'o.stock_id=v_stock')=0 THEN
    RAISE EXCEPTION 'fila nao exige abertura+Caixa exatos, inclusive no mesmo estoque';
  END IF;
  SELECT pg_get_functiondef('public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure) INTO v_src;
  IF strpos(v_src,'s.id=p_cash_session_id')=0 OR strpos(v_src,'s.terminal_id=p_terminal_id')=0
    OR strpos(v_src,'s.opened_by=v_uid')=0 OR strpos(v_src,'o.target_terminal_id=p_terminal_id')=0
    OR strpos(v_src,'pdv_cover_existing_order_core_015_v2')=0 THEN
    RAISE EXCEPTION 'pagamento aceita abertura ou Caixa diferente do destino';
  END IF;

  SELECT pg_get_functiondef('public.pdv_assert_draft_cash_context_v2(text,uuid,uuid,uuid)'::regprocedure) INTO v_src;
  IF strpos(v_src,'cs.id=p_cash_session_id')=0 OR strpos(v_src,'cs.terminal_id=p_terminal_id')=0
    OR strpos(v_src,'t.stock_id=p_stock_id')=0 OR strpos(v_src,'v_session.opened_by')=0 THEN
    RAISE EXCEPTION 'rascunho nao valida abertura, Caixa, estoque e operador';
  END IF;
  SELECT pg_get_functiondef('public.pdv_preorder_can_access_v2(public.pdv_preorders)'::regprocedure) INTO v_src;
  IF strpos(v_src,'p_preorder.target_terminal_id')=0 OR strpos(v_src,'s.opened_by=auth.uid()')=0
    OR strpos(v_src,'is_admin_or_gestor')>0 THEN
    RAISE EXCEPTION 'orcamento encaminhado ainda usa cargo/estoque em vez do Caixa exato';
  END IF;

  SELECT pg_get_functiondef('public.pdv_list_sales_flow_v2()'::regprocedure) INTO v_src;
  IF strpos(v_src,'preorder.target_terminal_id')=0
    OR strpos(v_src,'pdv_order_actor_can_access_v2(order_row.id,v_uid)')=0 THEN
    RAISE EXCEPTION 'Kanban ainda agrega orcamentos/pedidos de outro Caixa';
  END IF;
  SELECT pg_get_functiondef('public.pdv_get_sales_flow_order_v2(uuid)'::regprocedure) INTO v_src;
  IF strpos(v_src,'pdv_order_actor_can_access_v2(order_row.id,v_context.user_id)')=0 THEN
    RAISE EXCEPTION 'detalhe do Kanban aceita UUID de outro Caixa';
  END IF;

  SELECT string_agg(qual,' ') INTO v_policy FROM pg_policies
   WHERE schemaname='public' AND tablename='pdv_orders';
  IF v_policy IS NULL OR strpos(v_policy,'pdv_current_actor_can_access_order_v3')=0 THEN
    RAISE EXCEPTION 'RLS de pedidos nao herda a custodia do Caixa';
  END IF;

  IF has_function_privilege('authenticated','public.pdv_order_actor_can_access_v2(uuid,uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.pdv_current_actor_can_access_order_v3(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'helper com user arbitrario foi exposto ou wrapper current-user ausente';
  END IF;

  SELECT pg_get_functiondef('public.pdv_get_after_sale_workspace_v2(uuid)'::regprocedure) INTO v_src;
  IF strpos(v_src,'pdv_assert_order_cash_access_v2(p_order_id,auth.uid())')=0
    OR strpos(v_src,'pdv_current_actor_can_access_session_v3')=0
    OR strpos(v_src,'pdv_current_actor_can_access_order_v3')=0 THEN
    RAISE EXCEPTION 'pos-venda nao valida a custodia do pedido';
  END IF;
  SELECT pg_get_functiondef('public.pdv_request_return_refund_v2(uuid,uuid,numeric,text,uuid,uuid,text)'::regprocedure) INTO v_src;
  IF strpos(v_src,'pdv_current_actor_can_access_session_v3(p_cash_session_id)')=0 THEN
    RAISE EXCEPTION 'reembolso aceita sessao informada de outro Caixa';
  END IF;
  SELECT pg_get_functiondef('public.pdv_cover_exchange_order_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text)'::regprocedure) INTO v_src;
  IF strpos(v_src,'pdv_current_actor_can_access_session_v3(p_cash_session_id)')=0 THEN
    RAISE EXCEPTION 'troca aceita sessao informada de outro Caixa';
  END IF;
  SELECT pg_get_functiondef('public.pdv_list_cash_sessions_v2(text,uuid,uuid,integer,integer)'::regprocedure) INTO v_src;
  IF strpos(v_src,'can_manage_others')=0 OR strpos(v_src,'pdv_can_operate_other_cash_v2(v_uid)')=0 THEN
    RAISE EXCEPTION 'lista publica ainda anuncia acesso implicito de admin/gestor';
  END IF;
END
$contract$;

ROLLBACK;

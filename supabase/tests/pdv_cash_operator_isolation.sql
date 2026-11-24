-- Gate P0: nenhum fato de um Caixa pode vazar para outro operador/abertura.
-- Executar apos `supabase db reset`.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $contract$
DECLARE v_src text; v_policy text; v_actor_src text;
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
  SELECT pg_get_functiondef('public.pdv_assert_cash_session_actor_v3(uuid,uuid,boolean,boolean)'::regprocedure) INTO v_actor_src;
  -- A sessão é validada pelo helper canônico, inclusive em replay de pedido
  -- já pago. A prova de rejeição de outro destino continua no bloco abaixo.
  IF strpos(v_src,'pdv_assert_cash_session_actor_v3(p_cash_session_id,p_cash_account_id,false)')=0
    OR strpos(v_src,'v_session.terminal_id IS DISTINCT FROM p_terminal_id')=0
    OR strpos(v_src,'v_session.cash_account_id IS DISTINCT FROM p_cash_account_id')=0
    OR strpos(v_src,'orders.target_terminal_id=p_terminal_id')=0
    OR strpos(v_src,'orders.company_id=v_context.company_id')=0
    OR strpos(v_src,'v_request.created_by IS DISTINCT FROM v_context.user_id')=0
    OR strpos(v_actor_src,'s.id=p_session_id')=0
    OR strpos(v_actor_src,'s.company_id=v_context.company_id')=0
    OR strpos(v_actor_src,'s.opened_by=v_context.user_id OR public.pdv_can_operate_other_cash_v2')=0
    OR strpos(v_src,'pdv_cover_existing_order_core_015_v2')=0 THEN
    RAISE EXCEPTION 'pagamento aceita abertura ou Caixa diferente do destino';
  END IF;

  SELECT pg_get_functiondef('public.pdv_assert_draft_cash_context_v2(text,uuid,uuid,uuid)'::regprocedure) INTO v_src;
  SELECT pg_get_functiondef('public.pdv_assert_cash_session_actor_v3(uuid,uuid,boolean,boolean)'::regprocedure) INTO v_actor_src;
  IF strpos(v_src,'pdv_assert_cash_session_actor_v3(p_cash_session_id,NULL,true)')=0
    OR strpos(v_src,'v_session.terminal_id IS DISTINCT FROM p_terminal_id')=0
    OR strpos(v_src,'t.stock_id=p_stock_id')=0
    OR strpos(v_actor_src,'s.id=p_session_id')=0
    OR strpos(v_actor_src,'s.company_id=v_context.company_id')=0
    OR strpos(v_actor_src,'s.opened_by=v_context.user_id OR public.pdv_can_operate_other_cash_v2')=0 THEN
    RAISE EXCEPTION 'rascunho nao valida abertura, Caixa, estoque e operador';
  END IF;
  SELECT pg_get_functiondef('public.pdv_preorder_can_access_v2(public.pdv_preorders)'::regprocedure) INTO v_src;
  IF strpos(v_src,'p_preorder.target_terminal_id')=0 OR strpos(v_src,'s.opened_by=auth.uid()')=0
    OR strpos(v_src,'is_admin_or_gestor')>0 THEN
    RAISE EXCEPTION 'orcamento encaminhado ainda usa cargo/estoque em vez do Caixa exato';
  END IF;

  -- O Kanban público delega ao core e filtra cards projetados; não depende
  -- do nome de alias SQL usado por uma implementação anterior. A prova com
  -- dois caixas no MESMO estoque está no bloco comportamental.
  IF has_function_privilege('anon','public.pdv_list_sales_flow_v2()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.pdv_list_sales_flow_v2()','EXECUTE')
     OR has_function_privilege('authenticated','public.pdv_list_sales_flow_core_015_v2()','EXECUTE')
     OR has_function_privilege('authenticated','public.pdv_get_sales_flow_order_core_015_v2(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'ACL do Kanban/detalhe permite contornar o wrapper de custódia';
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
  IF strpos(v_src,'can_manage_others')=0 OR strpos(v_src,'pdv_can_operate_other_cash_v2(v_context.user_id)')=0 THEN
    RAISE EXCEPTION 'lista publica ainda anuncia acesso implicito de admin/gestor';
  END IF;
END
$contract$;


DO $behavior$
<<fixture>>
DECLARE
  c uuid:='f1500000-0000-4000-8000-000000000001'; cx uuid:='f1500000-0000-4000-8000-000000000002';
  ua uuid:='f1500000-0000-4000-8000-000000000011'; ub uuid:='f1500000-0000-4000-8000-000000000012'; ux uuid:='f1500000-0000-4000-8000-000000000013';
  account_a uuid:='f1500000-0000-4000-8000-000000000021'; account_x uuid:='f1500000-0000-4000-8000-000000000022';
  ta uuid:='f1500000-0000-4000-8000-000000000031'; tb uuid:='f1500000-0000-4000-8000-000000000032'; tx uuid:='f1500000-0000-4000-8000-000000000033';
  sa uuid:='f1500000-0000-4000-8000-000000000041'; sb uuid:='f1500000-0000-4000-8000-000000000042'; sx uuid:='f1500000-0000-4000-8000-000000000043';
  oa uuid:='f1500000-0000-4000-8000-000000000051'; ob uuid:='f1500000-0000-4000-8000-000000000052';
  draft_a uuid:='f1500000-0000-4000-8000-000000000061';
  request_id uuid:='f1500000-0000-4000-8000-000000000071';
  stock_a uuid; stock_x uuid; payload jsonb; queue jsonb; cards jsonb; blocked boolean; denial text;
  saved public.pdv_order_drafts; replay public.pdv_order_drafts;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',ua,'authenticated','authenticated','isolation-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',ub,'authenticated','authenticated','isolation-b@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',ux,'authenticated','authenticated','isolation-x@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Isolamento A/B','active'),(cx,'Isolamento X','active');
  UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(ua,ub);
  UPDATE public.profiles SET company_id=cx,is_active=true WHERE user_id=ux;
  INSERT INTO public.user_roles(user_id,role) VALUES(ua,'comercial'),(ub,'gestor'),(ux,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (ua,'["screen:pdv","screen:pdv_orders","fn:cover_pdv_order"]',true),
    (ub,'["screen:pdv","screen:pdv_orders","fn:cover_pdv_order"]',true),
    (ux,'["screen:pdv","screen:pdv_orders","fn:cover_pdv_order","fn:operate_other_pdv_cash"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv'),(cx,'pdv');
  SELECT stock.id INTO STRICT stock_a FROM public.stocks stock WHERE stock.company_id=c AND stock.is_default IS TRUE;
  SELECT stock.id INTO STRICT stock_x FROM public.stocks stock WHERE stock.company_id=cx AND stock.is_default IS TRUE;
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
    VALUES(account_a,c,'Cofre A/B','caixa',1000,true),(account_x,cx,'Cofre X','caixa',1000,true);
  INSERT INTO public.company_settings(company_id,name,pdv_mode,pdv_cash_account_id)
    VALUES(c,'Isolamento A/B','balcao',account_a),(cx,'Isolamento X','balcao',account_x)
    ON CONFLICT(company_id) DO UPDATE SET pdv_mode=excluded.pdv_mode,pdv_cash_account_id=excluded.pdv_cash_account_id;
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active)
    VALUES(ta,c,'Caixa A',stock_a,true),(tb,c,'Caixa B',stock_a,true),(tx,cx,'Caixa X',stock_x,true);
  INSERT INTO public.pdv_cash_sessions(id,company_id,terminal_id,opened_by,opening_amount,status,
    cash_account_id,cash_account_name_snapshot,cash_policy_snapshot,contract_version) VALUES
    (sa,c,ta,ua,0,'aberta',account_a,'Cofre A/B','{}',2),
    (sb,c,tb,ub,0,'aberta',account_a,'Cofre A/B','{}',2),
    (sx,cx,tx,ux,0,'aberta',account_x,'Cofre X','{}',2);
  INSERT INTO public.pdv_orders(id,company_id,number,salesperson_id,stock_id,target_terminal_id,
    status,subtotal,total,contract_version,operation_mode_snapshot) VALUES
    (oa,c,1501,ua,stock_a,ta,'aguardando_pagamento',1,1,2,'counter'),
    (ob,c,1502,ua,stock_a,tb,'aguardando_pagamento',2,2,2,'counter');

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  queue:=public.pdv_list_cash_queue_v3(sa,ta);
  cards:=public.pdv_list_cash_sessions_v2('aberta',NULL,NULL,0,20);
  IF jsonb_array_length(COALESCE(cards->'rows','[]'::jsonb))<>1 OR cards#>>'{rows,0,id}' IS DISTINCT FROM sa::text
     OR COALESCE((cards->>'can_manage_others')::boolean,true) THEN
    RAISE EXCEPTION 'lista de caixas exibiu abertura alheia sem concessão nominal';END IF;
  cards:=public.pdv_list_sales_flow_v2();
  IF jsonb_array_length(COALESCE(queue,'[]'::jsonb))<>1 OR queue#>>'{0,id}'<>oa::text
     OR jsonb_array_length(COALESCE(cards,'[]'::jsonb))<>1 OR cards#>>'{0,order_id}'<>oa::text THEN
    RAISE EXCEPTION 'fila/Kanban misturou caixas no mesmo estoque ou preservou autoria após handoff';END IF;
  blocked:=false;BEGIN PERFORM public.pdv_list_cash_queue_v3(sa,tb);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'fila aceitou abertura e terminal de caixas diferentes';END IF;
  blocked:=false;BEGIN PERFORM public.pdv_cover_existing_order_v2(ob,ta,sa,account_a,
    jsonb_build_array(jsonb_build_object('method','dinheiro','amount',2)),'isolation-cover-wrong-destination');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked OR EXISTS(SELECT 1 FROM public.pdv_order_payments WHERE order_id=ob)
     OR EXISTS(SELECT 1 FROM public.pdv_operation_requests WHERE company_id=c AND idempotency_key='isolation-cover-wrong-destination') THEN
    RAISE EXCEPTION 'pagamento ignorou caixa de destino ou deixou efeitos da tentativa negada';END IF;
  blocked:=false;denial:=NULL;BEGIN PERFORM public.pdv_get_sales_flow_order_v2(ob);
  EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS denial=PG_EXCEPTION_DETAIL;blocked:=true;END;
  IF NOT blocked OR denial IS DISTINCT FROM 'code=pdv_order_cash_access_denied' THEN
    RAISE EXCEPTION 'detalhe de outro caixa não foi barrado pela custódia antes do core';END IF;
  blocked:=false;denial:=NULL;BEGIN PERFORM public.pdv_get_after_sale_workspace_v2(ob);
  EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS denial=PG_EXCEPTION_DETAIL;blocked:=true;END;
  IF NOT blocked OR denial IS DISTINCT FROM 'code=pdv_order_cash_access_denied' THEN
    RAISE EXCEPTION 'pós-venda de outro caixa não foi barrado pela custódia antes do core';END IF;

  payload:=jsonb_build_object('id',draft_a,'sequence',1,'cart',jsonb_build_object('lines','[]'::jsonb),
    'transactionDate',public.company_today(c)::text,'notes','Privado A');
  saved:=public.pdv_save_order_draft_v2(draft_a,'sale',payload,0,request_id,sa,ta,stock_a);
  replay:=public.pdv_save_order_draft_v2(draft_a,'sale',payload,0,request_id,sa,ta,stock_a);
  IF saved.revision<>1 OR replay.revision<>saved.revision OR replay.payload<>payload
     OR (SELECT count(*) FROM public.pdv_list_order_drafts_v2('sale',sa,ta,stock_a,false))<>1 THEN
    RAISE EXCEPTION 'save/replay de rascunho próprio divergiu ou duplicou revisão';END IF;
  blocked:=false;BEGIN PERFORM public.pdv_save_order_draft_v2(draft_a,'sale',payload||'{"notes":"Concorrente"}',0,gen_random_uuid(),sa,ta,stock_a);
  EXCEPTION WHEN serialization_failure THEN blocked:=true;END;
  IF NOT blocked OR NOT EXISTS(SELECT 1 FROM public.pdv_order_drafts WHERE id=draft_a AND revision=1 AND pdv_order_drafts.payload=fixture.payload) THEN
    RAISE EXCEPTION 'CAS obsoleto sobrescreveu rascunho ou alterou revisão';END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ub,'role','authenticated')::text,true);
  queue:=public.pdv_list_cash_queue_v3(sb,tb);
  IF jsonb_array_length(COALESCE(queue,'[]'::jsonb))<>1 OR queue#>>'{0,id}'<>ob::text THEN RAISE EXCEPTION 'caixa B não recebeu seu próprio destino';END IF;
  blocked:=false;BEGIN PERFORM public.pdv_list_order_drafts_v2('sale',sa,ta,stock_a,false);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'gestor acessou abertura alheia implicitamente';END IF;
  blocked:=false;BEGIN PERFORM public.pdv_save_order_draft_v2(draft_a,'sale',payload,1,gen_random_uuid(),sb,tb,stock_a);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'rascunho foi transferido para outro caixa/autor';END IF;
  UPDATE public.user_permissions SET permissions=permissions||'["fn:operate_other_pdv_cash"]'::jsonb WHERE user_id=ub;
  IF (SELECT count(*) FROM public.pdv_list_order_drafts_v2('sale',sa,ta,stock_a,false))<>0 THEN
    RAISE EXCEPTION 'permissão entre caixas expôs rascunho pessoal de outro usuário';END IF;
  queue:=public.pdv_list_cash_queue_v3(sa,ta);
  IF jsonb_array_length(COALESCE(queue,'[]'::jsonb))<>1 OR queue#>>'{0,id}'<>oa::text THEN RAISE EXCEPTION 'capacidade nominal não liberou fila da mesma empresa';END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ux,'role','authenticated')::text,true);
  blocked:=false;BEGIN PERFORM public.pdv_list_cash_queue_v3(sa,ta);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'fila atravessou tenant com permissão nominal';END IF;
  blocked:=false;BEGIN PERFORM public.pdv_list_order_drafts_v2('sale',sa,ta,stock_a,false);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'rascunho atravessou tenant com permissão nominal';END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  saved:=public.pdv_delete_order_draft_v2(draft_a,1,gen_random_uuid(),'sale',sa,ta,stock_a);
  IF saved.deleted_at IS NULL OR EXISTS(SELECT 1 FROM public.pdv_list_order_drafts_v2('sale',sa,ta,stock_a,false)) THEN
    RAISE EXCEPTION 'exclusão explícita não removeu rascunho da lista ativa';END IF;
END
$behavior$;

ROLLBACK;

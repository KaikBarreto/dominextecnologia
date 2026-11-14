-- Smoke do fluxo configuravel de 2/3 etapas. Executar apos supabase db reset.
BEGIN;

DO $contract$
DECLARE v_src text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='company_settings' AND column_name='pdv_fulfillment_mode')
    OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='pdv_orders' AND column_name='fulfillment_mode_snapshot') THEN
    RAISE EXCEPTION 'colunas canonicas de fulfillment ausentes';
  END IF;
  IF has_function_privilege('authenticated',
      'public.pdv_cover_existing_order_base_v2(uuid,uuid,uuid,uuid,jsonb,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.pdv_assert_dispatch_fulfillment_v2()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.pdv_save_workflow_settings_v3(text,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.pdv_list_sales_flow_v2()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.pdv_get_sales_flow_order_v2(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.pdv_list_sales_flow_v2()','EXECUTE') THEN
    RAISE EXCEPTION 'ACL do fluxo configuravel incorreta';
  END IF;
  SELECT pg_get_functiondef(
    'public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure)
    INTO v_src;
  IF strpos(v_src,'pdv_cover_existing_order_base_v2')=0
    OR strpos(v_src,'pdv_complete_delivery_internal_v2')=0
    OR strpos(v_src,'pdv_apply_settlement_fifo_v2')=0
    OR strpos(v_src,'pdv_capture_delivery_receipt_internal_v2')=0
    OR strpos(v_src,'v_request_id')=0 THEN
    RAISE EXCEPTION 'cobertura nao orquestra entrega atomica/idempotente';
  END IF;
  SELECT pg_get_functiondef('public.pdv_capture_order_receipt_snapshot_v2()'::regprocedure)
    INTO v_src;
  IF strpos(v_src,'fulfillment_mode_snapshot')=0 OR strpos(v_src,'''cashier''')=0
    OR strpos(v_src,'NEW.status')=0 OR strpos(v_src,'''entregue''')=0
    OR strpos(v_src,'pdv_order_receipt_snapshots')=0
    OR strpos(v_src,'Retirada concluída')=0 THEN
    RAISE EXCEPTION 'snapshot cashier pode congelar estado intermediario';
  END IF;
  SELECT pg_get_functiondef('public.pdv_list_sales_flow_v2()'::regprocedure) INTO v_src;
  IF strpos(v_src,'pdv_counter_context_v2')=0 OR strpos(v_src,'can_access_stock')=0
    OR strpos(v_src,'''draft''')=0 OR strpos(v_src,'''cash''')=0
    OR strpos(v_src,'''pickup''')=0 OR strpos(v_src,'''partial''')=0
    OR strpos(v_src,'''completed''')=0 OR strpos(v_src,'''can_see_amount''')=0
    OR strpos(v_src,'LIMIT 500')=0 THEN
    RAISE EXCEPTION 'contrato seguro do Kanban incompleto';
  END IF;
END
$contract$;

DO $behavior$
<<fixture>>
DECLARE
  c uuid:='f8000000-0000-4000-8000-000000000001';
  u uuid:='f8000000-0000-4000-8000-000000000011';
  u_dispatch uuid:='f8000000-0000-4000-8000-000000000012';
  stock_id uuid:='f8000000-0000-4000-8000-000000000021';
  stock_second uuid:='f8000000-0000-4000-8000-000000000022';
  cash_account uuid:='f8000000-0000-4000-8000-000000000031';
  terminal_id uuid:='f8000000-0000-4000-8000-000000000041';
  order_id uuid:='f8000000-0000-4000-8000-000000000051';
  item_id uuid:='f8000000-0000-4000-8000-000000000052';
  preorder_id uuid:='f8000000-0000-4000-8000-000000000061';
  preorder_item uuid:='f8000000-0000-4000-8000-000000000062';
  ambiguous_preorder uuid:='f8000000-0000-4000-8000-000000000063';
  ambiguous_item uuid:='f8000000-0000-4000-8000-000000000064';
  blocked_order uuid:='f8000000-0000-4000-8000-000000000071';
  blocked_item uuid:='f8000000-0000-4000-8000-000000000072';
  session_id uuid; result jsonb; replay jsonb; flow jsonb; blocked boolean;
  delivery_id uuid; before_payments integer; before_deliveries integer;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,
    email_change,email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated',
      'fulfillment-cash@example.invalid','',now(),'{}','{"full_name":"Caixa"}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',u_dispatch,'authenticated','authenticated',
      'fulfillment-dispatch@example.invalid','',now(),'{}','{"full_name":"Expedição"}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Fixture fulfillment','active');
  UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(u,u_dispatch);
  INSERT INTO public.user_roles(user_id,role) VALUES
    (u,'comercial'::public.app_role),(u_dispatch,'comercial'::public.app_role);
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (u,'["screen:pdv","screen:pdv_orders","screen:pdv_dispatch","screen:pdv_settings","fn:manage_pdv_settings","fn:value_pdv_preorder","fn:convert_pdv_preorder","fn:cover_pdv_order","fn:deliver_pdv_order"]',true),
    (u_dispatch,'["screen:pdv_dispatch","fn:deliver_pdv_order"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv');
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
  VALUES(cash_account,c,'Cofre fulfillment','caixa',1000,true);
  INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,
    pdv_strict_cash_tracking,pdv_mode,pdv_fulfillment_mode)
  VALUES(c,'Fixture fulfillment','America/Sao_Paulo',cash_account,true,'balcao','cashier');
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock_id,c,'Loja',true);
  INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES
    (c,stock_id,u),(c,stock_id,u_dispatch);
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active)
  VALUES(terminal_id,c,'Caixa loja',stock_id,true);

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  result:=public.pdv_get_counter_capability_v2();
  IF result->>'fulfillment_mode'<>'cashier' OR (result->>'dispatch_enabled')::boolean
    OR NOT(result->>'cashier_delivery_enabled')::boolean THEN
    RAISE EXCEPTION 'capability de duas etapas incorreta';
  END IF;
  result:=public.pdv_open_cash_session_v2(terminal_id,cash_account,50,'fulfillment-open-0001');
  session_id:=(result->>'session_id')::uuid;

  INSERT INTO public.pdv_orders(id,company_id,number,salesperson_id,stock_id,status,
    subtotal,discount_amount,total,contract_version,operation_mode_snapshot)
  VALUES(order_id,c,1800001,u,stock_id,'aguardando_pagamento',10,0,10,2,'counter');
  INSERT INTO public.pdv_order_items(id,company_id,order_id,description,quantity,
    unit_price,unit_cost,discount_amount,total,sort_order,item_type,unit_cost_v2,
    contract_version,gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2,unit)
  VALUES(item_id,c,order_id,'Serviço entregue no caixa',1,10,0,0,10,0,
    'service',NULL,2,10,0,0,'un');
  IF (SELECT fulfillment_mode_snapshot FROM public.pdv_orders WHERE id=order_id)<>'cashier' THEN
    RAISE EXCEPTION 'pedido nao congelou fulfillment cashier';
  END IF;

  result:=public.pdv_cover_existing_order_v2(order_id,terminal_id,session_id,cash_account,
    jsonb_build_array(jsonb_build_object('method','dinheiro','amount',10)),
    'fulfillment-cover-0001');
  delivery_id:=(result->>'delivery_id')::uuid;
  IF result->>'status'<>'entregue' OR delivery_id IS NULL
    OR (result->>'receipt_snapshot_id') IS NULL
    OR (SELECT snapshot#>>'{fulfillment,status}' FROM public.pdv_order_receipt_snapshots
      WHERE order_id=fixture.order_id)<>'Retirada concluída'
    OR NOT EXISTS(SELECT 1 FROM public.pdv_delivery_items
      WHERE delivery_id=fixture.delivery_id AND order_item_id=item_id AND quantity=1) THEN
    RAISE EXCEPTION 'cobertura cashier nao concluiu entrega/comprovante final';
  END IF;
  SELECT count(*) INTO before_payments FROM public.pdv_order_payments WHERE order_id=order_id;
  SELECT count(*) INTO before_deliveries FROM public.pdv_deliveries WHERE order_id=order_id;
  replay:=public.pdv_cover_existing_order_v2(order_id,terminal_id,session_id,cash_account,
    jsonb_build_array(jsonb_build_object('method','dinheiro','amount',10)),
    'fulfillment-cover-0001');
  IF (replay->>'delivery_id')::uuid IS DISTINCT FROM delivery_id
    OR NOT(replay->>'idempotent')::boolean
    OR before_payments<>(SELECT count(*) FROM public.pdv_order_payments WHERE order_id=order_id)
    OR before_deliveries<>(SELECT count(*) FROM public.pdv_deliveries WHERE order_id=order_id) THEN
    RAISE EXCEPTION 'replay duplicou cobertura ou entrega';
  END IF;
  IF (public.pdv_get_sales_flow_order_v2(order_id)#>>'{order,status}')<>'entregue' THEN
    RAISE EXCEPTION 'detalhe seguro do pos-venda cashier indisponivel';
  END IF;
  blocked:=false;
  BEGIN PERFORM public.pdv_list_dispatch_queue_v2();
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'fila de expedicao abriu no modo cashier'; END IF;

  result:=public.pdv_save_preorder_v2(preorder_id,0,
    jsonb_build_object('operation_mode','counter','discount_amount',0),
    jsonb_build_array(jsonb_build_object('id',preorder_item,'item_type','service',
      'description','Serviço orçamento','quantity',1,'unit_price',5,
      'discount_amount',0,'unit_factor',1,'sort_order',0)),
    'fulfillment-preorder-save-0001');
  result:=public.pdv_forward_preorder_v2(preorder_id,1,'fulfillment-preorder-forward-0001');
  IF (result->>'stock_id')::uuid IS DISTINCT FROM stock_id THEN
    RAISE EXCEPTION 'estoque unico nao foi selecionado automaticamente';
  END IF;

  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock_second,c,'Depósito',false);
  INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(c,stock_second,u);
  result:=public.pdv_save_preorder_v2(ambiguous_preorder,0,
    jsonb_build_object('operation_mode','counter','discount_amount',0),
    jsonb_build_array(jsonb_build_object('id',ambiguous_item,'item_type','service',
      'description','Serviço ambíguo','quantity',1,'unit_price',5,
      'discount_amount',0,'unit_factor',1,'sort_order',0)),
    'fulfillment-ambiguous-save-0001');
  blocked:=false;
  BEGIN PERFORM public.pdv_forward_preorder_v2(
    ambiguous_preorder,1,'fulfillment-ambiguous-forward-0001');
  EXCEPTION WHEN not_null_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'orcamento ambiguo avancou sem estoque'; END IF;

  DELETE FROM public.stock_access WHERE company_id=c AND stock_id=stock_second;
  result:=public.pdv_save_workflow_settings_v3('balcao','dispatch');
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',u_dispatch,'role','authenticated')::text,true);
  flow:=public.pdv_list_sales_flow_v2();
  IF jsonb_typeof(flow)<>'array' OR jsonb_array_length(flow)=0
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(flow) card
      WHERE (card->>'can_see_amount')::boolean OR card->'total'<>'null'::jsonb)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(flow) card
      WHERE card->>'flow_id'=order_id::text AND card->>'stage'='completed') THEN
    RAISE EXCEPTION 'projecao de expedicao vazou total ou perdeu card entregue';
  END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  INSERT INTO public.pdv_orders(id,company_id,number,salesperson_id,stock_id,status,
    subtotal,discount_amount,total,contract_version,operation_mode_snapshot)
  VALUES(blocked_order,c,1800002,u,stock_id,'aguardando_pagamento',1,0,1,2,'counter');
  INSERT INTO public.pdv_order_items(id,company_id,order_id,description,quantity,
    unit_price,unit_cost,discount_amount,total,sort_order,item_type,unit_cost_v2,
    contract_version,gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2,unit)
  VALUES(blocked_item,c,blocked_order,'Pendente',1,1,0,0,1,0,'service',NULL,2,1,0,0,'un');
  blocked:=false;
  BEGIN PERFORM public.pdv_save_workflow_settings_v3('balcao','cashier');
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'configuracao ocultou pedido ativo'; END IF;
END
$behavior$;

ROLLBACK;

-- Contrato e smoke W6-01. Executar depois de supabase db reset.
BEGIN;

DO $contract$
DECLARE v_fn text; v_src text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.get_material_purchase_report_v2(date,date,uuid[],uuid[],uuid[],uuid[],uuid[],integer,integer)',
    'public.get_inventory_abc_report(date,date,uuid[])',
    'public.pdv_partial_projection_report_v2(text,date,date,integer,integer)',
    'public.pdv_global_event_history_v2(date,date,uuid,integer,integer)',
    'public.pdv_document_index_v2(integer,integer)'
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE')
       OR NOT has_function_privilege('authenticated',v_fn,'EXECUTE') THEN
      RAISE EXCEPTION 'ACL publica incorreta em %',v_fn; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_proc procedure WHERE procedure.oid=v_fn::regprocedure
      AND procedure.prosecdef AND EXISTS(SELECT 1 FROM unnest(procedure.proconfig) setting
        WHERE setting LIKE 'search_path=%')) THEN
      RAISE EXCEPTION 'RPC sem SECURITY DEFINER/search_path em %',v_fn; END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_commercial_facts_v2(uuid)',
    'public.pdv_reports_context_v2(text,boolean)',
    'public.pdv_material_purchase_rows_v2(uuid,uuid,date,date,uuid[],uuid[],uuid[],uuid[])',
    'public.pdv_guard_financial_cash_session_v2()',
    'public.pdv_attach_cash_session_to_financial_v2()',
    'public.pdv_attach_order_session_to_financial_v2()'
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE')
       OR has_function_privilege('authenticated',v_fn,'EXECUTE') THEN
      RAISE EXCEPTION 'helper interno exposto em %',v_fn; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='financial_transactions'
      AND column_name='pdv_cash_session_id' AND is_nullable='YES') THEN
    RAISE EXCEPTION 'vinculo opcional da sessao ausente'; END IF;
  SELECT pg_get_functiondef('public.pdv_commercial_facts_v2(uuid)'::regprocedure) INTO v_src;
  IF position('pdv_delivery_items' in v_src)=0 OR position('pdv_commercial_return_items' in v_src)=0
     OR position('pdv_commercial_returns' in v_src)=0 OR v_src~*'orders\.status' THEN
    RAISE EXCEPTION 'fonte comercial nao e entrega menos devolucao ou depende de status'; END IF;
  SELECT pg_get_functiondef('public.get_inventory_abc_report(date,date,uuid[])'::regprocedure) INTO v_src;
  IF position('pdv_commercial_facts_v2' in v_src)=0 OR v_src~*'orders\.status' THEN
    RAISE EXCEPTION 'ABC divergiu da fonte canonica'; END IF;
  SELECT pg_get_functiondef('public.pdv_global_event_history_v2(date,date,uuid,integer,integer)'::regprocedure) INTO v_src;
  IF position('pdv_cash_session_id' in v_src)=0 OR position('Caixa não identificado' in v_src)=0
     OR v_src~*'opened_at.*transaction' THEN
    RAISE EXCEPTION 'historico infere sessao ou perdeu o rotulo legado'; END IF;
  SELECT pg_get_functiondef('public.pdv_attach_order_session_to_financial_v2()'::regprocedure) INTO v_src;
  IF position('settlement_transaction_id' in v_src)=0 OR position('cash_session_id' in v_src)=0
     OR v_src~*'(opened_at|created_at).*financial_transactions' THEN
    RAISE EXCEPTION 'Pix/transferencia nao usa vinculo explicito pedido-sessao'; END IF;
  SELECT pg_get_functiondef('public.pdv_material_purchase_rows_v2(uuid,uuid,date,date,uuid[],uuid[],uuid[],uuid[])'::regprocedure) INTO v_src;
  IF position('AT TIME ZONE' in v_src)=0 OR position('purchase_date' in v_src)=0 THEN
    RAISE EXCEPTION 'compras nao respeitam data civil explicita/fuso'; END IF;
  SELECT pg_get_functiondef('public.pdv_partial_projection_report_v2(text,date,date,integer,integer)'::regprocedure) INTO v_src;
  IF position('pdv_financial_projection_page_v2' in v_src)=0
     OR position('pdv_partial' in v_src)=0 THEN
    RAISE EXCEPTION 'recorte parcial W1C nao esta explicitamente isolado'; END IF;
END $contract$;

DO $behavior$
DECLARE
  company_a uuid:='b1400000-0000-4000-8000-000000000001';
  company_b uuid:='b1400000-0000-4000-8000-000000000002';
  user_a uuid:='b1400000-0000-4000-8000-000000000011';
  user_b uuid:='b1400000-0000-4000-8000-000000000012';
  user_operator uuid:='b1400000-0000-4000-8000-000000000013';
  user_denied uuid:='b1400000-0000-4000-8000-000000000014';
  stock_a uuid:='b1400000-0000-4000-8000-000000000021';
  stock_b uuid:='b1400000-0000-4000-8000-000000000022';
  inventory_known uuid:='b1400000-0000-4000-8000-000000000031';
  inventory_unknown uuid:='b1400000-0000-4000-8000-000000000032';
  inventory_no_pdv uuid:='b1400000-0000-4000-8000-000000000033';
  order_id uuid:='b1400000-0000-4000-8000-000000000041';
  item_known uuid:='b1400000-0000-4000-8000-000000000042';
  item_unknown uuid:='b1400000-0000-4000-8000-000000000043';
  order_pix uuid:='b1400000-0000-4000-8000-000000000044';
  reservation_known uuid:='b1400000-0000-4000-8000-000000000045';
  reservation_unknown uuid:='b1400000-0000-4000-8000-000000000046';
  delivery_1 uuid:='b1400000-0000-4000-8000-000000000051';
  delivery_2 uuid:='b1400000-0000-4000-8000-000000000052';
  delivery_u uuid:='b1400000-0000-4000-8000-000000000053';
  delivery_item_1 uuid:='b1400000-0000-4000-8000-000000000061';
  delivery_item_2 uuid:='b1400000-0000-4000-8000-000000000062';
  delivery_item_u uuid:='b1400000-0000-4000-8000-000000000063';
  request_return uuid:='b1400000-0000-4000-8000-000000000071';
  request_reversal uuid:='b1400000-0000-4000-8000-000000000072';
  return_id uuid:='b1400000-0000-4000-8000-000000000073';
  reversal_id uuid:='b1400000-0000-4000-8000-000000000074';
  return_item uuid:='b1400000-0000-4000-8000-000000000075';
  reversal_item uuid:='b1400000-0000-4000-8000-000000000076';
  terminal_1 uuid:='b1400000-0000-4000-8000-000000000081';
  terminal_2 uuid:='b1400000-0000-4000-8000-000000000082';
  account_id uuid:='b1400000-0000-4000-8000-000000000083';
  session_1 uuid:='b1400000-0000-4000-8000-000000000084';
  session_2 uuid:='b1400000-0000-4000-8000-000000000085';
  tx_1 uuid:='b1400000-0000-4000-8000-000000000086';
  tx_2 uuid:='b1400000-0000-4000-8000-000000000087';
  tx_legacy uuid:='b1400000-0000-4000-8000-000000000088';
  request_cash_1 uuid:='b1400000-0000-4000-8000-000000000089';
  request_cash_2 uuid:='b1400000-0000-4000-8000-00000000008a';
  bank_id uuid:='b1400000-0000-4000-8000-00000000008b';
  account_b uuid:='b1400000-0000-4000-8000-00000000008c';
  terminal_b uuid:='b1400000-0000-4000-8000-00000000008d';
  session_b uuid:='b1400000-0000-4000-8000-00000000008e';
  supplier_1 uuid:='b1400000-0000-4000-8000-000000000091';
  supplier_2 uuid:='b1400000-0000-4000-8000-000000000092';
  supplier_3 uuid:='b1400000-0000-4000-8000-000000000093';
  supplier_4 uuid:='b1400000-0000-4000-8000-000000000094';
  purchase_1 uuid:='b1400000-0000-4000-8000-0000000000a1';
  purchase_2 uuid:='b1400000-0000-4000-8000-0000000000a2';
  purchase_3 uuid:='b1400000-0000-4000-8000-0000000000a3';
  purchase_4 uuid:='b1400000-0000-4000-8000-0000000000a4';
  purchase_order_1 uuid:='b1400000-0000-4000-8000-0000000000b1';
  purchase_order_2 uuid:='b1400000-0000-4000-8000-0000000000b2';
  purchase_order_3 uuid:='b1400000-0000-4000-8000-0000000000b3';
  purchase_order_4 uuid:='b1400000-0000-4000-8000-0000000000b4';
  today_a date; first_day date; report jsonb; report_again jsonb; abc record;
  fact_quantity numeric; fact_revenue numeric; fact_cmv numeric;
  partial jsonb; history jsonb; docs_1 jsonb; docs_2 jsonb;
  blocked boolean;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  VALUES
    ('00000000-0000-0000-0000-000000000000',user_a,'authenticated','authenticated','w6-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',user_b,'authenticated','authenticated','w6-b@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',user_operator,'authenticated','authenticated','w6-op@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',user_denied,'authenticated','authenticated','w6-no@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES
    (company_a,'W6 Empresa PDV','active'),(company_b,'W6 Empresa sem PDV','active');
  UPDATE public.profiles SET company_id=company_a,is_active=true WHERE user_id=user_a;
  UPDATE public.profiles SET company_id=company_b,is_active=true WHERE user_id=user_b;
  UPDATE public.profiles SET company_id=company_a,is_active=true WHERE user_id IN(user_operator,user_denied);
  INSERT INTO public.user_roles(user_id,role) VALUES(user_a,'admin'),(user_b,'admin'),
    (user_operator,'comercial'),(user_denied,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (user_operator,'["screen:pdv_reports","screen:inventory"]',true),(user_denied,'[]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(company_a,'basic'),(company_a,'pdv'),(company_b,'basic');
  INSERT INTO public.company_settings(company_id,name,timezone) VALUES(company_a,'W6 Empresa PDV','America/Sao_Paulo');
  today_a:=public.company_today(company_a); first_day:=today_a-1;
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES
    (stock_a,company_a,'Principal',true),(stock_b,company_b,'Principal B',true);
  INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price) VALUES
    (inventory_known,company_a,'W6-K','Material centavos','un',3,2.01,3.34),
    (inventory_unknown,company_a,'W6-U','Material sem custo','un',1,NULL,4.99),
    (inventory_no_pdv,company_b,'W6-N','Material apenas estoque','un',2,1,2);
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity) VALUES
    (company_a,inventory_known,stock_a,3),(company_a,inventory_unknown,stock_a,1),
    (company_b,inventory_no_pdv,stock_b,2);
  INSERT INTO public.suppliers(id,company_id,name) VALUES
    (supplier_1,company_a,'Fornecedor recebido'),(supplier_2,company_a,'Fornecedor parcial'),
    (supplier_3,company_a,'Fornecedor rascunho'),(supplier_4,company_a,'Fornecedor cancelado');
  INSERT INTO public.compras(id,company_id,title,status,stock_id,flow_type,created_by) VALUES
    (purchase_1,company_a,'Compra recebida','concluida',stock_a,'requisicao',user_a),
    (purchase_2,company_a,'Compra parcial','concluida',stock_a,'requisicao',user_a),
    (purchase_3,company_a,'Compra rascunho','aberta',stock_a,'requisicao',user_a),
    (purchase_4,company_a,'Compra cancelada','cancelada',stock_a,'requisicao',user_a);
  INSERT INTO public.compra_ordens(id,company_id,compra_id,supplier_id,numero,status,received_at,created_by,updated_at) VALUES
    (purchase_order_1,company_a,purchase_1,supplier_1,1401,'recebida',
      (first_day+time '00:01') AT TIME ZONE 'America/Sao_Paulo',user_a,now()),
    (purchase_order_2,company_a,purchase_2,supplier_2,1402,'recebida_parcial',NULL,user_a,
      (today_a+time '23:59') AT TIME ZONE 'America/Sao_Paulo'),
    (purchase_order_3,company_a,purchase_3,supplier_3,1403,'rascunho',NULL,user_a,
      (today_a+time '12:00') AT TIME ZONE 'America/Sao_Paulo'),
    (purchase_order_4,company_a,purchase_4,supplier_4,1404,'cancelada',NULL,user_a,
      (today_a+time '12:00') AT TIME ZONE 'America/Sao_Paulo');
  INSERT INTO public.compra_ordem_itens(company_id,ordem_id,inventory_id,material_name,unit,
    quantity_ordered,quantity_received,unit_price) VALUES
    (company_a,purchase_order_1,inventory_known,'Material centavos','un',2,2,1.23),
    (company_a,purchase_order_2,inventory_known,'Material centavos','un',2,1,1.23),
    (company_a,purchase_order_3,inventory_known,'Material centavos','un',1,1,99),
    (company_a,purchase_order_4,inventory_known,'Material centavos','un',1,1,99);
  INSERT INTO public.pdv_orders(id,company_id,number,stock_id,status,subtotal,total,client_request_id,
    contract_version,operation_mode_snapshot)
  VALUES(order_id,company_a,1400001,stock_a,'entregue',15,15,'w6-report-order',2,'direct');
  INSERT INTO public.pdv_order_items(id,company_id,order_id,inventory_id,description,quantity,unit_price,unit_cost,total,
    sort_order,item_type,unit_cost_v2,contract_version,gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2)
  VALUES
    (item_known,company_a,order_id,inventory_known,'Material centavos',3,3.34,2.01,10.01,1,'material',2.01,2,10.02,0.01,0),
    (item_unknown,company_a,order_id,inventory_unknown,'Material sem custo',1,4.99,0,4.99,2,'material',NULL,2,4.99,0,0);
  INSERT INTO public.pdv_stock_reservation_items(id,company_id,inventory_id,stock_id,order_item_id,state,
    reserved_quantity,consumed_quantity,cost_price_snapshot)
  VALUES(reservation_known,company_a,inventory_known,stock_a,item_known,'consumed',3,3,2.01),
        (reservation_unknown,company_a,inventory_unknown,stock_a,item_unknown,'consumed',1,1,NULL);
  INSERT INTO public.inventory_movements(id,company_id,inventory_id,stock_id,movement_type,quantity,unit_cost,notes,created_at)
  VALUES
    ('b1400000-0000-4000-8000-0000000000c1',company_a,inventory_known,stock_a,'saida',-1,2.01,'Entrega W6 1',
      (first_day+time '00:01') AT TIME ZONE 'America/Sao_Paulo'),
    ('b1400000-0000-4000-8000-0000000000c2',company_a,inventory_known,stock_a,'saida',-2,2.01,'Entrega W6 2',
      (today_a+time '23:59') AT TIME ZONE 'America/Sao_Paulo'),
    ('b1400000-0000-4000-8000-0000000000c3',company_a,inventory_unknown,stock_a,'saida',-1,NULL,'Entrega W6 sem custo',
      (today_a+time '12:00') AT TIME ZONE 'America/Sao_Paulo');
  INSERT INTO public.pdv_deliveries(id,company_id,order_id,client_request_id,payload_hash,created_at) VALUES
    (delivery_1,company_a,order_id,gen_random_uuid(),repeat('1',64),(first_day+time '00:01') AT TIME ZONE 'America/Sao_Paulo'),
    (delivery_2,company_a,order_id,gen_random_uuid(),repeat('2',64),(today_a+time '23:59') AT TIME ZONE 'America/Sao_Paulo'),
    (delivery_u,company_a,order_id,gen_random_uuid(),repeat('3',64),(today_a+time '12:00') AT TIME ZONE 'America/Sao_Paulo');
  INSERT INTO public.pdv_delivery_items(id,company_id,delivery_id,order_item_id,reservation_id,inventory_movement_id,
    quantity,item_type,unit_cost_snapshot) VALUES
    (delivery_item_1,company_a,delivery_1,item_known,reservation_known,'b1400000-0000-4000-8000-0000000000c1',1,'material',2.01),
    (delivery_item_2,company_a,delivery_2,item_known,reservation_known,'b1400000-0000-4000-8000-0000000000c2',2,'material',2.01),
    (delivery_item_u,company_a,delivery_u,item_unknown,reservation_unknown,'b1400000-0000-4000-8000-0000000000c3',1,'material',NULL);
  INSERT INTO public.pdv_operation_requests(id,company_id,operation_type,idempotency_key,payload_hash) VALUES
    (request_return,company_a,'commercial.return.v2','w6-return-0001',repeat('a',64)),
    (request_reversal,company_a,'commercial.return.reverse.v2','w6-reverse-0001',repeat('b',64));
  INSERT INTO public.pdv_commercial_returns(id,company_id,order_id,event_kind,occurred_on,reason,
    commercial_total,cmv_total,operation_request_id)
  VALUES(return_id,company_a,order_id,'return',today_a,'Smoke W6',-3.34,-2.01,request_return);
  INSERT INTO public.inventory_movements(id,company_id,inventory_id,stock_id,movement_type,quantity,unit_cost,notes,created_at)
  VALUES('b1400000-0000-4000-8000-0000000000c4',company_a,inventory_known,stock_a,'entrada',1,2.01,'Devolucao W6',
      (today_a+time '23:58') AT TIME ZONE 'America/Sao_Paulo');
  INSERT INTO public.pdv_commercial_return_items(id,company_id,commercial_return_id,delivery_item_id,
    inventory_id,destination,destination_stock_id,quantity,commercial_amount,cmv_amount,inventory_movement_id)
  VALUES(return_item,company_a,return_id,delivery_item_2,inventory_known,'saleable',stock_a,1,-3.34,-2.01,
    'b1400000-0000-4000-8000-0000000000c4');
  INSERT INTO public.pdv_commercial_returns(id,company_id,order_id,event_kind,occurred_on,reason,
    commercial_total,cmv_total,reversal_of_id,operation_request_id)
  VALUES(reversal_id,company_a,order_id,'reversal',today_a,'Compensacao W6',3.34,2.01,return_id,request_reversal);
  INSERT INTO public.inventory_movements(id,company_id,inventory_id,stock_id,movement_type,quantity,unit_cost,notes,created_at)
  VALUES('b1400000-0000-4000-8000-0000000000c5',company_a,inventory_known,stock_a,'saida',-1,2.01,'Compensacao devolucao W6',
      (today_a+time '23:59') AT TIME ZONE 'America/Sao_Paulo');
  INSERT INTO public.pdv_commercial_return_items(id,company_id,commercial_return_id,delivery_item_id,
    inventory_id,destination,destination_stock_id,quantity,commercial_amount,cmv_amount,inventory_movement_id,reversal_of_item_id)
  VALUES(reversal_item,company_a,reversal_id,delivery_item_2,inventory_known,'saleable',stock_a,1,3.34,2.01,
    'b1400000-0000-4000-8000-0000000000c5',return_item);
  INSERT INTO public.inventory_movements(id,company_id,inventory_id,stock_id,movement_type,quantity,unit_cost,notes,created_at)
  VALUES
    ('b1400000-0000-4000-8000-0000000000c6',company_a,inventory_unknown,stock_a,'consumo',-0.25,NULL,'Consumo inicio do dia',
      (first_day+time '00:01') AT TIME ZONE 'America/Sao_Paulo'),
    ('b1400000-0000-4000-8000-0000000000c7',company_a,inventory_unknown,stock_a,'consumo',-0.25,NULL,'Consumo fim do dia',
      (today_a+time '23:59') AT TIME ZONE 'America/Sao_Paulo');

  SELECT sum(net_quantity),round(sum(net_revenue),2),
    CASE WHEN bool_or(NOT cost_known) THEN NULL ELSE round(sum(net_cmv),2) END
    INTO fact_quantity,fact_revenue,fact_cmv
    FROM public.pdv_commercial_facts_v2(company_a)
   WHERE inventory_id=inventory_known AND event_date BETWEEN first_day AND today_a;
  IF fact_quantity<>3 OR fact_revenue<>10.01 OR fact_cmv<>6.03 THEN
    RAISE EXCEPTION 'entrega parcial/return/reversal duplicou fatos: %, %, %',fact_quantity,fact_revenue,fact_cmv; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_commercial_facts_v2(company_a)
    WHERE inventory_id=inventory_unknown AND cost_known IS FALSE AND net_cmv IS NULL) THEN
    RAISE EXCEPTION 'CMV desconhecido deixou de ser NULL'; END IF;

  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
  VALUES(account_id,company_a,'Cofre W6','caixa',100,true),
        (bank_id,company_a,'Banco W6','banco',0,true),
        (account_b,company_b,'Cofre B','caixa',10,true);
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id) VALUES
    (terminal_1,company_a,'Caixa 1',stock_a),(terminal_2,company_a,'Caixa 2',stock_a),
    (terminal_b,company_b,'Caixa B',stock_b);
  INSERT INTO public.pdv_cash_sessions(id,company_id,terminal_id,opening_amount,cash_account_id,
    cash_account_name_snapshot,cash_policy_snapshot,contract_version,status,opened_by)
  VALUES(session_1,company_a,terminal_1,0,account_id,'Cofre W6','{"strict_tracking":true}',2,'aberta',NULL),
        (session_2,company_a,terminal_2,0,account_id,'Cofre W6','{"strict_tracking":true}',2,'aberta',NULL),
        (session_b,company_b,terminal_b,0,account_b,'Cofre B','{"strict_tracking":true}',2,'aberta',NULL);
  UPDATE public.pdv_orders SET cash_session_id=session_1 WHERE id=order_id;
  INSERT INTO public.pdv_orders(id,company_id,number,stock_id,status,subtotal,total,client_request_id,
    contract_version,operation_mode_snapshot,cash_session_id)
  VALUES(order_pix,company_a,1400002,stock_a,'entregue',7,7,'w6-report-pix',2,'direct',session_2);
  INSERT INTO public.pdv_operation_requests(id,company_id,operation_type,idempotency_key,payload_hash) VALUES
    (request_cash_1,company_a,'cash.event.v2','w6-cash-event-0001',repeat('c',64)),
    (request_cash_2,company_a,'cash.event.v2','w6-cash-event-0002',repeat('d',64));
  INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,transaction_date,paid_date,is_paid,account_id,origin)
  VALUES(tx_1,company_a,'entrada','Caixa um',5,today_a,today_a,true,account_id,'pdv'),
        (tx_legacy,company_a,'entrada','Legado sem caixa',1,today_a,today_a,true,account_id,'pdv');
  INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,transaction_date,paid_date,
    is_paid,account_id,origin,payment_method,pdv_financial_role,pdv_settlement_group_id)
  VALUES(tx_2,company_a,'entrada','Pix do caixa dois',7,today_a,today_a,true,bank_id,'pdv','pix',
    'pdv_receivable_settlement',request_cash_2);
  INSERT INTO public.pdv_cash_custody_entries(company_id,session_id,cash_account_id,operation_request_id,
    entry_kind,amount,source_type,source_id,financial_transaction_id)
  VALUES(company_a,session_1,account_id,request_cash_1,'cash_receipt',5,'financial_transaction',tx_1,tx_1),
        (company_a,session_2,account_id,request_cash_2,'opening',0,'pdv_cash_session',session_2,NULL);
  INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,change_amount,financial_account_id,
    contract_version,coverage_kind,coverage_status,settlement_status,settlement_transaction_id,authorized_at,settled_at)
  VALUES(company_a,order_pix,'pix',7,0,bank_id,2,'pix','authorized','settled',tx_2,now(),now());
  IF (SELECT pdv_cash_session_id FROM public.financial_transactions WHERE id=tx_1)<>session_1
     OR (SELECT pdv_cash_session_id FROM public.financial_transactions WHERE id=tx_2)<>session_2
     OR (SELECT pdv_cash_session_id FROM public.financial_transactions WHERE id=tx_legacy) IS NOT NULL THEN
    RAISE EXCEPTION 'dois caixas ou legado foram associados incorretamente'; END IF;

  INSERT INTO public.pdv_order_receipt_snapshots(company_id,order_id,snapshot,snapshot_hash)
  VALUES(company_a,order_id,'{"kind":"order"}',repeat('e',64));
  INSERT INTO public.pdv_delivery_receipt_snapshots(company_id,delivery_id,order_id,snapshot,snapshot_hash)
  VALUES(company_a,delivery_1,order_id,'{"kind":"delivery"}',repeat('f',64));

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_a,'role','authenticated')::text,true);
  report:=public.get_material_purchase_report_v2(first_day,today_a,NULL,NULL,NULL,NULL,NULL,100,0);
  report_again:=public.get_material_purchase_report_v2(first_day,today_a,NULL,NULL,NULL,NULL,NULL,100,0);
  IF report IS DISTINCT FROM report_again OR report#>>'{capabilities,pdv_commercial}'<>'true'
     OR (SELECT (row->>'net_revenue')::numeric FROM jsonb_array_elements(report->'rows') row
          WHERE row->>'inventory_id'=inventory_known::text)<>10.01
     OR (SELECT (row->>'purchased_quantity')::numeric FROM jsonb_array_elements(report->'rows') row
          WHERE row->>'inventory_id'=inventory_known::text)<>3
     OR (SELECT (row->>'purchased_total')::numeric FROM jsonb_array_elements(report->'rows') row
          WHERE row->>'inventory_id'=inventory_known::text)<>3.69
     OR (SELECT row->>'net_cmv' FROM jsonb_array_elements(report->'rows') row
          WHERE row->>'inventory_id'=inventory_unknown::text) IS NOT NULL THEN
    RAISE EXCEPTION 'relatorio nao preservou centavos/CMV/export deterministico: %',report; END IF;
  SELECT * INTO abc FROM public.get_inventory_abc_report(first_day,today_a,NULL) row
    WHERE row.inventory_id=inventory_known;
  IF abc.pdv_quantity<>3 OR abc.pdv_revenue<>10.01 OR abc.pdv_cost<>6.03 OR abc.pdv_margin<>3.98
     OR abc.usage_quantity<>0 OR abc.usage_value<>0 THEN
    RAISE EXCEPTION 'ABC divergiu do relatorio: %',abc; END IF;
  SELECT * INTO abc FROM public.get_inventory_abc_report(first_day,today_a,NULL) row
    WHERE row.inventory_id=inventory_unknown;
  IF abc.pdv_quantity<>1 OR abc.pdv_cost IS NOT NULL OR abc.pdv_margin IS NOT NULL
     OR abc.usage_quantity<>0.5 THEN
    RAISE EXCEPTION 'ABC perdeu custo NULL ou bordas civis do uso: %',abc; END IF;
  partial:=public.pdv_partial_projection_report_v2('dre_competence',first_day,today_a,1,0);
  IF partial->>'scope'<>'pdv_partial' OR partial->'initial_balance'<>'null'::jsonb
     OR partial->'closing_availability'<>'null'::jsonb THEN
    RAISE EXCEPTION 'projecao parcial publicou disponibilidade global: %',partial; END IF;
  history:=public.pdv_global_event_history_v2(first_day,today_a,NULL,100,0);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(history->'entries') entry
      WHERE entry->>'label'='Legado sem caixa' AND entry->>'cash_session_label'='Caixa não identificado')
     OR (SELECT count(*) FROM jsonb_array_elements(history->'entries') entry
          WHERE entry->>'event_type'='cash_session_open')<>2 THEN
    RAISE EXCEPTION 'historico perdeu legado ou lifecycle dos dois caixas: %',history; END IF;
  history:=public.pdv_global_event_history_v2(first_day,today_a,session_2,100,0);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(history->'entries') entry
      WHERE entry->>'event_id'=tx_2::text AND entry->>'label'='Pix do caixa dois')
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(history->'entries') entry
      WHERE entry->>'event_id'=tx_1::text) THEN
    RAISE EXCEPTION 'filtro multi-caixa perdeu Pix ou misturou dinheiro: %',history; END IF;
  docs_1:=public.pdv_document_index_v2(1,0); docs_2:=public.pdv_document_index_v2(1,1);
  IF docs_1#>>'{documents,0,id}'=docs_2#>>'{documents,0,id}'
     OR (docs_1::text||docs_2::text) LIKE '%"snapshot"%' THEN
    RAISE EXCEPTION 'indice de documentos duplicou pagina ou copiou snapshot'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_operator,'role','authenticated')::text,true);
  history:=public.pdv_global_event_history_v2(first_day,today_a,NULL,100,0);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(history->'entries') entry
      WHERE entry->'amount'<>'null'::jsonb) THEN
    RAISE EXCEPTION 'operador sem totais financeiros recebeu valores: %',history; END IF;
  docs_1:=public.pdv_document_index_v2(100,0);
  IF docs_1::text LIKE '%"snapshot"%' OR docs_1::text LIKE '%cost%' THEN
    RAISE EXCEPTION 'indice de documentos vazou snapshot/custo'; END IF;
  PERFORM public.get_material_purchase_report_v2(first_day,today_a,NULL,NULL,NULL,NULL,NULL,10,0);
  blocked:=false;
  BEGIN PERFORM public.pdv_global_event_history_v2(first_day,today_a,session_b,10,0);
  EXCEPTION WHEN no_data_found THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'operador consultou sessao de outro tenant'; END IF;
  blocked:=false;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_denied,'role','authenticated')::text,true);
  BEGIN PERFORM public.pdv_document_index_v2(10,0);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'usuario sem tela acessou relatorios PDV'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_b,'role','authenticated')::text,true);
  report:=public.get_material_purchase_report_v2(first_day,today_a,NULL,NULL,NULL,NULL,NULL,100,0);
  IF report#>>'{capabilities,pdv_commercial}'<>'false'
     OR (report#>>'{rows,0,net_revenue}') IS NOT NULL
     OR jsonb_array_length(report->'rows')<>1 THEN
    RAISE EXCEPTION 'empresa sem PDV perdeu compras/estoque ou ganhou comercial: %',report; END IF;

  -- O reset apaga os livros PDV; o FK SET NULL e os guards nao podem travar o
  -- lifecycle mesmo com lancamentos associados a duas sessoes diferentes.
  UPDATE public.user_roles SET role='super_admin'::public.app_role WHERE user_id=user_a;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_a,'role','authenticated')::text,true);
  PERFORM public.reset_system_step(company_a,'pdv',gen_random_uuid());
  IF EXISTS(SELECT 1 FROM public.pdv_cash_sessions WHERE company_id=company_a)
     OR EXISTS(SELECT 1 FROM public.pdv_orders WHERE company_id=company_a)
     OR EXISTS(SELECT 1 FROM public.pdv_order_receipt_snapshots WHERE company_id=company_a)
     OR EXISTS(SELECT 1 FROM public.financial_transactions
       WHERE company_id=company_a AND pdv_cash_session_id IS NOT NULL) THEN
    RAISE EXCEPTION 'reset PDV deixou sessao/documento/vinculo orfao ou foi bloqueado'; END IF;
END $behavior$;

ROLLBACK;

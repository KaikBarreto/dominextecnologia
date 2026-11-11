-- Smoke W5-01: devolucao comercial por entrega, disposicao W4 e saldo residual.
-- Executar depois de supabase db reset.
BEGIN;

DO $contract$
DECLARE v_fn text; v_src text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_get_returnable_order_v2(uuid)',
    'public.pdv_return_delivery_items_v2(uuid,jsonb,jsonb,date,text,text)',
    'public.pdv_reverse_commercial_return_v2(uuid,text,text)',
    'public.pdv_cancel_order_residual_v2(uuid,text,text)'
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE')
       OR NOT has_function_privilege('authenticated',v_fn,'EXECUTE') THEN
      RAISE EXCEPTION 'ACL pública incorreta em %',v_fn; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_proc procedure WHERE procedure.oid=v_fn::regprocedure
      AND procedure.prosecdef AND ('search_path=pg_catalog, public'=ANY(procedure.proconfig)
        OR 'search_path=pg_catalog, public, extensions'=ANY(procedure.proconfig))) THEN
      RAISE EXCEPTION 'RPC sem SECURITY DEFINER/search_path em %',v_fn; END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_returns_v2_enabled_internal(uuid)',
    'public.pdv_returns_context_v2(text)',
    'public.pdv_guard_return_append_only_v2()',
    'public.pdv_guard_quarantine_reservation_v2()',
    'public.pdv_guard_quarantine_stock_v2()',
    'public.pdv_return_credit_entry_internal_v2(uuid,uuid,uuid,text,numeric,date,text,uuid,uuid,text)'
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE')
      OR has_function_privilege('authenticated',v_fn,'EXECUTE')
      OR has_function_privilege('service_role',v_fn,'EXECUTE') THEN
      RAISE EXCEPTION 'helper owner-only exposto em %',v_fn; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM (VALUES('pdv_commercial_returns'),('pdv_commercial_return_items'),
      ('pdv_return_dispositions'),('pdv_order_residual_cancellations')) names(name)
    WHERE NOT EXISTS(SELECT 1 FROM pg_class table_row JOIN pg_namespace namespace ON namespace.oid=table_row.relnamespace
      WHERE namespace.nspname='public' AND table_row.relname=names.name
        AND table_row.relrowsecurity AND table_row.relforcerowsecurity)) THEN
    RAISE EXCEPTION 'livro W5 sem FORCE RLS'; END IF;
  IF has_table_privilege('authenticated','public.pdv_commercial_returns','SELECT')
    OR has_table_privilege('service_role','public.pdv_commercial_return_items','INSERT') THEN
    RAISE EXCEPTION 'livro W5 exposto diretamente'; END IF;
  SELECT pg_get_functiondef('public.pdv_return_delivery_items_v2(uuid,jsonb,jsonb,date,text,text)'::regprocedure) INTO v_src;
  IF position('pdv_delivery_items' in v_src)=0 OR position('FOR UPDATE' in v_src)=0
    OR position('register_inventory_movement' in v_src)=0
    OR v_src~*'(nfce|nfc-e|fiscal_document|invoice|voucher|refund)' THEN
    RAISE EXCEPTION 'writer W5 não prova entrega/lock/Kardex ou invadiu fiscal/refund'; END IF;
  IF position('FROM public.customers customer' in v_src)=0
    OR position('FROM public.inventory inventory' in v_src)<=position('FROM public.customers customer' in v_src)
    OR position('FROM public.inventory_stock_levels level' in v_src)<=position('FROM public.inventory inventory' in v_src)
    OR position('FROM public.pdv_delivery_items delivery_item' in v_src)<=position('FROM public.inventory_stock_levels level' in v_src)
    OR position('jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100' in v_src)=0 THEN
    RAISE EXCEPTION 'hierarquia/cap de locks do retorno regrediu'; END IF;
  SELECT pg_get_functiondef('public.pdv_reverse_commercial_return_v2(uuid,text,text)'::regprocedure) INTO v_src;
  IF position('FROM public.customers customer' in v_src)=0
    OR position('FROM public.inventory inventory' in v_src)<=position('FROM public.customers customer' in v_src)
    OR position('FROM public.inventory_stock_levels level' in v_src)<=position('FROM public.inventory inventory' in v_src)
    OR position('FROM public.pdv_delivery_items delivery_item' in v_src)<=position('FROM public.inventory_stock_levels level' in v_src)
    OR position('reserved_quantity-reservation.consumed_quantity' in v_src)=0 THEN
    RAISE EXCEPTION 'hierarquia/disponibilidade da compensação regrediu'; END IF;
  SELECT pg_get_functiondef('public.pdv_financial_projection_rows_v2(uuid)'::regprocedure) INTO v_src;
  IF position('commercial_return_v2' in v_src)=0 THEN RAISE EXCEPTION 'competência não inclui devolução'; END IF;
  SELECT pg_get_functiondef('public.reset_system_step(uuid,text,uuid)'::regprocedure) INTO v_src;
  IF position('PDV_RETURNS_RESET_V2' in v_src)=0 OR position('PDV_RETURNS_FINANCIAL_RESET_GUARD_V2' in v_src)=0 THEN
    RAISE EXCEPTION 'reset PDV/financeiro não protege W5'; END IF;
  SELECT pg_get_functiondef('public.admin_delete_company(uuid)'::regprocedure) INTO v_src;
  IF position('PDV_RETURNS_ADMIN_DELETE_V2' in v_src)=0 THEN RAISE EXCEPTION 'admin delete não limpa W5'; END IF;
  IF (SELECT enabled FROM public.app_feature_flags WHERE key='pdv_returns_v2') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'feature W5 não nasceu fechada'; END IF;
END $contract$;

DO $behavior$
DECLARE
  ca uuid:='b1390000-0000-4000-8000-000000000001'; cb uuid:='b1390000-0000-4000-8000-000000000002';
  ua uuid:='b1390000-0000-4000-8000-000000000011'; ub uuid:='b1390000-0000-4000-8000-000000000012';
  lifecycle_user uuid:='b1390000-0000-4000-8000-000000000013';
  super_user uuid:='b1390000-0000-4000-8000-000000000014'; delete_company uuid:='b1390000-0000-4000-8000-000000000003';
  delete_customer uuid:='b1390000-0000-4000-8000-000000000023'; delete_order uuid:='b1390000-0000-4000-8000-000000000073';
  delete_request uuid:='b1390000-0000-4000-8000-000000000074'; delete_credit_request uuid:='b1390000-0000-4000-8000-000000000075';
  delete_return uuid:='b1390000-0000-4000-8000-000000000076';
  customer uuid:='b1390000-0000-4000-8000-000000000021'; saleable uuid:='b1390000-0000-4000-8000-000000000031';
  quarantine uuid:='b1390000-0000-4000-8000-000000000032'; foreign_stock uuid:='b1390000-0000-4000-8000-000000000033';
  inventory_id uuid:='b1390000-0000-4000-8000-000000000041'; unknown_inventory uuid:='b1390000-0000-4000-8000-000000000042';
  order_id uuid:='b1390000-0000-4000-8000-000000000051'; order_item uuid:='b1390000-0000-4000-8000-000000000052';
  unknown_item uuid:='b1390000-0000-4000-8000-000000000053'; receivable uuid:='b1390000-0000-4000-8000-000000000054';
  residual_order uuid:='b1390000-0000-4000-8000-000000000061'; residual_item uuid:='b1390000-0000-4000-8000-000000000062';
  full_order uuid:='b1390000-0000-4000-8000-000000000063'; full_item uuid:='b1390000-0000-4000-8000-000000000064';
  hold_order uuid:='b1390000-0000-4000-8000-000000000065'; hold_item uuid:='b1390000-0000-4000-8000-000000000066';
  past_order uuid:='b1390000-0000-4000-8000-000000000067'; past_item uuid:='b1390000-0000-4000-8000-000000000068';
  past_delivery uuid:='b1390000-0000-4000-8000-000000000069'; past_delivery_item uuid:='b1390000-0000-4000-8000-00000000006a';
  lifecycle_request uuid:='b1390000-0000-4000-8000-00000000006b'; lifecycle_return uuid:='b1390000-0000-4000-8000-00000000006c';
  lifecycle_credit_request uuid:='b1390000-0000-4000-8000-00000000006d';
  reservation public.pdv_stock_reservation_items; unknown_reservation public.pdv_stock_reservation_items;
  residual_reservation public.pdv_stock_reservation_items; full_reservation public.pdv_stock_reservation_items;
  hold_reservation public.pdv_stock_reservation_items;
  delivery jsonb; delivery_item uuid; unknown_delivery_item uuid; result jsonb; replay jsonb; return_id uuid; unknown_return_id uuid;
  reversal_id uuid; dfc_before jsonb; dfc_after jsonb; blocked boolean; detail text; competence numeric; n integer;
  huge_lines jsonb; source_credit uuid; nfce_documents_before integer; nfce_outbox_before integer; nfce_events_before integer;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  VALUES
    ('00000000-0000-0000-0000-000000000000',ua,'authenticated','authenticated','w5-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',ub,'authenticated','authenticated','w5-b@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',lifecycle_user,'authenticated','authenticated','w5-life@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(ca,'W5 Empresa A','active'),(cb,'W5 Empresa B','active');
  UPDATE public.profiles SET company_id=ca,is_active=true WHERE user_id IN(ua,lifecycle_user);
  UPDATE public.profiles SET company_id=cb,is_active=true WHERE user_id=ub;
  INSERT INTO public.user_roles(user_id,role) VALUES(ua,'comercial'),(ub,'admin'),(lifecycle_user,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (ua,'["screen:pdv_orders","fn:return_pdv_order","fn:reverse_pdv_return","fn:cancel_pdv_order_residual"]',true),
    (lifecycle_user,'["screen:pdv_orders","fn:return_pdv_order"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(ca,'basic'),(ca,'pdv'),(cb,'basic'),(cb,'pdv');
  INSERT INTO public.company_settings(company_id,name,timezone) VALUES(ca,'W5 Empresa A','America/Sao_Paulo');
  UPDATE public.app_feature_flags SET company_allowlist=ARRAY[ca,cb]::uuid[]
    WHERE key IN('pdv_returns_v2','pdv_party_accounts_v2');
  INSERT INTO public.customers(id,company_id,name,is_deleted) VALUES(customer,ca,'Cliente W5',false);
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES
    (saleable,ca,'Loja',true),(quarantine,ca,'Quarentena',false),(foreign_stock,cb,'Outra empresa',true);
  INSERT INTO public.pdv_return_quarantine_stocks(company_id,stock_id) VALUES(ca,quarantine);
  SELECT count(*) INTO nfce_documents_before FROM public.nfce_documents WHERE company_id=ca;
  SELECT count(*) INTO nfce_outbox_before FROM public.nfce_outbox WHERE company_id=ca;
  SELECT count(*) INTO nfce_events_before FROM public.nfce_events WHERE company_id=ca;
  INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price) VALUES
    (inventory_id,ca,'W5-M','Material W5','un',10,30),(unknown_inventory,ca,'W5-U','Custo desconhecido','un',2,NULL);
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES
    (ca,inventory_id,saleable,10,true),(ca,unknown_inventory,saleable,2,true);
  INSERT INTO public.pdv_orders(id,company_id,number,customer_id,stock_id,status,subtotal,total,client_request_id)
  VALUES(order_id,ca,1390001,customer,saleable,'liberado_retirada',120,120,'w5-order-main-0001');
  INSERT INTO public.pdv_order_items(id,company_id,order_id,inventory_id,description,quantity,unit_price,unit_cost,
    total,sort_order,item_type,unit_cost_v2,contract_version,gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2)
  VALUES(order_item,ca,order_id,inventory_id,'Material W5',2,50,30,100,1,'material',30,2,100,0,0),
    (unknown_item,ca,order_id,unknown_inventory,'Custo desconhecido',1,20,0,20,2,'material',NULL,2,20,0,0);
  INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,transaction_date,due_date,
    is_paid,amount_received,customer_id,origin,pdv_financial_role)
  VALUES(receivable,ca,'entrada','Fiado W5',120,public.company_today(ca),public.company_today(ca)+10,false,0,customer,'pdv','pdv_receivable_principal');
  INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,contract_version,coverage_kind,coverage_status,
    settlement_status,receivable_transaction_id,authorized_at,created_by)
  VALUES(ca,order_id,'fiado',120,2,'receivable','authorized','open',receivable,now(),ua);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  reservation:=public.pdv_reserve_stock_internal_v2(ca,inventory_id,saleable,order_item,NULL,2);
  unknown_reservation:=public.pdv_reserve_stock_internal_v2(ca,unknown_inventory,saleable,unknown_item,NULL,1);
  delivery:=public.pdv_complete_delivery_internal_v2(ca,order_id,gen_random_uuid(),jsonb_build_array(
    jsonb_build_object('order_item_id',order_item,'reservation_id',reservation.id,'quantity',2),
    jsonb_build_object('order_item_id',unknown_item,'reservation_id',unknown_reservation.id,'quantity',1)));
  SELECT item.id INTO delivery_item FROM public.pdv_delivery_items item WHERE item.order_item_id=order_item;
  SELECT item.id INTO unknown_delivery_item FROM public.pdv_delivery_items item WHERE item.order_item_id=unknown_item;
  SELECT jsonb_agg(jsonb_build_object('delivery_item_id',delivery_item,'quantity',1,
    'destination','saleable','destination_stock_id',saleable)) INTO huge_lines FROM generate_series(1,101);
  blocked:=false;
  BEGIN PERFORM public.pdv_return_delivery_items_v2(order_id,huge_lines,'[]'::jsonb,public.company_today(ca),
    'Payload acima do limite','w5-return-cap-0001');
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
  IF NOT blocked OR EXISTS(SELECT 1 FROM public.pdv_commercial_returns WHERE company_id=ca) THEN
    RAISE EXCEPTION 'cap de itens criou fato parcial'; END IF;

  -- Backdate nominal: operador de devolução não herda poder de reabrir período.
  INSERT INTO public.pdv_orders(id,company_id,number,customer_id,status,subtotal,total,client_request_id)
  VALUES(past_order,ca,1390004,customer,'entregue',10,10,'w5-order-past-0001');
  INSERT INTO public.pdv_order_items(id,company_id,order_id,description,quantity,unit_price,unit_cost,total,item_type,
    unit_cost_v2,contract_version,gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2)
  VALUES(past_item,ca,past_order,'Serviço passado',1,10,0,10,'service',0,2,10,0,0);
  INSERT INTO public.pdv_deliveries(id,company_id,order_id,client_request_id,payload_hash,created_by,created_at)
  VALUES(past_delivery,ca,past_order,gen_random_uuid(),repeat('a',64),ua,
    ((public.company_today(ca)-2)+time '12:00') AT TIME ZONE 'America/Sao_Paulo');
  INSERT INTO public.pdv_delivery_items(id,company_id,delivery_id,order_item_id,quantity,item_type,unit_cost_snapshot)
  VALUES(past_delivery_item,ca,past_delivery,past_item,1,'service',0);
  blocked:=false;
  BEGIN PERFORM public.pdv_return_delivery_items_v2(past_order,jsonb_build_array(
    jsonb_build_object('delivery_item_id',past_delivery_item,'quantity',1,'destination','none')),
    jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',10)),public.company_today(ca)-1,
    'Backdate sem permissão','w5-return-backdate-denied-0001');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'operador comum retroagiu devolução'; END IF;
  UPDATE public.user_permissions SET permissions=permissions||'["fn:backdate_pdv_return"]'::jsonb WHERE user_id=ua;
  result:=public.pdv_return_delivery_items_v2(past_order,jsonb_build_array(
    jsonb_build_object('delivery_item_id',past_delivery_item,'quantity',1,'destination','none')),
    jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',10)),public.company_today(ca)-1,
    'Backdate autorizado','w5-return-backdate-ok-0001');
  blocked:=false;
  BEGIN PERFORM public.pdv_return_delivery_items_v2(order_id,jsonb_build_array(
    jsonb_build_object('delivery_item_id',delivery_item,'quantity',0.1,'destination','saleable','destination_stock_id',saleable)),
    jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',5)),public.company_today(ca)-1,
    'Antes da entrega','w5-return-before-delivery-0001');
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'devolução antecedeu reconhecimento da entrega'; END IF;
  result:=public.pdv_get_returnable_order_v2(order_id);
  IF jsonb_array_length(result->'items')<>2 OR result::text~'(cmv|unit_cost|cost_price)' THEN
    RAISE EXCEPTION 'consulta retornável vazou custo ou omitiu fatias: %',result; END IF;
  dfc_before:=public.pdv_dfc_projection_v2(ca,public.company_today(ca),public.company_today(ca),100,0);

  result:=public.pdv_return_delivery_items_v2(order_id,jsonb_build_array(
    jsonb_build_object('delivery_item_id',delivery_item,'quantity',1,'destination','saleable','destination_stock_id',saleable)),
    jsonb_build_array(jsonb_build_object('kind','receivable_reduction','amount',50,'receivable_transaction_id',receivable)),
    public.company_today(ca),'Cliente devolveu uma unidade','w5-return-main-0001');
  return_id:=(result->>'return_id')::uuid;
  IF (result->>'commercial_total')::numeric<>-50 OR (result->>'cmv_total')::numeric<>-30
    OR public.pdv_party_obligation_open_v2(receivable)<>70
    OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=inventory_id AND stock_id=saleable)<>9 THEN
    RAISE EXCEPTION 'devolução parcial não rateou comercial/CMV/fiado/estoque: %',result; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.inventory_movements movement
    WHERE movement.id=(SELECT inventory_movement_id FROM public.pdv_commercial_return_items
      WHERE commercial_return_id=return_id) AND movement.movement_type='entrada' AND movement.quantity=1
      AND movement.unit_cost=30) THEN
    RAISE EXCEPTION 'Kardex de entrada não foi registrado'; END IF;
  SELECT disposition.credit_entry_id INTO source_credit FROM public.pdv_return_dispositions disposition
   WHERE disposition.commercial_return_id=return_id LIMIT 1;
  UPDATE public.user_permissions SET permissions=permissions||'["screen:customers","fn:manage_party_credit"]'::jsonb WHERE user_id=ua;
  blocked:=false;
  BEGIN PERFORM public.pdv_reverse_party_credit_entry_v2(source_credit,'Estorno avulso proibido','w5-w4-reverse-denied-0001');
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked OR public.pdv_party_obligation_open_v2(receivable)<>70 THEN
    RAISE EXCEPTION 'W4 desfez disposição pertencente à devolução'; END IF;
  replay:=public.pdv_return_delivery_items_v2(order_id,jsonb_build_array(
    jsonb_build_object('delivery_item_id',delivery_item,'quantity',1,'destination','saleable','destination_stock_id',saleable)),
    jsonb_build_array(jsonb_build_object('kind','receivable_reduction','amount',50,'receivable_transaction_id',receivable)),
    public.company_today(ca),'Cliente devolveu uma unidade','w5-return-main-0001');
  IF replay->>'idempotent'<>'true' OR replay->>'return_id'<>return_id::text THEN RAISE EXCEPTION 'retry duplicou devolução'; END IF;
  detail:=NULL;
  BEGIN PERFORM public.pdv_return_delivery_items_v2(order_id,jsonb_build_array(
    jsonb_build_object('delivery_item_id',delivery_item,'quantity',0.5,'destination','saleable','destination_stock_id',saleable)),
    jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',25)),public.company_today(ca),
    'Payload divergente','w5-return-main-0001');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; END;
  IF detail IS NULL THEN RAISE EXCEPTION 'mesma chave aceitou hash divergente'; END IF;
  blocked:=false;
  BEGIN PERFORM public.pdv_return_delivery_items_v2(order_id,jsonb_build_array(
    jsonb_build_object('delivery_item_id',delivery_item,'quantity',2,'destination','saleable','destination_stock_id',saleable)),
    jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',100)),public.company_today(ca),
    'Quantidade excessiva','w5-return-over-0001');
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'devolução líquida superou entrega'; END IF;
  blocked:=false;
  BEGIN PERFORM public.pdv_return_delivery_items_v2(order_id,jsonb_build_array(
    jsonb_build_object('delivery_item_id',unknown_delivery_item,'quantity',1,'destination','saleable','destination_stock_id',foreign_stock)),
    jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',20)),public.company_today(ca),
    'Local cruzado','w5-return-tenant-0001');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'devolução aceitou estoque de outro tenant'; END IF;
  result:=public.pdv_return_delivery_items_v2(order_id,jsonb_build_array(
    jsonb_build_object('delivery_item_id',unknown_delivery_item,'quantity',1,'destination','quarantine','destination_stock_id',quarantine)),
    jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',20)),public.company_today(ca),
    'Item para análise','w5-return-quarantine-0001');
  unknown_return_id:=(result->>'return_id')::uuid;
  IF (result->'cmv_total') IS DISTINCT FROM 'null'::jsonb
    OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=unknown_inventory AND stock_id=quarantine)<>1
    OR EXISTS(SELECT 1 FROM public.pdv_commercial_return_items item
      JOIN public.inventory_movements movement ON movement.id=item.inventory_movement_id
      WHERE item.commercial_return_id=(result->>'return_id')::uuid AND movement.unit_cost IS NOT NULL) THEN
    RAISE EXCEPTION 'quarentena ou custo NULL foram alterados'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_financial_projection_rows_v2(ca) row
      JOIN public.pdv_commercial_return_items item ON item.id=row.event_id
      WHERE row.source_type='commercial_return_v2' AND item.commercial_return_id=return_id AND row.cmv=-30)
    OR NOT EXISTS(SELECT 1 FROM public.pdv_commercial_return_items item
      WHERE item.commercial_return_id=(result->>'return_id')::uuid AND item.cmv_amount IS NULL) THEN
    RAISE EXCEPTION 'DRE perdeu CMV conhecido/NULL da devolução'; END IF;
  blocked:=false;
  BEGIN PERFORM public.pdv_reserve_stock_internal_v2(ca,unknown_inventory,quarantine,NULL,gen_random_uuid(),1);
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'quarentena ficou vendável'; END IF;
  SELECT round(COALESCE(sum(row.revenue),0),2) INTO competence
    FROM public.pdv_financial_projection_rows_v2(ca) row WHERE row.projection_kind='dre_competence';
  IF competence<>50 THEN RAISE EXCEPTION 'DRE competência não reduziu receita na devolução: %',competence; END IF;
  dfc_after:=public.pdv_dfc_projection_v2(ca,public.company_today(ca),public.company_today(ca),100,0);
  IF dfc_after IS DISTINCT FROM dfc_before THEN RAISE EXCEPTION 'devolução criou DFC fictício'; END IF;

  INSERT INTO public.pdv_orders(id,company_id,number,customer_id,stock_id,status,subtotal,total,client_request_id)
  VALUES(hold_order,ca,1390005,customer,saleable,'aguardando_pagamento',90,90,'w5-order-hold-0001');
  INSERT INTO public.pdv_order_items(id,company_id,order_id,inventory_id,description,quantity,unit_price,unit_cost,total,
    item_type,unit_cost_v2,contract_version,gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2)
  VALUES(hold_item,ca,hold_order,inventory_id,'Reserva concorrente',9,10,30,90,'material',30,2,90,0,0);
  hold_reservation:=public.pdv_reserve_stock_internal_v2(ca,inventory_id,saleable,hold_item,NULL,9);
  blocked:=false;
  BEGIN PERFORM public.pdv_reverse_commercial_return_v2(return_id,'Saldo todo reservado','w5-reverse-reserved-0001');
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked OR EXISTS(SELECT 1 FROM public.pdv_commercial_returns WHERE reversal_of_id=return_id) THEN
    RAISE EXCEPTION 'compensação consumiu estoque reservado ou deixou fato parcial'; END IF;
  PERFORM public.pdv_release_stock_reservation_internal_v2(ca,hold_reservation.id,9);
  result:=public.pdv_reverse_commercial_return_v2(return_id,'Devolução registrada por engano','w5-reverse-main-0001');
  reversal_id:=(result->>'return_id')::uuid;
  IF public.pdv_party_obligation_open_v2(receivable)<>120
    OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=inventory_id AND stock_id=saleable)<>8
    OR NOT EXISTS(SELECT 1 FROM public.pdv_commercial_returns WHERE id=reversal_id AND reversal_of_id=return_id) THEN
    RAISE EXCEPTION 'compensação não recompôs recebível/estoque/referência'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_commercial_return_items reversal_item
    JOIN public.pdv_commercial_return_items original_item ON original_item.id=reversal_item.reversal_of_item_id
    JOIN public.inventory_movements reversal_movement ON reversal_movement.id=reversal_item.inventory_movement_id
    JOIN public.inventory_movements original_movement ON original_movement.id=original_item.inventory_movement_id
    WHERE reversal_item.commercial_return_id=reversal_id AND reversal_movement.related_movement_id=original_movement.id
      AND reversal_movement.unit_cost=30 AND original_movement.unit_cost=30) THEN
    RAISE EXCEPTION 'Kardex compensatório perdeu vínculo/custo histórico'; END IF;
  SELECT round(COALESCE(sum(row.revenue),0),2) INTO competence
    FROM public.pdv_financial_projection_rows_v2(ca) row WHERE row.projection_kind='dre_competence';
  IF competence<>100 OR public.pdv_dfc_projection_v2(ca,public.company_today(ca),public.company_today(ca),100,0)
      IS DISTINCT FROM dfc_before THEN RAISE EXCEPTION 'compensação comercial alterou competência/DFC incorretamente'; END IF;
  result:=public.pdv_reverse_commercial_return_v2(unknown_return_id,'Item de custo desconhecido não retornou','w5-reverse-unknown-0001');
  IF NOT EXISTS(SELECT 1 FROM public.pdv_commercial_return_items reversal_item
    JOIN public.pdv_commercial_return_items original_item ON original_item.id=reversal_item.reversal_of_item_id
    JOIN public.inventory_movements reversal_movement ON reversal_movement.id=reversal_item.inventory_movement_id
    JOIN public.inventory_movements original_movement ON original_movement.id=original_item.inventory_movement_id
    WHERE reversal_item.commercial_return_id=(result->>'return_id')::uuid
      AND reversal_movement.unit_cost IS NULL AND original_movement.unit_cost IS NULL) THEN
    RAISE EXCEPTION 'Kardex converteu custo desconhecido em custo conhecido'; END IF;
  SELECT round(COALESCE(sum(row.revenue),0),2) INTO competence
    FROM public.pdv_financial_projection_rows_v2(ca) row WHERE row.projection_kind='dre_competence';
  IF competence<>120 THEN RAISE EXCEPTION 'compensação NULL não recompôs competência: %',competence; END IF;

  -- Pedido parcial sem cobertura: cancela apenas a reserva ainda não entregue.
  INSERT INTO public.pdv_orders(id,company_id,number,customer_id,stock_id,status,subtotal,total,client_request_id)
  VALUES(residual_order,ca,1390002,customer,saleable,'liberado_retirada',30,30,'w5-order-residual-0001'),
    (full_order,ca,1390003,customer,saleable,'liberado_retirada',10,10,'w5-order-full-0001');
  INSERT INTO public.pdv_order_items(id,company_id,order_id,inventory_id,description,quantity,unit_price,unit_cost,total,
    item_type,unit_cost_v2,contract_version,gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2)
  VALUES(residual_item,ca,residual_order,inventory_id,'Saldo residual',3,10,30,30,'material',30,2,30,0,0),
    (full_item,ca,full_order,inventory_id,'Total entregue',1,10,30,10,'material',30,2,10,0,0);
  residual_reservation:=public.pdv_reserve_stock_internal_v2(ca,inventory_id,saleable,residual_item,NULL,3);
  full_reservation:=public.pdv_reserve_stock_internal_v2(ca,inventory_id,saleable,full_item,NULL,1);
  PERFORM public.pdv_complete_delivery_internal_v2(ca,residual_order,gen_random_uuid(),jsonb_build_array(
    jsonb_build_object('order_item_id',residual_item,'reservation_id',residual_reservation.id,'quantity',1)));
  PERFORM public.pdv_complete_delivery_internal_v2(ca,full_order,gen_random_uuid(),jsonb_build_array(
    jsonb_build_object('order_item_id',full_item,'reservation_id',full_reservation.id,'quantity',1)));
  result:=public.pdv_cancel_order_residual_v2(residual_order,'Cliente desistiu do saldo','w5-cancel-residual-0001');
  IF (result->>'released_quantity')::numeric<>2
    OR (SELECT released_quantity FROM public.pdv_stock_reservation_items WHERE id=residual_reservation.id)<>2
    OR (SELECT status FROM public.pdv_orders WHERE id=residual_order)<>'cancelado_parcial' THEN
    RAISE EXCEPTION 'cancelamento residual alterou entrega ou não liberou reserva'; END IF;
  blocked:=false;
  BEGIN PERFORM public.pdv_cancel_order_residual_v2(full_order,'Tentativa total','w5-cancel-full-0001');
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'pedido totalmente entregue foi cancelado'; END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_cash_custody_entries WHERE company_id=ca AND created_at>=now()-interval '5 minutes')
    OR EXISTS(SELECT 1 FROM public.financial_transactions WHERE company_id=ca
      AND pdv_financial_role IN('pdv_refund','pdv_receivable_reversal')) THEN
    RAISE EXCEPTION 'W5-01 criou caixa/refund/estorno financeiro'; END IF;
  IF (SELECT count(*) FROM public.nfce_documents WHERE company_id=ca)<>nfce_documents_before
    OR (SELECT count(*) FROM public.nfce_outbox WHERE company_id=ca)<>nfce_outbox_before
    OR (SELECT count(*) FROM public.nfce_events WHERE company_id=ca)<>nfce_events_before THEN
    RAISE EXCEPTION 'W5-01 criou documento/outbox/evento fiscal'; END IF;
  SELECT count(*) INTO n FROM public.pdv_commercial_returns WHERE company_id=ca;
  IF n<>5 THEN RAISE EXCEPTION 'eventos append-only inesperados: %',n; END IF;

  INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES
    (ca,saleable,ua),(ca,quarantine,ua);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',lifecycle_user,'role','authenticated')::text,true);
  blocked:=false;
  BEGIN PERFORM public.pdv_get_returnable_order_v2(order_id);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'leitura de devolução ignorou ACL same-tenant'; END IF;
  blocked:=false;
  BEGIN PERFORM public.pdv_return_delivery_items_v2(order_id,'[]'::jsonb,'[]'::jsonb,
    public.company_today(ca),'ACL','w5-restricted-return-0001');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'writer de devolução ignorou ACL same-tenant'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);

  -- FK SET NULL de created_by não pode quebrar livros append-only.
  INSERT INTO public.pdv_operation_requests(id,company_id,operation_type,idempotency_key,payload_hash,created_by)
  VALUES(lifecycle_request,ca,'commercial.return.v2','w5-lifecycle-return-0001',repeat('b',64),NULL),
    (lifecycle_credit_request,ca,'commercial.return.credit.post.v2','w5-lifecycle-credit-0001',repeat('c',64),NULL);
  INSERT INTO public.pdv_commercial_returns(id,company_id,order_id,customer_id,event_kind,occurred_on,reason,
    commercial_total,cmv_total,operation_request_id,created_by)
  VALUES(lifecycle_return,ca,order_id,customer,'return',public.company_today(ca),'Teste de lifecycle',0,0,lifecycle_request,lifecycle_user);
  INSERT INTO public.pdv_party_credit_entries(company_id,party_type,customer_id,entry_kind,amount,occurred_on,
    description,operation_request_id,metadata,source_commercial_return_id,created_by)
  VALUES(ca,'customer',customer,'credit',1,public.company_today(ca),'Crédito lifecycle',lifecycle_credit_request,
    '{"source":"commercial_return_v2"}',lifecycle_return,lifecycle_user);
  DELETE FROM auth.users WHERE id=lifecycle_user;
  IF (SELECT created_by FROM public.pdv_commercial_returns WHERE id=lifecycle_return) IS NOT NULL
    OR (SELECT created_by FROM public.pdv_party_credit_entries WHERE operation_request_id=lifecycle_credit_request) IS NOT NULL THEN
    RAISE EXCEPTION 'desprovisionamento não preservou histórico W5/W4'; END IF;

  -- Reset financeiro isolado falha fechado; reset PDV remove o agregado na ordem das FKs.
  UPDATE public.user_roles SET role='admin' WHERE user_id=ua;
  blocked:=false;
  BEGIN PERFORM public.reset_system_step(ca,'financial_movements',gen_random_uuid());
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked OR (SELECT count(*) FROM public.pdv_commercial_returns WHERE company_id=ca)<>6 THEN
    RAISE EXCEPTION 'reset financeiro apagou/parcializou fatos W5'; END IF;
  PERFORM public.reset_system_step(ca,'pdv',gen_random_uuid());
  IF EXISTS(SELECT 1 FROM public.pdv_commercial_returns WHERE company_id=ca)
    OR EXISTS(SELECT 1 FROM public.pdv_commercial_return_items WHERE company_id=ca)
    OR EXISTS(SELECT 1 FROM public.pdv_return_dispositions WHERE company_id=ca)
    OR EXISTS(SELECT 1 FROM public.pdv_party_credit_entries WHERE company_id=ca AND source_commercial_return_id IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.pdv_return_quarantine_stocks WHERE company_id=ca)
    OR EXISTS(SELECT 1 FROM public.pdv_operation_requests WHERE company_id=ca
      AND operation_type LIKE 'commercial.return%') THEN
    RAISE EXCEPTION 'reset PDV deixou fragmentos W5'; END IF;

  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  VALUES('00000000-0000-0000-0000-000000000000',super_user,'authenticated','authenticated','w5-super@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(delete_company,'W5 Delete','active');
  UPDATE public.profiles SET company_id=delete_company,is_active=true WHERE user_id=super_user;
  INSERT INTO public.user_roles(user_id,role) VALUES(super_user,'super_admin');
  INSERT INTO public.customers(id,company_id,name,is_deleted) VALUES(delete_customer,delete_company,'Cliente Delete',false);
  INSERT INTO public.pdv_orders(id,company_id,number,customer_id,status,subtotal,total)
  VALUES(delete_order,delete_company,1390099,delete_customer,'rascunho',0,0);
  INSERT INTO public.pdv_operation_requests(id,company_id,operation_type,idempotency_key,payload_hash,created_by)
  VALUES(delete_request,delete_company,'commercial.return.v2','w5-admin-delete-return-0001',repeat('d',64),NULL),
    (delete_credit_request,delete_company,'commercial.return.credit.post.v2','w5-admin-delete-credit-0001',repeat('e',64),NULL);
  INSERT INTO public.pdv_commercial_returns(id,company_id,order_id,customer_id,event_kind,occurred_on,reason,
    commercial_total,cmv_total,operation_request_id,created_by)
  VALUES(delete_return,delete_company,delete_order,delete_customer,'return',public.company_today(delete_company),
    'Teste admin delete',0,0,delete_request,super_user);
  INSERT INTO public.pdv_party_credit_entries(company_id,party_type,customer_id,entry_kind,amount,occurred_on,
    description,operation_request_id,metadata,source_commercial_return_id,created_by)
  VALUES(delete_company,'customer',delete_customer,'credit',1,public.company_today(delete_company),'Crédito delete',
    delete_credit_request,'{"source":"commercial_return_v2"}',delete_return,super_user);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',super_user,'role','authenticated')::text,true);
  PERFORM public.admin_delete_company(delete_company);
  IF EXISTS(SELECT 1 FROM public.companies WHERE id=delete_company)
    OR EXISTS(SELECT 1 FROM public.pdv_commercial_returns WHERE company_id=delete_company)
    OR EXISTS(SELECT 1 FROM public.pdv_party_credit_entries WHERE company_id=delete_company) THEN
    RAISE EXCEPTION 'admin_delete_company deixou agregado W5'; END IF;
END $behavior$;

ROLLBACK;

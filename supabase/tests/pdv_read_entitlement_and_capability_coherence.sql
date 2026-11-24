-- Segurança real: fixtures isoladas, SET ROLE authenticated e rollback integral.
-- Requer migrations20261113125000/13130000/14140000. Nunca toca a conta demo.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';

DO $contract$
DECLARE v_table text;
BEGIN
 FOREACH v_table IN ARRAY ARRAY['pdv_orders','pdv_order_items','pdv_order_payments'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_table AND permissive='RESTRICTIVE' AND cmd='SELECT' AND qual LIKE '%pdv_current_actor_can_read_orders_v4%') THEN RAISE EXCEPTION 'Gate de leitura ausente em %',v_table; END IF;
 END LOOP;
 IF has_function_privilege('anon','public.pdv_current_actor_can_read_orders_v4()','EXECUTE') OR NOT has_function_privilege('authenticated','public.pdv_current_actor_can_read_orders_v4()','EXECUTE') THEN RAISE EXCEPTION 'ACL do helper de leitura incorreta'; END IF;
 IF has_function_privilege('authenticated','public.pdv_party_accounts_v2_enabled_internal(uuid)','EXECUTE') OR has_function_privilege('service_role','public.pdv_party_accounts_v2_enabled_internal(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Helper financeiro interno exposto'; END IF;
 IF position('payment.created_at' IN pg_get_functiondef('public.pdv_get_after_sale_workspace_core_015_v2(uuid)'::regprocedure))>0 THEN RAISE EXCEPTION 'Projeção ainda usa coluna inexistente'; END IF;
END $contract$;

DO $behavior$
DECLARE
 c uuid:='f3141300-0000-4000-8000-000000000001'; cx uuid:='f3141300-0000-4000-8000-000000000002';
 u uuid:='f3141300-0000-4000-8000-000000000003'; ux uuid:='f3141300-0000-4000-8000-000000000004';
 cust uuid:='f3141300-0000-4000-8000-000000000005'; custx uuid:='f3141300-0000-4000-8000-000000000006'; cust_other uuid:='f3141300-0000-4000-8000-000000000013';
 cash uuid:='f3141300-0000-4000-8000-000000000007'; stock uuid:='f3141300-0000-4000-8000-000000000008';
 term uuid:='f3141300-0000-4000-8000-000000000009'; material uuid:='f3141300-0000-4000-8000-000000000010';
 supp uuid:='f3141300-0000-4000-8000-000000000011'; bank uuid:='f3141300-0000-4000-8000-000000000012'; session_id uuid; v_order_id uuid; return_id uuid; voucher_id uuid;
 result jsonb; again jsonb; cart jsonb; pay jsonb; req record; before_custody numeric; n integer; blocked boolean; detail text; today date; category_id uuid; purchase_request uuid:=gen_random_uuid(); purchase_financial uuid; stock_before numeric;
BEGIN
 IF EXISTS(SELECT 1 FROM public.companies WHERE id IN(c,cx)) OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(u,ux)) THEN
  RAISE EXCEPTION 'IDs de fixture já existem; abortado'; END IF;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 VALUES('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','stored-value-review-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
 ('00000000-0000-0000-0000-000000000000',ux,'authenticated','authenticated','stored-value-review-b@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Fixture transacional stored value','active'),(cx,'Fixture outro tenant stored value','active');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id=u;
 UPDATE public.profiles SET company_id=cx,is_active=true WHERE user_id=ux;
 INSERT INTO public.user_roles(user_id,role) VALUES(u,'admin'),(ux,'admin');
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv'),(cx,'pdv');
 INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES(cash,c,'Caixa fixture','caixa',1000,true),(bank,c,'Banco fixture','banco',0,true);
 INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
 VALUES(c,'Fixture','America/Sao_Paulo',cash,true,'simples') ON CONFLICT(company_id) DO UPDATE SET pdv_cash_account_id=cash,pdv_mode='simples';
 INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Estoque fixture',false);
 INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(term,c,'Caixa fixture',stock,true);
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price) VALUES(material,c,'FIX-STORED-VALUE','Material fixture','un',50,3,10);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,material,stock,50,true);
 INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted) VALUES(cust,c,'Cliente fixture',1000,false),(custx,cx,'Cliente outro tenant',1000,false),(cust_other,c,'Outro cliente mesma empresa',1000,false);
 INSERT INTO public.suppliers(id,company_id,name) VALUES(supp,c,'Fornecedor fixture');
 UPDATE public.app_feature_flags SET company_allowlist=array_append(company_allowlist,c) WHERE key IN('pdv_party_accounts_v2','pdv_returns_v2','pdv_after_sale_value_v2');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 today:=public.company_today(c);
 result:=public.pdv_open_cash_session_v2(term,cash,200,'fixture-stored-open-0001'); session_id:=(result->>'session_id')::uuid;
 -- Crédito pré-existente de cliente/fornecedor, sem novo dinheiro em caixa.
 result:=public.pdv_post_party_credit_v2('customer',cust,'credit',100,today,'Crédito fixture','fixture-stored-credit-0001');
 result:=public.pdv_post_party_credit_v2('supplier',supp,'credit',100,today,'Adiantamento fixture','fixture-stored-supp-0001');
 IF (public.pdv_get_customer_payment_options_v3(cust)->>'available_credit')::numeric<>100 THEN RAISE EXCEPTION 'Consulta não reflete crédito canônico'; END IF;
 blocked:=false;
 BEGIN PERFORM public.pdv_get_customer_payment_options_v3(custx);
 EXCEPTION WHEN no_data_found THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Leitura vazou cliente de outro tenant'; END IF;
 SELECT coalesce(sum(amount),0) INTO before_custody FROM public.pdv_cash_custody_entries WHERE company_id=c;
 cart:=jsonb_build_array(jsonb_build_object('inventory_id',material,'stock_id',stock,'quantity',1));
 pay:=jsonb_build_array(jsonb_build_object('method','saldo_cliente','amount',10));
 result:=public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,cart,pay,'fixture-stored-sale-balance-0001'); v_order_id:=(result->>'order_id')::uuid;
 IF public.pdv_party_available_credit_v2(c,'customer',cust)<>90 THEN RAISE EXCEPTION 'Saldo não debitado uma vez'; END IF;
 IF (SELECT coalesce(sum(amount),0) FROM public.pdv_cash_custody_entries WHERE company_id=c)<>before_custody THEN RAISE EXCEPTION 'Saldo gerou dinheiro novo no caixa'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pdv_order_payments p JOIN public.pdv_party_credit_entries e ON e.id=p.party_credit_entry_id JOIN public.financial_transactions t ON t.id=e.target_financial_transaction_id WHERE p.order_id=v_order_id AND p.method='saldo_cliente' AND p.settlement_status='settled' AND t.amount_received=10 AND public.pdv_party_obligation_open_v2(t.id)=0) THEN RAISE EXCEPTION 'Saldo não quitou obrigação canônica'; END IF;
 again:=public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,cart,pay,'fixture-stored-sale-balance-0001');
 IF again->>'order_id'<>v_order_id::text OR again->>'idempotent'<>'true' OR public.pdv_party_available_credit_v2(c,'customer',cust)<>90 THEN RAISE EXCEPTION 'Retry duplicou consumo'; END IF;
 blocked:=false;
 BEGIN PERFORM public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,jsonb_build_array(jsonb_build_object('inventory_id',material,'stock_id',stock,'quantity',10)),jsonb_build_array(jsonb_build_object('method','saldo_cliente','amount',100)),'fixture-stored-insufficient-0001');
 EXCEPTION WHEN check_violation THEN blocked:=true; END;
 IF NOT blocked OR EXISTS(SELECT 1 FROM public.pdv_operation_requests WHERE company_id=c AND idempotency_key='fixture-stored-insufficient-0001') THEN RAISE EXCEPTION 'Saldo insuficiente deixou fatos parciais'; END IF;
 -- Duas parcelas de fiado conservam obrigações separadas.
 result:=public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,cart,jsonb_build_array(jsonb_build_object('method','fiado','amount',4,'due_date',today+10),jsonb_build_object('method','fiado','amount',6,'due_date',today+20)),'fixture-stored-installments-0001');
 IF (SELECT count(*) FROM public.pdv_order_payments WHERE order_id=(result->>'order_id')::uuid AND method='fiado')<>2 THEN RAISE EXCEPTION 'Parcelas de fiado não preservadas'; END IF;
 -- Venda realmente entregue -> devolução -> voucher -> nova venda.
 result:=public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,cart,jsonb_build_array(jsonb_build_object('method','dinheiro','amount',10)),'fixture-stored-origin-0001');v_order_id:=(result->>'order_id')::uuid;
 result:=public.pdv_return_delivery_items_v2(v_order_id,(SELECT jsonb_agg(jsonb_build_object('delivery_item_id',di.id,'quantity',1,'destination','saleable','destination_stock_id',stock)) FROM public.pdv_delivery_items di JOIN public.pdv_deliveries d ON d.id=di.delivery_id WHERE d.order_id=v_order_id),jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',10)),today,'Devolução fixture','fixture-stored-return-0001');
 return_id:=(result->>'return_id')::uuid;
 result:=public.pdv_issue_return_voucher_v2(return_id,10,today+30,'fixture-stored-voucher-0001'); voucher_id:=(result->>'voucher_id')::uuid;
 IF jsonb_array_length(public.pdv_get_customer_payment_options_v3(cust)->'vouchers')<>1 THEN RAISE EXCEPTION 'Voucher elegível não apareceu'; END IF;
 SELECT coalesce(sum(amount),0) INTO before_custody FROM public.pdv_cash_custody_entries WHERE company_id=c;
 pay:=jsonb_build_array(jsonb_build_object('method','voucher','amount',10,'reference_id',voucher_id));
 blocked:=false;
 BEGIN PERFORM public.pdv_complete_direct_sale_v2(term,session_id,cash,cust_other,cart,pay,'fixture-stored-voucher-wrong-customer-0001');
 EXCEPTION WHEN check_violation THEN blocked:=true; END;
 IF NOT blocked OR public.pdv_voucher_balance_internal_v2(voucher_id)<>10 THEN RAISE EXCEPTION 'Voucher foi usado por outro cliente'; END IF;
 result:=public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,cart,pay,'fixture-stored-voucher-use-0001');v_order_id:=(result->>'order_id')::uuid;
 IF public.pdv_voucher_balance_internal_v2(voucher_id)<>0 OR (SELECT coalesce(sum(amount),0) FROM public.pdv_cash_custody_entries WHERE company_id=c)<>before_custody THEN RAISE EXCEPTION 'Voucher não debitou saldo/gerou dinheiro'; END IF;
 again:=public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,cart,pay,'fixture-stored-voucher-use-0001');
 IF again->>'order_id'<>v_order_id::text OR again->>'idempotent'<>'true' OR public.pdv_voucher_balance_internal_v2(voucher_id)<>0 THEN RAISE EXCEPTION 'Retry duplicou voucher'; END IF;
 blocked:=false;
 BEGIN PERFORM public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,cart,pay,'fixture-stored-voucher-double-0001');
 EXCEPTION WHEN check_violation THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Voucher gasto foi usado novamente'; END IF;
 -- Balcão: cobertura com saldo usa a mesma obrigação via livro, sem fiado.
 UPDATE public.company_settings SET pdv_mode='balcao' WHERE company_id=c;
 v_order_id:=gen_random_uuid();
 INSERT INTO public.pdv_orders(id,company_id,number,customer_id,salesperson_id,stock_id,status,subtotal,discount_amount,total,contract_version,operation_mode_snapshot,target_terminal_id)
 VALUES(v_order_id,c,99901,cust,u,stock,'aguardando_pagamento',10,0,10,2,'counter',term);
 INSERT INTO public.pdv_order_items(company_id,order_id,inventory_id,description,quantity,unit_price,unit_cost,discount_amount,total,sort_order,item_type,unit_cost_v2,contract_version,gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2,unit)
 VALUES(c,v_order_id,material,'Balcão fixture',1,10,3,0,10,0,'material',3,2,10,0,0,'un');
 result:=public.pdv_cover_existing_order_v2(v_order_id,term,session_id,cash,jsonb_build_array(jsonb_build_object('method','saldo_cliente','amount',10)),'fixture-stored-counter-balance-0001');
 IF public.pdv_party_available_credit_v2(c,'customer',cust)<>80 OR NOT EXISTS(SELECT 1 FROM public.pdv_order_payments p WHERE p.order_id=v_order_id AND p.coverage_kind='customer_credit' AND p.receivable_transaction_id IS NULL AND p.party_credit_entry_id IS NOT NULL) THEN RAISE EXCEPTION 'Balcão não consumiu saldo corretamente'; END IF;
 -- Compra com adiantamento quita o pagável e não movimenta dinheiro novo.
 SELECT id INTO category_id FROM public.financial_categories WHERE company_id=c AND type='saida' AND is_active ORDER BY id LIMIT 1;
 SELECT coalesce(sum(amount),0) INTO before_custody FROM public.pdv_cash_custody_entries WHERE company_id=c;
 result:=public.pdv_register_direct_purchase_supplier_credit_v3(session_id,term,purchase_request,stock,supp,jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',1,'unit_price',10)),today,bank,category_id,'Compra fixture',NULL);
 purchase_financial:=(result->>'financial_transaction_id')::uuid;
 IF public.pdv_party_available_credit_v2(c,'supplier',supp)<>90 OR NOT EXISTS(SELECT 1 FROM public.financial_transactions t WHERE t.id=purchase_financial AND t.is_paid IS TRUE AND t.amount_received=10) THEN RAISE EXCEPTION 'Compra não debitou adiantamento/quitou obrigação'; END IF;
 IF (SELECT coalesce(sum(amount),0) FROM public.pdv_cash_custody_entries WHERE company_id=c)<>before_custody THEN RAISE EXCEPTION 'Adiantamento de fornecedor moveu dinheiro novo'; END IF;
 again:=public.pdv_register_direct_purchase_supplier_credit_v3(session_id,term,purchase_request,stock,supp,jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',1,'unit_price',10)),today,bank,category_id,'Compra fixture',NULL);
 IF again->>'financial_transaction_id'<>purchase_financial::text OR again->>'idempotent'<>'true' OR public.pdv_party_available_credit_v2(c,'supplier',supp)<>90 THEN RAISE EXCEPTION 'Retry duplicou compra/adiantamento'; END IF;
 SELECT quantity INTO stock_before FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock;
 blocked:=false;
 BEGIN PERFORM public.pdv_register_direct_purchase_supplier_credit_v3(session_id,term,gen_random_uuid(),stock,supp,jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',10,'unit_price',10)),today,bank,category_id,'Compra sem saldo fixture',NULL);
 EXCEPTION WHEN check_violation THEN blocked:=true; END;
 IF NOT blocked OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock)<>stock_before THEN RAISE EXCEPTION 'Compra sem saldo deixou estoque parcial'; END IF;
 -- Origem de autenticação ausente falha fechada.
 PERFORM set_config('request.jwt.claims','{}',true);blocked:=false;
 BEGIN PERFORM public.pdv_get_customer_payment_options_v3(cust);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Leitura sem sessão permitida';END IF;
END $behavior$;

-- Complementa as fixtures isoladas de pdv_stored_value_execution_v3.
DO $setup_read$
DECLARE c uuid:='f3141300-0000-4000-8000-000000000001'; u uuid:='f3141300-0000-4000-8000-000000000003';
 v_result jsonb; v_order uuid;
BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 SELECT id INTO v_order FROM public.pdv_orders WHERE company_id=c ORDER BY created_at LIMIT 1;
 v_result:=public.pdv_get_after_sale_workspace_v2(v_order);
 IF (v_result#>>'{capabilities,direct_sale_voucher}')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Capacidade de voucher continua falsa com writer publicado'; END IF;
 IF public.pdv_party_accounts_v2_enabled_internal(c) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Extrato não acompanha módulo ativo'; END IF;
 -- Simula empresa fora de qualquer allowlist, sem modificar flags globais.
 UPDATE public.app_feature_flags SET company_allowlist=array_remove(company_allowlist,c) WHERE key='pdv_party_accounts_v2';
 IF public.pdv_party_accounts_v2_enabled_internal(c) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Extrato ainda depende de allowlist'; END IF;
 PERFORM public.pdv_party_account_statement_v3('customer','f3141300-0000-4000-8000-000000000005','accounts',20,0);
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 VALUES('00000000-0000-0000-0000-000000000000','f3141300-0000-4000-8000-000000000015','authenticated','authenticated','read-other-cash@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id='f3141300-0000-4000-8000-000000000015';
 INSERT INTO public.user_roles(user_id,role) VALUES('f3141300-0000-4000-8000-000000000015','admin');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES('f3141300-0000-4000-8000-000000000015','["screen:pdv"]',true);
 INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES('f3141300-0000-4000-8000-000000000016',c,'Outro caixa fixture','f3141300-0000-4000-8000-000000000008',true);
 INSERT INTO public.pdv_cash_sessions(id,company_id,terminal_id,cash_account_id,opened_by,opening_amount,status,closed_at,closed_by,counted_amount,expected_amount,difference,contract_version,cash_account_name_snapshot,cash_policy_snapshot)
 VALUES('f3141300-0000-4000-8000-000000000017',c,'f3141300-0000-4000-8000-000000000016','f3141300-0000-4000-8000-000000000007','f3141300-0000-4000-8000-000000000015',0,'fechada',now(),'f3141300-0000-4000-8000-000000000015',0,0,0,2,'Caixa fixture','{}'::jsonb);
 INSERT INTO public.pdv_orders(id,company_id,number,customer_id,status,subtotal,total,client_request_id,cash_session_id,terminal_id,contract_version)
 VALUES('f3141300-0000-4000-8000-000000000018',c,99902,'f3141300-0000-4000-8000-000000000005','entregue',10,10,'fixture-read-other-0001','f3141300-0000-4000-8000-000000000017','f3141300-0000-4000-8000-000000000016',1),
 ('f3141300-0000-4000-8000-000000000019',c,99903,'f3141300-0000-4000-8000-000000000005','entregue',10,10,'fixture-read-own-0001',(SELECT id FROM public.pdv_cash_sessions WHERE company_id=c AND opened_by=u LIMIT 1),'f3141300-0000-4000-8000-000000000009',1);
 INSERT INTO public.pdv_order_items(id,company_id,order_id,description,quantity,unit_price,total,unit)
 VALUES('f3141300-0000-4000-8000-000000000020',c,'f3141300-0000-4000-8000-000000000018','Item caixa alheio',1,10,10,'un'),('f3141300-0000-4000-8000-000000000021',c,'f3141300-0000-4000-8000-000000000019','Item caixa próprio',1,10,10,'un');
 INSERT INTO public.pdv_order_payments(id,company_id,order_id,method,amount,contract_version)
 VALUES('f3141300-0000-4000-8000-000000000022',c,'f3141300-0000-4000-8000-000000000018','dinheiro',10,1),('f3141300-0000-4000-8000-000000000023',c,'f3141300-0000-4000-8000-000000000019','dinheiro',10,1);
 UPDATE public.user_roles SET role='comercial' WHERE user_id=u;
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(u,'["screen:pdv","screen:customers","fn:view_customer_financial"]',true) ON CONFLICT(user_id) DO UPDATE SET permissions=EXCLUDED.permissions,is_active=true;
END $setup_read$;

SET LOCAL ROLE authenticated;
DO $read_allowed$
BEGIN
 IF public.pdv_current_actor_can_read_orders_v4() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Operador válido bloqueado'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pdv_orders WHERE id='f3141300-0000-4000-8000-000000000019') THEN RAISE EXCEPTION 'Pedido próprio sumiu'; END IF;
 IF EXISTS(SELECT 1 FROM public.pdv_orders WHERE id='f3141300-0000-4000-8000-000000000018') THEN RAISE EXCEPTION 'Vazou pedido de outro caixa'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pdv_order_items WHERE id='f3141300-0000-4000-8000-000000000021') OR EXISTS(SELECT 1 FROM public.pdv_order_items WHERE id='f3141300-0000-4000-8000-000000000020') THEN RAISE EXCEPTION 'Custódia de itens inválida'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pdv_order_payments WHERE id='f3141300-0000-4000-8000-000000000023') OR EXISTS(SELECT 1 FROM public.pdv_order_payments WHERE id='f3141300-0000-4000-8000-000000000022') THEN RAISE EXCEPTION 'Custódia de pagamentos inválida'; END IF;
END $read_allowed$;
RESET ROLE;

-- Cada revogação isolada deve retirar REST SELECT das três tabelas, mesmo
-- que o usuário continue sendo dono do caixa e mantenha um JWT válido.
DO $cases$
DECLARE scenario text; c uuid:='f3141300-0000-4000-8000-000000000001'; u uuid:='f3141300-0000-4000-8000-000000000003'; denied boolean;
BEGIN
 FOREACH scenario IN ARRAY ARRAY['inactive','expired','without_module','without_screen','other_tenant','without_session'] LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','service_role')::text,true);
  UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id=u;
  UPDATE public.companies SET subscription_status='active',subscription_expires_at=NULL WHERE id=c;
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv') ON CONFLICT DO NOTHING;
  UPDATE public.user_permissions SET permissions='["screen:pdv","screen:customers","fn:view_customer_financial"]' WHERE user_id=u;
  IF scenario='inactive' THEN UPDATE public.profiles SET is_active=false WHERE user_id=u;
  ELSIF scenario='expired' THEN UPDATE public.companies SET subscription_status='active',subscription_expires_at=now()-interval '10 days' WHERE id=c;
  ELSIF scenario='without_module' THEN DELETE FROM public.company_modules WHERE company_id=c AND module_code='pdv';
  ELSIF scenario='without_screen' THEN UPDATE public.user_permissions SET permissions='[]' WHERE user_id=u;
  ELSIF scenario='other_tenant' THEN UPDATE public.profiles SET company_id='f3141300-0000-4000-8000-000000000002' WHERE user_id=u;
  ELSIF scenario='without_session' THEN PERFORM set_config('request.jwt.claims','{}',true);
  END IF;
  IF scenario<>'without_session' THEN PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true); END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF EXISTS(SELECT 1 FROM public.pdv_orders WHERE company_id=c) OR EXISTS(SELECT 1 FROM public.pdv_order_items WHERE company_id=c) OR EXISTS(SELECT 1 FROM public.pdv_order_payments WHERE company_id=c) THEN RAISE EXCEPTION 'SELECT REST vazou dados no cenário %',scenario; END IF;
  EXECUTE 'RESET ROLE';
  IF scenario IN('expired','without_module') THEN
   IF public.pdv_direct_sale_v2_enabled_internal(c) IS DISTINCT FROM false OR public.pdv_party_accounts_v2_enabled_internal(c) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Capacidade ignorou gate no cenário %',scenario; END IF;
  END IF;
 END LOOP;
END $cases$;

ROLLBACK;

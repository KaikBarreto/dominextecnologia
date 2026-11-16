-- Execução financeira real em fixtures isoladas; todas as escritas são desfeitas.
-- Requer migrations 20261116010000, 20000, 21000 e 22000. Não toca a conta demo.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $behavior$
DECLARE
 c uuid:='f4160200-0000-4000-8000-000000000001'; cx uuid:='f4160200-0000-4000-8000-000000000002';
 u_denied uuid:='f4160200-0000-4000-8000-000000000014'; u_othercash uuid:='f4160200-0000-4000-8000-000000000015';
 u uuid:='f4160200-0000-4000-8000-000000000003'; ux uuid:='f4160200-0000-4000-8000-000000000004';
 cust uuid:='f4160200-0000-4000-8000-000000000005'; custx uuid:='f4160200-0000-4000-8000-000000000006'; cust_other uuid:='f4160200-0000-4000-8000-000000000013';
 cash uuid:='f4160200-0000-4000-8000-000000000007'; stock uuid:='f4160200-0000-4000-8000-000000000008';
 term uuid:='f4160200-0000-4000-8000-000000000009'; material uuid:='f4160200-0000-4000-8000-000000000010';
 material_fraction uuid:='f4160200-0000-4000-8000-000000000016';
 supp uuid:='f4160200-0000-4000-8000-000000000011'; bank uuid:='f4160200-0000-4000-8000-000000000012'; session_id uuid; v_order_id uuid; return_id uuid; voucher_id uuid; voucher_ids uuid[]:=ARRAY[]::uuid[]; i integer; monetary_id uuid; credits_before numeric; entries_before integer; orders_before integer;
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
 INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES(cash,c,'Caixa fixture','caixa',200,true),(bank,c,'Banco fixture','banco',0,true);
 INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
 VALUES(c,'Fixture','America/Sao_Paulo',cash,true,'simples') ON CONFLICT(company_id) DO UPDATE SET pdv_cash_account_id=cash,pdv_mode='simples';
 INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Estoque fixture',false);
 INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(term,c,'Caixa fixture',stock,true);
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price) VALUES(material,c,'FIX-STORED-VALUE','Material fixture','un',50,3,10);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,material,stock,50,true);
 INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted) VALUES(cust,c,'Cliente fixture',1000,false),(custx,cx,'Cliente outro tenant',1000,false),(cust_other,c,'Outro cliente mesma empresa',1000,false);
 INSERT INTO public.suppliers(id,company_id,name) VALUES(supp,c,'Fornecedor fixture');
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
 -- Sem vencimento explícito difere do prazo legado e mantém replay histórico.
 pay:=jsonb_build_array(jsonb_build_object('method','fiado','amount',10,'due_date_mode','none'));
 result:=public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,cart,pay,'fixture-v4-no-due-0001');
 IF NOT EXISTS(SELECT 1 FROM public.pdv_order_payments p JOIN public.financial_transactions t ON t.id=p.receivable_transaction_id
   WHERE p.order_id=(result->>'order_id')::uuid AND t.due_date IS NULL AND t.is_paid IS FALSE AND t.amount=10) THEN
   RAISE EXCEPTION 'Fiado sem data ganhou vencimento ou não criou obrigação'; END IF;
 again:=public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,cart,pay,'fixture-v4-no-due-0001');
 IF again->>'idempotent'<>'true' THEN RAISE EXCEPTION 'Retry de fiado sem vencimento falhou'; END IF;
 result:=public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,cart,jsonb_build_array(jsonb_build_object('method','fiado','amount',10)),'fixture-v4-legacy-due-0001');
 IF NOT EXISTS(SELECT 1 FROM public.pdv_order_payments p JOIN public.financial_transactions t ON t.id=p.receivable_transaction_id
   WHERE p.order_id=(result->>'order_id')::uuid AND t.due_date=(today+interval '1 month')::date) THEN RAISE EXCEPTION 'Default legado foi alterado'; END IF;
 blocked:=false;
 BEGIN PERFORM public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,cart,
   jsonb_build_array(jsonb_build_object('method','fiado','amount',4,'due_date_mode','none'),jsonb_build_object('method','fiado','amount',6,'due_date',today+30)),
   'fixture-v4-installment-no-due-0001');
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Parcelamento aceitou ausência de primeiro vencimento'; END IF;
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
 -- Dois vouchers distintos: consumo parcial, ordem canônica e rollback do lote.
 FOR i IN 1..2 LOOP
   result:=public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,
     jsonb_build_array(jsonb_build_object('inventory_id',material,'stock_id',stock,'quantity',3)),
     jsonb_build_array(jsonb_build_object('method','dinheiro','amount',30)),'fixture-v4-origin-'||i::text||'-0001');
   v_order_id:=(result->>'order_id')::uuid;
   result:=public.pdv_return_delivery_items_v2(v_order_id,(SELECT jsonb_agg(jsonb_build_object('delivery_item_id',di.id,'quantity',3,
     'destination','saleable','destination_stock_id',stock)) FROM public.pdv_delivery_items di JOIN public.pdv_deliveries d ON d.id=di.delivery_id WHERE d.order_id=v_order_id),
     jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',30)),today,'Devolução múltiplos vouchers','fixture-v4-return-'||i::text||'-0001');
   return_id:=(result->>'return_id')::uuid;
   result:=public.pdv_issue_return_voucher_v2(return_id,30,today+30,'fixture-v4-issue-'||i::text||'-0001');
   voucher_ids:=array_append(voucher_ids,(result->>'voucher_id')::uuid);
 END LOOP;
 SELECT coalesce(sum(amount),0) INTO before_custody FROM public.pdv_cash_custody_entries WHERE company_id=c;
 pay:=jsonb_build_array(jsonb_build_object('method','voucher','amount',4,'reference_id',voucher_ids[1]),
   jsonb_build_object('method','voucher','amount',6,'reference_id',voucher_ids[2]));
 result:=public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,cart,pay,'fixture-v4-two-vouchers-0001');
 v_order_id:=(result->>'order_id')::uuid;
 IF public.pdv_voucher_balance_internal_v2(voucher_ids[1])<>26 OR public.pdv_voucher_balance_internal_v2(voucher_ids[2])<>24
   OR (SELECT count(*) FROM public.pdv_order_payments WHERE order_id=v_order_id AND method='voucher')<>2 THEN RAISE EXCEPTION 'Vouchers não conservaram consumo e saldo independentes'; END IF;
 again:=public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,cart,jsonb_build_array(pay->1,pay->0),'fixture-v4-two-vouchers-0001');
 IF again->>'order_id'<>v_order_id::text OR again->>'idempotent'<>'true'
   OR public.pdv_voucher_balance_internal_v2(voucher_ids[1])<>26 THEN RAISE EXCEPTION 'Reordenação/retry duplicou vouchers'; END IF;
 IF (SELECT coalesce(sum(amount),0) FROM public.pdv_cash_custody_entries WHERE company_id=c)<>before_custody
   OR EXISTS(SELECT 1 FROM public.pdv_order_payments WHERE order_id=v_order_id AND financial_transaction_id IS NOT NULL) THEN RAISE EXCEPTION 'Voucher gerou caixa ou receita financeira'; END IF;
 blocked:=false;
 BEGIN PERFORM public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,cart,
   jsonb_build_array(jsonb_build_object('method','voucher','amount',4,'reference_id',voucher_ids[1]),
     jsonb_build_object('method','voucher','amount',6,'reference_id',voucher_ids[1])),'fixture-v4-duplicate-voucher-0001');
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Mesmo voucher foi duplicado no lote'; END IF;
 SELECT quantity INTO stock_before FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock;
 SELECT count(*) INTO orders_before FROM public.pdv_orders WHERE company_id=c;
 blocked:=false;
 BEGIN PERFORM public.pdv_complete_direct_sale_v2(term,session_id,cash,cust,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'stock_id',stock,'quantity',4)),
   jsonb_build_array(jsonb_build_object('method','voucher','amount',10,'reference_id',voucher_ids[1]),
     jsonb_build_object('method','voucher','amount',30,'reference_id',voucher_ids[2])),'fixture-v4-batch-insufficient-0001');
 EXCEPTION WHEN check_violation THEN blocked:=true; END;
 IF NOT blocked OR public.pdv_voucher_balance_internal_v2(voucher_ids[1])<>26
   OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock)<>stock_before
   OR (SELECT count(*) FROM public.pdv_orders WHERE company_id=c)<>orders_before
   OR EXISTS(SELECT 1 FROM public.pdv_operation_requests WHERE company_id=c AND idempotency_key='fixture-v4-batch-insufficient-0001') THEN
   RAISE EXCEPTION 'Falha em um voucher deixou efeito parcial no lote'; END IF;
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
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);

 -- Compra 100 = saldo 40 + banco 60. Um fato de estoque, DFC somente 60.
 UPDATE public.company_settings SET pdv_mode='simples' WHERE company_id=c;
 purchase_request:=gen_random_uuid();
 credits_before:=public.pdv_party_available_credit_v2(c,'supplier',supp);
 SELECT coalesce(sum(amount),0) INTO before_custody FROM public.pdv_cash_custody_entries WHERE company_id=c;
 SELECT quantity INTO stock_before FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock;
 result:=public.pdv_register_direct_purchase_mixed_v4(session_id,term,purchase_request,stock,supp,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',10,'unit_price',10)),today,bank,category_id,40,'pix',today,'Compra parcial fixture',NULL);
 purchase_financial:=(result->>'financial_transaction_id')::uuid; monetary_id:=(result->>'monetary_transaction_id')::uuid;
 IF public.pdv_party_available_credit_v2(c,'supplier',supp)<>credits_before-40
   OR public.pdv_party_obligation_open_v2(purchase_financial)<>0
   OR NOT EXISTS(SELECT 1 FROM public.financial_transactions WHERE id=purchase_financial AND amount=100 AND amount_received=100
     AND is_paid IS TRUE AND account_id IS NULL AND pdv_financial_role='pdv_supplier_obligation')
   OR NOT EXISTS(SELECT 1 FROM public.financial_transactions WHERE id=monetary_id AND amount=60 AND transaction_type='saida'
     AND account_id=bank AND parent_transaction_id=purchase_financial AND is_paid IS TRUE AND pdv_financial_role='pdv_supplier_payment') THEN
   RAISE EXCEPTION 'Compra parcial divergiu do principal, crédito ou complemento'; END IF;
 IF (SELECT sum(cash_flow) FROM public.pdv_financial_projection_rows_v2(c) WHERE projection_kind='dfc' AND event_id=monetary_id)<>-60
   OR EXISTS(SELECT 1 FROM public.pdv_financial_projection_rows_v2(c) WHERE projection_kind='dfc' AND event_id=purchase_financial)
   OR (SELECT coalesce(sum(amount),0) FROM public.pdv_cash_custody_entries WHERE company_id=c)<>before_custody
   OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock)<>stock_before+10 THEN
   RAISE EXCEPTION 'Compra parcial gerou caixa artificial, DFC errada ou entrada duplicada'; END IF;
 again:=public.pdv_register_direct_purchase_mixed_v4(session_id,term,purchase_request,stock,supp,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',10,'unit_price',10)),today,bank,category_id,40,'pix',today,'Compra parcial fixture',NULL);
 IF again->>'compra_id'<>result->>'compra_id' OR again->>'idempotent'<>'true'
   OR (SELECT count(*) FROM public.financial_transactions WHERE parent_transaction_id=purchase_financial)<>1
   OR public.pdv_party_available_credit_v2(c,'supplier',supp)<>credits_before-40 THEN RAISE EXCEPTION 'Retry duplicou compra, saldo ou pagamento'; END IF;
 -- Uma tentativa nova sem saldo deve reverter também a compra e o Kardex.
 purchase_request:=gen_random_uuid();
 SELECT quantity INTO stock_before FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock;
 blocked:=false;
 BEGIN PERFORM public.pdv_register_direct_purchase_mixed_v4(session_id,term,purchase_request,stock,supp,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',10,'unit_price',10)),today,bank,category_id,100,'pix',today,'Sem saldo fixture',NULL);
 EXCEPTION WHEN check_violation THEN blocked:=true; END;
 IF NOT blocked OR EXISTS(SELECT 1 FROM public.compras WHERE company_id=c AND client_request_id=purchase_request)
   OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock)<>stock_before THEN
   RAISE EXCEPTION 'Saldo insuficiente deixou compra/estoque parcial'; END IF;
 -- Nenhuma edição do pagamento pode devolver crédito sem compensação explícita.
 blocked:=false;
 BEGIN UPDATE public.financial_transactions SET amount=61 WHERE id=monetary_id;
 EXCEPTION WHEN object_not_in_prerequisite_state THEN blocked:=true; END;
 IF NOT blocked OR public.pdv_party_available_credit_v2(c,'supplier',supp)<>credits_before-40 THEN
   RAISE EXCEPTION 'Mutação direta alterou pagamento ou restituiu saldo'; END IF;

 -- Compensar explicitamente o crédito reabre só 40; os 60 pagos seguem fatos.
 SELECT coalesce(sum(amount),0) INTO before_custody FROM public.pdv_cash_custody_entries WHERE company_id=c;
 result:=public.pdv_reverse_party_credit_entry_v2((SELECT id FROM public.pdv_party_credit_entries
   WHERE target_financial_transaction_id=purchase_financial AND entry_kind='application'),
   'Compensação explícita da parcela de saldo fixture','fixture-v4-credit-reversal-0001');
 IF public.pdv_party_obligation_open_v2(purchase_financial)<>40
   OR public.pdv_party_available_credit_v2(c,'supplier',supp)<>credits_before
   OR (SELECT amount_received FROM public.financial_transactions WHERE id=purchase_financial)<>60
   OR (SELECT sum(cash_flow) FROM public.pdv_financial_projection_rows_v2(c) WHERE projection_kind='dfc' AND event_id=monetary_id)<>-60
   OR (SELECT coalesce(sum(amount),0) FROM public.pdv_cash_custody_entries WHERE company_id=c)<>before_custody THEN
   RAISE EXCEPTION 'Compensação de crédito alterou dinheiro pago ou pendência incorreta'; END IF;
 -- Dinheiro: a custódia reflete somente 80, nunca os 100 da aquisição.
 purchase_request:=gen_random_uuid(); credits_before:=public.pdv_party_available_credit_v2(c,'supplier',supp);
 SELECT coalesce(sum(amount),0) INTO before_custody FROM public.pdv_cash_custody_entries WHERE company_id=c;
 result:=public.pdv_register_direct_purchase_mixed_v4(session_id,term,purchase_request,stock,supp,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',10,'unit_price',10)),today,cash,category_id,20,'dinheiro',today,'Compra mista dinheiro fixture',NULL);
 purchase_financial:=(result->>'financial_transaction_id')::uuid; monetary_id:=(result->>'monetary_transaction_id')::uuid;
 IF public.pdv_party_available_credit_v2(c,'supplier',supp)<>credits_before-20 OR public.pdv_party_obligation_open_v2(purchase_financial)<>0
   OR (SELECT coalesce(sum(amount),0) FROM public.pdv_cash_custody_entries WHERE company_id=c)<>before_custody-80
   OR (SELECT sum(cash_flow) FROM public.pdv_financial_projection_rows_v2(c) WHERE projection_kind='dfc' AND event_id=monetary_id)<>-80 THEN
   RAISE EXCEPTION 'Compra em dinheiro não separou saldo e complemento'; END IF;
 again:=public.pdv_register_direct_purchase_mixed_v4(session_id,term,purchase_request,stock,supp,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',10,'unit_price',10)),today,cash,category_id,20,'dinheiro',today,'Compra mista dinheiro fixture',NULL);
 IF again->>'idempotent'<>'true' OR (SELECT coalesce(sum(amount),0) FROM public.pdv_cash_custody_entries WHERE company_id=c)<>before_custody-80 THEN
   RAISE EXCEPTION 'Retry da compra em dinheiro debitou a gaveta novamente'; END IF;
 SET CONSTRAINTS pdv_supplier_purchase_cash_pair_v4 IMMEDIATE;
 SET CONSTRAINTS pdv_supplier_purchase_cash_pair_v4 DEFERRED;
 -- Caixa insuficiente não cria compra, custódia ou aplicação de saldo.
 purchase_request:=gen_random_uuid(); blocked:=false;
 SELECT quantity INTO stock_before FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock;
 BEGIN PERFORM public.pdv_register_direct_purchase_mixed_v4(session_id,term,purchase_request,stock,supp,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',100,'unit_price',10)),today,cash,category_id,10,'dinheiro',today,'Caixa insuficiente fixture',NULL);
 EXCEPTION WHEN check_violation THEN blocked:=true; END;
 IF NOT blocked OR EXISTS(SELECT 1 FROM public.compras WHERE company_id=c AND client_request_id=purchase_request)
   OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock)<>stock_before THEN RAISE EXCEPTION 'Caixa insuficiente deixou efeitos parciais'; END IF;
 -- Operador sem permissões e administrador de outro caixa falham fechados.
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
   raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 VALUES('00000000-0000-0000-0000-000000000000',u_denied,'authenticated','authenticated','payment-denied@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
   ('00000000-0000-0000-0000-000000000000',u_othercash,'authenticated','authenticated','payment-other-cash@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(u_denied,u_othercash);
 INSERT INTO public.user_roles(user_id,role) VALUES(u_othercash,'admin');
 FOR i IN 1..2 LOOP
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',CASE WHEN i=1 THEN u_denied ELSE u_othercash END,'role','authenticated')::text,true);
   purchase_request:=gen_random_uuid(); blocked:=false;
   BEGIN PERFORM public.pdv_register_direct_purchase_mixed_v4(session_id,term,purchase_request,stock,supp,
     jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',1,'unit_price',10)),today,bank,category_id,4,'pix',today,'Acesso negado fixture',NULL);
   EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
   IF NOT blocked OR EXISTS(SELECT 1 FROM public.compras WHERE company_id=c AND client_request_id=purchase_request) THEN RAISE EXCEPTION 'Compra mista ignorou permissão/escopo do caixa'; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 -- Saldo integral por cliente v3 não debita a conta contábil escolhida.
 PERFORM public.pdv_post_party_credit_v2('supplier',supp,'credit',100,today,'Saldo adicional fixture','fixture-v4-full-credit-0001');
 purchase_request:=gen_random_uuid();
 SELECT coalesce(sum(CASE WHEN transaction_type='entrada' THEN amount ELSE -amount END),0) INTO before_custody
   FROM public.financial_transactions WHERE company_id=c AND account_id=bank AND is_paid IS TRUE AND cancelled_at IS NULL;
 result:=public.pdv_register_direct_purchase_supplier_credit_v3(session_id,term,purchase_request,stock,supp,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',1,'unit_price',100)),today,bank,category_id,'Saldo integral compatível fixture',NULL);
 IF (SELECT coalesce(sum(CASE WHEN transaction_type='entrada' THEN amount ELSE -amount END),0)
   FROM public.financial_transactions WHERE company_id=c AND account_id=bank AND is_paid IS TRUE AND cancelled_at IS NULL)<>before_custody
   OR public.pdv_party_obligation_open_v2((result->>'financial_transaction_id')::uuid)<>0
   OR EXISTS(SELECT 1 FROM public.financial_transactions WHERE parent_transaction_id=(result->>'financial_transaction_id')::uuid)
   OR EXISTS(SELECT 1 FROM public.pdv_financial_projection_rows_v2(c) WHERE projection_kind='dfc' AND event_id=(result->>'financial_transaction_id')::uuid) THEN RAISE EXCEPTION 'Saldo integral debitou dinheiro fictício do banco'; END IF;

 -- Duas linhas fracionadas: round(sum(3.333*1),2)=6.67, nunca soma de 3.33+3.33.
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price)
 VALUES(material_fraction,c,'FIX-FRACTION-V4','Material fracionado fixture','un',50,1,1);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present)
 VALUES(c,material_fraction,stock,50,true);
 purchase_request:=gen_random_uuid();
 result:=public.pdv_register_direct_purchase_mixed_v4(session_id,term,purchase_request,stock,supp,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',3.333,'unit_price',1),
     jsonb_build_object('inventory_id',material_fraction,'quantity',3.333,'unit_price',1)),today,bank,category_id,3,'pix',today,'Compra fracionada fixture',NULL);
 IF (result->>'total_amount')::numeric<>6.67 OR (result->>'monetary_amount')::numeric<>3.67
   OR public.pdv_party_obligation_open_v2((result->>'financial_transaction_id')::uuid)<>0 THEN
   RAISE EXCEPTION 'Compra fracionada divergiu do arredondamento canônico'; END IF;

 -- Compra avulsa não contém gaveta: o lock não recebe UUID nulo.
 purchase_request:=gen_random_uuid();
 result:=public.pdv_register_direct_purchase_mixed_v4(NULL,NULL,purchase_request,stock,supp,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',1,'unit_price',100)),today,bank,category_id,40,'pix',today,'Compra mista avulsa fixture',NULL);
 IF (result->>'monetary_amount')::numeric<>60 OR public.pdv_party_obligation_open_v2((result->>'financial_transaction_id')::uuid)<>0
   OR (SELECT origin FROM public.financial_transactions WHERE id=(result->>'monetary_transaction_id')::uuid) IS DISTINCT FROM 'geral' THEN RAISE EXCEPTION 'Compra avulsa parcial falhou'; END IF;
 purchase_request:=gen_random_uuid();
 result:=public.pdv_register_direct_purchase_mixed_v4(NULL,NULL,purchase_request,stock,supp,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',1,'unit_price',20)),today,bank,category_id,20,NULL,NULL,'Compra avulsa saldo integral fixture',NULL);
 IF (result->>'monetary_amount')::numeric<>0 OR EXISTS(SELECT 1 FROM public.financial_transactions WHERE parent_transaction_id=(result->>'financial_transaction_id')::uuid)
   OR public.pdv_party_obligation_open_v2((result->>'financial_transaction_id')::uuid)<>0 THEN RAISE EXCEPTION 'Compra avulsa integral fabricou pagamento'; END IF;

 -- Replay revalida direitos de gestão e acesso ao estoque antes de retornar IDs.
 DELETE FROM public.user_roles WHERE user_id=u AND role='admin';
 INSERT INTO public.user_roles(user_id,role) VALUES(u,'comercial');
 INSERT INTO public.user_permissions(user_id,permissions,is_active)
 VALUES(u,'["screen:pdv","fn:manage_inventory","fn:manage_finance"]',true);
 INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(c,stock,u);
 purchase_request:=gen_random_uuid();
 result:=public.pdv_register_direct_purchase_mixed_v4(NULL,NULL,purchase_request,stock,supp,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',1,'unit_price',10)),today,bank,category_id,4,'pix',today,'Replay autorizado fixture',NULL);
 purchase_financial:=(result->>'financial_transaction_id')::uuid;
 UPDATE public.user_permissions SET permissions=permissions-'fn:manage_finance' WHERE user_id=u;
 blocked:=false;
 BEGIN PERFORM public.pdv_register_direct_purchase_mixed_v4(NULL,NULL,purchase_request,stock,supp,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',1,'unit_price',10)),today,bank,category_id,4,'pix',today,'Replay autorizado fixture',NULL);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Replay ignorou revogação da gestão financeira'; END IF;
 UPDATE public.user_permissions SET permissions='["screen:pdv","fn:manage_inventory","fn:manage_finance"]' WHERE user_id=u;
 DELETE FROM public.stock_access WHERE company_id=c AND stock_id=stock AND user_id=u;
 INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(c,stock,u_othercash);
 blocked:=false;
 BEGIN PERFORM public.pdv_register_direct_purchase_mixed_v4(NULL,NULL,purchase_request,stock,supp,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',1,'unit_price',10)),today,bank,category_id,4,'pix',today,'Replay autorizado fixture',NULL);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked OR (SELECT count(*) FROM public.financial_transactions WHERE parent_transaction_id=purchase_financial)<>1 THEN
   RAISE EXCEPTION 'Replay ignorou revogação do estoque ou duplicou pagamento'; END IF;
 -- UPDATE não promove uma despesa comum ao papel de liquidação da compra.
 INSERT INTO public.financial_transactions(company_id,transaction_type,amount,description,transaction_date,is_paid,account_id)
 VALUES(c,'saida',1,'Despesa comum fixture',today,false,bank) RETURNING id INTO monetary_id;
 blocked:=false;
 BEGIN UPDATE public.financial_transactions SET pdv_financial_role='pdv_supplier_payment',pdv_settlement_group_id=gen_random_uuid() WHERE id=monetary_id;
 EXCEPTION WHEN object_not_in_prerequisite_state THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Despesa comum foi promovida para pagamento estrutural'; END IF;
 blocked:=false;
 BEGIN INSERT INTO public.financial_transactions(company_id,transaction_type,amount,description,transaction_date,paid_date,is_paid,
   supplier_id,account_id,parent_transaction_id,pdv_financial_role,pdv_settlement_group_id)
 SELECT c,'saida',1,'Pagamento adicional inválido fixture',today,today,true,supp,bank,id,'pdv_supplier_payment',pdv_settlement_group_id
 FROM public.financial_transactions WHERE id=purchase_financial;
 EXCEPTION WHEN check_violation THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Pagamento extra foi inserido fora da operação canônica'; END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
END $behavior$;

ROLLBACK;

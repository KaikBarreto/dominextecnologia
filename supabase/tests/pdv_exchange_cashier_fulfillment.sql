-- Retirada integral da troca em duas etapas, sem fórmula de estoque/financeiro alternativa.
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
CREATE FUNCTION pg_temp.exchange310_order(p_stock uuid,p_customer uuid,p_terminal uuid,p_material uuid,p_quantity numeric,p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE pre uuid:=gen_random_uuid(); result jsonb;
BEGIN
 PERFORM public.pdv_save_preorder_v2(pre,0,jsonb_build_object('stock_id',p_stock,'customer_id',p_customer,'operation_mode','counter','discount_amount',0),
  jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'inventory_id',p_material,'item_type','material','description','Material fictício','quantity',p_quantity,'unit_price',10,'discount_amount',0,'unit_factor',1,'sort_order',0)),p_key||'-save');
 PERFORM public.pdv_assign_preorder_terminal_v3(pre,1,p_terminal,p_key||'-target');
 PERFORM public.pdv_forward_preorder_v2(pre,2,p_key||'-forward');
 result:=public.pdv_convert_preorder_v2(pre,3,p_key||'-convert'); RETURN (result->>'order_id')::uuid;
END $fn$;
DO $behavior$
DECLARE
 c uuid:='f4160310-0000-4000-8000-000000000001'; a uuid:='f4160310-0000-4000-8000-000000000002'; b uuid:='f4160310-0000-4000-8000-000000000003';
 cx uuid:='f4160310-0000-4000-8000-000000000004'; x uuid:='f4160310-0000-4000-8000-000000000005';
 cash uuid:='f4160310-0000-4000-8000-000000000006'; cash_b uuid:='f4160310-0000-4000-8000-000000000007'; bank uuid:='f4160310-0000-4000-8000-000000000008';
 stock uuid:='f4160310-0000-4000-8000-000000000009'; terminal uuid:='f4160310-0000-4000-8000-000000000010'; terminal_b uuid:='f4160310-0000-4000-8000-000000000011';
 material uuid:='f4160310-0000-4000-8000-000000000012'; customer uuid:='f4160310-0000-4000-8000-000000000013'; keeper uuid:='f4160310-0000-4000-8000-000000000014';
 session_a uuid; session_b uuid; original uuid; source_return uuid; voucher uuid; target uuid; first_target uuid; snapshot_target uuid; dispatch_target uuid; counter_target uuid;
 result jsonb; replay jsonb; first_result jsonb; snapshot jsonb; return_lines jsonb; before_cash numeric; counted numeric; voucher_amount numeric; credit_amount numeric;
 method text; account_id uuid; money_session uuid; n integer; request_id uuid; expected_exchange uuid; before_finance integer; before_movement integer; before_snapshots integer; blocked boolean; sig text;
BEGIN
 IF EXISTS(SELECT 1 FROM public.companies WHERE id IN(c,cx)) OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(a,b,x,keeper)) THEN RAISE EXCEPTION 'IDs da fixture já existem'; END IF;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
 FROM (VALUES(a,'exchange310-a@example.invalid'),(b,'exchange310-b@example.invalid'),(x,'exchange310-x@example.invalid'),(keeper,'exchange310-keeper@example.invalid')) actor(id,email);
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Fixture caixa explícito da troca','active'),(cx,'Outro tenant fictício','active');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(a,b,keeper); UPDATE public.profiles SET company_id=cx,is_active=true WHERE user_id=x;
 INSERT INTO public.user_roles(user_id,role) VALUES(a,'admin'),(b,'admin'),(x,'admin'),(keeper,'admin');
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv'),(cx,'pdv');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(a,'["screen:pdv_orders","fn:value_pdv_preorder","fn:convert_pdv_preorder","fn:view_pdv_after_sale","fn:cover_pdv_exchange","fn:cover_pdv_order","fn:approve_pdv_credit","fn:manage_pdv_settings","screen:pdv_settings"]',true),(b,'["screen:pdv_orders","fn:value_pdv_preorder","fn:convert_pdv_preorder","fn:view_pdv_after_sale","fn:cover_pdv_exchange"]',true);
 INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES(cash,c,'Gaveta A fictícia','caixa',100,true),(cash_b,c,'Gaveta B fictícia','caixa',0,true),(bank,c,'Banco fictício','banco',0,true);
 INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode) VALUES(c,'Fixture','America/Sao_Paulo',cash,true,'simples') ON CONFLICT(company_id) DO UPDATE SET pdv_cash_account_id=cash,pdv_mode='simples';
 UPDATE public.stocks SET is_default=false WHERE company_id=c AND is_default;
 INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Estoque compartilhado fictício',true);
 INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(terminal,c,'Terminal A fictício',stock,true),(terminal_b,c,'Terminal B fictício',stock,true);
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price) VALUES(material,c,'FIX-EX310','Material fictício','un',100,2,10);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,material,stock,100,true);
 INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted) VALUES(customer,c,'Cliente fictício',1000,false);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_open_cash_session_v2(terminal_b,cash,0,'exchange310-b-open');session_b:=(result->>'session_id')::uuid;EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_open_cash_session_v2(terminal,cash,100,'exchange310-a-open');session_a:=(result->>'session_id')::uuid;
 result:=public.pdv_complete_direct_sale_rollout_v2(terminal,session_a,cash,customer,jsonb_build_array(jsonb_build_object('inventory_id',material,'stock_id',stock,'quantity',10)),jsonb_build_array(jsonb_build_object('method','dinheiro','amount',100)),'exchange310-source');original:=(result->>'order_id')::uuid;
 EXECUTE 'RESET ROLE';
 -- Somente o owner lê IDs protegidos para preparar o payload fictício.
 SELECT jsonb_agg(jsonb_build_object('delivery_item_id',di.id,'quantity',10,'destination','saleable','destination_stock_id',stock)) INTO return_lines
  FROM public.pdv_delivery_items di JOIN public.pdv_deliveries d ON d.id=di.delivery_id WHERE d.order_id=original;
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_return_delivery_items_v2(original,return_lines,jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',100)),public.company_today(c),'Devolução fictícia','exchange310-return');source_return:=(result->>'return_id')::uuid;
 result:=public.pdv_issue_return_voucher_v2(source_return,40,NULL,'exchange310-voucher');voucher:=(result->>'voucher_id')::uuid;

 PERFORM public.pdv_save_workflow_settings_v3('balcao','cashier');EXECUTE 'RESET ROLE';
 CREATE TEMP TABLE exchange310_targets(position integer,id uuid) ON COMMIT DROP;
 FOR n IN 1..5 LOOP INSERT INTO exchange310_targets VALUES(n,pg_temp.exchange310_order(stock,customer,terminal,material,2,'exchange310-target-'||n)); END LOOP;
 snapshot_target:=pg_temp.exchange310_order(stock,customer,terminal,material,1,'exchange310-snapshot');
 counter_target:=pg_temp.exchange310_order(stock,customer,terminal,material,1,'exchange310-counter');
 SELECT id INTO first_target FROM exchange310_targets WHERE position=1;
 UPDATE public.profiles SET full_name='Operador fictício 310' WHERE user_id=a;
 DELETE FROM public.user_roles WHERE user_id=a;
 IF public.user_has_permission(a,'screen:pdv_dispatch') OR public.user_has_permission(a,'screen:pdv') OR public.user_has_permission(a,'screen:inventory') THEN RAISE EXCEPTION 'Fixture não usa perfil restrito de pós-venda'; END IF;
 SELECT COALESCE(sum(amount),0) INTO before_cash FROM public.pdv_cash_custody_entries WHERE company_id=c;
 FOR n IN 1..5 LOOP
  SELECT id INTO target FROM exchange310_targets WHERE position=n;
  voucher_amount:=CASE n WHEN 1 THEN 20 WHEN 3 THEN 5 WHEN 4 THEN 5 ELSE 0 END;
  credit_amount:=CASE n WHEN 2 THEN 20 WHEN 3 THEN 5 ELSE 0 END;
  method:=CASE n WHEN 3 THEN 'dinheiro' WHEN 4 THEN 'fiado' WHEN 5 THEN 'credito' END;
  account_id:=CASE WHEN n=3 THEN cash END;money_session:=CASE WHEN n=3 THEN session_a END;
  EXECUTE 'SET LOCAL ROLE authenticated';
  result:=public.pdv_cover_exchange_order_coupon_v2(source_return,target,CASE WHEN voucher_amount>0 THEN voucher END,voucher_amount,credit_amount,method,account_id,money_session,'exchange310-cover-'||n,0,session_a);
  replay:=public.pdv_cover_exchange_order_coupon_v2(source_return,target,CASE WHEN voucher_amount>0 THEN voucher END,voucher_amount,credit_amount,method,account_id,money_session,'exchange310-cover-'||n,0,session_a);
  EXECUTE 'RESET ROLE';
  IF n=1 THEN first_result:=result;END IF;
  expected_exchange:=(result->>'exchange_id')::uuid;
  SELECT id INTO request_id FROM public.pdv_operation_requests WHERE company_id=c AND operation_type='after_sale.exchange.cover.v3' AND idempotency_key='exchange310-cover-'||n;
  IF result->>'status'<>'entregue' OR result->>'delivery_id' IS NULL OR result->>'receipt_snapshot_id' IS NULL
   OR replay->>'exchange_id'<>result->>'exchange_id' OR replay->>'delivery_id'<>result->>'delivery_id' OR replay->>'idempotent'<>'true'
   OR NOT EXISTS(SELECT 1 FROM public.pdv_operation_requests req WHERE req.id=request_id AND req.status='completed' AND req.resource_type='pdv_exchange' AND req.resource_id=expected_exchange AND req.result->>'new_order_id'=target::text)
   OR (SELECT count(*) FROM public.pdv_deliveries WHERE order_id=target AND client_request_id=request_id)<>1
   OR NOT EXISTS(SELECT 1 FROM public.pdv_orders WHERE id=target AND status='entregue' AND cash_session_id=session_a AND terminal_id=terminal AND target_terminal_id=terminal)
   OR (SELECT COALESCE(sum(di.quantity),0) FROM public.pdv_delivery_items di JOIN public.pdv_deliveries d ON d.id=di.delivery_id WHERE d.order_id=target)<>2
   OR (SELECT COALESCE(sum(di.quantity*di.unit_cost_snapshot),0) FROM public.pdv_delivery_items di JOIN public.pdv_deliveries d ON d.id=di.delivery_id WHERE d.order_id=target)<>4
   OR (SELECT count(*) FROM public.pdv_order_receipt_snapshots WHERE order_id=target)<>1
   OR (SELECT receipt.snapshot#>>'{fulfillment,status}' FROM public.pdv_order_receipt_snapshots receipt WHERE receipt.order_id=target)<>'Retirada concluída'
   OR (SELECT count(*) FROM public.pdv_delivery_receipt_snapshots WHERE order_id=target)<>1
   OR EXISTS(SELECT 1 FROM public.pdv_stock_reservation_items r JOIN public.pdv_order_items i ON i.id=r.order_item_id WHERE i.order_id=target AND (r.state<>'consumed' OR r.consumed_quantity<>2)) THEN
   RAISE EXCEPTION 'Troca de duas etapas % não entregou uma vez com custo/comprovante/custódia canônicos',n; END IF;
  IF n IN(4,5) AND (SELECT paid_at FROM public.pdv_orders WHERE id=target) IS NOT NULL THEN RAISE EXCEPTION 'Entrega de cartão/fiado anunciou liquidação financeira inexistente'; END IF;
  IF n=5 AND (NOT EXISTS(SELECT 1 FROM public.pdv_order_payments WHERE order_id=target AND coverage_kind='card_authorization' AND settlement_status='open' AND amount=20 AND settlement_transaction_id IS NULL)
    OR EXISTS(SELECT 1 FROM public.financial_transactions WHERE company_id=c AND pdv_settlement_group_id=request_id)
    OR EXISTS(SELECT 1 FROM public.pdv_settlement_applications app JOIN public.pdv_delivery_items di ON di.id=app.delivery_item_id JOIN public.pdv_deliveries d ON d.id=di.delivery_id WHERE d.order_id=target)) THEN RAISE EXCEPTION 'Cartão autorizado criou dinheiro ou FIFO de liquidação'; END IF;
  IF n=3 AND NOT EXISTS(SELECT 1 FROM public.pdv_settlement_applications app JOIN public.pdv_delivery_items di ON di.id=app.delivery_item_id WHERE di.delivery_id=(result->>'delivery_id')::uuid AND app.commercial_amount=10 AND app.cmv_amount=2) THEN RAISE EXCEPTION 'Diferença paga não passou pelo FIFO canônico'; END IF;
 END LOOP;
 IF public.pdv_voucher_balance_internal_v2(voucher)<>10 OR public.pdv_party_available_credit_v2(c,'customer',customer)<>35
  OR (SELECT COALESCE(sum(amount),0) FROM public.pdv_cash_custody_entries WHERE company_id=c)<>before_cash+10 THEN RAISE EXCEPTION 'Entrega duplicou crédito/voucher ou criou dinheiro'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pdv_order_payments p JOIN public.financial_transactions f ON f.id=p.receivable_transaction_id JOIN exchange310_targets t ON t.id=p.order_id AND t.position=4 WHERE p.method='fiado' AND p.amount=15 AND f.amount=15 AND f.is_paid IS FALSE AND f.due_date=(public.company_today(c)+interval '1 month')::date) THEN RAISE EXCEPTION 'Entrega no fiado alterou a obrigação original'; END IF;
 -- O recebimento normal usa a mesma rotina extraída, sem mudar seu contrato.
 UPDATE public.user_permissions SET permissions=permissions||'["screen:pdv"]'::jsonb WHERE user_id=a;
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_cover_existing_order_v2(counter_target,terminal,session_a,cash,'[{"method":"dinheiro","amount":10}]'::jsonb,'exchange310-counter-cover');
 replay:=public.pdv_cover_existing_order_v2(counter_target,terminal,session_a,cash,'[{"method":"dinheiro","amount":10}]'::jsonb,'exchange310-counter-cover');
 EXECUTE 'RESET ROLE';
 IF result->>'status'<>'entregue' OR replay->>'delivery_id'<>result->>'delivery_id' OR replay->>'idempotent'<>'true' THEN RAISE EXCEPTION 'Extração da rotina alterou recebimento normal'; END IF;
 -- Pedido criado em duas etapas continua assim se a configuração muda para três.
 EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.pdv_save_workflow_settings_v3('balcao','dispatch');EXECUTE 'RESET ROLE';
 dispatch_target:=pg_temp.exchange310_order(stock,customer,terminal,material,1,'exchange310-dispatch');
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_cover_exchange_order_coupon_v2(source_return,snapshot_target,NULL,0,10,NULL,NULL,NULL,'exchange310-old-snapshot',0,session_a);
 replay:=public.pdv_cover_exchange_order_coupon_v2(source_return,dispatch_target,NULL,0,10,NULL,NULL,NULL,'exchange310-dispatch-cover',0,session_a);
 EXECUTE 'RESET ROLE';
 IF result->>'status'<>'entregue' OR (SELECT status FROM public.pdv_orders WHERE id=snapshot_target)<>'entregue'
  OR (SELECT status FROM public.pdv_orders WHERE id=dispatch_target)<>'liberado_retirada' OR replay ? 'delivery_id'
  OR EXISTS(SELECT 1 FROM public.pdv_deliveries WHERE order_id=dispatch_target)
  OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock)<>88 THEN RAISE EXCEPTION 'Snapshot de duas/três etapas não preservou entrega física correta'; END IF;
 -- Comprovante mantém operador e pode ser lido sem a tela de expedição.
 UPDATE public.profiles SET full_name='Nome atualizado após retirada' WHERE user_id=a;
 IF EXISTS(SELECT 1 FROM public.pdv_delivery_receipt_snapshots receipt JOIN exchange310_targets t ON t.id=receipt.order_id WHERE receipt.snapshot->>'operator_name' IS DISTINCT FROM 'Operador fictício 310') THEN RAISE EXCEPTION 'Comprovante não congelou operador original'; END IF;
 -- Snapshot anterior conserva o nome congelado; identifica o usuário da entrega.
 IF EXISTS(SELECT 1 FROM public.pdv_deliveries d JOIN exchange310_targets t ON t.id=d.order_id WHERE d.created_by IS DISTINCT FROM a) THEN RAISE EXCEPTION 'Entrega perdeu autoria do operador'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';snapshot:=public.pdv_get_order_receipt_snapshot_v3(first_target);EXECUTE 'RESET ROLE';
 IF snapshot IS NULL THEN RAISE EXCEPTION 'Pedido entregue não expõe comprovante normal'; END IF;
 SELECT COALESCE(sum(amount),0) INTO counted FROM public.pdv_cash_custody_entries WHERE session_id=session_a;
 EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.pdv_close_cash_session_v2(session_a,cash,counted,'Fechamento fictício','exchange310-close');EXECUTE 'RESET ROLE';
 SELECT count(*) INTO before_finance FROM public.financial_transactions WHERE company_id=c;
 SELECT count(*) INTO before_movement FROM public.inventory_movements WHERE company_id=c;
 SELECT count(*) INTO before_snapshots FROM public.pdv_delivery_receipt_snapshots WHERE company_id=c;
 EXECUTE 'SET LOCAL ROLE authenticated';replay:=public.pdv_cover_exchange_order_coupon_v2(source_return,first_target,voucher,20,0,NULL,NULL,NULL,'exchange310-cover-1',0,session_a);EXECUTE 'RESET ROLE';
 IF replay<>first_result||jsonb_build_object('idempotent',true)
  OR (SELECT count(*) FROM public.financial_transactions WHERE company_id=c)<>before_finance
  OR (SELECT count(*) FROM public.inventory_movements WHERE company_id=c)<>before_movement
  OR (SELECT count(*) FROM public.pdv_delivery_receipt_snapshots WHERE company_id=c)<>before_snapshots THEN RAISE EXCEPTION 'Replay após fechar caixa reexecutou entrega ou financeiro'; END IF;
 IF has_function_privilege('anon','public.pdv_complete_cashier_fulfillment_internal_v1(uuid,uuid,uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.pdv_complete_cashier_fulfillment_internal_v1(uuid,uuid,uuid,uuid)','EXECUTE') OR has_function_privilege('service_role','public.pdv_complete_cashier_fulfillment_internal_v1(uuid,uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Rotina interna de entrega exposta'; END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
END $behavior$;
ROLLBACK;

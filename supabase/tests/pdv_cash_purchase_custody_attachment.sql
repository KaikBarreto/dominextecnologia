-- Cofre sem saldo livre: dinheiro recebido na gaveta paga a compra da própria
-- gaveta. Não se adiciona saldo externo para ocultar o estado intermediário.
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $behavior$
DECLARE
 c uuid:='f4161930-0000-4000-8000-000000000001'; a uuid:='f4161930-0000-4000-8000-000000000002'; b uuid:='f4161930-0000-4000-8000-000000000003';
 material uuid:='f4161930-0000-4000-8000-000000000004'; supplier uuid:='f4161930-0000-4000-8000-000000000005';
 request_id uuid:='f4161930-0000-4000-8000-000000000006'; excessive_id uuid:='f4161930-0000-4000-8000-000000000007';
 stock uuid; cash uuid; terminal_a uuid; terminal_b uuid; session_a uuid; session_b uuid; category uuid; financial_id uuid;
 result jsonb; purchase jsonb; again jsonb; snapshot jsonb; b_before jsonb; denied boolean; detail text; before_finance integer; before_moves integer; before_custody integer;
BEGIN
 IF EXISTS(SELECT 1 FROM public.companies WHERE id=c) OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(a,b)) THEN RAISE EXCEPTION 'IDs fictícios já existem';END IF;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
 FROM (VALUES(a,'purchase-attachment-a@example.invalid'),(b,'purchase-attachment-b@example.invalid')) actor(id,email);
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Compra com custódia fictícia','active');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(a,b);
 INSERT INTO public.user_roles(user_id,role) VALUES(a,'admin'),(b,'admin');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(a,'["*"]',true),(b,'["screen:pdv"]',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv');
 SELECT pdv_cash_account_id,pdv_default_stock_id INTO cash,stock FROM public.company_settings WHERE company_id=c;
 SELECT id INTO terminal_a FROM public.pdv_terminals WHERE company_id=c AND is_active ORDER BY sort_order,id LIMIT 1;
 IF cash IS NULL OR stock IS NULL OR terminal_a IS NULL OR (SELECT initial_balance FROM public.financial_accounts WHERE id=cash)<>0 THEN RAISE EXCEPTION 'Setup fictício não começa com cofre zero';END IF;
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price,is_sellable) VALUES(material,c,'FIX-CASH-ATTACH','Mercadoria fictícia','un',10,2,10,true);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,material,stock,10,true) ON CONFLICT(inventory_id,stock_id) DO UPDATE SET quantity=excluded.quantity,is_present=excluded.is_present;
 INSERT INTO public.suppliers(id,company_id,name) VALUES(supplier,c,'Fornecedor fictício');
 SELECT id INTO category FROM public.financial_categories WHERE company_id=c AND type='saida' AND is_active ORDER BY id LIMIT 1;
 IF category IS NULL THEN RAISE EXCEPTION 'Setup fictício não recebeu categoria de saída';END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';result:=public.pdv_save_cash_terminal_v3(NULL,'Gaveta B fictícia',NULL,true,1,'store_default');terminal_b:=(result->>'id')::uuid;EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_open_cash_session_v2(terminal_b,cash,0,'cashattach-b-open');session_b:=(result->>'session_id')::uuid;EXECUTE 'RESET ROLE';
 SELECT to_jsonb(position) INTO b_before FROM public.pdv_cash_custody_position(c,session_b) position;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_open_cash_session_v2(terminal_a,cash,0,'cashattach-a-open');session_a:=(result->>'session_id')::uuid;
 result:=public.pdv_complete_direct_sale_rollout_v2(terminal_a,session_a,cash,NULL,jsonb_build_array(jsonb_build_object('inventory_id',material,'stock_id',stock,'quantity',2)),jsonb_build_array(jsonb_build_object('method','dinheiro','amount',20)),'cashattach-sale-20');
 EXECUTE 'RESET ROLE';snapshot:=public.pdv_cash_snapshot_v2_internal(c,cash);
 IF (snapshot->>'balance')::numeric<>20 OR (snapshot->>'custody')::numeric<>20 OR (snapshot->>'available')::numeric<>0 THEN RAISE EXCEPTION 'Venda não deixou exatamente20 reservados e zero livre';END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 purchase:=public.pdv_registrar_compra_material_direta_v2(session_a,terminal_a,request_id,stock,supplier,jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',1,'unit_price',2)),public.company_today(c),cash,category,true,public.company_today(c),NULL,'dinheiro','Compra fictícia de2',NULL);
 again:=public.pdv_registrar_compra_material_direta_v2(session_a,terminal_a,request_id,stock,supplier,jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',1,'unit_price',2)),public.company_today(c),cash,category,true,public.company_today(c),NULL,'dinheiro','Compra fictícia de2',NULL);
 EXECUTE 'RESET ROLE';financial_id:=(purchase->>'financial_transaction_id')::uuid;snapshot:=public.pdv_cash_snapshot_v2_internal(c,cash);
 IF purchase IS DISTINCT FROM again OR financial_id IS NULL OR (snapshot->>'balance')::numeric<>18 OR (snapshot->>'custody')::numeric<>18 OR (snapshot->>'available')::numeric<>0
  OR NOT EXISTS(SELECT 1 FROM public.financial_transactions ft WHERE ft.id=financial_id AND ft.company_id=c AND ft.amount=2 AND ft.transaction_type='saida' AND ft.is_paid IS TRUE AND ft.pdv_cash_session_id=session_a)
  OR (SELECT count(*) FROM public.pdv_cash_custody_entries WHERE company_id=c AND financial_transaction_id=financial_id AND session_id=session_a AND amount=-2 AND entry_kind='cash_payment')<>1
  OR (SELECT count(*) FROM public.compras WHERE company_id=c AND client_request_id=request_id AND cash_session_id=session_a AND terminal_id=terminal_a AND stock_id=stock)<>1
  OR (SELECT count(*) FROM public.inventory_movements WHERE company_id=c AND inventory_id=material AND stock_id=stock AND movement_type='entrada' AND quantity=1)<>1
  OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock)<>9 THEN RAISE EXCEPTION 'Compra/replay perdeu vínculo, saldo18, custódia18 ou entrada única de estoque';END IF;
 IF NULLIF(current_setting('app.pdv_treasury_custody_delta',true),'') IS NOT NULL THEN RAISE EXCEPTION 'Contexto da compra não foi limpo após a custódia';END IF;
 SELECT count(*) INTO before_finance FROM public.financial_transactions WHERE company_id=c;SELECT count(*) INTO before_moves FROM public.inventory_movements WHERE company_id=c;SELECT count(*) INTO before_custody FROM public.pdv_cash_custody_entries WHERE company_id=c;
 EXECUTE 'SET LOCAL ROLE authenticated';denied:=false;
 BEGIN PERFORM public.pdv_registrar_compra_material_direta_v2(session_a,terminal_a,excessive_id,stock,supplier,jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',1,'unit_price',19)),public.company_today(c),cash,category,true,public.company_today(c),NULL,'dinheiro','Compra sem saldo',NULL);
 EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;denied:=detail='PDV_CASH_CUSTODY_INSUFFICIENT';END;
 IF NOT denied THEN RAISE EXCEPTION 'Compra acima da custódia foi aceita';END IF;
 denied:=false;
 BEGIN INSERT INTO public.financial_transactions(company_id,transaction_type,amount,description,transaction_date,is_paid,account_id,payment_method,created_by) VALUES(c,'saida',1,'Saída externa fictícia',public.company_today(c),true,cash,'dinheiro',a);
 EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;denied:=detail='PDV_TREASURY_CUSTODY_RESERVED';END;
 IF NOT denied THEN RAISE EXCEPTION 'Saída externa consumiu dinheiro reservado';END IF;
 PERFORM set_config('app.pdv_treasury_custody_delta',jsonb_build_object('company_id',c,'account_id',cash,'request_id',gen_random_uuid(),'delta',-1)::text,true);
 denied:=false;
 BEGIN INSERT INTO public.financial_transactions(company_id,transaction_type,amount,description,transaction_date,is_paid,account_id,payment_method,created_by) VALUES(c,'saida',1,'Contexto falso fictício',public.company_today(c),true,cash,'dinheiro',a);
 EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;denied:=detail='PDV_TREASURY_CUSTODY_RESERVED';END;
 PERFORM set_config('app.pdv_treasury_custody_delta','',true);
 IF NOT denied THEN RAISE EXCEPTION 'Contexto sem request canônico reduziu a reserva';END IF;EXECUTE 'RESET ROLE';
 IF (SELECT count(*) FROM public.financial_transactions WHERE company_id=c)<>before_finance OR (SELECT count(*) FROM public.inventory_movements WHERE company_id=c)<>before_moves OR (SELECT count(*) FROM public.pdv_cash_custody_entries WHERE company_id=c)<>before_custody OR EXISTS(SELECT 1 FROM public.compras WHERE company_id=c AND client_request_id=excessive_id) OR EXISTS(SELECT 1 FROM public.pdv_operation_requests WHERE company_id=c AND idempotency_key=excessive_id::text) THEN RAISE EXCEPTION 'Negativas deixaram fatos';END IF;
 IF (SELECT to_jsonb(position) FROM public.pdv_cash_custody_position(c,session_b) position) IS DISTINCT FROM b_before OR NOT EXISTS(SELECT 1 FROM public.pdv_cash_sessions WHERE id=session_b AND opened_by=b AND terminal_id=terminal_b AND cash_account_id=cash AND status='aberta') THEN RAISE EXCEPTION 'Compra de A alterou gaveta B';END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
END $behavior$;
ROLLBACK;

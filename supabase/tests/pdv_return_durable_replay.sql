-- Dados fictícios, sem flags ou chamadas externas. Prova a identidade/data do
-- replay da devolução existente; a fixture não amplia permissão de backdate.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $behavior$
DECLARE
 c uuid:='f4160311-0000-4000-8000-000000000001'; u uuid:='f4160311-0000-4000-8000-000000000002';
 customer uuid:='f4160311-0000-4000-8000-000000000003'; stock uuid:='f4160311-0000-4000-8000-000000000004';
 account uuid:='f4160311-0000-4000-8000-000000000005'; terminal uuid:='f4160311-0000-4000-8000-000000000006';
 session_id uuid:='f4160311-0000-4000-8000-000000000007'; order_id uuid:='f4160311-0000-4000-8000-000000000008';
 item uuid:='f4160311-0000-4000-8000-000000000009'; delivery uuid:='f4160311-0000-4000-8000-000000000010'; delivery_item uuid:='f4160311-0000-4000-8000-000000000011';
 lines jsonb; destinations jsonb; first_result jsonb; replay jsonb; blocked boolean; before_returns bigint; before_credit numeric; src text;
BEGIN
 IF EXISTS(SELECT 1 FROM public.companies WHERE id=c) OR EXISTS(SELECT 1 FROM auth.users WHERE id=u) THEN RAISE EXCEPTION 'IDs fictícios já existem'; END IF;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 VALUES('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','return-durable@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Fixture replay durável de devolução','active');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id=u;
 INSERT INTO public.user_roles(user_id,role) VALUES(u,'comercial');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(u,'["screen:pdv_orders","fn:return_pdv_order","fn:backdate_pdv_return"]',true);
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv');
 INSERT INTO public.customers(id,company_id,name,is_deleted) VALUES(customer,c,'Cliente fictício',false);
 INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Local fictício',false);
 INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES(account,c,'Caixa fictício','caixa',0,true);
 INSERT INTO public.company_settings(company_id,name,timezone) VALUES(c,'Fixture replay','America/Sao_Paulo') ON CONFLICT(company_id) DO UPDATE SET timezone='America/Sao_Paulo';
 INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(terminal,c,'Terminal fictício',stock,true);
 INSERT INTO public.pdv_cash_sessions(id,company_id,terminal_id,opened_by,opening_amount,status,cash_account_id,cash_account_name_snapshot,cash_policy_snapshot,contract_version)
 VALUES(session_id,c,terminal,u,0,'aberta',account,'Caixa fictício','{}',2);
 INSERT INTO public.pdv_orders(id,company_id,number,customer_id,stock_id,cash_session_id,terminal_id,salesperson_id,status,subtotal,total)
 VALUES(order_id,c,311001,customer,stock,session_id,terminal,u,'entregue',200,200);
 INSERT INTO public.pdv_order_items(id,company_id,order_id,description,quantity,unit_price,unit_cost,total,item_type,unit_cost_v2,contract_version,gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2)
 VALUES(item,c,order_id,'Serviço fictício',2,100,0,200,'service',0,2,200,0,0);
 INSERT INTO public.pdv_deliveries(id,company_id,order_id,client_request_id,payload_hash,created_by,created_at)
 VALUES(delivery,c,order_id,gen_random_uuid(),repeat('a',64),u,((public.company_today(c)-2)+time '12:00') AT TIME ZONE 'America/Sao_Paulo');
 INSERT INTO public.pdv_delivery_items(id,company_id,delivery_id,order_item_id,quantity,item_type,unit_cost_snapshot)
 VALUES(delivery_item,c,delivery,item,2,'service',0);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 lines:=jsonb_build_array(jsonb_build_object('delivery_item_id',delivery_item,'quantity',1,'destination','none'));
 destinations:=jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',100));
 EXECUTE 'SET LOCAL ROLE authenticated';
 first_result:=public.pdv_return_delivery_items_v2(order_id,lines,destinations,public.company_today(c)-1,'Uma unidade fictícia voltou','return311-exact-replay');
 EXECUTE 'RESET ROLE';
 SELECT count(*) INTO before_returns FROM public.pdv_commercial_returns WHERE company_id=c;
 SELECT COALESCE(sum(amount),0) INTO before_credit FROM public.pdv_party_credit_entries WHERE company_id=c;
 UPDATE public.user_permissions SET permissions='["screen:pdv_orders","fn:return_pdv_order"]' WHERE user_id=u;
 EXECUTE 'SET LOCAL ROLE authenticated';
 replay:=public.pdv_return_delivery_items_v2(order_id,lines,destinations,public.company_today(c)-1,'Uma unidade fictícia voltou','return311-exact-replay');
 IF replay->>'idempotent'<>'true' OR replay->>'return_id'<>first_result->>'return_id' THEN RAISE EXCEPTION 'Replay congelado exigiu backdate ou criou nova devolução'; END IF;
 blocked:=false; BEGIN
  PERFORM public.pdv_return_delivery_items_v2(order_id,lines,destinations,public.company_today(c)-1,'Uma unidade fictícia voltou','return311-new-past-denied');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Nova devolução retroativa herdou autorização do replay'; END IF;
 blocked:=false; BEGIN
  PERFORM public.pdv_return_delivery_items_v2(order_id,lines,destinations,public.company_today(c)-1,'Outro conteúdo fictício','return311-exact-replay');
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Payload alterado foi aceito para a mesma chave'; END IF;
 EXECUTE 'RESET ROLE';
 IF (SELECT count(*) FROM public.pdv_commercial_returns WHERE company_id=c)<>before_returns OR (SELECT COALESCE(sum(amount),0) FROM public.pdv_party_credit_entries WHERE company_id=c)<>before_credit
  OR EXISTS(SELECT 1 FROM public.pdv_operation_requests WHERE company_id=c AND idempotency_key='return311-new-past-denied') THEN RAISE EXCEPTION 'Replay/negação deixou crédito, devolução ou claim adicional'; END IF;
 SELECT pg_get_functiondef('public.pdv_return_delivery_items_core_015_v2(uuid,jsonb,jsonb,date,text,text)'::regprocedure) INTO src;
 IF position('PDV_RETURN_DURABLE_REPLAY_V1' IN src)=0 OR position('IF v_claim.is_replay' IN src)>position('IF v_date<public.company_today' IN src)
  OR position('pdv_returns_context_v2' IN src)>position('IF v_claim.is_replay' IN src)
  OR has_function_privilege('authenticated','public.pdv_return_delivery_items_core_015_v2(uuid,jsonb,jsonb,date,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Replay alterou autorização, ordem temporal ou ACL do core'; END IF;
END $behavior$;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;

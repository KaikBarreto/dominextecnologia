-- Contrato de ordem + writers reais. Não representa prova de concorrência.
-- O probe temporário registra tentativas de reserva mesmo quando a subtransação
-- é desfeita; nenhum estoque, dinheiro ou utilização real sobrevive ao ROLLBACK.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SET CONSTRAINTS ALL DEFERRED;
DO $contract$
DECLARE source text; stock_position integer; coupon_position integer; money_position integer;
BEGIN
 SELECT pg_get_functiondef('public.pdv_cover_existing_order_base_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure) INTO source;
 stock_position:=position('pdv_reserve_stock_internal_v2' IN source);
 coupon_position:=position('PERFORM public.pdv_consume_order_coupon_internal_v1(v_order.id);' IN source);
 money_position:=position('FOR v_payment IN SELECT value FROM jsonb_array_elements(v_payments) LOOP' IN source);
 IF position('PDV_COUNTER_COUPON_LOCK_ORDER_V1' IN source)=0 OR stock_position=0 OR coupon_position<=stock_position OR money_position<=coupon_position
  OR position('-- PDV_MULTIPLE_VOUCHERS_V4:' IN source)<=coupon_position THEN RAISE EXCEPTION 'Balcão não preservou estoque -> cupom -> vouchers/pagamentos'; END IF;
 IF (length(source)-length(replace(source,'PERFORM public.pdv_consume_order_coupon_internal_v1(v_order.id);','')))/length('PERFORM public.pdv_consume_order_coupon_internal_v1(v_order.id);')<>1 THEN RAISE EXCEPTION 'Consumo promocional duplicado'; END IF;
 IF has_function_privilege('authenticated','public.pdv_cover_existing_order_base_v2(uuid,uuid,uuid,uuid,jsonb,text)','EXECUTE')
   OR has_function_privilege('anon','public.pdv_cover_existing_order_coupon_v1(uuid,uuid,uuid,uuid,jsonb,text,integer)','EXECUTE')
   OR NOT has_function_privilege('authenticated','public.pdv_cover_existing_order_coupon_v1(uuid,uuid,uuid,uuid,jsonb,text,integer)','EXECUTE') THEN RAISE EXCEPTION 'ACL da cobertura foi alterada'; END IF;
 -- A venda direta toma o mesmo inventário antes do consumo promocional.
 SELECT pg_get_functiondef('public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure) INTO source;
 IF position('FOR UPDATE OF inventory' IN source)=0 OR position('FOR UPDATE OF inventory' IN source)>=position('pdv_consume_order_coupon_internal_v1(v_order_id)' IN source) THEN RAISE EXCEPTION 'Venda direta não toma inventário antes do cupom'; END IF;
END $contract$;
CREATE TEMP SEQUENCE counter_coupon_reservation_probe START 1;
CREATE FUNCTION pg_temp.probe_counter_coupon_reservation() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF NEW.company_id='f4160308-0000-4000-8000-000000000001'::uuid THEN PERFORM nextval('pg_temp.counter_coupon_reservation_probe'); END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION pg_temp.probe_counter_coupon_reservation() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER probe_counter_coupon_reservation BEFORE INSERT ON public.pdv_stock_reservation_items
 FOR EACH ROW EXECUTE FUNCTION pg_temp.probe_counter_coupon_reservation();
DO $behavior$
DECLARE
 c uuid:='f4160308-0000-4000-8000-000000000001'; u uuid:='f4160308-0000-4000-8000-000000000002';
 cash uuid:='f4160308-0000-4000-8000-000000000003'; stock uuid:='f4160308-0000-4000-8000-000000000004';
 terminal uuid:='f4160308-0000-4000-8000-000000000005'; customer uuid:='f4160308-0000-4000-8000-000000000006'; material uuid:='f4160308-0000-4000-8000-000000000007';
 pre uuid:=gen_random_uuid(); coupon uuid; session_id uuid; v_order_id uuid; item_id uuid; r jsonb; replay jsonb; rules jsonb;
 baseline jsonb; observed jsonb; scenario text; denied boolean; detail text; expected_attempt bigint; attempts bigint;
BEGIN
 IF EXISTS(SELECT 1 FROM public.companies WHERE id=c) OR EXISTS(SELECT 1 FROM auth.users WHERE id=u) THEN RAISE EXCEPTION 'IDs fictícios já existem'; END IF;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 VALUES('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','counter-coupon-lock@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Fixture ordem estoque e cupom','active');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id=u;
 INSERT INTO public.user_roles(user_id,role) VALUES(u,'comercial');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(u,'["screen:pdv","screen:pdv_orders","screen:pdv_settings","fn:cover_pdv_order","fn:manage_pdv_settings","fn:value_pdv_preorder","fn:convert_pdv_preorder"]',true);
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv');
 INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES(cash,c,'Caixa fictício','caixa',100,true);
 INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode,pdv_fulfillment_mode)
 VALUES(c,'Fixture ordem de cupom','America/Sao_Paulo',cash,true,'balcao','dispatch') ON CONFLICT(company_id) DO UPDATE SET pdv_cash_account_id=cash,pdv_mode='balcao',pdv_fulfillment_mode='dispatch';
 UPDATE public.stocks SET is_default=false WHERE company_id=c AND is_default;
 INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Local fictício',true);
 INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(terminal,c,'Terminal fictício',stock,true);
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price) VALUES(material,c,'LOCK-308','Material fictício','un',10,5,100);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,material,stock,10,true);
 INSERT INTO public.customers(id,company_id,name,is_deleted) VALUES(customer,c,'Cliente fictício',false);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 r:=public.pdv_open_cash_session_v2(terminal,cash,100,'counter308-open');session_id:=(r->>'session_id')::uuid;
 rules:=jsonb_build_object('code','LOCK308','name','Promoção fictícia','kind','percentage','value',10);
 r:=public.pdv_save_coupon_v1(NULL,NULL,rules);coupon:=(r->>'id')::uuid;
 PERFORM public.pdv_save_preorder_v2(pre,0,jsonb_build_object('stock_id',stock,'customer_id',customer,'operation_mode','counter','coupon_id',coupon,'coupon_discount_cents',1000),
  jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'inventory_id',material,'item_type','material','description','Material fictício','quantity',1,'unit_price',100,'discount_amount',0,'unit_factor',1,'sort_order',0)),'counter308-save');
 PERFORM public.pdv_assign_preorder_terminal_v3(pre,1,terminal,'counter308-target');
 PERFORM public.pdv_forward_preorder_v2(pre,2,'counter308-forward');
 r:=public.pdv_convert_preorder_v2(pre,3,'counter308-convert');v_order_id:=(r->>'order_id')::uuid;
 EXECUTE 'RESET ROLE';
 SELECT i.id INTO item_id FROM public.pdv_order_items i WHERE i.order_id=v_order_id;
 IF EXISTS(SELECT 1 FROM public.pdv_stock_reservation_items r WHERE r.order_item_id=item_id) THEN RAISE EXCEPTION 'Fixture precisa começar sem reserva antecipada'; END IF;
 SELECT jsonb_build_object('stock',(SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock),
  'reservations',(SELECT count(*) FROM public.pdv_stock_reservation_items WHERE company_id=c),
  'finance',(SELECT count(*) FROM public.financial_transactions WHERE company_id=c),
  'cash',(SELECT COALESCE(sum(amount),0) FROM public.pdv_cash_custody_entries WHERE company_id=c),
  'payments',(SELECT count(*) FROM public.pdv_order_payments WHERE company_id=c),
  'usages',(SELECT count(*) FROM public.pdv_coupon_usages WHERE company_id=c)) INTO baseline;
 expected_attempt:=0;
 FOREACH scenario IN ARRAY ARRAY['stale','expired'] LOOP
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.pdv_save_coupon_v1(coupon,CASE WHEN scenario='stale' THEN 1 ELSE 2 END,
   rules||CASE WHEN scenario='stale' THEN '{"value":20}'::jsonb ELSE jsonb_build_object('expires_on',public.company_today(c)-1) END);
  denied:=false;
  BEGIN PERFORM public.pdv_cover_existing_order_coupon_v1(v_order_id,terminal,session_id,cash,jsonb_build_array(jsonb_build_object('method','dinheiro','amount',90)),'counter308-'||scenario,0);
  EXCEPTION WHEN serialization_failure OR invalid_parameter_value THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;denied:=detail=CASE WHEN scenario='stale' THEN 'code=pdv_coupon_conflict' ELSE 'code=pdv_coupon_ineligible' END;END;
  IF NOT denied THEN RAISE EXCEPTION 'Caixa não recusou promoção %',scenario; END IF;
  EXECUTE 'RESET ROLE'; expected_attempt:=expected_attempt+1;
  SELECT CASE WHEN is_called THEN last_value ELSE 0 END INTO attempts FROM pg_temp.counter_coupon_reservation_probe;
  IF attempts<>expected_attempt THEN RAISE EXCEPTION 'Promoção % foi recusada antes da tentativa canônica de reserva',scenario; END IF;
  SELECT jsonb_build_object('stock',(SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock),
   'reservations',(SELECT count(*) FROM public.pdv_stock_reservation_items WHERE company_id=c),
   'finance',(SELECT count(*) FROM public.financial_transactions WHERE company_id=c),
   'cash',(SELECT COALESCE(sum(amount),0) FROM public.pdv_cash_custody_entries WHERE company_id=c),
   'payments',(SELECT count(*) FROM public.pdv_order_payments WHERE company_id=c),
   'usages',(SELECT count(*) FROM public.pdv_coupon_usages WHERE company_id=c)) INTO observed;
  IF observed<>baseline OR EXISTS(SELECT 1 FROM public.pdv_operation_requests WHERE company_id=c AND idempotency_key='counter308-'||scenario)
   OR NOT EXISTS(SELECT 1 FROM public.pdv_orders WHERE id=v_order_id AND status='aguardando_pagamento' AND total=90) THEN RAISE EXCEPTION 'Promoção % deixou efeitos parciais',scenario; END IF;
 END LOOP;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM public.pdv_save_coupon_v1(coupon,3,rules);
 r:=public.pdv_cover_existing_order_coupon_v1(v_order_id,terminal,session_id,cash,jsonb_build_array(jsonb_build_object('method','dinheiro','amount',90)),'counter308-valid',0);
 replay:=public.pdv_cover_existing_order_coupon_v1(v_order_id,terminal,session_id,cash,jsonb_build_array(jsonb_build_object('method','dinheiro','amount',90)),'counter308-valid',0);
 IF replay->>'idempotent'<>'true' OR replay->>'order_id'<>r->>'order_id' THEN RAISE EXCEPTION 'Replay da cobertura não retornou o resultado original'; END IF;
 EXECUTE 'RESET ROLE';
 SELECT CASE WHEN is_called THEN last_value ELSE 0 END INTO attempts FROM pg_temp.counter_coupon_reservation_probe;
 IF attempts<>3 OR (SELECT count(*) FROM public.pdv_stock_reservation_items WHERE company_id=c AND order_item_id=item_id AND reserved_quantity=1)<>1
  OR (SELECT count(*) FROM public.pdv_coupon_usages usage WHERE usage.company_id=c AND usage.order_id=v_order_id)<>1
  OR (SELECT count(*) FROM public.pdv_order_payments WHERE company_id=c)<>1
  OR (SELECT count(*) FROM public.financial_transactions WHERE company_id=c)<>(baseline->>'finance')::bigint+1
  OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock)<>10
  OR (SELECT COALESCE(sum(amount),0) FROM public.pdv_cash_custody_entries WHERE company_id=c)<>(baseline->>'cash')::numeric+90 THEN RAISE EXCEPTION 'Cobertura válida/replay duplicou reserva, uso ou dinheiro'; END IF;
END $behavior$;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;

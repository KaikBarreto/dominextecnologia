-- Fixture fictícia: regra comercial/efeitos. ACL/RLS reais são verificadas em
-- pdv_coupon_rls_v1.sql. Nenhum rollout ou dado persistido é alterado aqui.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
CREATE FUNCTION pg_temp.positive_coupon_preorder(p_stock uuid,p_customer uuid,p_terminal uuid,p_a uuid,p_b uuid,p_coupon uuid,p_convert boolean,p_key text)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE pre uuid:=gen_random_uuid(); r jsonb;
BEGIN
 PERFORM public.pdv_save_preorder_v2(pre,0,jsonb_build_object('stock_id',p_stock,'customer_id',p_customer,'operation_mode','counter','coupon_id',p_coupon,'coupon_discount_cents',5000),
  jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'inventory_id',p_a,'item_type','material','description','Item elegível fictício','quantity',1,'unit_price',40,'discount_amount',0,'unit_factor',1,'sort_order',0),
   jsonb_build_object('id',gen_random_uuid(),'inventory_id',p_b,'item_type','material','description','Outro item fictício','quantity',1,'unit_price',60,'discount_amount',0,'unit_factor',1,'sort_order',1)),p_key||'-save');
 PERFORM public.pdv_assign_preorder_terminal_v3(pre,1,p_terminal,p_key||'-target');
 PERFORM public.pdv_forward_preorder_v2(pre,2,p_key||'-forward');
 IF p_convert THEN r:=public.pdv_convert_preorder_v2(pre,3,p_key||'-convert'); RETURN (r->>'order_id')::uuid; END IF;
 RETURN pre;
END $fn$;
DO $contract$
DECLARE signature text; src text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_evaluate_coupon_internal_v1(uuid,uuid,uuid,jsonb,uuid)'::regprocedure) INTO src;
 IF position('PDV_COUPON_POSITIVE_ORDER_TOTAL_V1' IN src)=0 OR position('v_discount>=v_total' IN src)=0 THEN RAISE EXCEPTION 'A avaliação não preserva total positivo do pedido completo'; END IF;
 FOREACH signature IN ARRAY ARRAY[
  'public.pdv_apply_order_coupon_internal_v1(uuid,uuid,bigint)',
  'public.pdv_commit_coupon_internal_v1(uuid,uuid,jsonb,bigint)',
  'public.pdv_preview_preorder_coupon_internal_v1(uuid,uuid,bigint)'
 ] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO src;
  IF position('pdv_evaluate_coupon_internal_v1' IN src)=0 OR position('code=pdv_coupon_order_total_zero' IN src)=0 THEN RAISE EXCEPTION 'Writer perdeu avaliação/erro canônico: %',signature; END IF;
 END LOOP;
 SELECT pg_get_functiondef('public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure) INTO src;
 IF position('pdv_apply_order_coupon_internal_v1' IN src)=0 THEN RAISE EXCEPTION 'Venda direta contornou avaliação promocional'; END IF;
 SELECT pg_get_functiondef('public.pdv_cover_existing_order_base_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure) INTO src;
 IF position('pdv_consume_order_coupon_internal_v1' IN src)=0 THEN RAISE EXCEPTION 'Caixa contornou avaliação promocional'; END IF;
 SELECT pg_get_functiondef('public.pdv_cover_exchange_order_target_base_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer,uuid)'::regprocedure) INTO src;
 IF position('pdv_consume_order_coupon_internal_v1' IN src)=0 THEN RAISE EXCEPTION 'Troca contornou avaliação promocional'; END IF;
END $contract$;
DO $behavior$
DECLARE
 c uuid:='f4160306-0000-4000-8000-000000000001'; u uuid:='f4160306-0000-4000-8000-000000000002';
 cash uuid:='f4160306-0000-4000-8000-000000000003'; stock uuid:='f4160306-0000-4000-8000-000000000004';
 terminal uuid:='f4160306-0000-4000-8000-000000000005'; customer uuid:='f4160306-0000-4000-8000-000000000006';
 a uuid:='f4160306-0000-4000-8000-000000000007'; b uuid:='f4160306-0000-4000-8000-000000000008';
 session_id uuid; full_coupon uuid; fixed_coupon uuid; subset_coupon uuid; changing_coupon uuid;
 original_order uuid; positive_order uuid; return_id uuid; voucher uuid; counter_order uuid; exchange_order uuid; conversion_quote uuid; blocked_quote uuid:=gen_random_uuid();
 r jsonb; rules jsonb; items jsonb; cart jsonb; blocked boolean; detail text; message text;
 before_orders bigint; before_finance bigint; before_custody bigint; before_payments bigint; before_stock numeric;
 expected_message text:='O desconto precisa deixar um valor a receber. Escolha outro cupom ou remova o cupom para continuar.';
BEGIN
 IF EXISTS(SELECT 1 FROM public.companies WHERE id=c) OR EXISTS(SELECT 1 FROM auth.users WHERE id=u) THEN RAISE EXCEPTION 'IDs fictícios já existem'; END IF;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 VALUES('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','positive-coupon@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Fixture total positivo de cupom','active');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id=u;
 INSERT INTO public.user_roles(user_id,role) VALUES(u,'admin');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(u,'["*"]',true);
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv');
 INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES(cash,c,'Caixa fictício','caixa',100,true);
 INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
 VALUES(c,'Fixture total positivo','America/Sao_Paulo',cash,true,'simples') ON CONFLICT(company_id) DO UPDATE SET pdv_cash_account_id=cash,pdv_mode='simples';
 UPDATE public.stocks SET is_default=false WHERE company_id=c AND is_default;
 INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Estoque fictício',true);
 INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(terminal,c,'Terminal fictício',stock,true);
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price) VALUES(a,c,'ZERO-A','Participante fictício','un',100,5,40),(b,c,'ZERO-B','Outro item fictício','un',100,7,60);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,a,stock,100,true),(c,b,stock,100,true);
 INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted) VALUES(customer,c,'Cliente fictício',1000,false);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 r:=public.pdv_open_cash_session_v2(terminal,cash,100,'positive306-open'); session_id:=(r->>'session_id')::uuid;
 rules:=jsonb_build_object('code','ZERO_ALL','name','Percentual fictício integral','kind','percentage','value',100);
 r:=public.pdv_save_coupon_v1(NULL,NULL,rules); full_coupon:=(r->>'id')::uuid;
 r:=public.pdv_save_coupon_v1(NULL,NULL,jsonb_build_object('code','ZERO_FIXED','name','Valor fixo fictício','kind','fixed','value',100)); fixed_coupon:=(r->>'id')::uuid;
 r:=public.pdv_save_coupon_v1(NULL,NULL,jsonb_build_object('code','SUBSET_ALL','name','Integral apenas participante','kind','percentage','value',100,'inventory_ids',jsonb_build_array(a))); subset_coupon:=(r->>'id')::uuid;
 items:=jsonb_build_array(jsonb_build_object('id',a,'inventory_id',a,'net_cents',4000),jsonb_build_object('id',b,'inventory_id',b,'net_cents',6000));
 r:=public.pdv_evaluate_coupon_v1(full_coupon,customer,items);
 IF r->>'eligible'<>'false' OR r->>'reason'<>'order_total_zero' OR r->>'message'<>expected_message OR r?'discount_cents' THEN RAISE EXCEPTION '100%% do pedido não foi bloqueado com orientação clara'; END IF;
 PERFORM public.pdv_save_coupon_v1(full_coupon,1,rules||'{"value":99.99}');
 r:=public.pdv_evaluate_coupon_v1(full_coupon,customer,items);
 IF r->>'eligible'<>'true' OR (r->>'discount_cents')::bigint<>9999 THEN RAISE EXCEPTION 'Valor positivo de um centavo foi bloqueado'; END IF;
 PERFORM public.pdv_save_coupon_v1(full_coupon,2,rules);
 r:=public.pdv_evaluate_coupon_v1(fixed_coupon,customer,items);
 IF r->>'eligible'<>'false' OR r->>'reason'<>'order_total_zero' THEN RAISE EXCEPTION 'Valor fixo igual ao pedido foi aceito'; END IF;
 PERFORM public.pdv_save_coupon_v1(fixed_coupon,1,jsonb_build_object('code','ZERO_FIXED','name','Valor fixo fictício','kind','fixed','value',200));
 r:=public.pdv_evaluate_coupon_v1(fixed_coupon,customer,items);
 IF r->>'eligible'<>'false' OR r->>'reason'<>'order_total_zero' OR (SELECT value FROM public.pdv_coupons WHERE id=fixed_coupon)<>200 THEN RAISE EXCEPTION 'Valor fixo excedente foi reduzido silenciosamente'; END IF;
 r:=public.pdv_evaluate_coupon_v1(subset_coupon,customer,items);
 IF r->>'eligible'<>'true' OR (r->>'discount_cents')::bigint<>4000 OR jsonb_array_length(r->'allocations')<>1 OR r#>>'{allocations,0,item_id}'<>a::text THEN RAISE EXCEPTION '100%% do subconjunto foi bloqueado ou alcançou item inelegível'; END IF;
 r:=public.pdv_evaluate_coupon_v1(subset_coupon,customer,jsonb_build_array(jsonb_build_object('id',a,'inventory_id',a,'net_cents',4000),jsonb_build_object('id',b,'inventory_id',b,'net_cents',0)));
 IF r->>'eligible'<>'false' OR r->>'reason'<>'order_total_zero' THEN RAISE EXCEPTION 'Item inelegível sem valor contornou total positivo'; END IF;
 cart:=jsonb_build_object('items',jsonb_build_array(jsonb_build_object('inventory_id',a,'stock_id',stock,'quantity',1,'unit_price',40,'discount_amount',0),jsonb_build_object('inventory_id',b,'stock_id',stock,'quantity',1,'unit_price',60,'discount_amount',0)),'order_discount_amount',0);
 SELECT count(*) INTO before_orders FROM public.pdv_orders WHERE company_id=c;
 blocked:=false; BEGIN
  PERFORM public.pdv_complete_direct_sale_rollout_v2(terminal,session_id,cash,customer,cart||jsonb_build_object('coupon_id',full_coupon,'coupon_discount_cents',10000),'[]','positive306-direct-blocked');
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL,message=MESSAGE_TEXT; END;
 IF NOT blocked OR detail<>'code=pdv_coupon_order_total_zero' OR message<>expected_message OR (SELECT count(*) FROM public.pdv_orders WHERE company_id=c)<>before_orders OR EXISTS(SELECT 1 FROM public.pdv_coupon_usages WHERE coupon_id IN(full_coupon,fixed_coupon)) THEN RAISE EXCEPTION 'Venda direta gratuita deixou pedido/uso ou perdeu orientação'; END IF;

 -- Crédito real de devolução gera voucher. Ele cobre uma venda POSITIVA;
 -- não altera o desconto comercial nem aciona a regra de total zero.
 r:=public.pdv_complete_direct_sale_rollout_v2(terminal,session_id,cash,customer,cart,jsonb_build_array(jsonb_build_object('method','dinheiro','amount',100)),'positive306-origin'); original_order:=(r->>'order_id')::uuid;
 r:=public.pdv_return_delivery_items_v2(original_order,(SELECT jsonb_agg(jsonb_build_object('delivery_item_id',di.id,'quantity',1,'destination','saleable','destination_stock_id',stock)) FROM public.pdv_delivery_items di JOIN public.pdv_deliveries d ON d.id=di.delivery_id WHERE d.order_id=original_order),jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',100)),public.company_today(c),'Devolução fictícia para voucher','positive306-return'); return_id:=(r->>'return_id')::uuid;
 r:=public.pdv_issue_return_voucher_v2(return_id,100,NULL,'positive306-voucher'); voucher:=(r->>'voucher_id')::uuid;
 r:=public.pdv_complete_direct_sale_rollout_v2(terminal,session_id,cash,customer,cart||jsonb_build_object('coupon_id',subset_coupon,'coupon_discount_cents',4000),jsonb_build_array(jsonb_build_object('method','voucher','amount',60,'reference_id',voucher)),'positive306-subset-voucher'); positive_order:=(r->>'order_id')::uuid;
 IF (r->>'total')::numeric<>60 OR NOT EXISTS(SELECT 1 FROM public.pdv_orders WHERE id=positive_order AND subtotal=100 AND discount_amount=40 AND total=60) OR (SELECT sum(amount) FROM public.pdv_order_payments WHERE order_id=positive_order)<>60 OR public.pdv_voucher_balance_internal_v2(voucher)<>40 OR (SELECT count(*) FROM public.pdv_coupon_usages WHERE coupon_id=subset_coupon)<>1 THEN RAISE EXCEPTION 'Voucher virou desconto ou 100%% do subconjunto perdeu a cobertura positiva'; END IF;

 PERFORM public.pdv_save_workflow_settings_v3('balcao','dispatch');
 blocked:=false; BEGIN
  PERFORM public.pdv_save_preorder_v2(blocked_quote,0,jsonb_build_object('stock_id',stock,'customer_id',customer,'coupon_id',full_coupon,'coupon_discount_cents',10000),jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'inventory_id',a,'item_type','material','description','Item fictício','quantity',1,'unit_price',100,'discount_amount',0,'unit_factor',1,'sort_order',0)),'positive306-quote-blocked');
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL,message=MESSAGE_TEXT; END;
 IF NOT blocked OR detail<>'code=pdv_coupon_order_total_zero' OR message<>expected_message OR EXISTS(SELECT 1 FROM public.pdv_preorders WHERE id=blocked_quote) THEN RAISE EXCEPTION 'Orçamento gratuito foi salvo ou perdeu orientação'; END IF;
 rules:=jsonb_build_object('code','ZERO_CHANGED','name','Promoção fictícia alterada','kind','percentage','value',50);
 r:=public.pdv_save_coupon_v1(NULL,NULL,rules); changing_coupon:=(r->>'id')::uuid;
 counter_order:=pg_temp.positive_coupon_preorder(stock,customer,terminal,a,b,changing_coupon,true,'positive306-counter');
 exchange_order:=pg_temp.positive_coupon_preorder(stock,customer,terminal,a,b,changing_coupon,true,'positive306-exchange');
 conversion_quote:=pg_temp.positive_coupon_preorder(stock,customer,terminal,a,b,changing_coupon,false,'positive306-conversion');
 PERFORM public.pdv_save_coupon_v1(changing_coupon,1,rules||'{"value":100}');
 SELECT count(*) INTO before_orders FROM public.pdv_orders WHERE company_id=c;
 SELECT count(*) INTO before_finance FROM public.financial_transactions WHERE company_id=c;
 SELECT count(*) INTO before_custody FROM public.pdv_cash_custody_entries WHERE company_id=c;
 SELECT count(*) INTO before_payments FROM public.pdv_order_payments WHERE company_id=c;
 SELECT sum(quantity) INTO before_stock FROM public.inventory_stock_levels WHERE company_id=c AND stock_id=stock;
 blocked:=false; BEGIN PERFORM public.pdv_convert_preorder_v2(conversion_quote,3,'positive306-convert-blocked');
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; END;
 IF NOT blocked OR detail<>'code=pdv_coupon_order_total_zero' OR NOT EXISTS(SELECT 1 FROM public.pdv_preorders WHERE id=conversion_quote AND status='encaminhado' AND converted_order_id IS NULL AND revision=3) THEN RAISE EXCEPTION 'Conversão aceitou promoção que passou a zerar o pedido'; END IF;
 blocked:=false; BEGIN PERFORM public.pdv_cover_existing_order_coupon_v1(counter_order,terminal,session_id,cash,jsonb_build_array(jsonb_build_object('method','dinheiro','amount',50)),'positive306-counter-blocked',0);
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; END;
 IF NOT blocked OR detail<>'code=pdv_coupon_order_total_zero' THEN RAISE EXCEPTION 'Caixa aceitou promoção que passou a zerar o pedido'; END IF;
 blocked:=false; BEGIN PERFORM public.pdv_cover_exchange_order_coupon_v2(return_id,exchange_order,voucher,40,0,'dinheiro',cash,session_id,'positive306-exchange-blocked',0,session_id);
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; END;
 IF NOT blocked OR detail<>'code=pdv_coupon_order_total_zero' THEN RAISE EXCEPTION 'Troca aceitou promoção que passou a zerar o pedido'; END IF;
 IF EXISTS(SELECT 1 FROM public.pdv_coupon_usages WHERE coupon_id IN(full_coupon,fixed_coupon,changing_coupon))
  OR (SELECT count(*) FROM public.pdv_orders WHERE company_id=c)<>before_orders
  OR (SELECT count(*) FROM public.financial_transactions WHERE company_id=c)<>before_finance
  OR (SELECT count(*) FROM public.pdv_cash_custody_entries WHERE company_id=c)<>before_custody
  OR (SELECT count(*) FROM public.pdv_order_payments WHERE company_id=c)<>before_payments
  OR (SELECT sum(quantity) FROM public.inventory_stock_levels WHERE company_id=c AND stock_id=stock)<>before_stock
  OR public.pdv_voucher_balance_internal_v2(voucher)<>40
  OR EXISTS(SELECT 1 FROM public.pdv_orders WHERE id IN(counter_order,exchange_order) AND (total<>50 OR coupon_discount_amount_v1<>50 OR status<>'aguardando_pagamento')) THEN RAISE EXCEPTION 'Bloqueio criou uso, pagamento, crédito, estoque ou alterou desconto congelado'; END IF;
END $behavior$;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;

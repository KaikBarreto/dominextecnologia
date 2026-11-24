-- Troca normal, garantia parcial, disputa de disponibilidade e replay. Somente dados fictícios.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
CREATE FUNCTION pg_temp.exchange_stock_order(p_stock uuid,p_customer uuid,p_terminal uuid,p_inventory uuid,p_coupon uuid,p_quantity numeric,p_repeat boolean,p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE pre uuid:=gen_random_uuid(); result jsonb; items jsonb;
BEGIN
 items:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'inventory_id',p_inventory,'item_type','material','description','Material fictício da troca','quantity',p_quantity,'unit_price',10,'discount_amount',0,'unit_factor',1,'sort_order',0));
 IF p_repeat THEN items:=items||jsonb_build_array((items->0)||jsonb_build_object('id',gen_random_uuid(),'sort_order',1)); END IF;
 PERFORM public.pdv_save_preorder_v2(pre,0,jsonb_build_object('stock_id',p_stock,'customer_id',p_customer,'operation_mode','counter','discount_amount',0,'coupon_id',p_coupon,'coupon_discount_cents',CASE WHEN p_coupon IS NULL THEN 0 ELSE 200 END),items,p_key||'-save');
 PERFORM public.pdv_assign_preorder_terminal_v3(pre,1,p_terminal,p_key||'-target');
 PERFORM public.pdv_forward_preorder_v2(pre,2,p_key||'-forward');
 result:=public.pdv_convert_preorder_v2(pre,3,p_key||'-convert'); RETURN (result->>'order_id')::uuid;
END $fn$;
DO $behavior$
DECLARE
 c uuid:='f4160307-0000-4000-8000-000000000001'; u uuid:='f4160307-0000-4000-8000-000000000002';
 keeper uuid:='f4160307-0000-4000-8000-000000000010';
 cx uuid:='f4160307-0000-4000-8000-000000000003'; ux uuid:='f4160307-0000-4000-8000-000000000004';
 cash uuid:='f4160307-0000-4000-8000-000000000005'; stock uuid:='f4160307-0000-4000-8000-000000000006';
 terminal uuid:='f4160307-0000-4000-8000-000000000007'; material uuid:='f4160307-0000-4000-8000-000000000008';
 customer uuid:='f4160307-0000-4000-8000-000000000009'; session_id uuid; original_order uuid; return_id uuid; voucher uuid;
 coupon uuid; target_one uuid; target_two uuid; legacy_target uuid; blocker uuid; conflict_target uuid; partial_reservation public.pdv_stock_reservation_items; before_cash numeric; av record; sig text; result jsonb; replay jsonb; rules jsonb; snapshot jsonb;
 blocked boolean; detail text; current_revision integer; original_quantity numeric; before_entries integer;
BEGIN
 IF EXISTS(SELECT 1 FROM public.companies WHERE id IN(c,cx)) OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(u,ux,keeper)) THEN RAISE EXCEPTION 'IDs de fixture já existem'; END IF;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 VALUES('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','exchange-stock-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
 ('00000000-0000-0000-0000-000000000000',ux,'authenticated','authenticated','exchange-stock-b@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000',keeper,'authenticated','authenticated','exchange-stock-keeper@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Fixture troca com cupom','active'),(cx,'Outro tenant troca cupom','active');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(u,keeper);
 UPDATE public.profiles SET company_id=cx,is_active=true WHERE user_id=ux;
 INSERT INTO public.user_roles(user_id,role) VALUES(u,'admin'),(ux,'admin'),(keeper,'admin');
 -- Conversão encaminhada mantém permissões explícitas e a sessão própria.
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(u,'["screen:pdv","screen:pdv_orders","fn:value_pdv_preorder","fn:convert_pdv_preorder"]',true);
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv'),(cx,'pdv');
 INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES(cash,c,'Caixa fictício','caixa',100,true);
 INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
 VALUES(c,'Fixture','America/Sao_Paulo',cash,true,'simples') ON CONFLICT(company_id) DO UPDATE SET pdv_cash_account_id=cash,pdv_mode='simples';
 UPDATE public.stocks SET is_default=false WHERE company_id=c AND is_default;
 INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Estoque fictício',true);
 INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(terminal,c,'Caixa original fictício',stock,true);
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price) VALUES(material,c,'FIX-EXCHANGE-STOCK','Material fictício','un',10,2,10);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,material,stock,10,true);
 INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted) VALUES(customer,c,'Cliente fictício',1000,false);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_open_cash_session_v2(terminal,cash,100,'exchange307-open'); session_id:=(result->>'session_id')::uuid;
 result:=public.pdv_complete_direct_sale_rollout_v2(terminal,session_id,cash,customer,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'stock_id',stock,'quantity',2)),
   jsonb_build_array(jsonb_build_object('method','dinheiro','amount',20)),'exchange307-origin'); original_order:=(result->>'order_id')::uuid;
 EXECUTE 'RESET ROLE';
 result:=public.pdv_return_delivery_items_v2(original_order,(SELECT jsonb_agg(jsonb_build_object('delivery_item_id',di.id,'quantity',2,'destination','saleable','destination_stock_id',stock))
   FROM public.pdv_delivery_items di JOIN public.pdv_deliveries d ON d.id=di.delivery_id WHERE d.order_id=original_order),
   jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',20)),public.company_today(c),'Devolução fictícia para troca','exchange307-return'); return_id:=(result->>'return_id')::uuid;
 result:=public.pdv_issue_return_voucher_v2(return_id,20,NULL,'exchange307-voucher'); voucher:=(result->>'voucher_id')::uuid;
 PERFORM public.pdv_save_workflow_settings_v3('balcao','dispatch');

 rules:=jsonb_build_object('code','TROCA307','name','Promoção fictícia de estoque','kind','fixed','value',2,'is_active',true,'usage_limit',10);
 result:=public.pdv_save_coupon_v1(NULL,NULL,rules); coupon:=(result->>'id')::uuid;
 target_one:=pg_temp.exchange_stock_order(stock,customer,terminal,material,coupon,1,false,'exchange307-normal');
 target_two:=pg_temp.exchange_stock_order(stock,customer,terminal,material,coupon,3,true,'exchange307-repeated');
 legacy_target:=pg_temp.exchange_stock_order(stock,customer,terminal,material,NULL,1,false,'exchange307-partial');
 blocker:=pg_temp.exchange_stock_order(stock,customer,terminal,material,NULL,7,false,'exchange307-competitor');
 conflict_target:=pg_temp.exchange_stock_order(stock,customer,terminal,material,NULL,0.1,false,'exchange307-conflict');
 IF EXISTS(SELECT 1 FROM public.pdv_stock_reservation_items r JOIN public.pdv_order_items i ON i.id=r.order_item_id WHERE i.order_id IN(target_one,target_two,legacy_target,blocker,conflict_target)) THEN RAISE EXCEPTION 'Orçamento normal criou reserva antecipada'; END IF;
 snapshot:=public.pdv_get_after_sale_workspace_v2(original_order);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'exchange_candidates') r WHERE r->>'order_id'=target_one::text)
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'exchange_candidates') r WHERE r->>'order_id'=target_two::text) THEN RAISE EXCEPTION 'Pedido normal disponível não foi oferecido para troca'; END IF;
 -- Regra parcial preexistente é uma fixture do kernel, não pré-requisito da UI.
 SELECT * INTO partial_reservation FROM public.pdv_reserve_stock_internal_v2(c,material,stock,(SELECT id FROM public.pdv_order_items WHERE order_id=legacy_target),NULL,0.25,'coverage',NULL,1);
 UPDATE public.inventory SET cost_price=3 WHERE id=material;
 -- Outra operação real ocupa sete unidades depois do snapshot da troca.
 PERFORM public.pdv_cover_existing_order_v2(blocker,terminal,session_id,cash,jsonb_build_array(jsonb_build_object('method','fiado','amount',70)),'exchange307-competing-cover');
 SELECT COALESCE(sum(amount),0) INTO before_cash FROM public.pdv_cash_custody_entries WHERE company_id=c;
 -- A autorização legítima de pós-venda não exige acesso às telas de estoque/PDV.
 DELETE FROM public.user_roles WHERE user_id=u;
 UPDATE public.user_permissions SET permissions='["screen:pdv_orders","fn:view_pdv_after_sale","fn:cover_pdv_exchange","fn:approve_pdv_credit"]'::jsonb WHERE user_id=u;
 IF public.user_has_permission(u,'screen:pdv') OR public.user_has_permission(u,'screen:inventory') THEN RAISE EXCEPTION 'Fixture não exercita perfil restrito de pós-venda'; END IF;
 blocked:=false; BEGIN PERFORM public.pdv_get_stock_availability_v2(material,stock); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'RPC público de estoque perdeu sua autorização original'; END IF;
 snapshot:=public.pdv_get_after_sale_workspace_v2(original_order);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'exchange_candidates') r WHERE r->>'order_id'=target_two::text)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'order_candidates') r WHERE r->>'order_id'=target_two::text AND (r->>'can_exchange')::boolean)
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'exchange_candidates') r WHERE r->>'order_id'=target_one::text) THEN RAISE EXCEPTION 'Candidatos não agregaram demanda repetida/disponibilidade'; END IF;
 blocked:=false;
 BEGIN PERFORM public.pdv_cover_exchange_order_coupon_v2(return_id,target_two,voucher,8,0,'fiado',NULL,NULL,'exchange307-stale-stock',0,session_id);
 EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; blocked:=detail LIKE '%pdv_exchange_stock_insufficient%'; END;
 IF NOT blocked OR EXISTS(SELECT 1 FROM public.pdv_coupon_usages WHERE coupon_id=coupon)
  OR EXISTS(SELECT 1 FROM public.pdv_order_payments WHERE order_id=target_two)
  OR EXISTS(SELECT 1 FROM public.pdv_operation_requests WHERE company_id=c AND idempotency_key='exchange307-stale-stock')
  OR public.pdv_voucher_balance_internal_v2(voucher)<>20 THEN RAISE EXCEPTION 'Falta de estoque deixou cobertura/cupom parcial'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_cover_exchange_order_coupon_v2(return_id,legacy_target,voucher,10,0,NULL,NULL,NULL,'exchange307-extend-partial',0,session_id);
 replay:=public.pdv_cover_exchange_order_coupon_v2(return_id,legacy_target,voucher,10,0,NULL,NULL,NULL,'exchange307-extend-partial',0,session_id);
 EXECUTE 'RESET ROLE';
 IF replay->>'exchange_id'<>result->>'exchange_id' OR replay->>'idempotent'<>'true'
  OR NOT EXISTS(SELECT 1 FROM public.pdv_stock_reservation_items WHERE id=partial_reservation.id AND reserved_quantity=1 AND cost_price_snapshot=2 AND created_by=u)
  OR (SELECT count(*) FROM public.pdv_stock_reservation_items WHERE order_item_id=partial_reservation.order_item_id)<>1 THEN RAISE EXCEPTION 'Extensão alterou identidade/custo ou repetiu reserva'; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_cover_exchange_order_coupon_v2(return_id,target_one,voucher,8,0,NULL,NULL,NULL,'exchange307-normal-cover',0,session_id);
 replay:=public.pdv_cover_exchange_order_coupon_v2(return_id,target_one,voucher,8,0,NULL,NULL,NULL,'exchange307-normal-cover',0,session_id);
 EXECUTE 'RESET ROLE';
 IF replay->>'exchange_id'<>result->>'exchange_id' OR replay->>'idempotent'<>'true'
  OR (SELECT count(*) FROM public.pdv_coupon_usages WHERE order_id=target_one)<>1
  OR (SELECT count(*) FROM public.pdv_order_payments WHERE order_id=target_one)<>1
  OR (SELECT count(*) FROM public.pdv_stock_reservation_items r JOIN public.pdv_order_items i ON i.id=r.order_item_id WHERE i.order_id=target_one AND r.reserved_quantity=1 AND r.state='guaranteed')<>1
  OR public.pdv_voucher_balance_internal_v2(voucher)<>2 THEN RAISE EXCEPTION 'Troca normal/replay não garantiram uma reserva/uso/cobertura'; END IF;
 IF (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock)<>10
  OR (SELECT COALESCE(sum(amount),0) FROM public.pdv_cash_custody_entries WHERE company_id=c) IS DISTINCT FROM before_cash THEN RAISE EXCEPTION 'Reserva moveu estoque físico ou dinheiro'; END IF;
 -- Conflito persistido bloqueia nova garantia, sem reaproveitar falta física.
 PERFORM public.pdv_set_stock_reservation_shortage_internal_v2(c,partial_reservation.id,0.25);
 SELECT * INTO av FROM public.pdv_pair_availability_internal_v1(c,material,stock);
 IF av.has_conflict IS DISTINCT FROM TRUE OR av.available_quantity<>0 THEN RAISE EXCEPTION 'Disponibilidade canônica ocultou conflito'; END IF;
 snapshot:=public.pdv_get_after_sale_workspace_v2(original_order);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'exchange_candidates') r WHERE r->>'order_id'=conflict_target::text) THEN RAISE EXCEPTION 'Conflito foi oferecido para troca'; END IF;
 blocked:=false; BEGIN PERFORM public.pdv_cover_exchange_order_coupon_v2(return_id,conflict_target,voucher,1,0,NULL,NULL,NULL,'exchange307-conflict-denied',0,session_id);
 EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; blocked:=detail LIKE '%pdv_exchange_stock_insufficient%'; END;
 IF NOT blocked OR public.pdv_voucher_balance_internal_v2(voucher)<>2 THEN RAISE EXCEPTION 'Conflito consumiu voucher'; END IF;
 UPDATE public.user_permissions SET permissions='["screen:pdv_orders","fn:view_pdv_after_sale"]'::jsonb WHERE user_id=u;
 blocked:=false; BEGIN PERFORM public.pdv_cover_exchange_order_coupon_v2(return_id,target_one,voucher,8,0,NULL,NULL,NULL,'exchange307-normal-cover',0,session_id); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Replay não revalidou permissão revogada'; END IF;
 FOREACH sig IN ARRAY ARRAY['public.pdv_pair_availability_internal_v1(uuid,uuid,uuid)','public.pdv_exchange_order_stock_available_internal_v1(uuid,uuid)','public.pdv_ensure_exchange_order_stock_internal_v1(uuid,uuid)'] LOOP
  IF has_function_privilege('anon',sig,'EXECUTE') OR has_function_privilege('authenticated',sig,'EXECUTE') OR has_function_privilege('service_role',sig,'EXECUTE') THEN RAISE EXCEPTION 'Helper privado exposto'; END IF;
 END LOOP;
 SET CONSTRAINTS ALL IMMEDIATE;
END $behavior$;
ROLLBACK;

-- Troca/cupom/voucher: fixtures fictícias, nenhuma flag ou dado existente alterado.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
CREATE FUNCTION pg_temp.exchange_coupon_order(p_stock uuid,p_customer uuid,p_terminal uuid,p_inventory uuid,p_coupon uuid,p_price numeric,p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE pre uuid:=gen_random_uuid(); result jsonb;
BEGIN
 PERFORM public.pdv_save_preorder_v2(pre,0,jsonb_build_object('stock_id',p_stock,'customer_id',p_customer,'operation_mode','counter','discount_amount',0,
   'coupon_id',p_coupon,'coupon_discount_cents',CASE WHEN p_coupon IS NULL THEN 0 ELSE 200 END),
   jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'inventory_id',p_inventory,'item_type','material','description','Material fictício da troca','quantity',1,'unit_price',p_price,'discount_amount',0,'unit_factor',1,'sort_order',0)),p_key||'-save');
 PERFORM public.pdv_assign_preorder_terminal_v3(pre,1,p_terminal,p_key||'-target');
 PERFORM public.pdv_forward_preorder_v2(pre,2,p_key||'-forward');
 result:=public.pdv_convert_preorder_v2(pre,3,p_key||'-convert'); RETURN (result->>'order_id')::uuid;
END $fn$;
DO $contract$
BEGIN
 IF has_function_privilege('anon','public.pdv_cover_exchange_order_coupon_v1(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.pdv_cover_exchange_order_coupon_v1(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer)','EXECUTE')
  OR has_function_privilege('authenticated','public.pdv_cover_exchange_order_coupon_base_v1(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer)','EXECUTE')
  OR has_function_privilege('service_role','public.pdv_assert_exchange_coupon_access_internal_v1(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'ACL da troca promocional inválida'; END IF;
END $contract$;
DO $behavior$
DECLARE
 c uuid:='f4160304-0000-4000-8000-000000000001'; u uuid:='f4160304-0000-4000-8000-000000000002';
 cx uuid:='f4160304-0000-4000-8000-000000000003'; ux uuid:='f4160304-0000-4000-8000-000000000004';
 cash uuid:='f4160304-0000-4000-8000-000000000005'; stock uuid:='f4160304-0000-4000-8000-000000000006';
 terminal uuid:='f4160304-0000-4000-8000-000000000007'; material uuid:='f4160304-0000-4000-8000-000000000008';
 customer uuid:='f4160304-0000-4000-8000-000000000009'; session_id uuid; original_order uuid; return_id uuid; voucher uuid;
 coupon uuid; target_one uuid; target_two uuid; legacy_target uuid; result jsonb; replay jsonb; rules jsonb; snapshot jsonb;
 blocked boolean; detail text; current_revision integer; original_quantity numeric; before_entries integer;
BEGIN
 IF EXISTS(SELECT 1 FROM public.companies WHERE id IN(c,cx)) OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(u,ux)) THEN RAISE EXCEPTION 'IDs de fixture já existem'; END IF;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 VALUES('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','exchange-coupon-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
 ('00000000-0000-0000-0000-000000000000',ux,'authenticated','authenticated','exchange-coupon-b@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Fixture troca com cupom','active'),(cx,'Outro tenant troca cupom','active');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id=u;
 UPDATE public.profiles SET company_id=cx,is_active=true WHERE user_id=ux;
 INSERT INTO public.user_roles(user_id,role) VALUES(u,'admin'),(ux,'admin');
 -- Conversão encaminhada mantém permissões explícitas e a sessão própria.
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(u,'["screen:pdv","screen:pdv_orders","fn:value_pdv_preorder","fn:convert_pdv_preorder"]',true);
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv'),(cx,'pdv');
 INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES(cash,c,'Caixa fictício','caixa',100,true);
 INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
 VALUES(c,'Fixture','America/Sao_Paulo',cash,true,'simples') ON CONFLICT(company_id) DO UPDATE SET pdv_cash_account_id=cash,pdv_mode='simples';
 UPDATE public.stocks SET is_default=false WHERE company_id=c AND is_default;
 INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Estoque fictício',true);
 INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(terminal,c,'Caixa original fictício',stock,true);
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price) VALUES(material,c,'FIX-EXCHANGE-COUPON','Material fictício','un',100,2,10);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,material,stock,100,true);
 INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted) VALUES(customer,c,'Cliente fictício',1000,false);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_open_cash_session_v2(terminal,cash,100,'exchange304-open'); session_id:=(result->>'session_id')::uuid;
 result:=public.pdv_complete_direct_sale_rollout_v2(terminal,session_id,cash,customer,
   jsonb_build_array(jsonb_build_object('inventory_id',material,'stock_id',stock,'quantity',2)),
   jsonb_build_array(jsonb_build_object('method','dinheiro','amount',20)),'exchange304-origin'); original_order:=(result->>'order_id')::uuid;
 EXECUTE 'RESET ROLE';
 result:=public.pdv_return_delivery_items_v2(original_order,(SELECT jsonb_agg(jsonb_build_object('delivery_item_id',di.id,'quantity',2,'destination','saleable','destination_stock_id',stock))
   FROM public.pdv_delivery_items di JOIN public.pdv_deliveries d ON d.id=di.delivery_id WHERE d.order_id=original_order),
   jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',20)),public.company_today(c),'Devolução fictícia para troca','exchange304-return'); return_id:=(result->>'return_id')::uuid;
 result:=public.pdv_issue_return_voucher_v2(return_id,20,NULL,'exchange304-voucher'); voucher:=(result->>'voucher_id')::uuid;
 PERFORM public.pdv_save_workflow_settings_v3('balcao','dispatch');
 rules:=jsonb_build_object('code','TROCA2','name','Promoção fictícia na troca','kind','fixed','value',2,'is_active',true,'usage_limit',1,'per_customer_limit',1);
 result:=public.pdv_save_coupon_v1(NULL,NULL,rules); coupon:=(result->>'id')::uuid;
 target_one:=pg_temp.exchange_coupon_order(stock,customer,terminal,material,coupon,10,'exchange304-one');
 target_two:=pg_temp.exchange_coupon_order(stock,customer,terminal,material,coupon,10,'exchange304-two');
 legacy_target:=pg_temp.exchange_coupon_order(stock,customer,terminal,material,NULL,2,'exchange304-legacy');
 SELECT quantity INTO original_quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock;
 snapshot:=public.pdv_get_after_sale_workspace_v2(original_order);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'exchange_candidates') r WHERE r->>'order_id'=target_one::text AND (r->>'coupon_revision')::integer=0)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot->'order_candidates') r WHERE r->>'order_id'=target_one::text AND (r->>'can_apply_voucher')::boolean) THEN RAISE EXCEPTION 'Candidato omitiu revisão ou ofereceu pré-aplicação insegura'; END IF;
 -- Nenhum voucher pode ser debitado por pré-aplicação legada com cupom.
 blocked:=false;
 BEGIN PERFORM public.pdv_apply_voucher_to_order_v2(target_one,voucher,1,'exchange304-preapply-denied');
 EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; blocked:=detail LIKE '%pdv_voucher_checkout_required%'; END;
 IF NOT blocked OR public.pdv_voucher_balance_internal_v2(voucher)<>20 OR EXISTS(SELECT 1 FROM public.pdv_order_payments WHERE order_id=target_one) THEN RAISE EXCEPTION 'Pré-aplicação consumiu crédito com cupom'; END IF;
 -- Uma troca sem CAS não pode aproveitar promoção, mesmo com total correto.
 blocked:=false;
 BEGIN PERFORM public.pdv_cover_exchange_order_v2(return_id,target_one,voucher,8,0,NULL,NULL,NULL,'exchange304-old-denied');
 EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;blocked:=detail LIKE '%pdv_exchange_target_cash_required%'; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Rota antiga criou troca sem caixa explícito'; END IF;
 -- A inativação posterior ao orçamento precisa ser validada ao liquidar.
 PERFORM public.pdv_save_coupon_v1(coupon,1,rules||jsonb_build_object('is_active',false));
 blocked:=false;
 BEGIN PERFORM public.pdv_cover_exchange_order_coupon_v2(return_id,target_one,voucher,8,0,NULL,NULL,NULL,'exchange304-inactive',0,session_id);
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
 IF NOT blocked OR EXISTS(SELECT 1 FROM public.pdv_coupon_usages WHERE coupon_id=coupon) OR public.pdv_voucher_balance_internal_v2(voucher)<>20 THEN RAISE EXCEPTION 'Troca consumiu cupom inativo ou voucher'; END IF;
 PERFORM public.pdv_save_coupon_v1(coupon,2,rules);
 -- Remove e recoloca a promoção com o mesmo total: revisão mudou duas vezes.
 PERFORM public.pdv_set_pending_order_coupon_v1(target_one,terminal,session_id,cash,NULL,0,0);
 blocked:=false;
 BEGIN PERFORM public.pdv_cover_exchange_order_v2(return_id,target_one,voucher,10,0,NULL,NULL,NULL,'exchange304-removed-old-denied');
 EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;blocked:=detail LIKE '%pdv_exchange_target_cash_required%'; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Remover cupom permitiu liquidação antiga sem caixa explícito'; END IF;
 blocked:=false;
 BEGIN PERFORM public.pdv_apply_voucher_to_order_v2(target_one,voucher,1,'exchange304-removed-preapply-denied');
 EXCEPTION WHEN insufficient_privilege THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; blocked:=detail LIKE '%pdv_voucher_checkout_required%'; END;
 IF NOT blocked OR public.pdv_voucher_balance_internal_v2(voucher)<>20 THEN RAISE EXCEPTION 'Remover cupom abriu pré-aplicação sem proteção de revisão'; END IF;
 PERFORM public.pdv_set_pending_order_coupon_v1(target_one,terminal,session_id,cash,coupon,200,1);
 blocked:=false;
 BEGIN PERFORM public.pdv_cover_exchange_order_coupon_v2(return_id,target_one,voucher,8,0,NULL,NULL,NULL,'exchange304-stale-same-total',0,session_id);
 EXCEPTION WHEN serialization_failure THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Snapshot antigo confirmou desconto após ABA'; END IF;
 -- Coupon usage e todos os recursos são desfeitos quando o pagamento falha.
 blocked:=false;
 BEGIN PERFORM public.pdv_cover_exchange_order_coupon_v2(return_id,target_one,gen_random_uuid(),8,0,NULL,NULL,NULL,'exchange304-finance-failure',2,session_id);
 EXCEPTION WHEN check_violation THEN blocked:=true; END;
 IF NOT blocked OR EXISTS(SELECT 1 FROM public.pdv_coupon_usages WHERE coupon_id=coupon)
   OR EXISTS(SELECT 1 FROM public.pdv_operation_requests WHERE company_id=c AND idempotency_key='exchange304-finance-failure') THEN RAISE EXCEPTION 'Falha financeira deixou utilização ou request parcial'; END IF;
 -- Autorização precede o erro de revisão, inclusive para outro tenant.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ux,'role','authenticated')::text,true); blocked:=false;
 BEGIN PERFORM public.pdv_cover_exchange_order_coupon_v2(return_id,target_one,voucher,8,0,NULL,NULL,NULL,'exchange304-other-tenant',999,session_id);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Outro tenant recebeu acesso ou erro de revisão do pedido'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_cover_exchange_order_coupon_v2(return_id,target_one,voucher,8,0,NULL,NULL,NULL,'exchange304-success',2,session_id);
 replay:=public.pdv_cover_exchange_order_coupon_v2(return_id,target_one,voucher,8,0,NULL,NULL,NULL,'exchange304-success',2,session_id);
 EXECUTE 'RESET ROLE';
 IF replay->>'exchange_id'<>result->>'exchange_id' OR replay->>'idempotent'<>'true'
   OR (SELECT count(*) FROM public.pdv_coupon_usages WHERE coupon_id=coupon)<>1 OR public.pdv_voucher_balance_internal_v2(voucher)<>12
   OR (SELECT count(*) FROM public.pdv_order_payments WHERE order_id=target_one)<>1 THEN RAISE EXCEPTION 'Troca/replay não preservaram um uso e um consumo'; END IF;
 blocked:=false;
 BEGIN PERFORM public.pdv_cover_exchange_order_coupon_v2(return_id,target_two,voucher,8,0,NULL,NULL,NULL,'exchange304-quota',0,session_id);
 EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
 IF NOT blocked OR public.pdv_voucher_balance_internal_v2(voucher)<>12 THEN RAISE EXCEPTION 'Troca ignorou cota consumida por outra venda'; END IF;
 -- Operação antiga sem cupom continua reexecutável pela rota nova com CAS 0.
 result:=public.pdv_cover_exchange_order_coupon_v2(return_id,legacy_target,voucher,2,0,NULL,NULL,NULL,'exchange304-legacy-replay',0,session_id);
 -- Request histórico sintético referencia a troca real, sem segundo consumo.
 INSERT INTO public.pdv_operation_requests(company_id,operation_type,idempotency_key,payload_hash,status,resource_type,resource_id,result,created_by,completed_at)
 VALUES(c,'after_sale.exchange.cover.v2','exchange304-legacy-replay',public.pdv_operation_payload_hash(jsonb_build_object('return_id',return_id,'new_order_id',legacy_target,'voucher_id',voucher,'voucher_amount',2::numeric(14,2),'credit_amount',0::numeric(14,2),'difference_method',NULL,'difference_account_id',NULL,'cash_session_id',NULL)),
 'completed','pdv_exchange',(result->>'exchange_id')::uuid,result,u,now());
 replay:=public.pdv_cover_exchange_order_coupon_v1(return_id,legacy_target,voucher,2,0,NULL,NULL,NULL,'exchange304-legacy-replay',0);
 IF replay->>'exchange_id'<>result->>'exchange_id' OR replay->>'idempotent'<>'true'
   OR public.pdv_voucher_balance_internal_v2(voucher)<>10 THEN RAISE EXCEPTION 'CAS zero alterou replay legado ou consumiu duas vezes'; END IF;
 IF (SELECT payload_hash FROM public.pdv_operation_requests WHERE company_id=c AND operation_type='after_sale.exchange.cover.v2' AND idempotency_key='exchange304-legacy-replay')
   IS DISTINCT FROM public.pdv_operation_payload_hash(jsonb_build_object('return_id',return_id,'new_order_id',legacy_target,'voucher_id',voucher,'voucher_amount',2::numeric(14,2),'credit_amount',0::numeric(14,2),
     'difference_method',NULL,'difference_account_id',NULL,'cash_session_id',NULL)) THEN RAISE EXCEPTION 'Hash legado sem promoção foi alterado'; END IF;
 IF (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=stock)<>original_quantity THEN RAISE EXCEPTION 'Troca ou replay repetiu movimento físico'; END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
END $behavior$;
ROLLBACK;

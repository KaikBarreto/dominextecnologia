BEGIN;
DO $contract$
DECLARE signature text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.finance_pdv_reconciliation_context_v3()',
  'public.finance_pdv_reconciliation_source_allowed_v3(uuid,text,uuid)',
  'public.finance_pdv_reconciliation_rows_v3(uuid,text,date,date)'] LOOP
  IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE') OR has_function_privilege('service_role',signature,'EXECUTE') THEN
   RAISE EXCEPTION 'helper financeiro privado exposto: %',signature;
  END IF;
 END LOOP;
 IF has_function_privilege('anon','public.finance_get_pdv_reconciliation_v3(text,date,date,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'RPC financeira exposta ao anon'; END IF;
END $contract$;

DO $fixture$
DECLARE c uuid:='f3110000-0000-4000-8000-000000000001';u uuid:='f3110000-0000-4000-8000-000000000011';
 s uuid:='f3110000-0000-4000-8000-000000000021';o uuid;
 cash uuid:='f3110000-0000-4000-8000-000000000070';term uuid:='f3110000-0000-4000-8000-000000000071';
 inv uuid:='f3110000-0000-4000-8000-000000000072';sess uuid; result jsonb;
BEGIN
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 VALUES('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','finance-reconciliation@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Conferência financeira fictícia','active');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id=u;
 INSERT INTO public.user_roles(user_id,role) VALUES(u,'comercial');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(u,'["*"]',true)
 ON CONFLICT(user_id) DO UPDATE SET permissions=EXCLUDED.permissions,is_active=true;
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv');
 INSERT INTO public.customers(id,company_id,name) VALUES('f3110000-0000-4000-8000-000000000051',c,'Cliente fictício');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 INSERT INTO public.stocks(id,company_id,name,purpose) VALUES(s,c,'Estoque fictício','operacional');
 INSERT INTO public.suppliers(id,company_id,name) VALUES('f3110000-0000-4000-8000-000000000041',c,'Fornecedor fictício');
 INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
 VALUES('f3110000-0000-4000-8000-000000000042',c,'Banco fictício','banco',0,true);
 -- Canonical writers create a valid completed order/payment/application context.
 INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
 VALUES(cash,c,'Cofre fictício','caixa',1000,true);
 INSERT INTO public.company_settings(company_id,name,timezone,pdv_mode,pdv_cash_account_id,pdv_strict_cash_tracking)
 VALUES(c,'Conferência fictícia','America/Sao_Paulo','simples',cash,true)
 ON CONFLICT(company_id) DO UPDATE SET timezone=EXCLUDED.timezone,pdv_mode=EXCLUDED.pdv_mode,pdv_cash_account_id=EXCLUDED.pdv_cash_account_id,pdv_strict_cash_tracking=true;
 INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(term,c,'Caixa fictício',s,true);
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price)
 VALUES(inv,c,'FIN-CANON','Material com custo conhecido','un',1,30,65);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,inv,s,1,true);
 result:=public.pdv_open_cash_session_v2(term,cash,0,'finance-shadow-open-cash-0001');
 sess:=(result->>'session_id')::uuid;
 result:=public.pdv_complete_direct_sale_rollout_v2(term,sess,cash,'f3110000-0000-4000-8000-000000000051',
   jsonb_build_object('items',jsonb_build_array(jsonb_build_object('inventory_id',inv,'stock_id',s,'quantity',1,'unit_price',65,'discount_amount',0)),
     'order_discount_amount',0,'transaction_date','2026-11-15'),
   jsonb_build_array(jsonb_build_object('method','pix','amount',20,'account_id','f3110000-0000-4000-8000-000000000042'),
                    jsonb_build_object('method','credito','amount',45,'account_id','f3110000-0000-4000-8000-000000000042')),
   'finance-shadow-mixed-sale-0001');
 o:=(result->>'order_id')::uuid;
 PERFORM set_config('test.finance_order',o::text,true);
 IF o IS NULL OR NOT EXISTS(SELECT 1 FROM public.pdv_order_payments p WHERE p.order_id=o AND p.method='credito' AND p.amount=45 AND p.settlement_status='open') THEN
  RAISE EXCEPTION 'fixture canônica não criou cartão45 pendente'; END IF;
 INSERT INTO public.financial_categories(id,company_id,name,type,is_active,dre_group)
 VALUES('f3110000-0000-4000-8000-000000000073',c,'Materiais fictícios','saida',true,'cmv');
 -- Receiving a later purchase changes inventory cost, not the immutable delivered CMV30.
 result:=public.registrar_compra_material_direta(
   'f3110000-0000-4000-8000-000000000045',s,'f3110000-0000-4000-8000-000000000041',
   jsonb_build_array(jsonb_build_object('inventory_id',inv,'quantity',2,'unit_price',11)),
   '2026-11-14','f3110000-0000-4000-8000-000000000042','f3110000-0000-4000-8000-000000000073',
   true,'2026-11-15',NULL,'pix','Compra fictícia',NULL);
 IF result IS NULL THEN RAISE EXCEPTION 'compra canônica não confirmada'; END IF;
 -- Mixed service activity remains a separate source, never silently merged.
 INSERT INTO public.service_orders(id,company_id,customer_id,description,order_number)
 VALUES('f3110000-0000-4000-8000-000000000052',c,'f3110000-0000-4000-8000-000000000051','OS fictícia',1);
 INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,category,transaction_date,is_paid,service_order_id,origin)
 VALUES('f3110000-0000-4000-8000-000000000053',c,'saida','Material utilizado em OS',12,'Materiais','2026-11-15',false,'f3110000-0000-4000-8000-000000000052','geral');
 INSERT INTO public.companies(id,name,subscription_status) VALUES('f3110000-0000-4000-8000-000000000002','Outra empresa fictícia','active');
 INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,category,transaction_date,is_paid,origin)
 VALUES('f3110000-0000-4000-8000-000000000099','f3110000-0000-4000-8000-000000000002','entrada','Outra empresa',999,'Vendas','2026-11-15',false,'pdv');

END $fixture$;

-- Tests run as the browser role, not owner-only queries masking RLS/ACL mistakes.
SET LOCAL ROLE authenticated;
DO $positive$
DECLARE r jsonb; d jsonb; key text;
BEGIN
 r:=public.finance_get_pdv_reconciliation_v3('dre_competence','2026-11-14','2026-11-15',1,0);
 IF (r#>>'{commercial,revenue}')::numeric<>65 OR (r#>>'{commercial,cmv}')::numeric<>30 OR (r#>>'{commercial,result}')::numeric<>35
  OR (r#>>'{acquisitions,amount}')::numeric<>22 OR r->>'coverage_status'<>'incomplete' OR r->'company_result'<>'null'::jsonb
  OR (r->>'total_count')::integer<>2 OR r->>'has_more'<>'true' THEN RAISE EXCEPTION 'misturou aquisição/CMV, perdeu entrega ou anunciou total global: %',r; END IF;
 IF NOT (r->'coverage_reasons' ? 'shared_inventory_consumption_not_reconciled') THEN RAISE EXCEPTION 'omitiu cobertura OS incompleta'; END IF;
 key:=r#>>'{entries,0,event_key}';
 d:=public.finance_get_pdv_reconciliation_entry_v3(key,'dre_competence','2026-11-14','2026-11-15');
 IF d->>'event_key' IS DISTINCT FROM key THEN RAISE EXCEPTION 'detalhe não reaplicou origem autorizada'; END IF;
 r:=public.finance_get_pdv_reconciliation_v3('dre_competence','2026-11-14','2026-11-15',1,1);
 IF r->>'has_more'<>'false' OR jsonb_array_length(r->'entries')<>1 THEN RAISE EXCEPTION 'paginação incompleta'; END IF;
 r:=public.finance_get_pdv_reconciliation_v3('dfc','2026-11-15','2026-11-15');
 IF (r#>>'{acquisitions,fully_paid_amount}')::numeric<>22 OR (r#>>'{commercial,cash_flow}')::numeric<>20 OR r->'company_cash_flow'<>'null'::jsonb THEN RAISE EXCEPTION 'pagamento da compra perdido ou fluxo global inventado'; END IF;
 r:=public.finance_get_pdv_reconciliation_v3('dre_cash','2026-11-15','2026-11-15');
 IF (r#>>'{commercial,revenue}')::numeric<>20 OR (r#>>'{commercial,cmv}')::numeric<>9.23 THEN RAISE EXCEPTION 'caixa não preservou aplicação canônica/CMV proporcional'; END IF;
 BEGIN
  PERFORM public.finance_get_pdv_reconciliation_entry_v3(key,'dre_competence','2026-11-16','2026-11-16');
  RAISE EXCEPTION 'aceitou evento fora do período';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 BEGIN
  PERFORM public.finance_get_pdv_reconciliation_entry_v3('dre_competence:legacy_financial:f3110000-0000-4000-8000-000000000099','dre_competence','2026-11-14','2026-11-15');
  RAISE EXCEPTION 'detalhe vazou outro tenant';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 BEGIN
  PERFORM public.finance_get_pdv_reconciliation_v3('dre_competence','2026-11-15','2026-11-14');
  RAISE EXCEPTION 'aceitou período invertido';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $positive$;
RESET ROLE;

-- Regression: access to stock A never grants return destination B or its purchases.
-- Build the return/purchase through canonical writers while B is open, then restrict B.
DO $stock_fixture$
DECLARE c uuid:='f3110000-0000-4000-8000-000000000001';
 u uuid:='f3110000-0000-4000-8000-000000000011'; other_user uuid:='f3110000-0000-4000-8000-000000000012';
 b uuid:='f3110000-0000-4000-8000-000000000022'; o uuid; di uuid; ri uuid; purchase_ft uuid; result jsonb;
BEGIN
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
   raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 VALUES('00000000-0000-0000-0000-000000000000',other_user,'authenticated','authenticated',
   'finance-stock-b@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id=other_user;
 INSERT INTO public.user_roles(user_id,role) VALUES(other_user,'comercial');
 INSERT INTO public.stocks(id,company_id,name,purpose) VALUES(b,c,'Estoque B restrito','operacional');
 -- Only this transaction's fictitious tenant is added; existing rollout cohorts survive.
 UPDATE public.app_feature_flags SET company_allowlist=array_append(company_allowlist,c)
 WHERE key IN('pdv_returns_v2','pdv_party_accounts_v2') AND NOT(c=ANY(company_allowlist));
 o:=current_setting('test.finance_order')::uuid;
 SELECT item.id INTO STRICT di FROM public.pdv_delivery_items item
 JOIN public.pdv_deliveries delivery ON delivery.id=item.delivery_id
 WHERE delivery.order_id=o;
 result:=public.pdv_return_delivery_items_v2(o,
   jsonb_build_array(jsonb_build_object('delivery_item_id',di,'quantity',1,'destination','saleable','destination_stock_id',b)),
   jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',65)),
   '2026-11-15','Devolução para outro estoque','finance-shadow-return-stock-b-0001');
 SELECT item.id INTO STRICT ri FROM public.pdv_commercial_return_items item
 WHERE item.commercial_return_id=(result->>'return_id')::uuid;
 PERFORM set_config('test.finance_return_event',ri::text,true);
 PERFORM set_config('test.finance_delivery_event',di::text,true);
 result:=public.registrar_compra_material_direta(
   'f3110000-0000-4000-8000-000000000046',b,'f3110000-0000-4000-8000-000000000041',
   jsonb_build_array(jsonb_build_object('inventory_id','f3110000-0000-4000-8000-000000000072','quantity',1,'unit_price',17)),
   '2026-11-15','f3110000-0000-4000-8000-000000000042','f3110000-0000-4000-8000-000000000073',
   true,'2026-11-15',NULL,'pix','Compra no estoque B',NULL);
 purchase_ft:=(result->>'financial_transaction_id')::uuid;
 IF purchase_ft IS NULL THEN RAISE EXCEPTION 'compra B canônica não criou obrigação'; END IF;
 PERFORM set_config('test.finance_purchase_b_event',purchase_ft::text,true);
 -- Reconstruct a supported legacy header whose stock reference was lost
 -- (compras.stock_id FK uses ON DELETE SET NULL). Modern writer still requires
 -- a stock. Owner-only fixture changes no guard/constraint or business writer.
 result:=public.registrar_compra_material_direta(
   'f3110000-0000-4000-8000-000000000047','f3110000-0000-4000-8000-000000000021','f3110000-0000-4000-8000-000000000041',
   jsonb_build_array(jsonb_build_object('inventory_id','f3110000-0000-4000-8000-000000000072','quantity',1,'unit_price',19)),
   '2026-11-15','f3110000-0000-4000-8000-000000000042','f3110000-0000-4000-8000-000000000073',
   true,'2026-11-15',NULL,'pix','Compra legada sem origem resolvida',NULL);
 UPDATE public.compras SET stock_id=NULL WHERE id=(result->>'compra_id')::uuid AND company_id=c;
 PERFORM set_config('test.finance_purchase_null_event',result->>'financial_transaction_id',true);
 INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(c,b,other_user);
 IF public.pdv_has_stock_access_scope_v2(u,c,p_order_id=>o) IS DISTINCT FROM false
   OR public.finance_pdv_reconciliation_source_allowed_v3(c,'commercial_return_v2',ri) IS DISTINCT FROM false
   OR public.finance_pdv_reconciliation_source_allowed_v3(c,'delivery_v2',di) IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'origem A liberou devolução/dados do estoque B restrito'; END IF;

 -- Legacy mixed order: valid service delivery, unresolved pending material origin.
 -- No triggers/constraints are disabled. NULL header must not expose even its service event.
 INSERT INTO public.pdv_orders(id,company_id,number,stock_id,status,subtotal,total,client_request_id)
 VALUES('f3110000-0000-4000-8000-000000000080',c,3110080,NULL,'retirada_parcial',12,12,'finance-shadow-null-material'),
       ('f3110000-0000-4000-8000-000000000085',c,3110085,NULL,'entregue',3,3,'finance-shadow-null-service');
 INSERT INTO public.pdv_order_items(id,company_id,order_id,inventory_id,description,quantity,unit_price,unit_cost,total,
   item_type,unit_cost_v2,contract_version,gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2)
 VALUES('f3110000-0000-4000-8000-000000000081',c,'f3110000-0000-4000-8000-000000000080',NULL,'Serviço entregue',1,7,0,7,'service',0,2,7,0,0),
       ('f3110000-0000-4000-8000-000000000082',c,'f3110000-0000-4000-8000-000000000080','f3110000-0000-4000-8000-000000000072','Material sem origem',1,5,0,5,'material',NULL,2,5,0,0),
       ('f3110000-0000-4000-8000-000000000086',c,'f3110000-0000-4000-8000-000000000085',NULL,'Somente serviço',1,3,0,3,'service',0,2,3,0,0);
 INSERT INTO public.pdv_deliveries(id,company_id,order_id,client_request_id,payload_hash,created_by,created_at)
 VALUES('f3110000-0000-4000-8000-000000000083',c,'f3110000-0000-4000-8000-000000000080',gen_random_uuid(),repeat('a',64),u,
          '2026-11-15 12:00:00-03'),
       ('f3110000-0000-4000-8000-000000000087',c,'f3110000-0000-4000-8000-000000000085',gen_random_uuid(),repeat('b',64),u,
          '2026-11-15 12:00:00-03');
 INSERT INTO public.pdv_delivery_items(id,company_id,delivery_id,order_item_id,quantity,item_type,unit_cost_snapshot)
 VALUES('f3110000-0000-4000-8000-000000000084',c,'f3110000-0000-4000-8000-000000000083','f3110000-0000-4000-8000-000000000081',1,'service',0),
       ('f3110000-0000-4000-8000-000000000088',c,'f3110000-0000-4000-8000-000000000087','f3110000-0000-4000-8000-000000000086',1,'service',0);
 IF public.finance_pdv_reconciliation_source_allowed_v3(c,'delivery_v2','f3110000-0000-4000-8000-000000000084') IS DISTINCT FROM false
   OR public.finance_pdv_reconciliation_source_allowed_v3(c,'delivery_v2','f3110000-0000-4000-8000-000000000088') IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'origem material NULL liberada ou serviço sem estoque negado'; END IF;
END $stock_fixture$;

SET LOCAL ROLE authenticated;
DO $stock_denied$
DECLARE r jsonb; event_key text;
BEGIN
 r:=public.finance_get_pdv_reconciliation_v3('dre_competence','2026-11-14','2026-11-15');
 IF (r#>>'{commercial,revenue}')::numeric<>3 OR (r#>>'{commercial,cmv}')::numeric<>0
   OR (r#>>'{acquisitions,amount}')::numeric<>22 OR (r->>'total_count')::integer<>2 THEN
   RAISE EXCEPTION 'lista/totais expuseram origem B ou material sem origem: %',r; END IF;
 FOREACH event_key IN ARRAY ARRAY[
   'dre_competence:commercial_return_v2:'||current_setting('test.finance_return_event'),
   'dre_competence:delivery_v2:'||current_setting('test.finance_delivery_event'),
   'dre_competence:inventory_acquisition:'||current_setting('test.finance_purchase_b_event'),
   'dre_competence:inventory_acquisition:'||current_setting('test.finance_purchase_null_event'),
   'dre_competence:delivery_v2:f3110000-0000-4000-8000-000000000084'] LOOP
   BEGIN PERFORM public.finance_get_pdv_reconciliation_entry_v3(event_key,'dre_competence','2026-11-14','2026-11-15');
     RAISE EXCEPTION 'detalhe revelou identificador/valor de origem restrita: %',event_key;
   EXCEPTION WHEN no_data_found THEN NULL; END;
 END LOOP;
END $stock_denied$;
RESET ROLE;
INSERT INTO public.stock_access(company_id,stock_id,user_id)
VALUES('f3110000-0000-4000-8000-000000000001','f3110000-0000-4000-8000-000000000022','f3110000-0000-4000-8000-000000000011');
SET LOCAL ROLE authenticated;
DO $stock_granted$
DECLARE r jsonb; d jsonb;
BEGIN
 r:=public.finance_get_pdv_reconciliation_v3('dre_competence','2026-11-14','2026-11-15');
 IF (r#>>'{commercial,revenue}')::numeric<>3 OR (r#>>'{commercial,cmv}')::numeric<>0
   OR (r#>>'{acquisitions,amount}')::numeric<>39 OR (r->>'total_count')::integer<>5 THEN
   RAISE EXCEPTION 'permissão explícita B não restaurou eventos e aquisição canônicos: %',r; END IF;
 d:=public.finance_get_pdv_reconciliation_entry_v3('dre_competence:commercial_return_v2:'||current_setting('test.finance_return_event'),
   'dre_competence','2026-11-14','2026-11-15');
 IF (d->>'revenue')::numeric<>-65 OR (d->>'cmv')::numeric<>-30 THEN
   RAISE EXCEPTION 'devolução autorizada perdeu snapshot comercial/CMV'; END IF;
 d:=public.finance_get_pdv_reconciliation_entry_v3('dre_competence:inventory_acquisition:'||current_setting('test.finance_purchase_b_event'),
   'dre_competence','2026-11-14','2026-11-15');
 IF (d->>'purchase_amount')::numeric<>17 THEN RAISE EXCEPTION 'aquisição B não liberada após ACL'; END IF;
 BEGIN PERFORM public.finance_get_pdv_reconciliation_entry_v3('dre_competence:inventory_acquisition:'||current_setting('test.finance_purchase_null_event'),
   'dre_competence','2026-11-14','2026-11-15');
   RAISE EXCEPTION 'ACL B permitiu compra de origem desconhecida';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 -- Even after granting every known stock, unresolved material origin remains denied.
 BEGIN PERFORM public.finance_get_pdv_reconciliation_entry_v3('dre_competence:delivery_v2:f3110000-0000-4000-8000-000000000084',
   'dre_competence','2026-11-14','2026-11-15');
   RAISE EXCEPTION 'ACL B permitiu origem material desconhecida';
 EXCEPTION WHEN no_data_found THEN NULL; END;
END $stock_granted$;
RESET ROLE;

-- Remove the explicit cross-cash grant: finance screen alone must never aggregate B.
UPDATE public.user_permissions SET permissions='["screen:finance","fn:view_finance_totals"]'
 WHERE user_id='f3110000-0000-4000-8000-000000000011';
SET LOCAL ROLE authenticated;
DO $negative$
BEGIN
 BEGIN PERFORM public.finance_get_pdv_reconciliation_v3('dre_competence','2026-11-14','2026-11-15');
 RAISE EXCEPTION 'financeiro ganhou acesso implícito entre caixas'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $negative$;
RESET ROLE;

-- Expired subscription is denied even with nominal full access.
UPDATE public.user_permissions SET permissions='["*"]' WHERE user_id='f3110000-0000-4000-8000-000000000011';
UPDATE public.companies SET subscription_status='inactive' WHERE id='f3110000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $negative$
BEGIN
 BEGIN PERFORM public.finance_get_pdv_reconciliation_v3('dre_competence','2026-11-14','2026-11-15');
 RAISE EXCEPTION 'assinatura inativa consultou totais'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $negative$;
RESET ROLE;
UPDATE public.companies SET subscription_status='active' WHERE id='f3110000-0000-4000-8000-000000000001';
DELETE FROM public.company_modules WHERE company_id='f3110000-0000-4000-8000-000000000001' AND module_code='pdv';
SET LOCAL ROLE authenticated;
DO $no_module$ BEGIN
 BEGIN PERFORM public.finance_get_pdv_reconciliation_v3('dre_competence','2026-11-14','2026-11-15');
 RAISE EXCEPTION 'empresa sem módulo consultou totais'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $no_module$;
RESET ROLE;
INSERT INTO public.company_modules(company_id,module_code) VALUES('f3110000-0000-4000-8000-000000000001','pdv');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.profiles SET is_active=false WHERE user_id='f3110000-0000-4000-8000-000000000011';
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"f3110000-0000-4000-8000-000000000011"}',true);
SET LOCAL ROLE authenticated;
DO $inactive$ BEGIN
 BEGIN PERFORM public.finance_get_pdv_reconciliation_v3('dre_competence','2026-11-14','2026-11-15');
 RAISE EXCEPTION 'JWT inativo consultou totais'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $inactive$;
RESET ROLE;
ROLLBACK;

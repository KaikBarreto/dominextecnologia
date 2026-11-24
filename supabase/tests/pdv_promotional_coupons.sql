-- Dados exclusivamente fictícios; todos os efeitos, inclusive auth/provisionamento,
-- são revertidos. Não exclui nem modifica dados persistidos de clientes.
BEGIN;
-- Reconstrói o corpo pré-cupons removendo SOMENTE os enxertos 30100/30200.
-- Conserva os patches financeiros 20000/21000. A cópia cria hashes históricos;
-- a RPC corrente deve fazer replay sem criar qualquer fato adicional.
DO $legacy_writers$
DECLARE s text; block text; signature text; source_name text; target_name text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure) INTO s;
 IF position('||public.pdv_coupon_hash_meta_internal_v1(p_cart)' IN s)=0 THEN RAISE EXCEPTION 'Integração do hash de cupom não encontrada'; END IF;
 s:=replace(s,$from$'items','order_discount_amount','notes','transaction_date','coupon_id','coupon_discount_cents'$from$,$to$'items','order_discount_amount','notes','transaction_date'$to$);
 s:=replace(s,'||public.pdv_coupon_hash_meta_internal_v1(p_cart)','');
 block:=$block$  -- PDV_COUPON_CHECKOUT_V1: rateio promocional apenas nos itens elegíveis.
  IF NULLIF(p_cart->>'coupon_id','') IS NOT NULL THEN
    v_result:=public.pdv_apply_order_coupon_internal_v1(v_order_id,(p_cart->>'coupon_id')::uuid,NULLIF(p_cart->>'coupon_discount_cents','')::bigint);
    v_total:=(v_result->>'total')::numeric;
    v_order_discount:=(v_result->>'discount_amount')::numeric;
    PERFORM public.pdv_consume_order_coupon_internal_v1(v_order_id);
  ELSIF COALESCE(NULLIF(p_cart->>'coupon_discount_cents','')::bigint,0)<>0 THEN
    RAISE EXCEPTION 'Selecione um cupom válido.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_invalid';
  END IF;

$block$;
 IF position(block IN s)=0 THEN RAISE EXCEPTION 'Enxerto de cupom mudou na fixture de replay'; END IF;
 s:=replace(s,block,''); s:=replace(s,'public.pdv_complete_direct_sale_v2(','public.pdv_coupon_fixture_legacy_sale_v1('); EXECUTE s;
 FOREACH signature IN ARRAY ARRAY['public.pdv_save_preorder_v2(uuid,bigint,jsonb,jsonb,text)','public.pdv_value_preorder_v2(uuid,bigint,jsonb,jsonb,text)'] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO s;
  IF position('||public.pdv_coupon_hash_meta_internal_v1(p_header)' IN s)=0 THEN RAISE EXCEPTION 'Integração do hash do orçamento não encontrada'; END IF;
  s:=replace(s,'||public.pdv_coupon_hash_meta_internal_v1(p_header)','');
  s:=replace(s,$line$  PERFORM public.pdv_preview_preorder_coupon_internal_v1(v_pre.id,NULLIF(p_header->>'coupon_id','')::uuid,COALESCE(NULLIF(p_header->>'coupon_discount_cents','')::bigint,0));$line$,'');
  IF signature LIKE '%pdv_save_preorder%' THEN source_name:='public.pdv_save_preorder_v2('; target_name:='public.pdv_coupon_fixture_legacy_save_v1(';
  ELSE source_name:='public.pdv_value_preorder_v2('; target_name:='public.pdv_coupon_fixture_legacy_value_v1('; END IF;
  EXECUTE replace(s,source_name,target_name);
 END LOOP;
END $legacy_writers$;

DO $coupons$
DECLARE
 c uuid:='c3160000-0000-4000-8000-000000000001'; other_company uuid:='c3160000-0000-4000-8000-000000000002';
 u uuid:='c3160000-0000-4000-8000-000000000003'; customer uuid:='c3160000-0000-4000-8000-000000000004';
 stock uuid:='c3160000-0000-4000-8000-000000000005'; account uuid:='c3160000-0000-4000-8000-000000000006';
 terminal uuid:='c3160000-0000-4000-8000-000000000007'; a uuid:='c3160000-0000-4000-8000-000000000008'; b uuid:='c3160000-0000-4000-8000-000000000009';
 coupon uuid; session_id uuid; v_order_id uuid; preorder uuid:=gen_random_uuid(); quote_order uuid; delivery_item uuid;
 rules jsonb; legacy_cart jsonb; legacy_items jsonb; legacy_order uuid; legacy_quote uuid:=gen_random_uuid(); legacy_item uuid:=gen_random_uuid(); cart jsonb; items jsonb; result jsonb; replay jsonb; preview jsonb; return_result jsonb; blocked boolean; before_orders bigint;
BEGIN
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 VALUES('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','coupon-exemplo@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Cupom exemplo','active'),(other_company,'Outra empresa exemplo','active');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id=u;
 INSERT INTO public.user_roles(user_id,role) VALUES(u,'admin');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(u,'["*"]',true);
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv');
 INSERT INTO public.customers(id,company_id,name,credit_limit) VALUES(customer,c,'Cliente fictício',1000);
 UPDATE public.stocks SET is_default=false WHERE company_id=c AND is_default;
 INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Loja exemplo',true);
 INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES(account,c,'Caixa exemplo','caixa',1000,true);
 INSERT INTO public.company_settings(company_id,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
 VALUES(c,'America/Sao_Paulo',account,true,'simples') ON CONFLICT(company_id) DO UPDATE SET timezone=EXCLUDED.timezone,pdv_cash_account_id=EXCLUDED.pdv_cash_account_id,pdv_strict_cash_tracking=true,pdv_mode='simples';
 INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(terminal,c,'Terminal exemplo',stock,true);
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price) VALUES(a,c,'CUP-A','Participante','un',20,10,50),(b,c,'CUP-B','Não participante','un',20,10,50);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,a,stock,20,true),(c,b,stock,20,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 result:=public.pdv_open_cash_session_v2(terminal,account,100,'coupon-open-exemplo-1'); session_id:=(result->>'session_id')::uuid;
 -- Replay de venda original pré30100, inclusive retry novo enviando null/0.
 legacy_cart:=jsonb_build_object('items',jsonb_build_array(jsonb_build_object('inventory_id',a,'stock_id',stock,'quantity',1,'unit_price',50,'discount_amount',0)),'order_discount_amount',0);
 result:=public.pdv_coupon_fixture_legacy_sale_v1(terminal,session_id,account,customer,legacy_cart,jsonb_build_array(jsonb_build_object('method','dinheiro','amount',50)),'coupon-legacy-sale-replay-1'); legacy_order:=(result->>'order_id')::uuid;
 SELECT count(*) INTO before_orders FROM public.pdv_orders WHERE company_id=c;
 replay:=public.pdv_complete_direct_sale_v2(terminal,session_id,account,customer,legacy_cart,jsonb_build_array(jsonb_build_object('method','dinheiro','amount',50)),'coupon-legacy-sale-replay-1');
 IF (replay->>'idempotent')::boolean IS DISTINCT FROM true OR (replay->>'order_id')::uuid<>legacy_order OR (SELECT count(*) FROM public.pdv_orders WHERE company_id=c)<>before_orders THEN RAISE EXCEPTION 'Venda anterior aos cupons perdeu replay'; END IF;
 replay:=public.pdv_complete_direct_sale_v2(terminal,session_id,account,customer,legacy_cart||jsonb_build_object('coupon_id',NULL,'coupon_discount_cents',0),jsonb_build_array(jsonb_build_object('method','dinheiro','amount',50)),'coupon-legacy-sale-replay-1');
 IF (replay->>'idempotent')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Metadados vazios alteraram hash histórico'; END IF;
 -- Replay original de salvar/valorizar orçamento pré30200, preservando nulls.
 UPDATE public.company_settings SET pdv_mode='balcao' WHERE company_id=c;
 legacy_items:=jsonb_build_array(jsonb_build_object('id',legacy_item,'inventory_id',a,'item_type','material','description','Exemplo legado','quantity',1,'unit_price',50,'discount_amount',0,'unit_factor',1,'sort_order',0));
 result:=public.pdv_coupon_fixture_legacy_save_v1(legacy_quote,0,jsonb_build_object('stock_id',stock,'customer_id',customer),legacy_items,'coupon-legacy-save-replay-1');
 replay:=public.pdv_save_preorder_v2(legacy_quote,0,jsonb_build_object('stock_id',stock,'customer_id',customer,'coupon_id',NULL,'coupon_discount_cents',0),legacy_items,'coupon-legacy-save-replay-1');
 IF replay<>result OR (SELECT revision FROM public.pdv_preorders WHERE id=legacy_quote)<>1 THEN RAISE EXCEPTION 'Salvar orçamento antigo perdeu replay'; END IF;
 PERFORM public.pdv_assign_preorder_terminal_v3(legacy_quote,1,terminal,'coupon-legacy-destination-1'); PERFORM public.pdv_forward_preorder_v2(legacy_quote,2,'coupon-legacy-forward-1');
 legacy_items:=jsonb_build_array(jsonb_build_object('id',legacy_item,'unit_price',50,'discount_amount',0));
 result:=public.pdv_coupon_fixture_legacy_value_v1(legacy_quote,3,jsonb_build_object('customer_id',customer),legacy_items,'coupon-legacy-value-replay-1');
 replay:=public.pdv_value_preorder_v2(legacy_quote,3,jsonb_build_object('customer_id',customer,'coupon_id',NULL,'coupon_discount_cents',0),legacy_items,'coupon-legacy-value-replay-1');
 IF replay<>result OR (SELECT revision FROM public.pdv_preorders WHERE id=legacy_quote)<>4 THEN RAISE EXCEPTION 'Valorizar orçamento antigo perdeu replay'; END IF;
 UPDATE public.company_settings SET pdv_mode='simples' WHERE company_id=c;
 rules:=jsonb_build_object('code',' exemplo20 ','name','Promoção exemplo','kind','fixed','value',20,'minimum_amount',90,'max_discount_amount',25,'starts_on',public.company_today(c),'expires_on',public.company_today(c),'is_active',true,'usage_limit',1,'per_customer_limit',1,'customer_ids',jsonb_build_array(customer),'inventory_ids',jsonb_build_array(a));
 result:=public.pdv_save_coupon_v1(NULL,NULL,rules); coupon:=(result->>'id')::uuid;
 IF result->>'code'<>'EXEMPLO20' THEN RAISE EXCEPTION 'Código não normalizado'; END IF;
 blocked:=false; BEGIN PERFORM public.pdv_save_coupon_v1(NULL,NULL,rules); EXCEPTION WHEN unique_violation THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Código duplicado foi aceito'; END IF;
 items:=jsonb_build_array(jsonb_build_object('id',a,'inventory_id',a,'net_cents',4500),jsonb_build_object('id',b,'inventory_id',b,'net_cents',4500));
 preview:=public.pdv_evaluate_coupon_v1(coupon,customer,items);
 IF (preview->>'discount_cents')::bigint<>2000 OR jsonb_array_length(preview->'allocations')<>1 OR preview->'allocations'->0->>'item_id'<>a::text THEN RAISE EXCEPTION 'Cupom alcançou produto inelegível ou perdeu vigência inclusiva'; END IF;
 IF (public.pdv_evaluate_coupon_v1(coupon,NULL,items)->>'eligible')::boolean THEN RAISE EXCEPTION 'Cupom restrito foi aplicado sem cliente'; END IF;
 IF (public.pdv_evaluate_coupon_internal_v1(other_company,coupon,NULL,items,NULL)->>'reason')<>'missing' THEN RAISE EXCEPTION 'Cupom vazou para outra empresa'; END IF;
 IF (public.pdv_evaluate_coupon_v1(coupon,customer,jsonb_build_array(jsonb_build_object('id',a,'inventory_id',a,'net_cents',8900)))->>'reason')<>'minimum' THEN RAISE EXCEPTION 'Compra mínima ignorada'; END IF;

 -- Quote e conversão mantêm total 70 (100 - 10 manual - 20 promoção), sem uso.
 UPDATE public.company_settings SET pdv_mode='balcao' WHERE company_id=c;
 result:=public.pdv_save_preorder_v2(preorder,0,jsonb_build_object('stock_id',stock,'customer_id',customer,'discount_amount',10,'coupon_id',coupon,'coupon_discount_cents',2000),
 jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'inventory_id',a,'item_type','material','description','Participante','quantity',1,'unit_price',50,'discount_amount',0,'unit_factor',1,'sort_order',0),jsonb_build_object('id',gen_random_uuid(),'inventory_id',b,'item_type','material','description','Não participante','quantity',1,'unit_price',50,'discount_amount',0,'unit_factor',1,'sort_order',1)), 'coupon-quote-save-1');
 IF NOT EXISTS(SELECT 1 FROM public.pdv_preorders WHERE id=preorder AND discount_amount=30 AND coupon_discount_amount_v1=20 AND total=70) THEN RAISE EXCEPTION 'Orçamento perdeu desconto promocional'; END IF;
 PERFORM public.pdv_assign_preorder_terminal_v3(preorder,1,terminal,'coupon-quote-terminal-1');
 PERFORM public.pdv_forward_preorder_v2(preorder,2,'coupon-quote-forward-1');
 result:=public.pdv_convert_preorder_v2(preorder,3,'coupon-quote-convert-1'); quote_order:=(result->>'order_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.pdv_orders WHERE id=quote_order AND coupon_id=coupon AND total=70) OR EXISTS(SELECT 1 FROM public.pdv_coupon_usages WHERE coupon_id=coupon) THEN RAISE EXCEPTION 'Conversão consumiu cupom ou perdeu total'; END IF;
 blocked:=false; BEGIN
  PERFORM public.pdv_cover_existing_order_v2(quote_order,terminal,session_id,account,jsonb_build_array(jsonb_build_object('method','dinheiro','amount',70)),'coupon-old-route-denied-1');
 EXCEPTION WHEN serialization_failure THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Rota sem revisão aceitou pedido com cupom'; END IF;
 -- Cupom expirado/inativo pode ser removido sem reavaliar promoção nem perder manual.
 PERFORM public.pdv_save_coupon_v1(coupon,1,rules||jsonb_build_object('is_active',false));
 result:=public.pdv_set_pending_order_coupon_v1(quote_order,terminal,session_id,account,NULL,0,0);
 IF (result->>'total')::numeric<>90 OR (result->>'revision')::integer<>1 THEN RAISE EXCEPTION 'Remover cupom apagou desconto manual ou revisão'; END IF;
 replay:=public.pdv_set_pending_order_coupon_v1(quote_order,terminal,session_id,account,NULL,0,0);
 IF replay<>result THEN RAISE EXCEPTION 'Replay da remoção alterou pedido'; END IF;
 PERFORM public.pdv_save_coupon_v1(coupon,2,rules);
 result:=public.pdv_set_pending_order_coupon_v1(quote_order,terminal,session_id,account,coupon,2000,1);
 IF (result->>'total')::numeric<>70 OR (result->>'revision')::integer<>2 THEN RAISE EXCEPTION 'Reaplicar cupom alterou total/revisão'; END IF;
 blocked:=false; BEGIN
  PERFORM public.pdv_cover_existing_order_coupon_v1(quote_order,terminal,session_id,account,jsonb_build_array(jsonb_build_object('method','dinheiro','amount',70)),'coupon-stale-cover-1',0);
 EXCEPTION WHEN serialization_failure THEN blocked:=true; END;
 IF NOT blocked OR EXISTS(SELECT 1 FROM public.pdv_coupon_usages WHERE coupon_id=coupon) THEN RAISE EXCEPTION 'Pagamento antigo ignorou revisão de cupom com mesmo total'; END IF;
 blocked:=false; BEGIN PERFORM public.pdv_get_pending_order_coupon_v1(quote_order,gen_random_uuid(),session_id,account); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Outro terminal leu cupom do pedido'; END IF;
 UPDATE public.company_settings SET pdv_mode='simples' WHERE company_id=c;
 cart:=jsonb_build_object('items',jsonb_build_array(jsonb_build_object('inventory_id',a,'stock_id',stock,'quantity',1,'unit_price',50,'discount_amount',0),jsonb_build_object('inventory_id',b,'stock_id',stock,'quantity',1,'unit_price',50,'discount_amount',0)),'order_discount_amount',10,'coupon_id',coupon,'coupon_discount_cents',2000);
 SELECT count(*) INTO before_orders FROM public.pdv_orders WHERE company_id=c;
 blocked:=false; BEGIN
  PERFORM public.pdv_complete_direct_sale_v2(terminal,session_id,account,customer,cart,jsonb_build_array(jsonb_build_object('method','dinheiro','amount',71)),'coupon-invalid-payment-1');
 EXCEPTION WHEN check_violation THEN blocked:=true; END;
 IF NOT blocked OR EXISTS(SELECT 1 FROM public.pdv_coupon_usages WHERE coupon_id=coupon) OR (SELECT count(*) FROM public.pdv_orders WHERE company_id=c)<>before_orders THEN RAISE EXCEPTION 'Falha financeira deixou pedido/uso parcial'; END IF;
 result:=public.pdv_complete_direct_sale_v2(terminal,session_id,account,customer,cart,jsonb_build_array(jsonb_build_object('method','dinheiro','amount',70)),'coupon-direct-exemplo-1');
 v_order_id:=(result->>'order_id')::uuid;
 IF (result->>'total')::numeric<>70 OR (SELECT count(*) FROM public.pdv_coupon_usages WHERE coupon_id=coupon)<>1 THEN RAISE EXCEPTION 'Total/uso confirmado divergente'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pdv_order_items WHERE order_id=v_order_id AND inventory_id=a AND total=25 AND coupon_discount_amount_v1=20 AND discount_amount=25 AND order_discount_allocated_v2=25)
 OR NOT EXISTS(SELECT 1 FROM public.pdv_order_items WHERE order_id=v_order_id AND inventory_id=b AND total=45 AND coupon_discount_amount_v1=0 AND discount_amount=5) THEN RAISE EXCEPTION 'Rateio promocional contaminou item inelegível'; END IF;
 replay:=public.pdv_complete_direct_sale_v2(terminal,session_id,account,customer,cart,jsonb_build_array(jsonb_build_object('method','dinheiro','amount',70)),'coupon-direct-exemplo-1');
 IF (replay->>'order_id')::uuid<>v_order_id OR (SELECT count(*) FROM public.pdv_coupon_usages WHERE coupon_id=coupon)<>1 THEN RAISE EXCEPTION 'Replay duplicou utilização'; END IF;
 IF (public.pdv_evaluate_coupon_v1(coupon,customer,items)->>'reason')<>'usage_limit' THEN RAISE EXCEPTION 'Última utilização não foi consumida'; END IF;
 -- Snapshot da entrega e devolução usam 25 líquidos, nunca os 50 de tabela.
 SELECT di.id INTO delivery_item FROM public.pdv_delivery_items di JOIN public.pdv_order_items oi ON oi.id=di.order_item_id WHERE oi.order_id=v_order_id AND oi.inventory_id=a;
 IF (SELECT commercial_amount_snapshot FROM public.pdv_delivery_items WHERE id=delivery_item)<>25 THEN RAISE EXCEPTION 'Entrega recuperou preço cheio após cupom'; END IF;
 return_result:=public.pdv_return_delivery_items_v2(v_order_id,jsonb_build_array(jsonb_build_object('delivery_item_id',delivery_item,'quantity',1,'destination','saleable','destination_stock_id',stock)),jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',25)),public.company_today(c),'Devolução de exemplo','coupon-return-exemplo-1');
 IF (return_result->>'commercial_total')::numeric<>-25 OR (return_result->>'cmv_total')::numeric<>-10 THEN RAISE EXCEPTION 'Devolução inflou receita/CMV'; END IF;
 IF (SELECT count(*) FROM public.pdv_coupon_usages WHERE coupon_id=coupon)<>1 THEN RAISE EXCEPTION 'Devolução reciclou uso promocional'; END IF;
 -- Relatórios operacionais leem o mesmo líquido persistido, não preço de tabela.
 -- A conserva apenas a venda legada50 após devolver os25 promocionais; B45.
 IF NOT EXISTS(SELECT 1 FROM public.get_inventory_abc_report(public.company_today(c),public.company_today(c),ARRAY[stock]) r WHERE r.inventory_id=a AND r.pdv_quantity=1 AND r.pdv_revenue=50 AND r.pdv_cost=10)
 OR NOT EXISTS(SELECT 1 FROM public.get_inventory_abc_report(public.company_today(c),public.company_today(c),ARRAY[stock]) r WHERE r.inventory_id=b AND r.pdv_quantity=1 AND r.pdv_revenue=45 AND r.pdv_cost=10) THEN RAISE EXCEPTION 'ABC perdeu o líquido do cupom ou a devolução'; END IF;
 preview:=public.get_material_purchase_report_v2(p_start_date=>public.company_today(c),p_end_date=>public.company_today(c),p_stock_ids=>ARRAY[stock]);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'rows') r WHERE r->>'inventory_id'=a::text AND (r->>'net_sold_quantity')::numeric=1 AND (r->>'net_revenue')::numeric=50)
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'rows') r WHERE r->>'inventory_id'=b::text AND (r->>'net_sold_quantity')::numeric=1 AND (r->>'net_revenue')::numeric=45) THEN RAISE EXCEPTION 'Compras e vendas perdeu o líquido do cupom ou a devolução'; END IF;

 -- Expiração/desativação afetam novas intenções sem mudar história/replay.
 rules:=rules||jsonb_build_object('is_active',false); PERFORM public.pdv_save_coupon_v1(coupon,3,rules);
 IF NOT EXISTS(SELECT 1 FROM public.pdv_coupon_usages WHERE order_id=v_order_id AND rules_snapshot->>'code'='EXEMPLO20' AND discount_cents=2000) THEN RAISE EXCEPTION 'Alteração do cupom reescreveu histórico'; END IF;
 IF (public.pdv_evaluate_coupon_v1(coupon,customer,items)->>'reason')<>'inactive' THEN RAISE EXCEPTION 'Cupom inativo foi aceito'; END IF;
 IF has_function_privilege('authenticated','public.pdv_commit_coupon_internal_v1(uuid,uuid,jsonb,bigint)','EXECUTE') OR has_function_privilege('anon','public.pdv_save_coupon_v1(uuid,integer,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'ACL do cupom expôs escrita interna'; END IF;
END $coupons$;
ROLLBACK;

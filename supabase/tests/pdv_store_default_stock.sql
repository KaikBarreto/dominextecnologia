-- Padrão Loja separado de OS, herança persistida, CAS e operações reais.
-- Prova serial/rollback; não substitui a corrida de duas conexões do root.
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $behavior$
<<fixture>>
DECLARE
 c uuid:='f4161600-0000-4000-8000-000000000001'; admin_actor uuid:='f4161600-0000-4000-8000-000000000002'; manager_actor uuid:='f4161600-0000-4000-8000-000000000003'; nobody uuid:='f4161600-0000-4000-8000-000000000004';
 cx uuid:='f4161600-0000-4000-8000-000000000005'; local_b uuid:='f4161600-0000-4000-8000-000000000006'; customer uuid:='f4161600-0000-4000-8000-000000000007'; client_stock uuid:='f4161600-0000-4000-8000-000000000008'; material uuid:='f4161600-0000-4000-8000-000000000009'; supplier uuid:='f4161600-0000-4000-8000-000000000010';
 original_stock uuid; foreign_stock uuid; legacy uuid; inherited uuid; override_box uuid; cash uuid; session_id uuid; preorder uuid:=gen_random_uuid(); sale_preorder uuid:=gen_random_uuid(); buy_request uuid:=gen_random_uuid(); category uuid; sale_order uuid;
 dto jsonb; result jsonb; return_lines jsonb; sale jsonb; purchase jsonb; before_flags jsonb; revision bigint; old_revision bigint; counted numeric; blocked boolean; detail text;
BEGIN
 IF EXISTS(SELECT 1 FROM public.companies WHERE id IN(c,cx)) OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(admin_actor,manager_actor,nobody)) THEN RAISE EXCEPTION 'IDs fictícios já existem';END IF;
 SELECT jsonb_agg(to_jsonb(f) ORDER BY f.key) INTO before_flags FROM public.app_feature_flags f;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
 FROM (VALUES(admin_actor,'store-stock-admin@example.invalid'),(manager_actor,'store-stock-manager@example.invalid'),(nobody,'store-stock-nobody@example.invalid')) actor(id,email);
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Loja padrão fictícia','active'),(cx,'Outro tenant fictício','active');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(admin_actor,manager_actor,nobody);
 INSERT INTO public.user_roles(user_id,role) VALUES(admin_actor,'admin');
 -- Conversão exige concessão explícita mesmo para o administrador fictício.
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(admin_actor,'["*"]',true),(manager_actor,'["screen:pdv_settings","fn:manage_pdv_settings"]',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_actor,'role','authenticated')::text,true);
 SELECT id INTO original_stock FROM public.stocks WHERE company_id=c AND customer_id IS NULL AND is_default;
 SELECT id INTO foreign_stock FROM public.stocks WHERE company_id=cx AND customer_id IS NULL AND is_default;
 INSERT INTO public.stocks(id,company_id,name,purpose,is_default) VALUES(local_b,c,'Loja B fictícia','operacional',false);
 INSERT INTO public.customers(id,company_id,name,is_deleted) VALUES(customer,c,'Cliente fictício',false);
 INSERT INTO public.stocks(id,company_id,customer_id,name,purpose,is_default) VALUES(client_stock,c,customer,'Cliente segregado fictício','operacional',false);
 -- Com dois locais a ativação pede escolha; não usa o principal da OS.
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv');
 -- Cadastro anterior mantém escolha específica, não inferida por igualdade.
 INSERT INTO public.pdv_terminals(company_id,name,stock_id,is_active,sort_order) VALUES(c,'Caixa legado fictício',original_stock,true,0) RETURNING id INTO legacy;
 EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.pdv_ensure_setup();EXECUTE 'RESET ROLE';
 SELECT pdv_cash_account_id,pdv_stock_settings_revision INTO cash,revision FROM public.company_settings WHERE company_id=c;
 IF NOT EXISTS(SELECT 1 FROM public.company_settings WHERE company_id=c AND pdv_default_stock_id=original_stock) OR NOT EXISTS(SELECT 1 FROM public.pdv_terminals WHERE id=legacy AND stock_binding_mode='specific' AND stock_id=original_stock) THEN RAISE EXCEPTION 'Bootstrap alterou o vínculo legado ou não inicializou padrão unívoco';END IF;
 -- Sem papel e sem registro não existe fallback de gestão.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',nobody,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 IF public.pdv_can_manage_stock_v3(c) THEN RAISE EXCEPTION 'Usuário sem registro ganhou gestão de estoque';END IF;
 blocked:=false;BEGIN PERFORM public.pdv_set_store_stock_v1(local_b,revision);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Usuário sem concessão alterou o padrão';END IF;EXECUTE 'RESET ROLE';
 -- Gestor apenas de PDV escolhe local existente, mas não cria estoque.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager_actor,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 dto:=public.pdv_list_cash_terminal_settings_v2();
 IF (dto#>>'{store_stock,can_manage}')::boolean IS DISTINCT FROM TRUE OR (dto#>>'{store_stock,can_create_stock}')::boolean IS DISTINCT FROM FALSE THEN RAISE EXCEPTION 'Capacidades de gerir PDV/criar local foram confundidas';END IF;
 blocked:=false;BEGIN PERFORM public.pdv_create_store_stock_v1('Local indevido',revision);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Gestão de PDV sozinha criou estoque';END IF;
 old_revision:=revision;result:=public.pdv_set_store_stock_v1(local_b,revision);revision:=(result->>'revision')::bigint;
 IF result->>'stock_id'<>local_b::text OR revision<>old_revision+1 THEN RAISE EXCEPTION 'Padrão não confirmou revisão canônica';END IF;
 blocked:=false;BEGIN PERFORM public.pdv_set_store_stock_v1(original_stock,old_revision);EXCEPTION WHEN serialization_failure THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Configuração obsoleta sobrescreveu o padrão';END IF;
 blocked:=false;BEGIN PERFORM public.pdv_set_store_stock_v1(client_stock,revision);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Estoque de cliente virou padrão';END IF;
 blocked:=false;BEGIN PERFORM public.pdv_set_store_stock_v1(foreign_stock,revision);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Outro tenant virou padrão';END IF;
 result:=public.pdv_save_cash_terminal_v3(NULL,'Caixa herdado fictício',NULL,true,1,'store_default');inherited:=(result->>'id')::uuid;
 result:=public.pdv_save_cash_terminal_v2(NULL,'Caixa específico fictício',local_b,true,2);override_box:=(result->>'id')::uuid;
 EXECUTE 'RESET ROLE';
 IF NOT EXISTS(SELECT 1 FROM public.stocks WHERE id=original_stock AND is_default) OR EXISTS(SELECT 1 FROM public.stocks WHERE id=local_b AND is_default) OR NOT EXISTS(SELECT 1 FROM public.pdv_terminals WHERE id=legacy AND stock_id=original_stock AND stock_binding_mode='specific') OR NOT EXISTS(SELECT 1 FROM public.pdv_terminals WHERE id=inherited AND stock_id=local_b AND stock_binding_mode='store_default') OR NOT EXISTS(SELECT 1 FROM public.pdv_terminals WHERE id=override_box AND stock_id=local_b AND stock_binding_mode='specific') THEN RAISE EXCEPTION 'Herança/override alterou principal OS ou bindings antigos';END IF;
 -- Orçamento em edição já direcionado é pendência; orçamento pessoal sem
 -- terminal permanece fora do bloqueio (não há seleção arbitrária do local).
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_actor,'role','authenticated')::text,true);
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price,is_sellable) VALUES(material,c,'FIX-STORE-1600','Mercadoria fictícia','un',5,2,10,true);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,material,original_stock,5,true),(c,material,local_b,10,true) ON CONFLICT(inventory_id,stock_id) DO UPDATE SET quantity=excluded.quantity,is_present=excluded.is_present;
 INSERT INTO public.suppliers(id,company_id,name) VALUES(supplier,c,'Fornecedor fictício');
 SELECT id INTO category FROM public.financial_categories WHERE company_id=c AND type='saida' AND is_active ORDER BY id LIMIT 1;
 IF category IS NULL THEN RAISE EXCEPTION 'Fixture comum não recebeu categoria de saída';END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM public.pdv_save_workflow_settings_v3('balcao','cashier');
 PERFORM public.pdv_save_preorder_v2(preorder,0,jsonb_build_object('stock_id',local_b,'operation_mode','counter','discount_amount',0),jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'inventory_id',material,'item_type','material','description','Mercadoria fictícia','quantity',1,'unit_price',10,'discount_amount',0,'unit_factor',1,'sort_order',0)),'store1600-pre-save');
 PERFORM public.pdv_assign_preorder_terminal_v3(preorder,1,inherited,'store1600-pre-target');
 blocked:=false;BEGIN PERFORM public.pdv_set_store_stock_v1(original_stock,revision);EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;blocked:=detail LIKE '%pdv_store_stock_busy%';END;
 IF NOT blocked THEN RAISE EXCEPTION 'Padrão moveu caixa com orçamento direcionado';END IF;
 PERFORM public.pdv_cancel_preorder_v2(preorder,2,'store1600-pre-cancel');
 -- Venda e compra reais usam o mesmo stock_id efetivo persistido do caixa.
 result:=public.pdv_open_cash_session_v2(inherited,cash,0,'store1600-open');session_id:=(result->>'session_id')::uuid;
 PERFORM public.pdv_save_preorder_v2(sale_preorder,0,jsonb_build_object('stock_id',local_b,'customer_id',customer,'operation_mode','counter','discount_amount',0),jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'inventory_id',material,'item_type','material','description','Venda fictícia','quantity',2,'unit_price',10,'discount_amount',0,'unit_factor',1,'sort_order',0)),'store1600-sale-save');
 PERFORM public.pdv_assign_preorder_terminal_v3(sale_preorder,1,inherited,'store1600-sale-target');
 PERFORM public.pdv_forward_preorder_v2(sale_preorder,2,'store1600-sale-forward');
 sale:=public.pdv_convert_preorder_v2(sale_preorder,3,'store1600-sale-convert');sale_order:=(sale->>'order_id')::uuid;
 sale:=public.pdv_cover_existing_order_v2(sale_order,inherited,session_id,cash,jsonb_build_array(jsonb_build_object('method','dinheiro','amount',20)),'store1600-sale');
 purchase:=public.pdv_registrar_compra_material_direta_v2(session_id,inherited,buy_request,local_b,supplier,jsonb_build_array(jsonb_build_object('inventory_id',material,'quantity',1,'unit_price',2)),public.company_today(c),cash,category,true,public.company_today(c),NULL,'dinheiro','Compra fictícia',NULL);
 blocked:=false;BEGIN PERFORM public.pdv_set_store_stock_v1(original_stock,revision);EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Mudança de padrão aceitou sessão aberta';END IF;
 blocked:=false;BEGIN PERFORM public.pdv_save_cash_terminal_v3(inherited,'Caixa herdado fictício',local_b,true,1,'specific');EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Mudança de modo aceitou sessão aberta';END IF;
 blocked:=false;BEGIN PERFORM public.pdv_get_purchase_cash_context_v2(session_id,inherited,original_stock);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Compra aceitou local sugerido pelo cliente fora do caixa';END IF;
 EXECUTE 'RESET ROLE';sale_order:=(sale->>'order_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.pdv_orders WHERE id=sale_order AND stock_id=local_b AND terminal_id=inherited AND cash_session_id=fixture.session_id) OR NOT EXISTS(SELECT 1 FROM public.compras WHERE client_request_id=buy_request AND company_id=c AND stock_id=local_b AND terminal_id=inherited AND cash_session_id=fixture.session_id) OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=local_b)<>9 OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=original_stock)<>5 THEN RAISE EXCEPTION 'Venda/compra não preservaram o mesmo estoque e os saldos';END IF;
 SELECT COALESCE(sum(amount),0) INTO counted FROM public.pdv_cash_custody_entries custody WHERE custody.session_id=fixture.session_id;
 EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.pdv_close_cash_session_v2(session_id,cash,counted,'Fechamento fictício','store1600-close');
 result:=public.pdv_set_store_stock_v1(original_stock,revision);revision:=(result->>'revision')::bigint;EXECUTE 'RESET ROLE';
 IF NOT EXISTS(SELECT 1 FROM public.pdv_terminals WHERE id=inherited AND stock_id=original_stock AND stock_binding_mode='store_default') OR NOT EXISTS(SELECT 1 FROM public.pdv_terminals WHERE id=override_box AND stock_id=local_b AND stock_binding_mode='specific') OR NOT EXISTS(SELECT 1 FROM public.compras WHERE client_request_id=buy_request AND stock_id=local_b) OR NOT EXISTS(SELECT 1 FROM public.pdv_orders WHERE id=sale_order AND stock_id=local_b) THEN RAISE EXCEPTION 'Herança moveu histórico ou sobrescreveu override';END IF;
 -- Pós-venda do pedido histórico continua no local original depois da troca
 -- do padrão; o terminal atual já usa outro estoque, sem reescrever a venda.
 SELECT jsonb_agg(jsonb_build_object('delivery_item_id',di.id,'quantity',1,'destination','saleable','destination_stock_id',local_b)) INTO return_lines FROM public.pdv_delivery_items di JOIN public.pdv_deliveries d ON d.id=di.delivery_id WHERE d.order_id=sale_order;
 EXECUTE 'SET LOCAL ROLE authenticated';
 result:=public.pdv_return_delivery_items_v2(sale_order,return_lines,jsonb_build_array(jsonb_build_object('kind','customer_credit','amount',10)),public.company_today(c),'Devolução após mudar padrão','store1600-return-history');EXECUTE 'RESET ROLE';
 IF NOT EXISTS(SELECT 1 FROM public.pdv_commercial_returns WHERE id=(result->>'return_id')::uuid AND order_id=sale_order) OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=local_b)<>10 OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=original_stock)<>5 THEN RAISE EXCEPTION 'Pós-venda perdeu estoque original após mudança de padrão';END IF;
 -- Padrão A oculto e caixa B permitido são um estado legítimo de configuração.
 EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.set_stock_access(original_stock,true,ARRAY[admin_actor]);EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager_actor,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 dto:=public.pdv_list_cash_terminal_settings_v2();
 IF dto#>>'{store_stock,stock_id}' IS NOT NULL OR (dto#>>'{store_stock,default_unavailable}')::boolean IS DISTINCT FROM TRUE OR EXISTS(SELECT 1 FROM jsonb_array_elements(dto->'terminals') t WHERE t->>'stock_id'=original_stock::text) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(dto->'terminals') t WHERE t->>'id'=override_box::text) THEN RAISE EXCEPTION 'Configuração expôs padrão oculto ou derrubou caixa específico autorizado';END IF;
 result:=public.pdv_save_cash_terminal_v3(override_box,'Caixa B autorizado',local_b,true,2,'specific');
 IF result->>'stock_id'<>local_b::text THEN RAISE EXCEPTION 'Caixa específico B passou a depender de padrão inacessível';END IF;
 blocked:=false;BEGIN PERFORM public.pdv_save_cash_terminal_v3(NULL,'Herança indevida',NULL,true,3,'store_default');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Herança expôs estoque inacessível';END IF;EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_actor,'role','authenticated')::text,true);
 -- Remoção direta do padrão não contorna RPC/revisão, mesmo sem inherited.
 BEGIN
  UPDATE public.pdv_terminals SET stock_binding_mode='specific' WHERE id=inherited;
  blocked:=false;BEGIN UPDATE public.company_settings SET pdv_default_stock_id=NULL WHERE company_id=c;EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'UPDATE direto limpou padrão sem revisão';END IF;
  RAISE EXCEPTION 'rollback_direct_null' USING ERRCODE='P1601';
 EXCEPTION WHEN SQLSTATE 'P1601' THEN NULL;END;
 IF (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.key) FROM public.app_feature_flags f) IS DISTINCT FROM before_flags THEN RAISE EXCEPTION 'Configuração alterou rollout';END IF;
 IF has_function_privilege('authenticated','public.pdv_save_cash_terminal_base_016_v2(uuid,text,uuid,boolean,integer)','EXECUTE') OR has_function_privilege('anon','public.pdv_set_store_stock_v1(uuid,bigint)','EXECUTE') THEN RAISE EXCEPTION 'Core privilegiado ou configuração exposta';END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
END $behavior$;
ROLLBACK;

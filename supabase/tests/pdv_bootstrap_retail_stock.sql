-- Loja comum: setup não duplica estrutura nem movimenta estoque; o mesmo local
-- aparece no catálogo e atende uma venda real de operador sem OS/Estoque/admin.
-- RED na fonte anterior: venda funciona, mas catálogo omite o saldo do local.
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $behavior$
DECLARE
 c uuid:='f4161500-0000-4000-8000-000000000001'; admin_actor uuid:='f4161500-0000-4000-8000-000000000002'; operator_actor uuid:='f4161500-0000-4000-8000-000000000003';
 cx uuid:='f4161500-0000-4000-8000-000000000004'; customer uuid:='f4161500-0000-4000-8000-000000000005';
 warehouse uuid:='f4161500-0000-4000-8000-000000000006'; customer_stock uuid:='f4161500-0000-4000-8000-000000000007';
 material uuid:='f4161500-0000-4000-8000-000000000008'; other_material uuid:='f4161500-0000-4000-8000-000000000009';
 primary_stock uuid; foreign_stock uuid; terminal uuid; cash uuid; session_id uuid; sale_order uuid;
 setup_result jsonb; retry_result jsonb; catalog jsonb; capability jsonb; sale_result jsonb; replay jsonb;
 flags_before jsonb; inventory_before jsonb; inventory_after jsonb; catalog_has_primary boolean; background_has_retail boolean; denied boolean;
 stocks_before integer; materials_before integer; order_count integer; movement_count integer;
BEGIN
 IF EXISTS(SELECT 1 FROM public.companies WHERE id IN(c,cx)) OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(admin_actor,operator_actor)) THEN RAISE EXCEPTION 'IDs da fixture já existem';END IF;
 SELECT jsonb_agg(to_jsonb(f) ORDER BY f.key) INTO flags_before FROM public.app_feature_flags f;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
 FROM (VALUES(admin_actor,'bootstrap-retail-admin@example.invalid'),(operator_actor,'bootstrap-retail-operator@example.invalid')) actor(id,email);
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Loja comum fictícia','active'),(cx,'Outra empresa fictícia','active');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(admin_actor,operator_actor);
 INSERT INTO public.user_roles(user_id,role) VALUES(admin_actor,'admin');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(operator_actor,'["screen:pdv","fn:complete_direct_sale"]',true);
 IF public.is_admin_or_gestor(operator_actor) OR public.is_super_admin(operator_actor) OR public.user_has_permission(operator_actor,'screen:inventory') OR public.user_has_permission(operator_actor,'screen:service_orders') THEN RAISE EXCEPTION 'Operador de prova recebeu bypass ou acesso fora do PDV';END IF;
 SELECT s.id INTO primary_stock FROM public.stocks s WHERE s.company_id=c AND s.customer_id IS NULL AND s.is_default ORDER BY s.sort_order,s.id LIMIT 1;
 SELECT s.id INTO foreign_stock FROM public.stocks s WHERE s.company_id=cx AND s.customer_id IS NULL AND s.is_default ORDER BY s.sort_order,s.id LIMIT 1;
 IF primary_stock IS NULL OR foreign_stock IS NULL OR NOT EXISTS(SELECT 1 FROM public.stocks s WHERE s.id=primary_stock AND s.purpose='operacional') THEN RAISE EXCEPTION 'Empresa comum não nasceu com estoque padrão operacional';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_actor,'role','authenticated')::text,true);
 INSERT INTO public.customers(id,company_id,name,is_deleted) VALUES(customer,c,'Cliente segregado fictício',false);
 INSERT INTO public.stocks(id,company_id,customer_id,name,is_default,purpose) VALUES(customer_stock,c,customer,'Estoque do cliente fictício',false,'operacional');
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price,is_sellable) VALUES(material,c,'FIX-BOOT-RETAIL','Mercadoria fictícia','un',10,2,10,true),(other_material,cx,'FIX-BOOT-OTHER','Mercadoria de outro tenant','un',7,3,12,true);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,material,primary_stock,10,true),(cx,other_material,foreign_stock,7,true)
 ON CONFLICT(inventory_id,stock_id) DO UPDATE SET quantity=excluded.quantity,is_present=excluded.is_present;
 -- Ativação usa o bootstrap real em background; repetição pública usa a sessão
 -- de um administrador comum, sem service_role, canary ou alteração de flags.
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv');
 SELECT EXISTS(SELECT 1 FROM public.stocks s WHERE s.id=primary_stock AND s.purpose='pdv') INTO background_has_retail;
 -- Um local geral no primeiro uso dispensa decisão extra. O depósito secundário
 -- nasce depois; casos inicialmente ambíguos são cobertos pela fixture de padrão.
 INSERT INTO public.stocks(id,company_id,customer_id,name,is_default,purpose) VALUES(warehouse,c,NULL,'Depósito secundário fictício',false,'operacional');
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,material,warehouse,4,true)
 ON CONFLICT(inventory_id,stock_id) DO UPDATE SET quantity=excluded.quantity,is_present=excluded.is_present;
 SELECT count(*) INTO stocks_before FROM public.stocks WHERE company_id=c;
 SELECT count(*) INTO materials_before FROM public.inventory WHERE company_id=c;
 SELECT jsonb_agg(jsonb_build_object('inventory_id',l.inventory_id,'stock_id',l.stock_id,'quantity',l.quantity,'present',l.is_present) ORDER BY l.inventory_id,l.stock_id) INTO inventory_before FROM public.inventory_stock_levels l WHERE l.company_id=c;

 -- Simula metadado de loja já configurada antes da correção: o setup público
 -- também precisa reparar o vínculo existente sem trocar estoque/terminal.
 IF to_regprocedure('public.guard_stock_location_metadata_v1()') IS NULL THEN
  UPDATE public.stocks SET purpose='operacional' WHERE id=primary_stock;
 ELSE
  denied:=false;
  BEGIN UPDATE public.stocks SET purpose='operacional' WHERE id=primary_stock;
  EXCEPTION WHEN check_violation THEN denied:=true;END;
  IF NOT denied THEN RAISE EXCEPTION 'Local vinculado ao caixa pôde sumir do catálogo da loja';END IF;
 END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_actor,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 setup_result:=public.pdv_ensure_setup();retry_result:=public.pdv_ensure_setup();EXECUTE 'RESET ROLE';
 IF EXISTS(SELECT 1 FROM public.company_modules WHERE company_id=c AND module_code<>'pdv') OR setup_result->>'configured'<>'true' OR retry_result->>'configured'<>'true' OR (retry_result->>'terminal_created')::boolean OR (SELECT count(*) FROM public.pdv_terminals WHERE company_id=c)<>1 OR (SELECT count(*) FROM public.stocks WHERE company_id=c)<>stocks_before OR (SELECT count(*) FROM public.inventory WHERE company_id=c)<>materials_before THEN RAISE EXCEPTION 'Setup/retry duplicou a estrutura da loja';END IF;
 SELECT jsonb_agg(jsonb_build_object('inventory_id',l.inventory_id,'stock_id',l.stock_id,'quantity',l.quantity,'present',l.is_present) ORDER BY l.inventory_id,l.stock_id) INTO inventory_after FROM public.inventory_stock_levels l WHERE l.company_id=c;
 IF inventory_after IS DISTINCT FROM inventory_before OR EXISTS(SELECT 1 FROM public.stocks s WHERE s.id IN(warehouse,customer_stock,foreign_stock) AND s.purpose IS DISTINCT FROM 'operacional') OR NOT EXISTS(SELECT 1 FROM public.stocks s WHERE s.id=primary_stock AND s.company_id=c AND s.customer_id IS NULL AND s.is_default) THEN RAISE EXCEPTION 'Setup alterou saldo, cliente, local não utilizado ou default';END IF;
 SELECT t.id INTO terminal FROM public.pdv_terminals t WHERE t.company_id=c AND t.is_active AND t.stock_id=primary_stock;
 SELECT settings.pdv_cash_account_id INTO cash FROM public.company_settings settings WHERE settings.company_id=c;
 IF terminal IS NULL OR cash IS NULL THEN RAISE EXCEPTION 'Setup não vinculou o primeiro caixa ao estoque original';END IF;
 IF has_function_privilege('authenticated','public.pdv_bootstrap_company(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Bootstrap privilegiado exposto diretamente ao operador';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',operator_actor,'role','authenticated')::text,true);EXECUTE 'SET LOCAL ROLE authenticated';
 denied:=false;BEGIN PERFORM public.pdv_ensure_setup();EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Operador sem administração configurou a empresa';END IF;
 capability:=public.pdv_get_direct_sale_capability_v2();catalog:=public.pdv_get_direct_sale_catalog_v3();
 IF capability->>'enabled'<>'true' THEN RAISE EXCEPTION 'Empresa comum ativa não recebeu capacidade PDV canônica';END IF;
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'materials') m CROSS JOIN LATERAL jsonb_array_elements(m->'available_by_stock') stock WHERE m->>'id'=material::text AND stock->>'stock_id'=primary_stock::text AND (stock->>'available_quantity')::numeric=10 AND (stock->>'has_conflict')::boolean IS FALSE) INTO catalog_has_primary;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'materials') m WHERE m->>'id'=other_material::text) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'terminals') t WHERE t->>'id'=terminal::text AND t->>'stock_id'=primary_stock::text) THEN RAISE EXCEPTION 'Catálogo vazou tenant ou perdeu o terminal original';END IF;
 sale_result:=public.pdv_open_cash_session_v2(terminal,cash,0,'bootstrap-retail-open');session_id:=(sale_result->>'session_id')::uuid;
 sale_result:=public.pdv_complete_direct_sale_rollout_v2(terminal,session_id,cash,NULL,jsonb_build_array(jsonb_build_object('inventory_id',material,'stock_id',primary_stock,'quantity',2)),jsonb_build_array(jsonb_build_object('method','dinheiro','amount',20)),'bootstrap-retail-sale');
 replay:=public.pdv_complete_direct_sale_rollout_v2(terminal,session_id,cash,NULL,jsonb_build_array(jsonb_build_object('inventory_id',material,'stock_id',primary_stock,'quantity',2)),jsonb_build_array(jsonb_build_object('method','dinheiro','amount',20)),'bootstrap-retail-sale');
 EXECUTE 'RESET ROLE';sale_order:=(sale_result->>'order_id')::uuid;
 IF sale_order IS NULL OR replay->>'order_id'<>sale_result->>'order_id' OR replay->>'idempotent'<>'true' OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=primary_stock)<>8 OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=warehouse)<>4 OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=other_material AND stock_id=foreign_stock)<>7 OR (SELECT count(*) FROM public.pdv_deliveries WHERE order_id=sale_order)<>1 OR (SELECT COALESCE(sum(di.quantity*di.unit_cost_snapshot),0) FROM public.pdv_delivery_items di JOIN public.pdv_deliveries d ON d.id=di.delivery_id WHERE d.order_id=sale_order)<>4 THEN RAISE EXCEPTION 'Venda/replay não preservaram o mesmo local, quantidade ou custo';END IF;
 SELECT count(*) INTO order_count FROM public.pdv_orders WHERE company_id=c;SELECT count(*) INTO movement_count FROM public.inventory_movements WHERE company_id=c;
 -- Outra empresa e local sem ACL continuam negados; nunca se amplia a permissão.
 EXECUTE 'SET LOCAL ROLE authenticated';denied:=false;
 BEGIN PERFORM public.pdv_complete_direct_sale_rollout_v2(terminal,session_id,cash,NULL,jsonb_build_array(jsonb_build_object('inventory_id',other_material,'stock_id',foreign_stock,'quantity',1)),jsonb_build_array(jsonb_build_object('method','dinheiro','amount',12)),'bootstrap-retail-cross-tenant');EXCEPTION WHEN insufficient_privilege OR check_violation THEN denied:=true;END;
 IF NOT denied THEN RAISE EXCEPTION 'Venda aceitou local de outro tenant';END IF;EXECUTE 'RESET ROLE';
 BEGIN
  INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(c,primary_stock,admin_actor);
  EXECUTE 'SET LOCAL ROLE authenticated';catalog:=public.pdv_get_direct_sale_catalog_v3();
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'terminals') t WHERE t->>'stock_id'=primary_stock::text) THEN RAISE EXCEPTION 'Catálogo ignorou ACL revogada do local';END IF;
  denied:=false;BEGIN PERFORM public.pdv_complete_direct_sale_rollout_v2(terminal,session_id,cash,NULL,jsonb_build_array(jsonb_build_object('inventory_id',material,'stock_id',primary_stock,'quantity',1)),jsonb_build_array(jsonb_build_object('method','dinheiro','amount',10)),'bootstrap-retail-stock-denied');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;
  IF NOT denied THEN RAISE EXCEPTION 'Venda ignorou ACL revogada do local';END IF;EXECUTE 'RESET ROLE';
  RAISE EXCEPTION 'rollback_stock_acl' USING ERRCODE='P1501';
 EXCEPTION WHEN SQLSTATE 'P1501' THEN NULL;END;
 IF (SELECT count(*) FROM public.pdv_orders WHERE company_id=c)<>order_count OR (SELECT count(*) FROM public.inventory_movements WHERE company_id=c)<>movement_count OR EXISTS(SELECT 1 FROM public.pdv_operation_requests WHERE company_id=c AND idempotency_key IN('bootstrap-retail-cross-tenant','bootstrap-retail-stock-denied')) OR (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.key) FROM public.app_feature_flags f) IS DISTINCT FROM flags_before THEN RAISE EXCEPTION 'Setup ou negativas alteraram flags/fatos fora do escopo';END IF;
 IF public.can_access_stock(admin_actor,primary_stock) IS DISTINCT FROM TRUE OR NOT EXISTS(SELECT 1 FROM public.stocks WHERE id=primary_stock AND customer_id IS NULL AND is_default) THEN RAISE EXCEPTION 'Loja retirou o local geral do uso operacional autorizado';END IF;
 -- Esta é a invariante RED/GREEN: o writer já consegue vender no local, mas a
 -- loja também precisa encontrar esse mesmo saldo no catálogo, sem RPC manual.
 IF background_has_retail IS DISTINCT FROM TRUE OR catalog_has_primary IS DISTINCT FROM TRUE OR NOT EXISTS(SELECT 1 FROM public.stocks WHERE id=primary_stock AND purpose='pdv') THEN RAISE EXCEPTION 'O primeiro caixa usa um estoque que o catálogo da loja não disponibiliza.' USING ERRCODE='23514',DETAIL='code=pdv_bootstrap_retail_catalog_missing';END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
END $behavior$;
ROLLBACK;

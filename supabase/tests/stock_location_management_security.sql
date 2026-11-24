-- Fixture real, somente tenants/usuários fictícios. Requer migrations 161500–170000.
-- Executar em sessão administrativa: as escritas sob teste usam ROLE authenticated.
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $behavior$
DECLARE
 c uuid:='f4161700-0000-4000-8000-000000000001'; foreign_c uuid:='f4161700-0000-4000-8000-000000000002';
 admin_actor uuid:='f4161700-0000-4000-8000-000000000003'; manager uuid:='f4161700-0000-4000-8000-000000000004';
 operator_actor uuid:='f4161700-0000-4000-8000-000000000005'; foreign_actor uuid:='f4161700-0000-4000-8000-000000000006';
 local_id uuid:='f4161700-0000-4000-8000-000000000007'; material uuid:='f4161700-0000-4000-8000-000000000008';
 history_id uuid:='f4161700-0000-4000-8000-000000000009'; unused_id uuid:='f4161700-0000-4000-8000-000000000010';
 primary_id uuid; foreign_id uuid; denied boolean; touched integer; snapshot jsonb; result jsonb; seed_claims text;
 long_customer uuid:='f4161700-0000-4000-8000-000000000011'; customer_inventory uuid;
 long_customer_name text:=repeat('Cliente de prova ',7);
BEGIN
 IF EXISTS(SELECT 1 FROM public.companies WHERE id IN(c,foreign_c)) OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(admin_actor,manager,operator_actor,foreign_actor)) THEN RAISE EXCEPTION 'IDs da fixture já existem'; END IF;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
 FROM (VALUES(admin_actor,'stock-admin@example.invalid'),(manager,'stock-manager@example.invalid'),(operator_actor,'stock-operator@example.invalid'),(foreign_actor,'stock-foreign@example.invalid')) actor(id,email);
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Empresa estoque fictícia','active'),(foreign_c,'Empresa externa fictícia','active');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(admin_actor,manager,operator_actor);
 UPDATE public.profiles SET company_id=foreign_c,is_active=true WHERE user_id=foreign_actor;
 INSERT INTO public.user_roles(user_id,role) VALUES(admin_actor,'admin');
 DELETE FROM public.user_permissions WHERE user_id IN(manager,operator_actor,foreign_actor);
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(manager,'["fn:manage_inventory"]',true);
 -- BASIC sem Loja continua administrável, sem fallback por permissão ausente.
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'basic') ON CONFLICT DO NOTHING;
 SELECT id INTO primary_id FROM public.stocks WHERE company_id=c AND customer_id IS NULL AND is_default;
 SELECT id INTO foreign_id FROM public.stocks WHERE company_id=foreign_c AND customer_id IS NULL AND is_default;
 -- O único geral existente fica oculto ao manager; ainda assim não se promove
 -- o próximo local como principal olhando apenas o subconjunto visível.
 INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(c,primary_id,admin_actor);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated')::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 IF public.pdv_can_manage_stock_v3(c) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Gestor explícito BASIC foi negado'; END IF;
 INSERT INTO public.stocks(id,company_id,name) VALUES(local_id,c,'  Local com saldo  '),(history_id,c,'Local com histórico'),(unused_id,c,'Local vazio');
 IF EXISTS(SELECT 1 FROM public.stocks WHERE id IN(local_id,history_id,unused_id) AND is_default) THEN RAISE EXCEPTION 'ACL oculta promoveu novo principal indevidamente'; END IF;
 UPDATE public.stocks SET name='Local editado' WHERE id=unused_id; GET DIAGNOSTICS touched=ROW_COUNT;
 IF touched<>1 THEN RAISE EXCEPTION 'Gestor explícito não editou local'; END IF;
 denied:=false; BEGIN INSERT INTO public.stocks(company_id,name,purpose) VALUES(c,'Loja indevida','pdv'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'BASIC sem PDV criou finalidade Loja'; END IF;
 denied:=false; BEGIN INSERT INTO public.stocks(company_id,name) VALUES(c,' '); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Nome vazio aceito'; END IF;
 denied:=false; BEGIN UPDATE public.stocks SET company_id=foreign_c WHERE id=unused_id; EXCEPTION WHEN check_violation OR insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Reclassificação de empresa aceita'; END IF;
 denied:=false; BEGIN INSERT INTO public.stocks(company_id,name) VALUES(foreign_c,'Invasão'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Escrita em outra empresa aceita'; END IF;
 denied:=false; BEGIN PERFORM public.set_stock_access(local_id,true,ARRAY[manager]); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Gestor funcional sem role administrativa configurou ACL'; END IF;
 denied:=false; BEGIN INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(c,local_id,manager); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Bypass direto de ACL aceito'; END IF;
 EXECUTE 'RESET ROLE';
 DELETE FROM public.stock_access WHERE stock_id=primary_id;
 -- Operador SEM registro de permissões: UPDATE/DELETE zero linhas e INSERT negado.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',operator_actor,'role','authenticated')::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 IF public.pdv_can_manage_stock_v3(c) IS DISTINCT FROM FALSE THEN RAISE EXCEPTION 'Ausência de permissões abriu gestão'; END IF;
 denied:=false; BEGIN INSERT INTO public.stocks(company_id,name) VALUES(c,'Operador indevido'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Operador criou local'; END IF;
 UPDATE public.stocks SET name='Operador editou' WHERE id=unused_id; GET DIAGNOSTICS touched=ROW_COUNT;
 IF touched<>0 THEN RAISE EXCEPTION 'Operador editou local'; END IF;
 DELETE FROM public.stocks WHERE id=unused_id; GET DIAGNOSTICS touched=ROW_COUNT;
 IF touched<>0 THEN RAISE EXCEPTION 'Operador excluiu local'; END IF;
 denied:=false; BEGIN PERFORM public.set_default_stock(unused_id); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Operador alterou principal por RPC'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_actor,'role','authenticated')::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 -- RPC legado real em BASIC-only, com administrador authenticated comum.
 -- O nome derivado do cliente continua integral e fora do catálogo geral.
 INSERT INTO public.customers(id,company_id,name,is_deleted) VALUES(long_customer,c,long_customer_name,false);
 customer_inventory:=public.create_customer_stock_item(long_customer,'Material do cliente fictício','FIX-LONG-CUSTOMER','un',0,0,1,NULL,'stock-security-long-customer');
 IF NOT EXISTS(SELECT 1 FROM public.stocks WHERE company_id=c AND customer_id=long_customer AND name='Estoque — '||long_customer_name AND length(name)>80)
 OR NOT EXISTS(SELECT 1 FROM public.inventory WHERE id=customer_inventory AND company_id=c AND customer_id=long_customer)
 OR EXISTS(SELECT 1 FROM public.get_accessible_inventory_ids() AS accessible(inventory_id) WHERE accessible.inventory_id=customer_inventory) THEN
  RAISE EXCEPTION 'Estoque de cliente com nome longo perdeu o contrato legado ou apareceu no catálogo geral';
 END IF;
 PERFORM public.set_stock_access(local_id,true,ARRAY[manager]); snapshot:=public.get_stock_access(local_id);
 denied:=false; BEGIN PERFORM public.set_stock_access(local_id,true,ARRAY[]::uuid[]); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied OR public.get_stock_access(local_id) IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'ACL vazia abriu local ou modificou restrição'; END IF;
 denied:=false; BEGIN PERFORM public.set_stock_access(local_id,true,ARRAY[foreign_actor]); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied OR public.get_stock_access(local_id) IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'ACL de outro tenant aceita ou destruiu restrição'; END IF;
 IF public.can_access_stock(admin_actor,local_id) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Administrador perdeu acesso à ACL restrita'; END IF;
 EXECUTE 'RESET ROLE';
 seed_claims:=current_setting('request.jwt.claims',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
 UPDATE public.profiles SET is_active=false WHERE user_id=manager;
 PERFORM set_config('request.jwt.claims',COALESCE(seed_claims,'{}'),true);
 EXECUTE 'SET LOCAL ROLE authenticated'; denied:=false;
 BEGIN PERFORM public.set_stock_access(local_id,true,ARRAY[manager]); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied OR public.get_stock_access(local_id) IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'ACL aceitou usuário inativo'; END IF;
 EXECUTE 'RESET ROLE'; seed_claims:=current_setting('request.jwt.claims',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
 UPDATE public.profiles SET is_active=true WHERE user_id=manager;
 PERFORM set_config('request.jwt.claims',COALESCE(seed_claims,'{}'),true);
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price) VALUES(material,c,'FIX-STOCK-SECURITY','Material fictício','un',0,1,2);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,material,local_id,5,true) ON CONFLICT(inventory_id,stock_id) DO UPDATE SET quantity=5;
 INSERT INTO public.inventory_movements(company_id,inventory_id,stock_id,movement_type,quantity,stock_before,stock_after,created_by) VALUES(c,material,history_id,'entrada',1,0,1,admin_actor);
 EXECUTE 'SET LOCAL ROLE authenticated'; denied:=false;
 BEGIN DELETE FROM public.stocks WHERE id=local_id; EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'DELETE apagou saldo por cascade'; END IF;
 denied:=false; BEGIN DELETE FROM public.stocks WHERE id=history_id; EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'DELETE apagou local com histórico'; END IF;
 PERFORM set_config('app.rollback_admin_company_creation','on',true);
 PERFORM set_config('app.pdv_purge_company',c::text,true);
 denied:=false; BEGIN DELETE FROM public.stocks WHERE id=primary_id; EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Marcador sem autorização apagou principal'; END IF;
 PERFORM set_config('app.rollback_admin_company_creation','',true);
 PERFORM set_config('app.pdv_purge_company','',true);
 DELETE FROM public.stocks WHERE id=unused_id; GET DIAGNOSTICS touched=ROW_COUNT;
 IF touched<>1 THEN RAISE EXCEPTION 'Local vazio sem uso não pôde ser excluído'; END IF;
 EXECUTE 'RESET ROLE';
 IF (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=material AND stock_id=local_id)<>5 OR NOT EXISTS(SELECT 1 FROM public.inventory_movements WHERE stock_id=history_id) OR NOT EXISTS(SELECT 1 FROM public.stocks WHERE id=foreign_id AND company_id=foreign_c) THEN RAISE EXCEPTION 'Negativas alteraram saldo/histórico/outro tenant'; END IF;
 -- PDV-only: mesma autorização explícita, sem exigir módulo BASIC.
 DELETE FROM public.company_modules WHERE company_id=c AND module_code='basic';
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv') ON CONFLICT DO NOTHING;
 -- A existência de vários gerais exige escolha explícita, sem promover o principal OS por acaso.
 PERFORM public.pdv_set_store_stock_v1(primary_id,(SELECT settings.pdv_stock_settings_revision FROM public.company_settings settings WHERE settings.company_id=c));
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated')::text,true); EXECUTE 'SET LOCAL ROLE authenticated';
 IF public.pdv_can_manage_stock_v3(c) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Gestor PDV-only foi negado'; END IF;
 INSERT INTO public.stocks(company_id,name,purpose) VALUES(c,'Local apenas Loja','pdv');
 denied:=false; BEGIN UPDATE public.stocks SET purpose='operacional' WHERE id=primary_id; EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Finalidade do caixa saiu do catálogo'; END IF;
 EXECUTE 'RESET ROLE';
 -- Perfil inativo e assinatura suspensa negam também o gestor explícito.
 seed_claims:=current_setting('request.jwt.claims',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
 UPDATE public.profiles SET is_active=false WHERE user_id=manager;
 PERFORM set_config('request.jwt.claims',COALESCE(seed_claims,'{}'),true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF public.pdv_can_manage_stock_v3(c) IS DISTINCT FROM FALSE THEN RAISE EXCEPTION 'Perfil inativo gerenciou locais'; END IF;
 EXECUTE 'RESET ROLE'; seed_claims:=current_setting('request.jwt.claims',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
 UPDATE public.profiles SET is_active=true WHERE user_id=manager;
 PERFORM set_config('request.jwt.claims',COALESCE(seed_claims,'{}'),true);
 UPDATE public.companies SET subscription_status='suspended' WHERE id=c;
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF public.pdv_can_manage_stock_v3(c) IS DISTINCT FROM FALSE THEN RAISE EXCEPTION 'Assinatura suspensa gerenciou locais'; END IF;
 EXECUTE 'RESET ROLE';
 SET CONSTRAINTS ALL IMMEDIATE;
END $behavior$;
ROLLBACK;

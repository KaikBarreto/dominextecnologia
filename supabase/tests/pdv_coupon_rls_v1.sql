-- Empresas e usuários exclusivamente fictícios; sem rollout, dados reais ou
-- chamadas externas. SET ROLE testa privilégios SQL além do JWT. Tudo reverte.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';

DO $setup$
DECLARE
 ca uuid:='c3170000-0000-4000-8000-000000000001'; cb uuid:='c3170000-0000-4000-8000-000000000002';
 ua uuid:='c3170000-0000-4000-8000-000000000011'; ub uuid:='c3170000-0000-4000-8000-000000000012'; op uuid:='c3170000-0000-4000-8000-000000000013';
BEGIN
 IF EXISTS(SELECT 1 FROM public.companies WHERE id IN(ca,cb)) OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(ua,ub,op)) THEN RAISE EXCEPTION 'IDs fictícios da fixture já existem'; END IF;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
 FROM (VALUES(ua,'coupon-rls-admin-a@example.invalid'),(ub,'coupon-rls-admin-b@example.invalid'),(op,'coupon-rls-operator-a@example.invalid')) fixture(id,email);
 INSERT INTO public.companies(id,name,subscription_status) VALUES(ca,'Empresa fictícia de cupons A','active'),(cb,'Empresa fictícia de cupons B','active');
 UPDATE public.profiles SET company_id=ca,is_active=true WHERE user_id IN(ua,op);
 UPDATE public.profiles SET company_id=cb,is_active=true WHERE user_id=ub;
 INSERT INTO public.user_roles(user_id,role) VALUES(ua,'admin'),(ub,'admin'),(op,'comercial');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(ua,'["*"]',true),(ub,'["*"]',true),(op,'["screen:pdv"]',true);
 INSERT INTO public.company_modules(company_id,module_code) VALUES(ca,'pdv'),(cb,'pdv');
 IF EXISTS(SELECT 1 FROM public.app_feature_flags WHERE ca=ANY(company_allowlist) OR cb=ANY(company_allowlist)) THEN RAISE EXCEPTION 'Fixture depende de coorte de rollout'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
END $setup$;

SET LOCAL ROLE authenticated;
DO $admin_a_rpc$
DECLARE r jsonb; cid uuid; denied boolean;
 rules jsonb:='{"code":"RLS_COUPON","name":"Cupom fictício A","kind":"fixed","value":10}';
BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Teste não assumiu papel authenticated'; END IF;
 r:=public.pdv_list_coupons_v1(true);
 IF r->'coupons'<>'[]'::jsonb THEN RAISE EXCEPTION 'Empresa fictícia nova recebeu cupons de outro tenant'; END IF;
 r:=public.pdv_save_coupon_v1(NULL,NULL,rules); cid:=(r->>'id')::uuid;
 IF (r->>'revision')::integer<>1 OR r->>'company_id'<>'c3170000-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'Criação RPC perdeu escopo/revisão'; END IF;
 r:=public.pdv_save_coupon_v1(cid,1,rules||'{"value":15,"name":"Cupom fictício A atualizado"}');
 IF (r->>'revision')::integer<>2 OR (r->>'value')::numeric<>15 THEN RAISE EXCEPTION 'Atualização RPC não confirmou CAS'; END IF;
 denied:=false; BEGIN PERFORM public.pdv_save_coupon_v1(cid,1,rules); EXCEPTION WHEN serialization_failure THEN denied:=true; END;
 IF NOT denied OR NOT EXISTS(SELECT 1 FROM public.pdv_coupons WHERE id=cid AND revision=2 AND value=15) THEN RAISE EXCEPTION 'CAS obsoleto alterou cupom'; END IF;
 PERFORM set_config('pdv.test.coupon_rls_a',cid::text,true);
END $admin_a_rpc$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"c3170000-0000-4000-8000-000000000012","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $admin_b_rpc$
DECLARE r jsonb;
BEGIN
 r:=public.pdv_list_coupons_v1(true);
 IF r->'coupons'<>'[]'::jsonb THEN RAISE EXCEPTION 'Administrador B leu cupom A'; END IF;
 -- O mesmo código é permitido em outra empresa.
 r:=public.pdv_save_coupon_v1(NULL,NULL,'{"code":"RLS_COUPON","name":"Cupom fictício B","kind":"fixed","value":10}');
 IF r->>'company_id'<>'c3170000-0000-4000-8000-000000000002' THEN RAISE EXCEPTION 'Cupom B foi criado em outro tenant'; END IF;
 PERFORM set_config('pdv.test.coupon_rls_b',r->>'id',true);
END $admin_b_rpc$;
RESET ROLE;

-- Apenas o owner prepara duas linhas de histórico para tornar a prova de RLS
-- observável. São snapshots fictícios em pedidos pendentes, sem pagamentos,
-- caixa, estoque, cliente ou fato financeiro; todos os registros serão revertidos.
DO $history_setup$
DECLARE ca uuid:='c3170000-0000-4000-8000-000000000001'; cb uuid:='c3170000-0000-4000-8000-000000000002';
 coa uuid:=current_setting('pdv.test.coupon_rls_a')::uuid; cob uuid:=current_setting('pdv.test.coupon_rls_b')::uuid;
BEGIN
 INSERT INTO public.pdv_orders(id,company_id,number,salesperson_id,status,subtotal,discount_amount,total,coupon_id,coupon_discount_amount_v1,contract_version,operation_mode_snapshot)
 VALUES('c3170000-0000-4000-8000-000000000051',ca,317001,'c3170000-0000-4000-8000-000000000011','aguardando_pagamento',100,10,90,coa,10,2,'direct'),
 ('c3170000-0000-4000-8000-000000000052',cb,317002,'c3170000-0000-4000-8000-000000000012','aguardando_pagamento',100,10,90,cob,10,2,'direct');
 INSERT INTO public.pdv_order_items(id,company_id,order_id,description,quantity,unit_price,unit_cost,discount_amount,total,item_type,unit_cost_v2,contract_version,gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2,coupon_discount_amount_v1)
 VALUES('c3170000-0000-4000-8000-000000000061',ca,'c3170000-0000-4000-8000-000000000051','Item fictício A',1,100,0,10,90,'service',0,2,100,0,10,10),
 ('c3170000-0000-4000-8000-000000000062',cb,'c3170000-0000-4000-8000-000000000052','Item fictício B',1,100,0,10,90,'service',0,2,100,0,10,10);
 INSERT INTO public.pdv_coupon_usages(company_id,coupon_id,order_id,discount_cents,rules_snapshot,allocations)
 VALUES(ca,coa,'c3170000-0000-4000-8000-000000000051',1000,'{"code":"RLS_COUPON","value":10}', '[{"item_id":"c3170000-0000-4000-8000-000000000061","base_net_cents":10000,"discount_cents":1000}]'),
 (cb,cob,'c3170000-0000-4000-8000-000000000052',1000,'{"code":"RLS_COUPON","value":10}', '[{"item_id":"c3170000-0000-4000-8000-000000000062","base_net_cents":10000,"discount_cents":1000}]');
END $history_setup$;
SELECT set_config('request.jwt.claims','{"sub":"c3170000-0000-4000-8000-000000000011","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $admin_a_isolation$
DECLARE own_id uuid:=current_setting('pdv.test.coupon_rls_a')::uuid; foreign_id uuid:=current_setting('pdv.test.coupon_rls_b')::uuid;
 r jsonb; unknown_r jsonb; cmd text; denied boolean; foreign_message text; foreign_detail text; unknown_message text; unknown_detail text;
 rules jsonb:='{"code":"RLS_COUPON","name":"Tentativa fictícia","kind":"fixed","value":10}';
 items jsonb:='[{"id":"c3170000-0000-4000-8000-000000000071","inventory_id":null,"net_cents":10000}]';
BEGIN
 r:=public.pdv_list_coupons_v1(true);
 IF jsonb_array_length(r->'coupons')<>1 OR r#>>'{coupons,0,id}'<>own_id::text THEN RAISE EXCEPTION 'Lista RPC revelou cupom de outra empresa'; END IF;
 IF (SELECT count(*) FROM public.pdv_coupons)<>1 OR EXISTS(SELECT 1 FROM public.pdv_coupons WHERE company_id<>'c3170000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'RLS de cupons revelou outra empresa'; END IF;
 IF (SELECT count(*) FROM public.pdv_coupon_usages)<>1 OR EXISTS(SELECT 1 FROM public.pdv_coupon_usages WHERE company_id<>'c3170000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'RLS do histórico revelou outra empresa'; END IF;
 r:=public.pdv_evaluate_coupon_v1(own_id,NULL,items);
 IF r->>'eligible'<>'true' OR (r->>'discount_cents')::bigint<>1500 THEN RAISE EXCEPTION 'Avaliação própria autorizada falhou'; END IF;
 r:=public.pdv_evaluate_coupon_v1(foreign_id,NULL,items);
 unknown_r:=public.pdv_evaluate_coupon_v1('c3170000-0000-4000-8000-000000000099',NULL,items);
 IF r IS DISTINCT FROM unknown_r OR r->>'eligible'<>'false' OR r->>'reason'<>'missing' THEN RAISE EXCEPTION 'Avaliação estrangeira revelou existência ou dados de cupom'; END IF;
 denied:=false; BEGIN PERFORM public.pdv_save_coupon_v1(foreign_id,1,rules);
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true; GET STACKED DIAGNOSTICS foreign_message=MESSAGE_TEXT,foreign_detail=PG_EXCEPTION_DETAIL; END;
 IF NOT denied THEN RAISE EXCEPTION 'RPC alterou cupom estrangeiro'; END IF;
 denied:=false; BEGIN PERFORM public.pdv_save_coupon_v1('c3170000-0000-4000-8000-000000000099',1,rules);
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true; GET STACKED DIAGNOSTICS unknown_message=MESSAGE_TEXT,unknown_detail=PG_EXCEPTION_DETAIL; END;
 IF NOT denied OR foreign_message IS DISTINCT FROM unknown_message OR foreign_detail IS DISTINCT FROM unknown_detail THEN RAISE EXCEPTION 'Mutação estrangeira virou oráculo de existência'; END IF;
 FOREACH cmd IN ARRAY ARRAY[
  'INSERT INTO public.pdv_coupons DEFAULT VALUES',
  'UPDATE public.pdv_coupons SET name=''Escrita direta proibida'' WHERE id=current_setting(''pdv.test.coupon_rls_a'')::uuid',
  'DELETE FROM public.pdv_coupons WHERE id=current_setting(''pdv.test.coupon_rls_a'')::uuid',
  'INSERT INTO public.pdv_coupon_usages DEFAULT VALUES',
  'UPDATE public.pdv_coupon_usages SET discount_cents=1 WHERE coupon_id=current_setting(''pdv.test.coupon_rls_a'')::uuid',
  'DELETE FROM public.pdv_coupon_usages WHERE coupon_id=current_setting(''pdv.test.coupon_rls_a'')::uuid'
 ] LOOP
  denied:=false; BEGIN EXECUTE cmd; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'authenticated recebeu escrita direta: %',cmd; END IF;
 END LOOP;
 -- ACL owner-only e uma invocação real que deve falhar antes de executar helper.
 FOREACH cmd IN ARRAY ARRAY[
  'public.pdv_evaluate_coupon_internal_v1(uuid,uuid,uuid,jsonb,uuid)',
  'public.pdv_commit_coupon_internal_v1(uuid,uuid,jsonb,bigint)',
  'public.pdv_apply_order_coupon_internal_v1(uuid,uuid,bigint)',
  'public.pdv_consume_order_coupon_internal_v1(uuid)',
  'public.pdv_coupon_hash_meta_internal_v1(jsonb)',
  'public.pdv_preview_preorder_coupon_internal_v1(uuid,uuid,bigint)',
  'public.pdv_pending_coupon_order_internal_v1(uuid,uuid,uuid,uuid)',
  'public.pdv_order_coupon_snapshot_internal_v1(uuid)',
  'public.pdv_cover_existing_order_coupon_core_v1(uuid,uuid,uuid,uuid,jsonb,text)',
  'public.pdv_coupon_checkout_order_internal_v1(uuid,uuid,uuid,uuid,text)'
 ] LOOP
  IF has_function_privilege('authenticated',cmd,'EXECUTE') OR has_function_privilege('anon',cmd,'EXECUTE') OR has_function_privilege('service_role',cmd,'EXECUTE') THEN RAISE EXCEPTION 'Helper promocional interno exposto: %',cmd; END IF;
 END LOOP;
 denied:=false; BEGIN PERFORM public.pdv_evaluate_coupon_internal_v1('c3170000-0000-4000-8000-000000000001',own_id,NULL,items,NULL); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'authenticated executou avaliador interno'; END IF;
END $admin_a_isolation$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"c3170000-0000-4000-8000-000000000013","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $operator_a$
DECLARE r jsonb; cmd text; denied boolean;
BEGIN
 r:=public.pdv_list_coupons_v1(false);
 IF jsonb_array_length(r->'coupons')<>1 OR r->'customers'<>'[]'::jsonb OR r->'inventory'<>'[]'::jsonb THEN RAISE EXCEPTION 'Operador não recebeu lista própria ou recebeu catálogo de gestão'; END IF;
 IF (SELECT count(*) FROM public.pdv_coupons)<>1 THEN RAISE EXCEPTION 'Operador perdeu leitura própria de cupons'; END IF;
 FOREACH cmd IN ARRAY ARRAY[
  'SELECT public.pdv_list_coupons_v1(true)',
  'SELECT public.pdv_save_coupon_v1(NULL,NULL,''{"code":"OP_DENIED","name":"Criação proibida","kind":"fixed","value":1}''::jsonb)',
  'SELECT public.pdv_save_coupon_v1(current_setting(''pdv.test.coupon_rls_a'')::uuid,2,''{"code":"RLS_COUPON","name":"Edição proibida","kind":"fixed","value":1}''::jsonb)',
  'SELECT count(*) FROM public.pdv_coupon_usages'
 ] LOOP
  denied:=false; BEGIN EXECUTE cmd; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Operador ganhou gestão ou histórico promocional: %',cmd; END IF;
 END LOOP;
END $operator_a$;
RESET ROLE;


-- Revogação real: module_revoked. O owner só altera linhas fictícias.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DELETE FROM public.company_modules WHERE company_id='c3170000-0000-4000-8000-000000000001' AND module_code='pdv';
SELECT set_config('request.jwt.claims','{"sub":"c3170000-0000-4000-8000-000000000013","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $module_revoked$
DECLARE cmd text; denied boolean;
BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Teste de revogação não assumiu authenticated'; END IF;
 FOREACH cmd IN ARRAY ARRAY[
  'SELECT public.pdv_list_coupons_v1(false)',
  'SELECT public.pdv_evaluate_coupon_v1(current_setting(''pdv.test.coupon_rls_a'')::uuid,NULL,''[{"id":"c3170000-0000-4000-8000-000000000071","inventory_id":null,"net_cents":10000}]''::jsonb)',
  'SELECT public.pdv_save_coupon_v1(NULL,NULL,''{"code":"REVOKED","name":"Criação proibida","kind":"fixed","value":1}''::jsonb)',
  'SELECT count(*) FROM public.pdv_coupons WHERE company_id=''c3170000-0000-4000-8000-000000000001''',
  'SELECT count(*) FROM public.pdv_coupon_usages WHERE company_id=''c3170000-0000-4000-8000-000000000001'''
 ] LOOP
  denied:=false; BEGIN EXECUTE cmd; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Revogação permitiu RPC ou SELECT direto: %',cmd; END IF;
 END LOOP;
END
$module_revoked$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.company_modules(company_id,module_code) VALUES('c3170000-0000-4000-8000-000000000001','pdv');

-- Revogação real: subscription_expired. O owner só altera linhas fictícias.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.companies SET subscription_expires_at=now()-interval '10 days' WHERE id='c3170000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"c3170000-0000-4000-8000-000000000013","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $subscription_expired$
DECLARE cmd text; denied boolean;
BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Teste de revogação não assumiu authenticated'; END IF;
 FOREACH cmd IN ARRAY ARRAY[
  'SELECT public.pdv_list_coupons_v1(false)',
  'SELECT public.pdv_evaluate_coupon_v1(current_setting(''pdv.test.coupon_rls_a'')::uuid,NULL,''[{"id":"c3170000-0000-4000-8000-000000000071","inventory_id":null,"net_cents":10000}]''::jsonb)',
  'SELECT public.pdv_save_coupon_v1(NULL,NULL,''{"code":"REVOKED","name":"Criação proibida","kind":"fixed","value":1}''::jsonb)',
  'SELECT count(*) FROM public.pdv_coupons WHERE company_id=''c3170000-0000-4000-8000-000000000001''',
  'SELECT count(*) FROM public.pdv_coupon_usages WHERE company_id=''c3170000-0000-4000-8000-000000000001'''
 ] LOOP
  denied:=false; BEGIN EXECUTE cmd; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Revogação permitiu RPC ou SELECT direto: %',cmd; END IF;
 END LOOP;
END
$subscription_expired$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.companies SET subscription_expires_at=NULL WHERE id='c3170000-0000-4000-8000-000000000001';

-- Revogação real: profile_inactive. O owner só altera linhas fictícias.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.profiles SET is_active=false WHERE user_id='c3170000-0000-4000-8000-000000000013';
SELECT set_config('request.jwt.claims','{"sub":"c3170000-0000-4000-8000-000000000013","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $profile_inactive$
DECLARE cmd text; denied boolean;
BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Teste de revogação não assumiu authenticated'; END IF;
 FOREACH cmd IN ARRAY ARRAY[
  'SELECT public.pdv_list_coupons_v1(false)',
  'SELECT public.pdv_evaluate_coupon_v1(current_setting(''pdv.test.coupon_rls_a'')::uuid,NULL,''[{"id":"c3170000-0000-4000-8000-000000000071","inventory_id":null,"net_cents":10000}]''::jsonb)',
  'SELECT public.pdv_save_coupon_v1(NULL,NULL,''{"code":"REVOKED","name":"Criação proibida","kind":"fixed","value":1}''::jsonb)',
  'SELECT count(*) FROM public.pdv_coupons WHERE company_id=''c3170000-0000-4000-8000-000000000001''',
  'SELECT count(*) FROM public.pdv_coupon_usages WHERE company_id=''c3170000-0000-4000-8000-000000000001'''
 ] LOOP
  denied:=false; BEGIN EXECUTE cmd; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Revogação permitiu RPC ou SELECT direto: %',cmd; END IF;
 END LOOP;
END
$profile_inactive$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.profiles SET is_active=true WHERE user_id='c3170000-0000-4000-8000-000000000013';

-- Revogação real: permission_revoked. O owner só altera linhas fictícias.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.user_permissions SET permissions='[]' WHERE user_id='c3170000-0000-4000-8000-000000000013';
SELECT set_config('request.jwt.claims','{"sub":"c3170000-0000-4000-8000-000000000013","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $permission_revoked$
DECLARE cmd text; denied boolean;
BEGIN
 IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Teste de revogação não assumiu authenticated'; END IF;
 FOREACH cmd IN ARRAY ARRAY[
  'SELECT public.pdv_list_coupons_v1(false)',
  'SELECT public.pdv_evaluate_coupon_v1(current_setting(''pdv.test.coupon_rls_a'')::uuid,NULL,''[{"id":"c3170000-0000-4000-8000-000000000071","inventory_id":null,"net_cents":10000}]''::jsonb)',
  'SELECT public.pdv_save_coupon_v1(NULL,NULL,''{"code":"REVOKED","name":"Criação proibida","kind":"fixed","value":1}''::jsonb)',
  'SELECT count(*) FROM public.pdv_coupons WHERE company_id=''c3170000-0000-4000-8000-000000000001''',
  'SELECT count(*) FROM public.pdv_coupon_usages WHERE company_id=''c3170000-0000-4000-8000-000000000001'''
 ] LOOP
  denied:=false; BEGIN EXECUTE cmd; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Revogação permitiu RPC ou SELECT direto: %',cmd; END IF;
 END LOOP;
END
$permission_revoked$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.user_permissions SET permissions='["screen:pdv"]' WHERE user_id='c3170000-0000-4000-8000-000000000013';

SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
DO $anonymous_denied$
DECLARE cmd text; denied boolean;
BEGIN
 IF current_user<>'anon' THEN RAISE EXCEPTION 'Teste não assumiu papel anon'; END IF;
 FOREACH cmd IN ARRAY ARRAY[
  'public.pdv_list_coupons_v1(boolean)',
  'public.pdv_save_coupon_v1(uuid,integer,jsonb)',
  'public.pdv_evaluate_coupon_v1(uuid,uuid,jsonb)',
  'public.pdv_get_pending_order_coupon_v1(uuid,uuid,uuid,uuid)',
  'public.pdv_set_pending_order_coupon_v1(uuid,uuid,uuid,uuid,uuid,bigint,integer)',
  'public.pdv_cover_existing_order_coupon_v1(uuid,uuid,uuid,uuid,jsonb,text,integer)'
 ] LOOP
  IF has_function_privilege('anon',cmd,'EXECUTE') THEN RAISE EXCEPTION 'RPC promocional concedida a anon: %',cmd; END IF;
 END LOOP;
 FOREACH cmd IN ARRAY ARRAY[
  'SELECT public.pdv_list_coupons_v1(false)',
  'SELECT public.pdv_save_coupon_v1(NULL,NULL,''{"code":"ANON_DENIED","name":"Criação proibida","kind":"fixed","value":1}''::jsonb)',
  'SELECT public.pdv_evaluate_coupon_v1(current_setting(''pdv.test.coupon_rls_a'')::uuid,NULL,''[]''::jsonb)',
  'SELECT public.pdv_get_pending_order_coupon_v1(NULL,NULL,NULL,NULL)',
  'SELECT public.pdv_set_pending_order_coupon_v1(NULL,NULL,NULL,NULL,NULL,0,0)',
  'SELECT public.pdv_cover_existing_order_coupon_v1(NULL,NULL,NULL,NULL,''[]''::jsonb,''rls-anon-denied'',0)',
  'SELECT public.pdv_consume_order_coupon_internal_v1(NULL)',
  'SELECT count(*) FROM public.pdv_coupons',
  'SELECT count(*) FROM public.pdv_coupon_usages'
 ] LOOP
  denied:=false; BEGIN EXECUTE cmd; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'anon executou RPC, helper ou leitura promocional: %',cmd; END IF;
 END LOOP;
END $anonymous_denied$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
-- Força quaisquer verificações adiadas antes do rollback integral.
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;

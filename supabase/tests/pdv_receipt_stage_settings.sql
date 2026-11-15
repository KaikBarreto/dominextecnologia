-- Executar na mesma transação de rollback do banco alvo; nenhuma fixture persiste.
BEGIN;
DO $contract$
BEGIN
 IF has_function_privilege('anon','public.pdv_get_receipt_settings_v3()','EXECUTE')
 OR has_function_privilege('anon','public.pdv_save_receipt_settings_v3(text,boolean,integer,jsonb)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.pdv_get_receipt_settings_v3()','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.pdv_save_receipt_settings_v3(text,boolean,integer,jsonb)','EXECUTE')
 OR has_table_privilege('authenticated','public.pdv_receipt_settings','SELECT')
 OR has_table_privilege('authenticated','public.pdv_receipt_settings','UPDATE')
 OR has_function_privilege('authenticated','public.pdv_receipt_stages_valid_v3(jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'ACL indevida nas preferências por etapa';
 END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.pdv_receipt_settings'::regclass) THEN
  RAISE EXCEPTION 'RLS deve permanecer forçada';
 END IF;
END $contract$;
DO $behavior$
DECLARE
 c1 uuid:='d3600000-0000-4000-8000-000000000001'; c2 uuid:='d3600000-0000-4000-8000-000000000002';
 manager uuid:='d3600000-0000-4000-8000-000000000003'; reader uuid:='d3600000-0000-4000-8000-000000000004';
 other_user uuid:='d3600000-0000-4000-8000-000000000005'; no_screen uuid:='d3600000-0000-4000-8000-000000000006';
 stages jsonb:='{"budget":{"auto_print":true,"format":"a4","copies":2},"sale":{"auto_print":false,"format":"80mm","copies":1},"delivery":{"auto_print":true,"format":"58mm","copies":3}}';
 bad jsonb; payload jsonb; state text; detail text;
BEGIN
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
 FROM (VALUES(manager,'stage-manager@example.invalid'),(reader,'stage-reader@example.invalid'),(other_user,'stage-other@example.invalid'),(no_screen,'stage-no-screen@example.invalid')) users(id,email);
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c1,'Etapas A','active'),(c2,'Etapas B','active');
 UPDATE public.profiles SET company_id=c1,is_active=true WHERE user_id IN(manager,reader,no_screen);
 UPDATE public.profiles SET company_id=c2,is_active=true WHERE user_id=other_user;
 INSERT INTO public.user_roles(user_id,role) VALUES(manager,'comercial'),(reader,'comercial'),(other_user,'comercial'),(no_screen,'comercial');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
 (manager,'["screen:pdv_settings","fn:manage_pdv_settings"]',true),
 (reader,'["screen:pdv_dispatch"]',true),(other_user,'["screen:pdv_orders"]',true);
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c1,'pdv'),(c2,'pdv');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated')::text,true);
 PERFORM public.pdv_save_receipt_settings_v2('58mm',true,2);
 payload:=public.pdv_get_receipt_settings_v3();
 IF payload->'stages'->'budget'->>'auto_print'<>'false' OR payload->'stages'->'delivery'->>'auto_print'<>'false'
 OR payload->'stages'->'sale'->>'auto_print'<>'true' THEN RAISE EXCEPTION 'Migração legado mudou automatismo'; END IF;
 payload:=public.pdv_save_receipt_settings_v3('80mm',false,1,stages);
 IF payload->'stages' IS DISTINCT FROM stages THEN RAISE EXCEPTION 'Etapas independentes não persistiram'; END IF;
 PERFORM public.pdv_save_receipt_settings_v2('a4',true,2);
 payload:=public.pdv_get_receipt_settings_v3();
 IF payload->'stages'->'budget' IS DISTINCT FROM stages->'budget'
 OR payload->'stages'->'delivery' IS DISTINCT FROM stages->'delivery'
 OR payload->'stages'->'sale'->>'format'<>'a4' THEN RAISE EXCEPTION 'Cliente legado sobrescreveu outra etapa'; END IF;
 FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
  'null'::jsonb,'[]'::jsonb, stages-'budget',stages||'{"__proto__":{}}'::jsonb,
  jsonb_set(stages,'{budget}','null'::jsonb),jsonb_set(stages,'{budget,auto_print}','"true"'::jsonb),
  jsonb_set(stages,'{budget,copies}','1.5'::jsonb),jsonb_set(stages,'{budget,copies}','"2"'::jsonb),
  jsonb_set(stages,'{budget,format}','"fiscal"'::jsonb),jsonb_set(stages,'{budget,__proto__}','{}'::jsonb)
 )) LOOP
  state:=NULL; detail:=NULL;
  BEGIN PERFORM public.pdv_save_receipt_settings_v3('80mm',false,1,bad);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,detail=PG_EXCEPTION_DETAIL; END;
  IF state IS DISTINCT FROM '22023' OR detail IS DISTINCT FROM 'code=pdv_receipt_settings_invalid' THEN
   RAISE EXCEPTION 'Payload inválido aceito ou erro inadequado: % %',state,detail;
  END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reader,'role','authenticated')::text,true);
 PERFORM public.pdv_get_receipt_settings_v3();
 BEGIN PERFORM public.pdv_save_receipt_settings_v3('80mm',false,1,stages); RAISE EXCEPTION 'Leitor alterou opções'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',other_user,'role','authenticated')::text,true);
 payload:=public.pdv_get_receipt_settings_v3();
 IF payload->'stages'->'budget'->>'auto_print'<>'false' OR payload->>'default_format'<>'80mm' THEN RAISE EXCEPTION 'Vazamento cross-tenant'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',no_screen,'role','authenticated')::text,true);
 BEGIN PERFORM public.pdv_get_receipt_settings_v3(); RAISE EXCEPTION 'Usuário sem tela leu opções'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reader,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 UPDATE public.profiles SET is_active=false WHERE user_id=reader;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reader,'role','authenticated')::text,true);
 BEGIN PERFORM public.pdv_get_receipt_settings_v3(); RAISE EXCEPTION 'Usuário inativo leu opções'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 UPDATE public.profiles SET is_active=true WHERE user_id=reader;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reader,'role','authenticated')::text,true);
 DELETE FROM public.company_modules WHERE company_id=c1 AND module_code='pdv';
 BEGIN PERFORM public.pdv_get_receipt_settings_v3(); RAISE EXCEPTION 'Empresa sem módulo leu opções'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c1,'pdv');
 UPDATE public.companies SET subscription_status='cancelled' WHERE id=c1;
 BEGIN PERFORM public.pdv_get_receipt_settings_v3(); RAISE EXCEPTION 'Assinatura indisponível leu opções'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{}',true);
 BEGIN PERFORM public.pdv_get_receipt_settings_v3(); RAISE EXCEPTION 'Sem sessão leu opções'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $behavior$;
ROLLBACK;

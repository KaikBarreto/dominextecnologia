-- Dados fictícios, nenhuma fixture permanece após o teste.
BEGIN;
DO $test$
DECLARE
 c1 uuid:='d3310000-0000-4000-8000-000000000001';
 c2 uuid:='d3310000-0000-4000-8000-000000000002';
 u1 uuid:='d3310000-0000-4000-8000-000000000003';
 u2 uuid:='d3310000-0000-4000-8000-000000000004';
 denied uuid:='d3310000-0000-4000-8000-000000000005';
 payload jsonb;
BEGIN
 IF has_function_privilege('anon','public.pdv_get_receipt_company_v3()','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.pdv_get_receipt_company_v3()','EXECUTE') THEN
  RAISE EXCEPTION 'ACL indevida na identidade do comprovante';
 END IF;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
 FROM (VALUES(u1,'receipt-identity-a@example.invalid'),(u2,'receipt-identity-b@example.invalid'),(denied,'receipt-identity-denied@example.invalid')) fixture(id,email);
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c1,'Empresa fictícia A','active'),(c2,'Empresa fictícia B','active');
 UPDATE public.profiles SET company_id=c1 WHERE user_id IN(u1,denied);
 UPDATE public.profiles SET company_id=c2 WHERE user_id=u2;
 INSERT INTO public.user_roles(user_id,role) VALUES(u1,'comercial'),(u2,'comercial'),(denied,'comercial');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(u1,'["screen:pdv"]',true),(u2,'["screen:pdv_dispatch"]',true),(denied,'[]',true);
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c1,'pdv'),(c2,'pdv');
 DELETE FROM public.company_settings WHERE company_id IN(c1,c2);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
 payload:=public.pdv_get_receipt_company_v3();
 IF payload->>'company_id'<>c1::text OR payload->>'name'<>'Empresa fictícia A'
 OR payload->>'white_label_enabled'<>'false' THEN RAISE EXCEPTION 'Cadastro sem preferências perdeu identidade canônica'; END IF;
 INSERT INTO public.company_settings(company_id,name,document,address,phone,logo_url,white_label_enabled,white_label_logo_url,show_cnpj_in_documents,show_address_in_documents,show_phone_in_documents)
 VALUES(c1,'Loja fictícia A','00000000000000','Rua fictícia','1100000000','https://example.invalid/logo.png',true,'https://example.invalid/white-logo.png',false,false,false);
 payload:=public.pdv_get_receipt_company_v3();
 IF payload->>'name'<>'Loja fictícia A' OR payload->>'white_label_enabled'<>'true'
 OR payload->>'logo_url'<>'https://example.invalid/white-logo.png'
 OR payload->>'document' IS NOT NULL OR payload->>'address' IS NOT NULL OR payload->>'phone' IS NOT NULL
 THEN RAISE EXCEPTION 'White-label ou preferências de privacidade ignoradas'; END IF;
 IF payload-ARRAY['company_id','name','document','address','phone','logo_url','time_zone','white_label_enabled']::text[]<>'{}'::jsonb THEN
  RAISE EXCEPTION 'Identidade inclui campos não necessários';
 END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true);
 payload:=public.pdv_get_receipt_company_v3();
 IF payload->>'company_id'<>c2::text OR payload->>'name'<>'Empresa fictícia B'
 OR payload->>'document' IS NOT NULL OR payload->>'logo_url' IS NOT NULL THEN RAISE EXCEPTION 'Identidade de outra empresa exposta'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',denied,'role','authenticated')::text,true);
 BEGIN PERFORM public.pdv_get_receipt_company_v3(); RAISE EXCEPTION 'Perfil sem tela leu identidade'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
 DELETE FROM public.company_modules WHERE company_id=c1 AND module_code='pdv';
 BEGIN PERFORM public.pdv_get_receipt_company_v3(); RAISE EXCEPTION 'Empresa sem módulo leu identidade'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{}',true);
 BEGIN PERFORM public.pdv_get_receipt_company_v3(); RAISE EXCEPTION 'Sessão ausente leu identidade'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$test$;
ROLLBACK;

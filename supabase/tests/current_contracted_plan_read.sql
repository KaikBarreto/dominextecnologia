BEGIN;
SET CONSTRAINTS ALL DEFERRED;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='60s';
DO $test$
DECLARE actor_a uuid:='f4162140-0000-4000-8000-000000000001'; actor_b uuid:='f4162140-0000-4000-8000-000000000002';
 backup_admin uuid:='f4162140-0000-4000-8000-000000000005';
 company_a uuid:='f4162140-0000-4000-8000-000000000003'; company_b uuid:='f4162140-0000-4000-8000-000000000004';
 denied boolean;
BEGIN
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO public.subscription_plans(code,name,price,max_users,included_modules,is_active,business_core)
 VALUES('core214_a','Plano contratado A fictício',197,9,'["basic","rh"]',false,'services'),
 ('core214_b','Plano contratado B fictício',197,3,'["basic","crm"]',false,'services');
 INSERT INTO public.companies(id,name,subscription_plan,subscription_status,subscription_expires_at)
 VALUES(company_a,'Empresa A fictícia','core214_a','active',now()+interval '10 days'),(company_b,'Empresa B fictícia','core214_b','active',now()+interval '10 days');
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
 FROM(VALUES(actor_a,'current-plan-a@example.invalid'),(actor_b,'current-plan-b@example.invalid'),(backup_admin,'current-plan-backup@example.invalid'))u(id,email);
 UPDATE public.profiles SET company_id=company_a,is_active=true WHERE user_id IN(actor_a,backup_admin);
 UPDATE public.profiles SET company_id=company_b,is_active=true WHERE user_id=actor_b;
 INSERT INTO public.user_roles(user_id,role) VALUES(actor_a,'admin'),(actor_b,'admin'),(backup_admin,'admin');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor_a)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF NOT EXISTS(SELECT 1 FROM public.subscription_plans WHERE code='core214_a' AND max_users=9 AND included_modules ? 'rh') THEN RAISE EXCEPTION 'Ator não leu o próprio contrato retirado da venda'; END IF;
 IF EXISTS(SELECT 1 FROM public.subscription_plans WHERE code='core214_b') THEN RAISE EXCEPTION 'Ator A leu plano inativo de outra empresa'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subscription_plans WHERE code='start' AND is_active IS TRUE) THEN RAISE EXCEPTION 'Policy alterou catálogo ativo existente'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor_b)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF NOT EXISTS(SELECT 1 FROM public.subscription_plans WHERE code='core214_b') OR EXISTS(SELECT 1 FROM public.subscription_plans WHERE code='core214_a') THEN RAISE EXCEPTION 'Plano contratado não respeitou a troca de tenant'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 UPDATE public.profiles SET is_active=false WHERE user_id=actor_a;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor_a)::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF EXISTS(SELECT 1 FROM public.subscription_plans WHERE code IN ('core214_a','core214_b')) THEN RAISE EXCEPTION 'Perfil desativado leu plano inativo'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
 EXECUTE 'SET LOCAL ROLE anon';
 denied:=false;
 BEGIN
  IF EXISTS(SELECT 1 FROM public.subscription_plans WHERE code IN ('core214_a','core214_b')) THEN RAISE EXCEPTION 'Visitante leu contrato inativo'; END IF;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 -- Se SELECT da tabela continua revogado ao anon, a recusa por privilégio é esperada.
 IF NOT denied AND has_table_privilege('anon','public.subscription_plans','SELECT') THEN RAISE EXCEPTION 'Visitante recebeu acesso novo ao catálogo'; END IF;
 EXECUTE 'RESET ROLE';
 SET CONSTRAINTS ALL IMMEDIATE;
END $test$;
ROLLBACK;

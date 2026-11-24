-- Run on a migrated database as postgres. Fictitious fixtures; everything rolls back.
BEGIN;
DO $test$
DECLARE
  c1 uuid := 'cf160000-0000-4000-8000-000000000001';
  c2 uuid := 'cf160000-0000-4000-8000-000000000002';
  u1 uuid := 'cf160000-0000-4000-8000-000000000003';
  u2 uuid := 'cf160000-0000-4000-8000-000000000004';
  u3 uuid := 'cf160000-0000-4000-8000-000000000005';
  op1 uuid := 'cf160000-0000-4000-8000-000000000011';
  op2 uuid := 'cf160000-0000-4000-8000-000000000012';
  op3 uuid := 'cf160000-0000-4000-8000-000000000013';
  r record;
  denied boolean;
BEGIN
  IF has_table_privilege('anon','public.catalog_model_favorites','SELECT')
    OR has_table_privilege('authenticated','public.catalog_model_favorites','INSERT')
    OR has_table_privilege('authenticated','public.catalog_model_favorites','UPDATE')
    OR has_table_privilege('authenticated','public.catalog_model_favorites','DELETE')
    OR has_function_privilege('anon','public.set_catalog_model_favorite(uuid,text,boolean,bigint,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Catalog favorites ACL is too broad';
  END IF;
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',u1,'authenticated','authenticated','catalog-favorite-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',u2,'authenticated','authenticated','catalog-favorite-b@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',u3,'authenticated','authenticated','catalog-favorite-peer@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c1,'Catalog test A','active'),(c2,'Catalog test B','active');
  UPDATE public.profiles SET company_id=c1,is_active=true WHERE user_id IN(u1,u3);
  UPDATE public.profiles SET company_id=c2,is_active=true WHERE user_id=u2;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT * INTO r FROM public.set_catalog_model_favorite(c1,'curated-no-db-fk',true,0,op1);
  IF r.applied IS DISTINCT FROM true OR r.revision<>1 OR r.is_favorite IS DISTINCT FROM true THEN RAISE EXCEPTION 'Initial add failed'; END IF;
  SELECT * INTO r FROM public.set_catalog_model_favorite(c1,'curated-no-db-fk',true,0,op1);
  IF r.applied IS DISTINCT FROM true OR r.revision<>1 THEN RAISE EXCEPTION 'Replay is not idempotent'; END IF;
  denied:=false;
  BEGIN PERFORM public.set_catalog_model_favorite(c1,'curated-no-db-fk',false,1,op1);
  EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Operation payload collision accepted'; END IF;
  SELECT * INTO r FROM public.set_catalog_model_favorite(c1,'curated-no-db-fk',false,1,op2);
  IF r.applied IS DISTINCT FROM true OR r.revision<>2 OR r.is_favorite IS DISTINCT FROM false THEN RAISE EXCEPTION 'Remove/tombstone failed'; END IF;
  SELECT * INTO r FROM public.set_catalog_model_favorite(c1,'curated-no-db-fk',true,0,op3);
  IF r.applied IS DISTINCT FROM false OR r.revision<>2 OR r.is_favorite IS DISTINCT FROM false THEN RAISE EXCEPTION 'Stale import resurrected removed favorite'; END IF;
  SELECT * INTO r FROM public.set_catalog_model_favorite(c1,'curated-no-db-fk',true,0,op1);
  IF r.applied IS DISTINCT FROM false OR r.revision<>2 THEN RAISE EXCEPTION 'Old successful request resurrected removal'; END IF;
  IF (SELECT count(*) FROM public.catalog_model_favorites)<>1 THEN RAISE EXCEPTION 'Tombstone missing'; END IF;
  denied:=false;
  BEGIN DELETE FROM public.catalog_model_favorites WHERE model_id='curated-no-db-fk';
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Direct DML allowed'; END IF;
  denied:=false;
  BEGIN PERFORM public.set_catalog_model_favorite(c2,'cross-tenant',true,0,op3);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Cross-tenant write allowed'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u3,'role','authenticated')::text,true);
  IF EXISTS(SELECT 1 FROM public.catalog_model_favorites) THEN RAISE EXCEPTION 'Another user in same tenant can read favorites'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true);
  IF EXISTS(SELECT 1 FROM public.catalog_model_favorites) THEN RAISE EXCEPTION 'Another tenant can read favorites'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims','{}',true);
  UPDATE public.profiles SET company_id=c2 WHERE user_id=u1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF EXISTS(SELECT 1 FROM public.catalog_model_favorites) THEN RAISE EXCEPTION 'Old tenant visible after membership switch'; END IF;
  denied:=false;
  BEGIN PERFORM public.set_catalog_model_favorite(c1,'former-tenant',true,0,op3);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Former tenant write allowed'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims','{}',true);
  UPDATE public.profiles SET is_active=false WHERE user_id=u1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  denied:=false;
  BEGIN PERFORM public.set_catalog_model_favorite(c2,'inactive',true,0,op3);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied OR EXISTS(SELECT 1 FROM public.catalog_model_favorites) THEN RAISE EXCEPTION 'Inactive profile has access'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims','{}',true);
  denied:=false;
  BEGIN PERFORM public.set_catalog_model_favorite(c1,'unauthenticated',true,0,op3);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'RPC accepts absent auth.uid'; END IF;
END
$test$;
ROLLBACK;

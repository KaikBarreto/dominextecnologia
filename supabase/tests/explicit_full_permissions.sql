-- Não permite que permissões de consulta se transformem em gestão geral.
-- Fixture isolada, sem flags ou dados de empresas existentes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $behavior$
DECLARE
  v_user uuid := gen_random_uuid();
  v_company uuid := gen_random_uuid();
  v_permissions jsonb;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmation_token,email_change,email_change_token_new,recovery_token)
  VALUES ('00000000-0000-0000-0000-000000000000',v_user,'authenticated','authenticated',
    'permission-count-' || v_user::text || '@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status)
    VALUES (v_company,'Fixture de permissões explícitas','active');
  UPDATE public.profiles SET company_id=v_company,is_active=true WHERE user_id=v_user;
  INSERT INTO public.user_roles(user_id,role) VALUES(v_user,'comercial');
  SELECT jsonb_agg('screen:consulta_' || item::text) INTO v_permissions
    FROM generate_series(1,40) item;
  INSERT INTO public.user_permissions(user_id,permissions,is_active)
    VALUES(v_user,v_permissions,true);

  IF public.has_full_permissions(v_user)
    OR public.can_manage_users(v_user)
    OR public.can_manage_system(v_user) THEN
    RAISE EXCEPTION 'Uma lista extensa de consultas ampliou privilégios sem concessão explícita';
  END IF;

  UPDATE public.user_permissions SET permissions='["fn:manage_users"]'::jsonb WHERE user_id=v_user;
  IF public.has_full_permissions(v_user) OR NOT public.can_manage_users(v_user)
    OR public.can_manage_system(v_user) THEN
    RAISE EXCEPTION 'Permissão nominal foi ampliada ou deixou de funcionar';
  END IF;

  UPDATE public.user_permissions SET permissions='["*"]'::jsonb WHERE user_id=v_user;
  IF NOT public.has_full_permissions(v_user) OR NOT public.can_manage_users(v_user)
    OR NOT public.can_manage_system(v_user) THEN
    RAISE EXCEPTION 'Curinga explícito deixou de funcionar';
  END IF;

  UPDATE public.user_permissions SET is_active=false WHERE user_id=v_user;
  IF public.has_full_permissions(v_user) OR public.can_manage_users(v_user)
    OR public.can_manage_system(v_user) THEN
    RAISE EXCEPTION 'Concessão inativa ainda ampliou privilégios';
  END IF;

  INSERT INTO public.user_roles(user_id,role) VALUES(v_user,'admin');
  IF NOT public.can_manage_users(v_user) OR NOT public.can_manage_system(v_user) THEN
    RAISE EXCEPTION 'Cargo administrativo explícito deixou de funcionar';
  END IF;
END $behavior$;
ROLLBACK;

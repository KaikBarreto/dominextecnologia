BEGIN;
DO $fixture$
DECLARE c uuid := '24171000-0000-4000-8000-000000000001';
  manager uuid := '24171000-0000-4000-8000-000000000011';
  editor uuid := '24171000-0000-4000-8000-000000000012';
  hidden uuid; visible uuid := '24171000-0000-4000-8000-000000000022';
  material uuid := '24171000-0000-4000-8000-000000000031';
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,
    email_change_token_new,recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000'::uuid,id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
    FROM (VALUES(manager,'inventory-manager@example.invalid'),(editor,'inventory-editor@example.invalid')) fixture(id,email);
  INSERT INTO public.companies(id,name,subscription_status,subscription_plan,subscription_expires_at)
    VALUES(c,'Fixture locais autorizados','active','personalizado',now()+interval '30 days');
  UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(manager,editor);
  INSERT INTO public.user_roles(user_id,role) VALUES(manager,'admin'),(editor,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (manager,'["*"]',true),(editor,'["screen:inventory","fn:manage_inventory"]',true);
  SELECT id INTO hidden FROM public.stocks WHERE company_id=c AND is_default LIMIT 1;
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(visible,c,'Local secundário visível',false);
  INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(c,hidden,manager);
  INSERT INTO public.inventory(id,company_id,name,quantity,unit) VALUES(material,c,'Material fictício',0,'un');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated')::text,true);
  PERFORM public.inventory_register_manual_movement_v3(p_inventory_id=>material,p_movement_type=>'entrada',p_quantity=>7,p_stock_id=>hidden);
  PERFORM set_config('fixture.hidden_stock',hidden::text,true);
END $fixture$;
SET LOCAL ROLE authenticated;
DO $behavior$
DECLARE material uuid := '24171000-0000-4000-8000-000000000031';
  editor uuid := '24171000-0000-4000-8000-000000000012';
  visible uuid := '24171000-0000-4000-8000-000000000022'; blocked boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',editor,'role','authenticated')::text,true);
  PERFORM public.set_inventory_presence(material,ARRAY[visible]);
  PERFORM public.inventory_remove_from_stock_v4(material,visible);
  blocked:=false;
  BEGIN PERFORM public.set_inventory_presence(material,ARRAY[current_setting('fixture.hidden_stock')::uuid]);
    EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'aceitou local restrito'; END IF;
  blocked:=false;
  BEGIN PERFORM public.set_inventory_presence(material,ARRAY['24171000-0000-4000-8000-000000000099'::uuid]);
    EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'ignorou ID intruso em vez de recusar'; END IF;
  PERFORM public.inventory_register_manual_movement_v3(p_inventory_id=>material,p_movement_type=>'entrada',p_quantity=>2,p_stock_id=>visible);
  blocked:=false;
  BEGIN PERFORM public.set_inventory_presence(material,ARRAY[]::uuid[]);
    EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'removeu presença local com saldo'; END IF;
  blocked:=false;
  BEGIN PERFORM public.inventory_remove_from_stock_v4(material,visible);
    EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'ação unitária removeu presença com saldo'; END IF;
END $behavior$;
RESET ROLE;
DO $verify$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.inventory_stock_levels WHERE inventory_id='24171000-0000-4000-8000-000000000031'
    AND stock_id=current_setting('fixture.hidden_stock')::uuid AND quantity=7 AND is_present) THEN
    RAISE EXCEPTION 'editar local secundário alterou local restrito'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.inventory_stock_levels WHERE inventory_id='24171000-0000-4000-8000-000000000031'
    AND stock_id='24171000-0000-4000-8000-000000000022' AND quantity=2 AND is_present) THEN
    RAISE EXCEPTION 'movimentação no local secundário falhou'; END IF;
  UPDATE public.user_permissions SET permissions='["screen:inventory"]' WHERE user_id='24171000-0000-4000-8000-000000000012';
END $verify$;
SET LOCAL ROLE authenticated;
DO $deny$
DECLARE blocked boolean:=false;
BEGIN
  BEGIN PERFORM public.set_inventory_presence('24171000-0000-4000-8000-000000000031',ARRAY[]::uuid[]);
    EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'leitor sem gestão alterou presença'; END IF;
END $deny$;
ROLLBACK;

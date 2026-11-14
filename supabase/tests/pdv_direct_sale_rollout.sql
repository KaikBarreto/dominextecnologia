-- Smoke do rollout fechado e projeção mínima da venda direta v2.
BEGIN;
DO $contract$
DECLARE v_wrapper text; v_catalog text;
BEGIN
  IF has_function_privilege('authenticated','public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.pdv_complete_direct_sale_rollout_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)','EXECUTE')
     OR has_function_privilege('anon','public.pdv_complete_direct_sale_rollout_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.pdv_get_direct_sale_capability_v2()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.pdv_get_direct_sale_catalog_v2()','EXECUTE')
     OR has_function_privilege('anon','public.pdv_get_direct_sale_catalog_v2()','EXECUTE') THEN
    RAISE EXCEPTION 'ACL do core, wrapper ou projeção está incorreta';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.app_feature_flags f
    WHERE f.key='pdv_direct_sale_v2' AND f.enabled IS FALSE AND cardinality(f.company_allowlist)=0) THEN
    RAISE EXCEPTION 'rollout não nasceu fail-closed';
  END IF;
  SELECT pg_get_functiondef('public.pdv_complete_direct_sale_rollout_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure) INTO v_wrapper;
  IF strpos(v_wrapper,'pdv_direct_sale_v2_enabled_internal')=0 OR strpos(v_wrapper,'pdv_complete_direct_sale_v2')=0 THEN
    RAISE EXCEPTION 'wrapper perdeu gate ou delegação ao core';
  END IF;
  SELECT pg_get_functiondef('public.pdv_get_direct_sale_catalog_v2()'::regprocedure) INTO v_catalog;
  IF strpos(v_catalog,'can_access_stock')=0 THEN
    RAISE EXCEPTION 'catálogo perdeu a ACL de estoque de terminal/sessão';
  END IF;
END $contract$;

DO $behavior$
DECLARE
  c1 uuid:='d3600000-0000-4000-8000-000000000001'; c2 uuid:='d3600000-0000-4000-8000-000000000002';
  u1 uuid:='d3600000-0000-4000-8000-000000000003'; u2 uuid:='d3600000-0000-4000-8000-000000000004';
  no_screen uuid:='d3600000-0000-4000-8000-000000000005';
  s1 uuid:='d3600000-0000-4000-8000-000000000011'; s2 uuid:='d3600000-0000-4000-8000-000000000012';
  i1 uuid:='d3600000-0000-4000-8000-000000000021'; i2 uuid:='d3600000-0000-4000-8000-000000000022';
  cu1 uuid:='d3600000-0000-4000-8000-000000000031'; cu2 uuid:='d3600000-0000-4000-8000-000000000032';
  t1 uuid:='d3600000-0000-4000-8000-000000000041'; t2 uuid:='d3600000-0000-4000-8000-000000000042';
  cash1 uuid:='d3600000-0000-4000-8000-000000000051'; bank1 uuid:='d3600000-0000-4000-8000-000000000052';
  capability jsonb; catalog jsonb; receipt jsonb; entry jsonb; denied_state text; denied_detail text;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',u1,'authenticated','authenticated','rollout-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',u2,'authenticated','authenticated','rollout-b@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',no_screen,'authenticated','authenticated','rollout-no-screen@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c1,'Rollout A','active'),(c2,'Rollout B','active');
  UPDATE public.profiles SET company_id=c1,is_active=true WHERE user_id IN(u1,no_screen);
  UPDATE public.profiles SET company_id=c2,is_active=true WHERE user_id=u2;
  INSERT INTO public.user_roles(user_id,role) VALUES(u1,'comercial'),(u2,'comercial'),(no_screen,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (u1,'["screen:pdv","fn:complete_direct_sale","fn:use_bank_accounts"]',true),
    (u2,'["screen:pdv","fn:complete_direct_sale"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c1,'pdv'),(c2,'pdv');
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active,color,icon) VALUES
    (cash1,c1,'Cofre rollout','caixa',0,true,'#111111','wallet'),
    (bank1,c1,'Banco rollout','banco',0,true,'#222222','landmark');
  INSERT INTO public.company_settings(company_id,name,pdv_cash_account_id,pdv_mode) VALUES(c1,'Rollout A',cash1,'simples');
  INSERT INTO public.stocks(id,company_id,name,is_default,purpose) VALUES(s1,c1,'Loja A',true,'pdv'),(s2,c2,'Loja B',true,'pdv');
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(t1,c1,'Terminal A',s1,true),(t2,c2,'Terminal B',s2,true);
  INSERT INTO public.inventory(id,company_id,sku,barcode,name,unit,quantity,cost_price,sale_price,is_sellable) VALUES
    (i1,c1,'SAFE-A','7890001','Material A','un',5,91.23,123.45,true),
    (i2,c2,'SECRET-B','7890002','Material B','un',7,44.44,55.55,true);
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES
    (c1,i1,s1,5,true),(c2,i2,s2,7,true);
  INSERT INTO public.customers(id,company_id,name,document,email,phone,credit_limit,is_deleted) VALUES
    (cu1,c1,'Cliente A','00000000000','privado-a@example.invalid','11999999999',500,false),
    (cu2,c2,'Cliente B','11111111111','privado-b@example.invalid','11888888888',900,false);

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
  receipt:=public.pdv_get_receipt_settings_v2();
  IF receipt->>'default_format'<>'80mm' THEN RAISE EXCEPTION 'caixa nominal não leu configuração efetiva'; END IF;
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN PERFORM public.pdv_save_receipt_settings_v2('58mm',true,2);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL; END;
  IF denied_state IS DISTINCT FROM '42501' OR denied_detail IS DISTINCT FROM 'code=pdv_receipt_screen_denied' THEN
    RAISE EXCEPTION 'caixa nominal ganhou escrita de configuração: %, %',denied_state,denied_detail;
  END IF;
  capability:=public.pdv_get_direct_sale_capability_v2();
  IF capability->>'enabled'<>'false' THEN RAISE EXCEPTION 'empresa ativada sem allowlist'; END IF;
  BEGIN PERFORM public.pdv_get_direct_sale_catalog_v2();
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL; END;
  IF denied_state IS DISTINCT FROM '42501' OR denied_detail IS DISTINCT FROM 'code=pdv_direct_sale_rollout_disabled' THEN
    RAISE EXCEPTION 'catálogo não falhou fechado: %, %',denied_state,denied_detail;
  END IF;

  UPDATE public.app_feature_flags SET company_allowlist=ARRAY[c1],updated_at=now() WHERE key='pdv_direct_sale_v2';
  capability:=public.pdv_get_direct_sale_capability_v2(); catalog:=public.pdv_get_direct_sale_catalog_v2();
  IF capability->>'enabled'<>'true' OR capability->>'contract_version'<>'2'
     OR jsonb_array_length(catalog->'materials')<>1 OR catalog->'materials'->0->>'id'<>i1::text
     OR jsonb_array_length(catalog->'customers')<>1 OR catalog->'customers'->0->>'id'<>cu1::text
     OR jsonb_array_length(catalog->'terminals')<>1 OR catalog->'terminals'->0->>'id'<>t1::text
     OR catalog->'cash_account'->>'id'<>cash1::text OR jsonb_array_length(catalog->'bank_accounts')<>1 THEN
    RAISE EXCEPTION 'capability/projeção omitiu permitido ou vazou tenant';
  END IF;
  IF catalog::text ~ '(cost_price|credit_limit|document|email|phone|inscricao_|fiscal_|initial_balance)' THEN
    RAISE EXCEPTION 'projeção contém campo sensível';
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(catalog->'materials') LOOP
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(entry) f(name) WHERE name NOT IN
      ('id','name','sku','barcode','unit','sale_price','image_url','group_id','available_by_stock')) THEN
      RAISE EXCEPTION 'material fora da allowlist';
    END IF;
  END LOOP;
  FOR entry IN SELECT value FROM jsonb_array_elements(catalog->'customers') LOOP
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(entry) f(name) WHERE name NOT IN('id','name')) THEN
      RAISE EXCEPTION 'cliente fora da allowlist';
    END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true);
  capability:=public.pdv_get_direct_sale_capability_v2();
  IF capability->>'enabled'<>'false' THEN RAISE EXCEPTION 'allowlist vazou para outro tenant'; END IF;
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN
    PERFORM public.pdv_complete_direct_sale_rollout_v2(NULL,NULL,NULL,NULL,'{}','[]','rollout-blocked-0001');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL; END;
  IF denied_state IS DISTINCT FROM '42501' OR denied_detail IS DISTINCT FROM 'code=pdv_direct_sale_rollout_disabled' THEN
    RAISE EXCEPTION 'wrapper chegou ao core sem rollout: %, %',denied_state,denied_detail;
  END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',no_screen,'role','authenticated')::text,true);
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN PERFORM public.pdv_get_direct_sale_capability_v2();
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL; END;
  IF denied_state IS DISTINCT FROM '42501' OR denied_detail IS DISTINCT FROM 'code=pdv_direct_sale_screen_denied' THEN
    RAISE EXCEPTION 'usuário sem tela nominal não falhou fechado: %, %',denied_state,denied_detail;
  END IF;
END $behavior$;
ROLLBACK;

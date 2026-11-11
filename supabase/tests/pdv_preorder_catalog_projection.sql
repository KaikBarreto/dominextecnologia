-- Smoke W2-01 P1: catalogo projetado sem dados sensiveis e isolado por tenant.
BEGIN;

DO $contract$
BEGIN
  IF has_function_privilege('anon','public.pdv_get_preorder_catalog_v2()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.pdv_get_preorder_catalog_v2()','EXECUTE') THEN
    RAISE EXCEPTION 'ACL publica incorreta na projecao do catalogo';
  END IF;
END
$contract$;

DO $behavior$
DECLARE
  c1 uuid := 'c2170000-0000-4000-8000-000000000001';
  c2 uuid := 'c2170000-0000-4000-8000-000000000002';
  u1 uuid := 'c2170000-0000-4000-8000-000000000003';
  u2 uuid := 'c2170000-0000-4000-8000-000000000004';
  no_screen uuid := 'c2170000-0000-4000-8000-000000000005';
  i1 uuid := 'c2170000-0000-4000-8000-000000000011';
  i2 uuid := 'c2170000-0000-4000-8000-000000000012';
  hidden_inventory uuid := 'c2170000-0000-4000-8000-000000000013';
  group1 uuid := 'c2170000-0000-4000-8000-000000000014';
  preorder1 uuid := 'c2170000-0000-4000-8000-000000000015';
  preorder_item1 uuid := 'c2170000-0000-4000-8000-000000000016';
  customer1 uuid := 'c2170000-0000-4000-8000-000000000021';
  customer2 uuid := 'c2170000-0000-4000-8000-000000000022';
  stock1 uuid := 'c2170000-0000-4000-8000-000000000031';
  stock2 uuid := 'c2170000-0000-4000-8000-000000000032';
  hidden_stock uuid := 'c2170000-0000-4000-8000-000000000033';
  payload jsonb;
  entry jsonb;
  blocked boolean := false;
  denied_state text;
  denied_detail text;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',u1,'authenticated','authenticated','catalog-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',u2,'authenticated','authenticated','catalog-b@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',no_screen,'authenticated','authenticated','catalog-no-screen@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c1,'Catalogo A','active'),(c2,'Catalogo B','active');
  UPDATE public.profiles SET company_id=c1,is_active=true WHERE user_id=u1;
  UPDATE public.profiles SET company_id=c2,is_active=true WHERE user_id=u2;
  UPDATE public.profiles SET company_id=c1,is_active=true WHERE user_id=no_screen;
  INSERT INTO public.user_roles(user_id,role) VALUES(u1,'comercial'),(u2,'comercial'),(no_screen,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (u1,'["screen:pdv"]',true),
    (u2,'["screen:pdv_orders"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c1,'pdv');

  INSERT INTO public.material_groups(id,company_id,name,color) VALUES
    (group1,c1,'Grupo visivel','#123456');
  INSERT INTO public.inventory(id,company_id,sku,barcode,name,unit,quantity,cost_price,sale_price,image_url,group_id,archived_at) VALUES
    (i1,c1,'SAFE-1','789000000001','Material visivel','un',5,91.23,123.45,'materials/visivel.webp',group1,NULL),
    (i2,c2,'SECRET-2','789000000002','Material outro tenant','kg',2,77.77,88.88,'materials/segredo.webp',NULL,NULL),
    (hidden_inventory,c1,'HIDDEN-1','789000000003','Material de local restrito','un',1,50,60,'materials/restrito.webp',NULL,NULL);
  INSERT INTO public.customers(id,company_id,name,document,email,phone,credit_limit,is_deleted) VALUES
    (customer1,c1,'Cliente visivel','00000000000','privado@example.invalid','11999999999',500,false),
    (customer2,c2,'Cliente outro tenant','11111111111','outro@example.invalid','11888888888',900,false);
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES
    (stock1,c1,'Loja A',true),
    (stock2,c2,'Loja B',true),
    (hidden_stock,c1,'Cofre restrito',false);
  INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(c1,hidden_stock,u2);
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present)
  VALUES
    (c1,i1,stock1,5,true),
    (c1,hidden_inventory,hidden_stock,1,true);
  INSERT INTO public.pdv_preorders(id,company_id,number,stock_id,status,created_by)
  VALUES(preorder1,c1,1,stock1,'edicao',u1);
  INSERT INTO public.pdv_preorder_items(
    id,company_id,preorder_id,inventory_id,item_type,description,quantity,unit_price
  ) VALUES(preorder_item1,c1,preorder1,i1,'material','Material visivel',2,123.45);
  INSERT INTO public.pdv_stock_reservation_items(
    company_id,inventory_id,stock_id,preorder_item_id,reservation_kind,state,
    reserved_quantity,cost_price_snapshot,created_by
  ) VALUES(c1,i1,stock1,preorder_item1,'coverage','guaranteed',2,91.23,u1);

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u1,'role','authenticated')::text,true);
  payload := public.pdv_get_preorder_catalog_v2();

  IF jsonb_array_length(payload->'materials') <> 1
     OR payload->'materials'->0->>'id' <> i1::text
     OR jsonb_array_length(payload->'customers') <> 1
     OR payload->'customers'->0->>'id' <> customer1::text
     OR jsonb_array_length(payload->'stocks') <> 1
     OR payload->'stocks'->0->>'id' <> stock1::text THEN
    RAISE EXCEPTION 'projecao vazou tenant ou omitiu dados permitidos';
  END IF;

  IF payload#>>'{materials,0,barcode}' <> '789000000001'
     OR payload#>>'{materials,0,image_url}' <> 'materials/visivel.webp'
     OR payload#>>'{materials,0,group,id}' <> group1::text
     OR payload#>>'{materials,0,group,name}' <> 'Grupo visivel'
     OR payload#>>'{materials,0,group,color}' <> '#123456'
     OR jsonb_array_length(payload#>'{materials,0,available_by_stock}') <> 1
     OR payload#>>'{materials,0,available_by_stock,0,stock_id}' <> stock1::text
     OR (payload#>>'{materials,0,available_by_stock,0,available_quantity}')::numeric <> 3 THEN
    RAISE EXCEPTION 'projecao comercial nao retornou imagem, codigo, grupo ou saldo permitido';
  END IF;

  FOR entry IN
    SELECT value FROM jsonb_array_elements(payload->'materials')
  LOOP
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(entry) AS fields(field_name)
      WHERE field_name NOT IN (
        'id','name','sku','barcode','unit','sale_price','image_url','archived_at',
        'group','available_by_stock'
      )
    ) THEN RAISE EXCEPTION 'material retornou campo fora da projecao'; END IF;
    IF entry->'group' IS NOT NULL AND EXISTS (
      SELECT 1 FROM jsonb_object_keys(entry->'group') AS fields(field_name)
      WHERE field_name NOT IN ('id','name','color')
    ) THEN RAISE EXCEPTION 'grupo retornou campo fora da projecao'; END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(entry->'available_by_stock') availability,
           LATERAL jsonb_object_keys(availability) AS fields(field_name)
      WHERE field_name NOT IN ('stock_id','available_quantity')
    ) THEN RAISE EXCEPTION 'disponibilidade retornou campo fora da projecao'; END IF;
  END LOOP;
  FOR entry IN
    SELECT value FROM jsonb_array_elements(payload->'customers')
  LOOP
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(entry) AS fields(field_name)
      WHERE field_name NOT IN ('id','name')
    ) THEN RAISE EXCEPTION 'cliente retornou credito, fiscal, contato ou outro campo sensivel'; END IF;
  END LOOP;
  FOR entry IN
    SELECT value FROM jsonb_array_elements(payload->'stocks')
  LOOP
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(entry) AS fields(field_name)
      WHERE field_name NOT IN ('id','name')
    ) THEN RAISE EXCEPTION 'local retornou campo fora da projecao'; END IF;
  END LOOP;

  IF payload::text ~ '(cost_price|credit_limit|document|email|phone|inscricao_|fiscal_)' THEN
    RAISE EXCEPTION 'payload contem nome de campo sensivel';
  END IF;

  -- Role legado sem linha nominal nao recebe a projecao por fallback.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',no_screen,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.pdv_get_preorder_catalog_v2();
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS denied_state = RETURNED_SQLSTATE, denied_detail = PG_EXCEPTION_DETAIL;
  END;
  IF denied_state IS DISTINCT FROM '42501' OR denied_detail IS DISTINCT FROM 'code=pdv_preorder_screen_denied' THEN
    RAISE EXCEPTION 'usuario sem tela nominal nao falhou fechado: state=%, detail=%',denied_state,denied_detail;
  END IF;

  -- Mesmo com tela, vigencia/modulo falham fechado para o segundo tenant.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.pdv_get_preorder_catalog_v2();
  EXCEPTION WHEN insufficient_privilege THEN
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'empresa sem modulo PDV acessou catalogo'; END IF;
END
$behavior$;

ROLLBACK;

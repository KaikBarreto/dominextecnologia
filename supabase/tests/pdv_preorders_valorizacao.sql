-- Smoke W2-01: balcao encaminha sem preco e caixa explicitamente autorizado valoriza.
BEGIN;

DO $behavior$
DECLARE
  c uuid:='c2150000-0000-4000-8000-000000000001';
  seller uuid:='c2150000-0000-4000-8000-000000000002';
  cashier uuid:='c2150000-0000-4000-8000-000000000003';
  screen_only uuid:='c2150000-0000-4000-8000-000000000004';
  legacy uuid:='c2150000-0000-4000-8000-000000000005';
  stock uuid:='c2150000-0000-4000-8000-000000000006';
  material uuid:='c2150000-0000-4000-8000-000000000007';
  preorder uuid:='c2150000-0000-4000-8000-000000000008';
  item uuid:='c2150000-0000-4000-8000-000000000009';
  items jsonb; valued jsonb; result jsonb; blocked boolean; before_fin integer; before_mov integer;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',seller,'authenticated','authenticated','value-seller@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',cashier,'authenticated','authenticated','value-cashier@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',screen_only,'authenticated','authenticated','value-screen@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',legacy,'authenticated','authenticated','value-legacy@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Valoriza','active');
  UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(seller,cashier,screen_only,legacy);
  INSERT INTO public.user_roles(user_id,role) VALUES(seller,'comercial'),(cashier,'comercial'),(screen_only,'comercial'),(legacy,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (seller,'["screen:pdv"]',true),
    (cashier,'["screen:pdv_orders","fn:value_pdv_preorder","fn:convert_pdv_preorder"]',true),
    (screen_only,'["screen:pdv_orders"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv');
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Loja',true);
  INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price) VALUES(material,c,'VAL-1','Material','un',10,4);
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,material,stock,10,true);

  -- Role legado conserva acesso de tela, mas nao ganha capacidade sensivel por fallback.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',legacy,'role','authenticated')::text,true);
  blocked:=false; BEGIN
    PERFORM public.pdv_save_preorder_v2(
      gen_random_uuid(),0,jsonb_build_object('stock_id',stock),
      jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'item_type','service','description','Preço livre','quantity',1,'unit_price',10,'discount_amount',0,'unit_factor',1,'sort_order',0)),
      'legacy-price-001'
    );
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'role legado definiu preco sem permissao explicita'; END IF;

  items:=jsonb_build_array(jsonb_build_object(
    'id',item,'inventory_id',material,'item_type','material','description','Material',
    'quantity',2,'unit_price',NULL,'discount_amount',0,'unit_factor',1,'sort_order',0
  ));
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',seller,'role','authenticated')::text,true);
  result:=public.pdv_save_preorder_v2(preorder,0,jsonb_build_object('stock_id',stock),items,'value-save-0001');
  result:=public.pdv_forward_preorder_v2(preorder,1,'value-forward-1');

  valued:=jsonb_build_array(jsonb_build_object('id',item,'unit_price',10,'discount_amount',0));
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',legacy,'role','authenticated')::text,true);
  blocked:=false; BEGIN
    PERFORM public.pdv_value_preorder_v2(preorder,2,'{}'::jsonb,valued,'value-legacy-01');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'role legado valorizou sem permissao explicita'; END IF;
  blocked:=false; BEGIN
    PERFORM public.pdv_convert_preorder_v2(preorder,2,'convert-legacy-1');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'role legado converteu sem permissao explicita'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',screen_only,'role','authenticated')::text,true);
  blocked:=false; BEGIN
    PERFORM public.pdv_value_preorder_v2(preorder,2,'{}'::jsonb,valued,'value-screen-01');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'screen sem capacidade valorizou'; END IF;
  blocked:=false; BEGIN
    PERFORM public.pdv_convert_preorder_v2(preorder,2,'convert-screen-1');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'screen sem capacidade converteu'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',cashier,'role','authenticated')::text,true);
  SELECT count(*) INTO before_fin FROM public.financial_transactions WHERE company_id=c;
  SELECT count(*) INTO before_mov FROM public.inventory_movements WHERE company_id=c;
  result:=public.pdv_value_preorder_v2(preorder,2,jsonb_build_object('discount_amount',1),valued,'value-authorized');
  IF (result->>'revision')::int<>3 OR (result->>'has_missing_prices')::boolean THEN RAISE EXCEPTION 'valorizacao autorizada incorreta'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_preorders WHERE id=preorder AND status='encaminhado' AND subtotal=20 AND discount_amount=1 AND total=19) THEN RAISE EXCEPTION 'valorizacao nao persistiu total/estado'; END IF;
  result:=public.pdv_value_preorder_v2(preorder,2,jsonb_build_object('discount_amount',1),valued,'value-authorized');
  IF (result->>'revision')::int<>3 THEN RAISE EXCEPTION 'retry de valorizacao avancou revisao'; END IF;
  blocked:=false; BEGIN
    PERFORM public.pdv_value_preorder_v2(preorder,2,jsonb_build_object('discount_amount',1),valued,'value-stale-001');
  EXCEPTION WHEN serialization_failure THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'CAS obsoleto valorizou'; END IF;

  result:=public.pdv_convert_preorder_v2(preorder,3,'value-convert-1');
  IF result->>'order_id' IS NULL THEN RAISE EXCEPTION 'caixa autorizado nao converteu'; END IF;
  IF (SELECT count(*) FROM public.financial_transactions WHERE company_id=c)<>before_fin
     OR (SELECT count(*) FROM public.inventory_movements WHERE company_id=c)<>before_mov
     OR EXISTS(SELECT 1 FROM public.pdv_deliveries WHERE order_id=(result->>'order_id')::uuid) THEN
    RAISE EXCEPTION 'valorizar/converter criou fato financeiro, fisico ou entrega';
  END IF;
END $behavior$;

ROLLBACK;

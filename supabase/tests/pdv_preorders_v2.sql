-- Smoke W2-01: pre-pedido operacional, CAS, idempotencia e conversao unica.
BEGIN;

DO $contract$
DECLARE f text;
BEGIN
  IF to_regclass('public.pdv_preorders') IS NULL OR to_regclass('public.pdv_preorder_items') IS NULL THEN
    RAISE EXCEPTION 'estruturas de pre-pedido ausentes';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.pdv_preorders'::regclass AND relrowsecurity AND relforcerowsecurity)
     OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.pdv_preorder_items'::regclass AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'RLS FORCE ausente';
  END IF;
  IF has_table_privilege('authenticated','public.pdv_preorders','SELECT')
     OR has_table_privilege('authenticated','public.pdv_preorder_items','INSERT')
     OR has_table_privilege('service_role','public.pdv_preorders','SELECT') THEN
    RAISE EXCEPTION 'grant direto indevido';
  END IF;
  FOREACH f IN ARRAY ARRAY[
    'public.pdv_save_preorder_v2(uuid,bigint,jsonb,jsonb,text)',
    'public.pdv_forward_preorder_v2(uuid,bigint,text)',
    'public.pdv_cancel_preorder_v2(uuid,bigint,text)',
    'public.pdv_convert_preorder_v2(uuid,bigint,text)',
    'public.pdv_list_preorders_v2(text)',
    'public.pdv_get_preorder_v2(uuid)'
  ] LOOP
    IF has_function_privilege('anon',f,'EXECUTE') OR NOT has_function_privilege('authenticated',f,'EXECUTE') THEN
      RAISE EXCEPTION 'ACL publica incorreta: %',f;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated','public.next_pdv_preorder_number_v2(uuid)','EXECUTE')
     OR has_function_privilege('service_role','public.pdv_preorder_access_company_v2()','EXECUTE')
     OR has_function_privilege('authenticated','public.pdv_has_explicit_action_permission_v2(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'helper interno exposto';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.pdv_stock_reservation_items'::regclass AND conname='pdv_stock_reservation_items_preorder_item_id_fkey') THEN
    RAISE EXCEPTION 'FK canonica da reserva antecipada ausente';
  END IF;
END $contract$;

DO $behavior$
DECLARE
  c uuid:='c2000000-0000-4000-8000-000000000001'; c2 uuid:='c2000000-0000-4000-8000-000000000002';
  u uuid:='c2000000-0000-4000-8000-000000000003'; u2 uuid:='c2000000-0000-4000-8000-000000000004'; u3 uuid:='c2000000-0000-4000-8000-000000000005';
  s uuid:='c2000000-0000-4000-8000-000000000011'; i uuid:='c2000000-0000-4000-8000-000000000021';
  p uuid:='c2000000-0000-4000-8000-000000000031'; p2 uuid:='c2000000-0000-4000-8000-000000000032';
  p3 uuid:='c2000000-0000-4000-8000-000000000033'; p_pending uuid:='c2000000-0000-4000-8000-000000000034';
  pi uuid:='c2000000-0000-4000-8000-000000000041'; si uuid:='c2000000-0000-4000-8000-000000000042'; fi uuid:='c2000000-0000-4000-8000-000000000043';
  r public.pdv_stock_reservation_items; result jsonb; order_id uuid; admin_order_id uuid:=gen_random_uuid(); blocked boolean; n integer;
  items_missing jsonb; items_retry jsonb; items_priced jsonb; pending_header jsonb; pending_items jsonb; pending_payload jsonb; before_fin integer; before_mov integer;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  VALUES
  ('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','pre-a@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','',''),
  ('00000000-0000-0000-8000-000000000000',u2,'authenticated','authenticated','pre-b@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  VALUES('00000000-0000-0000-0000-000000000000',u3,'authenticated','authenticated','pre-c@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Pre A','active'),(c2,'Pre B','active');
  UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id=u;
  UPDATE public.profiles SET company_id=c2,is_active=true WHERE user_id=u2;
  UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id=u3;
  INSERT INTO public.user_roles(user_id,role) VALUES(u,'admin'),(u2,'comercial'),(u3,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (u2,'["screen:pdv"]',true),
    (u3,'["screen:pdv","screen:pdv_orders","fn:convert_pdv_preorder"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv'),(c2,'pdv');
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(s,c,'Principal',true);
  INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price) VALUES(i,c,'PRE-M','Material','un',5,30);
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present) VALUES(c,i,s,5,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);

  items_missing:=jsonb_build_array(
    jsonb_build_object('id',pi,'inventory_id',i,'item_type','material','description','Material','quantity',2.345,'unit_price',NULL,'discount_amount',0,'unit_factor',1,'sort_order',0),
    jsonb_build_object('id',si,'item_type','service','description','Serviço grátis','quantity',1,'unit_price',0,'discount_amount',0,'unit_factor',1,'sort_order',1),
    jsonb_build_object('id',fi,'item_type','free_item','description','Item livre','quantity',1,'unit_price',1,'discount_amount',0,'unit_factor',1,'sort_order',2)
  );
  -- Usuario de balcao sem capacidade de valorizar nao inventa preco de servico.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u3,'role','authenticated')::text,true);
  blocked:=false;
  BEGIN
    PERFORM public.pdv_save_preorder_v2(gen_random_uuid(),0,jsonb_build_object('stock_id',s,'operation_mode','counter','discount_amount',0),jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'item_type','service','description','Preço livre','quantity',1,'unit_price',10,'discount_amount',0,'unit_factor',1,'sort_order',0)),'save-value-denied');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'balcao sem capacidade alterou preco'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);

  -- Replay ainda pendente falha fechado e nao inicia a escrita.
  pending_header:=jsonb_build_object('stock_id',s,'operation_mode','counter','discount_amount',0);
  pending_items:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'item_type','service','description','Pendente','quantity',1,'unit_price',NULL,'discount_amount',0,'unit_factor',1,'sort_order',0));
  pending_payload:=jsonb_build_object(
    'id',p_pending,'revision',0,
    'header',jsonb_build_object('customer_id',NULL,'stock_id',s,'assigned_to',NULL,'operation_mode','counter','notes',NULL,'discount_amount',0),
    'items',jsonb_build_array(jsonb_build_object(
      'id',(pending_items->0->>'id')::uuid,'inventory_id',NULL,'item_type','service','description','Pendente',
      'quantity',1,'unit_price',NULL,'discount_amount',0,'unit_factor',1,'sort_order',0
    ))
  );
  INSERT INTO public.pdv_operation_requests(company_id,operation_type,idempotency_key,payload_hash)
  VALUES(c,'preorder.save','save-pending-0001',public.pdv_operation_payload_hash(pending_payload));
  blocked:=false;
  BEGIN PERFORM public.pdv_save_preorder_v2(p_pending,0,pending_header,pending_items,'save-pending-0001');
  EXCEPTION WHEN SQLSTATE '55000' THEN blocked:=true; END;
  IF NOT blocked OR EXISTS(SELECT 1 FROM public.pdv_preorders WHERE id=p_pending) THEN RAISE EXCEPTION 'replay pendente continuou a escrita'; END IF;

  result:=public.pdv_save_preorder_v2(p,0,jsonb_build_object('stock_id',s,'operation_mode','counter','discount_amount',0),items_missing,'save-pre-0001');
  IF (result->>'revision')::int<>1 OR NOT (result->>'has_missing_prices')::boolean THEN RAISE EXCEPTION 'create nao preservou preco ausente'; END IF;

  -- Outra chave com expectativa de criação não sobrescreve a entidade já criada.
  blocked:=false;
  BEGIN PERFORM public.pdv_save_preorder_v2(p,0,jsonb_build_object('stock_id',s,'operation_mode','counter','discount_amount',0),items_missing,'save-create-race');
  EXCEPTION WHEN serialization_failure THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'segunda criacao nao virou conflito de revisao'; END IF;

  -- Os demais writers também falham fechado ao reencontrar request pendente.
  INSERT INTO public.pdv_operation_requests(company_id,operation_type,idempotency_key,payload_hash) VALUES
    (c,'preorder.forward','forward-pending',public.pdv_operation_payload_hash(jsonb_build_object('id',p,'revision',1))),
    (c,'preorder.cancel','cancel-pending-1',public.pdv_operation_payload_hash(jsonb_build_object('id',p,'revision',1))),
    (c,'preorder.convert','convert-pending',public.pdv_operation_payload_hash(jsonb_build_object('id',p,'revision',1)));
  blocked:=false; BEGIN PERFORM public.pdv_forward_preorder_v2(p,1,'forward-pending'); EXCEPTION WHEN SQLSTATE '55000' THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'forward retomou request pendente'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_cancel_preorder_v2(p,1,'cancel-pending-1'); EXCEPTION WHEN SQLSTATE '55000' THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'cancel retomou request pendente'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_convert_preorder_v2(p,1,'convert-pending'); EXCEPTION WHEN SQLSTATE '55000' THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'convert retomou request pendente'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_preorders WHERE id=p AND revision=1 AND status='edicao') THEN RAISE EXCEPTION 'writer pendente alterou pre-pedido'; END IF;

  -- Retry semanticamente igual ignora ordem do array, defaults omitidos e 1 vs 1.0.
  items_retry:=jsonb_build_array(
    (items_missing->2)-'unit_factor'-'discount_amount',
    (items_missing->0)-'unit_factor'-'discount_amount',
    jsonb_set((items_missing->1)-'unit_factor'-'discount_amount','{quantity}','1.0'::jsonb)
  );
  result:=public.pdv_save_preorder_v2(p,0,jsonb_build_object('stock_id',s),items_retry,'save-pre-0001');
  IF (result->>'revision')::int<>1 THEN RAISE EXCEPTION 'retry avancou revisao'; END IF;
  blocked:=false;
  BEGIN
    PERFORM public.pdv_save_preorder_v2(p,0,jsonb_build_object('stock_id',s,'notes','mudou','operation_mode','counter','discount_amount',0),items_missing,'save-pre-0001');
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'chave aceitou payload divergente'; END IF;

  r:=public.pdv_reserve_stock_internal_v2(c,i,s,NULL,pi,2.345,'early',now()+interval '24 hours',1);
  blocked:=false;
  BEGIN
    PERFORM public.pdv_save_preorder_v2(p,1,jsonb_build_object('stock_id',s,'operation_mode','counter','discount_amount',0),jsonb_build_array(items_missing->1),'save-remove-reserved');
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'item reservado foi removido sem liberar reserva'; END IF;

  items_priced:=jsonb_set(items_missing,'{0,unit_price}','10.01'::jsonb);
  result:=public.pdv_save_preorder_v2(p,1,jsonb_build_object('stock_id',s,'operation_mode','counter','discount_amount',1),items_priced,'save-pre-0002');
  IF (result->>'revision')::int<>2 OR (result->>'has_missing_prices')::boolean THEN RAISE EXCEPTION 'zero/preco definido ficou ausente'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_preorders WHERE id=p AND subtotal=24.47 AND discount_amount=1 AND total=23.47) THEN RAISE EXCEPTION 'total fracionario nao foi congelado em centavos'; END IF;

  blocked:=false;
  BEGIN PERFORM public.pdv_save_preorder_v2(p,1,jsonb_build_object('stock_id',s,'operation_mode','counter','discount_amount',1),items_priced,'save-pre-stale');
  EXCEPTION WHEN serialization_failure THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'CAS obsoleto sobrescreveu pre-pedido'; END IF;

  result:=public.pdv_forward_preorder_v2(p,2,'forward-pre-0001');
  IF result->>'status'<>'encaminhado' OR (result->>'revision')::int<>3 THEN RAISE EXCEPTION 'encaminhamento incorreto'; END IF;

  SELECT count(*) INTO before_fin FROM public.financial_transactions WHERE company_id=c;
  SELECT count(*) INTO before_mov FROM public.inventory_movements WHERE company_id=c;
  -- A fila encaminhada e compartilhada com o caixa autorizado, sem atribuição manual.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u3,'role','authenticated')::text,true);
  IF NOT EXISTS(SELECT 1 FROM public.pdv_list_preorders_v2('encaminhado') q WHERE q.id=p) THEN RAISE EXCEPTION 'caixa autorizado nao recebeu fila encaminhada'; END IF;
  result:=public.pdv_convert_preorder_v2(p,3,'convert-pre-0001'); order_id:=(result->>'order_id')::uuid;
  IF (result->>'already_converted')::boolean OR order_id IS NULL THEN RAISE EXCEPTION 'conversao nao criou pedido'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_orders WHERE id=order_id AND source_preorder_id=p AND contract_version=2 AND operation_mode_snapshot='counter') THEN RAISE EXCEPTION 'pedido v2 sem origem/mode'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_stock_reservation_items x JOIN public.pdv_order_items oi ON oi.id=x.order_item_id WHERE x.id=r.id AND x.preorder_item_id IS NULL AND oi.order_id=order_id AND x.reservation_kind='coverage') THEN RAISE EXCEPTION 'reserva nao migrou atomicamente'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_order_items oi WHERE oi.order_id=order_id AND oi.inventory_id=i AND oi.gross_total_v2=23.47 AND oi.line_discount_amount_v2=0 AND oi.order_discount_allocated_v2=.96 AND oi.total=22.51 AND oi.unit_cost_v2=30) THEN RAISE EXCEPTION 'pedido nao preservou total/custo snapshot'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_order_items oi WHERE oi.order_id=order_id AND oi.item_type='free_item' AND oi.order_discount_allocated_v2=.04 AND oi.total=.96) THEN RAISE EXCEPTION 'maior resto nao conciliou desconto geral'; END IF;
  IF (SELECT sum(oi.total) FROM public.pdv_order_items oi WHERE oi.order_id=order_id)<>23.47 THEN RAISE EXCEPTION 'soma dos itens divergiu do pedido'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_order_items oi WHERE oi.order_id=order_id AND oi.item_type='service' AND oi.unit_cost=0 AND oi.unit_cost_v2 IS NULL) THEN RAISE EXCEPTION 'servico sem fonte virou custo zero conhecido'; END IF;
  IF (SELECT count(*) FROM public.financial_transactions WHERE company_id=c)<>before_fin OR (SELECT count(*) FROM public.inventory_movements WHERE company_id=c)<>before_mov OR EXISTS(SELECT 1 FROM public.pdv_deliveries WHERE order_id=order_id) THEN RAISE EXCEPTION 'conversao criou financeiro/estoque/entrega'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  result:=public.pdv_convert_preorder_v2(p,3,'convert-pre-0002');
  IF NOT (result->>'already_converted')::boolean OR (result->>'order_id')::uuid<>order_id THEN RAISE EXCEPTION 'dupla conversao nao recuperou pedido'; END IF;
  SELECT count(*) INTO n FROM public.pdv_orders WHERE source_preorder_id=p; IF n<>1 THEN RAISE EXCEPTION 'dupla conversao criou dois pedidos'; END IF;

  -- Outro tenant nao enxerga nem conhece o pre-pedido.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u2,'role','authenticated')::text,true);
  IF EXISTS(SELECT 1 FROM public.pdv_list_preorders_v2(NULL)) THEN RAISE EXCEPTION 'outro tenant listou pre-pedido'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_get_preorder_v2(p); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'outro tenant abriu pre-pedido'; END IF;

  -- Reset remove convertido e um pre-pedido ainda nao convertido.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  PERFORM public.pdv_save_preorder_v2(p2,0,jsonb_build_object('stock_id',s,'operation_mode','counter','discount_amount',0),jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'item_type','service','description','Outro','quantity',1,'unit_price',NULL,'discount_amount',0,'unit_factor',1,'sort_order',0)),'save-pre-reset');
  PERFORM public.reset_system_step(c,'pdv',NULL);
  IF EXISTS(SELECT 1 FROM public.pdv_preorders WHERE company_id=c) OR EXISTS(SELECT 1 FROM public.pdv_preorder_number_counters WHERE company_id=c) THEN RAISE EXCEPTION 'reset nao limpou pre-pedidos'; END IF;

  -- Exclusao administrativa real remove a origem antes do pedido convertido.
  INSERT INTO public.pdv_preorders(id,company_id,number,status,operation_mode,created_by,forwarded_at)
  VALUES(p3,c,999,'encaminhado','counter',u,now());
  INSERT INTO public.pdv_orders(id,company_id,number,status,source_preorder_id,contract_version,operation_mode_snapshot)
  VALUES(admin_order_id,c,999,'aguardando_pagamento',p3,2,'counter');
  UPDATE public.pdv_preorders SET status='convertido',converted_order_id=admin_order_id,converted_at=now() WHERE id=p3;
  UPDATE public.user_roles SET role='super_admin' WHERE user_id=u;
  PERFORM public.admin_delete_company(c);
  IF EXISTS(SELECT 1 FROM public.companies WHERE id=c) OR EXISTS(SELECT 1 FROM public.pdv_preorders WHERE id=p3) OR EXISTS(SELECT 1 FROM public.pdv_orders WHERE id=admin_order_id) THEN
    RAISE EXCEPTION 'admin_delete_company nao concluiu lifecycle de pre-pedido convertido';
  END IF;
END $behavior$;

ROLLBACK;

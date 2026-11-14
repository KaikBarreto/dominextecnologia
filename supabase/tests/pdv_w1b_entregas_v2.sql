-- Smoke W1B-03. Executar apos supabase db reset.
BEGIN;

DO $contract$
BEGIN
  IF has_table_privilege('authenticated','public.pdv_deliveries','SELECT')
     OR has_table_privilege('service_role','public.pdv_delivery_items','INSERT')
     OR has_function_privilege('authenticated','public.pdv_complete_delivery_internal_v2(uuid,uuid,uuid,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'entrega v2 exposta diretamente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.pdv_deliveries'::regclass AND relrowsecurity AND relforcerowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.pdv_delivery_items'::regclass AND relrowsecurity AND relforcerowsecurity)
  THEN RAISE EXCEPTION 'RLS FORCE ausente nas entregas'; END IF;
END
$contract$;

DO $behavior$
DECLARE
  c uuid := 'b3000000-0000-4000-8000-000000000001';
  c2 uuid := 'b3000000-0000-4000-8000-000000000002';
  u uuid := 'b3000000-0000-4000-8000-000000000003';
  s uuid := 'b3000000-0000-4000-8000-000000000011';
  i uuid := 'b3000000-0000-4000-8000-000000000021';
  o uuid := 'b3000000-0000-4000-8000-000000000031';
  mi uuid := 'b3000000-0000-4000-8000-000000000041';
  si uuid := 'b3000000-0000-4000-8000-000000000042';
  r public.pdv_stock_reservation_items;
  result jsonb;
  req1 uuid := 'b3000000-0000-4000-8000-000000000051';
  blocked boolean;
  n integer;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  VALUES('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','w1b3@example.invalid','',now(),
    '{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'W1B3','active'),(c2,'W1B3 B','active');
  UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id=u;
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv');
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(s,c,'Principal',true);
  INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price)
    VALUES(i,c,'W1B3-M','Material custo desconhecido','un',5,NULL);
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present)
    VALUES(c,i,s,5,true);
  INSERT INTO public.pdv_orders(id,company_id,number,stock_id) VALUES(o,c,930001,s);
  INSERT INTO public.pdv_order_items(id,company_id,order_id,inventory_id,description,quantity,item_type,unit_cost_v2,contract_version)
    VALUES(mi,c,o,i,'Material',5,'material',NULL,2),
          (si,c,o,NULL,'Serviço',1,'service',0,2);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  r := public.pdv_reserve_stock_internal_v2(c,i,s,mi,NULL,5);
  IF r.cost_price_snapshot IS NOT NULL THEN RAISE EXCEPTION 'custo desconhecido virou zero'; END IF;

  blocked := false;
  BEGIN
    PERFORM public.pdv_complete_delivery_internal_v2(c,o,gen_random_uuid(),jsonb_build_array(
      jsonb_build_object('order_item_id',mi,'quantity',1)));
  EXCEPTION WHEN invalid_parameter_value THEN
    blocked := SQLERRM = 'Informe a reserva e o local usados para entregar este material.';
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'material sem reservation_id escolheu reserva arbitraria'; END IF;

  result := public.pdv_complete_delivery_internal_v2(c,o,req1,jsonb_build_array(
    jsonb_build_object('order_item_id',si,'quantity',1.0),
    jsonb_build_object('order_item_id',mi,'reservation_id',r.id,'quantity',2.0)));
  IF (result->>'already_completed')::boolean THEN RAISE EXCEPTION 'primeira entrega marcada retry'; END IF;

  result := public.pdv_complete_delivery_internal_v2(c,o,req1,jsonb_build_array(
    jsonb_build_object('order_item_id',mi,'reservation_id',r.id,'quantity',2),
    jsonb_build_object('order_item_id',si,'quantity',1)));
  IF NOT (result->>'already_completed')::boolean OR jsonb_array_length(result->'items') <> 2 THEN
    RAISE EXCEPTION 'retry duplicou entrega ou mudou shape';
  END IF;

  result := public.pdv_complete_delivery_internal_v2(c,o,gen_random_uuid(),jsonb_build_array(
    jsonb_build_object('order_item_id',mi,'reservation_id',r.id,'quantity',2)));

  blocked := false;
  BEGIN
    PERFORM public.pdv_complete_delivery_internal_v2(c,o,gen_random_uuid(),jsonb_build_array(
      jsonb_build_object('order_item_id',mi,'reservation_id',r.id,'quantity',2)));
  EXCEPTION WHEN check_violation THEN
    blocked := SQLERRM = 'A quantidade informada supera o saldo ainda disponível para entrega.';
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'overdelivery concorrente nao bloqueado'; END IF;

  PERFORM public.pdv_complete_delivery_internal_v2(c,o,gen_random_uuid(),jsonb_build_array(
    jsonb_build_object('order_item_id',mi,'reservation_id',r.id,'quantity',1)));

  SELECT count(*) INTO n FROM public.inventory_movements m
   WHERE m.inventory_id=i AND m.notes LIKE 'Entrega PDV v2 %';
  IF n <> 3 OR (SELECT quantity FROM public.inventory_stock_levels WHERE inventory_id=i AND stock_id=s) <> 0
     OR (SELECT consumed_quantity FROM public.pdv_stock_reservation_items WHERE id=r.id) <> 5
     OR (SELECT state FROM public.pdv_stock_reservation_items WHERE id=r.id) <> 'consumed'
  THEN RAISE EXCEPTION 'entregas parciais nao fecharam Kardex/reserva uma vez'; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.pdv_delivery_items WHERE order_item_id=si AND unit_cost_snapshot=0 AND inventory_movement_id IS NULL)
     OR EXISTS(SELECT 1 FROM public.pdv_delivery_items WHERE order_item_id=mi AND unit_cost_snapshot IS NOT NULL)
  THEN RAISE EXCEPTION 'NULL/zero ou servico sem estoque incorreto'; END IF;

  blocked := false;
  BEGIN
    PERFORM public.pdv_complete_delivery_internal_v2(c2,o,gen_random_uuid(),jsonb_build_array(
      jsonb_build_object('order_item_id',mi,'reservation_id',r.id,'quantity',1)));
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'tenant cruzado entregou pedido'; END IF;

  blocked := false;
  BEGIN
    UPDATE public.pdv_deliveries SET created_at=now() WHERE order_id=o;
  EXCEPTION WHEN check_violation THEN
    blocked := SQLERRM LIKE 'Entregas confirmadas não podem%';
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'evento de entrega deixou de ser append-only'; END IF;

  IF EXISTS (SELECT 1 FROM public.financial_transactions WHERE company_id=c)
     OR EXISTS (SELECT 1 FROM public.pdv_cash_custody_entries WHERE company_id=c) THEN
    RAISE EXCEPTION 'entrega W1B-03 criou efeito financeiro/custodia antes de W1C';
  END IF;

  blocked := false;
  BEGIN
    DELETE FROM public.pdv_stock_reservation_items WHERE id=r.id;
  EXCEPTION WHEN check_violation THEN
    blocked := SQLERRM = 'Reservas de estoque não podem ser excluídas fora do processo de zerar o sistema.';
  END;
  IF NOT blocked OR NOT EXISTS (SELECT 1 FROM public.pdv_stock_reservation_items WHERE id=r.id) THEN
    RAISE EXCEPTION 'reserva pôde ser excluída fora do expurgo nominal';
  END IF;

  -- Valvula nominal do Zerar Sistema permite somente o expurgo desta empresa.
  PERFORM set_config('app.pdv_purge_company',c::text,true);
  DELETE FROM public.pdv_orders WHERE id=o;
  PERFORM set_config('app.pdv_purge_company','',true);
  IF EXISTS (SELECT 1 FROM public.pdv_deliveries WHERE order_id=o)
     OR EXISTS (SELECT 1 FROM public.pdv_delivery_items WHERE company_id=c)
     OR EXISTS (SELECT 1 FROM public.pdv_stock_reservation_items WHERE id=r.id)
     OR EXISTS (SELECT 1 FROM public.pdv_orders WHERE id=o) THEN
    RAISE EXCEPTION 'reset nominal deixou fragmentos de entrega';
  END IF;
END
$behavior$;

ROLLBACK;

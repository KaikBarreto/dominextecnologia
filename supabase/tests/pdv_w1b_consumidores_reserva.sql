-- Smoke W1B-02: consumidores negativos respeitam reserva; inventario soberano
-- transforma deficit em conflito. Executar apos `supabase db reset`.

BEGIN;

DO $contract$
DECLARE
  v_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.inventory_stock_levels'::regclass
       AND tgname = 'trg_pdv_guard_reserved_stock_level_v2'
       AND NOT tgisinternal
       AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'guard de reserva ausente no saldo fisico';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.inventory_stock_levels'::regclass
       AND tgname = 'trg_pdv_guard_reserved_stock_level_delete_v2'
       AND NOT tgisinternal
       AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'guard de exclusao com reserva ausente';
  END IF;

  IF has_function_privilege(
       'authenticated', 'public.pdv_consume_stock_reservation_internal_v2(uuid,uuid,numeric)', 'EXECUTE'
     ) OR has_function_privilege(
       'service_role', 'public.pdv_consume_stock_reservation_internal_v2(uuid,uuid,numeric)', 'EXECUTE'
     ) OR has_function_privilege(
       'authenticated', 'public.pdv_reconcile_reservations_for_count_internal_v2(uuid,uuid,uuid,numeric,uuid)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'primitiva interna W1B-02 exposta a role da API';
  END IF;

  IF NOT has_function_privilege(
       'authenticated', 'public.register_inventory_movement(uuid,text,numeric,uuid,numeric,text,uuid,uuid,uuid)', 'EXECUTE'
     ) OR NOT has_function_privilege(
       'authenticated', 'public.transfer_stock_between(uuid,uuid,uuid,numeric,text,text)', 'EXECUTE'
     ) OR NOT has_function_privilege(
       'authenticated', 'public.commit_os_material_consumption(uuid,jsonb)', 'EXECUTE'
     ) OR NOT has_function_privilege(
       'authenticated', 'public.finalize_inventory_count(uuid,text)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'ACL publica preexistente nao foi preservada';
  END IF;

  SELECT pg_get_functiondef(
    'public.commit_os_material_consumption(uuid,jsonb)'::regprocedure
  ) INTO v_definition;
  IF v_definition NOT LIKE '%SELECT DISTINCT%inventory_id%stock_id%'
     OR v_definition NOT LIKE '%ORDER BY r.inventory_id, r.stock_id, r.created_at, r.id%'
     OR v_definition NOT LIKE '%WITH ORDINALITY%ORDER BY ordinal%'
  THEN
    RAISE EXCEPTION 'commit de OS nao materializa/deduplica/ordena pares';
  END IF;

  SELECT pg_get_functiondef(
    'public.finalize_inventory_count(uuid,text)'::regprocedure
  ) INTO v_definition;
  IF v_definition NOT LIKE '%pdv_reconcile_reservations_for_count_internal_v2%'
     OR v_definition NOT LIKE '%ORDER BY sl.inventory_id, sl.stock_id%'
  THEN
    RAISE EXCEPTION 'inventario nao pre-locka/reconcilia reservas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc function_row
     WHERE function_row.oid = 'public.commit_os_material_consumption(uuid,jsonb)'::regprocedure
       AND function_row.prosecdef
       AND 'search_path=pg_catalog, public, extensions' = ANY(function_row.proconfig)
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc function_row
     WHERE function_row.oid = 'public.finalize_inventory_count(uuid,text)'::regprocedure
       AND function_row.prosecdef
       AND 'search_path=pg_catalog, public, extensions' = ANY(function_row.proconfig)
  ) THEN
    RAISE EXCEPTION 'writers publicos devem fixar search_path seguro';
  END IF;
END
$contract$;

DO $behavior$
DECLARE
  v_company_a uuid := 'b2000000-0000-4000-8000-000000000001';
  v_company_b uuid := 'b2000000-0000-4000-8000-000000000002';
  v_company_c uuid := 'b2000000-0000-4000-8000-000000000006';
  v_user_a uuid := 'b2000000-0000-4000-8000-000000000003';
  v_user_b uuid := 'b2000000-0000-4000-8000-000000000004';
  v_manager_a uuid := 'b2000000-0000-4000-8000-000000000007';
  v_tech_unassigned uuid := 'b2000000-0000-4000-8000-000000000008';
  v_customer_a uuid := 'b2000000-0000-4000-8000-000000000005';
  v_stock_a uuid := 'b2000000-0000-4000-8000-000000000011';
  v_stock_a2 uuid := 'b2000000-0000-4000-8000-000000000012';
  v_stock_b uuid := 'b2000000-0000-4000-8000-000000000013';
  v_stock_c uuid := 'b2000000-0000-4000-8000-000000000014';
  v_inventory_a uuid := 'b2000000-0000-4000-8000-000000000021';
  -- O material novo da troca tem UUID menor que o antigo de proposito.
  v_inventory_free uuid := 'b2000000-0000-4000-8000-000000000020';
  v_inventory_b uuid := 'b2000000-0000-4000-8000-000000000023';
  v_inventory_swap_old uuid := 'b2000000-0000-4000-8000-000000000024';
  v_inventory_c uuid := 'b2000000-0000-4000-8000-000000000025';
  v_order_a uuid := 'b2000000-0000-4000-8000-000000000031';
  v_order_item_a uuid := 'b2000000-0000-4000-8000-000000000032';
  v_order_c uuid := 'b2000000-0000-4000-8000-000000000033';
  v_order_item_c uuid := 'b2000000-0000-4000-8000-000000000034';
  v_os_a uuid := 'b2000000-0000-4000-8000-000000000041';
  v_count_a uuid := 'b2000000-0000-4000-8000-000000000051';
  v_os_line uuid;
  v_reservation public.pdv_stock_reservation_items;
  v_movement public.inventory_movements;
  v_result jsonb;
  v_availability record;
  v_blocked boolean;
  v_quantity numeric;
  v_issue_count integer;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000', v_user_a,
      'authenticated', 'authenticated', 'w1b2-a@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Teste W1B2 A"}'::jsonb, now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_user_b,
      'authenticated', 'authenticated', 'w1b2-b@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Teste W1B2 B"}'::jsonb, now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_manager_a,
      'authenticated', 'authenticated', 'w1b2-manager@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Gestor W1B2"}'::jsonb, now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_tech_unassigned,
      'authenticated', 'authenticated', 'w1b2-tech@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Tecnico W1B2"}'::jsonb, now(), now(), '', '', '', ''
    );

  INSERT INTO public.companies (id, name, subscription_status, subscription_expires_at)
  VALUES
    (v_company_a, 'Empresa W1B2 A', 'active', NULL),
    (v_company_b, 'Empresa W1B2 B', 'active', NULL);

  UPDATE public.profiles SET company_id = v_company_a, is_active = true
   WHERE user_id = v_user_a;
  UPDATE public.profiles SET company_id = v_company_b, is_active = true
   WHERE user_id = v_user_b;
  UPDATE public.profiles SET company_id = v_company_a, is_active = true
   WHERE user_id IN (v_manager_a, v_tech_unassigned);

  INSERT INTO public.user_roles(user_id,role) VALUES
    (v_user_a,'tecnico'),(v_user_b,'tecnico'),
    (v_manager_a,'gestor'),(v_tech_unassigned,'tecnico');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (v_user_a,'["screen:inventory","fn:manage_inventory"]',true),
    (v_user_b,'["screen:inventory","fn:manage_inventory"]',true),
    (v_manager_a,'["screen:service_orders"]',true),
    (v_tech_unassigned,'["screen:service_orders","fn:edit_os"]',true);

  INSERT INTO public.company_modules (company_id, module_code)
  VALUES
    (v_company_a, 'basic'), (v_company_a, 'pdv'),
    (v_company_b, 'basic'), (v_company_b, 'pdv');

  INSERT INTO public.customers (id, company_id, name, customer_type)
  VALUES (v_customer_a, v_company_a, 'Cliente W1B2', 'pj');

  INSERT INTO public.stocks (id, company_id, name, is_default)
  VALUES
    (v_stock_a, v_company_a, 'Principal A', true),
    (v_stock_a2, v_company_a, 'Secundario A', false),
    (v_stock_b, v_company_b, 'Principal B', true);

  INSERT INTO public.inventory (
    id, company_id, sku, name, unit, quantity, cost_price
  ) VALUES
    (v_inventory_a, v_company_a, 'W1B2-A', 'Material reservado', 'un', 10, 30),
    (v_inventory_free, v_company_a, 'W1B2-F', 'Material sem reserva', 'un', 0, 5),
    (v_inventory_b, v_company_b, 'W1B2-B', 'Material outro tenant', 'un', 3, 9),
    (v_inventory_swap_old, v_company_a, 'W1B2-O', 'Material antigo da troca', 'un', 3, 7);

  INSERT INTO public.inventory_stock_levels (
    company_id, inventory_id, stock_id, quantity, is_present
  ) VALUES
    (v_company_a, v_inventory_a, v_stock_a, 10, true),
    (v_company_a, v_inventory_a, v_stock_a2, 0, true),
    (v_company_a, v_inventory_free, v_stock_a, 0, true),
    (v_company_b, v_inventory_b, v_stock_b, 3, true),
    (v_company_a, v_inventory_swap_old, v_stock_a, 3, true);

  INSERT INTO public.pdv_orders (id, company_id, number, stock_id)
  VALUES (v_order_a, v_company_a, 920001, v_stock_a);
  INSERT INTO public.pdv_order_items (
    id, company_id, order_id, inventory_id, description, quantity
  ) VALUES (
    v_order_item_a, v_company_a, v_order_a, v_inventory_a, 'Material reservado', 8
  );

  INSERT INTO public.service_orders (
    id, company_id, customer_id, description, origin, os_type, status,
    technician_id, created_by
  ) VALUES (
    v_os_a, v_company_a, v_customer_a, 'OS teste reserva', 'manual',
    'manutencao_corretiva', 'pendente', v_user_a, v_user_a
  );

  -- Gestor precisa de tela + ação; técnico de campo sem posse/atribuição não
  -- herda autorização apenas por ter a permissão de edição.
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'sub',v_manager_a,'role','authenticated')::text,true);
  v_blocked := false;
  BEGIN
    PERFORM public.commit_os_material_consumption(v_os_a,'[]'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'gestor sem fn:edit_os confirmou consumo'; END IF;

  UPDATE public.user_permissions SET permissions='["fn:edit_os"]'::jsonb
   WHERE user_id=v_manager_a;
  v_blocked := false;
  BEGIN
    PERFORM public.commit_os_material_consumption(v_os_a,'[]'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'gestor sem screen:service_orders confirmou consumo'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'sub',v_tech_unassigned,'role','authenticated')::text,true);
  v_blocked := false;
  BEGIN
    PERFORM public.commit_os_material_consumption(v_os_a,'[]'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'tecnico nao atribuido confirmou consumo'; END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );

  v_reservation := public.pdv_reserve_stock_internal_v2(
    v_company_a, v_inventory_a, v_stock_a, v_order_item_a, NULL, 8
  );

  v_blocked := false;
  BEGIN
    DELETE FROM public.inventory_stock_levels
     WHERE inventory_id = v_inventory_a AND stock_id = v_stock_a;
  EXCEPTION WHEN check_violation THEN
    v_blocked := SQLERRM = 'Não é possível remover este saldo enquanto houver pedidos com estoque reservado.';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'saldo com reserva ativa foi removido';
  END IF;

  -- Ajuste comum nao pode consumir a ultima unidade garantida.
  v_blocked := false;
  BEGIN
    PERFORM public.register_inventory_movement(
      v_inventory_a, 'ajuste', -3, NULL, NULL, 'teste ajuste',
      NULL, NULL, v_stock_a
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := SQLERRM = 'Estoque disponível insuficiente: parte da quantidade está reservada para pedidos.';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ajuste invadiu reserva garantida';
  END IF;

  -- Ate o limite exato da garantia e permitido.
  v_movement := public.register_inventory_movement(
    v_inventory_a, 'ajuste', -2, NULL, NULL, 'teste limite',
    NULL, NULL, v_stock_a
  );
  IF v_movement.stock_after <> 8 THEN
    RAISE EXCEPTION 'ajuste no limite produziu saldo inesperado';
  END IF;

  -- Transferencia usa escrita direta no level, mas o guard central tambem cobre.
  v_blocked := false;
  BEGIN
    PERFORM public.transfer_stock_between(
      v_inventory_a, v_stock_a, v_stock_a2, 1,
      'teste reserva', 'w1b2-transfer-blocked'
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := SQLERRM = 'Estoque disponível insuficiente: parte da quantidade está reservada para pedidos.';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'transferencia invadiu reserva garantida';
  END IF;

  -- OS monta/pre-locka o lote e para atomicamente no mesmo guard.
  v_blocked := false;
  BEGIN
    PERFORM public.commit_os_material_consumption(
      v_os_a,
      jsonb_build_array(jsonb_build_object(
        'inventory_id', v_inventory_a,
        'stock_id', v_stock_a,
        'quantity', 1
      ))
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := SQLERRM = 'Estoque disponível insuficiente: parte da quantidade está reservada para pedidos.';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'consumo de OS invadiu reserva garantida';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.service_order_materials
     WHERE service_order_id = v_os_a
  ) THEN
    RAISE EXCEPTION 'falha da OS deixou rascunho parcial persistido';
  END IF;

  -- Compatibilidade: sem reserva, saldo negativo legado continua permitido.
  v_movement := public.register_inventory_movement(
    v_inventory_free, 'saida', -1, NULL, NULL, 'negativo sem reserva',
    NULL, NULL, v_stock_a
  );
  IF v_movement.stock_after <> -1 THEN
    RAISE EXCEPTION 'saldo negativo sem reserva deixou de ser compativel';
  END IF;

  -- Troca de material: os locks usam ordem por par, mas a execucao preserva a
  -- fila semantica. O UUID novo e menor e nao pode antecipar o consumo.
  v_result := public.commit_os_material_consumption(
    v_os_a,
    jsonb_build_array(jsonb_build_object(
      'inventory_id', v_inventory_swap_old,
      'stock_id', v_stock_a,
      'quantity', 1
    ))
  );
  SELECT som.id INTO v_os_line
    FROM public.service_order_materials som
   WHERE som.service_order_id = v_os_a;

  v_result := public.commit_os_material_consumption(
    v_os_a,
    jsonb_build_array(jsonb_build_object(
      'id', v_os_line,
      'inventory_id', v_inventory_free,
      'stock_id', v_stock_a,
      'quantity', 1
    ))
  );

  IF (SELECT quantity FROM public.inventory_stock_levels
       WHERE inventory_id = v_inventory_swap_old AND stock_id = v_stock_a) <> 3
     OR (SELECT quantity FROM public.inventory_stock_levels
          WHERE inventory_id = v_inventory_free AND stock_id = v_stock_a) <> -2
     OR NOT EXISTS (
       SELECT 1 FROM public.service_order_materials som
        WHERE som.id = v_os_line
          AND som.inventory_id = v_inventory_free
          AND som.committed_quantity = 1
     ) THEN
    RAISE EXCEPTION 'troca reordenou consumo antes do estorno e corrompeu a ancora';
  END IF;

  -- Tenant conhecido nao concede acesso ao material alheio.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_b, 'role', 'authenticated')::text,
    true
  );
  v_blocked := false;
  BEGIN
    PERFORM public.register_inventory_movement(
      v_inventory_a, 'saida', -1, NULL, NULL, NULL, NULL, NULL, v_stock_a
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'usuario de outro tenant movimentou material reservado';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );

  -- Inventario e soberano: fisico 8 contado 4, compromisso 8 => falta 4.
  INSERT INTO public.inventory_counts (id, company_id, created_by)
  VALUES (v_count_a, v_company_a, v_user_a);
  INSERT INTO public.inventory_count_items (
    company_id, count_id, inventory_id, stock_id,
    expected_qty, counted_qty, unit_cost
  ) VALUES (
    v_company_a, v_count_a, v_inventory_a, v_stock_a, 8, 4, 30
  );

  UPDATE public.profiles SET is_active=false WHERE user_id=v_user_a;
  v_blocked := false;
  BEGIN
    PERFORM public.finalize_inventory_count(v_count_a,NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'perfil inativo finalizou inventario'; END IF;
  UPDATE public.profiles SET is_active=true WHERE user_id=v_user_a;

  UPDATE public.companies SET subscription_status='inactive' WHERE id=v_company_a;
  v_blocked := false;
  BEGIN
    PERFORM public.finalize_inventory_count(v_count_a,NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'assinatura inativa finalizou inventario'; END IF;
  UPDATE public.companies SET subscription_status='active' WHERE id=v_company_a;

  INSERT INTO public.subscription_plans(code,name,included_modules)
  VALUES('w1b-no-basic','Plano smoke sem básico','[]'::jsonb)
  ON CONFLICT(code) DO UPDATE SET included_modules='[]'::jsonb;
  DELETE FROM public.company_modules WHERE company_id=v_company_a AND module_code='basic';
  UPDATE public.companies SET subscription_plan='w1b-no-basic' WHERE id=v_company_a;
  v_blocked := false;
  BEGIN
    PERFORM public.finalize_inventory_count(v_count_a,NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'empresa sem modulo basico finalizou inventario'; END IF;
  UPDATE public.companies SET subscription_plan='start' WHERE id=v_company_a;
  INSERT INTO public.company_modules(company_id,module_code) VALUES(v_company_a,'basic');

  UPDATE public.user_permissions SET permissions='["screen:inventory"]'::jsonb
   WHERE user_id=v_user_a;
  v_blocked := false;
  BEGIN
    PERFORM public.finalize_inventory_count(v_count_a,NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'usuario sem fn:manage_inventory finalizou inventario'; END IF;
  UPDATE public.user_permissions SET permissions='["fn:manage_inventory"]'::jsonb
   WHERE user_id=v_user_a;
  v_blocked := false;
  BEGIN
    PERFORM public.finalize_inventory_count(v_count_a,NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'usuario sem screen:inventory finalizou inventario'; END IF;
  UPDATE public.user_permissions
     SET permissions='["screen:inventory","fn:manage_inventory"]'::jsonb
   WHERE user_id=v_user_a;

  INSERT INTO public.stock_access(company_id,stock_id,user_id)
  VALUES(v_company_a,v_stock_a,v_manager_a);
  v_blocked := false;
  BEGIN
    PERFORM public.finalize_inventory_count(v_count_a,NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'ACL restrita do mesmo tenant foi ignorada na contagem'; END IF;
  DELETE FROM public.stock_access WHERE stock_id=v_stock_a;

  v_result := public.finalize_inventory_count(v_count_a, 'contagem abaixo da reserva');
  IF COALESCE((v_result->>'already_finalized')::boolean, true)
     OR (v_result->>'reservation_conflicts')::integer <> 1 THEN
    RAISE EXCEPTION 'inventario nao registrou conflito: %', v_result;
  END IF;

  SELECT quantity INTO v_quantity
    FROM public.inventory_stock_levels
   WHERE inventory_id = v_inventory_a AND stock_id = v_stock_a;
  IF v_quantity <> 4 THEN
    RAISE EXCEPTION 'contagem soberana nao ajustou fisico para 4: %', v_quantity;
  END IF;

  SELECT * INTO v_availability
    FROM public.pdv_get_stock_availability_v2(v_inventory_a, v_stock_a);
  IF v_availability.committed_quantity <> 8
     OR v_availability.guaranteed_quantity <> 4
     OR v_availability.shortage_quantity <> 4
     OR v_availability.available_quantity <> 0
     OR NOT v_availability.has_conflict THEN
    RAISE EXCEPTION 'conflito do inventario nao conciliou: %', row_to_json(v_availability);
  END IF;

  SELECT count(*) INTO v_issue_count
    FROM public.pdv_reconciliation_issues ri
   WHERE ri.company_id = v_company_a
     AND ri.issue_code = 'reservation_shortage'
     AND ri.resource_id = v_count_a;
  IF v_issue_count <> 1 THEN
    RAISE EXCEPTION 'inventario deveria abrir uma unica issue, abriu %', v_issue_count;
  END IF;

  -- Entrada posterior aumenta fisico, mas nao limpa conflito nem entrega.
  v_movement := public.register_inventory_movement(
    v_inventory_a, 'entrada', 5, NULL, 30, 'reposicao posterior',
    NULL, NULL, v_stock_a
  );
  SELECT * INTO v_availability
    FROM public.pdv_get_stock_availability_v2(v_inventory_a, v_stock_a);
  IF v_movement.stock_after <> 9
     OR v_availability.shortage_quantity <> 4
     OR NOT v_availability.has_conflict
     OR v_availability.available_quantity <> 0 THEN
    RAISE EXCEPTION 'entrada resolveu conflito automaticamente: %', row_to_json(v_availability);
  END IF;

  -- Retry da finalizacao nao reaplica movimento nem duplica issue.
  v_result := public.finalize_inventory_count(v_count_a, NULL);
  SELECT count(*) INTO v_issue_count
    FROM public.pdv_reconciliation_issues ri
   WHERE ri.company_id = v_company_a
     AND ri.issue_code = 'reservation_shortage'
     AND ri.resource_id = v_count_a;
  IF COALESCE((v_result->>'already_finalized')::boolean, false) IS NOT TRUE
     OR v_issue_count <> 1 THEN
    RAISE EXCEPTION 'retry do inventario reaplicou efeito/issue: % / %',
      v_result, v_issue_count;
  END IF;

  -- Contrato da entrega futura: consome sua garantia e move na mesma transacao.
  v_reservation := public.pdv_consume_stock_reservation_internal_v2(
    v_company_a, v_reservation.id, 2
  );
  v_movement := public.register_inventory_movement(
    v_inventory_a, 'saida', -2, NULL, 30, 'simulacao entrega futura',
    NULL, NULL, v_stock_a
  );
  IF v_reservation.consumed_quantity <> 2 OR v_movement.stock_after <> 7 THEN
    RAISE EXCEPTION 'consumo da propria reserva nao conciliou com Kardex';
  END IF;

  -- Excluir o tenant deve limpar a arvore inteira; o escape nao vale para
  -- DELETE avulso, que ja foi bloqueado acima.
  INSERT INTO public.companies (id, name, subscription_status, subscription_expires_at)
  VALUES (v_company_c, 'Empresa W1B2 cascata', 'active', NULL);
  INSERT INTO public.stocks (id, company_id, name, is_default)
  VALUES (v_stock_c, v_company_c, 'Principal C', true);
  INSERT INTO public.inventory (
    id, company_id, sku, name, unit, quantity, cost_price
  ) VALUES (
    v_inventory_c, v_company_c, 'W1B2-C', 'Material cascata', 'un', 1, 1
  );
  INSERT INTO public.inventory_stock_levels (
    company_id, inventory_id, stock_id, quantity, is_present
  ) VALUES (v_company_c, v_inventory_c, v_stock_c, 1, true);
  INSERT INTO public.pdv_orders (id, company_id, number, stock_id)
  VALUES (v_order_c, v_company_c, 920001, v_stock_c);
  INSERT INTO public.pdv_order_items (
    id, company_id, order_id, inventory_id, description, quantity
  ) VALUES (
    v_order_item_c, v_company_c, v_order_c, v_inventory_c, 'Material cascata', 1
  );
  PERFORM public.pdv_reserve_stock_internal_v2(
    v_company_c, v_inventory_c, v_stock_c, v_order_item_c, NULL, 1
  );

  DELETE FROM public.companies WHERE id = v_company_c;
  IF EXISTS (SELECT 1 FROM public.companies WHERE id = v_company_c)
     OR EXISTS (
       SELECT 1 FROM public.pdv_stock_reservation_items WHERE company_id = v_company_c
     )
     OR EXISTS (
       SELECT 1 FROM public.inventory_stock_levels WHERE company_id = v_company_c
     ) THEN
    RAISE EXCEPTION 'guard de reserva bloqueou/fragmentou cascata do tenant';
  END IF;
END
$behavior$;

ROLLBACK;

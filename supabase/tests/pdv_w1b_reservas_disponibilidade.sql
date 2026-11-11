-- Contrato e smoke transacional das reservas W1B-01.
-- Executar apos `supabase db reset`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/pdv_w1b_reservas_disponibilidade.sql

BEGIN;

DO $contract$
DECLARE
  v_function text;
BEGIN
  IF to_regclass('public.pdv_stock_reservation_items') IS NULL THEN
    RAISE EXCEPTION 'tabela public.pdv_stock_reservation_items ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_class c
     WHERE c.oid = 'public.pdv_stock_reservation_items'::regclass
       AND c.relrowsecurity
       AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS ENABLE+FORCE ausente nas reservas';
  END IF;

  IF has_table_privilege('anon', 'public.pdv_stock_reservation_items', 'SELECT')
     OR has_table_privilege('authenticated', 'public.pdv_stock_reservation_items', 'SELECT')
     OR has_table_privilege('authenticated', 'public.pdv_stock_reservation_items', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pdv_stock_reservation_items', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pdv_stock_reservation_items', 'DELETE')
     OR has_table_privilege('service_role', 'public.pdv_stock_reservation_items', 'SELECT')
     OR has_table_privilege('service_role', 'public.pdv_stock_reservation_items', 'INSERT')
  THEN
    RAISE EXCEPTION 'grant direto indevido na tabela de reservas';
  END IF;

  FOREACH v_function IN ARRAY ARRAY[
    'public.pdv_reserve_stock_internal_v2(uuid,uuid,uuid,uuid,uuid,numeric,text,timestamp with time zone,numeric)',
    'public.pdv_release_stock_reservation_internal_v2(uuid,uuid,numeric)',
    'public.pdv_set_stock_reservation_shortage_internal_v2(uuid,uuid,numeric)',
    'public.pdv_transfer_stock_reservation_origin_internal_v2(uuid,uuid,uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR has_function_privilege('service_role', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'helper interno exposto: %', v_function;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_proc p
       WHERE p.oid = v_function::regprocedure
         AND p.prosecdef
         AND 'search_path=pg_catalog, public' = ANY (p.proconfig)
    ) THEN
      RAISE EXCEPTION '% deve ser SECURITY DEFINER com search_path fixo', v_function;
    END IF;
  END LOOP;

  IF has_function_privilege(
       'anon', 'public.pdv_get_stock_availability_v2(uuid,uuid)', 'EXECUTE'
     ) OR NOT has_function_privilege(
       'authenticated', 'public.pdv_get_stock_availability_v2(uuid,uuid)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'ACL incorreta na leitura de disponibilidade';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc function_row
     WHERE function_row.oid = 'public.pdv_get_stock_availability_v2(uuid,uuid)'::regprocedure
       AND function_row.prosecdef
       AND 'search_path=pg_catalog, public' = ANY(function_row.proconfig)
  ) THEN
    RAISE EXCEPTION 'disponibilidade deve fixar search_path seguro';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pdv_stock_reservation_items'::regclass
       AND conname = 'pdv_stock_reservation_origin_xor_check'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pdv_stock_reservation_items'::regclass
       AND conname = 'pdv_stock_reservation_totals_check'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pdv_stock_reservation_items'::regclass
       AND conname = 'pdv_stock_reservation_state_totals_check'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pdv_stock_reservation_items'::regclass
       AND conname = 'pdv_stock_reservation_expiration_check'
  ) THEN
    RAISE EXCEPTION 'constraints centrais das reservas ausentes';
  END IF;
END
$contract$;

DO $behavior$
DECLARE
  v_company_a uuid := 'b1000000-0000-4000-8000-000000000001';
  v_company_b uuid := 'b1000000-0000-4000-8000-000000000002';
  v_user_a uuid := 'b1000000-0000-4000-8000-000000000003';
  v_user_b uuid := 'b1000000-0000-4000-8000-000000000004';
  v_user_acl uuid := 'b1000000-0000-4000-8000-000000000005';
  v_stock_a uuid := 'b1000000-0000-4000-8000-000000000011';
  v_stock_b uuid := 'b1000000-0000-4000-8000-000000000012';
  v_inventory_a uuid := 'b1000000-0000-4000-8000-000000000021';
  v_inventory_zero uuid := 'b1000000-0000-4000-8000-000000000022';
  v_inventory_b uuid := 'b1000000-0000-4000-8000-000000000023';
  v_order_a uuid := 'b1000000-0000-4000-8000-000000000031';
  v_order_b uuid := 'b1000000-0000-4000-8000-000000000032';
  v_item_a1 uuid := 'b1000000-0000-4000-8000-000000000041';
  v_item_a2 uuid := 'b1000000-0000-4000-8000-000000000042';
  v_item_zero uuid := 'b1000000-0000-4000-8000-000000000043';
  v_item_b uuid := 'b1000000-0000-4000-8000-000000000044';
  v_reservation public.pdv_stock_reservation_items;
  v_zero_reservation public.pdv_stock_reservation_items;
  v_availability record;
  v_blocked boolean;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000', v_user_a,
      'authenticated', 'authenticated', 'pdv-reserva-a@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Teste Reserva A"}'::jsonb, now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_user_b,
      'authenticated', 'authenticated', 'pdv-reserva-b@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Teste Reserva B"}'::jsonb, now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_user_acl,
      'authenticated', 'authenticated', 'pdv-reserva-acl@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Teste Reserva ACL"}'::jsonb, now(), now(), '', '', '', ''
    );

  INSERT INTO public.companies (
    id, name, subscription_status, subscription_expires_at
  ) VALUES
    (v_company_a, 'Empresa teste reserva A', 'active', NULL),
    (v_company_b, 'Empresa teste reserva B', 'active', NULL);

  UPDATE public.profiles SET company_id = v_company_a, is_active = true
   WHERE user_id = v_user_a;
  UPDATE public.profiles SET company_id = v_company_b, is_active = true
   WHERE user_id = v_user_b;
  UPDATE public.profiles SET company_id = v_company_a, is_active = true
   WHERE user_id = v_user_acl;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_a, 'comercial'), (v_user_b, 'comercial'), (v_user_acl, 'comercial');
  INSERT INTO public.user_permissions (user_id, permissions, is_active)
  VALUES
    (v_user_a, '["screen:inventory","fn:manage_inventory"]', true),
    (v_user_b, '["screen:inventory"]', true),
    (v_user_acl, '["screen:inventory"]', true);

  INSERT INTO public.company_modules (company_id, module_code)
  VALUES
    (v_company_a, 'basic'), (v_company_a, 'pdv'),
    (v_company_b, 'basic'), (v_company_b, 'pdv');

  INSERT INTO public.stocks (id, company_id, name, is_default)
  VALUES
    (v_stock_a, v_company_a, 'Principal A', true),
    (v_stock_b, v_company_b, 'Principal B', true);

  INSERT INTO public.inventory (
    id, company_id, sku, name, unit, quantity, cost_price
  ) VALUES
    (v_inventory_a, v_company_a, 'RES-A', 'Material A', 'un', 10, 30),
    (v_inventory_zero, v_company_a, 'RES-Z', 'Material custo zero', 'un', 1, 0),
    (v_inventory_b, v_company_b, 'RES-B', 'Material B', 'un', 10, 40);

  INSERT INTO public.inventory_stock_levels (
    company_id, inventory_id, stock_id, quantity, is_present
  ) VALUES
    (v_company_a, v_inventory_a, v_stock_a, 10, true),
    (v_company_a, v_inventory_zero, v_stock_a, 1, true),
    (v_company_b, v_inventory_b, v_stock_b, 10, true);

  INSERT INTO public.pdv_orders (id, company_id, number, stock_id)
  VALUES
    (v_order_a, v_company_a, 910001, v_stock_a),
    (v_order_b, v_company_b, 910001, v_stock_b);

  INSERT INTO public.pdv_order_items (
    id, company_id, order_id, inventory_id, description, quantity
  ) VALUES
    (v_item_a1, v_company_a, v_order_a, v_inventory_a, 'Material A 1', 6),
    (v_item_a2, v_company_a, v_order_a, v_inventory_a, 'Material A 2', 5),
    (v_item_zero, v_company_a, v_order_a, v_inventory_zero, 'Custo zero', 1),
    (v_item_b, v_company_b, v_order_b, v_inventory_b, 'Material B', 1);

  v_reservation := public.pdv_reserve_stock_internal_v2(
    v_company_a, v_inventory_a, v_stock_a, v_item_a1, NULL, 6
  );
  IF v_reservation.state <> 'guaranteed'
     OR v_reservation.cost_price_snapshot <> 30
     OR v_reservation.contract_version <> 2 THEN
    RAISE EXCEPTION 'reserva inicial nao congelou garantia/custo/contrato: %',
      row_to_json(v_reservation);
  END IF;

  -- Ultimas quatro unidades nao permitem uma reserva concorrente de cinco.
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_reserve_stock_internal_v2(
      v_company_a, v_inventory_a, v_stock_a, v_item_a2, NULL, 5
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := SQLERRM = 'pdv_reservation_insufficient_stock';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'reserva acima do fisico disponivel nao foi bloqueada';
  END IF;

  -- Zero conhecido permanece zero, nunca vira NULL.
  v_zero_reservation := public.pdv_reserve_stock_internal_v2(
    v_company_a, v_inventory_zero, v_stock_a, v_item_zero, NULL, 1
  );
  IF v_zero_reservation.cost_price_snapshot IS NULL
     OR v_zero_reservation.cost_price_snapshot <> 0 THEN
    RAISE EXCEPTION 'custo zero conhecido foi confundido com desconhecido';
  END IF;

  -- Mesmo uma linha legada corrompida com o par correto nao pode atravessar
  -- tenant nas primitivas internas.
  ALTER TABLE public.inventory_stock_levels
    DISABLE TRIGGER trg_guard_customer_stock_level_scope;
  UPDATE public.inventory_stock_levels
     SET company_id = v_company_b
   WHERE inventory_id = v_inventory_zero AND stock_id = v_stock_a;
  ALTER TABLE public.inventory_stock_levels
    ENABLE TRIGGER trg_guard_customer_stock_level_scope;
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_set_stock_reservation_shortage_internal_v2(
      v_company_a, v_zero_reservation.id, 0
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := SQLERRM = 'pdv_reservation_stock_level_tenant_mismatch';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'linha de saldo com tenant corrompido foi aceita';
  END IF;
  ALTER TABLE public.inventory_stock_levels
    DISABLE TRIGGER trg_guard_customer_stock_level_scope;
  UPDATE public.inventory_stock_levels
     SET company_id = v_company_a
   WHERE inventory_id = v_inventory_zero AND stock_id = v_stock_a;
  ALTER TABLE public.inventory_stock_levels
    ENABLE TRIGGER trg_guard_customer_stock_level_scope;

  -- Pre-reserva fica estruturalmente modelada, mas bloqueada ate W2 criar a FK.
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_reserve_stock_internal_v2(
      v_company_a, v_inventory_a, v_stock_a, NULL,
      'b1000000-0000-4000-8000-000000000099'::uuid,
      1, 'early', now() + interval '24 hours'
    );
  EXCEPTION WHEN feature_not_supported THEN
    v_blocked := SQLERRM = 'pdv_preorder_reservation_contract_not_available';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'pre-reserva sem entidade canonica foi aceita';
  END IF;

  -- Escopo cruzado de empresa/origem precisa falhar antes de reservar.
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_reserve_stock_internal_v2(
      v_company_a, v_inventory_a, v_stock_a, v_item_b, NULL, 1
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'item de pedido de outro tenant criou reserva';
  END IF;

  -- Contagem fisica soberana: compromisso 6, fisico 4, falta explicita 2.
  UPDATE public.inventory_stock_levels
     SET quantity = 4
   WHERE inventory_id = v_inventory_a AND stock_id = v_stock_a;

  v_reservation := public.pdv_set_stock_reservation_shortage_internal_v2(
    v_company_a, v_reservation.id, 2
  );
  IF v_reservation.state <> 'conflict' OR v_reservation.shortage_quantity <> 2 THEN
    RAISE EXCEPTION 'falta nao gerou conflito auditavel';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );
  SELECT * INTO v_availability
    FROM public.pdv_get_stock_availability_v2(v_inventory_a, v_stock_a);
  IF v_availability.physical_quantity <> 4
     OR v_availability.committed_quantity <> 6
     OR v_availability.guaranteed_quantity <> 4
     OR v_availability.shortage_quantity <> 2
     OR v_availability.available_quantity <> 0
     OR NOT v_availability.has_conflict THEN
    RAISE EXCEPTION 'projecao de conflito incorreta: %', row_to_json(v_availability);
  END IF;

  -- Saldo legado negativo nao pode produzir falta acima do compromisso nem
  -- garantia negativa. O disponivel permanece zerado e o conflito visivel.
  UPDATE public.inventory_stock_levels
     SET quantity = -3
   WHERE inventory_id = v_inventory_a AND stock_id = v_stock_a;

  v_reservation := public.pdv_set_stock_reservation_shortage_internal_v2(
    v_company_a, v_reservation.id, 6
  );
  IF v_reservation.state <> 'conflict'
     OR v_reservation.shortage_quantity <> 6 THEN
    RAISE EXCEPTION 'falta total nao foi persistida com fisico negativo: %',
      row_to_json(v_reservation);
  END IF;

  SELECT * INTO v_availability
    FROM public.pdv_get_stock_availability_v2(v_inventory_a, v_stock_a);
  IF v_availability.physical_quantity <> -3
     OR v_availability.committed_quantity <> 6
     OR v_availability.guaranteed_quantity <> 0
     OR v_availability.shortage_quantity <> 6
     OR v_availability.available_quantity <> 0
     OR NOT v_availability.has_conflict THEN
    RAISE EXCEPTION 'saldo negativo gerou garantia/falta invalida: %',
      row_to_json(v_availability);
  END IF;
  UPDATE public.inventory_stock_levels
     SET quantity = 4
   WHERE inventory_id = v_inventory_a AND stock_id = v_stock_a;
  v_reservation := public.pdv_set_stock_reservation_shortage_internal_v2(
    v_company_a, v_reservation.id, 2
  );
  IF v_reservation.state <> 'conflict'
     OR v_reservation.shortage_quantity <> 2 THEN
    RAISE EXCEPTION 'estado nao foi restaurado apos normalizar o fisico: %',
      row_to_json(v_reservation);
  END IF;

  -- Enquanto houver conflito, nenhuma nova garantia entra no par.
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_reserve_stock_internal_v2(
      v_company_a, v_inventory_a, v_stock_a, v_item_a2, NULL, 1
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := SQLERRM = 'pdv_reservation_pair_in_conflict';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'nova reserva entrou em par com conflito';
  END IF;

  -- Nao e permitido apagar a falta se o fisico ainda nao sustenta a garantia.
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_set_stock_reservation_shortage_internal_v2(
      v_company_a, v_reservation.id, 0
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := SQLERRM = 'pdv_reservation_guarantee_exceeds_physical';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'conflito foi limpo sem cobertura fisica';
  END IF;

  -- Liberar as duas unidades descobertas preserva quatro garantidas.
  v_reservation := public.pdv_release_stock_reservation_internal_v2(
    v_company_a, v_reservation.id, 2
  );
  IF v_reservation.state <> 'guaranteed'
     OR v_reservation.shortage_quantity <> 0
     OR v_reservation.released_quantity <> 2 THEN
    RAISE EXCEPTION 'liberacao nao reduziu primeiro a falta: %', row_to_json(v_reservation);
  END IF;

  -- A leitura publica falha fechado em cada camada de autorizacao.
  UPDATE public.profiles SET is_active = false WHERE user_id = v_user_a;
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_get_stock_availability_v2(v_inventory_a, v_stock_a);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'perfil inativo leu disponibilidade'; END IF;
  UPDATE public.profiles SET is_active = true WHERE user_id = v_user_a;

  UPDATE public.companies SET subscription_status = 'inactive' WHERE id = v_company_a;
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_get_stock_availability_v2(v_inventory_a, v_stock_a);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'assinatura inativa leu disponibilidade'; END IF;
  UPDATE public.companies SET subscription_status = 'active' WHERE id = v_company_a;

  DELETE FROM public.company_modules WHERE company_id = v_company_a AND module_code = 'pdv';
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_get_stock_availability_v2(v_inventory_a, v_stock_a);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'empresa sem modulo PDV leu disponibilidade'; END IF;
  INSERT INTO public.company_modules(company_id,module_code) VALUES(v_company_a,'pdv');

  UPDATE public.user_permissions SET permissions = '[]'::jsonb WHERE user_id = v_user_a;
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_get_stock_availability_v2(v_inventory_a, v_stock_a);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'usuario sem tela nominal leu disponibilidade'; END IF;
  UPDATE public.user_permissions
     SET permissions = '["screen:inventory","fn:manage_inventory"]'::jsonb
   WHERE user_id = v_user_a;

  INSERT INTO public.stock_access(company_id,stock_id,user_id)
  VALUES(v_company_a,v_stock_a,v_user_acl);
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_get_stock_availability_v2(v_inventory_a, v_stock_a);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'ACL restrita do mesmo tenant foi ignorada'; END IF;
  DELETE FROM public.stock_access WHERE stock_id = v_stock_a;

  -- A leitura de outro tenant falha mesmo conhecendo UUIDs validos.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_b, 'role', 'authenticated')::text,
    true
  );
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_get_stock_availability_v2(v_inventory_a, v_stock_a);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'usuario de outro tenant leu disponibilidade';
  END IF;
END
$behavior$;

ROLLBACK;

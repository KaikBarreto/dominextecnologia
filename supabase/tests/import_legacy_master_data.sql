-- Contrato e smoke transacional da importacao de cadastros legados.
-- Executar apos `supabase db reset`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/import_legacy_master_data.sql

BEGIN;

DO $contract$
DECLARE
  v_function regprocedure := 'public.import_legacy_master_data(uuid,text,jsonb,jsonb,jsonb,jsonb,uuid,text,text)'::regprocedure;
  v_preview_function regprocedure := 'public.preview_legacy_master_data(text,jsonb,jsonb,jsonb,jsonb,uuid)'::regprocedure;
BEGIN
  IF to_regclass('public.master_data_import_batches') IS NULL THEN
    RAISE EXCEPTION 'tabela de auditoria da importacao ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
     WHERE c.oid = 'public.master_data_import_batches'::regclass
       AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS ausente na auditoria da importacao';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name = 'master_data_import_batches'
       AND c.data_type IN ('json', 'jsonb', 'bytea')
  ) THEN
    RAISE EXCEPTION 'auditoria nao pode persistir payload bruto';
  END IF;
  IF has_table_privilege('anon', 'public.master_data_import_batches', 'SELECT')
     OR has_table_privilege('authenticated', 'public.master_data_import_batches', 'SELECT')
     OR has_table_privilege('authenticated', 'public.master_data_import_batches', 'INSERT') THEN
    RAISE EXCEPTION 'auditoria exposta diretamente ao client';
  END IF;
  IF has_function_privilege('anon', v_function, 'EXECUTE')
     OR has_function_privilege('service_role', v_function, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL incorreta na RPC de importacao';
  END IF;
  IF has_function_privilege('anon', v_preview_function, 'EXECUTE')
     OR has_function_privilege('service_role', v_preview_function, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_preview_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL incorreta na RPC de preview';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = v_function
       AND p.prosecdef
       AND 'search_path=pg_catalog, public, extensions' = ANY(p.proconfig)
  ) THEN
    RAISE EXCEPTION 'RPC deve ser SECURITY DEFINER com search_path fixo';
  END IF;
END
$contract$;

DO $behavior$
DECLARE
  v_company_a uuid := 'ed000000-0000-4000-8000-000000000001';
  v_company_b uuid := 'ed000000-0000-4000-8000-000000000002';
  v_user_a uuid := 'ed000000-0000-4000-8000-000000000003';
  v_stock_a uuid := 'ed000000-0000-4000-8000-000000000004';
  v_stock_b uuid := 'ed000000-0000-4000-8000-000000000005';
  v_req_1 uuid := 'ed000000-0000-4000-8000-000000000011';
  v_req_2 uuid := 'ed000000-0000-4000-8000-000000000012';
  v_req_3 uuid := 'ed000000-0000-4000-8000-000000000013';
  v_hash_1 text := repeat('a', 64);
  v_hash_2 text := repeat('b', 64);
  v_hash_3 text := repeat('c', 64);
  v_result jsonb;
  v_preview jsonb;
  v_customer_id uuid;
  v_inventory_id uuid;
  v_cross_customer_id uuid;
  v_count integer;
  v_quantity numeric;
  v_blocked boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_user_a,
    'authenticated', 'authenticated', 'legacy-import@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Teste Importacao"}'::jsonb, now(), now(), '', '', '', ''
  );

  INSERT INTO public.companies (id, name, subscription_status, subscription_expires_at)
  VALUES
    (v_company_a, 'Empresa teste importacao A', 'active', NULL),
    (v_company_b, 'Empresa teste importacao B', 'active', NULL);

  UPDATE public.profiles
     SET company_id = v_company_a, is_active = true
   WHERE user_id = v_user_a;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_a, 'admin');
  INSERT INTO public.company_modules (company_id, module_code)
  VALUES (v_company_a, 'basic');
  INSERT INTO public.stocks (id, company_id, name, is_default)
  VALUES
    (v_stock_a, v_company_a, 'Principal', true),
    (v_stock_b, v_company_a, 'Secundario', false);

  INSERT INTO public.customers (company_id, name, customer_type, document)
  VALUES (v_company_b, 'Cliente de outro tenant', 'pj', '00999999000100')
  RETURNING id INTO v_cross_customer_id;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );

  v_preview := public.preview_legacy_master_data(
    v_hash_1,
    '[{"name":"Cliente QA","customer_type":"pj","document":"00.111.222/0001-33","email":"cliente@example.invalid"}]'::jsonb,
    '[{"name":"Fornecedor QA","cpf_cnpj":"11.222.333/0001-44"}]'::jsonb,
    '[{"name":"Material QA","sku":"MAT-QA","unit":"un","cost_price":10,"sale_price":15,"stock_quantity":-12,"active":false,"fiscal_ncm":"84151011"}]'::jsonb,
    '[{"customer_document":"00111222000133","name":"Equipamento QA","identifier":"LEG-EQ-QA","serial_number":"SER-QA","status":"active"}]'::jsonb,
    v_stock_a
  );
  IF COALESCE((v_preview->>'can_apply')::boolean,false) IS NOT TRUE
     OR v_preview #>> '{summary,customers,create}' <> '1'
     OR v_preview #>> '{summary,equipment,create}' <> '1' THEN
    RAISE EXCEPTION 'preview inicial inesperado: %', v_preview;
  END IF;

  -- Trocar o deposito depois da conferencia invalida o preview antes de escrever.
  v_blocked := false;
  BEGIN
    PERFORM public.import_legacy_master_data(
      v_req_1, v_hash_1,
      '[{"name":"Cliente QA","customer_type":"pj","document":"00.111.222/0001-33","email":"cliente@example.invalid"}]'::jsonb,
      '[{"name":"Fornecedor QA","cpf_cnpj":"11.222.333/0001-44"}]'::jsonb,
      '[{"name":"Material QA","sku":"MAT-QA","unit":"un","cost_price":10,"sale_price":15,"stock_quantity":-12,"active":false,"fiscal_ncm":"84151011"}]'::jsonb,
      '[{"customer_document":"00111222000133","name":"Equipamento QA","identifier":"LEG-EQ-QA","serial_number":"SER-QA","status":"active"}]'::jsonb,
      v_stock_b, 'qa', v_preview->>'preview_hash'
    );
  EXCEPTION WHEN serialization_failure THEN
    v_blocked := true;
  END;
  IF NOT v_blocked OR EXISTS (
    SELECT 1 FROM public.customers
     WHERE company_id=v_company_a AND document='00.111.222/0001-33'
  ) THEN
    RAISE EXCEPTION 'troca de deposito reutilizou preview ou escreveu dados';
  END IF;

  v_result := public.import_legacy_master_data(
    v_req_1,
    v_hash_1,
    '[{"name":"Cliente QA","customer_type":"pj","document":"00.111.222/0001-33","email":"cliente@example.invalid"}]'::jsonb,
    '[{"name":"Fornecedor QA","cpf_cnpj":"11.222.333/0001-44"}]'::jsonb,
    '[{"name":"Material QA","sku":"MAT-QA","unit":"un","cost_price":10,"sale_price":15,"stock_quantity":-12,"active":false,"fiscal_ncm":"84151011"}]'::jsonb,
    '[{"customer_document":"00111222000133","name":"Equipamento QA","identifier":"LEG-EQ-QA","serial_number":"SER-QA","status":"active"}]'::jsonb,
    v_stock_a,
    'qa',
    v_preview->>'preview_hash'
  );

  IF COALESCE((v_result->>'already_applied')::boolean, true)
     OR v_result #>> '{customers,created}' <> '1'
     OR v_result #>> '{suppliers,created}' <> '1'
     OR v_result #>> '{materials,created}' <> '1'
     OR v_result #>> '{materials,movements}' <> '1'
     OR v_result #>> '{equipment,created}' <> '1' THEN
    RAISE EXCEPTION 'resultado inicial inesperado: %', v_result;
  END IF;

  SELECT id INTO v_customer_id FROM public.customers
   WHERE company_id = v_company_a AND document = '00.111.222/0001-33';
  SELECT id INTO v_inventory_id FROM public.inventory
   WHERE company_id = v_company_a AND sku = 'MAT-QA';
  SELECT quantity INTO v_quantity FROM public.inventory_stock_levels
   WHERE inventory_id = v_inventory_id AND stock_id = v_stock_a;

  IF v_customer_id IS NULL OR v_inventory_id IS NULL OR v_quantity <> -12
     OR NOT EXISTS (
       SELECT 1 FROM public.inventory i
        WHERE i.id=v_inventory_id AND i.archived_at IS NOT NULL
          AND i.fiscal_ncm='84151011'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.inventory_movements m
        WHERE m.inventory_id = v_inventory_id AND m.movement_type = 'ajuste'
          AND m.quantity = -12 AND m.stock_id = v_stock_a
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.equipment e
        WHERE e.company_id = v_company_a AND e.customer_id = v_customer_id
          AND e.identifier = 'LEG-EQ-QA'
     ) THEN
    RAISE EXCEPTION 'cadastro/Kardex/equipamento nao foi materializado corretamente';
  END IF;

  -- Retry exato devolve o lote anterior e nao cria nem movimenta de novo.
  v_result := public.import_legacy_master_data(
    v_req_1,
    v_hash_1,
    '[{"name":"Cliente QA","customer_type":"pj","document":"00.111.222/0001-33","email":"cliente@example.invalid"}]'::jsonb,
    '[{"name":"Fornecedor QA","cpf_cnpj":"11.222.333/0001-44"}]'::jsonb,
    '[{"name":"Material QA","sku":"MAT-QA","unit":"un","cost_price":10,"sale_price":15,"stock_quantity":-12,"active":false,"fiscal_ncm":"84151011"}]'::jsonb,
    '[{"customer_document":"00111222000133","name":"Equipamento QA","identifier":"LEG-EQ-QA","serial_number":"SER-QA","status":"active"}]'::jsonb,
    v_stock_a,
    'qa',
    v_preview->>'preview_hash'
  );
  IF COALESCE((v_result->>'already_applied')::boolean, false) IS NOT TRUE
     OR (SELECT count(*) FROM public.master_data_import_batches WHERE company_id = v_company_a) <> 1
     OR (SELECT count(*) FROM public.inventory_movements WHERE inventory_id = v_inventory_id) <> 1 THEN
    RAISE EXCEPTION 'retry nao foi idempotente: %', v_result;
  END IF;

  -- Novo arquivo atualiza pelas chaves fortes e ajusta o saldo ate o alvo 15.
  v_preview := public.preview_legacy_master_data(
    v_hash_2,
    '[{"name":"Cliente QA Atualizado","customer_type":"pj","document":"00111222000133"}]'::jsonb,
    '[{"name":"Fornecedor QA Atualizado","cpf_cnpj":"11222333000144"}]'::jsonb,
    '[{"name":"Material QA Atualizado","sku":"MAT-QA","unit":"un","stock_quantity":15,"active":true,"fiscal_cest":"1234567"}]'::jsonb,
    '[{"customer_document":"00111222000133","name":"Equipamento QA Atualizado","identifier":"LEG-EQ-QA","serial_number":"SER-QA","status":"inactive"}]'::jsonb,
    v_stock_a
  );
  IF v_preview #>> '{summary,customers,update}' <> '1'
     OR v_preview #>> '{summary,equipment,update}' <> '1' THEN
    RAISE EXCEPTION 'preview de update nao mostrou as atualizacoes: %', v_preview;
  END IF;
  v_result := public.import_legacy_master_data(
    v_req_2,
    v_hash_2,
    '[{"name":"Cliente QA Atualizado","customer_type":"pj","document":"00111222000133"}]'::jsonb,
    '[{"name":"Fornecedor QA Atualizado","cpf_cnpj":"11222333000144"}]'::jsonb,
    '[{"name":"Material QA Atualizado","sku":"MAT-QA","unit":"un","stock_quantity":15,"active":true,"fiscal_cest":"1234567"}]'::jsonb,
    '[{"customer_document":"00111222000133","name":"Equipamento QA Atualizado","identifier":"LEG-EQ-QA","serial_number":"SER-QA","status":"inactive"}]'::jsonb,
    v_stock_a,
    'qa',
    v_preview->>'preview_hash'
  );
  SELECT quantity INTO v_quantity FROM public.inventory_stock_levels
   WHERE inventory_id = v_inventory_id AND stock_id = v_stock_a;
  IF v_result #>> '{customers,updated}' <> '1'
     OR v_result #>> '{suppliers,updated}' <> '1'
     OR v_result #>> '{materials,updated}' <> '1'
     OR v_result #>> '{equipment,updated}' <> '1'
     OR v_quantity <> 15
     OR NOT EXISTS (
       SELECT 1 FROM public.inventory i
        WHERE i.id=v_inventory_id AND i.archived_at IS NULL
          AND i.fiscal_cest='1234567'
     )
     OR (SELECT count(*) FROM public.inventory_movements WHERE inventory_id = v_inventory_id) <> 2 THEN
    RAISE EXCEPTION 'update por chaves fortes/saldo-alvo falhou: %', v_result;
  END IF;

  -- Lote bloqueado na mesma regua da previa nao pode escrever nenhuma linha.
  v_preview := public.preview_legacy_master_data(
    v_hash_3,
    '[{"name":"Cliente que deve voltar","document":"77888999000100"}]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[{"customer_document":"00000000000000","name":"Equipamento sem cliente"}]'::jsonb
  );
  IF COALESCE((v_preview->>'can_apply')::boolean,true) IS NOT FALSE
     OR v_preview #>> '{summary,equipment,conflict}' <> '1' THEN
    RAISE EXCEPTION 'preview nao bloqueou equipamento sem cliente: %', v_preview;
  END IF;
  v_blocked := false;
  BEGIN
    PERFORM public.import_legacy_master_data(
      v_req_3,
      v_hash_3,
      '[{"name":"Cliente que deve voltar","document":"77888999000100"}]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[{"customer_document":"00000000000000","name":"Equipamento sem cliente"}]'::jsonb,
      NULL,
      'qa',
      v_preview->>'preview_hash'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked
     OR EXISTS (SELECT 1 FROM public.customers WHERE company_id = v_company_a AND document = '77888999000100')
     OR EXISTS (SELECT 1 FROM public.master_data_import_batches WHERE company_id = v_company_a AND client_request_id = v_req_3) THEN
    RAISE EXCEPTION 'lote bloqueado escreveu dados';
  END IF;

  -- target_id de outro tenant nao pode ser usado para atualizar cadastro.
  v_blocked := false;
  v_preview := public.preview_legacy_master_data(
    repeat('d',64),
    jsonb_build_array(jsonb_build_object('target_id',v_cross_customer_id,'name','Intruso')),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb
  );
  BEGIN
    PERFORM public.import_legacy_master_data(
      gen_random_uuid(), repeat('d', 64),
      jsonb_build_array(jsonb_build_object('target_id', v_cross_customer_id, 'name', 'Intruso')),
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NULL, 'qa', v_preview->>'preview_hash'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'target_id cross-tenant foi aceito';
  END IF;

  -- Profile inativo falha fechado mesmo com role admin e assinatura vigente.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE public.profiles SET is_active = false WHERE user_id = v_user_a;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );
  v_blocked := false;
  BEGIN
    PERFORM public.preview_legacy_master_data(
      repeat('e', 64), '[{"name":"Cliente de usuario inativo"}]'::jsonb,
      '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'profile inativo conseguiu importar';
  END IF;

  SELECT count(*) INTO v_count FROM public.master_data_import_batches WHERE company_id = v_company_a;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'auditoria deveria conter somente os dois lotes concluidos, encontrou %', v_count;
  END IF;
END
$behavior$;

ROLLBACK;

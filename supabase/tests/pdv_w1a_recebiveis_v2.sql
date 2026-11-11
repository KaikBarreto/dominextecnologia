-- Contrato e smoke transacional de recebiveis W1A-03.
-- Executar apos `supabase db reset`.

BEGIN;

DO $contract$
DECLARE
  v_function text;
  v_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pdv_order_payments'
       AND column_name = 'receivable_transaction_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pdv_order_payments'
       AND column_name = 'settlement_transaction_id'
  ) THEN
    RAISE EXCEPTION 'papeis explicitos de recebivel/liquidacao ausentes';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'financial_transactions'
       AND column_name = 'pdv_financial_role'
  ) THEN
    RAISE EXCEPTION 'papel financeiro estruturado para W1C ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class table_row
    JOIN pg_namespace namespace ON namespace.oid = table_row.relnamespace
     WHERE namespace.nspname = 'public'
       AND table_row.relname = 'pdv_receivable_settlement_allocations'
       AND table_row.relrowsecurity
       AND table_row.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'tabela de alocacoes sem RLS FORCE';
  END IF;

  IF has_table_privilege(
       'authenticated', 'public.pdv_receivable_settlement_allocations', 'SELECT'
     ) OR has_table_privilege(
       'authenticated', 'public.pdv_receivable_settlement_allocations', 'INSERT'
     ) OR has_table_privilege(
       'anon', 'public.pdv_receivable_settlement_allocations', 'SELECT'
     )
  THEN
    RAISE EXCEPTION 'alocacoes expostas fora das RPCs';
  END IF;

  FOREACH v_function IN ARRAY ARRAY[
    'public.pdv_settle_receivables_v2(jsonb,text,uuid,uuid,date,text,text)',
    'public.pdv_reverse_receivable_settlement_v2(uuid,uuid,uuid,text,text)'
  ] LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_function, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'writer W1A-03 foi ativado antes da W1C em %', v_function;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc function
       WHERE function.oid = v_function::regprocedure
         AND function.prosecdef
         AND 'search_path=pg_catalog, public' = ANY(function.proconfig)
    ) THEN
      RAISE EXCEPTION '% sem SECURITY DEFINER/search_path fixo', v_function;
    END IF;
  END LOOP;

  v_function := 'public.pdv_customer_credit_statement_v2(uuid)';
  IF has_function_privilege('anon', v_function, 'EXECUTE')
     OR has_function_privilege('authenticated', v_function, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_function, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'extrato sensível foi ativado antes da W4';
  END IF;

  FOREACH v_function IN ARRAY ARRAY[
    'public.pdv_assert_receivable_allocation_v2()',
    'public.pdv_block_receivable_allocation_mutation_v2()',
    'public.pdv_guard_receivable_financial_v2()',
    'public.pdv_recalc_receivable_after_allocation_v2()',
    'public.pdv_create_receivable_financial_v2(uuid,uuid,uuid,uuid,uuid,text,numeric,date,text,uuid,boolean)',
    'public.pdv_receivable_received_total_v2(uuid,uuid)',
    'public.pdv_can_manage_receivables_v2(uuid,boolean)',
    'public.pdv_guard_legacy_receivable_writer_v2()'
  ] LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR has_function_privilege('service_role', v_function, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'helper owner-only exposto em %', v_function;
    END IF;
  END LOOP;

  IF has_function_privilege('anon', 'public.recalc_amount_received(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.recalc_amount_received(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.recalc_amount_received(uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'ACL do recálculo legado incompatível';
  END IF;

  SELECT pg_get_functiondef(
    'public.pdv_settle_receivables_v2(jsonb,text,uuid,uuid,date,text,text)'::regprocedure
  ) INTO v_definition;
  IF strpos(v_definition, 'pdv_lock_treasury_account') = 0
     OR strpos(v_definition, 'FROM public.pdv_cash_sessions') = 0
     OR strpos(v_definition, 'FROM public.financial_transactions') = 0
     OR strpos(v_definition, 'pdv_lock_treasury_account')
        > strpos(v_definition, 'FROM public.pdv_cash_sessions')
     OR strpos(v_definition, 'FROM public.pdv_cash_sessions')
        > strpos(v_definition, 'FROM public.financial_transactions')
  THEN
    RAISE EXCEPTION 'ordem lock tesouraria -> sessao -> recebiveis foi perdida';
  END IF;

  IF v_definition LIKE '%pdv_settlement_applications%'
     OR v_definition LIKE '%inventory_movements%'
     OR v_definition LIKE '%CMV%'
  THEN
    RAISE EXCEPTION 'W1A-03 implementou DRE/CMV/aplicacoes antes da W1C';
  END IF;
  IF strpos(v_definition, 'pdv_can_manage_receivables_v2') = 0
     OR strpos(v_definition, 'PDV_RECEIVABLE_DATE_IN_FUTURE') = 0
     OR strpos(v_definition, 'can_use_bank_accounts') = 0
  THEN
    RAISE EXCEPTION 'gate futuro de autorização/data bancária incompleto';
  END IF;

  SELECT pg_get_functiondef(
    'public.pdv_guard_legacy_receivable_writer_v2()'::regprocedure
  ) INTO v_definition;
  IF strpos(v_definition, 'pdv_lock_treasury_accounts') = 0
     OR strpos(v_definition, 'pdv_lock_treasury_accounts')
        > strpos(v_definition, 'FOR UPDATE')
  THEN
    RAISE EXCEPTION 'writer legado trava obrigação antes da tesouraria';
  END IF;

  SELECT pg_get_functiondef(
    'public.reset_system_step(uuid,text,uuid)'::regprocedure
  ) INTO v_definition;
  IF strpos(v_definition, 'app.pdv_receivable_reset_ids') = 0
     OR strpos(v_definition, 'PDV_RECEIVABLE_FINANCIAL_RESET_V2') = 0
  THEN
    RAISE EXCEPTION 'lifecycle de reset não integrou recebíveis v2';
  END IF;

  SELECT pg_get_functiondef(
    'public.pdv_create_receivable_financial_v2(uuid,uuid,uuid,uuid,uuid,text,numeric,date,text,uuid,boolean)'::regprocedure
  ) INTO v_definition;
  IF strpos(v_definition, 'INSERT INTO public.financial_transactions') = 0
     OR strpos(v_definition, 'INSERT INTO public.pdv_cash_custody_entries') = 0
     OR strpos(v_definition, 'INSERT INTO public.financial_transactions')
        > strpos(v_definition, 'INSERT INTO public.pdv_cash_custody_entries')
  THEN
    RAISE EXCEPTION 'liquidacao em dinheiro nao e atomica com custodia';
  END IF;
END
$contract$;

DO $behavior$
DECLARE
  v_company_a uuid := 'a3000000-0000-4000-8000-000000000001';
  v_company_b uuid := 'a3000000-0000-4000-8000-000000000002';
  v_company_c uuid := 'a3000000-0000-4000-8000-000000000003';
  v_company_d uuid := 'a3000000-0000-4000-8000-000000000004';
  v_user_a uuid := 'a3000000-0000-4000-8000-000000000011';
  v_user_b uuid := 'a3000000-0000-4000-8000-000000000012';
  v_customer_a uuid := 'a3000000-0000-4000-8000-000000000021';
  v_customer_b uuid := 'a3000000-0000-4000-8000-000000000022';
  v_customer_c uuid := 'a3000000-0000-4000-8000-000000000023';
  v_customer_d uuid := 'a3000000-0000-4000-8000-000000000024';
  v_cash_a uuid := 'a3000000-0000-4000-8000-000000000031';
  v_bank_a uuid := 'a3000000-0000-4000-8000-000000000032';
  v_bank_b uuid := 'a3000000-0000-4000-8000-000000000033';
  v_bank_c uuid := 'a3000000-0000-4000-8000-000000000034';
  v_bank_d uuid := 'a3000000-0000-4000-8000-000000000035';
  v_terminal_a uuid := 'a3000000-0000-4000-8000-000000000041';
  v_terminal_b uuid := 'a3000000-0000-4000-8000-000000000042';
  v_session_a uuid;
  v_session_b uuid;
  v_order_a uuid := 'a3000000-0000-4000-8000-000000000051';
  v_r1 uuid := 'a3000000-0000-4000-8000-000000000061';
  v_r2 uuid := 'a3000000-0000-4000-8000-000000000062';
  v_r3 uuid := 'a3000000-0000-4000-8000-000000000063';
  v_rb uuid := 'a3000000-0000-4000-8000-000000000064';
  v_rc uuid := 'a3000000-0000-4000-8000-000000000065';
  v_settlement_c uuid := 'a3000000-0000-4000-8000-000000000066';
  v_r4 uuid := 'a3000000-0000-4000-8000-000000000067';
  v_r5 uuid := 'a3000000-0000-4000-8000-000000000068';
  v_legacy_child uuid := 'a3000000-0000-4000-8000-000000000069';
  v_rd uuid := 'a3000000-0000-4000-8000-00000000006a';
  v_settlement_d uuid := 'a3000000-0000-4000-8000-00000000006b';
  v_result jsonb;
  v_replay jsonb;
  v_pix_transaction uuid;
  v_cash_transaction uuid;
  v_reversal_transaction uuid;
  v_legacy_v2_transaction uuid;
  v_blocked boolean;
  v_count integer;
  v_balance numeric;
  v_statement_total numeric;
  v_statement_count integer;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000', v_user_a,
      'authenticated', 'authenticated', 'recebiveis-a@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Operador Recebiveis A"}'::jsonb,
      now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_user_b,
      'authenticated', 'authenticated', 'recebiveis-b@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Operador Recebiveis B"}'::jsonb,
      now(), now(), '', '', '', ''
    );

  INSERT INTO public.companies (id, name, subscription_status)
  VALUES
    (v_company_a, 'Empresa Recebiveis A', 'active'),
    (v_company_b, 'Empresa Recebiveis B', 'active');

  UPDATE public.profiles SET company_id = v_company_a, is_active = true
   WHERE user_id IN (v_user_a, v_user_b);
  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_user_a, 'comercial'::public.app_role),
    (v_user_b, 'comercial'::public.app_role);
  INSERT INTO public.user_permissions (user_id, permissions, is_active) VALUES
    (v_user_a, '["screen:pdv"]'::jsonb, true),
    (v_user_b, '["screen:pdv"]'::jsonb, true);
  INSERT INTO public.company_modules (company_id, module_code)
  VALUES (v_company_a, 'pdv');

  INSERT INTO public.customers (id, company_id, name, credit_limit) VALUES
    (v_customer_a, v_company_a, 'Cliente Recebiveis A', 1000),
    (v_customer_b, v_company_b, 'Cliente Recebiveis B', 1000);
  INSERT INTO public.financial_accounts (
    id, company_id, name, type, initial_balance, is_active
  ) VALUES
    (v_cash_a, v_company_a, 'Cofre Recebiveis', 'caixa', 1000, true),
    (v_bank_a, v_company_a, 'Banco Recebiveis A', 'banco', 500, true),
    (v_bank_b, v_company_b, 'Banco Recebiveis B', 'banco', 500, true);
  INSERT INTO public.company_settings (
    company_id, name, pdv_cash_account_id, pdv_strict_cash_tracking, pdv_mode
  ) VALUES (
    v_company_a, 'Config Recebiveis', v_cash_a, true, 'simples'
  ) ON CONFLICT (company_id) DO UPDATE SET
    pdv_cash_account_id = EXCLUDED.pdv_cash_account_id,
    pdv_strict_cash_tracking = true;
  INSERT INTO public.pdv_terminals (id, company_id, name, is_active) VALUES
    (v_terminal_a, v_company_a, 'Terminal Recebiveis A', true),
    (v_terminal_b, v_company_a, 'Terminal Recebiveis B', true);

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );
  v_result := public.pdv_open_cash_session_v2(
    v_terminal_a, v_cash_a, 100, 'recv-open-session-a-0001'
  );
  v_session_a := (v_result->>'session_id')::uuid;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_b, 'role', 'authenticated')::text,
    true
  );
  v_result := public.pdv_open_cash_session_v2(
    v_terminal_b, v_cash_a, 100, 'recv-open-session-b-0001'
  );
  v_session_b := (v_result->>'session_id')::uuid;

  INSERT INTO public.pdv_orders (
    id, company_id, number, customer_id, terminal_id, status,
    subtotal, total, cash_session_id, client_request_id
  ) VALUES (
    v_order_a, v_company_a, 1, v_customer_a, v_terminal_a, 'pago',
    300, 300, v_session_a, 'receivable-order-0001'
  );
  INSERT INTO public.financial_transactions (
    id, company_id, transaction_type, description, amount, category,
    transaction_date, due_date, is_paid, customer_id, origin,
    payment_method, created_by
  ) VALUES
    (v_r1, v_company_a, 'entrada', 'Parcela 1/3', 100, 'Venda no fiado',
     public.company_today(v_company_a), public.company_today(v_company_a), false,
     v_customer_a, 'pdv', 'fiado', v_user_a),
    (v_r2, v_company_a, 'entrada', 'Parcela 2/3', 100, 'Venda no fiado',
     public.company_today(v_company_a), public.company_today(v_company_a) + 30, false,
     v_customer_a, 'pdv', 'fiado', v_user_a),
    (v_r3, v_company_a, 'entrada', 'Parcela 3/3', 100, 'Venda no fiado',
     public.company_today(v_company_a), public.company_today(v_company_a) + 60, false,
     v_customer_a, 'pdv', 'fiado', v_user_a),
    (v_rb, v_company_b, 'entrada', 'Parcela outro tenant', 100, 'Venda no fiado',
     public.company_today(v_company_b), public.company_today(v_company_b), false,
     v_customer_b, 'pdv', 'fiado', v_user_a);

  INSERT INTO public.pdv_order_payments (
    company_id, order_id, method, amount, financial_transaction_id,
    contract_version, coverage_kind, coverage_status, settlement_status,
    receivable_transaction_id, authorized_at, created_by
  ) VALUES
    (v_company_a, v_order_a, 'fiado', 100, NULL, 2, 'receivable',
     'authorized', 'open', v_r1, now(), v_user_a),
    (v_company_a, v_order_a, 'fiado', 100, NULL, 2, 'receivable',
     'authorized', 'open', v_r2, now(), v_user_a),
    (v_company_a, v_order_a, 'fiado', 100, NULL, 2, 'receivable',
     'authorized', 'open', v_r3, now(), v_user_a);

  -- Ledger legado ligado aos mesmos recebiveis nao pode duplicar a divida.
  INSERT INTO public.customer_credit_ledger (
    company_id, customer_id, kind, amount, order_id,
    financial_transaction_id, created_by, notes
  ) VALUES
    (v_company_a, v_customer_a, 'venda_fiado', 100, v_order_a, v_r1, v_user_a, 'legado 1'),
    (v_company_a, v_customer_a, 'venda_fiado', 100, v_order_a, v_r2, v_user_a, 'legado 2'),
    (v_company_a, v_customer_a, 'venda_fiado', 100, v_order_a, v_r3, v_user_a, 'legado 3'),
    (v_company_a, v_customer_a, 'ajuste', 5, v_order_a, NULL, v_user_a, 'ajuste legado independente');

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );

  v_blocked := false;
  BEGIN
    PERFORM public.pdv_settle_receivables_v2(
      jsonb_build_array(jsonb_build_object('receivable_id', v_r3, 'amount', 1)),
      'pix', v_bank_a, NULL, public.company_today(v_company_a),
      'sem capacidade nominal', 'recv-permission-denied-a-0001'
    );
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'screen:pdv autorizou baixa de recebível';
  END IF;

  DELETE FROM public.user_permissions WHERE user_id = v_user_b;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_b, 'role', 'authenticated')::text,
    true
  );
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_settle_receivables_v2(
      jsonb_build_array(jsonb_build_object('receivable_id', v_r3, 'amount', 1)),
      'dinheiro', v_cash_a, v_session_b, public.company_today(v_company_a),
      'role sem permissão explícita', 'recv-permission-denied-b-0001'
    );
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'fallback legado de role autorizou baixa de recebível';
  END IF;

  UPDATE public.user_permissions
     SET permissions = '["screen:pdv","fn:receive_pdv_receivable","fn:use_bank_accounts"]'::jsonb
   WHERE user_id = v_user_a;
  INSERT INTO public.user_permissions (user_id, permissions, is_active) VALUES (
    v_user_b, '["screen:pdv","fn:receive_pdv_receivable"]'::jsonb, true
  );
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );

  v_blocked := false;
  BEGIN
    PERFORM public.pdv_settle_receivables_v2(
      jsonb_build_array(jsonb_build_object('receivable_id', v_r3, 'amount', 1)),
      'pix', v_bank_a, NULL, public.company_today(v_company_a) + 1,
      'data futura', 'recv-future-date-0001'
    );
  EXCEPTION WHEN invalid_parameter_value THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'baixa aceitou data futura';
  END IF;

  v_result := public.pdv_settle_receivables_v2(
    jsonb_build_array(
      jsonb_build_object('receivable_id', v_r1, 'amount', 100),
      jsonb_build_object('receivable_id', v_r2, 'amount', 20)
    ),
    'pix', v_bank_a, NULL, public.company_today(v_company_a),
    'Pix parcial 100 + 20', 'recv-pix-settlement-0001'
  );
  v_pix_transaction := (v_result->>'financial_transaction_id')::uuid;
  IF (v_result->>'amount')::numeric <> 120
     OR NOT EXISTS (
       SELECT 1 FROM public.financial_transactions transaction
        WHERE transaction.id = v_pix_transaction
          AND transaction.account_id = v_bank_a
          AND transaction.amount = 120
          AND transaction.category = 'Recebimento parcial'
          AND transaction.pdv_financial_role = 'pdv_receivable_settlement'
          AND transaction.pdv_settlement_group_id IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'baixa Pix nao criou liquidacao canonica: %', v_result;
  END IF;

  SELECT sum(transaction.amount - transaction.amount_received)
    INTO v_balance
    FROM public.financial_transactions transaction
   WHERE transaction.id IN (v_r1, v_r2, v_r3);
  IF v_balance <> 180
     OR NOT EXISTS (
       SELECT 1 FROM public.financial_transactions WHERE id = v_r1
         AND amount_received = 100 AND is_paid
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.financial_transactions WHERE id = v_r2
         AND amount_received = 20 AND NOT is_paid
     )
  THEN
    RAISE EXCEPTION 'saldo 3x100 apos Pix deveria ser 180, obtido %', v_balance;
  END IF;

  v_replay := public.pdv_settle_receivables_v2(
    jsonb_build_array(
      jsonb_build_object('receivable_id', v_r2, 'amount', 20.00),
      jsonb_build_object('receivable_id', v_r1, 'amount', 100.00)
    ),
    ' PIX ', v_bank_a, NULL, NULL,
    '  Pix parcial 100 + 20  ', 'recv-pix-settlement-0001'
  );
  IF v_replay IS DISTINCT FROM v_result THEN
    RAISE EXCEPTION 'retry da baixa Pix nao recuperou o resultado';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.pdv_settle_receivables_v2(
      jsonb_build_array(
        jsonb_build_object('receivable_id', v_r1, 'amount', 100),
        jsonb_build_object('receivable_id', v_r2, 'amount', 21)
      ),
      'pix', v_bank_a, NULL, public.company_today(v_company_a),
      'payload divergente', 'recv-pix-settlement-0001'
    );
  EXCEPTION WHEN invalid_parameter_value THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'chave idempotente aceitou payload divergente';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.pdv_settle_receivables_v2(
      jsonb_build_array(jsonb_build_object('receivable_id', v_rb, 'amount', 10)),
      'pix', v_bank_a, NULL, public.company_today(v_company_a),
      'outro tenant', 'recv-cross-tenant-0001'
    );
  EXCEPTION WHEN no_data_found THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'baixa aceitou recebivel de outro tenant';
  END IF;

  v_result := public.pdv_settle_receivables_v2(
    jsonb_build_array(jsonb_build_object('receivable_id', v_r3, 'amount', 30)),
    'dinheiro', v_cash_a, v_session_a, public.company_today(v_company_a),
    'Recebimento em dinheiro', 'recv-cash-settlement-0001'
  );
  v_cash_transaction := (v_result->>'financial_transaction_id')::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM public.pdv_cash_custody_entries entry
     WHERE entry.session_id = v_session_a
       AND entry.financial_transaction_id = v_cash_transaction
       AND entry.entry_kind = 'cash_receipt'
       AND entry.amount = 30
  ) OR (
    SELECT custody_amount FROM public.pdv_cash_custody_position(v_company_a, v_session_a)
  ) <> 130 THEN
    RAISE EXCEPTION 'baixa em dinheiro nao atualizou custodia: %', v_result;
  END IF;

  -- Outro caixa tenta consumir mais do que o saldo residual da mesma parcela.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_b, 'role', 'authenticated')::text,
    true
  );
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_settle_receivables_v2(
      jsonb_build_array(jsonb_build_object('receivable_id', v_r3, 'amount', 80)),
      'dinheiro', v_cash_a, v_session_b, public.company_today(v_company_a),
      'Disputa do residual', 'recv-cash-race-0001'
    );
  EXCEPTION WHEN check_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'dois caixas baixaram mais do que o saldo da parcela';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_reverse_receivable_settlement_v2(
      v_cash_transaction, v_cash_a, v_session_a,
      'sem capacidade de estorno', 'recv-cash-reversal-denied-0001'
    );
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'capacidade de baixa autorizou estorno sensível';
  END IF;
  UPDATE public.user_permissions
     SET permissions = permissions || '["fn:reverse_pdv_receivable"]'::jsonb
   WHERE user_id = v_user_a;

  PERFORM public.pdv_record_cash_event_v2(
    v_session_a, v_cash_a, 'withdrawal', 110,
    'Retirada para testar estorno sem saldo', NULL,
    'recv-withdraw-insufficient-0001'
  );
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_reverse_receivable_settlement_v2(
      v_cash_transaction, v_cash_a, v_session_a,
      'tentativa sem saldo físico', 'recv-cash-reversal-insufficient-0001'
    );
  EXCEPTION WHEN check_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked
     OR EXISTS (
       SELECT 1 FROM public.pdv_receivable_settlement_allocations reversal
        JOIN public.pdv_receivable_settlement_allocations original
          ON original.id = reversal.reversal_of_id
       WHERE original.settlement_transaction_id = v_cash_transaction
     )
     OR EXISTS (
       SELECT 1 FROM public.financial_transactions transaction
        WHERE transaction.company_id = v_company_a
          AND transaction.pdv_financial_role = 'pdv_receivable_reversal'
     )
  THEN
    RAISE EXCEPTION 'estorno sem custódia criou fato parcial';
  END IF;
  PERFORM public.pdv_record_cash_event_v2(
    v_session_a, v_cash_a, 'supply', 110,
    'Reposição após teste de estorno sem saldo', NULL,
    'recv-supply-after-insufficient-0001'
  );

  v_result := public.pdv_reverse_receivable_settlement_v2(
    v_cash_transaction, v_cash_a, v_session_a,
    'Recebimento lançado em duplicidade', 'recv-cash-reversal-0001'
  );
  v_reversal_transaction := (v_result->>'financial_transaction_id')::uuid;
  IF (v_result->>'amount')::numeric <> -30
     OR NOT EXISTS (
       SELECT 1 FROM public.pdv_cash_custody_entries entry
        WHERE entry.financial_transaction_id = v_reversal_transaction
          AND entry.entry_kind = 'refund'
          AND entry.amount = -30
     )
     OR (SELECT amount_received FROM public.financial_transactions WHERE id = v_r3) <> 0
     OR (
       SELECT custody_amount FROM public.pdv_cash_custody_position(v_company_a, v_session_a)
     ) <> 100
  THEN
    RAISE EXCEPTION 'estorno compensatorio nao reabriu parcela/custodia: %', v_result;
  END IF;

  -- Coexistência v1/v2: o saldo considera filhos legados e alocações.
  INSERT INTO public.financial_transactions (
    id, company_id, transaction_type, description, amount, category,
    transaction_date, is_paid, customer_id, origin
  ) VALUES
    (v_r4, v_company_a, 'entrada', 'Parcela com baixa legada', 100,
     'Venda no fiado', public.company_today(v_company_a) - 3, false, v_customer_a, 'pdv'),
    (v_r5, v_company_a, 'entrada', 'Parcela já paga manualmente', 100,
     'Venda no fiado', public.company_today(v_company_a), true, v_customer_a, 'pdv');
  UPDATE public.financial_transactions
     SET paid_date = public.company_today(v_company_a),
         updated_at = now() + interval '10 days'
   WHERE id = v_r5;
  INSERT INTO public.pdv_order_payments (
    company_id, order_id, method, amount, financial_transaction_id,
    contract_version, coverage_kind, coverage_status, settlement_status,
    receivable_transaction_id, authorized_at, created_by
  ) VALUES
    (v_company_a, v_order_a, 'fiado', 100, NULL, 2, 'receivable',
     'authorized', 'open', v_r4, now(), v_user_a),
    (v_company_a, v_order_a, 'fiado', 100, NULL, 2, 'receivable',
     'authorized', 'settled', v_r5, now(), v_user_a);
  INSERT INTO public.financial_transactions (
    id, company_id, transaction_type, description, amount, category,
    transaction_date, paid_date, is_paid, customer_id, parent_transaction_id, origin
  ) VALUES (
    v_legacy_child, v_company_a, 'entrada', 'Baixa legada 30', 30,
    'Recebimento parcial', public.company_today(v_company_a) - 2,
    public.company_today(v_company_a) - 2, true, NULL, v_r4, 'finance'
  );
  IF (SELECT amount_received FROM public.financial_transactions WHERE id = v_r4) <> 30 THEN
    RAISE EXCEPTION 'filho legado não recalculou a obrigação';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.pdv_settle_receivables_v2(
      jsonb_build_array(jsonb_build_object('receivable_id', v_r4, 'amount', 71)),
      'pix', v_bank_a, NULL, public.company_today(v_company_a),
      'acima do residual legado', 'recv-legacy-overflow-0001'
    );
  EXCEPTION WHEN check_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'v2 ignorou baixa legada ao validar saldo';
  END IF;

  v_result := public.pdv_settle_receivables_v2(
    jsonb_build_array(jsonb_build_object('receivable_id', v_r4, 'amount', 70)),
    'pix', v_bank_a, NULL, public.company_today(v_company_a) - 1,
    'residual após baixa legada', 'recv-legacy-residual-0001'
  );
  v_legacy_v2_transaction := (v_result->>'financial_transaction_id')::uuid;
  IF NOT (SELECT is_paid FROM public.financial_transactions WHERE id = v_r4)
     OR (SELECT amount_received FROM public.financial_transactions WHERE id = v_r4) <> 100
  THEN
    RAISE EXCEPTION 'baixa v2 do residual legado não quitou a obrigação';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.pdv_settle_receivables_v2(
      jsonb_build_array(jsonb_build_object('receivable_id', v_r5, 'amount', 1)),
      'pix', v_bank_a, NULL, public.company_today(v_company_a),
      'principal já pago', 'recv-already-paid-0001'
    );
  EXCEPTION WHEN check_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'principal já pago aceitou nova baixa';
  END IF;

  v_blocked := false;
  BEGIN
    INSERT INTO public.financial_transactions (
      company_id, transaction_type, description, amount, category,
      transaction_date, paid_date, is_paid, customer_id, parent_transaction_id, origin
    ) VALUES (
      v_company_a, 'entrada', 'Escala inválida', 0.001, 'Recebimento parcial',
      public.company_today(v_company_a), public.company_today(v_company_a), true,
      v_customer_a, v_r5, 'finance'
    );
  EXCEPTION WHEN check_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'filho legado aceitou valor não positivo/mais de 2 casas';
  END IF;
  v_blocked := false;
  BEGIN
    INSERT INTO public.financial_transactions (
      company_id, transaction_type, description, amount, category,
      transaction_date, paid_date, is_paid, customer_id, parent_transaction_id, origin
    ) VALUES (
      v_company_a, 'entrada', 'Valor negativo', -1, 'Recebimento parcial',
      public.company_today(v_company_a), public.company_today(v_company_a), true,
      v_customer_a, v_r5, 'finance'
    );
  EXCEPTION WHEN check_violation THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'filho legado aceitou valor negativo';
  END IF;

  v_blocked := false;
  BEGIN
    UPDATE public.financial_transactions SET amount = 121
     WHERE id = v_pix_transaction;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'liquidacao vinculada aceitou UPDATE';
  END IF;

  v_blocked := false;
  BEGIN
    DELETE FROM public.pdv_receivable_settlement_allocations
     WHERE settlement_transaction_id = v_pix_transaction;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'alocacao append-only aceitou DELETE';
  END IF;

  SELECT count(*), sum(statement.amount)
    INTO v_statement_count, v_statement_total
    FROM public.pdv_customer_credit_statement_v2(v_customer_a) statement;
  IF v_statement_total <> 185 OR v_statement_count <> 13 THEN
    RAISE EXCEPTION 'extrato deduplicado deveria totalizar 185 em 13 linhas: %/%',
      v_statement_total, v_statement_count;
  END IF;
  SELECT count(*) INTO v_count
    FROM public.pdv_customer_credit_statement_v2(v_customer_a) statement
   WHERE statement.source_type = 'legacy_ledger';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'extrato nao preservou somente o ajuste legado independente';
  END IF;
  IF (SELECT COALESCE(sum(amount), 0)
           FROM public.pdv_customer_credit_statement_v2(v_customer_a)
          WHERE financial_transaction_id = v_r5) <> 0
     OR (SELECT count(*)
           FROM public.pdv_customer_credit_statement_v2(v_customer_a)
          WHERE source_type = 'legacy_settlement'
            AND entry_id = v_legacy_child) <> 1
     OR public.pdv_receivable_received_total_v2(v_r4, NULL) <> 100
  THEN
    RAISE EXCEPTION 'adapter v1/v2 não zerou baixa legada + v2 ou quitação direta';
  END IF;
  IF (SELECT count(*) FROM public.pdv_customer_credit_statement_v2(v_customer_a)) <>
     (SELECT count(DISTINCT entry_id) FROM public.pdv_customer_credit_statement_v2(v_customer_a))
     OR (
       SELECT (statement.occurred_at AT TIME ZONE settings.timezone)::date
         FROM public.pdv_customer_credit_statement_v2(v_customer_a) statement
         JOIN public.company_settings settings ON settings.company_id = v_company_a
        WHERE statement.source_type = 'legacy_direct_settlement'
          AND statement.financial_transaction_id = v_r5
     ) <> public.company_today(v_company_a)
     OR (
       SELECT (statement.occurred_at AT TIME ZONE settings.timezone)::date
         FROM public.pdv_customer_credit_statement_v2(v_customer_a) statement
         JOIN public.company_settings settings ON settings.company_id = v_company_a
        WHERE statement.source_type = 'receivable'
          AND statement.entry_id = v_r4
     ) <> public.company_today(v_company_a) - 3
     OR (
       SELECT (statement.occurred_at AT TIME ZONE settings.timezone)::date
         FROM public.pdv_customer_credit_statement_v2(v_customer_a) statement
         JOIN public.company_settings settings ON settings.company_id = v_company_a
        WHERE statement.source_type = 'legacy_settlement'
          AND statement.entry_id = v_legacy_child
     ) <> public.company_today(v_company_a) - 2
     OR (
       SELECT (statement.occurred_at AT TIME ZONE settings.timezone)::date
         FROM public.pdv_customer_credit_statement_v2(v_customer_a) statement
         JOIN public.company_settings settings ON settings.company_id = v_company_a
        WHERE statement.source_type = 'settlement'
          AND statement.financial_transaction_id = v_legacy_v2_transaction
     ) <> public.company_today(v_company_a) - 1
  THEN
    RAISE EXCEPTION 'extrato tem identidade duplicada ou data direta móvel';
  END IF;

  IF to_regclass('public.pdv_settlement_applications') IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.pdv_settlement_applications;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'W1A-03 criou aplicacoes DRE-caixa indevidamente';
    END IF;
  END IF;

  -- Reset PDV remove dívida v2 capturada pelas coberturas, liquidações e
  -- requests; o financeiro do outro tenant permanece intacto.
  UPDATE public.user_roles SET role = 'super_admin'::public.app_role
   WHERE user_id = v_user_a;
  PERFORM public.reset_system_step(v_company_a, 'pdv', NULL);
  IF EXISTS (
       SELECT 1 FROM public.pdv_receivable_settlement_allocations
        WHERE company_id = v_company_a
     )
     OR EXISTS (
       SELECT 1 FROM public.financial_transactions
        WHERE id IN (v_r1, v_r2, v_r3, v_r4, v_r5, v_legacy_child, v_pix_transaction,
                     v_cash_transaction, v_reversal_transaction)
     )
     OR EXISTS (
       SELECT 1 FROM public.pdv_operation_requests
        WHERE company_id = v_company_a
          AND operation_type IN ('receivable.settle.v2', 'receivable.reverse.v2', 'cash.event.v2')
     )
     OR NOT EXISTS (SELECT 1 FROM public.financial_transactions WHERE id = v_rb)
  THEN
    RAISE EXCEPTION 'reset PDV deixou dívida/request órfão ou afetou outro tenant';
  END IF;

  -- Lifecycle real de admin_delete com alocacao ligada a dois financeiros.
  INSERT INTO public.companies (id, name, subscription_status)
  VALUES (v_company_c, 'Empresa Recebiveis C', 'active');
  INSERT INTO public.customers (id, company_id, name)
  VALUES (v_customer_c, v_company_c, 'Cliente Recebiveis C');
  INSERT INTO public.financial_accounts (
    id, company_id, name, type, initial_balance, is_active
  ) VALUES (v_bank_c, v_company_c, 'Banco Recebiveis C', 'banco', 100, true);
  INSERT INTO public.financial_transactions (
    id, company_id, transaction_type, description, amount, category,
    transaction_date, is_paid, customer_id, origin
  ) VALUES (
    v_rc, v_company_c, 'entrada', 'Parcela C', 100, 'Venda no fiado',
    public.company_today(v_company_c), false, v_customer_c, 'pdv'
  ), (
    v_settlement_c, v_company_c, 'entrada', 'Liquidação C', 50,
    'Recebimento parcial', public.company_today(v_company_c), true,
    v_customer_c, 'pdv'
  );
  INSERT INTO public.pdv_operation_requests (
    id, company_id, operation_type, idempotency_key, payload_hash
  ) VALUES (
    'a3000000-0000-4000-8000-000000000071', v_company_c,
    'receivable.settle.v2', 'recv-admin-delete-0001', repeat('c', 64)
  );
  INSERT INTO public.pdv_receivable_settlement_allocations (
    company_id, customer_id, settlement_transaction_id,
    receivable_transaction_id, operation_request_id, allocation_kind,
    amount, settlement_method
  ) VALUES (
    v_company_c, v_customer_c, v_settlement_c, v_rc,
    'a3000000-0000-4000-8000-000000000071', 'settlement', 50, 'pix'
  );

  UPDATE public.user_roles SET role = 'super_admin'::public.app_role
   WHERE user_id = v_user_a;
  PERFORM public.admin_delete_company(v_company_c);
  IF EXISTS (SELECT 1 FROM public.companies WHERE id = v_company_c)
     OR EXISTS (
       SELECT 1 FROM public.pdv_receivable_settlement_allocations
        WHERE company_id = v_company_c
     )
     OR NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company_a)
  THEN
    RAISE EXCEPTION 'admin delete falhou no lifecycle das alocacoes';
  END IF;

  -- Reset financeiro remove fatos e requests idempotentes juntos.
  INSERT INTO public.companies (id, name, subscription_status)
  VALUES (v_company_d, 'Empresa Recebiveis D', 'active');
  INSERT INTO public.customers (id, company_id, name)
  VALUES (v_customer_d, v_company_d, 'Cliente Recebiveis D');
  INSERT INTO public.financial_accounts (
    id, company_id, name, type, initial_balance, is_active
  ) VALUES (v_bank_d, v_company_d, 'Banco Recebiveis D', 'banco', 100, true);
  INSERT INTO public.financial_transactions (
    id, company_id, transaction_type, description, amount, category,
    transaction_date, is_paid, customer_id, origin
  ) VALUES
    (v_rd, v_company_d, 'entrada', 'Parcela D', 100, 'Venda no fiado',
     public.company_today(v_company_d), false, v_customer_d, 'pdv'),
    (v_settlement_d, v_company_d, 'entrada', 'Liquidação D', 40,
     'Recebimento parcial', public.company_today(v_company_d), true,
     v_customer_d, 'pdv');
  INSERT INTO public.pdv_operation_requests (
    id, company_id, operation_type, idempotency_key, payload_hash,
    status, resource_type, resource_id, result, completed_at
  ) VALUES (
    'a3000000-0000-4000-8000-000000000072', v_company_d,
    'receivable.settle.v2', 'recv-financial-reset-0001', repeat('d', 64),
    'completed', 'financial_transaction', v_settlement_d,
    jsonb_build_object('financial_transaction_id', v_settlement_d), now()
  );
  INSERT INTO public.pdv_receivable_settlement_allocations (
    company_id, customer_id, settlement_transaction_id,
    receivable_transaction_id, operation_request_id, allocation_kind,
    amount, settlement_method
  ) VALUES (
    v_company_d, v_customer_d, v_settlement_d, v_rd,
    'a3000000-0000-4000-8000-000000000072', 'settlement', 40, 'pix'
  );

  PERFORM public.reset_system_step(v_company_d, 'financial_movements', NULL);
  IF EXISTS (
       SELECT 1 FROM public.pdv_receivable_settlement_allocations
        WHERE company_id = v_company_d
     )
     OR EXISTS (
       SELECT 1 FROM public.financial_transactions WHERE id IN (v_rd, v_settlement_d)
     )
     OR EXISTS (
       SELECT 1 FROM public.pdv_operation_requests
        WHERE company_id = v_company_d
          AND operation_type = 'receivable.settle.v2'
     )
     OR NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company_d)
     OR NOT EXISTS (SELECT 1 FROM public.financial_transactions WHERE id = v_rb)
  THEN
    RAISE EXCEPTION 'reset financeiro deixou fato/request órfão ou afetou outro tenant';
  END IF;
END
$behavior$;

ROLLBACK;

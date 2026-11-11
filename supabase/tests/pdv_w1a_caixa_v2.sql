-- Contrato e smoke transacional do caixa/custodia W1A-02.
-- Executar apos `supabase db reset`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pdv_w1a_caixa_v2.sql

BEGIN;

DO $contract$
DECLARE
  v_function text;
  v_definition text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'pdv_cash_sessions'
       AND indexname = 'uniq_pdv_cash_sessions_v2_open_by_operator'
  ) THEN
    RAISE EXCEPTION 'indice de uma sessao v2 aberta por operador ausente';
  END IF;

  FOREACH v_function IN ARRAY ARRAY[
    'public.pdv_open_cash_session_v2(uuid,uuid,numeric,text)',
    'public.pdv_record_cash_event_v2(uuid,uuid,text,numeric,text,text,text)',
    'public.pdv_reverse_cash_event_v2(uuid,uuid,text,text)',
    'public.pdv_close_cash_session_v2(uuid,uuid,numeric,text,text)',
    'public.pdv_cash_snapshot_v2(uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_function, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'ACL publica incorreta em %', v_function;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_proc function
       WHERE function.oid = v_function::regprocedure
         AND function.prosecdef
         AND 'search_path=pg_catalog, public' = ANY (function.proconfig)
    ) THEN
      RAISE EXCEPTION '% deve ser SECURITY DEFINER com search_path fixo', v_function;
    END IF;
  END LOOP;

  FOREACH v_function IN ARRAY ARRAY[
    'public.pdv_cash_v2_context()',
    'public.pdv_cash_snapshot_v2_internal(uuid,uuid)',
    'public.pdv_note_cash_reconciliation_issue(uuid,text,jsonb)',
    'public.pdv_guard_financial_treasury_v2()',
    'public.pdv_guard_financial_account_treasury_v2()',
    'public.pdv_block_custody_entry_mutation()'
  ] LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_function, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'helper interno exposto ou indisponivel em %', v_function;
    END IF;
  END LOOP;

  IF has_function_privilege('anon','public.pdv_has_stock_access_scope_v2(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.pdv_has_stock_access_scope_v2(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('service_role','public.pdv_has_stock_access_scope_v2(uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'helper de ACL por local foi exposto a role da API';
  END IF;

  IF has_function_privilege(
       'anon', 'public.pdv_admin_delete_company_base(uuid)', 'EXECUTE'
     ) OR has_function_privilege(
       'authenticated', 'public.pdv_admin_delete_company_base(uuid)', 'EXECUTE'
     ) OR has_function_privilege(
       'service_role', 'public.pdv_admin_delete_company_base(uuid)', 'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'base administrativa pode contornar wrapper nominal';
  END IF;

  IF has_function_privilege('anon', 'public.admin_delete_company(uuid)', 'EXECUTE')
     OR NOT has_function_privilege(
       'authenticated', 'public.admin_delete_company(uuid)', 'EXECUTE'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc function
        WHERE function.oid = 'public.admin_delete_company(uuid)'::regprocedure
          AND function.prosecdef
          AND 'search_path=pg_catalog, public, extensions' = ANY (function.proconfig)
     )
  THEN
    RAISE EXCEPTION 'wrapper administrativa perdeu ACL/search_path canonicos';
  END IF;

  SELECT pg_get_functiondef(
    'public.pdv_open_cash_session_v2(uuid,uuid,numeric,text)'::regprocedure
  ) INTO v_definition;
  IF strpos(v_definition, 'pdv_lock_treasury_account') = 0
     OR strpos(v_definition, 'FROM public.company_settings') = 0
     OR strpos(v_definition, 'pdv_lock_treasury_account')
        > strpos(v_definition, 'FROM public.company_settings')
  THEN
    RAISE EXCEPTION 'abertura le configuracao antes do lock de tesouraria';
  END IF;

  SELECT pg_get_functiondef(
    'public.pdv_record_cash_event_v2(uuid,uuid,text,numeric,text,text,text)'::regprocedure
  ) INTO v_definition;
  IF strpos(v_definition, 'pdv_lock_treasury_account') = 0
     OR strpos(v_definition, 'FROM public.pdv_cash_sessions') = 0
     OR strpos(v_definition, 'pdv_lock_treasury_account')
        > strpos(v_definition, 'FROM public.pdv_cash_sessions')
  THEN
    RAISE EXCEPTION 'evento le sessao antes do lock de tesouraria';
  END IF;
  IF strpos(v_definition, 'INSERT INTO public.financial_transactions') = 0
     OR strpos(v_definition, 'INSERT INTO public.pdv_cash_custody_entries') = 0
     OR strpos(v_definition, 'INSERT INTO public.financial_transactions')
        > strpos(v_definition, 'INSERT INTO public.pdv_cash_custody_entries')
     OR v_definition LIKE '%p_financial_transaction_id%'
  THEN
    RAISE EXCEPTION 'evento financeiro/custodia nao esta atomico na mesma RPC';
  END IF;

  SELECT pg_get_functiondef(
    'public.pdv_close_cash_session_v2(uuid,uuid,numeric,text,text)'::regprocedure
  ) INTO v_definition;
  IF strpos(v_definition, 'pdv_lock_treasury_account') = 0
     OR strpos(v_definition, 'FROM public.pdv_cash_sessions') = 0
     OR strpos(v_definition, 'pdv_lock_treasury_account')
        > strpos(v_definition, 'FROM public.pdv_cash_sessions')
  THEN
    RAISE EXCEPTION 'fechamento le sessao antes do lock de tesouraria';
  END IF;

  SELECT pg_get_functiondef(
    'public.pdv_guard_financial_treasury_v2()'::regprocedure
  ) INTO v_definition;
  IF strpos(v_definition, 'pdv_lock_treasury_accounts') = 0
     OR strpos(v_definition, 'PDV_CUSTODY_FINANCIAL_IMMUTABLE') = 0
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger trigger
        WHERE trigger.tgrelid = 'public.financial_transactions'::regclass
          AND trigger.tgname = 'tg_zz_pdv_financial_treasury_v2'
          AND NOT trigger.tgisinternal
     )
  THEN
    RAISE EXCEPTION 'porta de lock/imutabilidade financeira ausente';
  END IF;

  SELECT pg_get_functiondef(
    'public.pdv_guard_financial_account_treasury_v2()'::regprocedure
  ) INTO v_definition;
  IF strpos(v_definition, 'pdv_lock_treasury_account') = 0
     OR strpos(v_definition, 'PDV_TREASURY_INITIAL_BALANCE_IMMUTABLE') = 0
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger trigger
        WHERE trigger.tgrelid = 'public.financial_accounts'::regclass
          AND trigger.tgname = 'tg_zz_pdv_financial_account_treasury_v2'
          AND NOT trigger.tgisinternal
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger trigger
        WHERE trigger.tgrelid = 'public.financial_accounts'::regclass
          AND trigger.tgname = 'tg_zz_pdv_financial_account_delete_v2'
          AND NOT trigger.tgisinternal
     )
  THEN
    RAISE EXCEPTION 'porta de lock/imutabilidade do saldo inicial ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint constraint_row
     WHERE constraint_row.conrelid = 'public.pdv_cash_custody_entries'::regclass
       AND constraint_row.conname = 'pdv_cash_custody_entries_session_id_fkey'
       AND constraint_row.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'custodia nao acompanha cascade controlado da sessao';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint constraint_row
     WHERE constraint_row.conrelid = 'public.pdv_cash_sessions'::regclass
       AND constraint_row.conname = 'pdv_cash_sessions_cash_account_id_fkey'
       AND constraint_row.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'sessao v2 nao acompanha exclusao administrativa da conta';
  END IF;
END
$contract$;

-- Falha injetada depois do INSERT financeiro para provar que a RPC atomica
-- reverte o fato caso a custodia nao consiga ser persistida.
CREATE FUNCTION public.pdv_w1a_test_fail_custody_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $test$
BEGIN
  IF NEW.metadata->>'notes' = 'FORCE_ATOMIC_FAILURE' THEN
    RAISE EXCEPTION 'falha de custodia injetada pelo smoke'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$test$;

CREATE TRIGGER tg_zzz_pdv_w1a_test_fail_custody_insert
  BEFORE INSERT ON public.pdv_cash_custody_entries
  FOR EACH ROW EXECUTE FUNCTION public.pdv_w1a_test_fail_custody_insert();

DO $behavior$
DECLARE
  v_company_a uuid := 'a2000000-0000-4000-8000-000000000001';
  v_company_b uuid := 'a2000000-0000-4000-8000-000000000002';
  v_company_c uuid := 'a2000000-0000-4000-8000-000000000005';
  v_user_a uuid := 'a2000000-0000-4000-8000-000000000003';
  v_user_b uuid := 'a2000000-0000-4000-8000-000000000004';
  v_account_a uuid := 'a2000000-0000-4000-8000-000000000011';
  v_account_b uuid := 'a2000000-0000-4000-8000-000000000012';
  v_account_c uuid := 'a2000000-0000-4000-8000-000000000013';
  v_account_virgin uuid := 'a2000000-0000-4000-8000-000000000014';
  v_account_v1 uuid := 'a2000000-0000-4000-8000-000000000015';
  v_terminal_a uuid := 'a2000000-0000-4000-8000-000000000021';
  v_terminal_b uuid := 'a2000000-0000-4000-8000-000000000022';
  v_terminal_c uuid := 'a2000000-0000-4000-8000-000000000023';
  v_terminal_d uuid := 'a2000000-0000-4000-8000-000000000024';
  v_terminal_cascade uuid := 'a2000000-0000-4000-8000-000000000025';
  v_terminal_restricted uuid := 'a2000000-0000-4000-8000-000000000026';
  v_stock_restricted uuid := 'a2000000-0000-4000-8000-000000000027';
  v_session uuid;
  v_session_b uuid;
  v_session_purge uuid := 'a2000000-0000-4000-8000-000000000032';
  v_session_cascade uuid := 'a2000000-0000-4000-8000-000000000033';
  v_legacy_session uuid := 'a2000000-0000-4000-8000-000000000031';
  v_receipt uuid;
  v_extra_entry uuid;
  v_extra_transaction uuid;
  v_boundary_transaction uuid;
  v_financial_linked uuid;
  v_financial_unlinked uuid;
  v_financial_v1 uuid;
  v_custody_entry uuid;
  v_order_c uuid := 'a2000000-0000-4000-8000-000000000051';
  v_result jsonb;
  v_snapshot jsonb;
  v_first_result jsonb;
  v_blocked boolean;
  v_count integer;
  v_detail text;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000', v_user_a,
      'authenticated', 'authenticated', 'caixa-v2-a@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Operador Caixa A"}'::jsonb, now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_user_b,
      'authenticated', 'authenticated', 'caixa-v2-b@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Operador Caixa B"}'::jsonb, now(), now(), '', '', '', ''
    );

  INSERT INTO public.companies (
    id, name, subscription_status, subscription_expires_at
  ) VALUES
    (v_company_a, 'Empresa teste Caixa v2 A', 'active', NULL),
    (v_company_b, 'Empresa teste Caixa v2 B', 'active', NULL);

  UPDATE public.profiles
     SET company_id = v_company_a, is_active = true
   WHERE user_id IN (v_user_a, v_user_b);

  INSERT INTO public.user_roles (user_id, role)
  VALUES
    (v_user_a, 'comercial'::public.app_role),
    (v_user_b, 'comercial'::public.app_role);

  INSERT INTO public.user_permissions (user_id, permissions, is_active)
  VALUES
    (v_user_a, '["screen:pdv"]'::jsonb, true),
    (v_user_b, '["screen:pdv"]'::jsonb, true);

  INSERT INTO public.company_modules (company_id, module_code)
  VALUES (v_company_a, 'pdv');

  INSERT INTO public.financial_accounts (
    id, company_id, name, type, initial_balance, is_active
  ) VALUES
    (v_account_a, v_company_a, 'Cofre v2 A', 'caixa', 1000, true),
    (v_account_b, v_company_b, 'Cofre v2 B', 'caixa', 500, true),
    (v_account_virgin, v_company_a, 'Conta virgem v2', 'caixa', 50, true),
    (v_account_v1, v_company_a, 'Conta lifecycle v1', 'caixa', 20, true);

  -- Conta ainda virgem aceita ajuste do saldo inicial sob o guard e edicao
  -- puramente cadastral continua livre.
  UPDATE public.financial_accounts
     SET initial_balance = 60,
         name = 'Conta virgem v2 ajustada'
   WHERE id = v_account_virgin;
  IF NOT EXISTS (
    SELECT 1 FROM public.financial_accounts account
     WHERE account.id = v_account_virgin
       AND account.initial_balance = 60
       AND account.name = 'Conta virgem v2 ajustada'
  ) THEN
    RAISE EXCEPTION 'guard da conta bloqueou ajuste legitimo de conta virgem';
  END IF;

  INSERT INTO public.financial_transactions (
    company_id, transaction_type, description, amount, transaction_date,
    paid_date, is_paid, account_id, origin, created_by
  ) VALUES (
    v_company_a, 'entrada', 'Financeiro lifecycle de conta v1', 5,
    public.company_today(v_company_a), public.company_today(v_company_a),
    true, v_account_v1, 'geral', v_user_a
  ) RETURNING id INTO v_financial_v1;
  DELETE FROM public.financial_accounts WHERE id = v_account_v1;
  IF NOT EXISTS (
    SELECT 1 FROM public.financial_transactions transaction
     WHERE transaction.id = v_financial_v1
       AND transaction.account_id IS NULL
  ) THEN
    RAISE EXCEPTION 'exclusao de conta v1 nao preservou financeiro com account_id nulo';
  END IF;

  INSERT INTO public.company_settings (
    company_id, name, pdv_cash_account_id, pdv_strict_cash_tracking, pdv_mode
  ) VALUES (
    v_company_a, 'Config Caixa v2', v_account_a, true, 'simples'
  )
  ON CONFLICT (company_id) DO UPDATE SET
    pdv_cash_account_id = EXCLUDED.pdv_cash_account_id,
    pdv_strict_cash_tracking = EXCLUDED.pdv_strict_cash_tracking,
    pdv_mode = EXCLUDED.pdv_mode;

  INSERT INTO public.pdv_terminals (id, company_id, name, is_active)
  VALUES
    (v_terminal_a, v_company_a, 'Terminal Caixa A', true),
    (v_terminal_b, v_company_a, 'Terminal Caixa B', true),
    (v_terminal_c, v_company_a, 'Terminal Caixa C', true),
    (v_terminal_d, v_company_a, 'Terminal Caixa D', true);

  INSERT INTO public.stocks(id,company_id,name,is_default)
  VALUES(v_stock_restricted,v_company_a,'Estoque restrito do caixa',false);
  INSERT INTO public.pdv_terminals(id,company_id,name,is_active,stock_id)
  VALUES(v_terminal_restricted,v_company_a,'Terminal restrito',true,v_stock_restricted);
  INSERT INTO public.stock_access(company_id,stock_id,user_id)
  VALUES(v_company_a,v_stock_restricted,v_user_a);

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',v_user_b,'role','authenticated')::text,true);
  v_blocked:=false;
  BEGIN
    PERFORM public.pdv_open_cash_session_v2(
      v_terminal_restricted,v_account_a,10,'open-v2-restricted-0001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL;
    v_blocked:=v_detail='PDV_TERMINAL_STOCK_FORBIDDEN';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'operador same-tenant abriu terminal de local restrito';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );

  v_first_result := public.pdv_open_cash_session_v2(
    v_terminal_a, v_account_a, 100, 'open-v2-request-0001'
  );
  v_session := (v_first_result->>'session_id')::uuid;
  IF COALESCE((v_first_result->>'ok')::boolean, false) IS NOT TRUE
     OR v_session IS NULL
  THEN
    RAISE EXCEPTION 'abertura v2 nao criou sessao: %', v_first_result;
  END IF;

  v_blocked := false;
  BEGIN
    DELETE FROM public.financial_accounts WHERE id = v_account_a;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    v_blocked := v_detail = 'PDV_TREASURY_ACCOUNT_HAS_CUSTODY';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'conta com sessao v2 foi excluida fora do expurgo';
  END IF;

  v_result := public.pdv_open_cash_session_v2(
    v_terminal_a, v_account_a, 100, 'open-v2-request-0001'
  );
  IF v_result IS DISTINCT FROM v_first_result THEN
    RAISE EXCEPTION 'replay da abertura nao recuperou o mesmo resultado';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.pdv_open_cash_session_v2(
      v_terminal_a, v_account_a, 101, 'open-v2-request-0001'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'chave de abertura aceitou payload divergente';
  END IF;

  -- Segundo operador disputa o mesmo saldo: 1000 - 100 sob custodia = 900.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_b, 'role', 'authenticated')::text,
    true
  );
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_open_cash_session_v2(
      v_terminal_b, v_account_a, 950, 'open-v2-request-0002'
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'duas aberturas reservaram mais dinheiro que o disponivel';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.pdv_open_cash_session_v2(
      v_terminal_b, v_account_b, 10, 'open-v2-request-0003'
    );
  EXCEPTION WHEN no_data_found THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'abertura aceitou conta de outro tenant';
  END IF;

  -- Duas sessoes reservam 200. Entrada externa e permitida; saida externa
  -- pode chegar exatamente ao limite, mas nao ultrapassar a reserva.
  v_result := public.pdv_open_cash_session_v2(
    v_terminal_d, v_account_a, 100, 'open-v2-request-0004'
  );
  v_session_b := (v_result->>'session_id')::uuid;

  INSERT INTO public.financial_transactions (
    company_id, transaction_type, description, amount, transaction_date,
    paid_date, is_paid, account_id, origin, created_by
  ) VALUES (
    v_company_a, 'entrada', 'Entrada externa permitida', 10,
    public.company_today(v_company_a), public.company_today(v_company_a),
    true, v_account_a, 'geral', v_user_b
  ) RETURNING id INTO v_boundary_transaction;
  DELETE FROM public.financial_transactions WHERE id = v_boundary_transaction;

  INSERT INTO public.financial_transactions (
    company_id, transaction_type, description, amount, transaction_date,
    paid_date, is_paid, account_id, origin, created_by
  ) VALUES (
    v_company_a, 'saida', 'Saída externa no limite da reserva', 800,
    public.company_today(v_company_a), public.company_today(v_company_a),
    true, v_account_a, 'geral', v_user_b
  ) RETURNING id INTO v_boundary_transaction;

  v_blocked := false;
  BEGIN
    INSERT INTO public.financial_transactions (
      company_id, transaction_type, description, amount, transaction_date,
      paid_date, is_paid, account_id, origin, created_by
    ) VALUES (
      v_company_a, 'saida', 'Saída externa acima da reserva', 0.01,
      public.company_today(v_company_a), public.company_today(v_company_a),
      true, v_account_a, 'geral', v_user_b
    );
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    v_blocked := v_detail = 'PDV_TREASURY_CUSTODY_RESERVED';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'saida externa consumiu dinheiro reservado em dois caixas';
  END IF;

  v_blocked := false;
  BEGIN
    UPDATE public.financial_accounts
       SET initial_balance = 5000
     WHERE id = v_account_a;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    v_blocked := v_detail = 'PDV_TREASURY_INITIAL_BALANCE_IMMUTABLE';
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'saldo inicial alterou conta ja usada e contornou a reserva';
  END IF;

  UPDATE public.financial_accounts
     SET name = 'Cofre v2 A renomeado'
   WHERE id = v_account_a;

  DELETE FROM public.financial_transactions WHERE id = v_boundary_transaction;

  v_result := public.pdv_close_cash_session_v2(
    v_session_b, v_account_a, 100, 'Fecha segundo caixa do limite',
    'close-v2-request-0002'
  );
  IF (v_result->>'difference')::numeric <> 0 THEN
    RAISE EXCEPTION 'segundo caixa nao fechou no limite: %', v_result;
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );

  v_result := public.pdv_record_cash_event_v2(
    v_session, v_account_a, 'cash_receipt', 100,
    'Recebimento em dinheiro de teste', 'Venda de teste',
    'event-v2-request-0001'
  );
  v_receipt := (v_result->>'financial_transaction_id')::uuid;
  IF (v_result->>'custody_after')::numeric <> 200 THEN
    RAISE EXCEPTION 'recebimento nao atualizou custodia para 200: %', v_result;
  END IF;
  IF v_receipt IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.financial_transactions transaction
     WHERE transaction.id = v_receipt
       AND transaction.amount = 100
  ) OR NOT EXISTS (
    SELECT 1 FROM public.pdv_cash_custody_entries entry
     WHERE entry.financial_transaction_id = v_receipt
       AND entry.amount = 100
  ) THEN
    RAISE EXCEPTION 'evento nao criou financeiro+custodia atomicamente';
  END IF;

  -- Fato vinculado nao pode ser editado, cancelado nem excluido.
  v_blocked := false;
  BEGIN
    UPDATE public.financial_transactions SET amount = 101 WHERE id = v_receipt;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'financeiro vinculado aceitou alteracao de valor';
  END IF;

  v_blocked := false;
  BEGIN
    UPDATE public.financial_transactions SET cancelled_at = now() WHERE id = v_receipt;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'financeiro vinculado aceitou cancelamento generico';
  END IF;

  v_blocked := false;
  BEGIN
    DELETE FROM public.financial_transactions WHERE id = v_receipt;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'financeiro vinculado aceitou DELETE';
  END IF;

  -- Falha de custodia nao pode deixar lancamento financeiro orfao.
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_record_cash_event_v2(
      v_session, v_account_a, 'cash_payment', 1,
      'Pagamento que deve falhar', 'FORCE_ATOMIC_FAILURE',
      'event-v2-request-fail-0001'
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked OR EXISTS (
    SELECT 1 FROM public.financial_transactions transaction
     WHERE transaction.company_id = v_company_a
       AND transaction.description = 'Pagamento que deve falhar'
  ) THEN
    RAISE EXCEPTION 'falha do evento deixou financeiro orfao';
  END IF;

  -- Uma reversao valida cria outro financeiro e outra custodia, sem editar o
  -- evento original.
  v_result := public.pdv_record_cash_event_v2(
    v_session, v_account_a, 'cash_receipt', 10,
    'Recebimento adicional reversivel', NULL, 'event-v2-request-0002'
  );
  v_extra_entry := (v_result->>'entry_id')::uuid;
  v_extra_transaction := (v_result->>'financial_transaction_id')::uuid;
  v_result := public.pdv_reverse_cash_event_v2(
    v_extra_entry, v_account_a, 'Lançamento duplicado no teste',
    'reverse-v2-request-0001'
  );
  IF (v_result->>'amount')::numeric <> -10
     OR (v_result->>'financial_transaction_id')::uuid = v_extra_transaction
     OR NOT EXISTS (
       SELECT 1 FROM public.pdv_cash_custody_entries entry
        WHERE entry.reversal_of_id = v_extra_entry
          AND entry.amount = -10
     )
  THEN
    RAISE EXCEPTION 'reversao compensatoria nao criou os dois fatos: %', v_result;
  END IF;

  v_result := public.pdv_close_cash_session_v2(
    v_session, v_account_a, 198, 'Fechamento de teste', 'close-v2-request-0001'
  );
  IF (v_result->>'expected_amount')::numeric <> 200
     OR (v_result->>'counted_amount')::numeric <> 198
     OR (v_result->>'difference')::numeric <> -2
     OR v_result->>'adjustment_kind' <> 'shortage'
  THEN
    RAISE EXCEPTION 'fechamento 198/2 nao conciliou: %', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pdv_cash_custody_entries entry
     WHERE entry.session_id = v_session
       AND entry.entry_kind = 'closing_return'
       AND entry.amount = -198
       AND entry.financial_transaction_id IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.pdv_cash_custody_entries entry
     WHERE entry.session_id = v_session
       AND entry.entry_kind = 'shortage'
       AND entry.amount = -2
       AND entry.financial_transaction_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'retorno neutro e falta financeira nao foram separados';
  END IF;

  v_snapshot := public.pdv_cash_snapshot_v2_internal(v_company_a, v_account_a);
  IF (v_snapshot->>'balance')::numeric <> 1098
     OR (v_snapshot->>'custody')::numeric <> 0
     OR (v_snapshot->>'available')::numeric <> 1098
  THEN
    RAISE EXCEPTION 'snapshot final deveria ser 1098/0/1098: %', v_snapshot;
  END IF;

  v_result := public.pdv_close_cash_session_v2(
    v_session, v_account_a, 198, 'Fechamento de teste', 'close-v2-request-0001'
  );
  IF (v_result->>'difference')::numeric <> -2 THEN
    RAISE EXCEPTION 'replay do fechamento mudou o resultado';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.pdv_close_cash_session_v2(
      v_session, v_account_a, 199, 'Fechamento de teste', 'close-v2-request-0001'
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'chave de fechamento aceitou payload divergente';
  END IF;

  -- Recebimento concorrente que chega depois do fechamento falha de forma
  -- deterministica e nao cria custodia.
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_record_cash_event_v2(
      v_session, v_account_a, 'supply', 10, NULL,
      'Depois do fechamento', 'event-v2-request-after-close-0001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'evento entrou depois do fechamento';
  END IF;

  -- Coexistencia nao conciliada: registra issue e nao abre outra sessao v2.
  INSERT INTO public.pdv_cash_sessions (
    id, company_id, terminal_id, opened_by, opening_amount, status
  ) VALUES (
    v_legacy_session, v_company_a, v_terminal_b, v_user_b, 50, 'aberta'
  );

  v_result := public.pdv_open_cash_session_v2(
    v_terminal_c, v_account_a, 10, 'open-v2-request-legacy-0001'
  );
  IF COALESCE((v_result->>'ok')::boolean, true)
     OR COALESCE((v_result->>'requires_reconciliation')::boolean, false) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'coexistencia legada nao falhou fechada: %', v_result;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.pdv_reconciliation_issues issue
   WHERE issue.company_id = v_company_a
     AND issue.issue_code = 'open_legacy_or_inconsistent_session'
     AND issue.status = 'open';
  IF v_count <> 1 OR EXISTS (
    SELECT 1 FROM public.pdv_cash_sessions session
     WHERE session.terminal_id = v_terminal_c
       AND session.status = 'aberta'
  ) THEN
    RAISE EXCEPTION 'falha fechada nao preservou issue/unicidade da abertura';
  END IF;

  -- O livro segue append-only em uso normal, mas acompanha a sessao durante
  -- o expurgo nominal do Zerar Sistema.
  INSERT INTO public.companies (
    id, name, subscription_status, subscription_expires_at
  ) VALUES (v_company_c, 'Empresa cascade Caixa v2', 'active', NULL);
  INSERT INTO public.financial_accounts (
    id, company_id, name, type, initial_balance, is_active
  ) VALUES (v_account_c, v_company_c, 'Cofre cascade v2', 'caixa', 100, true);
  INSERT INTO public.pdv_terminals (id, company_id, name, is_active)
  VALUES (v_terminal_cascade, v_company_c, 'Terminal cascade v2', true);
  INSERT INTO public.pdv_operation_requests (
    id, company_id, operation_type, idempotency_key, payload_hash
  ) VALUES (
    'a2000000-0000-4000-8000-000000000041', v_company_c,
    'cash.test.purge', 'purge-v2-request-0001', repeat('a', 64)
  );
  INSERT INTO public.pdv_cash_sessions (
    id, company_id, terminal_id, opening_amount, status, cash_account_id,
    cash_account_name_snapshot, cash_policy_snapshot, contract_version
  ) VALUES (
    v_session_purge, v_company_c, v_terminal_cascade, 10, 'aberta', v_account_c,
    'Cofre cascade v2', '{"strict_tracking":true}'::jsonb, 2
  );
  INSERT INTO public.pdv_cash_custody_entries (
    company_id, session_id, cash_account_id, operation_request_id,
    entry_kind, amount, source_type, source_id
  ) VALUES (
    v_company_c, v_session_purge, v_account_c,
    'a2000000-0000-4000-8000-000000000041', 'opening', 10,
    'pdv_cash_session', v_session_purge
  ) RETURNING id INTO v_custody_entry;

  v_blocked := false;
  BEGIN
    DELETE FROM public.pdv_cash_custody_entries WHERE id = v_custody_entry;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'custodia append-only aceitou DELETE fora do expurgo';
  END IF;

  PERFORM set_config('app.pdv_purge_company', v_company_c::text, true);
  DELETE FROM public.pdv_cash_sessions WHERE id = v_session_purge;
  PERFORM set_config('app.pdv_purge_company', '', true);
  IF EXISTS (
    SELECT 1 FROM public.pdv_cash_custody_entries WHERE id = v_custody_entry
  ) THEN
    RAISE EXCEPTION 'expurgo da sessao nao removeu sua custodia em cascade';
  END IF;

  -- Cascade integral do tenant deve aceitar financeiro ligado e nao ligado.
  INSERT INTO public.financial_transactions (
    company_id, transaction_type, description, amount, transaction_date,
    paid_date, is_paid, account_id, origin, created_by
  ) VALUES (
    v_company_c, 'entrada', 'Financeiro ligado ao cascade', 10,
    public.company_today(v_company_c), public.company_today(v_company_c),
    true, v_account_c, 'pdv', v_user_a
  ) RETURNING id INTO v_financial_linked;
  INSERT INTO public.financial_transactions (
    company_id, transaction_type, description, amount, transaction_date,
    paid_date, is_paid, account_id, origin, created_by
  ) VALUES (
    v_company_c, 'entrada', 'Financeiro livre no cascade', 5,
    public.company_today(v_company_c), public.company_today(v_company_c),
    true, v_account_c, 'geral', v_user_a
  ) RETURNING id INTO v_financial_unlinked;
  INSERT INTO public.pdv_operation_requests (
    id, company_id, operation_type, idempotency_key, payload_hash
  ) VALUES (
    'a2000000-0000-4000-8000-000000000042', v_company_c,
    'cash.test.cascade', 'cascade-v2-request-0001', repeat('b', 64)
  );
  INSERT INTO public.pdv_cash_sessions (
    id, company_id, terminal_id, opening_amount, status, cash_account_id,
    cash_account_name_snapshot, cash_policy_snapshot, contract_version
  ) VALUES (
    v_session_cascade, v_company_c, v_terminal_cascade, 0, 'aberta', v_account_c,
    'Cofre cascade v2', '{"strict_tracking":true}'::jsonb, 2
  );
  INSERT INTO public.pdv_cash_custody_entries (
    company_id, session_id, cash_account_id, operation_request_id,
    entry_kind, amount, source_type, source_id, financial_transaction_id
  ) VALUES (
    v_company_c, v_session_cascade, v_account_c,
    'a2000000-0000-4000-8000-000000000042', 'cash_receipt', 10,
    'financial_transaction', v_financial_linked, v_financial_linked
  );

  INSERT INTO public.pdv_orders (
    id, company_id, number, terminal_id, status, subtotal, total,
    cash_session_id, client_request_id
  ) VALUES (
    v_order_c, v_company_c, 1, v_terminal_cascade, 'pago', 10, 10,
    v_session_cascade, 'admin-delete-order-0001'
  );
  INSERT INTO public.pdv_order_payments (
    company_id, order_id, method, amount, financial_account_id,
    financial_transaction_id, created_by
  ) VALUES (
    v_company_c, v_order_c, 'dinheiro', 10, v_account_c,
    v_financial_linked, v_user_a
  );

  UPDATE public.user_roles
     SET role = 'super_admin'::public.app_role
   WHERE user_id = v_user_a;
  PERFORM public.admin_delete_company(v_company_c);
  IF EXISTS (SELECT 1 FROM public.companies WHERE id = v_company_c)
     OR EXISTS (
       SELECT 1 FROM public.financial_transactions
        WHERE id IN (v_financial_linked, v_financial_unlinked)
     )
     OR EXISTS (
       SELECT 1 FROM public.pdv_cash_sessions WHERE id = v_session_cascade
     )
     OR EXISTS (
       SELECT 1 FROM public.pdv_cash_custody_entries
        WHERE company_id = v_company_c
     )
     OR EXISTS (SELECT 1 FROM public.pdv_orders WHERE id = v_order_c)
     OR EXISTS (
       SELECT 1 FROM public.pdv_order_payments WHERE order_id = v_order_c
     )
     OR NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company_a)
     OR COALESCE(current_setting('app.pdv_purge_company', true), '') <> ''
  THEN
    RAISE EXCEPTION 'admin delete falhou ou atingiu tenant vizinho';
  END IF;
END
$behavior$;

ROLLBACK;

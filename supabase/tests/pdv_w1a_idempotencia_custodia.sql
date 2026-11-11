-- Contrato e smoke transacional da fundacao W1A-01.
-- Executar apos `supabase db reset`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/pdv_w1a_idempotencia_custodia.sql

BEGIN;

DO $contract$
DECLARE
  v_table text;
  v_function text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'pdv_operation_requests',
    'pdv_reconciliation_issues',
    'pdv_cash_custody_entries'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      RAISE EXCEPTION 'tabela public.% ausente', v_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_class c
       WHERE c.oid = to_regclass('public.' || v_table)
         AND c.relrowsecurity
         AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS forcada ausente em %', v_table;
    END IF;

    IF has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'DELETE')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'TRUNCATE')
    THEN
      RAISE EXCEPTION 'grant direto indevido na tabela %', v_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pdv_cash_sessions'
       AND column_name = 'cash_account_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pdv_cash_sessions'
       AND column_name = 'cash_account_name_snapshot'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pdv_cash_sessions'
       AND column_name = 'cash_policy_snapshot'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pdv_cash_sessions'
       AND column_name = 'contract_version'
  ) THEN
    RAISE EXCEPTION 'campos compativeis v2 ausentes em pdv_cash_sessions';
  END IF;

  FOREACH v_function IN ARRAY ARRAY[
    'public.pdv_operation_payload_hash(jsonb)',
    'public.pdv_claim_operation_request(uuid,text,text,jsonb)',
    'public.pdv_complete_operation_request(uuid,text,uuid,jsonb)',
    'public.pdv_fail_operation_request(uuid,text,jsonb)',
    'public.pdv_lock_treasury_accounts(uuid,uuid[])',
    'public.pdv_lock_treasury_account(uuid,uuid)',
    'public.pdv_cash_custody_position(uuid,uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_function, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'ACL incorreta em %', v_function;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger trigger
     WHERE trigger.tgrelid = 'public.pdv_cash_custody_entries'::regclass
       AND trigger.tgname = 'tg_pdv_cash_custody_append_only'
       AND NOT trigger.tgisinternal
  ) THEN
    RAISE EXCEPTION 'trigger append-only da custodia ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pdv_operation_requests'::regclass
       AND conname = 'pdv_operation_requests_company_operation_key_unique'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pdv_cash_custody_entries'::regclass
       AND conname = 'pdv_cash_custody_entries_request_kind_unique'
  ) THEN
    RAISE EXCEPTION 'constraints de idempotencia ausentes';
  END IF;

  IF COALESCE((
    SELECT pg_get_constraintdef(oid)
      FROM pg_constraint
     WHERE conrelid = 'public.pdv_cash_sessions'::regclass
       AND conname = 'pdv_cash_sessions_v2_snapshot_check'
  ), '') NOT LIKE '%cash_account_id IS NOT NULL%'
  THEN
    RAISE EXCEPTION 'sessao v2 nao exige cash_account_id congelada';
  END IF;
END
$contract$;

DO $behavior$
DECLARE
  v_company_a uuid := 'a1000000-0000-4000-8000-000000000001';
  v_company_b uuid := 'a1000000-0000-4000-8000-000000000002';
  v_account_a uuid := 'a1000000-0000-4000-8000-000000000011';
  v_account_a2 uuid := 'a1000000-0000-4000-8000-000000000012';
  v_account_b uuid := 'a1000000-0000-4000-8000-000000000013';
  v_terminal_v2 uuid := 'a1000000-0000-4000-8000-000000000021';
  v_terminal_legacy uuid := 'a1000000-0000-4000-8000-000000000022';
  v_session_v2 uuid := 'a1000000-0000-4000-8000-000000000031';
  v_session_legacy uuid := 'a1000000-0000-4000-8000-000000000032';
  v_claim record;
  v_completed public.pdv_operation_requests%ROWTYPE;
  v_open_request uuid;
  v_receipt_request uuid;
  v_close_request uuid;
  v_open_entry uuid;
  v_receipt_entry uuid;
  v_position record;
  v_blocked boolean;
BEGIN
  INSERT INTO public.companies (id, name, subscription_status, subscription_expires_at)
  VALUES
    (v_company_a, 'Empresa teste W1A A', 'active', NULL),
    (v_company_b, 'Empresa teste W1A B', 'active', NULL);

  INSERT INTO public.financial_accounts (id, company_id, name, type)
  VALUES
    (v_account_a, v_company_a, 'Cofre A', 'caixa'),
    (v_account_a2, v_company_a, 'Banco A', 'banco'),
    (v_account_b, v_company_b, 'Cofre B', 'caixa');

  INSERT INTO public.pdv_terminals (id, company_id, name)
  VALUES
    (v_terminal_v2, v_company_a, 'Terminal v2'),
    (v_terminal_legacy, v_company_a, 'Terminal legado');

  -- Sessao legada continua valida com campos v2 nulos: a migration nao ativa
  -- nem reinterpreta o writer atual.
  INSERT INTO public.pdv_cash_sessions (
    id, company_id, terminal_id, opening_amount, status
  ) VALUES (
    v_session_legacy, v_company_a, v_terminal_legacy, 0, 'aberta'
  );

  IF EXISTS (
    SELECT 1 FROM public.pdv_cash_sessions s
     WHERE s.id = v_session_legacy
       AND (
         s.contract_version IS NOT NULL
         OR s.cash_account_id IS NOT NULL
         OR s.cash_policy_snapshot IS NOT NULL
       )
  ) THEN
    RAISE EXCEPTION 'sessao legada recebeu fato v2 inventado';
  END IF;

  INSERT INTO public.pdv_cash_sessions (
    id, company_id, terminal_id, opening_amount, status,
    cash_account_id, cash_account_name_snapshot, cash_policy_snapshot,
    contract_version
  ) VALUES (
    v_session_v2, v_company_a, v_terminal_v2, 100, 'aberta',
    v_account_a, 'Cofre A', '{"strict_tracking":true}'::jsonb, 2
  );

  v_blocked := false;
  BEGIN
    UPDATE public.pdv_cash_sessions
       SET cash_account_id = v_account_b
     WHERE id = v_session_v2;
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'sessao aceitou conta de outra empresa';
  END IF;

  v_blocked := false;
  BEGIN
    UPDATE public.pdv_cash_sessions
       SET cash_account_id = NULL
     WHERE id = v_session_v2;
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'sessao contract_version=2 aceitou conta nula';
  END IF;

  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request(
      v_company_a, 'cash.open', 'request-open-0001',
      '{"terminal":"a1000000-0000-4000-8000-000000000021","amount":100}'::jsonb
    );
  v_open_request := v_claim.request_id;
  IF v_claim.is_replay OR v_claim.request_status <> 'pending' THEN
    RAISE EXCEPTION 'primeiro claim nao criou request pendente';
  END IF;

  SELECT * INTO v_completed
    FROM public.pdv_complete_operation_request(
      v_open_request, 'pdv_cash_session', v_session_v2,
      jsonb_build_object('session_id', v_session_v2)
    );
  IF v_completed.status <> 'completed' OR v_completed.completed_at IS NULL THEN
    RAISE EXCEPTION 'conclusao do request nao persistiu resultado';
  END IF;

  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request(
      v_company_a, 'cash.open', 'request-open-0001',
      '{"amount":100,"terminal":"a1000000-0000-4000-8000-000000000021"}'::jsonb
    );
  IF NOT v_claim.is_replay
     OR v_claim.request_status <> 'completed'
     OR v_claim.stored_result->>'session_id' <> v_session_v2::text
  THEN
    RAISE EXCEPTION 'retry equivalente nao recuperou resultado persistido';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.pdv_claim_operation_request(
      v_company_a, 'cash.open', 'request-open-0001',
      '{"terminal":"a1000000-0000-4000-8000-000000000021","amount":101}'::jsonb
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'mesma chave aceitou payload divergente';
  END IF;

  -- A mesma chave em outro tenant e um espaco idempotente independente.
  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request(
      v_company_b, 'cash.open', 'request-open-0001', '{"amount":100}'::jsonb
    );
  IF v_claim.is_replay OR v_claim.request_status <> 'pending' THEN
    RAISE EXCEPTION 'chave de outro tenant colidiu';
  END IF;

  -- Lock compartilhado valida o tenant e ordena contas internamente.
  PERFORM public.pdv_lock_treasury_accounts(
    v_company_a, ARRAY[v_account_a2, v_account_a, v_account_a]
  );
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_lock_treasury_account(v_company_a, v_account_b);
  EXCEPTION WHEN no_data_found THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'lock de tesouraria aceitou conta de outro tenant';
  END IF;

  SELECT request_id INTO v_receipt_request
    FROM public.pdv_claim_operation_request(
      v_company_a, 'cash.receipt', 'request-receipt-0001', '{"amount":100}'::jsonb
    );
  SELECT request_id INTO v_close_request
    FROM public.pdv_claim_operation_request(
      v_company_a, 'cash.close', 'request-close-0001', '{"counted":198}'::jsonb
    );

  INSERT INTO public.pdv_cash_custody_entries (
    company_id, session_id, cash_account_id, operation_request_id,
    entry_kind, amount, source_type, source_id
  ) VALUES (
    v_company_a, v_session_v2, v_account_a, v_open_request,
    'opening', 100, 'pdv_cash_session', v_session_v2
  ) RETURNING id INTO v_open_entry;

  INSERT INTO public.pdv_cash_custody_entries (
    company_id, session_id, cash_account_id, operation_request_id,
    entry_kind, amount, source_type, source_id
  ) VALUES (
    v_company_a, v_session_v2, v_account_a, v_receipt_request,
    'cash_receipt', 100, 'pdv_order_payment', gen_random_uuid()
  ) RETURNING id INTO v_receipt_entry;

  INSERT INTO public.pdv_cash_custody_entries (
    company_id, session_id, cash_account_id, operation_request_id,
    entry_kind, amount, source_type, source_id
  ) VALUES
    (
      v_company_a, v_session_v2, v_account_a, v_close_request,
      'closing_return', -198, 'pdv_cash_session', v_session_v2
    ),
    (
      v_company_a, v_session_v2, v_account_a, v_close_request,
      'shortage', -2, 'pdv_cash_session', v_session_v2
    );

  SELECT * INTO v_position
    FROM public.pdv_cash_custody_position(v_company_a, v_session_v2);
  IF v_position.custody_amount <> 0 OR v_position.entry_count <> 4 THEN
    RAISE EXCEPTION 'posicao da custodia deveria fechar em zero: %', row_to_json(v_position);
  END IF;

  v_blocked := false;
  BEGIN
    INSERT INTO public.pdv_cash_custody_entries (
      company_id, session_id, cash_account_id, operation_request_id,
      entry_kind, amount
    ) VALUES (
      v_company_a, v_session_v2, v_account_a, v_receipt_request,
      'cash_receipt', 100
    );
  EXCEPTION WHEN unique_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'retry duplicou kind da mesma operacao na custodia';
  END IF;

  v_blocked := false;
  BEGIN
    UPDATE public.pdv_cash_custody_entries
       SET amount = 999
     WHERE id = v_open_entry;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'livro de custodia permitiu UPDATE';
  END IF;

  v_blocked := false;
  BEGIN
    DELETE FROM public.pdv_cash_custody_entries WHERE id = v_open_entry;
  EXCEPTION WHEN SQLSTATE '55000' THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'livro de custodia permitiu DELETE';
  END IF;

  v_blocked := false;
  BEGIN
    INSERT INTO public.pdv_cash_custody_entries (
      company_id, session_id, cash_account_id, entry_kind, amount,
      reversal_of_id
    ) VALUES (
      v_company_a, v_session_v2, v_account_a, 'reversal', -99,
      v_receipt_entry
    );
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'reversao parcial alterou a custodia';
  END IF;

  v_blocked := false;
  BEGIN
    INSERT INTO public.pdv_cash_custody_entries (
      company_id, session_id, cash_account_id, entry_kind, amount
    ) VALUES (
      v_company_a, v_session_legacy, v_account_a, 'opening', 0
    );
  EXCEPTION WHEN not_null_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'sessao legada sem conta congelada recebeu custodia v2';
  END IF;
END
$behavior$;

ROLLBACK;

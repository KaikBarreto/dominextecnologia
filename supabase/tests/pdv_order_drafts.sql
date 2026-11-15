-- Contrato e smoke transacional dos rascunhos server-side do PDV.
-- Executar apos `supabase db reset`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pdv_order_drafts.sql
BEGIN;

DO $contract$
DECLARE
  v_policy text;
  v_function text;
BEGIN
  IF to_regclass('public.pdv_order_drafts') IS NULL THEN
    RAISE EXCEPTION 'tabela public.pdv_order_drafts ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_class c
     WHERE c.oid = 'public.pdv_order_drafts'::regclass
       AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS ausente em pdv_order_drafts';
  END IF;

  SELECT qual INTO v_policy
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'pdv_order_drafts'
     AND policyname = 'Users read own active entitled pdv drafts';

  IF v_policy IS NULL
     OR v_policy NOT LIKE '%company_id%get_user_company_id%'
     OR v_policy NOT LIKE '%created_by%uid%'
     OR v_policy NOT LIKE '%tenant_subscription_allows_access%'
     OR v_policy NOT LIKE '%company_has_module%'
  THEN
    RAISE EXCEPTION 'policy nao contem isolamento tenant+autor+assinatura+modulo';
  END IF;

  IF has_table_privilege('anon', 'public.pdv_order_drafts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.pdv_order_drafts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pdv_order_drafts', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pdv_order_drafts', 'DELETE')
     OR has_table_privilege('authenticated', 'public.pdv_order_drafts', 'TRUNCATE')
     OR has_table_privilege('service_role', 'public.pdv_order_drafts', 'SELECT')
     OR has_table_privilege('service_role', 'public.pdv_order_drafts', 'INSERT')
  THEN
    RAISE EXCEPTION 'grant direto indevido na tabela de drafts';
  END IF;

  FOREACH v_function IN ARRAY ARRAY[
    'public.pdv_list_order_drafts_v2(text,uuid,uuid,uuid,boolean)',
    'public.pdv_save_order_draft_v2(uuid,text,jsonb,bigint,uuid,uuid,uuid,uuid)',
    'public.pdv_delete_order_draft_v2(uuid,bigint,uuid,text,uuid,uuid,uuid)',
    'public.pdv_restore_order_draft(uuid,bigint,uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_function, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'ACL incorreta em %', v_function;
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

  -- As assinaturas sem contexto foram fechadas; nao reabrir para executar o smoke.
  FOREACH v_function IN ARRAY ARRAY[
    'public.pdv_list_order_drafts(text,boolean)',
    'public.pdv_save_order_draft(uuid,text,jsonb,bigint,uuid)',
    'public.pdv_delete_order_draft(uuid,bigint,uuid)'
  ] LOOP
    IF has_function_privilege('anon',v_function,'EXECUTE')
       OR has_function_privilege('authenticated',v_function,'EXECUTE') THEN
      RAISE EXCEPTION 'endpoint legado de draft sem contexto exposto: %',v_function;
    END IF;
  END LOOP;

  IF has_function_privilege(
       'authenticated', 'public.pdv_assert_draft_access()', 'EXECUTE'
     ) OR has_function_privilege(
       'authenticated', 'public.pdv_validate_draft_payload(uuid,text,jsonb)', 'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'helper interno exposto a authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pdv_order_drafts'::regclass
       AND conname = 'pdv_order_drafts_type_check'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pdv_order_drafts'::regclass
       AND conname = 'pdv_order_drafts_payload_size_check'
  ) THEN
    RAISE EXCEPTION 'checks de tipo/tamanho ausentes';
  END IF;
END
$contract$;

DO $behavior$
DECLARE
  v_company_a uuid := 'da000000-0000-4000-8000-000000000001';
  v_user_a    uuid := 'da000000-0000-4000-8000-000000000002';
  v_user_b    uuid := 'da000000-0000-4000-8000-000000000003';
  v_draft     uuid := 'da000000-0000-4000-8000-000000000004';
  v_req_1     uuid := 'da000000-0000-4000-8000-000000000011';
  v_req_2     uuid := 'da000000-0000-4000-8000-000000000012';
  v_req_3     uuid := 'da000000-0000-4000-8000-000000000013';
  v_req_4     uuid := 'da000000-0000-4000-8000-000000000014';
  v_purchase  uuid := 'da000000-0000-4000-8000-000000000005';
  v_stock_a uuid := 'da000000-0000-4000-8000-000000000021';
  v_terminal_a uuid := 'da000000-0000-4000-8000-000000000022';
  v_terminal_b uuid := 'da000000-0000-4000-8000-000000000023';
  v_session_a uuid := 'da000000-0000-4000-8000-000000000024';
  v_session_b uuid := 'da000000-0000-4000-8000-000000000025';
  v_cash_account uuid := 'da000000-0000-4000-8000-000000000026';
  v_row       public.pdv_order_drafts%ROWTYPE;
  v_payload_1 jsonb;
  v_payload_2 jsonb;
  v_count     integer;
  v_blocked   boolean;
  i           integer;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000', v_user_a,
      'authenticated', 'authenticated', 'draft-a@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Teste Draft A"}'::jsonb, now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_user_b,
      'authenticated', 'authenticated', 'draft-b@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Teste Draft B"}'::jsonb, now(), now(), '', '', '', ''
    );

  INSERT INTO public.companies (
    id, name, subscription_status, subscription_expires_at
  ) VALUES (
    v_company_a, 'Empresa teste drafts', 'active', NULL
  );

  UPDATE public.profiles
     SET company_id = v_company_a, is_active = true
   WHERE user_id IN (v_user_a, v_user_b);

  INSERT INTO public.company_modules (company_id, module_code)
  VALUES (v_company_a, 'pdv');
  INSERT INTO public.user_roles(user_id,role)
  VALUES(v_user_a,'comercial'),(v_user_b,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active)
  VALUES(v_user_a,'["screen:pdv"]',true),(v_user_b,'["screen:pdv"]',true);
  UPDATE public.stocks SET is_default=false WHERE company_id=v_company_a AND is_default;
  INSERT INTO public.stocks(id,company_id,name,is_default,purpose)
  VALUES(v_stock_a,v_company_a,'Local dos rascunhos',true,'pdv');
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
  VALUES(v_cash_account,v_company_a,'Cofre dos rascunhos','caixa',0,true);
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active)
  VALUES(v_terminal_a,v_company_a,'Caixa draft A',v_stock_a,true),
        (v_terminal_b,v_company_a,'Caixa draft B',v_stock_a,true);
  INSERT INTO public.pdv_cash_sessions(id,company_id,terminal_id,opened_by,opening_amount,status,
    cash_account_id,cash_account_name_snapshot,cash_policy_snapshot,contract_version)
  VALUES(v_session_a,v_company_a,v_terminal_a,v_user_a,0,'aberta',v_cash_account,'Cofre dos rascunhos','{}',2),
        (v_session_b,v_company_a,v_terminal_b,v_user_b,0,'aberta',v_cash_account,'Cofre dos rascunhos','{}',2);


  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );

  v_payload_1 := jsonb_build_object(
    'id', v_draft,
    'sequence', 1,
    'cart', jsonb_build_object('customerId', NULL, 'discount', 0, 'lines', '[]'::jsonb),
    'transactionDate', '2026-10-19',
    'notes', ''
  );
  v_payload_2 := v_payload_1 || '{"notes":"alterado"}'::jsonb;

  v_row := public.pdv_save_order_draft_v2(v_draft, 'sale', v_payload_1, 0, v_req_1,
    p_cash_session_id => v_session_a, p_terminal_id => v_terminal_a, p_stock_id => v_stock_a);
  IF v_row.revision <> 1 OR v_row.company_id <> v_company_a OR v_row.created_by <> v_user_a
     OR v_row.cash_session_id IS DISTINCT FROM v_session_a
     OR v_row.terminal_id IS DISTINCT FROM v_terminal_a
     OR v_row.stock_id IS DISTINCT FROM v_stock_a THEN
    RAISE EXCEPTION 'create nao derivou owner/revision corretamente: %', row_to_json(v_row);
  END IF;

  -- Retry da mesma mutacao nao avanca revision.
  v_row := public.pdv_save_order_draft_v2(v_draft, 'sale', v_payload_1, 0, v_req_1,
    p_cash_session_id => v_session_a, p_terminal_id => v_terminal_a, p_stock_id => v_stock_a);
  IF v_row.revision <> 1 THEN
    RAISE EXCEPTION 'retry de create nao foi idempotente';
  END IF;

  v_row := public.pdv_save_order_draft_v2(v_draft, 'sale', v_payload_2, 1, v_req_2,
    p_cash_session_id => v_session_a, p_terminal_id => v_terminal_a, p_stock_id => v_stock_a);
  IF v_row.revision <> 2 OR v_row.payload <> v_payload_2 THEN
    RAISE EXCEPTION 'update CAS nao persistiu revision/payload';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.pdv_save_order_draft_v2(
      v_draft, 'sale', v_payload_1, 1, gen_random_uuid(),
    p_cash_session_id => v_session_a, p_terminal_id => v_terminal_a, p_stock_id => v_stock_a);
  EXCEPTION WHEN serialization_failure THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'expected_revision obsoleta sobrescreveu o draft';
  END IF;

  -- Mesmo tenant, outro usuario: nem lista nem muta o draft alheio.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_b, 'role', 'authenticated')::text,
    true
  );
  SELECT count(*) INTO v_count FROM public.pdv_list_order_drafts_v2('sale',v_session_b,v_terminal_b,v_stock_a,true);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'isolamento created_by falhou na listagem';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.pdv_delete_order_draft_v2(v_draft, 2, gen_random_uuid(),
    p_draft_type => 'sale', p_cash_session_id => v_session_b, p_terminal_id => v_terminal_b, p_stock_id => v_stock_a);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'outro usuario do tenant conseguiu apagar draft alheio';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );

  v_row := public.pdv_delete_order_draft_v2(v_draft, 2, v_req_3,
    p_draft_type => 'sale', p_cash_session_id => v_session_a, p_terminal_id => v_terminal_a, p_stock_id => v_stock_a);
  IF v_row.revision <> 3 OR v_row.deleted_at IS NULL OR v_row.payload <> v_payload_2 THEN
    RAISE EXCEPTION 'soft-delete nao preservou payload/revision';
  END IF;

  SELECT count(*) INTO v_count FROM public.pdv_list_order_drafts_v2('sale',v_session_a,v_terminal_a,v_stock_a,false);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'listagem ativa retornou draft deletado';
  END IF;
  SELECT count(*) INTO v_count FROM public.pdv_list_order_drafts_v2('sale',v_session_a,v_terminal_a,v_stock_a,true);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'listagem de recuperaveis nao retornou draft deletado';
  END IF;

  v_row := public.pdv_restore_order_draft(v_draft, 3, v_req_4);
  IF v_row.revision <> 4 OR v_row.deleted_at IS NOT NULL
     OR v_row.cash_session_id IS DISTINCT FROM v_session_a
     OR v_row.terminal_id IS DISTINCT FROM v_terminal_a
     OR v_row.stock_id IS DISTINCT FROM v_stock_a THEN
    RAISE EXCEPTION 'restore nao reativou o draft';
  END IF;

  -- O outro tipo tem espaco e contagem independentes.
  v_row := public.pdv_save_order_draft_v2(
    v_purchase,
    'purchase',
    jsonb_build_object(
      'id', v_purchase,
      'sequence', 1,
      'items', '[]'::jsonb,
      'purchaseDate', '2026-10-19'
    ),
    0,
    gen_random_uuid(),
    p_cash_session_id => NULL, p_terminal_id => NULL, p_stock_id => v_stock_a);
  IF v_row.draft_type <> 'purchase' OR v_row.revision <> 1
     OR v_row.cash_session_id IS NOT NULL OR v_row.terminal_id IS NOT NULL
     OR v_row.stock_id IS DISTINCT FROM v_stock_a THEN
    RAISE EXCEPTION 'draft de compra nao foi persistido';
  END IF;
  SELECT count(*) INTO v_count FROM public.pdv_list_order_drafts_v2('purchase',NULL,NULL,v_stock_a,false);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'contagem por tipo misturou venda e compra';
  END IF;

  -- JSON valido ainda precisa respeitar forma e limite de payload da RPC.
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_save_order_draft_v2(
      gen_random_uuid(),
      'sale',
      jsonb_build_object(
        'sequence', 2,
        'cart', jsonb_build_object('lines', '[]'::jsonb),
        'transactionDate', '2026-10-19',
        'notes', repeat('x', 131073)
      ),
      0,
      gen_random_uuid(),
    p_cash_session_id => v_session_a, p_terminal_id => v_terminal_a, p_stock_id => v_stock_a);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'payload acima de 128 KiB foi aceito';
  END IF;

  -- O teto e por usuario+tipo e inclui o draft restaurado: cria mais 19.
  FOR i IN 2..20 LOOP
    PERFORM public.pdv_save_order_draft_v2(
      gen_random_uuid(),
      'sale',
      jsonb_build_object(
        'sequence', i,
        'cart', jsonb_build_object('lines', '[]'::jsonb),
        'transactionDate', '2026-10-19'
      ),
      0,
      gen_random_uuid(),
    p_cash_session_id => v_session_a, p_terminal_id => v_terminal_a, p_stock_id => v_stock_a);
  END LOOP;

  v_blocked := false;
  BEGIN
    PERFORM public.pdv_save_order_draft_v2(
      gen_random_uuid(),
      'sale',
      '{"sequence":21,"cart":{"lines":[]},"transactionDate":"2026-10-19"}'::jsonb,
      0,
      gen_random_uuid(),
    p_cash_session_id => v_session_a, p_terminal_id => v_terminal_a, p_stock_id => v_stock_a);
  EXCEPTION WHEN program_limit_exceeded THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'limite de 20 drafts ativos nao foi aplicado';
  END IF;

  -- Assinatura e modulo falham fechados mesmo com auth/tenant validos.
  UPDATE public.companies SET subscription_status = 'inactive' WHERE id = v_company_a;
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_list_order_drafts_v2('sale',v_session_a,v_terminal_a,v_stock_a,false);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'assinatura inativa nao bloqueou a RPC';
  END IF;

  UPDATE public.companies SET subscription_status = 'active' WHERE id = v_company_a;
  DELETE FROM public.company_modules WHERE company_id = v_company_a AND module_code = 'pdv';
  v_blocked := false;
  BEGIN
    PERFORM public.pdv_list_order_drafts_v2('sale',v_session_a,v_terminal_a,v_stock_a,false);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'ausencia do modulo pdv nao bloqueou a RPC';
  END IF;
END
$behavior$;

ROLLBACK;

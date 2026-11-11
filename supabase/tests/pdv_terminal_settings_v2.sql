-- Cadastro seguro de caixas. Executar apos `supabase db reset`.
BEGIN;

DO $contract$
DECLARE v_definition text;
BEGIN
  IF has_table_privilege('authenticated', 'public.pdv_terminals', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pdv_terminals', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pdv_terminals', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.pdv_terminals', 'SELECT') THEN
    RAISE EXCEPTION 'pdv_terminals deve permitir somente leitura direta';
  END IF;

  IF has_function_privilege('anon', 'public.pdv_list_cash_terminal_settings_v2()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pdv_save_cash_terminal_v2(uuid,text,uuid,boolean,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.pdv_list_cash_terminal_settings_v2()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.pdv_save_cash_terminal_v2(uuid,text,uuid,boolean,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL das RPCs de configuracao de caixa incorreta';
  END IF;

  SELECT pg_get_functiondef('public.pdv_save_cash_terminal_v2(uuid,text,uuid,boolean,integer)'::regprocedure)
    INTO v_definition;
  IF strpos(v_definition, 'pdv_counter_context_v2') = 0
     OR strpos(v_definition, '''screen:pdv_settings''') = 0
     OR strpos(v_definition, '''fn:manage_pdv_settings''') = 0
     OR strpos(v_definition, 'stock.company_id = v_context.company_id') = 0
     OR strpos(v_definition, 'stock.customer_id IS NULL') = 0
     OR strpos(v_definition, 'session.status = ''aberta''') = 0 THEN
    RAISE EXCEPTION 'writer perdeu gate, isolamento ou protecao de caixa aberto';
  END IF;

  SELECT pg_get_functiondef('public.pdv_list_cash_terminals_v2()'::regprocedure)
    INTO v_definition;
  IF strpos(v_definition, '''stock_id'', terminal.stock_id') = 0
     OR strpos(v_definition, 'terminal.company_id = v_context.company_id') = 0 THEN
    RAISE EXCEPTION 'listagem operacional perdeu estoque ou isolamento';
  END IF;
END
$contract$;

DO $behavior$
<<fixture>>
DECLARE
  company_a uuid := 'a1100000-0000-4000-8000-000000000001';
  company_b uuid := 'b1100000-0000-4000-8000-000000000001';
  user_a uuid := 'a1100000-0000-4000-8000-000000000011';
  user_a_readonly uuid := 'a1100000-0000-4000-8000-000000000012';
  user_b uuid := 'b1100000-0000-4000-8000-000000000011';
  stock_a uuid := 'a1100000-0000-4000-8000-000000000021';
  customer_stock_a uuid := 'a1100000-0000-4000-8000-000000000022';
  stock_b uuid := 'b1100000-0000-4000-8000-000000000021';
  customer_a uuid := 'a1100000-0000-4000-8000-000000000031';
  terminal_a uuid;
  result jsonb;
  blocked boolean;
  detail text;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,
    email_change,email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',user_a,'authenticated','authenticated',
      'terminal-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',user_a_readonly,'authenticated','authenticated',
      'terminal-readonly@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',user_b,'authenticated','authenticated',
      'terminal-b@example.invalid','',now(),'{}','{}',now(),now(),'','','','');

  INSERT INTO public.companies(id,name,subscription_status) VALUES
    (company_a,'Fixture terminal A','active'),
    (company_b,'Fixture terminal B','active');
  UPDATE public.profiles SET company_id=company_a,is_active=true
    WHERE user_id IN(user_a,user_a_readonly);
  UPDATE public.profiles SET company_id=company_b,is_active=true WHERE user_id=user_b;
  INSERT INTO public.user_roles(user_id,role) VALUES
    (user_a,'comercial'::public.app_role),
    (user_a_readonly,'comercial'::public.app_role),
    (user_b,'comercial'::public.app_role);
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (user_a,'["screen:pdv_settings","fn:manage_pdv_settings","screen:pdv"]',true),
    (user_a_readonly,'["screen:pdv_settings"]',true),
    (user_b,'["screen:pdv_settings","fn:manage_pdv_settings","screen:pdv"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES
    (company_a,'pdv'),(company_b,'pdv');
  INSERT INTO public.company_settings(company_id,name,pdv_mode) VALUES
    (company_a,'Fixture terminal A','simples'),
    (company_b,'Fixture terminal B','simples');
  INSERT INTO public.customers(id,company_id,name) VALUES(customer_a,company_a,'Cliente fixture');
  INSERT INTO public.stocks(id,company_id,name,is_default,purpose,customer_id) VALUES
    (stock_a,company_a,'Loja A',true,'operacional',NULL),
    (customer_stock_a,company_a,'Estoque do cliente',false,'operacional',customer_a),
    (stock_b,company_b,'Loja B',true,'operacional',NULL);

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',user_a,'role','authenticated')::text,true);
  result := public.pdv_list_cash_terminal_settings_v2();
  IF jsonb_array_length(result->'terminals') <> 0
     OR jsonb_array_length(result->'stocks') <> 1
     OR result#>>'{stocks,0,id}' <> stock_a::text THEN
    RAISE EXCEPTION 'empresa sem caixa nao recebeu configuracao inicial isolada';
  END IF;

  result := public.pdv_save_cash_terminal_v2(NULL,'Caixa 01',stock_a,true,1);
  terminal_a := (result->>'id')::uuid;
  IF terminal_a IS NULL
     OR (SELECT purpose FROM public.stocks WHERE id=stock_a) <> 'pdv'
     OR (SELECT company_id FROM public.pdv_terminals WHERE id=terminal_a) <> company_a THEN
    RAISE EXCEPTION 'primeiro caixa nao foi criado no tenant correto';
  END IF;
  result := public.pdv_list_cash_terminals_v2();
  IF jsonb_array_length(result) <> 1
     OR result#>>'{0,stock_id}' <> stock_a::text THEN
    RAISE EXCEPTION 'caixa criado nao apareceu na listagem operacional com estoque';
  END IF;

  blocked := false;
  BEGIN
    PERFORM public.pdv_save_cash_terminal_v2(NULL,'Caixa cliente',customer_stock_a,true,2);
  EXCEPTION WHEN no_data_found THEN
    GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
    blocked := detail = 'code=pdv_terminal_stock_not_found';
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'estoque de cliente foi aceito no caixa'; END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',user_a_readonly,'role','authenticated')::text,true);
  result := public.pdv_list_cash_terminal_settings_v2();
  IF jsonb_array_length(result->'terminals') <> 1 THEN
    RAISE EXCEPTION 'usuario da tela nao conseguiu consultar os caixas';
  END IF;
  blocked := false;
  BEGIN
    PERFORM public.pdv_save_cash_terminal_v2(NULL,'Caixa sem permissao',stock_a,true,2);
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
    blocked := detail = 'code=pdv_counter_action_denied';
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'usuario sem acao gerenciou caixa'; END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',user_b,'role','authenticated')::text,true);
  result := public.pdv_list_cash_terminal_settings_v2();
  IF jsonb_array_length(result->'terminals') <> 0
     OR jsonb_array_length(result->'stocks') <> 1
     OR result#>>'{stocks,0,id}' <> stock_b::text THEN
    RAISE EXCEPTION 'tenant B recebeu dados do tenant A';
  END IF;
  blocked := false;
  BEGIN
    PERFORM public.pdv_save_cash_terminal_v2(terminal_a,'Ataque B',stock_b,true,1);
  EXCEPTION WHEN no_data_found THEN
    GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
    blocked := detail = 'code=pdv_terminal_not_found';
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'tenant B alterou caixa do tenant A'; END IF;
  IF (SELECT name FROM public.pdv_terminals WHERE id=terminal_a) <> 'Caixa 01' THEN
    RAISE EXCEPTION 'caixa do tenant A foi alterado';
  END IF;
END
$behavior$;

ROLLBACK;

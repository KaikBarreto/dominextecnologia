-- Onboarding sem alterar gates avançados nem executar backfill global.
BEGIN;

DO $contract$
DECLARE
  v_source text;
  v_function text;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.pdv_company_access_entitled_internal(uuid)',
    'public.pdv_bootstrap_company(uuid)',
    'public.tg_repair_pdv_terminal_on_general_stock()'
  ] LOOP
    IF has_function_privilege('anon', v_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'helper interno exposto ao navegador: %', v_function;
    END IF;
  END LOOP;

  IF has_function_privilege('anon', 'public.pdv_ensure_setup()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.pdv_ensure_setup()', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL do onboarding autenticado incorreta';
  END IF;

  SELECT pg_get_functiondef('public.pdv_ensure_setup()'::regprocedure) INTO v_source;
  IF position('get_user_company_id(v_uid)' in v_source) = 0
     OR position('is_admin_or_gestor(v_uid)' in v_source) = 0
     OR position('tenant_subscription_allows_access(v_company_id)' in v_source) = 0
     OR position('company_has_module(v_company_id, ''pdv'')' in v_source) = 0 THEN
    RAISE EXCEPTION 'onboarding perdeu sessao, assinatura, modulo ou role';
  END IF;

  SELECT pg_get_functiondef('public.pdv_bootstrap_company(uuid)'::regprocedure)
    INTO v_source;
  IF position('pdv-treasury-company:' in v_source) = 0
     OR position('pdv-cofre:' in v_source) = 0
     OR position('session.status = ''aberta''' in v_source) = 0
     OR position('account.id = v_current_account_id' in v_source) = 0
     OR position('account.company_id = p_company_id' in v_source) = 0
     OR position('cash_account_deferred' in v_source) = 0
     OR v_source ~ 'session\.contract_version' THEN
    RAISE EXCEPTION 'bootstrap pode trocar a conta durante sessao aberta';
  END IF;

  SELECT pg_get_functiondef(
    'public.tg_repair_pdv_terminal_on_general_stock()'::regprocedure
  ) INTO v_source;
  IF position('ORDER BY stock.is_default DESC' in v_source) = 0
     OR position('SET stock_id = v_target_stock_id' in v_source) = 0
     OR position('SET stock_id = NEW.id' in v_source) > 0 THEN
    RAISE EXCEPTION 'reparo de terminal nao prioriza estoque geral principal';
  END IF;


END;
$contract$;

DO $behavior$
DECLARE
  trial_company uuid := 'b1500000-0000-4000-8000-000000000001';
  addon_company uuid := 'b1500000-0000-4000-8000-000000000002';
  inactive_company uuid := 'b1500000-0000-4000-8000-000000000003';
  untouched_trial uuid := 'b1500000-0000-4000-8000-000000000004';
  admin_user uuid := 'b1500000-0000-4000-8000-000000000011';
  stock_id uuid := 'b1500000-0000-4000-8000-000000000021';
  broken_terminal uuid := 'b1500000-0000-4000-8000-000000000022';
  untouched_stock uuid := 'b1500000-0000-4000-8000-000000000023';
  secondary_stock uuid := 'b1500000-0000-4000-8000-000000000024';
  bank_account uuid := 'b1500000-0000-4000-8000-000000000025';
  open_session uuid := 'b1500000-0000-4000-8000-000000000026';
  addon_terminal uuid;
  result jsonb;
  linked_account uuid;
  cash_accounts_before integer;
  denied_state text;
  denied_detail text;
  test_status text;
  test_day integer;
  test_bypass boolean;
BEGIN
  INSERT INTO auth.users(
    instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
    confirmation_token,email_change,email_change_token_new,recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',admin_user,
    'authenticated','authenticated','pdv-onboarding@example.invalid','',now(),
    '{}'::jsonb,'{}'::jsonb,now(),now(),'','','',''
  );

  -- Simula base importada sem o trigger historico de estoque. O trigger novo
  -- deve preparar a conta, mas nunca persistir terminal com stock_id NULL.
  ALTER TABLE public.companies DISABLE TRIGGER trg_create_default_stock_on_company_insert;
  INSERT INTO public.companies(
    id,name,subscription_status,subscription_expires_at
  ) VALUES (
    trial_company,'PDV Trial sem estoque','testing',now() + interval '7 days'
  );
  ALTER TABLE public.companies ENABLE TRIGGER trg_create_default_stock_on_company_insert;

  UPDATE public.profiles
     SET company_id = trial_company, is_active = true
   WHERE user_id = admin_user;
  INSERT INTO public.user_roles(user_id,role) VALUES(admin_user,'admin');

  IF EXISTS(
    SELECT 1 FROM public.pdv_terminals terminal
     WHERE terminal.company_id = trial_company
  ) THEN
    RAISE EXCEPTION 'trial sem estoque recebeu terminal invalido';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.company_settings settings
     WHERE settings.company_id = trial_company AND settings.pdv_cash_account_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'trial recebeu estrutura do PDV antes da escolha do administrador';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',admin_user,'role','authenticated')::text,
    true
  );
  result := public.pdv_ensure_setup();
  IF result->>'configured' <> 'true' OR result->>'needs_stock' <> 'true'
     OR result->>'terminal_created' <> 'false' OR result->>'needs_cash_close' <> 'false' THEN
    RAISE EXCEPTION 'onboarding sem estoque nao orientou a UI: %', result;
  END IF;

  SELECT settings.pdv_cash_account_id
    INTO linked_account
    FROM public.company_settings settings
   WHERE settings.company_id = trial_company;
  IF linked_account IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.financial_accounts account
     WHERE account.id = linked_account
       AND account.company_id = trial_company
       AND account.type = 'caixa'
       AND account.is_active
  ) THEN
    RAISE EXCEPTION 'preparo lazy nao criou conta Caixa segura';
  END IF;

  -- Reproduz a anomalia antiga: terminal persistido sem estoque. O trigger do
  -- primeiro estoque pode reparar este registro, mas nao criar outro.
  INSERT INTO public.pdv_terminals(
    id,company_id,name,stock_id,is_active,sort_order
  ) VALUES(
    broken_terminal,trial_company,'Caixa legado sem estoque',NULL,true,0
  );

  -- A criação da empresa já fornece um estoque padrão; a fixture escolhe outro explicitamente.
  UPDATE public.stocks SET is_default=false WHERE company_id IN (trial_company) AND is_default IS TRUE;
  INSERT INTO public.stocks(
    id,company_id,name,is_default,sort_order,purpose,customer_id
  ) VALUES(
    stock_id,trial_company,'Estoque principal do teste',true,0,'operacional',NULL
  );

  result := public.pdv_ensure_setup();
  IF result->>'needs_stock' <> 'false' OR NOT EXISTS(
    SELECT 1
      FROM public.pdv_terminals terminal
      JOIN public.stocks stock ON stock.id = terminal.stock_id
     WHERE terminal.company_id = trial_company
       AND stock.company_id = trial_company
       AND stock.customer_id IS NULL
  ) THEN
    RAISE EXCEPTION 'primeiro estoque geral nao concluiu o terminal';
  END IF;
  IF (SELECT count(*) FROM public.pdv_terminals WHERE company_id=trial_company) <> 1
     OR (SELECT terminal.stock_id FROM public.pdv_terminals terminal
          WHERE terminal.id=broken_terminal) IS DISTINCT FROM stock_id THEN
    RAISE EXCEPTION 'reparo de estoque criou terminal novo ou nao corrigiu o legado';
  END IF;

  -- Se ja existe estoque principal, criar um local secundario nao pode desviar
  -- um terminal legado quebrado para o ultimo registro inserido.
  UPDATE public.pdv_terminals
     SET stock_id = NULL
   WHERE id = broken_terminal;
  INSERT INTO public.stocks(
    id,company_id,name,is_default,sort_order,purpose,customer_id
  ) VALUES(
    secondary_stock,trial_company,'Estoque secundario do teste',false,10,
    'operacional',NULL
  );
  IF (SELECT terminal.stock_id FROM public.pdv_terminals terminal
       WHERE terminal.id=broken_terminal) IS DISTINCT FROM stock_id THEN
    RAISE EXCEPTION 'estoque secundario substituiu indevidamente o principal no terminal';
  END IF;


  -- Trial que nunca abriu o PDV pode cadastrar estoque normalmente sem ganhar
  -- conta ou terminal escondidos.
  ALTER TABLE public.companies DISABLE TRIGGER trg_create_default_stock_on_company_insert;
  INSERT INTO public.companies(id,name,subscription_status,subscription_expires_at)
  VALUES(untouched_trial,'Trial sem escolha pelo PDV','testing',now()+interval '7 days');
  ALTER TABLE public.companies ENABLE TRIGGER trg_create_default_stock_on_company_insert;
  -- A criação da empresa já fornece um estoque padrão; a fixture escolhe outro explicitamente.
  UPDATE public.stocks SET is_default=false WHERE company_id IN (untouched_trial) AND is_default IS TRUE;
  INSERT INTO public.stocks(id,company_id,name,is_default,purpose)
  VALUES(untouched_stock,untouched_trial,'Estoque comum',true,'operacional');
  IF EXISTS(SELECT 1 FROM public.pdv_terminals WHERE company_id=untouched_trial)
     OR EXISTS(SELECT 1 FROM public.company_settings
       WHERE company_id=untouched_trial AND pdv_cash_account_id IS NOT NULL) THEN
    RAISE EXCEPTION 'estoque comum ativou PDV de trial que nunca iniciou setup';
  END IF;

  -- Empresa ativa sem modulo nao recebe PDV. A ativacao explicita conclui o
  -- setup no mesmo commit e nao depende de allowlist.
  INSERT INTO public.companies(id,name,subscription_status)
  VALUES(addon_company,'PDV Add-on','active');
  INSERT INTO public.company_modules(company_id,module_code)
  VALUES(addon_company,'pdv');
  IF NOT EXISTS(
    SELECT 1 FROM public.pdv_terminals terminal
     WHERE terminal.company_id = addon_company AND terminal.stock_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ativacao explicita nao provisionou todo o PDV';
  END IF;

  -- Reproduz empresa legada cuja configuracao aponta Banco/Carteira. Mesmo o
  -- backfill chama este bootstrap: com qualquer sessao aberta, a conta atual
  -- valida precisa permanecer intocada, independentemente do contract_version.
  SELECT terminal.id
    INTO addon_terminal
    FROM public.pdv_terminals terminal
   WHERE terminal.company_id = addon_company
   ORDER BY terminal.sort_order, terminal.created_at, terminal.id
   LIMIT 1;
  INSERT INTO public.financial_accounts(
    id,company_id,name,type,initial_balance,is_active,sort_order
  ) VALUES(
    bank_account,addon_company,'Banco legado configurado','banco',0,true,20
  );
  UPDATE public.company_settings
     SET pdv_cash_account_id = bank_account
   WHERE company_id = addon_company;
  SELECT count(*)
    INTO cash_accounts_before
    FROM public.financial_accounts account
   WHERE account.company_id = addon_company
     AND account.type = 'caixa';
  INSERT INTO public.pdv_cash_sessions(
    id,company_id,terminal_id,opened_by,opening_amount,status,contract_version
  ) VALUES(
    open_session,addon_company,addon_terminal,NULL,0,'aberta',1
  );

  result := public.pdv_bootstrap_company(addon_company);
  SELECT settings.pdv_cash_account_id
    INTO linked_account
    FROM public.company_settings settings
   WHERE settings.company_id = addon_company;
  IF linked_account IS DISTINCT FROM bank_account
     OR result->>'cash_account_deferred' <> 'true'
     OR (SELECT count(*) FROM public.financial_accounts account
          WHERE account.company_id=addon_company AND account.type='caixa')
        <> cash_accounts_before THEN
    RAISE EXCEPTION 'bootstrap trocou/criou conta no meio de sessao aberta: %', result;
  END IF;

  UPDATE public.pdv_cash_sessions
     SET status = 'fechada', closed_at = now(), counted_amount = 0
   WHERE id = open_session;
  result := public.pdv_bootstrap_company(addon_company);
  SELECT settings.pdv_cash_account_id
    INTO linked_account
    FROM public.company_settings settings
   WHERE settings.company_id = addon_company;
  IF linked_account IS NULL OR linked_account = bank_account OR NOT EXISTS(
    SELECT 1 FROM public.financial_accounts account
     WHERE account.id = linked_account
       AND account.company_id = addon_company
       AND account.type = 'caixa'
       AND account.is_active
  ) THEN
    RAISE EXCEPTION 'conta nao foi normalizada depois do fechamento: %', result;
  END IF;

  -- Modulo pode ser contratado antes do pagamento. Alterar a assinatura nao
  -- deve criar estrutura silenciosamente; o onboarding lazy cuidara disso.
  INSERT INTO public.companies(id,name,subscription_status)
  VALUES(inactive_company,'PDV aguardando assinatura','inactive');
  INSERT INTO public.company_modules(company_id,module_code)
  VALUES(inactive_company,'pdv');
  IF EXISTS(
    SELECT 1 FROM public.pdv_terminals terminal
     WHERE terminal.company_id = inactive_company
  ) THEN
    RAISE EXCEPTION 'empresa inativa recebeu acesso operacional';
  END IF;
  UPDATE public.companies SET subscription_status='active'
   WHERE id=inactive_company;
  IF EXISTS(
    SELECT 1 FROM public.pdv_terminals terminal
     WHERE terminal.company_id = inactive_company AND terminal.stock_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'reativacao criou PDV sem escolha do administrador';
  END IF;

  -- A vigência do helper sem JWT para triggers deve coincidir com o gate
  -- canônico autenticado: vencimento civil, carência, status e bypass.
  FOREACH test_status IN ARRAY ARRAY['active','testing','pending_payment','inactive'] LOOP
    FOREACH test_day IN ARRAY ARRAY[-2,-1,0,1,7] LOOP
      FOREACH test_bypass IN ARRAY ARRAY[false,true] LOOP
        UPDATE public.companies SET subscription_status=test_status,
          subscription_expires_at=now()+make_interval(days=>test_day),
          payment_lock_bypass=test_bypass WHERE id=trial_company;
        IF public.pdv_company_access_entitled_internal(trial_company)
          IS DISTINCT FROM public.tenant_subscription_allows_access(trial_company) THEN
          RAISE EXCEPTION 'vigencia do onboarding divergiu da fonte canonica';
        END IF;
      END LOOP;
    END LOOP;
    UPDATE public.companies SET subscription_expires_at=NULL WHERE id=trial_company;
    IF public.pdv_company_access_entitled_internal(trial_company)
      IS DISTINCT FROM public.tenant_subscription_allows_access(trial_company) THEN
      RAISE EXCEPTION 'vigencia sem data divergiu da fonte canonica';
    END IF;
  END LOOP;
  UPDATE public.companies SET subscription_status='testing',
    subscription_expires_at=now()+interval '7 days',payment_lock_bypass=false
    WHERE id=trial_company;

  -- Um JWT ainda válido de administrador desativado não pode preparar nada.
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  VALUES('00000000-0000-0000-0000-000000000000','b1500000-0000-4000-8000-000000000013','authenticated','authenticated','pdv-inactive@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  UPDATE public.profiles SET company_id=trial_company,is_active=true WHERE user_id='b1500000-0000-4000-8000-000000000013';
  INSERT INTO public.user_roles(user_id,role) VALUES('b1500000-0000-4000-8000-000000000013','admin');
  -- Administração autorizada desativa a fixture; a chamada testada abaixo usa seu JWT comum.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
  UPDATE public.profiles SET is_active=false WHERE user_id='b1500000-0000-4000-8000-000000000013';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','b1500000-0000-4000-8000-000000000013','role','authenticated')::text,true);
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN PERFORM public.pdv_ensure_setup();
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL;
  END;
  IF denied_state IS DISTINCT FROM '42501' OR denied_detail IS DISTINCT FROM 'code=pdv_setup_user_inactive' THEN
    RAISE EXCEPTION 'administrador desativado conseguiu preparar caixa';
  END IF;

  -- A RPC nunca aceita empresa por argumento e operador comum nao configura.
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  VALUES('00000000-0000-0000-0000-000000000000','b1500000-0000-4000-8000-000000000012','authenticated','authenticated','pdv-clerk@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  UPDATE public.profiles SET company_id=trial_company,is_active=true WHERE user_id='b1500000-0000-4000-8000-000000000012';
  INSERT INTO public.user_roles(user_id,role) VALUES('b1500000-0000-4000-8000-000000000012','comercial');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','b1500000-0000-4000-8000-000000000012','role','authenticated')::text,true);
  denied_state := NULL;
  denied_detail := NULL;
  BEGIN
    PERFORM public.pdv_ensure_setup();
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      denied_state = RETURNED_SQLSTATE,
      denied_detail = PG_EXCEPTION_DETAIL;
  END;
  IF denied_state IS DISTINCT FROM '42501'
     OR denied_detail IS DISTINCT FROM 'code=pdv_setup_permission_denied' THEN
    RAISE EXCEPTION 'operador comum configurou PDV: %, %', denied_state, denied_detail;
  END IF;
END;
$behavior$;

ROLLBACK;

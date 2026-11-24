-- Dados fictícios; toda a fixture é revertida no final.
BEGIN;
DO $fixture$
DECLARE c uuid := '24170000-0000-4000-8000-000000000001';
  c2 uuid := '24170000-0000-4000-8000-000000000002';
  u uuid := '24170000-0000-4000-8000-000000000011';
  operator_id uuid := '24170000-0000-4000-8000-000000000012';
  account uuid := '24170000-0000-4000-8000-000000000021';
  account2 uuid := '24170000-0000-4000-8000-000000000022';
  terminal uuid := '24170000-0000-4000-8000-000000000031'; stock uuid;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,
    email_change_token_new,recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000'::uuid, id, 'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
  FROM (VALUES (u,'first-cash-admin@example.invalid'),(operator_id,'first-cash-operator@example.invalid')) AS fixture(id,email);
  INSERT INTO public.companies(id,name,subscription_status,subscription_plan,subscription_expires_at) VALUES (c,'Fixture primeiro caixa','active','personalizado',now()+interval '30 days'),(c2,'Fixture outro tenant','active','personalizado',now()+interval '30 days');
  UPDATE public.profiles SET company_id = c, is_active = true WHERE user_id IN (u,operator_id);
  INSERT INTO public.user_roles(user_id,role) VALUES (u,'admin'),(operator_id,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (u,'["*"]',true),(operator_id,'["screen:pdv"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES (c,'pdv');
  SELECT id INTO stock FROM public.stocks WHERE company_id = c AND customer_id IS NULL LIMIT 1;
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
    VALUES (account,c,'Dinheiro inicial','caixa',0,true),(account2,c2,'Outro cofre','caixa',0,true);
  INSERT INTO public.company_settings(company_id,name,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
    VALUES(c,'Fixture',account,true,'simples') ON CONFLICT(company_id) DO UPDATE SET
    pdv_cash_account_id=excluded.pdv_cash_account_id,pdv_strict_cash_tracking=true;
  INSERT INTO public.pdv_terminals(id,company_id,name,is_active,stock_id) VALUES (terminal,c,'Caixa teste',true,stock);
END $fixture$;
SET LOCAL ROLE authenticated;
DO $behavior$
DECLARE u uuid := '24170000-0000-4000-8000-000000000011';
  operator_id uuid := '24170000-0000-4000-8000-000000000012';
  account uuid := '24170000-0000-4000-8000-000000000021';
  account2 uuid := '24170000-0000-4000-8000-000000000022';
  terminal uuid := '24170000-0000-4000-8000-000000000031'; r jsonb; replay jsonb;
  blocked boolean; session_id uuid; snapshot jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',operator_id,'role','authenticated')::text,true);
  IF public.pdv_can_initialize_treasury_v2(account) THEN RAISE EXCEPTION 'operador sem gestão financeira inicializou'; END IF;
  blocked := false;
  BEGIN PERFORM public.pdv_initialize_and_open_cash_v2(terminal,account,100,300,'first-cash-denied');
    EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'writer permitiu operador sem gestão financeira'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  IF public.pdv_can_initialize_treasury_v2(account2) THEN RAISE EXCEPTION 'leitura permitiu outro tenant'; END IF;
  blocked := false;
  BEGIN PERFORM public.pdv_initialize_and_open_cash_v2(terminal,account2,100,300,'first-cash-other-tenant');
    EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'writer aceitou conta de outro tenant'; END IF;
  IF NOT public.pdv_can_initialize_treasury_v2(account) THEN RAISE EXCEPTION 'primeiro uso legítimo bloqueado'; END IF;

  blocked := false;
  BEGIN PERFORM public.pdv_initialize_and_open_cash_v2(terminal,account,301,300,'first-cash-too-much');
    EXCEPTION WHEN invalid_parameter_value THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'troco maior que total aceito'; END IF;

  -- Falha depois de gravar o saldo deve reverter a inicialização inteira.
  blocked := false;
  BEGIN PERFORM public.pdv_initialize_and_open_cash_v2('24170000-0000-4000-8000-000000000099',account,100,300,'first-cash-bad-terminal');
    EXCEPTION WHEN OTHERS THEN blocked := true; END;
  IF NOT blocked OR NOT public.pdv_can_initialize_treasury_v2(account) THEN RAISE EXCEPTION 'falha da abertura deixou saldo parcial'; END IF;

  r := public.pdv_initialize_and_open_cash_v2(terminal,account,100,300,'first-cash-success');
  session_id := (r->>'session_id')::uuid;
  IF (r->>'ok')::boolean IS DISTINCT FROM TRUE OR (r->>'initial_balance')::numeric <> 300 THEN
    RAISE EXCEPTION 'abertura inicial sem confirmação'; END IF;
  replay := public.pdv_initialize_and_open_cash_v2(terminal,account,100,300,'first-cash-success');
  IF replay <> r THEN RAISE EXCEPTION 'retry não reproduziu mesma abertura'; END IF;
  snapshot := public.pdv_cash_snapshot_v2(account);
  IF (snapshot->>'balance')::numeric <> 300 OR (snapshot->>'custody')::numeric <> 100
     OR (snapshot->>'available')::numeric <> 200 THEN RAISE EXCEPTION 'saldo/custódia/disponível divergiram: %',snapshot; END IF;
  IF public.pdv_can_initialize_treasury_v2(account) THEN RAISE EXCEPTION 'permitiu reinicializar com caixa aberto'; END IF;
  blocked := false;
  BEGIN PERFORM public.pdv_initialize_and_open_cash_v2(terminal,account,100,500,'first-cash-new-attempt');
    EXCEPTION WHEN object_not_in_prerequisite_state THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'nova chave sobrescreveu saldo existente'; END IF;
  PERFORM public.pdv_close_cash_session_v2(session_id,account,100,NULL,'first-cash-close');
  IF public.pdv_can_initialize_treasury_v2(account) THEN RAISE EXCEPTION 'caixa fechado liberou nova inicialização'; END IF;
END $behavior$;
RESET ROLE;
DO $audit$
BEGIN
  IF EXISTS (SELECT 1 FROM public.financial_transactions WHERE company_id = '24170000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'saldo inicial contaminou receitas/despesas'; END IF;
  IF (SELECT count(*) FROM public.pdv_cash_sessions WHERE company_id = '24170000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'retry duplicou abertura'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.pdv_operation_requests WHERE company_id='24170000-0000-4000-8000-000000000001'
    AND operation_type='cash.initialize.v2' AND status='completed' AND created_by='24170000-0000-4000-8000-000000000011'
    AND (result->>'initial_balance')::numeric=300) THEN RAISE EXCEPTION 'auditoria ausente'; END IF;
  IF has_function_privilege('anon','public.pdv_initialize_and_open_cash_v2(uuid,uuid,numeric,numeric,text)','EXECUTE') THEN
    RAISE EXCEPTION 'RPC inicial exposta ao anônimo'; END IF;
END $audit$;
ROLLBACK;

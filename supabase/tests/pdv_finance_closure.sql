-- P0 financeiro: contrato, centavos, permissao e isolamento Caixa A/B.
BEGIN;

DO $contract$
DECLARE v_fn text; v_src text; v_rls_helper regprocedure;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='pdv_card_settlement_details'
      AND c.relrowsecurity AND c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'liquidacoes de cartao sem FORCE RLS';
  END IF;
  IF has_table_privilege('authenticated','public.pdv_card_settlement_details','SELECT')
     OR has_table_privilege('authenticated','public.pdv_card_settlement_details','INSERT')
     OR has_table_privilege('anon','public.pdv_card_settlement_details','SELECT') THEN
    RAISE EXCEPTION 'detalhes de cartao expostos diretamente';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_party_account_statement_v3(text,uuid,text,integer,integer)',
    'public.pdv_party_receivable_options_v3(uuid)',
    'public.pdv_party_settle_receivables_v2(uuid,jsonb,text,uuid,uuid,date,text,text)',
    'public.pdv_party_reverse_receivable_settlement_v2(uuid,uuid,uuid,uuid,text,text)',
    'public.pdv_can_read_financial_transaction_current_user_v3(uuid,uuid)',
    'public.pdv_list_open_card_authorizations_v3()',
    'public.pdv_settle_card_authorization_v3(uuid,uuid,date,text,text,integer,numeric,text)'
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE')
       OR NOT has_function_privilege('authenticated',v_fn,'EXECUTE') THEN
      RAISE EXCEPTION 'ACL publica incorreta: %',v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_settle_receivables_v2(jsonb,text,uuid,uuid,date,text,text)',
    'public.pdv_reverse_receivable_settlement_v2(uuid,uuid,uuid,text,text)',
    'public.pdv_can_access_cash_session_v3(uuid,uuid,uuid)',
    'public.pdv_can_read_financial_transaction_v3(uuid,uuid,uuid)',
    'public.pdv_card_settlement_context_v3()',
    'public.pdv_guard_customer_credit_limit_v3()'
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE')
       OR has_function_privilege('authenticated',v_fn,'EXECUTE') THEN
      RAISE EXCEPTION 'helper financeiro exposto: %',v_fn;
    END IF;
  END LOOP;
  SELECT pg_get_functiondef('public.pdv_party_settle_receivables_v2(uuid,jsonb,text,uuid,uuid,date,text,text)'::regprocedure) INTO v_src;
  IF position('pdv_can_access_cash_session_v3' in v_src)=0
     OR position('orders.cash_session_id' in v_src)=0
     OR position('orders.terminal_id' in v_src)=0 THEN
    RAISE EXCEPTION 'baixa do fiado nao valida sessao/terminal no servidor';
  END IF;
  SELECT pg_get_functiondef('public.pdv_settle_card_authorization_v3(uuid,uuid,date,text,text,integer,numeric,text)'::regprocedure) INTO v_src;
  IF position('pdv_can_access_cash_session_v3' in v_src)=0
     OR position('v_order.terminal_id' in v_src)=0
     OR position('pdv_apply_settlement_fifo_v2' in v_src)=0
     OR position('pdv_card_fee' in v_src)=0 THEN
    RAISE EXCEPTION 'cartao sem isolamento/FIFO/taxa canonica';
  END IF;
  SELECT pg_get_functiondef('public.pdv_list_open_card_authorizations_v3()'::regprocedure) INTO v_src;
  IF position('session.terminal_id=orders.terminal_id' in replace(v_src,' ',''))=0
     OR position('pdv_can_access_cash_session_v3' in v_src)=0 THEN
    RAISE EXCEPTION 'listagem de cartao pode misturar caixas';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies policy
    WHERE policy.schemaname='public' AND policy.tablename='financial_transactions'
      AND policy.policyname='Scoped financial transaction reads v3'
      AND (policy.qual LIKE '%pdv_can_read_financial_transaction_current_user_v3%'
        OR policy.qual LIKE '%can_read_financial_transaction_row_current_user_v4%')) THEN
    RAISE EXCEPTION 'RLS financeira ainda permite leitura company-only';
  END IF;
  -- A base publicada pode usar o wrapper por linha v4 (INSERT RETURNING).
  -- O comportamento de custodia abaixo continua obrigatorio em ambas as versoes.
  SELECT CASE WHEN policy.qual LIKE '%can_read_financial_transaction_row_current_user_v4%'
    THEN to_regprocedure('public.can_read_financial_transaction_row_current_user_v4(uuid,uuid,text,uuid)')
    ELSE to_regprocedure('public.pdv_can_read_financial_transaction_current_user_v3(uuid,uuid)') END
    INTO v_rls_helper FROM pg_policies policy
    WHERE policy.schemaname='public' AND policy.tablename='financial_transactions'
      AND policy.policyname='Scoped financial transaction reads v3';
  IF v_rls_helper IS NULL OR has_function_privilege('anon',v_rls_helper,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_rls_helper,'EXECUTE') THEN
    RAISE EXCEPTION 'ACL do wrapper usado pela RLS financeira incorreta';
  END IF;
  SELECT pg_get_functiondef(v_rls_helper) INTO v_src;
  IF position('auth.uid()' in v_src)=0
     OR (position('pdv_can_read_financial_transaction_v3' in v_src)=0
       AND position('pdv_can_access_cash_session_v3' in v_src)=0) THEN
    RAISE EXCEPTION 'wrapper RLS nao fixa a identidade na sessao autenticada';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies policy
    WHERE policy.schemaname='public' AND policy.tablename='financial_transactions'
      AND policy.policyname='Scoped non PDV financial transaction inserts v3'
      AND policy.with_check LIKE '%origin IS DISTINCT FROM%pdv%'
      AND policy.with_check LIKE '%pdv_cash_session_id IS NULL%') THEN
    RAISE EXCEPTION 'RLS financeira aceita payload PDV/sessao forjado';
  END IF;
END $contract$;

DO $isolation$
DECLARE
  company_a uuid:='f3000000-0000-4000-8000-000000000001';
  company_b uuid:='f3000000-0000-4000-8000-000000000002';
  user_a uuid:='f3000000-0000-4000-8000-000000000011';
  user_b uuid:='f3000000-0000-4000-8000-000000000012';
  user_other uuid:='f3000000-0000-4000-8000-000000000013';
  user_denied uuid:='f3000000-0000-4000-8000-000000000014';
  account_a uuid:='f3000000-0000-4000-8000-000000000021';
  account_b uuid:='f3000000-0000-4000-8000-000000000022';
  terminal_a uuid:='f3000000-0000-4000-8000-000000000031';
  terminal_b uuid:='f3000000-0000-4000-8000-000000000032';
  terminal_other uuid:='f3000000-0000-4000-8000-000000000033';
  session_a uuid:='f3000000-0000-4000-8000-000000000041';
  session_b uuid:='f3000000-0000-4000-8000-000000000042';
  session_other uuid:='f3000000-0000-4000-8000-000000000043';
  customer_a uuid:='f3000000-0000-4000-8000-000000000051';
  tx_a uuid:='f3000000-0000-4000-8000-000000000061';
  tx_b uuid:='f3000000-0000-4000-8000-000000000062';
  tx_other uuid:='f3000000-0000-4000-8000-000000000063';
  state text; detail text; visible_count integer;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,
    email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',user_a,'authenticated','authenticated','p0-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',user_b,'authenticated','authenticated','p0-b@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',user_other,'authenticated','authenticated','p0-other@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',user_denied,'authenticated','authenticated','p0-denied@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES
    (company_a,'P0 Finance A','active'),(company_b,'P0 Finance B','active');
  UPDATE public.profiles SET company_id=company_a,is_active=TRUE WHERE user_id IN(user_a,user_b,user_denied);
  UPDATE public.profiles SET company_id=company_b,is_active=TRUE WHERE user_id=user_other;
  INSERT INTO public.user_roles(user_id,role) VALUES(user_a,'comercial'),(user_b,'gestor'),(user_other,'comercial'),(user_denied,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (user_a,'["screen:customers","screen:pdv","fn:view_customer_financial","fn:manage_party_credit","fn:receive_pdv_receivable","fn:reverse_pdv_receivable","fn:settle_pdv_card","fn:use_bank_accounts"]',TRUE),
    (user_b,'["screen:customers","screen:pdv","fn:view_customer_financial","fn:receive_pdv_receivable","fn:settle_pdv_card","fn:use_bank_accounts"]',TRUE),
    (user_other,'["screen:customers","screen:pdv","fn:view_customer_financial","fn:settle_pdv_card","fn:use_bank_accounts"]',TRUE),
    (user_denied,'["screen:customers","fn:view_customer_financial"]',TRUE);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(company_a,'basic'),(company_a,'pdv'),(company_b,'basic'),(company_b,'pdv');
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES
    (account_a,company_a,'Caixa A','caixa',1000,TRUE),(account_b,company_b,'Caixa B','caixa',1000,TRUE);
  INSERT INTO public.pdv_terminals(id,company_id,name) VALUES
    (terminal_a,company_a,'Terminal A'),(terminal_b,company_a,'Terminal B'),(terminal_other,company_b,'Terminal Outro');
  INSERT INTO public.pdv_cash_sessions(id,company_id,terminal_id,opened_by,opening_amount,status,
    cash_account_id,cash_account_name_snapshot,cash_policy_snapshot,contract_version) VALUES
    (session_a,company_a,terminal_a,user_a,100,'aberta',account_a,'Caixa A','{}',2),
    (session_b,company_a,terminal_b,user_b,100,'aberta',account_a,'Caixa A','{}',2),
    (session_other,company_b,terminal_other,user_other,100,'aberta',account_b,'Caixa B','{}',2);
  INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted)
  VALUES(customer_a,company_a,'Cliente P0',100,FALSE);
  INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,
    transaction_date,is_paid,origin,pdv_cash_session_id) VALUES
    (tx_a,company_a,'entrada','Venda Caixa A',10,public.company_today(company_a),TRUE,'pdv',session_a),
    (tx_b,company_a,'entrada','Venda Caixa B',20,public.company_today(company_a),TRUE,'pdv',session_b),
    (tx_other,company_b,'entrada','Venda Outro tenant',30,public.company_today(company_b),TRUE,'pdv',session_other);

  IF public.pdv_can_access_cash_session_v3(user_a,company_a,session_a) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'operador nao acessa a propria sessao'; END IF;
  IF public.pdv_can_access_cash_session_v3(user_a,company_a,session_b)
     OR public.pdv_can_access_cash_session_v3(user_a,company_a,session_other)
     OR public.pdv_can_access_cash_session_v3(user_b,company_a,session_a) THEN
    RAISE EXCEPTION 'Caixa A/B ou outro tenant vazou sem permissao explicita'; END IF;
  -- A policy real tambem deve negar o gestor sem capacidade nominal entre caixas.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_b,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO visible_count FROM public.financial_transactions WHERE id=tx_a;
  IF visible_count<>0 THEN
    RAISE EXCEPTION 'RLS autenticada concedeu Caixa A ao gestor sem permissao nominal (linhas visiveis=%)',visible_count;
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_a,'role','authenticated')::text,true);

  IF public.pdv_can_read_financial_transaction_v3(user_a,company_a,tx_a) IS DISTINCT FROM TRUE
     OR public.pdv_can_read_financial_transaction_v3(user_a,company_a,tx_b)
     OR public.pdv_can_read_financial_transaction_v3(user_a,company_b,tx_other) THEN
    RAISE EXCEPTION 'RLS/helper financeiro divergente: proprio=%, outro_caixa=%, outro_tenant=%',
      public.pdv_can_read_financial_transaction_v3(user_a,company_a,tx_a),
      public.pdv_can_read_financial_transaction_v3(user_a,company_a,tx_b),
      public.pdv_can_read_financial_transaction_v3(user_a,company_b,tx_other);
  END IF;

  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.user_permissions SET permissions=permissions||'["fn:operate_other_pdv_cash"]'::jsonb
   WHERE user_id=user_b;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_b,'role','authenticated')::text,true);
  -- Este helper owner-only recebe a empresa ja autorizada do contexto.
  -- A negativa de outro tenant pertence ao wrapper financeiro e a RLS real.
  IF public.pdv_can_access_cash_session_v3(user_b,company_a,session_a) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'permissao nominal nao abriu caixa autorizado da mesma empresa'; END IF;
  IF public.pdv_can_read_financial_transaction_v3(user_b,company_a,tx_a) IS DISTINCT FROM TRUE
     OR public.pdv_can_read_financial_transaction_v3(user_b,company_b,tx_other) THEN
    RAISE EXCEPTION 'leitura financeira cruzada ignorou empresa'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_denied,'role','authenticated')::text,TRUE);
  state:=NULL; detail:=NULL;
  BEGIN UPDATE public.customers SET credit_limit=100.001 WHERE id=customer_a;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,detail=PG_EXCEPTION_DETAIL; END;
  IF state IS NULL THEN RAISE EXCEPTION 'limite aceitou fracao de centavo'; END IF;

  state:=NULL; detail:=NULL;
  BEGIN UPDATE public.customers SET credit_limit=200 WHERE id=customer_a;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,detail=PG_EXCEPTION_DETAIL; END;
  IF state IS DISTINCT FROM '42501' OR detail NOT LIKE '%pdv_credit_limit_permission_denied%' THEN
    RAISE EXCEPTION 'gestor sem permissao alterou limite: %, %',state,detail; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_a,'role','authenticated')::text,TRUE);
  UPDATE public.customers SET credit_limit=200.25 WHERE id=customer_a;
  IF (SELECT credit_limit FROM public.customers WHERE id=customer_a)<>200.25 THEN
    RAISE EXCEPTION 'limite em centavos nao foi salvo'; END IF;
END $isolation$;

-- A policy e o wrapper precisam funcionar com os privilegios reais da API.
SET LOCAL ROLE authenticated;
DO $rls_behavior$
DECLARE visible_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'sub','f3000000-0000-4000-8000-000000000011','role','authenticated')::text,true);
  SELECT count(*) INTO visible_count FROM public.financial_transactions
   WHERE id IN ('f3000000-0000-4000-8000-000000000061',
                'f3000000-0000-4000-8000-000000000062',
                'f3000000-0000-4000-8000-000000000063');
  IF visible_count<>1 THEN
    RAISE EXCEPTION 'RLS autenticada nao isolou caixa proprio, outro operador e tenant';
  END IF;
  IF public.pdv_can_read_financial_transaction_current_user_v3(
       'f3000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000061') IS DISTINCT FROM true
     OR public.pdv_can_read_financial_transaction_current_user_v3(
       'f3000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000062')
     OR public.pdv_can_read_financial_transaction_current_user_v3(
       'f3000000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-000000000063') THEN
    RAISE EXCEPTION 'wrapper da API nao preservou isolamento financeiro';
  END IF;
END $rls_behavior$;
RESET ROLE;

ROLLBACK;

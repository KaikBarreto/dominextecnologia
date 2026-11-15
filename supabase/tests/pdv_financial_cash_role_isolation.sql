-- P1: cargo administrativo preserva Financeiro geral, sem abrir caixas PDV alheios.
-- Fixtures ficticias; nenhuma concessao de banco ou dado permanece.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $behavior$
DECLARE
  company_a uuid:='f5010000-0000-4000-8000-000000000001';
  company_b uuid:='f5010000-0000-4000-8000-000000000002';
  owner_a uuid:='f5010000-0000-4000-8000-000000000011';
  owner_b uuid:='f5010000-0000-4000-8000-000000000012';
  manager_a uuid:='f5010000-0000-4000-8000-000000000013';
  technician_a uuid:='f5010000-0000-4000-8000-000000000014';
  nominal_a uuid:='f5010000-0000-4000-8000-000000000015';
  inactive_a uuid:='f5010000-0000-4000-8000-000000000016';
  other_tenant uuid:='f5010000-0000-4000-8000-000000000017';
  admin_a uuid:='f5010000-0000-4000-8000-000000000018';
  account_a uuid:='f5010000-0000-4000-8000-000000000021';
  account_b uuid:='f5010000-0000-4000-8000-000000000022';
  stock_a uuid:='f5010000-0000-4000-8000-000000000031';
  stock_b uuid:='f5010000-0000-4000-8000-000000000032';
  terminal_a uuid:='f5010000-0000-4000-8000-000000000041';
  terminal_b uuid:='f5010000-0000-4000-8000-000000000042';
  terminal_other uuid:='f5010000-0000-4000-8000-000000000043';
  session_a uuid:='f5010000-0000-4000-8000-000000000051';
  session_b uuid:='f5010000-0000-4000-8000-000000000052';
  session_other uuid:='f5010000-0000-4000-8000-000000000053';
  tx_a uuid:='f5010000-0000-4000-8000-000000000061';
  tx_b uuid:='f5010000-0000-4000-8000-000000000062';
  tx_other uuid:='f5010000-0000-4000-8000-000000000063';
  tx_general uuid:='f5010000-0000-4000-8000-000000000064';
  tx_cash_revenue uuid:='f5010000-0000-4000-8000-000000000065';
  tx_cash_expense uuid:='f5010000-0000-4000-8000-000000000066';
  tx_cash_purchase uuid:='f5010000-0000-4000-8000-000000000067';
  returning_id uuid:='f5010000-0000-4000-8000-000000000068';
  returned_id uuid;
  supplier_a uuid:='f5010000-0000-4000-8000-000000000071';
  purchase_a uuid:='f5010000-0000-4000-8000-000000000072';
  purchase_order_a uuid:='f5010000-0000-4000-8000-000000000073';
  tx_structural_purchase uuid:='f5010000-0000-4000-8000-000000000074';
  linked_transaction uuid;
  cash_context record;
  scenario record;
  pdv_count integer;
  general_count integer;
  cash_linked_count integer;
BEGIN
  -- Montagem administrativa separada do comportamento sob role authenticated.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,
    email_change_token_new,recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000',fixture.id,'authenticated','authenticated',
    fixture.email,'',now(),'{}','{}',now(),now(),'','','',''
  FROM (VALUES
    (owner_a,'financial-role-owner-a@example.invalid'),
    (owner_b,'financial-role-owner-b@example.invalid'),
    (manager_a,'financial-role-manager@example.invalid'),
    (technician_a,'financial-role-tech@example.invalid'),
    (nominal_a,'financial-role-nominal@example.invalid'),
    (inactive_a,'financial-role-inactive@example.invalid'),
    (other_tenant,'financial-role-other@example.invalid'),
    (admin_a,'financial-role-admin@example.invalid')
  ) fixture(id,email);
  INSERT INTO public.subscription_plans(code,name,included_modules)
  VALUES('qa-financial-role-no-pdv','Plano ficticio de isolamento','["basic"]');
  INSERT INTO public.companies(id,name,subscription_status,subscription_plan)
  VALUES(company_a,'Financeiro ficticio A','active','qa-financial-role-no-pdv'),
        (company_b,'Financeiro ficticio B','active','qa-financial-role-no-pdv');
  UPDATE public.profiles SET company_id=company_a,is_active=true
   WHERE user_id IN(owner_a,owner_b,manager_a,technician_a,nominal_a,inactive_a,admin_a);
  UPDATE public.profiles SET company_id=company_b,is_active=true WHERE user_id=other_tenant;
  UPDATE public.profiles SET is_active=false WHERE user_id=inactive_a;
  INSERT INTO public.user_roles(user_id,role) VALUES
    (owner_a,'tecnico'),(owner_b,'comercial'),(manager_a,'gestor'),(technician_a,'tecnico'),
    (nominal_a,'comercial'),(inactive_a,'comercial'),(other_tenant,'tecnico'),(admin_a,'admin');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (owner_a,'["screen:pdv"]',true),(owner_b,'["screen:pdv"]',true),
    (manager_a,'["screen:pdv","screen:finance"]',true),(technician_a,'["screen:pdv"]',true),
    (nominal_a,'["screen:pdv","fn:operate_other_pdv_cash"]',true),
    (inactive_a,'["screen:pdv","fn:operate_other_pdv_cash"]',true),
    (other_tenant,'["screen:pdv"]',true),(admin_a,'["screen:pdv","screen:finance"]',true);
  INSERT INTO public.company_modules(company_id,module_code)
  VALUES(company_a,'pdv'),(company_b,'pdv');
  INSERT INTO public.stocks(id,company_id,name,purpose,is_default)
  VALUES(stock_a,company_a,'Local financeiro A','pdv',false),
        (stock_b,company_b,'Local financeiro B','pdv',false);
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
  VALUES(account_a,company_a,'Cofre financeiro A','caixa',0,true),
        (account_b,company_b,'Cofre financeiro B','caixa',0,true);
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active)
  VALUES(terminal_a,company_a,'Caixa financeiro A',stock_a,true),
        (terminal_b,company_a,'Caixa financeiro B',stock_a,true),
        (terminal_other,company_b,'Caixa outro tenant',stock_b,true);
  INSERT INTO public.pdv_cash_sessions(id,company_id,terminal_id,opened_by,opening_amount,status,
    cash_account_id,cash_account_name_snapshot,cash_policy_snapshot,contract_version)
  VALUES(session_a,company_a,terminal_a,owner_a,0,'aberta',account_a,'Cofre A','{}',2),
        (session_b,company_a,terminal_b,owner_b,0,'aberta',account_a,'Cofre A','{}',2),
        (session_other,company_b,terminal_other,other_tenant,0,'aberta',account_b,'Cofre B','{}',2);
  INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,
    transaction_date,is_paid,origin,pdv_cash_session_id)
  VALUES(tx_a,company_a,'entrada','Evento ficticio Caixa A',10,current_date,true,'pdv',session_a),
        (tx_b,company_a,'entrada','Evento ficticio Caixa B',20,current_date,true,'pdv',session_b),
        (tx_other,company_b,'entrada','Evento ficticio outro tenant',30,current_date,true,'pdv',session_other),
        (tx_general,company_a,'entrada','Financeiro geral ficticio',40,current_date,true,'geral',NULL),
        (tx_cash_revenue,company_a,'entrada','Receita geral vinculada ao caixa',50,current_date,true,'geral',session_a),
        (tx_cash_expense,company_a,'saida','Despesa geral vinculada ao caixa',60,current_date,true,'geral',session_a),
        (tx_cash_purchase,company_a,'saida','Compra geral vinculada ao caixa',70,current_date,true,'geral',session_a);
  -- Formato CP01: financeiro geral sem session; a custodia esta somente na compra.
  INSERT INTO public.suppliers(id,company_id,name)
  VALUES(supplier_a,company_a,'Fornecedor ficticio da coorte');
  INSERT INTO public.compras(id,company_id,title,status,flow_type,client_request_id,request_hash,
    purchase_date,cash_session_id,terminal_id,created_by)
  VALUES(purchase_a,company_a,'Compra estrutural ficticia','concluida','compra_direta',
    'f5010000-0000-4000-8000-000000000075',repeat('a',64),current_date,session_a,terminal_a,owner_a);
  INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,
    transaction_date,due_date,is_paid,origin,pdv_cash_session_id,supplier_id)
  VALUES(tx_structural_purchase,company_a,'saida','Obrigacao da compra estrutural',80,
    current_date,current_date+7,false,'geral',NULL,supplier_a);
  INSERT INTO public.compra_ordens(id,company_id,compra_id,supplier_id,status,financial_transaction_id,created_by)
  VALUES(purchase_order_a,company_a,purchase_a,supplier_a,'enviada',tx_structural_purchase,owner_a);

  FOR scenario IN SELECT * FROM (VALUES
      (manager_a,0,1,0,'gestor sem nominal'),
      (owner_a,1,0,4,'owner tecnico'),(owner_b,1,0,0,'owner comercial'),
      (technician_a,0,0,0,'tecnico sem custodia'),
      (nominal_a,2,1,4,'nominal ativo'),(inactive_a,0,0,0,'perfil inativo'),
      (other_tenant,0,0,0,'outro tenant'),(admin_a,0,1,0,'admin sem nominal')
    ) cases(actor,pdv_expected,general_expected,cash_linked_expected,label)
  LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',scenario.actor,'role','authenticated')::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT count(*) INTO pdv_count FROM public.financial_transactions WHERE id IN(tx_a,tx_b);
    SELECT count(*) INTO general_count FROM public.financial_transactions WHERE id=tx_general;
    SELECT count(*) INTO cash_linked_count FROM public.financial_transactions
     WHERE id IN(tx_cash_revenue,tx_cash_expense,tx_cash_purchase,tx_structural_purchase);
    IF pdv_count<>scenario.pdv_expected OR general_count<>scenario.general_expected
       OR cash_linked_count<>scenario.cash_linked_expected THEN
      RAISE EXCEPTION 'RLS financeira divergente [%]: PDV %/%; geral %/%; caixa_geral %/%',
        scenario.label,pdv_count,scenario.pdv_expected,general_count,scenario.general_expected,
        cash_linked_count,scenario.cash_linked_expected;
    END IF;
    IF scenario.actor=other_tenant AND NOT EXISTS(
      SELECT 1 FROM public.financial_transactions WHERE id=tx_other
    ) THEN RAISE EXCEPTION 'owner do outro tenant perdeu o proprio caixa'; END IF;
    IF scenario.actor<>other_tenant AND EXISTS(
      SELECT 1 FROM public.financial_transactions WHERE id=tx_other
    ) THEN RAISE EXCEPTION 'perfil leu outro tenant [%]',scenario.label; END IF;
    EXECUTE 'RESET ROLE';
    -- O helper legado owner-only precisa concordar com a policy publica.
    IF public.pdv_can_read_financial_transaction_v3(scenario.actor,company_a,tx_a)
         IS DISTINCT FROM (scenario.actor IN(owner_a,nominal_a)) THEN
      RAISE EXCEPTION 'helper legado divergiu da custodia [%]',scenario.label;
    END IF;
    FOREACH linked_transaction IN ARRAY ARRAY[tx_cash_revenue,tx_cash_expense,tx_cash_purchase,tx_structural_purchase] LOOP
      IF public.pdv_can_read_financial_transaction_v3(scenario.actor,company_a,linked_transaction)
           IS DISTINCT FROM (scenario.actor IN(owner_a,nominal_a)) THEN
        RAISE EXCEPTION 'helper legado ignorou vinculo de caixa com origem geral [%]',scenario.label;
      END IF;
    END LOOP;
  END LOOP;

  SELECT * INTO cash_context FROM public.pdv_resolve_financial_cash_context_internal_v5(
    company_a,tx_structural_purchase,'geral',NULL);
  IF cash_context.is_cash_bound IS DISTINCT FROM true
     OR cash_context.context_valid IS DISTINCT FROM true
     OR cash_context.cash_session_id IS DISTINCT FROM session_a THEN
    RAISE EXCEPTION 'compra estrutural nao resolveu a custodia canonica';
  END IF;
  SELECT * INTO cash_context FROM public.pdv_resolve_financial_cash_context_internal_v5(
    company_b,tx_structural_purchase,'geral',NULL);
  IF cash_context.context_valid IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'resolver aceitou compra/OC de empresa divergente';
  END IF;
  SELECT * INTO cash_context FROM public.pdv_resolve_financial_cash_context_internal_v5(
    company_a,tx_structural_purchase,'geral',session_b);
  IF cash_context.context_valid IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'resolver aceitou abertura da linha divergente da compra';
  END IF;

  -- Fluxo geral legitimo continua inserindo e recebendo sua linha antes de existir OC.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_a,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,
    transaction_date,is_paid,origin)
  VALUES(returning_id,company_a,'entrada','Geral sem vinculo com RETURNING',90,current_date,false,'geral')
  RETURNING id INTO returned_id;
  IF returned_id IS DISTINCT FROM returning_id THEN
    RAISE EXCEPTION 'INSERT RETURNING geral perdeu a propria linha sem vinculo de compra';
  END IF;
  EXECUTE 'RESET ROLE';

  -- Revogar concessao nominal tambem remove o acesso, sem mudar cargo ou caixa.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.user_permissions SET is_active=false WHERE user_id=nominal_a;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',nominal_a,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF EXISTS(SELECT 1 FROM public.financial_transactions
    WHERE id IN(tx_a,tx_b,tx_cash_revenue,tx_cash_expense,tx_cash_purchase,tx_structural_purchase)) THEN
    RAISE EXCEPTION 'concessao inativa abriu dados PDV entre caixas';
  END IF;
  EXECUTE 'RESET ROLE';

  -- Sem modulo PDV, nem o owner conserva dados do caixa; Financeiro geral permanece.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  DELETE FROM public.company_modules WHERE company_id=company_a AND module_code='pdv';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF EXISTS(SELECT 1 FROM public.financial_transactions
    WHERE id IN(tx_a,tx_b,tx_cash_revenue,tx_cash_expense,tx_cash_purchase,tx_structural_purchase)) THEN
    RAISE EXCEPTION 'owner leu dados PDV sem modulo ativo';
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_a,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF NOT EXISTS(SELECT 1 FROM public.financial_transactions WHERE id=tx_general) THEN
    RAISE EXCEPTION 'revogacao do PDV bloqueou Financeiro geral legitimo';
  END IF;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.companies SET subscription_status='inactive' WHERE id=company_a;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_a,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF EXISTS(SELECT 1 FROM public.financial_transactions
    WHERE id IN(tx_a,tx_b,tx_general,tx_cash_revenue,tx_cash_expense,tx_cash_purchase,tx_structural_purchase)) THEN
    RAISE EXCEPTION 'assinatura inativa preservou leitura financeira';
  END IF;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF EXISTS(SELECT 1 FROM public.financial_transactions
    WHERE id IN(tx_a,tx_b,tx_general,tx_other,tx_cash_revenue,tx_cash_expense,tx_cash_purchase,tx_structural_purchase)) THEN
    RAISE EXCEPTION 'sessao ausente leu fatos financeiros';
  END IF;
  EXECUTE 'RESET ROLE';
END
$behavior$;

DO $private_contract$
BEGIN
  IF has_function_privilege('anon','public.pdv_resolve_financial_cash_context_internal_v5(uuid,uuid,text,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.pdv_resolve_financial_cash_context_internal_v5(uuid,uuid,text,uuid)','EXECUTE')
     OR has_function_privilege('service_role','public.pdv_resolve_financial_cash_context_internal_v5(uuid,uuid,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'resolver interno de custodia ganhou acesso de API';
  END IF;
END
$private_contract$;
ROLLBACK;

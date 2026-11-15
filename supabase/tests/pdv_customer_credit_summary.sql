-- Fixture fictícia, somente transação revertida. Nenhum dado demo é usado.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $contract$
DECLARE f record;
BEGIN
  IF NOT has_function_privilege('authenticated','public.pdv_get_customer_credit_summary_v3(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.pdv_get_customer_credit_summary_v3(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.pdv_customer_credit_statement_v2(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.pdv_customer_credit_statement_v2(uuid)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.pdv_customer_credit_statement_v2(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'ACL do resumo/extrato de crédito está incorreta';
  END IF;
  SELECT * INTO f FROM pg_proc WHERE oid='public.pdv_get_customer_credit_summary_v3(uuid)'::regprocedure;
  IF NOT f.prosecdef OR f.provolatile<>'s'
     OR NOT ('search_path=pg_catalog, public'=ANY(f.proconfig))
     OR f.proargnames<>ARRAY['p_customer_id','credit_limit','debt']::text[] THEN
    RAISE EXCEPTION 'Contrato do resumo deve expor somente limite e dívida';
  END IF;
  -- Os três writers continuam capazes de invocar o helper como owner SD.
  FOR f IN SELECT p.* FROM pg_proc p WHERE p.oid IN (
    'public.pdv_complete_direct_sale_v2(uuid,uuid,uuid,uuid,jsonb,jsonb,text)'::regprocedure,
    'public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure,
    'public.pdv_cover_exchange_order_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text)'::regprocedure
  ) LOOP
    IF NOT f.prosecdef OR NOT has_function_privilege(f.proowner,
        'public.pdv_customer_credit_statement_v2(uuid)'::regprocedure,'EXECUTE') THEN
      RAISE EXCEPTION 'Writer legítimo perdeu acesso interno ao crédito';
    END IF;
  END LOOP;
END $contract$;

DO $behavior$
DECLARE
  c uuid:='f6120000-0000-4000-8000-000000000001'; other_c uuid:='f6120000-0000-4000-8000-000000000002';
  a uuid:='f6120000-0000-4000-8000-000000000011'; b uuid:='f6120000-0000-4000-8000-000000000012'; admin_u uuid:='f6120000-0000-4000-8000-000000000013';
  customer uuid:='f6120000-0000-4000-8000-000000000021'; foreign_customer uuid:='f6120000-0000-4000-8000-000000000022'; empty_customer uuid:='f6120000-0000-4000-8000-000000000023';
  stock uuid:='f6120000-0000-4000-8000-000000000031'; cash uuid:='f6120000-0000-4000-8000-000000000032'; bank uuid:='f6120000-0000-4000-8000-000000000033';
  terminal_a uuid:='f6120000-0000-4000-8000-000000000041'; terminal_b uuid:='f6120000-0000-4000-8000-000000000042'; material uuid:='f6120000-0000-4000-8000-000000000051';
  session_a uuid; session_b uuid; created_order_id uuid; receivable uuid; settlement uuid;
  result jsonb; summary jsonb; current_debt numeric; blocked boolean; actor uuid;
  permissions_a jsonb:='["screen:pdv","fn:complete_direct_sale","fn:approve_pdv_credit","fn:receive_pdv_receivable","fn:reverse_pdv_receivable","fn:use_bank_accounts"]';
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
    SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
    FROM (VALUES(a,'credit-a@example.invalid'),(b,'credit-b@example.invalid'),(admin_u,'credit-admin@example.invalid')) u(id,email);
  INSERT INTO public.subscription_plans(code,name,included_modules)
    VALUES('qa-credit-summary','Plano fictício crédito','["basic"]');
  INSERT INTO public.companies(id,name,subscription_status,subscription_plan)
    VALUES(c,'Crédito fictício A','active','qa-credit-summary'),(other_c,'Crédito fictício B','active','qa-credit-summary');
  UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(a,b,admin_u);
  INSERT INTO public.user_roles(user_id,role) VALUES(a,'comercial'),(b,'tecnico'),(admin_u,'admin');
  INSERT INTO public.user_permissions(user_id,permissions,is_active)
    VALUES(a,permissions_a,true),(b,'["screen:pdv","fn:cover_pdv_order"]',true),(admin_u,'[]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv');
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
    VALUES(cash,c,'Cofre fictício crédito','caixa',0,true),(bank,c,'Banco fictício crédito','banco',0,true);
  INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
    VALUES(c,'Crédito fictício','America/Sao_Paulo',cash,true,'simples')
    ON CONFLICT(company_id) DO UPDATE SET timezone=EXCLUDED.timezone,pdv_cash_account_id=cash,pdv_strict_cash_tracking=true,pdv_mode='simples';
  UPDATE public.stocks SET is_default=false WHERE company_id=c AND is_default IS TRUE;
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Local fictício crédito',true);
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active)
    VALUES(terminal_a,c,'Terminal A crédito',stock,true),(terminal_b,c,'Terminal B crédito',stock,true);
  INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price)
    VALUES(material,c,'CR-FICT-01','Material fictício crédito','un',2,10,80);
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present)
    VALUES(c,material,stock,2,true);
  INSERT INTO public.customers(id,company_id,name,credit_limit)
    VALUES(customer,c,'Cliente fictício crédito',200),(foreign_customer,other_c,'Outro tenant',1000),(empty_customer,c,'Sem limite',NULL);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  result:=public.pdv_open_cash_session_v2(terminal_a,cash,0,'credit-summary-open-a');
  session_a:=(result->>'session_id')::uuid;
  -- Writer real cria recebível 80 sem lançar dívida no ledger legado.
  result:=public.pdv_complete_direct_sale_v2(terminal_a,session_a,cash,customer,
    jsonb_build_array(jsonb_build_object('inventory_id',material,'stock_id',stock,'quantity',1,'unit_price',80)),
    jsonb_build_array(jsonb_build_object('method','fiado','amount',80,'due_date',public.company_today(c)+30)),
    'credit-summary-sale-80');
  created_order_id:=(result->>'order_id')::uuid;
  SELECT p.receivable_transaction_id INTO receivable FROM public.pdv_order_payments p
    WHERE p.order_id=created_order_id AND p.coverage_kind='receivable';
  IF receivable IS NULL OR (SELECT COALESCE(sum(l.amount),0) FROM public.customer_credit_ledger l WHERE l.customer_id=customer)<>0 THEN
    RAISE EXCEPTION 'Fixture não reproduz ledger 0 e recebível canônico 80';
  END IF;
  SELECT to_jsonb(s) INTO summary FROM public.pdv_get_customer_credit_summary_v3(customer) s;
  IF summary IS DISTINCT FROM '{"credit_limit":200,"debt":80}'::jsonb THEN
    RAISE EXCEPTION 'Resumo diverge do writer na venda de 80';
  END IF;

  -- Outra abertura do mesmo tenant vê só a decisão agregada, nunca o extrato.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
  result:=public.pdv_open_cash_session_v2(terminal_b,cash,0,'credit-summary-open-b');
  session_b:=(result->>'session_id')::uuid;
  IF session_b=session_a OR public.can_manage_system(b) THEN
    RAISE EXCEPTION 'Fixture de outro caixa exige operador restrito';
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT to_jsonb(s) INTO summary FROM public.pdv_get_customer_credit_summary_v3(customer) s;
  IF summary IS DISTINCT FROM '{"credit_limit":200,"debt":80}'::jsonb THEN
    RAISE EXCEPTION 'Decisão de crédito mudou ao trocar caixa';
  END IF;
  blocked:=false;
  BEGIN PERFORM * FROM public.pdv_customer_credit_statement_v2(customer);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Extrato com IDs de outros caixas exposto'; END IF;
  EXECUTE 'RESET ROLE';

  -- Baixa e estorno reais: o resumo segue exatamente as alocações do writer.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  result:=public.pdv_settle_receivables_v2(jsonb_build_array(jsonb_build_object('receivable_id',receivable,'amount',20)),
    'pix',bank,session_a,public.company_today(c),'Fixture crédito','credit-summary-settle-20');
  settlement:=(result->>'financial_transaction_id')::uuid;
  SELECT s.debt INTO current_debt FROM public.pdv_get_customer_credit_summary_v3(customer) s;
  IF current_debt<>60 THEN RAISE EXCEPTION 'Resumo não acompanhou baixa canônica'; END IF;
  PERFORM public.pdv_reverse_receivable_settlement_v2(settlement,bank,session_a,'Fixture de estorno de crédito','credit-summary-reverse-20');
  SELECT s.debt INTO current_debt FROM public.pdv_get_customer_credit_summary_v3(customer) s;
  IF current_debt<>80 THEN RAISE EXCEPTION 'Resumo não acompanhou estorno canônico'; END IF;
  INSERT INTO public.customer_credit_ledger(company_id,customer_id,kind,amount,created_by,notes)
    VALUES(c,customer,'ajuste',-100,a,'Crédito assinado fictício');
  SELECT s.debt INTO current_debt FROM public.pdv_get_customer_credit_summary_v3(customer) s;
  IF current_debt<>-20 THEN RAISE EXCEPTION 'Resumo truncou crédito negativo'; END IF;
  SELECT to_jsonb(s) INTO summary FROM public.pdv_get_customer_credit_summary_v3(empty_customer) s;
  IF summary IS DISTINCT FROM '{"credit_limit":null,"debt":0}'::jsonb THEN
    RAISE EXCEPTION 'Cliente sem limite/lançamentos não preservou null e zero legítimo';
  END IF;

  -- Cliente de outro tenant, inexistente ou excluído: mesma negativa sem dados.
  FOREACH actor IN ARRAY ARRAY[foreign_customer,'f6120000-0000-4000-8000-000000000099'::uuid] LOOP
    blocked:=false;
    BEGIN PERFORM * FROM public.pdv_get_customer_credit_summary_v3(actor);
    EXCEPTION WHEN no_data_found THEN blocked:=true; END;
    IF NOT blocked THEN RAISE EXCEPTION 'Resumo consultou cliente fora da empresa'; END IF;
  END LOOP;
  UPDATE public.customers SET is_deleted=true WHERE id=customer;
  blocked:=false;
  BEGIN PERFORM * FROM public.pdv_get_customer_credit_summary_v3(customer);
  EXCEPTION WHEN no_data_found THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Resumo consultou cliente excluído'; END IF;
  UPDATE public.customers SET is_deleted=false WHERE id=customer;

  -- Revogação imediata da ação, da tela, da permissão e do perfil no JWT antigo.
  UPDATE public.user_permissions SET permissions='["screen:pdv"]' WHERE user_id=a;
  blocked:=false;
  BEGIN PERFORM * FROM public.pdv_get_customer_credit_summary_v3(customer);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Resumo aceitou ação revogada'; END IF;
  UPDATE public.user_permissions SET permissions='["fn:complete_direct_sale"]' WHERE user_id=a;
  blocked:=false;
  BEGIN PERFORM * FROM public.pdv_get_customer_credit_summary_v3(customer);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Resumo aceitou tela revogada'; END IF;
  UPDATE public.user_permissions SET permissions='["screen:pdv","fn:manage_settings"]' WHERE user_id=a;
  IF NOT public.can_manage_system(a) THEN RAISE EXCEPTION 'Fixture deve ter administração de configurações'; END IF;
  blocked:=false;
  BEGIN PERFORM * FROM public.pdv_get_customer_credit_summary_v3(customer);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'can_manage_system concedeu resumo sem capacidade de caixa'; END IF;
  UPDATE public.user_permissions SET permissions=permissions_a,is_active=false WHERE user_id=a;
  blocked:=false;
  BEGIN PERFORM * FROM public.pdv_get_customer_credit_summary_v3(customer);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Resumo aceitou permissão inativa'; END IF;
  UPDATE public.user_permissions SET is_active=true WHERE user_id=a;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.profiles SET is_active=false WHERE user_id=a;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  blocked:=false;
  BEGIN PERFORM * FROM public.pdv_get_customer_credit_summary_v3(customer);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Resumo aceitou perfil inativo no JWT antigo'; END IF;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  UPDATE public.profiles SET is_active=true WHERE user_id=a;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);

  DELETE FROM public.company_modules WHERE company_id=c AND module_code='pdv';
  blocked:=false;
  BEGIN PERFORM * FROM public.pdv_get_customer_credit_summary_v3(customer);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Resumo aceitou módulo ausente'; END IF;
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv');
  UPDATE public.companies SET subscription_status='inactive' WHERE id=c;
  blocked:=false;
  BEGIN PERFORM * FROM public.pdv_get_customer_credit_summary_v3(customer);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Resumo aceitou assinatura inativa'; END IF;
  UPDATE public.companies SET subscription_status='active' WHERE id=c;

  -- Administração legítima, sem herdar can_manage_system como ação de caixa.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_u,'role','authenticated')::text,true);
  SELECT s.debt INTO current_debt FROM public.pdv_get_customer_credit_summary_v3(customer) s;
  IF current_debt<>-20 THEN RAISE EXCEPTION 'Admin legítimo perdeu resumo'; END IF;
  UPDATE public.user_permissions SET is_active=false WHERE user_id=admin_u;
  blocked:=false;
  BEGIN PERFORM * FROM public.pdv_get_customer_credit_summary_v3(customer);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Admin com permissão inativa consultou crédito'; END IF;

  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
  blocked:=false;
  BEGIN PERFORM * FROM public.pdv_get_customer_credit_summary_v3(customer);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Resumo aceitou JWT sem usuário'; END IF;
END $behavior$;
ROLLBACK;

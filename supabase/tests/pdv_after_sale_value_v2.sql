-- Smoke W5-02: voucher, refund e troca sem dupla compensacao.
-- Executar depois de supabase db reset.
BEGIN;

DO $contract$
DECLARE v_fn text; v_src text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_issue_return_voucher_v2(uuid,numeric,date,text)',
    'public.pdv_request_return_refund_v2(uuid,uuid,numeric,text,uuid,uuid,text)',
    'public.pdv_confirm_return_refund_v2(uuid,uuid,text)',
    'public.pdv_reverse_return_refund_v2(uuid,text,text)',
    'public.pdv_reverse_return_voucher_v2(uuid,text,text)',
    'public.pdv_cover_exchange_order_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text)',
    'public.pdv_get_after_sale_context_v2(uuid)'
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE')
       OR NOT has_function_privilege('authenticated',v_fn,'EXECUTE') THEN
      RAISE EXCEPTION 'ACL pública incorreta em %',v_fn; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_proc procedure WHERE procedure.oid=v_fn::regprocedure
      AND procedure.prosecdef AND ('search_path=pg_catalog, public'=ANY(procedure.proconfig)
        OR 'search_path=pg_catalog, public, extensions'=ANY(procedure.proconfig))) THEN
      RAISE EXCEPTION 'RPC sem SECURITY DEFINER/search_path em %',v_fn; END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_after_sale_v2_enabled_internal(uuid)',
    'public.pdv_after_sale_context_v2(text)',
    'public.pdv_guard_after_sale_append_only_v2()',
    'public.pdv_guard_after_sale_relationship_v2()',
    'public.pdv_voucher_balance_internal_v2(uuid)',
    'public.pdv_free_return_value_internal_v2(uuid,uuid,uuid,numeric,text)',
    'public.pdv_settle_refund_internal_v2(uuid,uuid,uuid,uuid,uuid,uuid)'
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE')
      OR has_function_privilege('authenticated',v_fn,'EXECUTE')
      OR has_function_privilege('service_role',v_fn,'EXECUTE') THEN
      RAISE EXCEPTION 'helper owner-only exposto em %',v_fn; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM (VALUES('pdv_return_value_events'),('pdv_vouchers'),('pdv_voucher_entries'),
      ('pdv_refunds'),('pdv_refund_events'),('pdv_exchanges'),('pdv_exchange_value_applications')) names(name)
    WHERE NOT EXISTS(SELECT 1 FROM pg_class table_row JOIN pg_namespace namespace ON namespace.oid=table_row.relnamespace
      WHERE namespace.nspname='public' AND table_row.relname=names.name
        AND table_row.relrowsecurity AND table_row.relforcerowsecurity)) THEN
    RAISE EXCEPTION 'livro W5-02 sem FORCE RLS'; END IF;
  IF has_table_privilege('authenticated','public.pdv_vouchers','SELECT')
    OR has_table_privilege('service_role','public.pdv_refund_events','INSERT') THEN
    RAISE EXCEPTION 'livro W5-02 exposto diretamente'; END IF;
  IF (SELECT enabled FROM public.app_feature_flags WHERE key='pdv_after_sale_value_v2') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'rollout W5-02 não nasceu fechado'; END IF;
  SELECT pg_get_functiondef('public.seed_system_financial_categories()'::regprocedure) INTO v_src;
  IF position('Reembolso de venda do PDV' in v_src)=0 OR position('Estorno de reembolso do PDV' in v_src)=0 THEN
    RAISE EXCEPTION 'seed financeiro futuro não inclui categorias DFC-only'; END IF;
  SELECT pg_get_functiondef('public.pdv_financial_projection_rows_v2(uuid)'::regprocedure) INTO v_src;
  IF position('pdv_refund_reversal' in v_src)=0 THEN RAISE EXCEPTION 'DFC não inclui estorno de refund'; END IF;
  SELECT pg_get_functiondef('public.pdv_cover_exchange_order_v2(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text)'::regprocedure) INTO v_src;
  IF position('pdv_claim_operation_request' in v_src)>=position('v_order.status' in v_src) THEN
    RAISE EXCEPTION 'troca valida estado mutável antes do claim/replay'; END IF;
  IF position('ORDER BY customer.id FOR UPDATE' in v_src)=0
    OR position('ORDER BY customer.id FOR UPDATE' in v_src)>=position('pdv_party_available_credit_v2' in v_src)
    OR position('ORDER BY customer.id FOR UPDATE' in v_src)>=position('pdv_customer_credit_statement_v2' in v_src) THEN
    RAISE EXCEPTION 'troca lê saldo/fiado antes do lock canônico do cliente'; END IF;
  SELECT pg_get_functiondef('public.reset_system_step(uuid,text,uuid)'::regprocedure) INTO v_src;
  IF position('PDV_AFTER_SALE_VALUE_RESET_V2' in v_src)=0 THEN RAISE EXCEPTION 'reset não limpa W5-02'; END IF;
  IF position('DELETE FROM public.pdv_order_payments WHERE company_id=p_company_id' in v_src)=0
    OR position('DELETE FROM public.pdv_order_payments WHERE company_id=p_company_id' in v_src)
      >=position('DELETE FROM public.pdv_voucher_entries WHERE company_id=p_company_id' in v_src) THEN
    RAISE EXCEPTION 'reset não solta pagamentos antes do livro de voucher'; END IF;
  SELECT pg_get_functiondef('public.admin_delete_company(uuid)'::regprocedure) INTO v_src;
  IF position('PDV_AFTER_SALE_VALUE_ADMIN_DELETE_V2' in v_src)=0 THEN RAISE EXCEPTION 'admin delete não limpa W5-02'; END IF;
END $contract$;

DO $behavior$
DECLARE
  ca uuid:='b1410000-0000-4000-8000-000000000001'; cb uuid:='b1410000-0000-4000-8000-000000000002';
  ua uuid:='b1410000-0000-4000-8000-000000000011'; ub uuid:='b1410000-0000-4000-8000-000000000012';
  uc uuid:='b1410000-0000-4000-8000-000000000013';
  customer_a uuid:='b1410000-0000-4000-8000-000000000021'; customer_b uuid:='b1410000-0000-4000-8000-000000000022';
  cash_account uuid:='b1410000-0000-4000-8000-000000000031'; bank_account uuid:='b1410000-0000-4000-8000-000000000032';
  stock_a uuid:='b1410000-0000-4000-8000-000000000033';
  terminal uuid:='b1410000-0000-4000-8000-000000000041'; original_order uuid:='b1410000-0000-4000-8000-000000000051';
  new_order uuid:='b1410000-0000-4000-8000-000000000052'; cash_payment uuid:='b1410000-0000-4000-8000-000000000061';
  pix_payment uuid:='b1410000-0000-4000-8000-000000000062'; return_id uuid:='b1410000-0000-4000-8000-000000000071';
  card_open_payment uuid:='b1410000-0000-4000-8000-000000000063';
  card_settled_payment uuid:='b1410000-0000-4000-8000-000000000064';
  cash_test_order uuid:='b1410000-0000-4000-8000-000000000053';
  credit_race_order uuid:='b1410000-0000-4000-8000-000000000054';
  return_request uuid:='b1410000-0000-4000-8000-000000000072'; disposition_credit uuid;
  session_id uuid; voucher_id uuid; cash_refund uuid; pix_refund uuid; result jsonb; replay jsonb; context jsonb;
  blocked boolean; detail text; financial_before integer; dfc numeric; original_status text;
  facts_before integer; audit_id uuid:='b1410000-0000-4000-8000-000000000099'; card_refund uuid;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  VALUES
    ('00000000-0000-0000-0000-000000000000',ua,'authenticated','authenticated','w502-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',ub,'authenticated','authenticated','w502-b@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',uc,'authenticated','authenticated','w502-c@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(ca,'W5-02 Empresa A','active'),(cb,'W5-02 Empresa B','active');
  UPDATE public.profiles SET company_id=ca,is_active=true WHERE user_id=ua;
  UPDATE public.profiles SET company_id=cb,is_active=true WHERE user_id=ub;
  UPDATE public.profiles SET company_id=ca,is_active=true WHERE user_id=uc;
  INSERT INTO public.user_roles(user_id,role) VALUES(ua,'comercial'),(ub,'comercial'),(uc,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (ua,'["screen:pdv","screen:pdv_orders","fn:view_pdv_after_sale","fn:issue_pdv_voucher","fn:refund_pdv_return","fn:confirm_pdv_refund","fn:reverse_pdv_refund","fn:reverse_pdv_after_sale","fn:cover_pdv_exchange","fn:approve_pdv_credit"]',true),
    (ub,'["screen:pdv","screen:pdv_orders","fn:view_pdv_after_sale","fn:issue_pdv_voucher"]',true),
    (uc,'["screen:pdv","screen:pdv_orders","fn:cover_pdv_exchange"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(ca,'pdv'),(cb,'pdv');
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES
    (cash_account,ca,'Cofre W5-02','caixa',500,true),(bank_account,ca,'Banco W5-02','banco',0,true);
  INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
  VALUES(ca,'W5-02 Empresa A','America/Sao_Paulo',cash_account,true,'balcao'),
    (cb,'W5-02 Empresa B','America/Sao_Paulo',NULL,true,'simples');
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock_a,ca,'Estoque W5-02',true);
  INSERT INTO public.pdv_terminals(id,company_id,name,is_active,stock_id) VALUES(terminal,ca,'Caixa W5-02',true,stock_a);
  INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted) VALUES
    (customer_a,ca,'Cliente W5-02',500,false),(customer_b,cb,'Cliente externo',500,false);
  UPDATE public.app_feature_flags SET company_allowlist=ARRAY[ca,cb]::uuid[]
   WHERE key IN('pdv_returns_v2','pdv_party_accounts_v2','pdv_after_sale_value_v2');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  result:=public.pdv_open_cash_session_v2(terminal,cash_account,200,'w502-open-cash-0001');
  session_id:=(result->>'session_id')::uuid;

  INSERT INTO public.pdv_orders(id,company_id,number,customer_id,stock_id,status,subtotal,total,client_request_id)
  VALUES(original_order,ca,1410001,customer_a,stock_a,'entregue',100,100,'w502-original-order-0001'),
    (new_order,ca,1410002,customer_a,stock_a,'aguardando_pagamento',70,70,'w502-new-order-0001'),
    (cash_test_order,ca,1410003,customer_a,stock_a,'aguardando_pagamento',1,1,'w502-cash-test-order-0001'),
    (credit_race_order,ca,1410004,customer_a,stock_a,'aguardando_pagamento',1000,1000,'w502-credit-race-order-0001');
  INSERT INTO public.pdv_order_payments(id,company_id,order_id,method,amount,change_amount,financial_account_id,
    contract_version,coverage_kind,coverage_status,settlement_status,authorized_at,settled_at,created_by)
  VALUES(cash_payment,ca,original_order,'dinheiro',100,0,cash_account,2,'cash','authorized','settled',now(),now(),ua),
    (pix_payment,ca,original_order,'pix',50,0,bank_account,2,'pix','authorized','settled',now(),now(),ua),
    (card_open_payment,ca,original_order,'credito',10,0,NULL,2,'card_authorization','authorized','open',now(),NULL,ua),
    (card_settled_payment,ca,original_order,'credito',10,0,bank_account,2,'card_authorization','authorized','settled',now(),now(),ua);
  SELECT request_id INTO return_request FROM public.pdv_claim_operation_request(ca,'commercial.return.v2',
    'w502-return-fixture-0001',jsonb_build_object('fixture',true));
  INSERT INTO public.pdv_commercial_returns(id,company_id,order_id,customer_id,event_kind,occurred_on,reason,
    commercial_total,cmv_total,operation_request_id,created_by)
  VALUES(return_id,ca,original_order,customer_a,'return',public.company_today(ca),'Fixture W5-02',-100,-60,return_request,ua);
  disposition_credit:=public.pdv_return_credit_entry_internal_v2(ca,customer_a,return_id,'credit',100,
    public.company_today(ca),'Crédito inicial da devolução',NULL,NULL,'w502-return-credit-0001');
  INSERT INTO public.pdv_return_dispositions(company_id,commercial_return_id,disposition_kind,amount,credit_entry_id)
  VALUES(ca,return_id,'customer_credit',100,disposition_credit);

  -- Pagamento v2 meramente autorizado/open não é dinheiro devolvível. A
  -- rejeição ocorre antes do claim e deixa zero fatos.
  SELECT count(*) INTO facts_before FROM public.pdv_refunds WHERE company_id=ca;
  blocked:=false;
  BEGIN PERFORM public.pdv_request_return_refund_v2(return_id,card_open_payment,1,'Cartão ainda aberto',
    bank_account,NULL,'w502-refund-card-open-0001');
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked OR (SELECT count(*) FROM public.pdv_refunds WHERE company_id=ca)<>facts_before
    OR EXISTS(SELECT 1 FROM public.pdv_operation_requests request
      WHERE request.company_id=ca AND request.operation_type='after_sale.refund.request.v2'
        AND request.idempotency_key='w502-refund-card-open-0001') THEN
    RAISE EXCEPTION 'cartão open foi aceito ou deixou fato parcial'; END IF;

  -- Especiais são rejeitados antes de round/claim e não deixam troca parcial.
  SELECT count(*) INTO facts_before FROM public.pdv_exchanges WHERE company_id=ca;
  blocked:=false;
  BEGIN PERFORM public.pdv_cover_exchange_order_v2(return_id,cash_test_order,NULL,'NaN'::numeric,0,
    'dinheiro',cash_account,session_id,'w502-exchange-nan-0001');
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
  IF NOT blocked OR (SELECT count(*) FROM public.pdv_exchanges WHERE company_id=ca)<>facts_before THEN
    RAISE EXCEPTION 'NaN gerou fato de troca'; END IF;
  blocked:=false;
  BEGIN PERFORM public.pdv_cover_exchange_order_v2(return_id,cash_test_order,NULL,0,'Infinity'::numeric,
    'dinheiro',cash_account,session_id,'w502-exchange-infinity-0001');
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
  IF NOT blocked OR EXISTS(SELECT 1 FROM public.pdv_operation_requests request
    WHERE request.company_id=ca AND request.idempotency_key IN('w502-exchange-nan-0001','w502-exchange-infinity-0001')) THEN
    RAISE EXCEPTION 'valor especial deixou claim/fato parcial'; END IF;

  result:=public.pdv_issue_return_voucher_v2(return_id,40,public.company_today(ca)+30,'w502-voucher-issue-0001');
  voucher_id:=(result->>'voucher_id')::uuid;
  IF result->>'public_code' !~ '^DV-[A-Z0-9]{16}$' OR public.pdv_voucher_balance_internal_v2(voucher_id)<>40
    OR (SELECT sum(amount) FROM public.pdv_return_dispositions WHERE commercial_return_id=return_id)<>60 THEN
    RAISE EXCEPTION 'voucher não realocou crédito/gerou código/saldo corretamente: %',result; END IF;
  replay:=public.pdv_issue_return_voucher_v2(return_id,40,public.company_today(ca)+30,'w502-voucher-issue-0001');
  IF replay->>'idempotent'<>'true' OR replay->>'voucher_id'<>voucher_id::text THEN RAISE EXCEPTION 'retry duplicou voucher'; END IF;
  detail:=NULL;
  BEGIN PERFORM public.pdv_issue_return_voucher_v2(return_id,41,public.company_today(ca)+30,'w502-voucher-issue-0001');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; END;
  IF detail IS NULL THEN RAISE EXCEPTION 'mesma chave aceitou payload diferente'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ub,'role','authenticated')::text,true);
  blocked:=false;
  BEGIN PERFORM public.pdv_issue_return_voucher_v2(return_id,1,NULL,'w502-cross-tenant-0001');
  EXCEPTION WHEN no_data_found THEN blocked:=true; WHEN OTHERS THEN blocked:=SQLSTATE IN('P0002','42501'); END;
  IF NOT blocked THEN RAISE EXCEPTION 'tenant B acessou devolução do tenant A'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);

  result:=public.pdv_request_return_refund_v2(return_id,cash_payment,30,'Devolução em dinheiro',
    cash_account,session_id,'w502-refund-cash-0001'); cash_refund:=(result->>'refund_id')::uuid;
  IF result->>'status'<>'settled' OR NOT EXISTS(SELECT 1 FROM public.financial_transactions transaction
    WHERE transaction.pdv_settlement_group_id=cash_refund AND transaction.pdv_financial_role='pdv_refund'
      AND transaction.amount=30) OR (SELECT sum(amount) FROM public.pdv_return_dispositions
        WHERE commercial_return_id=return_id)<>30 THEN RAISE EXCEPTION 'refund dinheiro não liquidou/realocou'; END IF;
  replay:=public.pdv_request_return_refund_v2(return_id,cash_payment,30,'Devolução em dinheiro',
    cash_account,session_id,'w502-refund-cash-0001');
  IF replay->>'idempotent'<>'true' OR replay->>'refund_id'<>cash_refund::text THEN RAISE EXCEPTION 'retry duplicou refund'; END IF;
  result:=public.pdv_reverse_return_refund_v2(cash_refund,'Cliente desistiu do reembolso','w502-refund-cash-reverse-0001');
  IF result->>'status'<>'reversed' OR NOT EXISTS(SELECT 1 FROM public.financial_transactions transaction
    WHERE transaction.pdv_settlement_group_id=cash_refund AND transaction.pdv_financial_role='pdv_refund_reversal') THEN
    RAISE EXCEPTION 'estorno do refund não recompôs DFC/custódia'; END IF;

  SELECT count(*) INTO financial_before FROM public.financial_transactions WHERE company_id=ca;
  result:=public.pdv_request_return_refund_v2(return_id,pix_payment,20,'Reembolso Pix pendente',
    NULL,NULL,'w502-refund-pix-0001'); pix_refund:=(result->>'refund_id')::uuid;
  IF result->>'status'<>'pending' OR (SELECT count(*) FROM public.financial_transactions WHERE company_id=ca)<>financial_before THEN
    RAISE EXCEPTION 'refund Pix pendente movimentou dinheiro'; END IF;
  result:=public.pdv_confirm_return_refund_v2(pix_refund,bank_account,'E2E-W502-PIX-0001','w502-refund-pix-confirm-0001');
  IF result->>'status'<>'settled' THEN RAISE EXCEPTION 'confirmação Pix não liquidou'; END IF;
  PERFORM public.pdv_reverse_return_refund_v2(pix_refund,'Falha confirmada no provedor','w502-refund-pix-reverse-0001');

  -- O mesmo cartão, agora liquidado de verdade, pode originar refund pendente;
  -- confirmação e reversão continuam append-only.
  result:=public.pdv_request_return_refund_v2(return_id,card_settled_payment,5,'Cartão liquidado',
    NULL,NULL,'w502-refund-card-settled-0001'); card_refund:=(result->>'refund_id')::uuid;
  IF result->>'status'<>'pending' THEN RAISE EXCEPTION 'cartão settled não gerou refund pendente'; END IF;
  PERFORM public.pdv_confirm_return_refund_v2(card_refund,bank_account,'ACQ-W502-CARD-0001','w502-refund-card-confirm-0001');
  PERFORM public.pdv_reverse_return_refund_v2(card_refund,'Estorno de teste','w502-refund-card-reverse-0001');

  -- Operador B do mesmo tenant não usa a gaveta de A. A tentativa falha sem
  -- deixar claim, pagamento ou exchange parcial.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uc,'role','authenticated')::text,true);
  blocked:=false;
  BEGIN PERFORM public.pdv_cover_exchange_order_v2(return_id,cash_test_order,NULL,0,0,'dinheiro',
    cash_account,session_id,'w502-exchange-foreign-cash-0001');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked OR EXISTS(SELECT 1 FROM public.pdv_order_payments WHERE order_id=cash_test_order)
    OR EXISTS(SELECT 1 FROM public.pdv_operation_requests request
      WHERE request.company_id=ca AND request.idempotency_key='w502-exchange-foreign-cash-0001') THEN
    RAISE EXCEPTION 'operador B usou caixa de A ou deixou fato parcial'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);

  SELECT status INTO original_status FROM public.pdv_orders WHERE id=original_order;
  result:=public.pdv_cover_exchange_order_v2(return_id,new_order,voucher_id,20,10,'pix',bank_account,NULL,
    'w502-exchange-cover-0001');
  IF (result->>'difference_amount')::numeric<>40 OR public.pdv_voucher_balance_internal_v2(voucher_id)<>20
    OR (SELECT sum(amount) FROM public.pdv_order_payments WHERE order_id=new_order)<>70
    OR (SELECT status FROM public.pdv_orders WHERE id=new_order)<>'liberado_retirada'
    OR (SELECT status FROM public.pdv_orders WHERE id=original_order)<>original_status THEN
    RAISE EXCEPTION 'troca não fechou voucher/crédito/diferença ou alterou venda original: %',result; END IF;
  replay:=public.pdv_cover_exchange_order_v2(return_id,new_order,voucher_id,20,10,'pix',bank_account,NULL,
    'w502-exchange-cover-0001');
  IF replay->>'idempotent'<>'true' OR replay->>'exchange_id'<>result->>'exchange_id' THEN RAISE EXCEPTION 'retry duplicou troca'; END IF;
  -- Sob o lock do cliente, uma segunda troca enxerga o saldo já consumido.
  blocked:=false;
  BEGIN PERFORM public.pdv_cover_exchange_order_v2(return_id,credit_race_order,NULL,0,1000,NULL,NULL,NULL,
    'w502-exchange-credit-race-0001');
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked OR EXISTS(SELECT 1 FROM public.pdv_exchanges WHERE new_order_id=credit_race_order) THEN
    RAISE EXCEPTION 'segunda troca excedeu saldo após serialização do cliente'; END IF;
  context:=public.pdv_get_after_sale_context_v2(original_order);
  IF jsonb_array_length(context->'returns')<>1 OR context::text~'(cmv|unit_cost|cost_price|financial_transaction_id|account_id)' THEN
    RAISE EXCEPTION 'projeção vazou custo/conta ou omitiu histórico: %',context; END IF;
  SELECT round(sum(row.cash_flow),2) INTO dfc FROM public.pdv_financial_projection_rows_v2(ca) row
   WHERE row.projection_kind='dfc' AND row.source_type IN('pdv_refund','pdv_refund_reversal');
  IF COALESCE(dfc,0)<>0 THEN RAISE EXCEPTION 'refund e estorno não zeraram DFC: %',dfc; END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_financial_projection_rows_v2(ca) row
      WHERE row.projection_kind IN('dre_competence','dre_cash')
        AND row.source_type IN('pdv_refund','pdv_refund_reversal'))
    OR EXISTS(SELECT 1 FROM public.financial_transactions transaction
      LEFT JOIN public.financial_categories category ON category.company_id=transaction.company_id
        AND category.name=transaction.category
      WHERE transaction.company_id=ca AND transaction.pdv_financial_role IN('pdv_refund','pdv_refund_reversal')
        AND (category.dre_group IS DISTINCT FROM 'outros' OR category.is_system IS DISTINCT FROM true)) THEN
    RAISE EXCEPTION 'refund/reversão contaminou DRE ou perdeu classificação DFC-only'; END IF;
  blocked:=false;
  BEGIN PERFORM public.pdv_request_return_refund_v2(return_id,cash_payment,1000,'Acima do original',
    cash_account,session_id,'w502-refund-over-0001');
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'refund excedeu pagamento original'; END IF;

  INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(ca,stock_a,ua);
  UPDATE public.user_permissions SET permissions=
    '["screen:pdv","screen:pdv_orders","fn:view_pdv_after_sale","fn:issue_pdv_voucher","fn:refund_pdv_return"]'::jsonb
   WHERE user_id=uc;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uc,'role','authenticated')::text,true);
  blocked:=false;
  BEGIN PERFORM public.pdv_get_after_sale_context_v2(original_order);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'contexto pós-venda ignorou ACL same-tenant'; END IF;
  blocked:=false;
  BEGIN PERFORM public.pdv_issue_return_voucher_v2(return_id,1,NULL,'w502-restricted-voucher-0001');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'writer pós-venda ignorou ACL same-tenant'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);

  -- Smoke real do lifecycle: order_payments saem antes dos livros voucher e
  -- saldo; toda a cadeia W5-02 deve zerar no step PDV sob a GUC autorizada.
  INSERT INTO public.user_roles(user_id,role) VALUES(ua,'admin');
  PERFORM public.reset_system_step(ca,'pdv',audit_id);
  IF EXISTS(SELECT 1 FROM public.pdv_order_payments WHERE company_id=ca)
    OR EXISTS(SELECT 1 FROM public.pdv_voucher_entries WHERE company_id=ca)
    OR EXISTS(SELECT 1 FROM public.pdv_vouchers WHERE company_id=ca)
    OR EXISTS(SELECT 1 FROM public.pdv_refunds WHERE company_id=ca)
    OR EXISTS(SELECT 1 FROM public.pdv_exchanges WHERE company_id=ca)
    OR EXISTS(SELECT 1 FROM public.pdv_return_value_events WHERE company_id=ca) THEN
    RAISE EXCEPTION 'reset PDV deixou referências W5-02'; END IF;
END $behavior$;

ROLLBACK;

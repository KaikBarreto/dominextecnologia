-- W4-01/W4-02: contas e credito de cliente/fornecedor sem misturar divida.
BEGIN;

DO $contract$
DECLARE v_fn text; v_src text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='pdv_party_credit_entries'
      AND c.relrowsecurity AND c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'ledger de credito sem FORCE RLS';
  END IF;
  IF has_table_privilege('authenticated','public.pdv_party_credit_entries','SELECT')
     OR has_table_privilege('authenticated','public.pdv_party_credit_entries','INSERT')
     OR has_table_privilege('anon','public.pdv_party_credit_entries','SELECT') THEN
    RAISE EXCEPTION 'ledger exposto fora das RPCs';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_post_party_credit_v2(text,uuid,text,numeric,date,text,text)',
    'public.pdv_apply_party_credit_v2(text,uuid,uuid,numeric,date,text,text)',
    'public.pdv_reverse_party_credit_entry_v2(uuid,text,text)',
    'public.pdv_party_account_summary_v2(text,uuid)',
    'public.pdv_party_account_statement_v2(text,uuid,integer,integer)',
    'public.pdv_party_settle_receivables_v2(uuid,jsonb,text,uuid,uuid,date,text,text)',
    'public.pdv_party_reverse_receivable_settlement_v2(uuid,uuid,uuid,uuid,text,text)'
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE')
       OR NOT has_function_privilege('authenticated',v_fn,'EXECUTE') THEN
      RAISE EXCEPTION 'ACL pública incorreta em %',v_fn;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=v_fn::regprocedure
      AND p.prosecdef AND 'search_path=pg_catalog, public'=ANY(p.proconfig)) THEN
      RAISE EXCEPTION 'writer/projeção sem SECURITY DEFINER/search_path: %',v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_party_account_context_v2(boolean)',
    'public.pdv_party_accounts_v2_enabled_internal(uuid)',
    'public.pdv_assert_party_v2(uuid,text,uuid)',
    'public.pdv_party_available_credit_v2(uuid,text,uuid)',
    'public.pdv_party_obligation_open_v2(uuid)',
    'public.pdv_receivable_monetary_total_v2(uuid,uuid)',
    'public.pdv_receivable_received_total_v2(uuid,uuid)',
    'public.pdv_sync_party_receivable_payment_v2(uuid)',
    'public.pdv_recalc_receivable_after_allocation_v2()',
    'public.pdv_guard_receivable_financial_v2()',
    'public.pdv_guard_party_credit_entry_v2()',
    'public.pdv_recalc_after_party_credit_v2()'
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE')
       OR has_function_privilege('authenticated',v_fn,'EXECUTE')
       OR has_function_privilege('service_role',v_fn,'EXECUTE') THEN
      RAISE EXCEPTION 'helper owner-only exposto em %',v_fn;
    END IF;
  END LOOP;
  SELECT pg_get_functiondef('public.pdv_apply_party_credit_v2(text,uuid,uuid,numeric,date,text,text)'::regprocedure)
    INTO v_src;
  IF v_src LIKE '%INSERT INTO public.financial_transactions%'
     OR v_src LIKE '%pdv_cash_custody_entries%'
     OR v_src LIKE '%pdv_settlement_applications%' THEN
    RAISE EXCEPTION 'aplicação de crédito criou caixa/DRE/DFC';
  END IF;
  SELECT pg_get_functiondef('public.reset_system_step(uuid,text,uuid)'::regprocedure) INTO v_src;
  IF position('PDV_PARTY_ACCOUNT_PDV_RESET_V2' in v_src)=0
     OR position('PDV_PARTY_ACCOUNT_FINANCIAL_RESET_V2' in v_src)=0
     OR position('party.credit.reverse.v2' in v_src)=0 THEN
    RAISE EXCEPTION 'resets PDV/financeiro não limpam ledger e idempotência W4';
  END IF;
END $contract$;

DO $behavior$
DECLARE
  ca uuid:='b1380000-0000-4000-8000-000000000001';
  cb uuid:='b1380000-0000-4000-8000-000000000002';
  ua uuid:='b1380000-0000-4000-8000-000000000011';
  viewer uuid:='b1380000-0000-4000-8000-000000000012';
  denied uuid:='b1380000-0000-4000-8000-000000000013';
  ub uuid:='b1380000-0000-4000-8000-000000000014';
  customer_a uuid:='b1380000-0000-4000-8000-000000000021';
  customer_b uuid:='b1380000-0000-4000-8000-000000000022';
  supplier_a uuid:='b1380000-0000-4000-8000-000000000031';
  supplier_b uuid:='b1380000-0000-4000-8000-000000000032';
  recv_a uuid:='b1380000-0000-4000-8000-000000000041';
  pay_a uuid:='b1380000-0000-4000-8000-000000000042';
  recv_b uuid:='b1380000-0000-4000-8000-000000000043';
  recv_paid_a uuid:='b1380000-0000-4000-8000-000000000044';
  order_a uuid:='b1380000-0000-4000-8000-000000000045';
  bank_a uuid:='b1380000-0000-4000-8000-000000000046';
  legacy_credit uuid:='b1380000-0000-4000-8000-000000000051';
  legacy_debt uuid:='b1380000-0000-4000-8000-000000000052';
  result jsonb; replay jsonb; summary jsonb; statement jsonb;
  credit_entry uuid; app_entry uuid; adjust_entry uuid; supplier_credit uuid; supplier_app uuid;
  supplier_app_final uuid; settlement_id uuid;
  financial_before integer; custody_before integer; dre_before integer;
  dre_cash_before jsonb; dfc_before jsonb; competence_before jsonb;
  denied_state text; denied_detail text; n integer;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,
    email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',ua,'authenticated','authenticated','w4-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',viewer,'authenticated','authenticated','w4-view@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',denied,'authenticated','authenticated','w4-denied@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',ub,'authenticated','authenticated','w4-b@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES
    (ca,'W4 Empresa A','active'),(cb,'W4 Empresa B','active');
  UPDATE public.profiles SET company_id=ca,is_active=true WHERE user_id IN(ua,viewer,denied);
  UPDATE public.profiles SET company_id=cb,is_active=true WHERE user_id=ub;
  INSERT INTO public.user_roles(user_id,role) VALUES
    (ua,'comercial'),(viewer,'comercial'),(denied,'comercial'),(ub,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (ua,'["screen:customers","screen:pdv","fn:view_customer_financial","fn:manage_party_credit","fn:view_party_credit_limit","fn:receive_pdv_receivable","fn:reverse_pdv_receivable","fn:use_bank_accounts"]',true),
    (viewer,'["screen:customers","fn:view_customer_financial"]',true),
    (ub,'["screen:customers","fn:view_customer_financial","fn:manage_party_credit","fn:view_party_credit_limit"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES
    (ca,'basic'),(ca,'pdv'),(cb,'basic'),(cb,'pdv');
  IF (SELECT enabled FROM public.app_feature_flags WHERE key='pdv_party_accounts_v2') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'rollout W4 não nasceu fechado'; END IF;
  UPDATE public.app_feature_flags SET company_allowlist=ARRAY[ca]::uuid[]
   WHERE key='pdv_party_accounts_v2';
  INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted) VALUES
    (customer_a,ca,'Cliente A',200,false),(customer_b,cb,'Cliente B',300,false);
  INSERT INTO public.suppliers(id,company_id,name) VALUES
    (supplier_a,ca,'Fornecedor A'),(supplier_b,cb,'Fornecedor B');
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
  VALUES(bank_a,ca,'Banco W4','banco',0,true);
  INSERT INTO public.pdv_orders(id,company_id,number,customer_id,status,subtotal,total,client_request_id)
  VALUES(order_a,ca,1380001,customer_a,'pago',100,100,'w4-order-customer-0001');
  INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,
    transaction_date,due_date,is_paid,amount_received,customer_id,supplier_id,origin) VALUES
    (recv_a,ca,'entrada','Recebível A',100,public.company_today(ca),public.company_today(ca)+10,false,0,customer_a,NULL,'pdv'),
    (pay_a,ca,'saida','Conta fornecedor A',80,public.company_today(ca),public.company_today(ca)+5,false,10,NULL,supplier_a,'geral'),
    (recv_b,cb,'entrada','Recebível B',50,public.company_today(cb),public.company_today(cb)+10,false,0,customer_b,NULL,'pdv'),
    (recv_paid_a,ca,'entrada','Recebível já quitado',25,public.company_today(ca),public.company_today(ca),true,0,customer_a,NULL,'geral');
  INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,financial_transaction_id,
    contract_version,coverage_kind,coverage_status,settlement_status,
    receivable_transaction_id,authorized_at,created_by)
  VALUES(ca,order_a,'fiado',100,NULL,2,'receivable','authorized','open',recv_a,now(),ua);
  INSERT INTO public.customer_credit_ledger(id,company_id,customer_id,kind,amount,notes) VALUES
    (legacy_credit,ca,customer_a,'credito',-15,'Crédito legado'),
    (legacy_debt,ca,customer_a,'ajuste',7,'Dívida avulsa legada');
  SELECT count(*) INTO financial_before FROM public.financial_transactions WHERE company_id=ca;
  SELECT count(*) INTO custody_before FROM public.pdv_cash_custody_entries WHERE company_id=ca;
  SELECT count(*) INTO dre_before FROM public.pdv_settlement_applications WHERE company_id=ca;
  dre_cash_before:=public.pdv_financial_projection_page_v2(ca,'dre_cash',
    public.company_today(ca),public.company_today(ca),100,0);
  dfc_before:=public.pdv_financial_projection_page_v2(ca,'dfc',
    public.company_today(ca),public.company_today(ca),100,0);
  competence_before:=public.pdv_financial_projection_page_v2(ca,'dre_competence',
    public.company_today(ca),public.company_today(ca),100,0);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);

  summary:=public.pdv_party_account_summary_v2('customer',customer_a);
  IF (summary->>'open_amount')::numeric<>100 OR (summary->>'available_credit')::numeric<>8
     OR (summary->>'credit_limit')::numeric<>200 OR (summary->>'purchase_capacity')::numeric<>100 THEN
    RAISE EXCEPTION 'resumo inicial misturou dívida/crédito/limite: %',summary;
  END IF;
  IF public.pdv_party_available_credit_v2(ca,'customer',customer_a)<>8
     OR public.pdv_party_available_credit_v2(ca,'customer',customer_a)<>8 THEN
    RAISE EXCEPTION 'adaptador legado não é repetível'; END IF;
  IF summary::text ~ '(document|email|phone|cpf|cnpj)' THEN RAISE EXCEPTION 'resumo vazou dados pessoais'; END IF;
  denied_state:=NULL;
  BEGIN PERFORM public.pdv_post_party_credit_v2('customer',customer_a,'credit',0.001,
    public.company_today(ca),'Fração inválida','w4-credit-fraction-0001');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE; END;
  IF denied_state IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'fração de centavo foi aceita'; END IF;
  denied_state:=NULL;
  BEGIN PERFORM public.pdv_post_party_credit_v2('customer',customer_a,'credit',1,
    public.company_today(ca)+1,'Data futura','w4-credit-future-0001');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE; END;
  IF denied_state IS DISTINCT FROM '22023' THEN RAISE EXCEPTION 'data futura no fuso da empresa foi aceita'; END IF;

  result:=public.pdv_post_party_credit_v2('customer',customer_a,'credit',50,
    public.company_today(ca),'Crédito comercial','w4-credit-customer-0001');
  credit_entry:=(result->>'entry_id')::uuid;
  summary:=public.pdv_party_account_summary_v2('customer',customer_a);
  IF (summary->>'available_credit')::numeric<>58
     OR (summary->>'purchase_capacity')::numeric<>100
     OR (summary->>'open_amount')::numeric<>100 THEN
    RAISE EXCEPTION 'crédito disponível aumentou autorização de fiado: %',summary; END IF;
  replay:=public.pdv_post_party_credit_v2('customer',customer_a,'credit',50,
    public.company_today(ca),'Crédito comercial','w4-credit-customer-0001');
  IF replay->>'idempotent'<>'true' OR replay->>'entry_id'<>credit_entry::text THEN
    RAISE EXCEPTION 'replay do crédito duplicou/mudou recurso'; END IF;
  denied_detail:=NULL;
  BEGIN
    PERFORM public.pdv_post_party_credit_v2('customer',customer_a,'credit',51,
      public.company_today(ca),'Outro payload','w4-credit-customer-0001');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_detail=PG_EXCEPTION_DETAIL; END;
  IF denied_detail IS NULL THEN RAISE EXCEPTION 'mesma chave aceitou payload divergente'; END IF;

  result:=public.pdv_apply_party_credit_v2('customer',customer_a,recv_a,40,
    public.company_today(ca),'Aplicação parcial','w4-apply-customer-0001');
  app_entry:=(result->>'entry_id')::uuid;
  replay:=public.pdv_apply_party_credit_v2('customer',customer_a,recv_a,40,
    public.company_today(ca),'Aplicação parcial','w4-apply-customer-0001');
  IF replay->>'idempotent'<>'true' OR replay->>'entry_id'<>app_entry::text THEN
    RAISE EXCEPTION 'retry da aplicação duplicou/mudou recurso'; END IF;
  IF public.pdv_receivable_received_total_v2(recv_a)<>40
     OR (SELECT amount_received FROM public.financial_transactions WHERE id=recv_a)<>40
     OR (SELECT is_paid FROM public.financial_transactions WHERE id=recv_a) THEN
    RAISE EXCEPTION 'aplicação parcial não abateu obrigação corretamente'; END IF;
  summary:=public.pdv_party_account_summary_v2('customer',customer_a);
  IF (summary->>'open_amount')::numeric<>60 OR (summary->>'available_credit')::numeric<>18
     OR (summary->>'purchase_capacity')::numeric<>140 THEN
    RAISE EXCEPTION 'resumo parcial incorreto: %',summary; END IF;

  PERFORM public.pdv_post_party_credit_v2('customer',customer_a,'credit',100,
    public.company_today(ca),'Crédito adicional','w4-credit-customer-0002');
  PERFORM public.pdv_apply_party_credit_v2('customer',customer_a,recv_a,60,
    public.company_today(ca),'Aplicação final','w4-apply-customer-0002');
  IF (SELECT amount_received FROM public.financial_transactions WHERE id=recv_a)<>100
     OR (SELECT is_paid FROM public.financial_transactions WHERE id=recv_a)
     OR (SELECT paid_date FROM public.financial_transactions WHERE id=recv_a) IS NOT NULL
     OR public.pdv_receivable_monetary_total_v2(recv_a)<>0 THEN
    RAISE EXCEPTION 'crédito puro não fechou outstanding sem simular dinheiro'; END IF;
  IF (SELECT settlement_status FROM public.pdv_order_payments
       WHERE receivable_transaction_id=recv_a)<>'settled'
     OR (SELECT settled_at FROM public.pdv_order_payments
       WHERE receivable_transaction_id=recv_a) IS NULL
     OR (SELECT settlement_transaction_id FROM public.pdv_order_payments
       WHERE receivable_transaction_id=recv_a) IS NOT NULL THEN
    RAISE EXCEPTION 'quitação por crédito não reconciliou cobertura fiado'; END IF;
  IF public.pdv_financial_projection_page_v2(ca,'dre_cash',public.company_today(ca),
       public.company_today(ca),100,0) IS DISTINCT FROM dre_cash_before
     OR public.pdv_financial_projection_page_v2(ca,'dfc',public.company_today(ca),
       public.company_today(ca),100,0) IS DISTINCT FROM dfc_before
     OR public.pdv_financial_projection_page_v2(ca,'dre_competence',public.company_today(ca),
       public.company_today(ca),100,0) IS DISTINCT FROM competence_before THEN
    RAISE EXCEPTION 'quitação por crédito alterou projeções DRE/DFC'; END IF;
  IF (SELECT count(*) FROM public.financial_transactions WHERE company_id=ca)<>financial_before
     OR (SELECT count(*) FROM public.pdv_cash_custody_entries WHERE company_id=ca)<>custody_before
     OR (SELECT count(*) FROM public.pdv_settlement_applications WHERE company_id=ca)<>dre_before THEN
    RAISE EXCEPTION 'crédito puro criou fato de caixa/DRE/DFC'; END IF;
  PERFORM public.pdv_reverse_party_credit_entry_v2(
    (SELECT id FROM public.pdv_party_credit_entries WHERE target_financial_transaction_id=recv_a
      AND amount=-60), 'Estorno da aplicação final','w4-reverse-customer-0001');
  IF (SELECT amount_received FROM public.financial_transactions WHERE id=recv_a)<>40
     OR (SELECT is_paid FROM public.financial_transactions WHERE id=recv_a) THEN
    RAISE EXCEPTION 'estorno não reabriu recebível'; END IF;
  IF (SELECT settlement_status FROM public.pdv_order_payments
       WHERE receivable_transaction_id=recv_a)<>'partial'
     OR (SELECT settled_at FROM public.pdv_order_payments
       WHERE receivable_transaction_id=recv_a) IS NOT NULL
     OR (SELECT settlement_transaction_id FROM public.pdv_order_payments
       WHERE receivable_transaction_id=recv_a) IS NOT NULL THEN
    RAISE EXCEPTION 'estorno do crédito não reabriu cobertura fiado'; END IF;
  result:=public.pdv_post_party_credit_v2('customer',customer_a,'adjustment',-10,
    public.company_today(ca),'Correção de crédito','w4-adjust-customer-0001');
  adjust_entry:=(result->>'entry_id')::uuid;
  result:=public.pdv_reverse_party_credit_entry_v2(
    adjust_entry,'Desfazer correção','w4-reverse-adjust-0001');
  replay:=public.pdv_reverse_party_credit_entry_v2(
    adjust_entry,'Desfazer correção','w4-reverse-adjust-0001');
  IF replay->>'idempotent'<>'true' OR replay->>'entry_id'<>result->>'entry_id' THEN
    RAISE EXCEPTION 'retry do estorno não devolveu o mesmo recurso'; END IF;

  -- Fechamento misto: 60 de crédito + 40 monetários. A obrigação fecha pelo
  -- outstanding, mas os motores atuais de DRE-caixa/DFC enxergam somente 40.
  PERFORM public.pdv_apply_party_credit_v2('customer',customer_a,recv_a,20,
    public.company_today(ca),'Completar parte em crédito','w4-apply-customer-0003');
  result:=public.pdv_party_settle_receivables_v2(customer_a,
    jsonb_build_array(jsonb_build_object('receivable_id',recv_a,'amount',40)),
    'pix',bank_a,NULL,public.company_today(ca),'Parte monetária','w4-settle-mixed-0001');
  settlement_id:=(result->>'financial_transaction_id')::uuid;
  IF public.pdv_receivable_received_total_v2(recv_a)<>100
     OR public.pdv_receivable_monetary_total_v2(recv_a)<>40
     OR (SELECT amount_received FROM public.financial_transactions WHERE id=recv_a)<>100
     OR (SELECT is_paid FROM public.financial_transactions WHERE id=recv_a)
     OR (SELECT paid_date FROM public.financial_transactions WHERE id=recv_a) IS NOT NULL THEN
    RAISE EXCEPTION 'baixa mista não separou outstanding de liquidação monetária'; END IF;
  PERFORM public.recalc_amount_received(recv_a);
  IF (SELECT amount_received FROM public.financial_transactions WHERE id=recv_a)<>100
     OR (SELECT is_paid FROM public.financial_transactions WHERE id=recv_a)
     OR (SELECT paid_date FROM public.financial_transactions WHERE id=recv_a) IS NOT NULL THEN
    RAISE EXCEPTION 'recalc direto misturou crédito com liquidação monetária'; END IF;
  IF (SELECT COALESCE(sum(CASE WHEN transaction.transaction_type::text='entrada'
       THEN transaction.amount ELSE -transaction.amount END),0)
      FROM public.financial_transactions transaction
     WHERE transaction.id IN(recv_a,settlement_id)
       AND transaction.is_paid IS TRUE AND transaction.paid_date IS NOT NULL)<>40 THEN
    RAISE EXCEPTION 'motores produtivos DRE-caixa/DFC não preservaram somente 40 monetários'; END IF;
  IF (SELECT COALESCE(sum(projection.revenue),0)
      FROM public.pdv_financial_projection_rows_v2(ca) projection
     WHERE projection.projection_kind='dre_competence' AND projection.event_id=recv_a)<>100 THEN
    RAISE EXCEPTION 'competência da obrigação não permaneceu 100'; END IF;
  IF (SELECT COALESCE(sum(projection.revenue-projection.expense),0)
      FROM public.pdv_financial_projection_rows_v2(ca) projection
     WHERE projection.projection_kind='dre_cash')<>40
     OR (SELECT COALESCE(sum(projection.cash_flow),0)
      FROM public.pdv_financial_projection_rows_v2(ca) projection
     WHERE projection.projection_kind='dfc')<>40 THEN
    RAISE EXCEPTION 'projeção W1C não preservou apenas os 40 monetários'; END IF;
  IF (SELECT settlement_status FROM public.pdv_order_payments
       WHERE receivable_transaction_id=recv_a)<>'settled'
     OR (SELECT settlement_transaction_id FROM public.pdv_order_payments
       WHERE receivable_transaction_id=recv_a) IS NOT NULL THEN
    RAISE EXCEPTION 'cobertura mista não fechou sem fingir liquidação única'; END IF;

  result:=public.pdv_post_party_credit_v2('supplier',supplier_a,'credit',50,
    public.company_today(ca),'Adiantamento fornecedor','w4-credit-supplier-0001');
  supplier_credit:=(result->>'entry_id')::uuid;
  result:=public.pdv_apply_party_credit_v2('supplier',supplier_a,pay_a,30,
    public.company_today(ca),'Abater conta','w4-apply-supplier-0001');
  supplier_app:=(result->>'entry_id')::uuid;
  summary:=public.pdv_party_account_summary_v2('supplier',supplier_a);
  IF (summary->>'open_amount')::numeric<>40 OR (summary->>'available_credit')::numeric<>20
     OR summary->>'credit_limit' IS NOT NULL OR summary->>'purchase_capacity' IS NOT NULL THEN
    RAISE EXCEPTION 'fornecedor misturou pagar/adiantamento/limite: %',summary; END IF;
  IF (SELECT amount_received FROM public.financial_transactions WHERE id=pay_a)<>40 THEN
    RAISE EXCEPTION 'adiantamento sobrescreveu pagamento parcial anterior'; END IF;
  denied_detail:=NULL;
  BEGIN
    PERFORM public.pdv_apply_party_credit_v2('supplier',supplier_a,pay_a,21,
      public.company_today(ca),'Sem crédito suficiente','w4-apply-supplier-insufficient-0001');
  EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS denied_detail=PG_EXCEPTION_DETAIL; END;
  IF denied_detail IS DISTINCT FROM 'code=pdv_party_credit_insufficient' THEN
    RAISE EXCEPTION 'saldo insuficiente não foi bloqueado: %',denied_detail; END IF;
  PERFORM public.pdv_post_party_credit_v2('supplier',supplier_a,'credit',20,
    public.company_today(ca),'Completar adiantamento','w4-credit-supplier-0002');
  result:=public.pdv_apply_party_credit_v2('supplier',supplier_a,pay_a,40,
    public.company_today(ca),'Fechar conta sem caixa','w4-apply-supplier-0002');
  supplier_app_final:=(result->>'entry_id')::uuid;
  IF public.pdv_party_obligation_open_v2(pay_a)<>0
     OR (SELECT amount_received FROM public.financial_transactions WHERE id=pay_a)<>80
     OR (SELECT is_paid FROM public.financial_transactions WHERE id=pay_a)
     OR (SELECT paid_date FROM public.financial_transactions WHERE id=pay_a) IS NOT NULL THEN
    RAISE EXCEPTION 'adiantamento fornecedor simulou saída monetária'; END IF;
  PERFORM public.pdv_reverse_party_credit_entry_v2(
    supplier_app_final,'Reabrir conta fornecedor','w4-reverse-supplier-0002');
  PERFORM public.pdv_reverse_party_credit_entry_v2(
    supplier_app,'Desfazer abatimento do fornecedor','w4-reverse-supplier-0001');
  IF (SELECT amount_received FROM public.financial_transactions WHERE id=pay_a)<>10
     OR (SELECT is_paid FROM public.financial_transactions WHERE id=pay_a) THEN
    RAISE EXCEPTION 'estorno do adiantamento não preservou pagamento anterior'; END IF;

  statement:=public.pdv_party_account_statement_v2('customer',customer_a,50,0);
  IF (statement->>'total_count')::integer<5 OR statement::text ~ '(document|email|phone)'
     OR statement::text NOT LIKE '%closed_by_credit%' THEN
    RAISE EXCEPTION 'extrato paginado incompleto ou sensível: %',statement; END IF;

  IF (SELECT count(*) FROM public.financial_transactions WHERE company_id=ca)<>financial_before+1
     OR (SELECT count(*) FROM public.pdv_cash_custody_entries WHERE company_id=ca)<>custody_before THEN
    RAISE EXCEPTION 'baixa mista criou fato financeiro/custódia além dos 40 em Pix'; END IF;
  IF (SELECT credit_limit FROM public.customers WHERE id=customer_a)<>200 THEN
    RAISE EXCEPTION 'crédito alterou limite do cliente'; END IF;

  -- Ledger é append-only.
  denied_detail:=NULL;
  BEGIN UPDATE public.pdv_party_credit_entries SET amount=999 WHERE id=credit_entry;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_detail=PG_EXCEPTION_DETAIL; END;
  IF denied_detail IS DISTINCT FROM 'code=pdv_party_credit_immutable' THEN RAISE EXCEPTION 'UPDATE não foi bloqueado'; END IF;
  denied_detail:=NULL;
  BEGIN DELETE FROM public.pdv_party_credit_entries WHERE id=supplier_credit;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_detail=PG_EXCEPTION_DETAIL; END;
  IF denied_detail IS DISTINCT FROM 'code=pdv_party_credit_immutable' THEN RAISE EXCEPTION 'DELETE não foi bloqueado'; END IF;

  -- Tenant cruzado e usuário sem permissão falham fechados.
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN PERFORM public.pdv_party_account_summary_v2('customer',customer_b);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL; END;
  IF denied_state IS DISTINCT FROM 'P0002' OR denied_detail IS DISTINCT FROM 'code=pdv_party_account_party_not_found' THEN
    RAISE EXCEPTION 'tenant cruzado não falhou fechado: %, %',denied_state,denied_detail; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',denied,'role','authenticated')::text,true);
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN PERFORM public.pdv_party_account_summary_v2('customer',customer_a);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL; END;
  IF denied_state IS DISTINCT FROM '42501' OR denied_detail IS DISTINCT FROM 'code=pdv_party_account_permission_denied' THEN
    RAISE EXCEPTION 'usuário sem permissão não falhou fechado: %, %',denied_state,denied_detail; END IF;

  -- Perfil somente leitura vê a conta, mas limite/capacidade ficam ocultos.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',viewer,'role','authenticated')::text,true);
  summary:=public.pdv_party_account_summary_v2('customer',customer_a);
  IF summary->>'credit_limit' IS NOT NULL OR summary->>'purchase_capacity' IS NOT NULL THEN
    RAISE EXCEPTION 'perfil sem capacidade viu limite: %',summary; END IF;
  denied_state:=NULL;
  BEGIN PERFORM public.pdv_post_party_credit_v2('customer',customer_a,'credit',1,
    public.company_today(ca),'Não permitido','w4-credit-denied-0001');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE; END;
  IF denied_state IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'viewer conseguiu escrever crédito'; END IF;

  -- Tenant B resolve apenas a própria conta.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ub,'role','authenticated')::text,true);
  denied_state:=NULL; denied_detail:=NULL;
  BEGIN PERFORM public.pdv_party_account_summary_v2('customer',customer_b);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_state=RETURNED_SQLSTATE,denied_detail=PG_EXCEPTION_DETAIL; END;
  IF denied_state IS DISTINCT FROM '42501' OR denied_detail IS DISTINCT FROM 'code=pdv_party_account_rollout_disabled' THEN
    RAISE EXCEPTION 'rollout fechado não negou tenant B: %, %',denied_state,denied_detail; END IF;
  UPDATE public.app_feature_flags SET company_allowlist=ARRAY[ca,cb]::uuid[]
   WHERE key='pdv_party_accounts_v2';
  summary:=public.pdv_party_account_summary_v2('customer',customer_b);
  IF summary->>'party_id'<>customer_b::text OR (summary->>'open_amount')::numeric<>50 THEN
    RAISE EXCEPTION 'tenant B não resolveu a própria conta'; END IF;

  -- Ambos os resets removem ledger antes das chaves, sem alterar outro tenant/rollout.
  PERFORM public.reset_system_step(ca,'pdv',NULL);
  IF EXISTS(SELECT 1 FROM public.pdv_party_credit_entries WHERE company_id=ca)
     OR EXISTS(SELECT 1 FROM public.pdv_operation_requests request WHERE request.company_id=ca
       AND request.operation_type IN ('party.credit.post.v2','party.credit.apply.v2','party.credit.reverse.v2')) THEN
    RAISE EXCEPTION 'reset PDV deixou ledger/request W4 órfão'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  PERFORM public.pdv_post_party_credit_v2('customer',customer_a,'credit',5,
    public.company_today(ca),'Crédito antes do reset financeiro','w4-credit-financial-reset-0001');
  PERFORM public.reset_system_step(ca,'financial_movements',NULL);
  IF EXISTS(SELECT 1 FROM public.pdv_party_credit_entries WHERE company_id=ca)
     OR EXISTS(SELECT 1 FROM public.pdv_operation_requests request WHERE request.company_id=ca
       AND request.operation_type IN ('party.credit.post.v2','party.credit.apply.v2','party.credit.reverse.v2')) THEN
    RAISE EXCEPTION 'reset financeiro deixou ledger/request W4 órfão'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.financial_transactions WHERE id=recv_b)
     OR NOT (cb=ANY((SELECT company_allowlist FROM public.app_feature_flags
       WHERE key='pdv_party_accounts_v2'))) THEN
    RAISE EXCEPTION 'reset da empresa A alterou tenant B ou rollout'; END IF;
END $behavior$;

ROLLBACK;

-- Smoke W5-02B: projeção, confirmação externa e voucher em pedido comum.
BEGIN;

DO $contract$
DECLARE v_fn text; v_src text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_get_after_sale_workspace_v2(uuid)',
    'public.pdv_search_vouchers_v2(text,uuid,integer,integer)',
    'public.pdv_apply_voucher_to_order_v2(uuid,uuid,numeric,text)',
    'public.pdv_confirm_return_refund_v2(uuid,uuid,text,text)',
    'public.pdv_confirm_return_refund_v2(uuid,uuid,text)'
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE')
      OR NOT has_function_privilege('authenticated',v_fn,'EXECUTE') THEN
      RAISE EXCEPTION 'ACL pública incorreta em %',v_fn; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_proc procedure WHERE procedure.oid=v_fn::regprocedure
      AND procedure.prosecdef) THEN RAISE EXCEPTION 'RPC sem SECURITY DEFINER: %',v_fn; END IF;
  END LOOP;
  IF has_function_privilege('authenticated','public.pdv_confirm_return_refund_base_v2(uuid,uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.pdv_return_reallocatable_amounts_internal_v2(uuid,uuid)','EXECUTE')
    OR has_table_privilege('authenticated','public.pdv_refund_confirmation_references','SELECT') THEN
    RAISE EXCEPTION 'helper/livro de confirmação exposto'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class table_row JOIN pg_namespace namespace ON namespace.oid=table_row.relnamespace
    WHERE namespace.nspname='public' AND table_row.relname='pdv_refund_confirmation_references'
      AND table_row.relrowsecurity AND table_row.relforcerowsecurity) THEN
    RAISE EXCEPTION 'referências sem FORCE RLS'; END IF;
  SELECT pg_get_functiondef('public.pdv_cover_existing_order_v2(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure) INTO v_src;
  IF position('PDV_VOUCHER_PREAPPLIED_V21' in v_src)=0 OR position('v_existing_voucher' in v_src)=0 THEN
    RAISE EXCEPTION 'cobertura comum não integrou voucher'; END IF;
  SELECT pg_get_functiondef('public.reset_system_step(uuid,text,uuid)'::regprocedure) INTO v_src;
  IF position('PDV_REFUND_CONFIRMATION_RESET_V2' in v_src)=0 THEN RAISE EXCEPTION 'reset não limpa confirmação'; END IF;
  SELECT pg_get_functiondef('public.pdv_get_after_sale_workspace_v2(uuid)'::regprocedure) INTO v_src;
  IF v_src~*'(cmv|cost_price|unit_cost|initial_balance|account_number)'
    OR position('reallocatable_amount' in v_src)=0 OR position('unallocated_amount' in v_src)=0 THEN
    RAISE EXCEPTION 'projeção contém campo sensível'; END IF;
END $contract$;

DO $behavior$
DECLARE
  ca uuid:='b1420000-0000-4000-8000-000000000001'; cb uuid:='b1420000-0000-4000-8000-000000000002';
  ua uuid:='b1420000-0000-4000-8000-000000000011'; ub uuid:='b1420000-0000-4000-8000-000000000012';
  uc uuid:='b1420000-0000-4000-8000-000000000013';
  customer_a uuid:='b1420000-0000-4000-8000-000000000021'; customer_b uuid:='b1420000-0000-4000-8000-000000000022';
  cash_account uuid:='b1420000-0000-4000-8000-000000000031'; bank_account uuid:='b1420000-0000-4000-8000-000000000032';
  stock_a uuid:='b1420000-0000-4000-8000-000000000041'; terminal uuid:='b1420000-0000-4000-8000-000000000042';
  original_order uuid:='b1420000-0000-4000-8000-000000000051'; ordinary_order uuid:='b1420000-0000-4000-8000-000000000052';
  race_order uuid:='b1420000-0000-4000-8000-000000000053'; other_order uuid:='b1420000-0000-4000-8000-000000000054';
  pix_payment uuid:='b1420000-0000-4000-8000-000000000061'; return_id uuid:='b1420000-0000-4000-8000-000000000071';
  credit_target uuid:='b1420000-0000-4000-8000-000000000072'; consumed_credit uuid; restored_credit uuid;
  mixed_customer uuid:='b1420000-0000-4000-8000-000000000081';
  mixed_order uuid:='b1420000-0000-4000-8000-000000000082';
  mixed_return uuid:='b1420000-0000-4000-8000-000000000083';
  mixed_target uuid:='b1420000-0000-4000-8000-000000000084';
  mixed_consume_target uuid:='b1420000-0000-4000-8000-000000000085';
  mixed_credit20 uuid; mixed_credit30 uuid; mixed_application30 uuid; mixed_consumed uuid; mixed_request uuid;
  return_request uuid; credit_entry uuid; session_id uuid; voucher_id uuid; expired_voucher uuid:=gen_random_uuid();
  expired_request uuid; refund_id uuid; result jsonb; retry jsonb; workspace jsonb; search_result jsonb;
  blocked boolean; detail text; financial_before integer; projection_before integer; public_code text;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  VALUES
    ('00000000-0000-0000-0000-000000000000',ua,'authenticated','authenticated','w502b-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',ub,'authenticated','authenticated','w502b-b@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',uc,'authenticated','authenticated','w502b-c@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(ca,'W5-02B A','active'),(cb,'W5-02B B','active');
  UPDATE public.profiles SET company_id=ca,is_active=true WHERE user_id=ua;
  UPDATE public.profiles SET company_id=cb,is_active=true WHERE user_id=ub;
  UPDATE public.profiles SET company_id=ca,is_active=true WHERE user_id=uc;
  INSERT INTO public.user_roles(user_id,role) VALUES(ua,'comercial'),(ub,'comercial'),(uc,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (ua,'["screen:pdv","screen:pdv_orders","fn:view_pdv_after_sale","fn:issue_pdv_voucher","fn:refund_pdv_return","fn:confirm_pdv_refund","fn:reverse_pdv_refund","fn:cover_pdv_order","fn:cover_pdv_exchange","fn:use_bank_accounts"]',true),
    (ub,'["screen:pdv","screen:pdv_orders","fn:view_pdv_after_sale","fn:cover_pdv_order"]',true),
    (uc,'["screen:pdv","screen:pdv_orders","fn:view_pdv_after_sale","fn:cover_pdv_order"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(ca,'pdv'),(cb,'pdv');
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
  VALUES(cash_account,ca,'Cofre 142', 'caixa',500,true),(bank_account,ca,'Banco 142','banco',0,true);
  INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
  VALUES(ca,'W5-02B A','America/Sao_Paulo',cash_account,true,'balcao'),
    (cb,'W5-02B B','America/Sao_Paulo',NULL,true,'balcao');
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock_a,ca,'Estoque 142',true);
  INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active) VALUES(terminal,ca,'Caixa 142',stock_a,true);
  INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted) VALUES
    (customer_a,ca,'Cliente A',500,false),(customer_b,cb,'Cliente B',500,false);
  UPDATE public.app_feature_flags SET company_allowlist=array_append(company_allowlist,ca)
   WHERE key IN('pdv_returns_v2','pdv_party_accounts_v2','pdv_after_sale_value_v2');
  UPDATE public.app_feature_flags SET company_allowlist=array_append(company_allowlist,cb)
   WHERE key IN('pdv_returns_v2','pdv_after_sale_value_v2');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  result:=public.pdv_open_cash_session_v2(terminal,cash_account,200,'w502b-open-cash-0001');
  session_id:=(result->>'session_id')::uuid;

  INSERT INTO public.pdv_orders(id,company_id,number,customer_id,status,subtotal,total,client_request_id,
    contract_version,operation_mode_snapshot,stock_id)
  VALUES(original_order,ca,1420001,customer_a,'entregue',100,100,'w502b-original-0001',2,'counter',stock_a),
    (ordinary_order,ca,1420002,customer_a,'aguardando_pagamento',100,100,'w502b-ordinary-0001',2,'counter',stock_a),
    (race_order,ca,1420003,customer_a,'aguardando_pagamento',100,100,'w502b-race-0001',2,'counter',stock_a),
    (other_order,cb,1420004,customer_b,'aguardando_pagamento',100,100,'w502b-other-0001',2,'counter',NULL);
  INSERT INTO public.pdv_order_payments(id,company_id,order_id,method,amount,change_amount,financial_account_id,
    contract_version,coverage_kind,coverage_status,settlement_status,authorized_at,settled_at,created_by)
  VALUES(pix_payment,ca,original_order,'pix',100,0,bank_account,2,'pix','authorized','settled',now(),now(),ua);
  SELECT request_id INTO return_request FROM public.pdv_claim_operation_request(ca,'commercial.return.v2',
    'w502b-return-fixture-0001',jsonb_build_object('fixture',true));
  INSERT INTO public.pdv_commercial_returns(id,company_id,order_id,customer_id,event_kind,occurred_on,reason,
    commercial_total,cmv_total,operation_request_id,created_by)
  VALUES(return_id,ca,original_order,customer_a,'return',public.company_today(ca),'Fixture 142',-100,-60,return_request,ua);
  credit_entry:=public.pdv_return_credit_entry_internal_v2(ca,customer_a,return_id,'credit',100,
    public.company_today(ca),'Crédito fixture',NULL,NULL,'w502b-credit-fixture-0001');
  INSERT INTO public.pdv_return_dispositions(company_id,commercial_return_id,disposition_kind,amount,credit_entry_id)
  VALUES(ca,return_id,'customer_credit',100,credit_entry);

  -- Matriz de permissão: caixa pode aplicar voucher sem ganhar ação de troca.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uc,'role','authenticated')::text,true);
  workspace:=public.pdv_get_after_sale_workspace_v2(original_order);
  IF workspace->'capabilities'->>'apply_voucher'<>'true'
    OR workspace->'capabilities'->>'create_exchange'<>'false'
    OR jsonb_array_length(workspace->'exchange_candidates')<>0
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(workspace->'order_candidates') candidate
      WHERE (candidate->>'order_id')::uuid=ordinary_order
        AND candidate->>'can_apply_voucher'='true' AND candidate->>'can_exchange'='false') THEN
    RAISE EXCEPTION 'matriz apply/exchange promoveu ou ocultou ação: %',workspace; END IF;
  IF (SELECT (item->>'available_amount')::numeric FROM jsonb_array_elements(workspace->'returns') item
       WHERE (item->>'return_id')::uuid=return_id)<>100
    OR (SELECT (item->>'unallocated_amount')::numeric FROM jsonb_array_elements(workspace->'returns') item
       WHERE (item->>'return_id')::uuid=return_id)<>0 THEN
    RAISE EXCEPTION 'crédito inicial não foi projetado como realocável: %',workspace; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);

  result:=public.pdv_issue_return_voucher_v2(return_id,80,public.company_today(ca)+30,'w502b-voucher-issue-0001');
  voucher_id:=(result->>'voucher_id')::uuid; public_code:=result->>'public_code';

  blocked:=false;
  BEGIN PERFORM public.pdv_search_vouchers_v2('DV',NULL,20,0);
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'busca curta permitiu enumeracao de voucher'; END IF;
  search_result:=public.pdv_search_vouchers_v2('DV-%____',NULL,20,0);
  IF (search_result->>'total')::integer<>0 THEN
    RAISE EXCEPTION 'wildcards foram interpretados na busca de voucher: %',search_result; END IF;
  search_result:=public.pdv_search_vouchers_v2(left(public_code,8),NULL,20,0);
  IF (search_result->>'total')::integer<1
    OR (search_result->'items'->0 ? 'voucher_id')
    OR (search_result->'items'->0 ? 'balance')
    OR search_result->'items'->0->>'public_code'=public_code THEN
    RAISE EXCEPTION 'prefixo amplo não mascarou ID/código/saldo: %',search_result; END IF;
  search_result:=public.pdv_search_vouchers_v2(public_code,NULL,20,0);
  IF search_result->'items'->0->>'voucher_id'<>voucher_id::text
    OR search_result->'items'->0->>'public_code'<>public_code
    OR NOT (search_result->'items'->0 ? 'balance') THEN
    RAISE EXCEPTION 'match exato não liberou contrato completo: %',search_result; END IF;
  search_result:=public.pdv_search_vouchers_v2(NULL,customer_a,20,0);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(search_result->'items') item
    WHERE item->>'voucher_id'=voucher_id::text AND item->>'public_code'=public_code
      AND item ? 'balance') THEN
    RAISE EXCEPTION 'cliente explícito não liberou contrato completo: %',search_result; END IF;
  workspace:=public.pdv_get_after_sale_workspace_v2(original_order);
  IF (SELECT (item->>'available_amount')::numeric FROM jsonb_array_elements(workspace->'returns') item
       WHERE (item->>'return_id')::uuid=return_id)<>20
    OR (SELECT (item->>'reallocatable_amount')::numeric FROM jsonb_array_elements(workspace->'returns') item
       WHERE (item->>'return_id')::uuid=return_id)<>20
    OR (SELECT (item->>'allocated_value')::numeric FROM jsonb_array_elements(workspace->'returns') item
       WHERE (item->>'return_id')::uuid=return_id)<>80 THEN
    RAISE EXCEPTION 'voucher 80 não deixou exatamente 20 realocáveis: %',workspace; END IF;

  -- O helper 141 precisa estornar a entrada de crédito inteira antes de
  -- recriar o residual. Depois de consumir parte dos 20, a projeção deve
  -- falhar fechada em zero, não anunciar 15 que o writer não pode liberar.
  INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,
    transaction_date,due_date,is_paid,amount_received,customer_id,origin)
  VALUES(credit_target,ca,'entrada','Recebível para consumo parcial',20,public.company_today(ca),
    public.company_today(ca)+10,false,0,customer_a,'pdv');
  consumed_credit:=public.pdv_return_credit_entry_internal_v2(ca,customer_a,return_id,'application',-5,
    public.company_today(ca),'Consumo parcial fixture',credit_target,NULL,'w502b-credit-consume-0001');
  workspace:=public.pdv_get_after_sale_workspace_v2(original_order);
  IF (SELECT (item->>'available_amount')::numeric FROM jsonb_array_elements(workspace->'returns') item
       WHERE (item->>'return_id')::uuid=return_id)<>0 THEN
    RAISE EXCEPTION 'crédito parcialmente consumido continuou realocável: %',workspace; END IF;
  restored_credit:=public.pdv_return_credit_entry_internal_v2(ca,customer_a,return_id,'reversal',5,
    public.company_today(ca),'Restauração fixture',credit_target,consumed_credit,'w502b-credit-restore-0001');
  workspace:=public.pdv_get_after_sale_workspace_v2(original_order);
  IF restored_credit IS NULL OR (SELECT (item->>'available_amount')::numeric
      FROM jsonb_array_elements(workspace->'returns') item
      WHERE (item->>'return_id')::uuid=return_id)<>20 THEN
    RAISE EXCEPTION 'restauração do crédito não recompôs 20 realocáveis: %',workspace; END IF;

  SELECT count(*) INTO financial_before FROM public.financial_transactions WHERE company_id=ca;
  SELECT count(*) INTO projection_before FROM public.pdv_financial_projection_rows_v2(ca);
  result:=public.pdv_apply_voucher_to_order_v2(ordinary_order,voucher_id,30,'w502b-apply-0001');
  IF (result->>'remaining_order_amount')::numeric<>70 OR (result->>'voucher_balance')::numeric<>50 THEN
    RAISE EXCEPTION 'voucher não aplicou no pedido comum: %',result; END IF;
  IF (SELECT count(*) FROM public.financial_transactions WHERE company_id=ca)<>financial_before
    OR (SELECT count(*) FROM public.pdv_financial_projection_rows_v2(ca))<>projection_before THEN
    RAISE EXCEPTION 'resgate de voucher movimentou DRE/DFC'; END IF;
  retry:=public.pdv_apply_voucher_to_order_v2(ordinary_order,voucher_id,30,'w502b-apply-0001');
  IF retry->>'idempotent'<>'true' OR retry->>'voucher_entry_id'<>result->>'voucher_entry_id' THEN
    RAISE EXCEPTION 'retry duplicou resgate'; END IF;
  detail:=NULL;
  BEGIN PERFORM public.pdv_apply_voucher_to_order_v2(ordinary_order,voucher_id,31,'w502b-apply-0001');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; END;
  IF detail IS NULL THEN RAISE EXCEPTION 'mesma chave aceitou payload diferente'; END IF;
  blocked:=false;
  BEGIN PERFORM public.pdv_apply_voucher_to_order_v2(race_order,voucher_id,60,'w502b-apply-race-0001');
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked OR public.pdv_voucher_balance_internal_v2(voucher_id)<>50 THEN
    RAISE EXCEPTION 'saldo insuficiente/concorrrência lógica falhou'; END IF;

  result:=public.pdv_cover_existing_order_v2(ordinary_order,terminal,session_id,cash_account,
    '[{"method":"dinheiro","amount":70}]'::jsonb,'w502b-cover-0001');
  IF result->>'status'<>'liberado_retirada' OR
    (SELECT sum(amount) FROM public.pdv_order_payments WHERE order_id=ordinary_order)<>100 THEN
    RAISE EXCEPTION 'cobertura comum não somou voucher + dinheiro'; END IF;

  SELECT request_id INTO expired_request FROM public.pdv_claim_operation_request(ca,'after_sale.voucher.issue.v2',
    'w502b-expired-fixture-0001',jsonb_build_object('fixture','expired'));
  INSERT INTO public.pdv_vouchers(id,company_id,customer_id,public_code,source_commercial_return_id,issued_on,expires_on,created_by)
  VALUES(expired_voucher,ca,customer_a,'DV-EXPIRED000000001',return_id,public.company_today(ca)-2,public.company_today(ca)-1,ua);
  INSERT INTO public.pdv_voucher_entries(company_id,voucher_id,entry_kind,amount,operation_request_id,description,created_by)
  VALUES(ca,expired_voucher,'issue',10,expired_request,'Fixture vencido',ua);
  blocked:=false;
  BEGIN PERFORM public.pdv_apply_voucher_to_order_v2(race_order,expired_voucher,1,'w502b-expired-apply-0001');
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'voucher vencido foi aceito'; END IF;

  search_result:=public.pdv_search_vouchers_v2(public_code,customer_a,20,0);
  IF (search_result->>'total')::integer<1 OR search_result::text NOT LIKE '%'||public_code||'%' THEN
    RAISE EXCEPTION 'busca não encontrou voucher'; END IF;
  result:=public.pdv_request_return_refund_v2(return_id,pix_payment,10,'Pix 142',NULL,NULL,'w502b-refund-0001');
  refund_id:=(result->>'refund_id')::uuid;
  blocked:=false;
  BEGIN PERFORM public.pdv_confirm_return_refund_v2(refund_id,bank_account,'w502b-confirm-old-0001');
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Pix confirmou sem referência externa'; END IF;
  result:=public.pdv_confirm_return_refund_v2(refund_id,bank_account,'E2E-PIX-SECRET-1234','w502b-confirm-0001');
  IF result->>'confirmation_reference_redacted'<>'••••1234' THEN RAISE EXCEPTION 'referência não foi redigida'; END IF;
  result:=public.pdv_cover_exchange_order_v2(return_id,race_order,voucher_id,10,0,'pix',bank_account,NULL,
    'w502b-exchange-0001');
  IF result->>'ok'<>'true' OR (result->>'difference_amount')::numeric<>90
    OR (SELECT status FROM public.pdv_orders WHERE id=race_order)<>'liberado_retirada' THEN
    RAISE EXCEPTION 'troca com diferença não fechou centavos: %',result; END IF;
  workspace:=public.pdv_get_after_sale_workspace_v2(original_order);
  IF workspace::text LIKE '%E2E-PIX-SECRET-1234%' OR workspace::text~*'(cmv|unit_cost|cost_price|initial_balance)'
    OR workspace->'capabilities'->>'direct_sale_voucher'<>'false'
    OR workspace::text NOT LIKE '%••••1234%' THEN RAISE EXCEPTION 'workspace vazou segredo/custo ou omitiu redaction: %',workspace; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(workspace->'returns') item
      WHERE (item->>'return_id')::uuid=return_id
        AND (item->>'returned_value')::numeric=100
        AND (item->>'allocated_value')::numeric=90
        AND (item->>'available_amount')::numeric=10
        AND (item->>'returned_value')::numeric=(item->>'allocated_value')::numeric+(item->>'available_amount')::numeric
        AND jsonb_array_length(item->'exchanges')=1) THEN
    RAISE EXCEPTION 'voucher/refund/troca não fecharam o valor devolvido: %',workspace; END IF;

  -- Disposição mista segue exatamente a ordem do writer. O abatimento pode
  -- ser revertido, mas não pode ser "pulado" quando um crédito anterior já
  -- foi consumido, pois o helper 141 também pararia nesse ponto.
  INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted)
  VALUES(mixed_customer,ca,'Cliente misto',500,false);
  INSERT INTO public.pdv_orders(id,company_id,number,customer_id,status,subtotal,total,client_request_id,
    contract_version,operation_mode_snapshot,stock_id)
  VALUES(mixed_order,ca,1420005,mixed_customer,'entregue',50,50,'w502b-mixed-order-0001',2,'counter',stock_a);
  SELECT request_id INTO mixed_request FROM public.pdv_claim_operation_request(ca,'commercial.return.v2',
    'w502b-mixed-return-0001',jsonb_build_object('fixture','mixed'));
  INSERT INTO public.pdv_commercial_returns(id,company_id,order_id,customer_id,event_kind,occurred_on,reason,
    commercial_total,cmv_total,operation_request_id,created_by)
  VALUES(mixed_return,ca,mixed_order,mixed_customer,'return',public.company_today(ca),'Fixture mista',-50,-25,
    mixed_request,ua);
  INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,transaction_date,
    due_date,is_paid,amount_received,customer_id,origin)
  VALUES
    (mixed_target,ca,'entrada','Recebível abatido misto',30,public.company_today(ca),public.company_today(ca)+10,
      false,0,mixed_customer,'pdv'),
    (mixed_consume_target,ca,'entrada','Recebível consumo misto',10,public.company_today(ca),public.company_today(ca)+10,
      false,0,mixed_customer,'pdv');
  mixed_credit20:=public.pdv_return_credit_entry_internal_v2(ca,mixed_customer,mixed_return,'credit',20,
    public.company_today(ca),'Crédito misto',NULL,NULL,'w502b-mixed-credit20-0001');
  mixed_credit30:=public.pdv_return_credit_entry_internal_v2(ca,mixed_customer,mixed_return,'credit',30,
    public.company_today(ca),'Base do abatimento misto',NULL,NULL,'w502b-mixed-credit30-0001');
  mixed_application30:=public.pdv_return_credit_entry_internal_v2(ca,mixed_customer,mixed_return,'application',-30,
    public.company_today(ca),'Abatimento misto',mixed_target,NULL,'w502b-mixed-application30-0001');
  INSERT INTO public.pdv_return_dispositions(id,company_id,commercial_return_id,disposition_kind,amount,
    receivable_transaction_id,credit_entry_id,application_entry_id)
  VALUES
    ('b1420000-0000-4000-8000-000000000091',ca,mixed_return,'customer_credit',20,NULL,mixed_credit20,NULL),
    ('b1420000-0000-4000-8000-000000000092',ca,mixed_return,'receivable_reduction',30,mixed_target,
      mixed_credit30,mixed_application30);
  workspace:=public.pdv_get_after_sale_workspace_v2(mixed_order);
  IF (SELECT (item->>'available_amount')::numeric FROM jsonb_array_elements(workspace->'returns') item
       WHERE (item->>'return_id')::uuid=mixed_return)<>50 THEN
    RAISE EXCEPTION 'disposições mistas íntegras não projetaram 50: %',workspace; END IF;
  mixed_consumed:=public.pdv_return_credit_entry_internal_v2(ca,mixed_customer,mixed_return,'application',-5,
    public.company_today(ca),'Consumo misto',mixed_consume_target,NULL,'w502b-mixed-consume-0001');
  workspace:=public.pdv_get_after_sale_workspace_v2(mixed_order);
  IF mixed_consumed IS NULL OR (SELECT (item->>'available_amount')::numeric
      FROM jsonb_array_elements(workspace->'returns') item
      WHERE (item->>'return_id')::uuid=mixed_return)<>0 THEN
    RAISE EXCEPTION 'disposição mista pulou crédito consumido: %',workspace; END IF;

  -- Mesmo tenant, mas fora da ACL do local: workspace, busca e writer falham
  -- antes de expor pedido/cliente/pagamento ou alterar o voucher.
  INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(ca,stock_a,ua);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uc,'role','authenticated')::text,true);
  blocked:=false;
  BEGIN PERFORM public.pdv_get_after_sale_workspace_v2(original_order);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'workspace pós-venda ignorou ACL same-tenant'; END IF;
  search_result:=public.pdv_search_vouchers_v2(public_code,NULL,20,0);
  IF (search_result->>'total')::integer<>0 THEN RAISE EXCEPTION 'busca de voucher ignorou ACL same-tenant'; END IF;
  blocked:=false;
  BEGIN PERFORM public.pdv_apply_voucher_to_order_v2(race_order,voucher_id,1,'w502b-restricted-0001');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'writer pós-venda ignorou ACL same-tenant'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ub,'role','authenticated')::text,true);
  search_result:=public.pdv_search_vouchers_v2(public_code,NULL,20,0);
  IF (search_result->>'total')::integer<>0 THEN RAISE EXCEPTION 'busca cross-tenant vazou voucher'; END IF;
  blocked:=false;
  BEGIN PERFORM public.pdv_apply_voucher_to_order_v2(other_order,voucher_id,1,'w502b-cross-tenant-0001');
  EXCEPTION WHEN no_data_found THEN blocked:=true; WHEN check_violation THEN blocked:=true;
    WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'tenant B aplicou voucher de A'; END IF;
END $behavior$;

ROLLBACK;

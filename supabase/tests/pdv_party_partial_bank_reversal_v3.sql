-- Recebimento bancário parcial usa o caixa que realmente recebeu, separado
-- do caixa que vendeu e da gaveta física. Toda fixture é revertida.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $acl$
DECLARE signature text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.pdv_party_settle_receivables_v2(uuid,jsonb,text,uuid,uuid,date,text,text)',
  'public.pdv_party_reverse_receivable_settlement_v2(uuid,uuid,uuid,uuid,text,text)'
 ] LOOP
  IF has_function_privilege('anon',signature,'EXECUTE')
    OR NOT has_function_privilege('authenticated',signature,'EXECUTE') THEN RAISE EXCEPTION 'ACL pública incorreta em %',signature;END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY[
  'public.pdv_assert_receivable_receiving_context_v5(uuid,uuid,uuid)',
  'public.pdv_settle_receivables_v2(jsonb,text,uuid,uuid,date,text,text)',
  'public.pdv_reverse_receivable_settlement_v2(uuid,uuid,uuid,text,text)'
 ] LOOP
  IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE') THEN
   RAISE EXCEPTION 'Helper de recebimento exposto diretamente: %',signature;END IF;
 END LOOP;
END $acl$;
DO $behavior$
DECLARE
 c uuid:='f3141500-0000-4000-8000-000000000001'; cx uuid:='f3141500-0000-4000-8000-000000000011';
 u uuid:='f3141500-0000-4000-8000-000000000002'; ub uuid:='f3141500-0000-4000-8000-000000000012'; ux uuid:='f3141500-0000-4000-8000-000000000013';
 cust uuid:='f3141500-0000-4000-8000-000000000003';
 cash uuid:='f3141500-0000-4000-8000-000000000004'; bank uuid:='f3141500-0000-4000-8000-000000000005';
 stock uuid:='f3141500-0000-4000-8000-000000000006';
 term uuid:='f3141500-0000-4000-8000-000000000007'; term_receiving uuid:='f3141500-0000-4000-8000-000000000017'; term_other uuid:='f3141500-0000-4000-8000-000000000018';
 material uuid:='f3141500-0000-4000-8000-000000000008';
 origin_session uuid; receiving_session uuid; other_session uuid; sale_id uuid; receivable_id uuid; full_sale_id uuid; full_receivable_id uuid; settlement_id uuid;
 result jsonb; replay jsonb; before_custody numeric; custody_rows integer; blocked boolean; detail text;
 dre_before jsonb; dfc_before jsonb; statement jsonb; historical_request record; historical_settlement uuid; historical_payload jsonb; general_receivable uuid:=gen_random_uuid(); general_settlement uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM public.companies WHERE id IN(c,cx))
   OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(u,ub,ux)) THEN RAISE EXCEPTION 'Fixture já existe; abortado';END IF;
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
 raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 VALUES('00000000-0000-0000-0000-000000000000',u,'authenticated','authenticated','partial-bank-owner@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
 ('00000000-0000-0000-0000-000000000000',ub,'authenticated','authenticated','partial-bank-other@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
 ('00000000-0000-0000-0000-000000000000',ux,'authenticated','authenticated','partial-bank-tenant@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
 INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Fixture recebimento parcial','active'),(cx,'Outro tenant recebimento parcial','active');
 UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(u,ub);
 UPDATE public.profiles SET company_id=cx,is_active=true WHERE user_id=ux;
 INSERT INTO public.user_roles(user_id,role) VALUES(u,'admin'),(ub,'comercial'),(ux,'admin');
 INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES(ub,
  '["screen:pdv","screen:customers","fn:manage_finance","fn:view_customer_financial","fn:receive_pdv_receivable","fn:reverse_pdv_receivable","fn:use_bank_accounts"]',true);
 INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv'),(cx,'pdv');
 INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
 VALUES(cash,c,'Caixa fixture','caixa',1000,true),(bank,c,'Banco fixture','banco',0,true);
 INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
 VALUES(c,'Fixture','America/Sao_Paulo',cash,true,'simples') ON CONFLICT(company_id)
 DO UPDATE SET pdv_cash_account_id=cash,pdv_strict_cash_tracking=true,pdv_mode='simples';
 INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Local fixture',false);
 INSERT INTO public.pdv_terminals(id,company_id,name,stock_id,is_active)
 VALUES(term,c,'Caixa da venda',stock,true),(term_receiving,c,'Caixa recebedor',stock,true),(term_other,c,'Caixa de outro operador',stock,true);
 INSERT INTO public.inventory(id,company_id,sku,name,unit,quantity,cost_price,sale_price)
 VALUES(material,c,'PARTIAL-BANK-FIXTURE','Material fixture','un',10,3,10);
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present)
 VALUES(c,material,stock,10,true);
 INSERT INTO public.customers(id,company_id,name,credit_limit,is_deleted) VALUES(cust,c,'Cliente fixture',1000,false);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 result:=public.pdv_open_cash_session_v2(term,cash,200,'fixture-partial-bank-open-origin');origin_session:=(result->>'session_id')::uuid;
 result:=public.pdv_complete_direct_sale_v2(term,origin_session,cash,cust,
  jsonb_build_array(jsonb_build_object('inventory_id',material,'stock_id',stock,'quantity',1)),
  jsonb_build_array(jsonb_build_object('method','fiado','amount',10)),'fixture-partial-bank-sale-0001');
 sale_id:=(result->>'order_id')::uuid;
 SELECT payment.receivable_transaction_id INTO receivable_id FROM public.pdv_order_payments payment
 WHERE payment.order_id=sale_id AND payment.method='fiado';
 result:=public.pdv_complete_direct_sale_v2(term,origin_session,cash,cust,
  jsonb_build_array(jsonb_build_object('inventory_id',material,'stock_id',stock,'quantity',1)),
  jsonb_build_array(jsonb_build_object('method','fiado','amount',10)),'fixture-partial-bank-sale-full');
 full_sale_id:=(result->>'order_id')::uuid;
 SELECT payment.receivable_transaction_id INTO full_receivable_id FROM public.pdv_order_payments payment
 WHERE payment.order_id=full_sale_id AND payment.method='fiado';
 -- A venda foi atendida num caixa anterior. A baixa de hoje não pode herdar
 -- essa origem como se fosse o caixa que efetivamente recebeu o Pix.
 PERFORM public.pdv_close_cash_session_v2(origin_session,cash,200,'Fim do turno da venda','fixture-partial-bank-close-origin');
 result:=public.pdv_open_cash_session_v2(term_receiving,cash,100,'fixture-partial-bank-open-receiver');receiving_session:=(result->>'session_id')::uuid;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ub,'role','authenticated')::text,true);
 result:=public.pdv_open_cash_session_v2(term_other,cash,100,'fixture-partial-bank-open-other');other_session:=(result->>'session_id')::uuid;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 SELECT coalesce(sum(amount),0),count(*) INTO before_custody,custody_rows FROM public.pdv_cash_custody_entries WHERE company_id=c;
 dre_before:=public.pdv_dre_cash_projection_v2(c,public.company_today(c),public.company_today(c),100,0);
 dfc_before:=public.pdv_dfc_projection_v2(c,public.company_today(c),public.company_today(c),100,0);
 blocked:=false;detail:=NULL;
 BEGIN PERFORM public.pdv_party_settle_receivables_v2(cust,
   jsonb_build_array(jsonb_build_object('receivable_id',receivable_id,'amount',4)),
   'pix',bank,NULL,public.company_today(c),'Sem caixa identificado','fixture-partial-bank-no-context');
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;blocked:=true;END;
 IF NOT blocked OR detail IS DISTINCT FROM 'code=pdv_receivable_receiving_context_required'
   OR public.pdv_party_obligation_open_v2(receivable_id)<>10 THEN RAISE EXCEPTION 'Baixa PDV sem contexto não falhou fechada';END IF;
 result:=public.pdv_party_settle_receivables_v2(cust,
  jsonb_build_array(jsonb_build_object('receivable_id',receivable_id,'amount',4)),
  'pix',bank,receiving_session,public.company_today(c),'Pagamento parcial','fixture-partial-bank-receive-0001');
 settlement_id:=(result->>'financial_transaction_id')::uuid;
 IF public.pdv_party_obligation_open_v2(receivable_id)<>6
   OR NOT EXISTS(SELECT 1 FROM public.financial_transactions transaction
     WHERE transaction.id=settlement_id AND transaction.pdv_cash_session_id=receiving_session)
   OR NOT EXISTS(SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
     WHERE allocation.settlement_transaction_id=settlement_id AND allocation.cash_session_id IS NULL
       AND allocation.metadata->>'receiving_cash_session_id'=receiving_session::text) THEN
  RAISE EXCEPTION 'Pix parcial não registrou o atendimento real separado da gaveta';END IF;
 replay:=public.pdv_party_settle_receivables_v2(cust,
  jsonb_build_array(jsonb_build_object('receivable_id',receivable_id,'amount',4)),
  'pix',bank,receiving_session,public.company_today(c),'Pagamento parcial','fixture-partial-bank-receive-0001');
 IF replay->>'financial_transaction_id'<>settlement_id::text
   OR (SELECT count(*) FROM public.pdv_receivable_settlement_allocations WHERE settlement_transaction_id=settlement_id)<>1 THEN
  RAISE EXCEPTION 'Retry do recebimento duplicou baixa';END IF;
 statement:=public.pdv_party_account_statement_v3('customer',cust,'balance',100,0);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(statement->'entries') entry
   WHERE entry->>'id'=settlement_id::text AND entry->>'cash_session_id'=receiving_session::text AND entry->>'can_reverse'='true') THEN
  RAISE EXCEPTION 'Extrato não exibiu Pix parcial com contexto correto';END IF;
 IF (public.pdv_dre_cash_projection_v2(c,public.company_today(c),public.company_today(c),100,0)->>'revenue')::numeric
     <> (dre_before->>'revenue')::numeric+4
   OR (public.pdv_dfc_projection_v2(c,public.company_today(c),public.company_today(c),100,0)->>'cash_flow')::numeric
     <> (dfc_before->>'cash_flow')::numeric+4 THEN RAISE EXCEPTION 'Pix parcial não reconciliou DRE/DFC';END IF;
 -- Nem o caixa original da venda pode substituir o caixa recebedor.
 blocked:=false;BEGIN PERFORM public.pdv_party_reverse_receivable_settlement_v2(cust,settlement_id,bank,origin_session,
   'Caixa errado','fixture-partial-bank-reverse-wrong-context');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Origem do pedido substituiu caixa recebedor';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ub,'role','authenticated')::text,true);
 blocked:=false;BEGIN PERFORM public.pdv_party_reverse_receivable_settlement_v2(cust,settlement_id,bank,receiving_session,
   'Outro operador','fixture-partial-bank-reverse-other-actor');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Outro operador estornou recebimento';END IF;
 statement:=public.pdv_party_account_statement_v3('customer',cust,'balance',100,0);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(statement->'entries') entry WHERE entry->>'id'=settlement_id::text) THEN
  RAISE EXCEPTION 'Outro operador leu recebimento do caixa alheio';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ux,'role','authenticated')::text,true);
 blocked:=false;BEGIN PERFORM public.pdv_party_reverse_receivable_settlement_v2(cust,settlement_id,bank,receiving_session,
   'Outro tenant','fixture-partial-bank-reverse-other-tenant');EXCEPTION WHEN insufficient_privilege OR no_data_found THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Outro tenant estornou recebimento';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 result:=public.pdv_party_reverse_receivable_settlement_v2(cust,settlement_id,bank,receiving_session,
  'Desfazer pagamento parcial','fixture-partial-bank-reverse-0001');
 IF public.pdv_party_obligation_open_v2(receivable_id)<>10 THEN RAISE EXCEPTION 'Estorno não reabriu obrigação';END IF;
 replay:=public.pdv_party_reverse_receivable_settlement_v2(cust,settlement_id,bank,receiving_session,
  'Desfazer pagamento parcial','fixture-partial-bank-reverse-0001');
 IF replay->>'financial_transaction_id' IS DISTINCT FROM result->>'financial_transaction_id'
   OR (SELECT count(*) FROM public.pdv_receivable_settlement_allocations reversal
     JOIN public.pdv_receivable_settlement_allocations original ON original.id=reversal.reversal_of_id
     WHERE original.settlement_transaction_id=settlement_id)<>1 THEN
  RAISE EXCEPTION 'Retry do estorno duplicou movimento ou mudou identidade';END IF;
 IF (public.pdv_dre_cash_projection_v2(c,public.company_today(c),public.company_today(c),100,0)->>'revenue')::numeric<>(dre_before->>'revenue')::numeric
   OR (public.pdv_dre_cash_projection_v2(c,public.company_today(c),public.company_today(c),100,0)->>'cmv')::numeric<>(dre_before->>'cmv')::numeric
   OR (public.pdv_dfc_projection_v2(c,public.company_today(c),public.company_today(c),100,0)->>'cash_flow')::numeric<>(dfc_before->>'cash_flow')::numeric THEN
  RAISE EXCEPTION 'Estorno não recompôs DRE/DFC';END IF;
 IF (SELECT coalesce(sum(amount),0) FROM public.pdv_cash_custody_entries WHERE company_id=c)<>before_custody
   OR (SELECT count(*) FROM public.pdv_cash_custody_entries WHERE company_id=c)<>custody_rows THEN
  RAISE EXCEPTION 'Pix/estorno alterou dinheiro em espécie';END IF;
 -- Quitar por inteiro também preserva B; o trigger não pode substituí-lo
 -- pelo caixa A do pedido ao preencher settlement_transaction_id.
 result:=public.pdv_party_settle_receivables_v2(cust,
  jsonb_build_array(jsonb_build_object('receivable_id',full_receivable_id,'amount',10)),
  'pix',bank,receiving_session,public.company_today(c),'Quitação total','fixture-partial-bank-full-receive');
 settlement_id:=(result->>'financial_transaction_id')::uuid;
 IF public.pdv_party_obligation_open_v2(full_receivable_id)<>0
   OR NOT EXISTS(SELECT 1 FROM public.financial_transactions transaction
      WHERE transaction.id=settlement_id AND transaction.pdv_cash_session_id=receiving_session)
   OR NOT EXISTS(SELECT 1 FROM public.pdv_order_payments payment
      WHERE payment.receivable_transaction_id=full_receivable_id AND payment.settlement_transaction_id=settlement_id)
   OR NOT EXISTS(SELECT 1 FROM public.pdv_orders orders WHERE orders.id=full_sale_id AND orders.cash_session_id=origin_session) THEN
  RAISE EXCEPTION 'Quitação integral confundiu caixa de origem com recebedor';END IF;
 PERFORM public.pdv_party_reverse_receivable_settlement_v2(cust,settlement_id,bank,receiving_session,
  'Desfazer quitação total','fixture-partial-bank-full-reverse');
 IF public.pdv_party_obligation_open_v2(full_receivable_id)<>10
   OR (public.pdv_dre_cash_projection_v2(c,public.company_today(c),public.company_today(c),100,0)->>'revenue')::numeric<>(dre_before->>'revenue')::numeric
   OR (public.pdv_dfc_projection_v2(c,public.company_today(c),public.company_today(c),100,0)->>'cash_flow')::numeric<>(dfc_before->>'cash_flow')::numeric THEN
  RAISE EXCEPTION 'Quitação/estorno integral não reconciliou obrigação/DRE/DFC';END IF;
 -- Financeiro geral mantém banco sem caixa: não é pedido do PDV.
 INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,transaction_date,is_paid,customer_id,origin)
 VALUES(general_receivable,c,'entrada','Conta geral fixture',5,public.company_today(c),false,cust,'geral');
 result:=public.pdv_party_settle_receivables_v2(cust,
  jsonb_build_array(jsonb_build_object('receivable_id',general_receivable,'amount',5)),
  'pix',bank,NULL,public.company_today(c),'Recebimento fora do PDV','fixture-partial-bank-general-receive');
 general_settlement:=(result->>'financial_transaction_id')::uuid;
 IF public.pdv_party_obligation_open_v2(general_receivable)<>0 THEN RAISE EXCEPTION 'Banco geral sem caixa não quitou';END IF;
 statement:=public.pdv_party_account_statement_v3('customer',cust,'balance',100,0);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(statement->'entries') entry
   WHERE entry->>'id'=general_settlement::text AND entry->>'can_reverse'='true') THEN
  RAISE EXCEPTION 'Extrato ocultou banco geral sem caixa';END IF;
 PERFORM public.pdv_party_reverse_receivable_settlement_v2(cust,general_settlement,bank,NULL,
  'Estorno fora do PDV','fixture-partial-bank-general-reverse');
 IF public.pdv_party_obligation_open_v2(general_receivable)<>5 THEN RAISE EXCEPTION 'Banco geral sem caixa não estornou';END IF;
 -- Simula um recebimento histórico válido criado pela versão sem contexto.
 -- Conhecer sua chave/payload não autoriza contornar o gate no replay.
 historical_payload:=jsonb_build_object('allocations',jsonb_build_array(jsonb_build_object('receivable_id',receivable_id,'amount',1)),
  'method','pix','account_id',bank,'session_id',NULL,'received_on',public.company_today(c),'notes','Histórico sem contexto');
 SELECT * INTO historical_request FROM public.pdv_claim_operation_request(c,'receivable.settle.v2','fixture-partial-bank-historical',historical_payload);
 historical_settlement:=public.pdv_create_receivable_financial_v2(c,u,cust,bank,NULL,'pix',1,public.company_today(c),
  'Recebimento histórico fixture',historical_request.request_id,false);
 INSERT INTO public.pdv_receivable_settlement_allocations(company_id,customer_id,settlement_transaction_id,
   receivable_transaction_id,operation_request_id,allocation_kind,amount,settlement_method,cash_session_id,metadata,created_by)
 VALUES(c,cust,historical_settlement,receivable_id,historical_request.request_id,'settlement',1,'pix',NULL,'{}',u);
 PERFORM public.pdv_complete_operation_request(historical_request.request_id,'financial_transaction',historical_settlement,
  jsonb_build_object('ok',true,'financial_transaction_id',historical_settlement,'amount',1,'method','pix','cash_session_id',NULL,'idempotent',false));
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ub,'role','authenticated')::text,true);
 blocked:=false;BEGIN PERFORM public.pdv_party_settle_receivables_v2(cust,
   jsonb_build_array(jsonb_build_object('receivable_id',receivable_id,'amount',1)),
   'pix',bank,NULL,public.company_today(c),'Histórico sem contexto','fixture-partial-bank-historical');
 EXCEPTION WHEN insufficient_privilege OR check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Outro operador obteve replay histórico sem custódia';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 blocked:=false;detail:=NULL;BEGIN PERFORM public.pdv_party_settle_receivables_v2(cust,
   jsonb_build_array(jsonb_build_object('receivable_id',receivable_id,'amount',1)),
   'pix',bank,NULL,public.company_today(c),'Histórico sem contexto','fixture-partial-bank-historical');
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;blocked:=true;END;
 IF NOT blocked OR detail IS DISTINCT FROM 'code=pdv_receivable_receiving_context_required' THEN
  RAISE EXCEPTION 'Replay histórico sem contexto atravessou gate antes do claim';END IF;
 blocked:=false;detail:=NULL;BEGIN PERFORM public.pdv_party_reverse_receivable_settlement_v2(cust,historical_settlement,bank,NULL,
   'Não inferir caixa histórico','fixture-partial-bank-historical-reverse');
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;blocked:=true;END;
 IF NOT blocked OR detail IS DISTINCT FROM 'code=pdv_receivable_receiving_context_missing' THEN
  RAISE EXCEPTION 'Estorno histórico inventou caixa de atendimento';END IF;
END $behavior$;
ROLLBACK;

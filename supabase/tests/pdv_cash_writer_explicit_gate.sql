BEGIN;

DO $contract$
DECLARE v_name text; v_src text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'public.pdv_record_cash_event_v2(uuid,uuid,text,numeric,text,text,text)',
    'public.pdv_reverse_cash_event_v2(uuid,uuid,text,text)',
    'public.pdv_close_cash_session_v2(uuid,uuid,numeric,text,text)',
    'public.pdv_reopen_cash_session_v2(uuid,uuid,text,text)',
    'public.pdv_list_cash_sessions_v2(text,uuid,uuid,integer,integer)',
    'public.pdv_cash_session_detail_v2(uuid)',
    'public.pdv_cash_history_v2(uuid,uuid,integer,integer)',
    'public.pdv_cash_session_report_v2(uuid)'
  ] LOOP
    IF has_function_privilege('anon',v_name,'EXECUTE')
       OR NOT has_function_privilege('authenticated',v_name,'EXECUTE') THEN
      RAISE EXCEPTION 'ACL publica incorreta em %',v_name;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=v_name::regprocedure
      AND p.prosecdef AND 'search_path=pg_catalog, public'=ANY(p.proconfig)) THEN
      RAISE EXCEPTION '% perdeu SECURITY DEFINER/search_path',v_name;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'public.pdv_record_cash_event_core_018_v2(uuid,uuid,text,numeric,text,text,text)',
    'public.pdv_reverse_cash_event_core_018_v2(uuid,uuid,text,text)',
    'public.pdv_close_cash_session_core_018_v2(uuid,uuid,numeric,text,text)',
    'public.pdv_reopen_cash_session_core_018_v2(uuid,uuid,text,text)',
    'public.pdv_record_cash_event_explicit_core_018_v2(uuid,uuid,text,numeric,text,text,text)',
    'public.pdv_reverse_cash_event_explicit_core_018_v2(uuid,uuid,text,text)',
    'public.pdv_close_cash_session_explicit_core_018_v2(uuid,uuid,numeric,text,text)',
    'public.pdv_reopen_cash_session_explicit_core_018_v2(uuid,uuid,text,text)',
    'public.pdv_assert_cash_session_actor_v3(uuid,uuid,boolean,boolean)',
    'public.pdv_completed_cash_operation_replay_v3(text,text,jsonb)',
    'public.pdv_list_cash_sessions_wrapper_015_v2(text,uuid,uuid,integer,integer)',
    'public.pdv_cash_session_detail_wrapper_015_v2(uuid)',
    'public.pdv_cash_history_wrapper_015_v2(uuid,uuid,integer,integer)',
    'public.pdv_cash_session_report_wrapper_015_v2(uuid)',
    'public.pdv_cash_session_projection_v3(uuid,boolean)'
  ] LOOP
    IF has_function_privilege('authenticated',v_name,'EXECUTE')
       OR has_function_privilege('anon',v_name,'EXECUTE') THEN
      RAISE EXCEPTION 'core interno exposto em %',v_name;
    END IF;
  END LOOP;
  SELECT pg_get_functiondef('public.pdv_record_cash_event_v2(uuid,uuid,text,numeric,text,text,text)'::regprocedure) INTO v_src;
  IF strpos(v_src,'pdv_assert_cash_session_actor_v3')=0 OR strpos(v_src,'is_admin_or_gestor')>0
     OR strpos(v_src,'fn:edit_pdv_sales')>0 THEN RAISE EXCEPTION 'writer publico perdeu gate nominal'; END IF;
  SELECT pg_get_functiondef('public.pdv_reopen_cash_session_v2(uuid,uuid,text,text)'::regprocedure) INTO v_src;
  IF strpos(v_src,'fn:reopen_pdv_cash')=0 OR strpos(v_src,'pdv_assert_cash_session_actor_v3')=0 THEN
    RAISE EXCEPTION 'reabertura nao valida permissao e custodia antes do core'; END IF;
END $contract$;

DO $fixture$
DECLARE c uuid:='18000000-0000-4000-8000-000000000001'; c2 uuid:='18000000-0000-4000-8000-000000000002';
  ua uuid:='18000000-0000-4000-8000-000000000011'; ub uuid:='18000000-0000-4000-8000-000000000012';
  um uuid:='18000000-0000-4000-8000-000000000013'; ux uuid:='18000000-0000-4000-8000-000000000014';
  uo uuid:='18000000-0000-4000-8000-000000000015'; uw uuid:='18000000-0000-4000-8000-000000000016';
  us uuid:='18000000-0000-4000-8000-000000000017'; stock uuid:='18000000-0000-4000-8000-000000000021';
  account uuid:='18000000-0000-4000-8000-000000000022'; ta uuid:='18000000-0000-4000-8000-000000000031';
  tb uuid:='18000000-0000-4000-8000-000000000032'; sale uuid:='18000000-0000-4000-8000-000000000041';
  settlement uuid:='18000000-0000-4000-8000-000000000042'; sa uuid; sb uuid; r jsonb;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,
    email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',ua,'authenticated','authenticated','cash-a-018@example.invalid','',now(),'{}','{"full_name":"A"}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',ub,'authenticated','authenticated','cash-b-018@example.invalid','',now(),'{}','{"full_name":"B"}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',um,'authenticated','authenticated','manager-018@example.invalid','',now(),'{}','{"full_name":"M"}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',ux,'authenticated','authenticated','explicit-018@example.invalid','',now(),'{}','{"full_name":"X"}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',uo,'authenticated','authenticated','other-018@example.invalid','',now(),'{}','{"full_name":"O"}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',uw,'authenticated','authenticated','wildcard-018@example.invalid','',now(),'{}','{"full_name":"W"}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',us,'authenticated','authenticated','super-018@example.invalid','',now(),'{}','{"full_name":"S"}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Fixture 018','active'),(c2,'Outro tenant 018','active');
  UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(ua,ub,um,ux,uw,us);
  UPDATE public.profiles SET company_id=c2,is_active=true WHERE user_id=uo;
  INSERT INTO public.user_roles(user_id,role) VALUES(ua,'comercial'),(ub,'comercial'),(um,'admin'),
    (ux,'comercial'),(uo,'comercial'),(uw,'comercial'),(us,'super_admin');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (ua,'["screen:pdv","fn:manage_finance","fn:reopen_pdv_cash"]',true),(ub,'["screen:pdv","fn:manage_finance"]',true),
    (um,'["screen:pdv","fn:edit_pdv_sales","fn:reopen_pdv_cash"]',true),
    (ux,'["screen:pdv","fn:operate_other_pdv_cash","fn:reopen_pdv_cash","fn:manage_finance"]',true),
    (uo,'["screen:pdv","fn:operate_other_pdv_cash","fn:reopen_pdv_cash"]',true),
    (uw,'["*"]',true),(us,'["screen:pdv"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv'),(c2,'pdv');
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Mesmo estoque',true);
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
    VALUES(account,c,'Cofre 018','caixa',1000,true);
  INSERT INTO public.company_settings(company_id,name,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
    VALUES(c,'Config 018',account,true,'simples') ON CONFLICT(company_id) DO UPDATE
    SET pdv_cash_account_id=excluded.pdv_cash_account_id,pdv_strict_cash_tracking=true,pdv_mode='simples';
  INSERT INTO public.pdv_terminals(id,company_id,name,is_active,stock_id)
    VALUES(ta,c,'Caixa 01',true,stock),(tb,c,'Caixa 02',true,stock);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  r:=public.pdv_open_cash_session_v2(ta,account,100,'018-open-a'); sa:=(r->>'session_id')::uuid;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ub,'role','authenticated')::text,true);
  r:=public.pdv_open_cash_session_v2(tb,account,100,'018-open-b'); sb:=(r->>'session_id')::uuid;
  INSERT INTO public.pdv_orders(id,company_id,number,salesperson_id,stock_id,terminal_id,target_terminal_id,
    status,subtotal,total,cash_session_id,client_request_id,paid_at,delivered_at)
    VALUES(sale,c,180,ub,stock,tb,tb,'entregue',7,7,sb,'018-sale-settlement',now(),now());
  INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,category,
    transaction_date,paid_date,is_paid,origin,payment_method,created_by)
    VALUES(settlement,c,'entrada','Venda direta 018',7,'Venda PDV',current_date,current_date,true,'pdv','dinheiro',ub);
  INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,financial_account_id,created_by,
    contract_version,coverage_kind,coverage_status,settlement_status,settlement_transaction_id,authorized_at,settled_at)
    VALUES(c,sale,'dinheiro',7,account,ub,2,'cash','authorized','settled',settlement,now(),now());
  INSERT INTO public.pdv_cash_custody_entries(id,company_id,session_id,cash_account_id,entry_kind,amount,
    source_type,source_id,financial_transaction_id,metadata,created_by)
    VALUES('18000000-0000-4000-8000-000000000043',c,sb,account,'cash_receipt',7,
      'pdv_order',sale,settlement,'{"fixture":"sale_v2"}',ub);
  PERFORM set_config('pdv.test.session_a',sa::text,true); PERFORM set_config('pdv.test.session_b',sb::text,true);
END $fixture$;

SET LOCAL ROLE authenticated;

DO $behavior$
DECLARE ua uuid:='18000000-0000-4000-8000-000000000011'; um uuid:='18000000-0000-4000-8000-000000000013';
  ux uuid:='18000000-0000-4000-8000-000000000014'; uo uuid:='18000000-0000-4000-8000-000000000015';
  uw uuid:='18000000-0000-4000-8000-000000000016'; us uuid:='18000000-0000-4000-8000-000000000017';
  account uuid:='18000000-0000-4000-8000-000000000022'; sa uuid:=current_setting('pdv.test.session_a')::uuid;
  sb uuid:=current_setting('pdv.test.session_b')::uuid; sale uuid:='18000000-0000-4000-8000-000000000041';
  ta uuid:='18000000-0000-4000-8000-000000000031'; tb uuid:='18000000-0000-4000-8000-000000000032';
  sale_entry uuid:='18000000-0000-4000-8000-000000000043'; r jsonb; record_result jsonb;
  reverse_result jsonb; close_result jsonb; entry uuid; blocked boolean; visible_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  PERFORM public.pdv_cash_session_detail_v2(sa);
  blocked:=false; BEGIN PERFORM public.pdv_cash_session_detail_v2(sb); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'operador A leu Caixa B no mesmo estoque'; END IF;
  SELECT count(*) INTO visible_count FROM public.pdv_cash_sessions s WHERE s.id IN(sa,sb);
  IF visible_count<>1 THEN RAISE EXCEPTION 'RLS de sessoes nao isolou A/B'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_record_cash_event_v2(sb,account,'supply',1,'teste',NULL,'018-a-record-denied'); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'operador A registrou evento no Caixa B'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_reverse_cash_event_v2(sale_entry,account,'teste','018-a-reverse-denied'); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'operador A estornou evento do Caixa B'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_close_cash_session_v2(sb,account,107,NULL,'018-a-close-denied'); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'operador A fechou Caixa B'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_reopen_cash_session_v2(sb,account,'teste','018-a-reopen-denied'); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'permissao de reabrir sem cross-cash acessou Caixa B'; END IF;
  r:=public.pdv_cash_history_v2(NULL,NULL,0,20);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'terminals') t WHERE (t->>'id')::uuid=ta)
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(r->'terminals') t WHERE (t->>'id')::uuid=tb) THEN
    RAISE EXCEPTION 'filtros do historico revelaram caixa de outro operador';
  END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',um,'role','authenticated')::text,true);
  blocked:=false; BEGIN PERFORM public.pdv_record_cash_event_v2(sb,account,'supply',1,'teste',NULL,'018-manager-denied'); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'admin/fn:edit movimentou Caixa B sem permissao nominal'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_reverse_cash_event_v2(sale_entry,account,'teste','018-manager-reverse-denied'); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'admin/fn:edit estornou Caixa B sem permissao nominal'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_close_cash_session_v2(sb,account,107,NULL,'018-manager-close-denied'); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'admin/fn:edit fechou Caixa B sem permissao nominal'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_reopen_cash_session_v2(sb,account,'teste','018-manager-reopen-denied'); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'admin com reopen acessou Caixa B sem permissao nominal'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_list_cash_sessions_v2('aberta',NULL,NULL,0,20); EXCEPTION WHEN OTHERS THEN blocked:=true; END;
  IF blocked THEN RAISE EXCEPTION 'gestor sem cross perdeu leitura propria fail-closed'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ux,'role','authenticated')::text,true);
  r:=public.pdv_cash_session_detail_v2(sb);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'entries') item WHERE (item->>'order_id')::uuid=sale) THEN
    RAISE EXCEPTION 'entrada de venda v2 perdeu order_id pela liquidacao canonica';
  END IF;
  r:=public.pdv_cash_history_v2(NULL,NULL,0,20);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'terminals') t WHERE (t->>'id')::uuid=ta)
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'terminals') t WHERE (t->>'id')::uuid=tb) THEN
    RAISE EXCEPTION 'permissao nominal nao recebeu os filtros de caixas autorizados';
  END IF;
  record_result:=public.pdv_record_cash_event_v2(sb,account,'cash_receipt',10,'Receita teste',NULL,'018-explicit-record');
  entry:=(record_result->>'entry_id')::uuid;
  reverse_result:=public.pdv_reverse_cash_event_v2(entry,account,'Correção teste','018-explicit-reverse');
  close_result:=public.pdv_close_cash_session_v2(sb,account,100,NULL,'018-explicit-close');
  IF public.pdv_record_cash_event_v2(sb,account,'cash_receipt',10,'Receita teste',NULL,'018-explicit-record')
       IS DISTINCT FROM record_result THEN RAISE EXCEPTION 'replay de evento mudou apos fechamento'; END IF;
  IF public.pdv_reverse_cash_event_v2(entry,account,'Correção teste','018-explicit-reverse')
       IS DISTINCT FROM reverse_result THEN RAISE EXCEPTION 'replay de estorno mudou apos fechamento'; END IF;
  IF public.pdv_close_cash_session_v2(sb,account,100,NULL,'018-explicit-close')
       IS DISTINCT FROM close_result THEN RAISE EXCEPTION 'replay de fechamento mudou apos sucesso'; END IF;
  PERFORM public.pdv_cash_session_report_v2(sb);
  PERFORM public.pdv_cash_history_v2(NULL,NULL,0,20);
  PERFORM public.pdv_reopen_cash_session_v2(sb,account,'Conferência autorizada','018-explicit-reopen');

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uw,'role','authenticated')::text,true);
  PERFORM public.pdv_cash_session_detail_v2(sa);
  r:=public.pdv_list_cash_sessions_v2('aberta',NULL,NULL,0,20);
  IF COALESCE((r->>'can_manage_others')::boolean,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'wildcard nao recebeu capacidade cross-cash';
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',us,'role','authenticated')::text,true);
  PERFORM public.pdv_cash_session_detail_v2(sa);
  r:=public.pdv_list_cash_sessions_v2('aberta',NULL,NULL,0,20);
  IF COALESCE((r->>'can_manage_others')::boolean,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'super_admin nao recebeu capacidade cross-cash';
  END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uo,'role','authenticated')::text,true);
  blocked:=false; BEGIN PERFORM public.pdv_cash_session_detail_v2(sa); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'usuario de outro tenant leu Caixa A'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_record_cash_event_v2(sa,account,'supply',1,'teste',NULL,'018-tenant-denied'); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'usuario de outro tenant escreveu no Caixa A'; END IF;
END $behavior$;

RESET ROLE;

UPDATE public.user_permissions SET permissions='["fn:operate_other_pdv_cash","fn:reopen_pdv_cash"]'::jsonb
 WHERE user_id='18000000-0000-4000-8000-000000000014';
SET LOCAL ROLE authenticated;
DO $screen_revoked$
DECLARE ux uuid:='18000000-0000-4000-8000-000000000014'; sa uuid:=current_setting('pdv.test.session_a')::uuid;
  sb uuid:=current_setting('pdv.test.session_b')::uuid; account uuid:='18000000-0000-4000-8000-000000000022'; blocked boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ux,'role','authenticated')::text,true);
  blocked:=false; BEGIN PERFORM public.pdv_cash_session_detail_v2(sa); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'detail ignorou screen revogada'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_list_cash_sessions_v2('aberta',NULL,NULL,0,20); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'list ignorou screen revogada'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_cash_history_v2(NULL,NULL,0,20); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'history ignorou screen revogada'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_cash_session_report_v2(sa); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'report ignorou screen revogada'; END IF;
  blocked:=false; BEGIN
    PERFORM public.pdv_record_cash_event_v2(sb,account,'cash_receipt',10,'Receita teste',NULL,'018-explicit-record');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'replay financeiro ignorou screen revogada'; END IF;
END $screen_revoked$;
RESET ROLE;

UPDATE public.user_permissions
 SET permissions='["screen:pdv","fn:operate_other_pdv_cash","fn:reopen_pdv_cash","fn:manage_finance"]'::jsonb
 WHERE user_id='18000000-0000-4000-8000-000000000014';
UPDATE public.companies SET subscription_status='inactive'
 WHERE id='18000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $subscription_revoked$
DECLARE ux uuid:='18000000-0000-4000-8000-000000000014'; sa uuid:=current_setting('pdv.test.session_a')::uuid;
  sb uuid:=current_setting('pdv.test.session_b')::uuid; account uuid:='18000000-0000-4000-8000-000000000022'; blocked boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ux,'role','authenticated')::text,true);
  blocked:=false; BEGIN PERFORM public.pdv_cash_session_detail_v2(sa); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'detail ignorou assinatura inativa'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_cash_session_report_v2(sa); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'report ignorou assinatura inativa'; END IF;
  blocked:=false; BEGIN
    PERFORM public.pdv_record_cash_event_v2(sb,account,'cash_receipt',10,'Receita teste',NULL,'018-explicit-record');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'replay financeiro ignorou assinatura inativa'; END IF;
END $subscription_revoked$;
RESET ROLE;

UPDATE public.companies SET subscription_status='active'
 WHERE id='18000000-0000-4000-8000-000000000001';
DELETE FROM public.company_modules WHERE company_id='18000000-0000-4000-8000-000000000001' AND module_code='pdv';
SET LOCAL ROLE authenticated;
DO $module_revoked$
DECLARE ux uuid:='18000000-0000-4000-8000-000000000014'; sa uuid:=current_setting('pdv.test.session_a')::uuid;
  blocked boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ux,'role','authenticated')::text,true);
  blocked:=false; BEGIN PERFORM public.pdv_cash_session_detail_v2(sa); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'detail ignorou modulo revogado'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_cash_session_report_v2(sa); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'report ignorou modulo revogado'; END IF;
END $module_revoked$;
RESET ROLE;

INSERT INTO public.company_modules(company_id,module_code)
 VALUES('18000000-0000-4000-8000-000000000001','pdv');
UPDATE public.profiles SET is_active=false WHERE user_id='18000000-0000-4000-8000-000000000014';
SET LOCAL ROLE authenticated;
DO $profile_revoked$
DECLARE ux uuid:='18000000-0000-4000-8000-000000000014'; sa uuid:=current_setting('pdv.test.session_a')::uuid;
  blocked boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ux,'role','authenticated')::text,true);
  blocked:=false; BEGIN PERFORM public.pdv_cash_session_detail_v2(sa); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'detail ignorou perfil inativo'; END IF;
  blocked:=false; BEGIN PERFORM public.pdv_cash_session_report_v2(sa); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'report ignorou perfil inativo'; END IF;
END $profile_revoked$;
RESET ROLE;

ROLLBACK;

BEGIN;

DO $contract$
DECLARE v_src text;
BEGIN
  IF has_function_privilege('anon',
       'public.pdv_registrar_compra_material_direta_v2(uuid,uuid,uuid,uuid,uuid,jsonb,date,uuid,uuid,boolean,date,date,text,text,text)',
       'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.pdv_registrar_compra_material_direta_v2(uuid,uuid,uuid,uuid,uuid,jsonb,date,uuid,uuid,boolean,date,date,text,text,text)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'ACL publica da compra pelo Caixa esta incorreta';
  END IF;
  IF has_function_privilege('authenticated',
       'public.registrar_compra_material_direta_core_019(uuid,uuid,uuid,jsonb,date,uuid,uuid,boolean,date,date,text,text,text)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'core da compra direta ficou exposto';
  END IF;

  SELECT pg_get_functiondef(
    'public.pdv_registrar_compra_material_direta_v2(uuid,uuid,uuid,uuid,uuid,jsonb,date,uuid,uuid,boolean,date,date,text,text,text)'::regprocedure
  ) INTO v_src;
  IF strpos(v_src,'pdv_assert_cash_session_actor_v3')=0
     OR strpos(v_src,'s.terminal_id=p_terminal_id')=0
     OR strpos(v_src,'t.stock_id=p_stock_id')=0
     OR strpos(v_src,'pdv_can_operate_other_cash_v2(v_uid)')=0
     OR strpos(v_src,'''cash.event.v2''')=0
     OR strpos(v_src,'''operation'',''direct_purchase''')=0
     OR strpos(v_src,'round(sum(round(x.quantity,4)*round(x.unit_price,2)),2)')=0
     OR strpos(v_src,'registrar_compra_material_direta_core_019')=0
     OR strpos(v_src,'financial_transaction_id')=0
     OR strpos(v_src,'''cash_payment'',-v_total')=0 THEN
    RAISE EXCEPTION 'wrapper perdeu contexto, total canonico ou vinculo de custodia';
  END IF;
  IF strpos(v_src,'pdv_record_cash_event_v2')>0
     OR strpos(v_src,'INSERT INTO public.financial_transactions')>0
     OR strpos(v_src,'is_admin_or_gestor')>0
     OR strpos(v_src,'fn:edit_pdv_sales')>0 THEN
    RAISE EXCEPTION 'wrapper duplicou financeiro ou reabriu gate por cargo';
  END IF;
  IF strpos(v_src,'PDV_CASH_PURCHASE_ITEMS_REQUIRED')=0
     OR strpos(v_src,'PDV_CASH_PURCHASE_ITEMS_LIMIT')=0
     OR strpos(v_src,'PDV_CASH_PURCHASE_ITEMS_LIMIT')>strpos(v_src,'jsonb_to_recordset(p_items)') THEN
    RAISE EXCEPTION 'payload de itens nao falha com erro de dominio antes do recordset';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.pdv_cash_custody_entries'::regclass
       AND conname='pdv_cash_custody_entries_request_kind_unique'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND tablename='pdv_cash_custody_entries'
       AND indexname='uniq_pdv_cash_custody_financial_transaction'
  ) THEN
    RAISE EXCEPTION 'custodia perdeu as barreiras de idempotencia 1:1';
  END IF;
END $contract$;

DO $fixture$
DECLARE
  c uuid:='19000000-0000-4000-8000-000000000001';
  c2 uuid:='19000000-0000-4000-8000-000000000002';
  ua uuid:='19000000-0000-4000-8000-000000000011';
  ub uuid:='19000000-0000-4000-8000-000000000012';
  um uuid:='19000000-0000-4000-8000-000000000013';
  ux uuid:='19000000-0000-4000-8000-000000000014';
  uo uuid:='19000000-0000-4000-8000-000000000015';
  stock uuid:='19000000-0000-4000-8000-000000000021';
  account uuid:='19000000-0000-4000-8000-000000000022';
  ta uuid:='19000000-0000-4000-8000-000000000031';
  tb uuid:='19000000-0000-4000-8000-000000000032';
  sa uuid; sb uuid; r jsonb;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,
    email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',ua,'authenticated','authenticated','cash-a-019@example.invalid','',now(),'{}','{"full_name":"A"}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',ub,'authenticated','authenticated','cash-b-019@example.invalid','',now(),'{}','{"full_name":"B"}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',um,'authenticated','authenticated','manager-019@example.invalid','',now(),'{}','{"full_name":"M"}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',ux,'authenticated','authenticated','explicit-019@example.invalid','',now(),'{}','{"full_name":"X"}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',uo,'authenticated','authenticated','other-019@example.invalid','',now(),'{}','{"full_name":"O"}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Fixture 019','active'),(c2,'Outro tenant 019','active');
  UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(ua,ub,um,ux);
  UPDATE public.profiles SET company_id=c2,is_active=true WHERE user_id=uo;
  INSERT INTO public.user_roles(user_id,role) VALUES
    (ua,'comercial'),(ub,'comercial'),(um,'admin'),(ux,'comercial'),(uo,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (ua,'["screen:pdv","fn:manage_finance"]',true),
    (ub,'["screen:pdv","fn:manage_finance"]',true),
    (um,'["screen:pdv","fn:edit_pdv_sales"]',true),
    (ux,'["screen:pdv","fn:operate_other_pdv_cash"]',true),
    (uo,'["screen:pdv","fn:operate_other_pdv_cash"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv'),(c2,'pdv');
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Mesmo estoque',true);
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active)
    VALUES(account,c,'Cofre 019','caixa',1000,true);
  INSERT INTO public.company_settings(company_id,name,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
    VALUES(c,'Config 019',account,true,'simples') ON CONFLICT(company_id) DO UPDATE
    SET pdv_cash_account_id=excluded.pdv_cash_account_id,pdv_strict_cash_tracking=true,pdv_mode='simples';
  INSERT INTO public.pdv_terminals(id,company_id,name,is_active,stock_id)
    VALUES(ta,c,'Caixa 01',true,stock),(tb,c,'Caixa 02',true,stock);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  r:=public.pdv_open_cash_session_v2(ta,account,100,'019-open-a'); sa:=(r->>'session_id')::uuid;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ub,'role','authenticated')::text,true);
  r:=public.pdv_open_cash_session_v2(tb,account,100,'019-open-b'); sb:=(r->>'session_id')::uuid;
  PERFORM set_config('pdv.test.019.session_a',sa::text,true);
  PERFORM set_config('pdv.test.019.session_b',sb::text,true);
END $fixture$;

SET LOCAL ROLE authenticated;

DO $behavior$
DECLARE
  ua uuid:='19000000-0000-4000-8000-000000000011';
  um uuid:='19000000-0000-4000-8000-000000000013';
  ux uuid:='19000000-0000-4000-8000-000000000014';
  uo uuid:='19000000-0000-4000-8000-000000000015';
  stock uuid:='19000000-0000-4000-8000-000000000021';
  ta uuid:='19000000-0000-4000-8000-000000000031';
  tb uuid:='19000000-0000-4000-8000-000000000032';
  sa uuid:=current_setting('pdv.test.019.session_a')::uuid;
  sb uuid:=current_setting('pdv.test.019.session_b')::uuid;
  da uuid:='19000000-0000-4000-8000-000000000041';
  db uuid:='19000000-0000-4000-8000-000000000042';
  blocked boolean; n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  PERFORM public.pdv_get_purchase_cash_context_v2(sa,ta,stock);
  blocked:=false;
  BEGIN PERFORM public.pdv_get_purchase_cash_context_v2(sb,tb,stock);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'operador A confirmou o Caixa B no mesmo estoque'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',um,'role','authenticated')::text,true);
  blocked:=false;
  BEGIN PERFORM public.pdv_get_purchase_cash_context_v2(sb,tb,stock);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'admin/edit sales acessou Caixa B sem permissao nominal'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uo,'role','authenticated')::text,true);
  blocked:=false;
  BEGIN PERFORM public.pdv_get_purchase_cash_context_v2(sa,ta,stock);
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'outro tenant acessou o Caixa A'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ux,'role','authenticated')::text,true);
  PERFORM public.pdv_get_purchase_cash_context_v2(sa,ta,stock);
  PERFORM public.pdv_get_purchase_cash_context_v2(sb,tb,stock);
  PERFORM public.pdv_save_order_draft_v2(da,'purchase',
    jsonb_build_object('id',da,'sequence',1,'items','[]'::jsonb,'purchaseDate',current_date::text),
    0,'19000000-0000-4000-8000-000000000051',sa,ta,stock);
  PERFORM public.pdv_save_order_draft_v2(db,'purchase',
    jsonb_build_object('id',db,'sequence',1,'items','[]'::jsonb,'purchaseDate',current_date::text),
    0,'19000000-0000-4000-8000-000000000052',sb,tb,stock);
  SELECT count(*) INTO n FROM public.pdv_list_order_drafts_v2('purchase',sa,ta,stock,false);
  IF n<>1 THEN RAISE EXCEPTION 'rascunho do Caixa A misturou o Caixa B'; END IF;
  SELECT count(*) INTO n FROM public.pdv_list_order_drafts_v2('purchase',sb,tb,stock,false);
  IF n<>1 THEN RAISE EXCEPTION 'rascunho do Caixa B misturou o Caixa A'; END IF;
END $behavior$;

RESET ROLE;
ROLLBACK;

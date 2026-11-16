-- Fixtures exclusivamente fictícias; executar após migrations em banco de teste.
-- Não altera flags globais, coorte demo nem saldos reais. Toda escrita faz rollback.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $contract$
DECLARE fn text; src text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.pdv_returns_v2_enabled_internal(uuid)', 'public.pdv_after_sale_v2_enabled_internal(uuid)'] LOOP
    src := pg_get_functiondef(fn::regprocedure);
    IF position('pdv_direct_sale_v2_enabled_internal' IN src) = 0 OR src LIKE '%app_feature_flags%' THEN
      RAISE EXCEPTION 'Disponibilidade ainda depende de rollout: %', fn;
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE') OR has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Helper interno exposto: %', fn;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.pdv_get_module_features_v3()', 'EXECUTE') OR NOT has_function_privilege('authenticated', 'public.pdv_get_module_features_v3()', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL da disponibilidade pública incorreta';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pdv_order_drafts' AND policyname='pdv_drafts_context_entitlement_v3' AND permissive='RESTRICTIVE') THEN
    RAISE EXCEPTION 'Leitura REST de rascunhos sem gate de contexto';
  END IF;
  -- Custódia e gates operacionais continuam antes dos livros/writers.
  FOREACH fn IN ARRAY ARRAY['public.pdv_get_returnable_order_v2(uuid)', 'public.pdv_get_after_sale_workspace_v2(uuid)', 'public.pdv_return_delivery_items_v2(uuid,jsonb,jsonb,date,text,text)'] LOOP
    IF position('pdv_assert_order_cash_access_v2' IN pg_get_functiondef(fn::regprocedure))=0 THEN RAISE EXCEPTION 'Custódia retirada de %',fn; END IF;
  END LOOP;
END $contract$;

DO $fixture$
DECLARE
  c uuid:='f3160100-0000-4000-8000-000000000001'; cx uuid:='f3160100-0000-4000-8000-000000000002';
  ua uuid:='f3160100-0000-4000-8000-000000000011'; ub uuid:='f3160100-0000-4000-8000-000000000012'; ux uuid:='f3160100-0000-4000-8000-000000000013';
  stock uuid:='f3160100-0000-4000-8000-000000000021'; account uuid:='f3160100-0000-4000-8000-000000000022'; customer uuid:='f3160100-0000-4000-8000-000000000023';
  ta uuid:='f3160100-0000-4000-8000-000000000031'; tb uuid:='f3160100-0000-4000-8000-000000000032'; sa uuid; sb uuid; r jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM public.companies WHERE id IN(c,cx)) OR EXISTS(SELECT 1 FROM auth.users WHERE id IN(ua,ub,ux)) THEN RAISE EXCEPTION 'IDs de fixture já existem'; END IF;
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now(),'','','',''
    FROM (VALUES(ua,'availability-a@example.invalid'),(ub,'availability-b@example.invalid'),(ux,'availability-x@example.invalid')) fixture(id,email);
  INSERT INTO public.companies(id,name,subscription_status) VALUES(c,'Fixture comum sem coorte','active'),(cx,'Outro tenant de fixture','active');
  UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id IN(ua,ub);
  UPDATE public.profiles SET company_id=cx,is_active=true WHERE user_id=ux;
  INSERT INTO public.user_roles(user_id,role) VALUES(ua,'comercial'),(ub,'comercial'),(ux,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active)
    SELECT id,'["screen:pdv","screen:pdv_orders","screen:pdv_dispatch","fn:return_pdv_order","fn:view_pdv_after_sale","fn:issue_pdv_voucher","fn:refund_pdv_return"]'::jsonb,true FROM (VALUES(ua),(ub),(ux)) users(id);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv'),(cx,'pdv');
  -- Fixture ordinária não participa de nenhuma allowlist e não depende de conta demo.
  IF EXISTS(SELECT 1 FROM public.app_feature_flags WHERE c=ANY(company_allowlist) OR cx=ANY(company_allowlist)) THEN RAISE EXCEPTION 'Fixture inesperadamente em coorte de rollout'; END IF;
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock,c,'Local fixture',false);
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES(account,c,'Caixa fixture','caixa',1000,true);
  INSERT INTO public.customers(id,company_id,name,is_deleted) VALUES(customer,c,'Cliente fictício',false);
  INSERT INTO public.company_settings(company_id,name,timezone,pdv_cash_account_id,pdv_strict_cash_tracking,pdv_mode)
    VALUES(c,'Config fixture','America/Sao_Paulo',account,true,'simples') ON CONFLICT(company_id) DO UPDATE SET pdv_cash_account_id=account,pdv_strict_cash_tracking=true,pdv_mode='simples';
  INSERT INTO public.pdv_terminals(id,company_id,name,is_active,stock_id) VALUES(ta,c,'Caixa A',true,stock),(tb,c,'Caixa B',true,stock);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  r:=public.pdv_open_cash_session_v2(ta,account,0,'module-availability-open-a');sa:=(r->>'session_id')::uuid;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ub,'role','authenticated')::text,true);
  r:=public.pdv_open_cash_session_v2(tb,account,0,'module-availability-open-b');sb:=(r->>'session_id')::uuid;
  INSERT INTO public.pdv_orders(id,company_id,number,customer_id,stock_id,status,subtotal,total,cash_session_id,terminal_id,contract_version)
    VALUES('f3160100-0000-4000-8000-000000000041',c,1601001,customer,stock,'entregue',0,0,sa,ta,2),
          ('f3160100-0000-4000-8000-000000000042',c,1601002,customer,stock,'entregue',0,0,sb,tb,2);
  -- O segundo rascunho simula snapshot histórico próprio, mas em caixa alheio.
  INSERT INTO public.pdv_order_drafts(id,company_id,created_by,draft_type,payload,revision,last_client_request_id,cash_session_id,terminal_id,stock_id)
    VALUES('f3160100-0000-4000-8000-000000000051',c,ua,'sale','{"sequence":1,"cart":{"lines":[]},"transactionDate":"2026-11-16"}',1,gen_random_uuid(),sa,ta,stock),
          ('f3160100-0000-4000-8000-000000000052',c,ua,'sale','{"sequence":2,"cart":{"lines":[]},"transactionDate":"2026-11-16"}',1,gen_random_uuid(),sb,tb,stock);
  PERFORM set_config('pdv.test.availability.session_a',sa::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
END $fixture$;

SET LOCAL ROLE authenticated;
DO $ordinary_company$
DECLARE r jsonb; denied boolean;
BEGIN
  r:=public.pdv_get_module_features_v3();
  IF r->>'company_id'<>'f3160100-0000-4000-8000-000000000001' OR r->>'module_available'<>'true' OR r->>'returns'<>'true' OR r->>'after_sale'<>'true' OR r#>>'{capabilities,return}'<>'true' THEN RAISE EXCEPTION 'Empresa comum ficou bloqueada por rollout'; END IF;
  PERFORM public.pdv_get_returnable_order_v2('f3160100-0000-4000-8000-000000000041');
  PERFORM public.pdv_get_after_sale_workspace_v2('f3160100-0000-4000-8000-000000000041');
  IF NOT EXISTS(SELECT 1 FROM public.pdv_order_drafts WHERE id='f3160100-0000-4000-8000-000000000051') THEN RAISE EXCEPTION 'Rascunho próprio oculto'; END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_order_drafts WHERE id='f3160100-0000-4000-8000-000000000052') THEN RAISE EXCEPTION 'SELECT REST revelou snapshot de outro caixa'; END IF;
  denied:=false; BEGIN PERFORM public.pdv_get_returnable_order_v2('f3160100-0000-4000-8000-000000000042'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Devolução revelou caixa B'; END IF;
  denied:=false; BEGIN PERFORM public.pdv_get_after_sale_workspace_v2('f3160100-0000-4000-8000-000000000042'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Pós-venda revelou caixa B'; END IF;
  denied:=false; BEGIN PERFORM public.pdv_restore_order_draft('f3160100-0000-4000-8000-000000000052',1,gen_random_uuid()); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Restore contornou contexto do caixa'; END IF;
END $ordinary_company$;
RESET ROLE;

DO $action_revocation$
BEGIN
  UPDATE public.user_permissions SET permissions='["screen:pdv","screen:pdv_orders"]' WHERE user_id='f3160100-0000-4000-8000-000000000011';
END $action_revocation$;
SET LOCAL ROLE authenticated;
DO $actions_denied$
DECLARE r jsonb; denied boolean;
BEGIN
  r:=public.pdv_get_module_features_v3();
  IF r->>'module_available'<>'true' OR r->>'returns'<>'true' OR r#>>'{capabilities,return}'<>'false' OR r#>>'{capabilities,issue_voucher}'<>'false' THEN RAISE EXCEPTION 'Permissão virou disponibilidade ou ação foi liberada por módulo'; END IF;
  denied:=false; BEGIN PERFORM public.pdv_return_delivery_items_v2('f3160100-0000-4000-8000-000000000041','[]','[]',current_date,'Fixture sem permissão','module-return-denied'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Módulo concedeu ação de devolução'; END IF;
  denied:=false; BEGIN PERFORM public.pdv_get_after_sale_workspace_v2('f3160100-0000-4000-8000-000000000041'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Módulo concedeu leitura financeira do pós-venda'; END IF;
END $actions_denied$;
RESET ROLE;

DO $revocations$
DECLARE scenario text; r jsonb; denied boolean;
  c uuid:='f3160100-0000-4000-8000-000000000001'; ua uuid:='f3160100-0000-4000-8000-000000000011';
BEGIN
  FOREACH scenario IN ARRAY ARRAY['expired','inactive_subscription','module_revoked','inactive_profile','unknown_profile','screen_revoked','foreign_tenant','no_session','stock_revoked'] LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','service_role')::text,true);
    UPDATE public.companies SET subscription_status='active',subscription_expires_at=NULL WHERE id=c;
    INSERT INTO public.company_modules(company_id,module_code) VALUES(c,'pdv') ON CONFLICT DO NOTHING;
    UPDATE public.profiles SET company_id=c,is_active=true WHERE user_id=ua;
    UPDATE public.user_permissions SET permissions='["screen:pdv","screen:pdv_orders","fn:view_pdv_after_sale","fn:return_pdv_order"]',is_active=true WHERE user_id=ua;
    DELETE FROM public.stock_access WHERE stock_id='f3160100-0000-4000-8000-000000000021';
    IF scenario='expired' THEN UPDATE public.companies SET subscription_expires_at=now()-interval '10 days' WHERE id=c;
    ELSIF scenario='inactive_subscription' THEN UPDATE public.companies SET subscription_status='inactive' WHERE id=c;
    ELSIF scenario='module_revoked' THEN DELETE FROM public.company_modules WHERE company_id=c AND module_code='pdv';
    ELSIF scenario='inactive_profile' THEN UPDATE public.profiles SET is_active=false WHERE user_id=ua;
    ELSIF scenario='unknown_profile' THEN
      BEGIN UPDATE public.profiles SET is_active=NULL WHERE user_id=ua;
      EXCEPTION WHEN not_null_violation THEN
        -- Schemas com NOT NULL já recusam o estado desconhecido na persistência.
        UPDATE public.profiles SET is_active=false WHERE user_id=ua;
      END;
    ELSIF scenario='screen_revoked' THEN UPDATE public.user_permissions SET permissions='[]' WHERE user_id=ua;
    ELSIF scenario='foreign_tenant' THEN UPDATE public.profiles SET company_id='f3160100-0000-4000-8000-000000000002' WHERE user_id=ua;
    ELSIF scenario='no_session' THEN PERFORM set_config('request.jwt.claims','{}',true);
    ELSIF scenario='stock_revoked' THEN INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(c,'f3160100-0000-4000-8000-000000000021','f3160100-0000-4000-8000-000000000012');
    END IF;
    IF scenario<>'no_session' THEN PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true); END IF;
    EXECUTE 'SET LOCAL ROLE authenticated';
    r:=public.pdv_get_module_features_v3();
    IF scenario NOT IN('foreign_tenant','stock_revoked') AND r->>'returns'<>'false' THEN RAISE EXCEPTION 'Feature aberta em %',scenario; END IF;
    IF scenario IN('expired','inactive_subscription','module_revoked','inactive_profile','unknown_profile','no_session') AND r->>'module_available'<>'false' THEN RAISE EXCEPTION 'Entitlement aberto em %',scenario; END IF;
    IF EXISTS(SELECT 1 FROM public.pdv_order_drafts WHERE company_id=c) THEN RAISE EXCEPTION 'Rascunho vazou em %',scenario; END IF;
    denied:=false; BEGIN PERFORM public.pdv_get_returnable_order_v2('f3160100-0000-4000-8000-000000000041'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'Devolução ignorou %',scenario; END IF;
    denied:=false; BEGIN PERFORM public.pdv_get_after_sale_workspace_v2('f3160100-0000-4000-8000-000000000041'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
    IF NOT denied THEN RAISE EXCEPTION 'Pós-venda ignorou %',scenario; END IF;
    IF scenario<>'foreign_tenant' THEN
      denied:=false; BEGIN PERFORM public.pdv_list_order_drafts_v2('sale',current_setting('pdv.test.availability.session_a')::uuid,'f3160100-0000-4000-8000-000000000031','f3160100-0000-4000-8000-000000000021',false); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
      IF NOT denied THEN RAISE EXCEPTION 'Rascunho RPC ignorou %',scenario; END IF;
    END IF;
    EXECUTE 'RESET ROLE';
  END LOOP;
END $revocations$;
ROLLBACK;

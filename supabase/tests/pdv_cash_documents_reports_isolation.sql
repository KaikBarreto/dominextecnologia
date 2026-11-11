-- P0: documentos, anexos e relatorios nao cruzam Caixa A/B.
-- Executar em banco descartavel depois de todas as migrations.
BEGIN;

DO $contract$
DECLARE v_fn text; v_src text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_get_order_receipt_snapshot_v3(uuid)',
    'public.pdv_partial_projection_report_v3(text,date,date,integer,integer)',
    'public.pdv_global_event_history_v3(date,date,uuid,integer,integer)',
    'public.pdv_document_index_v3(integer,integer)'
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE')
       OR NOT has_function_privilege('authenticated',v_fn,'EXECUTE') THEN
      RAISE EXCEPTION 'ACL publica incorreta em %',v_fn;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_proc procedure WHERE procedure.oid=v_fn::regprocedure
      AND procedure.prosecdef AND EXISTS(SELECT 1 FROM unnest(procedure.proconfig) setting
        WHERE setting LIKE 'search_path=%')) THEN
      RAISE EXCEPTION 'RPC sem SECURITY DEFINER/search_path em %',v_fn;
    END IF;
  END LOOP;
  SELECT pg_get_functiondef(
    'public.pdv_partial_projection_report_v3(text,date,date,integer,integer)'::regprocedure
  ) INTO v_src;
  IF position('pdv_current_actor_has_explicit_permission_v3' in v_src)=0
     OR position('source_record_id' in v_src)=0
     OR position('entry-' in v_src)=0 THEN
    RAISE EXCEPTION 'agregado global expõe IDs ou aceita financeiro implícito';
  END IF;
  SELECT pg_get_functiondef(
    'public.pdv_global_event_history_v3(date,date,uuid,integer,integer)'::regprocedure
  ) INTO v_src;
  IF position('pdv_current_actor_has_explicit_permission_v3' in v_src)=0 THEN
    RAISE EXCEPTION 'historico global aceita financeiro implícito';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_get_order_receipt_snapshot_v2(uuid)',
    'public.pdv_partial_projection_report_v2(text,date,date,integer,integer)',
    'public.pdv_global_event_history_v2(date,date,uuid,integer,integer)',
    'public.pdv_document_index_v2(integer,integer)'
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE')
       OR has_function_privilege('authenticated',v_fn,'EXECUTE') THEN
      RAISE EXCEPTION 'RPC v2 insegura ainda publica: %',v_fn;
    END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_policies policy
    WHERE policy.schemaname='public' AND policy.tablename='pdv_order_attachments'
      AND policy.policyname='pdv_order_attachments_select_cash_v3'
      AND policy.qual LIKE '%pdv_current_actor_can_access_order_v3%') THEN
    RAISE EXCEPTION 'anexo nao herda custodia do pedido';
  END IF;
  IF (SELECT count(*) FROM pg_policies policy
      WHERE policy.schemaname='public' AND policy.tablename='pdv_order_attachments')<>3
     OR EXISTS(SELECT 1 FROM pg_policies policy
      WHERE policy.schemaname='public' AND policy.tablename='pdv_order_attachments'
        AND policy.policyname NOT IN(
          'pdv_order_attachments_select_cash_v3',
          'pdv_order_attachments_insert_cash_v3',
          'pdv_order_attachments_delete_cash_v3'
        )) THEN
    RAISE EXCEPTION 'policy company-only antiga ainda abre anexos por OR';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies policy
    WHERE policy.schemaname='storage' AND policy.tablename='objects'
      AND policy.policyname='pdv_financial_receipts_select_cash_v3'
      AND policy.permissive='RESTRICTIVE'
      AND policy.qual LIKE '%cardinality(storage.foldername(name)) = 3%'
      AND policy.qual LIKE '%pdv_storage_order_id_v3%'
      AND policy.qual LIKE '%pdv_current_actor_can_access_order_v3%') THEN
    RAISE EXCEPTION 'storage PDV nao possui policy RESTRICTIVE por pedido';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies policy
    WHERE policy.schemaname='storage' AND policy.tablename='objects'
      AND policy.policyname='pdv_financial_receipts_update_cash_v3'
      AND policy.permissive='RESTRICTIVE'
      AND policy.cmd='UPDATE'
      AND policy.qual NOT LIKE '%pdv_current_actor_can_access_order_v3%'
      AND policy.with_check NOT LIKE '%pdv_current_actor_can_access_order_v3%'
      AND policy.qual LIKE '%IS DISTINCT FROM%pdv-orders%'
      AND policy.with_check LIKE '%IS DISTINCT FROM%pdv-orders%') THEN
    RAISE EXCEPTION 'storage PDV permite atualizar ou mover artefato append-only';
  END IF;
  SELECT pg_get_functiondef('public.pdv_get_order_receipt_snapshot_v3(uuid)'::regprocedure) INTO v_src;
  IF position('pdv_order_actor_can_access_v2' in v_src)=0 THEN
    RAISE EXCEPTION 'comprovante nao valida custodia do pedido';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_partial_projection_report_v3(text,date,date,integer,integer)',
    'public.pdv_global_event_history_v3(date,date,uuid,integer,integer)',
    'public.pdv_document_index_v3(integer,integer)'
  ] LOOP
    SELECT pg_get_functiondef(v_fn::regprocedure) INTO v_src;
    IF position('pdv_can_operate_other_cash_v2' in v_src)=0
       OR position('pdv_cross_cash_report_denied' in v_src)=0 THEN
      RAISE EXCEPTION 'relatorio nao exige permissao nominal: %',v_fn;
    END IF;
  END LOOP;
  IF public.pdv_storage_order_id_v3('empresa/pdv-orders/invalido/arquivo.pdf') IS NOT NULL
     OR public.pdv_storage_order_id_v3('empresa/finance/arquivo.pdf') IS NOT NULL THEN
    RAISE EXCEPTION 'parser de storage aceitou caminho adulterado';
  END IF;
END
$contract$;

DO $isolation$
DECLARE
  company_a uuid:='f1600000-0000-4000-8000-000000000001';
  company_b uuid:='f1600000-0000-4000-8000-000000000002';
  user_a uuid:='f1600000-0000-4000-8000-000000000011';
  user_b uuid:='f1600000-0000-4000-8000-000000000012';
  user_other uuid:='f1600000-0000-4000-8000-000000000013';
  account_a uuid:='f1600000-0000-4000-8000-000000000021';
  account_b uuid:='f1600000-0000-4000-8000-000000000022';
  terminal_a uuid:='f1600000-0000-4000-8000-000000000031';
  terminal_b uuid:='f1600000-0000-4000-8000-000000000032';
  terminal_other uuid:='f1600000-0000-4000-8000-000000000033';
  session_a uuid:='f1600000-0000-4000-8000-000000000041';
  session_b uuid:='f1600000-0000-4000-8000-000000000042';
  session_other uuid:='f1600000-0000-4000-8000-000000000043';
  order_a uuid:='f1600000-0000-4000-8000-000000000051';
  order_b uuid:='f1600000-0000-4000-8000-000000000052';
  order_other uuid:='f1600000-0000-4000-8000-000000000053';
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,
    email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',user_a,'authenticated','authenticated','docs-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',user_b,'authenticated','authenticated','docs-b@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',user_other,'authenticated','authenticated','docs-other@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES
    (company_a,'Documentos Caixa A/B','active'),(company_b,'Documentos Outro tenant','active');
  UPDATE public.profiles SET company_id=company_a,is_active=TRUE WHERE user_id IN(user_a,user_b);
  UPDATE public.profiles SET company_id=company_b,is_active=TRUE WHERE user_id=user_other;
  INSERT INTO public.user_roles(user_id,role) VALUES
    (user_a,'comercial'),(user_b,'gestor'),(user_other,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (user_a,'["screen:pdv","screen:pdv_reports"]',TRUE),
    (user_b,'["screen:pdv","screen:pdv_reports"]',TRUE),
    (user_other,'["screen:pdv","screen:pdv_reports"]',TRUE);
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES
    (account_a,company_a,'Conta Caixa A/B','caixa',1000,TRUE),
    (account_b,company_b,'Conta Outro tenant','caixa',1000,TRUE);
  INSERT INTO public.pdv_terminals(id,company_id,name) VALUES
    (terminal_a,company_a,'Caixa A'),(terminal_b,company_a,'Caixa B'),
    (terminal_other,company_b,'Caixa Outro');
  INSERT INTO public.pdv_cash_sessions(id,company_id,terminal_id,opened_by,opening_amount,status,
    cash_account_id,cash_account_name_snapshot,cash_policy_snapshot,contract_version) VALUES
    (session_a,company_a,terminal_a,user_a,100,'aberta',account_a,'Conta Caixa A/B','{}',2),
    (session_b,company_a,terminal_b,user_b,100,'aberta',account_a,'Conta Caixa A/B','{}',2),
    (session_other,company_b,terminal_other,user_other,100,'aberta',account_b,'Conta Outro tenant','{}',2);
  INSERT INTO public.pdv_orders(id,company_id,number,salesperson_id,terminal_id,status,subtotal,total,
    cash_session_id,client_request_id,contract_version,operation_mode_snapshot) VALUES
    (order_a,company_a,1601,user_a,terminal_a,'pago',10,10,session_a,'docs-order-a',2,'direct'),
    (order_b,company_a,1602,user_b,terminal_b,'pago',20,20,session_b,'docs-order-b',2,'direct'),
    (order_other,company_b,1603,user_other,terminal_other,'pago',30,30,session_other,'docs-order-other',2,'direct');

  IF public.pdv_order_actor_can_access_v2(order_a,user_a) IS DISTINCT FROM TRUE
     OR public.pdv_order_actor_can_access_v2(order_b,user_a)
     OR public.pdv_order_actor_can_access_v2(order_a,user_b)
     OR public.pdv_order_actor_can_access_v2(order_other,user_a) THEN
    RAISE EXCEPTION 'Caixa A/B ou outro tenant vazou sem permissao nominal';
  END IF;

  -- Ser gestor nao concede acesso. Somente a permissao nominal libera outro
  -- Caixa da mesma empresa, nunca outro tenant.
  UPDATE public.user_permissions
     SET permissions=permissions||'["fn:operate_other_pdv_cash"]'::jsonb
   WHERE user_id=user_b;
  IF public.pdv_order_actor_can_access_v2(order_a,user_b) IS DISTINCT FROM TRUE
     OR public.pdv_order_actor_can_access_v2(order_other,user_b) THEN
    RAISE EXCEPTION 'permissao cruzada ignorou empresa ou nao liberou Caixa A';
  END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_a,'role','authenticated')::text,TRUE);
  IF public.pdv_current_actor_can_access_order_v3(order_a) IS DISTINCT FROM TRUE
     OR public.pdv_current_actor_can_access_order_v3(order_b) THEN
    RAISE EXCEPTION 'wrapper current-user aceitou pedido do Caixa B';
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_b,'role','authenticated')::text,TRUE);
  IF public.pdv_current_actor_can_access_order_v3(order_a) IS DISTINCT FROM TRUE
     OR public.pdv_current_actor_can_access_order_v3(order_other) THEN
    RAISE EXCEPTION 'wrapper com permissao vazou outro tenant';
  END IF;
END
$isolation$;

ROLLBACK;

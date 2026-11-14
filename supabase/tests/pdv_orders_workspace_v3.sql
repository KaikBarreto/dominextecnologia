-- Tela geral de Pedidos: dois caixas no mesmo estoque nunca se misturam.
-- Executar em banco descartável depois de todas as migrations.
BEGIN;

DO $contract$
DECLARE v_source text; v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_list_orders_workspace_v3(text,text,text,text,uuid,uuid,date,date,text,integer,integer)',
    'public.pdv_get_order_workspace_v3(uuid)'
  ] LOOP
    IF has_function_privilege('anon',v_fn,'EXECUTE')
       OR NOT has_function_privilege('authenticated',v_fn,'EXECUTE') THEN
      RAISE EXCEPTION 'ACL incorreta em %',v_fn;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=v_fn::regprocedure AND p.prosecdef
      AND EXISTS(SELECT 1 FROM unnest(p.proconfig) setting WHERE setting LIKE 'search_path=%')) THEN
      RAISE EXCEPTION 'RPC sem SECURITY DEFINER/search_path em %',v_fn;
    END IF;
  END LOOP;
  SELECT pg_get_functiondef('public.pdv_order_workspace_can_access_v3(public.pdv_orders,uuid,boolean)'::regprocedure) INTO v_source;
  IF position('pdv_cash_sessions' in v_source)=0 OR position('pdv_preorders' in v_source)=0
     OR position('target_terminal_id' in v_source)=0 THEN
    RAISE EXCEPTION 'custodia do pedido não cobre venda, caixa e handoff';
  END IF;
  SELECT pg_get_functiondef('public.pdv_orders_workspace_context_v3()'::regprocedure) INTO v_source;
  IF position('pdv_can_operate_other_cash_v2' in v_source)=0
     OR position('is_admin_or_gestor' in v_source)>0 THEN
    RAISE EXCEPTION 'acesso entre caixas não usa a permissão nominal';
  END IF;
  SELECT pg_get_functiondef('public.pdv_get_order_workspace_v3(uuid)'::regprocedure) INTO v_source;
  IF position('pdv_order_workspace_can_access_v3' in v_source)=0
     OR position('coverage_status=''authorized''' in v_source)=0
     OR position('pdv_refund_events' in v_source)=0
     OR position('item_type' in v_source)=0 THEN
    RAISE EXCEPTION 'detalhe perdeu custódia ou fatos canônicos';
  END IF;
END
$contract$;

DO $isolation$
DECLARE
  company_a uuid:='f1700000-0000-4000-8000-000000000001';
  company_b uuid:='f1700000-0000-4000-8000-000000000002';
  user_a uuid:='f1700000-0000-4000-8000-000000000011';
  user_b uuid:='f1700000-0000-4000-8000-000000000012';
  user_other uuid:='f1700000-0000-4000-8000-000000000013';
  terminal_a uuid:='f1700000-0000-4000-8000-000000000021';
  terminal_b uuid:='f1700000-0000-4000-8000-000000000022';
  terminal_other uuid:='f1700000-0000-4000-8000-000000000023';
  session_a uuid:='f1700000-0000-4000-8000-000000000031';
  session_b uuid:='f1700000-0000-4000-8000-000000000032';
  session_other uuid:='f1700000-0000-4000-8000-000000000033';
  order_a uuid:='f1700000-0000-4000-8000-000000000041';
  order_b uuid:='f1700000-0000-4000-8000-000000000042';
  order_other uuid:='f1700000-0000-4000-8000-000000000043';
  account_a uuid:='f1700000-0000-4000-8000-000000000051';
  account_b uuid:='f1700000-0000-4000-8000-000000000052';
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token) VALUES
    ('00000000-0000-0000-0000-000000000000',user_a,'authenticated','authenticated','orders-a@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',user_b,'authenticated','authenticated','orders-b@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',user_other,'authenticated','authenticated','orders-other@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES (company_a,'Pedidos A/B','active'),(company_b,'Pedidos outro tenant','active');
  UPDATE public.profiles SET company_id=company_a,is_active=true WHERE user_id IN(user_a,user_b);
  UPDATE public.profiles SET company_id=company_b,is_active=true WHERE user_id=user_other;
  INSERT INTO public.user_roles(user_id,role) VALUES (user_a,'comercial'),(user_b,'gestor'),(user_other,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (user_a,'["screen:pdv_orders"]',true),(user_b,'["screen:pdv_orders"]',true),(user_other,'["screen:pdv_orders"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES
    (company_a,'pdv'),(company_b,'pdv');
  INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,is_active) VALUES
    (account_a,company_a,'Cofre A/B','caixa',1000,true),(account_b,company_b,'Cofre outro','caixa',1000,true);
  INSERT INTO public.pdv_terminals(id,company_id,name) VALUES
    (terminal_a,company_a,'Caixa A'),(terminal_b,company_a,'Caixa B'),(terminal_other,company_b,'Caixa outro');
  INSERT INTO public.pdv_cash_sessions(id,company_id,terminal_id,opened_by,opening_amount,status,cash_account_id,cash_account_name_snapshot,cash_policy_snapshot,contract_version) VALUES
    (session_a,company_a,terminal_a,user_a,100,'aberta',account_a,'Cofre A/B','{}',2),
    (session_b,company_a,terminal_b,user_b,100,'aberta',account_a,'Cofre A/B','{}',2),
    (session_other,company_b,terminal_other,user_other,100,'aberta',account_b,'Cofre outro','{}',2);
  INSERT INTO public.pdv_orders(id,company_id,number,salesperson_id,terminal_id,status,subtotal,total,cash_session_id,client_request_id,contract_version,operation_mode_snapshot) VALUES
    (order_a,company_a,1701,user_a,terminal_a,'pago',10,10,session_a,'orders-a',2,'direct'),
    -- O vendedor A criou o pedido B, mas a custódia já foi entregue ao Caixa B.
    -- A autoria comercial não pode reabrir acesso depois do handoff.
    (order_b,company_a,1702,user_a,terminal_b,'pago',20,20,session_b,'orders-b',2,'direct'),
    (order_other,company_b,1703,user_other,terminal_other,'pago',30,30,session_other,'orders-other',2,'direct');

  IF public.pdv_order_workspace_can_access_v3((SELECT o FROM public.pdv_orders o WHERE id=order_a),user_a,false) IS DISTINCT FROM true
     OR public.pdv_order_workspace_can_access_v3((SELECT o FROM public.pdv_orders o WHERE id=order_b),user_a,false)
     OR public.pdv_order_workspace_can_access_v3((SELECT o FROM public.pdv_orders o WHERE id=order_a),user_b,false)
     OR public.pdv_order_workspace_can_access_v3((SELECT o FROM public.pdv_orders o WHERE id=order_other),user_a,true) THEN
    RAISE EXCEPTION 'pedido vazou entre Caixa A/B ou entre empresas';
  END IF;

  -- Gestor continua isolado. Só a permissão nominal libera o outro Caixa da
  -- mesma empresa; nem ela atravessa tenant.
  UPDATE public.user_permissions SET permissions=permissions||'["fn:operate_other_pdv_cash"]'::jsonb WHERE user_id=user_b;
  IF public.pdv_can_operate_other_cash_v2(user_b) IS DISTINCT FROM true
     OR public.pdv_order_workspace_can_access_v3((SELECT o FROM public.pdv_orders o WHERE id=order_a),user_b,true) IS DISTINCT FROM true
     OR public.pdv_order_workspace_can_access_v3((SELECT o FROM public.pdv_orders o WHERE id=order_other),user_b,true) THEN
    RAISE EXCEPTION 'permissão nominal não respeitou empresa';
  END IF;
END
$isolation$;

SET LOCAL ROLE authenticated;

DO $public_rpc$
DECLARE
  user_a uuid:='f1700000-0000-4000-8000-000000000011';
  user_b uuid:='f1700000-0000-4000-8000-000000000012';
  terminal_a uuid:='f1700000-0000-4000-8000-000000000021';
  terminal_b uuid:='f1700000-0000-4000-8000-000000000022';
  order_a uuid:='f1700000-0000-4000-8000-000000000041';
  order_b uuid:='f1700000-0000-4000-8000-000000000042';
  order_other uuid:='f1700000-0000-4000-8000-000000000043';
  result jsonb; denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_a,'role','authenticated')::text,true);
  result:=public.pdv_list_orders_workspace_v3(p_page=>0,p_page_size=>1);
  IF (result->>'total')::integer<>1 OR jsonb_array_length(result->'rows')<>1
     OR (result->'rows'->0->>'id')::uuid IS DISTINCT FROM order_a
     OR (result->>'can_filter_cash')::boolean THEN
    RAISE EXCEPTION 'lista pública do operador A misturou Caixa B ou paginação';
  END IF;
  PERFORM public.pdv_get_order_workspace_v3(order_a);
  denied:=false;
  BEGIN PERFORM public.pdv_get_order_workspace_v3(order_b);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'UUID direto do Caixa B foi aceito para A'; END IF;
  denied:=false;
  BEGIN PERFORM public.pdv_list_orders_workspace_v3(p_terminal_id=>terminal_b);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'filtro adulterado abriu Caixa B para A'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',user_b,'role','authenticated')::text,true);
  result:=public.pdv_list_orders_workspace_v3(p_terminal_id=>terminal_a,p_page=>0,p_page_size=>25);
  IF (result->>'total')::integer<>1 OR (result->'rows'->0->>'id')::uuid IS DISTINCT FROM order_a
     OR (result->>'can_filter_cash')::boolean IS DISTINCT FROM true
     OR jsonb_array_length(result->'cash_options')<2
     OR jsonb_array_length(result->'operator_options')<2 THEN
    RAISE EXCEPTION 'permissão nominal não liberou filtro/opções seguras';
  END IF;
  PERFORM public.pdv_get_order_workspace_v3(order_b);
  denied:=false;
  BEGIN PERFORM public.pdv_get_order_workspace_v3(order_other);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'detalhe público atravessou tenant'; END IF;
END
$public_rpc$;

RESET ROLE;

ROLLBACK;

-- Smoke W5-01: projeção segura para histórico e disposição financeira.
BEGIN;

DO $contract$
DECLARE v_src text;
BEGIN
  IF has_function_privilege('anon', 'public.pdv_get_return_context_v2(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.pdv_get_return_context_v2(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL pública incorreta na projeção W5';
  END IF;
  SELECT pg_get_functiondef('public.pdv_get_return_context_v2(uuid)'::regprocedure) INTO v_src;
  IF NOT EXISTS (
       SELECT 1 FROM pg_proc procedure
        WHERE procedure.oid = 'public.pdv_get_return_context_v2(uuid)'::regprocedure
          AND procedure.prosecdef
          AND 'search_path=pg_catalog, public' = ANY(procedure.proconfig)
     )
     OR position('company_id = v_context.company_id' in v_src) = 0
     OR position('fn:return_pdv_order' in v_src) = 0
     OR position('fn:reverse_pdv_return' in v_src) = 0
     OR position('fn:cancel_pdv_order_residual' in v_src) = 0
     OR position('event_kind' in v_src) = 0
     OR position('reversal_of_id' in v_src) = 0
     OR position('open_amount' in v_src) = 0 THEN
    RAISE EXCEPTION 'projeção W5 perdeu hardening de tenant/permissão';
  END IF;
  IF v_src ~* '(cmv|unit_cost|cost_price|credit_limit|purchase_capacity|document|email|phone|cpf|cnpj)' THEN
    RAISE EXCEPTION 'projeção W5 contém campo proibido';
  END IF;
END
$contract$;

DO $behavior$
DECLARE
  ca uuid := 'b1395000-0000-4000-8000-000000000001';
  cb uuid := 'b1395000-0000-4000-8000-000000000002';
  ua uuid := 'b1395000-0000-4000-8000-000000000011';
  denied uuid := 'b1395000-0000-4000-8000-000000000012';
  customer_a uuid := 'b1395000-0000-4000-8000-000000000021';
  customer_b uuid := 'b1395000-0000-4000-8000-000000000022';
  stock_a uuid := 'b1395000-0000-4000-8000-000000000023';
  order_a uuid := 'b1395000-0000-4000-8000-000000000031';
  order_b uuid := 'b1395000-0000-4000-8000-000000000032';
  receivable_a uuid := 'b1395000-0000-4000-8000-000000000041';
  result jsonb;
  denied_state text;
BEGIN
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  VALUES
    ('00000000-0000-0000-0000-000000000000',ua,'authenticated','authenticated','w5-projection@example.invalid','',now(),'{}','{}',now(),now(),'','','',''),
    ('00000000-0000-0000-0000-000000000000',denied,'authenticated','authenticated','w5-projection-denied@example.invalid','',now(),'{}','{}',now(),now(),'','','','');
  INSERT INTO public.companies(id,name,subscription_status) VALUES(ca,'W5 Projeção A','active'),(cb,'W5 Projeção B','active');
  UPDATE public.profiles SET company_id=ca,is_active=true WHERE user_id IN(ua,denied);
  INSERT INTO public.user_roles(user_id,role) VALUES(ua,'comercial'),(denied,'comercial');
  INSERT INTO public.user_permissions(user_id,permissions,is_active) VALUES
    (ua,'["screen:pdv_dispatch","fn:return_pdv_order"]',true),
    (denied,'["screen:pdv_dispatch"]',true);
  INSERT INTO public.company_modules(company_id,module_code) VALUES(ca,'basic'),(ca,'pdv'),(cb,'basic'),(cb,'pdv');
  UPDATE public.app_feature_flags SET company_allowlist=ARRAY[ca,cb]::uuid[] WHERE key='pdv_returns_v2';
  INSERT INTO public.customers(id,company_id,name,is_deleted) VALUES(customer_a,ca,'Cliente A',false),(customer_b,cb,'Cliente B',false);
  INSERT INTO public.stocks(id,company_id,name,is_default) VALUES(stock_a,ca,'Estoque projeção',true);
  INSERT INTO public.pdv_orders(id,company_id,number,customer_id,stock_id,status,subtotal,total,client_request_id) VALUES
    (order_a,ca,1395001,customer_a,stock_a,'retirada_parcial',100,100,'w5-projection-order-a'),
    (order_b,cb,1395002,customer_b,NULL,'retirada_parcial',90,90,'w5-projection-order-b');
  INSERT INTO public.financial_transactions(id,company_id,transaction_type,description,amount,transaction_date,due_date,
    is_paid,amount_received,customer_id,origin,pdv_financial_role)
  VALUES(receivable_a,ca,'entrada','Fiado do pedido',100,public.company_today(ca),public.company_today(ca)+7,false,20,customer_a,'pdv','pdv_receivable_principal');
  INSERT INTO public.pdv_order_payments(company_id,order_id,method,amount,contract_version,coverage_kind,coverage_status,
    settlement_status,receivable_transaction_id,authorized_at,created_by)
  VALUES(ca,order_a,'fiado',100,2,'receivable','authorized','open',receivable_a,now(),ua);

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ua,'role','authenticated')::text,true);
  result := public.pdv_get_return_context_v2(order_a);
  IF result->>'order_id' <> order_a::text
     OR jsonb_array_length(result->'receivables') <> 1
     OR (result->'receivables'->0->>'open_amount')::numeric <> 80
     OR result::text ~* '(cmv|cost|limit|document|email|phone)' THEN
    RAISE EXCEPTION 'payload seguro incorreto: %', result;
  END IF;

  denied_state := NULL;
  BEGIN PERFORM public.pdv_get_return_context_v2(order_b);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_state = RETURNED_SQLSTATE; END;
  IF denied_state IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'projeção cruzou tenant'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',denied,'role','authenticated')::text,true);
  denied_state := NULL;
  BEGIN PERFORM public.pdv_get_return_context_v2(order_a);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_state = RETURNED_SQLSTATE; END;
  IF denied_state IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'perfil sem ação consultou projeção'; END IF;

  INSERT INTO public.stock_access(company_id,stock_id,user_id) VALUES(ca,stock_a,ua);
  UPDATE public.user_permissions SET permissions='["screen:pdv_dispatch","fn:return_pdv_order"]'::jsonb
   WHERE user_id=denied;
  denied_state := NULL;
  BEGIN PERFORM public.pdv_get_return_context_v2(order_a);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS denied_state = RETURNED_SQLSTATE; END;
  IF denied_state IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'projeção ignorou ACL same-tenant'; END IF;
END
$behavior$;

ROLLBACK;

-- Contrato estrutural do fluxo Chamado -> triagem -> OS.
-- Executar em banco migrado:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--   -f supabase/tests/portal_calls_triage_security.sql

BEGIN;

DO $test$
DECLARE
  v_customer_rpc text;
  v_contract_rpc text;
BEGIN
  IF to_regclass('public.portal_calls') IS NULL THEN
    RAISE EXCEPTION 'portal_calls nao foi criada';
  END IF;

  IF has_table_privilege('anon', 'public.portal_calls', 'SELECT')
     OR has_table_privilege('anon', 'public.portal_calls', 'INSERT')
     OR has_table_privilege('authenticated', 'public.portal_calls', 'INSERT')
     OR has_table_privilege('authenticated', 'public.portal_calls', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.portal_calls', 'DELETE')
  THEN
    RAISE EXCEPTION 'portal_calls possui privilegio direto indevido';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.portal_calls', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated perdeu leitura RLS de portal_calls';
  END IF;

  IF NOT has_function_privilege(
    'anon',
    'public.create_customer_portal_ticket(text,text,text,uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'anon',
    'public.create_contract_portal_ticket(text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'RPC publica de chamado nao executavel por anon';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.convert_portal_call_to_service_order(uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.close_portal_call_without_os(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'RPC interna de triagem exposta a anon';
  END IF;

  SELECT pg_get_functiondef(
    'public.create_customer_portal_ticket(text,text,text,uuid)'::regprocedure
  ) INTO v_customer_rpc;
  SELECT pg_get_functiondef(
    'public.create_contract_portal_ticket(text,text,text)'::regprocedure
  ) INTO v_contract_rpc;

  IF position('INSERT INTO public.portal_calls' IN v_customer_rpc) = 0
     OR position('INSERT INTO public.portal_calls' IN v_contract_rpc) = 0
  THEN
    RAISE EXCEPTION 'RPC publica nao grava na caixa de entrada portal_calls';
  END IF;

  IF position('INSERT INTO public.service_orders' IN v_customer_rpc) > 0
     OR position('INSERT INTO public.service_orders' IN v_contract_rpc) > 0
  THEN
    RAISE EXCEPTION 'RPC publica ainda cria OS automaticamente';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'service_orders'
       AND t.tgname IN ('trg_portal_ticket_antispam', 'trg_notify_portal_ticket_created')
       AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'trigger legado de chamado permanece em service_orders';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'portal_calls'
       AND t.tgname = 'check_portal_call_antispam_before_insert'
       AND NOT t.tgisinternal
  ) OR NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'portal_calls'
       AND t.tgname = 'notify_portal_call_created_after_insert'
       AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'antispam/notificacao nao foram movidos para portal_calls';
  END IF;
END;
$test$;

DO $flow$
DECLARE
  v_company_a uuid := gen_random_uuid();
  v_company_b uuid := gen_random_uuid();
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_customer_a uuid := gen_random_uuid();
  v_customer_b uuid := gen_random_uuid();
  v_contract_a uuid;
  v_contract_b uuid;
  v_token_a text;
  v_token_b text;
  v_call_a uuid;
  v_call_b uuid;
  v_close_call uuid;
  v_service_order uuid;
  v_first jsonb;
  v_retry jsonb;
  v_before_os_count integer;
  v_after_os_count integer;
  v_cross_tenant_blocked boolean := false;
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000', v_user_a,
      'authenticated', 'authenticated',
      'portal-call-a-' || v_user_a::text || '@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Operador Chamados A"}'::jsonb,
      now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_user_b,
      'authenticated', 'authenticated',
      'portal-call-b-' || v_user_b::text || '@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Operador Chamados B"}'::jsonb,
      now(), now(), '', '', '', ''
    );

  INSERT INTO public.companies (
    id, name, subscription_status, subscription_expires_at
  ) VALUES
    (v_company_a, 'Empresa Chamados A', 'active', NULL),
    (v_company_b, 'Empresa Chamados B', 'active', NULL);

  UPDATE public.profiles
     SET company_id = v_company_a, is_active = true
   WHERE user_id = v_user_a;
  UPDATE public.profiles
     SET company_id = v_company_b, is_active = true
   WHERE user_id = v_user_b;

  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_user_a, 'gestor'::public.app_role),
    (v_user_b, 'gestor'::public.app_role);

  INSERT INTO public.user_permissions (user_id, permissions, is_active) VALUES
    (v_user_a, '["screen:service_orders","fn:create_os","fn:edit_os"]'::jsonb, true),
    (v_user_b, '["screen:service_orders","fn:create_os","fn:edit_os"]'::jsonb, true);

  INSERT INTO public.company_modules (company_id, module_code) VALUES
    (v_company_a, 'customer_portal'),
    (v_company_b, 'customer_portal');

  INSERT INTO public.customers (id, company_id, name, customer_type) VALUES
    (v_customer_a, v_company_a, 'Cliente Chamados A', 'pj'),
    (v_customer_b, v_company_b, 'Cliente Chamados B', 'pj');

  INSERT INTO public.contracts (
    company_id, customer_id, name, start_date, status, portal_is_public
  ) VALUES (
    v_company_a, v_customer_a, 'Contrato Chamados A', current_date, 'active', true
  ) RETURNING id, public_pmoc_token INTO v_contract_a, v_token_a;

  INSERT INTO public.contracts (
    company_id, customer_id, name, start_date, status, portal_is_public
  ) VALUES (
    v_company_b, v_customer_b, 'Contrato Chamados B', current_date, 'active', true
  ) RETURNING id, public_pmoc_token INTO v_contract_b, v_token_b;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  SELECT count(*) INTO v_before_os_count
    FROM public.service_orders
   WHERE customer_id = v_customer_a;

  v_first := public.create_contract_portal_ticket(
    v_token_a,
    'Solicitacao valida que ainda precisa passar pela triagem'
  );
  v_call_a := (v_first->>'portal_call_id')::uuid;

  SELECT count(*) INTO v_after_os_count
    FROM public.service_orders
   WHERE customer_id = v_customer_a;

  IF v_call_a IS NULL
     OR v_first ? 'service_order_id'
     OR v_after_os_count <> v_before_os_count
     OR NOT EXISTS (
       SELECT 1 FROM public.portal_calls pc
        WHERE pc.id = v_call_a
          AND pc.company_id = v_company_a
          AND pc.customer_id = v_customer_a
          AND pc.contract_id = v_contract_a
          AND pc.source = 'contract'
          AND pc.status = 'aguardando_analise'
          AND pc.service_order_id IS NULL
     )
  THEN
    RAISE EXCEPTION 'envio publico criou OS ou nao criou chamado aguardando: %', v_first;
  END IF;

  v_first := public.create_contract_portal_ticket(
    v_token_b,
    'Solicitacao de outro tenant para provar isolamento na conversao'
  );
  v_call_b := (v_first->>'portal_call_id')::uuid;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );

  v_first := public.convert_portal_call_to_service_order(v_call_a);
  v_service_order := (v_first->>'service_order_id')::uuid;
  v_retry := public.convert_portal_call_to_service_order(v_call_a);

  IF v_service_order IS NULL
     OR COALESCE((v_first->>'already_converted')::boolean, true)
     OR COALESCE((v_retry->>'already_converted')::boolean, false) IS NOT TRUE
     OR (v_retry->>'service_order_id')::uuid IS DISTINCT FROM v_service_order
     OR (SELECT count(*) FROM public.service_orders so WHERE so.customer_id = v_customer_a) <> v_before_os_count + 1
     OR NOT EXISTS (
       SELECT 1 FROM public.service_orders so
        WHERE so.id = v_service_order
          AND so.company_id = v_company_a
          AND so.customer_id = v_customer_a
          AND so.contract_id = v_contract_a
          AND so.origin = 'portal'
          AND so.created_by = v_user_a
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.portal_calls pc
        WHERE pc.id = v_call_a
          AND pc.status = 'convertido'
          AND pc.service_order_id = v_service_order
          AND pc.resolved_by = v_user_a
          AND pc.resolved_at IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'conversao nao foi atomica/idempotente: first=%, retry=%', v_first, v_retry;
  END IF;

  BEGIN
    PERFORM public.convert_portal_call_to_service_order(v_call_b);
  EXCEPTION WHEN no_data_found THEN
    v_cross_tenant_blocked := true;
  END;

  IF NOT v_cross_tenant_blocked OR EXISTS (
    SELECT 1 FROM public.portal_calls pc
     WHERE pc.id = v_call_b
       AND (pc.status <> 'aguardando_analise' OR pc.service_order_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'usuario do tenant A conseguiu converter chamado do tenant B';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_first := public.create_contract_portal_ticket(
    v_token_a,
    'Solicitacao que sera encerrada explicitamente sem gerar uma OS'
  );
  v_close_call := (v_first->>'portal_call_id')::uuid;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );
  v_first := public.close_portal_call_without_os(v_close_call);
  v_retry := public.close_portal_call_without_os(v_close_call);

  IF COALESCE((v_first->>'already_closed')::boolean, true)
     OR COALESCE((v_retry->>'already_closed')::boolean, false) IS NOT TRUE
     OR NOT EXISTS (
       SELECT 1 FROM public.portal_calls pc
        WHERE pc.id = v_close_call
          AND pc.status = 'encerrado_sem_os'
          AND pc.service_order_id IS NULL
          AND pc.resolved_by = v_user_a
     )
  THEN
    RAISE EXCEPTION 'encerramento sem OS nao foi idempotente: first=%, retry=%', v_first, v_retry;
  END IF;
END;
$flow$;

ROLLBACK;

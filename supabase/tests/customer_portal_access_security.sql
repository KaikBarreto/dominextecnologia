-- Smoke transacional do Portal do Cliente. Executar em banco migrado:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/customer_portal_access_security.sql
BEGIN;

DO $test$
DECLARE
  v_company_id uuid;
  v_customer_a uuid;
  v_customer_b uuid;
  v_equipment_id uuid;
  v_equipment_b uuid;
  v_token_a text;
  v_token_b text;
  v_contract_id uuid;
  v_contract_token text;
  v_result jsonb;
  v_session_a text;
  v_session_rotated text;
  v_ticket_blocked boolean := false;
  v_inactive_ticket_blocked boolean := false;
  v_cross_equipment_blocked boolean := false;
  v_expired_ticket_blocked boolean := false;
  v_short_password_blocked boolean := false;
  v_long_password_blocked boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  IF has_table_privilege('anon', 'public.customer_portal_credentials', 'SELECT')
     OR has_table_privilege('authenticated', 'public.customer_portal_credentials', 'SELECT')
     OR has_table_privilege('anon', 'public.customer_portal_sessions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.customer_portal_sessions', 'SELECT')
  THEN
    RAISE EXCEPTION 'hash/sessao do portal exposto a client role';
  END IF;

  IF has_table_privilege('anon', 'public.service_orders', 'INSERT') THEN
    RAISE EXCEPTION 'INSERT anon direto de chamado ainda liberado';
  END IF;

  IF has_function_privilege('anon', 'public.save_customer_portal_settings(uuid,boolean,boolean,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RPC administrativa do portal exposta a anon';
  END IF;

  SELECT co.id INTO v_company_id
    FROM public.companies co
   WHERE public.company_has_module(co.id, 'customer_portal')
   ORDER BY co.created_at
   LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'fixture_company_with_customer_portal_unavailable';
  END IF;

  -- A vigencia e parte do teste e o ROLLBACK restaura o estado original.
  UPDATE public.companies
     SET subscription_status = 'active', subscription_expires_at = NULL
   WHERE id = v_company_id;

  INSERT INTO public.customers (company_id, name, customer_type)
  VALUES (v_company_id, 'Cliente Portal Teste A', 'pj')
  RETURNING id INTO v_customer_a;

  INSERT INTO public.customers (company_id, name, customer_type)
  VALUES (v_company_id, 'Cliente Portal Teste B', 'pj')
  RETURNING id INTO v_customer_b;

  SELECT token INTO v_token_a FROM public.customer_portals WHERE customer_id = v_customer_a;
  SELECT token INTO v_token_b FROM public.customer_portals WHERE customer_id = v_customer_b;

  v_result := public.get_portal_data(v_token_b, NULL);
  IF v_result->>'access' <> 'granted' THEN
    RAISE EXCEPTION 'portal sem senha nao liberou acesso pelo link: %', v_result;
  END IF;

  IF public.get_portal_data('token-inexistente-para-qa', NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'token inexistente revelou payload';
  END IF;

  INSERT INTO public.contracts (
    company_id, customer_id, name, start_date, status, portal_is_public
  ) VALUES (
    v_company_id, v_customer_a, 'Contrato Portal Teste', current_date, 'active', true
  )
  RETURNING id, public_pmoc_token INTO v_contract_id, v_contract_token;

  v_result := public.create_contract_portal_ticket(
    v_contract_token, 'Chamado válido pelo portal do contrato'
  );
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE
     OR NOT EXISTS (
       SELECT 1 FROM public.service_orders so
        WHERE so.id = (v_result->>'service_order_id')::uuid
          AND so.contract_id = v_contract_id
          AND so.customer_id = v_customer_a
          AND so.company_id = v_company_id
     )
  THEN
    RAISE EXCEPTION 'RPC do portal do contrato nao preservou abertura segura de chamado: %', v_result;
  END IF;

  INSERT INTO public.equipment (company_id, customer_id, name, custom_fields)
  VALUES (v_company_id, v_customer_a, 'Equipamento que deve ficar oculto', '{"segredo":"nao pode sair"}'::jsonb)
  RETURNING id INTO v_equipment_id;

  INSERT INTO public.equipment (company_id, customer_id, name)
  VALUES (v_company_id, v_customer_b, 'Equipamento de outro cliente')
  RETURNING id INTO v_equipment_b;

  INSERT INTO public.service_orders (
    company_id, customer_id, equipment_id, description, origin, os_type, status
  ) VALUES (
    v_company_id, v_customer_a, v_equipment_id,
    'OS que deve ficar oculta', 'manual', 'manutencao_corretiva', 'pendente'
  );

  PERFORM public.save_customer_portal_settings(
    v_customer_a,
    true,
    true,
    'senha-segura-123',
    '{"service_orders":false,"equipment":false,"contracts":false,"charges":false,"ticket_requests":false}'::jsonb
  );

  v_result := public.get_portal_data(v_token_a, NULL);
  IF v_result->>'access' <> 'password_required'
     OR v_result ? 'customer'
     OR v_result ? 'equipment'
     OR v_result ? 'service_orders'
     OR v_result ? 'contracts'
     OR v_result ? 'charges'
  THEN
    RAISE EXCEPTION 'portal protegido vazou payload sem sessao: %', v_result;
  END IF;

  v_result := public.get_portal_data(v_token_a, 'sessao-inventada');
  IF v_result->>'access' <> 'password_required' THEN
    RAISE EXCEPTION 'sessao arbitraria liberou portal protegido: %', v_result;
  END IF;

  v_result := public.customer_portal_login(v_token_a, 'senha-errada');
  IF COALESCE((v_result->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'senha errada foi aceita';
  END IF;

  v_result := public.customer_portal_login(v_token_a, 'senha-segura-123');
  v_session_a := v_result->>'session_token';
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE OR v_session_a IS NULL THEN
    RAISE EXCEPTION 'senha correta nao criou sessao: %', v_result;
  END IF;

  v_result := public.get_portal_data(v_token_a, v_session_a);
  IF v_result->>'access' <> 'granted'
     OR COALESCE((v_result->'permissions'->>'service_orders')::boolean, true)
     OR COALESCE((v_result->'permissions'->>'equipment')::boolean, true)
     OR COALESCE((v_result->'permissions'->>'contracts')::boolean, true)
     OR COALESCE((v_result->'permissions'->>'charges')::boolean, true)
     OR COALESCE((v_result->'permissions'->>'ticket_requests')::boolean, true)
     OR jsonb_array_length(v_result->'equipment_field_config') <> 0
     OR jsonb_array_length(v_result->'equipment') <> 0
     OR jsonb_array_length(v_result->'service_orders') <> 0
     OR jsonb_array_length(v_result->'contracts') <> 0
     OR jsonb_array_length(v_result->'charges') <> 0
  THEN
    RAISE EXCEPTION 'allowlist nao bloqueou datasets: %', v_result;
  END IF;

  BEGIN
    PERFORM public.create_customer_portal_ticket(
      v_token_a, v_session_a, 'Chamado que deve ser bloqueado', v_equipment_id
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_ticket_blocked := true;
  END;
  IF NOT v_ticket_blocked THEN
    RAISE EXCEPTION 'ticket_requests=false nao bloqueou a escrita';
  END IF;

  PERFORM public.save_customer_portal_settings(
    v_customer_b,
    true,
    true,
    'outra-senha-segura',
    '{"service_orders":true,"equipment":true,"contracts":true,"charges":true,"ticket_requests":true}'::jsonb
  );

  v_result := public.get_portal_data(v_token_b, v_session_a);
  IF v_result->>'access' <> 'password_required' THEN
    RAISE EXCEPTION 'sessao do portal A liberou o portal B: %', v_result;
  END IF;

  -- Tamanho da senha e validado tambem no servidor, inclusive limite do bcrypt em bytes.
  BEGIN
    PERFORM public.save_customer_portal_settings(
      v_customer_b, true, true, 'curta',
      '{"service_orders":true,"equipment":true,"contracts":true,"charges":true,"ticket_requests":true}'::jsonb
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_short_password_blocked := true;
  END;
  IF NOT v_short_password_blocked THEN
    RAISE EXCEPTION 'servidor aceitou senha com menos de 8 caracteres';
  END IF;

  BEGIN
    PERFORM public.save_customer_portal_settings(
      v_customer_b, true, true, repeat('é', 37),
      '{"service_orders":true,"equipment":true,"contracts":true,"charges":true,"ticket_requests":true}'::jsonb
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_long_password_blocked := true;
  END;
  IF NOT v_long_password_blocked THEN
    RAISE EXCEPTION 'servidor aceitou senha acima de 72 bytes';
  END IF;

  -- Cinco erros bloqueiam novas tentativas; nem a senha correta contorna o lockout.
  FOR attempt IN 1..4 LOOP
    v_result := public.customer_portal_login(v_token_b, 'senha-errada');
    IF v_result->>'error' <> 'invalid' OR (v_result->>'attempts_left')::integer <> 5 - attempt THEN
      RAISE EXCEPTION 'contagem de tentativas incorreta no passo %: %', attempt, v_result;
    END IF;
  END LOOP;
  v_result := public.customer_portal_login(v_token_b, 'senha-errada');
  IF v_result->>'error' <> 'locked' OR v_result->>'locked_until' IS NULL THEN
    RAISE EXCEPTION 'quinta tentativa nao bloqueou o portal: %', v_result;
  END IF;
  v_result := public.customer_portal_login(v_token_b, 'outra-senha-segura');
  IF v_result->>'error' <> 'locked' THEN
    RAISE EXCEPTION 'senha correta contornou lockout ativo: %', v_result;
  END IF;

  -- Trocar a senha revoga imediatamente todas as sessoes anteriores.
  PERFORM public.save_customer_portal_settings(
    v_customer_a,
    true,
    true,
    'senha-nova-segura',
    '{"service_orders":true,"equipment":true,"contracts":true,"charges":true,"ticket_requests":true}'::jsonb
  );
  v_result := public.get_portal_data(v_token_a, v_session_a);
  IF v_result->>'access' <> 'password_required' THEN
    RAISE EXCEPTION 'troca de senha nao revogou sessao antiga: %', v_result;
  END IF;

  v_result := public.customer_portal_login(v_token_a, 'senha-nova-segura');
  v_session_rotated := v_result->>'session_token';
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE OR v_session_rotated IS NULL THEN
    RAISE EXCEPTION 'nova senha nao autenticou: %', v_result;
  END IF;

  BEGIN
    PERFORM public.create_customer_portal_ticket(
      v_token_a, v_session_rotated, 'Chamado com equipamento de outro cliente', v_equipment_b
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    v_cross_equipment_blocked := true;
  END;
  IF NOT v_cross_equipment_blocked THEN
    RAISE EXCEPTION 'portal aceitou equipamento pertencente a outro cliente';
  END IF;

  -- Remover a protecao elimina credencial e sessoes e libera o acesso sem senha.
  PERFORM public.save_customer_portal_settings(
    v_customer_a,
    true,
    false,
    NULL,
    '{"service_orders":true,"equipment":true,"contracts":true,"charges":true,"ticket_requests":true}'::jsonb
  );
  v_result := public.get_portal_data(v_token_a, NULL);
  IF v_result->>'access' <> 'granted'
     OR EXISTS (
       SELECT 1 FROM public.customer_portal_credentials pc
       JOIN public.customer_portals cp ON cp.id = pc.portal_id
       WHERE cp.customer_id = v_customer_a
     )
     OR EXISTS (
       SELECT 1 FROM public.customer_portal_sessions ps
       JOIN public.customer_portals cp ON cp.id = ps.portal_id
       WHERE cp.customer_id = v_customer_a
     )
  THEN
    RAISE EXCEPTION 'desativar senha nao removeu credencial/sessoes ou nao liberou acesso: %', v_result;
  END IF;

  -- Assinatura vencida falha fechada tanto na leitura quanto na mutacao.
  UPDATE public.companies
     SET subscription_status = 'active', subscription_expires_at = now() - interval '3 days'
   WHERE id = v_company_id;
  v_result := public.get_portal_data(v_token_a, NULL);
  IF v_result->>'access' <> 'module_unavailable' OR v_result ? 'customer' THEN
    RAISE EXCEPTION 'assinatura vencida continuou expondo portal: %', v_result;
  END IF;
  BEGIN
    PERFORM public.create_customer_portal_ticket(
      v_token_a, NULL, 'Chamado que deve ser negado com assinatura vencida', NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_expired_ticket_blocked := true;
  END;
  IF NOT v_expired_ticket_blocked THEN
    RAISE EXCEPTION 'assinatura vencida continuou aceitando chamado';
  END IF;

  UPDATE public.companies
     SET subscription_status = 'active', subscription_expires_at = NULL
   WHERE id = v_company_id;

  PERFORM public.save_customer_portal_settings(
    v_customer_a,
    false,
    false,
    NULL,
    '{"service_orders":true,"equipment":true,"contracts":true,"charges":true,"ticket_requests":true}'::jsonb
  );
  IF public.get_portal_data(v_token_a, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'portal inativo continuou entregando payload';
  END IF;
  BEGIN
    PERFORM public.create_customer_portal_ticket(
      v_token_a, NULL, 'Chamado que deve ser negado com portal inativo', NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_inactive_ticket_blocked := true;
  END;
  IF NOT v_inactive_ticket_blocked THEN
    RAISE EXCEPTION 'portal inativo continuou aceitando chamado';
  END IF;
END
$test$;

ROLLBACK;

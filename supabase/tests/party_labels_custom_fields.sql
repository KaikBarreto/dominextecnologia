-- Smoke transacional de etiquetas/campos personalizados.
-- Executar em banco migrado:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/party_labels_custom_fields.sql

BEGIN;

DO $test$
DECLARE
  v_company_a uuid := gen_random_uuid();
  v_company_b uuid := gen_random_uuid();
  v_label_a uuid;
  v_label_b uuid;
  v_label_a_second uuid;
  v_customer uuid;
  v_supplier uuid;
  v_portal_token text;
  v_portal_payload jsonb;
  v_cross_customer_blocked boolean := false;
  v_cross_supplier_blocked boolean := false;
  v_duplicate_blocked boolean := false;
  v_cross_assignment_blocked boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.companies (id, name)
  VALUES
    (v_company_a, 'QA Etiquetas A ' || left(v_company_a::text, 8)),
    (v_company_b, 'QA Etiquetas B ' || left(v_company_b::text, 8));

  UPDATE public.companies
     SET subscription_status = 'active', subscription_expires_at = NULL
   WHERE id IN (v_company_a, v_company_b);

  INSERT INTO public.company_modules (company_id, module_code)
  VALUES (v_company_a, 'customer_portal');

  INSERT INTO public.party_labels (company_id, name, color)
  VALUES (v_company_a, 'BLOQUEADO', '#DC2626')
  RETURNING id INTO v_label_a;

  -- Mesmo nome e permitido em outro tenant.
  INSERT INTO public.party_labels (company_id, name, color)
  VALUES (v_company_b, 'BLOQUEADO', '#DC2626')
  RETURNING id INTO v_label_b;

  INSERT INTO public.party_labels (company_id, name, color)
  VALUES (v_company_a, 'VIP', '#2563EB')
  RETURNING id INTO v_label_a_second;

  BEGIN
    INSERT INTO public.party_labels (company_id, name, color)
    VALUES (v_company_a, ' bloqueado ', '#991B1B');
  EXCEPTION WHEN unique_violation THEN
    v_duplicate_blocked := true;
  END;

  IF NOT v_duplicate_blocked THEN
    RAISE EXCEPTION 'Nome duplicado de etiqueta foi aceito no mesmo tenant';
  END IF;

  INSERT INTO public.customers (company_id, name, customer_type, label_id, custom_fields)
  VALUES (
    v_company_a,
    'Cliente QA Etiquetas',
    'pj',
    v_label_a,
    '{"codigo_interno":"INT-42","referencia_portal":"REF-7"}'::jsonb
  )
  RETURNING id INTO v_customer;

  INSERT INTO public.suppliers (company_id, name, label_id, custom_fields)
  VALUES (
    v_company_a,
    'Fornecedor QA Etiquetas',
    v_label_a,
    '{"categoria":"Critico"}'::jsonb
  )
  RETURNING id INTO v_supplier;

  INSERT INTO public.customer_label_assignments (company_id, customer_id, label_id, position)
  VALUES (v_company_a, v_customer, v_label_a_second, 1);

  IF (SELECT count(*) FROM public.customer_label_assignments WHERE customer_id = v_customer) <> 2 THEN
    RAISE EXCEPTION 'Backfill/atribuicao multipla do cliente nao preservou duas etiquetas';
  END IF;

  UPDATE public.customers SET label_id = v_label_a_second WHERE id = v_customer;
  IF (SELECT count(*) FROM public.customer_label_assignments WHERE customer_id = v_customer) <> 2
     OR (SELECT position FROM public.customer_label_assignments WHERE customer_id = v_customer AND label_id = v_label_a_second) <> 0
  THEN
    RAISE EXCEPTION 'Compatibilidade singular removeu etiquetas adicionais ou nao promoveu a primeira etiqueta';
  END IF;
  UPDATE public.customers SET label_id = v_label_a WHERE id = v_customer;

  BEGIN
    INSERT INTO public.customer_label_assignments (company_id, customer_id, label_id, position)
    VALUES (v_company_a, v_customer, v_label_b, 2);
  EXCEPTION WHEN foreign_key_violation THEN
    v_cross_assignment_blocked := true;
  END;

  IF NOT v_cross_assignment_blocked THEN
    RAISE EXCEPTION 'Atribuicao multi-etiqueta cross-tenant nao foi bloqueada';
  END IF;

  BEGIN
    UPDATE public.customers SET label_id = v_label_b WHERE id = v_customer;
  EXCEPTION WHEN insufficient_privilege THEN
    v_cross_customer_blocked := true;
  END;

  BEGIN
    UPDATE public.suppliers SET label_id = v_label_b WHERE id = v_supplier;
  EXCEPTION WHEN insufficient_privilege THEN
    v_cross_supplier_blocked := true;
  END;

  IF NOT v_cross_customer_blocked OR NOT v_cross_supplier_blocked THEN
    RAISE EXCEPTION 'Vinculo de etiqueta cross-tenant nao foi bloqueado';
  END IF;

  INSERT INTO public.party_field_config (
    company_id, entity_type, field_key, label, field_type,
    is_visible, is_visible_in_portal, position
  ) VALUES
    (v_company_a, 'customer', 'codigo_interno', 'Codigo interno', 'text', true, false, 0),
    (v_company_a, 'customer', 'referencia_portal', 'Referencia', 'text', true, true, 1),
    (v_company_a, 'supplier', 'categoria', 'Categoria', 'text', true, false, 0);

  IF (
    SELECT count(*)
      FROM public.party_field_config
     WHERE company_id = v_company_a
       AND entity_type = 'customer'
       AND is_visible
       AND is_visible_in_portal
  ) <> 1 THEN
    RAISE EXCEPTION 'Allowlist de campos do portal nao selecionou somente o campo liberado';
  END IF;

  SELECT token INTO v_portal_token
    FROM public.customer_portals
   WHERE customer_id = v_customer;

  v_portal_payload := public.get_portal_data(v_portal_token, NULL);

  IF v_portal_payload->>'access' <> 'granted'
     OR jsonb_array_length(v_portal_payload->'customer_field_config') <> 1
     OR v_portal_payload #>> '{customer,custom_fields,referencia_portal}' <> 'REF-7'
     OR (v_portal_payload #> '{customer,custom_fields}') ? 'codigo_interno'
  THEN
    RAISE EXCEPTION 'Portal nao respeitou a allowlist dos campos personalizados: %', v_portal_payload;
  END IF;

  PERFORM public.save_customer_portal_settings(
    v_customer,
    true,
    true,
    'senha-qa-segura-123',
    '{"service_orders":true,"equipment":true,"contracts":true,"charges":true,"invoices":true,"documents":true,"ticket_requests":true}'::jsonb,
    '{"service_orders":false,"equipment":true,"contracts":false,"charges":false,"invoices":false,"documents":false,"ticket_requests":false}'::jsonb
  );

  v_portal_payload := public.get_portal_data(v_portal_token, NULL);

  IF v_portal_payload->>'access' <> 'granted'
     OR COALESCE((v_portal_payload->>'partial')::boolean, false) IS NOT TRUE
     OR v_portal_payload ? 'customer_field_config'
     OR (v_portal_payload->'customer') ? 'custom_fields'
  THEN
    RAISE EXCEPTION 'Modo parcial do portal vazou campos personalizados: %', v_portal_payload;
  END IF;

  DELETE FROM public.party_labels WHERE id = v_label_a;

  IF (SELECT label_id FROM public.customers WHERE id = v_customer) IS NOT NULL
     OR (SELECT label_id FROM public.suppliers WHERE id = v_supplier) IS NOT NULL
  THEN
    RAISE EXCEPTION 'Excluir etiqueta nao limpou os vinculos das entidades';
  END IF;

  IF (SELECT count(*) FROM public.customer_label_assignments WHERE customer_id = v_customer) <> 1 THEN
    RAISE EXCEPTION 'Excluir etiqueta removeu atribuicoes adicionais do cliente';
  END IF;

  IF has_table_privilege('anon', 'public.party_labels', 'SELECT')
     OR has_table_privilege('anon', 'public.party_field_config', 'SELECT')
     OR has_table_privilege('anon', 'public.customer_label_assignments', 'SELECT')
     OR has_function_privilege('anon', 'public.set_customer_labels(uuid,uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_supplier_labels(uuid,uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_equipment_labels(uuid,uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_portal_data_before_party_fields(text,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Catalogo ou funcao interna expostos a anon';
  END IF;
END
$test$;

ROLLBACK;

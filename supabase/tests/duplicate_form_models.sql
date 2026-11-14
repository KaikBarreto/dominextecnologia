-- Homologacao transacional das RPCs de duplicacao de formularios/checklists.
--
-- Pre-requisito: banco local recriado com todas as migrations.
-- Executar com uma conexao administrativa LOCAL:
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/duplicate_form_models.sql
--
-- O teste inteiro roda em uma transacao e termina com ROLLBACK. Nunca executar
-- este arquivo contra producao: as fixtures existem apenas para QA local.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.fail_second_lead_duplicate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'falha injetada na segunda copia do formulario';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.fail_second_checklist_duplicate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'falha injetada na segunda copia do checklist';
END;
$$;

DO $contract$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.duplicate_lead_capture_form(uuid,text,integer)',
    'public.duplicate_form_template(uuid,text,integer)'
  ] LOOP
    IF to_regprocedure(v_signature) IS NULL THEN
      RAISE EXCEPTION 'RPC ausente: %', v_signature;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_proc p
       WHERE p.oid = v_signature::regprocedure
         AND p.prosecdef
         AND 'search_path=public' = ANY (p.proconfig)
    ) THEN
      RAISE EXCEPTION '% precisa ser SECURITY DEFINER com search_path fixo', v_signature;
    END IF;

    IF EXISTS (
         SELECT 1
           FROM pg_proc p,
                LATERAL aclexplode(
                  COALESCE(p.proacl, acldefault('f', p.proowner))
                ) acl
          WHERE p.oid = v_signature::regprocedure
            AND acl.grantee = 0
            AND acl.privilege_type = 'EXECUTE'
       )
       OR has_function_privilege('anon', v_signature, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_signature, 'EXECUTE')
       OR has_function_privilege('service_role', v_signature, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'ACL incorreta em %', v_signature;
    END IF;
  END LOOP;
END
$contract$;

DO $behavior$
DECLARE
  v_company_a       uuid := 'df000000-0000-4000-8000-000000000001';
  v_company_b       uuid := 'df000000-0000-4000-8000-000000000002';
  v_manager_a       uuid := 'df000000-0000-4000-8000-000000000011';
  v_member_a        uuid := 'df000000-0000-4000-8000-000000000012';
  v_manager_b       uuid := 'df000000-0000-4000-8000-000000000013';
  v_orphan          uuid := 'df000000-0000-4000-8000-000000000014';
  v_lead_source     uuid := 'df000000-0000-4000-8000-000000000101';
  v_lead_question_1 uuid := 'df000000-0000-4000-8000-000000000111';
  v_lead_question_2 uuid := 'df000000-0000-4000-8000-000000000112';
  v_template_source uuid := 'df000000-0000-4000-8000-000000000201';
  v_question_1      uuid := 'df000000-0000-4000-8000-000000000211';
  v_question_2      uuid := 'df000000-0000-4000-8000-000000000212';
  v_service_type_1  uuid := 'df000000-0000-4000-8000-000000000301';
  v_service_type_2  uuid := 'df000000-0000-4000-8000-000000000302';
  v_catalog_item    uuid := 'df000000-0000-4000-8000-000000000401';
  v_lead_ids        uuid[];
  v_template_ids    uuid[];
  v_copy_id         uuid;
  v_names           text[];
  v_source_json     jsonb;
  v_copy_json       jsonb;
  v_short_code      text;
  v_count           integer;
  v_blocked         boolean;
BEGIN
  INSERT INTO public.companies (
    id, name, subscription_status, subscription_expires_at
  ) VALUES
    (v_company_a, 'QA duplicacao empresa A', 'active', NULL),
    (v_company_b, 'QA duplicacao empresa B', 'active', NULL);

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000000', v_manager_a,
      'authenticated', 'authenticated', 'duplicate-manager-a@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"QA Manager A"}'::jsonb, now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_member_a,
      'authenticated', 'authenticated', 'duplicate-member-a@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"QA Member A"}'::jsonb, now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_manager_b,
      'authenticated', 'authenticated', 'duplicate-manager-b@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"QA Manager B"}'::jsonb, now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_orphan,
      'authenticated', 'authenticated', 'duplicate-orphan@example.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"QA Orphan"}'::jsonb, now(), now(), '', '', '', ''
    );

  INSERT INTO public.profiles (user_id, full_name, company_id, is_active)
  VALUES
    (v_manager_a, 'QA Manager A', v_company_a, true),
    (v_member_a, 'QA Member A', v_company_a, true),
    (v_manager_b, 'QA Manager B', v_company_b, true),
    (v_orphan, 'QA Orphan', NULL, true)
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        company_id = EXCLUDED.company_id,
        is_active = EXCLUDED.is_active;

  INSERT INTO public.user_roles (user_id, role)
  VALUES
    (v_manager_a, 'admin'::public.app_role),
    (v_manager_b, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.lead_capture_forms (
    id, company_id, title, description, field_config, is_active, expires_at,
    require_consent, consent_text, submission_count, max_submissions,
    created_by, purpose, show_in_customer_portal, success_message
  ) VALUES (
    v_lead_source,
    v_company_a,
    'Formulario fonte QA',
    'Descricao integral do formulario fonte',
    '{"name":{"enabled":true,"required":true},"email":{"enabled":true,"required":false}}'::jsonb,
    true,
    now() + interval '10 days',
    true,
    'Consentimento QA',
    7,
    50,
    v_manager_a,
    'generic',
    true,
    'Obrigado pelo envio QA'
  );

  SELECT short_code INTO v_short_code
    FROM public.lead_capture_forms
   WHERE id = v_lead_source;

  INSERT INTO public.public_form_questions (
    id, company_id, form_id, question, description, question_type,
    options, is_required, position
  ) VALUES
    (
      v_lead_question_1, v_company_a, v_lead_source,
      'Qual opcao?', 'Descricao select', 'select', '["A","B"]'::jsonb, true, 2
    ),
    (
      v_lead_question_2, v_company_a, v_lead_source,
      'Conte mais', NULL, 'textarea', '[]'::jsonb, false, 1
    );

  INSERT INTO public.lead_capture_submissions_log (form_id, short_code, ip_hash)
  VALUES (v_lead_source, v_short_code, 'qa-hash');

  INSERT INTO public.public_form_submissions (
    company_id, form_id, source, answers, fields, ip_hash
  ) VALUES (
    v_company_a,
    v_lead_source,
    'public_link',
    jsonb_build_object(v_lead_question_1::text, 'A'),
    '{"name":"Historico QA"}'::jsonb,
    'qa-hash'
  );

  INSERT INTO public.service_types (id, company_id, name, color, description)
  VALUES
    (v_service_type_1, v_company_a, 'Preventiva QA', '#112233', 'Servico principal'),
    (v_service_type_2, v_company_a, 'Corretiva QA', '#445566', 'Servico adicional');

  INSERT INTO public.pmoc_activity_catalog (
    id, section, component, description, default_freq_code,
    is_measurement, unit, expected_min, expected_max, sort_order, is_active
  ) VALUES (
    v_catalog_item, 'medicoes', 'qa', 'Atividade catalogo QA', 'M',
    true, '°C', 10, 20, 999999, true
  );

  INSERT INTO public.form_templates (
    id, company_id, name, description, is_active, created_by,
    service_type_id, is_pmoc_default, pmoc_family, pmoc_tier
  ) VALUES (
    v_template_source,
    v_company_a,
    'Checklist fonte QA',
    'Descricao integral do checklist fonte',
    true,
    v_manager_a,
    v_service_type_1,
    true,
    'expansao_direta',
    'essencial'
  );

  INSERT INTO public.form_questions (
    id, template_id, question, question_type, options, is_required, position,
    description, require_camera, answer_types, answer_mode, auto_classify,
    unit, expected_min, expected_max, freq_kind, freq_months, freq_days,
    freq_visits, start_kind, start_visit, pmoc_catalog_activity_id,
    pmoc_section, pmoc_group, pmoc_essential_tier, allow_multiple_photos,
    require_camera_video
  ) VALUES
    (
      v_question_1, v_template_source, 'Medicao completa', 'select',
      '["Conforme","Nao conforme"]'::jsonb, true, 2,
      'Descricao com todos os metadados', true, '["text","photo"]'::jsonb,
      'multiple', true, '°C', 10, 20, 'time', 3, 17, NULL,
      'visit_n', 2, v_catalog_item, 'medicoes', 'teste', 'base', false, true
    ),
    (
      v_question_2, v_template_source, 'Pergunta simples', 'boolean',
      NULL, false, 1, NULL, false, NULL, 'exclusive', false,
      NULL, NULL, NULL, 'visits', NULL, NULL, 2,
      'contract_start', NULL, NULL, NULL, NULL, NULL, true, false
    );

  INSERT INTO public.form_template_service_types (template_id, service_type_id)
  VALUES
    (v_template_source, v_service_type_1),
    (v_template_source, v_service_type_2);

  -- Sem sessao: ambas as RPCs devem falhar antes de ler qualquer origem.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_lead_capture_form(v_lead_source, 'Anon', 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'formulario foi duplicado sem autenticacao';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_form_template(v_template_source, 'Anon', 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'checklist foi duplicado sem autenticacao';
  END IF;

  -- Usuario sem empresa nao pode descobrir nem copiar registros existentes.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_orphan, 'role', 'authenticated')::text,
    true
  );
  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_lead_capture_form(v_lead_source, 'Orfao', 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'usuario sem empresa duplicou formulario';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_form_template(v_template_source, 'Orfao', 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'usuario sem empresa duplicou checklist';
  END IF;

  -- Outro tenant nao pode diferenciar UUID existente de inexistente.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_manager_b, 'role', 'authenticated')::text,
    true
  );
  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_lead_capture_form(v_lead_source, 'Tenant B', 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'tenant B duplicou formulario do tenant A';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_form_template(v_template_source, 'Tenant B', 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'tenant B duplicou checklist do tenant A';
  END IF;

  -- No formulario, a policy historica permite qualquer membro do tenant.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_member_a, 'role', 'authenticated')::text,
    true
  );
  SELECT array_agg(d.id ORDER BY d.title), array_agg(d.title ORDER BY d.title)
    INTO v_lead_ids, v_names
    FROM public.duplicate_lead_capture_form(
      v_lead_source, '  Copia formulario  ', 2
    ) d;

  IF cardinality(v_lead_ids) <> 2
     OR v_names <> ARRAY['Copia formulario (1)', 'Copia formulario (2)']
     OR v_lead_ids[1] = v_lead_ids[2]
     OR v_lead_source = ANY(v_lead_ids)
  THEN
    RAISE EXCEPTION 'retorno/nomeacao de formulario incorretos: ids=%, nomes=%',
      v_lead_ids, v_names;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.lead_capture_forms f
     WHERE f.id = ANY(v_lead_ids)
       AND (
         f.company_id <> v_company_a
         OR f.description IS DISTINCT FROM 'Descricao integral do formulario fonte'
         OR f.field_config IS DISTINCT FROM '{"name":{"enabled":true,"required":true},"email":{"enabled":true,"required":false}}'::jsonb
         OR f.is_active
         OR f.expires_at IS NOT NULL
         OR NOT f.require_consent
         OR f.consent_text IS DISTINCT FROM 'Consentimento QA'
         OR f.submission_count <> 0
         OR f.max_submissions IS DISTINCT FROM 50
         OR f.created_by <> v_member_a
         OR f.purpose <> 'generic'
         OR f.show_in_customer_portal
         OR f.success_message IS DISTINCT FROM 'Obrigado pelo envio QA'
         OR f.short_code IS NULL
         OR f.short_code = v_short_code
       )
  ) THEN
    RAISE EXCEPTION 'configuracao/reset do formulario duplicado divergiu';
  END IF;

  IF (
    SELECT count(DISTINCT short_code)
      FROM public.lead_capture_forms
     WHERE id = ANY(v_lead_ids)
  ) <> 2 THEN
    RAISE EXCEPTION 'copias de formulario reutilizaram short_code';
  END IF;

  SELECT jsonb_agg(
           to_jsonb(q) - ARRAY['id', 'form_id', 'created_at', 'updated_at']
           ORDER BY q.position, q.question
         )
    INTO v_source_json
    FROM public.public_form_questions q
   WHERE q.form_id = v_lead_source;

  FOREACH v_copy_id IN ARRAY v_lead_ids LOOP
    SELECT jsonb_agg(
             to_jsonb(q) - ARRAY['id', 'form_id', 'created_at', 'updated_at']
             ORDER BY q.position, q.question
           )
      INTO v_copy_json
      FROM public.public_form_questions q
     WHERE q.form_id = v_copy_id;

    IF v_copy_json IS DISTINCT FROM v_source_json THEN
      RAISE EXCEPTION 'perguntas do formulario nao foram copiadas integralmente';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.public_form_questions q
       WHERE q.form_id = v_copy_id
         AND q.id IN (v_lead_question_1, v_lead_question_2)
    ) OR EXISTS (
      SELECT 1 FROM public.lead_capture_submissions_log l
       WHERE l.form_id = v_copy_id
    ) OR EXISTS (
      SELECT 1 FROM public.public_form_submissions s
       WHERE s.form_id = v_copy_id
    ) THEN
      RAISE EXCEPTION 'IDs ou historico foram reutilizados no formulario duplicado';
    END IF;
  END LOOP;

  -- O mesmo membro nao gestor deve ser barrado no checklist de sistema.
  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_form_template(v_template_source, 'Sem permissao', 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'membro sem can_manage_system duplicou checklist';
  END IF;

  -- Gestor do tenant: copia integral de perguntas/vinculos e reset PMOC.
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_manager_a, 'role', 'authenticated')::text,
    true
  );
  SELECT array_agg(d.id ORDER BY d.name), array_agg(d.name ORDER BY d.name)
    INTO v_template_ids, v_names
    FROM public.duplicate_form_template(
      v_template_source, '  Copia checklist  ', 2
    ) d;

  IF cardinality(v_template_ids) <> 2
     OR v_names <> ARRAY['Copia checklist (1)', 'Copia checklist (2)']
     OR v_template_ids[1] = v_template_ids[2]
     OR v_template_source = ANY(v_template_ids)
  THEN
    RAISE EXCEPTION 'retorno/nomeacao de checklist incorretos: ids=%, nomes=%',
      v_template_ids, v_names;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.form_templates ft
     WHERE ft.id = ANY(v_template_ids)
       AND (
         ft.company_id <> v_company_a
         OR ft.description IS DISTINCT FROM 'Descricao integral do checklist fonte'
         OR ft.is_active
         OR ft.created_by <> v_manager_a
         OR ft.service_type_id IS DISTINCT FROM v_service_type_1
         OR ft.is_pmoc_default
         OR ft.pmoc_family IS NOT NULL
         OR ft.pmoc_tier IS NOT NULL
       )
  ) THEN
    RAISE EXCEPTION 'configuracao/reset PMOC do checklist duplicado divergiu';
  END IF;

  SELECT jsonb_agg(
           to_jsonb(q) - ARRAY['id', 'template_id', 'created_at']
           ORDER BY q.position, q.question
         )
    INTO v_source_json
    FROM public.form_questions q
   WHERE q.template_id = v_template_source;

  FOREACH v_copy_id IN ARRAY v_template_ids LOOP
    SELECT jsonb_agg(
             to_jsonb(q) - ARRAY['id', 'template_id', 'created_at']
             ORDER BY q.position, q.question
           )
      INTO v_copy_json
      FROM public.form_questions q
     WHERE q.template_id = v_copy_id;

    IF v_copy_json IS DISTINCT FROM v_source_json THEN
      RAISE EXCEPTION 'perguntas do checklist nao foram copiadas integralmente';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.form_questions q
       WHERE q.template_id = v_copy_id
         AND q.id IN (v_question_1, v_question_2)
    ) THEN
      RAISE EXCEPTION 'IDs de perguntas foram reutilizados no checklist duplicado';
    END IF;

    SELECT count(*) INTO v_count
      FROM public.form_template_service_types link
     WHERE link.template_id = v_copy_id
       AND link.service_type_id IN (v_service_type_1, v_service_type_2);
    IF v_count <> 2 THEN
      RAISE EXCEPTION 'vinculos de tipos de servico nao foram copiados';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.form_responses r
        JOIN public.form_questions q ON q.id = r.question_id
       WHERE q.template_id = v_copy_id
    ) THEN
      RAISE EXCEPTION 'historico de respostas apareceu no checklist duplicado';
    END IF;
  END LOOP;

  -- Limites validos: 1 preserva nome sem sufixo; 20 gera todas as copias.
  SELECT array_agg(d.id), array_agg(d.title)
    INTO v_lead_ids, v_names
    FROM public.duplicate_lead_capture_form(v_lead_source, 'Nome unico', 1) d;
  IF cardinality(v_lead_ids) <> 1 OR v_names <> ARRAY['Nome unico'] THEN
    RAISE EXCEPTION 'limite minimo de formulario falhou';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.duplicate_lead_capture_form(v_lead_source, 'Vinte formularios', 20);
  IF v_count <> 20 THEN
    RAISE EXCEPTION 'limite maximo de formulario retornou % copias', v_count;
  END IF;

  SELECT array_agg(d.id), array_agg(d.name)
    INTO v_template_ids, v_names
    FROM public.duplicate_form_template(v_template_source, 'Nome unico', 1) d;
  IF cardinality(v_template_ids) <> 1 OR v_names <> ARRAY['Nome unico'] THEN
    RAISE EXCEPTION 'limite minimo de checklist falhou';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.duplicate_form_template(v_template_source, 'Vinte checklists', 20);
  IF v_count <> 20 THEN
    RAISE EXCEPTION 'limite maximo de checklist retornou % copias', v_count;
  END IF;

  -- O limite de 200 vale para o nome FINAL. Sem sufixo, 200 e valido.
  PERFORM public.duplicate_lead_capture_form(v_lead_source, repeat('a', 200), 1);
  PERFORM public.duplicate_form_template(v_template_source, repeat('b', 200), 1);

  -- Duas copias acrescentam " (1)"/" (2)": 196 + 4 = 200 e valido.
  PERFORM public.duplicate_lead_capture_form(v_lead_source, repeat('a', 196), 2);
  PERFORM public.duplicate_form_template(v_template_source, repeat('b', 196), 2);

  -- 197 + o sufixo de quatro caracteres ultrapassa o contrato de 200.
  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_lead_capture_form(v_lead_source, repeat('a', 197), 2);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'formulario aceitou nome final acima de 200 caracteres';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_form_template(v_template_source, repeat('b', 197), 2);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'checklist aceitou nome final acima de 200 caracteres';
  END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_lead_capture_form(v_lead_source, '   ', 1);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'formulario aceitou nome vazio'; END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_form_template(v_template_source, '   ', 1);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'checklist aceitou nome vazio'; END IF;

  -- Whitespace diferente de espaco comum tambem e visualmente vazio.
  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_lead_capture_form(v_lead_source, E'\t\n', 1);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'formulario aceitou tab/quebra de linha como nome'; END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_form_template(v_template_source, E'\t\n', 1);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'checklist aceitou tab/quebra de linha como nome'; END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_lead_capture_form(v_lead_source, repeat('x', 201), 1);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'formulario aceitou nome com 201 caracteres'; END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_form_template(v_template_source, repeat('x', 201), 1);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'checklist aceitou nome com 201 caracteres'; END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_lead_capture_form(v_lead_source, NULL, 1);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'formulario aceitou nome NULL'; END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_form_template(v_template_source, NULL, 1);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'checklist aceitou nome NULL'; END IF;

  -- Quantidade nula, zero e acima de 20 devem falhar sem inserir nada.
  FOREACH v_count IN ARRAY ARRAY[0, 21] LOOP
    v_blocked := false;
    BEGIN
      PERFORM public.duplicate_lead_capture_form(v_lead_source, 'Quantidade invalida', v_count);
    EXCEPTION WHEN invalid_parameter_value THEN
      v_blocked := true;
    END;
    IF NOT v_blocked THEN
      RAISE EXCEPTION 'formulario aceitou quantidade %', v_count;
    END IF;

    v_blocked := false;
    BEGIN
      PERFORM public.duplicate_form_template(v_template_source, 'Quantidade invalida', v_count);
    EXCEPTION WHEN invalid_parameter_value THEN
      v_blocked := true;
    END;
    IF NOT v_blocked THEN
      RAISE EXCEPTION 'checklist aceitou quantidade %', v_count;
    END IF;
  END LOOP;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_lead_capture_form(v_lead_source, 'Quantidade nula', NULL);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'formulario aceitou quantidade NULL'; END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_form_template(v_template_source, 'Quantidade nula', NULL);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'checklist aceitou quantidade NULL'; END IF;

  -- UUID nulo e UUID inexistente compartilham erro de dominio sem inserir.
  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_lead_capture_form(NULL, 'Origem nula', 1);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'formulario aceitou origem NULL'; END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_form_template(NULL, 'Origem nula', 1);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'checklist aceitou origem NULL'; END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_lead_capture_form(gen_random_uuid(), 'Inexistente', 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'formulario aceitou origem inexistente'; END IF;

  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_form_template(gen_random_uuid(), 'Inexistente', 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'checklist aceitou origem inexistente'; END IF;

  -- Falha injetada na segunda iteracao deve desfazer a primeira copia inteira.
  EXECUTE $sql$
    CREATE TRIGGER qa_fail_second_lead_duplicate
      BEFORE INSERT ON public.lead_capture_forms
      FOR EACH ROW
      WHEN (NEW.title = 'Atomic lead (2)')
      EXECUTE FUNCTION pg_temp.fail_second_lead_duplicate()
  $sql$;
  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_lead_capture_form(v_lead_source, 'Atomic lead', 2);
  EXCEPTION WHEN raise_exception THEN
    v_blocked := true;
  END;
  EXECUTE 'DROP TRIGGER qa_fail_second_lead_duplicate ON public.lead_capture_forms';
  IF NOT v_blocked OR EXISTS (
    SELECT 1 FROM public.lead_capture_forms WHERE title LIKE 'Atomic lead%'
  ) THEN
    RAISE EXCEPTION 'duplicacao de formulario nao foi atomica';
  END IF;

  EXECUTE $sql$
    CREATE TRIGGER qa_fail_second_checklist_duplicate
      BEFORE INSERT ON public.form_templates
      FOR EACH ROW
      WHEN (NEW.name = 'Atomic checklist (2)')
      EXECUTE FUNCTION pg_temp.fail_second_checklist_duplicate()
  $sql$;
  v_blocked := false;
  BEGIN
    PERFORM public.duplicate_form_template(v_template_source, 'Atomic checklist', 2);
  EXCEPTION WHEN raise_exception THEN
    v_blocked := true;
  END;
  EXECUTE 'DROP TRIGGER qa_fail_second_checklist_duplicate ON public.form_templates';
  IF NOT v_blocked OR EXISTS (
    SELECT 1 FROM public.form_templates WHERE name LIKE 'Atomic checklist%'
  ) THEN
    RAISE EXCEPTION 'duplicacao de checklist nao foi atomica';
  END IF;
END
$behavior$;

ROLLBACK;

-- =============================================================================
-- Duplicacao atomica de modelos reutilizaveis
--
-- - Formulario publico: copia configuracao + perguntas, sem respostas, logs,
--   contador, link, validade ou publicacao.
-- - Checklist de OS: copia configuracao + perguntas completas + vinculos de
--   tipo de servico, sem respostas e sem a identidade reservada de norma PMOC.
--
-- As duas funcoes sao SECURITY DEFINER porque uma copia cruza tabelas pai/filho
-- e precisa ser uma unica transacao. O bypass de RLS e compensado por guardas
-- explicitas de auth.uid(), empresa e permissao antes de qualquer leitura que
-- possa revelar a existencia de um registro de outro tenant.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.duplicate_lead_capture_form(
  p_source_id uuid,
  p_base_name text,
  p_copy_count integer DEFAULT 1
)
RETURNS TABLE(id uuid, title text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_user_company uuid;
  v_source       public.lead_capture_forms%ROWTYPE;
  v_index        integer;
  v_new_id       uuid;
  v_new_name     text;
  v_clean_name   text := btrim(p_base_name);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária' USING ERRCODE = '42501';
  END IF;

  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'Formulário de origem inválido' USING ERRCODE = '22023';
  END IF;

  IF v_clean_name IS NULL OR char_length(v_clean_name) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Informe um nome com até 200 caracteres' USING ERRCODE = '22023';
  END IF;

  IF p_copy_count IS NULL OR p_copy_count NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'A quantidade deve ficar entre 1 e 20' USING ERRCODE = '22023';
  END IF;

  v_user_company := public.get_user_company_id(v_user_id);

  SELECT f.*
    INTO v_source
    FROM public.lead_capture_forms f
   WHERE f.id = p_source_id
     AND (
       f.company_id = v_user_company
       OR public.is_super_admin(v_user_id)
     );

  IF NOT FOUND THEN
    -- A mesma mensagem cobre inexistencia e outro tenant para nao servir como
    -- oraculo de UUIDs validos.
    RAISE EXCEPTION 'Formulário não encontrado ou acesso negado'
      USING ERRCODE = '42501';
  END IF;

  FOR v_index IN 1..p_copy_count LOOP
    v_new_name := CASE
      WHEN p_copy_count = 1 THEN v_clean_name
      ELSE format('%s (%s)', v_clean_name, v_index)
    END;

    INSERT INTO public.lead_capture_forms (
      company_id,
      title,
      description,
      field_config,
      is_active,
      expires_at,
      require_consent,
      consent_text,
      submission_count,
      max_submissions,
      created_by,
      purpose,
      show_in_customer_portal,
      success_message
    ) VALUES (
      v_source.company_id,
      v_new_name,
      v_source.description,
      v_source.field_config,
      false,
      NULL,
      v_source.require_consent,
      v_source.consent_text,
      0,
      v_source.max_submissions,
      v_user_id,
      v_source.purpose,
      false,
      v_source.success_message
    )
    RETURNING lead_capture_forms.id INTO v_new_id;

    INSERT INTO public.public_form_questions (
      company_id,
      form_id,
      question,
      description,
      question_type,
      options,
      is_required,
      position
    )
    SELECT
      v_source.company_id,
      v_new_id,
      q.question,
      q.description,
      q.question_type,
      q.options,
      q.is_required,
      q.position
    FROM public.public_form_questions q
    WHERE q.form_id = v_source.id
    ORDER BY q.position, q.created_at, q.id;

    id := v_new_id;
    title := v_new_name;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.duplicate_lead_capture_form(uuid, text, integer) IS
  'Duplica de 1 a 20 formularios do tenant em uma unica transacao. Copia configuracao e perguntas; gera novo short_code e zera publicacao, validade, contador e historico.';

REVOKE ALL ON FUNCTION public.duplicate_lead_capture_form(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duplicate_lead_capture_form(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.duplicate_lead_capture_form(uuid, text, integer) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.duplicate_form_template(
  p_source_id uuid,
  p_base_name text,
  p_copy_count integer DEFAULT 1
)
RETURNS TABLE(id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_user_company uuid;
  v_source       public.form_templates%ROWTYPE;
  v_index        integer;
  v_new_id       uuid;
  v_new_name     text;
  v_clean_name   text := btrim(p_base_name);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária' USING ERRCODE = '42501';
  END IF;

  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'Checklist de origem inválido' USING ERRCODE = '22023';
  END IF;

  IF v_clean_name IS NULL OR char_length(v_clean_name) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Informe um nome com até 200 caracteres' USING ERRCODE = '22023';
  END IF;

  IF p_copy_count IS NULL OR p_copy_count NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'A quantidade deve ficar entre 1 e 20' USING ERRCODE = '22023';
  END IF;

  v_user_company := public.get_user_company_id(v_user_id);

  SELECT ft.*
    INTO v_source
    FROM public.form_templates ft
   WHERE ft.id = p_source_id
     AND (
       (
         ft.company_id = v_user_company
         AND public.can_manage_system(v_user_id)
       )
       OR public.is_super_admin(v_user_id)
     );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist não encontrado ou acesso negado'
      USING ERRCODE = '42501';
  END IF;

  FOR v_index IN 1..p_copy_count LOOP
    v_new_name := CASE
      WHEN p_copy_count = 1 THEN v_clean_name
      ELSE format('%s (%s)', v_clean_name, v_index)
    END;

    INSERT INTO public.form_templates (
      company_id,
      name,
      description,
      is_active,
      created_by,
      service_type_id,
      is_pmoc_default,
      pmoc_family,
      pmoc_tier
    ) VALUES (
      v_source.company_id,
      v_new_name,
      v_source.description,
      false,
      v_user_id,
      v_source.service_type_id,
      false,
      NULL,
      NULL
    )
    RETURNING form_templates.id INTO v_new_id;

    INSERT INTO public.form_questions (
      template_id,
      question,
      question_type,
      options,
      is_required,
      position,
      description,
      require_camera,
      answer_types,
      answer_mode,
      auto_classify,
      unit,
      expected_min,
      expected_max,
      freq_kind,
      freq_months,
      freq_days,
      freq_visits,
      start_kind,
      start_visit,
      pmoc_catalog_activity_id,
      pmoc_section,
      pmoc_group,
      pmoc_essential_tier,
      allow_multiple_photos,
      require_camera_video
    )
    SELECT
      v_new_id,
      q.question,
      q.question_type,
      q.options,
      q.is_required,
      q.position,
      q.description,
      q.require_camera,
      q.answer_types,
      q.answer_mode,
      q.auto_classify,
      q.unit,
      q.expected_min,
      q.expected_max,
      q.freq_kind,
      q.freq_months,
      q.freq_days,
      q.freq_visits,
      q.start_kind,
      q.start_visit,
      q.pmoc_catalog_activity_id,
      q.pmoc_section,
      q.pmoc_group,
      q.pmoc_essential_tier,
      q.allow_multiple_photos,
      q.require_camera_video
    FROM public.form_questions q
    WHERE q.template_id = v_source.id
    ORDER BY q.position, q.created_at, q.id;

    INSERT INTO public.form_template_service_types (template_id, service_type_id)
    SELECT v_new_id, link.service_type_id
      FROM public.form_template_service_types link
     WHERE link.template_id = v_source.id;

    id := v_new_id;
    name := v_new_name;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.duplicate_form_template(uuid, text, integer) IS
  'Duplica de 1 a 20 checklists do tenant em uma unica transacao. Copia perguntas e tipos de servico, nasce inativo e remove a identidade reservada de norma PMOC.';

REVOKE ALL ON FUNCTION public.duplicate_form_template(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duplicate_form_template(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.duplicate_form_template(uuid, text, integer) TO authenticated, service_role;


-- Travas de instalacao: uma migration parcialmente aplicada nao pode deixar as
-- RPCs publicas ou sem acesso para o app autenticado.
DO $audit$
BEGIN
  IF has_function_privilege(
       'anon',
       'public.duplicate_lead_capture_form(uuid,text,integer)',
       'EXECUTE'
     ) OR has_function_privilege(
       'anon',
       'public.duplicate_form_template(uuid,text,integer)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Auditoria falhou: anon pode executar RPC de duplicacao';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.duplicate_lead_capture_form(uuid,text,integer)',
       'EXECUTE'
     ) OR NOT has_function_privilege(
       'authenticated',
       'public.duplicate_form_template(uuid,text,integer)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Auditoria falhou: authenticated sem acesso as RPCs de duplicacao';
  END IF;
END;
$audit$;

COMMIT;

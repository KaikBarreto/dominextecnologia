-- =============================================================================
-- Adiciona employee_name (nome completo) ao payload de get_disc_public
-- POR QUE: o cabecalho da tela publica do DISC precisa mostrar o nome completo
--          do funcionario (nao so o primeiro nome). employee_first_name e mantido
--          para compatibilidade com o frontend existente.
-- ESCOPO: so adiciona a chave employee_name no jsonb de retorno.
--         Nada mais muda: allowlist (sem CPF/salario/email/telefone),
--         SECURITY DEFINER, search_path, grants.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_disc_public(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row           public.disc_assessments%ROWTYPE;
  v_emp_first     text;
  v_emp_full      text;
  v_cs            record;
  v_show          boolean;
  v_result        jsonb;
BEGIN
  IF p_code IS NULL OR length(btrim(p_code)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
  FROM public.disc_assessments
  WHERE public_short_code = p_code;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Nome do funcionario: primeiro nome (privacidade) + nome completo (cabecalho).
  -- Nenhum outro campo de employees e exposto (sem CPF/salario/email/telefone).
  SELECT split_part(e.name, ' ', 1), e.name
    INTO v_emp_first, v_emp_full
  FROM public.employees e
  WHERE e.id = v_row.employee_id;

  -- Branding do tenant (white-label). Cor/logo: se white-label ligado usa os
  -- campos white_label_*, senao o logo padrao + verde da marca (#00C597).
  -- language: idioma da empresa para i18n da tela publica (nao e dado sensivel).
  SELECT
    cs.name AS company_name,
    CASE WHEN cs.white_label_enabled AND NULLIF(btrim(cs.white_label_logo_url), '') IS NOT NULL
         THEN cs.white_label_logo_url ELSE cs.logo_url END AS logo_url,
    COALESCE(
      CASE WHEN cs.white_label_enabled THEN NULLIF(btrim(cs.white_label_primary_color), '') END,
      '#00C597'
    ) AS primary_color,
    cs.disc_show_result_to_employee AS show_result,
    COALESCE(NULLIF(btrim(cs.language), ''), 'pt-br') AS company_locale
  INTO v_cs
  FROM public.company_settings cs
  WHERE cs.company_id = v_row.company_id;

  v_show := COALESCE(v_cs.show_result, true);

  v_result := jsonb_build_object(
    'company_name',            v_cs.company_name,
    'logo_url',                v_cs.logo_url,
    'primary_color',           v_cs.primary_color,
    'company_locale',          v_cs.company_locale,
    'employee_first_name',     v_emp_first,
    'employee_name',           v_emp_full,
    'status',                  v_row.status,
    'show_result_to_employee', v_show
  );

  -- Dados do perfil so quando completo E o RH permite o funcionario ver.
  IF v_row.status = 'completed' AND v_show = true THEN
    v_result := v_result || jsonb_build_object(
      'scores',         v_row.scores,
      'profile_code',   v_row.profile_code,
      'primary_type',   v_row.primary_type,
      'secondary_type', v_row.secondary_type,
      'completed_at',   v_row.completed_at,
      'locale',         v_row.locale
    );
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_disc_public(text) IS
  'Payload publico do teste DISC (link /avaliacao/:token). SECURITY DEFINER: recebe so o short_code. Allowlist rigida — expoe branding + company_locale + 1o nome (employee_first_name) + nome completo (employee_name) + status; scores/profile so quando completed E visivel ao funcionario. NUNCA vaza salario/CPF/email/telefone nem outro tenant.';

-- GRANT preservado (CREATE OR REPLACE mantem; confirmado explicitamente).
GRANT EXECUTE ON FUNCTION public.get_disc_public(text) TO anon, authenticated;

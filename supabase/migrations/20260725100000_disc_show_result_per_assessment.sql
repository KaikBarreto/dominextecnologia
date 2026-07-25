-- =============================================================================
-- Perfil Comportamental (DISC): show_result_to_employee por avaliacao.
-- POR QUE: ate aqui a visibilidade era global (company_settings.disc_show_result_to_employee).
--   Agora pode ser configurada POR AVALIACAO: quando a coluna da avaliacao e NULL,
--   herda a config da empresa; quando preenchida, prevalece sobre o global.
--   Lookup efetivo: COALESCE(a.show_result_to_employee, cs.disc_show_result_to_employee, false).
-- =============================================================================
-- O QUE ENTREGA:
--   1. Coluna disc_assessments.show_result_to_employee boolean NULLABLE.
--      NULL = herda config da empresa (retrocompativel: todas as linhas existentes ficam NULL).
--   2. get_disc_public atualizado com COALESCE de 3 niveis (avaliacao -> empresa -> false).
--   3. submit_disc_assessment atualizado com o mesmo COALESCE.
--   4. Geração do link: INSERT client-side (RLS autenticado de gestor) ja permite
--      gravar a coluna nova sem afrouxar isolamento — policy WITH CHECK so exige
--      company_id correto + can_manage_system. Nenhuma RPC de geração e exposta.
-- =============================================================================

-- =====================================================================
-- PASSO 1 — Coluna por avaliação (NULLABLE = herda empresa).
-- =====================================================================
ALTER TABLE public.disc_assessments
  ADD COLUMN IF NOT EXISTS show_result_to_employee boolean;

COMMENT ON COLUMN public.disc_assessments.show_result_to_employee IS
  'Perfil Comportamental (DISC): visibilidade do resultado para o funcionario nesta avaliacao especifica. NULL = herda company_settings.disc_show_result_to_employee. Lookup efetivo: COALESCE(a.show_result_to_employee, cs.disc_show_result_to_employee, false).';

-- =====================================================================
-- PASSO 2 — RPC get_disc_public: COALESCE 3-niveis na visibilidade.
-- Unica mudanca em relacao a versao anterior: v_show usa COALESCE
--   (v_row.show_result_to_employee, v_cs.show_result, false)
-- ao inves de COALESCE(v_cs.show_result, true).
-- Tudo mais (allowlist, SECURITY DEFINER, search_path, grants) intacto.
-- =====================================================================
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
  -- disc_show_result_to_employee: config global do tenant (nivel 2 do COALESCE).
  SELECT
    cs.name AS company_name,
    CASE WHEN cs.white_label_enabled AND NULLIF(btrim(cs.white_label_logo_url), '') IS NOT NULL
         THEN cs.white_label_logo_url ELSE cs.logo_url END AS logo_url,
    COALESCE(
      CASE WHEN cs.white_label_enabled THEN NULLIF(btrim(cs.white_label_primary_color), '') END,
      '#00C597'
    ) AS primary_color,
    cs.disc_show_result_to_employee AS show_result_company,
    COALESCE(NULLIF(btrim(cs.language), ''), 'pt-br') AS company_locale
  INTO v_cs
  FROM public.company_settings cs
  WHERE cs.company_id = v_row.company_id;

  -- COALESCE 3-niveis: avaliacao -> empresa -> false (seguro por padrao).
  v_show := COALESCE(v_row.show_result_to_employee, v_cs.show_result_company, false);

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
  'Payload publico do teste DISC (link /avaliacao/:token). SECURITY DEFINER: recebe so o short_code. Allowlist rigida — expoe branding + company_locale + 1o nome (employee_first_name) + nome completo (employee_name) + status; scores/profile so quando completed E visivel ao funcionario. Visibilidade efetiva: COALESCE(avaliacao.show_result_to_employee, empresa.disc_show_result_to_employee, false). NUNCA vaza salario/CPF/email/telefone nem outro tenant.';

-- GRANT preservado (CREATE OR REPLACE mantem; confirmado explicitamente).
GRANT EXECUTE ON FUNCTION public.get_disc_public(text) TO anon, authenticated;

-- =====================================================================
-- PASSO 3 — RPC submit_disc_assessment: mesmo COALESCE 3-niveis.
-- Unica mudanca: busca cs.disc_show_result_to_employee + aplica
--   COALESCE(v_row.show_result_to_employee, v_cs_show, false).
-- Tudo mais (allowlist, SECURITY DEFINER, anti-duplo) intacto.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.submit_disc_assessment(
  p_code    text,
  p_answers jsonb,
  p_scores  jsonb,
  p_profile jsonb,
  p_locale  text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row       public.disc_assessments%ROWTYPE;
  v_show      boolean;
  v_cs_show   boolean;
  v_primary   char(1);
  v_secondary char(1);
  v_profile   text;
BEGIN
  IF p_code IS NULL OR length(btrim(p_code)) = 0 THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT * INTO v_row
  FROM public.disc_assessments
  WHERE public_short_code = p_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  -- Config global do tenant (nivel 2 do COALESCE).
  SELECT cs.disc_show_result_to_employee INTO v_cs_show
  FROM public.company_settings cs
  WHERE cs.company_id = v_row.company_id;

  -- COALESCE 3-niveis: avaliacao -> empresa -> false (seguro por padrao).
  v_show := COALESCE(v_row.show_result_to_employee, v_cs_show, false);

  -- Anti-duplo-envio: ja respondido -> nao regrava.
  IF v_row.status = 'completed' THEN
    RETURN jsonb_build_object(
      'already',                 true,
      'show_result_to_employee', v_show,
      'scores',                  v_row.scores,
      'profile_code',            v_row.profile_code,
      'primary_type',            v_row.primary_type,
      'secondary_type',          v_row.secondary_type
    );
  END IF;

  -- Allowlist de p_profile: so extrai primary/secondary/profile_code.
  v_primary   := NULLIF(btrim(p_profile->>'primary'), '');
  v_secondary := NULLIF(btrim(p_profile->>'secondary'), '');
  v_profile   := NULLIF(btrim(p_profile->>'profile_code'), '');

  UPDATE public.disc_assessments
  SET answers        = p_answers,
      scores         = p_scores,
      primary_type   = v_primary,
      secondary_type = v_secondary,
      profile_code   = v_profile,
      locale         = NULLIF(btrim(p_locale), ''),
      status         = 'completed',
      completed_at   = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'show_result_to_employee', v_show,
    'scores',                  p_scores,
    'profile_code',            v_profile,
    'primary_type',            v_primary,
    'secondary_type',          v_secondary
  );
END;
$$;

COMMENT ON FUNCTION public.submit_disc_assessment(text, jsonb, jsonb, jsonb, text) IS
  'Grava o resultado do teste DISC pelo short_code (link publico anonimo). SECURITY DEFINER. Anti-duplo-envio: se ja completed, nao regrava (retorna already=true). Allowlist: grava so answers/scores/primary/secondary/profile_code/locale; ignora chaves extras de p_profile. Visibilidade efetiva: COALESCE(avaliacao.show_result_to_employee, empresa.disc_show_result_to_employee, false).';

GRANT EXECUTE ON FUNCTION public.submit_disc_assessment(text, jsonb, jsonb, jsonb, text)
  TO anon, authenticated;

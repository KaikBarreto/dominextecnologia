-- =============================================================================
-- Ativacao unificada do ponto individual
--
-- O link facial temporario passa a ser o unico link de onboarding enviado ao
-- funcionario. Seu contexto publico inclui apenas o caminho opaco do ponto
-- individual para permitir continuar sem biometria ou seguir ao ponto depois
-- do cadastro. O token continua aleatorio, expira em 24h e e a capability.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_face_enrollment_context(
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'employee_first_name', split_part(btrim(e.name), ' ', 1),
    'company_name', coalesce(nullif(btrim(cs.name), ''), nullif(btrim(c.name), ''), 'Empresa'),
    'language', CASE
      WHEN btrim(cs.language) IN ('pt-br', 'en', 'es', 'fr') THEN btrim(cs.language)
      ELSE 'pt-br'
    END,
    'white_label_enabled', coalesce(cs.white_label_enabled, false),
    'white_label_primary_color', cs.white_label_primary_color,
    'white_label_logo_url', cs.white_label_logo_url,
    'logo_url', cs.logo_url,
    'model_version', 'face-api@1.7.15/dlib-128d-v1',
    'embedding_dimension', 128,
    'required_captures', 3,
    'expires_at', t.expires_at,
    'point_path', '/ponto/' || e.ponto_slug
  )
  INTO v_result
  FROM public.employee_face_enrollment_tokens t
  JOIN public.employees e
    ON e.id = t.employee_id
   AND e.company_id = t.company_id
  JOIN public.companies c ON c.id = t.company_id
  LEFT JOIN public.company_settings cs ON cs.company_id = t.company_id
  WHERE t.token_hash = p_token_hash
    AND t.used_at IS NULL
    AND t.revoked_at IS NULL
    AND t.expires_at > now()
    AND e.is_active = true
    AND e.ponto_enabled = true
    AND e.ponto_slug IS NOT NULL
    AND e.ponto_slug <> ''
    AND public.company_has_module(t.company_id, 'rh') = true
  LIMIT 1;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_face_enrollment_context(text) IS
  'Retorna contexto minimo da ativacao facial e o caminho opaco do ponto individual para o titular da capability temporaria.';

REVOKE ALL ON FUNCTION public.get_face_enrollment_context(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_face_enrollment_context(text)
  TO service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_face_enrollment_context(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_face_enrollment_context(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_face_enrollment_context(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grant invalido em get_face_enrollment_context';
  END IF;
END;
$$;

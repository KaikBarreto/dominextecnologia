-- API pública: escopo de chave não substitui contratação do núcleo Serviços.
-- Clientes/CRM mantêm seus gates atuais; empresas de Serviços preservam acesso.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';

CREATE OR REPLACE FUNCTION public.public_api_assert_integration(
  p_integration_id uuid,
  p_required_scope text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company_id uuid; v_scopes text[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'public_api_service_role_required' USING ERRCODE = '42501';
  END IF;
  SELECT company_id, scopes INTO v_company_id, v_scopes
    FROM public.public_api_integrations
   WHERE id = p_integration_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'public_api_integration_disabled' USING ERRCODE = '42501'; END IF;
  IF p_required_scope IS NOT NULL AND (p_required_scope = ANY(v_scopes)) IS NOT TRUE THEN
    RAISE EXCEPTION 'public_api_insufficient_scope' USING ERRCODE = '42501';
  END IF;
  IF public.public_api_company_is_enabled(v_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'public_api_tenant_not_entitled' USING ERRCODE = '42501';
  END IF;
  -- Chaves e service_role não concedem o núcleo ausente. A mesma cerca roda
  -- antes do replay e dentro das RPCs de leitura, agenda e criação de OS.
  IF p_required_scope IN ('catalogs:read','availability:read','service_orders:create','service_orders:read')
     AND public.company_has_module(v_company_id,'service_operations') IS NOT TRUE THEN
    RAISE EXCEPTION 'public_api_service_operations_required' USING ERRCODE = '42501';
  END IF;
  RETURN v_company_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_assert_integration(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_api_get_catalogs(p_integration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company_id uuid;
BEGIN
  v_company_id := public.public_api_assert_integration(p_integration_id, 'catalogs:read');
  RETURN jsonb_build_object(
    'service_types', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'description', st.description, 'color', st.color, 'requires_equipment', st.requires_equipment) ORDER BY st.name)
      FROM public.service_types st WHERE st.company_id = v_company_id AND st.is_active
    ), '[]'::jsonb),
    'resources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'resource_type', r.resource_type, 'resource_id', r.resource_id,
        'name', CASE WHEN r.resource_type = 'user' THEN p.full_name ELSE t.name END
      ) ORDER BY r.resource_type, CASE WHEN r.resource_type = 'user' THEN p.full_name ELSE t.name END)
      FROM public.public_api_integration_resources r
      LEFT JOIN public.profiles p ON r.resource_type = 'user' AND p.user_id = r.resource_id AND p.company_id = v_company_id
      LEFT JOIN public.teams t ON r.resource_type = 'team' AND t.id = r.resource_id AND t.company_id = v_company_id
      WHERE r.integration_id = p_integration_id AND r.company_id = v_company_id AND r.is_active
    ), '[]'::jsonb),
    'os_types', jsonb_build_array('manutencao_preventiva', 'manutencao_corretiva', 'instalacao', 'visita_tecnica')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_get_catalogs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_get_catalogs(uuid) TO service_role;

COMMIT;

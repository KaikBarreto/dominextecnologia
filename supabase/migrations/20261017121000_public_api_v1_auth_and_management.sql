-- ============================================================================
-- API Publica v1: autenticacao, rate limit, auditoria e gestao de chaves
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_explicit_public_api_permission(
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT p_user_id IS NOT NULL
     AND ((SELECT auth.role()) = 'service_role' OR p_user_id = (SELECT auth.uid()))
     AND p_permission IN ('fn:manage_api_keys', 'fn:override_schedule_conflict')
     AND (
       public.is_super_admin(p_user_id)
       OR EXISTS (
         SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p_user_id AND ur.role::text = 'admin'
       )
       OR EXISTS (
         SELECT 1
           FROM public.user_permissions up
          WHERE up.user_id = p_user_id
            AND up.is_active
            AND (up.permissions ? '*' OR up.permissions ? p_permission)
       )
     );
$function$;

REVOKE ALL ON FUNCTION public.has_explicit_public_api_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_explicit_public_api_permission(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_api_company_is_enabled(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.app_feature_flags f
     WHERE f.key = 'public_api_v1'
       AND (f.enabled OR p_company_id = ANY(f.company_allowlist))
  )
  AND public.tenant_subscription_allows_access(p_company_id, now());
$function$;

REVOKE ALL ON FUNCTION public.public_api_company_is_enabled(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_company_is_enabled(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.api_key_manager_consume_rate_limit(
  p_user_id uuid,
  p_ip_hash text,
  p_route text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_expected_limit integer;
  v_expected_window integer;
  v_window_start timestamptz;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'api_key_manager_subject_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_explicit_public_api_permission(auth.uid(), 'fn:manage_api_keys') THEN
    RAISE EXCEPTION 'api_key_manager_permission_denied' USING ERRCODE = '42501';
  END IF;
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'api_key_manager_invalid_ip_hash' USING ERRCODE = '22023';
  END IF;

  CASE p_route
    WHEN 'general' THEN v_expected_limit := 60; v_expected_window := 60;
    WHEN 'mutation' THEN v_expected_limit := 10; v_expected_window := 60;
    WHEN 'key_issue' THEN v_expected_limit := 5; v_expected_window := 3600;
    ELSE RAISE EXCEPTION 'api_key_manager_invalid_route' USING ERRCODE = '22023';
  END CASE;
  IF p_limit <> v_expected_limit OR p_window_seconds <> v_expected_window THEN
    RAISE EXCEPTION 'api_key_manager_invalid_limit_contract' USING ERRCODE = '22023';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / v_expected_window) * v_expected_window
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('api-key-manager:' || p_user_id::text || ':' || p_ip_hash || ':' || p_route || ':' || v_window_start::text, 0)
  );

  INSERT INTO public.api_key_manager_rate_limit_buckets (
    user_id, ip_hash, route, window_started_at, request_count, expires_at, updated_at
  ) VALUES (
    p_user_id, p_ip_hash, p_route, v_window_start, 1,
    v_window_start + interval '48 hours', now()
  )
  ON CONFLICT (user_id, ip_hash, route, window_started_at)
  DO UPDATE SET
    request_count = public.api_key_manager_rate_limit_buckets.request_count + 1,
    updated_at = now()
  RETURNING request_count INTO v_count;

  RETURN jsonb_build_object(
    'allowed', v_count <= v_expected_limit,
    'limit', v_expected_limit,
    'remaining', greatest(v_expected_limit - v_count, 0),
    'reset_at', v_window_start + make_interval(secs => v_expected_window)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.api_key_manager_consume_rate_limit(uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.api_key_manager_consume_rate_limit(uuid, text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.public_api_authenticate_key(
  p_public_id text,
  p_secret_hash text,
  p_required_scope text DEFAULT NULL,
  p_source_ip inet DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_key public.public_api_keys%ROWTYPE;
  v_integration public.public_api_integrations%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'public_api_service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_secret_hash IS NULL OR p_secret_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('authenticated', false, 'code', 'invalid_api_key');
  END IF;

  SELECT * INTO v_key
    FROM public.public_api_keys
   WHERE public_id = p_public_id
     AND secret_hash = p_secret_hash;
  IF NOT FOUND
     OR v_key.revoked_at IS NOT NULL
     OR now() < v_key.valid_from
     OR now() >= v_key.expires_at THEN
    RETURN jsonb_build_object('authenticated', false, 'code', 'invalid_api_key');
  END IF;

  SELECT * INTO v_integration
    FROM public.public_api_integrations
   WHERE id = v_key.integration_id
     AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('authenticated', false, 'code', 'integration_disabled');
  END IF;
  IF cardinality(v_integration.ip_allowlist) > 0
     AND (p_source_ip IS NULL OR NOT EXISTS (
       SELECT 1 FROM unnest(v_integration.ip_allowlist) allowed WHERE p_source_ip <<= allowed
     )) THEN
    RETURN jsonb_build_object('authenticated', false, 'code', 'ip_not_allowed');
  END IF;
  IF p_required_scope IS NOT NULL AND NOT (p_required_scope = ANY(v_integration.scopes)) THEN
    RETURN jsonb_build_object('authenticated', false, 'code', 'insufficient_scope');
  END IF;
  IF NOT public.public_api_company_is_enabled(v_integration.company_id) THEN
    RETURN jsonb_build_object('authenticated', false, 'code', 'tenant_not_entitled');
  END IF;

  UPDATE public.public_api_keys SET last_used_at = now() WHERE id = v_key.id;
  RETURN jsonb_build_object(
    'authenticated', true,
    'key_id', v_key.id,
    'integration_id', v_integration.id,
    'company_id', v_integration.company_id,
    'scopes', to_jsonb(v_integration.scopes)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_authenticate_key(text, text, text, inet) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_authenticate_key(text, text, text, inet) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_consume_rate_limit(
  p_key_id uuid,
  p_route text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_expected_limit integer;
  v_window_start timestamptz;
  v_count integer;
  v_company_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'public_api_service_role_required' USING ERRCODE = '42501';
  END IF;
  CASE p_route
    WHEN 'general' THEN v_expected_limit := 60;
    WHEN 'availability' THEN v_expected_limit := 30;
    WHEN 'mutation' THEN v_expected_limit := 10;
    ELSE RAISE EXCEPTION 'public_api_invalid_rate_route' USING ERRCODE = '22023';
  END CASE;
  IF p_limit <> v_expected_limit OR p_window_seconds <> 60 THEN
    RAISE EXCEPTION 'public_api_invalid_rate_contract' USING ERRCODE = '22023';
  END IF;

  SELECT i.company_id INTO v_company_id
    FROM public.public_api_keys k
    JOIN public.public_api_integrations i ON i.id = k.integration_id
   WHERE k.id = p_key_id
     AND k.revoked_at IS NULL
     AND now() >= k.valid_from
     AND now() < k.expires_at
     AND i.status = 'active';
  IF NOT FOUND OR NOT public.public_api_company_is_enabled(v_company_id) THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'invalid_api_key');
  END IF;

  v_window_start := date_trunc('minute', clock_timestamp());
  PERFORM pg_advisory_xact_lock(
    hashtextextended('public-api-rate:' || p_key_id::text || ':' || p_route || ':' || v_window_start::text, 0)
  );
  INSERT INTO public.public_api_rate_limit_buckets (
    key_id, route, window_started_at, request_count, expires_at, updated_at
  ) VALUES (
    p_key_id, p_route, v_window_start, 1, v_window_start + interval '48 hours', now()
  )
  ON CONFLICT (key_id, route, window_started_at)
  DO UPDATE SET
    request_count = public.public_api_rate_limit_buckets.request_count + 1,
    updated_at = now()
  RETURNING request_count INTO v_count;

  RETURN jsonb_build_object(
    'allowed', v_count <= v_expected_limit,
    'limit', v_expected_limit,
    'remaining', greatest(v_expected_limit - v_count, 0),
    'reset_at', v_window_start + interval '1 minute'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_consume_rate_limit(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_consume_rate_limit(uuid, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_insert_request_audit(
  p_request_id uuid,
  p_integration_id uuid,
  p_key_id uuid,
  p_route text,
  p_method text,
  p_status_code integer DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_ip_hash text DEFAULT NULL,
  p_endpoint text DEFAULT '/v1'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_company_id uuid;
  v_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'public_api_service_role_required' USING ERRCODE = '42501';
  END IF;
  SELECT i.company_id INTO v_company_id
    FROM public.public_api_integrations i
    JOIN public.public_api_keys k ON k.integration_id = i.id
   WHERE i.id = p_integration_id AND k.id = p_key_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'public_api_audit_context_mismatch' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.public_api_request_audit (
    request_id, company_id, integration_id, key_id, route, method, endpoint,
    status_code, duration_ms, error_code, ip_hash, outcome, completed_at
  ) VALUES (
    p_request_id, v_company_id, p_integration_id, p_key_id, p_route, upper(p_method), p_endpoint,
    p_status_code, p_duration_ms, p_error_code, p_ip_hash,
    CASE WHEN p_status_code IS NULL THEN 'received'
         WHEN p_status_code < 400 THEN 'success'
         WHEN p_status_code IN (401,403,409,429) THEN 'denied'
         ELSE 'failed' END,
    CASE WHEN p_status_code IS NULL THEN NULL ELSE now() END
  )
  ON CONFLICT (request_id) DO UPDATE SET
    status_code = EXCLUDED.status_code,
    duration_ms = EXCLUDED.duration_ms,
    error_code = EXCLUDED.error_code,
    outcome = EXCLUDED.outcome,
    completed_at = EXCLUDED.completed_at
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_insert_request_audit(uuid, uuid, uuid, text, text, integer, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_insert_request_audit(uuid, uuid, uuid, text, text, integer, integer, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_list_integrations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company_id uuid;
BEGIN
  IF NOT public.has_explicit_public_api_permission(auth.uid(), 'fn:manage_api_keys') THEN
    RAISE EXCEPTION 'public_api_manage_keys_denied' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(auth.uid());
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'public_api_tenant_missing' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', i.id, 'name', i.name, 'description', i.description,
      'status', i.status, 'scopes', i.scopes,
      'distribution_mode', i.distribution_mode, 'ip_allowlist', i.ip_allowlist,
      'created_at', i.created_at,
      'resources', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'resource_type', r.resource_type, 'resource_id', r.resource_id,
        'is_active', r.is_active
      ) ORDER BY r.resource_type, r.resource_id)
        FROM public.public_api_integration_resources r WHERE r.integration_id = i.id), '[]'::jsonb),
      'activity', jsonb_build_object(
        'requests_24h', (SELECT count(*) FROM public.public_api_request_audit a WHERE a.integration_id = i.id AND a.created_at >= now() - interval '24 hours'),
        'last_request_at', (SELECT max(a.created_at) FROM public.public_api_request_audit a WHERE a.integration_id = i.id),
        'last_status_code', (SELECT a.status_code FROM public.public_api_request_audit a WHERE a.integration_id = i.id ORDER BY a.created_at DESC LIMIT 1)
      ),
      'keys', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', k.id, 'public_id', k.public_id, 'secret_last_four', k.secret_last_four,
        'name', k.name, 'valid_from', k.valid_from, 'expires_at', k.expires_at,
        'last_used_at', k.last_used_at, 'revoked_at', k.revoked_at
      ) ORDER BY k.created_at DESC) FROM public.public_api_keys k WHERE k.integration_id = i.id), '[]'::jsonb)
    ) ORDER BY i.created_at DESC)
    FROM public.public_api_integrations i WHERE i.company_id = v_company_id
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_list_integrations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.public_api_list_integrations() TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_upsert_integration(
  p_id uuid,
  p_name text,
  p_scopes text[],
  p_status text DEFAULT 'active',
  p_distribution_mode text DEFAULT 'all',
  p_ip_allowlist inet[] DEFAULT '{}',
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company_id uuid; v_row public.public_api_integrations%ROWTYPE;
BEGIN
  IF NOT public.has_explicit_public_api_permission(auth.uid(), 'fn:manage_api_keys') THEN
    RAISE EXCEPTION 'public_api_manage_keys_denied' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(auth.uid());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'public_api_tenant_missing' USING ERRCODE = '42501'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.public_api_integrations (
      company_id, name, description, scopes, status, distribution_mode, ip_allowlist, created_by, disabled_at
    ) VALUES (
      v_company_id, btrim(p_name), p_description, p_scopes, p_status, p_distribution_mode,
      COALESCE(p_ip_allowlist, '{}'), auth.uid(), CASE WHEN p_status = 'inactive' THEN now() END
    ) RETURNING * INTO v_row;
  ELSE
    UPDATE public.public_api_integrations SET
      name = btrim(p_name), description = p_description, scopes = p_scopes,
      status = p_status, distribution_mode = p_distribution_mode,
      ip_allowlist = COALESCE(p_ip_allowlist, '{}'),
      disabled_at = CASE WHEN p_status = 'inactive' THEN COALESCE(disabled_at, now()) END
    WHERE id = p_id AND company_id = v_company_id
    RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'public_api_integration_not_found' USING ERRCODE = 'P0001'; END IF;
  END IF;
  RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'status', v_row.status, 'scopes', v_row.scopes);
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_upsert_integration(uuid, text, text[], text, text, inet[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.public_api_upsert_integration(uuid, text, text[], text, text, inet[], text) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_create_key(p_integration_id uuid, p_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
DECLARE v_company_id uuid; v_secret text; v_public_id text; v_key public.public_api_keys%ROWTYPE;
BEGIN
  IF NOT public.has_explicit_public_api_permission(auth.uid(), 'fn:manage_api_keys') THEN
    RAISE EXCEPTION 'public_api_manage_keys_denied' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(auth.uid());
  IF NOT EXISTS (SELECT 1 FROM public.public_api_integrations WHERE id = p_integration_id AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'public_api_integration_not_found' USING ERRCODE = 'P0001';
  END IF;
  v_secret := encode(gen_random_bytes(32), 'hex');
  v_public_id := substr(encode(gen_random_bytes(10), 'hex'), 1, 16);
  INSERT INTO public.public_api_keys (
    integration_id, public_id, secret_hash, secret_last_four, name, created_by
  ) VALUES (
    p_integration_id, v_public_id, encode(digest(v_secret, 'sha256'), 'hex'), right(v_secret, 4), p_name, auth.uid()
  ) RETURNING * INTO v_key;
  RETURN jsonb_build_object(
    'id', v_key.id, 'public_id', v_key.public_id, 'secret', v_secret,
    'token', 'dmx_live_' || v_key.public_id || '.' || v_secret, 'secret_last_four', v_key.secret_last_four,
    'expires_at', v_key.expires_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_create_key(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.public_api_create_key(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_rotate_key(p_key_id uuid, p_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
DECLARE v_company_id uuid; v_old public.public_api_keys%ROWTYPE; v_new jsonb; v_new_id uuid;
BEGIN
  IF NOT public.has_explicit_public_api_permission(auth.uid(), 'fn:manage_api_keys') THEN
    RAISE EXCEPTION 'public_api_manage_keys_denied' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(auth.uid());
  SELECT k.* INTO v_old FROM public.public_api_keys k
  JOIN public.public_api_integrations i ON i.id = k.integration_id
  WHERE k.id = p_key_id AND i.company_id = v_company_id AND k.revoked_at IS NULL FOR UPDATE OF k;
  IF NOT FOUND THEN RAISE EXCEPTION 'public_api_key_not_found' USING ERRCODE = 'P0001'; END IF;

  v_new := public.public_api_create_key(v_old.integration_id, COALESCE(p_name, v_old.name));
  v_new_id := (v_new->>'id')::uuid;
  UPDATE public.public_api_keys
     SET expires_at = least(expires_at, now() + interval '7 days')
   WHERE id = v_old.id;
  RETURN v_new || jsonb_build_object('rotated_key_id', v_old.id, 'old_key_valid_until', least(v_old.expires_at, now() + interval '7 days'));
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_rotate_key(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.public_api_rotate_key(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_revoke_key(p_key_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_company_id uuid; v_revoked_at timestamptz;
BEGIN
  IF NOT public.has_explicit_public_api_permission(auth.uid(), 'fn:manage_api_keys') THEN
    RAISE EXCEPTION 'public_api_manage_keys_denied' USING ERRCODE = '42501';
  END IF;
  v_company_id := public.get_user_company_id(auth.uid());
  UPDATE public.public_api_keys k SET revoked_at = COALESCE(k.revoked_at, now())
   FROM public.public_api_integrations i
   WHERE k.id = p_key_id AND i.id = k.integration_id AND i.company_id = v_company_id
   RETURNING k.revoked_at INTO v_revoked_at;
  IF NOT FOUND THEN RAISE EXCEPTION 'public_api_key_not_found' USING ERRCODE = 'P0001'; END IF;
  RETURN jsonb_build_object('id', p_key_id, 'revoked_at', v_revoked_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_revoke_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.public_api_revoke_key(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.public_api_cleanup_expired_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_idempotency integer; v_rate integer; v_manager_rate integer; v_audit integer;
BEGIN
  DELETE FROM public.public_api_idempotency WHERE expires_at <= now(); GET DIAGNOSTICS v_idempotency = ROW_COUNT;
  DELETE FROM public.public_api_rate_limit_buckets WHERE expires_at <= now(); GET DIAGNOSTICS v_rate = ROW_COUNT;
  DELETE FROM public.api_key_manager_rate_limit_buckets WHERE expires_at <= now(); GET DIAGNOSTICS v_manager_rate = ROW_COUNT;
  DELETE FROM public.public_api_request_audit WHERE expires_at <= now(); GET DIAGNOSTICS v_audit = ROW_COUNT;
  RETURN jsonb_build_object('idempotency', v_idempotency, 'rate_limit', v_rate, 'manager_rate_limit', v_manager_rate, 'audit', v_audit);
END;
$function$;

REVOKE ALL ON FUNCTION public.public_api_cleanup_expired_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_api_cleanup_expired_data() TO service_role;

-- O gerenciador oficial valida JWT, permissao e os tres buckets persistentes
-- antes de escrever via service_role. Nao deixamos uma segunda superficie RPC
-- autenticada capaz de emitir segredo e contornar esse rate limit.
DROP FUNCTION IF EXISTS public.public_api_rotate_key(uuid, text);
DROP FUNCTION IF EXISTS public.public_api_create_key(uuid, text);
DROP FUNCTION IF EXISTS public.public_api_revoke_key(uuid);
DROP FUNCTION IF EXISTS public.public_api_upsert_integration(uuid, text, text[], text, text, inet[], text);
DROP FUNCTION IF EXISTS public.public_api_list_integrations();

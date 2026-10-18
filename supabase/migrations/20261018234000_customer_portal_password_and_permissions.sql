-- Portal do Cliente configuravel por cadastro:
--   * ativo/inativo;
--   * senha opcional (bcrypt, hash nunca exposto ao browser);
--   * sessao opaca revogavel de 30 dias;
--   * allowlist do que o cliente pode ver;
--   * abertura de chamado validada no servidor pelo mesmo acesso.
--
-- A fronteira continua sendo SECURITY DEFINER. Esconder aba no React e apenas
-- UX; os arrays proibidos sao montados como [] dentro de get_portal_data.

ALTER TABLE public.customer_portals
  ADD COLUMN IF NOT EXISTS password_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT jsonb_build_object(
    'service_orders', true,
    'equipment', true,
    'contracts', true,
    'charges', true,
    'ticket_requests', true
  );

ALTER TABLE public.customer_portals
  DROP CONSTRAINT IF EXISTS customer_portals_permissions_shape;

ALTER TABLE public.customer_portals
  ADD CONSTRAINT customer_portals_permissions_shape CHECK (
    jsonb_typeof(permissions) = 'object'
    AND (permissions - ARRAY[
      'service_orders', 'equipment', 'contracts', 'charges', 'ticket_requests'
    ]::text[]) = '{}'::jsonb
    AND (NOT (permissions ? 'service_orders') OR jsonb_typeof(permissions->'service_orders') = 'boolean')
    AND (NOT (permissions ? 'equipment') OR jsonb_typeof(permissions->'equipment') = 'boolean')
    AND (NOT (permissions ? 'contracts') OR jsonb_typeof(permissions->'contracts') = 'boolean')
    AND (NOT (permissions ? 'charges') OR jsonb_typeof(permissions->'charges') = 'boolean')
    AND (NOT (permissions ? 'ticket_requests') OR jsonb_typeof(permissions->'ticket_requests') = 'boolean')
  );

COMMENT ON COLUMN public.customer_portals.password_enabled IS
  'Indica se o link exige a senha do cliente. O hash fica isolado em customer_portal_credentials.';
COMMENT ON COLUMN public.customer_portals.permissions IS
  'Allowlist por portal: service_orders, equipment, contracts, charges e ticket_requests. Ausente = true por compatibilidade.';

-- Toda mutacao passa pela RPC com guard de tenant/permissao. SELECT continua
-- coberto pela policy tenant-scoped existente para a tela interna.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.customer_portals FROM anon, authenticated;

-- O modelo antigo tinha "privado = apenas equipe logada". A nova UX trabalha
-- com portal desligado, sem senha ou com senha. Para nao abrir nada que estava
-- privado, convertemos privado em DESLIGADO e normalizamos is_public.
UPDATE public.customer_portals
   SET is_active = false,
       is_public = true
 WHERE is_public = false;

CREATE TABLE IF NOT EXISTS public.customer_portal_credentials (
  portal_id uuid PRIMARY KEY REFERENCES public.customer_portals(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES public.customer_portals(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS customer_portal_sessions_portal_expiry_idx
  ON public.customer_portal_sessions (portal_id, expires_at DESC);

ALTER TABLE public.customer_portal_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_portal_sessions ENABLE ROW LEVEL SECURITY;

-- Sem policies de proposito: nem anon nem usuario do tenant recebe hash de
-- senha/sessao. Apenas as funcoes SECURITY DEFINER abaixo acessam as tabelas.
REVOKE ALL ON TABLE public.customer_portal_credentials FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.customer_portal_sessions FROM public, anon, authenticated;
GRANT ALL ON TABLE public.customer_portal_credentials TO service_role;
GRANT ALL ON TABLE public.customer_portal_sessions TO service_role;

COMMENT ON TABLE public.customer_portal_credentials IS
  'Hash bcrypt e lockout do Portal do Cliente. RLS sem policy e grants revogados; nunca expor ao browser.';
COMMENT ON TABLE public.customer_portal_sessions IS
  'Sessoes opacas do Portal do Cliente. Guarda somente SHA-256 do token e expira em 30 dias.';

CREATE OR REPLACE FUNCTION public.normalize_customer_portal_permissions(p_permissions jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'service_orders', COALESCE((p_permissions->>'service_orders')::boolean, true),
    'equipment', COALESCE((p_permissions->>'equipment')::boolean, true),
    'contracts', COALESCE((p_permissions->>'contracts')::boolean, true),
    'charges', COALESCE((p_permissions->>'charges')::boolean, true),
    'ticket_requests', COALESCE((p_permissions->>'ticket_requests')::boolean, true)
  )
$$;

CREATE OR REPLACE FUNCTION public.customer_portal_session_is_valid(
  p_portal_id uuid,
  p_session_token text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT p_session_token IS NOT NULL
    AND p_session_token <> ''
    AND EXISTS (
      SELECT 1
        FROM public.customer_portal_sessions s
       WHERE s.portal_id = p_portal_id
         AND s.token_hash = encode(extensions.digest(p_session_token, 'sha256'), 'hex')
         AND s.expires_at > now()
    )
$$;

REVOKE ALL ON FUNCTION public.normalize_customer_portal_permissions(jsonb)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_portal_session_is_valid(uuid, text)
  FROM public, anon, authenticated;

-- Leitura segura da aba Portal no cadastro/edicao. O hash nunca sai.
CREATE OR REPLACE FUNCTION public.get_customer_portal_settings(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id uuid;
  v_portal public.customer_portals%ROWTYPE;
BEGIN
  SELECT c.company_id INTO v_company_id
    FROM public.customers c
   WHERE c.id = p_customer_id AND COALESCE(c.is_deleted, false) = false;

  IF v_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT (
       auth.role() = 'service_role'
       OR nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role' = 'service_role'
       OR public.is_super_admin((SELECT auth.uid()))
       OR (
         v_company_id IS NOT DISTINCT FROM (SELECT public.get_user_company_id(auth.uid()))
         AND EXISTS (
           SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.company_id = v_company_id AND p.is_active
         )
         AND public.user_has_permission(auth.uid(), 'fn:edit_customer')
       )
  ) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_portal
    FROM public.customer_portals cp
   WHERE cp.customer_id = p_customer_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'token', v_portal.token,
    'is_active', v_portal.is_active,
    'password_enabled', v_portal.password_enabled,
    'password_configured', EXISTS (
      SELECT 1 FROM public.customer_portal_credentials pc WHERE pc.portal_id = v_portal.id
    ),
    'permissions', public.normalize_customer_portal_permissions(v_portal.permissions)
  );
END;
$$;

-- Salva a aba Portal com guard de tenant. Senha vazia preserva a atual apenas
-- quando ja existe credencial; habilitar pela primeira vez exige senha nova.
CREATE OR REPLACE FUNCTION public.save_customer_portal_settings(
  p_customer_id uuid,
  p_is_active boolean,
  p_password_enabled boolean,
  p_password text,
  p_permissions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_company_id uuid;
  v_portal_id uuid;
  v_token text;
  v_password_changed boolean := false;
  v_permissions jsonb;
BEGIN
  SELECT c.company_id INTO v_company_id
    FROM public.customers c
   WHERE c.id = p_customer_id AND COALESCE(c.is_deleted, false) = false;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Cliente nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
       auth.role() = 'service_role'
       OR nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role' = 'service_role'
       OR public.is_super_admin((SELECT auth.uid()))
       OR (
         v_company_id IS NOT DISTINCT FROM (SELECT public.get_user_company_id(auth.uid()))
         AND EXISTS (
           SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid() AND p.company_id = v_company_id AND p.is_active
         )
         AND public.user_has_permission(auth.uid(), 'fn:edit_customer')
       )
  ) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  v_permissions := public.normalize_customer_portal_permissions(COALESCE(p_permissions, '{}'::jsonb));

  INSERT INTO public.customer_portals (customer_id)
  VALUES (p_customer_id)
  ON CONFLICT (customer_id) DO NOTHING;

  SELECT cp.id, cp.token INTO v_portal_id, v_token
    FROM public.customer_portals cp
   WHERE cp.customer_id = p_customer_id
   FOR UPDATE;

  IF COALESCE(p_password_enabled, false) THEN
    IF p_password IS NOT NULL AND p_password <> '' THEN
      IF char_length(p_password) < 8 OR octet_length(p_password) > 72 OR btrim(p_password) = '' THEN
        RAISE EXCEPTION 'A senha precisa ter ao menos 8 caracteres e no maximo 72 bytes'
          USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.customer_portal_credentials (
        portal_id, password_hash, failed_attempts, locked_until, updated_at
      ) VALUES (
        v_portal_id,
        extensions.crypt(p_password, extensions.gen_salt('bf')),
        0,
        NULL,
        now()
      )
      ON CONFLICT (portal_id) DO UPDATE
        SET password_hash = EXCLUDED.password_hash,
            failed_attempts = 0,
            locked_until = NULL,
            updated_at = now();
      v_password_changed := true;
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.customer_portal_credentials pc WHERE pc.portal_id = v_portal_id
    ) THEN
      RAISE EXCEPTION 'Defina uma senha para proteger o portal'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    DELETE FROM public.customer_portal_sessions s WHERE s.portal_id = v_portal_id;
    DELETE FROM public.customer_portal_credentials pc WHERE pc.portal_id = v_portal_id;
  END IF;

  IF v_password_changed OR NOT COALESCE(p_is_active, false) THEN
    DELETE FROM public.customer_portal_sessions s WHERE s.portal_id = v_portal_id;
  END IF;

  UPDATE public.customer_portals cp
     SET is_active = COALESCE(p_is_active, false),
         is_public = true,
         password_enabled = COALESCE(p_password_enabled, false),
         permissions = v_permissions
   WHERE cp.id = v_portal_id;

  RETURN jsonb_build_object(
    'token', v_token,
    'is_active', COALESCE(p_is_active, false),
    'password_enabled', COALESCE(p_password_enabled, false),
    'password_configured', COALESCE(p_password_enabled, false),
    'permissions', v_permissions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_portal_settings(uuid)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_settings(uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_customer_portal_settings(uuid, boolean, boolean, text, jsonb)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_customer_portal_settings(uuid, boolean, boolean, text, jsonb)
  TO authenticated, service_role;

-- Login publico. Cinco erros consecutivos bloqueiam o portal por 15 minutos.
-- O retorno nunca distingue usuario/token/senha inexistente.
CREATE OR REPLACE FUNCTION public.customer_portal_login(
  p_token text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_portal public.customer_portals%ROWTYPE;
  v_credential public.customer_portal_credentials%ROWTYPE;
  v_raw_session text;
  v_failed integer;
BEGIN
  SELECT cp.* INTO v_portal
    FROM public.customer_portals cp
   WHERE cp.token = p_token
     AND cp.is_active = true
     AND cp.is_public = true
   LIMIT 1;

  IF NOT FOUND OR NOT v_portal.password_enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  SELECT * INTO v_credential
    FROM public.customer_portal_credentials pc
   WHERE pc.portal_id = v_portal.id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  IF v_credential.locked_until IS NOT NULL AND v_credential.locked_until > now() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'locked',
      'locked_until', v_credential.locked_until
    );
  END IF;

  IF p_password IS NOT NULL
     AND extensions.crypt(p_password, v_credential.password_hash) = v_credential.password_hash
  THEN
    UPDATE public.customer_portal_credentials
       SET failed_attempts = 0, locked_until = NULL
     WHERE portal_id = v_portal.id;

    DELETE FROM public.customer_portal_sessions
     WHERE portal_id = v_portal.id AND expires_at <= now();

    v_raw_session := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.customer_portal_sessions (portal_id, token_hash, expires_at)
    VALUES (
      v_portal.id,
      encode(extensions.digest(v_raw_session, 'sha256'), 'hex'),
      now() + interval '30 days'
    );

    RETURN jsonb_build_object(
      'ok', true,
      'session_token', v_raw_session,
      'expires_at', now() + interval '30 days'
    );
  END IF;

  v_failed := LEAST(COALESCE(v_credential.failed_attempts, 0) + 1, 5);
  UPDATE public.customer_portal_credentials
     SET failed_attempts = CASE WHEN v_failed >= 5 THEN 0 ELSE v_failed END,
         locked_until = CASE WHEN v_failed >= 5 THEN now() + interval '15 minutes' ELSE NULL END
   WHERE portal_id = v_portal.id;

  IF v_failed >= 5 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'locked',
      'locked_until', now() + interval '15 minutes'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', false,
    'error', 'invalid',
    'attempts_left', 5 - v_failed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.customer_portal_login(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.customer_portal_login(text, text)
  TO anon, authenticated, service_role;

-- Nova assinatura: recebe sessao opcional. O overload antigo de um argumento e
-- refeito mais abaixo como wrapper, portanto nenhum cliente legado contorna a senha.
CREATE OR REPLACE FUNCTION public.get_portal_data(
  p_token text,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_portal_id uuid;
  v_customer_id uuid;
  v_company_id uuid;
  v_is_public boolean;
  v_password_enabled boolean;
  v_permissions jsonb;
  v_is_company_member boolean;
  v_company_name text;
BEGIN
  SELECT cp.id, cp.customer_id, cp.is_public, cp.password_enabled,
         public.normalize_customer_portal_permissions(cp.permissions)
    INTO v_portal_id, v_customer_id, v_is_public, v_password_enabled, v_permissions
    FROM public.customer_portals cp
   WHERE cp.token = p_token AND cp.is_active = true
   LIMIT 1;

  IF v_customer_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.company_id INTO v_company_id
    FROM public.customers c
   WHERE c.id = v_customer_id AND COALESCE(c.is_deleted, false) = false;

  IF v_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Vigencia canonica aplicada aqui sem tenant_subscription_allows_access(),
  -- pois essa funcao deliberadamente recusa anon antes de avaliar a assinatura.
  IF NOT EXISTS (
    SELECT 1 FROM public.companies co
     WHERE co.id = v_company_id
       AND (
         (co.subscription_status = 'pending_payment' AND co.payment_lock_bypass IS TRUE)
         OR (
           co.subscription_status = 'testing'
           AND co.subscription_expires_at IS NOT NULL
           AND (co.subscription_expires_at AT TIME ZONE 'UTC')::date >= (now() AT TIME ZONE 'UTC')::date
         )
         OR (
           co.subscription_status = 'active'
           AND (
             co.subscription_expires_at IS NULL
             OR (co.subscription_expires_at AT TIME ZONE 'UTC')::date + 1 >= (now() AT TIME ZONE 'UTC')::date
           )
         )
       )
  ) OR NOT public.company_has_module(v_company_id, 'customer_portal') THEN
    SELECT cs.name INTO v_company_name
      FROM public.company_settings cs WHERE cs.company_id = v_company_id;
    IF v_company_name IS NULL OR btrim(v_company_name) = '' THEN
      SELECT co.name INTO v_company_name FROM public.companies co WHERE co.id = v_company_id;
    END IF;
    RETURN jsonb_build_object(
      'access', 'module_unavailable',
      'company_name', NULLIF(btrim(COALESCE(v_company_name, '')), '')
    );
  END IF;

  v_is_company_member := auth.uid() IS NOT NULL
    AND public.get_user_company_id(auth.uid()) IS NOT DISTINCT FROM v_company_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.user_id = auth.uid() AND p.company_id = v_company_id AND p.is_active
    );

  IF NOT v_is_public AND NOT v_is_company_member THEN
    RETURN jsonb_build_object('access', 'denied');
  END IF;

  IF v_password_enabled
     AND NOT v_is_company_member
     AND NOT public.customer_portal_session_is_valid(v_portal_id, p_session_token)
  THEN
    RETURN jsonb_build_object('access', 'password_required');
  END IF;

  RETURN jsonb_build_object(
    'access', 'granted',
    'viewer_can_fill', v_is_company_member,
    'permissions', v_permissions,
    'customer', (
      SELECT jsonb_build_object('id', c.id, 'name', c.name, 'company_id', c.company_id)
        FROM public.customers c WHERE c.id = v_customer_id
    ),
    'company_settings', (
      SELECT jsonb_build_object(
        'name', cs.name, 'logo_url', cs.logo_url, 'phone', cs.phone,
        'email', cs.email, 'address', cs.address, 'city', cs.city, 'state', cs.state,
        'white_label_enabled', cs.white_label_enabled,
        'white_label_primary_color', cs.white_label_primary_color,
        'white_label_logo_url', cs.white_label_logo_url,
        'white_label_icon_url', cs.white_label_icon_url,
        'language', COALESCE(cs.language, 'pt-br'),
        'currency', COALESCE(cs.currency, 'BRL'),
        'timezone', COALESCE(cs.timezone, 'America/Sao_Paulo')
      )
        FROM public.company_settings cs WHERE cs.company_id = v_company_id
    ),
    'equipment_field_config', CASE WHEN COALESCE((v_permissions->>'equipment')::boolean, true) THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'field_key', efc.field_key, 'label', efc.label, 'field_type', efc.field_type,
        'position', efc.position, 'options', efc.options
      ) ORDER BY efc.position)
        FROM public.equipment_field_config efc
       WHERE efc.company_id = v_company_id AND efc.is_visible = true
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'equipment', CASE WHEN COALESCE((v_permissions->>'equipment')::boolean, true) THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'brand', e.brand, 'model', e.model,
        'serial_number', e.serial_number, 'location', e.location,
        'status', e.status, 'photo_url', e.photo_url, 'identifier', e.identifier,
        'capacity', e.capacity, 'install_date', e.install_date,
        'warranty_until', e.warranty_until,
        'category', (
          SELECT jsonb_build_object('name', ec.name, 'color', ec.color)
            FROM public.equipment_categories ec WHERE ec.id = e.category_id
        ),
        -- Nao devolve o JSON bruto: campos ocultos e `notes` sao internos.
        'custom_fields', COALESCE((
          SELECT jsonb_object_agg(efc.field_key, e.custom_fields->efc.field_key)
            FROM public.equipment_field_config efc
           WHERE efc.company_id = v_company_id
             AND efc.is_visible = true
             AND efc.field_key <> 'notes'
             AND COALESCE(e.custom_fields, '{}'::jsonb) ? efc.field_key
        ), '{}'::jsonb),
        'attachments_public', e.attachments_public,
        'attachments', CASE WHEN e.attachments_public THEN COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', ea.id, 'file_name', ea.file_name,
            'file_url', ea.file_url, 'file_type', ea.file_type
          ) ORDER BY ea.created_at, ea.id)
            FROM public.equipment_attachments ea WHERE ea.equipment_id = e.id
        ), '[]'::jsonb) ELSE '[]'::jsonb END
      ) ORDER BY e.name)
        FROM public.equipment e WHERE e.customer_id = v_customer_id
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'service_orders', CASE WHEN COALESCE((v_permissions->>'service_orders')::boolean, true) THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', so.id, 'order_number', so.order_number, 'status', so.status,
        'description', so.description, 'scheduled_date', so.scheduled_date,
        'created_at', so.created_at, 'os_type', so.os_type,
        'equipment_id', so.equipment_id,
        'entry_type', COALESCE(so.entry_type, 'os'),
        'service_type_name', (
          SELECT st.name FROM public.service_types st WHERE st.id = so.service_type_id
        ),
        'technician_name', (
          SELECT NULLIF(btrim(split_part(p.full_name, ' ', 1)), '')
            FROM public.profiles p WHERE p.user_id = so.technician_id
        ),
        'team_name', (
          SELECT tm.name FROM public.teams tm WHERE tm.id = so.team_id
        )
      ) ORDER BY so.created_at DESC)
        FROM public.service_orders so
       WHERE so.customer_id = v_customer_id
         AND COALESCE(so.entry_type, 'os') <> 'tarefa'
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'contracts', CASE WHEN COALESCE((v_permissions->>'contracts')::boolean, true) THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ct.id, 'name', ct.name, 'is_pmoc', ct.is_pmoc, 'status', ct.status,
        'next_maintenance_date', ct.next_pmoc_generation_date,
        'public_short_code', ct.public_short_code,
        'public_pmoc_token', ct.public_pmoc_token
      ) ORDER BY ct.name)
        FROM public.contracts ct
       WHERE ct.customer_id = v_customer_id
         AND ct.company_id = v_company_id
         AND ct.status IN ('active', 'paused')
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'charges', CASE WHEN COALESCE((v_permissions->>'charges')::boolean, true) THEN COALESCE((
      SELECT jsonb_agg(t.obj) FROM (
        SELECT jsonb_build_object(
          'value', tc.value, 'status', tc.status, 'due_date', tc.due_date,
          'description', tc.description, 'billing_type', tc.billing_type,
          'public_short_code', tc.public_short_code
        ) AS obj
          FROM public.tenant_charges tc
         WHERE tc.company_id = v_company_id
           AND tc.customer_id = v_customer_id
           AND tc.status NOT IN ('CANCELLED', 'CANCELED')
         ORDER BY tc.due_date DESC NULLS LAST, tc.created_at DESC
         LIMIT 50
      ) t
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  );
END;
$$;

-- Compatibilidade: chamada antiga sem sessao continua existindo, mas agora cai
-- no mesmo gate. Em portal com senha ela recebe apenas password_required.
CREATE OR REPLACE FUNCTION public.get_portal_data(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT public.get_portal_data(p_token, NULL)
$$;

REVOKE ALL ON FUNCTION public.get_portal_data(text, text) FROM public;
REVOKE ALL ON FUNCTION public.get_portal_data(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_portal_data(text, text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_portal_data(text)
  TO anon, authenticated, service_role;

-- Chamado do portal deixa de ser INSERT anon direto. A RPC valida token,
-- sessao, permissao e vinculo do equipamento antes de escrever.
CREATE OR REPLACE FUNCTION public.create_customer_portal_ticket(
  p_token text,
  p_session_token text,
  p_description text,
  p_equipment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_portal public.customer_portals%ROWTYPE;
  v_company_id uuid;
  v_is_company_member boolean;
  v_order_id uuid;
BEGIN
  SELECT cp.* INTO v_portal
    FROM public.customer_portals cp
   WHERE cp.token = p_token AND cp.is_active = true
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portal indisponivel' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id INTO v_company_id
    FROM public.customers c
   WHERE c.id = v_portal.customer_id AND COALESCE(c.is_deleted, false) = false;

  v_is_company_member := auth.uid() IS NOT NULL
    AND public.get_user_company_id(auth.uid()) IS NOT DISTINCT FROM v_company_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.user_id = auth.uid() AND p.company_id = v_company_id AND p.is_active
    );

  IF (NOT v_portal.is_public AND NOT v_is_company_member)
     OR (v_portal.password_enabled AND NOT v_is_company_member
         AND NOT public.customer_portal_session_is_valid(v_portal.id, p_session_token))
  THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  IF NOT COALESCE((public.normalize_customer_portal_permissions(v_portal.permissions)->>'ticket_requests')::boolean, true) THEN
    RAISE EXCEPTION 'Abertura de chamados desativada neste portal' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.companies co
     WHERE co.id = v_company_id
       AND (
         (co.subscription_status = 'pending_payment' AND co.payment_lock_bypass IS TRUE)
         OR (
           co.subscription_status = 'testing'
           AND co.subscription_expires_at IS NOT NULL
           AND (co.subscription_expires_at AT TIME ZONE 'UTC')::date >= (now() AT TIME ZONE 'UTC')::date
         )
         OR (
           co.subscription_status = 'active'
           AND (
             co.subscription_expires_at IS NULL
             OR (co.subscription_expires_at AT TIME ZONE 'UTC')::date + 1 >= (now() AT TIME ZONE 'UTC')::date
           )
         )
       )
  ) OR NOT public.company_has_module(v_company_id, 'customer_portal') THEN
    RAISE EXCEPTION 'Portal indisponivel' USING ERRCODE = '42501';
  END IF;

  IF p_description IS NULL OR char_length(btrim(p_description)) < 10
     OR char_length(btrim(p_description)) > 2000 THEN
    RAISE EXCEPTION 'A descricao precisa ter entre 10 e 2000 caracteres'
      USING ERRCODE = '22023';
  END IF;

  IF p_equipment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.equipment e
     WHERE e.id = p_equipment_id
       AND e.customer_id = v_portal.customer_id
       AND e.company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Equipamento invalido' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.service_orders (
    customer_id, equipment_id, description, os_type, status, origin, company_id
  ) VALUES (
    v_portal.customer_id, p_equipment_id, btrim(p_description),
    'manutencao_corretiva', 'pendente', 'portal', v_company_id
  )
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object('ok', true, 'service_order_id', v_order_id);
END;
$$;

-- O Portal do Contrato/PMOC tambem usava o INSERT anonimo generico. Mantemos a
-- funcionalidade por uma RPC que deriva tenant, cliente e contrato do token.
CREATE OR REPLACE FUNCTION public.create_contract_portal_ticket(
  p_token text,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_contract public.contracts%ROWTYPE;
  v_lookup_value text;
  v_is_company_member boolean;
  v_order_id uuid;
BEGIN
  v_lookup_value := lower(COALESCE(NULLIF(split_part(reverse(p_token), '-', 1), ''), ''));
  v_lookup_value := reverse(v_lookup_value);

  SELECT c.* INTO v_contract
    FROM public.contracts c
   WHERE (
          (p_token ~ '^[0-9a-f]{32}$' AND c.public_pmoc_token = p_token)
          OR (v_lookup_value ~ '^[a-hj-np-z2-9]{12}$' AND c.public_short_code = v_lookup_value)
         )
     AND c.status NOT IN ('cancelled', 'inactive')
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portal indisponivel' USING ERRCODE = '42501';
  END IF;

  v_is_company_member := auth.uid() IS NOT NULL
    AND public.get_user_company_id(auth.uid()) IS NOT DISTINCT FROM v_contract.company_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.user_id = auth.uid()
         AND p.company_id = v_contract.company_id
         AND p.is_active
    );

  IF NOT v_contract.portal_is_public AND NOT v_is_company_member THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.companies co
     WHERE co.id = v_contract.company_id
       AND (
         (co.subscription_status = 'pending_payment' AND co.payment_lock_bypass IS TRUE)
         OR (
           co.subscription_status = 'testing'
           AND co.subscription_expires_at IS NOT NULL
           AND (co.subscription_expires_at AT TIME ZONE 'UTC')::date >= (now() AT TIME ZONE 'UTC')::date
         )
         OR (
           co.subscription_status = 'active'
           AND (
             co.subscription_expires_at IS NULL
             OR (co.subscription_expires_at AT TIME ZONE 'UTC')::date + 1 >= (now() AT TIME ZONE 'UTC')::date
           )
         )
       )
  ) OR NOT public.company_has_module(v_contract.company_id, 'customer_portal') THEN
    RAISE EXCEPTION 'Portal indisponivel' USING ERRCODE = '42501';
  END IF;

  IF p_description IS NULL OR char_length(btrim(p_description)) < 10
     OR char_length(btrim(p_description)) > 2000 THEN
    RAISE EXCEPTION 'A descricao precisa ter entre 10 e 2000 caracteres'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.service_orders (
    customer_id, contract_id, description, os_type, status, origin, company_id
  ) VALUES (
    v_contract.customer_id, v_contract.id, btrim(p_description),
    'manutencao_corretiva', 'pendente', 'portal', v_contract.company_id
  )
  RETURNING id INTO v_order_id;

  RETURN jsonb_build_object('ok', true, 'service_order_id', v_order_id);
END;
$$;

DROP POLICY IF EXISTS "Public can create portal tickets" ON public.service_orders;
REVOKE INSERT ON TABLE public.service_orders FROM anon;

REVOKE ALL ON FUNCTION public.create_customer_portal_ticket(text, text, text, uuid)
  FROM public;
GRANT EXECUTE ON FUNCTION public.create_customer_portal_ticket(text, text, text, uuid)
  TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_contract_portal_ticket(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_contract_portal_ticket(text, text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_portal_data(text, text) IS
  'Payload do Portal do Cliente. Valida token, modulo, senha/sessao e filtra cada dataset pela allowlist do portal no servidor.';
COMMENT ON FUNCTION public.customer_portal_login(text, text) IS
  'Login publico por senha do Portal do Cliente. Bcrypt, lockout apos 5 erros e sessao opaca de 30 dias.';
COMMENT ON FUNCTION public.create_customer_portal_ticket(text, text, text, uuid) IS
  'Abre chamado pelo Portal do Cliente somente apos validar token/sessao, permissao e vinculo do equipamento.';
COMMENT ON FUNCTION public.create_contract_portal_ticket(text, text) IS
  'Abre chamado pelo Portal do Contrato/PMOC validando o token e derivando tenant, cliente e contrato no servidor.';

-- Guardas de instalacao: migration falha se segredo/sessao ficar legivel ou se
-- o INSERT anon antigo continuar aberto.
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.customer_portal_credentials', 'SELECT')
     OR has_table_privilege('authenticated', 'public.customer_portal_credentials', 'SELECT')
     OR has_table_privilege('anon', 'public.customer_portal_sessions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.customer_portal_sessions', 'SELECT')
  THEN
    RAISE EXCEPTION 'Credenciais/sessoes do portal expostas a client role';
  END IF;

  IF has_table_privilege('anon', 'public.service_orders', 'INSERT') THEN
    RAISE EXCEPTION 'INSERT anon direto em service_orders ainda aberto';
  END IF;
END
$$;

-- Portal do Cliente: 3 estados por secao (Oculto / Livre / Com senha).
--
-- Antes desta migration a senha era tudo-ou-nada: com `password_enabled`, nada
-- aparecia antes do login. A KGIE precisa mandar o MESMO link pra portaria e
-- pro sindico, deixando livre o operacional (historico de OS, abrir chamado) e
-- atras da senha o sensivel (cobrancas, notas fiscais, documentos).
--
-- Modelo de dados (3 estados por secao, derivados de 2 jsonb):
--   Oculto    = permissions[k] = false
--   Livre     = permissions[k] = true  E public_sections[k] = true
--   Com senha = permissions[k] = true  E public_sections[k] false/ausente
--
-- LEI DA ENTREGA: quem usa hoje nao sente diferenca. `public_sections` nasce
-- '{}' (NENHUMA secao livre) e o normalizador falha FECHADO, entao portal com
-- senha hoje continua bloqueando o portal inteiro, com o MESMO payload
-- (`{"access":"password_required"}` e nada mais).
--
-- O servidor continua sendo o gate: bloco protegido sai '[]'::jsonb do SQL.
-- `locked_sections` serve so pra o front desenhar cadeado.

-- 1. Coluna -------------------------------------------------------------------

ALTER TABLE public.customer_portals
  ADD COLUMN IF NOT EXISTS public_sections jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.customer_portals.public_sections IS
  'Secoes LIVRES (visiveis sem senha) num portal com password_enabled. {} = nenhuma livre = portal inteiro atras da senha. Chave ausente falha FECHADO (protegida).';

ALTER TABLE public.customer_portals
  DROP CONSTRAINT IF EXISTS customer_portals_public_sections_shape;

ALTER TABLE public.customer_portals
  ADD CONSTRAINT customer_portals_public_sections_shape CHECK (
    jsonb_typeof(public_sections) = 'object'
    AND (public_sections - ARRAY[
      'service_orders', 'equipment', 'contracts', 'charges',
      'invoices', 'documents', 'ticket_requests'
    ]::text[]) = '{}'::jsonb
    AND (NOT (public_sections ? 'service_orders') OR jsonb_typeof(public_sections->'service_orders') = 'boolean')
    AND (NOT (public_sections ? 'equipment') OR jsonb_typeof(public_sections->'equipment') = 'boolean')
    AND (NOT (public_sections ? 'contracts') OR jsonb_typeof(public_sections->'contracts') = 'boolean')
    AND (NOT (public_sections ? 'charges') OR jsonb_typeof(public_sections->'charges') = 'boolean')
    AND (NOT (public_sections ? 'invoices') OR jsonb_typeof(public_sections->'invoices') = 'boolean')
    AND (NOT (public_sections ? 'documents') OR jsonb_typeof(public_sections->'documents') = 'boolean')
    AND (NOT (public_sections ? 'ticket_requests') OR jsonb_typeof(public_sections->'ticket_requests') = 'boolean')
  );

-- Normalizador FAIL-CLOSED: chave ausente = false = protegida. Espelha a
-- disciplina de normalize_customer_portal_permissions, mas com o default
-- invertido (lah o legado era "ausente = true"; aqui ausente NUNCA abre nada).
CREATE OR REPLACE FUNCTION public.normalize_customer_portal_public_sections(p_public_sections jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $norm$
  SELECT jsonb_build_object(
    'service_orders',  COALESCE((p_public_sections->>'service_orders')::boolean, false),
    'equipment',       COALESCE((p_public_sections->>'equipment')::boolean, false),
    'contracts',       COALESCE((p_public_sections->>'contracts')::boolean, false),
    'charges',         COALESCE((p_public_sections->>'charges')::boolean, false),
    'invoices',        COALESCE((p_public_sections->>'invoices')::boolean, false),
    'documents',       COALESCE((p_public_sections->>'documents')::boolean, false),
    'ticket_requests', COALESCE((p_public_sections->>'ticket_requests')::boolean, false)
  )
$norm$;

COMMENT ON FUNCTION public.normalize_customer_portal_public_sections(jsonb) IS
  'Normaliza as secoes livres do Portal do Cliente para as 7 chaves conhecidas. Fail-closed: ausente = false = exige senha.';

-- anon nasce com EXECUTE em funcao nova; o normalizador e detalhe interno.
REVOKE ALL ON FUNCTION public.normalize_customer_portal_public_sections(jsonb)
  FROM public, anon, authenticated;

-- 2. Payload base do portal ---------------------------------------------------
--
-- Recriada a partir da definicao VIVA (pg_get_functiondef), nao de migration em
-- disco: a cadeia get_portal_data -> get_portal_data_before_customer_documents
-- foi montada em 20261020120000 e os blocos `contracts`/`company_settings`
-- (language/currency/timezone) existiam e foram preservados campo a campo.
CREATE OR REPLACE FUNCTION public.get_portal_data_before_customer_documents(
  p_token text,
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $base$
DECLARE
  v_portal_id uuid;
  v_customer_id uuid;
  v_company_id uuid;
  v_is_public boolean;
  v_password_enabled boolean;
  v_permissions jsonb;
  v_public_sections jsonb;
  v_is_company_member boolean;
  v_company_name text;
  v_authed boolean;
  v_visible jsonb;
  v_locked jsonb;
  v_has_free boolean;
BEGIN
  SELECT cp.id, cp.customer_id, cp.is_public, cp.password_enabled,
         public.normalize_customer_portal_permissions(cp.permissions),
         public.normalize_customer_portal_public_sections(cp.public_sections)
    INTO v_portal_id, v_customer_id, v_is_public, v_password_enabled,
         v_permissions, v_public_sections
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

  -- Autenticado = portal sem senha, membro da empresa dona, ou sessao de portal
  -- vigente. IF explicito (e nao OR) pra nao depender de curto-circuito do
  -- planner na chamada de customer_portal_session_is_valid.
  IF NOT v_password_enabled OR v_is_company_member THEN
    v_authed := true;
  ELSE
    v_authed := public.customer_portal_session_is_valid(v_portal_id, p_session_token);
  END IF;

  -- Visibilidade efetiva por secao = allowlist AND (autenticado OR livre).
  SELECT jsonb_object_agg(
           k,
           COALESCE((v_permissions->>k)::boolean, false)
             AND (v_authed OR COALESCE((v_public_sections->>k)::boolean, false))
         )
    INTO v_visible
    FROM jsonb_object_keys(v_permissions) AS k;

  -- Protegidas E visiveis depois do login: e isso que o front desenha com
  -- cadeado. Autenticado => sempre vazio.
  SELECT COALESCE(jsonb_agg(k ORDER BY k), '[]'::jsonb)
    INTO v_locked
    FROM jsonb_object_keys(v_permissions) AS k
   WHERE COALESCE((v_permissions->>k)::boolean, false)
     AND NOT COALESCE((v_visible->>k)::boolean, false);

  IF NOT v_authed THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_visible) AS k
       WHERE COALESCE((v_visible->>k)::boolean, false)
    ) INTO v_has_free;

    -- Nenhuma secao livre: resposta IDENTICA a de antes desta migration, com o
    -- jsonb contendo apenas `access`. Nenhum dado de negocio sai do servidor.
    IF NOT v_has_free THEN
      RETURN jsonb_build_object('access', 'password_required');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'access', 'granted',
    'viewer_can_fill', v_is_company_member,
    'partial', NOT v_authed,
    'locked_sections', v_locked,
    'permissions', v_permissions,
    -- `company_id` e consumido pelo wrapper get_portal_data (invoices/documents)
    -- e removido de novo lah quando partial = true.
    'customer', (
      SELECT jsonb_build_object('id', c.id, 'name', c.name, 'company_id', c.company_id)
        FROM public.customers c WHERE c.id = v_customer_id
    ),
    -- Marca/idioma/moeda/fuso ja sao publicos no link; seguem inteiros tambem
    -- no modo parcial, senao o portal perde identidade visual e formatacao.
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
    'equipment_field_config', CASE WHEN COALESCE((v_visible->>'equipment')::boolean, false) THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'field_key', efc.field_key, 'label', efc.label, 'field_type', efc.field_type,
        'position', efc.position, 'options', efc.options
      ) ORDER BY efc.position)
        FROM public.equipment_field_config efc
       WHERE efc.company_id = v_company_id AND efc.is_visible = true
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'equipment', CASE WHEN COALESCE((v_visible->>'equipment')::boolean, false) THEN COALESCE((
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
    'service_orders', CASE WHEN COALESCE((v_visible->>'service_orders')::boolean, false) THEN COALESCE((
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
    'contracts', CASE WHEN COALESCE((v_visible->>'contracts')::boolean, false) THEN COALESCE((
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
    'charges', CASE WHEN COALESCE((v_visible->>'charges')::boolean, false) THEN COALESCE((
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
$base$;

COMMENT ON FUNCTION public.get_portal_data_before_customer_documents(text, text) IS
  'Payload base do Portal do Cliente: valida token, modulo, senha/sessao e secoes livres, e filtra cada dataset no servidor. Devolve partial/locked_sections pro wrapper e pro front.';

-- 3. Wrapper publico: notas fiscais, documentos e blindagem de PII ------------

CREATE OR REPLACE FUNCTION public.get_portal_data(p_token text, p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $outer$
DECLARE
  v_payload jsonb;
  v_customer_id uuid;
  v_company_id uuid;
  v_permissions jsonb;
  v_locked jsonb;
  v_partial boolean;
  v_invoices jsonb := '[]'::jsonb;
  v_documents jsonb := '[]'::jsonb;
BEGIN
  v_payload := public.get_portal_data_before_customer_documents(p_token, p_session_token);

  IF v_payload IS NULL OR COALESCE(v_payload->>'access', '') <> 'granted' THEN
    RETURN v_payload;
  END IF;

  v_customer_id := NULLIF(v_payload #>> '{customer,id}', '')::uuid;
  v_company_id := NULLIF(v_payload #>> '{customer,company_id}', '')::uuid;
  v_permissions := public.normalize_customer_portal_permissions(v_payload->'permissions');
  v_locked := COALESCE(v_payload->'locked_sections', '[]'::jsonb);
  v_partial := COALESCE((v_payload->>'partial')::boolean, false);

  -- Secao protegida sai '[]' DO SERVIDOR, igual aos blocos da funcao base.
  IF COALESCE((v_permissions->>'invoices')::boolean, false)
     AND NOT (v_locked ? 'invoices')
  THEN
    SELECT COALESCE(jsonb_agg(rows.item ORDER BY rows.sort_date DESC NULLS LAST, rows.sort_created DESC), '[]'::jsonb)
      INTO v_invoices
      FROM (
        SELECT jsonb_build_object(
          'id', cd.id,
          'source', 'manual',
          'title', cd.title,
          'description', cd.description,
          'document_type', cd.document_type,
          'document_number', cd.document_number,
          'issue_date', cd.issue_date,
          'amount', cd.amount,
          'file_name', cd.file_name,
          'mime_type', cd.mime_type,
          'size_bytes', cd.size_bytes,
          'created_at', cd.created_at
        ) AS item,
        cd.issue_date AS sort_date,
        cd.created_at AS sort_created
          FROM public.customer_documents cd
         WHERE cd.company_id = v_company_id
           AND cd.customer_id = v_customer_id
           AND cd.document_kind = 'invoice'
           AND cd.is_visible_in_portal

        UNION ALL

        SELECT jsonb_build_object(
          'id', ne.id,
          'source', 'dominex_nfse',
          'title', COALESCE(NULLIF(ne.descricao_servico, ''), 'Nota fiscal de serviço'),
          'description', ne.descricao_servico,
          'document_type', 'nfse',
          'document_number', ne.numero_nfse,
          'issue_date', COALESCE(ne.emitida_em::date, ne.data_competencia, ne.created_at::date),
          'amount', ne.valor_servico,
          'file_name', CASE WHEN ne.numero_nfse IS NOT NULL THEN 'NFS-e-' || ne.numero_nfse || '.pdf' ELSE 'NFS-e.pdf' END,
          'mime_type', 'application/pdf',
          'size_bytes', NULL,
          'created_at', ne.created_at
        ) AS item,
        COALESCE(ne.emitida_em::date, ne.data_competencia, ne.created_at::date) AS sort_date,
        ne.created_at AS sort_created
          FROM public.nfse_emissions ne
         WHERE ne.company_id = v_company_id
           AND ne.customer_id = v_customer_id
           AND ne.status = 'autorizada'
      ) rows;
  END IF;

  IF COALESCE((v_permissions->>'documents')::boolean, false)
     AND NOT (v_locked ? 'documents')
  THEN
    SELECT COALESCE(jsonb_agg(rows.item ORDER BY rows.sort_created DESC), '[]'::jsonb)
      INTO v_documents
      FROM (
        SELECT jsonb_build_object(
          'id', cd.id,
          'source', 'manual',
          'title', cd.title,
          'description', cd.description,
          'document_type', cd.document_type,
          'file_name', cd.file_name,
          'mime_type', cd.mime_type,
          'size_bytes', cd.size_bytes,
          'created_at', cd.created_at
        ) AS item,
        cd.created_at AS sort_created
          FROM public.customer_documents cd
         WHERE cd.company_id = v_company_id
           AND cd.customer_id = v_customer_id
           AND cd.document_kind = 'document'
           AND cd.is_visible_in_portal

        UNION ALL

        SELECT jsonb_build_object(
          'id', ca.id,
          'source', 'contract_attachment',
          'title', ca.display_name,
          'description', ct.name,
          'document_type', 'contract',
          'file_name', ca.display_name,
          'mime_type', ca.mime_type,
          'size_bytes', ca.size_bytes,
          'created_at', ca.created_at
        ) AS item,
        ca.created_at AS sort_created
          FROM public.contract_attachments ca
          JOIN public.contracts ct ON ct.id = ca.contract_id
         WHERE ca.company_id = v_company_id
           AND ct.company_id = v_company_id
           AND ct.customer_id = v_customer_id
           AND COALESCE(ct.portal_documents_released, false)
      ) rows;
  END IF;

  v_payload := jsonb_set(
    jsonb_set(
      jsonb_set(v_payload, '{permissions}', v_permissions, true),
      '{invoices}', v_invoices, true
    ),
    '{documents}', v_documents, true
  );

  -- PII do cliente NAO vaza no modo parcial: visitante sem senha recebe apenas
  -- id (chave do realtime) e nome (saudacao). Qualquer campo de cadastro que
  -- seja somado ao bloco `customer` no futuro fica automaticamente de fora.
  IF v_partial THEN
    v_payload := jsonb_set(
      v_payload,
      '{customer}',
      jsonb_build_object(
        'id', v_payload #> '{customer,id}',
        'name', v_payload #> '{customer,name}'
      ),
      true
    );
  END IF;

  RETURN v_payload;
END;
$outer$;

COMMENT ON FUNCTION public.get_portal_data(text, text) IS
  'Payload do Portal do Cliente. Valida token, modulo, senha/sessao e secoes livres; bloco protegido sai [] e, sem senha, `customer` sai so com id/nome. partial/locked_sections sempre presentes.';

-- 4. Chamado sem senha quando "Abrir chamado" esta LIVRE ----------------------

CREATE OR REPLACE FUNCTION public.create_customer_portal_ticket(
  p_token text,
  p_session_token text,
  p_description text,
  p_equipment_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $ticket$
DECLARE
  v_portal public.customer_portals%ROWTYPE;
  v_company_id uuid;
  v_is_company_member boolean;
  v_order_id uuid;
  v_permissions jsonb;
  v_public_sections jsonb;
  v_ticket_allowed boolean;
  v_ticket_free boolean;
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

  v_permissions := public.normalize_customer_portal_permissions(v_portal.permissions);
  v_public_sections := public.normalize_customer_portal_public_sections(v_portal.public_sections);
  v_ticket_allowed := COALESCE((v_permissions->>'ticket_requests')::boolean, false);
  -- Livre = allowlist ligada E secao marcada como publica. Fail-closed.
  v_ticket_free := v_ticket_allowed
    AND COALESCE((v_public_sections->>'ticket_requests')::boolean, false);

  IF NOT v_portal.is_public AND NOT v_is_company_member THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  -- Com senha ligada a sessao continua obrigatoria, EXCETO quando o tenant
  -- deixou "Abrir chamado" livre (portaria manda o chamado, sindico tem senha).
  IF v_portal.password_enabled
     AND NOT v_is_company_member
     AND NOT v_ticket_free
     AND NOT public.customer_portal_session_is_valid(v_portal.id, p_session_token)
  THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  IF NOT v_ticket_allowed THEN
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
$ticket$;

COMMENT ON FUNCTION public.create_customer_portal_ticket(text, text, text, uuid) IS
  'Abre chamado pelo Portal do Cliente. Exige sessao quando o portal tem senha, salvo quando ticket_requests esta em public_sections (secao livre). Revalida permissao, assinatura, modulo e vinculo do equipamento.';

-- 5. Aba Portal no cadastro do cliente ----------------------------------------

CREATE OR REPLACE FUNCTION public.get_customer_portal_settings(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $getcfg$
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

  -- Nunca devolve hash: `password_configured` e so a existencia da credencial.
  RETURN jsonb_build_object(
    'token', v_portal.token,
    'is_active', v_portal.is_active,
    'password_enabled', v_portal.password_enabled,
    'password_configured', EXISTS (
      SELECT 1 FROM public.customer_portal_credentials pc WHERE pc.portal_id = v_portal.id
    ),
    'permissions', public.normalize_customer_portal_permissions(v_portal.permissions),
    'public_sections', public.normalize_customer_portal_public_sections(v_portal.public_sections)
  );
END;
$getcfg$;

-- Assinatura nova com p_public_sections no FIM e DEFAULT NULL (NULL = nao mexe).
-- O overload de 5 argumentos e REMOVIDO em vez de coexistir: dois candidatos
-- deixariam a chamada antiga ambigua ("function is not unique"). Com o DEFAULT,
-- a mesma chamada de 5 argumentos nomeados continua resolvendo pra esta funcao.
DROP FUNCTION IF EXISTS public.save_customer_portal_settings(uuid, boolean, boolean, text, jsonb);

CREATE OR REPLACE FUNCTION public.save_customer_portal_settings(
  p_customer_id uuid,
  p_is_active boolean,
  p_password_enabled boolean,
  p_password text,
  p_permissions jsonb,
  p_public_sections jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $savecfg$
DECLARE
  v_company_id uuid;
  v_portal_id uuid;
  v_token text;
  v_password_changed boolean := false;
  v_permissions jsonb;
  v_public_sections jsonb;
  v_saved_public_sections jsonb;
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
  v_public_sections := CASE
    WHEN p_public_sections IS NULL THEN NULL
    ELSE public.normalize_customer_portal_public_sections(p_public_sections)
  END;

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
         permissions = v_permissions,
         public_sections = COALESCE(v_public_sections, cp.public_sections)
   WHERE cp.id = v_portal_id
   RETURNING cp.public_sections INTO v_saved_public_sections;

  RETURN jsonb_build_object(
    'token', v_token,
    'is_active', COALESCE(p_is_active, false),
    'password_enabled', COALESCE(p_password_enabled, false),
    'password_configured', COALESCE(p_password_enabled, false),
    'permissions', v_permissions,
    'public_sections', public.normalize_customer_portal_public_sections(v_saved_public_sections)
  );
END;
$savecfg$;

COMMENT ON FUNCTION public.save_customer_portal_settings(uuid, boolean, boolean, text, jsonb, jsonb) IS
  'Salva a aba Portal do cliente com guard de tenant. p_public_sections NULL preserva as secoes livres atuais; qualquer valor e normalizado fail-closed.';

-- DROP levou os GRANTs do overload antigo: refazer na assinatura nova.
REVOKE ALL ON FUNCTION public.save_customer_portal_settings(uuid, boolean, boolean, text, jsonb, jsonb)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_customer_portal_settings(uuid, boolean, boolean, text, jsonb, jsonb)
  TO authenticated, service_role;

-- CREATE OR REPLACE preserva os grants das demais, mas reafirmamos o contrato.
REVOKE ALL ON FUNCTION public.get_customer_portal_settings(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_settings(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_portal_data(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_portal_data(text, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_portal_data(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_portal_data(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_portal_data_before_customer_documents(text, text)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_customer_portal_ticket(text, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_customer_portal_ticket(text, text, text, uuid)
  TO anon, authenticated, service_role;

-- 6. Guardas de instalacao ----------------------------------------------------

DO $guard$
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

  IF has_table_privilege('anon', 'public.customer_portals', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.customer_portals', 'UPDATE')
  THEN
    RAISE EXCEPTION 'UPDATE direto em customer_portals aberto a client role';
  END IF;

  IF has_function_privilege('anon', 'public.normalize_customer_portal_public_sections(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.normalize_customer_portal_public_sections(jsonb)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Normalizador de secoes livres exposto a client role';
  END IF;

  IF NOT has_function_privilege('authenticated',
       'public.save_customer_portal_settings(uuid, boolean, boolean, text, jsonb, jsonb)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'save_customer_portal_settings perdeu o GRANT para authenticated';
  END IF;

  -- Fail-closed do default: portal que nunca foi configurado nao abre nada.
  IF public.normalize_customer_portal_public_sections('{}'::jsonb) <> jsonb_build_object(
       'service_orders', false, 'equipment', false, 'contracts', false, 'charges', false,
       'invoices', false, 'documents', false, 'ticket_requests', false
     )
  THEN
    RAISE EXCEPTION 'normalize_customer_portal_public_sections nao esta fail-closed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.customer_portals cp
     WHERE public.normalize_customer_portal_public_sections(cp.public_sections)
           <> jsonb_build_object(
                'service_orders', false, 'equipment', false, 'contracts', false, 'charges', false,
                'invoices', false, 'documents', false, 'ticket_requests', false
              )
  ) THEN
    RAISE EXCEPTION 'Migration abriu secao livre em portal existente (deveria nascer tudo protegido)';
  END IF;
END
$guard$;

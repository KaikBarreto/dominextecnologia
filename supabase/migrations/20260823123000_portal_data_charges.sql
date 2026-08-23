-- 2026-08-23 (Onda E — portal "Minhas cobranças"): get_portal_data passa a
-- expor as cobranças (tenant_charges) DAQUELE cliente, para o portal público
-- listar e oferecer link de pagamento.
--
-- Por quê: o Portal do Cliente (anon, deslogado) precisa mostrar ao cliente
-- final as cobranças em aberto/pagas dele. Antes o payload não trazia nada de
-- financeiro.
--
-- Chave ADICIONADA ao payload (SÓ no ramo access='granted'):
--   charges[]: array jsonb, ALLOWLIST ESTRITA de 6 campos por cobrança:
--     value, status, due_date, description, billing_type, public_short_code.
--   É PROIBIDO expor net_value, source_id, source_type, asaas_payment_id,
--   customer_id, created_by ou qualquer coluna interna (portal é anon — vazar
--   valor líquido/tarifa é incidente). Montado campo a campo (nunca to_jsonb).
--
-- Escopo: cobranças da MESMA empresa E do MESMO cliente que o token resolve
--   (reusa v_company_id/v_customer_id do portal). Esconde só as CANCELADAS;
--   mostra pendente/pago/vencido/estornado. Ordena por vencimento desc,
--   depois created_at desc. LIMIT 50. Sem cobrança => '[]' (nunca null).
--   Só popula em access='granted' (os ramos denied/module_unavailable/NULL
--   não recebem 'charges').
--
-- PARTIU DA DEFINIÇÃO VIVA (pg_get_functiondef) em 2026-08-23. Preserva 100%
-- do payload atual (customer, company_settings, equipment_field_config,
-- equipment, service_orders, access, viewer_can_fill). Assinatura,
-- SECURITY DEFINER, STABLE, owner (postgres), search_path e GRANTs (anon/
-- authenticated/service_role) permanecem IDÊNTICOS — CREATE OR REPLACE preserva
-- owner e grants; não reemitimos.
--
-- NOTA ao Tech Lead: a definição VIVA NÃO contém 'contracts' nem 'locale'
-- (que migrations anteriores — 20260723090000 / 20260719120000 — haviam
-- adicionado). Aparentemente houve regressão silenciosa de payload quando
-- 20260807140000 foi aplicada. Esta migration NÃO restaura esses campos
-- (fora do escopo desta onda); apenas preserva o que está VIVO hoje e
-- acrescenta 'charges'. Decisão de restaurar contracts/locale é do Tech Lead.

CREATE OR REPLACE FUNCTION public.get_portal_data(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer_id        uuid;
  v_company_id         uuid;
  v_is_public          boolean;
  v_is_company_member  boolean;
  v_company_name       text;
  v_result             jsonb;
BEGIN
  -- Valida o token: portal precisa existir E estar ativo. Lê is_public junto.
  SELECT cp.customer_id, cp.is_public
    INTO v_customer_id, v_is_public
  FROM customer_portals cp
  WHERE cp.token = p_token AND cp.is_active = true
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- company_id do portal = company_id do customer dono do portal.
  SELECT c.company_id INTO v_company_id FROM customers c WHERE c.id = v_customer_id;

  -- GATE DE MÓDULO (2026-06): o portal do cliente é uma feature gateada por
  -- módulo. Se a empresa dona não tem 'customer_portal' (plano não inclui, sem
  -- addon, sem trial ativo), NÃO entregamos os dados — retornamos um sinal
  -- explícito pro frontend distinguir de token inválido (NULL) ou acesso negado.
  IF NOT public.company_has_module(v_company_id, 'customer_portal') THEN
    SELECT cs.name INTO v_company_name
    FROM company_settings cs WHERE cs.company_id = v_company_id;
    IF v_company_name IS NULL OR btrim(v_company_name) = '' THEN
      SELECT co.name INTO v_company_name
      FROM companies co WHERE co.id = v_company_id;
    END IF;
    RETURN jsonb_build_object(
      'access', 'module_unavailable',
      'company_name', NULLIF(btrim(COALESCE(v_company_name, '')), '')
    );
  END IF;

  -- Membro da empresa dona: usuário logado cujo company_id (via get_user_company_id,
  -- que lê profiles.user_id -> profiles.company_id) bate com o company_id do portal.
  -- Anônimo (auth.uid() NULL) ou de outra empresa => false.
  v_is_company_member := (auth.uid() IS NOT NULL)
    AND (public.get_user_company_id(auth.uid()) IS NOT DISTINCT FROM v_company_id);

  -- Portal privado + não-membro => negado, sem vazar nenhum dado do cliente/empresa.
  IF v_is_public = false AND v_is_company_member = false THEN
    RETURN jsonb_build_object('access', 'denied');
  END IF;

  v_result := jsonb_build_object(
    -- Sinaliza ao frontend o resultado da checagem de acesso e quem pode preencher.
    'access', 'granted',
    -- viewer_can_fill = true só pra membro da empresa dona (técnico/admin logado).
    -- Anônimo/cliente => false (read-only).
    'viewer_can_fill', v_is_company_member,

    -- customer: o portal usa id, name e company_id (para o INSERT de chamado).
    'customer', (
      SELECT jsonb_build_object('id', c.id, 'name', c.name, 'company_id', c.company_id)
      FROM customers c WHERE c.id = v_customer_id
    ),

    -- company_settings: white-label do tenant DONO do cliente (filtra por
    -- company_id em vez do antigo .limit(1), que vazaria a empresa errada em
    -- ambiente multi-tenant). Inclui o branding white-label (público por design).
    'company_settings', (
      SELECT jsonb_build_object(
        'name', cs.name, 'logo_url', cs.logo_url, 'phone', cs.phone,
        'email', cs.email, 'address', cs.address, 'city', cs.city, 'state', cs.state,
        'white_label_enabled', cs.white_label_enabled,
        'white_label_primary_color', cs.white_label_primary_color,
        'white_label_logo_url', cs.white_label_logo_url,
        'white_label_icon_url', cs.white_label_icon_url
      )
      FROM company_settings cs WHERE cs.company_id = v_company_id
    ),

    -- equipment_field_config[]: SÓ os campos visíveis da empresa dona, ordenado
    -- por position. Expomos exatamente field_key/label/field_type/position/options
    -- (options já é jsonb = array, ou NULL). is_required e flags internas NÃO saem.
    'equipment_field_config', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'field_key', efc.field_key,
          'label', efc.label,
          'field_type', efc.field_type,
          'position', efc.position,
          'options', efc.options
        ) ORDER BY efc.position
      )
      FROM equipment_field_config efc
      WHERE efc.company_id = v_company_id AND efc.is_visible = true
    ), '[]'::jsonb),

    -- equipment[] do cliente, ordenado por nome. Inclui custom_fields (jsonb já
    -- existente na linha), attachments_public + attachments[] (interruptor por
    -- equipamento), e a partir de 2026-08: capacity, install_date, warranty_until
    -- e category{name,color}. 'notes' (observação interna) NUNCA sai.
    -- attachments[] respeita o interruptor por equipamento (attachments_public):
    --   false => []; true => anexos com allowlist EXPLÍCITA de 4 campos apenas
    --   (id/file_name/file_url/file_type), montados campo a campo (nunca to_jsonb),
    --   ordenados por created_at estável. uploaded_by/description NÃO saem.
    'equipment', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', e.id, 'name', e.name, 'brand', e.brand, 'model', e.model,
          'serial_number', e.serial_number, 'location', e.location,
          'status', e.status, 'photo_url', e.photo_url, 'identifier', e.identifier,
          'capacity', e.capacity,
          'install_date', e.install_date,
          'warranty_until', e.warranty_until,
          'category', (
            SELECT jsonb_build_object('name', ec.name, 'color', ec.color)
            FROM equipment_categories ec WHERE ec.id = e.category_id
          ),
          'custom_fields', COALESCE(e.custom_fields, '{}'::jsonb),
          'attachments_public', e.attachments_public,
          'attachments', CASE
            WHEN e.attachments_public THEN COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', ea.id,
                  'file_name', ea.file_name,
                  'file_url', ea.file_url,
                  'file_type', ea.file_type
                ) ORDER BY ea.created_at, ea.id
              )
              FROM equipment_attachments ea
              WHERE ea.equipment_id = e.id
            ), '[]'::jsonb)
            ELSE '[]'::jsonb
          END
        ) ORDER BY e.name
      )
      FROM equipment e WHERE e.customer_id = v_customer_id
    ), '[]'::jsonb),

    -- service_orders[] do cliente, mais recentes primeiro. Inclui equipment_id
    -- (o portal filtra OS por equipamento no detalhe).
    'service_orders', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', so.id, 'order_number', so.order_number, 'status', so.status,
          'description', so.description, 'scheduled_date', so.scheduled_date,
          'created_at', so.created_at, 'os_type', so.os_type,
          'equipment_id', so.equipment_id
        ) ORDER BY so.created_at DESC
      )
      FROM service_orders so WHERE so.customer_id = v_customer_id
    ), '[]'::jsonb),

    -- charges[] (2026-08 Onda E): cobranças da MESMA empresa E do MESMO cliente
    -- que o token resolve. ALLOWLIST ESTRITA de 6 campos (montados campo a campo,
    -- nunca to_jsonb): value, status, due_date, description, billing_type,
    -- public_short_code. net_value/source_*/asaas_payment_id/customer_id/
    -- created_by e demais colunas internas NUNCA saem (portal é anon).
    -- Esconde só CANCELLED/CANCELED; mostra pendente/pago/vencido/estornado.
    -- Ordena por vencimento desc (NULLs por último), depois created_at desc.
    -- LIMIT 50. Sem cobrança => '[]'.
    'charges', COALESCE((
      SELECT jsonb_agg(t.obj)
      FROM (
        SELECT jsonb_build_object(
          'value', tc.value,
          'status', tc.status,
          'due_date', tc.due_date,
          'description', tc.description,
          'billing_type', tc.billing_type,
          'public_short_code', tc.public_short_code
        ) AS obj
        FROM tenant_charges tc
        WHERE tc.company_id = v_company_id
          AND tc.customer_id = v_customer_id
          AND tc.status NOT IN ('CANCELLED', 'CANCELED')
        ORDER BY tc.due_date DESC NULLS LAST, tc.created_at DESC
        LIMIT 50
      ) t
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;

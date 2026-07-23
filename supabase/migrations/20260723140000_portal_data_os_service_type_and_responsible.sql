-- 2026-07-23: cada OS do portal do cliente passa a expor o TIPO DE SERVIÇO e o
-- RESPONSÁVEL (técnico ou equipe), pra exibir no card do portal público.
--
-- Por quê: o card da OS no portal hoje só mostra número/status/datas. O cliente
-- quer saber "que serviço é" e "quem vai/foi". Adicionamos 3 campos por OS.
--
-- get_portal_data(p_token) redefinido preservando 100% do payload atual
-- (equipment/attachments/field_config/company_settings/module gate intactos).
-- Cada objeto de service_orders[] ganha, na allowlist EXPLÍCITA (jsonb_build_object,
-- nunca to_jsonb(so.*)):
--   - service_type_name (text|null): nome do tipo de serviço via service_type_id
--     -> service_types.name.
--   - technician_name (text|null): APENAS O PRIMEIRO NOME do técnico responsável.
--     LGPD: portal público é anônimo; nunca sai sobrenome/email/telefone. A coluna
--     real é profiles.full_name, então usamos split_part(full_name,' ',1). Join
--     correto: service_orders.technician_id = profiles.user_id (NÃO profiles.id —
--     validado no schema: 661/661 batem em user_id, 0 em id).
--   - team_name (text|null): nome da equipe via team_id -> teams.name.
--
-- SECURITY DEFINER + token continua sendo o único gate; NÃO criamos policy de RLS
-- nova (anon acessa exclusivamente via esta RPC token-gated).

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
    -- existente na linha) e attachments_public + attachments[] (2026-07).
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
    -- (o portal filtra OS por equipamento no detalhe) e, novo em 2026-07:
    --   - service_type_name: service_type_id -> service_types.name.
    --   - technician_name: SÓ O PRIMEIRO NOME (LGPD). technician_id -> profiles.user_id,
    --     split_part(full_name,' ',1). Nunca sobrenome/email/telefone.
    --   - team_name: team_id -> teams.name.
    'service_orders', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', so.id, 'order_number', so.order_number, 'status', so.status,
          'description', so.description, 'scheduled_date', so.scheduled_date,
          'created_at', so.created_at, 'os_type', so.os_type,
          'equipment_id', so.equipment_id,
          'service_type_name', (
            SELECT st.name FROM service_types st WHERE st.id = so.service_type_id
          ),
          'technician_name', (
            SELECT NULLIF(btrim(split_part(p.full_name, ' ', 1)), '')
            FROM profiles p WHERE p.user_id = so.technician_id
          ),
          'team_name', (
            SELECT t.name FROM teams t WHERE t.id = so.team_id
          )
        ) ORDER BY so.created_at DESC
      )
      FROM service_orders so WHERE so.customer_id = v_customer_id
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;

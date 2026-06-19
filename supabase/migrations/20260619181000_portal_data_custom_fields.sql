-- 2026-06-19: Portal do cliente passa a expor campos personalizados de equipamento.
--
-- Por quê: cada empresa configura campos extras do equipamento em
-- equipment_field_config (renomear/ocultar/ordenar/tipo) e os valores ficam em
-- equipment.custom_fields (jsonb). Hoje o get_portal_data só devolve os campos
-- fixos, então o portal não consegue renderizar nada disso.
--
-- Duas adições, preservando TODO o resto do payload intacto:
--   1) cada equipamento ganha 'custom_fields' (jsonb já existente na linha).
--   2) novo array raiz 'equipment_field_config' SÓ com os campos visíveis da
--      empresa dona do token (resolvida em v_company_id), ordenado por position,
--      cada item com EXATAMENTE { field_key, label, field_type, position, options }.
--      Não expomos is_required nem flags internas. options é jsonb (array) ou NULL.
--
-- SECURITY DEFINER + token já resolve a empresa; só adicionamos SELECTs internos,
-- sem mexer em RLS nem expor equipment_field_config ao anon.

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

    -- equipment[] do cliente, ordenado por nome. Agora inclui custom_fields (jsonb
    -- já existente na linha) para casar com o equipment_field_config acima.
    'equipment', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', e.id, 'name', e.name, 'brand', e.brand, 'model', e.model,
          'serial_number', e.serial_number, 'location', e.location,
          'status', e.status, 'photo_url', e.photo_url, 'identifier', e.identifier,
          'custom_fields', COALESCE(e.custom_fields, '{}'::jsonb)
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
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;

-- =============================================================================
-- Expoe language/currency/timezone da empresa nas RPCs publicas.
--
-- POR QUE: paginas publicas (OS publica, proposta, portal do cliente) precisam
-- renderizar no idioma/moeda/fuso da empresa dona do link, sem exigir login.
-- As 3 colunas ja existem em company_settings (migration 20260717120000).
-- Aqui apenas acrescentamos os 3 campos ao payload que cada RPC retorna.
--
-- REGRA: nunca null pro frontend — usar COALESCE com defaults.
-- Shape preservado integralmente; so acrescenta, nao remove/renomeia.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. get_public_os(uuid) — acrescenta language/currency/timezone em company_settings
--    Antes: to_jsonb(cs) ja incluia os campos, mas de forma implicita.
--    Agora: explicitamos com COALESCE pra garantir defaults mesmo se NULL.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_os(p_os_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_so            service_orders%ROWTYPE;
  v_technician_id uuid;
  v_result        jsonb;
BEGIN
  -- Linha da OS. Se nao existir, devolve NULL (pagina trata como "nao encontrada").
  SELECT * INTO v_so FROM service_orders WHERE id = p_os_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Resolve o tecnico: technician_id primeiro, senao o primeiro assignee.
  v_technician_id := v_so.technician_id;
  IF v_technician_id IS NULL THEN
    SELECT user_id INTO v_technician_id
    FROM service_order_assignees
    WHERE service_order_id = p_os_id
    LIMIT 1;
  END IF;

  v_result := jsonb_build_object(
    -- service_orders.* (pagina usa `*`)
    'service_order', to_jsonb(v_so),

    -- customer: id,name,phone,address,city,state,document,photo_url
    'customer', (
      SELECT jsonb_build_object(
        'id', c.id, 'name', c.name, 'phone', c.phone, 'address', c.address,
        'city', c.city, 'state', c.state, 'document', c.document, 'photo_url', c.photo_url
      )
      FROM customers c WHERE c.id = v_so.customer_id
    ),

    -- customer_geo: coordenadas/endereco pro mapa publico de tracking
    'customer_geo', (
      SELECT jsonb_build_object(
        'id', c.id, 'lat', c.lat, 'lng', c.lng, 'address', c.address,
        'city', c.city, 'state', c.state, 'zip_code', c.zip_code
      )
      FROM customers c WHERE c.id = v_so.customer_id
    ),

    -- equipment principal: id,name,brand,model,serial_number,location,capacity
    'equipment', (
      SELECT jsonb_build_object(
        'id', e.id, 'name', e.name, 'brand', e.brand, 'model', e.model,
        'serial_number', e.serial_number, 'location', e.location, 'capacity', e.capacity
      )
      FROM equipment e WHERE e.id = v_so.equipment_id
    ),

    -- form_template principal: id,name
    'form_template', (
      SELECT jsonb_build_object('id', ft.id, 'name', ft.name)
      FROM form_templates ft WHERE ft.id = v_so.form_template_id
    ),

    -- service_type: id,name,color
    'service_type', (
      SELECT jsonb_build_object('id', st.id, 'name', st.name, 'color', st.color)
      FROM service_types st WHERE st.id = v_so.service_type_id
    ),

    -- photos: os_photos.* ordenado por created_at asc
    'photos', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at ASC)
      FROM os_photos p WHERE p.service_order_id = p_os_id
    ), '[]'::jsonb),

    -- form_responses com question join
    'form_responses', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', fr.id,
          'question_id', fr.question_id,
          'response_value', fr.response_value,
          'response_photo_url', fr.response_photo_url,
          'equipment_id', fr.equipment_id,
          'question', (SELECT to_jsonb(fq) FROM form_questions fq WHERE fq.id = fr.question_id)
        )
      )
      FROM form_responses fr WHERE fr.service_order_id = p_os_id
    ), '[]'::jsonb),

    -- equipment_items: service_order_equipment + joins
    'equipment_items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'equipment_id', soe.equipment_id,
          'form_template_id', soe.form_template_id,
          'equipment', (
            SELECT jsonb_build_object(
              'id', e2.id, 'name', e2.name, 'brand', e2.brand, 'model', e2.model,
              'location', e2.location, 'photo_url', e2.photo_url,
              'category', (
                SELECT jsonb_build_object('id', ec.id, 'name', ec.name, 'color', ec.color)
                FROM equipment_categories ec WHERE ec.id = e2.category_id
              )
            )
            FROM equipment e2 WHERE e2.id = soe.equipment_id
          ),
          'form_template', (
            SELECT jsonb_build_object('id', ft2.id, 'name', ft2.name)
            FROM form_templates ft2 WHERE ft2.id = soe.form_template_id
          )
        )
      )
      FROM service_order_equipment soe WHERE soe.service_order_id = p_os_id
    ), '[]'::jsonb),

    -- technician: profiles.full_name, avatar_url
    'technician', (
      SELECT jsonb_build_object('full_name', pr.full_name, 'avatar_url', pr.avatar_url)
      FROM profiles pr WHERE pr.user_id = v_technician_id
    ),

    -- rating: service_ratings.* da OS
    'rating', (
      SELECT to_jsonb(sr) FROM service_ratings sr WHERE sr.service_order_id = p_os_id LIMIT 1
    ),

    -- company_settings: white-label completo + locale da empresa.
    -- MUDANCA: acrescenta language/currency/timezone com COALESCE pra garantir
    -- defaults mesmo se a empresa ainda nao configurou o locale.
    'company_settings', (
      SELECT to_jsonb(cs) || jsonb_build_object(
        'language', COALESCE(cs.language, 'pt-br'),
        'currency', COALESCE(cs.currency, 'BRL'),
        'timezone', COALESCE(cs.timezone, 'America/Sao_Paulo')
      )
      FROM company_settings cs WHERE cs.company_id = v_so.company_id
    ),

    -- contract: id,name (quando houver contract_id)
    'contract', (
      SELECT jsonb_build_object('id', ct.id, 'name', ct.name)
      FROM contracts ct WHERE ct.id = v_so.contract_id
    )
  );

  RETURN v_result;
END;
$$;

-- Grants: RPC so recebe um id e devolve aquela OS — nao enumera.
GRANT EXECUTE ON FUNCTION public.get_public_os(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_os(uuid) IS
  'Payload completo da OS publica (link /os-tecnico/:id?modo=cliente). SECURITY DEFINER: recebe so o id, devolve aquela OS. Inclui language/currency/timezone da empresa para i18n das paginas publicas.';

-- -----------------------------------------------------------------------------
-- 2. get_quote_public_payload(text) — acrescenta language/currency/timezone no
--    objeto company (ao lado de name/logo/white_label).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_quote_public_payload(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_quote    public.quotes%ROWTYPE;
  v_items    jsonb;
  v_customer jsonb;
  v_company  jsonb;
BEGIN
  -- Resolve o orcamento SO pelo token.
  SELECT * INTO v_quote
  FROM public.quotes
  WHERE token = _token
  LIMIT 1;

  IF v_quote.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Itens do orcamento (apenas deste quote).
  SELECT COALESCE(jsonb_agg(to_jsonb(qi.*) ORDER BY qi.created_at, qi.id), '[]'::jsonb)
  INTO v_items
  FROM public.quote_items qi
  WHERE qi.quote_id = v_quote.id;

  -- Cliente do orcamento (so contato visivel), quando houver.
  IF v_quote.customer_id IS NOT NULL THEN
    SELECT to_jsonb(t)
    INTO v_customer
    FROM (
      SELECT c.name, c.email, c.phone
      FROM public.customers c
      WHERE c.id = v_quote.customer_id
      LIMIT 1
    ) t;
  END IF;

  -- Empresa do orcamento: escopada por quote.company_id. Identidade visual,
  -- contato, personalizacao da proposta e locale — sem chaves/tokens/segredos.
  -- MUDANCA: acrescenta language/currency/timezone com COALESCE (nunca null).
  SELECT to_jsonb(t)
  INTO v_company
  FROM (
    SELECT
      cs.name,
      cs.document,
      cs.logo_url,
      cs.phone,
      cs.email,
      cs.address,
      cs.address_number,
      cs.complement,
      cs.neighborhood,
      cs.city,
      cs.state,
      cs.zip_code,
      cs.proposal_customization,
      cs.white_label_enabled,
      cs.white_label_logo_url,
      cs.white_label_icon_url,
      cs.white_label_primary_color,
      COALESCE(cs.language, 'pt-br')              AS language,
      COALESCE(cs.currency, 'BRL')                AS currency,
      COALESCE(cs.timezone, 'America/Sao_Paulo')  AS timezone
    FROM public.company_settings cs
    WHERE cs.company_id = v_quote.company_id
    LIMIT 1
  ) t;

  RETURN jsonb_build_object(
    'quote',    to_jsonb(v_quote),
    'items',    v_items,
    'customer', v_customer,
    'company',  v_company
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_quote_public_payload(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_quote_public_payload(text) IS
  'Payload completo da proposta publica (/proposta/:token). SECURITY DEFINER escopado por token. Inclui language/currency/timezone da empresa para i18n das paginas publicas.';

-- -----------------------------------------------------------------------------
-- 3. get_portal_data(text) — acrescenta language/currency/timezone em
--    company_settings (objeto retornado quando access = 'granted').
-- -----------------------------------------------------------------------------
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
  -- Valida o token: portal precisa existir E estar ativo. Le is_public junto.
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

  -- GATE DE MODULO: o portal do cliente e uma feature gateada.
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

  -- Membro da empresa dona: usuario logado cujo company_id bate com o do portal.
  v_is_company_member := (auth.uid() IS NOT NULL)
    AND (public.get_user_company_id(auth.uid()) IS NOT DISTINCT FROM v_company_id);

  -- Portal privado + nao-membro => negado.
  IF v_is_public = false AND v_is_company_member = false THEN
    RETURN jsonb_build_object('access', 'denied');
  END IF;

  v_result := jsonb_build_object(
    'access', 'granted',
    'viewer_can_fill', v_is_company_member,

    -- customer: o portal usa id, name e company_id.
    'customer', (
      SELECT jsonb_build_object('id', c.id, 'name', c.name, 'company_id', c.company_id)
      FROM customers c WHERE c.id = v_customer_id
    ),

    -- company_settings: white-label do tenant + locale da empresa.
    -- MUDANCA: acrescenta language/currency/timezone com COALESCE (nunca null).
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
      FROM company_settings cs WHERE cs.company_id = v_company_id
    ),

    -- equipment[] do cliente, ordenado por nome.
    'equipment', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', e.id, 'name', e.name, 'brand', e.brand, 'model', e.model,
          'serial_number', e.serial_number, 'location', e.location,
          'status', e.status, 'photo_url', e.photo_url, 'identifier', e.identifier
        ) ORDER BY e.name
      )
      FROM equipment e WHERE e.customer_id = v_customer_id
    ), '[]'::jsonb),

    -- service_orders[] do cliente, mais recentes primeiro.
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

GRANT EXECUTE ON FUNCTION public.get_portal_data(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_portal_data(text) IS
  'Payload completo do portal do cliente (/portal/:token). SECURITY DEFINER com gate de modulo. Inclui language/currency/timezone da empresa em company_settings para i18n das paginas publicas.';

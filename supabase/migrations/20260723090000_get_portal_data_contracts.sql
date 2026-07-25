-- =============================================================================
-- get_portal_data: adiciona array `contracts` ao payload do portal do cliente.
-- =============================================================================
-- POR QUÊ:
--   Fase 3 do redesign dos portais. O portal do cliente (/portal/:token) vai
--   exibir uma seção "Contratos" listando os contratos do cliente e linkando
--   ao portal do contrato de cada um. A RPC hoje não expõe contratos.
--
-- O QUE MUDA:
--   A chave `contracts` é adicionada ao jsonb retornado quando access='granted'.
--   Allowlist estrita: apenas campos públicos (sem custo/margem/valor/BDI/tokens).
--   Os campos `public_short_code` (link amigável) e `public_pmoc_token` (fallback)
--   são incluídos para o frontend montar a URL /contrato/unidade/<segmento>.
--
-- CAMPOS DO ARRAY (por contrato):
--   id, name, is_pmoc, status, next_maintenance_date, public_short_code,
--   public_pmoc_token
--
-- next_maintenance_date:
--   = contracts.next_pmoc_generation_date — é exatamente o campo que o portal
--   do contrato (edge pmoc-portal-share) expõe como `contract.next_maintenance_date`
--   (linha 1052 do index.ts: `next_maintenance_date: contract.next_pmoc_generation_date`).
--   Replicamos aqui para consistência.
--
-- FILTRO DE STATUS:
--   Espelha o portal do contrato que bloqueia 'cancelled' e 'inactive' com 404.
--   Expomos só contratos active ou paused (visible, operational).
--
-- ISOLAMENTO:
--   Duplo filtro: customer_id = v_customer_id AND company_id = v_company_id.
--   Sem o company_id, um customer_id sem isolamento poderia vazar contratos
--   de outro tenant (FK customers→companies não garante isolamento sozinha aqui).
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION (sem ALTER TABLE, sem coluna nova).
-- Shape preservado integralmente — só acrescenta a chave `contracts`.
-- =============================================================================

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
  -- módulo. Se a empresa dona não tem 'customer_portal' retornamos sinal explícito.
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

  -- Membro da empresa dona: usuário logado cujo company_id bate com o do portal.
  -- Anônimo (auth.uid() NULL) ou de outra empresa => false.
  v_is_company_member := (auth.uid() IS NOT NULL)
    AND (public.get_user_company_id(auth.uid()) IS NOT DISTINCT FROM v_company_id);

  -- Portal privado + não-membro => negado, sem vazar nenhum dado.
  IF v_is_public = false AND v_is_company_member = false THEN
    RETURN jsonb_build_object('access', 'denied');
  END IF;

  v_result := jsonb_build_object(
    -- Sinaliza ao frontend o resultado da checagem de acesso.
    'access', 'granted',
    -- viewer_can_fill = true só pra membro da empresa dona (técnico/admin logado).
    'viewer_can_fill', v_is_company_member,

    -- customer: o portal usa id, name e company_id (para o INSERT de chamado).
    'customer', (
      SELECT jsonb_build_object('id', c.id, 'name', c.name, 'company_id', c.company_id)
      FROM customers c WHERE c.id = v_customer_id
    ),

    -- company_settings: white-label do tenant DONO do cliente + locale da empresa.
    -- Filtra por v_company_id (isolamento multi-tenant). Inclui language/currency/timezone
    -- (migration 20260719120000_public_rpcs_expose_locale.sql).
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

    -- equipment_field_config[]: SÓ os campos visíveis da empresa dona, ordenado
    -- por position. Expomos exatamente field_key/label/field_type/position/options.
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

    -- equipment[] do cliente, ordenado por nome. Inclui custom_fields.
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
    ), '[]'::jsonb),

    -- contracts[] do cliente — NOVO (2026-07-23, Fase 3 redesign portais).
    --
    -- Allowlist estrita: sem valor/custo/margem/BDI/horizon_months/frequency_*.
    -- next_maintenance_date = next_pmoc_generation_date (mesma semântica do portal
    -- do contrato em pmoc-portal-share/index.ts linha ~1052).
    -- public_short_code + public_pmoc_token: o frontend usa os dois pra montar
    -- a URL amigável /contrato/unidade/<segmento> via buildPmocPortalUrl().
    --
    -- Filtro de status: 'active' | 'paused' (espelha o gate do portal do
    -- contrato que rejeita 'cancelled' e 'inactive' com 404).
    --
    -- Isolamento duplo: customer_id E company_id (mesma empresa dona do portal).
    'contracts', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',                     ct.id,
          'name',                   ct.name,
          'is_pmoc',                ct.is_pmoc,
          'status',                 ct.status,
          'next_maintenance_date',  ct.next_pmoc_generation_date,
          'public_short_code',      ct.public_short_code,
          'public_pmoc_token',      ct.public_pmoc_token
        ) ORDER BY ct.name
      )
      FROM contracts ct
      WHERE ct.customer_id = v_customer_id
        AND ct.company_id  = v_company_id
        AND ct.status IN ('active', 'paused')
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_portal_data(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_portal_data(text) IS
  'Payload completo do portal do cliente (/portal/:token). SECURITY DEFINER com gate de módulo. '
  'Inclui language/currency/timezone (20260719) e custom_fields (20260619). '
  'Acrescenta array `contracts` (2026-07-23): allowlist estrita, sem dados financeiros, '
  'duplo isolamento company_id+customer_id, status active|paused.';

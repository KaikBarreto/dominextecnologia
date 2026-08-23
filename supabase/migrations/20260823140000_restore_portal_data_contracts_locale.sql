-- 2026-08-23: RESTAURA `contracts` e `locale` (language/currency/timezone) no
-- payload de get_portal_data — corrige regressão silenciosa de payload.
--
-- HISTÓRICO DA REGRESSÃO:
--   - 20260719120000_public_rpcs_expose_locale.sql  -> acrescentou language/
--     currency/timezone em company_settings.
--   - 20260723090000_get_portal_data_contracts.sql  -> acrescentou o array
--     `contracts` (allowlist estrita).
--   - 20260723140000_portal_data_os_service_type_and_responsible.sql fez
--     CREATE OR REPLACE partindo de uma base VELHA (sem contracts e sem
--     language/currency/timezone) -> derrubou os DOIS calados. As migrations
--     seguintes (20260807140000 equipment_more_fields, 20260823123000 charges)
--     herdaram essa base amputada e propagaram a perda. O front continuou
--     lendo payload.contracts e company_settings.language/currency/timezone,
--     que simplesmente sumiram (contratos não apareciam no portal; locale caía
--     no default).
--
-- ESTA MIGRATION:
--   Parte da DEFINIÇÃO VIVA (pg_get_functiondef em 2026-08-23, que já contém
--   `charges`, `service_type_name/technician_name/team_name` NÃO — atenção:
--   a def viva de service_orders é a REDUZIDA, ver nota abaixo) e ACRESCENTA
--   de volta:
--     1. language/currency/timezone dentro de company_settings (COALESCE p/
--        defaults, nunca null) — forma idêntica à 20260719120000. O front lê
--        companySettings.language/.currency/.timezone (CustomerPortal.tsx
--        linhas 129-131, 361-363) e injeta no PublicAppLocaleProvider.
--     2. o array `contracts` (allowlist estrita idêntica à 20260723090000):
--        id, name, is_pmoc, status, next_maintenance_date (=next_pmoc_generation_date),
--        public_short_code, public_pmoc_token. Filtro status IN ('active','paused'),
--        duplo isolamento customer_id + company_id. O front lê payload.contracts
--        como PortalContractSummary[] (CustomerPortal.tsx linha 271) e monta a
--        URL do portal do contrato via buildPmocPortalUrl({shortCode, token})
--        + next_maintenance_date (linhas 1128-1154).
--
--   PRESERVA INTACTO tudo que está VIVO: access, viewer_can_fill, customer,
--   company_settings (branding), equipment_field_config, equipment (capacity/
--   install_date/warranty_until/category/attachments/custom_fields),
--   service_orders e `charges` (allowlist de 6 campos — NÃO perdemos).
--
--   NOTA sobre service_orders: a def viva NÃO contém service_type_name/
--   technician_name/team_name (a base amputada de 20260723140000 também os
--   perdeu para as migrations posteriores? não — 20260807140000/charges
--   partiram de base sem eles). Mantemos EXATAMENTE o que está vivo hoje
--   (id/order_number/status/description/scheduled_date/created_at/os_type/
--   equipment_id) para NÃO introduzir mudança fora do escopo desta correção.
--
-- SECURITY DEFINER, STABLE, owner (postgres), search_path='public' e GRANTs
-- (anon/authenticated) permanecem IDÊNTICOS — CREATE OR REPLACE preserva owner
-- e grants existentes. Reemitimos o GRANT por idempotência/segurança.
-- Allowlist estrita em contracts: NADA de valor/custo/margem/BDI/frequency.

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
    -- ambiente multi-tenant). Inclui o branding white-label (público por design)
    -- + locale (language/currency/timezone) — RESTAURADO 2026-08-23, forma
    -- idêntica à 20260719120000. COALESCE garante default (nunca null pro front).
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
    -- (o portal filtra OS por equipamento no detalhe). Preservado IDÊNTICO à
    -- def viva (não acrescentamos campos fora do escopo desta correção).
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

    -- contracts[] do cliente — RESTAURADO 2026-08-23 (allowlist idêntica à
    -- 20260723090000). Sem valor/custo/margem/BDI/horizon/frequency.
    -- next_maintenance_date = next_pmoc_generation_date (mesma semântica do
    -- portal do contrato). public_short_code + public_pmoc_token: o front usa
    -- os dois em buildPmocPortalUrl() pra montar a URL amigável do contrato.
    -- Filtro status IN ('active','paused'). Isolamento duplo: customer_id E
    -- company_id (mesma empresa dona do portal).
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
    ), '[]'::jsonb),

    -- charges[] (2026-08 Onda E): cobranças da MESMA empresa E do MESMO cliente
    -- que o token resolve. ALLOWLIST ESTRITA de 6 campos (montados campo a campo,
    -- nunca to_jsonb): value, status, due_date, description, billing_type,
    -- public_short_code. net_value/source_*/asaas_payment_id/customer_id/
    -- created_by e demais colunas internas NUNCA saem (portal é anon).
    -- Esconde só CANCELLED/CANCELED; mostra pendente/pago/vencido/estornado.
    -- Ordena por vencimento desc (NULLs por último), depois created_at desc.
    -- LIMIT 50. Sem cobrança => '[]'. PRESERVADO IDÊNTICO à def viva.
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

GRANT EXECUTE ON FUNCTION public.get_portal_data(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_portal_data(text) IS
  'Payload completo do portal do cliente (/portal/:token). SECURITY DEFINER com gate de módulo. '
  'company_settings inclui branding white-label + language/currency/timezone (locale). '
  'Payload: customer, equipment (+capacity/install_date/warranty_until/category/attachments/custom_fields), '
  'equipment_field_config, service_orders, contracts (allowlist, status active|paused, duplo isolamento), '
  'charges (allowlist de 6 campos). contracts+locale RESTAURADOS em 2026-08-23 (regressão de 20260723140000).';

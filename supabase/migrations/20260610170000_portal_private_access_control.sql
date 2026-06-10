-- Portal do Cliente: suporte a portais PRIVADOS + checagem de acesso server-side.
--
-- POR QUÊ
-- Até aqui todo portal (/portal/:token) era de fato público: qualquer um com o link
-- via os dados via get_portal_data (SECURITY DEFINER, GRANT anon). Agora o portal
-- pode ser:
--   - PÚBLICO  (is_public = true)  → qualquer um com o link vê (read-only).
--   - PRIVADO  (is_public = false) → só usuários LOGADOS da empresa DONA do portal.
--
-- "Membro da empresa dona" = auth.uid() cujo company_id (via profiles.user_id ->
-- profiles.company_id, encapsulado em public.get_user_company_id) é igual ao
-- company_id do portal (resolvido pelo customer do portal). A REGRA de acesso foi
-- definida pelo Tech Lead/Plataforma; aqui só implemento o SQL.

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 1 — coluna is_public (idempotente). Existentes ficam PÚBLICOS (default true),
-- preservando o comportamento atual de quem já tem link compartilhado.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.customer_portals
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

-- Policy de UPDATE: a empresa dona já pode atualizar suas linhas via a policy ALL
-- "Users manage own customer_portals" (tenant-scoped pelo company_id do customer,
-- USING + WITH CHECK). is_public é coberto por ela — nenhuma policy nova é precisa.

-- ─────────────────────────────────────────────────────────────────────────────
-- PASSO 2 — get_portal_data com checagem de acesso.
-- Mantém assinatura, SECURITY DEFINER, search_path, STABLE e os grants anon+authenticated.
-- Mantém TODOS os campos da versão 20260610120000 (inclusive white-label).
-- Adiciona no nível raiz: access ('granted'|'denied') e viewer_can_fill (boolean).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_portal_data(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id        uuid;
  v_company_id         uuid;
  v_is_public          boolean;
  v_is_company_member  boolean;
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
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_data(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_portal_data(text) IS
  'Payload do Portal do Cliente (/portal/:token). SECURITY DEFINER: valida token (customer_portals.is_active). Portal privado (is_public=false) só libera dados pra membro logado da empresa dona; senão retorna {access:denied}. Caso liberado, retorna access=granted + viewer_can_fill (true só p/ membro da empresa) + customer + company_settings (com white-label) + equipment[] + service_orders[].';

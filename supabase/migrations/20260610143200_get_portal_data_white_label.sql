-- Estende get_portal_data(p_token) para expor o branding white-label do tenant
-- no objeto company_settings do payload do Portal do Cliente (/portal/:token).
--
-- POR QUÊ
-- O portal público lê company_settings via esta RPC, mas só trazia name/logo_url/
-- phone/email/address/city/state. Sem os campos de white-label, a tela do portal
-- não consegue aplicar a cor/branding da empresa. Os campos abaixo são PÚBLICOS
-- por design (o portal PMOC público já os expõe via pmoc-portal-share) — é o
-- branding que a empresa quer mostrar, não dado sensível.
--
-- Recria a função (CREATE OR REPLACE) idêntica à anterior, só adicionando 4 campos
-- em company_settings. Assinatura, SECURITY DEFINER, search_path, validação de
-- token e grants permanecem inalterados.
CREATE OR REPLACE FUNCTION public.get_portal_data(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_company_id  uuid;
  v_result      jsonb;
BEGIN
  -- Valida o token: portal precisa existir E estar ativo.
  SELECT cp.customer_id INTO v_customer_id
  FROM customer_portals cp
  WHERE cp.token = p_token AND cp.is_active = true
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- company_id do cliente — usado para resolver o white-label correto.
  SELECT c.company_id INTO v_company_id FROM customers c WHERE c.id = v_customer_id;

  v_result := jsonb_build_object(
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
  'Payload completo do Portal do Cliente (/portal/:token). SECURITY DEFINER: valida o token (customer_portals.is_active) e devolve customer + company_settings (inclui branding white-label, público por design) + equipment[] + service_orders[] daquele cliente.';

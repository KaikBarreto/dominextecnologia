-- Fase 0.2 — fecha a enumeração pública restante do Portal do Cliente e do link
-- de avaliação, MESMO padrão da Fase 0.1 (link público de OS via get_public_os).
--
-- POR QUÊ
-- Hoje o Portal do Cliente (src/pages/CustomerPortal.tsx) valida o token via
-- get_portal_by_token, mas DEPOIS lê customers / company_settings / equipment /
-- service_orders DIRETO com o client anon (sem header de token). Isso só funciona
-- porque existem duas policies anon que NÃO checam token:
--   • "Public view service_orders via portal"
--       = is_customer_in_active_portal(customer_id)
--           OR EXISTS(service_ratings sr WHERE sr.service_order_id = id)
--   • "Public view customers via active portal"
--       = is_customer_in_active_portal(id)
-- is_customer_in_active_portal(cid) só checa EXISTS(customer_portals is_active) —
-- NÃO valida token nenhum. Resultado: qualquer um com a chave pública enumera as
-- OSs e os clientes de TODA empresa que tenha ALGUM portal ativo (112 OSs / 7
-- clientes confirmados).
--
-- A página de avaliação (src/pages/ServiceRating.tsx via usePublicRating) também
-- lê service_orders direto após get_rating_by_token — e é o ramo
-- EXISTS(service_ratings) da policy acima que sustenta essa leitura.
--
-- SOLUÇÃO (aditiva — pode ir pro ar): duas RPCs SECURITY DEFINER que validam o
-- token internamente e devolvem TUDO que cada página consome num único JSON.
-- Token inválido / portal inativo → NULL. Depois que as páginas passam a ler por
-- aqui, as duas policies amplas podem cair (migration de tightening separada).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) get_portal_data(p_token) — payload completo do Portal do Cliente
--    Espelha os SELECTs de CustomerPortal.tsx:
--      customers       → id, name, company_id
--      company_settings→ name, logo_url, phone, email, address, city, state
--      equipment[]     → id,name,brand,model,serial_number,location,status,
--                        photo_url,identifier  (eq.customer_id, order by name)
--      service_orders[]→ id,order_number,status,description,scheduled_date,
--                        created_at,os_type,equipment_id (eq.customer_id, desc)
-- ─────────────────────────────────────────────────────────────────────────────
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
    -- ambiente multi-tenant).
    'company_settings', (
      SELECT jsonb_build_object(
        'name', cs.name, 'logo_url', cs.logo_url, 'phone', cs.phone,
        'email', cs.email, 'address', cs.address, 'city', cs.city, 'state', cs.state
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
  'Payload completo do Portal do Cliente (/portal/:token). SECURITY DEFINER: valida o token (customer_portals.is_active) e devolve customer + company_settings + equipment[] + service_orders[] daquele cliente. Substitui as leituras anon diretas que dependiam de policies sem validação de token.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) get_rating_with_os_by_token(p_token) — payload da página de avaliação
--    Hoje usePublicRating chama get_rating_by_token e DEPOIS lê service_orders
--    direto (id, order_number, scheduled_date, customer:customers(id,name)).
--    Essa leitura direta é o que sustenta o ramo EXISTS(service_ratings) da
--    policy "Public view service_orders via portal". Folding a OS aqui dentro
--    permite dropar esse ramo também.
--    Token inválido → NULL.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_rating_with_os_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rating service_ratings%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_rating FROM service_ratings WHERE token = p_token LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Espalha a linha de service_ratings e anexa a OS relacionada (mesmo subset
  -- que a página lê hoje direto).
  v_result := to_jsonb(v_rating) || jsonb_build_object(
    'service_order', (
      SELECT jsonb_build_object(
        'id', so.id,
        'order_number', so.order_number,
        'scheduled_date', so.scheduled_date,
        'customer', (
          SELECT jsonb_build_object('id', c.id, 'name', c.name)
          FROM customers c WHERE c.id = so.customer_id
        )
      )
      FROM service_orders so WHERE so.id = v_rating.service_order_id
    )
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rating_with_os_by_token(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_rating_with_os_by_token(text) IS
  'Payload da página de avaliação (/avaliar/:token): linha de service_ratings + a OS relacionada (id, order_number, scheduled_date, customer{id,name}). SECURITY DEFINER, valida o token. Substitui a leitura anon direta de service_orders que dependia do ramo EXISTS(service_ratings).';

-- get_public_os(p_os_id) — SECURITY DEFINER RPC para o link público de OS
-- (`/os-tecnico/:id?modo=cliente`).
--
-- POR QUÊ: as policies `TO anon` com `USING(true)` em service_orders e tabelas
-- relacionadas permitiam que qualquer um com a chave pública enumerasse TODAS as
-- OSs de TODAS as empresas (SELECT * sem filtro). Esta RPC recebe APENAS um id e
-- devolve UM JSON com tudo que a página pública consome para aquela OS — sem
-- expor enumeração. Depois que a página passa a ler por aqui, as policies
-- `via shared OS` USING(true) podem cair (migration separada).
--
-- Espelha exatamente os SELECTs de:
--   src/pages/TechnicianOS.tsx  (fetchServiceOrder, fetchFormResponses,
--                                fetchEquipmentItems, fetchTechnicianProfile,
--                                fetchCompany, fetchPhotos)
--   src/components/technician/OSReport.tsx (fetchAllResponses, fetchRating,
--                                fetchEquipmentItems, fetchTechnician,
--                                fetchCompany, fetchContract)

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
  -- Linha da OS. Se não existir, devolve NULL (página trata como "não encontrada").
  SELECT * INTO v_so FROM service_orders WHERE id = p_os_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Resolve o técnico: technician_id primeiro, senão o primeiro assignee.
  -- (espelha TechnicianOS fetchTechnicianProfile / OSReport fetchTechnician)
  v_technician_id := v_so.technician_id;
  IF v_technician_id IS NULL THEN
    SELECT user_id INTO v_technician_id
    FROM service_order_assignees
    WHERE service_order_id = p_os_id
    LIMIT 1;
  END IF;

  v_result := jsonb_build_object(
    -- service_orders.* (página usa `*`)
    'service_order', to_jsonb(v_so),

    -- customer: id,name,phone,address,city,state,document,photo_url
    'customer', (
      SELECT jsonb_build_object(
        'id', c.id, 'name', c.name, 'phone', c.phone, 'address', c.address,
        'city', c.city, 'state', c.state, 'document', c.document, 'photo_url', c.photo_url
      )
      FROM customers c WHERE c.id = v_so.customer_id
    ),

    -- customer_geo: coordenadas/endereço pro mapa público de tracking
    -- (PublicTrackingMap). Mantém o mapa funcionando sem a policy anon ampla.
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

    -- form_responses: id,question_id,response_value,response_photo_url,equipment_id
    --   + question join (form_questions.*) — espelha OSReport (usa *)
    --   e TechnicianOS (usa subset, mas * é superset compatível).
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
    --   equipment(id,name,brand,model,location,photo_url, category(id,name,color))
    --   form_template(id,name)
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

    -- company_settings: white-label completo (página usa `*`)
    'company_settings', (
      SELECT to_jsonb(cs) FROM company_settings cs WHERE cs.company_id = v_so.company_id
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

-- A RPC só recebe um id e devolve aquela OS — não enumera. Liberada pra anon
-- (link público) e authenticated.
GRANT EXECUTE ON FUNCTION public.get_public_os(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_os(uuid) IS
  'Payload completo da OS pública (link /os-tecnico/:id?modo=cliente). SECURITY DEFINER: recebe só o id, devolve aquela OS. Substitui as leituras anon diretas que enumeravam todas as OSs.';

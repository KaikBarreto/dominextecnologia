-- =============================================================================
-- get_public_os: ADICIONA response_video_url nas form_responses
-- =============================================================================
-- POR QUÊ ("resposta em vídeo do checklist no modo cliente"):
--   A migration 20260715120000 criou a coluna form_responses.response_video_url
--   (irmã de response_photo_url) — resposta em VÍDEO de uma pergunta de checklist
--   da OS. A tela pública da OS (link do cliente, modo anônimo) recebe as
--   respostas via get_public_os, que já serializa response_photo_url mas ainda
--   NÃO expunha response_video_url. Sem isso o vídeo nunca chega no modo cliente.
--
-- O QUE MUDA:
--   Em form_responses[] → acrescenta 'response_video_url', ao lado de
--   'response_photo_url'. UM único campo novo.
--
-- NADA MAIS MUDA: assinatura, SECURITY DEFINER, search_path, filtros por OS
--   (WHERE ... = p_os_id) e todos os demais campos ficam IDÊNTICOS à definição
--   corrente (20260622100000). Função copiada integralmente.
--
-- SEGURANÇA: response_video_url é a URL do vídeo da própria OS (mesmo bucket
--   público das fotos), filtrada por fr.service_order_id = p_os_id. Não cruza
--   tenant, não afrouxa RLS — a função continua sendo a única superfície pública.
--
-- Idempotente: CREATE OR REPLACE. Mesmos GRANTs.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_public_os(p_os_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_so            service_orders%ROWTYPE;
  v_technician_id uuid;
  v_result        jsonb;
  v_activities    jsonb;
BEGIN
  SELECT * INTO v_so FROM service_orders WHERE id = p_os_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_technician_id := v_so.technician_id;
  IF v_technician_id IS NULL THEN
    SELECT user_id INTO v_technician_id
    FROM service_order_assignees
    WHERE service_order_id = p_os_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  v_result := jsonb_build_object(
    'service_order', to_jsonb(v_so),

    'customer', (
      SELECT jsonb_build_object(
        'id', c.id, 'name', c.name, 'phone', c.phone, 'address', c.address,
        'city', c.city, 'state', c.state, 'document', c.document, 'photo_url', c.photo_url
      )
      FROM customers c WHERE c.id = v_so.customer_id
    ),

    'customer_geo', (
      SELECT jsonb_build_object(
        'id', c.id, 'lat', c.lat, 'lng', c.lng, 'address', c.address,
        'city', c.city, 'state', c.state, 'zip_code', c.zip_code
      )
      FROM customers c WHERE c.id = v_so.customer_id
    ),

    'equipment', (
      SELECT jsonb_build_object(
        'id', e.id, 'name', e.name, 'brand', e.brand, 'model', e.model,
        'serial_number', e.serial_number, 'location', e.location, 'capacity', e.capacity
      )
      FROM equipment e WHERE e.id = v_so.equipment_id
    ),

    'form_template', (
      SELECT jsonb_build_object('id', ft.id, 'name', ft.name)
      FROM form_templates ft WHERE ft.id = v_so.form_template_id
    ),

    'service_type', (
      SELECT jsonb_build_object('id', st.id, 'name', st.name, 'color', st.color)
      FROM service_types st WHERE st.id = v_so.service_type_id
    ),

    'photos', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at ASC)
      FROM os_photos p WHERE p.service_order_id = p_os_id
    ), '[]'::jsonb),

    'form_responses', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', fr.id,
          'question_id', fr.question_id,
          'response_value', fr.response_value,
          'response_photo_url', fr.response_photo_url,
          'response_video_url', fr.response_video_url,
          'equipment_id', fr.equipment_id,
          'question', (SELECT to_jsonb(fq) FROM form_questions fq WHERE fq.id = fr.question_id),
          -- template_id/template_name: NOME real do checklist personalizado,
          -- resolvido via form_questions.template_id → form_templates.name.
          'template_id', (SELECT fq2.template_id FROM form_questions fq2 WHERE fq2.id = fr.question_id),
          'template_name', (
            SELECT ft3.name
            FROM form_questions fq3
            LEFT JOIN form_templates ft3 ON ft3.id = fq3.template_id
            WHERE fq3.id = fr.question_id
          )
        )
      )
      FROM form_responses fr WHERE fr.service_order_id = p_os_id
    ), '[]'::jsonb),

    'equipment_items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'equipment_id', soe.equipment_id,
          'form_template_id', soe.form_template_id,
          -- environment_name: NOME do ambiente do equipamento neste contrato.
          -- Subselect escalar (não join) pra não multiplicar o jsonb_agg quando
          -- o equipamento tem mais de uma contract_items row.
          'environment_name', (
            SELECT ce.identificacao
            FROM contract_items ci
            JOIN contract_environments ce ON ce.id = ci.environment_id
            WHERE ci.equipment_id = soe.equipment_id
              AND ci.contract_id  = v_so.contract_id
              AND ci.environment_id IS NOT NULL
            ORDER BY ci.sort_order ASC NULLS LAST
            LIMIT 1
          ),
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

    'technician', (
      SELECT jsonb_build_object('full_name', pr.full_name, 'avatar_url', pr.avatar_url)
      FROM profiles pr WHERE pr.user_id = v_technician_id
    ),

    -- rating: subset SEM token. Inclui flags de estado pro link público decidir
    -- se mostra o formulário de avaliação ou o "obrigado".
    'rating', (
      SELECT jsonb_build_object(
        'is_concluded', (v_so.status = 'concluida'),
        'already_rated', (sr.rated_at IS NOT NULL),
        'rated_at', sr.rated_at,
        'nps_score', sr.nps_score,
        'quality_rating', sr.quality_rating,
        'punctuality_rating', sr.punctuality_rating,
        'professionalism_rating', sr.professionalism_rating,
        'comment', sr.comment,
        'rated_by_name', sr.rated_by_name
      )
      FROM service_ratings sr WHERE sr.service_order_id = p_os_id LIMIT 1
    ),

    -- survey_enabled: existe linha de rating (criada na conclusão da OS) →
    -- a pesquisa de satisfação pode ser ofertada no modo cliente.
    'survey_enabled', EXISTS (
      SELECT 1 FROM service_ratings sr2 WHERE sr2.service_order_id = p_os_id
    ),

    -- nps_config: pergunta + estrelas obrigatórias + generate_on_finish da
    -- empresa DONA da OS. Defaults quando a empresa não tem linha em nps_settings.
    'nps_config', (
      SELECT jsonb_build_object(
        'question', COALESCE(ns.question,
          'De 0 a 10, o quão satisfeito(a) você ficou com o nosso serviço?'),
        'require_stars', COALESCE(ns.require_stars, false),
        'generate_on_finish', COALESCE(ns.generate_on_finish, true)
      )
      FROM (SELECT 1) dummy
      LEFT JOIN nps_settings ns ON ns.company_id = v_so.company_id
    ),

    -- nps_criteria: critérios de estrela DINÂMICOS ATIVOS da empresa, ordenados.
    'nps_criteria', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('id', nc.id, 'label', nc.label)
        ORDER BY nc.position ASC, nc.created_at ASC
      )
      FROM nps_criteria nc
      WHERE nc.company_id = v_so.company_id AND nc.active = true
    ), '[]'::jsonb),

    'company_settings', (
      SELECT to_jsonb(cs) FROM company_settings cs WHERE cs.company_id = v_so.company_id
    ),

    'contract', (
      SELECT jsonb_build_object(
        'id', ct.id,
        'name', ct.name,
        'is_pmoc', ct.is_pmoc,
        'pmoc_legal_compliance_text', ct.pmoc_legal_compliance_text
      )
      FROM contracts ct WHERE ct.id = v_so.contract_id
    )
  );

  -- ---------------------------------------------------------------------------
  -- activities: respostas do checklist PMOC (service_order_activities).
  -- No modo anônimo o RLS bloqueia leitura direta dessa tabela, então o
  -- relatório público depende deste payload. Só inclui a chave quando a OS
  -- TEM checklist (≥1 linha). Fotos: activity_photos é CSV de URLs já públicas
  -- (bucket os-photos) → vira array, split por vírgula, trim, sem vazios.
  -- equipment_name resolvido via equipment.name (join por equipment_id);
  -- null = atividade geral (sem equipamento). Ordem estável:
  -- equipment_name (nulls por último), depois sort_order, depois section.
  -- form_template_id: quando setado, a atividade é um "checklist personalizado"
  -- por máquina → o frontend público renderiza as perguntas do template.
  -- freq_code: M/T/S/A (frequência da visita) → o relatório público exibe o
  -- "Tipo de Visita" por equipamento.
  -- environment_name: NOME do ambiente do equipamento no contrato da OS,
  -- via subselect escalar (não join) pra não multiplicar o agregado.
  -- ---------------------------------------------------------------------------
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                a.id,
      'equipment_id',      a.equipment_id,
      'equipment_name',    e.name,
      'environment_name', (
        SELECT ce.identificacao
        FROM contract_items ci
        JOIN contract_environments ce ON ce.id = ci.environment_id
        WHERE ci.equipment_id = a.equipment_id
          AND ci.contract_id  = v_so.contract_id
          AND ci.environment_id IS NOT NULL
        ORDER BY ci.sort_order ASC NULLS LAST
        LIMIT 1
      ),
      'description',       a.description,
      'section',           a.section,
      'component',         a.component,
      'guidance',          a.guidance,
      'conformity_status', a.conformity_status,
      'is_measurement',    a.is_measurement,
      'measured_value',    a.measured_value,
      'unit',              a.unit,
      'expected_min',      a.expected_min,
      'expected_max',      a.expected_max,
      'sort_order',        a.sort_order,
      'form_template_id',  a.form_template_id,
      'freq_code',         a.freq_code,
      'photos', COALESCE((
        SELECT jsonb_agg(trim(u))
        FROM unnest(string_to_array(a.activity_photos, ',')) AS u
        WHERE trim(u) <> ''
      ), '[]'::jsonb)
    )
    ORDER BY (e.name IS NULL), e.name ASC, a.sort_order ASC NULLS LAST, a.section ASC NULLS LAST
  )
  INTO v_activities
  FROM service_order_activities a
  LEFT JOIN equipment e ON e.id = a.equipment_id
  WHERE a.service_order_id = p_os_id;

  IF v_activities IS NOT NULL THEN
    v_result := jsonb_set(v_result, '{activities}', v_activities);
  END IF;

  -- Caso a OS esteja concluída mas (excepcionalmente) sem linha de rating ainda,
  -- ainda assim devolve o estado pra UI poder ofertar a avaliação.
  IF v_result->'rating' IS NULL OR v_result->>'rating' = 'null' THEN
    v_result := jsonb_set(v_result, '{rating}', jsonb_build_object(
      'is_concluded', (v_so.status = 'concluida'),
      'already_rated', false,
      'rated_at', NULL,
      'nps_score', NULL,
      'quality_rating', NULL,
      'punctuality_rating', NULL,
      'professionalism_rating', NULL,
      'comment', NULL,
      'rated_by_name', NULL
    ));
  END IF;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_os(uuid) TO anon, authenticated, service_role;

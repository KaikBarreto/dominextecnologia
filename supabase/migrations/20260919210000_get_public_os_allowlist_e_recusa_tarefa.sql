-- =============================================================================
-- get_public_os / get_public_os_by_code: allowlist de colunas + recusa de tarefa
-- =============================================================================
-- POR QUE:
--   As duas RPCs sao SECURITY DEFINER com EXECUTE pra `anon` (link publico da
--   OS, relatorio publico, pesquisa de satisfacao e checklist PMOC do cliente).
--   Ate aqui elas nao tinham gate nenhum:
--     1. `to_jsonb(v_so)` devolvia a LINHA INTEIRA de service_orders, incluindo
--        labor_value / parts_value / total_value / parts_used / labor_hours e
--        created_by.
--     2. `to_jsonb(cs)` devolvia a LINHA INTEIRA de company_settings.
--     3. Nenhuma das duas filtrava `entry_type`. Como o trigger
--        `ensure_public_short_code` gera codigo pra TODA linha de
--        service_orders, as 481 tarefas internas do banco eram alcancaveis por
--        get_public_os_by_code('<12 chars>') por qualquer anonimo -- com
--        titulo, descricao, responsavel, cliente e observacao interna.
--
-- O QUE MUDA:
--   a) `service_order` vira allowlist de 50 colunas (21 saem).
--   b) `company_settings` vira allowlist de 25 colunas (21 saem).
--   c) get_public_os recusa `entry_type = 'tarefa'` devolvendo NULL -- o MESMO
--      retorno de "nao encontrada", caminho que o front ja trata.
--   d) get_public_os_by_code nem chega a resolver o id de uma tarefa.
--
-- O QUE **NAO** MUDA (de proposito):
--   `notes` FICA. A premissa de que era so observacao interna estava errada:
--   TechnicianOS renderiza um card "Observacoes" com serviceOrder.notes no modo
--   cliente, e o OSReport tem o bloco "Detalhes do Servico" com
--   diagnosis/solution/notes. Cortar tiraria conteudo que o cliente ve hoje.
--   `document` de company_settings FICA (CNPJ da empresa PRESTADORA impresso no
--   cabecalho do relatorio publico/PDF). `snapshot_data` FICA (o OSReport usa
--   como fallback de customer/equipment/service_type/contract apagados).
--
-- COMO FOI FEITA:
--   Gerada programaticamente EM CIMA da definicao VIVA (pg_get_functiondef),
--   nao do arquivo de migration antigo -- esta RPC ja quebrou a pesquisa de
--   satisfacao e o checklist PMOC uma vez ao ser recriada da fonte errada.
--   Todo o resto do corpo (activities, form_responses, equipment_items,
--   nps_config, nps_criteria, rating, contract, customer, customer_geo,
--   equipment, technician, photos) esta byte a byte igual ao que rodava em
--   producao.
--
-- IDEMPOTENTE: CREATE OR REPLACE + GRANT; re-executavel sem efeito colateral.
-- ASSINATURA INALTERADA: (uuid) -> jsonb e (text) -> jsonb. Sem regen de types.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_public_os(p_os_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_so            service_orders%ROWTYPE;
  v_technician_id uuid;
  v_result        jsonb;
  v_activities    jsonb;
BEGIN
  -- Linha da OS. Se nao existir, devolve NULL (pagina trata como "nao encontrada").
  SELECT * INTO v_so FROM service_orders WHERE id = p_os_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- TAREFA INTERNA NAO E SERVIDA POR LINK PUBLICO (2026-09-19).
  -- O trigger `ensure_public_short_code` carimba short_code em TODA linha de
  -- service_orders, tarefa inclusive -> qualquer anonimo com um codigo de 12
  -- chars abria uma tarefa interna completa. Tarefa nao tem tela publica.
  -- Devolve NULL, exatamente como "nao encontrada" (o front ja trata).
  IF v_so.entry_type = 'tarefa' THEN
    RETURN NULL;
  END IF;

  -- Resolve o tecnico: technician_id primeiro, senao o primeiro assignee.
  v_technician_id := v_so.technician_id;
  IF v_technician_id IS NULL THEN
    SELECT user_id INTO v_technician_id
    FROM service_order_assignees
    WHERE service_order_id = p_os_id
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  v_result := jsonb_build_object(
    -- ALLOWLIST (2026-09-19) no lugar do `to_jsonb(v_so)` cru, que devolvia a
    -- LINHA INTEIRA de service_orders pro anon. Sao as 50 colunas que alguma
    -- superficie PUBLICA realmente le (TechnicianOS ?modo=cliente, OSReport
    -- anonimo, PublicTrackingMap, CustomerPortal). Filtro por CHAVE, nao
    -- jsonb_build_object, por dois motivos: (1) 50 colunas = 100 argumentos,
    -- exatamente o teto do Postgres; (2) coluna NOVA em service_orders nasce
    -- FORA do payload publico por padrao -- so entra se alguem colocar aqui.
    -- Os valores saem identicos ao que saia antes (mesmo to_jsonb por coluna).
    'service_order', COALESCE((
      SELECT jsonb_object_agg(e.k, e.v)
      FROM jsonb_each(to_jsonb(v_so)) AS e(k, v)
      WHERE e.k = ANY (ARRAY[
        'id', 'order_number', 'customer_id', 'equipment_id', 'technician_id',
        'os_type', 'status', 'scheduled_date', 'scheduled_time',
        'description', 'diagnosis', 'solution', 'check_in_time',
        'check_in_location', 'check_out_time', 'check_out_location',
        'client_signature', 'notes', 'created_at', 'updated_at',
        'form_template_id', 'service_type_id', 'require_tech_signature',
        'require_client_signature', 'tech_signature', 'duration_minutes',
        'contract_id', 'entry_type', 'snapshot_data', 'company_id',
        'started_at', 'paused_at', 'resumed_at', 'completed_at',
        'pmoc_conformity_status', 'pmoc_conformity_notes', 'service_address',
        'service_address_number', 'service_neighborhood', 'service_city',
        'service_state', 'service_zip_code', 'service_latitude',
        'service_longitude', 'public_short_code', 'partial_finish',
        'tech_signature_at', 'client_signature_at', 'tech_signed_location',
        'client_signed_location'
      ]::text[])
    ), '{}'::jsonb),

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
          -- resolvido via form_questions.template_id -> form_templates.name.
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
          -- Subselect escalar (nao join) pra nao multiplicar o jsonb_agg quando
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

    -- rating: subset SEM token. Inclui flags de estado pro link publico decidir
    -- se mostra o formulario de avaliacao ou o "obrigado".
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

    -- survey_enabled: existe linha de rating (criada na conclusao da OS) ->
    -- a pesquisa de satisfacao pode ser ofertada no modo cliente.
    'survey_enabled', EXISTS (
      SELECT 1 FROM service_ratings sr2 WHERE sr2.service_order_id = p_os_id
    ),

    -- nps_config: pergunta + estrelas obrigatorias + generate_on_finish da
    -- empresa DONA da OS. Defaults quando a empresa nao tem linha em nps_settings.
    -- ACRESCENTA google_review_url + google_review_min_score:
    --   - google_review_url NULL      => recurso desligado.
    --   - google_review_min_score NULL => mostrar sempre (quando ha url).
    --   - google_review_min_score N   => mostrar so quando nps_score >= N.
    'nps_config', (
      SELECT jsonb_build_object(
        'question', COALESCE(ns.question,
          'De 0 a 10, o quao satisfeito(a) voce ficou com o nosso servico?'),
        'require_stars', COALESCE(ns.require_stars, false),
        'generate_on_finish', COALESCE(ns.generate_on_finish, true),
        'google_review_url', ns.google_review_url,
        'google_review_min_score', ns.google_review_min_score
      )
      FROM (SELECT 1) dummy
      LEFT JOIN nps_settings ns ON ns.company_id = v_so.company_id
    ),

    -- nps_criteria: criterios de estrela DINAMICOS ATIVOS da empresa, ordenados.
    'nps_criteria', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('id', nc.id, 'label', nc.label)
        ORDER BY nc.position ASC, nc.created_at ASC
      )
      FROM nps_criteria nc
      WHERE nc.company_id = v_so.company_id AND nc.active = true
    ), '[]'::jsonb),

    -- company_settings: white-label completo + locale da empresa.
    -- language/currency/timezone com COALESCE pra garantir defaults mesmo se NULL.
    -- ALLOWLIST (2026-09-19) no lugar do `to_jsonb(cs)` cru: marca, contato,
    -- cabecalho do relatorio e locale. Ficam de fora proposal_customization,
    -- segment, dre_start_date, os show_*_in_documents e as flags de
    -- comportamento do tenant -- nada disso tem leitor publico.
    -- `document` (CNPJ da EMPRESA PRESTADORA) FICA: o ReportHeader imprime
    -- "CNPJ: ..." no cabecalho do relatorio publico e do PDF.
    'company_settings', (
      SELECT COALESCE((
        SELECT jsonb_object_agg(e.k, e.v)
        FROM jsonb_each(to_jsonb(cs)) AS e(k, v)
        WHERE e.k = ANY (ARRAY[
          'id', 'company_id', 'name', 'document', 'phone', 'email',
          'address', 'city', 'state', 'zip_code', 'logo_url',
          'white_label_enabled', 'white_label_logo_url',
          'white_label_icon_url', 'white_label_primary_color',
          'report_header_bg_color', 'report_header_text_color',
          'report_header_logo_size', 'report_header_show_logo_bg',
          'report_header_logo_bg_color', 'report_status_bar_color',
          'report_header_logo_type', 'language', 'currency', 'timezone'
        ]::text[])
      ), '{}'::jsonb) || jsonb_build_object(
        'language', COALESCE(cs.language, 'pt-br'),
        'currency', COALESCE(cs.currency, 'BRL'),
        'timezone', COALESCE(cs.timezone, 'America/Sao_Paulo')
      )
      FROM company_settings cs WHERE cs.company_id = v_so.company_id
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
  -- No modo anonimo o RLS bloqueia leitura direta dessa tabela, entao o
  -- relatorio publico depende deste payload. So inclui a chave quando a OS
  -- TEM checklist (>=1 linha).
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

  -- Caso a OS esteja concluida mas (excepcionalmente) sem linha de rating ainda,
  -- ainda assim devolve o estado pra UI poder ofertar a avaliacao.
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_os_by_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN NULL;
  END IF;

  -- Tarefa interna fica fora do resolvedor por codigo curto (2026-09-19).
  -- IS DISTINCT FROM cobre entry_type NULL (OS antiga) tambem.
  SELECT id INTO v_id
  FROM service_orders
  WHERE public_short_code = p_code
    AND entry_type IS DISTINCT FROM 'tarefa';

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN public.get_public_os(v_id);
END;
$function$
;

-- CREATE OR REPLACE preserva os GRANTs (nao houve DROP), mas reafirmamos o
-- EXECUTE pra migration ficar auto-suficiente num banco novo.
GRANT EXECUTE ON FUNCTION public.get_public_os(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_os_by_code(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_os(uuid) IS
  'Payload do link publico da OS. Allowlist de colunas por CHAVE (coluna nova nasce fora do payload) e recusa entry_type = tarefa. Exposta a anon.';
COMMENT ON FUNCTION public.get_public_os_by_code(text) IS
  'Resolve public_short_code -> get_public_os, ignorando tarefa interna. Exposta a anon.';

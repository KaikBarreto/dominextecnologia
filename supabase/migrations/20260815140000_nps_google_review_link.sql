-- =============================================================================
-- Convite ao Google Review após a pesquisa de satisfação (NPS)
-- =============================================================================
-- POR QUE:
--   Depois que o cliente responde a pesquisa de satisfação da OS, queremos
--   (opcionalmente, por empresa) convidá-lo a avaliar a empresa no Google.
--   A configuração vive em nps_settings (1 linha por empresa).
--
-- O QUE MUDA:
--   1. nps_settings ganha duas colunas nullable:
--        - google_review_url        (link do perfil Google da empresa)
--        - google_review_min_score  (nota mínima do NPS pra mostrar o convite)
--   2. get_public_os passa a expor as duas chaves DENTRO do bloco nps_config
--      que a página pública já consome (question/require_stars/generate_on_finish).
--
-- RLS: NÃO muda. As colunas herdam a política existente de nps_settings
--   (qualquer autenticado da empresa lê; só can_manage_system=true escreve).
--
-- REGRESSÃO CORRIGIDA DE PASSAGEM:
--   A migration 20260719120000 (locale nas RPCs públicas) recriou get_public_os
--   a partir de uma base ANTIGA e, sem querer, DERRUBOU do payload os blocos
--   survey_enabled, nps_config, nps_criteria e activities (checklist PMOC
--   público). O frontend (TechnicianOS.tsx, CustomerPortal.tsx, relatório
--   público) ainda lê essas chaves — ou seja, a pesquisa de satisfação, os
--   critérios dinâmicos de estrela e o checklist PMOC no link público estão
--   QUEBRADOS em produção desde então. Esta migration recria a função a partir
--   da base COMPLETA (20260715130000) + as adições de locale (COALESCE
--   language/currency/timezone) + as duas chaves novas de Google Review,
--   restaurando o payload íntegro.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Colunas novas em nps_settings
-- -----------------------------------------------------------------------------
ALTER TABLE public.nps_settings
  ADD COLUMN IF NOT EXISTS google_review_url text;

ALTER TABLE public.nps_settings
  ADD COLUMN IF NOT EXISTS google_review_min_score smallint;

-- CHECK de faixa (0..10) só quando o valor não é nulo. Idempotente via guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nps_settings_google_review_min_score_range'
  ) THEN
    ALTER TABLE public.nps_settings
      ADD CONSTRAINT nps_settings_google_review_min_score_range
      CHECK (
        google_review_min_score IS NULL
        OR (google_review_min_score >= 0 AND google_review_min_score <= 10)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.nps_settings.google_review_url IS
  'URL pública do perfil da empresa no Google para onde o cliente é convidado a deixar uma avaliação, exibida APÓS responder a pesquisa de satisfação. NULL = recurso desligado (não mostra convite).';

COMMENT ON COLUMN public.nps_settings.google_review_min_score IS
  'Nota mínima do NPS (0..10) para exibir o convite ao Google Review. NULL = mostrar sempre (quando há google_review_url). Valor N = mostrar só quando a nota do cliente for >= N (ex.: 9 = só promotores).';

-- -----------------------------------------------------------------------------
-- 2. get_public_os — RECRIADA da base completa + locale + Google Review.
--    nps_config ganha google_review_url e google_review_min_score.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_os(p_os_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
    'company_settings', (
      SELECT to_jsonb(cs) || jsonb_build_object(
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
$function$;

-- Grants identicos ao definido historicamente.
GRANT EXECUTE ON FUNCTION public.get_public_os(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_public_os(uuid) IS
  'Payload completo da OS publica (link /os-tecnico/:id?modo=cliente). SECURITY DEFINER: recebe so o id, devolve aquela OS. Inclui survey_enabled/nps_config/nps_criteria/activities e locale (language/currency/timezone). nps_config expoe google_review_url + google_review_min_score para o convite ao Google Review pos-pesquisa.';

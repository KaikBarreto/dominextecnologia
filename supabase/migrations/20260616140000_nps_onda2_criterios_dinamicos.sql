-- =============================================================================
-- NPS Onda 2 — critérios de estrela DINÂMICOS por empresa
-- -----------------------------------------------------------------------------
-- POR QUÊ: hoje service_ratings tem 3 colunas fixas (quality/punctuality/
-- professionalism). O CEO quer que cada empresa defina seus próprios critérios
-- (adicionar/renomear/remover/reordenar/ativar), cada um avaliado 1–5 estrelas.
--
-- Estratégia:
--   1. nps_criteria          → definições de critério por empresa.
--   2. service_rating_criteria → notas por critério em cada resposta, com
--      label_snapshot (preserva histórico mesmo se o critério for renomeado/
--      excluído — régua service_type delete recoverable via snapshot).
--   3. Seed dos 3 padrão por empresa + migração dos valores fixos existentes.
--   4. submit_public_os_rating passa a receber p_criteria jsonb.
--   5. get_public_os devolve nps_criteria (ativos, ordenados).
--   6. get_nps_criteria_averages para o painel.
--
-- As 3 colunas antigas ficam (nullable, deprecated) por segurança/rollback.
-- Idempotente. Sem colisão de nome (checado: nps_criteria e
-- service_rating_criteria não existem).
-- =============================================================================

-- 1. TABELA nps_criteria -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nps_criteria (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL,
  label       text        NOT NULL,
  position    int         NOT NULL DEFAULT 0,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nps_criteria_company
  ON public.nps_criteria (company_id, position);

DROP TRIGGER IF EXISTS set_nps_criteria_updated_at ON public.nps_criteria;
CREATE TRIGGER set_nps_criteria_updated_at
  BEFORE UPDATE ON public.nps_criteria
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. TABELA service_rating_criteria ------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_rating_criteria (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id       uuid        NOT NULL REFERENCES public.service_ratings(id) ON DELETE CASCADE,
  criterion_id    uuid        REFERENCES public.nps_criteria(id) ON DELETE SET NULL,
  label_snapshot  text        NOT NULL,
  value           int         NOT NULL CHECK (value BETWEEN 1 AND 5),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_src_rating_id    ON public.service_rating_criteria (rating_id);
CREATE INDEX IF NOT EXISTS idx_src_criterion_id ON public.service_rating_criteria (criterion_id);

-- 3. RLS ---------------------------------------------------------------------
ALTER TABLE public.nps_criteria            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_rating_criteria ENABLE ROW LEVEL SECURITY;

-- nps_criteria: service_role full; SELECT authenticated da empresa;
-- escrita só can_manage_system da empresa. Sem anon (leitura pública via RPC).
DROP POLICY IF EXISTS "service_role_full_access_nps_criteria" ON public.nps_criteria;
CREATE POLICY "service_role_full_access_nps_criteria"
  ON public.nps_criteria FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view nps_criteria from their company" ON public.nps_criteria;
CREATE POLICY "Users can view nps_criteria from their company"
  ON public.nps_criteria FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Managers can insert nps_criteria" ON public.nps_criteria;
CREATE POLICY "Managers can insert nps_criteria"
  ON public.nps_criteria FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_manage_system(auth.uid())
  );

DROP POLICY IF EXISTS "Managers can update nps_criteria" ON public.nps_criteria;
CREATE POLICY "Managers can update nps_criteria"
  ON public.nps_criteria FOR UPDATE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_manage_system(auth.uid())
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_manage_system(auth.uid())
  );

DROP POLICY IF EXISTS "Managers can delete nps_criteria" ON public.nps_criteria;
CREATE POLICY "Managers can delete nps_criteria"
  ON public.nps_criteria FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_manage_system(auth.uid())
  );

-- service_rating_criteria: service_role full; SELECT authenticated escopado
-- pela company da OS (join rating → service_orders); escrita só via RPC submit
-- (nenhuma policy de INSERT/UPDATE/DELETE para authenticated). Sem anon.
DROP POLICY IF EXISTS "service_role_full_access_service_rating_criteria" ON public.service_rating_criteria;
CREATE POLICY "service_role_full_access_service_rating_criteria"
  ON public.service_rating_criteria FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view service_rating_criteria from their company" ON public.service_rating_criteria;
CREATE POLICY "Users can view service_rating_criteria from their company"
  ON public.service_rating_criteria FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.service_ratings sr
      JOIN public.service_orders so ON so.id = sr.service_order_id
      WHERE sr.id = service_rating_criteria.rating_id
        AND so.company_id = public.get_user_company_id(auth.uid())
    )
  );

-- 4. SEED + MIGRAÇÃO DE DADOS (transacional, com contagem) -------------------
DO $$
DECLARE
  v_companies_seeded   int := 0;
  v_criteria_inserted  int := 0;
  v_values_migrated    int := 0;
  v_before_q           int;
  v_before_p           int;
  v_before_prof        int;
BEGIN
  -- 4a. Seed dos 3 critérios padrão para TODA empresa (que ainda não tenha).
  WITH defaults(label, position) AS (
    VALUES ('Qualidade', 0), ('Pontualidade', 1), ('Profissionalismo', 2)
  ),
  ins AS (
    INSERT INTO public.nps_criteria (company_id, label, position, active)
    SELECT c.id, d.label, d.position, true
    FROM public.companies c
    CROSS JOIN defaults d
    WHERE NOT EXISTS (
      SELECT 1 FROM public.nps_criteria nc
      WHERE nc.company_id = c.id AND nc.label = d.label
    )
    RETURNING company_id
  )
  SELECT count(*), count(DISTINCT company_id) INTO v_criteria_inserted, v_companies_seeded FROM ins;

  RAISE NOTICE 'Seed: % critérios padrão inseridos em % empresas.',
    v_criteria_inserted, v_companies_seeded;

  -- 4b. Contagem ANTES da migração de valores existentes.
  SELECT count(quality_rating), count(punctuality_rating), count(professionalism_rating)
    INTO v_before_q, v_before_p, v_before_prof
  FROM public.service_ratings;
  RAISE NOTICE 'Valores existentes a migrar: quality=%, punctuality=%, professionalism=%.',
    v_before_q, v_before_p, v_before_prof;

  -- 4c. Migrar valores fixos NOT NULL → service_rating_criteria, resolvendo
  -- o critério padrão DA EMPRESA daquela OS via label.
  WITH src AS (
    SELECT sr.id AS rating_id, so.company_id, 'Qualidade'::text AS label, sr.quality_rating AS value
    FROM public.service_ratings sr
    JOIN public.service_orders so ON so.id = sr.service_order_id
    WHERE sr.quality_rating IS NOT NULL
    UNION ALL
    SELECT sr.id, so.company_id, 'Pontualidade', sr.punctuality_rating
    FROM public.service_ratings sr
    JOIN public.service_orders so ON so.id = sr.service_order_id
    WHERE sr.punctuality_rating IS NOT NULL
    UNION ALL
    SELECT sr.id, so.company_id, 'Profissionalismo', sr.professionalism_rating
    FROM public.service_ratings sr
    JOIN public.service_orders so ON so.id = sr.service_order_id
    WHERE sr.professionalism_rating IS NOT NULL
  ),
  migrated AS (
    INSERT INTO public.service_rating_criteria (rating_id, criterion_id, label_snapshot, value)
    SELECT
      src.rating_id,
      (SELECT nc.id FROM public.nps_criteria nc
        WHERE nc.company_id = src.company_id AND nc.label = src.label
        LIMIT 1),
      src.label,
      src.value
    FROM src
    WHERE src.value BETWEEN 1 AND 5
    RETURNING 1
  )
  SELECT count(*) INTO v_values_migrated FROM migrated;

  RAISE NOTICE 'Migração: % valores de estrela migrados para service_rating_criteria.', v_values_migrated;

  -- Validação: total migrado deve bater com a soma dos NOT NULL no range.
  IF v_values_migrated <> (v_before_q + v_before_p + v_before_prof) THEN
    RAISE WARNING 'Contagem divergente: migrados=% esperado=% (pode haver valores fora do range 1–5).',
      v_values_migrated, (v_before_q + v_before_p + v_before_prof);
  END IF;
END $$;

-- 5. submit_public_os_rating (nova assinatura com p_criteria jsonb) ----------
-- Remove a assinatura antiga (params de estrela individuais) para evitar
-- ambiguidade de overload.
DROP FUNCTION IF EXISTS public.submit_public_os_rating(uuid, integer, integer, integer, integer, text, text);

CREATE OR REPLACE FUNCTION public.submit_public_os_rating(
  p_os_id   uuid,
  p_nps     integer,
  p_comment text    DEFAULT NULL,
  p_name    text    DEFAULT NULL,
  p_criteria jsonb  DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_so       service_orders%ROWTYPE;
  v_rating   service_ratings%ROWTYPE;
  v_item     jsonb;
  v_crit_id  uuid;
  v_value    int;
  v_label    text;
BEGIN
  SELECT * INTO v_so FROM service_orders WHERE id = p_os_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OS não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_so.status <> 'concluida' THEN
    RAISE EXCEPTION 'A avaliação só fica disponível após a conclusão do serviço.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_nps IS NULL OR p_nps < 0 OR p_nps > 10 THEN
    RAISE EXCEPTION 'A nota de recomendação deve estar entre 0 e 10.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Garante a linha (caso a trigger não tenha rodado).
  INSERT INTO public.service_ratings (service_order_id, token)
  VALUES (p_os_id, encode(gen_random_bytes(32), 'hex'))
  ON CONFLICT (service_order_id) DO NOTHING;

  -- Trava: 1 resposta por OS, sem reescrever. Lock da linha.
  SELECT * INTO v_rating FROM service_ratings
  WHERE service_order_id = p_os_id FOR UPDATE;

  IF v_rating.rated_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta avaliação já foi enviada. Obrigado!'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Grava a nota principal.
  UPDATE service_ratings SET
    nps_score     = p_nps,
    comment       = NULLIF(btrim(p_comment), ''),
    rated_by_name = NULLIF(btrim(p_name), ''),
    rated_at      = now()
  WHERE service_order_id = p_os_id
  RETURNING * INTO v_rating;

  -- Grava cada critério dinâmico. criterion_id precisa pertencer à empresa da OS.
  IF p_criteria IS NOT NULL AND jsonb_typeof(p_criteria) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_criteria)
    LOOP
      v_crit_id := NULLIF(v_item->>'criterion_id', '')::uuid;
      v_value   := (v_item->>'value')::int;

      IF v_value IS NULL OR v_value < 1 OR v_value > 5 THEN
        RAISE EXCEPTION 'As notas por critério devem estar entre 1 e 5.'
          USING ERRCODE = 'check_violation';
      END IF;

      -- Resolve o label e valida que o critério é da empresa da OS.
      SELECT nc.label INTO v_label
      FROM public.nps_criteria nc
      WHERE nc.id = v_crit_id AND nc.company_id = v_so.company_id;

      IF v_label IS NULL THEN
        RAISE EXCEPTION 'Critério de avaliação inválido para esta empresa.'
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.service_rating_criteria
        (rating_id, criterion_id, label_snapshot, value)
      VALUES (v_rating.id, v_crit_id, v_label, v_value);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_public_os_rating(uuid, integer, text, text, jsonb)
  TO anon, authenticated, service_role;

-- 6. get_public_os: incluir nps_criteria (ativos, ordenados por position) ----
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
          'equipment_id', fr.equipment_id,
          'question', (SELECT to_jsonb(fq) FROM form_questions fq WHERE fq.id = fr.question_id)
        )
      )
      FROM form_responses fr WHERE fr.service_order_id = p_os_id
    ), '[]'::jsonb),

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

    'technician', (
      SELECT jsonb_build_object('full_name', pr.full_name, 'avatar_url', pr.avatar_url)
      FROM profiles pr WHERE pr.user_id = v_technician_id
    ),

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

    'survey_enabled', EXISTS (
      SELECT 1 FROM service_ratings sr2 WHERE sr2.service_order_id = p_os_id
    ),

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

    -- NPS Onda 2: critérios dinâmicos ATIVOS da empresa da OS, ordenados.
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
      SELECT jsonb_build_object('id', ct.id, 'name', ct.name)
      FROM contracts ct WHERE ct.id = v_so.contract_id
    )
  );

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

-- 7. get_nps_criteria_averages: média por critério no período (tenant) -------
-- Escopado ao tenant do chamador pela company da OS. Agrupa por label_snapshot
-- (preserva renomeações históricas como linhas distintas — fiel ao snapshot).
CREATE OR REPLACE FUNCTION public.get_nps_criteria_averages(
  p_start date,
  p_end   date
)
RETURNS TABLE (
  label     text,
  media     numeric,
  respostas bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    src.label_snapshot AS label,
    round(avg(src.value)::numeric, 2) AS media,
    count(*)::bigint AS respostas
  FROM public.service_rating_criteria src
  JOIN public.service_ratings sr ON sr.id = src.rating_id
  JOIN public.service_orders so ON so.id = sr.service_order_id
  WHERE so.company_id = public.get_user_company_id(auth.uid())
    AND sr.rated_at IS NOT NULL
    AND sr.rated_at::date >= p_start
    AND sr.rated_at::date <= p_end
  GROUP BY src.label_snapshot
  ORDER BY src.label_snapshot ASC
$function$;

GRANT EXECUTE ON FUNCTION public.get_nps_criteria_averages(date, date)
  TO authenticated, service_role;

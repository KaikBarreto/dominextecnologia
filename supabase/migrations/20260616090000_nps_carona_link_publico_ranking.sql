-- =============================================================================
-- NPS na carona do link público de OS + ranking por técnico (Onda 1)
-- Plano: docs/planos/2026-06-16-nps-carona-link-publico-ranking.md
--
-- POR QUÊ: a pesquisa de satisfação (service_ratings) hoje só é coletável via
-- /avaliacao/:token. Esta migration faz a avaliação "pegar carona" no link
-- público de acompanhamento (/os-tecnico/:id?modo=cliente), disponibilizando-a
-- automaticamente quando a OS conclui, coletando pelo ID da OS (sem token na UI),
-- e expõe agregados (ranking de técnico + detratores em aberto) para o painel.
--
-- service_ratings NÃO tem company_id → todo isolamento multi-tenant é amarrado
-- SEMPRE pela OS (service_orders.company_id). Testado mentalmente com 2 tenants.
--
-- COMPATIBILIDADE: /avaliacao/:token continua funcionando. O frontend daquele
-- fluxo grava via .update().eq('token', token) como anon — por isso a policy de
-- UPDATE anon é mantida, porém ESTREITADA para só linhas ainda não respondidas
-- (rated_at IS NULL), fechando o buraco anterior em que qualquer anon podia
-- sobrescrever QUALQUER avaliação (qual era apenas `token IS NOT NULL`).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) TRIGGER: ao concluir a OS, garante a linha de service_ratings (rated_at NULL)
--    gen_random_bytes vive em schema `extensions` → SET search_path inclui ele.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_service_rating_on_conclude()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Só age quando o status PASSA para 'concluida' (transição), não em toda update.
  IF NEW.status = 'concluida'
     AND (OLD.status IS DISTINCT FROM NEW.status)
  THEN
    INSERT INTO public.service_ratings (service_order_id, token)
    VALUES (NEW.id, encode(gen_random_bytes(32), 'hex'))
    ON CONFLICT (service_order_id) DO NOTHING;  -- idempotente: UNIQUE(service_order_id)
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_service_rating_on_conclude ON public.service_orders;
CREATE TRIGGER trg_ensure_service_rating_on_conclude
  AFTER UPDATE OF status ON public.service_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_service_rating_on_conclude();

COMMENT ON FUNCTION public.ensure_service_rating_on_conclude() IS
  'AFTER UPDATE em service_orders: ao status virar concluida, cria a linha de service_ratings (token gerado, rated_at NULL). Idempotente via ON CONFLICT(service_order_id).';


-- -----------------------------------------------------------------------------
-- 1b) BACKFILL: OSs já concluídas que ainda não têm linha de avaliação.
--     Sem isso, OSs concluídas antes da trigger nunca ficariam avaliáveis.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.service_ratings (service_order_id, token)
  SELECT so.id, encode(gen_random_bytes(32), 'hex')
  FROM public.service_orders so
  WHERE so.status = 'concluida'
    AND NOT EXISTS (
      SELECT 1 FROM public.service_ratings sr WHERE sr.service_order_id = so.id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Backfill service_ratings: % linhas criadas para OSs já concluídas', v_count;
END $$;


-- -----------------------------------------------------------------------------
-- 2) get_public_os: anexar estado da avaliação SEM vazar o token.
--    Reescreve a RPC inteira (idêntica à anterior), trocando apenas o campo
--    'rating': agora devolve subset sem token + flags is_concluded/already_rated.
-- -----------------------------------------------------------------------------
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

    'company_settings', (
      SELECT to_jsonb(cs) FROM company_settings cs WHERE cs.company_id = v_so.company_id
    ),

    'contract', (
      SELECT jsonb_build_object('id', ct.id, 'name', ct.name)
      FROM contracts ct WHERE ct.id = v_so.contract_id
    )
  );

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
$$;

GRANT EXECUTE ON FUNCTION public.get_public_os(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_os(uuid) IS
  'Payload completo da OS pública (link /os-tecnico/:id?modo=cliente). SECURITY DEFINER. O campo rating agora traz subset SEM token + flags is_concluded/already_rated pro fluxo de avaliação na carona.';


-- -----------------------------------------------------------------------------
-- 3) submit_public_os_rating: coleta a avaliação pelo ID da OS (1 vez por OS).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_public_os_rating(
  p_os_id            uuid,
  p_nps              integer,
  p_quality          integer,
  p_punctuality      integer,
  p_professionalism  integer,
  p_comment          text,
  p_name             text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_so      service_orders%ROWTYPE;
  v_rating  service_ratings%ROWTYPE;
BEGIN
  SELECT * INTO v_so FROM service_orders WHERE id = p_os_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OS não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_so.status <> 'concluida' THEN
    RAISE EXCEPTION 'A avaliação só fica disponível após a conclusão do serviço.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Validação dos ranges (espelha os CHECK da tabela, com mensagem amigável).
  IF p_nps IS NULL OR p_nps < 0 OR p_nps > 10 THEN
    RAISE EXCEPTION 'A nota de recomendação deve estar entre 0 e 10.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (p_quality IS NOT NULL AND (p_quality < 1 OR p_quality > 5))
     OR (p_punctuality IS NOT NULL AND (p_punctuality < 1 OR p_punctuality > 5))
     OR (p_professionalism IS NOT NULL AND (p_professionalism < 1 OR p_professionalism > 5))
  THEN
    RAISE EXCEPTION 'As notas por categoria devem estar entre 1 e 5.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Garante a linha (caso a trigger não tenha rodado por algum motivo).
  INSERT INTO public.service_ratings (service_order_id, token)
  VALUES (p_os_id, encode(gen_random_bytes(32), 'hex'))
  ON CONFLICT (service_order_id) DO NOTHING;

  -- Trava: 1 resposta por OS, sem reescrever. Pega lock da linha.
  SELECT * INTO v_rating FROM service_ratings
  WHERE service_order_id = p_os_id FOR UPDATE;

  IF v_rating.rated_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta avaliação já foi enviada. Obrigado!'
      USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE service_ratings SET
    nps_score             = p_nps,
    quality_rating        = p_quality,
    punctuality_rating    = p_punctuality,
    professionalism_rating= p_professionalism,
    comment               = NULLIF(btrim(p_comment), ''),
    rated_by_name         = NULLIF(btrim(p_name), ''),
    rated_at              = now()
  WHERE service_order_id = p_os_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_public_os_rating(uuid, integer, integer, integer, integer, text, text)
  TO anon, authenticated;

COMMENT ON FUNCTION public.submit_public_os_rating(uuid, integer, integer, integer, integer, text, text) IS
  'Coleta a avaliação NPS pelo ID da OS (link público na carona). Valida OS concluída, recusa 2ª resposta (unique_violation), grava + rated_at=now(). SECURITY DEFINER.';


-- -----------------------------------------------------------------------------
-- 4) get_nps_technician_ranking: ranking por técnico, escopado ao tenant do
--    auth.uid() PELA OS. Técnico = technician_id senão 1º assignee (created_at).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_nps_technician_ranking(
  p_start date,
  p_end   date
)
RETURNS TABLE (
  user_id        uuid,
  full_name      text,
  avatar_url     text,
  nps_medio      numeric,
  media_estrelas numeric,
  respostas      bigint,
  os_concluidas  bigint,
  taxa_resposta  numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := get_user_company_id(auth.uid());
  IF v_company_id IS NULL THEN
    RETURN;  -- sem empresa = nada
  END IF;

  RETURN QUERY
  WITH concluidas AS (
    SELECT
      so.id,
      COALESCE(
        so.technician_id,
        (SELECT a.user_id FROM service_order_assignees a
         WHERE a.service_order_id = so.id ORDER BY a.created_at ASC LIMIT 1)
      ) AS tech_id
    FROM service_orders so
    WHERE so.company_id = v_company_id
      AND so.status = 'concluida'
      AND COALESCE(so.completed_at, so.updated_at)::date >= p_start
      AND COALESCE(so.completed_at, so.updated_at)::date <= p_end
  ),
  respostas_periodo AS (
    SELECT
      COALESCE(
        so.technician_id,
        (SELECT a.user_id FROM service_order_assignees a
         WHERE a.service_order_id = so.id ORDER BY a.created_at ASC LIMIT 1)
      ) AS tech_id,
      sr.nps_score,
      sr.quality_rating,
      sr.punctuality_rating,
      sr.professionalism_rating
    FROM service_ratings sr
    JOIN service_orders so ON so.id = sr.service_order_id
    WHERE so.company_id = v_company_id
      AND sr.rated_at IS NOT NULL
      AND sr.rated_at::date >= p_start
      AND sr.rated_at::date <= p_end
  )
  SELECT
    t.tech_id,
    p.full_name,
    p.avatar_url,
    ROUND(AVG(r.nps_score)::numeric, 1)                      AS nps_medio,
    ROUND(AVG(
      (COALESCE(r.quality_rating,0) + COALESCE(r.punctuality_rating,0)
       + COALESCE(r.professionalism_rating,0))::numeric
      / NULLIF(
          (CASE WHEN r.quality_rating IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN r.punctuality_rating IS NOT NULL THEN 1 ELSE 0 END
           + CASE WHEN r.professionalism_rating IS NOT NULL THEN 1 ELSE 0 END), 0)
    )::numeric, 2)                                           AS media_estrelas,
    COUNT(r.nps_score)                                       AS respostas,
    (SELECT COUNT(*) FROM concluidas c WHERE c.tech_id = t.tech_id) AS os_concluidas,
    ROUND(
      COUNT(r.nps_score)::numeric
      / NULLIF((SELECT COUNT(*) FROM concluidas c WHERE c.tech_id = t.tech_id), 0)
    , 3)                                                     AS taxa_resposta
  FROM (SELECT DISTINCT tech_id FROM concluidas WHERE tech_id IS NOT NULL) t
  LEFT JOIN respostas_periodo r ON r.tech_id = t.tech_id
  LEFT JOIN profiles p ON p.user_id = t.tech_id
  GROUP BY t.tech_id, p.full_name, p.avatar_url
  ORDER BY nps_medio DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nps_technician_ranking(date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_nps_technician_ranking(date, date) IS
  'Ranking de NPS por técnico no período, escopado ao tenant do auth.uid() PELA OS. Técnico = technician_id senão 1º assignee. respostas = avaliações respondidas (rated_at) no período; os_concluidas = OSs concluídas (completed_at) no período.';


-- -----------------------------------------------------------------------------
-- 5) get_nps_open_detractors: detratores (nps<=6) no período, escopado ao tenant.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_nps_open_detractors(
  p_start date,
  p_end   date
)
RETURNS TABLE (
  os_id          uuid,
  order_number   integer,
  nps_score      integer,
  comment        text,
  rated_at       timestamptz,
  rated_by_name  text,
  customer_name  text,
  technician_id  uuid,
  technician_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := get_user_company_id(auth.uid());
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    so.id,
    so.order_number,
    sr.nps_score,
    sr.comment,
    sr.rated_at,
    sr.rated_by_name,
    cu.name AS customer_name,
    tech.tech_id,
    (SELECT p.full_name FROM profiles p WHERE p.user_id = tech.tech_id) AS technician_name
  FROM service_ratings sr
  JOIN service_orders so ON so.id = sr.service_order_id
  LEFT JOIN customers cu ON cu.id = so.customer_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      so.technician_id,
      (SELECT a.user_id FROM service_order_assignees a
       WHERE a.service_order_id = so.id ORDER BY a.created_at ASC LIMIT 1)
    ) AS tech_id
  ) tech
  WHERE so.company_id = v_company_id
    AND sr.rated_at IS NOT NULL
    AND sr.nps_score IS NOT NULL
    AND sr.nps_score <= 6
    AND sr.rated_at::date >= p_start
    AND sr.rated_at::date <= p_end
  ORDER BY sr.rated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nps_open_detractors(date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_nps_open_detractors(date, date) IS
  'Detratores (nps_score<=6) respondidos no período, escopado ao tenant do auth.uid() PELA OS. Para o card "precisam de retorno" no painel de NPS.';


-- -----------------------------------------------------------------------------
-- 6) RLS: fechar o UPDATE anon largo (qual era `token IS NOT NULL` = qualquer
--    anon sobrescrevia QUALQUER avaliação) e o INSERT anon largo.
--    Mantém /avaliacao/:token funcionando: o frontend daquele fluxo grava via
--    .update().eq('token', token) como anon. Reescrevemos a policy para permitir
--    UPDATE anon SOMENTE em linhas ainda NÃO respondidas (rated_at IS NULL) —
--    1ª resposta passa, sobrescrita é negada. Coleta pelo ID da OS é exclusiva
--    da RPC submit_public_os_rating (SECURITY DEFINER, ignora RLS).
--    Leitura pública continua via header-token (policies x-rating-token mantidas)
--    e via get_public_os (SECURITY DEFINER). A authenticated tenant-scoped fica.
-- -----------------------------------------------------------------------------

-- Drop das policies largas/perigosas.
DROP POLICY IF EXISTS "Public update rating by token" ON public.service_ratings;
DROP POLICY IF EXISTS "Public submit rating by token" ON public.service_ratings;

-- Reabre UPDATE anon de forma ESTREITA: só linha ainda não respondida.
-- (USING avalia a linha ANTES do update; rated_at IS NULL impede sobrescrita.)
CREATE POLICY "Anon update unrated rating"
  ON public.service_ratings
  FOR UPDATE
  TO anon
  USING (rated_at IS NULL)
  WITH CHECK (true);

-- Não recriamos INSERT anon: a criação da linha é responsabilidade da trigger
-- (SECURITY DEFINER) ou da RPC submit_public_os_rating (SECURITY DEFINER).

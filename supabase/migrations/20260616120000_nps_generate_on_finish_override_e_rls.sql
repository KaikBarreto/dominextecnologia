-- =============================================================================
-- NPS: padrão da empresa + override por OS + novo seed da pergunta + RLS
-- -----------------------------------------------------------------------------
-- Por quê:
--   1) A empresa define um PADRÃO ("gerar pesquisa ao finalizar OS").
--   2) Cada OS pode SOBRESCREVER esse padrão (toggle por OS).
--   3) Novo texto seed da pergunta de NPS (foco em satisfação, não recomendação).
--   4) Reconciliar a RLS de nps_settings: leitura por authenticated da empresa,
--      escrita só com gestão do sistema (can_manage_system honra curinga '*').
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY IF EXISTS.
-- =============================================================================

-- 1) Novo texto seed da pergunta -------------------------------------------------
-- 1a) DEFAULT da coluna question
ALTER TABLE public.nps_settings
  ALTER COLUMN question
  SET DEFAULT 'De 0 a 10, o quão satisfeito(a) você ficou com o nosso serviço?';

-- 1b) UPDATE só nas linhas que ainda têm o texto antigo EXATO (não tocar quem
--     personalizou). Logamos a quantidade afetada pra auditoria.
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.nps_settings
     SET question   = 'De 0 a 10, o quão satisfeito(a) você ficou com o nosso serviço?',
         updated_at = now()
   WHERE question = 'De 0 a 10, qual a chance de recomendar nosso serviço?';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'nps_settings: % linha(s) com pergunta antiga atualizadas para o novo seed.', v_count;
END $$;

-- 2) Padrão da empresa: gerar pesquisa ao finalizar ----------------------------
ALTER TABLE public.nps_settings
  ADD COLUMN IF NOT EXISTS generate_on_finish boolean NOT NULL DEFAULT true;

-- 3) Override por OS (NULL = herda o padrão da empresa) -------------------------
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS generate_nps_survey boolean;

COMMENT ON COLUMN public.service_orders.generate_nps_survey IS
  'Override por OS do padrão NPS da empresa. NULL = herda nps_settings.generate_on_finish (default true).';

-- 4) Trigger respeita a decisão -------------------------------------------------
-- Só cria a linha de service_ratings se a pesquisa estiver habilitada para a OS.
-- Precedência: override por OS > padrão da empresa > true.
CREATE OR REPLACE FUNCTION public.ensure_service_rating_on_conclude()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_should_generate boolean;
BEGIN
  -- Só age quando o status PASSA para 'concluida' (transição), não em toda update.
  IF NEW.status = 'concluida'
     AND (OLD.status IS DISTINCT FROM NEW.status)
  THEN
    v_should_generate := COALESCE(
      NEW.generate_nps_survey,
      (SELECT generate_on_finish FROM public.nps_settings WHERE company_id = NEW.company_id),
      true
    );

    IF v_should_generate THEN
      INSERT INTO public.service_ratings (service_order_id, token)
      VALUES (NEW.id, encode(gen_random_bytes(32), 'hex'))
      ON CONFLICT (service_order_id) DO NOTHING;  -- idempotente: UNIQUE(service_order_id)
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 5) get_public_os: survey_enabled + novo seed + generate_on_finish no nps_config
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

    -- survey_enabled: a pesquisa só deve aparecer pra essa OS se a linha de
    -- service_ratings existe (a linha só é gerada quando habilitada no trigger).
    'survey_enabled', EXISTS (
      SELECT 1 FROM service_ratings sr2 WHERE sr2.service_order_id = p_os_id
    ),

    -- nps_config: pergunta + estrelas obrigatorias + padrão da empresa DONA da OS.
    -- Defaults aplicados quando a empresa nao tem linha em nps_settings.
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
$function$;

-- 6) Reconciliar RLS de nps_settings -------------------------------------------
-- Separar leitura (qualquer authenticated da empresa) de escrita (só gestão do
-- sistema; can_manage_system honra o curinga '*'). Sem acesso anon.
ALTER TABLE public.nps_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own nps_settings" ON public.nps_settings;
DROP POLICY IF EXISTS "nps_settings_select_own_company" ON public.nps_settings;
DROP POLICY IF EXISTS "nps_settings_insert_manage_system" ON public.nps_settings;
DROP POLICY IF EXISTS "nps_settings_update_manage_system" ON public.nps_settings;

CREATE POLICY "nps_settings_select_own_company"
  ON public.nps_settings FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "nps_settings_insert_manage_system"
  ON public.nps_settings FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND can_manage_system(auth.uid())
  );

CREATE POLICY "nps_settings_update_manage_system"
  ON public.nps_settings FOR UPDATE TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND can_manage_system(auth.uid())
  )
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND can_manage_system(auth.uid())
  );

-- service_role full access mantida (policy service_role_full_access_nps_settings já existe).

GRANT EXECUTE ON FUNCTION public.get_public_os(uuid) TO anon, authenticated, service_role;

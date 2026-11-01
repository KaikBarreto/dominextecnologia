-- Avisos da plataforma e NPS SaaS da Dominex.
--
-- Esta migration e deliberadamente aditiva: versiona o backend dos avisos que
-- o frontend ja consumia e cria a pesquisa NPS da base sem reutilizar o NPS de
-- ordens de servico (service_ratings/nps_settings). O isolamento e feito no
-- banco; filtros do cliente sao apenas uma segunda camada de UX.

-- ---------------------------------------------------------------------------
-- 1. Avisos publicados pelo painel master
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  variant text NOT NULL DEFAULT 'warning',
  scope text NOT NULL DEFAULT 'dashboard',
  is_dismissible boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  target_audience text NOT NULL DEFAULT 'specific_companies',
  target_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  action_label text,
  action_url text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_notices_title_not_blank
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT admin_notices_message_not_blank
    CHECK (char_length(btrim(message)) BETWEEN 1 AND 600),
  CONSTRAINT admin_notices_variant_valid
    CHECK (variant IN ('info', 'warning', 'success', 'destructive', 'neutral')),
  CONSTRAINT admin_notices_scope_valid
    CHECK (scope IN ('dashboard', 'global')),
  CONSTRAINT admin_notices_audience_valid
    CHECK (target_audience IN ('all', 'specific_companies', 'specific_users')),
  CONSTRAINT admin_notices_period_valid
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT admin_notices_action_valid
    CHECK (
      (action_url IS NULL OR (
        action_url ~* '^https?://[^[:space:]]+$'
        AND char_length(action_url) <= 2048
      ))
      AND (action_label IS NULL OR char_length(btrim(action_label)) BETWEEN 1 AND 40)
    ),
  CONSTRAINT admin_notices_specific_target_not_empty
    CHECK (target_audience = 'all' OR cardinality(target_ids) > 0)
);

-- A tabela pode existir no remoto por ter sido criada antes de sua migration
-- ser versionada. Nesse caso, preservamos as linhas antigas e passamos a
-- aplicar os mesmos checks a toda escrita nova (`NOT VALID` evita que uma
-- linha historica invalida derrube o deploy de reconciliacao).
-- A reconciliacao assume apenas o shape que o frontend ja usa em producao;
-- ambiente sem a tabela recebe o shape completo pelo CREATE acima.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.admin_notices'::regclass AND conname = 'admin_notices_title_not_blank') THEN
    ALTER TABLE public.admin_notices ADD CONSTRAINT admin_notices_title_not_blank CHECK (char_length(btrim(title)) BETWEEN 1 AND 120) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.admin_notices'::regclass AND conname = 'admin_notices_message_not_blank') THEN
    ALTER TABLE public.admin_notices ADD CONSTRAINT admin_notices_message_not_blank CHECK (char_length(btrim(message)) BETWEEN 1 AND 600) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.admin_notices'::regclass AND conname = 'admin_notices_variant_valid') THEN
    ALTER TABLE public.admin_notices ADD CONSTRAINT admin_notices_variant_valid CHECK (variant IN ('info', 'warning', 'success', 'destructive', 'neutral')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.admin_notices'::regclass AND conname = 'admin_notices_scope_valid') THEN
    ALTER TABLE public.admin_notices ADD CONSTRAINT admin_notices_scope_valid CHECK (scope IN ('dashboard', 'global')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.admin_notices'::regclass AND conname = 'admin_notices_audience_valid') THEN
    ALTER TABLE public.admin_notices ADD CONSTRAINT admin_notices_audience_valid CHECK (target_audience IN ('all', 'specific_companies', 'specific_users')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.admin_notices'::regclass AND conname = 'admin_notices_period_valid') THEN
    ALTER TABLE public.admin_notices ADD CONSTRAINT admin_notices_period_valid CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.admin_notices'::regclass AND conname = 'admin_notices_action_valid') THEN
    ALTER TABLE public.admin_notices ADD CONSTRAINT admin_notices_action_valid CHECK (
      (action_url IS NULL OR (action_url ~* '^https?://[^[:space:]]+$' AND char_length(action_url) <= 2048))
      AND (action_label IS NULL OR char_length(btrim(action_label)) BETWEEN 1 AND 40)
    ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.admin_notices'::regclass AND conname = 'admin_notices_specific_target_not_empty') THEN
    ALTER TABLE public.admin_notices ADD CONSTRAINT admin_notices_specific_target_not_empty CHECK (target_audience = 'all' OR cardinality(target_ids) > 0) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_admin_notices_live
  ON public.admin_notices (is_active, starts_at, ends_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notices_target_ids
  ON public.admin_notices USING gin (target_ids);

DROP TRIGGER IF EXISTS set_admin_notices_updated_at ON public.admin_notices;
CREATE TRIGGER set_admin_notices_updated_at
  BEFORE UPDATE ON public.admin_notices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.admin_notice_dismissals (
  notice_id uuid NOT NULL REFERENCES public.admin_notices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_notice_dismissals_user
  ON public.admin_notice_dismissals (user_id, dismissed_at DESC);

ALTER TABLE public.admin_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notice_dismissals ENABLE ROW LEVEL SECURITY;

-- Policies RLS sao permissivas entre si. Como esta superficie pode existir no
-- remoto sem migration, removemos policies locais desconhecidas antes de
-- instalar a matriz canonica abaixo e evitar um bypass legado.
DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('admin_notices', 'admin_notice_dismissals')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', v_policy.policyname, v_policy.tablename);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS admin_notices_manage_super_admin ON public.admin_notices;
CREATE POLICY admin_notices_manage_super_admin
  ON public.admin_notices
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_super_admin(auth.uid())));

DROP POLICY IF EXISTS admin_notices_select_tenant ON public.admin_notices;
CREATE POLICY admin_notices_select_tenant
  ON public.admin_notices
  FOR SELECT
  TO authenticated
  USING (
    is_active
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
    AND (
      (
        target_audience = 'specific_users'
        AND (SELECT auth.uid()) = ANY(target_ids)
      )
      OR (
        (SELECT public.get_user_company_id(auth.uid())) IS NOT NULL
        AND (
          target_audience = 'all'
          OR (
            target_audience = 'specific_companies'
            AND (SELECT public.get_user_company_id(auth.uid())) = ANY(target_ids)
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS admin_notice_dismissals_select_super_admin ON public.admin_notice_dismissals;
CREATE POLICY admin_notice_dismissals_select_super_admin
  ON public.admin_notice_dismissals
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid())));

DROP POLICY IF EXISTS admin_notice_dismissals_select_own ON public.admin_notice_dismissals;
CREATE POLICY admin_notice_dismissals_select_own
  ON public.admin_notice_dismissals
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS admin_notice_dismissals_insert_own ON public.admin_notice_dismissals;
CREATE POLICY admin_notice_dismissals_insert_own
  ON public.admin_notice_dismissals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.admin_notices AS n
      WHERE n.id = admin_notice_dismissals.notice_id
    )
  );

DROP POLICY IF EXISTS admin_notice_dismissals_update_own ON public.admin_notice_dismissals;
CREATE POLICY admin_notice_dismissals_update_own
  ON public.admin_notice_dismissals
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.admin_notices AS n
      WHERE n.id = admin_notice_dismissals.notice_id
    )
  );

REVOKE ALL ON TABLE public.admin_notices FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.admin_notice_dismissals FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_notices TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_notice_dismissals TO authenticated;

COMMENT ON TABLE public.admin_notices IS
  'Avisos da Dominex exibidos dentro do app dos tenants. RLS recorta vigencia e publico; escrita somente super_admin.';
COMMENT ON TABLE public.admin_notice_dismissals IS
  'Dispensa individual de aviso. Uma linha por aviso e usuario; editar o aviso no admin faz o frontend reapresenta-lo.';

-- ---------------------------------------------------------------------------
-- 2. Pesquisas NPS da base Dominex (separadas do NPS de ordens de servico)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_nps_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  enjoyment_question text NOT NULL DEFAULT 'Você está gostando de usar a Dominex?',
  recommendation_question text NOT NULL DEFAULT 'De 0 a 10, o quanto você recomendaria a Dominex?',
  feedback_prompt text DEFAULT 'Quer contar o que podemos melhorar?',
  "trigger" text NOT NULL DEFAULT 'login',
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  target_audience text NOT NULL DEFAULT 'all',
  target_company_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  audience_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  google_review_url text,
  google_review_min_score smallint DEFAULT 9,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_nps_surveys_title_not_blank
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT admin_nps_surveys_description_length
    CHECK (description IS NULL OR char_length(description) <= 600),
  CONSTRAINT admin_nps_surveys_enjoyment_question_not_blank
    CHECK (char_length(btrim(enjoyment_question)) BETWEEN 1 AND 240),
  CONSTRAINT admin_nps_surveys_recommendation_question_not_blank
    CHECK (char_length(btrim(recommendation_question)) BETWEEN 1 AND 240),
  CONSTRAINT admin_nps_surveys_feedback_prompt_length
    CHECK (feedback_prompt IS NULL OR char_length(btrim(feedback_prompt)) BETWEEN 1 AND 240),
  CONSTRAINT admin_nps_surveys_trigger_valid
    CHECK ("trigger" = 'login'),
  CONSTRAINT admin_nps_surveys_period_valid
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CONSTRAINT admin_nps_surveys_audience_valid
    CHECK (target_audience IN ('all', 'specific_companies')),
  CONSTRAINT admin_nps_surveys_specific_target_not_empty
    CHECK (target_audience = 'all' OR cardinality(target_company_ids) > 0),
  CONSTRAINT admin_nps_surveys_snapshot_object
    CHECK (jsonb_typeof(audience_snapshot) = 'object'),
  CONSTRAINT admin_nps_surveys_google_url_valid
    CHECK (
      google_review_url IS NULL
      OR (
        google_review_url ~* '^https?://[^[:space:]]+$'
        AND char_length(google_review_url) <= 2048
      )
    ),
  CONSTRAINT admin_nps_surveys_google_score_valid
    CHECK (google_review_min_score IS NULL OR google_review_min_score BETWEEN 0 AND 10)
);

CREATE INDEX IF NOT EXISTS idx_admin_nps_surveys_pending
  ON public.admin_nps_surveys (is_active, starts_at, ends_at, created_at, id);
CREATE INDEX IF NOT EXISTS idx_admin_nps_surveys_target_companies
  ON public.admin_nps_surveys USING gin (target_company_ids);

DROP TRIGGER IF EXISTS set_admin_nps_surveys_updated_at ON public.admin_nps_surveys;
CREATE TRIGGER set_admin_nps_surveys_updated_at
  BEFORE UPDATE ON public.admin_nps_surveys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.admin_nps_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.admin_nps_surveys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  is_enjoying boolean NOT NULL,
  score smallint NOT NULL,
  feedback text,
  responded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_nps_responses_score_valid CHECK (score BETWEEN 0 AND 10),
  CONSTRAINT admin_nps_responses_feedback_length CHECK (feedback IS NULL OR char_length(feedback) <= 2000),
  CONSTRAINT admin_nps_responses_survey_user_unique UNIQUE (survey_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_nps_responses_survey
  ON public.admin_nps_responses (survey_id, responded_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_nps_responses_company
  ON public.admin_nps_responses (company_id, responded_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_nps_responses_user
  ON public.admin_nps_responses (user_id, responded_at DESC);

ALTER TABLE public.admin_nps_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_nps_responses ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('admin_nps_surveys', 'admin_nps_responses')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', v_policy.policyname, v_policy.tablename);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS admin_nps_surveys_manage_super_admin ON public.admin_nps_surveys;
CREATE POLICY admin_nps_surveys_manage_super_admin
  ON public.admin_nps_surveys
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid())))
  WITH CHECK ((SELECT public.is_super_admin(auth.uid())));

DROP POLICY IF EXISTS admin_nps_responses_select_super_admin ON public.admin_nps_responses;
CREATE POLICY admin_nps_responses_select_super_admin
  ON public.admin_nps_responses
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid())));

DROP POLICY IF EXISTS admin_nps_responses_delete_super_admin ON public.admin_nps_responses;
CREATE POLICY admin_nps_responses_delete_super_admin
  ON public.admin_nps_responses
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid())));

REVOKE ALL ON TABLE public.admin_nps_surveys FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.admin_nps_responses FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_nps_surveys TO authenticated;
GRANT SELECT, DELETE ON TABLE public.admin_nps_responses TO authenticated;

COMMENT ON TABLE public.admin_nps_surveys IS
  'Campanhas de satisfacao/NPS da base Dominex. Filtros do admin materializam target_company_ids para a audiencia ser auditavel.';
COMMENT ON TABLE public.admin_nps_responses IS
  'Uma resposta por usuario e pesquisa. user_id e company_id sao derivados pelas RPCs, nunca aceitos do cliente.';

-- ---------------------------------------------------------------------------
-- 3. Fronteira segura do tenant: somente RPCs, sem SELECT direto nas pesquisas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_pending_admin_nps()
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  enjoyment_question text,
  recommendation_question text,
  feedback_prompt text,
  google_review_url text,
  google_review_min_score smallint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Usuarios do painel master nao participam da pesquisa dos tenants.
  IF COALESCE(public.is_admin_user(v_user_id), false) THEN
    RETURN;
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.title,
    s.description,
    s.enjoyment_question,
    s.recommendation_question,
    s.feedback_prompt,
    s.google_review_url,
    s.google_review_min_score
  FROM public.admin_nps_surveys AS s
  WHERE s.is_active
    AND s."trigger" = 'login'
    AND (s.starts_at IS NULL OR s.starts_at <= now())
    AND (s.ends_at IS NULL OR s.ends_at >= now())
    AND (
      s.target_audience = 'all'
      OR (
        s.target_audience = 'specific_companies'
        AND v_company_id = ANY(s.target_company_ids)
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_nps_responses AS r
      WHERE r.survey_id = s.id
        AND r.user_id = v_user_id
    )
  ORDER BY s.created_at ASC, s.id ASC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_admin_nps(
  p_survey_id uuid,
  p_is_enjoying boolean,
  p_score smallint,
  p_feedback text DEFAULT NULL
)
RETURNS TABLE (
  response_id uuid,
  survey_id uuid,
  google_review_url text,
  should_invite_google boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_survey public.admin_nps_surveys%ROWTYPE;
  v_response_id uuid;
  v_persisted_score smallint;
  v_feedback text := NULLIF(btrim(p_feedback), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Entre novamente para responder esta pesquisa.';
  END IF;

  IF COALESCE(public.is_admin_user(v_user_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Esta pesquisa é destinada aos usuários clientes da Dominex.';
  END IF;

  IF p_survey_id IS NULL OR p_is_enjoying IS NULL OR p_score IS NULL OR p_score NOT BETWEEN 0 AND 10 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Responda as perguntas antes de enviar.';
  END IF;

  IF v_feedback IS NOT NULL AND char_length(v_feedback) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'O comentário deve ter no máximo 2.000 caracteres.';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Não foi possível identificar sua empresa. Atualize a página e tente novamente.';
  END IF;

  SELECT s.*
    INTO v_survey
  FROM public.admin_nps_surveys AS s
  WHERE s.id = p_survey_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Esta pesquisa não está mais disponível.';
  END IF;

  -- Se a resposta ja foi persistida e o client perdeu a confirmacao, o retry
  -- continua valido mesmo que o admin tenha pausado/encerrado a campanha nesse
  -- intervalo. A primeira resposta segue imutavel e e a usada no convite.
  SELECT r.id, r.score
    INTO v_response_id, v_persisted_score
  FROM public.admin_nps_responses AS r
  WHERE r.survey_id = v_survey.id
    AND r.user_id = v_user_id;

  IF v_response_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      v_response_id,
      v_survey.id,
      v_survey.google_review_url,
      (
        COALESCE(v_survey.google_review_url ~* '^https?://[^[:space:]]+$', false)
        AND (
          v_survey.google_review_min_score IS NULL
          OR v_persisted_score >= v_survey.google_review_min_score
        )
      );
    RETURN;
  END IF;

  IF v_survey.is_active IS DISTINCT FROM true
    OR v_survey."trigger" IS DISTINCT FROM 'login'
    OR (v_survey.starts_at IS NOT NULL AND v_survey.starts_at > now())
    OR (v_survey.ends_at IS NOT NULL AND v_survey.ends_at < now())
    OR (
      v_survey.target_audience IS DISTINCT FROM 'all'
      AND NOT (
        v_survey.target_audience = 'specific_companies'
        AND COALESCE(v_company_id = ANY(v_survey.target_company_ids), false)
      )
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Esta pesquisa não está mais disponível.';
  END IF;

  -- Retry seguro: a primeira resposta vence. Repetir a mesma requisicao devolve
  -- a linha persistida, sem criar duplicata nem alterar a resposta anterior.
  INSERT INTO public.admin_nps_responses (
    survey_id,
    user_id,
    company_id,
    is_enjoying,
    score,
    feedback
  ) VALUES (
    v_survey.id,
    v_user_id,
    v_company_id,
    p_is_enjoying,
    p_score,
    v_feedback
  )
  ON CONFLICT ON CONSTRAINT admin_nps_responses_survey_user_unique DO NOTHING
  RETURNING id, score INTO v_response_id, v_persisted_score;

  IF v_response_id IS NULL THEN
    SELECT r.id, r.score
      INTO v_response_id, v_persisted_score
    FROM public.admin_nps_responses AS r
    WHERE r.survey_id = v_survey.id
      AND r.user_id = v_user_id;
  END IF;

  RETURN QUERY
  SELECT
    v_response_id,
    v_survey.id,
    v_survey.google_review_url,
    (
      COALESCE(v_survey.google_review_url ~* '^https?://[^[:space:]]+$', false)
      AND (
        v_survey.google_review_min_score IS NULL
        OR v_persisted_score >= v_survey.google_review_min_score
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_pending_admin_nps() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_admin_nps(uuid, boolean, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_admin_nps() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_admin_nps(uuid, boolean, smallint, text) TO authenticated;

COMMENT ON FUNCTION public.get_pending_admin_nps() IS
  'Retorna a pesquisa ativa mais antiga elegivel para o usuario logado. Falha fechada para anon, admin ou perfil sem empresa.';
COMMENT ON FUNCTION public.submit_admin_nps(uuid, boolean, smallint, text) IS
  'Persiste NPS da Dominex com empresa/usuario derivados no servidor e retry idempotente. Retorna convite Google apenas quando a nota passa a regra.';

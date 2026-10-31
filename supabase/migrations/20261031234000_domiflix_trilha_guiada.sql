-- DomiFlix v2: trilha guiada, progresso por empresa, legendas, materiais e lembretes.
-- Migração aditiva: temporadas e contratos legados permanecem disponíveis para rollback.

BEGIN;

CREATE OR REPLACE FUNCTION public._domiflix_assert_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN; END IF;
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.domiflix_learning_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  cover_url text,
  is_onboarding boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  intro_gate_enabled_at timestamptz,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.domiflix_learning_paths(slug, title, description, cover_url, is_onboarding, order_index)
VALUES ('tutoriais-do-sistema', 'Tutoriais do sistema', 'Aprenda a Dominex na ordem certa, da base às funções do seu plano.', '/images/blog/covers/gestao-produtividade-equipes-de-campo.jpg', true, 0)
ON CONFLICT (slug) DO UPDATE SET
  is_onboarding = true,
  is_active = true,
  cover_url = COALESCE(public.domiflix_learning_paths.cover_url, EXCLUDED.cover_url);

UPDATE public.domiflix_learning_paths SET intro_gate_enabled_at = COALESCE(intro_gate_enabled_at, now()) WHERE slug = 'tutoriais-do-sistema';

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS learning_onboarding_started_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_learning_onboarding_started_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.subscription_status IN ('testing', 'trial', 'active')
     AND NEW.learning_onboarding_started_at IS NULL
     AND (TG_OP = 'INSERT' OR OLD.subscription_status IS DISTINCT FROM NEW.subscription_status) THEN
    NEW.learning_onboarding_started_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_learning_onboarding_start ON public.companies;
CREATE TRIGGER trg_companies_learning_onboarding_start
BEFORE INSERT OR UPDATE OF subscription_status ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.set_learning_onboarding_started_at();

UPDATE public.companies
   SET learning_onboarding_started_at = COALESCE(created_at, now())
 WHERE subscription_status IN ('testing', 'trial')
   AND learning_onboarding_started_at IS NULL;

ALTER TABLE public.domiflix_titles
  ADD COLUMN IF NOT EXISTS track_group text NOT NULL DEFAULT 'core'
    CHECK (track_group IN ('core', 'plan')),
  ADD COLUMN IF NOT EXISTS track_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS learning_path_id uuid REFERENCES public.domiflix_learning_paths(id) ON DELETE RESTRICT;

UPDATE public.domiflix_titles
   SET learning_path_id = (SELECT id FROM public.domiflix_learning_paths WHERE slug = 'tutoriais-do-sistema')
 WHERE learning_path_id IS NULL;

ALTER TABLE public.domiflix_titles ALTER COLUMN learning_path_id SET NOT NULL;

UPDATE public.domiflix_titles
   SET track_order = order_index
 WHERE track_order = 0;

ALTER TABLE public.domiflix_user_progress
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS last_progress_at timestamptz;

UPDATE public.domiflix_user_progress up
   SET company_id = p.company_id,
       last_progress_at = COALESCE(up.watched_at, now())
  FROM public.profiles p
 WHERE p.user_id = up.user_id
   AND up.company_id IS NULL
   AND p.company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_domiflix_progress_company_user
  ON public.domiflix_user_progress(company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_domiflix_progress_company_activity
  ON public.domiflix_user_progress(company_id, last_progress_at DESC);

CREATE TABLE IF NOT EXISTS public.domiflix_title_modules (
  title_id uuid NOT NULL REFERENCES public.domiflix_titles(id) ON DELETE CASCADE,
  module_code text NOT NULL REFERENCES public.subscription_modules(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (title_id, module_code)
);

-- O modelo novo ignora temporadas e ordena uma lista única. As temporadas e
-- vínculos antigos permanecem no banco para o frontend publicado continuar
-- reproduzindo durante a transição e para rollback sem reconstrução de dados.

WITH ordered AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY title_id
           ORDER BY order_index, created_at, id
         ) AS position
    FROM public.domiflix_episodes
)
UPDATE public.domiflix_episodes e
   SET order_index = ordered.position - 1
  FROM ordered
 WHERE e.id = ordered.id;

CREATE TABLE IF NOT EXISTS public.domiflix_user_track_modules (
  user_id uuid NOT NULL ,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title_id uuid NOT NULL REFERENCES public.domiflix_titles(id) ON DELETE CASCADE,
  selected boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id, title_id)
);

CREATE TABLE IF NOT EXISTS public.domiflix_episode_subtitles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.domiflix_episodes(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  label text NOT NULL,
  format text NOT NULL CHECK (format IN ('vtt', 'srt')),
  content text,
  storage_path text,
  is_default boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NULLIF(btrim(content), '') IS NOT NULL OR NULLIF(btrim(storage_path), '') IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_domiflix_subtitle_default
  ON public.domiflix_episode_subtitles(episode_id)
  WHERE is_default;

CREATE TABLE IF NOT EXISTS public.domiflix_episode_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.domiflix_episodes(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  resource_type text NOT NULL CHECK (resource_type IN ('file', 'link')),
  url text,
  storage_path text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (resource_type = 'link' AND NULLIF(btrim(url), '') IS NOT NULL)
    OR (resource_type = 'file' AND NULLIF(btrim(storage_path), '') IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.domiflix_user_onboarding (
  user_id uuid PRIMARY KEY ,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL,
  last_progress_at timestamptz,
  last_reminder_at timestamptz,
  dismissed_until date,
  core_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.domiflix_intro_acknowledgements (
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  learning_path_id uuid NOT NULL REFERENCES public.domiflix_learning_paths(id) ON DELETE CASCADE,
  episode_id uuid NOT NULL REFERENCES public.domiflix_episodes(id) ON DELETE RESTRICT,
  completed_at timestamptz NOT NULL DEFAULT now(),
  understood_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, learning_path_id)
);

ALTER TABLE public.domiflix_title_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domiflix_user_track_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domiflix_episode_subtitles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domiflix_episode_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domiflix_user_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domiflix_learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domiflix_intro_acknowledgements ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets(id, name, public, file_size_limit)
VALUES ('domiflix-learning-assets', 'domiflix-learning-assets', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

CREATE POLICY "Authenticated read DomiFlix learning assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'domiflix-learning-assets');
CREATE POLICY "Admins insert DomiFlix learning assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'domiflix-learning-assets' AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "Admins update DomiFlix learning assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'domiflix-learning-assets' AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')))
  WITH CHECK (bucket_id = 'domiflix-learning-assets' AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "Admins delete DomiFlix learning assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'domiflix-learning-assets' AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Authenticated read DomiFlix title modules"
  ON public.domiflix_title_modules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage DomiFlix title modules"
  ON public.domiflix_title_modules FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')))
  WITH CHECK ((public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Authenticated read DomiFlix learning paths"
  ON public.domiflix_learning_paths FOR SELECT TO authenticated
  USING (is_active OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage DomiFlix learning paths"
  ON public.domiflix_learning_paths FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own DomiFlix track choices"
  ON public.domiflix_user_track_modules FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users manage own eligible DomiFlix track choices"
  ON public.domiflix_user_track_modules FOR ALL TO authenticated
  USING (user_id = auth.uid() AND company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    user_id = auth.uid()
    AND company_id = public.get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.domiflix_titles t
       WHERE t.id = title_id
         AND t.track_group = 'plan'
         AND EXISTS (
           SELECT 1 FROM public.domiflix_title_modules tm
            WHERE tm.title_id = t.id
              AND public.company_has_module(company_id, tm.module_code)
         )
    )
  );

CREATE POLICY "Authenticated read DomiFlix subtitles"
  ON public.domiflix_episode_subtitles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage DomiFlix subtitles"
  ON public.domiflix_episode_subtitles FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')))
  WITH CHECK ((public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Authenticated read DomiFlix resources"
  ON public.domiflix_episode_resources FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage DomiFlix resources"
  ON public.domiflix_episode_resources FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')))
  WITH CHECK ((public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Users read own DomiFlix onboarding"
  ON public.domiflix_user_onboarding FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users read own DomiFlix intro acknowledgement"
  ON public.domiflix_intro_acknowledgements FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.domiflix_progress_company_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT p.company_id INTO v_company_id
    FROM public.profiles p
   WHERE p.user_id = NEW.user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem empresa' USING ERRCODE = '23514';
  END IF;
  IF NEW.user_id <> auth.uid() AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Usuário inválido' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.company_id IS NOT NULL AND OLD.company_id <> v_company_id THEN
    -- Congela a atribuição histórica se o usuário tiver sido movido de empresa.
    NEW.company_id := OLD.company_id;
  ELSE
    NEW.company_id := v_company_id;
  END IF;
  NEW.last_progress_at := COALESCE(NEW.last_progress_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_domiflix_progress_company_guard ON public.domiflix_user_progress;
CREATE TRIGGER trg_domiflix_progress_company_guard
BEFORE INSERT OR UPDATE ON public.domiflix_user_progress
FOR EACH ROW EXECUTE FUNCTION public.domiflix_progress_company_guard();

CREATE OR REPLACE FUNCTION public.save_domiflix_progress(
  p_episode_id uuid,
  p_progress_seconds integer DEFAULT 0,
  p_duration_seconds integer DEFAULT 0,
  p_completed boolean DEFAULT false,
  p_insert_only boolean DEFAULT false
)
RETURNS public.domiflix_user_progress
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_title_id uuid;
  v_result public.domiflix_user_progress;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_progress_seconds < 0 OR p_duration_seconds < 0 THEN
    RAISE EXCEPTION 'progresso inválido' USING ERRCODE = '22023';
  END IF;

  SELECT e.title_id INTO v_title_id FROM public.domiflix_episodes e WHERE e.id = p_episode_id;
  IF v_title_id IS NULL THEN RAISE EXCEPTION 'aula não encontrada' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.domiflix_user_progress(
    user_id, episode_id, title_id, completed, watched_at,
    progress_seconds, duration_seconds, last_progress_at
  ) VALUES (
    v_user_id, p_episode_id, v_title_id, p_completed, now(),
    p_progress_seconds, p_duration_seconds, now()
  )
  ON CONFLICT (user_id, episode_id) DO UPDATE SET
    completed = public.domiflix_user_progress.completed OR EXCLUDED.completed,
    watched_at = CASE WHEN p_insert_only THEN public.domiflix_user_progress.watched_at ELSE now() END,
    progress_seconds = CASE
      WHEN p_insert_only THEN public.domiflix_user_progress.progress_seconds
      WHEN EXCLUDED.progress_seconds = 0 AND public.domiflix_user_progress.progress_seconds > 0
        THEN public.domiflix_user_progress.progress_seconds
      ELSE EXCLUDED.progress_seconds
    END,
    duration_seconds = greatest(public.domiflix_user_progress.duration_seconds, EXCLUDED.duration_seconds),
    last_progress_at = CASE WHEN p_insert_only THEN public.domiflix_user_progress.last_progress_at ELSE now() END
  RETURNING * INTO v_result;

  UPDATE public.domiflix_user_onboarding
     SET last_progress_at = CASE WHEN p_insert_only THEN last_progress_at ELSE now() END,
         updated_at = now()
   WHERE user_id = v_user_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_domiflix_learning_status(p_path_slug text DEFAULT 'tutoriais-do-sistema')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET "TimeZone" TO 'America/Sao_Paulo'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_name text;
  v_email text;
  v_company_name text;
  v_profile_created timestamptz;
  v_company_created timestamptz;
  v_learning_started timestamptz;
  v_status text;
  v_window_start timestamptz;
  v_days integer;
  v_core_total integer;
  v_core_completed integer;
  v_track_total integer;
  v_track_completed integer;
  v_last_progress timestamptz;
  v_dismissed date;
  v_track jsonb;
  v_next jsonb;
  v_severity text := 'none';
  v_path_id uuid;
  v_path jsonb;
  v_paths jsonb;
  v_intro jsonb;
  v_intro_acknowledged boolean := false;
  v_intro_gate_enabled_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;

  SELECT p.company_id, p.full_name, p.email, c.name, p.created_at, c.created_at, c.learning_onboarding_started_at, c.subscription_status
    INTO v_company_id, v_name, v_email, v_company_name, v_profile_created, v_company_created, v_learning_started, v_status
    FROM public.profiles p
    JOIN public.companies c ON c.id = p.company_id
   WHERE p.user_id = v_uid;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Usuário sem empresa' USING ERRCODE = '23514'; END IF;

  SELECT lp.id, lp.intro_gate_enabled_at, jsonb_build_object('id', lp.id, 'slug', lp.slug, 'title', lp.title, 'description', lp.description, 'coverUrl', lp.cover_url, 'isOnboarding', lp.is_onboarding)
    INTO v_path_id, v_intro_gate_enabled_at, v_path
    FROM public.domiflix_learning_paths lp
   WHERE lp.slug = p_path_slug AND lp.is_active;
  IF v_path_id IS NULL THEN RAISE EXCEPTION 'Trilha não encontrada' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', lp.id, 'slug', lp.slug, 'title', lp.title, 'description', lp.description, 'coverUrl', lp.cover_url, 'isOnboarding', lp.is_onboarding) ORDER BY lp.order_index), '[]'::jsonb)
    INTO v_paths FROM public.domiflix_learning_paths lp WHERE lp.is_active;

  v_window_start := greatest(
    COALESCE(v_profile_created, v_learning_started, v_company_created, now()),
    COALESCE(v_learning_started, v_company_created, v_profile_created, now())
  );
  v_days := greatest(0, (current_date - v_window_start::date));

  SELECT o.dismissed_until INTO v_dismissed
    FROM public.domiflix_user_onboarding o WHERE o.user_id = v_uid;

  WITH eligible_titles AS (
    SELECT t.*,
           module_info.module_code,
           module_info.module_name,
           module_info.module_price,
           CASE
             WHEN t.track_group = 'core' THEN true
             WHEN module_info.module_code IS NULL THEN false
             ELSE EXISTS (
               SELECT 1 FROM public.company_modules cm
                WHERE cm.company_id = v_company_id
                  AND cm.module_code = module_info.module_code
             ) OR EXISTS (
               SELECT 1 FROM public.companies c
               JOIN public.subscription_plans sp ON sp.code = COALESCE(NULLIF(c.subscription_plan, ''), 'start')
                WHERE c.id = v_company_id
                  AND COALESCE(sp.included_modules, '[]'::jsonb) ? module_info.module_code
             )
           END AS included_in_plan
      FROM public.domiflix_titles t
      LEFT JOIN LATERAL (
        SELECT tm.module_code, sm.name AS module_name, sm.price AS module_price
          FROM public.domiflix_title_modules tm
          LEFT JOIN public.subscription_modules sm ON sm.code = tm.module_code
         WHERE tm.title_id = t.id
         ORDER BY sm.sort_order NULLS LAST, tm.module_code
         LIMIT 1
      ) module_info ON true
     WHERE t.learning_path_id = v_path_id
  ), lessons AS (
    SELECT et.id AS title_id, et.title AS module_title, et.description AS module_description,
           et.thumbnail_url, et.banner_url, et.track_group, et.track_order,
           et.module_code, et.module_name, et.module_price, et.included_in_plan,
           e.id AS episode_id, e.title AS lesson_title, e.description AS lesson_description,
           e.episode_number, e.order_index, e.duration_minutes, e.video_id, e.video_type,
           COALESCE(up.completed, false) AS completed,
           COALESCE(up.progress_seconds, 0) AS progress_seconds,
           COALESCE(up.duration_seconds, 0) AS duration_seconds,
           up.last_progress_at
      FROM eligible_titles et
      JOIN public.domiflix_episodes e ON e.title_id = et.id
      LEFT JOIN public.domiflix_user_progress up
        ON up.user_id = v_uid AND up.episode_id = e.id
     WHERE NULLIF(btrim(e.video_id), '') IS NOT NULL
  ), ordered AS (
    SELECT *, row_number() OVER (
      ORDER BY CASE WHEN track_group = 'core' THEN 0 WHEN included_in_plan THEN 1 ELSE 2 END,
               track_order, order_index, episode_number, episode_id
    ) AS sequence
    FROM lessons
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'sequence', sequence,
      'titleId', title_id,
      'moduleTitle', module_title,
      'moduleDescription', module_description,
      'thumbnailUrl', thumbnail_url,
      'bannerUrl', banner_url,
      'group', track_group,
      'moduleCode', module_code,
      'moduleName', module_name,
      'modulePrice', module_price,
      'includedInPlan', included_in_plan,
      'episodeId', episode_id,
      'lessonTitle', lesson_title,
      'lessonDescription', lesson_description,
      'episodeNumber', episode_number,
      'durationMinutes', duration_minutes,
      'videoType', video_type,
      'videoId', video_id,
      'completed', completed,
      'progressSeconds', progress_seconds,
      'durationSeconds', duration_seconds
    ) ORDER BY sequence), '[]'::jsonb),
    count(*) FILTER (WHERE track_group = 'core'),
    count(*) FILTER (WHERE track_group = 'core' AND completed),
    count(*) FILTER (WHERE track_group = 'core' OR included_in_plan),
    count(*) FILTER (WHERE (track_group = 'core' OR included_in_plan) AND completed),
    max(last_progress_at) FILTER (
      WHERE (track_group = 'core' OR included_in_plan)
        AND (completed OR progress_seconds >= greatest(30, ceil(duration_seconds * .1)))
    ),
    (jsonb_agg(jsonb_build_object(
      'titleId', title_id, 'moduleTitle', module_title,
      'episodeId', episode_id, 'lessonTitle', lesson_title,
      'episodeNumber', episode_number, 'progressSeconds', progress_seconds
    ) ORDER BY (completed::int), sequence) FILTER (
      WHERE NOT completed AND (track_group = 'core' OR included_in_plan)
    ))->0
  INTO v_track, v_core_total, v_core_completed, v_track_total, v_track_completed, v_last_progress, v_next
  FROM ordered;

  v_intro := COALESCE(v_track->0, '{}'::jsonb);
  SELECT EXISTS (SELECT 1 FROM public.domiflix_intro_acknowledgements a WHERE a.user_id = v_uid AND a.learning_path_id = v_path_id) INTO v_intro_acknowledged;

  IF v_track_total > 0 AND v_track_completed = v_track_total THEN
    v_severity := 'complete';
  ELSIF COALESCE((v_path->>'isOnboarding')::boolean, false) AND v_days BETWEEN 0 AND 30 AND (v_dismissed IS NULL OR v_dismissed < current_date) THEN
    v_severity := 'invite';
    IF v_last_progress IS NULL AND v_days >= 7 THEN v_severity := 'critical';
    ELSIF v_last_progress IS NOT NULL AND current_date - v_last_progress::date >= 7 THEN v_severity := 'critical';
    ELSIF v_last_progress IS NOT NULL AND current_date - v_last_progress::date >= 3 THEN v_severity := 'soft';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'user', jsonb_build_object(
      'firstName', split_part(COALESCE(NULLIF(btrim(v_name), ''), 'Olá'), ' ', 1),
      'email', COALESCE(v_email, ''),
      'companyName', COALESCE(v_company_name, ''),
      'companyId', v_company_id,
      'accountStage', CASE WHEN v_status IN ('testing', 'trial') THEN 'trial' WHEN v_status = 'active' THEN 'paid' ELSE 'neutral' END,
      'onboardingDay', v_days
    ),
    'progress', jsonb_build_object(
      'coreTotal', COALESCE(v_core_total, 0),
      'coreCompleted', COALESCE(v_core_completed, 0),
      'corePercent', CASE WHEN COALESCE(v_core_total, 0) = 0 THEN 0 ELSE round(v_core_completed::numeric * 100 / v_core_total) END,
      'trackTotal', COALESCE(v_track_total, 0),
      'trackCompleted', COALESCE(v_track_completed, 0),
      'trackPercent', CASE WHEN COALESCE(v_track_total, 0) = 0 THEN 0 ELSE round(v_track_completed::numeric * 100 / v_track_total) END,
      'lastProgressAt', v_last_progress
    ),
    'reminder', jsonb_build_object('severity', v_severity, 'dismissedUntil', v_dismissed),
    'nextLesson', v_next,
    'introGate', jsonb_build_object(
      'required', COALESCE((v_path->>'isOnboarding')::boolean, false)
        AND v_status IN ('testing', 'trial', 'active')
        AND v_window_start >= v_intro_gate_enabled_at
        AND NOT v_intro_acknowledged
        AND v_intro->>'group' = 'core'
        AND NULLIF(v_intro->>'videoId', '') IS NOT NULL,
      'acknowledged', v_intro_acknowledged,
      'lesson', v_intro
    ),
    'track', v_track,
    'path', v_path,
    'paths', v_paths
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_domiflix_intro(p_episode_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_company_id uuid; v_path_id uuid; v_completed boolean; v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT p.company_id, t.learning_path_id, COALESCE(up.completed, false)
    INTO v_company_id, v_path_id, v_completed
    FROM public.profiles p
    JOIN public.domiflix_episodes e ON e.id = p_episode_id
    JOIN public.domiflix_titles t ON t.id = e.title_id
    LEFT JOIN public.domiflix_user_progress up ON up.user_id = v_uid AND up.episode_id = e.id
   WHERE p.user_id = v_uid
     AND e.id = (
       SELECT e2.id FROM public.domiflix_episodes e2
       JOIN public.domiflix_titles t2 ON t2.id = e2.title_id
       JOIN public.domiflix_learning_paths lp2 ON lp2.id = t2.learning_path_id
       WHERE lp2.is_onboarding AND t2.track_group = 'core' AND NULLIF(btrim(e2.video_id), '') IS NOT NULL
       ORDER BY CASE t2.track_group WHEN 'core' THEN 0 ELSE 1 END, t2.track_order, e2.order_index, e2.episode_number, e2.id
       LIMIT 1
     );
  IF v_company_id IS NULL OR v_path_id IS NULL THEN RAISE EXCEPTION 'Aula introdutória inválida' USING ERRCODE = '22023'; END IF;
  IF NOT v_completed THEN RAISE EXCEPTION 'Conclua o vídeo antes de confirmar' USING ERRCODE = '23514'; END IF;
  INSERT INTO public.domiflix_intro_acknowledgements(user_id, company_id, learning_path_id, episode_id, completed_at, understood_at)
  VALUES (v_uid, v_company_id, v_path_id, p_episode_id, v_now, v_now)
  ON CONFLICT (user_id, learning_path_id) DO NOTHING;
  RETURN v_now;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_domiflix_learning_reminder()
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET "TimeZone" TO 'America/Sao_Paulo'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_started_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT p.company_id, greatest(COALESCE(p.created_at, c.created_at), c.created_at)
    INTO v_company_id, v_started_at
    FROM public.profiles p JOIN public.companies c ON c.id = p.company_id
   WHERE p.user_id = v_uid;

  INSERT INTO public.domiflix_user_onboarding(user_id, company_id, window_started_at, dismissed_until, last_reminder_at)
  VALUES (v_uid, v_company_id, v_started_at, current_date, now())
  ON CONFLICT (user_id) DO UPDATE SET
    dismissed_until = current_date,
    last_reminder_at = now(),
    updated_at = now();
  RETURN current_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.cs_domiflix_usuarios(p_company_id uuid)
RETURNS TABLE(
  user_id uuid,
  nome text,
  email text,
  aulas_total integer,
  aulas_iniciadas integer,
  aulas_concluidas integer,
  percentual_concluido numeric,
  ultima_aula text,
  ultima_atividade timestamptz,
  estado_lembrete text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET "TimeZone" TO 'America/Sao_Paulo'
AS $$
BEGIN
  PERFORM public._domiflix_assert_admin();
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'company_id obrigatório' USING ERRCODE = '22023'; END IF;

  RETURN QUERY
  WITH entitled_modules AS (
    SELECT cm.module_code
      FROM public.company_modules cm
     WHERE cm.company_id = p_company_id
    UNION
    SELECT sm.code
      FROM public.companies c
      JOIN public.subscription_plans sp ON sp.code = COALESCE(NULLIF(c.subscription_plan, ''), 'start')
      JOIN public.subscription_modules sm ON COALESCE(sp.included_modules, '[]'::jsonb) ? sm.code
     WHERE c.id = p_company_id
  ), total AS (
    SELECT count(*)::integer n
      FROM public.domiflix_episodes e
      JOIN public.domiflix_titles t ON t.id = e.title_id
      JOIN public.domiflix_learning_paths lp ON lp.id = t.learning_path_id
     WHERE lp.is_onboarding
       AND NULLIF(btrim(e.video_id), '') IS NOT NULL
       AND (t.track_group = 'core' OR EXISTS (
         SELECT 1 FROM public.domiflix_title_modules tm
          WHERE tm.title_id = t.id
            AND EXISTS (SELECT 1 FROM entitled_modules em WHERE em.module_code = tm.module_code)
       ))
  ), progress AS (
    SELECT up.user_id,
           count(*) FILTER (WHERE up.completed OR up.progress_seconds >= greatest(30, ceil(up.duration_seconds * .1)))::integer iniciadas,
           count(*) FILTER (WHERE up.completed)::integer concluidas,
           max(up.last_progress_at) ultima,
           (array_agg(e.title ORDER BY up.last_progress_at DESC NULLS LAST))[1] ultima_aula
      FROM public.domiflix_user_progress up
      JOIN public.domiflix_episodes e ON e.id = up.episode_id
      JOIN public.domiflix_titles t ON t.id = e.title_id
      JOIN public.domiflix_learning_paths lp ON lp.id = t.learning_path_id
     WHERE up.company_id = p_company_id
       AND lp.is_onboarding
       AND (t.track_group = 'core' OR EXISTS (
         SELECT 1 FROM public.domiflix_title_modules tm
          WHERE tm.title_id = t.id
            AND EXISTS (SELECT 1 FROM entitled_modules em WHERE em.module_code = tm.module_code)
       ))
     GROUP BY up.user_id
  )
  SELECT p.user_id, p.full_name, p.email, total.n,
         COALESCE(progress.iniciadas, 0), COALESCE(progress.concluidas, 0),
         CASE WHEN total.n = 0 THEN 0 ELSE round(COALESCE(progress.concluidas, 0)::numeric * 100 / total.n, 1) END,
         progress.ultima_aula, progress.ultima,
         CASE
           WHEN COALESCE(progress.concluidas, 0) = total.n AND total.n > 0 THEN 'concluida'
           WHEN progress.ultima IS NULL THEN 'nao_iniciada'
           WHEN current_date - progress.ultima::date >= 7 THEN 'parada_7d'
           WHEN current_date - progress.ultima::date >= 3 THEN 'parada_3d'
           ELSE 'em_dia'
         END
    FROM public.profiles p CROSS JOIN total
    LEFT JOIN progress ON progress.user_id = p.user_id
   WHERE p.company_id = p_company_id AND COALESCE(p.is_active, true)
   ORDER BY progress.ultima ASC NULLS FIRST, p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.save_domiflix_progress(uuid, integer, integer, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.domiflix_learning_paths, public.domiflix_title_modules, public.domiflix_user_track_modules, public.domiflix_episode_subtitles, public.domiflix_episode_resources, public.domiflix_user_onboarding, public.domiflix_intro_acknowledgements FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.domiflix_learning_paths, public.domiflix_title_modules, public.domiflix_user_track_modules, public.domiflix_episode_subtitles, public.domiflix_episode_resources TO authenticated, service_role;
GRANT SELECT ON TABLE public.domiflix_user_onboarding, public.domiflix_intro_acknowledgements TO authenticated;
GRANT ALL ON TABLE public.domiflix_user_onboarding, public.domiflix_intro_acknowledgements TO service_role;
REVOKE ALL ON FUNCTION public.get_domiflix_learning_status(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dismiss_domiflix_learning_reminder() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cs_domiflix_usuarios(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.acknowledge_domiflix_intro(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_domiflix_progress(uuid, integer, integer, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_domiflix_learning_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_domiflix_learning_reminder() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cs_domiflix_usuarios(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acknowledge_domiflix_intro(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_domiflix_learning_status(text) IS
  'Trilha efetiva do usuário autenticado, resolvida pelo plano/empresa no servidor, com progresso e régua individual de 30 dias.';
COMMENT ON FUNCTION public.save_domiflix_progress(uuid, integer, integer, boolean, boolean) IS
  'Salva progresso DomiFlix sem aceitar user_id/company_id do cliente e sem regredir conclusão.';

-- Rollback operacional: desligar o frontend v2. Não remover as colunas/tabelas
-- durante incidente, pois já podem conter progresso, escolhas e materiais.

COMMIT;

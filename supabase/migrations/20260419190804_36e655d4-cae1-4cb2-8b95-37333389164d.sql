-- ════════════════════════════════════════════════════════════════
-- DOMIFLIX MODULE: tables, RLS, storage, seed
-- ════════════════════════════════════════════════════════════════

-- 1. domiflix_titles ------------------------------------------------
CREATE TABLE public.domiflix_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'series' CHECK (type IN ('series','movie')),
  title text NOT NULL,
  description text,
  banner_url text,
  thumbnail_url text,
  logo_url text,
  tags text[] NOT NULL DEFAULT '{}',
  is_featured boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  live_url text,
  live_scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_domiflix_titles_order ON public.domiflix_titles(order_index);
CREATE INDEX idx_domiflix_titles_featured ON public.domiflix_titles(is_featured);

-- 2. domiflix_seasons -----------------------------------------------
CREATE TABLE public.domiflix_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id uuid NOT NULL REFERENCES public.domiflix_titles(id) ON DELETE CASCADE,
  season_number integer NOT NULL,
  title text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_domiflix_seasons_title ON public.domiflix_seasons(title_id);

-- 3. domiflix_episodes ----------------------------------------------
CREATE TABLE public.domiflix_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id uuid NOT NULL REFERENCES public.domiflix_titles(id) ON DELETE CASCADE,
  season_id uuid REFERENCES public.domiflix_seasons(id) ON DELETE SET NULL,
  episode_number integer,
  title text NOT NULL,
  description text,
  video_id text,
  video_type text NOT NULL DEFAULT 'youtube' CHECK (video_type IN ('drive','youtube')),
  duration_minutes integer,
  thumbnail_url text,
  order_index integer NOT NULL DEFAULT 0,
  recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_domiflix_episodes_title ON public.domiflix_episodes(title_id);
CREATE INDEX idx_domiflix_episodes_season ON public.domiflix_episodes(season_id);

-- 4. domiflix_user_progress ----------------------------------------
CREATE TABLE public.domiflix_user_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  episode_id uuid NOT NULL REFERENCES public.domiflix_episodes(id) ON DELETE CASCADE,
  title_id uuid NOT NULL REFERENCES public.domiflix_titles(id) ON DELETE CASCADE,
  completed boolean NOT NULL DEFAULT false,
  watched_at timestamptz NOT NULL DEFAULT now(),
  progress_seconds integer NOT NULL DEFAULT 0,
  duration_seconds integer NOT NULL DEFAULT 0,
  UNIQUE(user_id, episode_id)
);
CREATE INDEX idx_domiflix_progress_user ON public.domiflix_user_progress(user_id);

-- 5. domiflix_watchlist --------------------------------------------
CREATE TABLE public.domiflix_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title_id uuid NOT NULL REFERENCES public.domiflix_titles(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, title_id)
);
CREATE INDEX idx_domiflix_watchlist_user ON public.domiflix_watchlist(user_id);

-- 6. domiflix_user_preferences -------------------------------------
CREATE TABLE public.domiflix_user_preferences (
  user_id uuid PRIMARY KEY,
  playback_speed numeric NOT NULL DEFAULT 1,
  ecoflix_avatar_url text,
  ecoflix_display_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. domiflix_sections ---------------------------------------------
CREATE TABLE public.domiflix_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8. domiflix_section_titles ---------------------------------------
CREATE TABLE public.domiflix_section_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.domiflix_sections(id) ON DELETE CASCADE,
  title_id uuid NOT NULL REFERENCES public.domiflix_titles(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  UNIQUE(section_id, title_id)
);
CREATE INDEX idx_domiflix_section_titles_section ON public.domiflix_section_titles(section_id);

-- ════════════════════════════════════════════════════════════════
-- TRIGGERS for updated_at
-- ════════════════════════════════════════════════════════════════
CREATE TRIGGER update_domiflix_titles_updated_at
  BEFORE UPDATE ON public.domiflix_titles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_domiflix_user_preferences_updated_at
  BEFORE UPDATE ON public.domiflix_user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_domiflix_sections_updated_at
  BEFORE UPDATE ON public.domiflix_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════
ALTER TABLE public.domiflix_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domiflix_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domiflix_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domiflix_user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domiflix_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domiflix_user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domiflix_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domiflix_section_titles ENABLE ROW LEVEL SECURITY;

-- Content tables: read for any authenticated; write for super_admin/admin
CREATE POLICY "domiflix_titles_select_auth" ON public.domiflix_titles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "domiflix_titles_admin_all" ON public.domiflix_titles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "domiflix_seasons_select_auth" ON public.domiflix_seasons
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "domiflix_seasons_admin_all" ON public.domiflix_seasons
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "domiflix_episodes_select_auth" ON public.domiflix_episodes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "domiflix_episodes_admin_all" ON public.domiflix_episodes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "domiflix_sections_select_auth" ON public.domiflix_sections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "domiflix_sections_admin_all" ON public.domiflix_sections
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "domiflix_section_titles_select_auth" ON public.domiflix_section_titles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "domiflix_section_titles_admin_all" ON public.domiflix_section_titles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

-- User-scoped tables
CREATE POLICY "domiflix_progress_user_all" ON public.domiflix_user_progress
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "domiflix_watchlist_user_all" ON public.domiflix_watchlist
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "domiflix_prefs_user_all" ON public.domiflix_user_preferences
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════
-- STORAGE bucket
-- ════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES ('domiflix-thumbnails', 'domiflix-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "domiflix_thumbs_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'domiflix-thumbnails');

CREATE POLICY "domiflix_thumbs_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'domiflix-thumbnails'
    AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "domiflix_thumbs_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'domiflix-thumbnails'
    AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "domiflix_thumbs_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'domiflix-thumbnails'
    AND (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  );

-- ════════════════════════════════════════════════════════════════
-- SEED initial sections
-- ════════════════════════════════════════════════════════════════
INSERT INTO public.domiflix_sections (label, description, order_index, is_active)
VALUES
  ('Módulos', 'Treinamentos por módulo do sistema', 0, true),
  ('Lives', 'Lives e gravações ao vivo', 1, true);

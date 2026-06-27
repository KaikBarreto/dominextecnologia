-- ============================================================================
-- BLOG da Dominex — conteúdo GLOBAL de marketing, gerido pelo super_admin.
-- NÃO é multi-tenant: não há company_id. Leitura pública controlada,
-- escrita restrita a super_admin via has_role(auth.uid(),'super_admin'::app_role).
-- Espelha o blog do EcoSistema (estrutura/triggers), mas com SEGURANÇA Dominex
-- (super_admin em vez de "authenticated") e comentários entrando pendentes
-- de moderação (is_approved default FALSE).
-- Idempotente: IF NOT EXISTS / DROP ... IF EXISTS antes de cada criação.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) blog_categories
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blog_categories (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT DEFAULT '#6B7280',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2) blog_posts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id               UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title            TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  content          TEXT DEFAULT '',
  excerpt          TEXT,
  cover_image_url  TEXT,
  category         TEXT DEFAULT 'Novidades',
  tags             TEXT[] DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  author_name      TEXT,
  author_id        UUID,
  meta_title       TEXT,
  meta_description TEXT,
  published_at     TIMESTAMPTZ,
  view_count       INTEGER DEFAULT 0,
  likes_count      INTEGER DEFAULT 0,
  comments_count   INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published_at
  ON public.blog_posts (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug
  ON public.blog_posts (slug);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3) blog_post_likes  (engajamento anônimo por session_id)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blog_post_likes (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id    UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, session_id)
);

ALTER TABLE public.blog_post_likes ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4) blog_post_comments  (entram pendentes de moderação: is_approved default FALSE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blog_post_comments (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id     UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  content     TEXT NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_post_comments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- updated_at em blog_posts — reusa a função canônica do projeto.
DROP TRIGGER IF EXISTS update_blog_posts_updated_at ON public.blog_posts;
CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- likes_count: +/- direto em INSERT/DELETE de likes.
CREATE OR REPLACE FUNCTION public.update_blog_post_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.blog_posts
      SET likes_count = COALESCE(likes_count, 0) + 1
      WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.blog_posts
      SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
      WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS blog_post_likes_count_trigger ON public.blog_post_likes;
CREATE TRIGGER blog_post_likes_count_trigger
  AFTER INSERT OR DELETE ON public.blog_post_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_blog_post_likes_count();

-- comments_count: recalcula contando SÓ is_approved=true (o público só vê
-- aprovados, então o contador deve refletir aprovados). Cobre INSERT/UPDATE/DELETE
-- porque aprovar/reprovar é um UPDATE em is_approved.
CREATE OR REPLACE FUNCTION public.update_blog_post_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id UUID;
BEGIN
  v_post_id := COALESCE(NEW.post_id, OLD.post_id);
  UPDATE public.blog_posts
    SET comments_count = (
      SELECT COUNT(*)
      FROM public.blog_post_comments
      WHERE post_id = v_post_id AND is_approved = TRUE
    )
    WHERE id = v_post_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS blog_post_comments_count_trigger ON public.blog_post_comments;
CREATE TRIGGER blog_post_comments_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.blog_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_blog_post_comments_count();

-- ============================================================================
-- RPC — incremento de views (anon-safe via SECURITY DEFINER)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.increment_blog_post_views(post_slug TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.blog_posts
    SET view_count = COALESCE(view_count, 0) + 1
    WHERE slug = post_slug AND status = 'published';
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_blog_post_views(TEXT) TO anon, authenticated, service_role;

-- ============================================================================
-- RLS POLICIES
-- Escrita restrita a super_admin: has_role(auth.uid(),'super_admin'::app_role).
-- Leitura pública controlada. service_role full access em todas (operações backend).
-- ============================================================================

-- ---- blog_posts ----
DROP POLICY IF EXISTS "service_role_full_access_blog_posts" ON public.blog_posts;
CREATE POLICY "service_role_full_access_blog_posts"
  ON public.blog_posts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Published posts are publicly readable" ON public.blog_posts;
CREATE POLICY "Published posts are publicly readable"
  ON public.blog_posts FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "super_admin can read all blog posts" ON public.blog_posts;
CREATE POLICY "super_admin can read all blog posts"
  ON public.blog_posts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "super_admin can insert blog posts" ON public.blog_posts;
CREATE POLICY "super_admin can insert blog posts"
  ON public.blog_posts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "super_admin can update blog posts" ON public.blog_posts;
CREATE POLICY "super_admin can update blog posts"
  ON public.blog_posts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "super_admin can delete blog posts" ON public.blog_posts;
CREATE POLICY "super_admin can delete blog posts"
  ON public.blog_posts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ---- blog_categories ----
DROP POLICY IF EXISTS "service_role_full_access_blog_categories" ON public.blog_categories;
CREATE POLICY "service_role_full_access_blog_categories"
  ON public.blog_categories FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view blog categories" ON public.blog_categories;
CREATE POLICY "Anyone can view blog categories"
  ON public.blog_categories FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "super_admin can insert blog categories" ON public.blog_categories;
CREATE POLICY "super_admin can insert blog categories"
  ON public.blog_categories FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "super_admin can update blog categories" ON public.blog_categories;
CREATE POLICY "super_admin can update blog categories"
  ON public.blog_categories FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "super_admin can delete blog categories" ON public.blog_categories;
CREATE POLICY "super_admin can delete blog categories"
  ON public.blog_categories FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ---- blog_post_likes (engajamento público anônimo) ----
DROP POLICY IF EXISTS "service_role_full_access_blog_post_likes" ON public.blog_post_likes;
CREATE POLICY "service_role_full_access_blog_post_likes"
  ON public.blog_post_likes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view likes" ON public.blog_post_likes;
CREATE POLICY "Anyone can view likes"
  ON public.blog_post_likes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert likes" ON public.blog_post_likes;
CREATE POLICY "Anyone can insert likes"
  ON public.blog_post_likes FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can delete own likes" ON public.blog_post_likes;
CREATE POLICY "Anyone can delete own likes"
  ON public.blog_post_likes FOR DELETE
  USING (true);

-- ---- blog_post_comments ----
DROP POLICY IF EXISTS "service_role_full_access_blog_post_comments" ON public.blog_post_comments;
CREATE POLICY "service_role_full_access_blog_post_comments"
  ON public.blog_post_comments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view approved comments" ON public.blog_post_comments;
CREATE POLICY "Anyone can view approved comments"
  ON public.blog_post_comments FOR SELECT
  USING (is_approved = TRUE);

DROP POLICY IF EXISTS "super_admin can view all comments" ON public.blog_post_comments;
CREATE POLICY "super_admin can view all comments"
  ON public.blog_post_comments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Anyone can insert comments" ON public.blog_post_comments;
CREATE POLICY "Anyone can insert comments"
  ON public.blog_post_comments FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "super_admin can update comments" ON public.blog_post_comments;
CREATE POLICY "super_admin can update comments"
  ON public.blog_post_comments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "super_admin can delete comments" ON public.blog_post_comments;
CREATE POLICY "super_admin can delete comments"
  ON public.blog_post_comments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ============================================================================
-- STORAGE — bucket blog-images (público pra leitura, escrita só super_admin)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-images', 'blog-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Blog images are publicly accessible" ON storage.objects;
CREATE POLICY "Blog images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'blog-images');

DROP POLICY IF EXISTS "super_admin can upload blog images" ON storage.objects;
CREATE POLICY "super_admin can upload blog images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'blog-images'
    AND public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "super_admin can update blog images" ON storage.objects;
CREATE POLICY "super_admin can update blog images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'blog-images'
    AND public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (bucket_id = 'blog-images'
    AND public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "super_admin can delete blog images" ON storage.objects;
CREATE POLICY "super_admin can delete blog images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'blog-images'
    AND public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ============================================================================
-- SEED — categorias de marketing Dominex (pt-BR)
-- ============================================================================
INSERT INTO public.blog_categories (name, color) VALUES
  ('Gestão de Campo',   '#10b981'),
  ('PMOC',              '#06b6d4'),
  ('Refrigeração',      '#3b82f6'),
  ('Ordem de Serviço',  '#6366f1'),
  ('Dicas',             '#f59e0b'),
  ('Novidades',         '#6b7280')
ON CONFLICT (name) DO NOTHING;

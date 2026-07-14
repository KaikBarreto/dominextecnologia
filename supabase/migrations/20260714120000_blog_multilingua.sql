-- Blog multilíngue: adiciona locale + translation_group em blog_posts e locale em blog_categories.
-- Por quê: permitir versões traduzidas da mesma matéria (pt-br/en/es/fr) sem colisão de slug/nome
-- entre idiomas. RLS NÃO muda (leitura pública só published; escrita super_admin) — só adicionamos colunas.
-- Idempotente: IF NOT EXISTS em colunas, DROP ... IF EXISTS antes de recriar constraints.

-- ============================================================
-- blog_posts
-- ============================================================

-- 1) locale (default pt-br cobre todas as linhas existentes)
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'pt-br';

-- 2) translation_group: default gen_random_uuid() garante preenchimento de novas linhas.
--    Cada linha existente vira seu próprio grupo (traduções futuras compartilham o mesmo uuid).
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS translation_group uuid;

-- Backfill: cada post existente ganha seu próprio grupo. (gen_random_uuid() está no search_path.)
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.blog_posts
     SET translation_group = gen_random_uuid()
   WHERE translation_group IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'blog_posts.translation_group backfilled: % linhas', v_count;
END $$;

-- Após backfill: default para novas linhas + NOT NULL (invariante: todo post pertence a um grupo).
ALTER TABLE public.blog_posts
  ALTER COLUMN translation_group SET DEFAULT gen_random_uuid();

ALTER TABLE public.blog_posts
  ALTER COLUMN translation_group SET NOT NULL;

-- 3) CHECK defensivo de locale
ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS blog_posts_locale_check;
ALTER TABLE public.blog_posts
  ADD CONSTRAINT blog_posts_locale_check
  CHECK (locale IN ('pt-br','en','es','fr'));

-- 4) Slug: troca UNIQUE global por UNIQUE(locale, slug).
--    Traduções da mesma matéria têm slugs próprios; slugs iguais só colidem dentro do mesmo idioma.
ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS blog_posts_slug_key;
ALTER TABLE public.blog_posts DROP CONSTRAINT IF EXISTS blog_posts_locale_slug_key;
ALTER TABLE public.blog_posts
  ADD CONSTRAINT blog_posts_locale_slug_key UNIQUE (locale, slug);

-- 5) Índice de listagem (locale, status)
CREATE INDEX IF NOT EXISTS idx_blog_posts_locale_status
  ON public.blog_posts (locale, status);

-- ============================================================
-- blog_categories
-- ============================================================

ALTER TABLE public.blog_categories
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'pt-br';

ALTER TABLE public.blog_categories DROP CONSTRAINT IF EXISTS blog_categories_locale_check;
ALTER TABLE public.blog_categories
  ADD CONSTRAINT blog_categories_locale_check
  CHECK (locale IN ('pt-br','en','es','fr'));

-- Nome único por idioma (mesma categoria pode existir traduzida em cada locale).
ALTER TABLE public.blog_categories DROP CONSTRAINT IF EXISTS blog_categories_name_key;
ALTER TABLE public.blog_categories DROP CONSTRAINT IF EXISTS blog_categories_locale_name_key;
ALTER TABLE public.blog_categories
  ADD CONSTRAINT blog_categories_locale_name_key UNIQUE (locale, name);

// ─────────────────────────────────────────────────────────────────────────────
// "Leia também" — posts relacionados no FIM de cada artigo.
//
// Critério: mesma categoria primeiro, completa com recentes; exclui o próprio
// post; limita a 3. CRÍTICO: o equivalente em HTML também é montado no SSR
// (api/blog-post.js) pra contar como link interno pro SEO e crawlers sem JS.
// Esta versão React mantém a navegação client-side consistente.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Newspaper } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import type { LocaleCode } from '@/lib/i18n/locales';
import { BlogPostCard, type BlogPostCardData, type CategoryColor } from './blogShared';

type RelatedRow = BlogPostCardData & { published_at: string | null };

/**
 * Busca relacionados: prioriza a mesma categoria, completa com recentes, exclui
 * o próprio slug e limita a 3. Dedup por id. Filtra pelo LOCALE do artigo, pra
 * não misturar traduções (sob /es só relacionados es).
 */
async function fetchRelated(
  slug: string,
  category: string | null,
  locale: LocaleCode,
): Promise<RelatedRow[]> {
  const select =
    'id, title, slug, excerpt, category, cover_image_url, published_at, author_name';

  const sameCategory: RelatedRow[] = [];
  if (category) {
    const { data } = await supabase
      .from('blog_posts')
      .select(select)
      .eq('status', 'published')
      .eq('locale', locale)
      .eq('category', category)
      .neq('slug', slug)
      .order('published_at', { ascending: false })
      .limit(3);
    if (data) sameCategory.push(...(data as RelatedRow[]));
  }

  if (sameCategory.length >= 3) return sameCategory.slice(0, 3);

  // Completa com recentes (qualquer categoria), sem repetir.
  const { data: recent } = await supabase
    .from('blog_posts')
    .select(select)
    .eq('status', 'published')
    .eq('locale', locale)
    .neq('slug', slug)
    .order('published_at', { ascending: false })
    .limit(6);

  const seen = new Set(sameCategory.map((p) => p.id));
  const merged = [...sameCategory];
  for (const p of (recent || []) as RelatedRow[]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    merged.push(p);
    if (merged.length >= 3) break;
  }
  return merged.slice(0, 3);
}

export function RelatedPosts({
  slug,
  category,
  categoryColors,
}: {
  slug: string;
  category: string | null;
  categoryColors: CategoryColor[];
}) {
  const { locale, messages } = useLocale();
  const { data: related = [] } = useQuery({
    queryKey: ['blog-related', slug, category, locale],
    queryFn: () => fetchRelated(slug, category, locale),
    enabled: !!slug,
  });

  if (related.length === 0) return null;

  return (
    <section className="mt-14">
      <div className="mb-5 flex items-center gap-2">
        <Newspaper className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white">{messages.blog.relatedTitle}</h2>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((post) => (
          <BlogPostCard
            key={post.id}
            post={post}
            categoryColors={categoryColors}
            variant="related"
          />
        ))}
      </div>
    </section>
  );
}

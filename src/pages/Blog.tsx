import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Search, Star, Newspaper, ArrowRight } from 'lucide-react';
import { captureUtmParams } from '@/lib/whatsapp';
import { useLocale } from '@/lib/i18n/useLocale';
import LandingFooter from '@/components/landing/LandingFooter';
import WhatsAppFloatingButton from '@/components/landing/WhatsAppFloatingButton';
import { BlogSidebar } from '@/components/blog/BlogSidebar';
import BlogNavbar from '@/components/blog/BlogNavbar';
import { useBlogTheme } from '@/components/blog/useBlogTheme';
import {
  BlogPostCard,
  type BlogPostCardData,
  type CategoryColor,
} from '@/components/blog/blogShared';

// Página pública. NUNCA herda o white-label do tenant logado: restaura o brand
// Dominex em toda a subárvore (espelha Landing.tsx / QuemSomos.tsx).
const DOMINEX_BRAND_VARS = {
  '--primary': '160 100% 39%',
  '--ring': '160 100% 39%',
  '--sidebar-primary': '160 100% 39%',
  '--sidebar-accent': '160 100% 39%',
  '--sidebar-ring': '160 100% 39%',
  '--gradient-brand': 'linear-gradient(135deg, hsl(160 100% 39%) 0%, hsl(160 85% 45%) 100%)',
} as CSSProperties;

const META_TITLE = 'Blog — Dominex | Gestão para equipes de campo';
const META_DESCRIPTION =
  'Artigos práticos sobre ordem de serviço, PMOC, gestão de equipe e como tirar a operação de campo do papel. Conteúdo da Dominex.';

type BlogPostRow = BlogPostCardData;

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Props OPCIONAIS de dados injetados pelo SSG (entry-ssg). Quando presentes, viram
 * `initialData` do React Query e o conteúdo já sai renderizado no HTML estático
 * (SEO: posts, categorias e links internos visíveis sem JS). No client, o React
 * Query revalida em background pra refletir publicações novas.
 */
export interface BlogProps {
  initialPosts?: BlogPostRow[];
  initialCategories?: CategoryColor[];
}

export default function Blog({ initialPosts, initialCategories }: BlogProps = {}) {
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [search, setSearch] = useState('');
  const { theme, toggleTheme } = useBlogTheme();
  // Idioma da URL: sob /es/blog só posts es, sob /blog só pt-br. O SSG injeta os
  // posts JÁ filtrados pelo locale renderizado (item 3), então initialData bate.
  // `messages.blog` = chrome/layout localizado (o conteúdo dos posts é do banco).
  const { locale, messages } = useLocale();
  const t = messages.blog;

  useEffect(() => {
    document.title = META_TITLE;
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content') ?? null;
    if (meta) meta.setAttribute('content', META_DESCRIPTION);

    captureUtmParams(window.location.search);
    document.documentElement.classList.add('landing-scrollbar');
    window.scrollTo(0, 0);

    return () => {
      document.documentElement.classList.remove('landing-scrollbar');
      if (meta && prevDesc !== null) meta.setAttribute('content', prevDesc);
    };
  }, []);

  const { data: posts = initialPosts ?? [], isLoading } = useQuery({
    queryKey: ['blog-posts-public', locale],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select(
          'id, title, slug, excerpt, category, cover_image_url, published_at, view_count, likes_count, comments_count, author_name, content'
        )
        .eq('status', 'published')
        .eq('locale', locale)
        .order('published_at', { ascending: false });
      if (error) throw error;
      return (data || []) as BlogPostRow[];
    },
    initialData: initialPosts,
  });

  const { data: categoryColors = [] } = useQuery({
    queryKey: ['blog-categories-with-colors', locale],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_categories')
        .select('name, color')
        .eq('locale', locale)
        .order('name');
      if (error) return [];
      return (data || []).map((c) => ({
        name: c.name,
        color: c.color || 'hsl(160 100% 39%)',
      })) as CategoryColor[];
    },
    initialData: initialCategories,
  });

  const isSearching = search.trim().length > 0;

  // Busca é universal: ignora o filtro de categoria e procura no dataset todo.
  const matched = useMemo(() => {
    if (!posts) return [];
    if (!isSearching) {
      return activeCategory === 'Todos'
        ? posts
        : posts.filter((p) => p.category === activeCategory);
    }
    const q = normalize(search.trim());
    return posts.filter((p) => {
      const haystack = normalize(`${p.title} ${p.excerpt ?? ''} ${p.category ?? ''}`);
      return haystack.includes(q);
    });
  }, [posts, activeCategory, search, isSearching]);

  const allCategories = ['Todos', ...(categoryColors ?? []).map((c) => c.name)];

  // Destaque só na vista padrão ("Todos", sem busca): o post mais recente.
  const showFeatured = activeCategory === 'Todos' && !isSearching && (posts?.length ?? 0) > 0;
  const featured = showFeatured ? posts[0] : undefined;
  const gridPosts = showFeatured ? matched.slice(1) : matched;

  const getCategoryColor = (catName: string) =>
    catName === 'Todos'
      ? undefined
      : (categoryColors ?? []).find((c) => c.name === catName)?.color;

  return (
    // O tema do blog controla `.dark` no <html> (useBlogTheme), pra as variantes
    // `dark:` resolverem de verdade mesmo com o `.dark` global do index.html.
    // O container raiz nasce com bg claro OPACO (bg-neutral-50) pra não vazar o
    // fundo escuro do body por baixo enquanto o tema é light.
    <div style={DOMINEX_BRAND_VARS}>
      <div className="relative min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[hsl(0,0%,4%)] dark:text-white">
        <BlogNavbar theme={theme} onToggleTheme={toggleTheme} />

        {/* Header */}
        <section className="relative overflow-hidden pb-8 pt-12">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(160,100%,39%,0.07)_0%,transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,hsl(160,100%,39%,0.08)_0%,transparent_70%)]" />
          <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-[hsl(160,80%,55%)] px-4 py-1.5">
              <Newspaper className="h-4 w-4 text-white" />
              <span className="text-xs font-semibold text-white">{t.badge}</span>
            </div>
            <h1 className="text-3xl font-bold leading-[1.12] tracking-tight text-neutral-900 sm:text-4xl lg:text-5xl dark:text-white">
              {t.heroLine1}{' '}
              <span className="bg-gradient-to-r from-primary to-[hsl(160,70%,40%)] bg-clip-text text-transparent dark:to-[hsl(160,80%,55%)]">
                {t.heroHighlight}
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-white/50">
              {t.subtitle}
            </p>

            {/* Busca */}
            <div className="relative mx-auto mt-8 max-w-md">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-white/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full rounded-full border border-neutral-300 bg-white py-3 pl-11 pr-4 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-primary/60 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/40 dark:focus:border-primary/50"
              />
            </div>
          </div>
        </section>

        <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
          {/* Chips de categorias (filtro). Some durante a busca. */}
          {!isSearching && allCategories.length > 1 && (
            <nav
              aria-label="Categorias do blog"
              className="mb-10 flex flex-wrap justify-center gap-2"
            >
              {allCategories.map((cat) => {
                const isActive = activeCategory === cat;
                const catColor = getCategoryColor(cat);
                if (isActive) {
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className="h-9 rounded-full border px-4 text-sm font-semibold text-white transition-colors"
                      style={{
                        backgroundColor: catColor || 'hsl(160 100% 39%)',
                        borderColor: catColor || 'hsl(160 100% 39%)',
                      }}
                    >
                      {cat}
                    </button>
                  );
                }
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className="h-9 rounded-full border border-neutral-300 bg-transparent px-4 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900 dark:border-white/15 dark:text-white/70 dark:hover:border-white/30 dark:hover:text-white"
                  >
                    {cat}
                  </button>
                );
              })}
            </nav>
          )}

          {isSearching && (
            <p className="mb-6 text-sm text-neutral-500 dark:text-white/40">
              {matched.length}{' '}
              {matched.length === 1
                ? t.resultsSingular(search.trim())
                : t.resultsPlural(search.trim())}
            </p>
          )}

          {/* ── DESTAQUES (esq 2/3) + MAIS LIDOS (dir 1/3) ──────────────────── */}
          {!isSearching && featured && (
            <section className="mb-14">
              <div className="mb-5 flex items-center gap-2">
                <Star className="h-5 w-5 fill-primary text-primary" />
                <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                  {t.featured}
                </h2>
              </div>
              <BlogPostCard
                post={featured}
                categoryColors={categoryColors ?? []}
                variant="hero"
              />
            </section>
          )}

          {/* ── RECENTES / RESULTADOS — grade 3 colunas + sidebar ───────────── */}
          <div className="grid gap-10 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {!isSearching && (
                <h2 className="mb-6 text-lg font-bold text-neutral-900 dark:text-white">
                  {activeCategory === 'Todos' ? t.recent : activeCategory}
                </h2>
              )}

              {isLoading ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-72 animate-pulse rounded-2xl bg-neutral-200/70 dark:bg-white/[0.04]"
                    />
                  ))}
                </div>
              ) : gridPosts.length === 0 ? (
                <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center dark:border-white/10 dark:bg-white/[0.02]">
                  <Newspaper className="mx-auto mb-4 h-10 w-10 text-neutral-300 dark:text-white/20" />
                  <p className="text-neutral-500 dark:text-white/50">
                    {isSearching
                      ? t.emptySearch
                      : (posts?.length ?? 0) === 0
                        ? t.emptyAll
                        : t.emptyCategory}
                  </p>
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2">
                  {gridPosts.map((post) => (
                    <BlogPostCard
                      key={post.id}
                      post={post}
                      categoryColors={categoryColors ?? []}
                    />
                  ))}
                </div>
              )}

              {/* CTA inline (mobile, onde a sidebar fica embaixo) */}
              <div className="mt-10 rounded-2xl border border-neutral-200 bg-white p-6 text-center lg:hidden dark:border-primary/25 dark:bg-[hsl(0,0%,8%)] dark:bg-gradient-to-br dark:from-primary/[0.12] dark:to-primary/[0.03]">
                <h3 className="mb-2 text-lg font-bold text-neutral-900 dark:text-white">
                  {t.ctaMobileTitle}
                </h3>
                <p className="mb-5 text-sm text-neutral-600 dark:text-white/50">
                  {t.ctaMobileBody}
                </p>
                <Link
                  to="/cadastro?origem=Blog"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t.ctaTrialNoCard} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <BlogSidebar categoryColors={categoryColors ?? []} />
              </div>
            </div>
          </div>
        </main>

        {/* Rodapé sempre escuro sólido. Wrapper `dark` + bg escuro garante
            legibilidade no blog-claro e no blog-dark. Sem tocar no
            LandingFooter compartilhado. */}
        <div className="dark bg-[hsl(0,0%,6%)]">
          <LandingFooter />
        </div>
      </div>
      <WhatsAppFloatingButton />
    </div>
  );
}

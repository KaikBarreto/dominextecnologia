import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, Eye, Heart, MessageCircle, Search, Star, Newspaper, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { captureUtmParams } from '@/lib/whatsapp';
import LandingFooter from '@/components/landing/LandingFooter';
import WhatsAppFloatingButton from '@/components/landing/WhatsAppFloatingButton';
import { BlogSidebar } from '@/components/blog/BlogSidebar';
import BlogNavbar from '@/components/blog/BlogNavbar';
import { useBlogTheme } from '@/components/blog/useBlogTheme';

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

type BlogPostRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  category: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  view_count: number | null;
  likes_count: number | null;
  comments_count: number | null;
};

type CategoryColor = { name: string; color: string };

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const CategoryBadge = ({
  category,
  categoryColors,
}: {
  category: string;
  categoryColors: CategoryColor[];
}) => {
  const color = categoryColors.find((c) => c.name === category)?.color || 'hsl(160 100% 39%)';
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {category}
    </span>
  );
};

const PostStats = ({ post }: { post: BlogPostRow }) => (
  <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-white/40">
    {(post.view_count ?? 0) > 0 && (
      <span className="flex items-center gap-1">
        <Eye className="h-3 w-3" />
        {(post.view_count ?? 0).toLocaleString('pt-BR')}
      </span>
    )}
    {(post.likes_count ?? 0) > 0 && (
      <span className="flex items-center gap-1">
        <Heart className="h-3 w-3" />
        {post.likes_count}
      </span>
    )}
    {(post.comments_count ?? 0) > 0 && (
      <span className="flex items-center gap-1">
        <MessageCircle className="h-3 w-3" />
        {post.comments_count}
      </span>
    )}
  </div>
);

export default function Blog() {
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [search, setSearch] = useState('');
  const { theme, toggleTheme } = useBlogTheme();

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

  const { data: posts, isLoading } = useQuery({
    queryKey: ['blog-posts-public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select(
          'id, title, slug, excerpt, category, cover_image_url, published_at, view_count, likes_count, comments_count'
        )
        .eq('status', 'published')
        .order('published_at', { ascending: false });
      if (error) throw error;
      return (data || []) as BlogPostRow[];
    },
  });

  const { data: categoryColors = [] } = useQuery({
    queryKey: ['blog-categories-with-colors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_categories')
        .select('name, color')
        .order('name');
      if (error) return [];
      return (data || []).map((c) => ({
        name: c.name,
        color: c.color || 'hsl(160 100% 39%)',
      })) as CategoryColor[];
    },
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

  const allCategories = ['Todos', ...categoryColors.map((c) => c.name)];

  // Destaque só na vista padrão ("Todos", sem busca).
  const showFeatured = activeCategory === 'Todos' && !isSearching && (posts?.length ?? 0) > 0;
  const featured = showFeatured ? posts![0] : undefined;
  const gridPosts = showFeatured ? matched.slice(1) : matched;

  const getCategoryColor = (catName: string) =>
    catName === 'Todos' ? undefined : categoryColors.find((c) => c.name === catName)?.color;

  return (
    // O tema do blog controla `.dark` no <html> (useBlogTheme), pra as variantes
    // `dark:` resolverem de verdade mesmo com o `.dark` global do index.html.
    // O container raiz nasce com bg claro OPACO (bg-neutral-50) pra não vazar o
    // fundo escuro do body por baixo enquanto o tema é light.
    <div style={DOMINEX_BRAND_VARS}>
      <div className="relative min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[hsl(0,0%,4%)] dark:text-white">
        <BlogNavbar theme={theme} onToggleTheme={toggleTheme} />

        {/* Header */}
        <section className="relative overflow-hidden pb-10 pt-12">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(160,100%,39%,0.07)_0%,transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,hsl(160,100%,39%,0.08)_0%,transparent_70%)]" />
          <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-[hsl(160,80%,55%)] px-4 py-1.5">
              <Newspaper className="h-4 w-4 text-white" />
              <span className="text-xs font-semibold text-white">Blog da Dominex</span>
            </div>
            <h1 className="text-3xl font-bold leading-[1.12] tracking-tight text-neutral-900 sm:text-4xl lg:text-5xl dark:text-white">
              Conteúdo pra quem{' '}
              <span className="bg-gradient-to-r from-primary to-[hsl(160,70%,40%)] bg-clip-text text-transparent dark:to-[hsl(160,80%,55%)]">
                domina o campo
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg dark:text-white/50">
              Ordem de serviço, PMOC, gestão de equipe e como tirar a operação do papel.
            </p>

            {/* Busca */}
            <div className="relative mx-auto mt-8 max-w-md">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-white/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar artigos..."
                className="w-full rounded-full border border-neutral-300 bg-white py-3 pl-11 pr-4 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-primary/60 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/40 dark:focus:border-primary/50"
              />
            </div>
          </div>
        </section>

        <main className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="space-y-10 lg:col-span-2">
              {/* Em destaque */}
              {featured && (
                <section>
                  <div className="mb-5 flex items-center gap-2">
                    <Star className="h-5 w-5 fill-primary text-primary" />
                    <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Em destaque</h2>
                  </div>
                  <Link
                    to={`/blog/${featured.slug}`}
                    className="group block overflow-hidden rounded-2xl border border-neutral-200 bg-white transition-colors hover:border-primary/40 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-primary/30"
                  >
                    {featured.cover_image_url ? (
                      <img
                        src={featured.cover_image_url}
                        alt={featured.title}
                        className="h-56 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-56 w-full items-center justify-center bg-gradient-to-br from-primary/10 to-[hsl(160,70%,40%)]/15 dark:from-primary/15 dark:to-[hsl(160,80%,25%)]/20">
                        <Newspaper className="h-12 w-12 text-primary/30" />
                      </div>
                    )}
                    <div className="p-6">
                      <div className="mb-3 flex flex-wrap items-center gap-3">
                        {featured.category && (
                          <CategoryBadge category={featured.category} categoryColors={categoryColors} />
                        )}
                        {featured.published_at && (
                          <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-white/40">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(featured.published_at), 'dd/MM/yyyy', { locale: ptBR })}
                          </span>
                        )}
                      </div>
                      <h3 className="mb-2 line-clamp-2 text-xl font-bold text-neutral-900 transition-colors group-hover:text-primary dark:text-white">
                        {featured.title}
                      </h3>
                      {featured.excerpt && (
                        <p className="mb-3 line-clamp-2 text-sm text-neutral-600 dark:text-white/50">
                          {featured.excerpt}
                        </p>
                      )}
                      <PostStats post={featured} />
                    </div>
                  </Link>
                </section>
              )}

              {/* Filtro de categorias (some durante a busca) */}
              {!isSearching && allCategories.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {allCategories.map((cat) => {
                    const isActive = activeCategory === cat;
                    const catColor = getCategoryColor(cat);
                    if (isActive) {
                      return (
                        <button
                          key={cat}
                          onClick={() => setActiveCategory(cat)}
                          className="h-8 rounded-full border px-4 text-xs font-medium text-white transition-colors"
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
                        className="h-8 rounded-full border border-neutral-300 bg-transparent px-4 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900 dark:border-white/15 dark:text-white/70 dark:hover:border-white/30 dark:hover:text-white"
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Lista */}
              <section>
                {isSearching && (
                  <p className="mb-4 text-sm text-neutral-500 dark:text-white/40">
                    {matched.length} resultado{matched.length === 1 ? '' : 's'} para “{search.trim()}”
                  </p>
                )}

                {isLoading ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-64 animate-pulse rounded-xl bg-neutral-200/70 dark:bg-white/[0.04]"
                      />
                    ))}
                  </div>
                ) : gridPosts.length === 0 ? (
                  <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center dark:border-white/10 dark:bg-white/[0.02]">
                    <Newspaper className="mx-auto mb-4 h-10 w-10 text-neutral-300 dark:text-white/20" />
                    <p className="text-neutral-500 dark:text-white/50">
                      {isSearching
                        ? 'Nenhum artigo encontrado pra essa busca.'
                        : (posts?.length ?? 0) === 0
                          ? 'Nenhum artigo ainda. Volte em breve.'
                          : 'Nenhum artigo nessa categoria.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {gridPosts.map((post) => (
                      <Link
                        key={post.id}
                        to={`/blog/${post.slug}`}
                        className="group block overflow-hidden rounded-xl border border-neutral-200 bg-white transition-colors hover:border-primary/40 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-primary/30"
                      >
                        {post.cover_image_url ? (
                          <img
                            src={post.cover_image_url}
                            alt={post.title}
                            className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-40 w-full items-center justify-center bg-gradient-to-br from-primary/10 to-[hsl(160,70%,40%)]/15 dark:from-primary/15 dark:to-[hsl(160,80%,25%)]/20">
                            <Newspaper className="h-8 w-8 text-primary/25" />
                          </div>
                        )}
                        <div className="p-4">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            {post.category && (
                              <CategoryBadge category={post.category} categoryColors={categoryColors} />
                            )}
                            {post.published_at && (
                              <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-white/40">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(post.published_at), 'dd/MM/yyyy', { locale: ptBR })}
                              </span>
                            )}
                          </div>
                          <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-neutral-900 transition-colors group-hover:text-primary dark:text-white">
                            {post.title}
                          </h3>
                          {post.excerpt && (
                            <p className="mb-3 line-clamp-2 text-xs text-neutral-600 dark:text-white/45">
                              {post.excerpt}
                            </p>
                          )}
                          <PostStats post={post} />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {/* CTA inline (mobile, onde a sidebar fica embaixo) */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center lg:hidden dark:border-primary/20 dark:bg-primary/[0.06]">
                <h3 className="mb-2 text-lg font-bold text-neutral-900 dark:text-white">
                  Tire sua operação do papel
                </h3>
                <p className="mb-5 text-sm text-neutral-600 dark:text-white/50">
                  Teste a Dominex de graça e veja a ordem de serviço no celular do técnico.
                </p>
                <Link
                  to="/cadastro?origem=Blog"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Teste grátis 14 dias, sem cartão <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <BlogSidebar categoryColors={categoryColors} />
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

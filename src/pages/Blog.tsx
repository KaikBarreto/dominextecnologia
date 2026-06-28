import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, Eye, Heart, MessageCircle, Search, Star, Newspaper, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { captureUtmParams } from '@/lib/whatsapp';
import LandingNavbar from '@/components/landing/LandingNavbar';
import LandingFooter from '@/components/landing/LandingFooter';
import WhatsAppFloatingButton from '@/components/landing/WhatsAppFloatingButton';
import DarkVeilBackground from '@/components/ui/DarkVeilBackground';
import { BlogSidebar } from '@/components/blog/BlogSidebar';

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
  <div className="flex items-center gap-3 text-xs text-white/40">
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
    <div className="relative min-h-screen" style={DOMINEX_BRAND_VARS}>
      <div className="fixed inset-0 z-0 bg-[hsl(0,0%,4%)]">
        <DarkVeilBackground hueShift={53} speed={0.5} />
        <div className="absolute inset-0 bg-[hsl(0,0%,4%)]/60 pointer-events-none" />
      </div>

      <div className="relative z-10">
        <LandingNavbar />

        {/* Header */}
        <section className="relative pt-28 pb-10 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(160,100%,39%,0.08)_0%,transparent_70%)]" />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-[hsl(160,80%,55%)] px-4 py-1.5 mb-6">
              <Newspaper className="h-4 w-4 text-white" />
              <span className="text-xs font-semibold text-white">Blog da Dominex</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-[1.12] tracking-tight">
              Conteúdo pra quem{' '}
              <span className="bg-gradient-to-r from-primary to-[hsl(160,80%,55%)] bg-clip-text text-transparent">
                domina o campo
              </span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-white/50 max-w-2xl mx-auto leading-relaxed">
              Ordem de serviço, PMOC, gestão de equipe e como tirar a operação do papel.
            </p>

            {/* Busca */}
            <div className="mt-8 max-w-md mx-auto relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar artigos..."
                className="w-full rounded-full border border-white/15 bg-white/[0.04] pl-11 pr-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>
        </section>

        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-24">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-10">
              {/* Em destaque */}
              {featured && (
                <section>
                  <div className="flex items-center gap-2 mb-5">
                    <Star className="h-5 w-5 text-primary fill-primary" />
                    <h2 className="text-lg font-bold text-white">Em destaque</h2>
                  </div>
                  <Link
                    to={`/blog/${featured.slug}`}
                    className="group block rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02] hover:border-primary/30 transition-colors"
                  >
                    {featured.cover_image_url ? (
                      <img
                        src={featured.cover_image_url}
                        alt={featured.title}
                        className="w-full h-56 object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-56 bg-gradient-to-br from-primary/15 to-[hsl(160,80%,25%)]/20 flex items-center justify-center">
                        <Newspaper className="h-12 w-12 text-primary/30" />
                      </div>
                    )}
                    <div className="p-6">
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        {featured.category && (
                          <CategoryBadge category={featured.category} categoryColors={categoryColors} />
                        )}
                        {featured.published_at && (
                          <span className="text-xs text-white/40 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(featured.published_at), 'dd/MM/yyyy', { locale: ptBR })}
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-xl text-white group-hover:text-primary transition-colors line-clamp-2 mb-2">
                        {featured.title}
                      </h3>
                      {featured.excerpt && (
                        <p className="text-sm text-white/50 line-clamp-2 mb-3">{featured.excerpt}</p>
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
                    return (
                      <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className="rounded-full text-xs h-8 px-4 font-medium border transition-colors"
                        style={
                          isActive
                            ? {
                                backgroundColor: catColor || 'hsl(160 100% 39%)',
                                borderColor: catColor || 'hsl(160 100% 39%)',
                                color: 'white',
                              }
                            : {
                                backgroundColor: 'transparent',
                                borderColor: 'rgba(255,255,255,0.15)',
                                color: 'rgba(255,255,255,0.7)',
                              }
                        }
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
                  <p className="text-sm text-white/40 mb-4">
                    {matched.length} resultado{matched.length === 1 ? '' : 's'} para “{search.trim()}”
                  </p>
                )}

                {isLoading ? (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-64 rounded-xl bg-white/[0.04] animate-pulse" />
                    ))}
                  </div>
                ) : gridPosts.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center">
                    <Newspaper className="h-10 w-10 text-white/20 mx-auto mb-4" />
                    <p className="text-white/50">
                      {isSearching
                        ? 'Nenhum artigo encontrado pra essa busca.'
                        : (posts?.length ?? 0) === 0
                          ? 'Nenhum artigo ainda. Volte em breve.'
                          : 'Nenhum artigo nessa categoria.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {gridPosts.map((post) => (
                      <Link
                        key={post.id}
                        to={`/blog/${post.slug}`}
                        className="group block rounded-xl overflow-hidden border border-white/10 bg-white/[0.02] hover:border-primary/30 transition-colors"
                      >
                        {post.cover_image_url ? (
                          <img
                            src={post.cover_image_url}
                            alt={post.title}
                            className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-40 bg-gradient-to-br from-primary/15 to-[hsl(160,80%,25%)]/20 flex items-center justify-center">
                            <Newspaper className="h-8 w-8 text-primary/25" />
                          </div>
                        )}
                        <div className="p-4">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            {post.category && (
                              <CategoryBadge category={post.category} categoryColors={categoryColors} />
                            )}
                            {post.published_at && (
                              <span className="text-xs text-white/40 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(post.published_at), 'dd/MM/yyyy', { locale: ptBR })}
                              </span>
                            )}
                          </div>
                          <h3 className="font-semibold text-white group-hover:text-primary transition-colors line-clamp-2 text-sm mb-1">
                            {post.title}
                          </h3>
                          {post.excerpt && (
                            <p className="text-xs text-white/45 line-clamp-2 mb-3">{post.excerpt}</p>
                          )}
                          <PostStats post={post} />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              {/* CTA inline (mobile, onde a sidebar fica embaixo) */}
              <div className="lg:hidden rounded-2xl border border-primary/20 bg-primary/[0.06] p-6 text-center">
                <h3 className="text-lg font-bold text-white mb-2">
                  Tire sua operação do papel
                </h3>
                <p className="text-sm text-white/50 mb-5">
                  Teste a Dominex de graça e veja a ordem de serviço no celular do técnico.
                </p>
                <Link
                  to="/cadastro?origem=Blog"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
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

        <LandingFooter />
      </div>
      <WhatsAppFloatingButton />
    </div>
  );
}

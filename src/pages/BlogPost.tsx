import { useParams, Link } from 'react-router-dom';
import { useRef, useEffect, useState, type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLocale } from '@/lib/i18n/useLocale';
import { localizePath } from '@/lib/i18n/paths';
import { DEFAULT_LOCALE, getLocaleDef, type LocaleCode } from '@/lib/i18n/locales';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Calendar,
  User,
  Share2,
  ArrowLeft,
  ArrowRight,
  Heart,
  MessageCircle,
  Send,
  Newspaper,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { captureUtmParams } from '@/lib/whatsapp';
import LandingFooter from '@/components/landing/LandingFooter';
import WhatsAppFloatingButton from '@/components/landing/WhatsAppFloatingButton';
import { BlogSidebar } from '@/components/blog/BlogSidebar';
import { BlogTableOfContents } from '@/components/blog/BlogTableOfContents';
import { RelatedPosts } from '@/components/blog/RelatedPosts';
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

// Domínio canônico do site público (com www — é o que o projeto usa).
const SITE_URL = 'https://www.dominex.app';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

/** Uma versão traduzida do mesmo artigo (mesmo translation_group). */
export interface BlogPostAlternate {
  locale: LocaleCode;
  slug: string;
}

/**
 * Props OPCIONAIS injetadas pelo SSG (entry-ssg) pra prerender do post SEM fetch
 * no client: o próprio post + as versões traduzidas (alternates por
 * translation_group). Quando presentes, o conteúdo e o hreflang já saem no HTML
 * estático. No client, o React Query revalida em background.
 */
export interface BlogPostProps {
  initialPost?: Record<string, unknown> | null;
  initialAlternates?: BlogPostAlternate[];
}

function getSessionId() {
  let id = localStorage.getItem('blog_session_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('blog_session_id', id);
  }
  return id;
}

/** Define ou cria uma <meta name=...> / <meta property=...>; devolve restaurador. */
function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  const created = !el;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  const prev = el.getAttribute('content');
  el.setAttribute('content', value);
  return () => {
    if (created) el?.remove();
    else if (prev !== null) el!.setAttribute('content', prev);
  };
}

export default function BlogPost({ initialPost, initialAlternates }: BlogPostProps = {}) {
  const { slug } = useParams();
  const contentRef = useRef<HTMLDivElement>(null);
  const viewTracked = useRef(false);
  const queryClient = useQueryClient();
  const sessionId = getSessionId();
  const { theme, toggleTheme } = useBlogTheme();
  // Idioma da URL: resolve o post por (slug + locale). Sob /es/blog/... só a
  // versão es; se não existir nesse idioma, cai no 404 (NUNCA no pt-br).
  // `toLocale` prefixa links internos pro idioma atual (Voltar ao blog, CTA).
  const { locale, localizePath: toLocale, messages } = useLocale();
  const t = messages.blog;

  const [commentName, setCommentName] = useState('');
  const [commentContent, setCommentContent] = useState('');
  const [commentSent, setCommentSent] = useState(false);

  const { data: post, isLoading } = useQuery({
    queryKey: ['blog-post-public', slug, locale],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('slug', slug!)
        .eq('locale', locale)
        .eq('status', 'published')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
    initialData: initialPost as never,
  });

  // Versões traduzidas do MESMO artigo (mesmo translation_group), só publicadas.
  // Alimenta o hreflang recíproco (só idiomas que realmente têm tradução).
  const translationGroup = (post as { translation_group?: string } | null)?.translation_group;
  const { data: alternates = initialAlternates ?? [] } = useQuery({
    queryKey: ['blog-post-alternates', translationGroup],
    queryFn: async () => {
      if (!translationGroup) return [];
      const { data, error } = await supabase
        .from('blog_posts')
        .select('locale, slug')
        .eq('translation_group', translationGroup)
        .eq('status', 'published');
      if (error) return [];
      return (data || []) as BlogPostAlternate[];
    },
    enabled: !!translationGroup,
    initialData: initialAlternates,
  });

  const { data: userLike } = useQuery({
    queryKey: ['blog-post-like', post?.id, sessionId],
    queryFn: async () => {
      if (!post?.id) return null;
      const { data } = await supabase
        .from('blog_post_likes')
        .select('id')
        .eq('post_id', post.id)
        .eq('session_id', sessionId)
        .maybeSingle();
      return data;
    },
    enabled: !!post?.id,
  });

  const { data: comments = [] } = useQuery({
    queryKey: ['blog-post-comments', post?.id],
    queryFn: async () => {
      if (!post?.id) return [];
      const { data, error } = await supabase
        .from('blog_post_comments')
        .select('*')
        .eq('post_id', post.id)
        .eq('is_approved', true)
        .order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    },
    enabled: !!post?.id,
  });

  const { data: categoryColors = [] } = useQuery({
    queryKey: ['blog-categories-with-colors'],
    queryFn: async () => {
      const { data } = await supabase.from('blog_categories').select('name, color').order('name');
      return (data || []).map((c) => ({
        name: c.name,
        color: c.color || 'hsl(160 100% 39%)',
      })) as { name: string; color: string }[];
    },
  });

  const toggleLikeMutation = useMutation({
    mutationFn: async () => {
      if (!post?.id) return;
      if (userLike) {
        await supabase.from('blog_post_likes').delete().eq('id', userLike.id);
      } else {
        await supabase.from('blog_post_likes').insert({ post_id: post.id, session_id: sessionId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blog-post-like', post?.id] });
      queryClient.invalidateQueries({ queryKey: ['blog-post-public', slug] });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      if (!post?.id || !commentName.trim() || !commentContent.trim()) return;
      // Comentário nasce pendente (is_approved=false por padrão); só aparece
      // depois que o admin aprovar.
      const { error } = await supabase.from('blog_post_comments').insert({
        post_id: post.id,
        author_name: commentName.trim(),
        content: commentContent.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCommentContent('');
      setCommentName('');
      setCommentSent(true);
      toast.success(t.toastCommentSent);
    },
    onError: () => toast.error(t.toastCommentError),
  });

  useEffect(() => {
    captureUtmParams(window.location.search);
    document.documentElement.classList.add('landing-scrollbar');
    window.scrollTo(0, 0);
    return () => {
      document.documentElement.classList.remove('landing-scrollbar');
    };
  }, []);

  useEffect(() => {
    if (!slug || viewTracked.current) return;
    viewTracked.current = true;
    supabase.rpc('increment_blog_post_views', { post_slug: slug }).then(() => {});
  }, [slug]);

  // SEO por post: título, description, canonical, <html lang>, Open Graph,
  // JSON-LD Article e hreflang recíproco por translation_group. Tudo injetado no
  // effect e removido no cleanup (padrão do projeto, sem helmet).
  useEffect(() => {
    if (!post) return;

    const prevTitle = document.title;
    const title = post.meta_title || post.title;
    const description = post.meta_description || post.excerpt || '';
    // Canônica = a própria URL do idioma (pt-br sem prefixo, outros com /xx/).
    const url = `${SITE_URL}${localizePath(`/blog/${post.slug}`, locale)}`;
    const image = post.cover_image_url || DEFAULT_OG_IMAGE;

    document.title = `${title} — Blog Dominex`;

    // <html lang> do idioma da página (restaurado no cleanup).
    const htmlEl = document.documentElement;
    const prevHtmlLang = htmlEl.getAttribute('lang');
    htmlEl.setAttribute('lang', getLocaleDef(locale).htmlLang);

    const restorers: Array<() => void> = [];
    restorers.push(setMeta('name', 'description', description));
    restorers.push(setMeta('property', 'og:type', 'article'));
    restorers.push(setMeta('property', 'og:title', title));
    restorers.push(setMeta('property', 'og:description', description));
    restorers.push(setMeta('property', 'og:url', url));
    restorers.push(setMeta('property', 'og:image', image));
    restorers.push(setMeta('name', 'twitter:card', 'summary_large_image'));
    restorers.push(setMeta('name', 'twitter:title', title));
    restorers.push(setMeta('name', 'twitter:description', description));
    restorers.push(setMeta('name', 'twitter:image', image));

    // canonical
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const canonicalCreated = !canonical;
    const prevCanonical = canonical?.getAttribute('href') ?? null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);

    // hreflang recíproco por translation_group: um <link rel="alternate"> por
    // versão PUBLICADA existente (cada uma com seu PRÓPRIO slug), mais x-default =
    // versão pt-br (se existir). NÃO emite alternate pra idioma sem tradução.
    const hreflangEls: HTMLLinkElement[] = [];
    const addAlternate = (hreflang: string, href: string) => {
      const link = document.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', hreflang);
      link.setAttribute('href', href);
      link.setAttribute('data-blog-hreflang', 'true');
      document.head.appendChild(link);
      hreflangEls.push(link);
    };
    // Fallback: se ainda não temos os alternates (client sem SSG), o próprio post
    // é a única versão conhecida.
    const versions: BlogPostAlternate[] =
      alternates.length > 0 ? alternates : [{ locale, slug: post.slug }];
    for (const v of versions) {
      addAlternate(
        getLocaleDef(v.locale).htmlLang,
        `${SITE_URL}${localizePath(`/blog/${v.slug}`, v.locale)}`,
      );
    }
    const ptBr = versions.find((v) => v.locale === DEFAULT_LOCALE);
    // x-default aponta pra versão pt-br; sem pt-br, pra própria canônica.
    addAlternate(
      'x-default',
      ptBr ? `${SITE_URL}${localizePath(`/blog/${ptBr.slug}`, DEFAULT_LOCALE)}` : url,
    );

    // JSON-LD Article
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.setAttribute('data-blog-jsonld', 'true');
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description,
      image,
      inLanguage: getLocaleDef(locale).htmlLang,
      datePublished: post.published_at || post.created_at,
      dateModified: post.updated_at || post.published_at || post.created_at,
      author: { '@type': 'Organization', name: post.author_name || 'Dominex' },
      publisher: {
        '@type': 'Organization',
        name: 'Dominex',
        logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    });
    document.head.appendChild(ld);

    return () => {
      document.title = prevTitle;
      restorers.forEach((r) => r());
      if (canonicalCreated) canonical?.remove();
      else if (prevCanonical !== null) canonical!.setAttribute('href', prevCanonical);
      if (prevHtmlLang !== null) htmlEl.setAttribute('lang', prevHtmlLang);
      hreflangEls.forEach((el) => el.remove());
      ld.remove();
    };
  }, [post, locale, alternates]);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copiado!');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  };

  if (isLoading) {
    return (
      <div>
        <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-[hsl(0,0%,4%)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div style={DOMINEX_BRAND_VARS}>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 px-4 text-center text-neutral-900 dark:bg-[hsl(0,0%,4%)] dark:text-white">
          <Newspaper className="h-12 w-12 text-neutral-300 dark:text-white/20" />
          <h1 className="text-xl font-bold text-neutral-900 dark:text-white">Artigo não encontrado</h1>
          <p className="max-w-sm text-neutral-600 dark:text-white/50">
            Esse artigo pode ter sido removido ou o endereço está errado.
          </p>
          <Link to={toLocale('/blog')}>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              Voltar ao blog
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const catColor = categoryColors.find((c) => c.name === post.category)?.color || 'hsl(160 100% 39%)';
  const hasLiked = !!userLike;

  return (
    // O tema do blog controla `.dark` no <html> (useBlogTheme), pra as variantes
    // `dark:` resolverem de verdade mesmo com o `.dark` global do index.html.
    // Container raiz com bg claro OPACO (bg-neutral-50) pra não vazar o body escuro.
    <div style={DOMINEX_BRAND_VARS}>
      <div className="relative min-h-screen bg-neutral-50 text-neutral-900 dark:bg-[hsl(0,0%,4%)] dark:text-white">
        <BlogNavbar theme={theme} onToggleTheme={toggleTheme} />

        <div className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-6 lg:px-8 2xl:max-w-[1550px]">
          {/* Layout:
              - mobile: 1 coluna (só artigo, sidebar empilha abaixo)
              - lg → 2xl: layout ORIGINAL [conteúdo 1fr | sidebar 320px], SEM TOC
              - 2xl+: alarga o container e adiciona o TOC à esquerda no espaço EXTRA,
                travando o conteúdo em 856px (mesma largura de antes do TOC) e a
                sidebar em 320px. O conteúdo NÃO encolhe vs. o layout original. */}
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[230px_minmax(0,856px)_320px]">
            {/* Índice (estrutura do documento) — só quando há espaço extra (2xl+), à esquerda.
                O próprio BlogTableOfContents já é sticky internamente. */}
            <aside className="hidden 2xl:block">
              <BlogTableOfContents contentRef={contentRef} contentKey={post.id} />
            </aside>

            <article className="min-w-0">
              <Link
                to={toLocale('/blog')}
                className="mb-6 inline-flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-primary dark:text-white/50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar ao blog
              </Link>

              {post.cover_image_url && (
                <img
                  src={post.cover_image_url}
                  alt={post.title}
                  className="mb-8 h-56 w-full rounded-2xl border border-neutral-200 object-cover md:h-80 dark:border-white/10"
                />
              )}

              <div className="mb-4 flex flex-wrap items-center gap-3">
                {post.category && (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: catColor }}
                  >
                    {post.category}
                  </span>
                )}
                {post.published_at && (
                  <span className="flex items-center gap-1 text-sm text-neutral-500 dark:text-white/40">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(new Date(post.published_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </span>
                )}
                {post.author_name && (
                  <span className="flex items-center gap-1 text-sm text-neutral-500 dark:text-white/40">
                    <User className="h-3.5 w-3.5" />
                    {post.author_name}
                  </span>
                )}
                <button
                  onClick={handleShare}
                  className="ml-auto flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-primary dark:text-white/40"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Compartilhar
                </button>
              </div>

              <h1 className="mb-8 text-3xl font-bold leading-tight text-neutral-900 md:text-4xl dark:text-white">
                {post.title}
              </h1>

              <div
                ref={contentRef}
                className="blog-content prose prose-sm max-w-none prose-headings:text-neutral-900 prose-a:text-primary prose-strong:text-neutral-900 prose-img:rounded-xl sm:prose-base dark:prose-invert dark:prose-headings:text-white dark:prose-strong:text-white"
                dangerouslySetInnerHTML={{ __html: post.content || '' }}
              />

              {/* Like + contagem */}
              <div className="mt-10 flex items-center gap-4 border-b border-t border-neutral-200 py-4 dark:border-white/10">
                <button
                  onClick={() => toggleLikeMutation.mutate()}
                  disabled={toggleLikeMutation.isPending}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 transition-colors ${
                    hasLiked
                      ? 'border-red-500 bg-red-500 text-white dark:border-red-500 dark:bg-red-500 dark:text-white'
                      : 'border-neutral-300 text-neutral-600 hover:border-red-500/60 hover:text-red-500 dark:border-white/15 dark:text-white/60 dark:hover:border-red-500/60 dark:hover:text-red-500'
                  }`}
                >
                  <Heart className={`h-4 w-4 ${hasLiked ? 'fill-current text-white' : ''}`} />
                  <span className="text-sm font-medium">{post.likes_count || 0}</span>
                </button>
                <span className="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-white/40">
                  <MessageCircle className="h-4 w-4" />
                  {t.commentCount(comments.length)}
                </span>
              </div>

              {/* Comentários */}
              <div className="mt-8">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-neutral-900 dark:text-white">
                  <MessageCircle className="h-5 w-5" />
                  {t.commentsTitle(comments.length)}
                </h2>

                {commentSent ? (
                  <div className="mb-6 rounded-xl border border-primary/30 bg-primary/[0.06] p-4 text-sm text-neutral-700 dark:text-white/70">
                    {t.commentSentBanner}
                  </div>
                ) : (
                  <div className="mb-6 space-y-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <Input
                      placeholder={t.commentNamePlaceholder}
                      value={commentName}
                      onChange={(e) => setCommentName(e.target.value)}
                      className="border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/40"
                    />
                    <Textarea
                      placeholder={t.commentContentPlaceholder}
                      value={commentContent}
                      onChange={(e) => setCommentContent(e.target.value)}
                      rows={3}
                      className="border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/40"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] text-neutral-500 dark:text-white/35">
                        {t.commentDisclaimer}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => addCommentMutation.mutate()}
                        disabled={
                          !commentName.trim() ||
                          !commentContent.trim() ||
                          addCommentMutation.isPending
                        }
                        className="shrink-0 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {t.commentSubmit}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15">
                          <span className="text-xs font-bold text-primary">
                            {comment.author_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-neutral-800 dark:text-white/85">
                          {comment.author_name}
                        </span>
                        <span className="text-xs text-neutral-400 dark:text-white/35">
                          {format(new Date(comment.created_at), "dd/MM/yyyy 'às' HH:mm", {
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                      <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700 dark:text-white/65">
                        {comment.content}
                      </p>
                    </div>
                  ))}
                  {comments.length === 0 && !commentSent && (
                    <p className="py-6 text-center text-sm text-neutral-400 dark:text-white/35">
                      {t.commentEmpty}
                    </p>
                  )}
                </div>
              </div>

              {/* CTA final */}
              <div className="mt-12 rounded-2xl border border-neutral-200 bg-white p-8 text-center dark:border-primary/25 dark:bg-[hsl(0,0%,8%)] dark:bg-gradient-to-br dark:from-primary/[0.12] dark:to-primary/[0.03]">
                <h2 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-white">
                  {t.postCtaTitle}
                </h2>
                <p className="mx-auto mb-6 max-w-md text-neutral-600 dark:text-white/55">
                  {t.postCtaBody}
                </p>
                <Link
                  to="/cadastro?origem=Blog"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  {t.postCtaButton} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {/* Leia também — relacionados (mesma categoria primeiro, completa
                  com recentes). O equivalente em HTML sai também no SSR
                  (api/blog-post.js) pra link interno crawlável sem JS. */}
              <RelatedPosts
                slug={post.slug}
                category={post.category}
                categoryColors={categoryColors}
              />
            </article>

            {/* Sidebar direita: largura ORIGINAL (320px) em todos os breakpoints
                de desktop — sempre a última coluna do grid. */}
            <div>
              <div className="sticky top-24">
                <BlogSidebar categoryColors={categoryColors} />
              </div>
            </div>
          </div>
        </div>

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

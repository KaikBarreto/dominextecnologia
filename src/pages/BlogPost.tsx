import { useParams, Link } from 'react-router-dom';
import { useRef, useEffect, useState, type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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

const SITE_URL = 'https://dominex.app';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

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

export default function BlogPost() {
  const { slug } = useParams();
  const contentRef = useRef<HTMLDivElement>(null);
  const viewTracked = useRef(false);
  const queryClient = useQueryClient();
  const sessionId = getSessionId();
  const { theme, toggleTheme } = useBlogTheme();

  const [commentName, setCommentName] = useState('');
  const [commentContent, setCommentContent] = useState('');
  const [commentSent, setCommentSent] = useState(false);

  const { data: post, isLoading } = useQuery({
    queryKey: ['blog-post-public', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('slug', slug!)
        .eq('status', 'published')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
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
      toast.success('Comentário enviado! Aguardando aprovação.');
    },
    onError: () => toast.error('Não foi possível enviar o comentário. Tente novamente.'),
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

  // SEO por post: título, description, canonical, Open Graph e JSON-LD Article.
  // Tudo injetado no effect e removido no cleanup (padrão do projeto, sem helmet).
  useEffect(() => {
    if (!post) return;

    const prevTitle = document.title;
    const title = post.meta_title || post.title;
    const description = post.meta_description || post.excerpt || '';
    const url = `${SITE_URL}/blog/${post.slug}`;
    const image = post.cover_image_url || DEFAULT_OG_IMAGE;

    document.title = `${title} — Blog Dominex`;

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
      ld.remove();
    };
  }, [post]);

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
          <Link to="/blog">
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
                to="/blog"
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
                  {comments.length} comentário{comments.length === 1 ? '' : 's'}
                </span>
              </div>

              {/* Comentários */}
              <div className="mt-8">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-neutral-900 dark:text-white">
                  <MessageCircle className="h-5 w-5" />
                  Comentários ({comments.length})
                </h2>

                {commentSent ? (
                  <div className="mb-6 rounded-xl border border-primary/30 bg-primary/[0.06] p-4 text-sm text-neutral-700 dark:text-white/70">
                    Comentário enviado! Ele aparece aqui assim que for aprovado pela nossa equipe.
                  </div>
                ) : (
                  <div className="mb-6 space-y-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <Input
                      placeholder="Seu nome"
                      value={commentName}
                      onChange={(e) => setCommentName(e.target.value)}
                      className="border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/40"
                    />
                    <Textarea
                      placeholder="Deixe seu comentário..."
                      value={commentContent}
                      onChange={(e) => setCommentContent(e.target.value)}
                      rows={3}
                      className="border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-white/40"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] text-neutral-500 dark:text-white/35">
                        Seu comentário passa por aprovação antes de aparecer.
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
                        Comentar
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
                      Nenhum comentário ainda. Seja o primeiro!
                    </p>
                  )}
                </div>
              </div>

              {/* CTA final */}
              <div className="mt-12 rounded-2xl border border-neutral-200 bg-white p-8 text-center dark:border-primary/25 dark:bg-[hsl(0,0%,8%)] dark:bg-gradient-to-br dark:from-primary/[0.12] dark:to-primary/[0.03]">
                <h2 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-white">
                  Pronto pra tirar a operação do papel?
                </h2>
                <p className="mx-auto mb-6 max-w-md text-neutral-600 dark:text-white/55">
                  Teste a Dominex de graça por 14 dias e veja a ordem de serviço no celular do
                  técnico.
                </p>
                <Link
                  to="/cadastro?origem=Blog"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Teste grátis 14 dias, sem cartão <ArrowRight className="h-4 w-4" />
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

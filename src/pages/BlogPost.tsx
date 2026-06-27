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
      <div className="min-h-screen flex items-center justify-center bg-[hsl(0,0%,4%)]">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!post) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[hsl(0,0%,4%)] px-4 text-center"
        style={DOMINEX_BRAND_VARS}
      >
        <Newspaper className="h-12 w-12 text-white/20" />
        <h1 className="text-xl font-bold text-white">Artigo não encontrado</h1>
        <p className="text-white/50 max-w-sm">
          Esse artigo pode ter sido removido ou o endereço está errado.
        </p>
        <Link to="/blog">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            Voltar ao blog
          </Button>
        </Link>
      </div>
    );
  }

  const catColor = categoryColors.find((c) => c.name === post.category)?.color || 'hsl(160 100% 39%)';
  const hasLiked = !!userLike;

  return (
    <div className="relative min-h-screen" style={DOMINEX_BRAND_VARS}>
      <div className="fixed inset-0 z-0 bg-[hsl(0,0%,4%)]">
        <DarkVeilBackground hueShift={53} speed={0.5} />
        <div className="absolute inset-0 bg-[hsl(0,0%,4%)]/60 pointer-events-none" />
      </div>

      <div className="relative z-10">
        <LandingNavbar />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-28 pb-24">
          <div className="grid lg:grid-cols-3 gap-10">
            <article className="lg:col-span-2 min-w-0">
              <Link
                to="/blog"
                className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-primary transition-colors mb-6"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar ao blog
              </Link>

              {post.cover_image_url && (
                <img
                  src={post.cover_image_url}
                  alt={post.title}
                  className="w-full h-56 md:h-80 object-cover rounded-2xl mb-8 border border-white/10"
                />
              )}

              <div className="flex items-center gap-3 mb-4 flex-wrap">
                {post.category && (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: catColor }}
                  >
                    {post.category}
                  </span>
                )}
                {post.published_at && (
                  <span className="text-sm text-white/40 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(new Date(post.published_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </span>
                )}
                {post.author_name && (
                  <span className="text-sm text-white/40 flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    {post.author_name}
                  </span>
                )}
                <button
                  onClick={handleShare}
                  className="ml-auto flex items-center gap-1.5 text-xs text-white/40 hover:text-primary transition-colors"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Compartilhar
                </button>
              </div>

              <h1 className="text-3xl md:text-4xl font-bold mb-8 text-white leading-tight">
                {post.title}
              </h1>

              <div
                ref={contentRef}
                className="prose prose-invert prose-sm sm:prose-base max-w-none prose-headings:text-white prose-a:text-primary prose-strong:text-white prose-img:rounded-xl"
                dangerouslySetInnerHTML={{ __html: post.content || '' }}
              />

              {/* Like + contagem */}
              <div className="mt-10 flex items-center gap-4 border-t border-b border-white/10 py-4">
                <button
                  onClick={() => toggleLikeMutation.mutate()}
                  disabled={toggleLikeMutation.isPending}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-colors ${
                    hasLiked
                      ? 'bg-red-500/15 border-red-500/40 text-red-400'
                      : 'border-white/15 text-white/60 hover:border-red-500/40 hover:text-red-400'
                  }`}
                >
                  <Heart className={`h-4 w-4 ${hasLiked ? 'fill-red-400' : ''}`} />
                  <span className="text-sm font-medium">{post.likes_count || 0}</span>
                </button>
                <span className="flex items-center gap-1.5 text-sm text-white/40">
                  <MessageCircle className="h-4 w-4" />
                  {comments.length} comentário{comments.length === 1 ? '' : 's'}
                </span>
              </div>

              {/* Comentários */}
              <div className="mt-8">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Comentários ({comments.length})
                </h2>

                {commentSent ? (
                  <div className="rounded-xl border border-primary/30 bg-primary/[0.06] p-4 mb-6 text-sm text-white/70">
                    Comentário enviado! Ele aparece aqui assim que for aprovado pela nossa equipe.
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-6 space-y-3">
                    <Input
                      placeholder="Seu nome"
                      value={commentName}
                      onChange={(e) => setCommentName(e.target.value)}
                      className="bg-white/[0.04] border-white/15 text-white placeholder:text-white/40"
                    />
                    <Textarea
                      placeholder="Deixe seu comentário..."
                      value={commentContent}
                      onChange={(e) => setCommentContent(e.target.value)}
                      rows={3}
                      className="bg-white/[0.04] border-white/15 text-white placeholder:text-white/40"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] text-white/35">
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
                        className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
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
                      className="border border-white/10 bg-white/[0.02] rounded-xl p-4"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">
                            {comment.author_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="font-medium text-sm text-white/85">
                          {comment.author_name}
                        </span>
                        <span className="text-xs text-white/35">
                          {format(new Date(comment.created_at), "dd/MM/yyyy 'às' HH:mm", {
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-white/65 leading-relaxed whitespace-pre-line">
                        {comment.content}
                      </p>
                    </div>
                  ))}
                  {comments.length === 0 && !commentSent && (
                    <p className="text-center text-white/35 py-6 text-sm">
                      Nenhum comentário ainda. Seja o primeiro!
                    </p>
                  )}
                </div>
              </div>

              {/* CTA final */}
              <div className="mt-12 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.12] to-primary/[0.03] p-8 text-center">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Pronto pra tirar a operação do papel?
                </h2>
                <p className="text-white/55 mb-6 max-w-md mx-auto">
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
            </article>

            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <BlogSidebar categoryColors={categoryColors} />
              </div>
            </div>
          </div>
        </div>

        <LandingFooter />
      </div>
      <WhatsAppFloatingButton />
    </div>
  );
}

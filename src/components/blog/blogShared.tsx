// ─────────────────────────────────────────────────────────────────────────────
// Tipos e helpers COMPARTILHADOS do blog (listagem + post).
//
// Marca Dominex: verde #00C597 (hsl(160 100% 39%)) + escuros. NUNCA roxo.
// Tudo aqui é SSR-safe (sem window/effects no import) pra rodar no entry-ssg.
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from 'react-router-dom';
import { Calendar, User, Newspaper } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/** Verde da marca, fonte única quando uma categoria não tem cor própria. */
export const BRAND_GREEN = 'hsl(160 100% 39%)';

export type CategoryColor = { name: string; color: string };

export type BlogPostCardData = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  category: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  view_count?: number | null;
  likes_count?: number | null;
  comments_count?: number | null;
  author_name?: string | null;
  content?: string | null;
};

/** Resolve a cor de uma categoria; cai no verde da marca quando não há registro. */
export function categoryColorOf(
  category: string | null | undefined,
  categoryColors: CategoryColor[]
) {
  if (!category) return BRAND_GREEN;
  return categoryColors.find((c) => c.name === category)?.color || BRAND_GREEN;
}

/**
 * Estima o tempo de leitura a partir do conteúdo HTML (ou do excerpt como piso).
 * Tira as tags, conta palavras e divide por ~200 ppm. Mínimo 1 min.
 */
export function readingMinutes(content?: string | null, excerpt?: string | null) {
  const raw = (content && content.length > 0 ? content : excerpt) || '';
  const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return 1;
  const words = text.split(' ').length;
  return Math.max(1, Math.round(words / 200));
}

/** Data curta dd/MM/yyyy em pt-BR; vazio se não houver. */
export function shortDate(published_at: string | null | undefined) {
  if (!published_at) return '';
  try {
    return format(new Date(published_at), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return '';
  }
}

/** Badge de categoria SATURADO (preenchido na cor) + texto branco. Régua CEO. */
export function CategoryBadge({
  category,
  categoryColors,
  className = '',
}: {
  category: string;
  categoryColors: CategoryColor[];
  className?: string;
}) {
  const color = categoryColorOf(category, categoryColors);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white ${className}`}
      style={{ backgroundColor: color }}
    >
      {category}
    </span>
  );
}

/** Iniciais do autor pro avatar (ex.: "Equipe Dominex" → "ED"). */
function authorInitials(name?: string | null) {
  if (!name) return 'D';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || 'D';
}

/** Capa do card (imagem real ou placeholder verde com ícone). */
function CardCover({
  post,
  className,
}: {
  post: BlogPostCardData;
  className: string;
}) {
  if (post.cover_image_url) {
    return (
      <img
        src={post.cover_image_url}
        alt={post.title}
        className={`w-full object-cover transition-transform duration-300 group-hover:scale-105 ${className}`}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={`flex w-full items-center justify-center bg-gradient-to-br from-primary/10 to-[hsl(160,70%,40%)]/15 dark:from-primary/15 dark:to-[hsl(160,80%,25%)]/20 ${className}`}
    >
      <Newspaper className="h-10 w-10 text-primary/30" />
    </div>
  );
}

/** Rodapé do card: avatar + autor + data + tempo de leitura. */
function CardMeta({ post }: { post: BlogPostCardData }) {
  const mins = readingMinutes(post.content, post.excerpt);
  const date = shortDate(post.published_at);
  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500 dark:text-white/45">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
        {authorInitials(post.author_name)}
      </span>
      <span className="truncate font-medium text-neutral-600 dark:text-white/60">
        {post.author_name || 'Equipe Dominex'}
      </span>
      {date && (
        <>
          <span className="text-neutral-300 dark:text-white/20">•</span>
          <span className="whitespace-nowrap">{mins} min</span>
        </>
      )}
    </div>
  );
}

/**
 * Card de post padrão da listagem e do "Leia também".
 *
 * `variant`:
 *   - 'hero'    → destaque grande (capa alta, título grande, excerpt 3 linhas);
 *   - 'default' → card de grade (capa média, título, excerpt curto);
 *   - 'related' → idem default, usado no "Leia também".
 */
export function BlogPostCard({
  post,
  categoryColors,
  variant = 'default',
}: {
  post: BlogPostCardData;
  categoryColors: CategoryColor[];
  variant?: 'hero' | 'default' | 'related';
}) {
  const isHero = variant === 'hero';
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition-colors hover:border-primary/40 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-primary/30"
    >
      <CardCover post={post} className="aspect-[1200/630]" />
      <div className={`flex flex-1 flex-col ${isHero ? 'p-6' : 'p-5'}`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {post.category && (
            <CategoryBadge category={post.category} categoryColors={categoryColors} />
          )}
          {post.published_at && (
            <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-white/40">
              <Calendar className="h-3 w-3" />
              {shortDate(post.published_at)}
            </span>
          )}
        </div>
        <h3
          className={`font-bold text-neutral-900 transition-colors group-hover:text-primary dark:text-white ${
            isHero ? 'mb-3 line-clamp-3 text-xl sm:text-2xl' : 'mb-2 line-clamp-2 text-base'
          }`}
        >
          {post.title}
        </h3>
        {post.excerpt && (
          <p
            className={`text-neutral-600 dark:text-white/50 ${
              isHero ? 'line-clamp-3 text-sm sm:text-base' : 'line-clamp-2 text-sm'
            }`}
          >
            {post.excerpt}
          </p>
        )}
        <div className="mt-auto">
          <CardMeta post={post} />
        </div>
      </div>
    </Link>
  );
}

/** Item compacto da coluna "Mais lidos" (mini-thumb + badge + título + autor). */
export function MostReadItem({
  post,
  categoryColors,
}: {
  post: BlogPostCardData;
  categoryColors: CategoryColor[];
}) {
  return (
    <Link to={`/blog/${post.slug}`} className="group flex gap-3">
      <div className="aspect-[1200/630] w-24 flex-shrink-0 overflow-hidden rounded-lg">
        <CardCover post={post} className="h-full" />
      </div>
      <div className="min-w-0 flex-1">
        {post.category && (
          <CategoryBadge
            category={post.category}
            categoryColors={categoryColors}
            className="mb-1"
          />
        )}
        <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-neutral-800 transition-colors group-hover:text-primary dark:text-white/85">
          {post.title}
        </h4>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-neutral-500 dark:text-white/40">
          <User className="h-3 w-3" />
          {post.author_name || 'Equipe Dominex'}
        </p>
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rotas de MARKETING do site público (landing, segmentos, módulos, institucional).
//
// Fonte única consumida pelo runtime (useMarketingViewport) para decidir quando
// o viewport pode liberar o zoom de pinça (acessibilidade). O sistema logado e
// todo o resto do app continuam com o viewport FIXO (sensação de app nativo).
//
// IMPORTANTE: esta lista espelha as rotas de SSG (scripts/ssg.mjs + entry-ssg.tsx).
// Ao adicionar uma landing nova, atualize os dois lados.
// ─────────────────────────────────────────────────────────────────────────────

import { localeFromPath, stripLocale } from '@/lib/i18n/paths';
import { resolveSlug } from '@/lib/i18n/slugRegistry';

/** Viewport ZOOMÁVEL — usado só nas páginas de marketing (passa no Lighthouse a11y). */
export const MARKETING_VIEWPORT =
  'width=device-width, initial-scale=1.0, maximum-scale=5, viewport-fit=cover, interactive-widget=resizes-content';

/** Viewport FIXO — default do app logado (sensação de app nativo, sem zoom de pinça). */
export const APP_VIEWPORT =
  'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, interactive-widget=resizes-content, viewport-fit=cover';

/** Caminhos exatos de marketing (home + institucional + legais). */
const EXACT_MARKETING_PATHS = new Set<string>([
  '/',
  '/quem-somos',
  '/blog',
  '/privacidade',
  '/termos',
  // Segmentos (SEO).
  '/sistema-para-refrigeracao',
  '/sistema-para-eletricistas',
  '/sistema-para-energia-solar',
  '/sistema-para-provedores',
  '/sistema-para-cftv',
  '/sistema-para-construcao-civil',
  '/sistema-para-elevadores',
  '/sistema-para-limpeza-conservacao',
  '/sistema-para-dedetizacao',
  // Módulos (SEO).
  '/os-digital',
  '/sistema-pmoc',
  '/sistema-crm',
  '/controle-financeiro',
  '/ponto-e-folha',
  '/emissao-de-nfse',
  '/portal-do-cliente',
  '/controle-de-estoque',
  '/orcamentos-e-contratos',
  '/rastreamento-de-equipes',
  '/area-do-tecnico',
]);

/**
 * Diz se um pathname é página de MARKETING (zoom liberado). Cobre os caminhos
 * exatos acima e os posts de blog (`/blog/:slug`), normalizando barra final.
 *
 * i18n: aceita paths localizados (`/en/...`, `/es/...`). Remove o prefixo de
 * idioma e, se o slug for de segmento/módulo traduzido, resolve pro slug pt-br
 * canônico antes de checar o set. Enquanto os slugs traduzidos não existem, o
 * strip do prefixo já basta (o slug sob /en é o pt-br).
 */
export function isMarketingRoute(pathname: string): boolean {
  const raw = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const stripped = stripLocale(raw);
  const locale = localeFromPath(raw);
  if (EXACT_MARKETING_PATHS.has(stripped)) return true;
  // Slug de segmento/módulo traduzido → resolve pra key pt-br e checa o set.
  const slug = stripped.replace(/^\/+/, '');
  if (slug && !slug.includes('/')) {
    const key = resolveSlug(slug, locale);
    if (key && EXACT_MARKETING_PATHS.has(`/${key}`)) return true;
  }
  // Posts de blog também são marketing (pt-br e localizados).
  if (stripped.startsWith('/blog/')) return true;
  return false;
}

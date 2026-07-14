// ─────────────────────────────────────────────────────────────────────────────
// localizeInternal — aplica o prefixo de locale SOMENTE a rotas públicas do
// site de marketing. Auth/app passam sem prefixo; externos passam intocados.
//
// Regras:
//   • Rotas de auth/app (login, cadastro, reset-password, dashboard, etc.) →
//     devolvidas SEM prefixo, exatamente como vieram.
//   • Links externos (http/https/mailto/tel/wa.me) e âncoras vazias → intocados.
//   • Tudo o mais (slug de segmento, módulo, blog, páginas institucionais, /) →
//     prefixado via localizePath para o locale alvo.
//
// Por quê um helper centralizado: evita repetir a condicional em cada <Link>
// dos componentes públicos e garante que auth/app nunca ganhem prefixo, mesmo
// se alguém adicionar um link novo.
// ─────────────────────────────────────────────────────────────────────────────

import { localizePath, stripLocale } from './paths';
import type { LocaleCode } from './locales';
import { isLocalizableSlugKey, resolveSlug, slugFor } from './slugRegistry';

/**
 * Prefixos de rota que NÃO devem ser localizados (auth/app autenticado).
 * Acrescente aqui se novas rotas de auth/app forem criadas.
 */
const AUTH_APP_PREFIXES = [
  '/login',
  '/cadastro',
  '/reset-password',
  '/auth/',
  '/dashboard',
  '/agenda',
  '/os/',
  '/clientes',
  '/financeiro',
  '/estoque',
  '/crm',
  '/relatorios',
  '/configuracoes',
  '/admin',
  '/ferramentas-tecnico',
  '/pmoc',
  '/equipe',
  '/contratos',
];

/**
 * Aplica `localizePath(path, locale)` somente se o path for uma rota pública
 * localizável do site de marketing.
 *
 * Retorna o path original (sem prefixo) para:
 *   • Links externos (começa com http/https/mailto/tel) ou âncoras (#xxx, /).
 *   • Rotas de auth/app (login, cadastro, dashboard, etc.).
 *
 * @param path   Caminho sem prefixo de locale (ex: '/', '/blog', '/os-digital').
 * @param locale Locale alvo derivado do `useLocale()`.
 */
export function localizeInternal(path: string, locale: LocaleCode): string {
  // Externos e âncoras — não tocar
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('mailto:') ||
    path.startsWith('tel:') ||
    path.startsWith('wa.me') ||
    path === '#' ||
    (path.startsWith('#') && !path.startsWith('#/'))
  ) {
    return path;
  }

  // Rotas de auth/app autenticado — não prefixar
  for (const prefix of AUTH_APP_PREFIXES) {
    if (path === prefix || path.startsWith(prefix)) {
      return path;
    }
  }

  // Rota pública → aplica prefixo de locale. Se o path for um slug de
  // segmento/módulo, traduz o slug pro idioma alvo ANTES de prefixar (slug→key→
  // slug do locale). Hoje o slug traduzido não existe → cai no slug pt-br
  // (fallback do registro), então o output é idêntico ao de antes.
  const translated = translateSlugPath(path, locale);
  return localizePath(translated, locale);
}

/**
 * Se `path` (base pt-br, com ou sem barra inicial) for exatamente um slug de
 * segmento/módulo conhecido, devolve o path com o slug DAQUELE idioma. Caso
 * contrário, devolve o path inalterado. Só troca o PRIMEIRO segmento; não mexe
 * em sub-paths (segmento/módulo são páginas de 1 nível).
 */
function translateSlugPath(path: string, locale: LocaleCode): string {
  const base = stripLocale(path.startsWith('/') ? path : `/${path}`);
  const slug = base.replace(/^\/+/, '');
  // Só um slug simples (sem '/') pode ser de segmento/módulo.
  if (!slug || slug.includes('/')) return base;
  // Aceita tanto a key pt-br quanto (defensivo) um slug já traduzido.
  const key = isLocalizableSlugKey(slug) ? slug : resolveSlug(slug, locale);
  if (!key) return base;
  return `/${slugFor(key, locale)}`;
}

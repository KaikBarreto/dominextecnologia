// ─────────────────────────────────────────────────────────────────────────────
// i18n — utilitários PUROS de path por locale (sem React, testáveis isolados).
//
// pt-br não tem prefixo; en/es/fr entram como /<code>/... . Estas funções são a
// fonte da verdade de como um path vira/perde o prefixo de idioma.
// ─────────────────────────────────────────────────────────────────────────────

import { DEFAULT_LOCALE, isLocaleCode, type LocaleCode } from './locales';

/**
 * Deriva o locale a partir de um pathname. Se o 1º segmento for en|es|fr,
 * é esse locale; senão, pt-br (default, sem prefixo).
 */
export function localeFromPath(pathname: string): LocaleCode {
  const seg = pathname.replace(/^\/+/, '').split('/')[0];
  return isLocaleCode(seg) && seg !== DEFAULT_LOCALE ? (seg as LocaleCode) : DEFAULT_LOCALE;
}

/**
 * Remove o prefixo de idioma de um path, devolvendo o path "canônico" pt-br.
 * '/es/blog' → '/blog'; '/en' → '/'; '/blog' → '/blog'. Sempre começa com '/'.
 */
export function stripLocale(pathname: string): string {
  const parts = pathname.replace(/^\/+/, '').split('/');
  const first = parts[0];
  if (isLocaleCode(first) && first !== DEFAULT_LOCALE) {
    const rest = parts.slice(1).join('/');
    return rest ? `/${rest}` : '/';
  }
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

/**
 * Aplica o prefixo do locale a um path (que deve estar SEM prefixo, base pt-br).
 * localizePath('/blog','es') → '/es/blog'; localizePath('/blog','pt-br') → '/blog';
 * localizePath('/','fr') → '/fr'. Preserva query/hash se vierem no path.
 */
export function localizePath(path: string, locale: LocaleCode): string {
  const base = stripLocale(path);
  if (locale === DEFAULT_LOCALE) return base;
  return base === '/' ? `/${locale}` : `/${locale}${base}`;
}

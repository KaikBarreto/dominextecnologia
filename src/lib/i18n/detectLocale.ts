// ─────────────────────────────────────────────────────────────────────────────
// i18n — detecção de idioma (CLIENT-SIDE, só para humano).
//
// Regra-lei SEO: NUNCA redirecionar por User-Agent nem no servidor. A detecção
// roda no browser: cookie manual (dnx_lang) tem prioridade; senão olha
// navigator.language. Crawler que não executa JS (ou respeita hreflang) fica no
// default pt-br. O seletor manual grava o cookie e passa a mandar sobre isto.
// ─────────────────────────────────────────────────────────────────────────────

import { DEFAULT_LOCALE, isLocaleCode, type LocaleCode } from './locales';

export const LANG_COOKIE = 'dnx_lang';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Lê o cookie dnx_lang, se existir e for um locale válido. */
export function readLangCookie(): LocaleCode | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${LANG_COOKIE}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.split('=')[1] ?? '');
  return isLocaleCode(value) ? value : null;
}

/** Grava a escolha manual do usuário. SameSite=Lax, path=/, ~1 ano. */
export function writeLangCookie(locale: LocaleCode): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${LANG_COOKIE}=${encodeURIComponent(
    locale,
  )}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

/**
 * Mapeia um BCP-47 (navigator.language) pra um dos 4 locales. pt/pt-BR/pt-PT e
 * qualquer coisa não reconhecida → pt-br (default). 'en-US' → 'en', etc.
 */
export function mapBrowserLang(raw: string | undefined | null): LocaleCode {
  if (!raw) return DEFAULT_LOCALE;
  const primary = raw.toLowerCase().split('-')[0];
  switch (primary) {
    case 'en':
      return 'en';
    case 'es':
      return 'es';
    case 'fr':
      return 'fr';
    // 'pt' (inclui pt-PT) e qualquer outro idioma → default pt-br, sem redirect.
    default:
      return DEFAULT_LOCALE;
  }
}

/**
 * Locale detectado: cookie manual > navigator.language > pt-br.
 * Usado só pela auto-detecção client-side das rotas públicas.
 */
export function detectLocale(): LocaleCode {
  const cookie = readLangCookie();
  if (cookie) return cookie;
  if (typeof navigator !== 'undefined') {
    return mapBrowserLang(navigator.language);
  }
  return DEFAULT_LOCALE;
}

/** true se o usuário já fez uma escolha manual (cookie presente). */
export function hasLangCookie(): boolean {
  return readLangCookie() !== null;
}

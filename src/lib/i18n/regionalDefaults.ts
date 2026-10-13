// ─────────────────────────────────────────────────────────────────────────────
// i18n do APP LOGADO — padrões regionais (moeda + fuso) por idioma e detecção
// da máquina. Fase 0: só a FUNDAÇÃO; a UI da config Regional vem depois.
//
// Os 4 eixos são independentes (idioma ≠ moeda ≠ fuso), mas cada idioma tem um
// padrão "razoável" pré-preenchido, sempre SOBRESCRITÍVEL pelo usuário/empresa.
// Nada aqui força valor: só sugere. O valor salvo é o que o usuário confirmar.
// ─────────────────────────────────────────────────────────────────────────────

import { mapBrowserLang } from './detectLocale';
import { DEFAULT_LOCALE, type LocaleCode } from './locales';
import {
  DEFAULT_COUNTRY_CODE,
  countryFromLanguageTag,
  countryFromTimezone,
  getCountryDef,
  type CountryCode,
} from './countries';

/** Moeda/fuso default por idioma (ISO 4217 + nome IANA, nunca offset fixo). */
export const LOCALE_REGIONAL_DEFAULTS: Record<
  LocaleCode,
  { currency: string; timezone: string }
> = {
  'pt-br': { currency: 'BRL', timezone: 'America/Sao_Paulo' },
  en: { currency: 'USD', timezone: 'America/New_York' },
  es: { currency: 'EUR', timezone: 'Europe/Madrid' },
  fr: { currency: 'EUR', timezone: 'Europe/Paris' },
};

/** Fallback global (o mesmo do resto do stack): pt-br / BRL / São Paulo. */
export const DEFAULT_CURRENCY = LOCALE_REGIONAL_DEFAULTS[DEFAULT_LOCALE].currency;
export const DEFAULT_TIMEZONE = LOCALE_REGIONAL_DEFAULTS[DEFAULT_LOCALE].timezone;

/**
 * Detecta país/idioma/moeda/fuso a partir da máquina do usuário. Best-effort e
 * defensivo (try/catch, SSR-safe): serve pra PRÉ-preencher o Regional no
 * cadastro/1º acesso; o usuário confirma ou sobrescreve.
 *
 *  • fuso   → `Intl.DateTimeFormat().resolvedOptions().timeZone` (fuso da máquina)
 *  • idioma → `navigator.language` mapeado pros 4 locales (desconhecido → pt-br)
 *  • moeda  → inferida pela REGIÃO do `navigator.language`; sem região válida,
 *             cai na moeda do idioma detectado.
 */
export function detectRegionalFromMachine(): {
  countryCode: CountryCode;
  language: LocaleCode;
  currency: string;
  timezone: string;
} {
  let language: LocaleCode = DEFAULT_LOCALE;
  let timezone = DEFAULT_TIMEZONE;
  let languageTag: string | null = null;

  // Idioma pela linguagem do navegador (reusa o mapeamento do site).
  try {
    if (typeof navigator !== 'undefined') {
      languageTag = navigator.language;
      language = mapBrowserLang(languageTag);
    }
  } catch {
    language = DEFAULT_LOCALE;
  }

  // Fuso IANA da máquina.
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) timezone = tz;
  } catch {
    timezone = DEFAULT_TIMEZONE;
  }

  // País: região explícita do BCP-47 ganha. Sem região, usa um fuso inequívoco.
  // Se nenhum sinal for confiável, mantém BR por compatibilidade com a base.
  const countryCode =
    countryFromLanguageTag(languageTag) ??
    countryFromTimezone(timezone) ??
    DEFAULT_COUNTRY_CODE;
  const countryDefaults = getCountryDef(countryCode);

  return {
    countryCode,
    language: countryDefaults.language ?? language,
    currency: countryDefaults.currency,
    timezone,
  };
}

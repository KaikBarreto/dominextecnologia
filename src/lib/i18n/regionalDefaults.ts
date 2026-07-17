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

// Moeda inferida pela REGIÃO do BCP-47 (parte após o hífen), não pelo idioma.
// Ex.: es-MX → MXN (não EUR), en-GB → GBP, pt-PT → EUR. Best-effort: região
// desconhecida cai na moeda do locale detectado.
const REGION_CURRENCY: Record<string, string> = {
  BR: 'BRL',
  PT: 'EUR',
  US: 'USD',
  GB: 'GBP',
  CA: 'CAD',
  AU: 'AUD',
  ES: 'EUR',
  MX: 'MXN',
  AR: 'ARS',
  CL: 'CLP',
  CO: 'COP',
  FR: 'EUR',
  BE: 'EUR',
  CH: 'CHF',
  DE: 'EUR',
  IT: 'EUR',
};

/**
 * Detecta idioma/moeda/fuso a partir da máquina do usuário. Best-effort e
 * defensivo (try/catch, SSR-safe): serve pra PRÉ-preencher o Regional no
 * cadastro/1º acesso; o usuário confirma ou sobrescreve.
 *
 *  • fuso   → `Intl.DateTimeFormat().resolvedOptions().timeZone` (fuso da máquina)
 *  • idioma → `navigator.language` mapeado pros 4 locales (desconhecido → pt-br)
 *  • moeda  → inferida pela REGIÃO do `navigator.language`; sem região válida,
 *             cai na moeda do idioma detectado.
 */
export function detectRegionalFromMachine(): {
  language: LocaleCode;
  currency: string;
  timezone: string;
} {
  let language: LocaleCode = DEFAULT_LOCALE;
  let timezone = DEFAULT_TIMEZONE;

  // Idioma pela linguagem do navegador (reusa o mapeamento do site).
  try {
    if (typeof navigator !== 'undefined') {
      language = mapBrowserLang(navigator.language);
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

  // Moeda: primeiro pela região do BCP-47, senão pela do idioma detectado.
  let currency = LOCALE_REGIONAL_DEFAULTS[language].currency;
  try {
    if (typeof navigator !== 'undefined' && navigator.language) {
      const parts = navigator.language.split('-');
      const region = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : null;
      if (region && REGION_CURRENCY[region]) {
        currency = REGION_CURRENCY[region];
      }
    }
  } catch {
    currency = LOCALE_REGIONAL_DEFAULTS[language].currency;
  }

  return { language, currency, timezone };
}

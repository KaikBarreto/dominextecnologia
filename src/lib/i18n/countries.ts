import type { LocaleCode } from './locales';

/**
 * Países com defaults regionais suportados no onboarding/configuração.
 *
 * País, idioma, moeda e fuso continuam sendo campos independentes: escolher um
 * país apenas oferece defaults coerentes, que o admin pode sobrescrever. Isso
 * evita tratar idioma como sinônimo de moeda (ex.: português pode ser BRL, EUR,
 * CVE, AOA, MZN ou STN).
 */
export const COUNTRIES = [
  { code: 'BR', language: 'pt-br', currency: 'BRL', timezone: 'America/Sao_Paulo' },
  { code: 'CV', language: 'pt-br', currency: 'CVE', timezone: 'Atlantic/Cape_Verde' },
  { code: 'PT', language: 'pt-br', currency: 'EUR', timezone: 'Europe/Lisbon' },
  { code: 'AO', language: 'pt-br', currency: 'AOA', timezone: 'Africa/Luanda' },
  { code: 'MZ', language: 'pt-br', currency: 'MZN', timezone: 'Africa/Maputo' },
  { code: 'ST', language: 'pt-br', currency: 'STN', timezone: 'Africa/Sao_Tome' },
  { code: 'GW', language: 'pt-br', currency: 'XOF', timezone: 'Africa/Bissau' },
  { code: 'TL', language: 'pt-br', currency: 'USD', timezone: 'Asia/Dili' },
  { code: 'US', language: 'en', currency: 'USD', timezone: 'America/New_York' },
  { code: 'GB', language: 'en', currency: 'GBP', timezone: 'Europe/London' },
  { code: 'CA', language: 'en', currency: 'CAD', timezone: 'America/Toronto' },
  { code: 'AU', language: 'en', currency: 'AUD', timezone: 'Australia/Sydney' },
  { code: 'ES', language: 'es', currency: 'EUR', timezone: 'Europe/Madrid' },
  { code: 'MX', language: 'es', currency: 'MXN', timezone: 'America/Mexico_City' },
  { code: 'AR', language: 'es', currency: 'ARS', timezone: 'America/Argentina/Buenos_Aires' },
  { code: 'CL', language: 'es', currency: 'CLP', timezone: 'America/Santiago' },
  { code: 'CO', language: 'es', currency: 'COP', timezone: 'America/Bogota' },
  { code: 'PE', language: 'es', currency: 'PEN', timezone: 'America/Lima' },
  { code: 'UY', language: 'es', currency: 'UYU', timezone: 'America/Montevideo' },
  { code: 'PY', language: 'es', currency: 'PYG', timezone: 'America/Asuncion' },
  { code: 'BO', language: 'es', currency: 'BOB', timezone: 'America/La_Paz' },
  { code: 'FR', language: 'fr', currency: 'EUR', timezone: 'Europe/Paris' },
  { code: 'BE', language: 'fr', currency: 'EUR', timezone: 'Europe/Brussels' },
  { code: 'CH', language: 'fr', currency: 'CHF', timezone: 'Europe/Zurich' },
  { code: 'DE', language: 'en', currency: 'EUR', timezone: 'Europe/Berlin' },
  { code: 'IT', language: 'en', currency: 'EUR', timezone: 'Europe/Rome' },
  { code: 'JP', language: 'en', currency: 'JPY', timezone: 'Asia/Tokyo' },
] as const satisfies ReadonlyArray<{
  code: string;
  language: LocaleCode;
  currency: string;
  timezone: string;
}>;

export type CountryCode = (typeof COUNTRIES)[number]['code'];
export type CountryDef = (typeof COUNTRIES)[number];

export const DEFAULT_COUNTRY_CODE: CountryCode = 'BR';

const COUNTRY_BY_CODE = new Map<string, CountryDef>(
  COUNTRIES.map((country) => [country.code, country]),
);

const DISPLAY_LOCALE: Record<LocaleCode, string> = {
  'pt-br': 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
};

export function isCountryCode(value: string | null | undefined): value is CountryCode {
  return !!value && COUNTRY_BY_CODE.has(value.toUpperCase());
}

export function getCountryDef(value: string | null | undefined): CountryDef {
  const normalized = value?.toUpperCase();
  return COUNTRY_BY_CODE.get(normalized || '') ?? COUNTRY_BY_CODE.get(DEFAULT_COUNTRY_CODE)!;
}

/** Nome do país no idioma visível, com fallback para o próprio código ISO. */
export function countryLabel(code: string, locale: LocaleCode): string {
  try {
    const label = new Intl.DisplayNames([DISPLAY_LOCALE[locale]], { type: 'region' }).of(code);
    return label || code;
  } catch {
    return code;
  }
}

/** Bandeira Unicode sem asset remoto; aria fica no rótulo textual adjacente. */
export function countryFlag(code: string): string {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return '🌐';
  return String.fromCodePoint(...upper.split('').map((char) => 127397 + char.charCodeAt(0)));
}

export function getCountryOptions(locale: LocaleCode) {
  return COUNTRIES
    .map((country) => ({
      value: country.code,
      label: countryLabel(country.code, locale),
      sublabel: `${country.currency} · ${country.timezone.replace(/_/g, ' ')}`,
      icon: countryFlag(country.code),
      keywords: [country.code, country.currency],
    }))
    .sort((a, b) => a.label.localeCompare(b.label, DISPLAY_LOCALE[locale]));
}

/** Extrai a região de uma tag BCP-47 (`pt-CV`, `es-MX`, etc.). */
export function countryFromLanguageTag(tag: string | null | undefined): CountryCode | null {
  if (!tag) return null;
  try {
    const region = new Intl.Locale(tag).region;
    return isCountryCode(region) ? region : null;
  } catch {
    const match = tag.replace('_', '-').match(/-([A-Za-z]{2})(?:-|$)/);
    const region = match?.[1]?.toUpperCase();
    return isCountryCode(region) ? region : null;
  }
}

/** Fallback quando o navegador omite a região mas informa um fuso inequívoco. */
export function countryFromTimezone(timezone: string | null | undefined): CountryCode | null {
  if (!timezone) return null;
  const matches = COUNTRIES.filter((country) => country.timezone === timezone);
  return matches.length === 1 ? matches[0].code : null;
}

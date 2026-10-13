// ─────────────────────────────────────────────────────────────────────────────
// i18n do APP LOGADO — catálogo curado de moedas (ISO 4217) exibidas na config
// Regional. Cada entrada tem código, nome em PT-BR e símbolo pra montar o Select
// "BRL — Real (R$)". Lista razoável focada nos mercados que o Dominex atende
// (Brasil + LatAm + principais); não é exaustiva (não faz sentido listar 180
// moedas num select). O valor SALVO é sempre o código ISO 4217.
// ─────────────────────────────────────────────────────────────────────────────

import { countryFlag } from './countries';

export interface CurrencyDef {
  /** Código ISO 4217 (ex.: 'BRL'). É o valor salvo em company_settings.currency. */
  code: string;
  /** Nome em PT-BR (ex.: 'Real brasileiro'). */
  name: string;
  /** Símbolo (ex.: 'R$'). Best-effort; nem toda moeda tem símbolo curto. */
  symbol: string;
}

export const CURRENCIES: CurrencyDef[] = [
  { code: 'BRL', name: 'Real brasileiro', symbol: 'R$' },
  { code: 'CVE', name: 'Escudo cabo-verdiano', symbol: 'Esc' },
  { code: 'AOA', name: 'Kwanza angolano', symbol: 'Kz' },
  { code: 'MZN', name: 'Metical moçambicano', symbol: 'MT' },
  { code: 'STN', name: 'Dobra são-tomense', symbol: 'Db' },
  { code: 'XOF', name: 'Franco CFA da África Ocidental', symbol: 'CFA' },
  { code: 'USD', name: 'Dólar americano', symbol: 'US$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'Libra esterlina', symbol: '£' },
  { code: 'MXN', name: 'Peso mexicano', symbol: 'MX$' },
  { code: 'ARS', name: 'Peso argentino', symbol: 'AR$' },
  { code: 'CLP', name: 'Peso chileno', symbol: 'CLP$' },
  { code: 'COP', name: 'Peso colombiano', symbol: 'COL$' },
  { code: 'PEN', name: 'Sol peruano', symbol: 'S/' },
  { code: 'UYU', name: 'Peso uruguaio', symbol: '$U' },
  { code: 'PYG', name: 'Guarani paraguaio', symbol: '₲' },
  { code: 'BOB', name: 'Boliviano', symbol: 'Bs' },
  { code: 'CAD', name: 'Dólar canadense', symbol: 'C$' },
  { code: 'CHF', name: 'Franco suíço', symbol: 'CHF' },
  { code: 'JPY', name: 'Iene japonês', symbol: '¥' },
  { code: 'AUD', name: 'Dólar australiano', symbol: 'A$' },
];

const CURRENCY_BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

/** País/região representativo usado apenas para a bandeira do seletor. */
const CURRENCY_FLAG_COUNTRY: Record<string, string> = {
  BRL: 'BR',
  CVE: 'CV',
  AOA: 'AO',
  MZN: 'MZ',
  STN: 'ST',
  XOF: 'GW',
  USD: 'US',
  EUR: 'EU',
  GBP: 'GB',
  MXN: 'MX',
  ARS: 'AR',
  CLP: 'CL',
  COP: 'CO',
  PEN: 'PE',
  UYU: 'UY',
  PYG: 'PY',
  BOB: 'BO',
  CAD: 'CA',
  CHF: 'CH',
  JPY: 'JP',
  AUD: 'AU',
};

/** Busca a moeda pelo código, ou monta um fallback exibível pra códigos fora da lista. */
export function getCurrencyDef(code: string | null | undefined): CurrencyDef {
  const c = code ? CURRENCY_BY_CODE.get(code) : undefined;
  if (c) return c;
  const upper = (code || '').toUpperCase();
  return { code: upper, name: upper, symbol: upper };
}

/** Rótulo curto pro Select/trigger: "BRL — Real brasileiro (R$)". */
export function currencyLabel(code: string | null | undefined): string {
  const c = getCurrencyDef(code);
  if (!c.code) return '';
  return c.symbol && c.symbol !== c.code
    ? `${c.code} — ${c.name} (${c.symbol})`
    : `${c.code} — ${c.name}`;
}

/** Bandeira da moeda; quando informado, o país da empresa tem prioridade. */
export function currencyFlag(
  code: string | null | undefined,
  companyCountryCode?: string | null,
): string {
  const currencyCode = code?.toUpperCase() || '';
  return countryFlag(companyCountryCode || CURRENCY_FLAG_COUNTRY[currencyCode] || '');
}

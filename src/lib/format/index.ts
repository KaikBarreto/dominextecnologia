// ─────────────────────────────────────────────────────────────────────────────
// Formatadores/parsers CENTRAIS da i18n do app logado (Fase 0).
//
// Funções PURAS, Intl-nativo (nada de lib nova). Recebem locale/currency/
// timezone POR PARÂMETRO (a fonte da verdade é o AppLocaleContext, que os
// componentes leem e repassam). Nenhuma função aqui depende do contexto React.
//
// Regras-lei (plano 2026-07-15-i18n-app-logado.md, §7.5):
//  • NUNCA cravar separador (`.`/`,`) nem símbolo de moeda nem casas decimais.
//    Quem resolve tudo isso é o Intl a partir do locale/currency.
//  • Parsing é o INVERSO e é onde nasce bug: francês digita `1 234,56` e
//    `parseFloat` disso dá `1`. Por isso `parseNumber` descobre os separadores
//    reais do locale (via formatToParts) e normaliza antes de `Number()`.
//  • Data-pura ('YYYY-MM-DD') NÃO leva fuso (vencimento/feriado/aniversário são
//    DATE). `new Date('2026-07-15')` seria meia-noite UTC → em São Paulo vira o
//    dia anterior às 21h (off-by-one). Usar `parseDateOnly`.
//  • Timestamp (com hora) É convertido pro `timezone` informado na exibição.
//  • Precisão/arredondamento de CÁLCULO monetário é responsabilidade de quem
//    chama (guardar centavos inteiros ou numeric no Postgres, nunca float solto).
//    Aqui o `value` já chega como number pronto pra FORMATAR — não fazemos math.
//  • Tudo defensivo/SSR-safe: try/catch com fallback pro valor cru.
// ─────────────────────────────────────────────────────────────────────────────

import type { Locale } from 'date-fns';
import { ptBR, enUS, es, fr } from 'date-fns/locale';
import type { LocaleCode } from '@/lib/i18n/locales';

// ─────────────────────────────────────────────────────────────────────────────
// DATE-FNS LOCALE
// ─────────────────────────────────────────────────────────────────────────────

const DATE_FNS_LOCALES: Record<LocaleCode, Locale> = {
  'pt-br': ptBR,
  en: enUS,
  es: es,
  fr: fr,
};

/**
 * Retorna o objeto Locale do date-fns para o locale interno da aplicação.
 * Use em vez de importar `ptBR` fixo nos componentes — assim datas relativas
 * (formatDistanceToNow, format) respeitam o idioma escolhido pelo usuário.
 *
 * Exemplo:
 *   formatDistanceToNow(date, { addSuffix: true, locale: getDateFnsLocale(locale) })
 */
export function getDateFnsLocale(locale: LocaleCode): Locale {
  return DATE_FNS_LOCALES[locale] ?? ptBR;
}

// ─────────────────────────────────────────────────────────────────────────────
// LocaleCode (interno) → BCP-47 (o que o Intl entende).
// ─────────────────────────────────────────────────────────────────────────────

const BCP47_BY_LOCALE: Record<LocaleCode, string> = {
  'pt-br': 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
};

/** Traduz o código interno pra tag BCP-47 do Intl. Fallback: 'pt-BR'. */
export function toBcp47(locale: LocaleCode): string {
  return BCP47_BY_LOCALE[locale] ?? 'pt-BR';
}

// ─────────────────────────────────────────────────────────────────────────────
// NÚMEROS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formata número no locale. Deixa o Intl escolher milhar/decimal.
 *
 * Provas:
 *   formatNumber(1234.56, 'pt-br') === '1.234,56'
 *   formatNumber(1234.56, 'en')    === '1,234.56'
 *   formatNumber(1234.56, 'fr')    === '1 234,56'   (espaço NBSP como milhar)
 *   formatNumber(1234.56, 'es')    === '1234,56'    (es-ES não agrupa 4 dígitos)
 */
export function formatNumber(
  value: number,
  locale: LocaleCode,
  opts?: Intl.NumberFormatOptions,
): string {
  if (value == null || Number.isNaN(value)) return '';
  try {
    return new Intl.NumberFormat(toBcp47(locale), opts).format(value);
  } catch {
    return String(value);
  }
}

/**
 * Descobre os separadores de MILHAR (group) e DECIMAL (decimal) reais do locale,
 * perguntando ao próprio Intl. É a peça que torna o parse locale-aware.
 *
 * fr-FR → { group: ' ' (narrow no-break space), decimal: ',' }
 * pt-BR → { group: '.', decimal: ',' }
 * en-US → { group: ',', decimal: '.' }
 */
function localeSeparators(locale: LocaleCode): { group: string; decimal: string } {
  try {
    const parts = new Intl.NumberFormat(toBcp47(locale)).formatToParts(11111.1);
    const group = parts.find((p) => p.type === 'group')?.value ?? '';
    const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
    return { group, decimal };
  } catch {
    return { group: '', decimal: '.' };
  }
}

/**
 * Inverso de `formatNumber`: string localizada → number canônico (ponto decimal,
 * sem milhar). Retorna null se não sobrar um número válido.
 *
 * Robusto: tolera símbolo de moeda, espaços comuns/NBSP/narrow-NBSP, sinal
 * negativo (incl. parênteses contábeis) e o separador de milhar do locale.
 * NUNCA usa parseFloat direto na string localizada.
 *
 * Provas:
 *   parseNumber('1.234,56', 'pt-br')  === 1234.56
 *   parseNumber('1,234.56', 'en')     === 1234.56
 *   parseNumber('1 234,56', 'fr')     === 1234.56   (espaço de milhar removido)
 *   parseNumber('R$ 1.234,56', 'pt-br')=== 1234.56
 *   parseNumber('-42', 'en')          === -42
 *   parseNumber('(42)', 'en')         === -42        (parênteses = negativo)
 *   parseNumber('abc', 'en')          === null
 *   parseNumber('', 'en')             === null
 */
export function parseNumber(input: string, locale: LocaleCode): number | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (s === '') return null;

  // Parênteses contábeis = negativo: (1.234,56) → -1234.56
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.includes('-')) negative = true;

  const { group, decimal } = localeSeparators(locale);

  // 1) Remove separador de MILHAR do locale (inclui variações de espaço).
  if (group) {
    // Espaços (regular, NBSP  , narrow  , thin  ) contam todos
    // como agrupamento quando o locale usa espaço (fr).
    if (/\s| | | /.test(group)) {
      s = s.replace(/[\s   ]/g, '');
    } else {
      s = s.split(group).join('');
    }
  }
  // Higieniza qualquer espaço remanescente (ex.: "R$ 10").
  s = s.replace(/[\s   ]/g, '');

  // 2) Converte separador DECIMAL do locale pra ponto.
  if (decimal && decimal !== '.') {
    s = s.split(decimal).join('.');
  }

  // 3) Descarta tudo que não seja dígito ou ponto (símbolo de moeda, letras…).
  s = s.replace(/[^0-9.]/g, '');
  if (s === '' || s === '.') return null;

  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return negative ? -n : n;
}

// ─────────────────────────────────────────────────────────────────────────────
// MOEDA (ISO 4217)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formata valor monetário. O Intl resolve símbolo, posição E casas decimais
 * (JPY=0, maioria=2, BHD=3) a partir do par (locale, currency). NÃO cravar nada.
 *
 * Provas:
 *   formatMoney(1234.5, 'BRL', 'pt-br')  → contém 'R$'   → 'R$ 1.234,50'
 *   formatMoney(1234.5, 'EUR', 'fr')     → contém '€'    → '1 234,50 €'
 *   formatMoney(1234.5, 'USD', 'en')     → '$1,234.50'
 *   formatMoney(1000,   'JPY', 'en')     → '¥1,000'      (0 casas)
 */
export function formatMoney(value: number, currency: string, locale: LocaleCode): string {
  if (value == null || Number.isNaN(value)) return '';
  try {
    return new Intl.NumberFormat(toBcp47(locale), {
      style: 'currency',
      currency,
    }).format(value);
  } catch {
    // currency inválida ou ambiente sem Intl full: fallback só numérico.
    return formatNumber(value, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

/**
 * Inverso de `formatMoney`. Mesma lógica de `parseNumber`, já tolerante a
 * símbolo de moeda/espaços (o parseNumber descarta não-dígitos ao final).
 *
 * Provas:
 *   parseMoney('R$ 1.234,56', 'pt-br') === 1234.56
 *   parseMoney('1 234,56 €', 'fr')     === 1234.56
 *   parseMoney('$1,234.50', 'en')      === 1234.5
 *   parseMoney('', 'en')               === null
 */
export function parseMoney(input: string, locale: LocaleCode): number | null {
  return parseNumber(input, locale);
}

// ─────────────────────────────────────────────────────────────────────────────
// DATAS E FUSO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse SEGURO de data-pura 'YYYY-MM-DD' (vencimento, feriado, aniversário).
 * Data-pura NÃO leva fuso (plano §7.5): representamos ao MEIO-DIA local pra que
 * qualquer conversão de exibição caia no MESMO dia civil, evitando o off-by-one
 * do `new Date('2026-07-15')` (que é meia-noite UTC → dia anterior no Brasil).
 *
 * Aceita também a parte de data de um ISO ('2026-07-15T...') pegando o prefixo.
 * String inválida → Date inválida (Number.isNaN(d.getTime()) === true).
 *
 * Provas:
 *   parseDateOnly('2026-07-15').getDate() === 15   (nunca 14, em qualquer fuso)
 *   parseDateOnly('2026-07-15').getMonth() === 6   (julho, 0-based)
 */
export function parseDateOnly(str: string): Date {
  if (!str) return new Date(NaN);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str).trim());
  if (!m) return new Date(NaN);
  const [, y, mo, d] = m;
  // Meio-dia local: neutro contra DST e contra conversão de fuso na exibição.
  return new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0, 0);
}

/** Normaliza a entrada de data pros formatadores. String data-pura → parseDateOnly. */
function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    // Data-pura sem hora → parse seguro (sem fuso). Com hora → Date nativa (UTC-aware).
    if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return parseDateOnly(value);
    return new Date(value);
  }
  return new Date(NaN);
}

/**
 * Formata DATA (sem hora por padrão) no locale. `timezone` (IANA) rege o dia
 * civil exibido quando a entrada é um timestamp. Data-pura passa pelo
 * parseDateOnly (meio-dia local) e não sofre virada de dia.
 *
 * Provas:
 *   formatDate('2026-07-15', 'pt-br', 'America/Sao_Paulo') === '15/07/2026'
 *   formatDate('2026-07-15', 'en',    'America/Sao_Paulo') === '07/15/2026'
 *   formatDate('2026-07-15', 'fr',    'Europe/Paris')      === '15/07/2026'
 */
export function formatDate(
  value: string | Date,
  locale: LocaleCode,
  timezone: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '';
  try {
    return new Intl.DateTimeFormat(toBcp47(locale), {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      ...opts,
    }).format(date);
  } catch {
    return typeof value === 'string' ? value : date.toISOString();
  }
}

/**
 * Formata DATA + HORA no locale. O timestamp é convertido pro `timezone` (IANA).
 * 12h/24h vem do locale (en usa AM/PM; pt/es/fr usam 24h).
 *
 * Provas:
 *   formatDateTime('2026-07-15T18:30:00Z', 'pt-br', 'America/Sao_Paulo')
 *     → '15/07/2026 15:30'  (UTC 18:30 → -03:00)
 */
export function formatDateTime(
  value: string | Date,
  locale: LocaleCode,
  timezone: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return formatDate(value, locale, timezone, {
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  });
}

/**
 * Formata só a HORA no locale, convertida pro `timezone` (IANA).
 *
 * Provas:
 *   formatTime('2026-07-15T18:30:00Z', 'pt-br', 'America/Sao_Paulo') === '15:30'
 */
export function formatTime(
  value: string | Date,
  locale: LocaleCode,
  timezone: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '';
  try {
    return new Intl.DateTimeFormat(toBcp47(locale), {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      ...opts,
    }).format(date);
  } catch {
    return typeof value === 'string' ? value : date.toISOString();
  }
}

// Hooks React que expõem os formatadores centrais (src/lib/format/index.ts) já
// amarrados ao locale/currency/timezone da empresa, vindos do AppLocaleContext.
//
// USO:
//   const { money, date, dateTime } = useLocaleFormatters();
//   money(1234.5)        → "R$ 1.234,50" | "$1,234.50" | "1 234,50 €" …
//   date('2026-07-15')   → "15/07/2026" | "07/15/2026" | "15/07/2026" …

import { useCallback } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { formatMoney, formatDate, formatDateTime, formatNumber } from './index';
import type { LocaleCode } from '@/lib/i18n/locales';

export interface LocaleFormatters {
  /** Formata valor monetário na moeda/locale da empresa. */
  money: (value: number) => string;
  /** Formata data (sem hora) no locale/fuso da empresa. */
  date: (value: string | Date) => string;
  /** Formata data + hora no locale/fuso da empresa. */
  dateTime: (value: string | Date) => string;
  /** Formata número no locale da empresa (sem moeda). */
  number: (value: number, opts?: Intl.NumberFormatOptions) => string;
  /** Locale/currency/timezone expostos para quem precisar repassar pra fn pura. */
  locale: LocaleCode;
  currency: string;
  timezone: string;
}

/**
 * Retorna formatadores já amarrados ao locale/currency/timezone da empresa.
 * Funciona tanto no app logado (AppLocaleProvider) quanto em páginas públicas
 * (PublicAppLocaleProvider) — o fallback do contexto garante pt-br/BRL/SP.
 */
export function useLocaleFormatters(): LocaleFormatters {
  const { locale, currency, timezone } = useAppLocaleContext();

  const money = useCallback(
    (value: number) => formatMoney(value, currency, locale),
    [locale, currency],
  );

  const date = useCallback(
    (value: string | Date) => formatDate(value, locale, timezone),
    [locale, timezone],
  );

  const dateTime = useCallback(
    (value: string | Date) => formatDateTime(value, locale, timezone),
    [locale, timezone],
  );

  const number = useCallback(
    (value: number, opts?: Intl.NumberFormatOptions) => formatNumber(value, locale, opts),
    [locale],
  );

  return { money, date, dateTime, number, locale, currency, timezone };
}

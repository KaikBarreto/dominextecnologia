import { dateInTz } from '@/lib/timezone';

/**
 * O motor nacional emite `dhEmi` com o relógio fiscal de Brasília. A data de
 * competência não pode avançar pelo fuso do navegador antes desse relógio.
 */
export const NFSE_FISCAL_TIME_ZONE = 'America/Sao_Paulo';

/** Dia fiscal atual (YYYY-MM-DD) usando o mesmo fuso do `dhEmi` da DPS. */
export function nfseFiscalToday(now: Date | string | number = new Date()): string {
  return dateInTz(now, NFSE_FISCAL_TIME_ZONE);
}

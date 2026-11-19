/** Período do histórico detalhado: atalhos e validação, sempre em datas civis yyyy-MM-dd. */

export type CashExportPeriodPreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'custom';

export const CASH_EXPORT_MAX_DAYS = 92;

export const CASH_EXPORT_PERIOD_PRESETS: { id: CashExportPeriodPreset; label: string }[] = [
  { id: 'today', label: 'Hoje' },
  { id: 'yesterday', label: 'Ontem' },
  { id: 'this_week', label: 'Esta semana' },
  { id: 'this_month', label: 'Este mês' },
  { id: 'last_month', label: 'Mês passado' },
  { id: 'custom', label: 'Personalizado' },
];

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function parse(value: string): Date | null {
  const match = ISO.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addCivilDays(value: string, days: number): string {
  const date = parse(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

/** Dias corridos do período, contando o primeiro e o último. */
export function countCivilDays(from: string, to: string): number {
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return NaN;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/** `today` é a data civil de hoje no fuso da empresa. */
export function resolveCashExportPeriod(
  preset: Exclude<CashExportPeriodPreset, 'custom'>,
  today: string,
): { from: string; to: string } {
  const base = parse(today) ?? new Date();
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const day = addCivilDays(today, -1);
      return { from: day, to: day };
    }
    case 'this_week': {
      const weekday = (base.getUTCDay() + 6) % 7; // segunda = 0
      return { from: addCivilDays(today, -weekday), to: today };
    }
    case 'this_month':
      return { from: iso(new Date(Date.UTC(year, month, 1))), to: today };
    case 'last_month':
      return {
        from: iso(new Date(Date.UTC(year, month - 1, 1))),
        to: iso(new Date(Date.UTC(year, month, 0))),
      };
  }
}

/** Mensagem de erro em PT-BR, ou null quando o período pode ser enviado ao servidor. */
export function validateCashExportPeriod(from: string, to: string): string | null {
  if (!from || !to) return 'Informe a data inicial e a data final.';
  if (!parse(from) || !parse(to)) return 'Informe datas válidas.';
  if (from > to) return 'A data inicial não pode ser depois da data final.';
  if (countCivilDays(from, to) > CASH_EXPORT_MAX_DAYS) {
    return `O período pode ter no máximo ${CASH_EXPORT_MAX_DAYS} dias.`;
  }
  return null;
}

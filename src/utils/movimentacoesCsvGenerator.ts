import { MESSAGES } from '@/lib/i18n';
import type { LocaleCode } from '@/lib/i18n/locales';
import { todayInTz } from '@/lib/timezone';
import type { MovimentacaoReportRow } from '@/utils/movimentacoesReportHtmlGenerator';

interface GenerateMovimentacoesCsvParams {
  title: string;
  rows: MovimentacaoReportRow[];
  locale?: LocaleCode;
  timezone?: string | null;
}

/** Evita que conteúdo digitado pelo usuário seja interpretado como fórmula. */
export function csvCell(value: string | number): string {
  if (typeof value === 'number') return `"${value.toFixed(2).replace('.', ',')}"`;
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function formatCalendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'movimentacoes';
}

export function generateMovimentacoesCsv({
  title,
  rows,
  locale: rawLocale,
  timezone,
}: GenerateMovimentacoesCsvParams): void {
  const locale = rawLocale ?? 'pt-br';
  const labels = MESSAGES[locale].app.finance.movimentacoesGenerator;
  const table: Array<Array<string | number>> = [
    [title],
    [
      labels.colDate,
      labels.colType,
      labels.colDescription,
      labels.colCategory,
      labels.colAccount,
      labels.colAmount,
      labels.colStatus,
    ],
    ...rows.map((row) => [
      formatCalendarDate(row.date),
      row.type === 'entrada' ? labels.labelRevenue : labels.labelExpense,
      row.description,
      row.category,
      row.account,
      row.type === 'entrada' ? Math.abs(row.amount) : -Math.abs(row.amount),
      row.isPaid ? labels.labelPaid : labels.labelPending,
    ]),
  ];

  const csv = table.map((row) => row.map(csvCell).join(';')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(title)}-${todayInTz(timezone)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

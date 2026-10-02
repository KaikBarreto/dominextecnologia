// ─────────────────────────────────────────────────────────────────────────────
// salespersonActivityExport — relatório em Excel do espelho de Atividade
// Comercial (aba em AdminSalespeople.tsx).
//
// Reusa a mesma lib ('xlsx', já dependência do projeto) e o mesmo padrão de
// `src/utils/dreExcelGenerator.ts`: uma função PURA que monta as planilhas
// (testável sem o navegador) + uma função fina que chama `XLSX.writeFile`.
//
// Valores em PT-BR por extenso (não só cabeçalho) — admin Auctus é PT-BR only.
// ─────────────────────────────────────────────────────────────────────────────

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { fromDateKey, type ActivityCounters, type ConversionRates } from '@/utils/salespersonActivityStats';

export interface SalespersonActivityExportRow {
  name: string;
  counters: ActivityCounters;
  /** Ex: "18/40" — períodos preenchidos sobre períodos esperados no intervalo. */
  filledPeriodsLabel: string;
  missingDaysCount: number;
  partialDaysCount: number;
  coveragePercent: number;
  goalContactsDaysMet: number;
  goalMeetingsDaysMet: number;
  businessDaysCount: number;
  /** Média simples das duas aderências (contatos e reuniões) — ver nota no
   * componente de tabela sobre por que é uma média, não um terceiro cálculo. */
  adherencePercent: number;
}

export interface SalespersonActivityMissingDays {
  name: string;
  /** 'yyyy-MM-dd', ordem crescente. */
  missingDays: string[];
}

export interface SalespersonActivityExportInput {
  /** Rótulo PT-BR do período filtrado, ex: "01/09/2026 a 30/09/2026". */
  periodLabel: string;
  totals: ActivityCounters;
  rates: ConversionRates;
  perSalesperson: SalespersonActivityExportRow[];
  missingDays: SalespersonActivityMissingDays[];
}

export interface ActivityExcelSheet {
  name: string;
  rows: Array<Array<string | number>>;
  widths: number[];
}

const METRIC_LABEL: Record<keyof ActivityCounters, string> = {
  contacts: 'Contatos / Prospecções',
  meetings_scheduled: 'Reuniões agendadas',
  meetings_held: 'Reuniões realizadas',
  sales_count: 'Vendas',
};

/** `number | null` → célula do Excel. `null` (denominador zero) vira "—",
 * igual à tela — nunca NaN/Infinity no arquivo. */
function rateCell(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

function weekdayLabelBR(dateKey: string): string {
  const date = fromDateKey(dateKey);
  if (!date) return dateKey;
  const weekday = format(date, 'EEEE', { locale: ptBR });
  return `${format(date, 'dd/MM/yyyy')} (${weekday})`;
}

/**
 * Monta as planilhas a partir do mesmo dado que a tela calcula — assim
 * exportar nunca diverge do que o gestor está vendo.
 */
export function buildSalespersonActivityExcelSheets(
  input: SalespersonActivityExportInput,
): ActivityExcelSheet[] {
  const resumoRows: Array<Array<string | number>> = [
    ['Atividade Comercial — Relatório'],
    ['Período', input.periodLabel],
    [],
    ['Métrica', 'Total no período'],
    ...(Object.keys(METRIC_LABEL) as (keyof ActivityCounters)[]).map((key) => [
      METRIC_LABEL[key],
      input.totals[key],
    ]),
    [],
    ['Funil de conversão', 'Taxa'],
    ['Contato → Reunião agendada', rateCell(input.rates.contactToScheduled)],
    ['Reunião agendada → Realizada', rateCell(input.rates.scheduledToHeld)],
    ['Reunião realizada → Venda', rateCell(input.rates.heldToSale)],
  ];

  const porVendedorRows: Array<Array<string | number>> = [
    [
      'Vendedor',
      'Contatos',
      'Reuniões agendadas',
      'Reuniões realizadas',
      'Vendas',
      'Períodos preenchidos',
      'Dias sem registro',
      'Dias parciais',
      '% Cobertura',
      'Dias que bateu meta de contatos',
      'Dias que bateu meta de reuniões',
      '% Aderência à meta',
    ],
    ...input.perSalesperson.map((row) => [
      row.name,
      row.counters.contacts,
      row.counters.meetings_scheduled,
      row.counters.meetings_held,
      row.counters.sales_count,
      row.filledPeriodsLabel,
      row.missingDaysCount,
      row.partialDaysCount,
      `${row.coveragePercent.toFixed(1)}%`,
      `${row.goalContactsDaysMet}/${row.businessDaysCount}`,
      `${row.goalMeetingsDaysMet}/${row.businessDaysCount}`,
      `${row.adherencePercent.toFixed(1)}%`,
    ]),
  ];

  const diasSemRegistroRows: Array<Array<string | number>> = [
    ['Vendedor', 'Dia sem registro'],
    ...input.missingDays.flatMap((entry) =>
      entry.missingDays.length > 0
        ? entry.missingDays.map((day) => [entry.name, weekdayLabelBR(day)])
        : [[entry.name, 'Nenhum — cobertura completa no período']],
    ),
  ];

  return [
    { name: 'Resumo', rows: resumoRows, widths: [34, 20] },
    { name: 'Por vendedor', rows: porVendedorRows, widths: [24, 12, 18, 18, 10, 18, 16, 14, 12, 24, 24, 18] },
    { name: 'Dias sem registro', rows: diasSemRegistroRows, widths: [24, 28] },
  ];
}

function safeFilename(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'atividade-comercial'
  );
}

/** Gera e baixa o .xlsx no navegador. Import dinâmico de `xlsx` — mesmo padrão
 * de `dreExcelGenerator`/`inventoryExcelGenerator`, sem dependência nova. */
export async function exportSalespersonActivityExcel(
  input: SalespersonActivityExportInput,
): Promise<void> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  for (const sheet of buildSalespersonActivityExcelSheets(input)) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    worksheet['!cols'] = sheet.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  XLSX.writeFile(workbook, `${safeFilename(`atividade-comercial-${input.periodLabel}`)}.xlsx`);
}

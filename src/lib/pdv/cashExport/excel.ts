import { CASH_EXPORT_TOTALS_NOTE, cashExportPaymentLabel } from './labels';
import { mergePaymentSummaries, summarizeCashExportEntries } from './filters';
import { buildAllItemRows, buildAllMovementRows, toWallClockDate } from './rows';
import type { CashExportPayload } from './types';

export interface CashExportDocumentOptions {
  companyName: string;
  /** Texto do período ou do caixa, ex.: "01/11/2026 a 17/11/2026". */
  periodLabel: string;
  /** Resumo dos filtros aplicados, ex.: "Vendas, Sangrias | Pix | sem canceladas". */
  filtersLabel: string;
  timezone: string;
  includeItems: boolean;
}

const MONEY_FORMAT = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const DATE_TIME_FORMAT = 'dd/mm/yyyy hh:mm';
const QUANTITY_FORMAT = '#,##0.###';
const HEADER_FILL = 'FF1F2937';
const BAND_FILL = 'FFF3F4F6';
const CANCELLED_FONT = 'FF9CA3AF';

type Workbook = import('exceljs').Workbook;
type Worksheet = import('exceljs').Worksheet;

function styleHeader(row: import('exceljs').Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 24;
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  });
}

function addTitle(sheet: Worksheet, title: string, options: CashExportDocumentOptions, columns: number) {
  const lines = [
    [title, true],
    [options.companyName, false],
    [options.periodLabel, false],
    [`Filtros: ${options.filtersLabel}`, false],
  ] as const;
  lines.forEach(([text, bold], index) => {
    const row = sheet.getRow(index + 1);
    row.getCell(1).value = text;
    row.getCell(1).font = { bold, size: bold ? 14 : 10, color: { argb: bold ? 'FF111827' : 'FF4B5563' } };
    sheet.mergeCells(index + 1, 1, index + 1, Math.max(columns, 2));
  });
  return lines.length + 2; // linha em branco antes da tabela
}

export async function buildCashExportWorkbook(
  payload: CashExportPayload,
  options: CashExportDocumentOptions,
): Promise<Workbook> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Dominex';
  workbook.created = new Date();

  // ---- Resumo ------------------------------------------------------------
  const summary = workbook.addWorksheet('Resumo', { properties: { tabColor: { argb: 'FF2563EB' } } });
  const summaryHeaders = [
    'Caixa', 'Operador', 'Aberto em', 'Fechado em', 'Troco inicial', 'Esperado em dinheiro', 'Contado',
    'Diferença', 'Movimentações', 'Entradas', 'Saídas', 'Saldo', 'Vendas', 'Vendas canceladas',
  ];
  const summaryWidths = [24, 24, 18, 18, 16, 20, 16, 14, 15, 16, 16, 16, 10, 18];
  summary.columns = summaryWidths.map((width) => ({ width }));
  const summaryHeaderRow = addTitle(summary, 'Histórico de movimentações do caixa', options, summaryHeaders.length);
  styleHeader(summary.getRow(summaryHeaderRow));
  summaryHeaders.forEach((header, index) => { summary.getRow(summaryHeaderRow).getCell(index + 1).value = header; });

  const summaries = payload.sessions.map((session) => summarizeCashExportEntries(session.entries));
  let rowIndex = summaryHeaderRow + 1;
  payload.sessions.forEach((session, index) => {
    const totals = summaries[index];
    const row = summary.getRow(rowIndex++);
    row.values = [
      session.terminalName,
      session.operatorName,
      toWallClockDate(session.openedAt, options.timezone),
      session.closedAt ? toWallClockDate(session.closedAt, options.timezone) : null,
      session.openingAmount,
      session.expectedAmount,
      session.countedAmount,
      session.difference,
      totals.movements,
      totals.totalIn,
      totals.totalOut,
      totals.net,
      totals.salesCount,
      totals.cancelledSalesCount,
    ];
  });
  const firstDataRow = summaryHeaderRow + 1;
  const lastDataRow = rowIndex - 1;
  const totalRow = summary.getRow(rowIndex++);
  const sum = (column: string) => ({ formula: `SUM(${column}${firstDataRow}:${column}${lastDataRow})` });
  const sumOf = (pick: (index: number) => number) => payload.sessions.reduce((acc, _s, i) => acc + pick(i), 0);
  totalRow.values = [
    'Total', '', '', '',
    { ...sum('E'), result: payload.sessions.reduce((a, s) => a + s.openingAmount, 0) },
    { ...sum('F'), result: payload.sessions.reduce((a, s) => a + s.expectedAmount, 0) },
    { ...sum('G'), result: payload.sessions.reduce((a, s) => a + s.countedAmount, 0) },
    { ...sum('H'), result: payload.sessions.reduce((a, s) => a + s.difference, 0) },
    { ...sum('I'), result: sumOf((i) => summaries[i].movements) },
    { ...sum('J'), result: sumOf((i) => summaries[i].totalIn) },
    { ...sum('K'), result: sumOf((i) => summaries[i].totalOut) },
    { ...sum('L'), result: sumOf((i) => summaries[i].net) },
    { ...sum('M'), result: sumOf((i) => summaries[i].salesCount) },
    { ...sum('N'), result: sumOf((i) => summaries[i].cancelledSalesCount) },
  ];
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND_FILL } }; });
  for (let r = firstDataRow; r <= totalRow.number; r++) {
    const row = summary.getRow(r);
    [3, 4].forEach((c) => { row.getCell(c).numFmt = DATE_TIME_FORMAT; });
    [5, 6, 7, 8, 10, 11, 12].forEach((c) => { row.getCell(c).numFmt = MONEY_FORMAT; });
  }

  // Totais por forma de pagamento
  rowIndex += 1;
  const paymentTitle = summary.getRow(rowIndex++);
  paymentTitle.getCell(1).value = 'Totais por forma de pagamento';
  paymentTitle.getCell(1).font = { bold: true, size: 12 };
  const paymentHeader = summary.getRow(rowIndex++);
  ['Forma de pagamento', 'Movimentações', 'Entradas', 'Saídas', 'Saldo'].forEach((header, i) => {
    paymentHeader.getCell(i + 1).value = header;
    paymentHeader.getCell(i + 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    paymentHeader.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  });
  for (const method of mergePaymentSummaries(summaries)) {
    const row = summary.getRow(rowIndex++);
    row.values = [cashExportPaymentLabel(method.paymentMethod), method.entries, method.in, method.out, method.net];
    [3, 4, 5].forEach((c) => { row.getCell(c).numFmt = MONEY_FORMAT; });
  }
  const totalsNote = summary.getRow(rowIndex + 1);
  totalsNote.getCell(1).value = CASH_EXPORT_TOTALS_NOTE;
  totalsNote.getCell(1).font = { italic: true, size: 9 };
  summary.views = [{ state: 'frozen', ySplit: summaryHeaderRow, xSplit: 0 }];

  // ---- Movimentações -----------------------------------------------------
  const movements = workbook.addWorksheet('Movimentações', { properties: { tabColor: { argb: 'FF16A34A' } } });
  const movementColumns: { header: string; width: number }[] = [
    { header: 'Caixa', width: 28 },
    { header: 'Data e hora', width: 18 },
    { header: 'Tipo', width: 24 },
    { header: 'Descrição', width: 40 },
    { header: 'Nº da venda', width: 12 },
    { header: 'Cliente', width: 24 },
    { header: 'Vendedor', width: 22 },
    { header: 'Lançado por', width: 22 },
    { header: 'Forma de pagamento', width: 20 },
    { header: 'Entrada', width: 16 },
    { header: 'Saída', width: 16 },
    { header: 'Entra na gaveta', width: 16 },
    { header: 'Cancelada', width: 12 },
    { header: 'Motivo do cancelamento', width: 34 },
    { header: 'Valor cancelado', width: 16 },
  ];
  movements.columns = movementColumns.map(({ width }) => ({ width }));
  movements.getRow(1).values = movementColumns.map(({ header }) => header);
  styleHeader(movements.getRow(1));
  buildAllMovementRows(payload).forEach((item, index) => {
    const row = movements.getRow(index + 2);
    row.values = [
      item.caixa,
      toWallClockDate(item.occurredAt, options.timezone),
      item.kindLabel,
      item.description,
      item.orderNumber,
      item.customer,
      item.salesperson,
      item.author,
      item.paymentLabel,
      item.entrada,
      item.saida,
      item.affectsDrawer ? 'Sim' : 'Não',
      item.isCancelled ? 'Sim' : 'Não',
      item.cancelledReason,
      item.cancelledValue,
    ];
    row.getCell(2).numFmt = DATE_TIME_FORMAT;
    [10, 11, 15].forEach((c) => { row.getCell(c).numFmt = MONEY_FORMAT; });
    if (item.isCancelled) row.font = { color: { argb: CANCELLED_FONT }, italic: true };
  });
  movements.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];
  movements.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: movementColumns.length } };

  // ---- Itens -------------------------------------------------------------
  if (options.includeItems) {
    const items = workbook.addWorksheet('Itens', { properties: { tabColor: { argb: 'FFF59E0B' } } });
    const itemColumns = [
      { header: 'Caixa', width: 28 },
      { header: 'Nº da venda', width: 12 },
      { header: 'Data e hora', width: 18 },
      { header: 'Cliente', width: 24 },
      { header: 'Item', width: 40 },
      { header: 'Unidade', width: 10 },
      { header: 'Quantidade', width: 12 },
      { header: 'Valor unitário', width: 16 },
      { header: 'Desconto', width: 14 },
      { header: 'Total', width: 16 },
      { header: 'Venda cancelada', width: 16 },
    ];
    items.columns = itemColumns.map(({ width }) => ({ width }));
    items.getRow(1).values = itemColumns.map(({ header }) => header);
    styleHeader(items.getRow(1));
    buildAllItemRows(payload).forEach((item, index) => {
      const row = items.getRow(index + 2);
      row.values = [
        item.caixa,
        item.orderNumber,
        toWallClockDate(item.occurredAt, options.timezone),
        item.customer,
        item.name,
        item.unit,
        item.quantity,
        item.unitPrice,
        item.discount,
        item.total,
        item.isCancelled ? 'Sim' : 'Não',
      ];
      row.getCell(3).numFmt = DATE_TIME_FORMAT;
      row.getCell(7).numFmt = QUANTITY_FORMAT;
      [8, 9, 10].forEach((c) => { row.getCell(c).numFmt = MONEY_FORMAT; });
      if (item.isCancelled) row.font = { color: { argb: CANCELLED_FONT }, italic: true };
    });
    items.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];
    items.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: itemColumns.length } };
  }

  return workbook;
}

export async function buildCashExportXlsxBuffer(
  payload: CashExportPayload,
  options: CashExportDocumentOptions,
): Promise<ArrayBuffer> {
  const workbook = await buildCashExportWorkbook(payload, options);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export async function downloadCashExportExcel(
  payload: CashExportPayload,
  options: CashExportDocumentOptions,
  filename: string,
): Promise<void> {
  const buffer = await buildCashExportXlsxBuffer(payload, options);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

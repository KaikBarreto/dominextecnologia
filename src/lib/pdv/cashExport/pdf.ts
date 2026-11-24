import { jsPDF } from 'jspdf';
import { autoTable, type CellDef, type RowInput } from 'jspdf-autotable';
import { CASH_EXPORT_TOTALS_NOTE, cashExportPaymentLabel } from './labels';
import { mergePaymentSummaries, summarizeCashExportEntries, type CashExportPaymentSummary } from './filters';
import { buildMovementRows, cashExportSessionLabel } from './rows';
import type { CashExportDocumentOptions } from './excel';
import type { CashExportPayload, CashExportSession } from './types';

export interface CashExportPdfFormatters {
  money: (value: number) => string;
  dateTime: (value: string) => string;
}

const MARGIN = 10;
const PAGE_W = 297;
const PAGE_H = 210;
const FONT = 'helvetica';
const DARK: [number, number, number] = [31, 41, 55];
const MUTED: [number, number, number] = [107, 114, 128];
const BAND: [number, number, number] = [243, 244, 246];
const ITEM_FILL: [number, number, number] = [250, 250, 251];

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };

/** Moeda sem NBSP: a helvetica mede esse glifo largo e abre um vão feio no texto. */
function plain(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, ' ');
}

/** Cabeçalho acompanha o alinhamento da coluna (o autotable não faz isso sozinho). */
function alignHead(rightColumns: number[], centerColumns: number[] = []) {
  return (data: { section: string; column: { index: number }; cell: { styles: { halign: 'left' | 'center' | 'right' | 'justify' } } }) => {
    if (data.section !== 'head') return;
    if (rightColumns.includes(data.column.index)) data.cell.styles.halign = 'right';
    else if (centerColumns.includes(data.column.index)) data.cell.styles.halign = 'center';
  };
}

function finalY(doc: Doc, fallback: number): number {
  return doc.lastAutoTable?.finalY ?? fallback;
}

function ensureSpace(doc: Doc, y: number, needed: number): number {
  if (y + needed <= PAGE_H - 14) return y;
  doc.addPage();
  return 14;
}

function quantityText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000).replace('.', ',');
}

function paymentRows(rows: CashExportPaymentSummary[], fmt: CashExportPdfFormatters): RowInput[] {
  return rows.map((row) => [
    cashExportPaymentLabel(row.paymentMethod),
    String(row.entries),
    plain(fmt.money(row.in)),
    plain(fmt.money(row.out)),
    plain(fmt.money(row.net)),
  ]);
}

function drawPaymentTotals(doc: Doc, y: number, rows: CashExportPaymentSummary[], fmt: CashExportPdfFormatters): number {
  if (rows.length === 0) return y;
  y = ensureSpace(doc, y, 14 + rows.length * 6);
  doc.setFont(FONT, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text('Total por forma de pagamento', MARGIN, y);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: MARGIN, right: MARGIN, top: 14, bottom: 14 },
    tableWidth: 170,
    head: [['Forma de pagamento', 'Movimentações', 'Entradas', 'Saídas', 'Saldo']],
    body: paymentRows(rows, fmt),
    theme: 'striped',
    styles: { font: FONT, fontSize: 8, cellPadding: 1.6, textColor: DARK },
    headStyles: { fillColor: DARK, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: BAND },
    columnStyles: {
      1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
    },
    didParseCell: alignHead([1, 2, 3, 4]),
  });
  const noteY = ensureSpace(doc, finalY(doc, y) + 4, 6);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(110, 116, 128);
  doc.text(CASH_EXPORT_TOTALS_NOTE, MARGIN, noteY);
  doc.setTextColor(...DARK);
  return noteY + 6;
}

function drawSession(
  doc: Doc,
  startY: number,
  session: CashExportSession,
  options: CashExportDocumentOptions,
  fmt: CashExportPdfFormatters,
): number {
  let y = ensureSpace(doc, startY, 60);
  const totals = summarizeCashExportEntries(session.entries);

  doc.setFont(FONT, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(cashExportSessionLabel(session), MARGIN, y);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const meta = [
    `Aberto em ${fmt.dateTime(session.openedAt)}`,
    session.closedAt ? `Fechado em ${fmt.dateTime(session.closedAt)}` : null,
    session.closedByName ? `Fechado por ${session.closedByName}` : null,
    session.cashAccountName ? `Conta: ${session.cashAccountName}` : null,
    session.wasReopened ? 'Caixa reaberto depois' : null,
  ].filter(Boolean).join('   |   ');
  doc.text(meta, MARGIN, y + 4.5);
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: 14, bottom: 14 },
    head: [['Troco inicial', 'Esperado em dinheiro', 'Contado', 'Diferença', 'Entradas', 'Saídas', 'Saldo', 'Vendas', 'Canceladas', 'Movimentações']],
    body: [[
      plain(fmt.money(session.openingAmount)),
      plain(fmt.money(session.expectedAmount)),
      plain(fmt.money(session.countedAmount)),
      plain(fmt.money(session.difference)),
      plain(fmt.money(totals.totalIn)),
      plain(fmt.money(totals.totalOut)),
      plain(fmt.money(totals.net)),
      String(totals.salesCount),
      String(totals.cancelledSalesCount),
      String(totals.movements),
    ]],
    theme: 'grid',
    styles: { font: FONT, fontSize: 8, cellPadding: 1.8, textColor: DARK, halign: 'center', lineColor: [229, 231, 235] },
    headStyles: { fillColor: BAND, textColor: DARK, fontStyle: 'bold', fontSize: 7 },
  });
  y = finalY(doc, y) + 5;

  if (session.entries.length === 0) {
    doc.setFont(FONT, 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text('Nenhuma movimentação deste caixa com os filtros escolhidos.', MARGIN, y);
    return y + 8;
  }

  const body: RowInput[] = [];
  for (const row of buildMovementRows(session)) {
    const cancelled = row.isCancelled;
    const textColor = cancelled ? ([156, 163, 175] as [number, number, number]) : DARK;
    const description = cancelled
      ? `${row.description} (cancelada${row.cancelledReason ? `: ${row.cancelledReason}` : ''})`
      : row.description;
    const amountIn = cancelled && row.cancelledValue != null ? `(${plain(fmt.money(row.cancelledValue))})` : row.entrada != null ? plain(fmt.money(row.entrada)) : '';
    const style = { textColor, fontStyle: cancelled ? ('italic' as const) : ('normal' as const) };
    const cell = (content: string, extra: Partial<CellDef['styles']> = {}): CellDef => ({ content, styles: { ...style, ...extra } });
    body.push([
      cell(fmt.dateTime(row.occurredAt)),
      cell(row.kindLabel),
      cell(description),
      cell(row.orderNumber != null ? String(row.orderNumber) : '', { halign: 'center' }),
      cell(row.customer),
      cell(row.paymentLabel),
      cell(row.author),
      cell(amountIn, { halign: 'right' }),
      cell(row.saida != null ? plain(fmt.money(row.saida)) : '', { halign: 'right' }),
    ]);
    if (options.includeItems) {
      for (const item of row.items) {
        const discount = item.discount > 0 ? `, desconto ${plain(fmt.money(item.discount))}` : '';
        const itemStyle = { fontSize: 7.5, textColor: MUTED, fillColor: ITEM_FILL, fontStyle: 'normal' as const };
        body.push([
          { content: '', styles: itemStyle },
          {
            content: `${quantityText(item.quantity)} ${item.unit ?? ''} x ${item.name} (${plain(fmt.money(item.unitPrice))} cada${discount})`.replace(/\s+/g, ' '),
            colSpan: 6,
            styles: { ...itemStyle, cellPadding: { top: 1, bottom: 1, left: 6, right: 1 } },
          },
          { content: plain(fmt.money(item.total)), styles: { ...itemStyle, halign: 'right' } },
          { content: '', styles: itemStyle },
        ]);
      }
    }
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: 14, bottom: 14 },
    head: [['Data e hora', 'Tipo', 'Descrição', 'Venda', 'Cliente', 'Forma de pagamento', 'Lançado por', 'Entrada', 'Saída']],
    body,
    theme: 'plain',
    showHead: 'everyPage',
    styles: { font: FONT, fontSize: 8, cellPadding: 1.6, textColor: DARK, lineColor: [229, 231, 235], lineWidth: { bottom: 0.1 }, overflow: 'linebreak' },
    headStyles: { fillColor: DARK, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 32 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 13 },
      4: { cellWidth: 34 },
      5: { cellWidth: 30 },
      6: { cellWidth: 28 },
      7: { cellWidth: 24, halign: 'right' },
      8: { cellWidth: 24, halign: 'right' },
    },
    didParseCell: alignHead([7, 8], [3]),
  });
  y = finalY(doc, y) + 6;

  return drawPaymentTotals(doc, y, totals.byPaymentMethod, fmt);
}

export function buildCashExportPdf(
  payload: CashExportPayload,
  options: CashExportDocumentOptions,
  fmt: CashExportPdfFormatters,
): jsPDF {
  const doc: Doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: 'Histórico de movimentações do caixa', creator: 'Dominex' });

  // Cabeçalho
  doc.setFont(FONT, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...DARK);
  doc.text('Histórico de movimentações do caixa', MARGIN, 16);
  doc.setFont(FONT, 'bold');
  doc.setFontSize(10);
  doc.text(options.companyName, MARGIN, 22);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(options.periodLabel, MARGIN, 27);
  const filterLines = doc.splitTextToSize(`Filtros: ${options.filtersLabel}`, PAGE_W - 2 * MARGIN) as string[];
  doc.text(filterLines, MARGIN, 31.5);
  let y = 31.5 + filterLines.length * 4 + 3;

  const summaries = payload.sessions.map((session) => summarizeCashExportEntries(session.entries));
  const multiple = payload.sessions.length > 1;

  if (multiple) {
    const sum = (pick: (i: number) => number) => payload.sessions.reduce((acc, _s, i) => acc + pick(i), 0);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text('Resumo dos caixas', MARGIN, y);
    const body: RowInput[] = payload.sessions.map((session, i) => [
      cashExportSessionLabel(session),
      session.closedAt ? fmt.dateTime(session.closedAt) : '',
      plain(fmt.money(session.expectedAmount)),
      plain(fmt.money(session.countedAmount)),
      plain(fmt.money(session.difference)),
      plain(fmt.money(summaries[i].totalIn)),
      plain(fmt.money(summaries[i].totalOut)),
      plain(fmt.money(summaries[i].net)),
      String(summaries[i].salesCount),
    ]);
    body.push([
      { content: 'Total', styles: { fontStyle: 'bold' } },
      '',
      { content: plain(fmt.money(sum((i) => payload.sessions[i].expectedAmount))), styles: { fontStyle: 'bold' } },
      { content: plain(fmt.money(sum((i) => payload.sessions[i].countedAmount))), styles: { fontStyle: 'bold' } },
      { content: plain(fmt.money(sum((i) => payload.sessions[i].difference))), styles: { fontStyle: 'bold' } },
      { content: plain(fmt.money(sum((i) => summaries[i].totalIn))), styles: { fontStyle: 'bold' } },
      { content: plain(fmt.money(sum((i) => summaries[i].totalOut))), styles: { fontStyle: 'bold' } },
      { content: plain(fmt.money(sum((i) => summaries[i].net))), styles: { fontStyle: 'bold' } },
      { content: String(sum((i) => summaries[i].salesCount)), styles: { fontStyle: 'bold' } },
    ]);
    autoTable(doc, {
      startY: y + 2,
      margin: { left: MARGIN, right: MARGIN, top: 14, bottom: 14 },
      head: [['Caixa', 'Fechado em', 'Esperado em dinheiro', 'Contado', 'Diferença', 'Entradas', 'Saídas', 'Saldo', 'Vendas']],
      body,
      theme: 'striped',
      showHead: 'everyPage',
      styles: { font: FONT, fontSize: 8, cellPadding: 1.6, textColor: DARK },
      headStyles: { fillColor: DARK, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: BAND },
      columnStyles: {
        2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
        5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'center' },
      },
      didParseCell: alignHead([2, 3, 4, 5, 6, 7], [8]),
    });
    y = finalY(doc, y) + 6;
    y = drawPaymentTotals(doc, y, mergePaymentSummaries(summaries), fmt);
  }

  payload.sessions.forEach((session) => {
    if (multiple) {
      doc.addPage();
      y = 14;
    }
    y = drawSession(doc, y, session, options, fmt);
  });

  // Rodapé com paginação em todas as páginas
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`${options.companyName}  |  ${options.periodLabel}`, MARGIN, PAGE_H - 6);
    doc.text(`Página ${page} de ${pages}`, PAGE_W - MARGIN, PAGE_H - 6, { align: 'right' });
  }
  return doc;
}

export function downloadCashExportPdf(
  payload: CashExportPayload,
  options: CashExportDocumentOptions,
  fmt: CashExportPdfFormatters,
  filename: string,
): void {
  buildCashExportPdf(payload, options, fmt).save(filename);
}

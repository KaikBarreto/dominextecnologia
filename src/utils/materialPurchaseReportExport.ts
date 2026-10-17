import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CompanySettings } from '@/hooks/useCompanySettings';
import type { MaterialPurchaseReportRow } from '@/hooks/useMaterialPurchaseReport';
import type { LocaleCode } from '@/lib/i18n/locales';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, formatNumber, toBcp47 } from '@/lib/format';
import { normalizePaymentMethod } from '@/lib/finance-payment-methods';
import { safeTimeZone, todayInTz } from '@/lib/timezone';
import { buildPaymentBreakdown, groupMaterialPurchaseRows, type MaterialPurchaseDisplayRow, type MaterialPurchaseReportView, type PurchaseReportSummary } from '@/lib/material-purchase-report';
import { openPdfInTab } from '@/utils/openPdfInTab';
import { cpfCnpjMask, phoneMask } from '@/utils/masks';

type SheetValue = string | number | null;

export interface MaterialPurchaseReportExportData {
  company: CompanySettings | null | undefined;
  whiteLabel: boolean;
  materialRows: MaterialPurchaseReportRow[];
  displayRows: MaterialPurchaseDisplayRow[];
  viewMode: MaterialPurchaseReportView;
  summary: PurchaseReportSummary;
  filters: {
    period: string;
    materials: string[];
    suppliers: string[];
    stocks: string[];
    groups: string[];
    users: string[];
    hideZero: boolean;
    search: string;
  };
  locale: LocaleCode;
  currency: string;
  timezone?: string | null;
}

export interface MaterialPurchaseReportSheets {
  summary: SheetValue[][];
  history: SheetValue[][];
  groups: SheetValue[][];
}

function dateLabel(value: string | null, locale: LocaleCode): string {
  if (!value) return '';
  return new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString(toBcp47(locale), { timeZone: 'UTC' });
}

function activeFilterLines(data: MaterialPurchaseReportExportData): string[] {
  const tr = MESSAGES[data.locale].app.inventory.purchaseReport.exportLabels;
  const lines = [`${tr.period}: ${data.filters.period}`];
  const add = (label: string, values: string[]) => { if (values.length) lines.push(`${label}: ${values.join(', ')}`); };
  add(tr.material, data.filters.materials);
  add(tr.supplier, data.filters.suppliers);
  add(tr.stock, data.filters.stocks);
  add(tr.group, data.filters.groups);
  add(tr.user, data.filters.users);
  if (data.filters.search) lines.push(`${tr.search}: ${data.filters.search}`);
  lines.push(`${tr.hideZero}: ${data.filters.hideZero ? tr.yes : tr.no}`);
  return lines;
}

function companyDetailLines(company: CompanySettings | null | undefined): string[] {
  if (!company) return [];
  const lines: string[] = [];
  if (company.show_address_in_documents && company.address) {
    const address = [company.address, company.address_number, company.complement, company.neighborhood, company.city, company.state, company.zip_code]
      .filter(Boolean).join(', ');
    if (address) lines.push(address);
  }
  const contact: string[] = [];
  if (company.show_phone_in_documents && company.phone) contact.push(phoneMask(company.phone));
  if (company.show_email_in_documents && company.email) contact.push(company.email);
  if (contact.length) lines.push(contact.join(' · '));
  if (company.show_cnpj_in_documents && company.document) lines.push(cpfCnpjMask(company.document));
  return lines;
}

function paymentLabel(data: MaterialPurchaseReportExportData, key: string): string {
  const payments = MESSAGES[data.locale].app.inventory.purchaseReport.payments;
  if (key === 'pending') return payments.pending;
  if (key === 'not_informed') return payments.notLinked;
  const normalized = normalizePaymentMethod(key);
  return normalized ? payments.methods[normalized] : key;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image_load_failed'));
    image.src = src;
  });
}

function summaryHeader(data: MaterialPurchaseReportExportData): SheetValue[][] {
  const tr = MESSAGES[data.locale].app.inventory.purchaseReport.exportLabels;
  const paymentTitle = MESSAGES[data.locale].app.inventory.purchaseReport.details.payments;
  const companyName = data.company?.show_name_in_documents !== false ? data.company?.name : null;
  const payments = buildPaymentBreakdown(data.materialRows);
  return [
    ...(companyName ? [[companyName] as SheetValue[]] : []),
    ...companyDetailLines(data.company).map((line) => [line] as SheetValue[]),
    [tr.reportTitle],
    [`${tr.generatedAt}: ${new Date().toLocaleString(toBcp47(data.locale), { timeZone: safeTimeZone(data.timezone) })}`],
    ...activeFilterLines(data).map((line) => [line]),
    [],
    [tr.purchasedTotal, data.summary.purchasedTotal],
    [tr.purchaseCount, data.summary.purchaseCount],
    [tr.averageTicket, data.summary.averagePurchaseTicket],
    [tr.projectedProfit, data.summary.projectedProfit],
    [tr.estimateNote],
    [],
    [paymentTitle],
    ...payments.map((item) => [paymentLabel(data, item.key), item.amount, item.percentage / 100, item.purchaseCount]),
    [],
  ];
}

function displayRowsSheet(data: MaterialPurchaseReportExportData, rows: MaterialPurchaseDisplayRow[]): SheetValue[][] {
  const tr = MESSAGES[data.locale].app.inventory.purchaseReport.exportLabels;
  return [
    [tr.group, tr.sku, tr.material, tr.unit, tr.lastPurchase, tr.purchases, tr.quantity, tr.total, tr.average, tr.balance, tr.projection],
    ...rows.map((row) => [
      row.group_name || (data.viewMode === 'group' ? row.label : ''),
      row.sku,
      row.label,
      row.unit,
      dateLabel(row.last_purchase_date, data.locale),
      row.purchase_count,
      data.viewMode === 'group' && !row.unit ? null : row.purchased_quantity,
      row.purchased_total,
      row.average_paid,
      data.viewMode === 'group' && !row.unit ? null : row.current_balance,
      row.projected_profit,
    ]),
  ];
}

export function buildMaterialPurchaseReportSheets(data: MaterialPurchaseReportExportData): MaterialPurchaseReportSheets {
  const tr = MESSAGES[data.locale].app.inventory.purchaseReport.exportLabels;
  const history: SheetValue[][] = [[
    tr.date, tr.group, tr.sku, tr.material, tr.unit, tr.supplier, tr.stock, tr.order,
    tr.user, tr.payment, tr.status, tr.quantity, tr.unitPrice, tr.total, tr.flow,
  ]];
  for (const material of data.materialRows) {
    for (const item of material.history) {
      history.push([
        dateLabel(item.date, data.locale), material.group_name ?? '', material.sku, material.material_name,
        item.unit || material.unit, item.supplier_name, item.stock_name, item.order_number,
        item.created_by_name, item.payment_method ?? '', item.payment_status === 'pago' ? tr.paid : item.payment_status === 'pendente' ? tr.pending : tr.notLinked,
        item.quantity, item.unit_price, item.total, item.flow_type === 'compra_direta' ? tr.direct : tr.request,
      ]);
    }
  }
  const groupedRows = groupMaterialPurchaseRows(data.materialRows, MESSAGES[data.locale].app.inventory.purchaseReport.ungrouped);
  return {
    summary: [...summaryHeader(data), ...displayRowsSheet(data, data.displayRows)],
    history,
    groups: displayRowsSheet({ ...data, viewMode: 'group' }, groupedRows),
  };
}

export async function generateMaterialPurchaseReportExcel(data: MaterialPurchaseReportExportData): Promise<void> {
  const XLSX = await import('xlsx');
  const tr = MESSAGES[data.locale].app.inventory.purchaseReport.exportLabels;
  const sheets = buildMaterialPurchaseReportSheets(data);
  const workbook = XLSX.utils.book_new();
  const append = (name: string, values: SheetValue[][], widths: number[]) => {
    const sheet = XLSX.utils.aoa_to_sheet(values);
    sheet['!cols'] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
  };
  append(tr.summarySheet, sheets.summary, [28, 18, 30, 12, 14, 12, 14, 18, 18, 14, 18]);
  append(tr.historySheet, sheets.history, [12, 20, 14, 30, 10, 24, 22, 12, 22, 18, 14, 14, 16, 18, 16]);
  append(tr.groupSheet, sheets.groups, [24, 14, 30, 10, 14, 12, 14, 18, 18, 14, 18]);
  XLSX.writeFile(workbook, `compras-por-material-${todayInTz(data.timezone)}.xlsx`);
}

export async function generateMaterialPurchaseReportPdf(data: MaterialPurchaseReportExportData): Promise<void> {
  const targetWindow = window.open('', '_blank');
  const tr = MESSAGES[data.locale].app.inventory.purchaseReport.exportLabels;
  const doc = new jsPDF('l', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const money = (value: number) => formatMoney(value, data.currency, data.locale);
  const number = (value: number) => formatNumber(value, data.locale, { maximumFractionDigits: 2 });
  let y = 12;

  doc.setProperties({ title: tr.reportTitle, subject: tr.reportTitle });
  let infoX = 14;
  if (data.company?.logo_url) {
    try {
      const image = await loadImage(data.company.logo_url);
      const ratio = image.width / image.height || 1;
      const width = ratio >= 1 ? 22 : 22 * ratio;
      const height = ratio >= 1 ? 22 / ratio : 22;
      doc.addImage(image, 'PNG', 14, y, width, height);
      infoX = 41;
    } catch {
      // O relatório continua sem a imagem quando a origem bloqueia CORS.
    }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(data.company?.show_name_in_documents !== false && data.company?.name ? data.company.name : tr.reportTitle, infoX, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100);
  companyDetailLines(data.company).forEach((line, index) => doc.text(line, infoX, y + 10 + index * 3.5));
  y += Math.max(16, 11 + companyDetailLines(data.company).length * 3.5);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(25);
  doc.text(tr.reportTitle, 14, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100);
  const filterText = activeFilterLines(data).join('  |  ');
  const wrappedFilters = doc.splitTextToSize(filterText, pageWidth - 28);
  doc.text(wrappedFilters, 14, y);
  y += wrappedFilters.length * 3.5 + 4;

  const cardWidth = (pageWidth - 31) / 4;
  const cards: Array<[string, string]> = [
    [tr.purchasedTotal, money(data.summary.purchasedTotal)],
    [tr.purchaseCount, number(data.summary.purchaseCount)],
    [tr.averageTicket, money(data.summary.averagePurchaseTicket)],
    [tr.projectedProfit, money(data.summary.projectedProfit)],
  ];
  cards.forEach(([label, value], index) => {
    const x = 14 + index * (cardWidth + 1);
    doc.setFillColor(247, 248, 250);
    doc.setDrawColor(225, 228, 232);
    doc.roundedRect(x, y, cardWidth, 15, 1.5, 1.5, 'FD');
    doc.setFontSize(6.5); doc.setTextColor(100); doc.text(label, x + 3, y + 5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(25); doc.text(value, x + 3, y + 11.5);
    doc.setFont('helvetica', 'normal');
  });
  y += 20;

  const paymentSummary = buildPaymentBreakdown(data.materialRows)
    .map((item) => `${paymentLabel(data, item.key)}: ${money(item.amount)} (${number(item.percentage)}%)`)
    .join('  ·  ');
  if (paymentSummary) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(80);
    const paymentLines = doc.splitTextToSize(`${MESSAGES[data.locale].app.inventory.purchaseReport.details.payments}: ${paymentSummary}`, pageWidth - 28);
    doc.text(paymentLines, 14, y);
    y += paymentLines.length * 3.5 + 3;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14, bottom: 15 },
    head: [[tr.group, tr.material, tr.lastPurchase, tr.purchases, tr.quantity, tr.total, tr.average, tr.balance, tr.projection]],
    body: data.displayRows.map((row) => [
      row.group_name || (data.viewMode === 'group' ? row.label : ''), row.label,
      dateLabel(row.last_purchase_date, data.locale), number(row.purchase_count),
      data.viewMode === 'group' && !row.unit ? '—' : `${number(row.purchased_quantity)} ${row.unit}`,
      money(row.purchased_total), row.average_paid == null ? tr.notInformed : money(row.average_paid),
      data.viewMode === 'group' && !row.unit ? '—' : number(row.current_balance), money(row.projected_profit),
    ]),
    theme: 'striped',
    styles: { fontSize: 7, cellPadding: 1.7, overflow: 'linebreak' },
    headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
  });

  doc.addPage('a4', 'landscape');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(25); doc.text(tr.historySheet, 14, 13);
  const historyRows = buildMaterialPurchaseReportSheets(data).history.slice(1);
  autoTable(doc, {
    startY: 18,
    margin: { left: 10, right: 10, bottom: 15 },
    head: [[tr.date, tr.material, tr.supplier, tr.stock, tr.order, tr.user, tr.payment, tr.status, tr.quantity, tr.unitPrice, tr.total]],
    body: historyRows.map((row) => [row[0], row[3], row[5], row[6], row[7], row[8], row[9] || tr.notInformed, row[10], `${number(Number(row[11]))} ${row[4]}`, row[12] == null ? tr.notInformed : money(Number(row[12])), row[13] == null ? tr.notInformed : money(Number(row[13]))]),
    theme: 'striped', styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold' },
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(130);
    doc.text(`${tr.generatedAt}: ${new Date().toLocaleString(toBcp47(data.locale), { timeZone: safeTimeZone(data.timezone) })}`, 14, pageHeight - 7);
    doc.text(`${page}/${pages}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
    if (!data.whiteLabel) doc.text('Dominex · dominex.app', pageWidth / 2, pageHeight - 7, { align: 'center' });
  }
  const filename = `compras-por-material-${todayInTz(data.timezone)}`;
  openPdfInTab(doc.output('blob'), filename, targetWindow);
}

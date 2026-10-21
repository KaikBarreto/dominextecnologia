import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LucideIcon } from 'lucide-react';
import { openPdfInTab } from '@/utils/openPdfInTab';

export interface DfcExportMovement {
  activity: string;
  category: string;
  costCenter: string;
  paidDate: string;
  description: string;
  type: string;
  amount: number;
}

export interface DfcExportRow {
  code: string;
  label: string;
  level: 'section' | 'category' | 'subcategory' | 'result';
  inflow: number;
  outflow: number;
  net: number;
  color?: string | null;
  icon?: LucideIcon;
}

export interface DfcExportData {
  periodLabel: string;
  locale?: string;
  currency?: string;
  company?: { name: string; document?: string; phone?: string; email?: string; address?: string };
  brandName?: string;
  brandLogoUrl?: string;
  openingBalance: number;
  totalInflow: number;
  totalOutflow: number;
  netChange: number;
  closingBalance: number;
  rows?: DfcExportRow[];
  movements: DfcExportMovement[];
}

const MOVEMENT_HEADERS = ['Atividade', 'Categoria', 'Centro de custo', 'Data da baixa', 'Descrição', 'Tipo', 'Valor realizado'];
const NAVY = 'FF172033';
const BORDER = 'FFE2E8F0';
const MUTED = 'FF64748B';
const LIGHT = 'FFF1F5F9';
const WHITE = 'FFFFFFFF';
const CURRENCY_FORMAT = 'R$ #,##0.00;-R$ #,##0.00';

export const csvCell = (value: string | number): string => {
  const raw = typeof value === 'number' ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value;
  const safe = typeof raw === 'string' && /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${String(safe).replace(/"/g, '""')}"`;
};

const localeOf = (locale?: string) => locale === 'en' ? 'en-US' : locale === 'es' ? 'es-ES' : locale === 'fr' ? 'fr-FR' : 'pt-BR';
const formatter = (data: DfcExportData) => new Intl.NumberFormat(localeOf(data.locale), {
  style: 'currency', currency: data.currency || 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function buildDfcExportRows(data: DfcExportData): Array<Array<string | number>> {
  return [
    ['DFC Gerencial — somente realizado'],
    ['Período', data.periodLabel],
    ['Total de entradas', data.totalInflow],
    ['Total de saídas', data.totalOutflow],
    ['Saldo inicial', data.openingBalance],
    ['Variação líquida', data.netChange],
    ['Saldo final', data.closingBalance],
    [],
    MOVEMENT_HEADERS,
    ...data.movements.map((movement) => [movement.activity, movement.category, movement.costCenter, movement.paidDate, movement.description, movement.type, movement.amount]),
  ];
}

function buildDfcSheetRows(data: DfcExportData): Array<Array<string | number>> {
  const contact = [data.company?.phone, data.company?.email].filter(Boolean).join(' · ');
  return [
    ['DEMONSTRAÇÃO DOS FLUXOS DE CAIXA'],
    ['Empresa', data.company?.name ?? 'Não informada', '', 'Período', data.periodLabel],
    ['CNPJ/CPF', data.company?.document ?? 'Não informado', '', 'Contato', contact || 'Não informado'],
    ['Endereço', data.company?.address ?? 'Não informado', '', 'Saldo inicial', data.openingBalance],
    ['', '', '', 'Saldo final', data.closingBalance],
    [],
    ['Código', 'Estrutura do DFC', 'Entradas', 'Saídas', 'Líquido'],
    ...(data.rows ?? []).map((row) => [row.code, row.label, row.inflow, Math.abs(row.outflow), row.net]),
  ];
}

export function exportDfcCsv(data: DfcExportData, filename: string): void {
  const rows = buildDfcExportRows(data);
  const blob = new Blob([`\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function imageData(url?: string): Promise<{ base64: string; width?: number; height?: number } | undefined> {
  if (!url || typeof window === 'undefined') return undefined;
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    const width = bytes.length >= 24 ? ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0 : undefined;
    const height = bytes.length >= 24 ? ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0 : undefined;
    return { base64: `data:image/png;base64,${window.btoa(binary)}`, width, height };
  } catch { return undefined; }
}

export async function createDfcExcelWorkbook(data: DfcExportData) {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = data.brandName || 'Dominex';
  workbook.title = `DFC — ${data.company?.name ?? ''}`;
  workbook.subject = `Fluxo de caixa realizado — ${data.periodLabel}`;
  const sheet = workbook.addWorksheet('DFC', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 7, topLeftCell: 'C8' }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  sheet.pageSetup.printTitlesRow = '7:7';
  sheet.columns = [{ width: 14 }, { width: 48 }, { width: 20 }, { width: 16 }, { width: 28 }];
  buildDfcSheetRows(data).forEach((values) => sheet.addRow(values));
  sheet.eachRow((row) => row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: 'Arial', size: 10, color: { argb: NAVY } };
    cell.alignment = { vertical: 'middle' };
  }));
  sheet.mergeCells('A1:E1');
  sheet.mergeCells('B2:C2');
  sheet.mergeCells('B3:C3');
  sheet.mergeCells('B4:C4');
  sheet.getRow(1).height = 28;
  sheet.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: WHITE } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  ['A2', 'D2', 'A3', 'D3', 'A4', 'D4', 'D5'].forEach((address) => {
    sheet.getCell(address).font = { name: 'Arial', size: 9, bold: true, color: { argb: MUTED } };
  });
  sheet.getCell('E4').numFmt = CURRENCY_FORMAT;
  sheet.getCell('E5').numFmt = CURRENCY_FORMAT;
  for (let column = 1; column <= 5; column += 1) {
    const cell = sheet.getRow(7).getCell(column);
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: NAVY } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    cell.alignment = { vertical: 'middle', horizontal: column <= 2 ? 'left' : 'right' };
    cell.border = { bottom: { style: 'thin', color: { argb: BORDER } } };
  }
  (data.rows ?? []).forEach((item, index) => {
    const row = sheet.getRow(8 + index);
    row.height = item.level === 'section' ? 22 : 20;
    row.outlineLevel = item.level === 'subcategory' ? 2 : item.level === 'category' ? 1 : 0;
    row.eachCell((cell, column) => {
      cell.font = { name: 'Arial', size: 10, bold: item.level === 'section' || item.level === 'category' || item.level === 'result', color: { argb: item.level === 'section' || item.level === 'result' ? WHITE : NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.level === 'section' || item.level === 'result' ? NAVY : item.level === 'category' ? LIGHT : WHITE } };
      cell.alignment = { vertical: 'middle', horizontal: column <= 2 ? 'left' : 'right', indent: column === 2 ? (item.level === 'subcategory' ? 2 : item.level === 'category' ? 1 : 0) : 0 };
      cell.border = { bottom: { style: 'hair', color: { argb: BORDER } } };
      if (column >= 3) cell.numFmt = CURRENCY_FORMAT;
    });
  });
  sheet.autoFilter = { from: 'A7', to: `E${Math.max(7, 7 + (data.rows?.length ?? 0))}` };

  const logo = await imageData(data.brandLogoUrl);
  if (logo) {
    const id = workbook.addImage({ base64: logo.base64, extension: 'png' });
    const ratio = logo.width && logo.height ? logo.width / logo.height : 4;
    const height = 24;
    sheet.addImage(id, { tl: { col: 3.75, row: 0.12 }, ext: { width: Math.min(120, height * ratio), height }, editAs: 'oneCell' });
  }

  const detail = workbook.addWorksheet('Movimentos', { views: [{ state: 'frozen', ySplit: 1 }] });
  detail.addRow(MOVEMENT_HEADERS);
  data.movements.forEach((movement) => detail.addRow([
    movement.activity, movement.category, movement.costCenter, movement.paidDate,
    movement.description, movement.type, movement.amount,
  ]));
  detail.columns = [{ width: 28 }, { width: 28 }, { width: 24 }, { width: 15 }, { width: 42 }, { width: 12 }, { width: 20 }];
  detail.eachRow((row) => row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: 'Arial', size: 10, color: { argb: NAVY } };
    cell.alignment = { vertical: 'middle' };
  }));
  detail.getRow(1).eachCell((cell) => { cell.font = { name: 'Arial', bold: true, color: { argb: WHITE } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }; });
  detail.autoFilter = { from: 'A1', to: `G${Math.max(1, data.movements.length + 1)}` };
  detail.getColumn(7).numFmt = CURRENCY_FORMAT;
  return workbook;
}

export async function exportDfcExcel(data: DfcExportData, filename: string): Promise<void> {
  const workbook = await createDfcExcelWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `${filename}.xlsx`; link.click(); URL.revokeObjectURL(url);
}

const parseHex = (color?: string | null): [number, number, number] => {
  const value = color?.replace('#', '');
  return value && /^[0-9a-f]{6}$/i.test(value)
    ? [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]
    : [100, 116, 139];
};

const iconPng = async (Icon?: LucideIcon): Promise<string | undefined> => {
  if (!Icon || typeof window === 'undefined') return undefined;
  try {
    const svg = renderToStaticMarkup(createElement(Icon, { width: 48, height: 48, color: '#ffffff', strokeWidth: 2.4 }));
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
    const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 48; canvas.getContext('2d')?.drawImage(image, 0, 0, 48, 48);
    return canvas.toDataURL('image/png');
  } catch { return undefined; }
};

export async function exportDfcPdf(data: DfcExportData, filename: string): Promise<void> {
  const targetWindow = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  try {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const width = doc.internal.pageSize.getWidth();
    const money = formatter(data);
    doc.setProperties({ title: `DFC — ${data.company?.name ?? ''}`, author: data.brandName || 'Dominex' });
    doc.setFillColor(23, 32, 51); doc.roundedRect(10, 10, width - 20, 20, 1.5, 1.5, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('DEMONSTRAÇÃO DOS FLUXOS DE CAIXA', 15, 18.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(`${data.company?.name ?? 'Empresa'} · Realizado · ${data.periodLabel}`, 15, 25);
    const logo = await imageData(data.brandLogoUrl);
    if (logo) { const ratio = logo.width && logo.height ? logo.width / logo.height : 4; const h = 9; doc.addImage(logo.base64, 'PNG', width - 15 - Math.min(38, h * ratio), 15.5, Math.min(38, h * ratio), h, undefined, 'FAST'); }
    doc.setTextColor(100, 116, 139); doc.setFontSize(8); doc.text([
      data.company?.document ? `CNPJ/CPF: ${data.company.document}` : '', data.company?.phone || '', data.company?.email || '', data.company?.address || '',
    ].filter(Boolean).join('  |  ') || 'Dados cadastrais não informados', 10, 35, { maxWidth: width - 20 });
    const icons = new Map<LucideIcon, string>();
    await Promise.all((data.rows ?? []).map(async (row) => { if (row.icon && !icons.has(row.icon)) { const png = await iconPng(row.icon); if (png) icons.set(row.icon, png); } }));
    autoTable(doc, {
      startY: 39, margin: { left: 10, right: 10, bottom: 12 }, showHead: 'everyPage', rowPageBreak: 'avoid',
      head: [['ESTRUTURA DO DFC', 'ENTRADAS', 'SAÍDAS', 'LÍQUIDO']],
      body: (data.rows ?? []).map((row) => [
        `${row.level === 'subcategory' ? '      ' : row.level === 'category' ? '   ' : ''}${row.code}  ${row.icon ? '       ' : ''}${row.label}`,
        row.inflow ? money.format(row.inflow) : '—', row.outflow ? money.format(Math.abs(row.outflow)) : '—', money.format(row.net),
      ]),
      theme: 'plain', styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.3, valign: 'middle', lineColor: [226, 232, 240], lineWidth: { bottom: 0.12 } },
      headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'right' },
      columnStyles: { 0: { cellWidth: 130, halign: 'left' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didParseCell: (hook) => {
        if (hook.section === 'head') {
          hook.cell.styles.halign = hook.column.index === 0 ? 'left' : 'right';
          return;
        }
        if (hook.section !== 'body') return; const row = (data.rows ?? [])[hook.row.index]; if (!row) return;
        if (row.level === 'section' || row.level === 'result') { hook.cell.styles.fillColor = [23, 32, 51]; hook.cell.styles.textColor = [255, 255, 255]; hook.cell.styles.fontStyle = 'bold'; }
        else if (row.level === 'category') { hook.cell.styles.fillColor = [241, 245, 249]; hook.cell.styles.fontStyle = 'bold'; }
      },
      didDrawCell: (hook) => {
        if (hook.section !== 'body' || hook.column.index !== 0) return; const row = (data.rows ?? [])[hook.row.index]; const png = row?.icon ? icons.get(row.icon) : undefined; if (!row?.icon || !png) return;
        const [r, g, b] = parseHex(row.color); doc.setFillColor(r, g, b); doc.circle(hook.cell.x + (row.level === 'subcategory' ? 22 : 14), hook.cell.y + hook.cell.height / 2, 2.3, 'F'); doc.addImage(png, 'PNG', hook.cell.x + (row.level === 'subcategory' ? 20.6 : 12.6), hook.cell.y + hook.cell.height / 2 - 1.4, 2.8, 2.8);
      },
      didDrawPage: () => { doc.setFontSize(7); doc.setTextColor(100, 116, 139); doc.text(`Gerado por ${data.brandName || 'Dominex'}`, 10, doc.internal.pageSize.getHeight() - 5); doc.text(`Página ${doc.getNumberOfPages()}`, width - 10, doc.internal.pageSize.getHeight() - 5, { align: 'right' }); },
    });
    openPdfInTab(doc.output('blob'), filename, targetWindow);
  } catch (error) { targetWindow?.close(); throw error; }
}

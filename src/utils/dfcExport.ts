import { openPdfInTab, openPendingPdfTab } from '@/utils/openPdfInTab';
import { csvCell } from '@/utils/movimentacoesCsvGenerator';

export interface DfcExportMovement {
  activity: string;
  category: string;
  costCenter: string;
  paidDate: string;
  description: string;
  type: string;
  amount: number;
}

export interface DfcExportData {
  periodLabel: string;
  locale?: string;
  currency?: string;
  openingBalance: number;
  /** Soma das entradas realizadas no periodo. Positiva ou zero. */
  totalInflow: number;
  /** Soma das saidas realizadas no periodo. Negativa ou zero. */
  totalOutflow: number;
  netChange: number;
  closingBalance: number;
  movements: DfcExportMovement[];
}

const TABLE_HEADERS = [
  'Atividade',
  'Categoria',
  'Centro de custo',
  'Data da baixa',
  'Descrição',
  'Tipo',
  'Valor realizado',
];

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
    TABLE_HEADERS,
    ...data.movements.map((movement) => [
      movement.activity,
      movement.category,
      movement.costCenter,
      movement.paidDate,
      movement.description,
      movement.type,
      movement.amount,
    ]),
  ];
}

export function exportDfcCsv(data: DfcExportData, filename: string): void {
  const csv = buildDfcExportRows(data).map((row) => row.map(csvCell).join(';')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportDfcExcel(data: DfcExportData, filename: string): Promise<void> {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.aoa_to_sheet(buildDfcExportRows(data));
  worksheet['!cols'] = [
    { wch: 28 },
    { wch: 24 },
    { wch: 24 },
    { wch: 14 },
    { wch: 42 },
    { wch: 12 },
    { wch: 18 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'DFC');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

const money = (value: number, data: DfcExportData): string => new Intl.NumberFormat(
  data.locale === 'en' ? 'en-US'
    : data.locale === 'es' ? 'es-ES'
      : data.locale === 'fr' ? 'fr-FR'
        : 'pt-BR', {
  style: 'currency',
  currency: data.currency || 'BRL',
}).format(value);

export async function exportDfcPdf(data: DfcExportData, filename: string): Promise<void> {
  const targetWindow = openPendingPdfTab('Gerando o DFC...');
  try {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setProperties({ title: 'DFC Gerencial' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('DFC Gerencial', 14, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`Somente realizado · ${data.periodLabel}`, 14, 21);
    // Entrada e saída do período abrem o cabeçalho porque são a leitura mais
    // procurada do relatório; os saldos ficam na linha de baixo. As cores
    // seguem o relatório de movimentações (verde entra, vermelho sai).
    doc.setTextColor(22, 163, 74);
    doc.text(`Total de entradas: ${money(data.totalInflow, data)}`, 14, 29);
    doc.setTextColor(220, 38, 38);
    doc.text(`Total de saídas: ${money(data.totalOutflow, data)}`, 80, 29);

    doc.setTextColor(30);
    doc.text(`Saldo inicial: ${money(data.openingBalance, data)}`, 14, 35);
    doc.text(`Variação líquida: ${money(data.netChange, data)}`, 80, 35);
    doc.text(`Saldo final: ${money(data.closingBalance, data)}`, 154, 35);

    autoTable(doc, {
      startY: 41,
      head: [TABLE_HEADERS],
      body: data.movements.map((movement) => [
        movement.activity,
        movement.category,
        movement.costCenter,
        movement.paidDate,
        movement.description,
        movement.type,
        money(movement.amount, data),
      ]),
      theme: 'striped',
      styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [31, 41, 55], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 39 },
        1: { cellWidth: 34 },
        2: { cellWidth: 34 },
        3: { cellWidth: 24 },
        4: { cellWidth: 65 },
        5: { cellWidth: 20 },
        6: { cellWidth: 28, halign: 'right' },
      },
    });

    openPdfInTab(doc.output('blob'), filename, targetWindow);
  } catch (error) {
    targetWindow?.close();
    throw error;
  }
}

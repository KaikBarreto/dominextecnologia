import { openPdfInTab, openPendingPdfTab } from '@/utils/openPdfInTab';

export interface PdvCashHistoryExportRow {
  reference: string;
  type: string;
  customer: string;
  signedAmount: number;
  formattedAmount: string;
  method: string;
  date: string;
}

export interface PdvCashHistoryExportTexts {
  title: string;
  columnNumber: string;
  columnType: string;
  columnCustomer: string;
  columnAmount: string;
  columnMethod: string;
  columnDate: string;
  exportSheetName: string;
  exportGeneratedAt: string;
  exportGeneratingPdf: string;
  exportBack: string;
  exportDownloadPdf: string;
  exportDownloadAs: string;
}

interface PdvCashHistoryExportInput {
  rows: PdvCashHistoryExportRow[];
  texts: PdvCashHistoryExportTexts;
  generatedAt: string;
  language: string;
}

const filenameStamp = () => new Date().toISOString().slice(0, 10);

const exportFilename = (title: string) => {
  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'historico-transacoes'}-${filenameStamp()}`;
};

export async function exportPdvCashHistoryExcel({
  rows,
  texts,
}: PdvCashHistoryExportInput): Promise<void> {
  const XLSX = await import('xlsx');
  const sheetRows: Array<Array<string | number>> = [
    [texts.title],
    [],
    [
      texts.columnNumber,
      texts.columnType,
      texts.columnCustomer,
      texts.columnAmount,
      texts.columnMethod,
      texts.columnDate,
    ],
    ...rows.map((row) => [
      row.reference,
      row.type,
      row.customer,
      row.signedAmount < 0 ? `− ${row.formattedAmount}` : row.formattedAmount,
      row.method,
      row.date,
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet['!cols'] = [
    { wch: 14 },
    { wch: 16 },
    { wch: 34 },
    { wch: 16 },
    { wch: 24 },
    { wch: 20 },
  ];
  worksheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    texts.exportSheetName.slice(0, 31),
  );
  XLSX.writeFile(workbook, `${exportFilename(texts.title)}.xlsx`);
}

export async function exportPdvCashHistoryPdf({
  rows,
  texts,
  generatedAt,
  language,
}: PdvCashHistoryExportInput): Promise<void> {
  const targetWindow = openPendingPdfTab(texts.exportGeneratingPdf, language);
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableModule.default;
  const document = new jsPDF('landscape', 'mm', 'a4');

  document.setFont('helvetica', 'bold');
  document.setFontSize(16);
  document.text(texts.title, 14, 16);
  document.setFont('helvetica', 'normal');
  document.setFontSize(8);
  document.setTextColor(110);
  document.text(
    `${texts.exportGeneratedAt}: ${generatedAt}`,
    14,
    22,
  );

  autoTable(document, {
    startY: 28,
    head: [[
      texts.columnNumber,
      texts.columnType,
      texts.columnCustomer,
      texts.columnAmount,
      texts.columnMethod,
      texts.columnDate,
    ]],
    body: rows.map((row) => [
      row.reference,
      row.type,
      row.customer,
      row.signedAmount < 0 ? `− ${row.formattedAmount}` : row.formattedAmount,
      row.method,
      row.date,
    ]),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [24, 24, 27], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 28 },
      3: { halign: 'right', cellWidth: 34 },
      4: { cellWidth: 44 },
      5: { cellWidth: 38 },
    },
  });

  openPdfInTab(
    document.output('blob'),
    exportFilename(texts.title),
    targetWindow,
    {
      language,
      back: texts.exportBack,
      downloadPdf: texts.exportDownloadPdf,
      downloadAs: texts.exportDownloadAs,
    },
  );
}

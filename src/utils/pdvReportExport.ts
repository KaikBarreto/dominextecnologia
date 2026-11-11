export interface PdvCommercialExportRow {
  material: string;
  sku: string;
  unit: string;
  purchasedQuantity: number;
  purchasedTotal: number;
  soldQuantity: number | null;
  returnedQuantity: number | null;
  netRevenue: number | null;
  cmv: number | null;
  margin: number | null;
}

const csvCell = (value: string | number | null): string => {
  if (value == null) return '';
  const text = String(value);
  return /[;"\n]/.test(text) ? `"${text.split('"').join('""')}"` : text;
};

export function buildPdvCommercialCsv(rows: PdvCommercialExportRow[]): string {
  const header = [
    'Material', 'SKU', 'Unidade', 'Qtd. comprada', 'Valor comprado',
    'Qtd. vendida líquida', 'Qtd. devolvida', 'Receita líquida', 'CMV', 'Margem',
  ];
  return [
    header,
    ...rows.map((row) => [
      row.material,
      row.sku,
      row.unit,
      row.purchasedQuantity,
      row.purchasedTotal,
      row.soldQuantity,
      row.returnedQuantity,
      row.netRevenue,
      row.cmv,
      row.margin,
    ]),
  ].map((line) => line.map(csvCell).join(';')).join('\n');
}

export function downloadPdvCommercialCsv(rows: PdvCommercialExportRow[], fileName: string): void {
  const blob = new Blob([`\uFEFF${buildPdvCommercialCsv(rows)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

import type { LocaleCode } from '@/lib/i18n/locales';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import type { InventoryCountPdfRow } from '@/utils/inventoryCountPdfGenerator';

function todayStamp(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

interface GenerateInventoryCountExcelParams {
  countNumber: number | null;
  status: string;
  notes: string | null;
  rows: InventoryCountPdfRow[];
  locale: LocaleCode;
  currency: string;
}

export async function generateInventoryCountExcel({
  countNumber,
  status,
  notes,
  rows,
  locale,
  currency,
}: GenerateInventoryCountExcelParams): Promise<void> {
  const XLSX = await import('xlsx');
  const tr = MESSAGES[locale].app.inventory.inventoryCount.pdf;

  const fmtCurrency = (v: number) => formatMoney(v, currency, locale);
  const totalDiffValue = rows.reduce((acc, r) => acc + (r.diff_value ?? 0), 0);

  const aoa: (string | number | null)[][] = [];

  // Cabeçalho do arquivo
  const title = `${tr.title} #${countNumber ?? ''}`;
  aoa.push([title]);
  aoa.push([`${tr.status}: ${status}`]);
  if (notes) aoa.push([`${tr.notes}: ${notes}`]);
  aoa.push([]);

  // Cabeçalho da tabela
  aoa.push([
    tr.colMaterial,
    tr.colSku,
    tr.colStock,
    tr.colExpected,
    tr.colCounted,
    tr.colDiff,
    tr.colCost,
    tr.colDiffValue,
  ]);

  for (const r of rows) {
    const diff = r.diff ?? 0;
    aoa.push([
      r.material_name,
      r.material_sku ?? '',
      r.stock_name,
      r.expected_qty,
      r.counted_qty ?? '',
      diff !== 0 ? diff : 0,
      r.unit_cost ?? 0,
      r.diff_value ?? 0,
    ]);
  }

  // Linha de total
  aoa.push([]);
  aoa.push(['', '', '', '', '', '', tr.footerTotal, totalDiffValue]);

  // Linha de legenda
  aoa.push([]);
  aoa.push([tr.excelLegendDiffValue, fmtCurrency(totalDiffValue)]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 32 }, // Material
    { wch: 16 }, // SKU
    { wch: 22 }, // Local
    { wch: 14 }, // Esperado
    { wch: 14 }, // Contado
    { wch: 12 }, // Diferença
    { wch: 16 }, // Custo un.
    { wch: 18 }, // Valor divergência
  ];
  // Mescla o título nas 8 colunas
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tr.excelSheetName);

  const filename = `inventario-${countNumber ?? 'sem-numero'}-${todayStamp()}.xlsx`;
  XLSX.writeFile(wb, filename);
}

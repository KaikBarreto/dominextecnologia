import type { InventoryReportRow } from '@/utils/inventoryPdfGenerator';
import type { LocaleCode } from '@/lib/i18n/locales';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';

/**
 * Gera um `.xlsx` do Estoque com as mesmas colunas do PDF.
 *
 * O `xlsx` (SheetJS) é importado de forma lazy (`await import`) pra não pesar o
 * bundle inicial — só carrega quando o usuário confirma "Exportar Excel".
 */

function todayStamp(): string {
  // YYYY-MM-DD em horário de Brasília para nomear o arquivo.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

interface GenerateInventoryExcelParams {
  title: string;
  rows: InventoryReportRow[];
  /** Locale do usuário (de useAppLocaleContext). */
  locale: LocaleCode;
  /** Código ISO 4217 da moeda da empresa (ex.: 'BRL', 'USD'). */
  currency: string;
  /** Nome do local de estoque exportado (opcional). */
  stockName?: string | null;
}

export async function generateInventoryExcel({
  title,
  rows,
  locale,
  currency,
  stockName,
}: GenerateInventoryExcelParams): Promise<void> {
  const XLSX = await import('xlsx');
  const tr = MESSAGES[locale].app.inventory.report;

  const fmtCurrency = (v: number) => formatMoney(v, currency, locale);

  let totalEstoque = 0;
  for (const r of rows) {
    totalEstoque += (r.quantity || 0) * (r.cost_price || 0);
  }

  const hasMinQty = rows.some((r) => r.min_quantity != null);

  const aoa: (string | number | null)[][] = [];

  // Cabeçalho do arquivo
  aoa.push([title]);
  if (stockName) {
    aoa.push([`${tr.stockLabel ?? 'Local'}: ${stockName}`]);
  }
  aoa.push([tr.excelTotalLabel, fmtCurrency(totalEstoque)]);
  aoa.push([]);

  // Cabeçalho da tabela
  const headerRow: string[] = [
    tr.colName,
    tr.colSku,
    tr.colCategory,
    tr.colQty,
    tr.colUnit,
    ...(hasMinQty ? [tr.colMinQty ?? 'Mín.'] : []),
    tr.colCostUnit,
    tr.colSaleUnit,
    tr.colTotal,
  ];
  aoa.push(headerRow);

  // Índice da linha de dados (para colorir depois)
  const dataStartRow = aoa.length; // 0-based index of first data row

  const belowMinRows: number[] = [];

  for (const r of rows) {
    const qty = r.quantity || 0;
    const isBelowMin = r.min_quantity != null && qty < r.min_quantity;
    const dataRow: (string | number | null)[] = [
      r.name || '',
      r.sku || '',
      r.category || '',
      qty,
      r.unit || '',
      ...(hasMinQty ? [r.min_quantity ?? null] : []),
      r.cost_price ?? 0,
      r.sale_price ?? 0,
      qty * (r.cost_price || 0),
    ];
    if (isBelowMin) belowMinRows.push(aoa.length);
    aoa.push(dataRow);
  }

  // Linha de TOTAL geral
  aoa.push([]);
  // headerRow.length colunas: penúltima = label "Total geral", última = valor.
  const footerRow: (string | number)[] = new Array(headerRow.length).fill('');
  footerRow[footerRow.length - 2] = tr.footerGrandTotal;
  footerRow[footerRow.length - 1] = totalEstoque;
  aoa.push(footerRow);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Destaque vermelho nas linhas abaixo do mínimo
  for (const rowIdx of belowMinRows) {
    for (let c = 0; c < headerRow.length; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c });
      if (ws[cellRef]) {
        ws[cellRef].s = {
          font: { color: { rgb: 'B91C1C' } },
          fill: { fgColor: { rgb: 'FEF2F2' }, patternType: 'solid' },
        };
      }
    }
  }

  // Larguras de coluna
  const colWidths = [
    { wch: 32 }, // Nome
    { wch: 16 }, // SKU
    { wch: 20 }, // Categoria
    { wch: 12 }, // Quantidade
    { wch: 10 }, // Unidade
    ...(hasMinQty ? [{ wch: 12 }] : []), // Mínimo
    { wch: 14 }, // Custo unit.
    { wch: 14 }, // Venda unit.
    { wch: 16 }, // Valor total
  ];
  ws['!cols'] = colWidths;

  // Merge do título
  const titleMergeEnd = headerRow.length - 1;
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: titleMergeEnd } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tr.excelSheetName);

  const slug = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
  XLSX.writeFile(wb, `${slug}-${todayStamp()}.xlsx`);
}

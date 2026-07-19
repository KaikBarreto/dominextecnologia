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
}

export async function generateInventoryExcel({
  title,
  rows,
  locale,
  currency,
}: GenerateInventoryExcelParams): Promise<void> {
  const XLSX = await import('xlsx');
  const tr = MESSAGES[locale].app.inventory.report;

  const fmtCurrency = (v: number) => formatMoney(v, currency, locale);

  let totalEstoque = 0;
  for (const r of rows) {
    totalEstoque += (r.quantity || 0) * (r.cost_price || 0);
  }

  const aoa: (string | number)[][] = [];

  // Cabeçalho do arquivo
  aoa.push([title]);
  aoa.push([tr.excelTotalLabel, fmtCurrency(totalEstoque)]);
  aoa.push([]);

  // Cabeçalho da tabela (mesmas colunas do PDF)
  aoa.push([
    tr.colName,
    tr.colSku,
    tr.colCategory,
    tr.colQty,
    tr.colUnit,
    tr.colCostUnit,
    tr.colSaleUnit,
    tr.colTotal,
  ]);

  for (const r of rows) {
    const qty = r.quantity || 0;
    aoa.push([
      r.name || '',
      r.sku || '',
      r.category || '',
      qty,
      r.unit || '',
      r.cost_price ?? 0,
      r.sale_price ?? 0,
      qty * (r.cost_price || 0),
    ]);
  }

  // Linha de TOTAL geral
  aoa.push([]);
  aoa.push(['', '', '', '', '', '', tr.footerGrandTotal, totalEstoque]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 32 }, // Nome
    { wch: 16 }, // SKU
    { wch: 20 }, // Categoria
    { wch: 12 }, // Quantidade
    { wch: 10 }, // Unidade
    { wch: 14 }, // Custo unit.
    { wch: 14 }, // Venda unit.
    { wch: 16 }, // Valor total
  ];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tr.excelSheetName);

  const slug = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
  XLSX.writeFile(wb, `${slug}-${todayStamp()}.xlsx`);
}

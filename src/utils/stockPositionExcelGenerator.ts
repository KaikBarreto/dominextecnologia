import type { LocaleCode } from '@/lib/i18n/locales';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { safeTimeZone, todayInTz } from '@/lib/timezone';
import type { StockPositionRow } from '@/hooks/useStockPosition';

interface GenerateStockPositionExcelParams {
  atDate: string;
  rows: StockPositionRow[];
  locale: LocaleCode;
  currency: string;
  /**
   * Fuso IANA DA EMPRESA (`useAppLocaleContext().timezone`). Rótulo de exibição
   * (data de referência + nome do arquivo) — não toca saldo/kardex.
   * Vazio/inválido cai em America/Sao_Paulo via `safeTimeZone`/`todayInTz`.
   */
  timezone?: string | null;
}

export async function generateStockPositionExcel({
  atDate,
  rows,
  locale,
  currency,
  timezone,
}: GenerateStockPositionExcelParams): Promise<void> {
  const XLSX = await import('xlsx');
  const tr = MESSAGES[locale].app.inventory.stockPosition.pdf;

  const fmtCurrency = (v: number) => formatMoney(v, currency, locale);
  const totalValor = rows.reduce((acc, r) => acc + (r.valor ?? 0), 0);
  const totalProjecao = rows.reduce((acc, r) => acc + (r.projecao ?? 0), 0);

  const atLabel = new Date(atDate).toLocaleString('pt-BR', {
    timeZone: safeTimeZone(timezone),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const aoa: (string | number | null)[][] = [];

  aoa.push([tr.title]);
  aoa.push([`${tr.atLabel}: ${atLabel}`]);
  aoa.push([]);

  aoa.push([
    tr.colStock,
    tr.colSku,
    tr.colMaterial,
    tr.colUnit,
    tr.colBalance,
    tr.colValue,
    tr.colProjection,
  ]);

  for (const r of rows) {
    aoa.push([
      r.stock_name,
      r.sku || '',
      r.name,
      r.unit || '',
      r.saldo,
      r.valor,
      r.projecao,
    ]);
  }

  // Linha de total
  aoa.push([]);
  aoa.push(['', '', '', '', '', totalValor, totalProjecao]);
  aoa.push([]);
  aoa.push([tr.totalCostCard, fmtCurrency(totalValor)]);
  aoa.push([tr.totalSaleCard, fmtCurrency(totalProjecao)]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 24 }, // Local
    { wch: 16 }, // SKU
    { wch: 32 }, // Material
    { wch: 10 }, // Un.
    { wch: 14 }, // Saldo
    { wch: 18 }, // Valor
    { wch: 18 }, // Projeção
  ];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tr.excelSheetName);

  const filename = `posicao-estoque-${todayInTz(timezone)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

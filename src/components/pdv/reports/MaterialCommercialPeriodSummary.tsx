import { FileDown, Printer, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocaleFormatters } from '@/lib/format/hooks';
import type { MaterialPurchaseReportRow } from '@/hooks/useMaterialPurchaseReport';
import { downloadPdvCommercialCsv, type PdvCommercialExportRow } from '@/utils/pdvReportExport';

function exportRows(rows: MaterialPurchaseReportRow[]): PdvCommercialExportRow[] {
  return rows.map((row) => ({
    material: row.material_name,
    sku: row.sku,
    unit: row.unit,
    purchasedQuantity: row.purchased_quantity,
    purchasedTotal: row.purchased_total,
    soldQuantity: row.net_sold_quantity ?? null,
    returnedQuantity: row.returned_quantity ?? null,
    netRevenue: row.net_revenue ?? null,
    cmv: row.net_cmv ?? null,
    margin: row.margin ?? null,
  }));
}

function moneyOrUnavailable(value: number | null, money: (value: number) => string) {
  return value == null ? 'Indisponível' : money(value);
}

function commercialCostLabel(
  row: MaterialPurchaseReportRow,
  value: number | null | undefined,
  money: (value: number) => string,
) {
  if (row.cost_coverage === 'not_applicable') return '—';
  return moneyOrUnavailable(value ?? null, money);
}

export function MaterialCommercialPeriodSummary({
  rows,
  periodLabel,
}: {
  rows: MaterialPurchaseReportRow[];
  periodLabel: string;
}) {
  const isMobile = useIsMobile();
  const { money, number } = useLocaleFormatters();
  const commercialRows = rows.filter((row) => row.net_sold_quantity != null);
  if (commercialRows.length === 0) return null;

  const totals = commercialRows.reduce((summary, row) => ({
    purchased: summary.purchased + row.purchased_total,
    sold: summary.sold + (row.net_sold_quantity ?? 0),
    returned: summary.returned + (row.returned_quantity ?? 0),
    revenue: summary.revenue + (row.net_revenue ?? 0),
    cmv: row.cost_coverage === 'not_applicable'
      ? summary.cmv
      : summary.cmv == null || row.net_cmv == null ? null : summary.cmv + row.net_cmv,
    margin: row.cost_coverage === 'not_applicable'
      ? summary.margin
      : summary.margin == null || row.margin == null ? null : summary.margin + row.margin,
  }), { purchased: 0, sold: 0, returned: 0, revenue: 0, cmv: 0 as number | null, margin: 0 as number | null });

  const handleCsv = () => downloadPdvCommercialCsv(
    exportRows(commercialRows),
    `estoque-compras-vendas-${new Date().toISOString().slice(0, 10)}.csv`,
  );

  return (
    <section className="space-y-3 print:break-inside-avoid" aria-labelledby="commercial-period-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="commercial-period-title" className="text-lg font-semibold">Comprado e vendido no período</h2>
          <p className="text-sm text-muted-foreground">{periodLabel} · venda líquida já desconta devoluções.</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handleCsv}><FileDown className="mr-2 h-4 w-4" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Imprimir / PDF</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
        {[
          ['Comprado', money(totals.purchased)],
          ['Vendido líquido', number(totals.sold, { maximumFractionDigits: 3 })],
          ['Devolvido', number(totals.returned, { maximumFractionDigits: 3 })],
          ['Receita líquida', money(totals.revenue)],
          ['Custo do vendido', moneyOrUnavailable(totals.cmv, money)],
          ['Margem', moneyOrUnavailable(totals.margin, money)],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 border-b border-border px-1 py-3 lg:border-b-0 lg:border-l lg:first:border-l-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 whitespace-normal break-words text-base font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {commercialRows.some((row) => row.cost_coverage === 'partial') && (
        <div className="rounded-lg bg-warning px-3 py-2 text-xs text-warning-foreground">
          Parte das vendas não possui custo conhecido. O custo do vendido e a margem ficam indisponíveis em vez de mostrar zero.
        </div>
      )}

      {isMobile ? (
        <div className="space-y-2">
          {commercialRows.map((row) => (
            <Card key={row.inventory_id}><CardContent className="space-y-3 p-3">
              <div><p className="font-medium">{row.material_name}</p><p className="text-xs text-muted-foreground">{row.sku || 'Sem SKU'} · {row.unit}</p></div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div><span className="text-muted-foreground">Comprado</span><p className="font-semibold tabular-nums">{number(row.purchased_quantity)} · {money(row.purchased_total)}</p></div>
                <div><span className="text-muted-foreground">Vendido líquido</span><p className="font-semibold tabular-nums">{number(row.net_sold_quantity ?? 0)} {row.unit}</p></div>
                <div><span className="text-muted-foreground">Devolvido</span><p className="font-semibold tabular-nums"><RotateCcw className="mr-1 inline h-3 w-3" />{number(row.returned_quantity ?? 0)} {row.unit}</p></div>
                <div><span className="text-muted-foreground">Receita líquida</span><p className="font-semibold tabular-nums">{money(row.net_revenue ?? 0)}</p></div>
                <div><span className="text-muted-foreground">Custo do vendido</span><p className="font-semibold tabular-nums">{commercialCostLabel(row, row.net_cmv, money)}</p></div>
                <div><span className="text-muted-foreground">Margem</span><p className="font-semibold tabular-nums">{commercialCostLabel(row, row.margin, money)}</p></div>
              </div>
            </CardContent></Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden"><CardContent className="p-0"><div className="overflow-x-auto">
          <Table className="min-w-[1050px]"><TableHeader><TableRow>
            <TableHead>Material</TableHead><TableHead className="text-right">Comprado</TableHead>
            <TableHead className="text-right">Vendido líquido</TableHead><TableHead className="text-right">Devolvido</TableHead>
            <TableHead className="text-right">Receita líquida</TableHead><TableHead className="text-right">Custo do vendido</TableHead><TableHead className="text-right">Margem</TableHead>
          </TableRow></TableHeader><TableBody>
            {commercialRows.map((row) => <TableRow key={row.inventory_id}>
              <TableCell><p className="font-medium">{row.material_name}</p><p className="text-xs text-muted-foreground">{row.sku || 'Sem SKU'} · {row.unit}</p></TableCell>
              <TableCell className="text-right tabular-nums">{number(row.purchased_quantity)} · {money(row.purchased_total)}</TableCell>
              <TableCell className="text-right tabular-nums">{number(row.net_sold_quantity ?? 0)} {row.unit}</TableCell>
              <TableCell className="text-right tabular-nums">{number(row.returned_quantity ?? 0)} {row.unit}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{money(row.net_revenue ?? 0)}</TableCell>
              <TableCell className="text-right tabular-nums">{commercialCostLabel(row, row.net_cmv, money)}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{commercialCostLabel(row, row.margin, money)}</TableCell>
            </TableRow>)}
          </TableBody></Table>
        </div></CardContent></Card>
      )}
    </section>
  );
}

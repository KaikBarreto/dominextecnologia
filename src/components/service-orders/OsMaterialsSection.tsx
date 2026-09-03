import { Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatQty } from '@/components/inventory/InventoryMaterialSelect';
import { useInventory } from '@/hooks/useInventory';
import { useStocks } from '@/hooks/useStocks';
import { useOsMaterials, type OsMaterialLine } from '@/hooks/useOsMaterials';
import { formatBRL } from '@/utils/currency';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface OsMaterialsSectionProps {
  serviceOrderId: string;
  className?: string;
}

/**
 * Bloco SOMENTE LEITURA do que foi consumido nesta OS (v1.22.0), pra gestão
 * ver material + custo. Não edita nada — quem lança é o técnico
 * (OsConsumeStockDialog) e quem confirma a baixa é o resumo de finalização
 * (OsConsumptionSummaryDialog).
 */
export function OsMaterialsSection({ serviceOrderId, className }: OsMaterialsSectionProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.stockConsumption;
  const { items } = useInventory();
  const { stocks } = useStocks();
  const { lines, isFetched } = useOsMaterials(serviceOrderId);

  // Nada lançado (ou ainda carregando): não ocupa espaço na tela.
  if (!isFetched || lines.length === 0) return null;

  const materialName = (line: OsMaterialLine) =>
    line.material?.name ?? items.find((i) => i.id === line.inventory_id)?.name ?? '—';
  const materialUnit = (line: OsMaterialLine) =>
    line.material?.unit || items.find((i) => i.id === line.inventory_id)?.unit || t.sectionUnit;
  const stockName = (line: OsMaterialLine) =>
    line.stock?.name ?? stocks.find((s) => s.id === line.stock_id)?.name ?? '—';

  const totalCost = lines.reduce(
    (sum, l) => sum + (l.unit_cost != null ? l.unit_cost * l.quantity : 0),
    0,
  );
  const hasCost = lines.some((l) => l.unit_cost != null);

  return (
    <Card className={className}>
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Package className="h-4 w-4" />
          {t.sectionTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {lines.map((line) => {
          const lineCost = line.unit_cost != null ? line.unit_cost * line.quantity : null;
          const notCommitted = line.committed_quantity < line.quantity;
          return (
            <div
              key={line.id}
              className="flex items-start justify-between gap-2 border-b pb-2 text-sm last:border-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{materialName(line)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatQty(line.quantity)} {materialUnit(line)} · {stockName(line)}
                </p>
                {notCommitted && <p className="text-xs text-warning">{t.sectionPending}</p>}
              </div>
              {lineCost != null && (
                <p className="shrink-0 font-semibold text-foreground">R$ {formatBRL(lineCost)}</p>
              )}
            </div>
          );
        })}
        {hasCost && (
          <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold text-foreground">
            <span>{t.sectionTotal}</span>
            <span>R$ {formatBRL(totalCost)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

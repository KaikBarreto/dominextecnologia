import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePricingSettings } from '@/hooks/usePricingSettings';
import { useBDICalculator } from '@/hooks/useBDICalculator';
import { formatBRL } from '@/utils/currency';

export function BDIPreviewCard() {
  const { settings } = usePricingSettings();

  const [serviceCost, setServiceCost] = useState<number>(1000);
  const [distanceKm, setDistanceKm] = useState<number>(0);

  const taxRate = Number(settings?.tax_rate ?? 10);
  const adminRate = Number(settings?.admin_indirect_rate ?? 12);
  const profitRate = Number(settings?.default_profit_rate ?? 10);
  const kmCost = Number(settings?.km_cost ?? 1);
  const cardDiscountRate = Number(settings?.card_discount_rate ?? 6);
  const cardInstallments = Number(settings?.card_installments ?? 10);

  const result = useBDICalculator({
    taxRate,
    adminRate,
    profitRate,
    items: [{ totalCost: serviceCost, profitRate }],
    distanceKm,
    kmCost,
    cardDiscountRate,
    cardInstallments,
  });

  const bdiPct = useMemo(() => result.bdiFactor * 100, [result.bdiFactor]);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Preview do cálculo</p>
          <p className="text-xs text-muted-foreground">Simule um custo total e veja o preço sugerido pelo BDI.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Custo do serviço (R$)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={Number.isFinite(serviceCost) ? serviceCost : 0}
              onChange={(e) => setServiceCost(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Distância (KM)</Label>
            <Input
              type="number"
              min={0}
              step="0.1"
              value={Number.isFinite(distanceKm) ? distanceKm : 0}
              onChange={(e) => setDistanceKm(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] text-muted-foreground">Deslocamento</p>
            <p className="text-sm font-semibold text-foreground">R$ {formatBRL(result.displacementCost)}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] text-muted-foreground">Custo total</p>
            <p className="text-sm font-semibold text-foreground">R$ {formatBRL(result.totalCost)}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] text-muted-foreground">BDI</p>
            <p className="text-sm font-semibold text-foreground">{bdiPct.toFixed(2)}%</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-[11px] text-muted-foreground">Lucro (ponderado)</p>
            <p className="text-sm font-semibold text-foreground">{result.weightedProfitRate.toFixed(2)}%</p>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4 bg-muted/30">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">Preço final (BDI)</p>
            <p className="text-lg font-bold text-foreground">R$ {formatBRL(result.finalPrice)}</p>
          </div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">À vista ({cardDiscountRate.toFixed(0)}% desc.)</span>
              <span className="font-medium text-foreground">R$ {formatBRL(result.cashPrice)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cartão ({cardInstallments}x)</span>
              <span className="font-medium text-foreground">R$ {formatBRL(result.installmentValue)}</span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Fórmula: <span className="font-mono">preço = custo_total / BDI</span>
        </p>
      </CardContent>
    </Card>
  );
}

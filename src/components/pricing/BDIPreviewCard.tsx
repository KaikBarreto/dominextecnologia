import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DollarSign, Route } from 'lucide-react';
import { usePricingSettings } from '@/hooks/usePricingSettings';
import { useBDICalculator } from '@/hooks/useBDICalculator';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';

export function BDIPreviewCard() {
  const { locale, currency } = useAppLocaleContext();
  const tp = MESSAGES[locale].app.crm.pricing;
  const fmt = (v: number) => formatMoney(v, currency, locale);

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
  const estimatedProfit = useMemo(
    () => (result.totalCost / result.bdiFactor) * (profitRate / 100),
    [result.totalCost, result.bdiFactor, profitRate]
  );

  return (
    <Card className="h-full">
      <CardContent className="p-5 space-y-5">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-foreground">{tp.simulatorTitle}</p>
            <Badge variant="secondary" className="text-[10px] px-2 py-0.5">{tp.simulatorBadge}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {tp.simulatorDesc}
          </p>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <DollarSign size={12} className="text-muted-foreground" />
              {tp.serviceCostLabel}
            </Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={Number.isFinite(serviceCost) ? serviceCost : 0}
              onChange={(e) => setServiceCost(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Route size={12} className="text-muted-foreground" />
              {tp.distanceLabel}
            </Label>
            <NumericInput
              decimal
              value={Number.isFinite(distanceKm) && distanceKm ? String(distanceKm) : ''}
              onValueChange={(v) => setDistanceKm(Number(v.replace(',', '.')) || 0)}
            />
          </div>
        </div>

        {/* Breakdown 4 cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground">{tp.displacementCard}</p>
            <p className="text-lg font-bold text-foreground">{fmt(result.displacementCost)}</p>
            <p className="text-[10px] text-muted-foreground">
              {tp.displacementDesc
                .replace('{km}', String(distanceKm))
                .replace('{rate}', fmt(kmCost))}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground">{tp.totalCostCard}</p>
            <p className="text-lg font-bold text-foreground">{fmt(result.totalCost)}</p>
            <p className="text-[10px] text-muted-foreground">{tp.totalCostDesc}</p>
          </div>
          <div className="rounded-lg border border-primary/30 p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground">{tp.bdiCard}</p>
            <p className="text-lg font-bold text-primary">{bdiPct.toFixed(2)}%</p>
            <p className="text-[10px] text-muted-foreground">
              {tp.bdiCoeff.replace('{factor}', result.bdiFactor.toFixed(4))}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground">{tp.profitCard}</p>
            <p className="text-lg font-bold text-success">{profitRate}%</p>
            <p className="text-[10px] text-muted-foreground">
              {tp.profitApprox.replace('{amount}', fmt(estimatedProfit))}
            </p>
          </div>
        </div>

        {/* Card resultado hero */}
        <div className="rounded-xl border border-primary/30 p-5 bg-card shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{tp.finalPriceLabel}</p>
              <p className="text-3xl sm:text-4xl font-extrabold text-foreground mt-1 tracking-tight">
                {fmt(result.finalPrice)}
              </p>
            </div>
            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
              BDI {result.bdiFactor.toFixed(4)}
            </Badge>
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-[11px] text-muted-foreground">
                {tp.cashPriceLabel.replace('{pct}', cardDiscountRate.toFixed(0))}
              </p>
              <p className="text-xl font-bold text-success mt-1">{fmt(result.cashPrice)}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-[11px] text-muted-foreground">
                {tp.installmentLabel.replace('{n}', String(cardInstallments))}
              </p>
              <p className="text-xl font-bold text-foreground mt-1">
                {cardInstallments}× {fmt(result.installmentValue)}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <div className="font-mono text-xs text-muted-foreground">
              {tp.formulaLine
                .replace('{cost}', fmt(result.totalCost))
                .replace('{factor}', result.bdiFactor.toFixed(4))
                .replace('{price}', fmt(result.finalPrice))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

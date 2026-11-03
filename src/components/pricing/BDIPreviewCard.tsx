import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { DollarSign, Route } from 'lucide-react';
import { usePricingSettings } from '@/hooks/usePricingSettings';
import { useBDICalculator } from '@/hooks/useBDICalculator';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, formatNumber } from '@/lib/format';
import { readPastedCents } from '@/lib/money-paste-mask';
import { BDICompositionPreview } from '@/components/pricing/BDICompositionPreview';
import type { PricingPreviewSettings } from '@/components/pricing/PricingConfigForm';

interface BDIPreviewCardProps {
  /** Valores locais do formulário. Alterá-los recalcula a prévia sem persistir. */
  previewSettings?: PricingPreviewSettings | null;
}

export function BDIPreviewCard({ previewSettings }: BDIPreviewCardProps = {}) {
  const { locale, currency } = useAppLocaleContext();
  const tp = MESSAGES[locale].app.crm.pricing;
  const fmt = (v: number) => formatMoney(v, currency, locale);
  const fmtRate = (v: number) => formatNumber(v, locale, { maximumFractionDigits: 2 });

  const { settings } = usePricingSettings();

  const [serviceCost, setServiceCost] = useState<number>(1000);
  const [distanceKm, setDistanceKm] = useState<number>(0);
  // Texto CRU do campo de distância. O número em distanceKm segue sendo o que
  // alimenta o cálculo; este espelho existe porque um input controlado por
  // NUMBER engole o separador no meio da digitação: "17," volta pra 17, o
  // campo re-renderiza "17" e o usuário, digitando 17,5 naturalmente, acabava
  // calculando com 175. Régua: guardar string crua no estado, parsear só no
  // uso — igual ao InventoryFormDialog.
  const [distanceKmText, setDistanceKmText] = useState<string>('');

  const taxRate = previewSettings?.taxRate ?? Number(settings?.tax_rate ?? 10);
  const adminRate = previewSettings?.adminRate ?? Number(settings?.admin_indirect_rate ?? 12);
  const profitRate = previewSettings?.profitRate ?? Number(settings?.default_profit_rate ?? 10);
  const kmCost = previewSettings?.kmCost ?? Number(settings?.km_cost ?? 1);
  const cardDiscountRate = previewSettings?.cardDiscountRate ?? Number(settings?.card_discount_rate ?? 6);
  const cardInstallments = previewSettings?.cardInstallments ?? Number(settings?.card_installments ?? 10);

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

  return (
    <Card className="h-full">
      <CardContent className="p-5 space-y-5">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{tp.simulatorTitle}</p>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-success">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              {tp.simulatorBadge}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {tp.simulatorDesc}
          </p>
        </div>

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
              onPaste={(e) => {
                // Simulador não persiste nada, mas colar "4.550" num
                // `<input type="number">` ainda vira 4,55 pro navegador
                // (decimal internacional) — o mesmo bug do sócio, aqui só
                // distorcendo a prévia de BDI mostrada em tela.
                const cents = readPastedCents(e);
                if (cents == null) return;
                setServiceCost(cents / 100);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Route size={12} className="text-muted-foreground" />
              {tp.distanceLabel}
            </Label>
            <NumericInput
              decimal
              value={distanceKmText}
              onValueChange={(v) => {
                setDistanceKmText(v);
                setDistanceKm(v.trim() === '' ? 0 : (Number(v.replace(',', '.')) || 0));
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 border-y border-border py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground">
            {tp.displacementDesc
              .replace('{km}', String(distanceKm))
              .replace('{rate}', fmt(kmCost))}
          </span>
          <span className="font-bold tabular-nums text-foreground">
            {tp.displacementCard}: {fmt(result.displacementCost)}
          </span>
        </div>

        <BDICompositionPreview
          totalCost={result.totalCost}
          finalPrice={result.finalPrice}
          bdiFactor={result.bdiFactor}
          taxRate={taxRate}
          adminRate={adminRate}
          profitRate={profitRate}
          formatMoney={fmt}
          formatRate={fmtRate}
          labels={{
            cost: tp.totalCostCard,
            tax: tp.taxLabel.replace(' (%)', ''),
            admin: tp.adminLabel.replace(' (%)', ''),
            profit: tp.profitLabel.replace(' (%)', ''),
            finalPrice: tp.finalPriceLabel,
            factor: tp.bdiCoeff.replace('{factor}', '').trim(),
            factorFormation: tp.bdiMethodTitle,
            priceFormula: tp.bdiFormula,
          }}
        />

        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">
              {tp.cashPriceLabel.replace('{pct}', cardDiscountRate.toFixed(0))}
            </p>
            <p className="mt-1 break-words text-xl font-bold tabular-nums text-success">
              {fmt(result.cashPrice)}
            </p>
          </div>
          <div className="min-w-0 sm:text-right">
            <p className="text-[11px] text-muted-foreground">
              {tp.installmentLabel.replace('{n}', String(cardInstallments))}
            </p>
            <p className="mt-1 break-words text-xl font-bold tabular-nums text-foreground">
              {cardInstallments}× {fmt(result.installmentValue)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

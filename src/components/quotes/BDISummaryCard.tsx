import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calculator, TrendingUp, DollarSign } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';

interface BDISummaryData {
  bdiFactor: number;
  displacementCost: number;
  totalCost: number;
  finalPrice: number;
  cashPrice: number;
  installmentValue: number;
  weightedProfitRate: number;
  cardInstallments: number;
}

interface BDISummaryCardProps {
  data: BDISummaryData;
  className?: string;
}

export function BDISummaryCard({ data, className }: BDISummaryCardProps) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm.bdiSummary;

  const fmt = (v: number) => formatMoney(v, currency, locale);

  // Extract cash-discount percentage from the card data by back-calculating:
  // cashPrice = finalPrice * (1 - pct/100) → pct = (1 - cashPrice/finalPrice) * 100
  const cashPct = data.finalPrice > 0
    ? ((1 - data.cashPrice / data.finalPrice) * 100).toFixed(0)
    : '0';

  return (
    <Card className={`bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-slate-700 ${className ?? ''}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Calculator className="h-4 w-4 text-emerald-400" />
          {t.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">{t.bdiCalculated}</p>
            <Badge variant="outline" className="text-xs text-white border-slate-500">
              {(data.bdiFactor * 100).toFixed(1)}%
            </Badge>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">{t.avgProfit}</p>
            <Badge variant="outline" className="text-xs text-emerald-300 border-emerald-600/50 bg-emerald-950/30">
              {data.weightedProfitRate.toFixed(1)}%
            </Badge>
          </div>
        </div>

        <Separator className="bg-slate-700" />

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-400">{t.totalCost}</span>
            <span className="text-sm font-medium text-white">{fmt(data.totalCost)}</span>
          </div>

          {data.displacementCost > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500 pl-2">{t.displacement}</span>
              <span className="text-xs text-slate-300">{fmt(data.displacementCost)}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-slate-700">
            <span className="text-sm font-medium text-white">{t.finalPrice}</span>
            <span className="text-sm font-bold text-emerald-400">{fmt(data.finalPrice)}</span>
          </div>
        </div>

        <Separator className="bg-slate-700" />

        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="h-3 w-3 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">{t.paymentOptions}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">
              {t.cashDiscount.replace('{pct}', cashPct)}
            </span>
            <span className="text-xs font-medium text-emerald-300">{fmt(data.cashPrice)}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">
              {t.cardInstallments.replace('{n}', String(data.cardInstallments))}
            </span>
            <span className="text-xs text-white">{fmt(data.installmentValue)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 text-xs text-slate-500">
          <TrendingUp className="h-3 w-3" />
          <span>{t.marginNote}</span>
        </div>
      </CardContent>
    </Card>
  );
}

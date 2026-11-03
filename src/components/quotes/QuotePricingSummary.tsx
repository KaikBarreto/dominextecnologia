import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatMoney } from '@/lib/format';
import type { LocaleCode } from '@/lib/i18n/locales';
import { cn } from '@/lib/utils';

export interface QuotePricingSummaryInput {
  laborCost: number;
  resourcesCost: number;
  materialsCost: number;
  displacementCost: number;
  suggestedPrice: number;
  practicedPrice: number;
  discountAmount: number;
  cashDiscountRate: number;
  installments: number;
}

export function calculateQuotePricingSummary(input: QuotePricingSummaryInput) {
  const totalCost = Math.max(0,
    input.laborCost + input.resourcesCost + input.materialsCost + input.displacementCost,
  );
  const practicedAfterDiscount = Math.max(0, input.practicedPrice - input.discountAmount);
  const profit = practicedAfterDiscount - totalCost;
  const margin = practicedAfterDiscount > 0 ? (profit / practicedAfterDiscount) * 100 : 0;
  const installments = Math.max(1, Math.floor(input.installments || 1));

  return {
    totalCost,
    practicedAfterDiscount,
    profit,
    margin,
    cashPrice: practicedAfterDiscount * (1 - Math.max(0, input.cashDiscountRate) / 100),
    installmentValue: practicedAfterDiscount / installments,
    installments,
  };
}

const COPY: Record<LocaleCode, {
  title: string;
  automatic: string;
  manual: string;
  labor: string;
  resources: string;
  materials: string;
  displacement: string;
  totalCost: string;
  suggested: string;
  practiced: string;
  discount: string;
  profit: string;
  margin: string;
  payment: string;
  cash: string;
}> = {
  'pt-br': { title: 'Resumo do orçamento', automatic: 'BDI automático', manual: 'Orçamento padrão', labor: 'Mão de obra', resources: 'Recursos e extras', materials: 'Materiais', displacement: 'Deslocamento', totalCost: 'Custo total', suggested: 'Preço sugerido', practiced: 'Preço praticado', discount: 'Desconto', profit: 'Lucro estimado', margin: 'Margem', payment: 'Pagamentos', cash: 'À vista' },
  en: { title: 'Quote summary', automatic: 'Automatic BDI', manual: 'Standard quote', labor: 'Labor', resources: 'Resources and extras', materials: 'Materials', displacement: 'Travel', totalCost: 'Total cost', suggested: 'Suggested price', practiced: 'Applied price', discount: 'Discount', profit: 'Estimated profit', margin: 'Margin', payment: 'Payments', cash: 'Cash' },
  es: { title: 'Resumen del presupuesto', automatic: 'BDI automático', manual: 'Presupuesto estándar', labor: 'Mano de obra', resources: 'Recursos y extras', materials: 'Materiales', displacement: 'Desplazamiento', totalCost: 'Costo total', suggested: 'Precio sugerido', practiced: 'Precio aplicado', discount: 'Descuento', profit: 'Beneficio estimado', margin: 'Margen', payment: 'Pagos', cash: 'Al contado' },
  fr: { title: 'Résumé du devis', automatic: 'BDI automatique', manual: 'Devis standard', labor: "Main-d'œuvre", resources: 'Ressources et extras', materials: 'Matériaux', displacement: 'Déplacement', totalCost: 'Coût total', suggested: 'Prix suggéré', practiced: 'Prix appliqué', discount: 'Remise', profit: 'Bénéfice estimé', margin: 'Marge', payment: 'Paiements', cash: 'Comptant' },
};

export function QuotePricingSummary({
  data,
  useBdi,
  currency,
  locale,
  className,
}: {
  data: QuotePricingSummaryInput;
  useBdi: boolean;
  currency: string;
  locale: LocaleCode;
  className?: string;
}) {
  const copy = COPY[locale];
  const result = calculateQuotePricingSummary(data);
  const fmt = (value: number) => formatMoney(Math.round(value * 100) / 100, currency, locale);
  const rows = [
    [copy.labor, data.laborCost],
    [copy.resources, data.resourcesCost],
    [copy.materials, data.materialsCost],
    [copy.displacement, data.displacementCost],
  ] as const;

  return (
    <aside className={cn('rounded-xl border bg-background p-4', className)} aria-label={copy.title}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{copy.title}</h3>
        <Badge variant="default" className="whitespace-nowrap">
          {useBdi ? copy.automatic : copy.manual}
        </Badge>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{copy.practiced}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{fmt(result.practicedAfterDiscount)}</p>
        {useBdi && (
          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{copy.suggested}</span>
            <span className="tabular-nums">{fmt(data.suggestedPrice)}</span>
          </div>
        )}
        {data.discountAmount > 0 && (
          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-destructive">
            <span>{copy.discount}</span>
            <span className="tabular-nums">− {fmt(data.discountAmount)}</span>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2 border-y py-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular-nums">{fmt(value)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 font-medium">
          <span>{copy.totalCost}</span>
          <span className="tabular-nums">{fmt(result.totalCost)}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-[11px] text-muted-foreground">{copy.profit}</p>
          <p className={cn('mt-1 break-words font-semibold tabular-nums', result.profit < 0 && 'text-destructive')}>
            {fmt(result.profit)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-[11px] text-muted-foreground">{copy.margin}</p>
          <p className={cn('mt-1 font-semibold tabular-nums', result.margin < 0 && 'text-destructive')}>
            {result.margin.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{copy.payment}</p>
        <div className="flex items-center justify-between gap-3">
          <span>{copy.cash}</span>
          <span className="tabular-nums font-medium">{fmt(result.cashPrice)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>{result.installments}x</span>
          <span className="tabular-nums font-medium">{fmt(result.installmentValue)}</span>
        </div>
      </div>
    </aside>
  );
}

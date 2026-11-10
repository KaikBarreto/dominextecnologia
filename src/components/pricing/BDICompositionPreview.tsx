import { cn } from '@/lib/utils';

export interface BDICompositionLabels {
  composition?: string;
  cost: string;
  tax: string;
  admin: string;
  profit: string;
  finalPrice: string;
  factor: string;
  factorFormation: string;
  priceFormula: string;
}

export interface BDICompositionPreviewProps {
  totalCost: number;
  finalPrice: number;
  bdiFactor: number;
  taxRate: number;
  adminRate: number;
  profitRate: number;
  formatMoney: (value: number) => string;
  formatRate: (value: number) => string;
  labels: BDICompositionLabels;
  variant?: 'full' | 'inline' | 'compact' | 'vertical';
  className?: string;
}

interface CompositionLayer {
  id: 'profit' | 'admin' | 'tax' | 'cost';
  label: string;
  rate: number;
  amount: number;
  className: string;
}

const safeRate = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0);

/**
 * Explica visualmente o divisor BDI sem criar uma segunda fórmula financeira.
 * A base ocupa o coeficiente do preço final; imposto, administração e lucro
 * ficam empilhados acima dela. Os valores vêm do mesmo resultado calculado por
 * `useBDICalculator`, portanto esta visualização nunca persiste nem recalcula
 * configurações por conta própria.
 */
export function BDICompositionPreview({
  totalCost,
  finalPrice,
  bdiFactor,
  taxRate,
  adminRate,
  profitRate,
  formatMoney,
  formatRate,
  labels,
  variant = 'full',
  className,
}: BDICompositionPreviewProps) {
  const tax = safeRate(taxRate);
  const admin = safeRate(adminRate);
  const profit = safeRate(profitRate);
  const factor = Math.max(0.01, Number.isFinite(bdiFactor) ? bdiFactor : 0.01);
  const costRate = factor * 100;

  const layers: CompositionLayer[] = [
    {
      id: 'profit',
      label: labels.profit,
      rate: profit,
      amount: finalPrice * (profit / 100),
      className: 'bg-success text-success-foreground',
    },
    {
      id: 'admin',
      label: labels.admin,
      rate: admin,
      amount: finalPrice * (admin / 100),
      className: 'bg-warning text-warning-foreground',
    },
    {
      id: 'tax',
      label: labels.tax,
      rate: tax,
      amount: finalPrice * (tax / 100),
      className: 'bg-destructive text-destructive-foreground',
    },
    {
      id: 'cost',
      label: labels.cost,
      rate: costRate,
      amount: totalCost,
      className: 'bg-foreground text-background',
    },
  ];

  const ratesFormula = `${formatRate(tax)}% + ${formatRate(admin)}% + ${formatRate(profit)}%`;
  const accessibleSummary = layers
    .map((layer) => `${layer.label}: ${formatRate(layer.rate)}%, ${formatMoney(layer.amount)}`)
    .join('. ');

  if (variant === 'vertical') {
    return (
      <section
        className={cn('overflow-hidden rounded-xl border border-border bg-background', className)}
        aria-label={`${labels.finalPrice}: ${formatMoney(finalPrice)}. ${accessibleSummary}`}
      >
        <div className="flex items-end justify-between gap-4 border-b bg-muted/25 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{labels.composition ?? labels.finalPrice}</p>
            <p className="mt-1 text-3xl font-black tabular-nums">{formatMoney(finalPrice)}</p>
          </div>
          <div className="text-right"><p className="text-xs text-muted-foreground">Coeficiente</p><p className="font-mono text-base font-bold">{factor.toFixed(4)}</p></div>
        </div>
        <div className="p-5">
          <div className="flex min-h-[21rem] flex-col overflow-hidden rounded-xl" role="img" aria-label={accessibleSummary}>
            {layers.map(layer => (
              <div key={layer.id} data-testid={`bdi-layer-${layer.id}`} className={cn('flex min-h-14 items-center justify-between gap-4 border-b border-white/30 px-4 py-3 last:border-b-0', layer.className)} style={{ flexGrow: Math.max(4, layer.rate) }}>
                <span className="font-bold">{layer.label}</span>
                <span className="text-right"><span className="block text-xs font-semibold opacity-85">{formatRate(layer.rate)}%</span><span className="block font-black tabular-nums">{formatMoney(layer.amount)}</span></span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center font-mono text-sm font-semibold tabular-nums text-foreground">{formatMoney(totalCost)} ÷ {factor.toFixed(4)} = {formatMoney(finalPrice)}</p>
        </div>
      </section>
    );
  }

  if (variant !== 'full') {
    const compact = variant === 'compact';
    return (
      <section
        className={cn(
          compact
            ? 'rounded-xl border border-border bg-background p-4'
            : 'border-t border-border pt-4',
          className,
        )}
        aria-label={`${labels.finalPrice}: ${formatMoney(finalPrice)}. ${accessibleSummary}`}
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {labels.composition ?? labels.finalPrice}
            </p>
            {!compact && (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatMoney(totalCost)} ÷ {factor.toFixed(4)}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className={cn('break-words font-bold tabular-nums text-foreground', compact ? 'text-lg' : 'text-xl')}>
              {formatMoney(finalPrice)}
            </p>
            <p className="mt-0.5 font-mono text-[10px] font-semibold tabular-nums text-primary">
              BDI {factor.toFixed(4)}
            </p>
          </div>
        </div>

        <div
          className={cn('mt-3 flex overflow-hidden rounded-md ring-1 ring-inset ring-border', compact ? 'h-8' : 'h-10')}
          role="img"
          aria-label={accessibleSummary}
        >
          {layers.slice().reverse().map((layer) => (
            <div
              key={layer.id}
              data-testid={`bdi-strip-${layer.id}`}
              className={cn(
                'flex min-w-0 items-center justify-center border-r border-white/30 px-1 last:border-r-0',
                layer.className,
              )}
              style={{ flexGrow: Math.max(4, layer.rate), flexBasis: 0 }}
              title={`${layer.label}: ${formatRate(layer.rate)}% · ${formatMoney(layer.amount)}`}
            >
              <span className="text-[10px] font-black tabular-nums sm:text-[11px]">
                {formatRate(layer.rate)}%
              </span>
            </div>
          ))}
        </div>

        <div className={cn('mt-3 grid gap-x-3 gap-y-2', compact ? 'grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-4')}>
          {layers.slice().reverse().map((layer) => (
            <div key={layer.id} className="flex min-w-0 items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', layer.className)} aria-hidden="true" />
                <span className="break-words leading-tight">{layer.label}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">
                {formatMoney(layer.amount)}
              </span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn('overflow-hidden rounded-xl border border-border bg-background', className)}
      aria-label={`${labels.finalPrice}: ${formatMoney(finalPrice)}. ${accessibleSummary}`}
    >
      <div className="flex flex-col gap-2 border-b border-border bg-muted/35 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {labels.finalPrice}
          </p>
          <p className="mt-1 break-words text-3xl font-black tabular-nums text-foreground sm:text-4xl">
            {formatMoney(finalPrice)}
          </p>
        </div>
        <div className="shrink-0 text-left sm:text-right">
          <p className="text-xs text-muted-foreground">{labels.factor}</p>
          <p className="font-mono text-lg font-bold tabular-nums text-primary">
            {factor.toFixed(4)}
          </p>
        </div>
      </div>

      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(15rem,0.9fr)_minmax(16rem,1.1fr)] lg:items-stretch">
        <div
          className="flex min-h-[19rem] flex-col overflow-hidden rounded-lg border border-border"
          role="img"
          aria-label={accessibleSummary}
        >
          {layers.map((layer) => (
            <div
              key={layer.id}
              data-testid={`bdi-layer-${layer.id}`}
              className={cn(
                'flex min-h-12 items-center justify-between gap-3 border-b border-white/25 px-3 py-2.5 last:border-b-0',
                layer.className,
              )}
              style={{ flexGrow: Math.max(4, layer.rate) }}
            >
              <span className="min-w-0 text-sm font-bold leading-tight">{layer.label}</span>
              <span className="shrink-0 text-right">
                <span className="block text-xs font-semibold tabular-nums opacity-90">
                  {formatRate(layer.rate)}%
                </span>
                <span className="block text-sm font-black tabular-nums">
                  {formatMoney(layer.amount)}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {labels.factorFormation}
            </p>
          </div>

          <div className="rounded-lg bg-muted px-3 py-3 font-mono text-sm leading-relaxed text-foreground">
            <span className="block">BDI = 1 − ({ratesFormula})</span>
            <span className="mt-1 block font-bold text-primary">BDI = {factor.toFixed(4)}</span>
          </div>

          <div className="rounded-lg border border-primary/25 px-3 py-3">
            <p className="text-xs text-muted-foreground">{labels.priceFormula}</p>
            <p className="mt-1 break-words font-mono text-sm font-bold tabular-nums text-foreground">
              {formatMoney(totalCost)} ÷ {factor.toFixed(4)} = {formatMoney(finalPrice)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

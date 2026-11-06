import { useId } from 'react';
import { Building2, Percent, TrendingUp, Wrench } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface QuoteBdiComposerProps {
  totalCost: number;
  finalPrice: number;
  bdiFactor: number;
  taxRate: number;
  adminRate: number;
  profitRate: number;
  onTaxChange: (value: number) => void;
  onAdminChange: (value: number) => void;
  onProfitChange: (value: number) => void;
  formatMoney: (value: number) => string;
  formatRate: (value: number) => string;
}

/** Edita as parcelas do BDI usando exclusivamente o resultado financeiro do orçamento. */
export function QuoteBdiComposer({
  totalCost, finalPrice, bdiFactor, taxRate, adminRate, profitRate,
  onTaxChange, onAdminChange, onProfitChange, formatMoney, formatRate,
}: QuoteBdiComposerProps) {
  const id = useId();
  const costRate = Math.max(0, bdiFactor * 100);
  const parts = [
    { key: 'cost', label: 'Custo de execução', rate: costRate, amount: totalCost, color: 'bg-zinc-950', icon: Wrench },
    { key: 'tax', label: 'Imposto', rate: taxRate, amount: finalPrice * taxRate / 100, color: 'bg-red-600', icon: Percent, onChange: onTaxChange },
    { key: 'admin', label: 'Administração', rate: adminRate, amount: finalPrice * adminRate / 100, color: 'bg-amber-500', icon: Building2, onChange: onAdminChange },
    { key: 'profit', label: 'Lucro', rate: profitRate, amount: finalPrice * profitRate / 100, color: 'bg-emerald-600', icon: TrendingUp, onChange: onProfitChange },
  ];
  const totalRate = parts.reduce((sum, part) => sum + Math.max(0, part.rate), 0) || 1;
  const chartDescription = parts.map(part => `${part.label}: ${formatRate(part.rate)}%, ${formatMoney(part.amount)}`).join('. ');

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-background" aria-label="Composição do preço sugerido">
      <div className="flex flex-wrap items-end justify-between gap-3 bg-zinc-950 px-5 py-5 text-white sm:px-6">
        <div className="min-w-0">
          <p className="text-sm text-zinc-300">Composição do preço sugerido</p>
          <p className="mt-1 break-words text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{formatMoney(finalPrice)}</p>
        </div>
        <div className="hidden text-right sm:block"><p className="text-xs text-zinc-400">Coeficiente BDI</p><p className="mt-1 font-mono text-base font-semibold">{bdiFactor.toFixed(4)}</p></div>
      </div>

      <div className="flex gap-5 p-4 sm:gap-6 sm:p-6">
        <div className="hidden w-16 shrink-0 flex-col gap-1 sm:flex" role="img" aria-label={chartDescription}>
          {parts.map(part => (
            <div key={part.key} className={cn('min-h-0 rounded-[4px]', part.color)} style={{ flexBasis: 0, flexGrow: Math.max(0, part.rate) / totalRate }} title={`${part.label}: ${formatRate(part.rate)}%`} />
          ))}
        </div>

        <div className="min-w-0 flex-1 divide-y">
          {parts.map(part => {
            const Icon = part.icon;
            return (
              <div key={part.key} data-testid={`bdi-layer-${part.key}`} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_6.5rem] sm:py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white', part.color)}><Icon className="h-3.5 w-3.5" /></span>
                    <Label htmlFor={part.onChange ? `${id}-${part.key}` : undefined} className="text-base font-semibold sm:text-lg">{part.label}</Label>
                  </div>
                  <p className="mt-1.5 pl-9 text-sm font-medium tabular-nums text-foreground/80">{formatMoney(part.amount)}</p>
                </div>
                {part.onChange ? (
                  <div className="relative">
                    <Input id={`${id}-${part.key}`} aria-label={`Percentual de ${part.label.toLocaleLowerCase('pt-BR')}`} type="number" inputMode="decimal" min={0} max={100} step="0.1" value={part.rate} onChange={event => part.onChange?.(Math.max(0, Number(event.target.value) || 0))} className="h-12 pr-8 text-right text-lg font-semibold tabular-nums" />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                ) : <span className="text-right text-lg font-semibold tabular-nums">{formatRate(part.rate)}<span className="ml-1 text-sm font-normal text-muted-foreground">%</span></span>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="border-t bg-muted/25 px-4 py-3 sm:px-6">
        <p className="text-xs leading-relaxed text-muted-foreground">Preço = custo de execução ÷ coeficiente BDI</p>
        <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(totalCost)} ÷ {bdiFactor.toFixed(4)} = {formatMoney(finalPrice)}</p>
      </div>
    </section>
  );
}

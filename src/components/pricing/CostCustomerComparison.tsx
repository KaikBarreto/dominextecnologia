import { cn } from '@/lib/utils';

export function CostCustomerComparison({
  cost,
  customerPrice,
  formatValue,
  costLabel = 'Seu custo',
  customerLabel = 'Cliente paga com BDI',
  note,
  className,
}: {
  cost: number;
  customerPrice: number;
  formatValue: (value: number) => string;
  costLabel?: string;
  customerLabel?: string;
  note?: string;
  className?: string;
}) {
  return (
    <section className={cn('border-y py-4', className)} aria-label={`${costLabel} e ${customerLabel}`}>
      <dl className="grid grid-cols-2 divide-x">
        <div className="min-w-0 pr-4">
          <dt className="text-xs font-medium text-muted-foreground">{costLabel}</dt>
          <dd className="mt-1 break-words text-xl font-bold tabular-nums text-foreground">{formatValue(cost)}</dd>
        </div>
        <div className="min-w-0 pl-4">
          <dt className="text-xs font-medium text-muted-foreground">{customerLabel}</dt>
          <dd className="mt-1 break-words text-xl font-bold tabular-nums text-foreground">{formatValue(customerPrice)}</dd>
        </div>
      </dl>
      {note && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{note}</p>}
    </section>
  );
}

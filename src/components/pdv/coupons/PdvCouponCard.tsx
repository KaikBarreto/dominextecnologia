import { BadgeDollarSign, Check, TicketPercent, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PdvCouponKind = 'percentage' | 'fixed' | 'shipping';
export type PdvCouponStatus = 'available' | 'inactive' | 'expired';

export interface PdvCouponCardProps {
  code: string;
  name?: string;
  kind: PdvCouponKind;
  status?: PdvCouponStatus;
  /** Percentual ou valor fixo. Cupons de frete não precisam informar valor. */
  value?: number;
  ruleSummary: string;
  expiresOn?: string | null;
  selected?: boolean;
  density?: 'default' | 'compact';
  selectionRole?: 'button' | 'radio';
  formatCurrency?: (value: number) => string;
  onSelect?: () => void;
  className?: string;
}

const KIND_META = {
  percentage: {
    label: 'Percentual',
    icon: TicketPercent,
    barClass: 'bg-violet-600',
  },
  fixed: {
    label: 'Valor fixo',
    icon: BadgeDollarSign,
    barClass: 'bg-blue-600',
  },
  shipping: {
    label: 'Frete',
    icon: Truck,
    barClass: 'bg-emerald-600',
  },
} satisfies Record<PdvCouponKind, {
  label: string;
  icon: typeof TicketPercent;
  barClass: string;
}>;

const STATUS_LABEL: Record<PdvCouponStatus, string> = {
  available: 'Disponível',
  inactive: 'Inativo',
  expired: 'Vencido',
};

function defaultCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function couponBenefit(
  kind: PdvCouponKind,
  value: number | undefined,
  formatCurrency: (value: number) => string,
) {
  if (kind === 'shipping') return 'Frete grátis';
  if (kind === 'percentage') return `${Math.max(0, value ?? 0).toLocaleString('pt-BR')}% OFF`;
  return `${formatCurrency(Math.max(0, value ?? 0))} OFF`;
}

/**
 * Fundação visual de cupom promocional do PDV.
 *
 * Cupom é desconto/regra comercial. Não representa saldo financeiro, não
 * consome voucher e não liquida pedido. A integração transacional pertence a
 * uma entrega separada, com validação no servidor.
 */
export function PdvCouponCard({
  code,
  name,
  kind,
  status = 'available',
  value,
  ruleSummary,
  expiresOn = null,
  selected = false,
  density = 'default',
  selectionRole = 'button',
  formatCurrency = defaultCurrency,
  onSelect,
  className,
}: PdvCouponCardProps) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const disabled = status !== 'available';
  const benefit = couponBenefit(kind, value, formatCurrency);
  const validity = expiresOn
    ? `Válido até ${new Date(`${expiresOn}T12:00:00`).toLocaleDateString('pt-BR')}`
    : 'Sem data de validade';

  return (
    <button
      type="button"
      role={selectionRole === 'radio' ? 'radio' : undefined}
      disabled={disabled}
      aria-checked={selectionRole === 'radio' ? selected : undefined}
      aria-pressed={selectionRole === 'button' ? selected : undefined}
      aria-label={`Cupom ${code}${name ? `, ${name}` : ''}, ${benefit}, ${STATUS_LABEL[status]}`}
      data-state={status}
      onClick={onSelect}
      className={cn(
        'group relative grid w-full grid-cols-[6px_minmax(0,1fr)_auto] overflow-hidden rounded-xl border-2 text-left shadow-sm transition-[border-color,background-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        density === 'compact' ? 'min-h-20' : 'min-h-24',
        selected
          ? 'border-primary bg-primary text-primary-foreground shadow-md'
          : 'border-border bg-background text-foreground hover:-translate-y-0.5 hover:border-foreground/35 hover:shadow-md',
        disabled && 'cursor-not-allowed opacity-55 hover:translate-y-0 hover:border-border hover:shadow-sm',
        className,
      )}
    >
      <span aria-hidden="true" className={cn('h-full w-1.5', disabled ? 'bg-zinc-500' : meta.barClass)} />

      <span className={cn('min-w-0 px-3 sm:px-4', density === 'compact' ? 'py-2' : 'py-3')}>
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white',
            disabled ? 'bg-zinc-600' : meta.barClass,
          )}>
            <Icon className="h-3.5 w-3.5" />
            {meta.label}
          </span>
          <strong className="truncate font-mono text-sm tracking-wide">{code}</strong>
        </span>
        <span className={cn(
          'block truncate text-xs',
          density === 'compact' ? 'mt-1.5' : 'mt-2',
          selected ? 'text-primary-foreground/80' : 'text-muted-foreground',
        )} title={name ? `${name} · ${ruleSummary}` : ruleSummary}>
          {name ? `${name} · ${ruleSummary}` : ruleSummary}
        </span>
        <span className={cn(
          'mt-1 block text-[11px]',
          selected ? 'text-primary-foreground/65' : 'text-muted-foreground',
        )}>
          {disabled ? STATUS_LABEL[status] : validity}
        </span>
      </span>

      <span className={cn(
        'flex min-w-[104px] flex-col items-end justify-center gap-1 px-3 sm:min-w-[128px] sm:px-4',
        density === 'compact' ? 'py-2' : 'py-3',
      )}>
        {selected ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-foreground text-primary" aria-hidden="true">
            <Check className="h-4 w-4" />
          </span>
        ) : null}
        <strong className="text-right text-base font-extrabold tabular-nums sm:text-lg">{benefit}</strong>
      </span>
    </button>
  );
}

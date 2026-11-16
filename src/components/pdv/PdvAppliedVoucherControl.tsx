import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, Loader2, Ticket, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field-actions';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { PdvMoneyInput } from '@/components/pdv/caixa/PdvMoneyInput';
import { usePdvCustomerPaymentOptions } from '@/hooks/usePdvCustomerPaymentOptions';
import { round2 } from '@/lib/pdv/cash';
import { clampStoredValueApplication } from '@/lib/pdv/payment';
import type { PdvAppliedVoucher } from '@/lib/pdv/sale-drafts';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { todayInTz } from '@/lib/timezone';
import { isPdvVoucherEligible } from '@/lib/pdv/voucherEligibility';

const NO_EXCLUDED_VOUCHERS: readonly string[] = [];

interface PdvAppliedVoucherControlProps {
  enabled: boolean;
  excludedVoucherIds?: readonly string[];
  hideRemaining?: boolean;
  compactApplied?: boolean;
  customerId: string | null;
  total: number;
  value: PdvAppliedVoucher | null;
  formatCurrency: (value: number) => string;
  onChange: (value: PdvAppliedVoucher | null) => void;
  onPickerOpenChange?: (open: boolean) => void;
}

/**
 * Voucher é crédito aplicado ao pedido, não uma escolha de recebimento.
 * A seleção fica no rascunho; o consumo real continua atômico na liquidação.
 */
export function PdvAppliedVoucherControl({
  enabled,
  excludedVoucherIds = NO_EXCLUDED_VOUCHERS,
  hideRemaining = false,
  compactApplied = false,
  customerId,
  total,
  value,
  formatCurrency,
  onChange,
  onPickerOpenChange,
}: PdvAppliedVoucherControlProps) {
  const options = usePdvCustomerPaymentOptions(customerId, enabled && Boolean(customerId));
  const { timezone } = useAppLocaleContext();
  const today = todayInTz(timezone);
  const [open, setOpen] = useState(false);
  const [voucherId, setVoucherId] = useState('');
  const [amount, setAmount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const wasOpenRef = useRef(false);

  const vouchers = useMemo(
    () => (options.data?.vouchers ?? []).filter((voucher) => isPdvVoucherEligible(voucher, today) && !excludedVoucherIds.includes(voucher.id)),
    [options.data?.vouchers, today, excludedVoucherIds],
  );
  const selected = vouchers.find((voucher) => voucher.id === voucherId) ?? null;
  const filteredVouchers = useMemo(() => {
    const query = searchQuery.trim().toLocaleUpperCase('pt-BR');
    if (!query) return vouchers;
    return vouchers.filter((voucher) => voucher.code.toLocaleUpperCase('pt-BR').includes(query));
  }, [searchQuery, vouchers]);
  const liveApplied = value
    ? vouchers.find((voucher) => voucher.id === value.voucherId) ?? null
    : null;
  const hasStaleAppliedValue = Boolean(
    value
    && options.isSuccess
    && (!liveApplied || round2(value.amount) > round2(liveApplied.balance)),
  );
  const remaining = Math.max(0, round2(total - (value?.amount ?? 0)));

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }

    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    const appliedOrFirst = value && vouchers.some((voucher) => voucher.id === value.voucherId)
      ? value.voucherId
      : vouchers[0]?.id ?? '';
    const currentStillExists = vouchers.some((voucher) => voucher.id === voucherId);
    const nextId = justOpened || !currentStillExists ? appliedOrFirst : voucherId;
    const nextVoucher = vouchers.find((voucher) => voucher.id === nextId) ?? null;

    setVoucherId(nextId);
    setAmount((currentAmount) => {
      if (justOpened || nextId !== voucherId) {
        return value?.voucherId === nextId
          ? clampStoredValueApplication(total, nextVoucher?.balance ?? 0, value.amount)
          : clampStoredValueApplication(total, nextVoucher?.balance ?? 0, total);
      }
      return clampStoredValueApplication(total, nextVoucher?.balance ?? 0, currentAmount);
    });
  }, [open, total, value, voucherId, vouchers]);

  if (!enabled || !customerId) return null;
  if (options.isSuccess && !value && vouchers.length === 0) return null;

  const maxAmount = selected ? Math.min(total, selected.balance) : 0;
  const canApply = Boolean(selected && amount > 0 && round2(amount) <= round2(maxAmount));

  function chooseVoucher(nextId: string) {
    const next = vouchers.find((voucher) => voucher.id === nextId) ?? null;
    setVoucherId(nextId);
    setAmount(clampStoredValueApplication(total, next?.balance ?? 0, total));
  }

  function apply() {
    if (!selected || !canApply) return;
    onChange({
      voucherId: selected.id,
      code: selected.code,
      amount: clampStoredValueApplication(total, selected.balance, amount),
      balance: selected.balance,
      expiresOn: selected.expiresOn,
    });
    setOpen(false);
    onPickerOpenChange?.(false);
  }

  function openPicker() {
    setSearchQuery('');
    setOpen(true);
    onPickerOpenChange?.(true);
  }

  function closePicker() {
    setOpen(false);
    setSearchQuery('');
    onPickerOpenChange?.(false);
  }

  return (
    <div className="space-y-3">
      {options.isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Consultando vouchers do cliente…
        </p>
      )}

      {options.isError && (
        <NoticeBanner
          variant="destructive"
          title="Vouchers indisponíveis"
          action={(
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-destructive-foreground/40 bg-transparent text-destructive-foreground hover:bg-destructive-foreground/10 hover:text-destructive-foreground"
              onClick={() => void options.refetch()}
            >
              Tentar novamente
            </Button>
          )}
        >
          O pedido continua intacto. Consulte novamente antes de aplicar um voucher.
        </NoticeBanner>
      )}

      {open ? (
        <section className="space-y-3 border-y py-3" role="region" aria-label="Escolher voucher">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Voucher</h3>
              <p className="text-xs text-muted-foreground">Pesquise pelo código e confira saldo e validade.</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="Fechar escolha de voucher" onClick={closePicker}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <SearchField name="pdv-voucher-search" autoComplete="off" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar voucher pelo código" aria-label="Buscar voucher pelo código" />

          <div className="max-h-44 space-y-2 overflow-y-auto p-1 sm:max-h-[32vh]" role="radiogroup" aria-label="Vouchers disponíveis">
            {filteredVouchers.map((voucher) => {
              const active = voucher.id === voucherId;
              return <button
                key={voucher.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`Voucher ${voucher.code}, saldo ${formatCurrency(voucher.balance)}`}
                onClick={() => chooseVoucher(voucher.id)}
                className={cn(
                  'relative flex min-h-[88px] w-full items-end gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-800 px-4 pb-3 pt-10 text-left text-white shadow-sm transition-all hover:from-zinc-900 hover:to-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  active && 'from-zinc-900 to-zinc-700 shadow-md',
                )}
              >
                <span aria-hidden="true" className="absolute -left-2 top-[62%] h-4 w-4 -translate-y-1/2 rounded-full bg-background" />
                <span aria-hidden="true" className="absolute -right-2 top-[62%] h-4 w-4 -translate-y-1/2 rounded-full bg-background" />
                <span className="absolute inset-x-0 top-0 flex h-7 items-center justify-between bg-rose-600 px-4 text-[10px] font-bold uppercase tracking-[0.1em] text-white">
                  <span className="flex items-center gap-1.5"><Ticket className="h-3 w-3" />Troca e devolução</span>
                  <span>Voucher</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm font-bold tracking-wide">{voucher.code}</span>
                  <span className="mt-0.5 block text-[11px] text-white/70">{voucher.expiresOn ? `Válido até ${new Date(`${voucher.expiresOn}T12:00:00`).toLocaleDateString('pt-BR')}` : 'Sem data de validade'}</span>
                </span>
                <span className="shrink-0 text-right"><span className="block text-[10px] uppercase tracking-wide text-white/60">Saldo</span><strong className="mt-0.5 block text-base tabular-nums">{formatCurrency(voucher.balance)}</strong></span>
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/35', active && 'border-white bg-white text-zinc-950')}>
                  {active ? <Check className="h-4 w-4" /> : null}
                </span>
              </button>;
            })}
            {filteredVouchers.length === 0 ? (
              <div className="py-8 text-center" role="status">
                <p className="text-sm font-semibold">Nenhum voucher encontrado</p>
                <p className="mt-1 text-xs text-muted-foreground">Confira o código pesquisado.</p>
              </div>
            ) : null}
          </div>

          <div className="space-y-2 border-t pt-3">
            <Label htmlFor="pdv-applied-voucher-amount">Valor a aplicar</Label>
            <PdvMoneyInput
              id="pdv-applied-voucher-amount"
              value={amount}
              onChange={setAmount}
              selectOnFocus
            />
            <p className="text-xs text-muted-foreground">
              Máximo nesta venda: {formatCurrency(maxAmount)}
              {selected?.expiresOn
                ? ` · válido até ${new Date(`${selected.expiresOn}T12:00:00`).toLocaleDateString('pt-BR')}`
                : ''}
            </p>
          </div>

          {amount > maxAmount && (
            <NoticeBanner variant="destructive">O valor informado ultrapassa o saldo disponível.</NoticeBanner>
          )}

          <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={closePicker}>Cancelar</Button>
            <Button type="button" disabled={!canApply} onClick={apply}>Aplicar voucher</Button>
          </div>
        </section>
      ) : value ? (
        <>
          <div className={cn('relative overflow-hidden rounded-xl bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 px-4 pb-3 pt-10 text-white shadow-sm', compactApplied && 'px-3 pb-2 pt-8')}>
            <span aria-hidden="true" className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-background" />
            <span aria-hidden="true" className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-background" />
            <div className={cn('absolute inset-x-0 top-0 flex h-7 items-center justify-between bg-rose-600 px-4 text-[10px] font-bold uppercase tracking-[0.12em] text-white', compactApplied && 'h-6 gap-2 px-3 tracking-[0.04em]')}>
              <span className="flex min-w-0 items-center gap-1.5"><Ticket className="h-3.5 w-3.5 shrink-0" /><span>Troca e devolução</span></span>
              <button
                type="button"
                className={cn('h-7 shrink-0 px-1 text-[10px] font-bold uppercase text-white underline decoration-white/60 underline-offset-2 hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white', compactApplied && 'h-6 px-0')}
                onClick={openPicker}
              >
                Alterar
              </button>
            </div>
            <div className={cn('flex items-center justify-between gap-3', compactApplied && 'flex-col items-stretch gap-1.5')}>
              <div className="min-w-0">
                <span className={cn('text-[10px] font-bold uppercase tracking-[0.12em] text-white/65', compactApplied && 'sr-only')}>
                  Crédito da loja
                </span>
                <p className={cn('mt-0.5 truncate font-mono text-base font-bold tracking-wide', compactApplied && 'mt-0 text-xs tracking-normal')}>{value.code}</p>
                {value.expiresOn ? <p className="mt-0.5 flex items-center gap-1 text-[11px] text-white/70"><CalendarDays className="h-3 w-3" />Válido até {new Date(`${value.expiresOn}T12:00:00`).toLocaleDateString('pt-BR')}</p> : <p className="mt-0.5 text-[11px] text-white/70">Sem data de validade</p>}
              </div>
              <div className={cn('flex shrink-0 items-center gap-2 text-right', compactApplied && 'justify-between text-left')}>
                <div className={compactApplied ? 'min-w-0' : undefined}>
                  <p className={cn('text-[10px] font-medium uppercase tracking-wide text-white/65', compactApplied && 'sr-only')}>Crédito usado</p>
                  <p className={cn('mt-0.5 text-lg font-extrabold tabular-nums', compactApplied && 'mt-0 break-words text-base')}>− {formatCurrency(value.amount)}</p>
                </div>
                <button type="button" className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white', compactApplied && 'h-7 w-7')} aria-label="Remover voucher" onClick={() => onChange(null)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div className={cn("flex flex-wrap items-end justify-between gap-2 border-b pb-3 text-sm font-bold", hideRemaining && "hidden")}>
            <span>Restante a pagar</span>
            <span className="text-2xl font-extrabold tabular-nums">{formatCurrency(remaining)}</span>
          </div>
          {hasStaleAppliedValue && (
            <NoticeBanner variant="destructive" title="O saldo deste voucher mudou">
              Remova ou ajuste o voucher antes de finalizar a venda.
            </NoticeBanner>
          )}
        </>
      ) : options.isSuccess && vouchers.length > 0 ? (
        <button type="button" aria-label="Aplicar voucher" className="flex w-full items-center justify-between rounded-xl bg-rose-600 px-4 py-3 text-left text-white shadow-sm transition-colors hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:bg-rose-700 dark:hover:bg-rose-600" onClick={openPicker}>
          <span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15"><Ticket className="h-5 w-5" /></span><span><strong className="block text-sm">Aplicar voucher</strong><span className="block text-xs text-white/80">{vouchers.length === 1 ? '1 crédito disponível' : `${vouchers.length} créditos disponíveis`}</span></span></span>
          <span className="text-sm font-bold">Escolher</span>
        </button>
      ) : null}

    </div>
  );
}


/** Mantém a escolha simples e permite combinar créditos sem trocar o contexto do pedido. */
export function PdvAppliedVouchersControl({ values, onChange, ...props }: Omit<PdvAppliedVoucherControlProps, 'value' | 'onChange' | 'excludedVoucherIds' | 'hideRemaining' | 'compactApplied'> & {
  values: readonly PdvAppliedVoucher[];
  onChange: (values: PdvAppliedVoucher[]) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const applied = round2(values.reduce((sum, value) => sum + value.amount, 0));
  return <div className="space-y-3">
    {values.length > 0 && <div className="grid items-start gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 13rem), 1fr))' }}>
    {values.map(value => <fieldset key={value.voucherId} disabled={editing !== null && editing !== value.voucherId} className={cn('min-w-0', editing === value.voucherId && 'col-span-full')}>
      <PdvAppliedVoucherControl {...props} hideRemaining compactApplied value={value}
        total={Math.max(0, round2(props.total - applied + value.amount))}
        excludedVoucherIds={values.filter(item => item.voucherId !== value.voucherId).map(item => item.voucherId)}
        onPickerOpenChange={open => { setEditing(open ? value.voucherId : null); props.onPickerOpenChange?.(open); }}
        onChange={next => onChange(next ? values.map(item => item.voucherId === value.voucherId ? next : item) : values.filter(item => item.voucherId !== value.voucherId))} />
    </fieldset>)}
    </div>}
    {applied < round2(props.total) && values.length < 30 && <fieldset disabled={editing !== null && editing !== 'add'} className="min-w-0">
      <PdvAppliedVoucherControl {...props} value={null} total={Math.max(0, round2(props.total - applied))}
        excludedVoucherIds={values.map(item => item.voucherId)}
        onPickerOpenChange={open => { setEditing(open ? 'add' : null); props.onPickerOpenChange?.(open); }}
        onChange={next => { if (next) onChange([...values, next]); }} />
    </fieldset>}
    {values.length > 1 && <p className="flex flex-wrap justify-between gap-2 text-sm"><span>Vouchers aplicados: {props.formatCurrency(applied)}</span><strong>Falta receber: {props.formatCurrency(Math.max(0, round2(props.total - applied)))}</strong></p>}
  </div>;
}

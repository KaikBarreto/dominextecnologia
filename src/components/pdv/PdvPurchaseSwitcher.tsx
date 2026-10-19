import { useState } from 'react';
import { Check, ChevronDown, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

export interface PdvPurchaseSwitcherItem {
  id: string;
  code: string;
  supplier: string;
  total: number;
  itemCount: number;
  hasContent: boolean;
}

interface PdvPurchaseSwitcherTexts {
  code: string;
  supplier: string;
  value: string;
  newOrder: string;
  unnamedSupplier: string;
  deleteLabel: string;
  deleteTitle: string;
  deleteDescription: string;
  keepOrder: string;
  confirmDelete: string;
}

interface PdvPurchaseSwitcherProps {
  orders: PdvPurchaseSwitcherItem[];
  activeId: string;
  formatCurrency: (value: number) => string;
  texts: PdvPurchaseSwitcherTexts;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
  /** Integra o seletor à borda superior do painel do pedido. */
  embedded?: boolean;
  /** Versão de uma linha para o lado direito do cabeçalho da página. */
  header?: boolean;
}

export function PdvPurchaseSwitcher({
  orders,
  activeId,
  formatCurrency,
  texts,
  onSelect,
  onCreate,
  onDelete,
  disabled,
  embedded = false,
  header = false,
}: PdvPurchaseSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PdvPurchaseSwitcherItem | null>(null);
  const active = orders.find((order) => order.id === activeId) ?? orders[0];

  const requestDelete = (order: PdvPurchaseSwitcherItem) => {
    if (!order.hasContent) {
      onDelete(order.id);
      setOpen(false);
      return;
    }
    setPendingDelete(order);
  };

  const row = (order: PdvPurchaseSwitcherItem, selected: boolean, compact = false) => (
    <>
      <span className={cn('h-7 w-7 shrink-0 items-center justify-center rounded-full bg-current/10', compact ? 'hidden' : 'hidden sm:flex')}>
        <PackagePlus className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className={cn('shrink-0 text-center text-xs font-bold tabular-nums sm:text-sm', compact ? 'w-14' : 'w-16 sm:w-20')}>{order.code}</span>
      <span className={cn('shrink-0 text-right text-xs font-bold tabular-nums sm:text-sm', compact ? 'w-20 sm:w-24' : 'w-24 sm:w-28')}>
        {formatCurrency(order.total)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        {order.supplier || texts.unnamedSupplier}
      </span>
      <span className={cn(compact ? 'hidden' : 'hidden w-7 shrink-0 text-center text-xs tabular-nums sm:block', selected ? 'text-background/70' : 'text-muted-foreground')}>
        {order.itemCount}
      </span>
    </>
  );

  const deleteDescription = pendingDelete
    ? texts.deleteDescription
      .replace('{code}', pendingDelete.code)
      .replace('{supplier}', pendingDelete.supplier || texts.unnamedSupplier)
      .replace('{items}', String(pendingDelete.itemCount))
      .replace('{value}', formatCurrency(pendingDelete.total))
    : '';

  return (
    <>
      <div
        className={cn('w-full', embedded && 'border-b border-border bg-card')}
        data-embedded={embedded || undefined}
        data-header={header || undefined}
      >
        {!header && (
          <div className={cn('hidden items-center sm:flex', embedded ? 'h-8 gap-2 border-b border-border/70 px-3' : 'mb-1.5 gap-3 px-3')}>
            <span className={cn(embedded ? 'hidden' : 'w-7')} aria-hidden="true" />
            <span className={cn(embedded ? 'w-14' : 'w-20', 'text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground')}>{texts.code}</span>
            <span className={cn(embedded ? 'w-20 sm:w-24' : 'w-24 sm:w-28', 'text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground')}>{texts.value}</span>
            <span className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{texts.supplier}</span>
            <span className={cn(embedded ? 'w-10' : 'w-7')} aria-hidden="true" />
          </div>
        )}
        <div className={cn('flex overflow-hidden border border-foreground/15', embedded ? 'border-x-0 border-y-0 shadow-none' : 'rounded-lg shadow-sm')}>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled || !active}
                className={cn('flex h-12 min-w-0 flex-1 items-center bg-foreground text-left text-background transition-colors hover:bg-foreground/90 disabled:opacity-60', embedded || header ? 'gap-2 px-3' : 'gap-2 px-2 sm:gap-3 sm:px-3')}
                aria-expanded={open}
              >
                {active ? row(active, true, embedded || header) : null}
                {orders.length > 1 && <span className="shrink-0 text-xs text-background/70">({orders.length})</span>}
                <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align={embedded || header ? 'end' : 'start'} className="w-[var(--radix-popover-trigger-width)] min-w-[min(38rem,calc(100vw-2rem))] overflow-hidden p-0">
              <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
                {orders.map((order) => {
                  const selected = order.id === activeId;
                  return (
                    <div key={order.id} className={cn('flex items-center gap-2 border-b px-2 py-2.5 last:border-b-0 sm:gap-3 sm:px-3', selected ? 'bg-foreground text-background' : 'hover:bg-muted/70')}>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left sm:gap-3"
                        onClick={() => { onSelect(order.id); setOpen(false); }}
                      >
                        {row(order, selected)}
                        {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                      </button>
                      <Button
                        type="button"
                        variant="destructive-ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => requestDelete(order)}
                        aria-label={`${texts.deleteLabel}: ${order.code}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <Button type="button" variant="secondary" disabled={disabled} className={cn('h-12 shrink-0 rounded-none border-l border-background/15 font-semibold', embedded || header ? 'px-3' : 'px-4')} onClick={onCreate} aria-label={texts.newOrder}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className={cn(embedded || header ? 'sr-only' : 'hidden sm:inline')}>{texts.newOrder}</span>
          </Button>
        </div>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(next) => !next && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{texts.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{texts.keepOrder}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete.id);
                setPendingDelete(null);
                setOpen(false);
              }}
            >
              {texts.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

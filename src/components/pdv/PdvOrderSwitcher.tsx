import { useState } from 'react';
import { Check, ChevronDown, Plus, ShoppingCart, Trash2 } from 'lucide-react';
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

export interface PdvOrderSwitcherItem {
  id: string;
  code: string;
  customer: string;
  total: number;
  itemCount: number;
  hasContent: boolean;
  editing?: boolean;
}

interface PdvOrderSwitcherTexts {
  number: string;
  value: string;
  customer: string;
  newOrder: string;
  unnamedCustomer: string;
  editBadge: string;
  deleteLabel: string;
  deleteTitle: string;
  deleteDescription: string;
  keepOrder: string;
  confirmDelete: string;
}

interface PdvOrderSwitcherProps {
  orders: PdvOrderSwitcherItem[];
  activeId: string;
  formatCurrency: (value: number) => string;
  texts: PdvOrderSwitcherTexts;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
  /** Integra o seletor à borda superior do painel do pedido. */
  embedded?: boolean;
}

const COL_CODE = 'w-20 sm:w-24';
const COL_VALUE = 'w-28 sm:w-36';

export function PdvOrderSwitcher({
  orders,
  activeId,
  formatCurrency,
  texts,
  onSelect,
  onCreate,
  onDelete,
  disabled,
  embedded = false,
}: PdvOrderSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PdvOrderSwitcherItem | null>(null);
  const active = orders.find((order) => order.id === activeId) ?? orders[0];

  const requestDelete = (order: PdvOrderSwitcherItem) => {
    if (!order.hasContent) {
      onDelete(order.id);
      setOpen(false);
      return;
    }
    setPendingDelete(order);
  };

  const row = (order: PdvOrderSwitcherItem, activeRow: boolean, compact = false) => (
    <>
      <span className={cn('h-7 w-7 shrink-0 items-center justify-center rounded-full bg-current/10', compact ? 'hidden' : 'hidden sm:flex')}>
        <ShoppingCart className="h-4 w-4" />
      </span>
      <span className={cn(compact ? 'w-12' : COL_CODE, 'shrink-0 text-center text-sm font-bold tabular-nums')}>
        {order.code}
      </span>
      <span className={cn(compact ? 'w-24' : COL_VALUE, 'shrink-0 text-right text-sm font-bold tabular-nums')}>
        {formatCurrency(order.total)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        {order.customer || texts.unnamedCustomer}
      </span>
      {order.editing && (
        <span className="shrink-0 rounded-full bg-warning px-2 py-0.5 text-[10px] font-bold text-warning-foreground">
          {texts.editBadge}
        </span>
      )}
      <span className={cn(compact ? 'hidden' : 'w-7 shrink-0 text-center text-xs tabular-nums', activeRow ? 'text-background/70' : 'text-muted-foreground')}>
        {order.itemCount}
      </span>
    </>
  );

  return (
    <>
      <div className={cn('w-full', embedded && 'border-b border-border bg-card')} data-embedded={embedded || undefined}>
        <div className={cn('hidden items-center sm:flex', embedded ? 'h-8 gap-2 border-b border-border/70 px-3' : 'mb-1.5 gap-3 px-3')}>
          <span className={cn(embedded ? 'hidden' : 'w-7 shrink-0')} aria-hidden />
          <span className={cn(embedded ? 'w-12' : COL_CODE, 'shrink-0 text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground')}>
            {texts.number}
          </span>
          <span className={cn(embedded ? 'w-24' : COL_VALUE, 'shrink-0 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground')}>
            {texts.value}
          </span>
          <span className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {texts.customer}
          </span>
          <span className={cn(embedded ? 'w-10' : 'w-7', 'shrink-0')} aria-hidden />
        </div>

        <div className={cn('flex w-full overflow-hidden border border-foreground/15', embedded ? 'border-x-0 border-y-0 shadow-none' : 'rounded-lg shadow-sm')}>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled || !active}
                className={cn('flex h-12 min-w-0 flex-1 items-center bg-foreground text-left text-background transition-colors hover:bg-foreground/90 disabled:opacity-60', embedded ? 'gap-2 px-3' : 'gap-3 px-3')}
                aria-expanded={open}
              >
                {active ? row(active, true, embedded) : null}
                {orders.length > 1 && (
                  <span className="shrink-0 text-xs text-background/70">({orders.length})</span>
                )}
                <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
              </button>
            </PopoverTrigger>
            <PopoverContent align={embedded ? 'end' : 'start'} className="w-[var(--radix-popover-trigger-width)] min-w-[min(34rem,calc(100vw-2rem))] overflow-hidden p-0">
              <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
                {orders.map((order) => {
                  const selected = order.id === activeId;
                  return (
                    <div
                      key={order.id}
                      className={cn(
                        'group flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0',
                        selected ? 'bg-foreground text-background' : 'hover:bg-muted/70',
                      )}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => {
                          onSelect(order.id);
                          setOpen(false);
                        }}
                      >
                        {row(order, selected)}
                        {selected && <Check className="h-4 w-4 shrink-0" />}
                      </button>
                      <Button
                        type="button"
                        variant="destructive-ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => requestDelete(order)}
                        aria-label={`${texts.deleteLabel}: ${order.code}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            className={cn('h-12 shrink-0 rounded-none border-l border-background/15 font-semibold', embedded ? 'px-3' : 'px-4')}
            onClick={onCreate}
            aria-label={texts.newOrder}
          >
            <Plus className="h-4 w-4" />
            <span className={cn(embedded ? 'sr-only' : 'hidden sm:inline')}>{texts.newOrder}</span>
          </Button>
        </div>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(next) => !next && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{texts.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{texts.deleteDescription}</AlertDialogDescription>
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

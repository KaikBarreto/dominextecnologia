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

  const row = (order: PdvPurchaseSwitcherItem, selected: boolean) => (
    <>
      <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-current/10 sm:flex">
        <PackagePlus className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="w-16 shrink-0 text-center text-xs font-bold tabular-nums sm:w-20 sm:text-sm">{order.code}</span>
      <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums sm:w-36 sm:text-sm">
        {formatCurrency(order.total)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        {order.supplier || texts.unnamedSupplier}
      </span>
      <span className={cn('hidden w-7 shrink-0 text-center text-xs tabular-nums sm:block', selected ? 'text-background/70' : 'text-muted-foreground')}>
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
      <div className="w-full">
        <div className="mb-1.5 hidden items-center gap-3 px-3 sm:flex">
          <span className="w-7" aria-hidden="true" />
          <span className="w-20 text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{texts.code}</span>
          <span className="w-36 text-right text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{texts.value}</span>
          <span className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{texts.supplier}</span>
          <span className="w-7" aria-hidden="true" />
        </div>
        <div className="flex overflow-hidden rounded-lg border border-foreground/15 shadow-sm">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled || !active}
                className="flex h-12 min-w-0 flex-1 items-center gap-2 bg-foreground px-2 text-left text-background transition-colors hover:bg-foreground/90 disabled:opacity-60 sm:gap-3 sm:px-3"
                aria-expanded={open}
              >
                {active ? row(active, true) : null}
                {orders.length > 1 && <span className="shrink-0 text-xs text-background/70">({orders.length})</span>}
                <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[min(36rem,calc(100vw-2rem))] overflow-hidden p-0">
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
          <Button type="button" variant="secondary" disabled={disabled} className="h-12 shrink-0 rounded-none border-l border-background/15 px-4 font-semibold" onClick={onCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{texts.newOrder}</span>
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

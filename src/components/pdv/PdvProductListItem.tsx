import { Plus, Package } from 'lucide-react';
import { SignedImg } from '@/components/ui/SignedImg';
import { cn } from '@/lib/utils';
import type { PdvGridProduct } from './PdvProductCard';

export function PdvProductListItem({ product, formatCurrency, onSelect, keyboardActive, onKeyboardFocus, availableLabel = '{count} em estoque', outOfStockLabel = 'Sem estoque', formatQuantity = (value, unit) => value.toLocaleString('pt-BR') + ' ' + unit }: {
  product: PdvGridProduct;
  formatCurrency: (value: number) => string;
  onSelect: (product: PdvGridProduct) => void;
  keyboardActive: boolean;
  onKeyboardFocus: () => void;
  availableLabel?: string;
  outOfStockLabel?: string;
  formatQuantity?: (value: number, unit: string) => string;
}) {
  const available = product.availableQuantity > 0;
  return <button type="button" disabled={!available} data-pdv-product-id={product.inventoryId}
    tabIndex={available && keyboardActive ? 0 : -1} aria-disabled={!available}
    onClick={() => onSelect(product)} onFocus={onKeyboardFocus}
    className={cn('relative grid min-h-20 w-full grid-cols-[2.75rem_minmax(0,1fr)_1rem] items-center gap-x-3 gap-y-1 border-b border-border bg-background px-4 py-3 text-left last:border-b-0 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60 sm:flex sm:gap-3', keyboardActive && 'z-10 shadow-[inset_0_0_0_2px_hsl(var(--primary))]')}>
    <span className="row-span-2 flex h-11 w-11 shrink-0 items-center justify-center">
      {product.imageUrl ? <SignedImg src={product.imageUrl} alt="" className="h-10 w-10 object-contain" /> : <Package className="h-7 w-7 text-muted-foreground" />}
    </span>
    <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold leading-snug">{product.sku && <span className="mr-1.5 font-mono text-xs">{product.sku} ·</span>}{product.name}</strong><span className="mt-1 block text-xs text-muted-foreground">{available ? availableLabel.replace('{count}', formatQuantity(product.availableQuantity, product.unit || 'un')) : outOfStockLabel}</span></span>
    <strong className="col-start-2 row-start-2 shrink-0 whitespace-nowrap text-sm font-bold tabular-nums">{formatCurrency(product.unitPrice)}</strong>
    <Plus className="col-start-3 row-span-2 row-start-1 h-4 w-4 shrink-0 text-muted-foreground" />
  </button>;
}

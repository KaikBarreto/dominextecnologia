import { ShoppingCart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/mobile/EmptyState';
import { PdvCartLineRow } from '@/components/pdv/PdvCartLineRow';
import { PdvCartSummary, type PdvCartSummaryTexts } from '@/components/pdv/PdvCartSummary';
import { PdvScrollFadeContainer } from '@/components/pdv/PdvScrollFadeContainer';
import type { CartState } from '@/lib/pdv/cart';
import type { Customer } from '@/types/database';
import { cn } from '@/lib/utils';

export interface PdvCartPanelTexts extends PdvCartSummaryTexts {
  title: string;
  itemsCount: string;
  draftHint: string;
  empty: string;
  emptyHint: string;
  removeLine: string;
  clearCart: string;
  noPhoto: string;
  openProductPhoto: string;
  productPhotoViewerDescription: string;
  quantityEditLabel: string;
  itemDiscount: string;
  itemDiscountPlaceholder: string;
}

interface PdvCartPanelProps {
  cart: CartState;
  customers: Customer[];
  formatCurrency: (value: number) => string;
  currencySymbol: string;
  discountDisplay: string;
  onDiscountChange: (raw: string) => void;
  onDiscountPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  onIncrement: (inventoryId: string, delta: number) => void;
  onSetQuantity: (inventoryId: string, quantity: number) => void;
  onSetLineDiscount: (inventoryId: string, discountAmount: number) => void;
  onRemove: (inventoryId: string) => void;
  onCustomerChange: (id: string | null) => void;
  onRequestClearCart: () => void;
  onRequestPayment: () => void;
  cashClosed: boolean;
  onGoToCashPanel: () => void;
  /** Enter na edição de quantidade devolve o foco pra busca (balcão é fila). */
  onConfirmQuantityEdit?: () => void;
  /** Abre `PdvAdvancedOptionsDialog` (retrodatar + anexar foto). */
  onOpenAdvancedOptions: () => void;
  advancedOptionsActive: boolean;
  texts: PdvCartPanelTexts;
  className?: string;
}

/**
 * Conteúdo COMPLETO do carrinho (header + lista de itens + resumo) — usado
 * SÓ no drawer do mobile (`CART_DRAWER_BREAKPOINT`). No desktop/tablet a
 * lista de itens desceu pra coluna dos produtos (`PdvCartItemsTable`) e o
 * resumo mora isolado na coluna da direita (`PdvCartSummary`), direto em
 * `Pdv.tsx` — ver pedido do CEO 2026-10-18. Este componente permanece
 * intacto pro mobile não regredir.
 */
export function PdvCartPanel({
  cart,
  customers,
  formatCurrency,
  currencySymbol,
  discountDisplay,
  onDiscountChange,
  onDiscountPaste,
  onIncrement,
  onSetQuantity,
  onSetLineDiscount,
  onRemove,
  onCustomerChange,
  onRequestClearCart,
  onRequestPayment,
  cashClosed,
  onGoToCashPanel,
  onConfirmQuantityEdit,
  onOpenAdvancedOptions,
  advancedOptionsActive,
  texts,
  className,
}: PdvCartPanelProps) {
  const itemCount = cart.lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <span className="font-bold">{texts.title}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {texts.itemsCount.replace('{count}', String(itemCount))} · {texts.draftHint}
          </p>
        </div>
        {cart.lines.length > 0 && (
          <Button
            type="button"
            variant="destructive-ghost"
            size="sm"
            className="h-8"
            onClick={onRequestClearCart}
            aria-label={texts.clearCart}
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">{texts.clearCart}</span>
          </Button>
        )}
      </div>

      <PdvScrollFadeContainer
        className="h-72 shrink-0 px-4"
        recomputeDeps={[cart.lines.length]}
      >
        {cart.lines.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="h-10 w-10" />}
            title={texts.empty}
            description={texts.emptyHint}
            size="compact"
          />
        ) : (
          <div className="divide-y divide-border">
            {cart.lines.map((line) => (
              <PdvCartLineRow
                key={line.inventoryId}
                line={line}
                formatCurrency={formatCurrency}
                noPhotoLabel={texts.noPhoto}
                openPhotoLabel={texts.openProductPhoto}
                photoViewerDescription={texts.productPhotoViewerDescription}
                removeLabel={texts.removeLine}
                quantityEditLabel={texts.quantityEditLabel}
                discountLabel={texts.itemDiscount}
                discountPlaceholder={texts.itemDiscountPlaceholder}
                onIncrement={onIncrement}
                onSetQuantity={onSetQuantity}
                onSetLineDiscount={onSetLineDiscount}
                onRemove={onRemove}
                onConfirmQuantityEdit={onConfirmQuantityEdit}
              />
            ))}
          </div>
        )}
      </PdvScrollFadeContainer>

      <PdvCartSummary
        cart={cart}
        customers={customers}
        formatCurrency={formatCurrency}
        currencySymbol={currencySymbol}
        discountDisplay={discountDisplay}
        onDiscountChange={onDiscountChange}
        onDiscountPaste={onDiscountPaste}
        onCustomerChange={onCustomerChange}
        onRequestPayment={onRequestPayment}
        cashClosed={cashClosed}
        onGoToCashPanel={onGoToCashPanel}
        onOpenAdvancedOptions={onOpenAdvancedOptions}
        advancedOptionsActive={advancedOptionsActive}
        texts={texts}
        className="min-h-0 flex-1 overflow-y-auto border-t border-border bg-muted/30"
      />
    </div>
  );
}

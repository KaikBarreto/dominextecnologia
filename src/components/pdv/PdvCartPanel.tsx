import { ShoppingCart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/mobile/EmptyState';
import { PdvCartLineRow } from '@/components/pdv/PdvCartLineRow';
import { PdvCartSummary, type PdvCartSummaryTexts } from '@/components/pdv/PdvCartSummary';
import { PdvScrollFadeContainer } from '@/components/pdv/PdvScrollFadeContainer';
import type { CartState } from '@/lib/pdv/cart';
import type { LocaleCode } from '@/lib/i18n/locales';
import type { Customer } from '@/types/database';
import { cn } from '@/lib/utils';
import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

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
  /** Seletor do pedido ativo. Fica colado ao topo do painel, sem padding externo. */
  orderSwitcher?: ReactNode;
  cart: CartState;
  customers: Customer[];
  formatCurrency: (value: number) => string;
  currencySymbol: string;
  locale?: LocaleCode;
  currencyFractionDigits?: number;
  onSetDiscountAmount: (discountAmount: number) => void;
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
  /** Último produto adicionado ao pedido ativo, usado só para feedback visual. */
  additionFeedback?: { inventoryId: string; sequence: number };
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
  orderSwitcher,
  cart,
  customers,
  formatCurrency,
  currencySymbol,
  locale = 'pt-br',
  currencyFractionDigits = 2,
  onSetDiscountAmount,
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
  additionFeedback,
  texts,
  className,
}: PdvCartPanelProps) {
  const itemCount = cart.lines.reduce((sum, l) => sum + l.quantity, 0);
  const [editingLineDiscount, setEditingLineDiscount] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {orderSwitcher && <div className="shrink-0">{orderSwitcher}</div>}
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
        recomputeDeps={[cart.lines.length, editingLineDiscount]}
        fadeDisabled={editingLineDiscount != null}
        scrollToEndKey={additionFeedback?.sequence}
      >
        <div className="h-full divide-y divide-border">
          <AnimatePresence initial={false} mode="popLayout">
            {cart.lines.length === 0 ? (
              <motion.div
                key="empty-cart"
                className="h-full"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
              >
                <EmptyState
                  icon={<ShoppingCart className="h-10 w-10" />}
                  title={texts.empty}
                  description={texts.emptyHint}
                  size="compact"
                />
              </motion.div>
            ) : (
              cart.lines.map((line) => {
                const isLastAdded = additionFeedback?.inventoryId === line.inventoryId;
                return (
                  <motion.div
                    key={line.inventoryId}
                    layout="position"
                    initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.985 }}
                    animate={
                      reduceMotion
                        ? { opacity: 1 }
                        : {
                            opacity: 1,
                            y: 0,
                            x: 0,
                            scale: 1,
                            backgroundColor: isLastAdded
                              ? ['hsl(var(--primary) / 0.14)', 'hsl(var(--primary) / 0)']
                              : 'hsl(var(--primary) / 0)',
                          }
                    }
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 28, scale: 0.975 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : {
                            layout: { duration: 0.34, ease },
                            opacity: { duration: 0.2, ease },
                            x: { duration: 0.28, ease },
                            y: { duration: 0.34, ease },
                            scale: { duration: 0.28, ease },
                            backgroundColor: { duration: 0.62, ease },
                          }
                    }
                  >
                    <PdvCartLineRow
                      line={line}
                      formatCurrency={formatCurrency}
                      noPhotoLabel={texts.noPhoto}
                      openPhotoLabel={texts.openProductPhoto}
                      photoViewerDescription={texts.productPhotoViewerDescription}
                      removeLabel={texts.removeLine}
                      quantityEditLabel={texts.quantityEditLabel}
                      discountLabel={texts.itemDiscount}
                      discountEditorTexts={texts.discountEditor}
                      currencySymbol={currencySymbol}
                      locale={locale}
                      currencyFractionDigits={currencyFractionDigits}
                      onIncrement={onIncrement}
                      onSetQuantity={onSetQuantity}
                      onSetLineDiscount={onSetLineDiscount}
                      onDiscountEditingChange={(editing) =>
                        setEditingLineDiscount((current) =>
                          editing
                            ? line.inventoryId
                            : current === line.inventoryId
                              ? null
                              : current,
                        )
                      }
                      onRemove={onRemove}
                      onConfirmQuantityEdit={onConfirmQuantityEdit}
                    />
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </PdvScrollFadeContainer>

      <PdvCartSummary
        cart={cart}
        customers={customers}
        formatCurrency={formatCurrency}
        currencySymbol={currencySymbol}
        locale={locale}
        currencyFractionDigits={currencyFractionDigits}
        onSetDiscountAmount={onSetDiscountAmount}
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

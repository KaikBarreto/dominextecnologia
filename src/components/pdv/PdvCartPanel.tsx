import { PdvCartWorkspaceHeader } from './PdvCartWorkspaceParts';
import { List, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/mobile/EmptyState";
import { PdvCartLineRow } from "@/components/pdv/PdvCartLineRow";
import {
  PdvCartSummary,
  PdvCartCustomerSelector,
  type PdvCartSummaryTexts,
} from "@/components/pdv/PdvCartSummary";
import { PdvScrollFadeContainer } from "@/components/pdv/PdvScrollFadeContainer";
import type { CartState } from "@/lib/pdv/cart";
import { PDV_CART_ITEM_MOTION, PDV_MOTION_EASE } from "@/lib/pdv/motion";
import type { LocaleCode } from "@/lib/i18n/locales";
import type { Customer } from "@/types/database";
import { cn } from "@/lib/utils";
import { useMemo, useState, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { PdvValueAdjustmentMode } from '@/components/pdv/PdvInlineValueEditor';

export interface PdvCartPanelTexts extends PdvCartSummaryTexts {
  title: string;
  itemsCount: string;
  itemsCountOne?: string;
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
  onSetLineFinalAmount: (inventoryId: string, finalAmount: number, mode: PdvValueAdjustmentMode) => void;
  onSetCartFinalAmount: (finalAmount: number, mode: PdvValueAdjustmentMode) => void;
  modePreferenceKey?: string;
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
  advancedOptionsSummary?: string;
  /** Último produto adicionado ao pedido ativo, usado só para feedback visual. */
  additionFeedback?: { inventoryId: string; sequence: number };
  texts: PdvCartPanelTexts;
  className?: string;
  readOnly?: boolean;
  quantityReadOnly?: boolean;
  onSetUnitPrice?: (id: string, value: string) => void;
  lineUnitPriceValue?: (id: string) => string;
  onEditLineDescription?: (id: string) => void;
  canFinalizeOverride?: boolean;
  finalizeIcon?: ReactNode;
  hideFinalizeShortcut?: boolean;
  showAdvancedOptions?: boolean;
  allowReadOnlyAdvancedOptions?: boolean;
  showFinalizeAction?: boolean;
  appliedCreditContent?: ReactNode;
  couponContent?: ReactNode;
  /** Cliente acima dos materiais e lista flexível para o posto de venda. */
  layout?: 'stacked' | 'workspace';
  compactSummary?: boolean;
  onCloseOrder?: () => void;
  hasOrderContent?: boolean;
  appliedCreditAmount?: number;
  onSaveQuote?: () => void;
  weighControl?: (inventoryId: string) => ReactNode;
}

/** Carrinho canônico, com apresentação de balcão e variante padrão preservada. */
export function PdvCartPanel({
  orderSwitcher,
  cart,
  customers,
  formatCurrency,
  currencySymbol,
  locale = "pt-br",
  currencyFractionDigits = 2,
  onSetDiscountAmount,
  onIncrement,
  onSetQuantity,
  onSetLineDiscount,
  onSetLineFinalAmount,
  onSetCartFinalAmount,
  modePreferenceKey,
  onRemove,
  onCustomerChange,
  onRequestClearCart,
  onRequestPayment,
  cashClosed,
  onGoToCashPanel,
  onConfirmQuantityEdit,
  onOpenAdvancedOptions,
  advancedOptionsActive,
  advancedOptionsSummary,
  additionFeedback,
  texts,
  className,
  readOnly = false,
  quantityReadOnly = false, onSetUnitPrice, lineUnitPriceValue, onEditLineDescription,
  canFinalizeOverride,
  finalizeIcon,
  hideFinalizeShortcut = false,
  showAdvancedOptions = true,
  allowReadOnlyAdvancedOptions = false,
  showFinalizeAction = true,
  appliedCreditContent,
  couponContent,
  layout = 'stacked',
  compactSummary = false,
  onCloseOrder,
  hasOrderContent,
  appliedCreditAmount,
  onSaveQuote,
  weighControl,
}: PdvCartPanelProps) {
  // Produtos distintos: nunca somar kg + un + l sob o rótulo genérico "itens".
  const itemCount = cart.lines.length;
  const [editingLineDiscount, setEditingLineDiscount] = useState<string | null>(
    null,
  );
  const reduceMotion = useReducedMotion();
  const [sort, setSort] = useState('inclusion');
  const [closeAction, setCloseAction] = useState<(() => void) | null>(null);
  const displayedLines = useMemo(() => {
    const lines = [...cart.lines];
    if (sort === 'recent') lines.reverse();
    if (sort === 'name') lines.sort((a, b) => a.name.localeCompare(b.name, locale));
    if (sort === 'value') lines.sort((a, b) => (b.quantity * b.unitPrice - b.discountAmount) - (a.quantity * a.unitPrice - a.discountAmount));
    return lines;
  }, [cart.lines, locale, sort]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)} data-testid={layout === 'workspace' ? 'pdv-cart-workspace' : undefined}>
      {orderSwitcher && <div className="shrink-0">{orderSwitcher}</div>}
      {layout === 'workspace' ? <PdvCartWorkspaceHeader title={texts.title} personSelector={<PdvCartCustomerSelector cart={cart} customers={customers} texts={texts} onCustomerChange={onCustomerChange} readOnly={readOnly} compact />} disabled={readOnly && !onCloseOrder} closeLabel={onCloseOrder ? 'Fechar atendimento atual' : texts.clearCart} onClose={() => { if (!onCloseOrder) { onRequestClearCart(); return; } if (hasOrderContent ?? cart.lines.length > 0) setCloseAction(() => onCloseOrder); else onCloseOrder(); }} /> : <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            <span className="font-bold">{texts.title}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {itemCount === 1 && texts.itemsCountOne
              ? texts.itemsCountOne
              : texts.itemsCount.replace("{count}", String(itemCount))}{" "}
            · {texts.draftHint}
          </p>
        </div>
        {cart.lines.length > 0 && !readOnly && (
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
      </div>}

      {layout === 'workspace' && <div className="cartlistcaption"><span>{itemCount} {itemCount === 1 ? 'material' : 'materiais'}</span><Select value={sort} onValueChange={setSort}><SelectTrigger className="cartordertrigger h-8 w-auto gap-2 border-0 px-1 text-[10px] shadow-none" aria-label="Ordenar materiais"><List className="h-3 w-3" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inclusion">Inclusão</SelectItem><SelectItem value="recent">Mais recentes</SelectItem><SelectItem value="name">Nome A–Z</SelectItem><SelectItem value="value">Maior valor</SelectItem></SelectContent></Select></div>}

      <PdvScrollFadeContainer
        externalScrollbar={layout === 'workspace'}
        className={layout === 'workspace' ? 'cartbody min-h-28 flex-1' : 'h-72 shrink-0 px-4'}
        recomputeDeps={[cart.lines.length, editingLineDiscount]}
        fadeDisabled={editingLineDiscount != null}
        scrollToEndKey={additionFeedback?.sequence}
        scrollToItemKey={additionFeedback?.inventoryId}
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
                {layout === 'workspace' ? <div className="empty"><ShoppingCart /><h3>O pedido está vazio</h3><p>Escolha um material para começar.</p></div> : <EmptyState
                  icon={<ShoppingCart className="h-10 w-10" />}
                  title={texts.empty}
                  description={texts.emptyHint}
                  size="compact"
                />}
              </motion.div>
            ) : (
              displayedLines.map((line) => {
                const isLastAdded =
                  additionFeedback?.inventoryId === line.inventoryId;
                return (
                  <motion.div
                    key={line.inventoryId}
                    data-pdv-scroll-item={line.inventoryId}
                    layout="position"
                    initial={
                      reduceMotion
                        ? false
                        : {
                            opacity: 0,
                            y: PDV_CART_ITEM_MOTION.enterOffset,
                            scale: 0.985,
                          }
                    }
                    animate={
                      reduceMotion
                        ? { opacity: 1 }
                        : {
                            opacity: 1,
                            y: 0,
                            x: 0,
                            scale: 1,
                            backgroundColor: isLastAdded
                              ? [
                                  "hsl(var(--primary) / 0.14)",
                                  "hsl(var(--primary) / 0)",
                                ]
                              : "hsl(var(--primary) / 0)",
                          }
                    }
                    exit={
                      reduceMotion
                        ? { opacity: 0 }
                        : {
                            opacity: 0,
                            x: PDV_CART_ITEM_MOTION.exitOffset,
                            scale: 0.975,
                          }
                    }
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : {
                            layout: {
                              duration: PDV_CART_ITEM_MOTION.layoutDuration,
                              ease: PDV_MOTION_EASE,
                            },
                            opacity: {
                              duration: PDV_CART_ITEM_MOTION.opacityDuration,
                              ease: PDV_MOTION_EASE,
                            },
                            x: {
                              duration: PDV_CART_ITEM_MOTION.exitDuration,
                              ease: PDV_MOTION_EASE,
                            },
                            y: {
                              duration: PDV_CART_ITEM_MOTION.enterDuration,
                              ease: PDV_MOTION_EASE,
                            },
                            scale: {
                              duration: PDV_CART_ITEM_MOTION.scaleDuration,
                              ease: PDV_MOTION_EASE,
                            },
                            backgroundColor: {
                              duration: PDV_CART_ITEM_MOTION.highlightDuration,
                              ease: PDV_MOTION_EASE,
                            },
                          }
                    }
                  >
                    <PdvCartLineRow
                      line={line}
                      weighControl={weighControl?.(line.inventoryId)}
                      quantityReadOnly={quantityReadOnly}
                      onSetUnitPrice={onSetUnitPrice}
                      unitPriceValue={lineUnitPriceValue?.(line.inventoryId)}
                      onEditDescription={onEditLineDescription}
                      formatCurrency={formatCurrency}
                      noPhotoLabel={texts.noPhoto}
                      openPhotoLabel={texts.openProductPhoto}
                      photoViewerDescription={
                        texts.productPhotoViewerDescription
                      }
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
                      onSetLineFinalAmount={onSetLineFinalAmount}
                      modePreferenceKey={modePreferenceKey}
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
                      readOnly={readOnly}
                      density={layout === 'workspace' ? 'preview' : 'default'}
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
        onSetCartFinalAmount={onSetCartFinalAmount}
        onCustomerChange={onCustomerChange}
        onRequestPayment={onRequestPayment}
        cashClosed={cashClosed}
        onGoToCashPanel={onGoToCashPanel}
        onOpenAdvancedOptions={onOpenAdvancedOptions}
        advancedOptionsActive={advancedOptionsActive}
        advancedOptionsSummary={advancedOptionsSummary}
        texts={texts}
        readOnly={readOnly}
        canFinalizeOverride={canFinalizeOverride}
        finalizeIcon={finalizeIcon}
        hideFinalizeShortcut={hideFinalizeShortcut}
        showAdvancedOptions={showAdvancedOptions}
        allowReadOnlyAdvancedOptions={allowReadOnlyAdvancedOptions}
        showFinalizeAction={showFinalizeAction}
        appliedCreditContent={appliedCreditContent}
        couponContent={couponContent}
        hideCustomerSelector={layout === 'workspace'}
        layout={layout}
        compactSummary={compactSummary}
        appliedCreditAmount={appliedCreditAmount}
        onSaveQuote={onSaveQuote}
        className={cn('min-h-0 overflow-y-auto bg-background', layout === 'workspace' ? 'shrink-0' : 'flex-1 border-t border-border')}
      />
      <AlertDialog open={!!closeAction} onOpenChange={open => { if (!open) setCloseAction(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Fechar atendimento?</AlertDialogTitle><AlertDialogDescription>Este atendimento ainda tem conteúdo. Confirme para fechá-lo.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Continuar atendimento</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { closeAction?.(); setCloseAction(null); }}>Fechar atendimento</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

import { PdvCartWorkspaceTotals, PdvCartWorkspaceFooter } from './PdvCartWorkspaceParts';
import { ArrowRight, ChevronDown, CreditCard, SlidersHorizontal, Ticket, Vault } from "lucide-react";
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Button } from "@/components/ui/button";
import { NoticeBanner } from "@/components/ui/NoticeBanner";
import { CustomerSelectField } from "@/components/customers/CustomerSelectField";
import { PdvCustomerProfileDialog } from '@/components/pdv/PdvCustomerProfileDialog';
import { PdvPartyProfileButton } from '@/components/pdv/PdvPartyProfileButton';
import {
  PdvInlineDiscountEditor,
  type PdvInlineDiscountEditorTexts,
} from "@/components/pdv/PdvInlineDiscountEditor";
import type { CartState } from "@/lib/pdv/cart";
import {
  computeItemDiscountTotal,
  computeSubtotal,
  computeTotal,
  confirmedCouponDiscount,
  couponCartReady,
} from "@/lib/pdv/cart";
import type { LocaleCode } from "@/lib/i18n/locales";
import type { Customer } from "@/types/database";
import { cn } from "@/lib/utils";
import { PdvInlineValueEditor, type PdvValueAdjustmentMode } from '@/components/pdv/PdvInlineValueEditor';

export interface PdvCartSummaryTexts {
  customerLabel: string;
  customerNone: string;
  customerPlaceholder: string;
  customerSearchPlaceholder: string;
  customerEmpty: string;
  customerCreate: string;
  subtotal: string;
  itemDiscounts: string;
  discount: string;
  discountPlaceholder: string;
  total: string;
  /** Orçamentos exibem seu valor, sem anunciar recebimento antes do caixa. */
  amountDue?: string;
  paymentLabel: string;
  paymentShortcut: string;
  finalizeLabel: string;
  finalizeShortcut: string;
  /** Aviso de caixa fechado (dinheiro depende dele; PIX/cartão/fiado, não). */
  cashClosedTitle: string;
  cashClosedDescription: string;
  cashClosedAction: string;
  /** Rótulo do botão que abre `PdvAdvancedOptionsDialog`. */
  advancedOptionsTrigger: string;
  discountEditor: PdvInlineDiscountEditorTexts;
}

interface PdvCartSummaryProps {
  cart: CartState;
  customers: Customer[];
  formatCurrency: (value: number) => string;
  currencySymbol: string;
  locale?: LocaleCode;
  currencyFractionDigits?: number;
  onSetDiscountAmount: (discountAmount: number) => void;
  onSetCartFinalAmount: (finalAmount: number, mode: PdvValueAdjustmentMode) => void;
  onCustomerChange: (id: string | null) => void;
  /** Abre o diálogo de pagamento (F4 e F9 caem aqui). */
  onRequestPayment: () => void;
  /** Não há sessão de caixa aberta: mostra o aviso e o caminho pro painel. */
  cashClosed: boolean;
  onGoToCashPanel: () => void;
  /** Abre `PdvAdvancedOptionsDialog` (retrodatar + anexar foto). */
  onOpenAdvancedOptions: () => void;
  /** Data retroativa escolhida ou foto(s) pendente(s) — pinta o ponto no botão. */
  advancedOptionsActive: boolean;
  /** Resumo explícito do que está preenchido (observação, data e anexos). */
  advancedOptionsSummary?: string;
  texts: PdvCartSummaryTexts;
  className?: string;
  readOnly?: boolean;
  /** Permite fluxos sem preço final, como salvar um orçamento ainda não valorizado. */
  canFinalizeOverride?: boolean;
  finalizeIcon?: ReactNode;
  hideFinalizeShortcut?: boolean;
  showAdvancedOptions?: boolean;
  allowReadOnlyAdvancedOptions?: boolean;
  showFinalizeAction?: boolean;
  /** Crédito/voucher aplicado depois do total comercial e antes do recebimento. */
  appliedCreditContent?: ReactNode;
  couponContent?: ReactNode;
  /** O carrinho completo pode posicionar o mesmo seletor acima dos materiais. */
  hideCustomerSelector?: boolean;
  layout?: 'stacked' | 'workspace';
  compactSummary?: boolean;
  appliedCreditAmount?: number;
  onSaveQuote?: () => void;
}

export function PdvCartCustomerSelector({ cart, customers, texts, onCustomerChange, readOnly = false, compact = false }: Pick<PdvCartSummaryProps, 'cart' | 'customers' | 'texts' | 'onCustomerChange' | 'readOnly'> & { compact?: boolean }) {
  const selectedCustomer = customers.find(customer => customer.id === cart.customerId);
  return <div className="flex w-full min-w-0 items-start gap-1"><div className="min-w-0 flex-1"><CustomerSelectField
    id="pdv-customer" variant={compact ? 'pdv' : 'summary'} summaryLabel={compact ? 'Cliente' : texts.customerLabel}
    createLabel={texts.customerCreate} value={cart.customerId ?? undefined}
    customers={customers} allowNone noneValue="_none" noneLabel={texts.customerNone}
    placeholder={texts.customerPlaceholder} searchPlaceholder={texts.customerSearchPlaceholder}
    emptyMessage={texts.customerEmpty} defaultCustomerKind="loja" showCreateLabel={!compact} disabled={readOnly}
    onValueChange={id => onCustomerChange(id === '_none' ? null : id)}
  /></div>{selectedCustomer ? <PdvCustomerProfileDialog key={selectedCustomer.id} customer={selectedCustomer} /> : <PdvPartyProfileButton label="Ver ficha do cliente" disabled />}</div>;
}

/**
 * Resumo da venda: cliente, subtotal, desconto, total GIGANTE, aviso de
 * recebimento (Onda 1 ainda não fecha venda) e os botões de ação.
 *
 * Extraído de `PdvCartPanel` pra poder morar SÓ na coluna da direita no
 * desktop/tablet (sem a lista de itens, que desceu pra coluna dos produtos —
 * pedido do CEO 2026-10-18: "o carrinho não tá claro ali na direita, a lista
 * fica perto de onde a ação acontece"). `PdvCartPanel` (usado no drawer do
 * mobile, que NÃO mudou) reusa este componente como seu próprio rodapé —
 * mesmo markup, sem duplicar.
 */
export function PdvCartSummary({
  cart,
  customers,
  formatCurrency,
  currencySymbol,
  locale = "pt-br",
  currencyFractionDigits = 2,
  onSetDiscountAmount,
  onSetCartFinalAmount,
  onCustomerChange,
  onRequestPayment,
  cashClosed,
  onGoToCashPanel,
  onOpenAdvancedOptions,
  advancedOptionsActive,
  advancedOptionsSummary,
  texts,
  className,
  readOnly = false,
  canFinalizeOverride,
  finalizeIcon,
  hideFinalizeShortcut = false,
  showAdvancedOptions = true,
  allowReadOnlyAdvancedOptions = false,
  showFinalizeAction = true,
  appliedCreditContent,
  couponContent,
  hideCustomerSelector = false,
  layout = 'stacked',
  compactSummary = false,
  appliedCreditAmount = 0,
  onSaveQuote,
}: PdvCartSummaryProps) {
  const subtotal = computeSubtotal(cart);
  const itemDiscounts = computeItemDiscountTotal(cart);
  const total = computeTotal(cart);
  const totalAdjustmentBase = Math.max(0, subtotal - itemDiscounts);
  // Carrinho vazio não abre pagamento: a RPC recusa pedido sem item, então a
  // tela bloqueia o botão em vez de deixar o operador bater no erro.
  const canPay = canFinalizeOverride ?? (cart.lines.length > 0 && total > 0 && couponCartReady(cart));
  const [creditsOpen, setCreditsOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  if (layout === 'workspace') return <>
    <PdvCartWorkspaceTotals compact={compactSummary} className={className} subtotalLabel={texts.subtotal} subtotal={formatCurrency(subtotal)} totalLabel={texts.total} total={<PdvInlineValueEditor label={texts.total} value={total} baseAmount={totalAdjustmentBase} adjustmentPolicy="discount" formatCurrency={formatCurrency} disabled={readOnly || cart.lines.length === 0} onApply={onSetCartFinalAmount} className="font-bold" />}
      beforeTotal={<>
      {itemDiscounts > 0 && <div className="sumline"><span>{texts.itemDiscounts}</span><strong>− {formatCurrency(itemDiscounts)}</strong></div>}
      {readOnly ? <div className="sumline"><span>Descontos</span><strong>{formatCurrency(cart.discount)}</strong></div> : <PdvInlineDiscountEditor presentation="preview" variant="order" label="Descontos" baseAmount={Math.max(0, subtotal - itemDiscounts)} discountAmount={cart.discount} formatCurrency={formatCurrency} currencySymbol={currencySymbol} locale={locale} currencyFractionDigits={currencyFractionDigits} texts={texts.discountEditor} onApply={onSetDiscountAmount} />}
      {couponContent}
      {confirmedCouponDiscount(cart) > 0 && <div className="sumline"><span>Cupom {cart.coupon?.code}</span><strong>− {formatCurrency(confirmedCouponDiscount(cart))}</strong></div>}
      </>}
      afterTotal={<>
      {(appliedCreditContent || appliedCreditAmount > 0) && <>
      <button type="button" className="benefitbtn" disabled={readOnly} aria-expanded={creditsOpen} onClick={() => setCreditsOpen(open => !open)}><span className="row"><Ticket />Créditos do cliente</span><span className="row">{appliedCreditAmount > 0 ? '− ' + formatCurrency(appliedCreditAmount) : 'Usar crédito'}<ChevronDown /></span></button>
      <AnimatePresence initial={false}>{creditsOpen && <motion.div className="creditpicker" initial={reduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.34 }}>{cart.customerId ? appliedCreditContent : <small>Selecione um cliente para consultar os créditos.</small>}</motion.div>}</AnimatePresence>
      </>}
      </>}
    />
    <PdvCartWorkspaceFooter compact={compactSummary} amountLabel={texts.amountDue ?? 'Restante a receber'} amount={formatCurrency(Math.max(0, total - appliedCreditAmount))}>
      {showFinalizeAction && <button type="button" className="btn primary" disabled={!canPay || (readOnly && canFinalizeOverride !== true)} onClick={onRequestPayment}>{finalizeIcon ?? <ArrowRight />}{hideFinalizeShortcut ? (texts.finalizeLabel || texts.paymentLabel) : 'Receber agora'}</button>}
      {onSaveQuote && <button type="button" className="btn ghost" disabled={!cart.lines.length || readOnly} onClick={onSaveQuote}>Salvar orçamento</button>}
      {showAdvancedOptions && <button type="button" className="btn ghost" disabled={readOnly && !allowReadOnlyAdvancedOptions} onClick={onOpenAdvancedOptions}><SlidersHorizontal />{advancedOptionsSummary || texts.advancedOptionsTrigger}</button>}
      <small>{hideFinalizeShortcut ? 'Orçamento ainda não confirma pagamento.' : 'F4 para receber · Créditos preservam o valor da venda'}</small>
    </PdvCartWorkspaceFooter>
  </>;

  return (
    // Sem `shrink-0`/`flex-1` hardcoded aqui de propósito: quem usa este
    // componente decide o papel dele no flex pai via `className` — no drawer
    // do mobile (`PdvCartPanel`) ele é o rodapé fixo abaixo da lista rolável;
    // no desktop/tablet (`Pdv.tsx`) ele é o ÚNICO conteúdo da coluna da
    // direita e precisa poder rolar se sobrar pouca altura (tablet com
    // numpad embaixo, por exemplo).
    <div className={cn("space-y-3 px-4 py-3", className)}>
      {!hideCustomerSelector && <PdvCartCustomerSelector cart={cart} customers={customers} texts={texts} onCustomerChange={onCustomerChange} readOnly={readOnly} />}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{texts.subtotal}</span>
        <span className="font-medium tabular-nums">
          {formatCurrency(subtotal)}
        </span>
      </div>

      {itemDiscounts > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{texts.itemDiscounts}</span>
          <span className="font-medium tabular-nums">
            − {formatCurrency(itemDiscounts)}
          </span>
        </div>
      )}

      {readOnly ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{texts.discount}</span>
          <span className="font-medium tabular-nums">
            − {formatCurrency(cart.discount)}
          </span>
        </div>
      ) : (
        <PdvInlineDiscountEditor
          variant="order"
          label={texts.discount}
          baseAmount={Math.max(0, subtotal - itemDiscounts)}
          discountAmount={cart.discount}
          formatCurrency={formatCurrency}
          currencySymbol={currencySymbol}
          locale={locale}
          currencyFractionDigits={currencyFractionDigits}
          texts={texts.discountEditor}
          onApply={onSetDiscountAmount}
        />
      )}

      {couponContent}
      {confirmedCouponDiscount(cart) > 0 && <div className="flex flex-wrap justify-between gap-2 text-sm"><span>Cupom {cart.coupon?.code}</span><strong className="tabular-nums">− {formatCurrency(confirmedCouponDiscount(cart))}</strong></div>}
      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="text-base font-bold">{texts.total}</span>
        <div className="flex min-w-0 flex-1 justify-end">
          <PdvInlineValueEditor label={texts.total} value={total} baseAmount={totalAdjustmentBase} adjustmentPolicy="discount" formatCurrency={formatCurrency} disabled={readOnly || cart.lines.length === 0} onApply={onSetCartFinalAmount} className="text-2xl font-extrabold" />
        </div>
      </div>

      {appliedCreditContent}

      {/* Caixa fechado não impede a venda (PIX, cartão e fiado seguem), então
          é AVISO com o caminho pro painel, nunca bloqueio da tela. */}
      {cashClosed && (
        <NoticeBanner
          variant="warning"
          icon={Vault}
          title={texts.cashClosedTitle}
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-warning-foreground/40 bg-transparent text-warning-foreground hover:bg-warning-foreground/10"
              onClick={onGoToCashPanel}
            >
              {texts.cashClosedAction}
            </Button>
          }
        >
          {texts.cashClosedDescription}
        </NoticeBanner>
      )}

      {/* Os dois botões levam ao MESMO diálogo de pagamento, de propósito: no
          modo simples (Onda 1) não existe finalizar sem escolher a forma de
          recebimento, e um botão que "finaliza direto" faria uma venda em
          dinheiro sem o operador ver o troco. F4 e F9 abrem o diálogo; o F9 de
          dentro dele é que fecha a venda.

          "Finalizar Venda" é a AÇÃO PRINCIPAL da tela (correção 2026-10-19:
          "botão de finalizar venda tá expremido") — largura cheia, h-14
          (bem maior que o h-11 de antes) e o atalho F9 num badge pequeno que
          não disputa espaço com o rótulo. "Pagamento"/F4 vira ação
          SECUNDÁRIA (ghost, texto menor) logo abaixo: mesmo destino, menos
          peso visual. */}
      {showFinalizeAction && (
        <div>
          <Button
            type="button"
            disabled={!canPay}
            className="relative h-14 w-full justify-center px-12 text-lg font-bold"
            onClick={onRequestPayment}
          >
            <span className="flex items-center justify-center gap-2">
              {finalizeIcon ?? <CreditCard className="h-5 w-5" />}
              {texts.finalizeLabel}
            </span>
            {!hideFinalizeShortcut && (
              <kbd className="absolute right-4 rounded border border-current/30 px-1.5 py-0.5 text-[10px] opacity-70">
                {texts.finalizeShortcut}
              </kbd>
            )}
          </Button>
        </div>
      )}

      {showAdvancedOptions && (
        <button
          type="button"
          className="relative flex w-full items-center justify-center gap-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={onOpenAdvancedOptions}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>{advancedOptionsSummary || texts.advancedOptionsTrigger}</span>
          {advancedOptionsActive && (
            <span className="sr-only"> — preenchido</span>
          )}
        </button>
      )}
    </div>
  );
}

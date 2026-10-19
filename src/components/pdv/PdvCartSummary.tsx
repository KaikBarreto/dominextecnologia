import { CreditCard, SlidersHorizontal, Vault } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import type { CartState } from '@/lib/pdv/cart';
import { computeItemDiscountTotal, computeSubtotal, computeTotal } from '@/lib/pdv/cart';
import type { Customer } from '@/types/database';
import { cn } from '@/lib/utils';

export interface PdvCartSummaryTexts {
  customerLabel: string;
  customerPlaceholder: string;
  subtotal: string;
  itemDiscounts: string;
  discount: string;
  discountPlaceholder: string;
  total: string;
  paymentLabel: string;
  paymentShortcut: string;
  finalizeLabel: string;
  finalizeShortcut: string;
  /** Aviso de caixa fechado (dinheiro depende dele; PIX/cartão/fiado, não). */
  cashClosedTitle: string;
  cashClosedDescription: string;
  cashClosedAction: string;
  /** Observação do pedido (depois do total, antes de finalizar — pedido do CEO 2026-10-19). */
  notesLabel: string;
  notesPlaceholder: string;
  /** Rótulo do botão que abre `PdvAdvancedOptionsDialog`. */
  advancedOptionsTrigger: string;
}

interface PdvCartSummaryProps {
  cart: CartState;
  customers: Customer[];
  formatCurrency: (value: number) => string;
  currencySymbol: string;
  discountDisplay: string;
  onDiscountChange: (raw: string) => void;
  onDiscountPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  onCustomerChange: (id: string | null) => void;
  /** Abre o diálogo de pagamento (F4 e F9 caem aqui). */
  onRequestPayment: () => void;
  /** Não há sessão de caixa aberta: mostra o aviso e o caminho pro painel. */
  cashClosed: boolean;
  onGoToCashPanel: () => void;
  /** `pdv_orders.notes`. */
  notes: string;
  onNotesChange: (value: string) => void;
  /** Abre `PdvAdvancedOptionsDialog` (retrodatar + anexar foto). */
  onOpenAdvancedOptions: () => void;
  /** Data retroativa escolhida ou foto(s) pendente(s) — pinta o ponto no botão. */
  advancedOptionsActive: boolean;
  texts: PdvCartSummaryTexts;
  className?: string;
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
  discountDisplay,
  onDiscountChange,
  onDiscountPaste,
  onCustomerChange,
  onRequestPayment,
  cashClosed,
  onGoToCashPanel,
  notes,
  onNotesChange,
  onOpenAdvancedOptions,
  advancedOptionsActive,
  texts,
  className,
}: PdvCartSummaryProps) {
  const subtotal = computeSubtotal(cart);
  const itemDiscounts = computeItemDiscountTotal(cart);
  const total = computeTotal(cart);
  // Carrinho vazio não abre pagamento: a RPC recusa pedido sem item, então a
  // tela bloqueia o botão em vez de deixar o operador bater no erro.
  const canPay = cart.lines.length > 0 && total > 0;

  return (
    // Sem `shrink-0`/`flex-1` hardcoded aqui de propósito: quem usa este
    // componente decide o papel dele no flex pai via `className` — no drawer
    // do mobile (`PdvCartPanel`) ele é o rodapé fixo abaixo da lista rolável;
    // no desktop/tablet (`Pdv.tsx`) ele é o ÚNICO conteúdo da coluna da
    // direita e precisa poder rolar se sobrar pouca altura (tablet com
    // numpad embaixo, por exemplo).
    <div className={cn('space-y-3 px-4 py-3', className)}>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="pdv-customer">
          {texts.customerLabel}
        </label>
        <CustomerSelectField
          id="pdv-customer"
          value={cart.customerId ?? undefined}
          customers={customers}
          allowNone
          noneValue="_none"
          noneLabel={texts.customerPlaceholder}
          placeholder={texts.customerPlaceholder}
          defaultCustomerKind="loja"
          onValueChange={(id) => onCustomerChange(id === '_none' ? null : id)}
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{texts.subtotal}</span>
        <span className="font-medium tabular-nums">{formatCurrency(subtotal)}</span>
      </div>

      {itemDiscounts > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{texts.itemDiscounts}</span>
          <span className="font-medium tabular-nums">− {formatCurrency(itemDiscounts)}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-sm">
        <label htmlFor="pdv-discount" className="text-muted-foreground">
          {texts.discount}
        </label>
        <div className="relative w-28">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {currencySymbol}
          </span>
          <input
            id="pdv-discount"
            type="text"
            inputMode="numeric"
            placeholder={texts.discountPlaceholder}
            value={discountDisplay}
            onChange={(e) => onDiscountChange(e.target.value)}
            onPaste={onDiscountPaste}
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-2 text-right text-sm tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="text-base font-bold">{texts.total}</span>
        <span className="text-2xl font-extrabold tabular-nums">{formatCurrency(total)}</span>
      </div>

      {/* Observação do pedido + "Opções avançadas" (retrodatar o lançamento,
          anexar foto) — DEPOIS do total, ANTES de finalizar: ordem explícita
          do CEO 2026-10-19. O comportamento do botão/diálogo é copiado do
          `AdvancedOptionsPopover` da EcoSistema; a POSIÇÃO na tela é a pedida
          aqui, não a da EcoSistema (lá o campo de observação vem antes do
          bloco de totais). */}
      <div className="space-y-1.5">
        <Label htmlFor="pdv-order-notes" className="text-xs font-medium text-muted-foreground">
          {texts.notesLabel}
        </Label>
        <Textarea
          id="pdv-order-notes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder={texts.notesPlaceholder}
          rows={2}
          className="min-h-[60px] resize-none text-sm"
        />
      </div>

      <Button type="button" variant="outline" className="relative w-full" onClick={onOpenAdvancedOptions}>
        <SlidersHorizontal className="h-4 w-4" />
        {texts.advancedOptionsTrigger}
        {advancedOptionsActive && (
          <span
            aria-hidden="true"
            className="absolute right-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary"
          />
        )}
      </Button>

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
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          disabled={!canPay}
          className="h-14 w-full text-base font-semibold"
          onClick={onRequestPayment}
        >
          <CreditCard className="h-5 w-5" />
          {texts.finalizeLabel}
          <kbd className="ml-1.5 rounded border border-current/30 px-1.5 py-0.5 text-[10px] opacity-70">
            {texts.finalizeShortcut}
          </kbd>
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={!canPay}
          className="h-9 w-full text-sm text-muted-foreground"
          onClick={onRequestPayment}
        >
          {texts.paymentLabel}
          <kbd className="ml-1 rounded border border-current/30 px-1 text-[10px] opacity-70">
            {texts.paymentShortcut}
          </kbd>
        </Button>
      </div>
    </div>
  );
}

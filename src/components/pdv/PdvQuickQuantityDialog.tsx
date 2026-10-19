import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { NumericInput } from '@/components/ui/numeric-input';
import type { PdvGridProduct } from '@/components/pdv/PdvProductCard';

export interface PdvQuickQuantityTexts {
  title: string;
  /** Leva `{name}` — o nome do produto escolhido na busca. */
  description: string;
  quantityLabel: string;
  confirm: string;
  cancel: string;
}

interface PdvQuickQuantityDialogProps {
  /** `null` = fechado. O CALLER decide QUANDO abrir (ver `Pdv.tsx`). */
  product: PdvGridProduct | null;
  texts: PdvQuickQuantityTexts;
  onConfirm: (product: PdvGridProduct, quantity: number) => void;
  onCancel: () => void;
}

/**
 * Modal rápido de "quantos?" — só no caminho da BUSCA (escolher um item já
 * filtrado por texto no balcão). Pedido do CEO 2026-10-18.
 *
 * Este componente NÃO decide quando abrir — quem decide é `Pdv.tsx`, que só
 * passa um `product` não-nulo quando o clique veio de um resultado de busca.
 * Isso preserva as 3 réguas de velocidade do balcão, inegociáveis:
 *  - código de barras (pistola) continua adicionando 1 direto, sem passar
 *    por aqui — `handleBarcodeScan` chama `tryAdd` antes de qualquer modal;
 *  - `3 * <código>` (multiplicador) idem, direto;
 *  - clicar num card da grade SEM busca ativa (navegação por toque) também
 *    não abre modal — ali o toque É o gesto.
 *
 * Dentro do modal: campo nasce focado E selecionado (digitar substitui o "1"
 * default), `Enter` confirma, `Esc` cancela — dá pra escolher a quantidade
 * sem tirar a mão do teclado. O teto do saldo é aplicado por quem chama
 * `onConfirm` (o `addItem` do carrinho já recusa com toast quando passa do
 * disponível — este modal não precisa saber o número).
 */
export function PdvQuickQuantityDialog({ product, texts, onConfirm, onCancel }: PdvQuickQuantityDialogProps) {
  const [draft, setDraft] = useState('1');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!product) return;
    setDraft('1');
    // Próximo tick: o modal (drawer/dialog) já montou o campo no DOM.
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [product]);

  function commit() {
    if (!product) return;
    const parsed = parseInt(draft, 10);
    const quantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    onConfirm(product, quantity);
  }

  return (
    <ResponsiveModal
      open={!!product}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={texts.title}
      description={product ? texts.description.replace('{name}', product.name) : undefined}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            {texts.cancel}
          </Button>
          <Button type="button" className="font-semibold" onClick={commit}>
            {texts.confirm}
          </Button>
        </div>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="pdv-quick-qty">{texts.quantityLabel}</Label>
        <NumericInput
          id="pdv-quick-qty"
          ref={inputRef}
          value={draft}
          onValueChange={setDraft}
          className="h-12 text-center text-lg font-semibold"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
        />
      </div>
    </ResponsiveModal>
  );
}

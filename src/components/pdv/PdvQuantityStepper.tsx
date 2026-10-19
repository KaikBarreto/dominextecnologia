import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NumericInput } from '@/components/ui/numeric-input';
import { cn } from '@/lib/utils';

export interface PdvQuantityStepperProps {
  quantity: number;
  /** Teto de incremento/edição — o motor do carrinho (`setLineQuantity`) já clampa, isto é só o `+` desabilitado visual. */
  availableQuantity: number;
  /** `+`/`−` dos botões (delta). */
  onIncrement: (delta: number) => void;
  /** Edição direta do número (absoluto). O CALLER aplica o teto do saldo via `setLineQuantity`. */
  onSetQuantity: (quantity: number) => void;
  /**
   * `Enter` confirma a edição e devolve o foco pra cá (balcão é fila —
   * ver `focusSearch` em `Pdv.tsx`). Sem isso o operador perde o ritmo
   * de bipar o próximo item.
   */
  onConfirmEdit?: () => void;
  decrementAriaLabel: string;
  incrementAriaLabel: string;
  editAriaLabel: string;
  /** `sm` = linha compacta do carrinho mobile/desktop; `default` = mais respiro. */
  size?: 'default' | 'sm';
  className?: string;
}

/**
 * Quantidade do carrinho do PDV: `−` [número] `+`. Clicar no número vira
 * campo editável — SEM BORDA, só sublinhado (régua do CEO 2026-10-18:
 * "em quantidade sempre ao invés de ficar só com '+' e '-' faça o próprio
 * campo ser editável ao clicar"). Reutilizável: usado na tabela de itens
 * (desktop) e na linha do carrinho (drawer mobile) — qualquer lugar novo
 * com quantidade no PDV deve reusar este componente, não reinventar.
 *
 * Regras de edição:
 * - Inteiro puro (`NumericInput` sem `decimal`): aqui é unidade, não dinheiro.
 * - Apagar tudo NÃO vira "0 travado" (o `NumericInput` já resolve isso) —
 *   mas committar vazio REVERTE pro valor anterior em vez de remover a linha
 *   em silêncio (remover é ação explícita do botão de lixeira, não de um
 *   campo que ficou vazio sem querer).
 * - `Enter` confirma e chama `onConfirmEdit` (foco volta pra busca).
 * - `Esc` cancela e reverte, sem aplicar nada.
 * - Perder o foco (clicar fora) também confirma — mas SEM chamar
 *   `onConfirmEdit` (quem clicou fora já sabe onde quer o foco).
 */
export function PdvQuantityStepper({
  quantity,
  availableQuantity,
  onIncrement,
  onSetQuantity,
  onConfirmEdit,
  decrementAriaLabel,
  incrementAriaLabel,
  editAriaLabel,
  size = 'default',
  className,
}: PdvQuantityStepperProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const atMax = quantity >= availableQuantity;

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEditing() {
    setDraft(String(quantity));
    setEditing(true);
  }

  function commit(options: { focusSearch: boolean }) {
    const parsed = draft.trim() === '' ? NaN : parseInt(draft, 10);
    if (Number.isFinite(parsed)) {
      onSetQuantity(parsed);
    }
    // Vazio/inválido: revert silencioso (não é falha, é edição incompleta —
    // o valor exibido simplesmente volta a ser `quantity`, que não mudou).
    setEditing(false);
    if (options.focusSearch) onConfirmEdit?.();
  }

  function cancel() {
    setEditing(false);
  }

  const btnSize = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const numberWidth = size === 'sm' ? 'w-6' : 'w-8';

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={btnSize}
        onClick={() => onIncrement(-1)}
        aria-label={decrementAriaLabel}
      >
        <Minus className={iconSize} />
      </Button>

      {editing ? (
        <NumericInput
          ref={inputRef}
          value={draft}
          onValueChange={setDraft}
          aria-label={editAriaLabel}
          className={cn(
            numberWidth,
            'h-auto rounded-none border-0 border-b border-input bg-transparent p-0 text-center text-sm font-semibold tabular-nums shadow-none focus-visible:border-primary focus-visible:ring-0 focus-visible:ring-offset-0',
          )}
          onBlur={() => commit({ focusSearch: false })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit({ focusSearch: true });
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
        />
      ) : (
        // Affordance em REPOUSO, não só no foco (correção 2026-10-19: "ao
        // bater o olho não tá dando pra saber que a quantidade é editável").
        // `border-b border-dashed` fica visível o tempo todo (não é caixa de
        // input com borda completa, respeita o pedido original), mais
        // `cursor-text` + realce no hover — a régua é "dá pra ver que é
        // editável sem clicar", julgado no print, não no CSS.
        <button
          type="button"
          onClick={startEditing}
          aria-label={editAriaLabel}
          className={cn(
            numberWidth,
            'cursor-text border-b border-dashed border-muted-foreground/50 text-center text-sm font-semibold tabular-nums text-foreground transition-colors hover:border-primary hover:border-solid hover:text-primary',
          )}
        >
          {quantity}
        </button>
      )}

      <Button
        type="button"
        variant="outline"
        size="icon"
        className={btnSize}
        disabled={atMax}
        onClick={() => onIncrement(1)}
        aria-label={incrementAriaLabel}
      >
        <Plus className={iconSize} />
      </Button>
    </div>
  );
}

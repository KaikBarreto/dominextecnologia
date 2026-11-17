import { Check, CircleHelp, Pencil, ReceiptText, Tag, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { PdvMoneyInput } from '@/components/pdv/caixa/PdvMoneyInput';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type PdvValueAdjustmentMode = 'price' | 'discount';
type PdvValueAdjustmentPolicy = 'choice' | 'price' | 'discount';

interface PdvInlineValueEditorProps {
  label: string;
  value: number;
  /** Valor antes do ajuste, usado somente para explicar a diferença. */
  baseAmount: number;
  formatCurrency: (value: number) => string;
  onApply: (value: number, mode: PdvValueAdjustmentMode) => void;
  onEditingChange?: (editing: boolean) => void;
  adjustmentPolicy?: PdvValueAdjustmentPolicy;
  modePreferenceKey?: string;
  disabled?: boolean;
  className?: string;
  align?: 'start' | 'end';
}

const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const readPreferredMode = (key?: string): PdvValueAdjustmentMode => {
  if (!key || typeof window === 'undefined') return 'discount';
  try {
    return window.localStorage.getItem(key) === 'price' ? 'price' : 'discount';
  } catch {
    return 'discount';
  }
};

const storePreferredMode = (key: string | undefined, mode: PdvValueAdjustmentMode) => {
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, mode);
  } catch {
    // A preferência é opcional: a edição continua funcionando sem armazenamento local.
  }
};

/**
 * Edição pelo resultado: a pessoa informa por quanto quer fechar e escolhe se
 * a diferença deve virar preço deste pedido ou desconto visível ao cliente.
 */
export function PdvInlineValueEditor({
  label,
  value,
  baseAmount,
  formatCurrency,
  onApply,
  onEditingChange,
  adjustmentPolicy = 'choice',
  modePreferenceKey,
  disabled = false,
  className,
  align = 'end',
}: PdvInlineValueEditorProps) {
  const [editing, setEditing] = useState(false);
  const inputId = useId();
  const [draft, setDraft] = useState(roundMoney(value));
  const [mode, setMode] = useState<PdvValueAdjustmentMode>('discount');
  const [mobileHelpOpen, setMobileHelpOpen] = useState(false);
  const normalizedBase = Math.max(0, roundMoney(baseAmount));
  const normalizedDraft = Math.max(0, roundMoney(draft));
  const difference = roundMoney(normalizedBase - normalizedDraft);
  const discountAllowed = adjustmentPolicy !== 'price' && difference > 0;
  const showModeChoice = adjustmentPolicy === 'choice' && discountAllowed;
  const exceedsDiscountBase = adjustmentPolicy === 'discount' && normalizedDraft > normalizedBase;
  const percentage = normalizedBase > 0 ? Math.abs(difference / normalizedBase) * 100 : 0;

  useEffect(() => {
    if (!editing) setDraft(roundMoney(value));
  }, [editing, value]);

  useEffect(() => {
    if (!showModeChoice && mobileHelpOpen) setMobileHelpOpen(false);
  }, [mobileHelpOpen, showModeChoice]);

  const open = () => {
    if (disabled) return;
    setDraft(roundMoney(value));
    setMode(adjustmentPolicy === 'choice' ? readPreferredMode(modePreferenceKey) : 'price');
    setMobileHelpOpen(false);
    setEditing(true);
    onEditingChange?.(true);
  };

  const cancel = () => {
    setDraft(roundMoney(value));
    setMode('discount');
    setMobileHelpOpen(false);
    setEditing(false);
    onEditingChange?.(false);
  };

  const apply = () => {
    if (!Number.isFinite(normalizedDraft) || exceedsDiscountBase) return;
    const appliedMode = adjustmentPolicy === 'discount'
      ? 'discount'
      : adjustmentPolicy === 'price'
        ? 'price'
        : discountAllowed
          ? mode
          : 'price';
    if (adjustmentPolicy === 'choice' && discountAllowed) {
      storePreferredMode(modePreferenceKey, appliedMode);
    }
    onApply(normalizedDraft, appliedMode);
    setEditing(false);
    setMobileHelpOpen(false);
    onEditingChange?.(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        aria-label={`Editar ${label}`}
        onClick={open}
        className={cn(
          'group inline-flex max-w-full items-center gap-1.5 rounded-sm px-1 py-0.5 font-inherit tabular-nums transition-colors',
          'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-60',
          align === 'end' && 'justify-end text-right',
          className,
        )}
      >
        <span>{formatCurrency(value)}</span>
        {!disabled && <Pencil className="pdv-inline-value-pencil h-2.5 w-2.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground" aria-hidden="true" />}
      </button>
    );
  }

  return (
    <form
      className={cn('grid w-full min-w-0 max-w-[18rem] gap-1.5', align === 'end' && 'justify-self-end justify-items-end', className)}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        }
      }}
    >
      <div className="flex w-full min-w-0 items-center gap-1">
        <label className="sr-only" htmlFor={inputId}>{label}</label>
        <PdvMoneyInput
          id={inputId}
          value={draft}
          onChange={setDraft}
          autoFocus
          selectOnFocus
          onEnter={apply}
          className="pdv-inline-value-input h-9 w-0 min-w-16 flex-1 rounded-sm px-2 text-base"
        />
        <button
          type="button"
          onClick={cancel}
          aria-label={`Cancelar edição de ${label}`}
          className="grid h-9 w-9 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
        <button
          type="submit"
          disabled={exceedsDiscountBase}
          aria-label={`Confirmar edição de ${label}`}
          className="grid h-9 w-9 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>

      {exceedsDiscountBase ? (
        <span className="whitespace-normal text-right text-[10px] font-normal leading-tight text-destructive">
          Para aumentar o total, ajuste o valor dos itens.
        </span>
      ) : difference !== 0 && (
        <span className="text-[10px] leading-tight text-muted-foreground">
          {difference > 0 && adjustmentPolicy === 'discount' ? 'Desconto' : difference > 0 ? 'Redução' : 'Acréscimo'} de {formatCurrency(Math.abs(difference))}
          {normalizedBase > 0 ? ` (${percentage.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%)` : ''}
        </span>
      )}

      {showModeChoice && (
        <div className="w-full min-w-0">
          <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-stretch border-b border-border text-[10px]" aria-label="Como registrar a diferença">
            <button
              type="button"
              aria-pressed={mode === 'price'}
              onClick={() => setMode('price')}
              className={cn('mb-[-1px] inline-flex min-h-9 min-w-0 items-center justify-center gap-1 border-b-2 border-transparent px-1 text-center leading-tight text-muted-foreground transition-colors hover:text-foreground', mode === 'price' && 'border-foreground font-semibold text-foreground')}
            >
              <Tag className="pdv-value-mode-icon h-3 w-3 shrink-0" /><span>Preço neste pedido</span>
            </button>
            <button
              type="button"
              aria-pressed={mode === 'discount'}
              onClick={() => setMode('discount')}
              className={cn('mb-[-1px] inline-flex min-h-9 min-w-0 items-center justify-center gap-1 border-b-2 border-transparent px-1 text-center leading-tight text-muted-foreground transition-colors hover:text-foreground', mode === 'discount' && 'border-foreground font-semibold text-foreground')}
            >
              <ReceiptText className="pdv-value-mode-icon h-3 w-3 shrink-0" /><span>Exibir desconto</span>
            </button>
            <button
              type="button"
              aria-label="Mostrar ajuda sobre como a diferença será registrada"
              aria-expanded={mobileHelpOpen}
              onClick={() => setMobileHelpOpen((open) => !open)}
              className="mb-[-1px] grid min-h-9 place-items-center border-b-2 border-transparent text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            >
              <CircleHelp className="pdv-value-mode-help h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <TooltipProvider delayDuration={250}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Entender como a diferença será registrada"
                    className="mb-[-1px] hidden min-h-9 place-items-center border-b-2 border-transparent text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid"
                  >
                    <CircleHelp className="pdv-value-mode-help h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end" className="w-72 max-w-[calc(100vw-2rem)] whitespace-normal text-xs leading-relaxed">
                  <strong className="block">Como a redução aparece</strong>
                  <span>Preço neste pedido altera somente o preço deste item neste pedido. Exibir desconto mantém o preço original do item e mostra a redução no comprovante do cliente.</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {mobileHelpOpen && (
            <div role="note" className="mt-2 whitespace-normal border-l-2 border-foreground/30 pl-2 text-left text-[11px] font-normal leading-relaxed text-muted-foreground md:hidden">
              <strong className="block text-foreground">Como a redução aparece</strong>
              Preço neste pedido altera somente o preço deste item neste pedido. Exibir desconto mantém o preço original do item e mostra a redução no comprovante do cliente.
            </div>
          )}
        </div>
      )}
    </form>
  );
}

import { Input } from '@/components/ui/input';
import { readPastedCents } from '@/lib/money-paste-mask';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { cn } from '@/lib/utils';

interface PdvMoneyInputProps {
  /** Valor na moeda da empresa (não em centavos). */
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Seleciona o valor inteiro ao focar, para digitar substituir em vez de anexar. */
  selectOnFocus?: boolean;
  /** Confirma o valor pelo teclado sem acoplar o input ao modal que o usa. */
  onEnter?: () => void;
}

/**
 * Campo de DINHEIRO do caixa. Dígito a dígito pela direita (centavos), igual ao
 * `AdjustBalanceDialog` e ao `AccountFormDialog` do Financeiro.
 *
 * Não é `NumericInput` de propósito: dinheiro tem formatação própria (separador
 * de milhar e 2 casas pelo locale da empresa), e a régua da casa exclui
 * dinheiro do NumericInput justamente por isso. Campo vazio continua vazio
 * (nunca mostra "0" travado).
 */
export function PdvMoneyInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  disabled,
  id,
  className,
  selectOnFocus = false,
  onEnter,
}: PdvMoneyInputProps) {
  const { number } = useLocaleFormatters();

  const display = value
    ? number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  return (
    <Input
      id={id}
      value={display}
      placeholder={placeholder}
      inputMode="numeric"
      autoFocus={autoFocus}
      disabled={disabled}
      className={cn('text-right text-lg font-semibold tabular-nums', className)}
      onFocus={(event) => {
        if (selectOnFocus) event.currentTarget.select();
      }}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '');
        onChange(parseInt(digits || '0', 10) / 100);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || !onEnter) return;
        event.preventDefault();
        event.stopPropagation();
        onEnter();
      }}
      // Colar "4.550" de uma planilha NÃO passa pela regra de centavos (daria
      // R$ 45,50, 100x menor). Ver `money-paste-mask.ts`.
      onPaste={(e) => {
        const cents = readPastedCents(e);
        if (cents != null) onChange(cents / 100);
      }}
    />
  );
}

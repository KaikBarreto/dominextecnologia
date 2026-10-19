import { Delete, CornerDownLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PdvNumpadProps {
  /** Dígito, `*` ou backspace/enter — tudo opera direto em cima do campo de busca. */
  onDigit: (digit: string) => void;
  onMultiplier: () => void;
  onBackspace: () => void;
  onEnter: () => void;
}

const DIGIT_ROWS: string[][] = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
];

/**
 * Teclado numérico na tela, para o tablet do balcão sem teclado físico.
 * Não é um campo próprio: cada botão empurra o caractere pro campo de busca,
 * o mesmo fluxo de quem digita no teclado físico (`3 * <código>` + Enter).
 */
export function PdvNumpad({ onDigit, onMultiplier, onBackspace, onEnter }: PdvNumpadProps) {
  return (
    <div className="grid grid-cols-3 gap-1.5 border-t border-border p-3">
      {DIGIT_ROWS.flat().map((digit) => (
        <Button
          key={digit}
          type="button"
          variant="outline"
          className="h-11 text-base font-semibold"
          onClick={() => onDigit(digit)}
        >
          {digit}
        </Button>
      ))}
      <Button type="button" variant="outline" className="h-11 text-base font-semibold" onClick={onMultiplier}>
        ×
      </Button>
      <Button type="button" variant="outline" className="h-11 text-base font-semibold" onClick={() => onDigit('0')}>
        0
      </Button>
      <Button type="button" variant="outline" className="h-11" onClick={onBackspace} aria-label="Apagar">
        <Delete className="h-4 w-4" />
      </Button>
      <Button type="button" className="col-span-3 h-11" onClick={onEnter}>
        <CornerDownLeft className="h-4 w-4" />
      </Button>
    </div>
  );
}

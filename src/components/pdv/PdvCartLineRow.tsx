import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignedImg } from '@/components/ui/SignedImg';
import { PdvQuantityStepper } from '@/components/pdv/PdvQuantityStepper';
import type { CartLine } from '@/lib/pdv/cart';
import { PdvProductName } from '@/components/pdv/PdvProductName';

interface PdvCartLineRowProps {
  line: CartLine;
  formatCurrency: (value: number) => string;
  noPhotoLabel: string;
  removeLabel: string;
  quantityEditLabel: string;
  discountLabel: string;
  discountPlaceholder: string;
  onIncrement: (inventoryId: string, delta: number) => void;
  onSetQuantity: (inventoryId: string, quantity: number) => void;
  onSetLineDiscount: (inventoryId: string, discountAmount: number) => void;
  onRemove: (inventoryId: string) => void;
  /** Enter na edição de quantidade devolve o foco pra busca (balcão é fila). */
  onConfirmQuantityEdit?: () => void;
}

/**
 * Linha do carrinho: foto pequena, nome, quantidade (editável — ver
 * `PdvQuantityStepper`), preço unitário, total da linha, remover. Remover é
 * `destructive-ghost` (régua: excluir = vermelho).
 */
export function PdvCartLineRow({
  line,
  formatCurrency,
  noPhotoLabel,
  removeLabel,
  quantityEditLabel,
  discountLabel,
  discountPlaceholder,
  onIncrement,
  onSetQuantity,
  onSetLineDiscount,
  onRemove,
  onConfirmQuantityEdit,
}: PdvCartLineRowProps) {
  const lineGross = line.quantity * line.unitPrice;
  const lineDiscount = Math.min(Math.max(line.discountAmount ?? 0, 0), lineGross);
  const lineTotal = lineGross - lineDiscount;

  return (
    <div className="flex items-center gap-2 py-2.5">
      <SignedImg
        src={line.imageUrl}
        alt={line.name}
        fallbackLabel={noPhotoLabel}
        className="h-10 w-10 shrink-0 rounded-md object-cover"
      />
      <div className="min-w-0 flex-1">
        {/* `PdvProductName` MEDE a largura real antes de cortar e só corta
            quando o nome não cabe em 2 linhas (mesma correção aplicada à
            tabela do desktop em 2026-10-19 a pedido do CEO). Era
            `truncateMiddle(line.name, 4, 4)`: orçamento FIXO de 8 caracteres,
            que cortava praticamente todo nome de peça já na segunda palavra.
            Sem `min-h`: nome curto fica em 1 linha, só o longo cresce e deixa
            a linha mais alta. */}
        <PdvProductName
          name={line.name}
          className="min-w-0 text-sm font-medium text-foreground"
        />
        <p className="text-xs text-muted-foreground">{formatCurrency(line.unitPrice)}</p>
        <label className="mt-1 flex max-w-40 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="shrink-0">{discountLabel}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={lineGross}
            step="0.01"
            value={lineDiscount || ''}
            placeholder={discountPlaceholder}
            onChange={(event) => onSetLineDiscount(line.inventoryId, Number(event.target.value))}
            className="h-6 min-w-0 flex-1 border-0 border-b border-input bg-transparent px-1 text-right text-xs tabular-nums outline-none focus:border-primary focus:ring-0"
          />
        </label>
      </div>
      <PdvQuantityStepper
        size="sm"
        className="shrink-0"
        quantity={line.quantity}
        availableQuantity={line.availableQuantity}
        onIncrement={(delta) => onIncrement(line.inventoryId, delta)}
        onSetQuantity={(quantity) => onSetQuantity(line.inventoryId, quantity)}
        onConfirmEdit={onConfirmQuantityEdit}
        decrementAriaLabel="-"
        incrementAriaLabel="+"
        editAriaLabel={quantityEditLabel}
      />
      <span className="w-20 shrink-0 text-right text-sm font-bold tabular-nums">
        {lineDiscount > 0 && (
          <span className="block text-[10px] font-normal text-muted-foreground line-through">
            {formatCurrency(lineGross)}
          </span>
        )}
        {formatCurrency(lineTotal)}
      </span>
      <Button
        type="button"
        variant="destructive-ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => onRemove(line.inventoryId)}
        aria-label={removeLabel}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

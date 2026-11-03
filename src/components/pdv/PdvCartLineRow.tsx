import { Trash2 } from 'lucide-react';
import { PdvQuantityStepper } from '@/components/pdv/PdvQuantityStepper';
import { PdvInlineDiscountEditor, type PdvInlineDiscountEditorTexts } from '@/components/pdv/PdvInlineDiscountEditor';
import type { CartLine } from '@/lib/pdv/cart';
import type { LocaleCode } from '@/lib/i18n/locales';
import { PdvProductName } from '@/components/pdv/PdvProductName';
import { PdvProductImagePreview } from '@/components/pdv/PdvProductImagePreview';
import { inventoryQuantityStep } from '@/lib/inventoryUnits';

interface PdvCartLineRowProps {
  line: CartLine;
  formatCurrency: (value: number) => string;
  noPhotoLabel: string;
  openPhotoLabel: string;
  photoViewerDescription: string;
  removeLabel: string;
  quantityEditLabel: string;
  discountLabel: string;
  discountEditorTexts: PdvInlineDiscountEditorTexts;
  currencySymbol: string;
  locale: LocaleCode;
  currencyFractionDigits: number;
  onIncrement: (inventoryId: string, delta: number) => void;
  onSetQuantity: (inventoryId: string, quantity: number) => void;
  onSetLineDiscount: (inventoryId: string, discountAmount: number) => void;
  onDiscountEditingChange?: (editing: boolean) => void;
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
  openPhotoLabel,
  photoViewerDescription,
  removeLabel,
  quantityEditLabel,
  discountLabel,
  discountEditorTexts,
  currencySymbol,
  locale,
  currencyFractionDigits,
  onIncrement,
  onSetQuantity,
  onSetLineDiscount,
  onDiscountEditingChange,
  onRemove,
  onConfirmQuantityEdit,
}: PdvCartLineRowProps) {
  const lineGross = line.quantity * line.unitPrice;
  const lineDiscount = Math.min(Math.max(line.discountAmount ?? 0, 0), lineGross);
  const lineTotal = lineGross - lineDiscount;

  return (
    <div className="relative flex min-h-[4.25rem] items-center gap-2.5 py-1.5 pr-16">
      <PdvProductImagePreview
        imageUrl={line.imageUrl}
        name={line.name}
        fallbackLabel={noPhotoLabel}
        openLabel={openPhotoLabel}
        viewerDescription={photoViewerDescription}
        className="h-11 w-11 shrink-0 rounded-md bg-muted/50 object-cover"
      />
      <div className="min-w-0 flex-1">
        {/* `PdvProductName` MEDE a largura real antes de cortar e só corta
            quando o nome não cabe em 2 linhas (mesma correção aplicada à
            tabela do desktop em 2026-10-19 a pedido do CEO). Era
            `truncateMiddle(line.name, 4, 4)`: orçamento FIXO de 8 caracteres,
            que cortava praticamente todo nome de peça já na segunda palavra.
            Sem `min-h`: nome curto fica em 1 linha, só o longo cresce e deixa
            a linha mais alta. */}
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <PdvProductName
              name={line.name}
              className="min-w-0 text-sm font-semibold leading-snug text-foreground"
            />
          </div>
          <span className="flex shrink-0 flex-col items-end text-sm font-bold leading-tight tabular-nums">
            {lineDiscount > 0 && (
              <span className="text-[10px] font-normal leading-none text-muted-foreground line-through">
                {formatCurrency(lineGross)}
              </span>
            )}
            {formatCurrency(lineTotal)}
          </span>
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatCurrency(line.unitPrice)}/{line.unit?.trim() || 'un'}
          </span>
          <span className="h-3 w-px shrink-0 bg-border" aria-hidden="true" />
          <div className="flex min-w-0 items-center gap-1">
            <PdvQuantityStepper
              size="sm"
              className="shrink-0"
              quantity={line.quantity}
              availableQuantity={line.availableQuantity}
              step={inventoryQuantityStep(line.unit)}
              onIncrement={(delta) => onIncrement(line.inventoryId, delta)}
              onSetQuantity={(quantity) => onSetQuantity(line.inventoryId, quantity)}
              onConfirmEdit={onConfirmQuantityEdit}
              decrementAriaLabel="-"
              incrementAriaLabel="+"
              editAriaLabel={quantityEditLabel}
            />
            <span className="text-xs font-medium text-muted-foreground">{line.unit?.trim() || 'un'}</span>
          </div>
        </div>
      </div>
      <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        <PdvInlineDiscountEditor
          variant="line"
          iconOnly
          label={discountLabel}
          baseAmount={lineGross}
          discountAmount={lineDiscount}
          formatCurrency={formatCurrency}
          currencySymbol={currencySymbol}
          locale={locale}
          currencyFractionDigits={currencyFractionDigits}
          texts={discountEditorTexts}
          onApply={(amount) => onSetLineDiscount(line.inventoryId, amount)}
          onEditingChange={onDiscountEditingChange}
        />
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onRemove(line.inventoryId)}
          aria-label={removeLabel}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

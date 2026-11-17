import { NumericInput } from "@/components/ui/numeric-input";
import { Trash2 } from "lucide-react";
import { PdvQuantityStepper } from "@/components/pdv/PdvQuantityStepper";
import {
  PdvInlineDiscountEditor,
  type PdvInlineDiscountEditorTexts,
} from "@/components/pdv/PdvInlineDiscountEditor";
import type { CartLine } from "@/lib/pdv/cart";
import type { LocaleCode } from "@/lib/i18n/locales";
import { PdvProductName } from "@/components/pdv/PdvProductName";
import { PdvProductImagePreview } from "@/components/pdv/PdvProductImagePreview";
import { PdvInlineValueEditor, type PdvValueAdjustmentMode } from '@/components/pdv/PdvInlineValueEditor';
import { inventoryQuantityStep } from "@/lib/inventoryUnits";
import { useState, type ReactNode } from 'react';
import { Percent } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  onSetLineFinalAmount: (inventoryId: string, finalAmount: number, mode: PdvValueAdjustmentMode) => void;
  modePreferenceKey?: string;
  onDiscountEditingChange?: (editing: boolean) => void;
  onRemove: (inventoryId: string) => void;
  /** Enter na edição de quantidade devolve o foco pra busca (balcão é fila). */
  onConfirmQuantityEdit?: () => void;
  /** Mantém a mesma linha visual, mas sem controles em estados concluídos/cancelados. */
  readOnly?: boolean;
  quantityReadOnly?: boolean;
  onSetUnitPrice?: (id: string, value: string) => void;
  unitPriceValue?: string;
  onEditDescription?: (id: string) => void;
  density?: 'default' | 'preview';
  weighControl?: ReactNode;
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
  onSetLineFinalAmount,
  modePreferenceKey,
  onDiscountEditingChange,
  onRemove,
  onConfirmQuantityEdit,
  readOnly = false,
  quantityReadOnly = false, onSetUnitPrice, unitPriceValue, onEditDescription,
  density = 'default',
  weighControl,
}: PdvCartLineRowProps) {
  const [discountOpen, setDiscountOpen] = useState(false);
  const [valueEditing, setValueEditing] = useState(false);
  const lineGross = line.quantity * line.unitPrice;
  const lineDiscount = Math.min(
    Math.max(line.discountAmount ?? 0, 0),
    lineGross,
  );
  const lineTotal = lineGross - lineDiscount;

  if (density === 'preview') return <div className="cartitem" data-cart-item={line.inventoryId}>
    <div className={cn('row between', valueEditing && 'flex-wrap')} style={{ alignItems: 'flex-start' }}><span className="cartthumbnail"><PdvProductImagePreview iconOnlyFallback imageUrl={line.imageUrl} name={line.name} fallbackLabel={noPhotoLabel} openLabel={openPhotoLabel} viewerDescription={photoViewerDescription} className="h-8 w-8 shrink-0 object-contain" /></span><div className="grow"><strong>{onEditDescription ? <button type="button" className="text-left" onClick={() => onEditDescription(line.inventoryId)}>{line.name}</button> : line.name}</strong><small>{onSetUnitPrice && !readOnly ? <NumericInput aria-label="Preço unitário" decimal maxDecimals={2} value={unitPriceValue ?? String(line.unitPrice)} onValueChange={value => onSetUnitPrice(line.inventoryId, value)} placeholder="Pendente" className="h-7 w-28 text-xs" /> : unitPriceValue === "" ? "Preço pendente" : formatCurrency(line.unitPrice)} / {line.unit || 'un'}</small></div><div className={cn(valueEditing ? 'w-full min-w-0 pt-2' : 'shrink-0 text-right')}>{lineDiscount > 0 && <small className="oldprice">{formatCurrency(lineGross)}</small>}<PdvInlineValueEditor label={`valor de ${line.name}`} value={lineTotal} baseAmount={lineGross} formatCurrency={formatCurrency} disabled={readOnly} onApply={(amount, mode) => onSetLineFinalAmount(line.inventoryId, amount, mode)} onEditingChange={setValueEditing} modePreferenceKey={modePreferenceKey} className="cartitemtotal amount font-bold" /></div></div>
    <div className="row between itemcontrols">{readOnly || quantityReadOnly ? <span>{line.quantity} {line.unit}</span> : <PdvQuantityStepper size="sm" className="qty" quantity={line.quantity} availableQuantity={line.availableQuantity} step={inventoryQuantityStep(line.unit)} onIncrement={delta => onIncrement(line.inventoryId, delta)} onSetQuantity={quantity => onSetQuantity(line.inventoryId, quantity)} onConfirmEdit={onConfirmQuantityEdit} decrementAriaLabel={'Diminuir ' + line.name} incrementAriaLabel={'Aumentar ' + line.name} editAriaLabel={quantityEditLabel} />}{!readOnly && <div className="row" style={{ gap: 2 }}>{!quantityReadOnly && weighControl}<button type="button" className={'itemdiscount ' + (lineDiscount > 0 ? 'hasdiscount' : '')} aria-label={'Desconto em ' + line.name} aria-expanded={discountOpen} onClick={() => { setDiscountOpen(current => !current); onDiscountEditingChange?.(!discountOpen); }}><Percent />{lineDiscount > 0 ? formatCurrency(lineDiscount) : 'Desconto'}</button>{!quantityReadOnly && <button type="button" className="iconbtn negative removeitem" onClick={() => onRemove(line.inventoryId)} aria-label={removeLabel}><Trash2 /></button>}</div>}</div>
    {!readOnly && <PdvInlineDiscountEditor variant="line" presentation="preview" hideTrigger open={discountOpen} label={discountLabel} baseAmount={lineGross} discountAmount={lineDiscount} formatCurrency={formatCurrency} currencySymbol={currencySymbol} locale={locale} currencyFractionDigits={currencyFractionDigits} texts={discountEditorTexts} onApply={amount => onSetLineDiscount(line.inventoryId, amount)} onEditingChange={editing => { setDiscountOpen(editing); onDiscountEditingChange?.(editing); }} />}
  </div>;

  return (
    <div className="relative flex min-h-[4.25rem] items-center gap-2.5 py-1.5 pr-16">
      <PdvProductImagePreview
        iconOnlyFallback
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
        <div className={cn('flex min-w-0 items-start justify-between gap-2', valueEditing && 'flex-wrap')}>
          <div className="min-w-0">
            <PdvProductName
              name={line.name}
              className="min-w-0 text-sm font-semibold leading-snug text-foreground"
            />
          </div>
          <div className={cn('flex flex-col items-end text-sm font-bold leading-tight tabular-nums', valueEditing ? 'w-full min-w-0 pt-1' : 'shrink-0')}>
            {lineDiscount > 0 && (
              <span className="text-[10px] font-normal leading-none text-muted-foreground line-through">
                {formatCurrency(lineGross)}
              </span>
            )}
            <PdvInlineValueEditor label={`valor de ${line.name}`} value={lineTotal} baseAmount={lineGross} formatCurrency={formatCurrency} disabled={readOnly} onApply={(amount, mode) => onSetLineFinalAmount(line.inventoryId, amount, mode)} onEditingChange={setValueEditing} modePreferenceKey={modePreferenceKey} />
          </div>
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatCurrency(line.unitPrice)}/{line.unit?.trim() || "un"}
          </span>
          <span className="h-3 w-px shrink-0 bg-border" aria-hidden="true" />
          <div className="flex min-w-0 items-center gap-1">
            {readOnly ? (
              <span className="text-xs font-semibold tabular-nums">
                {line.quantity}
              </span>
            ) : (
              <PdvQuantityStepper
                size="sm"
                className="shrink-0"
                quantity={line.quantity}
                availableQuantity={line.availableQuantity}
                step={inventoryQuantityStep(line.unit)}
                onIncrement={(delta) => onIncrement(line.inventoryId, delta)}
                onSetQuantity={(quantity) =>
                  onSetQuantity(line.inventoryId, quantity)
                }
                onConfirmEdit={onConfirmQuantityEdit}
                decrementAriaLabel="-"
                incrementAriaLabel="+"
                editAriaLabel={quantityEditLabel}
              />
            )}
            <span className="text-xs font-medium text-muted-foreground">
              {line.unit?.trim() || "un"}
            </span>
          </div>
        </div>
      </div>
      {!readOnly && (
        <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {weighControl}
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
      )}
    </div>
  );
}

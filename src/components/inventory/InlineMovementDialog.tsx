import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NumericInput } from '@/components/ui/numeric-input';
import { Badge } from '@/components/ui/badge';
import { useInventory, type InventoryItem } from '@/hooks/useInventory';
import { useStocks } from '@/hooks/useStocks';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useToast } from '@/hooks/use-toast';

export type InlineMovementType = 'entrada' | 'saida';

interface InlineMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
  movementType: InlineMovementType;
  /** ID do local de estoque ativo. */
  activeStockId: string | null;
}

export function InlineMovementDialog({
  open,
  onOpenChange,
  item,
  movementType,
  activeStockId,
}: InlineMovementDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.inlineMovement;
  const { registerInlineMovement, getQuantityForStock } = useInventory();
  const { stocks } = useStocks();
  const { toast } = useToast();

  const [quantityStr, setQuantityStr] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setQuantityStr('');
      setNotes('');
    }
  }, [open]);

  if (!item) return null;

  const activeStock = stocks.find((s) => s.id === activeStockId);
  const currentQty = activeStockId ? getQuantityForStock(item.id, activeStockId) : (item.quantity ?? 0);
  const quantity = parseFloat(quantityStr.replace(',', '.')) || 0;

  const isEntrada = movementType === 'entrada';
  const resultQty = isEntrada ? currentQty + quantity : currentQty - quantity;

  const handleConfirm = async () => {
    if (!activeStockId) {
      toast({ variant: 'destructive', title: t.errors.noStock });
      return;
    }
    if (quantity <= 0) {
      toast({ variant: 'destructive', title: t.errors.invalidQty });
      return;
    }
    if (!isEntrada && quantity > currentQty) {
      toast({ variant: 'destructive', title: t.errors.insufficientBalance.replace('{qty}', String(currentQty)) });
      return;
    }

    await registerInlineMovement.mutateAsync({
      inventoryId: item.id,
      stockId: activeStockId,
      movementType,
      quantity,
      notes: notes.trim() || undefined,
    });

    toast({
      title: isEntrada ? t.successEntrada : t.successSaida,
    });
    onOpenChange(false);
  };

  const title = isEntrada ? t.titleEntrada : t.titleSaida;
  const Icon = isEntrada ? TrendingUp : TrendingDown;
  const iconColorClass = isEntrada ? 'text-success' : 'text-destructive';

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
            disabled={registerInlineMovement.isPending}
          >
            {t.cancel}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={registerInlineMovement.isPending || quantity <= 0}
            className="flex-1"
          >
            {registerInlineMovement.isPending ? t.saving : t.confirm}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Cabeçalho: material + local */}
        <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
          <div className={`mt-0.5 shrink-0 ${iconColorClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{item.name}</p>
            {item.sku && (
              <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {activeStock && (
                <Badge variant="secondary" className="text-xs">
                  {activeStock.name}
                  {activeStock.is_default && (
                    <span className="ml-1 opacity-60">{t.defaultBadge}</span>
                  )}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {t.currentQty}: <strong>{currentQty} {item.unit || 'un'}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Quantidade */}
        <div className="space-y-2">
          <Label>{t.quantityLabel}</Label>
          <NumericInput
            decimal
            value={quantityStr}
            onValueChange={setQuantityStr}
            placeholder={t.quantityPlaceholder}
            autoFocus
          />
        </div>

        {/* Resultado projetado */}
        {quantity > 0 && (
          <div className="rounded-lg border px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t.resultLabel}: </span>
            <strong className={resultQty < 0 ? 'text-destructive' : ''}>
              {resultQty} {item.unit || 'un'}
            </strong>
            {resultQty < 0 && (
              <span className="ml-2 text-xs text-destructive">{t.negativeWarning}</span>
            )}
          </div>
        )}

        {/* Observação */}
        <div className="space-y-2">
          <Label>{t.notesLabel}</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={isEntrada ? t.notesPlaceholderEntrada : t.notesPlaceholderSaida}
            rows={2}
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}

import { useState, useEffect } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NumericInput } from '@/components/ui/numeric-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStocks } from '@/hooks/useStocks';
import { useInventory, type InventoryItem } from '@/hooks/useInventory';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface StockTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryItem | null;
  activeStockId: string | null;
}

export function StockTransferDialog({
  open,
  onOpenChange,
  item,
  activeStockId,
}: StockTransferDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.transferDialog;
  const { stocks, defaultStock, transferStock } = useStocks();
  const { getQuantityForStock } = useInventory();
  const { toast } = useToast();

  const [fromStockId, setFromStockId] = useState<string>('');
  const [toStockId, setToStockId] = useState<string>('');
  const [quantityStr, setQuantityStr] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setFromStockId(activeStockId ?? defaultStock?.id ?? '');
    setToStockId('');
    setQuantityStr('');
    setNotes('');
  }, [open, activeStockId, defaultStock]);

  const availableQty = item && fromStockId
    ? getQuantityForStock(item.id, fromStockId)
    : 0;

  const quantity = parseFloat(quantityStr.replace(',', '.')) || 0;

  const validate = (): string | null => {
    if (!fromStockId) return t.errors.selectFrom;
    if (!toStockId) return t.errors.selectTo;
    if (fromStockId === toStockId) return t.errors.sameStock;
    if (quantity <= 0) return t.errors.invalidQty;
    if (quantity > availableQty) return t.errors.insufficientBalance;
    return null;
  };

  const handleConfirm = async () => {
    if (!item) return;
    const err = validate();
    if (err) {
      toast({ variant: 'destructive', title: t.errors.title, description: err });
      return;
    }
    await transferStock.mutateAsync({
      inventoryId: item.id,
      fromStockId,
      toStockId,
      quantity,
      notes: notes.trim() || undefined,
      clientRequestId: crypto.randomUUID(),
    });
    onOpenChange(false);
  };

  const toStockOptions = stocks.filter((s) => s.id !== fromStockId);
  const fromStockOptions = stocks.filter((s) => s.id !== toStockId);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      description={item ? `${item.name}${item.sku ? ` · ${item.sku}` : ''}` : undefined}
      footer={
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            {t.cancel}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={transferStock.isPending}
            className="flex-1 gap-2"
          >
            <ArrowRightLeft className="h-4 w-4" />
            {transferStock.isPending ? t.transferring : t.confirm}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Depósito origem */}
        <div className="space-y-2">
          <Label>{t.fromStock}</Label>
          <Select value={fromStockId} onValueChange={setFromStockId}>
            <SelectTrigger>
              <SelectValue placeholder={t.selectStockPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {fromStockOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.is_default ? ` (${t.defaultBadge})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fromStockId && item && (
            <p className="text-xs text-muted-foreground">
              {t.available}: {availableQty} {item.unit || 'un'}
            </p>
          )}
        </div>

        {/* Depósito destino */}
        <div className="space-y-2">
          <Label>{t.toStock}</Label>
          <Select value={toStockId} onValueChange={setToStockId}>
            <SelectTrigger>
              <SelectValue placeholder={t.selectStockPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {toStockOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.is_default ? ` (${t.defaultBadge})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Quantidade */}
        <div className="space-y-2">
          <Label>{t.quantity}</Label>
          <NumericInput
            decimal
            value={quantityStr}
            onValueChange={setQuantityStr}
            placeholder="0"
          />
        </div>

        {/* Observações */}
        <div className="space-y-2">
          <Label>{t.notes}</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.notesPlaceholder}
            rows={2}
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}

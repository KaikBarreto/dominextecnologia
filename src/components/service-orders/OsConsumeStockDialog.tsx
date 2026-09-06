import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NumericInput } from '@/components/ui/numeric-input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InventoryMaterialSelect, formatQty } from '@/components/inventory/InventoryMaterialSelect';
import { useInventory } from '@/hooks/useInventory';
import { useStocks } from '@/hooks/useStocks';
import { LAST_STOCK_KEY, useOsMaterials, type OsMaterialLine } from '@/hooks/useOsMaterials';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface OsConsumeStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrderId: string;
}

/**
 * Dialog de RASCUNHO do consumo de material dentro da OS (v1.22.0). O técnico
 * anota o que usou; nada aqui mexe no estoque de verdade — isso só acontece na
 * confirmação do resumo de finalização (OsConsumptionSummaryDialog).
 */
export function OsConsumeStockDialog({ open, onOpenChange, serviceOrderId }: OsConsumeStockDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.stockConsumption;
  const { toast } = useToast();
  const { stocks, defaultStock } = useStocks();
  const { items, getQuantityForStock } = useInventory();
  const {
    lines,
    addMaterial,
    updateMaterial,
    removeMaterial,
    flushPending,
  } = useOsMaterials(serviceOrderId);

  const [stockId, setStockId] = useState('');
  const [inventoryId, setInventoryId] = useState('');
  const [quantityStr, setQuantityStr] = useState('');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Reseta o rascunho de lançamento toda vez que o dialog abre (nunca no
  // handler de onOpenChange — Radix não sincroniza abertura programática).
  useEffect(() => {
    if (!open) return;
    setInventoryId('');
    setQuantityStr('');
    setNotes('');
    setEditingId(null);
    void flushPending().then(({ flushed }) => {
      if (flushed.length > 0) {
        toast({ title: t.toastSynced.replace('{n}', String(flushed.length)) });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Pré-seleciona o local: único local da empresa OU o último usado (persistido
  // no aparelho) OU o local principal. O técnico só escolhe quando há mais de 1.
  useEffect(() => {
    if (!open || stocks.length === 0) return;
    if (stocks.length === 1) {
      setStockId(stocks[0].id);
      return;
    }
    let lastUsed: string | null = null;
    try {
      lastUsed = localStorage.getItem(LAST_STOCK_KEY);
    } catch {
      lastUsed = null;
    }
    if (lastUsed && stocks.some((s) => s.id === lastUsed)) {
      setStockId(lastUsed);
    } else if (defaultStock) {
      setStockId(defaultStock.id);
    }
  }, [open, stocks, defaultStock]);

  const handleStockChange = (id: string) => {
    setStockId(id);
    setInventoryId('');
    try {
      localStorage.setItem(LAST_STOCK_KEY, id);
    } catch {
      /* aparelho sem localStorage: só não pré-seleciona da próxima vez */
    }
  };

  const selectedMaterial = useMemo(
    () => items.find((i) => i.id === inventoryId) ?? null,
    [items, inventoryId],
  );
  const unit = selectedMaterial?.unit || t.sectionUnit;
  const quantity = parseFloat(quantityStr.replace(',', '.')) || 0;
  const balance = stockId && inventoryId ? getQuantityForStock(inventoryId, stockId) : null;
  const overBalance = balance != null && quantity > 0 && quantity > balance;

  const resetForm = () => {
    setInventoryId('');
    setQuantityStr('');
    setNotes('');
    setEditingId(null);
  };

  const handleEdit = (line: OsMaterialLine) => {
    setEditingId(line.id);
    setStockId(line.stock_id);
    setInventoryId(line.inventory_id);
    setQuantityStr(String(line.quantity).replace('.', ','));
    setNotes(line.notes ?? '');
  };

  const handleSubmit = async () => {
    if (!stockId) {
      toast({ variant: 'destructive', title: t.errNoStock });
      return;
    }
    if (!inventoryId) {
      toast({ variant: 'destructive', title: t.errNoMaterial });
      return;
    }
    if (quantity <= 0) {
      toast({ variant: 'destructive', title: t.errNoQuantity });
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateMaterial({
          id: editingId,
          quantity,
          notes,
          inventoryId,
          stockId,
        });
        toast({ title: t.toastUpdated });
      } else {
        const result = await addMaterial({ inventoryId, stockId, quantity, notes });
        toast({ title: result.queued ? t.toastQueued : t.toastAdded });
      }
      resetForm();
    } catch (err) {
      toast({ variant: 'destructive', title: t.errSave, description: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await removeMaterial(id);
      toast({ title: t.toastRemoved });
      if (editingId === id) resetForm();
    } catch (err) {
      toast({ variant: 'destructive', title: t.errRemove, description: getErrorMessage(err) });
    } finally {
      setRemovingId(null);
    }
  };

  const materialName = (line: OsMaterialLine) =>
    line.material?.name ?? items.find((i) => i.id === line.inventory_id)?.name ?? '—';
  const materialUnit = (line: OsMaterialLine) =>
    line.material?.unit || items.find((i) => i.id === line.inventory_id)?.unit || t.sectionUnit;
  const stockName = (line: OsMaterialLine) =>
    line.stock?.name ?? stocks.find((s) => s.id === line.stock_id)?.name ?? '—';

  const busy = saving || removingId !== null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.dialogTitle}
      description={t.dialogSubtitle}
      footer={
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => (editingId ? resetForm() : onOpenChange(false))}
            className="flex-1"
            disabled={saving}
          >
            {editingId ? t.btnCancelEdit : t.btnClose}
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="flex-1 gap-2">
            {!saving && <Plus className="h-4 w-4" />}
            {saving ? t.btnSaving : editingId ? t.btnSaveEdit : t.btnAdd}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Local de estoque — só é escolha do técnico quando há mais de 1 */}
        {stocks.length > 1 && (
          <div className="space-y-2">
            <Label>{t.fieldStock}</Label>
            <Select value={stockId} onValueChange={handleStockChange} disabled={busy}>
              <SelectTrigger>
                <SelectValue placeholder={t.fieldStock} />
              </SelectTrigger>
              <SelectContent>
                {stocks.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!stockId ? (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-sm font-medium">{t.selectNoStockTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t.selectNoStockHint}</p>
          </div>
        ) : (
          <>
            {/* Material */}
            <div className="space-y-2">
              <Label>{t.fieldMaterial}</Label>
              <InventoryMaterialSelect
                stockId={stockId}
                value={inventoryId || undefined}
                onValueChange={setInventoryId}
                disabled={busy}
              />
              {inventoryId && balance != null && (
                <p className="text-xs text-muted-foreground">
                  {balance > 0
                    ? t.availableHere.replace('{qty}', formatQty(balance)).replace('{unit}', unit)
                    : t.noStockHere}
                </p>
              )}
            </div>

            {/* Quantidade */}
            <div className="space-y-2">
              <Label>{t.fieldQuantity}</Label>
              <NumericInput
                decimal
                value={quantityStr}
                onValueChange={setQuantityStr}
                placeholder={t.quantityPlaceholder}
                disabled={busy}
              />
              {overBalance && (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-foreground">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
                  <p className="leading-relaxed">{t.overBalanceWarning}</p>
                </div>
              )}
            </div>

            {/* Observação */}
            <div className="space-y-2">
              <Label>{t.fieldNotes}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.notesPlaceholder}
                rows={2}
                disabled={busy}
              />
            </div>
          </>
        )}

        {/* Lista do que já foi registrado nesta OS */}
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-semibold text-foreground">{t.listTitle}</p>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.listEmpty}</p>
          ) : (
            <div className="space-y-2">
              {lines.map((line) => {
                const isCommitted = line.committed_quantity > 0;
                return (
                  <div
                    key={line.id}
                    className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-medium">{materialName(line)}</p>
                        {line.pending && (
                          <Badge variant="warning" className="text-[10px]">
                            {t.pendingBadge}
                          </Badge>
                        )}
                        {isCommitted && (
                          <Badge variant="success" className="text-[10px]">
                            {t.committedBadge}
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatQty(line.quantity)} {materialUnit(line)} · {stockName(line)}
                      </p>
                      {line.notes && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{line.notes}</p>
                      )}
                    </div>
                    {!isCommitted && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="edit-ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(line)}
                          disabled={busy}
                          aria-label={t.btnEditLine}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive-ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleRemove(line.id)}
                          disabled={busy}
                          aria-label={t.removeAria.replace('{material}', materialName(line))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}

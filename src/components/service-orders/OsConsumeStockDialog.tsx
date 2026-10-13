import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NumericInput } from '@/components/ui/numeric-input';
import { Badge } from '@/components/ui/badge';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InventoryMaterialSelect, formatQty } from '@/components/inventory/InventoryMaterialSelect';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useInventory } from '@/hooks/useInventory';
import { useCustomerStock } from '@/hooks/useCustomerStock';
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
  customerId?: string | null;
}

interface ResolveInitialStockInput {
  currentStockId: string;
  selectableStockIds: string[];
  activeCustomerStockId?: string | null;
  defaultStockId?: string | null;
  lastUsedStockId?: string | null;
}

/**
 * Decide a seleção inicial sem jamais trocar uma escolha que continua válida.
 * Exportada para cobrir a corrida entre as consultas com teste unitário.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function resolveInitialStockId({
  currentStockId,
  selectableStockIds,
  activeCustomerStockId,
  defaultStockId,
  lastUsedStockId,
}: ResolveInitialStockInput): string {
  if (selectableStockIds.includes(currentStockId)) return currentStockId;
  if (activeCustomerStockId && selectableStockIds.includes(activeCustomerStockId)) {
    return activeCustomerStockId;
  }
  if (selectableStockIds.length === 1) return selectableStockIds[0];
  if (lastUsedStockId && selectableStockIds.includes(lastUsedStockId)) return lastUsedStockId;
  if (defaultStockId && selectableStockIds.includes(defaultStockId)) return defaultStockId;
  return '';
}

/**
 * Dialog de RASCUNHO do consumo de material dentro da OS (v1.22.0). O técnico
 * anota o que usou; nada aqui mexe no estoque de verdade — isso só acontece na
 * confirmação do resumo de finalização (OsConsumptionSummaryDialog).
 */
export function OsConsumeStockDialog({ open, onOpenChange, serviceOrderId, customerId }: OsConsumeStockDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.stockConsumption;
  const { toast } = useToast();
  const { stocks, defaultStock, customerStock } = useStocks(customerId);
  const { items: generalItems, getQuantityForStock: getGeneralQuantityForStock } = useInventory();
  const {
    items: customerItems,
    getQuantityForStock: getCustomerQuantityForStock,
    isLoading: isCustomerStockLoading,
    isError: isCustomerStockError,
    refetch: refetchCustomerStock,
  } = useCustomerStock(customerId);
  // Um local que ficou vazio após arquivar todos os materiais não deve alterar
  // o fluxo da OS. Enquanto o catálogo carrega, porém, o vínculo já conhecido
  // fica elegível para não pré-selecionar o geral e trocá-lo logo em seguida.
  const customerStockUnavailable = !!customerId && isCustomerStockError;
  const activeCustomerStock = !customerStockUnavailable && customerStock && (isCustomerStockLoading || customerItems.length > 0)
    ? customerStock
    : null;
  const selectableStocks = useMemo(
    () => customerStockUnavailable
      ? []
      : activeCustomerStock
      ? stocks
      : stocks.filter((stock) => stock.customer_id == null),
    [stocks, activeCustomerStock, customerStockUnavailable],
  );
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

  const handleStockChange = useCallback((id: string) => {
    setStockId(id);
    // Material e local formam um par validado pelo banco. Toda troca de local,
    // inclusive a inicialização tardia após o carregamento, precisa limpar o
    // material para nunca manter um item de outro catálogo.
    setInventoryId('');
    try {
      if (id) localStorage.setItem(LAST_STOCK_KEY, id);
      else localStorage.removeItem(LAST_STOCK_KEY);
    } catch {
      /* aparelho sem localStorage: só não pré-seleciona da próxima vez */
    }
  }, []);

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

  // Quando existe estoque alocado ao cliente desta OS, ele tem prioridade. Sem
  // estoque do cliente, preserva exatamente a regra anterior: único local OU o
  // último usado (persistido no aparelho) OU o local principal.
  useEffect(() => {
    if (!open) return;
    if (selectableStocks.length === 0) {
      if (stockId) handleStockChange('');
      return;
    }
    // Dados de estoques e do catálogo do cliente chegam em tempos diferentes.
    // Depois que o usuário (ou uma inicialização anterior) escolheu um local
    // ainda válido, nunca o sobrescrevemos quando outra consulta termina.
    let lastUsed: string | null = null;
    try {
      lastUsed = localStorage.getItem(LAST_STOCK_KEY);
    } catch {
      lastUsed = null;
    }
    const nextStockId = resolveInitialStockId({
      currentStockId: stockId,
      selectableStockIds: selectableStocks.map((stock) => stock.id),
      activeCustomerStockId: activeCustomerStock?.id,
      defaultStockId: defaultStock?.id,
      lastUsedStockId: lastUsed,
    });
    if (nextStockId !== stockId) handleStockChange(nextStockId);
  }, [
    open,
    selectableStocks,
    defaultStock,
    activeCustomerStock,
    stockId,
    handleStockChange,
  ]);

  const isCustomerStockSelected = !!activeCustomerStock && stockId === activeCustomerStock.id;
  const activeItems = isCustomerStockSelected ? customerItems : generalItems;
  const selectedMaterial = useMemo(
    () => activeItems.find((i) => i.id === inventoryId) ?? null,
    [activeItems, inventoryId],
  );
  const unit = selectedMaterial?.unit || t.sectionUnit;
  const quantity = parseFloat(quantityStr.replace(',', '.')) || 0;
  const balance = stockId && inventoryId
    ? (isCustomerStockSelected
      ? getCustomerQuantityForStock(inventoryId, stockId)
      : getGeneralQuantityForStock(inventoryId, stockId))
    : null;
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
    line.material?.name
      ?? customerItems.find((i) => i.id === line.inventory_id)?.name
      ?? generalItems.find((i) => i.id === line.inventory_id)?.name
      ?? '—';
  const materialUnit = (line: OsMaterialLine) =>
    line.material?.unit
      || customerItems.find((i) => i.id === line.inventory_id)?.unit
      || generalItems.find((i) => i.id === line.inventory_id)?.unit
      || t.sectionUnit;
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
            className="min-h-11 flex-1"
            disabled={saving}
          >
            {editingId ? t.btnCancelEdit : t.btnClose}
          </Button>
          <Button onClick={handleSubmit} disabled={saving || customerStockUnavailable} className="min-h-11 flex-1 gap-2">
            {!saving && <Plus className="h-4 w-4" />}
            {saving ? t.btnSaving : editingId ? t.btnSaveEdit : t.btnAdd}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {customerStockUnavailable && (
          <NoticeBanner variant="destructive" title="Não foi possível consultar o estoque deste cliente">
            <div className="space-y-3">
              <p>Para evitar consumir do local errado, tente carregar os saldos novamente.</p>
              <Button type="button" variant="outline" className="min-h-11 bg-background text-foreground hover:bg-muted hover:text-foreground" onClick={() => void refetchCustomerStock()}>
                Tentar novamente
              </Button>
            </div>
          </NoticeBanner>
        )}
        {/* Com estoque do cliente, o vínculo fica explícito mesmo se for o único
            local disponível. Sem vínculo, mantém a UI antiga (só mostra se > 1). */}
        {(selectableStocks.length > 1 || activeCustomerStock) && (
          <div className="space-y-2">
            <Label htmlFor="os-consumption-stock">{t.fieldStock}</Label>
            <Select value={stockId} onValueChange={handleStockChange} disabled={busy}>
              <SelectTrigger id="os-consumption-stock" aria-label={t.fieldStock}>
                <SelectValue placeholder={t.fieldStock} />
              </SelectTrigger>
              <SelectContent>
                {selectableStocks.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}{s.customer_id === customerId ? ' · Estoque do cliente' : ''}
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
              <Label
                id="os-consumption-material-label"
                htmlFor="os-consumption-customer-material"
              >
                {t.fieldMaterial}
              </Label>
              {isCustomerStockSelected ? (
                <SearchableSelect
                  id="os-consumption-customer-material"
                  groups={[{
                    heading: 'Estoque do cliente',
                    options: customerItems.map((item) => {
                      const qty = getCustomerQuantityForStock(item.id, stockId);
                      const itemUnit = item.unit || t.sectionUnit;
                      const balanceLabel = qty > 0
                        ? t.selectAvailable.replace('{qty}', formatQty(qty)).replace('{unit}', itemUnit)
                        : t.selectNoBalance;
                      return {
                        value: item.id,
                        label: item.name,
                        sublabel: item.sku ? `SKU ${item.sku} · ${balanceLabel}` : balanceLabel,
                        keywords: [item.sku, item.category].filter((value): value is string => !!value),
                      };
                    }),
                  }]}
                  value={inventoryId || undefined}
                  onValueChange={setInventoryId}
                  disabled={busy}
                  placeholder={t.selectPlaceholder}
                  searchPlaceholder={t.selectSearch}
                  emptyMessage={t.selectEmpty}
                />
              ) : (
                <div role="group" aria-labelledby="os-consumption-material-label">
                  <InventoryMaterialSelect
                    id="os-consumption-customer-material"
                    stockId={stockId}
                    value={inventoryId || undefined}
                    onValueChange={setInventoryId}
                    disabled={busy}
                  />
                </div>
              )}
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
              <Label htmlFor="os-consumption-quantity">{t.fieldQuantity}</Label>
              <NumericInput
                id="os-consumption-quantity"
                aria-label={t.fieldQuantity}
                decimal
                value={quantityStr}
                onValueChange={setQuantityStr}
                placeholder={t.quantityPlaceholder}
                disabled={busy}
              />
              {overBalance && (
                <NoticeBanner variant="warning">{t.overBalanceWarning}</NoticeBanner>
              )}
            </div>

            {/* Observação */}
            <div className="space-y-2">
              <Label htmlFor="os-consumption-notes">{t.fieldNotes}</Label>
              <Textarea
                id="os-consumption-notes"
                aria-label={t.fieldNotes}
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
                          className="h-11 w-11 shrink-0"
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
                          className="h-11 w-11 shrink-0"
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

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, PackageSearch, PencilLine, AlertTriangle, PackagePlus } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { INVENTORY_UNITS } from '@/lib/inventoryUnits';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useInventory } from '@/hooks/useInventory';
import { useStocks } from '@/hooks/useStocks';
import { useLowStock, type LowStockRow } from '@/hooks/useLowStock';
import { useToast } from '@/hooks/use-toast';
import {
  useCompras,
  type CompraListRow,
  type CompraMaterialDraft,
} from '@/hooks/useCompras';

interface CompraEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Compra existente para editar; ausente = nova. */
  compra?: CompraListRow | null;
}

type Origin = 'estoque' | 'manual';

interface MaterialRow {
  key: string;
  origin: Origin;
  inventory_id: string | null;
  material_name: string;
  unit: string;
  quantity: number;
}

function newKey(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CompraEditorDialog({ open, onOpenChange, compra }: CompraEditorDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.purchaseEditor;
  const tMat = t.materials;
  const { items: inventory } = useInventory();
  const { stocks } = useStocks();
  const { lowStockRows, lowStockInventoryIds, isLoading: loadingLowStock, getByStock } = useLowStock();
  const { toast } = useToast();
  const { loadCompra, createCompra, updateCompra } = useCompras();

  const editingId = compra?.id ?? null;
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [originToAdd, setOriginToAdd] = useState<Origin>('estoque');
  const [loading, setLoading] = useState(false);

  // ---- Estado do sub-dialog "Adicionar itens abaixo do mínimo" ----
  const [belowMinOpen, setBelowMinOpen] = useState(false);
  const [belowMinStockId, setBelowMinStockId] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const init = async () => {
      if (!editingId) {
        setTitle('');
        setNotes('');
        setRows([]);
        setOriginToAdd('estoque');
        return;
      }
      setLoading(true);
      try {
        const { compra: c, materials } = await loadCompra(editingId);
        if (cancelled) return;
        setTitle(c.title);
        setNotes(c.notes ?? '');
        setRows(materials.map((m) => ({
          key: m.id,
          origin: m.inventory_id ? 'estoque' : 'manual',
          inventory_id: m.inventory_id,
          material_name: m.material_name ?? '',
          unit: m.unit ?? 'un',
          quantity: m.quantity,
        })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, open]);

  // Definir o local de estoque padrão quando o sub-dialog abrir.
  useEffect(() => {
    if (belowMinOpen && stocks.length > 0 && !belowMinStockId) {
      const def = stocks.find((s) => s.is_default) ?? stocks[0];
      if (def) setBelowMinStockId(def.id);
    }
  }, [belowMinOpen, stocks, belowMinStockId]);

  const inventoryById = new Map(inventory.map((i) => [i.id, i]));

  // Materiais de estoque ainda não adicionados.
  const availableItems = useMemo(() => inventory
    .filter((i) => !rows.some((r) => r.inventory_id === i.id))
    .map((i) => ({
      value: i.id,
      label: i.name,
      sublabel: i.sku ?? undefined,
      // Ícone de alerta pra materiais abaixo do mínimo — passado como adorno via prefix
      lowStock: lowStockInventoryIds.has(i.id),
    })), [inventory, rows, lowStockInventoryIds]);

  // Itens do local selecionado abaixo do mínimo, excluindo os já na lista.
  const belowMinItems: LowStockRow[] = useMemo(() => {
    if (!belowMinStockId) return [];
    return getByStock(belowMinStockId).filter(
      (r) => !rows.some((row) => row.inventory_id === r.inventory_id),
    );
  }, [belowMinStockId, lowStockRows, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const addStockItem = (inventoryId: string) => {
    if (!inventoryId || rows.some((r) => r.inventory_id === inventoryId)) return;
    const inv = inventoryById.get(inventoryId);
    setRows((prev) => [...prev, {
      key: newKey(),
      origin: 'estoque',
      inventory_id: inventoryId,
      material_name: inv?.name ?? '',
      unit: inv?.unit ?? 'un',
      quantity: 1,
    }]);
  };

  const addManualItem = () => {
    setRows((prev) => [...prev, {
      key: newKey(),
      origin: 'manual',
      inventory_id: null,
      material_name: '',
      unit: 'un',
      quantity: 1,
    }]);
  };

  const removeItem = (key: string) =>
    setRows((prev) => prev.filter((r) => r.key !== key));

  const patchItem = (key: string, patch: Partial<MaterialRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Adiciona todos os itens abaixo do mínimo do local selecionado. */
  const handleAddBelowMin = () => {
    if (belowMinItems.length === 0) return;
    const newRows: MaterialRow[] = belowMinItems.map((item) => ({
      key: newKey(),
      origin: 'estoque' as Origin,
      inventory_id: item.inventory_id,
      material_name: item.material_name,
      unit: item.unit,
      // Sugere o deficit arredondado para cima, mínimo 1.
      quantity: Math.max(1, Math.ceil(item.deficit)),
    }));
    setRows((prev) => [...prev, ...newRows]);
    setBelowMinOpen(false);
    setBelowMinStockId('');
  };

  const validate = (): string | null => {
    if (!title.trim()) return t.validate.needTitle;
    if (rows.length === 0) return t.validate.needMaterial;
    for (const r of rows) {
      if (r.origin === 'manual' && !r.material_name.trim()) {
        return t.validate.needManualName;
      }
      if (!(r.quantity > 0)) {
        return t.validate.invalidQty.replace('{name}', r.material_name || tMat.noNameFallback);
      }
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      toast({ title: t.validate.toastTitle, description: err, variant: 'destructive' });
      return;
    }
    const materials: CompraMaterialDraft[] = rows.map((r) => ({
      inventory_id: r.origin === 'estoque' ? r.inventory_id : null,
      material_name: r.material_name.trim(),
      unit: r.unit,
      quantity: r.quantity,
    }));
    const payload = { title: title.trim(), notes: notes.trim() || null, materials };
    if (editingId) {
      await updateCompra.mutateAsync({ id: editingId, ...payload });
    } else {
      await createCompra.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const isPending = createCompra.isPending || updateCompra.isPending;
  const canSave = !!title.trim() && rows.length > 0;

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={editingId ? t.titleEdit : t.titleNew}
        className="sm:max-w-[640px]"
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              {t.cancel}
            </Button>
            <Button onClick={handleSave} disabled={!canSave || isPending} className="flex-1">
              {isPending ? t.saving : t.save}
            </Button>
          </div>
        }
      >
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t.loading}</p>
        ) : (
          <div className="space-y-5">
            {editingId && compra && compra.cotacao_count > 0 && (
              <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
                {t.cotacaoWarning}
              </p>
            )}

            {/* Título */}
            <div className="space-y-2">
              <Label>{t.fields.title}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t.fields.titlePlaceholder}
              />
            </div>

            {/* Materiais */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{tMat.sectionTitle}</h3>
                {/* Atalho: Adicionar itens abaixo do mínimo */}
                {!loadingLowStock && lowStockRows.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 border-warning/60 text-warning hover:bg-warning/10 hover:text-warning"
                    onClick={() => setBelowMinOpen(true)}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="text-xs">{tMat.addBelowMin}</span>
                  </Button>
                )}
              </div>

              <div className="space-y-2 rounded-lg border bg-muted/30 p-2">
                <LabeledSwitch<Origin>
                  value={originToAdd}
                  onChange={setOriginToAdd}
                  off={{ value: 'estoque', label: tMat.originStock }}
                  on={{ value: 'manual', label: tMat.originManual }}
                  size="default"
                  aria-label={tMat.originAriaLabel}
                />
                {originToAdd === 'estoque' ? (
                  <SearchableSelect
                    options={availableItems.map((item) => ({
                      value: item.value,
                      label: item.label,
                      sublabel: item.sublabel,
                      icon: item.lowStock
                        ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        : undefined,
                    }))}
                    value=""
                    onValueChange={addStockItem}
                    placeholder={tMat.stockPlaceholder}
                    searchPlaceholder={tMat.stockSearchPlaceholder}
                    emptyMessage={tMat.stockEmptyMessage}
                  />
                ) : (
                  <Button variant="outline" className="w-full gap-1.5" onClick={addManualItem}>
                    <Plus className="h-4 w-4" /> {tMat.addManualButton}
                  </Button>
                )}
              </div>

              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tMat.noneAdded}</p>
              ) : (
                <div className="space-y-2">
                  {rows.map((r) => {
                    const isManual = r.origin === 'manual';
                    const isLowStock = !isManual && r.inventory_id
                      ? lowStockInventoryIds.has(r.inventory_id)
                      : false;
                    return (
                      <div key={r.key} className="space-y-2 rounded-lg border p-2">
                        <div className="flex items-start gap-2">
                          <span className={cn('mt-1.5 shrink-0', isManual ? 'text-warning' : 'text-muted-foreground')}>
                            {isManual ? <PencilLine className="h-4 w-4" /> : <PackageSearch className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            {isManual ? (
                              <Input
                                className="h-8"
                                placeholder={tMat.manualNamePlaceholder}
                                value={r.material_name}
                                onChange={(e) => patchItem(r.key, { material_name: e.target.value })}
                              />
                            ) : (
                              <div className="flex items-center gap-1.5 min-w-0">
                                <p className="truncate text-sm font-medium">{r.material_name || tMat.nameFallback}</p>
                                {isLowStock && (
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                                )}
                              </div>
                            )}
                            {isManual && <Badge variant="warning" className="text-[10px]">{tMat.badgeOutOfStock}</Badge>}
                            {isLowStock && <Badge variant="destructive" className="text-[10px]">{tMat.badgeLowStock}</Badge>}
                            {!isManual && r.inventory_id && inventoryById.get(r.inventory_id)?.sku && (
                              <span className="text-xs text-muted-foreground">
                                {inventoryById.get(r.inventory_id)?.sku}
                              </span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => removeItem(r.key)}
                            aria-label={tMat.ariaRemove}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex items-end gap-2 pl-6">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{tMat.quantity}</Label>
                            <NumericInput
                              decimal
                              className="h-8 w-24"
                              value={r.quantity ? String(r.quantity) : ''}
                              onValueChange={(v) => patchItem(r.key, { quantity: parseFloat(v.replace(',', '.')) || 0 })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{tMat.unit}</Label>
                            <Select value={r.unit} onValueChange={(v) => patchItem(r.key, { unit: v })}>
                              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {INVENTORY_UNITS.map((u) => (
                                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Observações */}
            <div className="space-y-2">
              <Label>{t.fields.notes}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.fields.notesPlaceholder}
                rows={2}
              />
            </div>
          </div>
        )}
      </ResponsiveModal>

      {/* Sub-dialog: Adicionar itens abaixo do mínimo */}
      <AlertDialog
        open={belowMinOpen}
        onOpenChange={(o) => {
          if (!o) { setBelowMinOpen(false); setBelowMinStockId(''); }
        }}
      >
        <AlertDialogContent className="max-h-[90vh] flex flex-col gap-0 p-0 sm:max-w-[480px]">
          <AlertDialogHeader className="px-4 pt-4 pb-2">
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <PackagePlus className="h-4 w-4 text-warning" />
              {tMat.belowMinTitle}
            </AlertDialogTitle>
          </AlertDialogHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-3">
            {/* Seletor de local */}
            <div className="space-y-1.5">
              <Label className="text-sm">{tMat.belowMinSelectStock}</Label>
              {stocks.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tMat.belowMinLoadingStocks}</p>
              ) : (
                <Select
                  value={belowMinStockId}
                  onValueChange={setBelowMinStockId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tMat.belowMinSelectStock} />
                  </SelectTrigger>
                  <SelectContent>
                    {stocks.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Lista de itens abaixo do mínimo */}
            {belowMinStockId && (
              loadingLowStock ? (
                <p className="text-sm text-muted-foreground py-4 text-center">{tMat.belowMinLoadingStocks}</p>
              ) : belowMinItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {rows.some((r) => r.inventory_id && getByStock(belowMinStockId).some((ls) => ls.inventory_id === r.inventory_id))
                    ? tMat.belowMinAllAdded
                    : tMat.belowMinEmpty}
                </p>
              ) : (
                <div className="space-y-2">
                  {belowMinItems.map((item) => (
                    <div
                      key={item.inventory_id}
                      className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.material_name}</p>
                        <p className="text-xs text-destructive">
                          {tMat.belowMinDeficit
                            .replace('{qty}', String(Math.ceil(item.deficit)))
                            .replace('{unit}', item.unit)}
                        </p>
                      </div>
                      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          <AlertDialogFooter className="px-4 pb-4 pt-2 flex gap-2">
            <AlertDialogCancel
              className="flex-1"
              onClick={() => { setBelowMinOpen(false); setBelowMinStockId(''); }}
            >
              {tMat.belowMinCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="flex-1"
              disabled={belowMinItems.length === 0}
              onClick={handleAddBelowMin}
            >
              {tMat.belowMinConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

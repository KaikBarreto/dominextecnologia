import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Users, CheckCircle2, Trophy, PackageSearch, PencilLine } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/utils/currency';
import { INVENTORY_UNITS, unitLabel } from '@/lib/inventoryUnits';
import { useInventory } from '@/hooks/useInventory';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useToast } from '@/hooks/use-toast';
import {
  useMaterialPurchases,
  computeSupplierTotal,
  type PurchaseListRow,
  type DraftItem,
  type DraftQuote,
} from '@/hooks/useMaterialPurchases';
import { SupplierFormDialog } from './SupplierFormDialog';

interface PurchaseEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cotação existente para editar/visualizar; ausente = nova. */
  purchase?: PurchaseListRow | null;
}

type ItemOrigin = 'estoque' | 'manual';

interface ItemRow {
  key: string;
  origin: ItemOrigin;
  inventory_id: string | null;
  material_name: string;
  unit: string;
  quantity: number;
}

/** Modo de digitação de uma célula de preço. */
type CellMode = 'unit' | 'total';
// prices[itemKey][supplierId] = string do input (valor digitado)
type PriceMap = Record<string, Record<string, string>>;
// modes[itemKey][supplierId] = 'unit' | 'total'
type ModeMap = Record<string, Record<string, CellMode>>;

function newKey(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PurchaseEditorDialog({ open, onOpenChange, purchase }: PurchaseEditorDialogProps) {
  const { items: inventory } = useInventory();
  const { suppliers } = useSuppliers();
  const { toast } = useToast();
  const { loadPurchase, createPurchase, updatePurchase, approvePurchase } = useMaterialPurchases();

  const editingId = purchase?.id ?? null;
  const isApproved = purchase?.status === 'aprovada';
  const isCancelled = purchase?.status === 'cancelada';
  const readOnly = isApproved || isCancelled;

  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
  const [modes, setModes] = useState<ModeMap>({});
  const [originToAdd, setOriginToAdd] = useState<ItemOrigin>('estoque');
  const [quickOpen, setQuickOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Carrega estado inicial (nova ou edição).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const init = async () => {
      if (!editingId) {
        setNotes('');
        setRows([]);
        setSupplierIds([]);
        setPrices({});
        setModes({});
        setOriginToAdd('estoque');
        return;
      }
      setLoading(true);
      try {
        const detail = await loadPurchase(editingId);
        if (cancelled) return;
        setNotes(detail.purchase.notes ?? '');
        // Usa o id real do item como `key` quando edita (estável).
        setRows(detail.items.map((i) => ({
          key: i.id,
          origin: i.inventory_id ? 'estoque' : 'manual',
          inventory_id: i.inventory_id,
          material_name: i.material_name ?? '',
          unit: i.unit ?? 'un',
          quantity: i.quantity,
        })));
        setSupplierIds(detail.suppliers.map((s) => s.supplier_id));
        const pm: PriceMap = {};
        const mm: ModeMap = {};
        for (const q of detail.quotes) {
          if (!pm[q.purchase_item_id]) { pm[q.purchase_item_id] = {}; mm[q.purchase_item_id] = {}; }
          pm[q.purchase_item_id][q.supplier_id] = String(q.unit_price);
          mm[q.purchase_item_id][q.supplier_id] = 'unit';
        }
        setPrices(pm);
        setModes(mm);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, open]);

  const inventoryById = useMemo(
    () => new Map(inventory.map((i) => [i.id, i])),
    [inventory],
  );
  const supplierById = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  );

  // Materiais de estoque ainda não adicionados (opções do seletor).
  const availableItems = useMemo(
    () => inventory
      .filter((i) => !rows.some((r) => r.inventory_id === i.id))
      .map((i) => ({ value: i.id, label: i.name, sublabel: i.sku ?? undefined })),
    [inventory, rows],
  );

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

  const removeItem = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
    setPrices((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setModes((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const patchItem = (key: string, patch: Partial<ItemRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const toggleSupplier = (id: string) =>
    setSupplierIds((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);

  const setPrice = (key: string, supplierId: string, value: string) =>
    setPrices((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? {}), [supplierId]: value },
    }));

  const cellMode = (key: string, supplierId: string): CellMode =>
    modes[key]?.[supplierId] ?? 'unit';

  const toggleCellMode = (key: string, supplierId: string, mode: CellMode) =>
    setModes((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? {}), [supplierId]: mode },
    }));

  /** Preço UNITÁRIO canônico de uma célula, derivando de total quando o modo é 'total'. */
  const unitPriceOf = (row: ItemRow, supplierId: string): number => {
    const raw = parseFloat(prices[row.key]?.[supplierId] ?? '');
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    if (cellMode(row.key, supplierId) === 'total') {
      return row.quantity > 0 ? raw / row.quantity : 0;
    }
    return raw;
  };

  /** Quotes derivadas (sempre em unit_price), keadas pelo `key` do item. */
  const quotesForCalc = useMemo<DraftQuote[]>(() => {
    const out: DraftQuote[] = [];
    for (const row of rows) {
      for (const sid of supplierIds) {
        const up = unitPriceOf(row, sid);
        if (up > 0) out.push({ supplier_id: sid, item_key: row.key, unit_price: up });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, supplierIds, prices, modes]);

  // Totais por fornecedor (Σ quantidade × preço unitário). Reusa o item.id===key.
  const itemsForCalc = useMemo(
    () => rows.map((r) => ({ id: r.key, quantity: r.quantity })),
    [rows],
  );
  const quotesById = useMemo(
    () => quotesForCalc.map((q) => ({
      supplier_id: q.supplier_id,
      purchase_item_id: q.item_key,
      unit_price: q.unit_price,
    })),
    [quotesForCalc],
  );

  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const sid of supplierIds) {
      map[sid] = computeSupplierTotal(sid, itemsForCalc, quotesById);
    }
    return map;
  }, [supplierIds, itemsForCalc, quotesById]);

  // Fornecedor mais barato (só conta quem tem total > 0).
  const cheapestSupplierId = useMemo(() => {
    let best: string | null = null;
    let bestVal = Infinity;
    for (const sid of supplierIds) {
      const t = totals[sid];
      if (t > 0 && t < bestVal) { bestVal = t; best = sid; }
    }
    return best;
  }, [supplierIds, totals]);

  const buildPayload = () => {
    const items: DraftItem[] = rows.map((r) => ({
      key: r.key,
      inventory_id: r.origin === 'estoque' ? r.inventory_id : null,
      material_name: r.material_name.trim(),
      unit: r.unit,
      quantity: r.quantity,
    }));
    return {
      notes: notes.trim() || null,
      items,
      supplier_ids: supplierIds,
      quotes: quotesForCalc,
    };
  };

  /** Valida itens antes de salvar; retorna mensagem de erro ou null. */
  const validate = (): string | null => {
    if (rows.length === 0) return 'Adicione ao menos um material.';
    for (const r of rows) {
      if (r.origin === 'manual' && !r.material_name.trim()) {
        return 'Dê um nome ao material manual antes de salvar.';
      }
      if (!(r.quantity > 0)) {
        return `Quantidade do item "${r.material_name || 'sem nome'}" deve ser maior que zero.`;
      }
    }
    if (supplierIds.length === 0) return 'Selecione ao menos um fornecedor.';
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      toast({ title: 'Confira a cotação', description: err, variant: 'destructive' });
      return;
    }
    const payload = buildPayload();
    if (editingId) {
      await updatePurchase.mutateAsync({ id: editingId, ...payload });
    } else {
      await createPurchase.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const handleApprove = async (supplierId: string) => {
    if (!editingId) return;
    if ((totals[supplierId] ?? 0) <= 0) {
      toast({ title: 'Sem preços', description: 'Informe os preços deste fornecedor antes de aprovar.', variant: 'destructive' });
      return;
    }
    await approvePurchase.mutateAsync({ id: editingId, supplierId });
    onOpenChange(false);
  };

  const isPending = createPurchase.isPending || updatePurchase.isPending;
  const canSave = rows.length > 0 && supplierIds.length > 0;

  const title = editingId
    ? readOnly ? 'Cotação' : 'Editar Cotação'
    : 'Nova Cotação';

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        className="sm:max-w-[920px]"
        footer={
          readOnly ? (
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!canSave || isPending} className="flex-1">
                {isPending ? 'Salvando...' : 'Salvar rascunho'}
              </Button>
            </div>
          )
        }
      >
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-6">
            {isCancelled && <Badge variant="destructive">Cotação cancelada</Badge>}

            {/* 1. MATERIAIS */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">1. Materiais</h3>

              {!readOnly && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-2">
                  <LabeledSwitch<ItemOrigin>
                    value={originToAdd}
                    onChange={setOriginToAdd}
                    off={{ value: 'estoque', label: 'Do estoque' }}
                    on={{ value: 'manual', label: 'Fora do estoque' }}
                    size="default"
                    aria-label="Origem do material a adicionar"
                  />
                  {originToAdd === 'estoque' ? (
                    <SearchableSelect
                      options={availableItems}
                      value=""
                      onValueChange={addStockItem}
                      placeholder="Adicionar material do estoque..."
                      searchPlaceholder="Buscar material..."
                      emptyMessage="Nenhum material disponível."
                    />
                  ) : (
                    <Button variant="outline" className="w-full gap-1.5" onClick={addManualItem}>
                      <Plus className="h-4 w-4" /> Adicionar material fora do estoque
                    </Button>
                  )}
                </div>
              )}

              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum material adicionado.</p>
              ) : (
                <div className="space-y-2">
                  {rows.map((r) => {
                    const isManual = r.origin === 'manual';
                    return (
                      <div key={r.key} className="space-y-2 rounded-lg border p-2">
                        <div className="flex items-start gap-2">
                          <span className={cn(
                            'mt-1.5 shrink-0',
                            isManual ? 'text-warning' : 'text-muted-foreground',
                          )}>
                            {isManual
                              ? <PencilLine className="h-4 w-4" />
                              : <PackageSearch className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            {isManual ? (
                              <Input
                                className="h-8"
                                placeholder="Nome do material..."
                                value={r.material_name}
                                disabled={readOnly}
                                onChange={(e) => patchItem(r.key, { material_name: e.target.value })}
                              />
                            ) : (
                              <p className="truncate text-sm font-medium">{r.material_name || 'Item'}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                              {isManual && <Badge variant="warning" className="text-[10px]">Fora do estoque</Badge>}
                              {!isManual && r.inventory_id && inventoryById.get(r.inventory_id)?.sku && (
                                <span className="text-xs text-muted-foreground">
                                  {inventoryById.get(r.inventory_id)?.sku}
                                </span>
                              )}
                            </div>
                          </div>
                          {!readOnly && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                              onClick={() => removeItem(r.key)}
                              aria-label="Remover material"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        <div className="flex items-end gap-2 pl-6">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Quantidade</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              className="h-8 w-24"
                              value={r.quantity}
                              disabled={readOnly}
                              onChange={(e) => patchItem(r.key, { quantity: parseFloat(e.target.value) || 0 })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Unidade</Label>
                            <Select
                              value={r.unit}
                              disabled={readOnly}
                              onValueChange={(v) => patchItem(r.key, { unit: v })}
                            >
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

            {/* 2. FORNECEDORES PARTICIPANTES */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">2. Fornecedores</h3>
                {!readOnly && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setQuickOpen(true)}>
                    <Plus className="h-4 w-4" /> Novo
                  </Button>
                )}
              </div>
              {readOnly ? (
                <div className="flex flex-wrap gap-2">
                  {supplierIds.map((sid) => (
                    <Badge key={sid} variant="secondary">{supplierById.get(sid)?.name ?? 'Fornecedor'}</Badge>
                  ))}
                </div>
              ) : suppliers.length === 0 ? (
                <EmptySuppliers onAdd={() => setQuickOpen(true)} />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {suppliers.map((s) => (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm"
                    >
                      <Checkbox
                        checked={supplierIds.includes(s.id)}
                        onCheckedChange={() => toggleSupplier(s.id)}
                      />
                      <span className="truncate">{s.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </section>

            {/* 3. GRADE DE PREÇOS + COMPARAÇÃO */}
            {rows.length > 0 && supplierIds.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">3. Preços por fornecedor</h3>
                <p className="text-xs text-muted-foreground">
                  Em cada célula, alterne entre <strong>unitário</strong> e <strong>total</strong> —
                  o outro valor é calculado automaticamente.
                </p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="p-2 text-left font-medium">Material</th>
                        {supplierIds.map((sid) => (
                          <th
                            key={sid}
                            className={cn(
                              'p-2 text-center font-medium min-w-[150px]',
                              sid === cheapestSupplierId && 'bg-success/10',
                            )}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span className="truncate max-w-[110px]">{supplierById.get(sid)?.name ?? 'Fornecedor'}</span>
                              {sid === cheapestSupplierId && <Trophy className="h-3.5 w-3.5 text-success" />}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key} className="border-b align-top">
                          <td className="p-2">
                            <span className="font-medium">{r.material_name || 'Item'}</span>
                            <span className="block text-xs text-muted-foreground">
                              {r.quantity} {unitLabel(r.unit)}
                              {r.origin === 'manual' && ' • fora do estoque'}
                            </span>
                          </td>
                          {supplierIds.map((sid) => {
                            const mode = cellMode(r.key, sid);
                            const up = unitPriceOf(r, sid);
                            const derived = mode === 'unit'
                              ? up * r.quantity   // mostrando total derivado
                              : up;               // mostrando unitário derivado
                            return (
                              <td
                                key={sid}
                                className={cn('p-2', sid === cheapestSupplierId && 'bg-success/5')}
                              >
                                <div className="space-y-1.5">
                                  <LabeledSwitch<CellMode>
                                    value={mode}
                                    onChange={(m) => toggleCellMode(r.key, sid, m)}
                                    off={{ value: 'unit', label: 'Unit.' }}
                                    on={{ value: 'total', label: 'Total' }}
                                    size="default"
                                    disabled={readOnly}
                                    aria-label="Tipo de valor"
                                  />
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    inputMode="decimal"
                                    className="h-8 text-right"
                                    placeholder="0,00"
                                    value={prices[r.key]?.[sid] ?? ''}
                                    disabled={readOnly}
                                    onChange={(e) => setPrice(r.key, sid, e.target.value)}
                                  />
                                  {up > 0 && (
                                    <p className="text-right text-[11px] text-muted-foreground">
                                      {mode === 'unit'
                                        ? `Total R$ ${formatBRL(derived)}`
                                        : `Unit. R$ ${formatBRL(derived)}`}
                                    </p>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/40 font-semibold">
                        <td className="p-2 text-right">Total</td>
                        {supplierIds.map((sid) => {
                          const isCheapest = sid === cheapestSupplierId;
                          const isApprovedSup = purchase?.approved_supplier_id === sid;
                          return (
                            <td
                              key={sid}
                              className={cn(
                                'p-2 text-center',
                                isCheapest && 'bg-success/10 text-success',
                              )}
                            >
                              <div className="space-y-1">
                                <div>R$ {formatBRL(totals[sid] ?? 0)}</div>
                                {isCheapest && (
                                  <span className="text-[10px] font-medium uppercase tracking-wide text-success">
                                    Mais barato
                                  </span>
                                )}
                                {!readOnly && (totals[sid] ?? 0) > 0 && editingId && (
                                  <Button
                                    size="sm"
                                    variant={isCheapest ? 'default' : 'outline'}
                                    className={cn('h-7 w-full text-xs', isCheapest && 'bg-success text-white hover:bg-success/90')}
                                    onClick={() => handleApprove(sid)}
                                    disabled={approvePurchase.isPending}
                                  >
                                    Aprovar
                                  </Button>
                                )}
                                {isApprovedSup && (
                                  <Badge className="bg-success text-white gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Aprovado
                                  </Badge>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {!readOnly && !editingId && (
                  <p className="text-xs text-muted-foreground">
                    Salve o rascunho para liberar a aprovação por fornecedor.
                  </p>
                )}
              </section>
            )}

            {/* OBSERVAÇÕES */}
            <section className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={notes}
                disabled={readOnly}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anotações da cotação..."
                rows={2}
              />
            </section>
          </div>
        )}
      </ResponsiveModal>

      <SupplierFormDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onCreated={(s) => setSupplierIds((prev) => prev.includes(s.id) ? prev : [...prev, s.id])}
      />
    </>
  );
}

function EmptySuppliers({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center">
      <Users className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Nenhum fornecedor cadastrado ainda.</p>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={onAdd}>
        <Plus className="h-4 w-4" /> Cadastrar fornecedor
      </Button>
    </div>
  );
}

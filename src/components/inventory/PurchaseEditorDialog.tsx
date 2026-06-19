import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Users, CheckCircle2, Trophy } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/utils/currency';
import { useInventory } from '@/hooks/useInventory';
import { useSuppliers } from '@/hooks/useSuppliers';
import {
  useMaterialPurchases,
  computeSupplierTotal,
  type PurchaseListRow,
  type DraftItem,
} from '@/hooks/useMaterialPurchases';
import { SupplierFormDialog } from './SupplierFormDialog';

interface PurchaseEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cotação existente para editar/visualizar; ausente = nova. */
  purchase?: PurchaseListRow | null;
}

interface ItemRow {
  inventory_id: string;
  quantity: number;
}

// prices[inventory_id][supplier_id] = string do input
type PriceMap = Record<string, Record<string, string>>;

export function PurchaseEditorDialog({ open, onOpenChange, purchase }: PurchaseEditorDialogProps) {
  const { items: inventory } = useInventory();
  const { suppliers } = useSuppliers();
  const { loadPurchase, createPurchase, updatePurchase, approvePurchase } = useMaterialPurchases();

  const editingId = purchase?.id ?? null;
  const isApproved = purchase?.status === 'aprovada';
  const isCancelled = purchase?.status === 'cancelada';
  const readOnly = isApproved || isCancelled;

  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
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
        return;
      }
      setLoading(true);
      try {
        const detail = await loadPurchase(editingId);
        if (cancelled) return;
        setNotes(detail.purchase.notes ?? '');
        setRows(detail.items.filter((i) => i.inventory_id).map((i) => ({ inventory_id: i.inventory_id!, quantity: i.quantity })));
        setSupplierIds(detail.suppliers.map((s) => s.supplier_id));
        const pm: PriceMap = {};
        for (const q of detail.quotes) {
          if (!pm[q.inventory_id]) pm[q.inventory_id] = {};
          pm[q.inventory_id][q.supplier_id] = String(q.unit_price);
        }
        setPrices(pm);
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

  // Materiais ainda não adicionados (opções do seletor).
  const availableItems = useMemo(
    () => inventory
      .filter((i) => !rows.some((r) => r.inventory_id === i.id))
      .map((i) => ({ value: i.id, label: i.name, sublabel: i.sku ?? undefined })),
    [inventory, rows],
  );

  const addItem = (inventoryId: string) => {
    if (!inventoryId || rows.some((r) => r.inventory_id === inventoryId)) return;
    setRows((prev) => [...prev, { inventory_id: inventoryId, quantity: 1 }]);
  };
  const removeItem = (inventoryId: string) => {
    setRows((prev) => prev.filter((r) => r.inventory_id !== inventoryId));
    setPrices((prev) => { const n = { ...prev }; delete n[inventoryId]; return n; });
  };
  const setQty = (inventoryId: string, qty: number) =>
    setRows((prev) => prev.map((r) => r.inventory_id === inventoryId ? { ...r, quantity: qty } : r));

  const toggleSupplier = (id: string) =>
    setSupplierIds((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);

  const setPrice = (inventoryId: string, supplierId: string, value: string) =>
    setPrices((prev) => ({
      ...prev,
      [inventoryId]: { ...(prev[inventoryId] ?? {}), [supplierId]: value },
    }));

  // Totais por fornecedor (Σ quantidade × preço).
  const itemsForCalc = rows.map((r) => ({ inventory_id: r.inventory_id, quantity: r.quantity }));
  const quotesForCalc = useMemo(() => {
    const out: { supplier_id: string; inventory_id: string; unit_price: number }[] = [];
    for (const invId of Object.keys(prices)) {
      for (const supId of Object.keys(prices[invId])) {
        const v = parseFloat(prices[invId][supId]);
        if (Number.isFinite(v) && v > 0) out.push({ supplier_id: supId, inventory_id: invId, unit_price: v });
      }
    }
    return out;
  }, [prices]);

  const totals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const sid of supplierIds) {
      map[sid] = computeSupplierTotal(sid, itemsForCalc, quotesForCalc);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierIds, rows, quotesForCalc]);

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

  const buildPayload = () => ({
    notes: notes.trim() || null,
    items: rows.filter((r) => r.quantity > 0) as DraftItem[],
    supplier_ids: supplierIds,
    quotes: quotesForCalc,
  });

  const handleSave = async () => {
    const payload = buildPayload();
    if (editingId) {
      await updatePurchase.mutateAsync({ id: editingId, ...payload });
    } else {
      await createPurchase.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const handleApprove = async (supplierId: string) => {
    if (!editingId) {
      // Salva primeiro pra ter id, depois o usuário aprova (fluxo defensivo).
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
        className="sm:max-w-[860px]"
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
            {isCancelled && (
              <Badge variant="destructive">Cotação cancelada</Badge>
            )}

            {/* 1. MATERIAIS */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">1. Materiais</h3>
              </div>
              {!readOnly && (
                <SearchableSelect
                  options={availableItems}
                  value=""
                  onValueChange={addItem}
                  placeholder="Adicionar material do estoque..."
                  searchPlaceholder="Buscar material..."
                  emptyMessage="Nenhum material disponível."
                />
              )}
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum material adicionado.</p>
              ) : (
                <div className="space-y-2">
                  {rows.map((r) => {
                    const inv = inventoryById.get(r.inventory_id);
                    return (
                      <div key={r.inventory_id} className="flex items-center gap-2 rounded-lg border p-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{inv?.name ?? 'Item'}</p>
                          {inv?.sku && <p className="truncate text-xs text-muted-foreground">{inv.sku}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs text-muted-foreground">Qtd</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-8 w-20"
                            value={r.quantity}
                            disabled={readOnly}
                            onChange={(e) => setQty(r.inventory_id, parseFloat(e.target.value) || 0)}
                          />
                          <span className="w-7 text-xs text-muted-foreground">{inv?.unit ?? 'un'}</span>
                        </div>
                        {!readOnly && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removeItem(r.inventory_id)}
                            aria-label="Remover material"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
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
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="p-2 text-left font-medium">Material</th>
                        {supplierIds.map((sid) => (
                          <th
                            key={sid}
                            className={cn(
                              'p-2 text-center font-medium min-w-[120px]',
                              sid === cheapestSupplierId && 'bg-success/10',
                            )}
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span className="truncate max-w-[100px]">{supplierById.get(sid)?.name ?? 'Fornecedor'}</span>
                              {sid === cheapestSupplierId && <Trophy className="h-3.5 w-3.5 text-success" />}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const inv = inventoryById.get(r.inventory_id);
                        return (
                          <tr key={r.inventory_id} className="border-b">
                            <td className="p-2">
                              <span className="font-medium">{inv?.name ?? 'Item'}</span>
                              <span className="block text-xs text-muted-foreground">{r.quantity} {inv?.unit ?? 'un'}</span>
                            </td>
                            {supplierIds.map((sid) => (
                              <td
                                key={sid}
                                className={cn('p-2', sid === cheapestSupplierId && 'bg-success/5')}
                              >
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  className="h-8 text-right"
                                  placeholder="0,00"
                                  value={prices[r.inventory_id]?.[sid] ?? ''}
                                  disabled={readOnly}
                                  onChange={(e) => setPrice(r.inventory_id, sid, e.target.value)}
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
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

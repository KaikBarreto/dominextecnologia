import { useEffect, useState } from 'react';
import { Plus, Trash2, PackageSearch, PencilLine } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { cn } from '@/lib/utils';
import { INVENTORY_UNITS } from '@/lib/inventoryUnits';
import { useInventory } from '@/hooks/useInventory';
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
  const { items: inventory } = useInventory();
  const { toast } = useToast();
  const { loadCompra, createCompra, updateCompra } = useCompras();

  const editingId = compra?.id ?? null;
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [originToAdd, setOriginToAdd] = useState<Origin>('estoque');
  const [loading, setLoading] = useState(false);

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

  const inventoryById = new Map(inventory.map((i) => [i.id, i]));

  // Materiais de estoque ainda não adicionados.
  const availableItems = inventory
    .filter((i) => !rows.some((r) => r.inventory_id === i.id))
    .map((i) => ({ value: i.id, label: i.name, sublabel: i.sku ?? undefined }));

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

  const validate = (): string | null => {
    if (!title.trim()) return 'Dê um título à compra.';
    if (rows.length === 0) return 'Adicione ao menos um material.';
    for (const r of rows) {
      if (r.origin === 'manual' && !r.material_name.trim()) {
        return 'Dê um nome ao material fora do estoque antes de salvar.';
      }
      if (!(r.quantity > 0)) {
        return `Quantidade do material "${r.material_name || 'sem nome'}" deve ser maior que zero.`;
      }
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      toast({ title: 'Confira a compra', description: err, variant: 'destructive' });
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
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={editingId ? 'Editar Compra' : 'Nova Compra'}
      className="sm:max-w-[640px]"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!canSave || isPending} className="flex-1">
            {isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      }
    >
      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-5">
          {editingId && compra && compra.cotacao_count > 0 && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
              Esta compra já tem cotações. Mudar os materiais vai apagar os preços já informados.
            </p>
          )}

          {/* Título */}
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Reposição de materiais — Junho"
            />
          </div>

          {/* Materiais */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Materiais</h3>

            <div className="space-y-2 rounded-lg border bg-muted/30 p-2">
              <LabeledSwitch<Origin>
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

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum material adicionado.</p>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => {
                  const isManual = r.origin === 'manual';
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
                              placeholder="Nome do material..."
                              value={r.material_name}
                              onChange={(e) => patchItem(r.key, { material_name: e.target.value })}
                            />
                          ) : (
                            <p className="truncate text-sm font-medium">{r.material_name || 'Item'}</p>
                          )}
                          {isManual && <Badge variant="warning" className="text-[10px]">Fora do estoque</Badge>}
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
                          aria-label="Remover material"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="flex items-end gap-2 pl-6">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Quantidade</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            className="h-8 w-24"
                            value={r.quantity}
                            onChange={(e) => patchItem(r.key, { quantity: parseFloat(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Unidade</Label>
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
            <Label>Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações da compra..."
              rows={2}
            />
          </div>
        </div>
      )}
    </ResponsiveModal>
  );
}

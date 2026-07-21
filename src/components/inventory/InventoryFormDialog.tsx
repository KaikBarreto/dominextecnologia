import { useEffect, useState, useCallback } from 'react';
import { Wand2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useInventory, type InventoryItem, type InventoryItemInsert } from '@/hooks/useInventory';
import { useStocks } from '@/hooks/useStocks';
import { useMaterialGroups } from '@/hooks/useMaterialGroups';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { INVENTORY_UNITS as UNITS } from '@/lib/inventoryUnits';

interface InventoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: InventoryItem | null;
  /** ID do local ativo na tela — usado para ajuste de qty no local correto. */
  activeStockId?: string | null;
}

export function InventoryFormDialog({ open, onOpenChange, item, activeStockId }: InventoryFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.formDialog;
  const { createItem, updateItem, getMinQuantityForStock, getQuantityForStock, updateStockLevelMinQuantity } = useInventory();
  const { stocks } = useStocks();
  const { groups } = useMaterialGroups();
  const isEditing = !!item;

  const [formData, setFormData] = useState<Partial<InventoryItemInsert>>({
    name: '', sku: '', category: '', group_id: null, description: '', quantity: 0, unit: 'un', cost_price: 0, sale_price: 0, supplier: '',
  });
  const [isSkuGenerating, setIsSkuGenerating] = useState(false);

  // Estado de mínimo por estoque: { [stockId]: string (raw numeric) }
  const [stockMinQtyMap, setStockMinQtyMap] = useState<Record<string, string>>({});

  const getNextSequentialSku = async (): Promise<string> => {
    const { data, error } = await supabase.from('inventory').select('sku, created_at').ilike('sku', 'EST-%').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    let max = 0;
    for (const row of data ?? []) {
      const match = (row.sku ?? '').match(/^EST-(\d+)$/);
      if (match) { const n = Number(match[1]); if (Number.isFinite(n)) max = Math.max(max, n); }
    }
    return `EST-${String(max + 1).padStart(3, '0')}`;
  };

  const applyAutoSku = async () => {
    setIsSkuGenerating(true);
    try { const sku = await getNextSequentialSku(); setFormData(prev => ({ ...prev, sku })); }
    catch (e) { console.error('Erro ao gerar SKU automático', e); }
    finally { setIsSkuGenerating(false); }
  };

  // Inicializa o mapa de mínimos por estoque (edição: lê do hook; criação: vazio)
  const initStockMinMap = useCallback(() => {
    if (item) {
      const map: Record<string, string> = {};
      for (const s of stocks) {
        const min = getMinQuantityForStock(item.id, s.id);
        map[s.id] = min != null ? String(min) : '';
      }
      setStockMinQtyMap(map);
    } else {
      const map: Record<string, string> = {};
      for (const s of stocks) { map[s.id] = ''; }
      setStockMinQtyMap(map);
    }
  }, [item, stocks, getMinQuantityForStock]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (item) {
        setFormData({ name: item.name, sku: item.sku || '', category: item.category || '', group_id: item.group_id || null, description: item.description || '', quantity: item.quantity || 0, unit: item.unit || 'un', cost_price: item.cost_price || 0, sale_price: item.sale_price || 0, supplier: item.supplier || '' });
        initStockMinMap();
        return;
      }
      setFormData({ name: '', sku: '', category: '', group_id: null, description: '', quantity: 0, unit: 'un', cost_price: 0, sale_price: 0, supplier: '' });
      initStockMinMap();
      if (!open) return;
      try {
        setIsSkuGenerating(true);
        const sku = await getNextSequentialSku();
        if (!cancelled) setFormData(prev => ({ ...prev, sku }));
      } catch (e) { console.error('Erro ao gerar SKU automático', e); }
      finally { if (!cancelled) setIsSkuGenerating(false); }
    };
    run();
    return () => { cancelled = true; };
  }, [item, open]);

  // Quando stocks carregar (assíncrono), re-inicializa o mapa
  useEffect(() => {
    if (open) initStockMinMap();
  }, [stocks.length, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let savedItemId: string | null = null;

    if (isEditing && item) {
      // Use stock-specific qty as the "previous" so the adjustment targets the
      // active local (not the global sum). Falls back to item.quantity when no
      // active stock is selected (single-stock or "all" view).
      const previousQty = activeStockId
        ? getQuantityForStock(item.id, activeStockId)
        : (item.quantity ?? 0);
      await updateItem.mutateAsync({ id: item.id, ...formData, previousQuantity: previousQty, activeStockId: activeStockId ?? undefined });
      savedItemId = item.id;
    } else {
      const created = await createItem.mutateAsync(formData as InventoryItemInsert);
      savedItemId = created?.id ?? null;
    }

    // Grava min_quantity por estoque (somente locais que têm valor informado)
    if (savedItemId) {
      for (const s of stocks) {
        const rawMin = stockMinQtyMap[s.id] ?? '';
        const minVal = rawMin.trim() === '' ? null : (parseFloat(rawMin.replace(',', '.')) || 0);
        // Só atualiza se mudou (na edição) ou se há valor (na criação)
        if (isEditing) {
          const prevMin = getMinQuantityForStock(savedItemId, s.id);
          if (minVal !== prevMin) {
            await updateStockLevelMinQuantity.mutateAsync({ inventoryId: savedItemId, stockId: s.id, minQuantity: minVal });
          }
        } else if (minVal !== null) {
          await updateStockLevelMinQuantity.mutateAsync({ inventoryId: savedItemId, stockId: s.id, minQuantity: minVal });
        }
      }
    }

    onOpenChange(false);
  };

  const handleChange = (field: keyof InventoryItemInsert, value: string | number | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isPending = createItem.isPending || updateItem.isPending || updateStockLevelMinQuantity.isPending;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? t.titleEdit : t.titleNew}
      className="sm:max-w-[600px]"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={isPending}>{t.cancel}</Button>
          <Button onClick={handleSubmit as any} disabled={isPending} className="flex-1">
            {isPending ? t.saving : t.save}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t.fields.name}</Label>
            <Input value={formData.name} onChange={(e) => handleChange('name', e.target.value)} placeholder={t.fields.namePlaceholder} required />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>{t.fields.sku}</Label>
              <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={applyAutoSku} disabled={isEditing || isSkuGenerating}>
                <Wand2 className="h-4 w-4 mr-1" />{isSkuGenerating ? t.fields.skuGenerating : t.fields.skuAuto}
              </Button>
            </div>
            <Input value={formData.sku || ''} onChange={(e) => handleChange('sku', e.target.value)} placeholder={t.fields.skuPlaceholder} />
            <p className="text-xs text-muted-foreground">{t.fields.skuHint}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t.fields.group}</Label>
            {groups.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">{t.fields.groupEmpty}</p>
            ) : (
              <Select
                value={formData.group_id || ''}
                onValueChange={(value) => handleChange('group_id', value || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t.fields.groupPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: g.color ?? '#6B7280' }}
                        />
                        {g.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label>{t.fields.supplier}</Label>
            <Input value={formData.supplier || ''} onChange={(e) => handleChange('supplier', e.target.value)} placeholder={t.fields.supplierPlaceholder} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t.fields.description}</Label>
          <Textarea value={formData.description || ''} onChange={(e) => handleChange('description', e.target.value)} placeholder={t.fields.descriptionPlaceholder} rows={2} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t.fields.quantity}</Label>
            <NumericInput decimal value={formData.quantity ? String(formData.quantity) : ''} onValueChange={(v) => handleChange('quantity', parseFloat(v.replace(',', '.')) || 0)} />
          </div>
          <div className="space-y-2">
            <Label>{t.fields.unit}</Label>
            <Select value={formData.unit || 'un'} onValueChange={(value) => handleChange('unit', value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{UNITS.map(u => (<SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>))}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t.fields.costPrice}</Label>
            <Input type="number" min="0" step="0.01" value={formData.cost_price || 0} onChange={(e) => handleChange('cost_price', parseFloat(e.target.value) || 0)} />
            <p className="text-xs text-muted-foreground">{t.fields.priceHint}</p>
          </div>
          <div className="space-y-2">
            <Label>{t.fields.salePrice}</Label>
            <Input type="number" min="0" step="0.01" value={formData.sale_price || 0} onChange={(e) => handleChange('sale_price', parseFloat(e.target.value) || 0)} />
            <p className="text-xs text-muted-foreground">{t.fields.priceHint}</p>
          </div>
        </div>

        {/* Mínimo por local de estoque */}
        {stocks.length > 0 && (
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-semibold">{t.fields.minQtyPerStockLabel}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t.fields.minQtyPerStockHint}</p>
            </div>
            <div className="rounded-xl border divide-y">
              {stocks.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    {s.is_default && (
                      <p className="text-xs text-muted-foreground">{t.fields.minQtyDefaultBadge}</p>
                    )}
                  </div>
                  <div className="w-28 shrink-0">
                    <NumericInput
                      decimal
                      value={stockMinQtyMap[s.id] ?? ''}
                      onValueChange={(v) =>
                        setStockMinQtyMap((prev) => ({ ...prev, [s.id]: v }))
                      }
                      placeholder={t.fields.minQtyPlaceholder}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </ResponsiveModal>
  );
}

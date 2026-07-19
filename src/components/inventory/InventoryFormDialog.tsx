import { useEffect, useState } from 'react';
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
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { INVENTORY_UNITS as UNITS } from '@/lib/inventoryUnits';

interface InventoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: InventoryItem | null;
}

const CATEGORIES = ['Peças', 'Filtros', 'Gases', 'Ferramentas', 'Materiais', 'Equipamentos', 'Outros'];
export function InventoryFormDialog({ open, onOpenChange, item }: InventoryFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.formDialog;
  const { createItem, updateItem } = useInventory();
  const isEditing = !!item;

  const [formData, setFormData] = useState<Partial<InventoryItemInsert>>({
    name: '', sku: '', category: '', description: '', quantity: 0, unit: 'un', cost_price: 0, sale_price: 0, supplier: '',
  });
  const [isSkuGenerating, setIsSkuGenerating] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (item) {
        setFormData({ name: item.name, sku: item.sku || '', category: item.category || '', description: item.description || '', quantity: item.quantity || 0, unit: item.unit || 'un', cost_price: item.cost_price || 0, sale_price: item.sale_price || 0, supplier: item.supplier || '' });
        return;
      }
      setFormData({ name: '', sku: '', category: '', description: '', quantity: 0, unit: 'un', cost_price: 0, sale_price: 0, supplier: '' });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing && item) {
      // Passa a quantidade ANTERIOR pro hook: se a quantidade mudou, ele converte
      // a diferença num movimento 'ajuste' (Kardex) em vez de gravar direto.
      await updateItem.mutateAsync({ id: item.id, ...formData, previousQuantity: item.quantity });
    }
    else { await createItem.mutateAsync(formData as InventoryItemInsert); }
    onOpenChange(false);
  };

  const handleChange = (field: keyof InventoryItemInsert, value: string | number | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? t.titleEdit : t.titleNew}
      className="sm:max-w-[600px]"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">{t.cancel}</Button>
          <Button onClick={handleSubmit as any} disabled={createItem.isPending || updateItem.isPending} className="flex-1">
            {createItem.isPending || updateItem.isPending ? t.saving : t.save}
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
            <Label>{t.fields.category}</Label>
            <Select value={formData.category || ''} onValueChange={(value) => handleChange('category', value)}>
              <SelectTrigger><SelectValue placeholder={t.fields.categoryPlaceholder} /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>
                    {(t.categories as Record<string, string>)[cat] ?? cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
      </form>
    </ResponsiveModal>
  );
}

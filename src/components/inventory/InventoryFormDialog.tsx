import { useEffect, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useInventory, type InventoryItem, type InventoryItemInsert } from '@/hooks/useInventory';

interface InventoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: InventoryItem | null;
}

const CATEGORIES = ['Peças', 'Filtros', 'Gases', 'Ferramentas', 'Materiais', 'Equipamentos', 'Outros'];
const UNITS = [
  { value: 'un', label: 'Unidade' },
  { value: 'kg', label: 'Quilograma' },
  { value: 'l', label: 'Litro' },
  { value: 'm', label: 'Metro' },
  { value: 'cx', label: 'Caixa' },
  { value: 'pc', label: 'Peça' },
];

export function InventoryFormDialog({ open, onOpenChange, item }: InventoryFormDialogProps) {
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
    if (isEditing && item) { await updateItem.mutateAsync({ id: item.id, ...formData }); }
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
      title={isEditing ? 'Editar Item' : 'Novo Item de Estoque'}
      className="sm:max-w-[600px]"
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</Button>
          <Button onClick={handleSubmit as any} disabled={createItem.isPending || updateItem.isPending} className="flex-1">
            {createItem.isPending || updateItem.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Nome do Item *</Label>
            <Input value={formData.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="Nome do item" required />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Código/SKU</Label>
              <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={applyAutoSku} disabled={isEditing || isSkuGenerating}>
                <Wand2 className="h-4 w-4 mr-1" />{isSkuGenerating ? 'Gerando...' : 'Auto'}
              </Button>
            </div>
            <Input value={formData.sku || ''} onChange={(e) => handleChange('sku', e.target.value)} placeholder="Ex: FLT-001" />
            <p className="text-xs text-muted-foreground">Código sequencial sugerido automaticamente (você pode personalizar).</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={formData.category || ''} onValueChange={(value) => handleChange('category', value)}>
              <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(cat => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Fornecedor</Label>
            <Input value={formData.supplier || ''} onChange={(e) => handleChange('supplier', e.target.value)} placeholder="Nome do fornecedor" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Descrição</Label>
          <Textarea value={formData.description || ''} onChange={(e) => handleChange('description', e.target.value)} placeholder="Descrição detalhada do item..." rows={2} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Quantidade</Label>
            <Input type="number" min="0" step="0.01" value={formData.quantity || 0} onChange={(e) => handleChange('quantity', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="space-y-2">
            <Label>Unidade</Label>
            <Select value={formData.unit || 'un'} onValueChange={(value) => handleChange('unit', value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{UNITS.map(u => (<SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>))}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Preço de Custo (R$)</Label>
            <Input type="number" min="0" step="0.01" value={formData.cost_price || 0} onChange={(e) => handleChange('cost_price', parseFloat(e.target.value) || 0)} />
            <p className="text-xs text-muted-foreground">Valor por unidade.</p>
          </div>
          <div className="space-y-2">
            <Label>Preço de Venda (R$)</Label>
            <Input type="number" min="0" step="0.01" value={formData.sale_price || 0} onChange={(e) => handleChange('sale_price', parseFloat(e.target.value) || 0)} />
            <p className="text-xs text-muted-foreground">Valor por unidade.</p>
          </div>
        </div>
      </form>
    </ResponsiveModal>
  );
}

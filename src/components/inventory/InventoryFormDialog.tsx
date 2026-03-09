import { useEffect, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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

const CATEGORIES = [
  'Peças',
  'Filtros',
  'Gases',
  'Ferramentas',
  'Materiais',
  'Equipamentos',
  'Outros',
];

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
    name: '',
    sku: '',
    category: '',
    description: '',
    quantity: 0,
    min_quantity: 0,
    unit: 'un',
    cost_price: 0,
    sale_price: 0,
    supplier: '',
  });

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name,
        sku: item.sku || '',
        category: item.category || '',
        description: item.description || '',
        quantity: item.quantity || 0,
        min_quantity: item.min_quantity || 0,
        unit: item.unit || 'un',
        cost_price: item.cost_price || 0,
        sale_price: item.sale_price || 0,
        supplier: item.supplier || '',
      });
    } else {
      setFormData({
        name: '',
        sku: '',
        category: '',
        description: '',
        quantity: 0,
        min_quantity: 0,
        unit: 'un',
        cost_price: 0,
        sale_price: 0,
        supplier: '',
      });
    }
  }, [item, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isEditing && item) {
      await updateItem.mutateAsync({ id: item.id, ...formData });
    } else {
      await createItem.mutateAsync(formData as InventoryItemInsert);
    }
    
    onOpenChange(false);
  };

  const handleChange = (field: keyof InventoryItemInsert, value: string | number | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? 'Editar Item' : 'Novo Item de Estoque'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Item *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Nome do item"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sku">Código/SKU</Label>
              <Input
                id="sku"
                value={formData.sku || ''}
                onChange={(e) => handleChange('sku', e.target.value)}
                placeholder="Ex: FLT-001"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Select
                value={formData.category || ''}
                onValueChange={(value) => handleChange('category', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier">Fornecedor</Label>
              <Input
                id="supplier"
                value={formData.supplier || ''}
                onChange={(e) => handleChange('supplier', e.target.value)}
                placeholder="Nome do fornecedor"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Descrição detalhada do item..."
              rows={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantidade</Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                step="0.01"
                value={formData.quantity || 0}
                onChange={(e) => handleChange('quantity', parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="min_quantity">Qtd. Mínima</Label>
              <Input
                id="min_quantity"
                type="number"
                min="0"
                step="0.01"
                value={formData.min_quantity || 0}
                onChange={(e) => handleChange('min_quantity', parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unidade</Label>
              <Select
                value={formData.unit || 'un'}
                onValueChange={(value) => handleChange('unit', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map(unit => (
                    <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cost_price">Preço de Custo (R$)</Label>
              <Input
                id="cost_price"
                type="number"
                min="0"
                step="0.01"
                value={formData.cost_price || 0}
                onChange={(e) => handleChange('cost_price', parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sale_price">Preço de Venda (R$)</Label>
              <Input
                id="sale_price"
                type="number"
                min="0"
                step="0.01"
                value={formData.sale_price || 0}
                onChange={(e) => handleChange('sale_price', parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={createItem.isPending || updateItem.isPending}
            >
              {createItem.isPending || updateItem.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

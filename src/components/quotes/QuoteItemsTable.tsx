import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { QuoteItem } from '@/hooks/useQuotes';

interface QuoteItemsTableProps {
  items: QuoteItem[];
  onChange: (items: QuoteItem[]) => void;
  readOnly?: boolean;
}

const ITEM_TYPES = [
  { value: 'servico', label: 'Serviço' },
  { value: 'material', label: 'Material' },
  { value: 'mao_de_obra', label: 'Mão de Obra' },
];

export function QuoteItemsTable({ items, onChange, readOnly }: QuoteItemsTableProps) {
  const addItem = () => {
    onChange([...items, {
      position: items.length,
      item_type: 'servico',
      description: '',
      quantity: 1,
      unit_price: 0,
      total_price: 0,
    }]);
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = items.map((item, i) => {
      if (i !== idx) return item;
      const newItem = { ...item, [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        newItem.total_price = (newItem.quantity || 0) * (newItem.unit_price || 0);
      }
      return newItem;
    });
    onChange(updated);
  };

  const subtotal = items.reduce((s, i) => s + (i.total_price || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Itens do Orçamento</span>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar Item
          </Button>
        )}
      </div>

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
          Nenhum item adicionado. Clique em "Adicionar Item" para começar.
        </p>
      )}

      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-start p-3 border rounded-lg bg-card">
            <div className="col-span-12 sm:col-span-2">
              <Select
                value={item.item_type}
                onValueChange={(v) => updateItem(idx, 'item_type', v)}
                disabled={readOnly}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-12 sm:col-span-4">
              <Input
                placeholder="Descrição"
                value={item.description}
                onChange={(e) => updateItem(idx, 'description', e.target.value)}
                disabled={readOnly}
                className="h-9 text-xs"
              />
            </div>
            <div className="col-span-4 sm:col-span-1">
              <Input
                type="number"
                placeholder="Qtd"
                value={item.quantity || ''}
                onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                disabled={readOnly}
                className="h-9 text-xs"
                min={0}
              />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <Input
                type="number"
                placeholder="Valor Unit."
                value={item.unit_price || ''}
                onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                disabled={readOnly}
                className="h-9 text-xs"
                min={0}
                step="0.01"
              />
            </div>
            <div className="col-span-3 sm:col-span-2 flex items-center h-9">
              <span className="text-sm font-medium text-foreground">
                R$ {(item.total_price || 0).toFixed(2)}
              </span>
            </div>
            {!readOnly && (
              <div className="col-span-1 flex justify-end">
                <Button type="button" variant="destructive-ghost" size="icon" className="h-9 w-9" onClick={() => removeItem(idx)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <div className="flex justify-end pt-2 border-t">
          <span className="text-sm font-semibold text-foreground">
            Subtotal: R$ {subtotal.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

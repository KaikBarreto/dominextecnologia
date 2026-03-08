import { Plus, Trash2, Wrench, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useInventory } from '@/hooks/useInventory';
import type { QuoteItem } from '@/hooks/useQuotes';
import { useMemo } from 'react';

interface QuoteItemsTableProps {
  items: QuoteItem[];
  onChange: (items: QuoteItem[]) => void;
  readOnly?: boolean;
}

const SERVICE_SUB_TYPES = [
  { value: 'servico', label: 'Serviço' },
  { value: 'mao_de_obra', label: 'Mão de Obra' },
];

export function QuoteItemsTable({ items, onChange, readOnly }: QuoteItemsTableProps) {
  const { serviceTypes } = useServiceTypes();
  const { items: inventoryItems } = useInventory();

  const serviceOptions = useMemo(
    () => (serviceTypes ?? []).filter(s => s.is_active).map(s => ({
      value: s.id,
      label: s.name,
      sublabel: s.description || undefined,
    })),
    [serviceTypes]
  );

  const materialOptions = useMemo(
    () => (inventoryItems ?? []).map(m => ({
      value: m.id,
      label: m.name,
      sublabel: m.sku ? `SKU: ${m.sku}` : m.category || undefined,
    })),
    [inventoryItems]
  );

  const serviceItems = items.filter(i => i.item_type === 'servico' || i.item_type === 'mao_de_obra');
  const materialItems = items.filter(i => i.item_type === 'material');

  const servicesSubtotal = serviceItems.reduce((s, i) => s + (i.total_price || 0), 0);
  const materialsSubtotal = materialItems.reduce((s, i) => s + (i.total_price || 0), 0);

  const addServiceItem = () => {
    onChange([...items, {
      position: items.length,
      item_type: 'servico',
      description: '',
      quantity: 1,
      unit_price: 0,
      total_price: 0,
    }]);
  };

  const addMaterialItem = () => {
    onChange([...items, {
      position: items.length,
      item_type: 'material',
      description: '',
      quantity: 1,
      unit_price: 0,
      total_price: 0,
    }]);
  };

  const removeItem = (globalIdx: number) => {
    onChange(items.filter((_, i) => i !== globalIdx));
  };

  const updateItem = (globalIdx: number, field: string, value: any) => {
    const updated = items.map((item, i) => {
      if (i !== globalIdx) return item;
      const newItem = { ...item, [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        newItem.total_price = (newItem.quantity || 0) * (newItem.unit_price || 0);
      }
      return newItem;
    });
    onChange(updated);
  };

  const handleSelectService = (globalIdx: number, serviceTypeId: string) => {
    const st = serviceTypes.find(s => s.id === serviceTypeId);
    if (!st) return;
    const updated = items.map((item, i) => {
      if (i !== globalIdx) return item;
      return { ...item, description: st.name, service_type_id: serviceTypeId, inventory_id: null };
    });
    onChange(updated);
  };

  const handleSelectMaterial = (globalIdx: number, inventoryId: string) => {
    const inv = inventoryItems.find(m => m.id === inventoryId);
    if (!inv) return;
    const unitPrice = inv.sale_price ?? inv.cost_price ?? 0;
    const qty = items[globalIdx]?.quantity || 1;
    const updated = items.map((item, i) => {
      if (i !== globalIdx) return item;
      return {
        ...item,
        description: inv.name,
        unit_price: unitPrice,
        total_price: qty * unitPrice,
        inventory_id: inventoryId,
        service_type_id: null,
      };
    });
    onChange(updated);
  };

  const getGlobalIndex = (item: QuoteItem) => items.indexOf(item);

  const renderServiceRow = (item: QuoteItem) => {
    const idx = getGlobalIndex(item);
    return (
      <div key={idx} className="grid grid-cols-12 gap-2 items-start p-3 border rounded-lg bg-card">
        {/* Sub-type selector */}
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
              {SERVICE_SUB_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Service SearchableSelect */}
        <div className="col-span-12 sm:col-span-4">
          <div className="space-y-1">
            <SearchableSelect
              options={serviceOptions}
              value={item.service_type_id || ''}
              onValueChange={(v) => handleSelectService(idx, v)}
              placeholder="Buscar serviço..."
              searchPlaceholder="Buscar serviço pré-cadastrado..."
              emptyMessage="Nenhum serviço encontrado"
              disabled={readOnly}
              className="h-9 text-xs"
            />
            <Input
              placeholder="Descrição livre ou complemento"
              value={item.description}
              onChange={(e) => updateItem(idx, 'description', e.target.value)}
              disabled={readOnly}
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Quantity */}
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

        {/* Unit price */}
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

        {/* Total */}
        <div className="col-span-3 sm:col-span-2 flex items-center h-9">
          <span className="text-sm font-medium text-foreground">
            R$ {(item.total_price || 0).toFixed(2)}
          </span>
        </div>

        {/* Delete */}
        {!readOnly && (
          <div className="col-span-1 flex justify-end">
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => removeItem(idx)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderMaterialRow = (item: QuoteItem) => {
    const idx = getGlobalIndex(item);
    return (
      <div key={idx} className="grid grid-cols-12 gap-2 items-start p-3 border rounded-lg bg-card">
        {/* Material SearchableSelect */}
        <div className="col-span-12 sm:col-span-6">
          <div className="space-y-1">
            <SearchableSelect
              options={materialOptions}
              value={item.inventory_id || ''}
              onValueChange={(v) => handleSelectMaterial(idx, v)}
              placeholder="Buscar material do estoque..."
              searchPlaceholder="Buscar material pré-cadastrado..."
              emptyMessage="Nenhum material encontrado"
              disabled={readOnly}
              className="h-9 text-xs"
            />
            <Input
              placeholder="Descrição livre ou complemento"
              value={item.description}
              onChange={(e) => updateItem(idx, 'description', e.target.value)}
              disabled={readOnly}
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Quantity */}
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

        {/* Unit price */}
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

        {/* Total */}
        <div className="col-span-3 sm:col-span-2 flex items-center h-9">
          <span className="text-sm font-medium text-foreground">
            R$ {(item.total_price || 0).toFixed(2)}
          </span>
        </div>

        {/* Delete */}
        {!readOnly && (
          <div className="col-span-1 flex justify-end">
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => removeItem(idx)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* === SERVIÇOS E MÃO DE OBRA === */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
              Serviços e Mão de Obra
            </span>
          </div>
          {!readOnly && (
            <Button type="button" variant="outline" size="sm" onClick={addServiceItem}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          )}
        </div>

        {serviceItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
            Nenhum serviço adicionado.
          </p>
        ) : (
          <div className="space-y-2">
            {serviceItems.map(renderServiceRow)}
          </div>
        )}

        {serviceItems.length > 0 && (
          <div className="flex justify-end">
            <span className="text-sm font-medium text-muted-foreground">
              Subtotal Serviços: <span className="text-foreground font-semibold">R$ {servicesSubtotal.toFixed(2)}</span>
            </span>
          </div>
        )}
      </div>

      {/* === MATERIAIS === */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
              Materiais
            </span>
          </div>
          {!readOnly && (
            <Button type="button" variant="outline" size="sm" onClick={addMaterialItem}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          )}
        </div>

        {materialItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
            Nenhum material adicionado.
          </p>
        ) : (
          <div className="space-y-2">
            {materialItems.map(renderMaterialRow)}
          </div>
        )}

        {materialItems.length > 0 && (
          <div className="flex justify-end">
            <span className="text-sm font-medium text-muted-foreground">
              Subtotal Materiais: <span className="text-foreground font-semibold">R$ {materialsSubtotal.toFixed(2)}</span>
            </span>
          </div>
        )}
      </div>

      {/* === SUBTOTAL GERAL === */}
      {(serviceItems.length > 0 || materialItems.length > 0) && (
        <div className="flex flex-col items-end gap-1 pt-3 border-t">
          {serviceItems.length > 0 && materialItems.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">Serviços: R$ {servicesSubtotal.toFixed(2)}</span>
              <span className="text-xs text-muted-foreground">Materiais: R$ {materialsSubtotal.toFixed(2)}</span>
            </>
          )}
          <span className="text-sm font-bold text-foreground">
            Subtotal: R$ {(servicesSubtotal + materialsSubtotal).toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

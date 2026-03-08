import { useState, useMemo } from 'react';
import { Plus, Trash2, Wrench, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useInventory } from '@/hooks/useInventory';
import type { QuoteItem } from '@/hooks/useQuotes';

interface QuoteItemsTableProps {
  items: QuoteItem[];
  onChange: (items: QuoteItem[]) => void;
  readOnly?: boolean;
}

const SERVICE_SUB_TYPES = [
  { value: 'servico', label: 'Serviço' },
  { value: 'mao_de_obra', label: 'Mão de Obra' },
];

/* ─── Input row for services ─── */
function ServiceInputRow({
  serviceOptions,
  serviceTypes,
  onAdd,
}: {
  serviceOptions: { value: string; label: string; sublabel?: string }[];
  serviceTypes: { id: string; name: string }[];
  onAdd: (item: QuoteItem) => void;
}) {
  const [subType, setSubType] = useState('servico');
  const [serviceId, setServiceId] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  const qtyNum = parseFloat(quantity) || 0;
  const priceNum = parseFloat(unitPrice) || 0;
  const total = qtyNum * priceNum;

  const handleSelectService = (id: string) => {
    setServiceId(id);
    const st = serviceTypes.find(s => s.id === id);
    if (st) setDescription(st.name);
  };

  const handleAdd = () => {
    if (!description || qtyNum <= 0) return;
    onAdd({
      position: 0,
      item_type: subType,
      description,
      quantity: qtyNum,
      unit_price: priceNum,
      total_price: total,
      service_type_id: serviceId || null,
      inventory_id: null,
    });
    setSubType('servico');
    setServiceId('');
    setDescription('');
    setQuantity('');
    setUnitPrice('');
  };

  return (
    <TableRow className="bg-muted/50 border-b-2 border-border">
      <TableCell>
        <Select value={subType} onValueChange={setSubType}>
          <SelectTrigger className="h-8 text-xs bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SERVICE_SUB_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <SearchableSelect
          options={serviceOptions}
          value={serviceId}
          onValueChange={handleSelectService}
          placeholder="Buscar serviço..."
          searchPlaceholder="Buscar serviço pré-cadastrado..."
          emptyMessage="Nenhum serviço encontrado"
          className="h-8 text-xs"
        />
      </TableCell>
      <TableCell>
        <Input
          placeholder="Descrição"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-8 text-xs bg-background"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          placeholder="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="h-8 text-xs bg-background w-20"
          min={0}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          placeholder="0,00"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          className="h-8 text-xs bg-background w-24"
          min={0}
          step="0.01"
        />
      </TableCell>
      <TableCell className="font-medium text-sm whitespace-nowrap">
        R$ {total.toFixed(2)}
      </TableCell>
      <TableCell>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                className="h-8 w-8"
                onClick={handleAdd}
                disabled={!description || qtyNum <= 0}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Incluir item</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );
}

/* ─── Input row for materials ─── */
function MaterialInputRow({
  materialOptions,
  inventoryItems,
  onAdd,
}: {
  materialOptions: { value: string; label: string; sublabel?: string }[];
  inventoryItems: { id: string; name: string; sale_price: number | null; cost_price: number | null }[];
  onAdd: (item: QuoteItem) => void;
}) {
  const [inventoryId, setInventoryId] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  const qtyNum = parseFloat(quantity) || 0;
  const priceNum = parseFloat(unitPrice) || 0;
  const total = qtyNum * priceNum;

  const handleSelectMaterial = (id: string) => {
    setInventoryId(id);
    const inv = inventoryItems.find(m => m.id === id);
    if (inv) {
      setDescription(inv.name);
      const price = inv.sale_price ?? inv.cost_price ?? 0;
      if (price > 0) setUnitPrice(price.toString());
    }
  };

  const handleAdd = () => {
    if (!description || qtyNum <= 0) return;
    onAdd({
      position: 0,
      item_type: 'material',
      description,
      quantity: qtyNum,
      unit_price: priceNum,
      total_price: total,
      inventory_id: inventoryId || null,
      service_type_id: null,
    });
    setInventoryId('');
    setDescription('');
    setQuantity('');
    setUnitPrice('');
  };

  return (
    <TableRow className="bg-muted/50 border-b-2 border-border">
      <TableCell>
        <SearchableSelect
          options={materialOptions}
          value={inventoryId}
          onValueChange={handleSelectMaterial}
          placeholder="Buscar material..."
          searchPlaceholder="Buscar material do estoque..."
          emptyMessage="Nenhum material encontrado"
          className="h-8 text-xs"
        />
      </TableCell>
      <TableCell>
        <Input
          placeholder="Descrição"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-8 text-xs bg-background"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          placeholder="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="h-8 text-xs bg-background w-20"
          min={0}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          placeholder="0,00"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          className="h-8 text-xs bg-background w-24"
          min={0}
          step="0.01"
        />
      </TableCell>
      <TableCell className="font-medium text-sm whitespace-nowrap">
        R$ {total.toFixed(2)}
      </TableCell>
      <TableCell>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                className="h-8 w-8"
                onClick={handleAdd}
                disabled={!description || qtyNum <= 0}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Incluir item</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );
}

/* ─── Main component ─── */
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

  const addItem = (item: QuoteItem) => {
    onChange([...items, { ...item, position: items.length }]);
  };

  const removeItem = (globalIdx: number) => {
    onChange(items.filter((_, i) => i !== globalIdx));
  };

  const getGlobalIndex = (item: QuoteItem) => items.indexOf(item);

  return (
    <div className="space-y-6">
      {/* ═══ SERVIÇOS E MÃO DE OBRA ═══ */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Serviços e Mão de Obra
          </span>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px] text-xs">Tipo</TableHead>
                <TableHead className="text-xs">Serviço</TableHead>
                <TableHead className="text-xs">Descrição</TableHead>
                <TableHead className="w-[80px] text-xs">Qtd</TableHead>
                <TableHead className="w-[100px] text-xs">Valor Unit.</TableHead>
                <TableHead className="w-[100px] text-xs">Total</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!readOnly && (
                <ServiceInputRow
                  serviceOptions={serviceOptions}
                  serviceTypes={serviceTypes ?? []}
                  onAdd={addItem}
                />
              )}
              {serviceItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground text-xs py-4">
                    Nenhum serviço adicionado.
                  </TableCell>
                </TableRow>
              ) : (
                serviceItems.map((item) => {
                  const idx = getGlobalIndex(item);
                  return (
                    <TableRow key={idx}>
                      <TableCell className="text-xs">
                        {item.item_type === 'mao_de_obra' ? 'Mão de Obra' : 'Serviço'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {serviceTypes?.find(s => s.id === item.service_type_id)?.name || '—'}
                      </TableCell>
                      <TableCell className="text-xs font-medium">{item.description}</TableCell>
                      <TableCell className="text-xs">{item.quantity}</TableCell>
                      <TableCell className="text-xs">R$ {(item.unit_price || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-xs font-medium">R$ {(item.total_price || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        {!readOnly && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => removeItem(idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
              {serviceItems.length > 0 && (
                <TableRow className="bg-muted/30">
                  <TableCell colSpan={5} className="text-right text-xs font-medium text-muted-foreground">
                    Subtotal Serviços
                  </TableCell>
                  <TableCell className="text-xs font-bold text-foreground">
                    R$ {servicesSubtotal.toFixed(2)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ═══ MATERIAIS ═══ */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Materiais
          </span>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Material</TableHead>
                <TableHead className="text-xs">Descrição</TableHead>
                <TableHead className="w-[80px] text-xs">Qtd</TableHead>
                <TableHead className="w-[100px] text-xs">Valor Unit.</TableHead>
                <TableHead className="w-[100px] text-xs">Total</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!readOnly && (
                <MaterialInputRow
                  materialOptions={materialOptions}
                  inventoryItems={inventoryItems ?? []}
                  onAdd={addItem}
                />
              )}
              {materialItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-4">
                    Nenhum material adicionado.
                  </TableCell>
                </TableRow>
              ) : (
                materialItems.map((item) => {
                  const idx = getGlobalIndex(item);
                  return (
                    <TableRow key={idx}>
                      <TableCell className="text-xs text-muted-foreground">
                        {inventoryItems?.find(m => m.id === item.inventory_id)?.name || '—'}
                      </TableCell>
                      <TableCell className="text-xs font-medium">{item.description}</TableCell>
                      <TableCell className="text-xs">{item.quantity}</TableCell>
                      <TableCell className="text-xs">R$ {(item.unit_price || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-xs font-medium">R$ {(item.total_price || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        {!readOnly && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => removeItem(idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
              {materialItems.length > 0 && (
                <TableRow className="bg-muted/30">
                  <TableCell colSpan={4} className="text-right text-xs font-medium text-muted-foreground">
                    Subtotal Materiais
                  </TableCell>
                  <TableCell className="text-xs font-bold text-foreground">
                    R$ {materialsSubtotal.toFixed(2)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ═══ SUBTOTAL GERAL ═══ */}
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

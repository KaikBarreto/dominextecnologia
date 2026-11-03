import { useState, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Plus, Trash2, Wrench, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput, parseDecimalInputValue } from '@/components/ui/numeric-input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useInventory } from '@/hooks/useInventory';
import { readPastedCents } from '@/lib/money-paste-mask';
import { useLocaleFormatters } from '@/lib/format/hooks';
import type { ServiceType } from '@/hooks/useServiceTypes';
import type { ServiceOrderBudgetItem, ServiceOrderBudgetPricingMode } from '@/lib/serviceOrderBudget';

// Colar valor pronto (ex. "4.550" de uma planilha) num `<input type="number">`
// é lido pelo navegador como decimal internacional e vira 4,55 — 1000x menor
// (bug real do sócio). `readPastedCents` lê o texto como valor de verdade em
// PT-BR/internacional antes do navegador decidir sozinho.
function handleUnitPricePaste(e: React.ClipboardEvent<HTMLInputElement>, setUnitPrice: (v: string) => void) {
  const cents = readPastedCents(e);
  if (cents == null) return;
  setUnitPrice(cents ? (cents / 100).toFixed(2) : '');
}

interface QuoteItemsTableProps {
  items: ServiceOrderBudgetItem[];
  onChange: (items: ServiceOrderBudgetItem[]) => void;
  readOnly?: boolean;
  showServicePicker?: boolean;
  pricingEnabled?: boolean;
  bdiFactor?: number;
}

function EditableDecimalValue({
  value,
  onCommit,
  ariaLabel,
  maxDecimals,
  allowZero = false,
}: {
  value: number;
  onCommit: (value: number) => void;
  ariaLabel: string;
  maxDecimals: number;
  allowZero?: boolean;
}) {
  const toDraft = (number: number) => String(number).replace('.', ',');
  const [draft, setDraft] = useState(toDraft(value));

  useEffect(() => {
    setDraft(toDraft(value));
  }, [value]);

  const commit = () => {
    const parsed = parseDecimalInputValue(draft);
    if (parsed == null || (!allowZero && parsed <= 0) || (allowZero && parsed < 0)) {
      setDraft(toDraft(value));
      return;
    }
    onCommit(parsed);
    setDraft(toDraft(parsed));
  };

  return (
    <NumericInput
      decimal
      maxDecimals={maxDecimals}
      value={draft}
      onValueChange={setDraft}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      aria-label={ariaLabel}
      className="h-8 w-full min-w-[72px] bg-background text-xs tabular-nums md:w-20"
    />
  );
}

/* ─── Input row: Serviços / Mão de Obra ─── */
function ServiceInputRow({
  serviceOptions,
  serviceTypes,
  onAdd,
}: {
  serviceOptions: { value: string; label: string; sublabel?: string; icon?: ReactNode }[];
  serviceTypes: Pick<ServiceType, 'id' | 'name' | 'default_price'>[];
  onAdd: (item: ServiceOrderBudgetItem) => void;
}) {
  const { money } = useLocaleFormatters();
  const [serviceId, setServiceId] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  const qtyNum = parseDecimalInputValue(quantity) ?? 0;
  const priceNum = parseFloat(unitPrice) || 0;
  const total = qtyNum * priceNum;

  const handleSelectService = (id: string) => {
    setServiceId(id);
    const st = serviceTypes.find(s => s.id === id);
    if (st) {
      setDescription(st.name);
      setQuantity(current => current || '1');
      // Trocar o serviço também troca a referência de preço. Sem valor padrão,
      // limpamos o preço anterior para não faturar um serviço com a tabela de outro.
      setUnitPrice(st.default_price == null ? '' : String(st.default_price));
    }
  };

  const handleAdd = () => {
    if (!description || qtyNum <= 0) return;
    onAdd({
      position: 0,
      item_type: 'servico',
      description,
      quantity: qtyNum,
      unit_price: priceNum,
      total_price: total,
      service_type_id: serviceId || null,
      inventory_id: null,
      pricing_mode: 'registered',
      price_override: priceNum,
    });
    setServiceId('');
    setDescription('');
    setQuantity('');
    setUnitPrice('');
  };

  return (
    <TableRow className="grid grid-cols-2 gap-3 border-b-2 border-border bg-muted/50 p-3 md:table-row md:p-0">
      <TableCell className="col-span-2 p-0 md:table-cell md:p-4">
        <span className="mb-1 block text-[11px] font-medium text-muted-foreground md:hidden">Serviço</span>
        <SearchableSelect
          options={serviceOptions}
          value={serviceId}
          onValueChange={handleSelectService}
          placeholder="Selecionar serviço..."
          searchPlaceholder="Buscar serviço..."
          emptyMessage="Nenhum serviço encontrado"
          className="h-9 w-full text-xs md:h-8"
        />
      </TableCell>
      <TableCell className="p-0 md:table-cell md:p-4">
        <span className="mb-1 block text-[11px] font-medium text-muted-foreground md:hidden">Quantidade</span>
        <NumericInput
          decimal
          placeholder="0"
          value={quantity}
          onValueChange={(v) => setQuantity(v)}
          className="h-9 w-full bg-background text-xs md:h-8 md:w-20"
        />
      </TableCell>
      <TableCell className="p-0 md:table-cell md:p-4">
        <span className="mb-1 block text-[11px] font-medium text-muted-foreground md:hidden">Valor unitário</span>
        <Input
          type="number"
          placeholder="0,00"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          onPaste={(e) => handleUnitPricePaste(e, setUnitPrice)}
          className="h-9 w-full bg-background text-xs md:h-8 md:w-24"
          min={0}
          step="0.01"
        />
      </TableCell>
      <TableCell className="flex items-end p-0 text-sm font-medium md:table-cell md:p-4">
        <div>
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground md:hidden">Total previsto</span>
          <span className="whitespace-nowrap tabular-nums">{money(total)}</span>
        </div>
      </TableCell>
      <TableCell className="flex items-end justify-end p-0 md:table-cell md:p-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                className="h-9 w-full px-3 md:h-8 md:w-8 md:px-0"
                onClick={handleAdd}
                disabled={!description || qtyNum <= 0}
              >
                <Plus className="h-4 w-4" />
                <span className="ml-1 md:hidden">Incluir</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Incluir</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );
}

/* ─── Input row: Materiais ─── */
function MaterialInputRow({
  materialOptions,
  inventoryItems,
  onAdd,
}: {
  materialOptions: { value: string; label: string; sublabel?: string }[];
  inventoryItems: { id: string; name: string; sale_price: number | null; cost_price: number | null }[];
  onAdd: (item: ServiceOrderBudgetItem) => void;
}) {
  const { money } = useLocaleFormatters();
  const [inventoryId, setInventoryId] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  const qtyNum = parseDecimalInputValue(quantity) ?? 0;
  const priceNum = parseFloat(unitPrice) || 0;
  const total = qtyNum * priceNum;

  const handleSelectMaterial = (id: string) => {
    setInventoryId(id);
    const inv = inventoryItems.find(m => m.id === id);
    if (inv) {
      setDescription(inv.name);
      setQuantity(current => current || '1');
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
      unit_total_cost: Number(inventoryItems.find(item => item.id === inventoryId)?.cost_price ?? 0),
      pricing_mode: 'registered',
      price_override: priceNum,
    });
    setInventoryId('');
    setDescription('');
    setQuantity('');
    setUnitPrice('');
  };

  return (
    <TableRow className="grid grid-cols-2 gap-3 border-b-2 border-border bg-muted/50 p-3 md:table-row md:p-0">
      <TableCell className="col-span-2 p-0 md:table-cell md:p-4">
        <span className="mb-1 block text-[11px] font-medium text-muted-foreground md:hidden">Material</span>
        <SearchableSelect
          options={materialOptions}
          value={inventoryId}
          onValueChange={handleSelectMaterial}
          placeholder="Selecionar material..."
          searchPlaceholder="Buscar material do estoque..."
          emptyMessage="Nenhum material encontrado"
          className="h-9 w-full text-xs md:h-8"
        />
      </TableCell>
      <TableCell className="p-0 md:table-cell md:p-4">
        <span className="mb-1 block text-[11px] font-medium text-muted-foreground md:hidden">Quantidade</span>
        <NumericInput
          decimal
          placeholder="0"
          value={quantity}
          onValueChange={(v) => setQuantity(v)}
          className="h-9 w-full bg-background text-xs md:h-8 md:w-20"
        />
      </TableCell>
      <TableCell className="p-0 md:table-cell md:p-4">
        <span className="mb-1 block text-[11px] font-medium text-muted-foreground md:hidden">Valor unitário</span>
        <Input
          type="number"
          placeholder="0,00"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          onPaste={(e) => handleUnitPricePaste(e, setUnitPrice)}
          className="h-9 w-full bg-background text-xs md:h-8 md:w-24"
          min={0}
          step="0.01"
        />
      </TableCell>
      <TableCell className="flex items-end p-0 text-sm font-medium md:table-cell md:p-4">
        <div>
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground md:hidden">Total previsto</span>
          <span className="whitespace-nowrap tabular-nums">{money(total)}</span>
        </div>
      </TableCell>
      <TableCell className="flex items-end justify-end p-0 md:table-cell md:p-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                className="h-9 w-full px-3 md:h-8 md:w-8 md:px-0"
                onClick={handleAdd}
                disabled={!description || qtyNum <= 0}
              >
                <Plus className="h-4 w-4" />
                <span className="ml-1 md:hidden">Incluir</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Incluir</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );
}

/* ─── Main ─── */
export function QuoteItemsTable({
  items,
  onChange,
  readOnly,
  showServicePicker = true,
  pricingEnabled = false,
  bdiFactor = 0.68,
}: QuoteItemsTableProps) {
  const { money } = useLocaleFormatters();
  const { serviceTypes } = useServiceTypes();
  const { items: inventoryItems } = useInventory();

  const serviceOptions = useMemo(
    () => (serviceTypes ?? []).filter(s => s.is_active).map(s => ({
      value: s.id,
      label: s.name,
      sublabel: s.description || undefined,
      icon: <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />,
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

  const addItem = (item: ServiceOrderBudgetItem) => {
    onChange([...items, { ...item, position: items.length }]);
  };

  const removeItem = (globalIdx: number) => {
    onChange(items.filter((_, i) => i !== globalIdx));
  };

  const updateItem = (globalIdx: number, patch: Partial<ServiceOrderBudgetItem>) => {
    onChange(items.map((item, index) => {
      if (index !== globalIdx) return item;
      const next = { ...item, ...patch };
      return {
        ...next,
        total_price: Math.round(
          Number(next.quantity || 0) * Math.round(Number(next.unit_price || 0) * 100),
        ) / 100,
      };
    }));
  };

  const registeredPriceFor = (item: ServiceOrderBudgetItem) => {
    if (item.item_type === 'material') {
      const material = inventoryItems?.find(candidate => candidate.id === item.inventory_id);
      return Number(material?.sale_price ?? material?.cost_price ?? item.unit_price ?? 0);
    }
    const service = serviceTypes?.find(candidate => candidate.id === item.service_type_id);
    return Number(service?.default_price ?? item.unit_price ?? 0);
  };

  const changePricingMode = (globalIdx: number, mode: ServiceOrderBudgetPricingMode) => {
    const item = items[globalIdx];
    if (!item) return;
    const unitCost = Number(item.unit_total_cost || 0);
    const unitPrice = mode === 'cost_bdi'
      ? Math.round((unitCost / Math.max(0.01, bdiFactor)) * 100) / 100
      : mode === 'registered'
        ? registeredPriceFor(item)
        : Number(item.unit_price || 0);
    updateItem(globalIdx, {
      pricing_mode: mode,
      unit_price: unitPrice,
      bdi: bdiFactor,
      price_override: mode === 'cost_bdi' ? null : unitPrice,
    });
  };

  const pricingControl = (item: ServiceOrderBudgetItem, idx: number) => {
    if (!pricingEnabled) return null;
    const mode = item.pricing_mode ?? 'manual';
    const unitCost = Number(item.unit_total_cost || 0);
    if (readOnly) {
      const modeLabel = mode === 'cost_bdi' ? 'Custo + BDI' : mode === 'registered' ? 'Preço cadastrado' : 'Valor manual';
      return (
        <p className="mt-1 text-[10px] font-normal text-muted-foreground">
          {modeLabel} · Seu custo: {unitCost > 0 ? money(unitCost) : 'não informado'}
        </p>
      );
    }
    return (
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Select value={mode} onValueChange={value => changePricingMode(idx, value as ServiceOrderBudgetPricingMode)}>
          <SelectTrigger className="h-7 w-auto min-w-36 border-0 bg-muted/60 px-2 text-[11px] shadow-none" aria-label={`Modo de preço de ${item.description}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="registered">Preço cadastrado</SelectItem>
            <SelectItem value="cost_bdi" disabled={unitCost <= 0}>Custo + BDI</SelectItem>
            <SelectItem value="manual">Valor manual</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[10px] text-muted-foreground">
          Seu custo: {unitCost > 0 ? money(unitCost) : 'não informado'}
        </span>
        {mode === 'manual' && unitCost > 0 && (
          <span className="text-[10px] text-warning">fora do cálculo automático</span>
        )}
      </div>
    );
  };

  const getGlobalIndex = (item: ServiceOrderBudgetItem) => items.indexOf(item);

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

        <div className="overflow-hidden rounded-lg border">
          <Table className="block w-full md:table">
            <TableHeader className="hidden md:table-header-group">
              <TableRow>
                <TableHead className="text-xs">Serviço</TableHead>
                <TableHead className="w-[80px] text-xs">Qtd</TableHead>
                <TableHead className="w-[110px] text-xs">{pricingEnabled ? 'Cliente paga / un.' : 'Valor Unit.'}</TableHead>
                <TableHead className="w-[110px] text-xs">Total</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="block md:table-row-group">
              {serviceItems.length === 0 ? (
                <TableRow className="block md:table-row">
                  <TableCell colSpan={5} className="block py-4 text-center text-xs text-muted-foreground md:table-cell">
                    Nenhum serviço adicionado.
                  </TableCell>
                </TableRow>
              ) : (
                serviceItems.map((item) => {
                  const idx = getGlobalIndex(item);
                  return (
                    <TableRow key={idx} className="grid grid-cols-2 gap-3 p-3 md:table-row md:p-0">
                      <TableCell className="col-span-2 p-0 text-sm font-medium md:table-cell md:p-4 md:text-xs">
                        {item.description}
                        {pricingControl(item, idx)}
                      </TableCell>
                      <TableCell className="p-0 text-xs md:table-cell md:p-4">
                        <span className="mb-0.5 block text-[10px] text-muted-foreground md:hidden">Quantidade</span>
                        {readOnly ? (
                          <span className="tabular-nums">{item.quantity} serviço(s)</span>
                        ) : (
                          <EditableDecimalValue
                            value={Number(item.quantity || 0)}
                            onCommit={quantity => updateItem(idx, { quantity })}
                            ariaLabel={`Quantidade de ${item.description}`}
                            maxDecimals={3}
                          />
                        )}
                      </TableCell>
                      <TableCell className="p-0 text-right text-xs md:table-cell md:p-4 md:text-left">
                        <span className="mb-0.5 block text-[10px] text-muted-foreground md:hidden">{pricingEnabled ? 'Cliente paga / un.' : 'Valor unitário'}</span>
                        {readOnly ? (
                          <span className="whitespace-nowrap tabular-nums">{money(item.unit_price || 0)}</span>
                        ) : (
                          <EditableDecimalValue
                            value={Number(item.unit_price || 0)}
                            onCommit={unit_price => updateItem(idx, {
                              unit_price,
                              pricing_mode: 'manual',
                              price_override: unit_price,
                            })}
                            ariaLabel={`Valor unitário de ${item.description}`}
                            maxDecimals={2}
                            allowZero
                          />
                        )}
                      </TableCell>
                      <TableCell className="p-0 text-xs font-medium md:table-cell md:p-4">
                        <span className="mb-0.5 block text-[10px] font-normal text-muted-foreground md:hidden">Total</span>
                        <span className="whitespace-nowrap tabular-nums">{money(item.total_price || 0)}</span>
                      </TableCell>
                      <TableCell className="flex justify-end p-0 md:table-cell md:p-4">
                        {!readOnly && (
                          <Button
                            type="button"
                            variant="destructive-ghost"
                            size="icon"
                            className="h-7 w-7"
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
              {!readOnly && showServicePicker && (
                <ServiceInputRow
                  serviceOptions={serviceOptions}
                  serviceTypes={serviceTypes ?? []}
                  onAdd={addItem}
                />
              )}
              {serviceItems.length > 0 && (
                <TableRow className="grid grid-cols-[1fr_auto] items-center bg-muted/30 px-3 py-2 md:table-row md:px-0 md:py-0">
                  <TableCell colSpan={3} className="p-0 text-xs font-medium text-muted-foreground md:table-cell md:p-4 md:text-right">
                    Subtotal Serviços
                  </TableCell>
                  <TableCell className="p-0 text-right text-xs font-bold text-foreground md:table-cell md:p-4 md:text-left">
                    {money(servicesSubtotal)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell" />
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

        <div className="overflow-hidden rounded-lg border">
          <Table className="block w-full md:table">
            <TableHeader className="hidden md:table-header-group">
              <TableRow>
                <TableHead className="text-xs">Material</TableHead>
                <TableHead className="w-[80px] text-xs">Qtd</TableHead>
                <TableHead className="w-[110px] text-xs">{pricingEnabled ? 'Cliente paga / un.' : 'Valor Unit.'}</TableHead>
                <TableHead className="w-[110px] text-xs">Total</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="block md:table-row-group">
              {!readOnly && (
                <MaterialInputRow
                  materialOptions={materialOptions}
                  inventoryItems={inventoryItems ?? []}
                  onAdd={addItem}
                />
              )}
              {materialItems.length === 0 ? (
                <TableRow className="block md:table-row">
                  <TableCell colSpan={5} className="block py-4 text-center text-xs text-muted-foreground md:table-cell">
                    Nenhum material adicionado.
                  </TableCell>
                </TableRow>
              ) : (
                materialItems.map((item) => {
                  const idx = getGlobalIndex(item);
                  return (
                    <TableRow key={idx} className="grid grid-cols-2 gap-3 p-3 md:table-row md:p-0">
                      <TableCell className="col-span-2 p-0 text-sm font-medium md:table-cell md:p-4 md:text-xs">
                        {item.description}
                        {pricingControl(item, idx)}
                      </TableCell>
                      <TableCell className="p-0 text-xs md:table-cell md:p-4">
                        <span className="mb-0.5 block text-[10px] text-muted-foreground md:hidden">Quantidade</span>
                        {readOnly ? (
                          <span className="tabular-nums">{item.quantity} un.</span>
                        ) : (
                          <EditableDecimalValue
                            value={Number(item.quantity || 0)}
                            onCommit={quantity => updateItem(idx, { quantity })}
                            ariaLabel={`Quantidade de ${item.description}`}
                            maxDecimals={3}
                          />
                        )}
                      </TableCell>
                      <TableCell className="p-0 text-right text-xs md:table-cell md:p-4 md:text-left">
                        <span className="mb-0.5 block text-[10px] text-muted-foreground md:hidden">{pricingEnabled ? 'Cliente paga / un.' : 'Valor unitário'}</span>
                        {readOnly ? (
                          <span className="whitespace-nowrap tabular-nums">{money(item.unit_price || 0)}</span>
                        ) : (
                          <EditableDecimalValue
                            value={Number(item.unit_price || 0)}
                            onCommit={unit_price => updateItem(idx, {
                              unit_price,
                              pricing_mode: 'manual',
                              price_override: unit_price,
                            })}
                            ariaLabel={`Valor unitário de ${item.description}`}
                            maxDecimals={2}
                            allowZero
                          />
                        )}
                      </TableCell>
                      <TableCell className="p-0 text-xs font-medium md:table-cell md:p-4">
                        <span className="mb-0.5 block text-[10px] font-normal text-muted-foreground md:hidden">Total</span>
                        <span className="whitespace-nowrap tabular-nums">{money(item.total_price || 0)}</span>
                      </TableCell>
                      <TableCell className="flex justify-end p-0 md:table-cell md:p-4">
                        {!readOnly && (
                          <Button
                            type="button"
                            variant="destructive-ghost"
                            size="icon"
                            className="h-7 w-7"
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
                <TableRow className="grid grid-cols-[1fr_auto] items-center bg-muted/30 px-3 py-2 md:table-row md:px-0 md:py-0">
                  <TableCell colSpan={3} className="p-0 text-xs font-medium text-muted-foreground md:table-cell md:p-4 md:text-right">
                    Subtotal Materiais
                  </TableCell>
                  <TableCell className="p-0 text-right text-xs font-bold text-foreground md:table-cell md:p-4 md:text-left">
                    {money(materialsSubtotal)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell" />
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
              <span className="text-xs text-muted-foreground">Serviços: {money(servicesSubtotal)}</span>
              <span className="text-xs text-muted-foreground">Materiais: {money(materialsSubtotal)}</span>
            </>
          )}
          <span className="text-sm font-bold text-foreground">
            Subtotal: {money(servicesSubtotal + materialsSubtotal)}
          </span>
        </div>
      )}
    </div>
  );
}

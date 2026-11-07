import { useEffect, useId, useMemo, useState } from 'react';
import { Calculator, Plus, Trash2 } from 'lucide-react';

import { LaborCalculatorModal } from '@/components/service-orders/LaborCalculatorModal';
import { ExtraCostModal } from '@/components/service-orders/ExtraCostModal';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { CostCustomerComparison } from '@/components/pricing/CostCustomerComparison';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { CurrencyField } from '@/components/ui/CurrencyField';
import { InventoryItemThumbnail } from '@/components/inventory/InventoryItemThumbnail';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumericInput, parseDecimalInputValue } from '@/components/ui/numeric-input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import type { CostResource } from '@/hooks/useCostResources';
import type { InventoryItem } from '@/hooks/useInventory';
import { cn } from '@/lib/utils';
import { QuoteServiceResourcesEditor } from './QuoteServiceResourcesEditor';

export interface QuoteCostLine {
  id: string;
  label: string;
  quantity: number;
  unitCost: number;
  source?: 'supply' | 'extra' | 'resource' | 'gift';
  sourceId?: string | null;
  resourceId?: string | null;
  stockItemId?: string | null;
  unit?: string | null;
}

export interface QuoteCostComposition {
  labor: { hourlyRate: number; hours: number };
  supplies: QuoteCostLine[];
  resources: QuoteCostLine[];
}

export interface QuoteServiceCostValue {
  serviceTypeId?: string | null;
  composition: QuoteCostComposition;
  saveAsCatalogDefault?: boolean;
}

interface QuoteServiceCostEditorProps {
  value: QuoteServiceCostValue;
  onChange: (value: QuoteServiceCostValue) => void;
  bdiFactor: number;
  formatMoney: (value: number) => string;
  currencySymbol: string;
  inventoryItems?: InventoryItem[];
  costResources?: CostResource[];
}

type CostSection = 'labor' | 'resources' | 'supplies' | 'summary';

const tabs: Array<{ value: CostSection; label: string }> = [
  { value: 'labor', label: 'Mão de obra' },
  { value: 'resources', label: 'Recursos' },
  { value: 'supplies', label: 'Insumos' },
  { value: 'summary', label: 'Resumo' },
];

const totalLines = (lines: QuoteCostLine[]) => lines.reduce(
  (sum, line) => sum + Math.max(0, line.quantity || 0) * Math.max(0, line.unitCost || 0),
  0,
);

export function createQuoteCostComposition(input?: Partial<QuoteCostComposition>): QuoteCostComposition {
  return {
    labor: {
      hourlyRate: Math.max(0, Number(input?.labor?.hourlyRate ?? 0)),
      hours: Math.max(0, Number(input?.labor?.hours ?? 0)),
    },
    supplies: Array.isArray(input?.supplies) ? input.supplies : [],
    resources: Array.isArray(input?.resources) ? input.resources : [],
  };
}

export function getQuoteCostCompositionTotals(composition: QuoteCostComposition) {
  const labor = Math.max(0, composition.labor.hourlyRate) * Math.max(0, composition.labor.hours);
  const supplies = totalLines(composition.supplies);
  const resources = totalLines(composition.resources);
  return { labor, supplies, resources, total: labor + supplies + resources };
}

function LocalSuppliesEditor({ lines, inventoryItems, currencySymbol, formatMoney, bdiFactor, onChange }: {
  lines: QuoteCostLine[];
  inventoryItems: InventoryItem[];
  currencySymbol: string;
  formatMoney: (value: number) => string;
  bdiFactor: number;
  onChange: (lines: QuoteCostLine[]) => void;
}) {
  const [stockItemId, setStockItemId] = useState('');
  const [manualName, setManualName] = useState('');
  const [quantityText, setQuantityText] = useState('1');
  const [costText, setCostText] = useState('');
  const selectedItem = inventoryItems.find(item => item.id === stockItemId);
  const quantity = parseDecimalInputValue(quantityText) ?? 0;
  const manualCost = parseDecimalInputValue(costText) ?? 0;
  const total = totalLines(lines);
  const inventoryOptions = inventoryItems.map(item => ({
    value: item.id,
    label: item.name,
    sublabel: item.sku ? `SKU: ${item.sku}` : undefined,
    icon: <InventoryItemThumbnail name={item.name} imageUrl={item.image_url} fit="contain" fallbackVariant="plain" className="h-9 w-9 bg-muted/30" />,
  }));

  const addSupply = () => {
    const label = selectedItem?.name ?? manualName.trim();
    if (!label) return;
    onChange([...lines, {
      id: crypto.randomUUID(), label, quantity: Math.max(0, quantity),
      unitCost: selectedItem ? Number(selectedItem.cost_price ?? 0) : Math.max(0, manualCost),
      source: 'supply', stockItemId: selectedItem?.id ?? null, unit: selectedItem?.unit ?? 'un',
    }]);
    setStockItemId(''); setManualName(''); setQuantityText('1'); setCostText('');
  };
  const updateLine = (id: string, patch: Partial<QuoteCostLine>) => onChange(lines.map(line => line.id === id ? { ...line, ...patch } : line));

  return (
    <Card className="border-0 bg-background/80 shadow-sm">
      <CardContent className="space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h5 className="text-lg font-semibold sm:text-xl">Insumos usados no serviço</h5><p className="mt-1 text-sm text-muted-foreground">Use um item do estoque ou lance um insumo somente neste orçamento.</p></div>
          <div className="flex gap-6 text-right">
            <div><p className="text-xs text-muted-foreground">Seu custo total</p><p className="font-semibold">{formatMoney(total)}</p></div>
            <div><p className="text-xs text-muted-foreground">Referência com BDI</p><p className="font-semibold">{formatMoney(bdiFactor > 0.01 ? total / bdiFactor : total)}</p></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,2fr)_6rem_9rem_auto] lg:items-end">
          <div className="col-span-2 space-y-1.5 lg:col-span-1">
            <Label className="text-sm font-semibold text-foreground">Item do estoque</Label>
            <SearchableSelect options={inventoryOptions} value={stockItemId} onValueChange={setStockItemId} placeholder="Selecionar do estoque..." searchPlaceholder="Buscar insumo..." />
            {!stockItemId && <Input className="mt-2" value={manualName} onChange={event => setManualName(event.target.value)} placeholder="Ou informe um insumo avulso" aria-label="Nome do insumo avulso" />}
          </div>
          <div className="space-y-1.5"><Label className="text-sm font-semibold text-foreground">Quantidade</Label><NumericInput decimal value={quantityText} onValueChange={setQuantityText} /></div>
          <div className="space-y-1.5"><Label className="text-sm font-semibold text-foreground">Custo unitário</Label><CurrencyField symbol={currencySymbol} className="max-w-40"><NumericInput decimal className="text-right" value={stockItemId ? String(selectedItem?.cost_price ?? 0).replace('.', ',') : costText} onValueChange={setCostText} disabled={!!stockItemId} /></CurrencyField></div>
          <Button type="button" className="col-span-2 h-11 bg-primary font-semibold text-primary-foreground hover:bg-primary/90 lg:col-span-1" onClick={addSupply} disabled={!selectedItem && !manualName.trim()}><Plus className="mr-2 h-4 w-4" /> Adicionar</Button>
        </div>

        {lines.length === 0 ? <div className="border-y py-10 text-center text-sm text-muted-foreground">Nenhum insumo compõe este serviço.</div> : (
          <div className="overflow-x-auto border-y">
            <div className="hidden min-w-[42rem] grid-cols-[minmax(12rem,1fr)_8rem_11rem_8rem_2.75rem] gap-3 border-b px-2 py-2 text-sm font-semibold text-foreground md:grid"><span>Insumo</span><span>Quantidade</span><span>Custo unitário</span><span className="text-right">Total</span><span /></div>
            {lines.map(line => (
              <div key={line.id} className="grid grid-cols-2 items-center gap-3 border-b px-1 py-4 last:border-b-0 md:min-w-[42rem] md:grid-cols-[minmax(12rem,1fr)_8rem_11rem_8rem_2.75rem] md:px-2 md:py-3">
                <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1"><InventoryItemThumbnail name={line.label} imageUrl={inventoryItems.find(item => item.id === line.stockItemId)?.image_url} fit="contain" fallbackVariant="plain" className="h-11 w-11 bg-muted/30" /><div className="min-w-0 flex-1"><Input className="border-0 bg-transparent px-0 font-medium shadow-none" value={line.label} onChange={event => updateLine(line.id, { label: event.target.value })} aria-label={`Nome de ${line.label}`} /><p className="text-xs text-muted-foreground">{line.stockItemId ? 'Vinculado ao estoque' : 'Insumo deste orçamento'}</p></div></div>
                <div className="space-y-1.5"><span className="block text-sm font-semibold text-foreground md:hidden">Quantidade</span><NumericInput decimal value={String(line.quantity).replace('.', ',')} onValueChange={raw => updateLine(line.id, { quantity: parseDecimalInputValue(raw) ?? 0 })} aria-label={`Quantidade de ${line.label}`} /></div>
                <div className="space-y-1.5"><span className="block text-sm font-semibold text-foreground md:hidden">Custo unitário</span><CurrencyField symbol={currencySymbol} className="max-w-44"><NumericInput decimal className="text-right" value={String(line.unitCost).replace('.', ',')} onValueChange={raw => updateLine(line.id, { unitCost: parseDecimalInputValue(raw) ?? 0 })} aria-label={`Custo unitário de ${line.label}`} /></CurrencyField></div>
                <span className="font-semibold tabular-nums md:text-right"><span className="mr-2 text-xs font-normal text-muted-foreground md:hidden">Total</span>{formatMoney(line.quantity * line.unitCost)}</span>
                <Button type="button" variant="destructive-ghost" size="icon" className="justify-self-end" aria-label={`Remover ${line.label}`} onClick={() => onChange(lines.filter(candidate => candidate.id !== line.id))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LocalResourcesEditor({ lines, resources, hours, formatMoney, onChange }: {
  lines: QuoteCostLine[];
  resources: CostResource[];
  hours: number;
  formatMoney: (value: number) => string;
  onChange: (lines: QuoteCostLine[]) => void;
}) {
  return <QuoteServiceResourcesEditor lines={lines} resources={resources} hours={hours} formatMoney={formatMoney} onChange={onChange} />;
}

export function QuoteServiceCostEditor({ value, onChange, bdiFactor, formatMoney, currencySymbol, inventoryItems = [], costResources = [] }: QuoteServiceCostEditorProps) {
  const isMobile = useIsMobile();
  const laborFieldId = useId();
  const [activeSection, setActiveSection] = useState<CostSection>('labor');
  const [laborCalculatorOpen, setLaborCalculatorOpen] = useState(false);
  const [extraCostModalOpen, setExtraCostModalOpen] = useState(false);
  const totals = useMemo(() => getQuoteCostCompositionTotals(value.composition), [value.composition]);
  const extras = value.composition.resources.filter(line => line.source === 'extra' || !line.source);
  const linkedResources = value.composition.resources.filter(line => line.source !== 'extra' && !!line.source);
  const resourcesTotal = totalLines(linkedResources);
  const extrasTotal = totalLines(extras);
  const customerPrice = bdiFactor > 0.01 ? totals.total / bdiFactor : totals.total;
  const updateComposition = (patch: Partial<QuoteCostComposition>) => onChange({ ...value, composition: { ...value.composition, ...patch } });

  useEffect(() => {
    if (costResources.length === 0) return;
    let changed = false;
    const nextResources = value.composition.resources.map(line => {
      if (line.source !== 'resource' || !line.resourceId) return line;
      const catalog = costResources.find(resource => resource.id === line.resourceId);
      if (!catalog) return line;
      const unitCost = Number(catalog.hourly_rate ?? 0) * Math.max(0, value.composition.labor.hours);
      if (Math.abs(unitCost - line.unitCost) < 0.001) return line;
      changed = true;
      return { ...line, unitCost };
    });
    if (changed) updateComposition({ resources: nextResources });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costResources, value.composition.labor.hours]);

  const updateExtra = (id: string, patch: Partial<QuoteCostLine>) => updateComposition({ resources: value.composition.resources.map(line => line.id === id ? { ...line, ...patch } : line) });

  return (
    <div className="space-y-5">
      <div className="grid gap-4 border-b pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-start">
        <div className="min-w-0"><h4 className="text-xl font-semibold leading-tight">Composição de custos deste serviço</h4><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Mão de obra, insumos e quantidades são ajustados para este orçamento. Editar o cadastro de um recurso é uma ação compartilhada, indicada no próprio editor.</p></div>
        {value.serviceTypeId && <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm', value.saveAsCatalogDefault ? 'border-primary' : 'border-border')}><Checkbox checked={value.saveAsCatalogDefault === true} onCheckedChange={checked => onChange({ ...value, saveAsCatalogDefault: checked === true })} /><span><span className="block font-semibold">Atualizar também o custo cadastrado do serviço</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{value.saveAsCatalogDefault ? 'Ao salvar este orçamento, esta composição será o padrão para os próximos orçamentos.' : 'Desmarcado: a composição vale apenas para este orçamento.'}</span></span></label>}
      </div>

      <Tabs value={activeSection} onValueChange={next => setActiveSection(next as CostSection)}>
        {isMobile ? <MobilePillTabs variant="underline" tabs={tabs} activeTab={activeSection} onTabChange={next => setActiveSection(next as CostSection)} /> : (
          <div className="flex gap-1 overflow-x-auto border-b no-scrollbar">{tabs.map(tab => <button key={tab.value} type="button" onClick={() => setActiveSection(tab.value)} className={cn('mb-[-1px] shrink-0 whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium transition-colors', activeSection === tab.value ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{tab.label}</button>)}</div>
        )}

        <TabsContent value="labor" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-0 bg-background/80 shadow-sm"><CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3"><h5 className="text-lg font-semibold sm:text-xl">Mão de obra</h5><Button type="button" className="h-11 shrink-0 bg-primary font-semibold text-primary-foreground hover:bg-primary/90" size="sm" onClick={() => setLaborCalculatorOpen(true)}><Calculator className="mr-1.5 h-4 w-4" /> Calcular</Button></div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                <div className="space-y-1.5"><Label htmlFor={`${laborFieldId}-rate`} className="text-sm font-semibold text-foreground">Custo por hora</Label><CurrencyField symbol={currencySymbol} className="max-w-48"><NumericInput id={`${laborFieldId}-rate`} decimal className="text-right" value={String(value.composition.labor.hourlyRate).replace('.', ',')} onValueChange={raw => updateComposition({ labor: { ...value.composition.labor, hourlyRate: parseDecimalInputValue(raw) ?? 0 } })} /></CurrencyField></div>
                <div className="space-y-1.5"><Label htmlFor={`${laborFieldId}-hours`} className="text-sm font-semibold text-foreground">Horas do serviço</Label><NumericInput id={`${laborFieldId}-hours`} decimal value={String(value.composition.labor.hours).replace('.', ',')} onValueChange={raw => updateComposition({ labor: { ...value.composition.labor, hours: parseDecimalInputValue(raw) ?? 0 } })} /></div>
              </div>
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Custo HH</p><p className="font-semibold">{formatMoney(totals.labor)}</p></div>
            </CardContent></Card>

            <Card className="border-0 bg-background/80 shadow-sm lg:col-span-2"><CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3"><h5 className="text-lg font-semibold sm:text-xl">Custos extras</h5><Button type="button" className="h-11 shrink-0 bg-primary font-semibold text-primary-foreground hover:bg-primary/90" size="sm" onClick={() => setExtraCostModalOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Adicionar</Button></div>
              {extras.length === 0 ? <div className="rounded-lg bg-muted/30 p-8 text-center text-sm text-muted-foreground">Nenhum custo extra adicionado.</div> : <div className="space-y-2">{extras.map(line => <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_2.75rem] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_2.75rem]">
                <div className="col-span-2 space-y-1 sm:col-span-1"><Label className="text-sm font-semibold text-foreground">Descrição</Label><Input value={line.label} onChange={event => updateExtra(line.id, { label: event.target.value })} /></div>
                <div className="space-y-1"><Label className="text-sm font-semibold text-foreground">Valor</Label><CurrencyField symbol={currencySymbol}><NumericInput decimal className="text-right" value={String(line.unitCost).replace('.', ',')} onValueChange={raw => updateExtra(line.id, { unitCost: parseDecimalInputValue(raw) ?? 0 })} /></CurrencyField></div>
                <Button type="button" variant="destructive-ghost" size="icon" aria-label={`Remover ${line.label}`} onClick={() => updateComposition({ resources: value.composition.resources.filter(candidate => candidate.id !== line.id) })}><Trash2 className="h-4 w-4" /></Button>
              </div>)}</div>}
              <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3"><span className="text-xs text-muted-foreground">Total de extras</span><span className="font-semibold">{formatMoney(extrasTotal)}</span></div>
            </CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="resources" className="mt-4"><LocalResourcesEditor lines={value.composition.resources} resources={costResources} hours={value.composition.labor.hours} formatMoney={formatMoney} onChange={resources => updateComposition({ resources })} /></TabsContent>
        <TabsContent value="supplies" className="mt-4"><LocalSuppliesEditor lines={value.composition.supplies} inventoryItems={inventoryItems} currencySymbol={currencySymbol} formatMoney={formatMoney} bdiFactor={bdiFactor} onChange={supplies => updateComposition({ supplies })} /></TabsContent>
        <TabsContent value="summary" className="mt-4"><Card className="border-0 bg-background/80 shadow-sm"><CardContent className="space-y-5 p-4 sm:p-5">
          <div className="flex items-center gap-2"><Calculator className="h-4 w-4" /><p className="text-base font-semibold">Resumo do custo do serviço</p></div>
          <p className="text-sm leading-relaxed text-muted-foreground">Mão de obra, insumos, recursos e extras são custos da empresa. A referência com BDI usa o coeficiente do orçamento; a cobrança segue a modalidade escolhida no item.</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[['Mão de obra', totals.labor], ['Insumos', totals.supplies], ['Recursos', resourcesTotal], ['Extras', extrasTotal]].map(([label, amount]) => <div key={String(label)} className="rounded-xl bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{formatMoney(Number(amount))}</p></div>)}</div>
          <CostCustomerComparison cost={totals.total} customerPrice={customerPrice} formatValue={formatMoney} costLabel="Seu custo total para executar" customerLabel="Referência com BDI" note={`Referência antes dos descontos. O preço final segue a modalidade do item. Coeficiente ${bdiFactor.toFixed(4)}.`} />
        </CardContent></Card></TabsContent>
      </Tabs>

      <LaborCalculatorModal open={laborCalculatorOpen} onOpenChange={setLaborCalculatorOpen} onApply={(hourlyRate, hours) => updateComposition({ labor: { hourlyRate, hours } })} />
      <ExtraCostModal open={extraCostModalOpen} onOpenChange={setExtraCostModalOpen} onAdd={(label, amount) => updateComposition({ resources: [...value.composition.resources, { id: crypto.randomUUID(), label, quantity: 1, unitCost: amount, source: 'extra' }] })} />
    </div>
  );
}

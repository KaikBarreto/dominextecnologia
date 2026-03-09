import { useState, useEffect, useMemo } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, Calculator, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { formatBRL } from '@/utils/currency';
import { useCostResourceItems, type CostResource, type CostResourceCategory } from '@/hooks/useCostResources';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface CostItem {
  id?: string;
  name: string;
  value: number;
  is_monthly: boolean;
  annual_value: number | null;
  // Gift-specific fields
  total_cost: number | null;
  total_units: number | null;
  qty_per_gift: number | null;
}

interface CostResourceFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource?: CostResource | null;
  category: CostResourceCategory;
  onSave: (data: {
    name: string;
    monthly_hours: number;
    is_active: boolean;
    notes: string;
    items: CostItem[];
  }) => void;
  isPending?: boolean;
}

const DEFAULT_VEHICLE_ITEMS: CostItem[] = [
  { name: 'Depreciação mensal', value: 0, is_monthly: true, annual_value: null, total_cost: null, total_units: null, qty_per_gift: null },
  { name: 'Manutenção + Combustível', value: 0, is_monthly: true, annual_value: null, total_cost: null, total_units: null, qty_per_gift: null },
  { name: 'Seguro', value: 0, is_monthly: false, annual_value: 0, total_cost: null, total_units: null, qty_per_gift: null },
  { name: 'Documentação / IPVA', value: 0, is_monthly: false, annual_value: 0, total_cost: null, total_units: null, qty_per_gift: null },
];

const DEFAULT_TOOL_ITEMS: CostItem[] = [
  { name: 'Depreciação mensal', value: 0, is_monthly: true, annual_value: null, total_cost: null, total_units: null, qty_per_gift: null },
  { name: 'Manutenção mensal', value: 0, is_monthly: true, annual_value: null, total_cost: null, total_units: null, qty_per_gift: null },
];

const DEFAULT_EPI_ITEMS: CostItem[] = [
  { name: 'Custo mensal do kit', value: 0, is_monthly: true, annual_value: null, total_cost: null, total_units: null, qty_per_gift: null },
];

const DEFAULT_GIFT_ITEMS: CostItem[] = [
  { name: 'Cartão de visita', value: 0, is_monthly: false, annual_value: null, total_cost: 0, total_units: 1, qty_per_gift: 1 },
];

function getDefaultItems(category: CostResourceCategory): CostItem[] {
  switch (category) {
    case 'vehicle': return DEFAULT_VEHICLE_ITEMS;
    case 'tool': return DEFAULT_TOOL_ITEMS;
    case 'epi': return DEFAULT_EPI_ITEMS;
    case 'gift': return DEFAULT_GIFT_ITEMS;
    default: return [{ name: 'Custo mensal', value: 0, is_monthly: true, annual_value: null, total_cost: null, total_units: null, qty_per_gift: null }];
  }
}

const categoryLabels: Record<CostResourceCategory, string> = {
  vehicle: 'Veículo',
  tool: 'Ferramenta',
  gift: 'Brinde',
  epi: 'EPI / Uniforme',
  other: 'Outro',
};

export function CostResourceFormSheet({
  open,
  onOpenChange,
  resource,
  category,
  onSave,
  isPending,
}: CostResourceFormSheetProps) {
  const { data: existingItems } = useCostResourceItems(resource?.id ?? null);

  const [name, setName] = useState('');
  const [monthlyHours, setMonthlyHours] = useState(176);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<CostItem[]>([]);
  
  const [depCalcOpen, setDepCalcOpen] = useState(false);
  const [value0km, setValue0km] = useState(0);
  const [value2years, setValue2years] = useState(0);

  useEffect(() => {
    if (open) {
      if (resource) {
        setName(resource.name);
        setMonthlyHours(resource.monthly_hours);
        setIsActive(resource.is_active);
        setNotes(resource.notes ?? '');
        setItems(existingItems?.map(i => ({
          id: i.id,
          name: i.name,
          value: i.value,
          is_monthly: i.is_monthly,
          annual_value: i.annual_value,
          total_cost: (i as any).total_cost ?? null,
          total_units: (i as any).total_units ?? null,
          qty_per_gift: (i as any).qty_per_gift ?? null,
        })) ?? []);
      } else {
        setName('');
        setMonthlyHours(176);
        setIsActive(true);
        setNotes('');
        setItems(getDefaultItems(category));
      }
      setValue0km(0);
      setValue2years(0);
    }
  }, [open, resource, existingItems, category]);

  const isGift = category === 'gift';

  // For gifts: value = unit_cost * qty_per_gift
  const recalcGiftItem = (item: CostItem): CostItem => {
    if (!isGift) return item;
    const tc = item.total_cost ?? 0;
    const tu = item.total_units ?? 1;
    const unitCost = tu > 0 ? tc / tu : 0;
    const qty = item.qty_per_gift ?? 1;
    return { ...item, value: unitCost * qty };
  };

  const totalMonthly = useMemo(() => items.reduce((sum, item) => sum + (item.value || 0), 0), [items]);
  const hourlyRate = useMemo(() => monthlyHours > 0 ? totalMonthly / monthlyHours : 0, [totalMonthly, monthlyHours]);
  const calculatedDepreciation = useMemo(() => {
    if (value0km > 0 && value2years >= 0 && value0km > value2years) return (value0km - value2years) / 24;
    return 0;
  }, [value0km, value2years]);

  const handleAddItem = () => {
    if (isGift) {
      setItems([...items, { name: '', value: 0, is_monthly: false, annual_value: null, total_cost: 0, total_units: 1, qty_per_gift: 1 }]);
    } else {
      setItems([...items, { name: '', value: 0, is_monthly: true, annual_value: null, total_cost: null, total_units: null, qty_per_gift: null }]);
    }
  };
  const handleRemoveItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const handleItemChange = (index: number, field: keyof CostItem, value: any) => {
    setItems(items.map((item, i) => {
      if (i !== index) return item;
      let updated = { ...item, [field]: value };

      if (isGift) {
        // Recalculate value for gift items
        updated = recalcGiftItem(updated);
      } else {
        if (field === 'is_monthly' && !value && updated.annual_value) updated.value = updated.annual_value / 12;
        if (field === 'annual_value' && !item.is_monthly) updated.value = (value || 0) / 12;
      }
      return updated;
    }));
  };

  const applyDepreciation = () => {
    const depIndex = items.findIndex(i => i.name.toLowerCase().includes('deprecia'));
    if (depIndex >= 0) handleItemChange(depIndex, 'value', calculatedDepreciation);
    setDepCalcOpen(false);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      monthly_hours: monthlyHours,
      is_active: isActive,
      notes: notes.trim(),
      items: items.filter(i => i.name.trim()),
    });
  };

  const footer = (
    <Button className="w-full" onClick={handleSubmit} disabled={!name.trim() || isPending}>
      <Save className="h-4 w-4 mr-2" />
      {isPending ? 'Salvando...' : 'Salvar'}
    </Button>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`${resource ? 'Editar' : 'Novo'} ${categoryLabels[category]}`}
      className="sm:max-w-[540px]"
      footer={footer}
    >
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          {isGift
            ? 'Cadastre os itens que compõem o brinde. O custo unitário é calculado automaticamente.'
            : 'Componentes de custo serão rateados automaticamente por hora.'}
        </p>

        {/* Basic fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome do {isGift ? 'brinde' : 'recurso'}</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={isGift ? 'Ex: Kit de Boas-Vindas' : `Ex: ${category === 'vehicle' ? 'Spin 2024' : category === 'tool' ? 'Manômetro Testo' : 'Kit Padrão'}`}
            />
          </div>

          {!isGift && (
            <div className="space-y-2">
              <Label>Horas de uso mensal (para rateio)</Label>
              <Input type="number" min={1} value={monthlyHours} onChange={e => setMonthlyHours(Number(e.target.value) || 176)} />
              <p className="text-xs text-muted-foreground">Padrão: 176h (22 dias × 8h)</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label>{isGift ? 'Brinde ativo' : 'Recurso ativo'}</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        {/* Depreciation calculator for vehicles */}
        {category === 'vehicle' && (
          <Collapsible open={depCalcOpen} onOpenChange={setDepCalcOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Calculadora de Depreciação
                </span>
                {depCalcOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Fórmula: (Valor 0km − Valor após 2 anos) ÷ 24 meses</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Valor 0km (R$)</Label>
                      <Input type="number" min={0} value={value0km || ''} onChange={e => setValue0km(Number(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Valor após 2 anos (R$)</Label>
                      <Input type="number" min={0} value={value2years || ''} onChange={e => setValue2years(Number(e.target.value) || 0)} />
                    </div>
                  </div>
                  {calculatedDepreciation > 0 && (
                    <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                      <span className="text-sm">Depreciação mensal:</span>
                      <span className="font-semibold text-primary">R$ {formatBRL(calculatedDepreciation)}</span>
                    </div>
                  )}
                  <Button size="sm" variant="secondary" className="w-full" disabled={calculatedDepreciation <= 0} onClick={applyDepreciation}>
                    Aplicar ao campo de depreciação
                  </Button>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Cost items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>{isGift ? 'Itens do Brinde' : 'Componentes de Custo'}</Label>
            <Button size="sm" variant="outline" onClick={handleAddItem}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
            </Button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <Card key={index}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder={isGift ? 'Nome do item (ex: Cartão de Visita)' : 'Nome do componente'}
                      value={item.name}
                      onChange={e => handleItemChange(index, 'name', e.target.value)}
                      className="flex-1"
                    />
                    <Button variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive" onClick={() => handleRemoveItem(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {isGift ? (
                    /* Gift-specific: total cost, total units, qty per gift */
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Custo total (R$)</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="500,00"
                            value={item.total_cost ?? ''}
                            onChange={e => handleItemChange(index, 'total_cost', Number(e.target.value) || 0)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Unidades no lote</Label>
                          <Input
                            type="number"
                            min={1}
                            step="1"
                            placeholder="500"
                            value={item.total_units ?? ''}
                            onChange={e => handleItemChange(index, 'total_units', Number(e.target.value) || 1)}
                          />
                        </div>
                      </div>

                      {/* Calculated unit cost */}
                      {(item.total_cost ?? 0) > 0 && (item.total_units ?? 0) > 0 && (
                        <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md text-sm">
                          <span className="text-muted-foreground">Custo unitário:</span>
                          <span className="font-semibold text-foreground">
                            R$ {formatBRL((item.total_cost ?? 0) / (item.total_units ?? 1))}
                          </span>
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label className="text-xs">Quantidade por brinde</Label>
                        <Input
                          type="number"
                          min={1}
                          step="1"
                          placeholder="1"
                          value={item.qty_per_gift ?? ''}
                          onChange={e => handleItemChange(index, 'qty_per_gift', Number(e.target.value) || 1)}
                        />
                      </div>

                      {/* Subtotal for this item per gift */}
                      {item.value > 0 && (
                        <div className="flex items-center justify-between p-2 bg-primary/5 rounded-md text-sm">
                          <span className="text-muted-foreground">Custo por brinde deste item:</span>
                          <span className="font-semibold text-primary">R$ {formatBRL(item.value)}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Standard cost items */
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Switch id={`annual-${index}`} checked={!item.is_monthly} onCheckedChange={checked => handleItemChange(index, 'is_monthly', !checked)} />
                        <Label htmlFor={`annual-${index}`} className="text-xs cursor-pointer">Valor anual (÷12)</Label>
                      </div>
                      {!item.is_monthly ? (
                        <div className="flex-1 flex items-center gap-2">
                          <Input type="number" min={0} step="0.01" placeholder="Valor anual" value={item.annual_value ?? ''} onChange={e => handleItemChange(index, 'annual_value', Number(e.target.value) || 0)} className="flex-1" />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">= R$ {formatBRL(item.value)}/mês</span>
                        </div>
                      ) : (
                        <Input type="number" min={0} step="0.01" placeholder="Valor mensal" value={item.value || ''} onChange={e => handleItemChange(index, 'value', Number(e.target.value) || 0)} className="flex-1" />
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {items.length === 0 && (
              <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-md">
                {isGift ? 'Nenhum item de brinde adicionado' : 'Nenhum componente de custo adicionado'}
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label>Observações</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações internas sobre este recurso..." rows={2} />
        </div>

        {/* Preview */}
        <Card className="bg-muted/30">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium text-foreground">Resumo</p>
            {isGift ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Itens no brinde:</span>
                  <span>{items.filter(i => i.name.trim()).length}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-border">
                  <span className="font-medium text-primary">Custo total por brinde:</span>
                  <span className="text-lg font-bold text-primary">R$ {formatBRL(totalMonthly)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total mensal:</span>
                  <span className="font-semibold">R$ {formatBRL(totalMonthly)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Horas mensais:</span>
                  <span>{monthlyHours}h</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-border">
                  <span className="font-medium text-primary">Custo/hora:</span>
                  <span className="text-lg font-bold text-primary">R$ {formatBRL(hourlyRate)}/h</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ResponsiveModal>
  );
}

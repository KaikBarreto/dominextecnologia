import { useEffect, useMemo, useState } from 'react';
import { Calculator, Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useServiceCosts, type ExtraCostLine, computeExtraCostsTotal } from '@/hooks/useServiceCosts';
import { useServiceMaterials } from '@/hooks/useServiceMaterials';
import { ServiceMaterialsList } from '@/components/service-orders/ServiceMaterialsList';
import { usePricingSettings } from '@/hooks/usePricingSettings';
import { useBDICalculator } from '@/hooks/useBDICalculator';
import { formatBRL } from '@/utils/currency';
import { LaborCalculatorModal } from '@/components/service-orders/LaborCalculatorModal';
import { ExtraCostModal } from '@/components/service-orders/ExtraCostModal';
import { LinkedResourcesSection } from '@/components/service-orders/LinkedResourcesSection';

export function ServiceCostsTab() {
  const { serviceTypes } = useServiceTypes();
  const [serviceId, setServiceId] = useState<string>('');
  const { cost, saveCost } = useServiceCosts(serviceId || null);
  const { totalCost: materialsTotal } = useServiceMaterials(serviceId || null);

  const serviceOptions = useMemo(
    () => serviceTypes.map((st) => ({ value: st.id, label: st.name })),
    [serviceTypes]
  );

  const [hourlyRate, setHourlyRate] = useState(0);
  const [hours, setHours] = useState(1);
  const [notes, setNotes] = useState('');
  const [extraCosts, setExtraCosts] = useState<ExtraCostLine[]>([]);

  useEffect(() => {
    if (!cost) {
      setHourlyRate(0);
      setHours(1);
      setNotes('');
      setExtraCosts([]);
      return;
    }
    setHourlyRate(Number(cost.hourly_rate ?? 0));
    setHours(Number(cost.hours ?? 1));
    setNotes(cost.notes ?? '');
    setExtraCosts(((cost.extra_costs as any) ?? []) as ExtraCostLine[]);
  }, [cost, serviceId]);

  const extrasTotal = useMemo(() => computeExtraCostsTotal(extraCosts), [extraCosts]);
  const laborCost = useMemo(() => Math.max(0, hourlyRate * hours), [hourlyRate, hours]);
  const totalServiceCost = useMemo(
    () => laborCost + extrasTotal + (materialsTotal || 0),
    [laborCost, extrasTotal, materialsTotal]
  );

  const { settings } = usePricingSettings();
  const taxRate = Number(settings?.tax_rate ?? 10);
  const adminRate = Number(settings?.admin_indirect_rate ?? 12);
  const profitRate = Number(settings?.default_profit_rate ?? 10);
  const kmCost = Number(settings?.km_cost ?? 1);
  const cardDiscountRate = Number(settings?.card_discount_rate ?? 6);
  const cardInstallments = Number(settings?.card_installments ?? 10);

  const bdi = useBDICalculator({
    taxRate,
    adminRate,
    profitRate,
    items: [{ totalCost: totalServiceCost, profitRate }],
    distanceKm: 0,
    kmCost,
    cardDiscountRate,
    cardInstallments,
  });

  const [laborCalcOpen, setLaborCalcOpen] = useState(false);
  const [extraCostModalOpen, setExtraCostModalOpen] = useState(false);

  const addExtraLine = (label: string, amount: number) => {
    setExtraCosts((prev) => [...prev, { label, amount }]);
  };

  const updateExtraLine = (idx: number, next: Partial<ExtraCostLine>) => {
    setExtraCosts((prev) => prev.map((l, i) => (i === idx ? { ...l, ...next } : l)));
  };

  const removeExtraLine = (idx: number) => {
    setExtraCosts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    await saveCost.mutateAsync({
      hourly_rate: hourlyRate,
      hours,
      extra_costs: extraCosts,
      notes,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-foreground">Custos por Tipo de Serviço</p>
              <p className="text-sm text-muted-foreground">Defina mão de obra e materiais para precificação automática.</p>
            </div>
            <div className="w-full sm:w-96">
              <Label className="text-xs">Tipo de serviço</Label>
              <SearchableSelect
                options={serviceOptions}
                value={serviceId}
                onValueChange={setServiceId}
                placeholder="Selecione o tipo de serviço"
              />
            </div>
          </div>

          {!serviceId ? (
            <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
              Selecione um tipo de serviço para configurar custos.
            </div>
          ) : (
            <Tabs defaultValue="mao_de_obra" className="w-full">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="mao_de_obra">Mão de obra</TabsTrigger>
                <TabsTrigger value="materiais">Materiais</TabsTrigger>
                <TabsTrigger value="resumo">Resumo</TabsTrigger>
              </TabsList>

              <TabsContent value="mao_de_obra" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">Mão de obra</p>
                        <Button size="sm" variant="outline" onClick={() => setLaborCalcOpen(true)}>
                          <Calculator className="h-3.5 w-3.5 mr-1" />Calcular
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Custo / hora (R$)</Label>
                          <Input type="number" min={0} step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Horas</Label>
                          <Input type="number" min={0} step="0.25" value={hours} onChange={(e) => setHours(Number(e.target.value) || 0)} />
                        </div>
                      </div>
                      <div className="rounded-lg border border-border p-3 bg-muted/30">
                        <p className="text-xs text-muted-foreground">Custo HH</p>
                        <p className="text-sm font-semibold text-foreground">R$ {formatBRL(laborCost)}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">Custos extras</p>
                        <Button size="sm" variant="outline" onClick={() => setExtraCostModalOpen(true)}>
                          + Adicionar
                        </Button>
                      </div>

                      {extraCosts.length === 0 ? (
                        <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
                          Nenhum custo extra.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {extraCosts.map((l, idx) => (
                            <div key={idx} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
                              <div className="sm:col-span-4 space-y-1">
                                <Label className="text-xs">Descrição</Label>
                                <Input value={l.label} onChange={(e) => updateExtraLine(idx, { label: e.target.value })} />
                              </div>
                              <div className="sm:col-span-2 space-y-1">
                                <Label className="text-xs">Valor (R$)</Label>
                                <div className="flex gap-2">
                                  <Input type="number" min={0} step="0.01" value={l.amount} onChange={(e) => updateExtraLine(idx, { amount: Number(e.target.value) || 0 })} />
                                  <Button variant="destructive-ghost" size="icon" onClick={() => removeExtraLine(idx)} className="h-10 w-10">
                                    ×
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/30">
                        <span className="text-xs text-muted-foreground">Total extras</span>
                        <span className="text-sm font-semibold text-foreground">R$ {formatBRL(extrasTotal)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-3">
                    <CardContent className="p-4 space-y-2">
                      <Label className="text-xs">Observações</Label>
                      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Observações internas do custo" />
                      <div className="flex justify-end">
                        <Button onClick={handleSave} disabled={saveCost.isPending}>
                          <Save className="h-4 w-4 mr-2" />
                          {saveCost.isPending ? 'Salvando...' : 'Salvar'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="materiais" className="mt-4">
                <ServiceMaterialsList serviceId={serviceId} />
              </TabsContent>

              <TabsContent value="resumo" className="mt-4">
                <Card>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-primary" />
                      <p className="text-sm font-semibold text-foreground">Resumo e preço sugerido (BDI)</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-xs text-muted-foreground">Mão de obra</p>
                        <p className="text-sm font-semibold text-foreground">R$ {formatBRL(laborCost)}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-xs text-muted-foreground">Materiais</p>
                        <p className="text-sm font-semibold text-foreground">R$ {formatBRL(materialsTotal || 0)}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-xs text-muted-foreground">Extras</p>
                        <p className="text-sm font-semibold text-foreground">R$ {formatBRL(extrasTotal)}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border p-4 bg-muted/30">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">Custo total</p>
                        <p className="text-lg font-bold text-foreground">R$ {formatBRL(totalServiceCost)}</p>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">Preço sugerido (BDI)</p>
                        <p className="text-lg font-bold text-foreground">R$ {formatBRL(bdi.finalPrice)}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        BDI: {bdi.bdiFactor.toFixed(4)} | Lucro padrão: {profitRate.toFixed(2)}%
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      <LaborCalculatorModal
        open={laborCalcOpen}
        onOpenChange={setLaborCalcOpen}
        onApply={(rate) => setHourlyRate(rate)}
      />
      <ExtraCostModal
        open={extraCostModalOpen}
        onOpenChange={setExtraCostModalOpen}
        onAdd={addExtraLine}
      />
    </div>
  );
}

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Calculator, Save, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useServiceCosts, type ExtraCostLine, computeExtraCostsTotal } from '@/hooks/useServiceCosts';
import { useServiceMaterials } from '@/hooks/useServiceMaterials';
import { ServiceMaterialsList } from '@/components/service-orders/ServiceMaterialsList';
import { usePricingSettings } from '@/hooks/usePricingSettings';
import { useBDICalculator } from '@/hooks/useBDICalculator';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { LaborCalculatorModal } from '@/components/service-orders/LaborCalculatorModal';
import { ExtraCostModal } from '@/components/service-orders/ExtraCostModal';
import { LinkedResourcesSection } from '@/components/service-orders/LinkedResourcesSection';
import { useCompanyModules } from '@/hooks/useCompanyModules';

export function ServiceCostsTab() {
  const { locale, currency } = useAppLocaleContext();
  const tsc = MESSAGES[locale].app.crm.serviceCosts;
  const fmt = (v: number) => formatMoney(v, currency, locale);

  const { hasModule } = useCompanyModules();
  const hasPricing = hasModule('pricing_advanced');
  const isMobile = useIsMobile();
  const { serviceTypes } = useServiceTypes();
  const [serviceId, setServiceId] = useState<string>('');
  const [costsTab, setCostsTab] = useState<string>('mao_de_obra');

  // Auto-select first service type
  useEffect(() => {
    if (!serviceId && serviceTypes.length > 0) {
      setServiceId(serviceTypes[0].id);
    }
  }, [serviceTypes, serviceId]);
  const { cost, saveCost } = useServiceCosts(serviceId || null);
  const { totalCost: materialsTotal } = useServiceMaterials(serviceId || null);

  const serviceOptions = useMemo(
    () => serviceTypes.map((st) => ({
      value: st.id,
      label: st.name,
      icon: <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: st.color }} />,
    })),
    [serviceTypes]
  );

  const [hourlyRate, setHourlyRate] = useState(0);
  const [hours, setHours] = useState(1);
  const [notes, setNotes] = useState('');
  const [extraCosts, setExtraCosts] = useState<ExtraCostLine[]>([]);
  const [savedIndicator, setSavedIndicator] = useState(false);

  // Track if data was loaded from DB (to avoid saving empty state)
  const loadedRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadedRef.current = false;
    if (!cost) {
      setHourlyRate(0);
      setHours(1);
      setNotes('');
      setExtraCosts([]);
      loadedRef.current = true;
      return;
    }
    setHourlyRate(Number(cost.hourly_rate ?? 0));
    setHours(Number(cost.hours ?? 1));
    setNotes(cost.notes ?? '');
    setExtraCosts(((cost.extra_costs as any) ?? []) as ExtraCostLine[]);
    // Small delay to avoid triggering auto-save on load
    setTimeout(() => { loadedRef.current = true; }, 200);
  }, [cost?.id, serviceId]);

  const extrasTotal = useMemo(() => computeExtraCostsTotal(extraCosts), [extraCosts]);
  const laborCost = useMemo(() => Math.max(0, hourlyRate * hours), [hourlyRate, hours]);
  
  // Track linked resources total
  const [linkedResourcesTotal, setLinkedResourcesTotal] = useState(0);
  
  const totalServiceCost = useMemo(
    () => laborCost + extrasTotal + (materialsTotal || 0) + linkedResourcesTotal,
    [laborCost, extrasTotal, materialsTotal, linkedResourcesTotal]
  );

  const { settings } = usePricingSettings();
  const defaultTaxRate = Number(settings?.tax_rate ?? 10);
  const defaultAdminRate = Number(settings?.admin_indirect_rate ?? 12);
  const defaultProfitRate = Number(settings?.default_profit_rate ?? 10);
  const kmCost = Number(settings?.km_cost ?? 1);
  const cardDiscountRate = Number(settings?.card_discount_rate ?? 6);
  const cardInstallments = Number(settings?.card_installments ?? 10);

  // Simulacao local do BDI — NAO persiste, nao altera configuracoes nem orcamento
  const [simTax, setSimTax] = useState<number>(defaultTaxRate);
  const [simAdmin, setSimAdmin] = useState<number>(defaultAdminRate);
  const [simProfit, setSimProfit] = useState<number>(defaultProfitRate);

  useEffect(() => {
    // volta ao padrao quando os settings carregam ou troca de servico
    setSimTax(defaultTaxRate);
    setSimAdmin(defaultAdminRate);
    setSimProfit(defaultProfitRate);
  }, [defaultTaxRate, defaultAdminRate, defaultProfitRate, serviceId]);

  const isSimDirty = simTax !== defaultTaxRate || simAdmin !== defaultAdminRate || simProfit !== defaultProfitRate;

  const bdi = useBDICalculator({
    taxRate: simTax,
    adminRate: simAdmin,
    profitRate: simProfit,
    items: [{ totalCost: totalServiceCost, profitRate: simProfit }],
    distanceKm: 0,
    kmCost,
    cardDiscountRate,
    cardInstallments,
  });

  const [laborCalcOpen, setLaborCalcOpen] = useState(false);
  const [extraCostModalOpen, setExtraCostModalOpen] = useState(false);

  // Auto-save with debounce
  const triggerAutoSave = useCallback(() => {
    if (!serviceId || !loadedRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      await saveCost.mutateAsync({ hourly_rate: hourlyRate, hours, extra_costs: extraCosts, notes });
      setSavedIndicator(true);
      setTimeout(() => setSavedIndicator(false), 2000);
    }, 1000);
  }, [serviceId, hourlyRate, hours, extraCosts, notes, saveCost]);

  // Trigger auto-save when data changes
  useEffect(() => {
    triggerAutoSave();
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [hourlyRate, hours, extraCosts, notes]);

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
    await saveCost.mutateAsync({ hourly_rate: hourlyRate, hours, extra_costs: extraCosts, notes });
    setSavedIndicator(true);
    setTimeout(() => setSavedIndicator(false), 2000);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-foreground">{tsc.title}</p>
              <p className="text-sm text-muted-foreground">{tsc.subtitle}</p>
            </div>
            <div className="w-full sm:w-96">
              <Label className="text-xs">{tsc.serviceTypeLabel}</Label>
              <SearchableSelect
                options={serviceOptions}
                value={serviceId}
                onValueChange={setServiceId}
                placeholder={tsc.serviceTypePlaceholder}
              />
            </div>
          </div>

          {!serviceId ? (
            <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
              {tsc.noServiceSelected}
            </div>
          ) : (
            <Tabs value={costsTab} onValueChange={setCostsTab} className="w-full">
              {isMobile ? (
                <MobilePillTabs
                  tabs={[
                    { value: 'mao_de_obra', label: tsc.tabLabor },
                    ...(hasPricing ? [{ value: 'recursos', label: tsc.tabResources }] : []),
                    { value: 'materiais', label: tsc.tabMaterials },
                    ...(hasPricing ? [{ value: 'resumo', label: tsc.tabSummary }] : []),
                  ]}
                  activeTab={costsTab}
                  onTabChange={setCostsTab}
                />
              ) : (
                <div className="flex gap-1 border-b overflow-x-auto no-scrollbar">
                  {[
                    { value: 'mao_de_obra', label: tsc.tabLabor },
                    ...(hasPricing ? [{ value: 'recursos', label: tsc.tabResources }] : []),
                    { value: 'materiais', label: tsc.tabMaterials },
                    ...(hasPricing ? [{ value: 'resumo', label: tsc.tabSummary }] : []),
                  ].map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setCostsTab(tab.value)}
                      className={cn(
                        'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap shrink-0',
                        costsTab === tab.value ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}

              <TabsContent value="mao_de_obra" className="mt-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">{tsc.laborTitle}</p>
                        <Button size="sm" variant="outline" onClick={() => setLaborCalcOpen(true)}>
                          <Calculator className="h-3.5 w-3.5 mr-1" />{tsc.laborCalculate}
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">{tsc.laborHourlyCost}</Label>
                          <Input type="number" min={0} step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">{tsc.laborHours}</Label>
                          <NumericInput decimal value={String(hours ?? '')} onValueChange={(v) => setHours(Number(v.replace(',', '.')) || 0)} />
                        </div>
                      </div>
                      <div className="rounded-lg border border-border p-3 bg-muted/30">
                        <p className="text-xs text-muted-foreground">{tsc.laborHHCost}</p>
                        <p className="text-sm font-semibold text-foreground">{fmt(laborCost)}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">{tsc.extrasTitle}</p>
                        <Button size="sm" variant="outline" onClick={() => setExtraCostModalOpen(true)}>
                          {tsc.extrasAdd}
                        </Button>
                      </div>

                      {extraCosts.length === 0 ? (
                        <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
                          {tsc.extrasEmpty}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {extraCosts.map((l, idx) => (
                            <div key={idx} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
                              <div className="sm:col-span-4 space-y-1">
                                <Label className="text-xs">{tsc.extrasDescLabel}</Label>
                                <Input value={l.label} onChange={(e) => updateExtraLine(idx, { label: e.target.value })} />
                              </div>
                              <div className="sm:col-span-2 space-y-1">
                                <Label className="text-xs">{tsc.extrasValueLabel}</Label>
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
                        <span className="text-xs text-muted-foreground">{tsc.extrasTotal}</span>
                        <span className="text-sm font-semibold text-foreground">{fmt(extrasTotal)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-3">
                    <CardContent className="p-4 space-y-2">
                      <Label className="text-xs">{tsc.notesLabel}</Label>
                      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={tsc.notesPlaceholder} />
                      <div className="flex items-center justify-end gap-2">
                        {savedIndicator && (
                          <span className="text-xs text-success flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> {tsc.savedAuto}
                          </span>
                        )}
                        <Button onClick={handleSave} disabled={saveCost.isPending} variant="outline">
                          {saveCost.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                          {tsc.saveButton}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {hasPricing && (
                <TabsContent value="recursos" className="mt-4">
                  <LinkedResourcesSection
                    serviceId={serviceId}
                    serviceHours={hours}
                    onTotalChange={setLinkedResourcesTotal}
                  />
                </TabsContent>
              )}

              <TabsContent value="materiais" className="mt-4">
                <ServiceMaterialsList serviceId={serviceId} />
              </TabsContent>

              {hasPricing && (
                <TabsContent value="resumo" className="mt-4">
                  <Card>
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <Calculator className="h-4 w-4 text-primary" />
                        <p className="text-sm font-semibold text-foreground">{tsc.summaryTitle}</p>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-lg border border-border p-3">
                          <p className="text-xs text-muted-foreground">{tsc.summaryLabor}</p>
                          <p className="text-sm font-semibold text-foreground">{fmt(laborCost)}</p>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                          <p className="text-xs text-muted-foreground">{tsc.summaryMaterials}</p>
                          <p className="text-sm font-semibold text-foreground">{fmt(materialsTotal || 0)}</p>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                          <p className="text-xs text-muted-foreground">{tsc.summaryResources}</p>
                          <p className="text-sm font-semibold text-foreground">{fmt(linkedResourcesTotal)}</p>
                        </div>
                        <div className="rounded-lg border border-border p-3">
                          <p className="text-xs text-muted-foreground">{tsc.summaryExtras}</p>
                          <p className="text-sm font-semibold text-foreground">{fmt(extrasTotal)}</p>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border p-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">{tsc.simTax}</Label>
                            <NumericInput decimal value={String(simTax)} onValueChange={(v) => setSimTax(Number(v.replace(',', '.')) || 0)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{tsc.simAdmin}</Label>
                            <NumericInput decimal value={String(simAdmin)} onValueChange={(v) => setSimAdmin(Number(v.replace(',', '.')) || 0)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{tsc.simProfit}</Label>
                            <NumericInput decimal value={String(simProfit)} onValueChange={(v) => setSimProfit(Number(v.replace(',', '.')) || 0)} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">{tsc.simHint}</p>
                          {isSimDirty && (
                            <Button variant="ghost" size="sm" onClick={() => { setSimTax(defaultTaxRate); setSimAdmin(defaultAdminRate); setSimProfit(defaultProfitRate); }}>
                              {tsc.simReset}
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border p-4 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-foreground">{tsc.summaryTotalCost}</p>
                          <p className="text-lg font-bold text-foreground">{fmt(totalServiceCost)}</p>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">{tsc.summarySuggestedPrice}</p>
                          <p className="text-lg font-bold text-foreground">{fmt(bdi.finalPrice)}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {tsc.summaryBdiFactor
                            .replace('{factor}', bdi.bdiFactor.toFixed(4))
                            .replace('{profit}', simProfit.toFixed(2))}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          )}
        </CardContent>
      </Card>

      <LaborCalculatorModal
        open={laborCalcOpen}
        onOpenChange={setLaborCalcOpen}
        onApply={(rate, h) => {
          setHourlyRate(rate);
          setHours(h);
        }}
      />
      <ExtraCostModal
        open={extraCostModalOpen}
        onOpenChange={setExtraCostModalOpen}
        onAdd={addExtraLine}
      />
    </div>
  );
}

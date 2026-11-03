import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Calculator, Save, CheckCircle2, Loader2, Trash2, Wrench } from 'lucide-react';
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
import { useServiceCosts, type ExtraCostLine } from '@/hooks/useServiceCosts';
import { useServiceMaterials } from '@/hooks/useServiceMaterials';
import { useServiceCostResources } from '@/hooks/useServiceCostResources';
import { serviceCostBreakdownQueryKey } from '@/hooks/useServiceCostBreakdown';
import { ServiceMaterialsList } from '@/components/service-orders/ServiceMaterialsList';
import { usePricingSettings } from '@/hooks/usePricingSettings';
import { useBDICalculator } from '@/hooks/useBDICalculator';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { readPastedCents } from '@/lib/money-paste-mask';
import { LaborCalculatorModal } from '@/components/service-orders/LaborCalculatorModal';
import { ExtraCostModal } from '@/components/service-orders/ExtraCostModal';
import { LinkedResourcesSection } from '@/components/service-orders/LinkedResourcesSection';
import { useAuth } from '@/contexts/AuthContext';
import { computeServiceCostBreakdown } from '@/lib/serviceCostBreakdown';
import { CostCustomerComparison } from '@/components/pricing/CostCustomerComparison';
import { ListDetailLayout, type ListDetailItem, type ListDetailSortOption } from '@/components/ui/ListDetailLayout';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FilterButton } from '@/components/ui/FilterButton';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** Número salvo → texto do campo. Vazio quando 0/nulo (nunca "0" travado) e vírgula como separador. */
const toNumericText = (n?: number | null) => (!n ? '' : String(n).replace('.', ','));

const UI = {
  listTitle: 'Tipos de serviço',
  listDescription: 'Selecione um serviço para configurar sua composição de custos.',
  searchPlaceholder: 'Buscar tipo de serviço...',
  emptyList: 'Nenhum tipo de serviço encontrado.',
  selectTitle: 'Selecione um tipo de serviço',
  selectDescription: 'A composição de mão de obra, recursos, materiais e o resumo aparecerão aqui.',
  active: 'Ativo',
  inactive: 'Inativo',
  statusFilter: 'Situação',
  sortNameAsc: 'Nome (A–Z)',
  sortNameDesc: 'Nome (Z–A)',
  deleteExtra: 'Excluir custo extra',
  deleteExtraDescription: 'Este custo será removido da composição do serviço e o total será recalculado.',
  cancel: 'Cancelar',
  delete: 'Excluir',
};

function ServiceTypeAvatar({
  color,
  className = 'h-10 w-10',
}: {
  color: string;
  className?: string;
}) {
  // `service_types` não possui campo de ícone. Wrench é o motivo canônico do
  // domínio nas telas de Serviços e funciona como fallback estável.
  return (
    <span
      data-service-type-avatar
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-lg text-white ${className}`}
      style={{ backgroundColor: color }}
    >
      <Wrench className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

export function ServiceCostsTab() {
  const { locale, currency } = useAppLocaleContext();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const tsc = MESSAGES[locale].app.crm.serviceCosts;
  const fmt = (v: number) => formatMoney(v, currency, locale);

  const isMobile = useIsMobile();
  const { serviceTypes, isLoading: serviceTypesLoading } = useServiceTypes();
  const [serviceId, setServiceId] = useState<string>('');
  const [costsTab, setCostsTab] = useState<string>('mao_de_obra');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const { cost, saveCost, isLoading: costLoading, error: costError } = useServiceCosts(serviceId || null);
  const {
    materials,
    isLoading: materialsLoading,
    error: materialsError,
  } = useServiceMaterials(serviceId || null);

  const [hourlyRate, setHourlyRate] = useState(0);
  const [hours, setHours] = useState(1);
  const [notes, setNotes] = useState('');
  const [extraCosts, setExtraCosts] = useState<ExtraCostLine[]>([]);
  const [pendingExtraDeleteIndex, setPendingExtraDeleteIndex] = useState<number | null>(null);
  const [savedIndicator, setSavedIndicator] = useState(false);

  // Track if data was loaded from DB (to avoid saving empty state)
  const loadedRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const flushSaveRef = useRef<() => void>(() => {});

  useEffect(() => {
    loadedRef.current = false;
    if (costLoading || !serviceId) return;
    if (!cost) {
      setHourlyRate(0);
      setHours(1);
      setNumericText((prev) => ({ ...prev, hours: toNumericText(1) }));
      setNotes('');
      setExtraCosts([]);
      loadedRef.current = true;
      return;
    }
    setHourlyRate(Number(cost.hourly_rate ?? 0));
    setHours(Number(cost.hours ?? 1));
    setNumericText((prev) => ({ ...prev, hours: toNumericText(Number(cost.hours ?? 1)) }));
    setNotes(cost.notes ?? '');
    setExtraCosts(((cost.extra_costs as unknown) ?? []) as ExtraCostLine[]);
    // Small delay to avoid triggering auto-save on load
    const loadedTimer = setTimeout(() => { loadedRef.current = true; }, 200);
    return () => clearTimeout(loadedTimer);
    // O estado local já contém as edições do mesmo registro; reidratar a cada
    // refetch do objeto apagaria o que estiver sendo digitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cost?.id, costLoading, serviceId]);

  // Recursos carregam junto da seleção do serviço, independentemente da aba
  // ativa. Isso elimina o antigo Resumo=0 até a pessoa visitar "Recursos".
  const resourcesState = useServiceCostResources(serviceId || null, hours);

  const costBreakdown = useMemo(() => computeServiceCostBreakdown({
    hourlyRate,
    hours,
    extraCosts,
    materials,
    resourceLinks: resourcesState.linkedResources,
    resources: resourcesState.linkedResources.map((linked) => linked.resource),
    gifts: resourcesState.gifts,
  }), [extraCosts, hourlyRate, hours, materials, resourcesState.gifts, resourcesState.linkedResources]);
  const laborCost = costBreakdown.laborCost;
  const materialsTotal = costBreakdown.materialsCost;
  const extrasTotal = costBreakdown.extrasCost;
  const linkedResourcesTotal = costBreakdown.linkedResourcesCost;
  const totalServiceCost = costBreakdown.totalCost;

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

  // Texto cru dos campos decimais (horas + simulação de BDI). Existe porque um
  // input controlado por NUMBER engole a vírgula no meio da digitação: "17,"
  // volta pra 17, o campo re-renderiza "17" e o usuário, digitando 17,99
  // naturalmente, acabava salvando 1799. Guardar a string crua no estado e
  // parsear só no uso é a régua da casa (mesmo padrão do InventoryFormDialog).
  const [numericText, setNumericText] = useState<Record<'hours' | 'simTax' | 'simAdmin' | 'simProfit', string>>({
    hours: toNumericText(hours), simTax: toNumericText(simTax), simAdmin: toNumericText(simAdmin), simProfit: toNumericText(simProfit),
  });

  useEffect(() => {
    // volta ao padrao quando os settings carregam ou troca de servico
    setSimTax(defaultTaxRate);
    setSimAdmin(defaultAdminRate);
    setSimProfit(defaultProfitRate);
    setNumericText((prev) => ({
      ...prev,
      simTax: toNumericText(defaultTaxRate),
      simAdmin: toNumericText(defaultAdminRate),
      simProfit: toNumericText(defaultProfitRate),
    }));
  }, [defaultTaxRate, defaultAdminRate, defaultProfitRate, serviceId]);

  // Atualiza o texto exibido do campo E deriva o número usado no cálculo/salvo.
  const handleNumericChange = (field: 'hours' | 'simTax' | 'simAdmin' | 'simProfit', raw: string) => {
    setNumericText((prev) => ({ ...prev, [field]: raw }));
    const num = raw.trim() === '' ? 0 : (parseFloat(raw.replace(',', '.')) || 0);
    if (field === 'hours') setHours(num);
    else if (field === 'simTax') setSimTax(num);
    else if (field === 'simAdmin') setSimAdmin(num);
    else setSimProfit(num);
  };

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
    dirtyRef.current = true;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      await saveCost.mutateAsync({ hourly_rate: hourlyRate, hours, extra_costs: extraCosts, notes });
      dirtyRef.current = false;
      setSavedIndicator(true);
      setTimeout(() => setSavedIndicator(false), 2000);
    }, 1000);
  }, [serviceId, hourlyRate, hours, extraCosts, notes, saveCost]);

  const flushSave = useCallback(() => {
    if (!serviceId || !loadedRef.current || !dirtyRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
    dirtyRef.current = false;
    saveCost.mutate({ hourly_rate: hourlyRate, hours, extra_costs: extraCosts, notes });
  }, [extraCosts, hourlyRate, hours, notes, saveCost, serviceId]);

  flushSaveRef.current = flushSave;
  useEffect(() => () => flushSaveRef.current(), []);

  // Trigger auto-save when data changes
  useEffect(() => {
    triggerAutoSave();
    // A mutação do React Query não faz parte do dado editável; reagir à sua
    // identidade criaria novo debounce após cada render do estado da mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // `<input type="number">` deixa colar "4.550" como float válido do HTML
  // (ponto = decimal do navegador) e normaliza pra "4.55" — 1000x menor que
  // os R$ 4.550,00 pretendidos (bug real, 2026-09-17). DIGITAR não muda:
  // continua number nativo. Só o COLAR é interceptado e reinterpretado como
  // valor pronto via `readPastedCents` (mesma leitura do
  // `src/lib/money-paste-mask.ts`).
  const handleHourlyRatePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const cents = readPastedCents(e);
    if (cents == null) return;
    setHourlyRate(cents / 100);
  };
  const handleExtraAmountPaste = (idx: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const cents = readPastedCents(e);
    if (cents == null) return;
    updateExtraLine(idx, { amount: cents / 100 });
  };

  const handleSave = async () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
    await saveCost.mutateAsync({ hourly_rate: hourlyRate, hours, extra_costs: extraCosts, notes });
    dirtyRef.current = false;
    setSavedIndicator(true);
    setTimeout(() => setSavedIndicator(false), 2000);
  };

  const detailLoading = !!serviceId && (costLoading || materialsLoading || resourcesState.isLoading);
  const detailError = costError || materialsError || resourcesState.error;

  // Mantém o snapshot canônico em cache enquanto a pessoa edita. Ao abrir o
  // orçamento logo em seguida, o mesmo valor entra no item sem uma nova espera
  // nem risco de ler as horas antigas durante o debounce do salvamento.
  useEffect(() => {
    const companyId = profile?.company_id;
    if (!companyId || !serviceId || detailLoading || detailError) return;
    queryClient.setQueryData(
      serviceCostBreakdownQueryKey(companyId, serviceId),
      costBreakdown,
    );
  }, [costBreakdown, detailError, detailLoading, profile?.company_id, queryClient, serviceId]);

  const selectedService = useMemo(
    () => serviceTypes.find((service) => service.id === serviceId) ?? null,
    [serviceId, serviceTypes],
  );
  const visibleServices = useMemo(
    () => serviceTypes.filter((service) => (
      statusFilter.length === 0
      || statusFilter.includes(service.is_active ? 'active' : 'inactive')
    )),
    [serviceTypes, statusFilter],
  );
  const listItems = useMemo<ListDetailItem[]>(() => visibleServices.map((service) => ({
    id: service.id,
    title: service.name,
    subtitle: service.description || (service.is_active ? UI.active : UI.inactive),
    searchText: [service.name, service.description, service.is_active ? UI.active : UI.inactive]
      .filter(Boolean)
      .join(' '),
    leading: <ServiceTypeAvatar color={service.color} />,
    trailing: (
      <Badge variant={service.is_active ? 'success' : 'muted'} className="text-[9px]">
        {service.is_active ? UI.active : UI.inactive}
      </Badge>
    ),
  })), [visibleServices]);
  const sortOptions = useMemo<ListDetailSortOption[]>(() => {
    const byName = (a: ListDetailItem, b: ListDetailItem) =>
      a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
    return [
      { value: 'name-asc', label: UI.sortNameAsc, shortLabel: 'A–Z', compare: byName },
      { value: 'name-desc', label: UI.sortNameDesc, shortLabel: 'Z–A', compare: (a, b) => byName(b, a) },
    ];
  }, []);

  const handleSelectService = useCallback((nextServiceId: string) => {
    if (nextServiceId === serviceId) return;
    flushSave();
    loadedRef.current = false;
    dirtyRef.current = false;
    setCostsTab('mao_de_obra');
    setServiceId(nextServiceId);
  }, [flushSave, serviceId]);

  useEffect(() => {
    if (serviceId && !visibleServices.some((service) => service.id === serviceId)) {
      flushSave();
      setServiceId('');
    }
  }, [flushSave, serviceId, visibleServices]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground sm:text-xl">{tsc.title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{tsc.subtitle}</p>
      </div>

      {serviceTypesLoading ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            {[1, 2, 3, 4, 5].map((index) => <Skeleton key={index} className="h-16 w-full" />)}
          </div>
          <Skeleton className="hidden min-h-[32rem] w-full lg:block" />
        </div>
      ) : (
        <ListDetailLayout
          items={listItems}
          selectedId={serviceId || undefined}
          listTitle={UI.listTitle}
          listDescription={UI.listDescription}
          listFilters={(
            <FilterButton
              activeCount={statusFilter.length > 0 ? 1 : 0}
              onClear={() => setStatusFilter([])}
              embedded
            >
              <FilterCheckboxGroup
                label={UI.statusFilter}
                options={[
                  { value: 'active', label: UI.active },
                  { value: 'inactive', label: UI.inactive },
                ]}
                selected={statusFilter}
                onChange={setStatusFilter}
                emptyLabel="Todas as situações"
              />
            </FilterButton>
          )}
          sortOptions={sortOptions}
          pageSize={25}
          storageKey="service-costs-types"
          searchPlaceholder={UI.searchPlaceholder}
          emptyLabel={UI.emptyList}
          mobileDetailOpen={!!serviceId}
          onSelect={handleSelectService}
        >
          {!selectedService ? (
            <div className="flex min-h-[28rem] items-center justify-center">
              <EmptyState
                size="compact"
                icon={<Wrench className="h-10 w-10" />}
                title={UI.selectTitle}
                description={UI.selectDescription}
              />
            </div>
          ) : (
            <div className="min-w-0 space-y-4">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground lg:hidden"
                onClick={() => {
                  flushSave();
                  setServiceId('');
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar aos tipos de serviço
              </button>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ServiceTypeAvatar
                      color={selectedService.color}
                      className="h-10 w-10"
                    />
                    <h3 className="text-lg font-semibold text-foreground">{selectedService.name}</h3>
                    <Badge variant={selectedService.is_active ? 'success' : 'muted'}>
                      {selectedService.is_active ? UI.active : UI.inactive}
                    </Badge>
                  </div>
                  {selectedService.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{selectedService.description}</p>
                  )}
                </div>
              </div>

              {detailLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-56 w-full" />
                </div>
              ) : detailError ? (
                <EmptyState
                  size="compact"
                  icon={<Wrench className="h-10 w-10" />}
                  title="Não foi possível carregar os custos"
                  description="Tente selecionar o serviço novamente. Nenhuma informação foi alterada."
                />
              ) : (
                <Tabs value={costsTab} onValueChange={setCostsTab} className="w-full">
              {isMobile ? (
                <MobilePillTabs
                  variant="underline"
                  tabs={[
                    { value: 'mao_de_obra', label: tsc.tabLabor },
                    { value: 'recursos', label: tsc.tabResources },
                    { value: 'materiais', label: tsc.tabMaterials },
                    { value: 'resumo', label: tsc.tabSummary },
                  ]}
                  activeTab={costsTab}
                  onTabChange={setCostsTab}
                />
              ) : (
                <div className="flex gap-1 border-b overflow-x-auto no-scrollbar">
                  {[
                    { value: 'mao_de_obra', label: tsc.tabLabor },
                    { value: 'recursos', label: tsc.tabResources },
                    { value: 'materiais', label: tsc.tabMaterials },
                    { value: 'resumo', label: tsc.tabSummary },
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
                  <Card className="border-0 bg-background/80 shadow-sm">
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
                          <Input type="number" min={0} step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value) || 0)} onPaste={handleHourlyRatePaste} onBlur={flushSave} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">{tsc.laborHours}</Label>
                          <NumericInput decimal value={numericText.hours} onValueChange={(v) => handleNumericChange('hours', v)} onBlur={flushSave} />
                        </div>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">{tsc.laborHHCost}</p>
                        <p className="text-sm font-semibold text-foreground">{fmt(laborCost)}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 bg-background/80 shadow-sm lg:col-span-2">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">{tsc.extrasTitle}</p>
                        <Button size="sm" variant="outline" onClick={() => setExtraCostModalOpen(true)}>
                          {tsc.extrasAdd}
                        </Button>
                      </div>

                      {extraCosts.length === 0 ? (
                        <div className="rounded-lg bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                          {tsc.extrasEmpty}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {extraCosts.map((l, idx) => (
                            <div key={idx} className="grid grid-cols-1 sm:grid-cols-6 gap-2 items-end">
                              <div className="sm:col-span-4 space-y-1">
                                <Label className="text-xs">{tsc.extrasDescLabel}</Label>
                                <Input value={l.label} onChange={(e) => updateExtraLine(idx, { label: e.target.value })} onBlur={flushSave} />
                              </div>
                              <div className="sm:col-span-2 space-y-1">
                                <Label className="text-xs">{tsc.extrasValueLabel}</Label>
                                <div className="flex gap-2">
                                  <Input type="number" min={0} step="0.01" value={l.amount} onChange={(e) => updateExtraLine(idx, { amount: Number(e.target.value) || 0 })} onPaste={handleExtraAmountPaste(idx)} onBlur={flushSave} />
                                  <Button
                                    type="button"
                                    variant="destructive-ghost"
                                    size="icon"
                                    onClick={() => setPendingExtraDeleteIndex(idx)}
                                    className="h-10 w-10"
                                    aria-label={`${UI.deleteExtra}: ${l.label || idx + 1}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                        <span className="text-xs text-muted-foreground">{tsc.extrasTotal}</span>
                        <span className="text-sm font-semibold text-foreground">{fmt(extrasTotal)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 bg-background/80 shadow-sm lg:col-span-3">
                    <CardContent className="p-4 space-y-2">
                      <Label className="text-xs">{tsc.notesLabel}</Label>
                      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={tsc.notesPlaceholder} onBlur={flushSave} />
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

              <TabsContent value="recursos" className="mt-4">
                <LinkedResourcesSection
                  serviceId={serviceId}
                  serviceHours={hours}
                  resourcesState={resourcesState}
                />
              </TabsContent>

              <TabsContent value="materiais" className="mt-4">
                <ServiceMaterialsList serviceId={serviceId} bdiFactor={bdi.bdiFactor} />
              </TabsContent>

              <TabsContent value="resumo" className="mt-4">
                  <Card className="border-0 bg-background/80 shadow-sm">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <Calculator className="h-4 w-4 text-primary" />
                        <p className="text-sm font-semibold text-foreground">{tsc.summaryTitle}</p>
                      </div>

                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Mão de obra, materiais, recursos e extras abaixo são custos da empresa. O preço ao cliente é formado aplicando as taxas do BDI sobre esse custo total.
                      </p>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-xl bg-muted/30 p-3 shadow-sm">
                          <p className="text-xs text-muted-foreground">{tsc.summaryLabor}</p>
                          <p className="text-sm font-semibold text-foreground">{fmt(laborCost)}</p>
                        </div>
                        <div className="rounded-xl bg-muted/30 p-3 shadow-sm">
                          <p className="text-xs text-muted-foreground">{tsc.summaryMaterials}</p>
                          <p className="text-sm font-semibold text-foreground">{fmt(materialsTotal || 0)}</p>
                        </div>
                        <div className="rounded-xl bg-muted/30 p-3 shadow-sm">
                          <p className="text-xs text-muted-foreground">{tsc.summaryResources}</p>
                          <p className="text-sm font-semibold text-foreground">{fmt(linkedResourcesTotal)}</p>
                        </div>
                        <div className="rounded-xl bg-muted/30 p-3 shadow-sm">
                          <p className="text-xs text-muted-foreground">{tsc.summaryExtras}</p>
                          <p className="text-sm font-semibold text-foreground">{fmt(extrasTotal)}</p>
                        </div>
                      </div>

                      <div className="space-y-3 px-1 py-2">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">{tsc.simTax}</Label>
                            <NumericInput decimal value={numericText.simTax} onValueChange={(v) => handleNumericChange('simTax', v)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{tsc.simAdmin}</Label>
                            <NumericInput decimal value={numericText.simAdmin} onValueChange={(v) => handleNumericChange('simAdmin', v)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{tsc.simProfit}</Label>
                            <NumericInput decimal value={numericText.simProfit} onValueChange={(v) => handleNumericChange('simProfit', v)} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">{tsc.simHint}</p>
                          {isSimDirty && (
                            <Button variant="ghost" size="sm" onClick={() => {
                              setSimTax(defaultTaxRate);
                              setSimAdmin(defaultAdminRate);
                              setSimProfit(defaultProfitRate);
                              setNumericText((prev) => ({
                                ...prev,
                                simTax: toNumericText(defaultTaxRate),
                                simAdmin: toNumericText(defaultAdminRate),
                                simProfit: toNumericText(defaultProfitRate),
                              }));
                            }}>
                              {tsc.simReset}
                            </Button>
                          )}
                        </div>
                      </div>

                      <CostCustomerComparison
                        cost={totalServiceCost}
                        customerPrice={bdi.finalPrice}
                        formatValue={fmt}
                        costLabel="Seu custo total para executar"
                        customerLabel="Cliente paga com BDI"
                        note={`Preço sugerido antes de descontos. Coeficiente ${bdi.bdiFactor.toFixed(4)}, com imposto ${simTax.toFixed(2)}%, administração ${simAdmin.toFixed(2)}% e lucro ${simProfit.toFixed(2)}%.`}
                      />
                    </CardContent>
                  </Card>
              </TabsContent>
                </Tabs>
              )}
            </div>
          )}
        </ListDetailLayout>
      )}

      <LaborCalculatorModal
        open={laborCalcOpen}
        onOpenChange={setLaborCalcOpen}
        onApply={(rate, h) => {
          setHourlyRate(rate);
          setHours(h);
          setNumericText((prev) => ({ ...prev, hours: toNumericText(h) }));
        }}
      />
      <ExtraCostModal
        open={extraCostModalOpen}
        onOpenChange={setExtraCostModalOpen}
        onAdd={addExtraLine}
      />

      <AlertDialog
        open={pendingExtraDeleteIndex != null}
        onOpenChange={(open) => { if (!open) setPendingExtraDeleteIndex(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{UI.deleteExtra}</AlertDialogTitle>
            <AlertDialogDescription>{UI.deleteExtraDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{UI.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingExtraDeleteIndex != null) removeExtraLine(pendingExtraDeleteIndex);
                setPendingExtraDeleteIndex(null);
              }}
            >
              {UI.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

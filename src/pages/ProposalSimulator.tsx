import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Building2,
  Check,
  Copy,
  Crown,
  Eye,
  EyeOff,
  Network,
  Plus,
  Printer,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePublicSubscriptionPlans, type PublicSubscriptionPlan } from '@/hooks/usePublicSubscriptionPlans';
import { cn } from '@/lib/utils';
import {
  MAX_PROPOSAL_UNITS,
  calculateProposalTotals,
  createProposalUnit,
  defaultUnitName,
  parsePublicProposal,
  serializePublicProposal,
  type ProposalUnit,
} from '@/lib/publicProposal';
import { formatBRL } from '@/utils/currency';
import logoBlack from '@/assets/logo-black-horizontal.png';

const MODULE_LABELS: Record<string, string> = {
  basic: 'Gestão completa de serviços e equipes',
  customer_portal: 'Portal do cliente',
  rh: 'Funcionários, ponto e RH',
  finance_advanced: 'Financeiro avançado, DRE e DFC',
  contracts: 'Contratos e PMOC',
  crm: 'CRM e Kanban',
  nfe: 'Emissão de notas fiscais',
  pricing_advanced: 'Precificação avançada e BDI',
  white_label: 'Sistema com a sua marca',
};

const PLAN_ACCENTS: Record<string, { icon: typeof Zap; className: string }> = {
  start: { icon: Zap, className: 'bg-emerald-600 text-white' },
  avancado: { icon: Building2, className: 'bg-blue-600 text-white' },
  master: { icon: Crown, className: 'bg-amber-500 text-white' },
};

const PROPOSAL_BENEFITS = [
  '14 dias grátis, sem cartão',
  'Implantação guiada e tutoriais completos',
  'Suporte humano pelo WhatsApp',
  'Atualizações e melhorias contínuas',
];

function planAccent(code: string) {
  return PLAN_ACCENTS[code] ?? { icon: Sparkles, className: 'bg-primary text-primary-foreground' };
}

function money(value: number) {
  return `R$ ${formatBRL(value)}`;
}

function planModules(plan: PublicSubscriptionPlan): string[] {
  return plan.includedModules
    .map((code) => MODULE_LABELS[code])
    .filter((label): label is string => Boolean(label));
}

function ProposalPrice({
  monthly,
  yearlyFull,
  yearlyDiscounted,
  savings,
  pixInstallment,
}: {
  monthly: number;
  yearlyFull: number;
  yearlyDiscounted: number;
  savings: number;
  pixInstallment: number;
}) {
  return (
    <div className="space-y-2 border-t border-border/40 pt-5">
      <p className="text-3xl font-bold tracking-tight lg:text-4xl">
        {money(monthly)}<span className="text-base font-normal text-muted-foreground">/mês</span>
      </p>
      <p className="text-sm">
        <span className="text-destructive line-through">{money(yearlyFull)}</span>{' '}
        <span className="font-semibold">{money(yearlyDiscounted)}/ano</span>
        {' '}<span className="text-muted-foreground">(20% de desconto)</span>
      </p>
      <p className="text-sm font-medium text-emerald-600">
        {money(savings)} de economia no plano anual
      </p>
      <p className="text-sm text-muted-foreground">3x de {money(pixInstallment)} no Pix</p>
      <p className="text-xs text-muted-foreground">
        O valor apresentado considera somente os planos escolhidos por unidade.
      </p>
    </div>
  );
}

function PlanFeatureList({ plan }: { plan: PublicSubscriptionPlan }) {
  const modules = planModules(plan);
  return (
    <div className="space-y-2.5">
      {modules.map((label) => (
        <p key={label} className="flex items-start gap-2 text-sm text-muted-foreground">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{label}</span>
        </p>
      ))}
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <span>Até {plan.maxUsers} usuários inclusos</span>
      </p>
    </div>
  );
}

export default function ProposalSimulator() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialState = useMemo(() => parsePublicProposal(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [clientName, setClientName] = useState(initialState.clientName);
  const [units, setUnits] = useState<ProposalUnit[]>(initialState.units);
  const [pricesHidden, setPricesHidden] = useState(initialState.pricesHidden);
  const [activeTab, setActiveTab] = useState<'proposal' | 'structure'>('proposal');
  const [openUnitId, setOpenUnitId] = useState<string | undefined>(initialState.units[0]?.id);
  const didMount = useRef(false);
  const { data: plans = [], isLoading, isError } = usePublicSubscriptionPlans();

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    setSearchParams(
      serializePublicProposal({ clientName, units, pricesHidden }),
      { replace: true },
    );
  }, [clientName, pricesHidden, setSearchParams, units]);

  useEffect(() => {
    if (plans.length === 0) return;
    const validCodes = new Set(plans.map((plan) => plan.code));
    const fallback = plans[0].code;
    setUnits((current) => {
      const shouldNormalize = current.some((unit) => !validCodes.has(unit.planCode));
      return shouldNormalize
        ? current.map((unit) => ({
            ...unit,
            planCode: validCodes.has(unit.planCode) ? unit.planCode : fallback,
          }))
        : current;
    });
  }, [plans]);

  const unitViews = useMemo(
    () => units.map((unit) => ({
      unit,
      plan: plans.find((plan) => plan.code === unit.planCode) ?? plans[0],
    })),
    [plans, units],
  );
  const totals = useMemo(() => calculateProposalTotals(units, plans), [plans, units]);

  function updateUnit(id: string, patch: Partial<ProposalUnit>) {
    setUnits((current) => current.map((unit) => (unit.id === id ? { ...unit, ...patch } : unit)));
  }

  function addUnit() {
    if (units.length >= MAX_PROPOSAL_UNITS) {
      toast.error(`A proposta aceita até ${MAX_PROPOSAL_UNITS} unidades.`);
      return;
    }
    const unit = createProposalUnit(defaultUnitName(units.length + 1), plans[0]?.code);
    setUnits((current) => [...current, unit]);
    setOpenUnitId(unit.id);
  }

  function removeUnit(id: string) {
    if (units.length === 1) return;
    const remaining = units.filter((unit) => unit.id !== id);
    setUnits(remaining);
    if (openUnitId === id) setOpenUnitId(remaining[0]?.id);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link da proposta copiado');
    } catch {
      toast.error('Não foi possível copiar o link');
    }
  }

  if (isError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-xl font-semibold">Não foi possível carregar os planos</h1>
          <p className="text-sm text-muted-foreground">Recarregue a página para tentar novamente.</p>
          <Button onClick={() => window.location.reload()}>Recarregar</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background print:bg-white">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:py-10">
        <header className="mb-6 flex flex-col gap-4 border-b border-border/40 pb-5 sm:flex-row sm:items-center sm:justify-between print:border-0 print:pb-2">
          <div className="flex items-center gap-4">
            <img src={logoBlack} alt="Dominex Tecnologia" className="h-8 w-auto dark:invert print:h-7" />
            <div className="hidden h-7 w-px bg-border sm:block" />
            <div>
              <h1 className="text-lg font-semibold sm:text-xl">Simulador de Proposta</h1>
              <p className="text-xs text-muted-foreground">Planos Dominex por unidade</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => setPricesHidden((value) => !value)}>
              {pricesHidden ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
              <span className="hidden sm:inline">{pricesHidden ? 'Mostrar preços' : 'Ocultar preços'}</span>
              <span className="sm:hidden">Preços</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void copyLink()}>
              <Copy className="mr-2 h-4 w-4" />
              Link
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
          <TabsList variant="underline" className="mb-6 w-full print:hidden">
            <TabsTrigger variant="underline" value="proposal">Proposta</TabsTrigger>
            <TabsTrigger variant="underline" value="structure">Organograma</TabsTrigger>
          </TabsList>

          <TabsContent value="proposal" className="mt-0">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
              <section className="space-y-6 print:hidden" aria-label="Configuração da proposta">
                <div className="space-y-2">
                  <Label htmlFor="proposal-client">Nome do cliente</Label>
                  <Input
                    id="proposal-client"
                    value={clientName}
                    maxLength={120}
                    onChange={(event) => setClientName(event.target.value)}
                    placeholder="Ex.: Grupo Clima Forte"
                  />
                </div>

                <Accordion
                  type="single"
                  collapsible
                  value={openUnitId}
                  onValueChange={(value) => setOpenUnitId(value || undefined)}
                  className="space-y-2"
                >
                  {units.map((unit, index) => (
                    <AccordionItem key={unit.id} value={unit.id} className="rounded-lg border border-border/40 px-4">
                      <div className="flex items-center gap-2">
                        <AccordionTrigger className="min-w-0 py-3 hover:no-underline">
                          <span className="truncate text-left">{unit.name || defaultUnitName(index + 1)}</span>
                        </AccordionTrigger>
                        {index > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => removeUnit(unit.id)}
                            aria-label={`Remover ${unit.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <AccordionContent className="space-y-5">
                        <div className="space-y-2">
                          <Label htmlFor={`unit-name-${unit.id}`}>Nome da unidade</Label>
                          <Input
                            id={`unit-name-${unit.id}`}
                            value={unit.name}
                            maxLength={80}
                            onChange={(event) => updateUnit(unit.id, { name: event.target.value })}
                            placeholder={defaultUnitName(index + 1)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`unit-plan-${unit.id}`}>Plano</Label>
                          {isLoading ? (
                            <Skeleton className="h-10 w-full" />
                          ) : (
                            <Select value={unit.planCode} onValueChange={(planCode) => updateUnit(unit.id, { planCode })}>
                              <SelectTrigger id={`unit-plan-${unit.id}`}>
                                <SelectValue placeholder="Escolha o plano" />
                              </SelectTrigger>
                              <SelectContent>
                                {plans.map((plan) => (
                                  <SelectItem key={plan.code} value={plan.code}>{plan.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <p className="text-xs text-muted-foreground">
                            O valor considera o plano completo, sem detalhar preço de módulos ou usuários.
                          </p>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>

                <Button type="button" variant="outline" className="w-full" onClick={addUnit} disabled={units.length >= MAX_PROPOSAL_UNITS}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar unidade
                </Button>
              </section>

              <section className="overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border/40 print:shadow-none" aria-label="Prévia da proposta">
                <div className="bg-neutral-950 px-5 py-5 text-white sm:px-7">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/55">Proposta Dominex</p>
                  <h2 className="mt-2 text-xl font-bold sm:text-2xl">
                    {clientName.trim() || 'Solução para sua operação'}
                  </h2>
                  <p className="mt-1 text-sm text-white/60">
                    {units.length} {units.length === 1 ? 'unidade' : 'unidades'} · planos completos e independentes
                  </p>
                </div>

                <div className="space-y-5 p-5 sm:p-7">
                  {isLoading ? (
                    <div className="space-y-4">
                      <Skeleton className="h-24 w-full" />
                      <Skeleton className="h-36 w-full" />
                    </div>
                  ) : (
                    unitViews.map(({ unit, plan }, index) => {
                      if (!plan) return null;
                      const accent = planAccent(plan.code);
                      const PlanIcon = accent.icon;
                      return (
                        <article key={unit.id} className={cn('space-y-4', index > 0 && 'border-t border-border/40 pt-5')}>
                          <div className="flex items-start gap-3">
                            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', accent.className)}>
                              <PlanIcon className="h-5 w-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-semibold">{unit.name || defaultUnitName(index + 1)}</h3>
                                {index === 0 && <Badge variant="secondary">Matriz</Badge>}
                              </div>
                              <p className="text-sm text-muted-foreground">Plano {plan.name}</p>
                            </div>
                            {!pricesHidden && (
                              <p className="shrink-0 text-sm font-semibold">{money(plan.price)}/mês</p>
                            )}
                          </div>
                          <PlanFeatureList plan={plan} />
                        </article>
                      );
                    })
                  )}

                  {!pricesHidden && !isLoading && (
                    <ProposalPrice
                      monthly={totals.monthly}
                      yearlyFull={totals.yearlyFull}
                      yearlyDiscounted={totals.yearlyDiscounted}
                      savings={totals.savings}
                      pixInstallment={totals.pixInstallment}
                    />
                  )}

                  <div className="space-y-2 border-t border-border/40 pt-5">
                    {PROPOSAL_BENEFITS.map((benefit) => (
                      <p key={benefit} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{benefit}</span>
                      </p>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="structure" className="mt-0">
            <section className="rounded-xl bg-card p-5 shadow-sm ring-1 ring-border/40 sm:p-8">
              <div className="mx-auto mb-8 flex max-w-sm flex-col items-center text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-950 text-white">
                  <Network className="h-6 w-6" />
                </span>
                <h2 className="mt-3 text-lg font-bold">{clientName.trim() || 'Sua empresa'}</h2>
                <p className="text-sm text-muted-foreground">Estrutura de unidades na Dominex</p>
              </div>

              <div className="relative mx-auto max-w-4xl pl-6 lg:pl-0">
                <div className="absolute bottom-4 left-2 top-4 w-px bg-border lg:hidden" aria-hidden />
                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  {unitViews.map(({ unit, plan }, index) => {
                    if (!plan) return null;
                    const accent = planAccent(plan.code);
                    const PlanIcon = accent.icon;
                    return (
                      <article key={unit.id} className="relative rounded-lg bg-muted/40 p-4 lg:min-h-48">
                        <span className="absolute -left-4 top-7 h-px w-4 bg-border lg:hidden" aria-hidden />
                        <div className="flex items-start gap-3">
                          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', accent.className)}>
                            <PlanIcon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold">{unit.name || defaultUnitName(index + 1)}</h3>
                            <p className="text-sm text-muted-foreground">Plano {plan.name}</p>
                          </div>
                        </div>
                        <div className="mt-4 space-y-1.5">
                          {planModules(plan).slice(0, 4).map((label) => (
                            <p key={label} className="truncate text-xs text-muted-foreground">{label}</p>
                          ))}
                        </div>
                        {!pricesHidden && <p className="mt-4 text-sm font-semibold">{money(plan.price)}/mês</p>}
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          </TabsContent>
        </Tabs>

        <footer className="mt-8 text-center text-xs text-muted-foreground print:mt-5">
          Esta simulação não inclui valores avulsos de módulos ou usuários. Condições sujeitas à validação comercial.
        </footer>
      </div>
    </main>
  );
}

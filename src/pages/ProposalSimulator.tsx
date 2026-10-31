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
  Minus,
  Moon,
  Plus,
  FileDown,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Sun,
  TableProperties,
  X,
  Zap,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  usePublicSubscriptionCatalog,
  type PublicSubscriptionModule,
  type PublicSubscriptionPlan,
} from '@/hooks/usePublicSubscriptionPlans';
import { cn } from '@/lib/utils';
import {
  BASIC_BUNDLE_DESCRIPTION,
  BASIC_BUNDLE_FEATURES,
  BASIC_BUNDLE_LABEL,
  EXTRA_USER_MODULE_CODE,
  REQUIRED_CUSTOM_MODULE_CODES,
  isRequiredCustomModule,
  isRetiredProposalModule,
} from '@/lib/subscriptionCatalog';
import {
  MAX_PROPOSAL_UNITS,
  MAX_PROPOSAL_USERS,
  MAX_PROPOSAL_INSTALLMENTS,
  MIN_PROPOSAL_INSTALLMENTS,
  BASE_MODULE_CODE,
  CUSTOM_PLAN_CODE,
  CUSTOM_PLAN_INCLUDED_USERS,
  calculateProposalTotals,
  cleanProposalDiscount,
  cleanProposalInstallments,
  createProposalUnit,
  defaultUnitName,
  maxProposalDiscountPercent,
  parsePublicProposal,
  proposalDiscountAmount,
  serializePublicProposal,
  type ProposalDiscount,
  type ProposalDiscountMode,
  type ProposalDiscountPeriod,
  type ProposalTotals,
  type ProposalUnit,
} from '@/lib/publicProposal';
import { formatBRL } from '@/utils/currency';
import logoWhite from '@/assets/logo-white-horizontal.png';
import {
  generateProposalSimulatorPdf,
  type ProposalPdfModuleValue,
} from '@/utils/proposalSimulatorPdf';

type ModulePricePeriod = 'monthly' | 'annual';

interface ProposalExportSettings {
  showModulePrices: boolean;
  modulePricePeriod: ModulePricePeriod;
  showMonthlyPrice: boolean;
  showPixInstallments: boolean;
}

const DEFAULT_EXPORT_SETTINGS: ProposalExportSettings = {
  showModulePrices: false,
  modulePricePeriod: 'monthly',
  showMonthlyPrice: true,
  showPixInstallments: true,
};

const MODULE_LABELS: Record<string, string> = {
  basic: 'Gestão completa de serviços e equipes',
  customer_portal: 'Portal do cliente',
  rh: 'Funcionários, ponto e RH',
  contracts: 'Contratos e PMOC',
  crm: 'CRM e Kanban',
  nfe: 'Emissão de notas fiscais',
  pricing_advanced: 'Orçamentos e Precificação',
  video_questions: 'Perguntas em vídeo nos checklists',
  white_label: 'White Label',
  whatsapp: 'Integração com o WhatsApp',
  cobrancas: 'Cobranças',
};

const PLAN_ACCENTS: Record<string, { icon: typeof Zap; className: string }> = {
  excecao: { icon: Zap, className: 'bg-slate-700 text-white' },
  start: { icon: Zap, className: 'bg-emerald-600 text-white' },
  avancado: { icon: Building2, className: 'bg-blue-600 text-white' },
  master: { icon: Crown, className: 'bg-amber-500 text-white' },
};

const PROPOSAL_BENEFITS = [
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

function moduleBenefits(
  moduleCodes: string[],
  catalogModules: Array<{ code: string; name: string }> = [],
): string[] {
  const catalogNames = new Map(catalogModules.map((module) => [module.code, module.name]));
  return Array.from(new Set(moduleCodes.flatMap((code) => {
    if (isRetiredProposalModule(code)) return [];
    if (code === BASE_MODULE_CODE) return [...BASIC_BUNDLE_FEATURES];
    if (isRequiredCustomModule(code)) return [];
    const label = MODULE_LABELS[code] ?? catalogNames.get(code);
    return label ? [label] : [];
  })));
}

function moduleDisplayName(module: { code: string; name: string }): string {
  return MODULE_LABELS[module.code] ?? module.name;
}

function MonthlyCatalogPrice({ price, hidden }: { price: number; hidden: boolean }) {
  if (hidden) {
    return <span aria-label="Preço oculto">••••</span>;
  }

  return (
    <>
      {money(price)}<span className="font-normal text-muted-foreground">/mês</span>
    </>
  );
}

function PricingTableRow({
  name,
  description,
  price,
  hidden,
}: {
  name: string;
  description: string;
  price: number;
  hidden: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="min-w-48 align-top font-semibold">{name}</TableCell>
      <TableCell className="min-w-80 whitespace-normal align-top leading-relaxed text-muted-foreground">
        {description}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right align-top font-semibold tabular-nums">
        <MonthlyCatalogPrice price={price} hidden={hidden} />
      </TableCell>
    </TableRow>
  );
}

function planModules(plan: PublicSubscriptionPlan): string[] {
  if (plan.code === 'excecao') {
    return [
      'Ordens de Serviço e rastreamento',
      'Agenda e tarefas',
      'Equipamentos',
      'Clientes',
    ];
  }
  return moduleBenefits([BASE_MODULE_CODE, ...plan.includedModules]);
}

function discountLabel(discount: ProposalDiscount, appliedAmount: number): string {
  if (appliedAmount <= 0) return 'sem desconto';
  return discount.mode === 'percent'
    ? `${discount.value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de desconto`
    : `${money(appliedAmount)} de desconto`;
}

function DiscountField({
  id,
  label,
  period,
  discount,
  fullPrice,
  onChange,
}: {
  id: string;
  label: string;
  period: ProposalDiscountPeriod;
  discount: ProposalDiscount;
  fullPrice: number;
  onChange: (discount: ProposalDiscount) => void;
}) {
  const maxPercent = maxProposalDiscountPercent(period);
  const maxAmount = Math.round(fullPrice * maxPercent) / 100;
  const [inputValue, setInputValue] = useState(
    discount.value > 0 ? String(discount.value).replace('.', ',') : '',
  );

  useEffect(() => {
    setInputValue(discount.value > 0 ? String(discount.value).replace('.', ',') : '');
  }, [discount.mode, discount.value]);

  function changeMode(mode: ProposalDiscountMode) {
    const appliedAmount = proposalDiscountAmount(fullPrice, discount, period);
    const convertedValue = mode === 'amount'
      ? appliedAmount
      : fullPrice > 0
        ? Math.round((appliedAmount / fullPrice) * 10_000) / 100
        : 0;
    onChange(cleanProposalDiscount({ mode, value: convertedValue }, period));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <ToggleGroup
          type="single"
          value={discount.mode}
          onValueChange={(mode) => mode && changeMode(mode as ProposalDiscountMode)}
          variant="outline"
          size="sm"
          aria-label={`Formato do ${label.toLowerCase()}`}
          className="gap-0"
        >
          <ToggleGroupItem value="percent" aria-label={`${label} em percentual`} className="h-8 rounded-r-none px-3">
            %
          </ToggleGroupItem>
          <ToggleGroupItem value="amount" aria-label={`${label} em reais`} className="h-8 rounded-l-none border-l-0 px-3">
            R$
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <NumericInput
        id={id}
        decimal
        maxDecimals={2}
        placeholder="0"
        value={inputValue}
        onValueChange={(value) => {
          const numericValue = value === '' ? 0 : Number(value.replace(',', '.'));
          const cleanedDiscount = cleanProposalDiscount({
            ...discount,
            value: numericValue,
          }, period);
          setInputValue(cleanedDiscount.value === numericValue
            ? value
            : String(cleanedDiscount.value).replace('.', ','));
          onChange(cleanedDiscount);
        }}
      />
      <p className="text-xs text-muted-foreground">
        Até {maxPercent}% {period === 'annual' ? 'da base anual negociada' : 'do valor mensal cheio'}
        {discount.mode === 'amount' ? ` (${money(maxAmount)})` : ''}.
      </p>
    </div>
  );
}

function ProposalPrice({
  totals,
  monthlyPlanVisible,
  onMonthlyPlanVisibilityChange,
}: {
  totals: ProposalTotals;
  monthlyPlanVisible: boolean;
  onMonthlyPlanVisibilityChange: (visible: boolean) => void;
}) {
  const [installmentsVisible, setInstallmentsVisible] = useState(false);
  const annualLabel = totals.annualDiscountAmount > 0
    ? `${discountLabel(totals.annualDiscount, totals.annualDiscountAmount)} adicional`
    : 'sem desconto adicional';
  const monthlyLabel = discountLabel(totals.monthlyDiscount, totals.monthlyDiscountAmount);

  return (
    <div className="space-y-2 border-t border-border/40 pt-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600">
        Plano anual · {annualLabel}
      </p>
      {totals.annualDiscountAmount > 0 && (
        <p className="text-sm text-muted-foreground">
          de <span className="text-destructive line-through">{money(totals.yearlyNegotiatedBase)}</span>
          {totals.monthlyDiscountAmount > 0 && ' (12 mensalidades negociadas)'}
        </p>
      )}
      <p className="text-3xl font-bold tracking-tight lg:text-4xl">
        <span className="mr-1 text-base font-semibold text-muted-foreground">por</span>
        {money(totals.yearlyDiscounted)}<span className="text-base font-semibold text-muted-foreground">/ano</span>
      </p>
      {totals.annualDiscountAmount > 0 && (
        <p className="text-sm font-bold text-emerald-600">
          Economia total de {money(totals.savings)} versus a tabela anual
        </p>
      )}
      <div className="space-y-1 pt-1">
        <button
          type="button"
          onClick={() => setInstallmentsVisible((visible) => !visible)}
          aria-expanded={installmentsVisible}
          className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span>
            {installmentsVisible
              ? `Em até ${totals.installments}x de ${money(totals.pixInstallment)} no Pix`
              : 'Ver parcelamento no Pix'}
          </span>
          {installmentsVisible ? (
            <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Eye className="h-4 w-4 shrink-0" aria-hidden />
          )}
        </button>

        <button
          type="button"
          onClick={() => onMonthlyPlanVisibilityChange(!monthlyPlanVisible)}
          aria-expanded={monthlyPlanVisible}
          className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span>{monthlyPlanVisible ? 'Ocultar plano mensal' : 'Ver plano mensal'}</span>
          {monthlyPlanVisible ? (
            <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Eye className="h-4 w-4 shrink-0" aria-hidden />
          )}
        </button>

        {monthlyPlanVisible && (
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Plano mensal · {monthlyLabel}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              {totals.monthlyDiscountAmount > 0 && (
                <span className="text-sm text-destructive line-through">{money(totals.monthlyFull)}</span>
              )}
              <span className="text-lg font-bold">{money(totals.monthly)}/mês</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              O mensal define a base negociada. O desconto anual é aplicado uma única vez sobre 12 mensalidades já negociadas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanFeatureList({ modules, users, planCode }: { modules: string[]; users: number; planCode: string }) {
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
        <span>{users} {users === 1 ? 'usuário' : 'usuários'} inclusos</span>
      </p>
      {planCode === 'excecao' && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <span>Sem Orçamentos, Portal do Cliente e Financeiro</span>
        </p>
      )}
    </div>
  );
}

export default function ProposalSimulator() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialState = useMemo(() => parsePublicProposal(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [clientName, setClientName] = useState(initialState.clientName);
  const [units, setUnits] = useState<ProposalUnit[]>(initialState.units);
  const [pricesHidden, setPricesHidden] = useState(initialState.pricesHidden);
  const [annualDiscount, setAnnualDiscount] = useState(initialState.annualDiscount);
  const [monthlyDiscount, setMonthlyDiscount] = useState(initialState.monthlyDiscount);
  const [installments, setInstallments] = useState(initialState.installments);
  const [monthlyPlanVisible, setMonthlyPlanVisible] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportSettings, setExportSettings] = useState<ProposalExportSettings>(DEFAULT_EXPORT_SETTINGS);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'proposal' | 'structure' | 'pricing'>('proposal');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('dominex-proposal-theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [openUnitId, setOpenUnitId] = useState<string | undefined>(initialState.units[0]?.id);
  const [modulePickerUnitId, setModulePickerUnitId] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const didMount = useRef(false);
  const { data: catalog, isLoading, isError } = usePublicSubscriptionCatalog();
  const plans = useMemo(() => catalog?.plans ?? [], [catalog?.plans]);
  const modules = useMemo(() => catalog?.modules ?? [], [catalog?.modules]);
  const proposalModules = useMemo(
    () => modules.filter((module) => !isRetiredProposalModule(module.code)),
    [modules],
  );
  const baseModule = useMemo(
    () => proposalModules.find((module) => module.code === BASE_MODULE_CODE),
    [proposalModules],
  );
  const paidAddonModules = useMemo(
    () => proposalModules.filter(
      (module): module is PublicSubscriptionModule => module.price > 0
        && module.code !== BASE_MODULE_CODE
        && module.code !== EXTRA_USER_MODULE_CODE
        && !isRequiredCustomModule(module.code),
    ),
    [proposalModules],
  );
  const extraUserPrice = catalog?.extraUserPrice ?? 0;

  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('dominex-proposal-theme', theme);
    } catch {
      // O simulador continua funcionando quando o navegador bloqueia o storage.
    }
    return () => {
      root.classList.toggle('dark', wasDark);
    };
  }, [theme]);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    setSearchParams(
      serializePublicProposal({ clientName, units, pricesHidden, annualDiscount, monthlyDiscount, installments }),
      { replace: true },
    );
  }, [annualDiscount, clientName, installments, monthlyDiscount, pricesHidden, setSearchParams, units]);

  useEffect(() => {
    if (plans.length === 0) return;
    const validCodes = new Set([...plans.map((plan) => plan.code), CUSTOM_PLAN_CODE]);
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

  const unitViews = useMemo(() => units.map((unit) => {
    if (unit.planCode === CUSTOM_PLAN_CODE) {
      const selectedModules = proposalModules.filter((module) => unit.moduleCodes.includes(module.code));
      const monthly = calculateProposalTotals(
        [unit],
        plans,
        proposalModules,
        extraUserPrice,
      ).monthlyFull;
      return {
        unit,
        code: CUSTOM_PLAN_CODE,
        name: 'Personalizado',
        modules: moduleBenefits(unit.moduleCodes, selectedModules),
        users: unit.users,
        monthly,
        moduleValues: selectedModules
          .filter((module) => module.price > 0)
          .map((module): ProposalPdfModuleValue => ({
            name: moduleDisplayName(module),
            monthlyPrice: module.price,
          })),
      };
    }
    const plan = plans.find((candidate) => candidate.code === unit.planCode) ?? plans[0];
    const planModuleCodes = new Set([BASE_MODULE_CODE, ...(plan?.includedModules ?? [])]);
    return {
      unit,
      code: plan?.code ?? unit.planCode,
      name: plan?.name ?? 'Plano',
      modules: plan ? planModules(plan) : [],
      users: plan?.maxUsers ?? 0,
      monthly: plan?.price ?? 0,
      moduleValues: proposalModules
        .filter((module) => planModuleCodes.has(module.code) && module.price > 0)
        .map((module): ProposalPdfModuleValue => ({
          name: moduleDisplayName(module),
          monthlyPrice: module.price,
        })),
    };
  }), [extraUserPrice, plans, proposalModules, units]);
  const totals = useMemo(
    () => calculateProposalTotals(
      units,
      plans,
      proposalModules,
      extraUserPrice,
      { annualDiscount, monthlyDiscount, installments },
    ),
    [annualDiscount, extraUserPrice, installments, monthlyDiscount, plans, proposalModules, units],
  );

  useEffect(() => {
    if (isLoading) return;
    const annualMaximum = Math.round(
      totals.yearlyNegotiatedBase * maxProposalDiscountPercent('annual'),
    ) / 100;
    const monthlyMaximum = Math.round(
      totals.monthlyFull * maxProposalDiscountPercent('monthly'),
    ) / 100;
    if (annualDiscount.mode === 'amount' && annualDiscount.value > annualMaximum) {
      setAnnualDiscount({ mode: 'amount', value: annualMaximum });
    }
    if (monthlyDiscount.mode === 'amount' && monthlyDiscount.value > monthlyMaximum) {
      setMonthlyDiscount({ mode: 'amount', value: monthlyMaximum });
    }
  }, [annualDiscount, isLoading, monthlyDiscount, totals.monthlyFull, totals.yearlyNegotiatedBase]);
  const modulePickerUnit = units.find((unit) => unit.id === modulePickerUnitId);
  const availableModules = modulePickerUnit
    ? proposalModules.filter(
        (module) => module.code !== EXTRA_USER_MODULE_CODE
          && !isRequiredCustomModule(module.code)
          && !modulePickerUnit.moduleCodes.includes(module.code),
      )
    : [];

  function updateUnit(id: string, patch: Partial<ProposalUnit>) {
    setUnits((current) => current.map((unit) => (unit.id === id ? { ...unit, ...patch } : unit)));
  }

  function adjustUnitUsers(id: string, amount: number) {
    setUnits((current) => current.map((unit) => (
      unit.id === id
        ? {
            ...unit,
            users: Math.min(
              MAX_PROPOSAL_USERS,
              Math.max(CUSTOM_PLAN_INCLUDED_USERS, unit.users + amount),
            ),
          }
        : unit
    )));
  }

  function changePlan(unit: ProposalUnit, planCode: string) {
    if (planCode === CUSTOM_PLAN_CODE) {
      updateUnit(unit.id, {
        planCode,
        moduleCodes: [...REQUIRED_CUSTOM_MODULE_CODES],
        users: CUSTOM_PLAN_INCLUDED_USERS,
      });
      return;
    }
    const plan = plans.find((candidate) => candidate.code === planCode);
    updateUnit(unit.id, {
      planCode,
      moduleCodes: plan?.includedModules ?? [BASE_MODULE_CODE],
      users: plan?.maxUsers ?? CUSTOM_PLAN_INCLUDED_USERS,
    });
  }

  function toggleModule(unit: ProposalUnit, moduleCode: string) {
    if (
      isRequiredCustomModule(moduleCode)
      || isRetiredProposalModule(moduleCode)
      || moduleCode === EXTRA_USER_MODULE_CODE
    ) return;
    const selected = unit.moduleCodes.includes(moduleCode);
    updateUnit(unit.id, {
      moduleCodes: selected
        ? unit.moduleCodes.filter((code) => code !== moduleCode)
        : [...unit.moduleCodes, moduleCode],
    });
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

  async function generatePdf(settings: ProposalExportSettings) {
    if (!clientName.trim()) {
      toast.error('Informe o nome do cliente antes de gerar a proposta.');
      return;
    }

    setIsGeneratingPdf(true);
    try {
      await generateProposalSimulatorPdf({
        clientName,
        logoUrl: logoWhite,
        units: unitViews.map((view) => {
          const unitTotals = calculateProposalTotals(
            [view.unit],
            plans,
            proposalModules,
            extraUserPrice,
          );
          return {
            name: view.unit.name,
            planName: view.name,
            modules: view.modules,
            users: view.users,
            monthly: unitTotals.monthlyFull,
            yearlyFull: unitTotals.yearlyFull,
            yearlyDiscounted: unitTotals.yearlyFull,
            moduleValues: view.moduleValues,
          };
        }),
        totals,
        showModulePrices: settings.showModulePrices,
        modulePricePeriod: settings.modulePricePeriod,
        showMonthlyPrice: settings.showMonthlyPrice,
        showPixInstallments: settings.showPixInstallments,
      });
      setExportDialogOpen(false);
      toast.success('Proposta em PDF gerada com sucesso.');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível gerar a proposta em PDF. Tente novamente.');
    } finally {
      setIsGeneratingPdf(false);
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
    <main className={cn(
      'min-h-screen text-foreground print:bg-white print:text-black',
      theme === 'dark' ? 'dark bg-neutral-950' : 'bg-background',
    )}>
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:py-10">
        <header className="mb-6 flex flex-col gap-4 border-b border-border/40 pb-5 sm:flex-row sm:items-center sm:justify-between print:border-0 print:pb-2">
          <div className="flex items-center gap-4">
            <img src={logoWhite} alt="Dominex Tecnologia" className="h-8 w-auto invert dark:invert-0 print:h-7 print:invert" />
            <div className="hidden h-7 w-px bg-border sm:block" />
            <div>
              <h1 className="text-lg font-semibold sm:text-xl">Simulador de Proposta</h1>
              <p className="text-xs text-muted-foreground">Planos Dominex por unidade</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
            >
              {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
              <span className="hidden sm:inline">{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>
              <span className="sm:hidden">Tema</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPricesHidden((value) => !value)}>
              {pricesHidden ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
              <span className="hidden sm:inline">{pricesHidden ? 'Mostrar preços' : 'Ocultar preços'}</span>
              <span className="sm:hidden">Preços</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void copyLink()}>
              <Copy className="mr-2 h-4 w-4" />
              Link
            </Button>
            <Button size="sm" onClick={() => setExportDialogOpen(true)} disabled={isGeneratingPdf || isLoading}>
              {isGeneratingPdf ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              <span className="hidden sm:inline">{isGeneratingPdf ? 'Gerando...' : 'Gerar proposta'}</span>
              <span className="sm:hidden">Gerar</span>
            </Button>
          </div>
        </header>

        <ResponsiveModal
          open={exportDialogOpen}
          onOpenChange={setExportDialogOpen}
          title="Configurar proposta"
          description="Escolha como os valores vão aparecer no PDF."
          footer={(
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 hover:border-red-600 hover:bg-red-600 hover:text-white dark:hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white"
                onClick={() => setExportDialogOpen(false)}
                disabled={isGeneratingPdf}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => void generatePdf(exportSettings)}
                disabled={isGeneratingPdf}
              >
                {isGeneratingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                {isGeneratingPdf ? 'Gerando...' : 'Gerar PDF'}
              </Button>
            </div>
          )}
        >
          <div className="space-y-5 py-2">
            <div className="rounded-lg bg-emerald-600 p-3 text-white">
              <p className="text-sm font-semibold">Valor anual sempre incluído</p>
              <p className="mt-1 text-xs text-white/80">A proposta sempre mostra o total anual e a economia negociada.</p>
            </div>

            <div className="divide-y divide-border/50">
              <div className="flex items-center justify-between gap-4 py-4 first:pt-0">
                <div>
                  <Label htmlFor="proposal-export-monthly" className="text-sm font-semibold">Mostrar valor mensal</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Inclui a opção mensal e os totais por mês.</p>
                </div>
                <Switch
                  id="proposal-export-monthly"
                  checked={exportSettings.showMonthlyPrice}
                  onCheckedChange={(checked) => setExportSettings((current) => ({ ...current, showMonthlyPrice: checked }))}
                />
              </div>

              <div className="flex items-center justify-between gap-4 py-4">
                <div>
                  <Label htmlFor="proposal-export-pix" className="text-sm font-semibold">Mostrar parcelamento no Pix</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Exibe a quantidade de parcelas e o valor de cada uma.</p>
                </div>
                <Switch
                  id="proposal-export-pix"
                  checked={exportSettings.showPixInstallments}
                  onCheckedChange={(checked) => setExportSettings((current) => ({ ...current, showPixInstallments: checked }))}
                />
              </div>

              <div className="space-y-4 py-4 last:pb-0">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="proposal-export-modules" className="text-sm font-semibold">Mostrar valores dos módulos</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Mostra valores de catálogo sem alterar o total negociado do plano.</p>
                  </div>
                  <Switch
                    id="proposal-export-modules"
                    checked={exportSettings.showModulePrices}
                    onCheckedChange={(checked) => setExportSettings((current) => ({ ...current, showModulePrices: checked }))}
                  />
                </div>

                {exportSettings.showModulePrices && (
                  <div className="space-y-2">
                    <Label htmlFor="proposal-export-module-period">Valor dos módulos</Label>
                    <Select
                      value={exportSettings.modulePricePeriod}
                      onValueChange={(value) => setExportSettings((current) => ({ ...current, modulePricePeriod: value as ModulePricePeriod }))}
                    >
                      <SelectTrigger id="proposal-export-module-period">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Mensal</SelectItem>
                        <SelectItem value="annual">Anual conforme a condição negociada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ResponsiveModal>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
          <TabsList variant="underline" className="mb-6 w-full print:hidden">
            <TabsTrigger variant="underline" level="screen" value="proposal" className="gap-1.5">
              <FileText className="h-4 w-4" /> Proposta
            </TabsTrigger>
            <TabsTrigger variant="underline" level="screen" value="structure" className="gap-1.5">
              <Network className="h-4 w-4" /> Organograma
            </TabsTrigger>
            <TabsTrigger variant="underline" level="screen" value="pricing" className="gap-1.5">
              <TableProperties className="h-4 w-4" /> Tabela
            </TabsTrigger>
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
                            <Select value={unit.planCode} onValueChange={(planCode) => changePlan(unit, planCode)}>
                              <SelectTrigger id={`unit-plan-${unit.id}`}>
                                <SelectValue placeholder="Escolha o plano" />
                              </SelectTrigger>
                              <SelectContent>
                                {plans.map((plan) => (
                                  <SelectItem key={plan.code} value={plan.code}>{plan.name}</SelectItem>
                                ))}
                                <SelectItem value={CUSTOM_PLAN_CODE}>Personalizado</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                          <p className="text-xs text-muted-foreground">
                            O valor considera o plano completo, sem detalhar preço de módulos ou usuários.
                          </p>
                        </div>

                        {unit.planCode === CUSTOM_PLAN_CODE && (
                          <div className="space-y-5 border-t border-border/40 pt-5">
                            <div className="space-y-2">
                              <Label>Módulos</Label>
                              <div className="flex items-start gap-3 rounded-lg bg-emerald-600 p-3 text-white">
                                <Check className="mt-0.5 h-4 w-4 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold">{BASIC_BUNDLE_LABEL}</p>
                                  <p className="mt-0.5 text-xs leading-relaxed text-white/80">
                                    {BASIC_BUNDLE_DESCRIPTION}
                                  </p>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {proposalModules.filter(
                                  (module) => module.code !== EXTRA_USER_MODULE_CODE
                                    && !isRequiredCustomModule(module.code)
                                    && unit.moduleCodes.includes(module.code),
                                ).map((module) => (
                                  <div key={module.code} className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-3">
                                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-semibold">{moduleDisplayName(module)}</p>
                                      {module.description && <p className="mt-0.5 text-xs text-muted-foreground">{module.description}</p>}
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                                      onClick={() => toggleModule(unit, module.code)}
                                      aria-label={`Remover ${moduleDisplayName(module)}`}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => setModulePickerUnitId(unit.id)}
                                  disabled={proposalModules.filter(
                                    (module) => module.code !== EXTRA_USER_MODULE_CODE
                                      && !isRequiredCustomModule(module.code)
                                      && !unit.moduleCodes.includes(module.code),
                                  ).length === 0}
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  Adicionar módulo
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label>Usuários</Label>
                              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
                                <div>
                                  <p className="text-sm font-semibold">{unit.users} usuários</p>
                                  <p className="text-xs text-muted-foreground">
                                    {CUSTOM_PLAN_INCLUDED_USERS} inclusos e {Math.max(0, unit.users - CUSTOM_PLAN_INCLUDED_USERS)} adicionais
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-9 w-9"
                                    disabled={unit.users <= CUSTOM_PLAN_INCLUDED_USERS}
                                    onClick={() => adjustUnitUsers(unit.id, -1)}
                                    aria-label="Diminuir usuários"
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  <span className="w-8 text-center text-sm font-bold">{unit.users}</span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-9 w-9"
                                    disabled={unit.users >= MAX_PROPOSAL_USERS}
                                    onClick={() => adjustUnitUsers(unit.id, 1)}
                                    aria-label="Aumentar usuários"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                O cálculo considera os adicionais, mas o preço individual não aparece na proposta.
                              </p>
                            </div>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>

                <Button type="button" variant="outline" className="w-full" onClick={addUnit} disabled={units.length >= MAX_PROPOSAL_UNITS}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar unidade
                </Button>
              </section>

              <div className="space-y-3">
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
                    unitViews.map((view, index) => {
                      const { unit } = view;
                      const accent = planAccent(view.code);
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
                              <p className="text-sm text-muted-foreground">Plano {view.name}</p>
                            </div>
                            {!pricesHidden && monthlyPlanVisible && (
                              <p className="shrink-0 text-sm font-semibold">{money(view.monthly)}/mês</p>
                            )}
                          </div>
                          <PlanFeatureList modules={view.modules} users={view.users} planCode={view.code} />
                        </article>
                      );
                    })
                  )}

                  {!pricesHidden && !isLoading && (
                    <ProposalPrice
                      totals={totals}
                      monthlyPlanVisible={monthlyPlanVisible}
                      onMonthlyPlanVisibilityChange={setMonthlyPlanVisible}
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

              <div className="text-center print:hidden">
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
                  aria-expanded={moreOptionsOpen}
                  aria-controls="proposal-more-options"
                  onClick={() => setMoreOptionsOpen((open) => !open)}
                >
                  {moreOptionsOpen ? 'Ocultar opções' : 'Mais opções'}
                </button>

                {moreOptionsOpen && (
                  <div
                    id="proposal-more-options"
                    className="mt-3 grid gap-4 rounded-xl border border-border/50 bg-card p-4 text-left shadow-sm sm:grid-cols-2"
                  >
                    <DiscountField
                      id="proposal-annual-discount"
                      label="Desconto adicional no anual"
                      period="annual"
                      discount={annualDiscount}
                      fullPrice={totals.yearlyNegotiatedBase}
                      onChange={setAnnualDiscount}
                    />

                    <DiscountField
                      id="proposal-monthly-discount"
                      label="Desconto mensal"
                      period="monthly"
                      discount={monthlyDiscount}
                      fullPrice={totals.monthlyFull}
                      onChange={setMonthlyDiscount}
                    />

                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="proposal-installments">Parcelas no Pix</Label>
                      <Select
                        value={String(installments)}
                        onValueChange={(value) => setInstallments(cleanProposalInstallments(value))}
                      >
                        <SelectTrigger id="proposal-installments">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(
                            { length: MAX_PROPOSAL_INSTALLMENTS - MIN_PROPOSAL_INSTALLMENTS + 1 },
                            (_, index) => MIN_PROPOSAL_INSTALLMENTS + index,
                          ).map((value) => (
                            <SelectItem key={value} value={String(value)}>{value}x</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Escolha entre 3x e 6x.</p>
                    </div>

                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      Primeiro definimos o mensal negociado. Depois, o desconto anual é aplicado uma única vez sobre 12 mensalidades nesse valor, garantindo que a condição anual seja melhor sem duplicar descontos.
                    </p>
                  </div>
                )}
              </div>
              </div>
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
                  {unitViews.map((view, index) => {
                    const { unit } = view;
                    const accent = planAccent(view.code);
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
                            <p className="text-sm text-muted-foreground">Plano {view.name}</p>
                          </div>
                        </div>
                        <div className="mt-4 space-y-1.5">
                          {view.modules.slice(0, 4).map((label) => (
                            <p key={label} className="truncate text-xs text-muted-foreground">{label}</p>
                          ))}
                        </div>
                        {!pricesHidden && monthlyPlanVisible && (
                          <p className="mt-4 text-sm font-semibold">{money(view.monthly)}/mês</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="pricing" className="mt-0">
            <section
              className="overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border/40"
              aria-label="Tabela de preços"
            >
              <div className="flex flex-col gap-3 border-b border-border/50 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600">
                    Catálogo mensal
                  </p>
                  <h2 className="mt-1 text-xl font-bold">Tabela de preços</h2>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    Comece pelo Essencial e monte a operação com os add-ons necessários para cada unidade.
                  </p>
                </div>
                <Badge variant="secondary" className="w-fit">5 usuários inclusos</Badge>
              </div>

              {isLoading ? (
                <div className="space-y-3 p-5 sm:p-7" aria-label="Carregando tabela de preços">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : (
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Item</TableHead>
                      <TableHead>O que inclui</TableHead>
                      <TableHead className="text-right">Valor mensal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={3} className="py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Base da operação
                      </TableCell>
                    </TableRow>
                    <PricingTableRow
                      name={BASIC_BUNDLE_LABEL}
                      description={BASIC_BUNDLE_DESCRIPTION}
                      price={baseModule?.price ?? plans.find((plan) => plan.code === 'start')?.price ?? 0}
                      hidden={pricesHidden}
                    />

                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={3} className="py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Add-ons
                      </TableCell>
                    </TableRow>
                    {paidAddonModules.map((module) => (
                      <PricingTableRow
                        key={module.code}
                        name={moduleDisplayName(module)}
                        description={module.description || 'Funcionalidade adicional contratada por unidade.'}
                        price={module.price}
                        hidden={pricesHidden}
                      />
                    ))}

                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={3} className="py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Capacidade
                      </TableCell>
                    </TableRow>
                    <PricingTableRow
                      name="Usuário adicional"
                      description={`Valor por usuário acima dos ${CUSTOM_PLAN_INCLUDED_USERS} usuários inclusos no Essencial.`}
                      price={extraUserPrice}
                      hidden={pricesHidden}
                    />
                  </TableBody>
                </Table>
              )}

              <p className="border-t border-border/50 px-5 py-4 text-xs leading-relaxed text-muted-foreground sm:px-7">
                Valores por unidade, cobrados mensalmente. O desconto anual é calculado na aba Proposta.
              </p>
            </section>
          </TabsContent>
        </Tabs>

        <ResponsiveModal
          open={Boolean(modulePickerUnitId)}
          onOpenChange={(open) => !open && setModulePickerUnitId(null)}
          title="Adicionar módulo"
          description="Escolha um módulo para incluir no plano personalizado"
        >
          <div className="space-y-2 py-2">
            {availableModules.map((module) => (
              <button
                key={module.code}
                type="button"
                onClick={() => {
                  if (modulePickerUnit) toggleModule(modulePickerUnit, module.code);
                  setModulePickerUnitId(null);
                }}
                className="flex w-full items-start gap-3 rounded-lg border border-border/60 bg-card p-3 text-left transition-colors hover:border-emerald-500/60 hover:bg-muted/50"
              >
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{moduleDisplayName(module)}</span>
                  {module.description && <span className="mt-0.5 block text-xs text-muted-foreground">{module.description}</span>}
                </span>
              </button>
            ))}
          </div>
        </ResponsiveModal>

        <footer className="mt-8 text-center text-xs text-muted-foreground print:mt-5">
          Consulte os valores avulsos na aba Tabela. Condições sujeitas à validação comercial.
        </footer>
      </div>
    </main>
  );
}

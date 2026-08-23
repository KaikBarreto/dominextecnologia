import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Package, Settings, Users, CheckCircle2, ArrowRight, Loader2,
  Plus, Minus, Zap, Building2, Crown, TrendingUp, TrendingDown, Info,
  FileText, XCircle, Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/utils/currency';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { usePlanChange } from '@/hooks/usePlanChange';
import { useUsers } from '@/hooks/useUsers';
import { UserExcessModal } from '@/components/billing/UserExcessModal';
import { CancelSubscriptionModal } from '@/components/billing/CancelSubscriptionModal';
import { calculateYearlyPrice, calculateMonthlyEquivalent } from '@/utils/subscriptionPricing';
import { useNfseTiers, formatTierLimit } from '@/hooks/useNfseTiers';
import { useNfseQuota } from '@/hooks/useNfseQuota';
import { useNfseTierChange } from '@/hooks/useNfseTierChange';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

const EXTRA_USER_PRICE = 50;
const BASE_USERS = 2; // usuários inclusos no personalizado
const BASE_MODULE = 'basic';

interface CatalogModule {
  code: string;
  name: string;
  description: string | null;
  price: number;
  type: string;
}

const getPlanIcon = (code: string) => {
  switch (code) {
    case 'start': return <Zap className="h-5 w-5" />;
    case 'avancado': return <Building2 className="h-5 w-5" />;
    case 'master': return <Crown className="h-5 w-5" />;
    default: return <Package className="h-5 w-5" />;
  }
};

const getPlanIconBg = (code: string) => {
  switch (code) {
    case 'start': return 'bg-emerald-600 text-white';
    case 'avancado': return 'bg-blue-600 text-white';
    case 'master': return 'bg-amber-500 text-white';
    default: return 'bg-primary text-primary-foreground';
  }
};

interface ModulesManagementCardProps {
  /** Abre o modal automaticamente ao montar (deep-link de ?addModule/?addUsers). */
  autoOpen?: boolean;
  /** Aba inicial quando aberto via deep-link. */
  initialTab?: 'plans' | 'custom';
  /** Module_code a pré-marcar na aba Personalizado (deep-link ?addModule). */
  preselectModule?: string | null;
  /** Quando true, garante ao menos 1 usuário extra e rola o foco pra seção de usuários. */
  focusUsers?: boolean;
  /** Disparado depois que o autoOpen consumiu os params (pra limpar a query string). */
  onAutoOpenConsumed?: () => void;
}

export function ModulesManagementCard({
  autoOpen = false,
  initialTab,
  preselectModule = null,
  focusUsers = false,
  onAutoOpenConsumed,
}: ModulesManagementCardProps = {}) {
  const { profile, user, isAdminOrGestor } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { locale } = useAppLocaleContext();
  const tBilling = MESSAGES[locale].app.settings.billing;
  const canManageSubscription = isAdminOrGestor();

  const {
    moduleCodes,
    plan,
    allPlans,
    effectiveValue,
    pendingValue,
    extraUsers,
    maxUsers,
    currentUserCount,
    isLoading,
  } = useCompanyModules();

  const planChange = usePlanChange();
  const { users } = useUsers();

  // NFS-e tier hooks
  const { tiers: nfseTiers, isLoading: nfseTiersLoading } = useNfseTiers();
  const { tier: currentNfseTier } = useNfseQuota(companyId);
  const { changeTier: changeNfseTier } = useNfseTierChange();
  const [selectedNfseLevel, setSelectedNfseLevel] = useState<number>(1);

  // Cancel subscription modal state
  const [cancelOpen, setCancelOpen] = useState(false);

  // Catálogo de módulos (preço + descrição). Read de catálogo — fronteira via hook
  // não é necessária; é leitura pública de billing.
  const { data: catalogModules = [] } = useQuery({
    queryKey: ['subscription-modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_modules')
        .select('code, name, description, price, type')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []).map((m) => ({
        code: m.code,
        name: m.name,
        description: m.description ?? null,
        price: Number(m.price) || 0,
        type: m.type,
      })) as CatalogModule[];
    },
    staleTime: 30 * 60 * 1000,
  });

  // Ciclo de cobrança atual da empresa.
  const { data: company } = useQuery({
    queryKey: ['my-company'],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from('companies')
        .select('id, billing_cycle, subscription_expires_at')
        .eq('id', companyId)
        .single();
      return data;
    },
    enabled: !!companyId,
  });

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('plans');
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [customModules, setCustomModules] = useState<string[]>([]);
  const [customExtraUsers, setCustomExtraUsers] = useState(0);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  // Excesso de usuários no downgrade: guarda a mudança pendente até o cliente
  // reduzir os usuários; só então aplica o plano.
  const [excessOpen, setExcessOpen] = useState(false);
  const [pendingChange, setPendingChange] = useState<
    { planCode: string; monthlyValue: number; targetMaxUsers: number } | null
  >(null);
  const usersSectionRef = useRef<HTMLDivElement | null>(null);
  const autoOpenConsumed = useRef(false);

  const currentBillingCycle = (company?.billing_cycle as 'monthly' | 'yearly') || 'monthly';

  // Planos prontos (sem o personalizado), ordenados por preço.
  const presetPlans = useMemo(
    () => allPlans.filter((p) => p.code !== 'personalizado').sort((a, b) => a.price - b.price),
    [allPlans],
  );

  // Módulos selecionáveis no personalizado (exclui base e extra_user "módulo").
  const selectableModules = useMemo(
    () => catalogModules.filter((m) => m.code !== BASE_MODULE && m.code !== 'extra_user'),
    [catalogModules],
  );

  const baseModule = catalogModules.find((m) => m.code === BASE_MODULE);

  // Inicializa estado ao abrir: módulos atuais + extras atuais + ciclo atual.
  // `opts` permite deep-link (?addModule / ?addUsers) pré-configurar o modal.
  const handleOpenChange = (
    next: boolean,
    opts?: { tab?: 'plans' | 'custom'; preselectModule?: string | null; focusUsers?: boolean },
  ) => {
    if (next) {
      const baseModules = moduleCodes.filter((c) => c !== 'extra_user');
      // Pré-marca o módulo do deep-link (sem duplicar e ignorando basic/extra_user).
      const withPreselect =
        opts?.preselectModule &&
        opts.preselectModule !== BASE_MODULE &&
        opts.preselectModule !== 'extra_user' &&
        !baseModules.includes(opts.preselectModule)
          ? [...baseModules, opts.preselectModule]
          : baseModules;
      setCustomModules(withPreselect);
      // Quando o foco é usuários e ainda não há extras, sobe pra 1 (sugestão).
      setCustomExtraUsers(opts?.focusUsers && extraUsers === 0 ? 1 : extraUsers);
      setSelectedPlan(null);
      setBillingCycle(currentBillingCycle);
      setActiveTab(opts?.tab ?? 'plans');
    }
    setOpen(next);
  };

  useEffect(() => {
    if (company?.billing_cycle) setBillingCycle(company.billing_cycle as 'monthly' | 'yearly');
  }, [company?.billing_cycle]);

  // Sincroniza o nível NFS-e selecionado com o nível atual da empresa ao carregar.
  useEffect(() => {
    if (currentNfseTier) setSelectedNfseLevel(currentNfseTier);
  }, [currentNfseTier]);

  // Deep-link: abre o modal já na aba Personalizado, com o módulo pré-marcado ou
  // o foco em usuários, quando vier de /assinatura?addModule=... ou ?addUsers=1.
  // Espera o catálogo carregar pra o pré-marque/foco refletir corretamente.
  useEffect(() => {
    if (!autoOpen || autoOpenConsumed.current || isLoading) return;
    autoOpenConsumed.current = true;
    handleOpenChange(true, {
      tab: initialTab ?? 'custom',
      preselectModule,
      focusUsers,
    });
    onAutoOpenConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, isLoading]);

  // Rola até a seção de usuários quando o deep-link foca em usuários.
  useEffect(() => {
    if (open && focusUsers && activeTab === 'custom') {
      const t = setTimeout(() => {
        usersSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 250);
      return () => clearTimeout(t);
    }
  }, [open, focusUsers, activeTab]);

  // Preço mensal do personalizado: basic (sempre) + módulos escolhidos + extras × 50.
  const customMonthly = useMemo(() => {
    const chosen = new Set<string>([BASE_MODULE, ...customModules]);
    const modulesPrice = catalogModules
      .filter((m) => chosen.has(m.code))
      .reduce((sum, m) => sum + m.price, 0);
    return modulesPrice + customExtraUsers * EXTRA_USER_PRICE;
  }, [customModules, customExtraUsers, catalogModules]);

  const toggleModule = (code: string) => {
    setCustomModules((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  // Classifica a mudança vs valor efetivo atual (espelha a edge; só pra UI/cópia).
  const classifyChange = (newValue: number): 'upgrade' | 'downgrade' | 'igual' => {
    if (newValue > effectiveValue) return 'upgrade';
    if (newValue < effectiveValue) return 'downgrade';
    return 'igual';
  };

  // True quando o plano personalizado inclui o módulo de NF-e.
  const hasNfeInCustom = customModules.includes('nfe');

  // Aplica de fato a mudança de plano via edge (após eventual redução de usuários).
  // Se o plano personalizado inclui NF-e e o nível selecionado é diferente do atual,
  // também chama a edge `change-nfse-tier` em seguida.
  const applyChange = (planCode: string, monthlyValue: number) => {
    if (!companyId) {
      toast.error('Empresa não encontrada.');
      return;
    }
    const isCustom = planCode === 'personalizado';
    const needsTierChange = isCustom && hasNfeInCustom && selectedNfseLevel !== currentNfseTier && selectedNfseLevel > (currentNfseTier ?? 1);
    planChange.mutate(
      {
        companyId,
        planCode,
        billingCycle,
        customModules: isCustom ? customModules : undefined,
        extraUsers: isCustom ? customExtraUsers : undefined,
      },
      {
        onSuccess: async (result) => {
          toast.success(result.message);
          if (result.asaas_warning) toast.warning(result.asaas_warning);
          // Aplica upgrade de nível NFS-e se necessário (após o plano ser aceito).
          if (needsTierChange) {
            try {
              const tierResult = await changeNfseTier({ companyId, targetTier: selectedNfseLevel });
              if (tierResult.asaas_warning) toast.warning(tierResult.asaas_warning);
            } catch (err) {
              toast.warning(err instanceof Error ? err.message : 'Plano atualizado, mas não foi possível alterar o nível de NF-e. Tente novamente.');
            }
          }
          setOpen(false);
        },
        onError: (err) => {
          toast.error(err.message || 'Não foi possível atualizar o plano.');
        },
      },
    );
  };

  // Confirma a escolha do cliente. Se o plano alvo comporta MENOS usuários do que
  // a empresa tem hoje, abre o UserExcessModal pra reduzir ANTES de aplicar.
  const handleConfirm = (planCode: string, monthlyValue: number, targetMaxUsers: number) => {
    if (!companyId) {
      toast.error('Empresa não encontrada.');
      return;
    }
    if (targetMaxUsers < currentUserCount) {
      setPendingChange({ planCode, monthlyValue, targetMaxUsers });
      setExcessOpen(true);
      return;
    }
    applyChange(planCode, monthlyValue);
  };

  // Depois que os usuários excedentes foram removidos, segue com o downgrade.
  const handleUsersReduced = () => {
    setExcessOpen(false);
    if (pendingChange) {
      applyChange(pendingChange.planCode, pendingChange.monthlyValue);
      setPendingChange(null);
    }
  };

  // Aviso de upgrade/downgrade reutilizável.
  const ChangeNotice = ({ newValue }: { newValue: number }) => {
    const kind = classifyChange(newValue);
    if (kind === 'igual') return null;
    if (kind === 'upgrade') {
      return (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-2.5">
          <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            {tBilling.planSummaryUpgradeNote}
          </p>
        </div>
      );
    }
    return (
      <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5">
        <TrendingDown className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {tBilling.planSummaryDowngradeNote.replace('{value}', `R$ ${formatBRL(newValue)}`)}
        </p>
      </div>
    );
  };

  const CycleToggle = () => (
    <div className="rounded-lg border p-3 bg-muted/30">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center justify-between sm:flex-col sm:items-start gap-1">
          <Label className="text-sm">{tBilling.planSummaryCycleLabel}</Label>
          <p className="text-xs text-muted-foreground">
            {billingCycle === 'yearly' ? tBilling.planSummaryCycleYearlyDesc : tBilling.cycleMonthly}
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 bg-background/60 rounded-lg p-2">
          <span className={cn('text-xs font-medium', billingCycle === 'monthly' && 'text-primary')}>{tBilling.cycleMonthly}</span>
          <Switch
            checked={billingCycle === 'yearly'}
            onCheckedChange={(c) => setBillingCycle(c ? 'yearly' : 'monthly')}
          />
          <span className={cn('text-xs font-medium', billingCycle === 'yearly' && 'text-primary')}>{tBilling.cycleYearly}</span>
          {billingCycle === 'yearly' && (
            <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0 hover:bg-emerald-600">-20%</Badge>
          )}
        </div>
      </div>
      {billingCycle === 'yearly' && (
        <div className="flex items-start gap-1.5 mt-2 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3 shrink-0 mt-0.5" />
          <span>{tBilling.planSummaryCycleYearlyInfo}</span>
        </div>
      )}
    </div>
  );

  // ── Painel "Seu Plano" — atualiza ao vivo conforme o montador ────────────────
  // Derivado do estado já existente (customMonthly, selectedPlan, billingCycle, etc.)
  // Não reimplementa cálculo: reutiliza as mesmas variáveis do montador.
  const PlanSummaryPanel = () => {
    const isCustomTab = activeTab === 'custom';
    const isYearly = billingCycle === 'yearly';

    // Preço mensal-base dependendo da aba ativa
    const summaryMonthly = isCustomTab
      ? customMonthly
      : (presetPlans.find((p) => p.code === selectedPlan)?.price ?? 0);

    const summaryYearly = calculateYearlyPrice(summaryMonthly);
    // Economia anual = 12x mensal − preço anual à vista (20% off)
    const yearlySavings = summaryMonthly * 12 - summaryYearly;

    // Módulos a exibir no painel (exclui o módulo básico, que é sempre incluso)
    const summaryModuleCodes = isCustomTab
      ? customModules
      : (presetPlans.find((p) => p.code === selectedPlan)?.included_modules ?? []);
    const summaryModules = catalogModules.filter(
      (m) => summaryModuleCodes.includes(m.code as any) && m.code !== BASE_MODULE,
    );

    // Usuários
    const summaryMaxUsers = isCustomTab
      ? BASE_USERS + customExtraUsers
      : (presetPlans.find((p) => p.code === selectedPlan)?.max_users ?? BASE_USERS);
    const summaryExtraUsers = isCustomTab
      ? customExtraUsers
      : Math.max(0, summaryMaxUsers - BASE_USERS);

    // Diferença vs plano atual (só mensal faz sentido comparar direto)
    const priceDiff = summaryMonthly - effectiveValue;
    const hasSomethingSelected = isCustomTab ? customMonthly > 0 : !!selectedPlan;

    // CTA — mantém o fluxo existente sem criar modal de pagamento
    const handleApply = () => {
      if (!hasSomethingSelected) return;
      if (isCustomTab) {
        handleConfirm('personalizado', customMonthly, BASE_USERS + customExtraUsers);
      } else {
        if (!selectedPlan) return;
        const sel = presetPlans.find((p) => p.code === selectedPlan);
        handleConfirm(selectedPlan, sel?.price ?? 0, sel?.max_users ?? 0);
      }
    };

    const ctaLabel = planChange.isPending
      ? tBilling.planSummaryCtaApplying
      : isYearly
        ? tBilling.planSummaryCtaYearly
        : tBilling.planSummaryCtaMonthly;

    return (
      <div className="space-y-3">
        {/* Cabeçalho do painel */}
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/90">
            {tBilling.planSummaryTitle}
          </h3>
        </div>

        {/* Kit Básico — sempre incluso */}
        {baseModule && (
          <div className="rounded-lg bg-muted/40 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium truncate">{baseModule.name}</span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{tBilling.planSummaryIncluded}</span>
            </div>
          </div>
        )}

        {/* Módulos escolhidos */}
        {summaryModules.length > 0 ? (
          <div className="space-y-1.5">
            {summaryModules.map((m) => (
              <div
                key={m.code}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{m.name}</span>
                </div>
                <span className="text-sm font-semibold text-foreground shrink-0">
                  +R$ {formatBRL(m.price)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground px-1">
            {isCustomTab ? tBilling.planSummaryEmptyCustom : tBilling.planSummaryEmptyPlans}
          </p>
        )}

        {/* Usuários */}
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">
              {summaryMaxUsers} {summaryMaxUsers !== 1 ? tBilling.planSummaryUsersPlural : tBilling.planSummaryUsersOne}
            </span>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {summaryExtraUsers > 0
              ? `${BASE_USERS} base + ${summaryExtraUsers}${isCustomTab ? ` (+R$ ${formatBRL(summaryExtraUsers * EXTRA_USER_PRICE)})` : ''}`
              : tBilling.planSummaryUsersIncluded}
          </span>
        </div>

        <Separator />

        {/* Toggle de ciclo de cobrança */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">{tBilling.planSummaryCycleLabel}</span>
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-medium', !isYearly && 'text-primary')}>{tBilling.cycleMonthly}</span>
            <Switch
              checked={isYearly}
              onCheckedChange={(c) => setBillingCycle(c ? 'yearly' : 'monthly')}
            />
            <span className={cn('text-xs font-medium', isYearly && 'text-primary')}>{tBilling.cycleYearly}</span>
            {isYearly && (
              <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0 hover:bg-emerald-600">-20%</Badge>
            )}
          </div>
        </div>

        {/* Economia anual em destaque (sem box dessaturado) */}
        {isYearly && summaryMonthly > 0 && (
          <p className="text-xs font-semibold text-emerald-600 inline-flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            {tBilling.planSummaryYearlySavings.replace('{value}', `R$ ${formatBRL(yearlySavings)}`)}
          </p>
        )}

        <Separator />

        {/* Total */}
        <div>
          <p className="text-xs text-muted-foreground">
            {isYearly ? tBilling.planSummaryTotalYearly : tBilling.planSummaryTotalMonthly}
          </p>
          {isYearly ? (
            <>
              <p className="text-3xl font-bold tracking-tight text-foreground">
                R$ {formatBRL(summaryYearly)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                ≈ R$ {formatBRL(calculateMonthlyEquivalent(summaryYearly))}/{tBilling.cycleMonthly.toLowerCase()}
              </p>
            </>
          ) : (
            <p className="text-3xl font-bold tracking-tight text-foreground">
              R$ {formatBRL(summaryMonthly)}
              <span className="text-sm font-normal text-muted-foreground">/{tBilling.cycleMonthly.toLowerCase()}</span>
            </p>
          )}
          {/* Diferença vs plano atual — só mensal e quando há algo selecionado */}
          {!isYearly && hasSomethingSelected && priceDiff !== 0 && (
            <p className={cn(
              'text-xs font-medium mt-1',
              priceDiff > 0 ? 'text-orange-500' : 'text-emerald-600',
            )}>
              {priceDiff > 0 ? '+' : ''}R$ {formatBRL(priceDiff)} {tBilling.planSummaryDiffLabel}
            </p>
          )}
        </div>

        {/* CTA — mantém o fluxo existente (sem modal de pagamento inline) */}
        <Button
          className="w-full h-11"
          disabled={!hasSomethingSelected || planChange.isPending}
          onClick={handleApply}
        >
          {planChange.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              {ctaLabel}
            </>
          ) : (
            <>
              {ctaLabel}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </>
          )}
        </Button>
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> Sua Assinatura
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <div className="animate-pulse space-y-2">
            <div className="h-10 bg-muted rounded-lg" />
            <div className="h-10 bg-muted rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentPlanData = allPlans.find((p) => p.code === plan);
  const planDisplayName = currentPlanData?.name || (plan === 'personalizado' ? 'Personalizado' : plan);

  return (
    <>
      <Card>
        <CardHeader className="p-4 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-[13px] font-semibold uppercase tracking-widest text-foreground/85 flex items-center gap-2">
                <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-primary shrink-0">
                  <Package className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
                </div>
                Sua Assinatura
              </CardTitle>
              <CardDescription className="text-xs md:text-sm mt-1">
                Plano {planDisplayName} • {currentBillingCycle === 'yearly' ? 'Anual' : 'Mensal'} •{' '}
                {currentUserCount}/{maxUsers} usuários
              </CardDescription>
            </div>
            <div className="text-right shrink-0">
              <Badge variant="outline" className="text-primary border-primary">
                R$ {formatBRL(effectiveValue)}/mês
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 space-y-3">
          {pendingValue != null && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5">
              <TrendingDown className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Mudança agendada: a partir da próxima cobrança o valor passa a ser R$ {formatBRL(pendingValue)}/mês.
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="flex-1 h-12 text-base" onClick={() => handleOpenChange(true)}>
              <Settings className="h-4 w-4 mr-2" />
              {tBilling.btnManagePlan}
            </Button>
            {canManageSubscription && (
              <Button
                variant="ghost"
                className="sm:flex-none text-muted-foreground hover:text-destructive text-sm h-12 px-4"
                onClick={() => setCancelOpen(true)}
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                {tBilling.btnCancelSubscription}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <CancelSubscriptionModal
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        companyId={companyId ?? ''}
        subscriptionExpiresAt={company?.subscription_expires_at}
      />

      {/* ── Dialog "Gerenciar meu plano" — layout 2 colunas no desktop ──────────
          Esquerda: abas (montador). Direita: painel "Seu Plano" sticky.
          No mobile (Drawer): as abas ficam em cima, o painel vai no fim do scroll. */}
      <ResponsiveModal
        open={open}
        onOpenChange={handleOpenChange}
        title={tBilling.btnManagePlan}
        className="sm:max-w-4xl"
      >
        {/* Wrapper flex para o layout de 2 colunas no desktop */}
        <div className="flex flex-col md:flex-row md:gap-0 md:-mx-1">
          {/* ESQUERDA — montador (abas) */}
          <div className="flex-1 min-w-0 md:overflow-y-auto md:pr-1">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-1">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="plans" className="gap-1.5 text-xs sm:text-sm">
                  <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Planos Prontos
                </TabsTrigger>
                <TabsTrigger value="custom" className="gap-1.5 text-xs sm:text-sm">
                  <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Personalizado
                </TabsTrigger>
              </TabsList>

              {/* ---------------- Planos Prontos ---------------- */}
              <TabsContent value="plans" className="space-y-3 mt-3">
                <CycleToggle />

                <div className="grid gap-2.5">
                  {presetPlans.map((p) => {
                    const isCurrent = plan === p.code;
                    const isSelected = selectedPlan === p.code;
                    const planModules = catalogModules.filter((m) => p.included_modules.includes(m.code as any));
                    const yearly = calculateYearlyPrice(p.price);
                    return (
                      <button
                        type="button"
                        key={p.code}
                        disabled={isCurrent}
                        onClick={() => !isCurrent && setSelectedPlan(p.code)}
                        className={cn(
                          'relative w-full text-left rounded-xl border-2 p-3 transition-all',
                          isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30',
                          isCurrent && 'opacity-60 cursor-not-allowed',
                        )}
                      >
                        {isCurrent && (
                          <Badge className="absolute -top-2 right-3 bg-primary text-primary-foreground text-[10px] px-1.5">
                            Atual
                          </Badge>
                        )}
                        <div className="flex items-start gap-3">
                          <div className={cn('p-2 rounded-lg shrink-0', getPlanIconBg(p.code))}>
                            {getPlanIcon(p.code)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h3 className="font-bold text-base">{p.name}</h3>
                              {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              <Badge className="text-[10px] px-1.5 py-0 bg-blue-600 text-white hover:bg-blue-600">
                                <Users className="h-2.5 w-2.5 mr-0.5" />
                                {p.max_users} usuários
                              </Badge>
                              {planModules.map((m) => (
                                <Badge key={m.code} className="text-[10px] px-1.5 py-0 bg-emerald-600 text-white hover:bg-emerald-600">
                                  {m.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {billingCycle === 'monthly' ? (
                              <>
                                <p className="text-lg font-bold">R$ {formatBRL(p.price)}</p>
                                <p className="text-[10px] text-muted-foreground">/mês</p>
                              </>
                            ) : (
                              <>
                                <p className="text-lg font-bold text-emerald-600">R$ {formatBRL(yearly)}</p>
                                <p className="text-[10px] text-muted-foreground">/ano</p>
                                <p className="text-[10px] text-emerald-600">
                                  ≈ R$ {formatBRL(calculateMonthlyEquivalent(yearly))}/mês
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedPlan && (
                  <ChangeNotice newValue={presetPlans.find((p) => p.code === selectedPlan)?.price ?? 0} />
                )}
              </TabsContent>

              {/* ---------------- Personalizado ---------------- */}
              <TabsContent value="custom" className="space-y-3 mt-3">
                <CycleToggle />

                {/* Módulo básico (obrigatório, sempre incluso) */}
                {baseModule && (
                  <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-emerald-600 text-white">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{baseModule.name}</p>
                      <p className="text-[11px] text-white/80">Sempre incluso</p>
                    </div>
                    <span className="text-sm font-semibold">R$ {formatBRL(baseModule.price)}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <h4 className="font-medium text-sm">Adicione módulos:</h4>
                  {selectableModules.map((m) => {
                    const checked = customModules.includes(m.code);
                    return (
                      <button
                        type="button"
                        key={m.code}
                        onClick={() => toggleModule(m.code)}
                        className={cn(
                          'w-full text-left flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors',
                          checked ? 'bg-emerald-600 border-emerald-600 text-white' : 'hover:bg-muted/50',
                        )}
                      >
                        <Checkbox checked={checked} className="shrink-0 mt-0.5 pointer-events-none" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={cn('font-medium text-sm', checked && 'text-white')}>{m.name}</p>
                            <span className={cn('text-sm font-semibold shrink-0', checked ? 'text-white' : 'text-primary')}>
                              R$ {formatBRL(m.price)}
                            </span>
                          </div>
                          {m.description && (
                            <p className={cn('text-[11px] mt-0.5', checked ? 'text-white/80' : 'text-muted-foreground')}>
                              {m.description}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Nível de Notas Fiscais (NFS-e) — só quando o módulo nfe está selecionado */}
                {hasNfeInCustom && !nfseTiersLoading && nfseTiers.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="font-medium text-sm flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      {tBilling.nfseTierSectionTitle}
                    </h4>
                    <div className="grid gap-1.5" role="radiogroup" aria-label={tBilling.nfseTierSectionTitle}>
                      {nfseTiers.map((t) => {
                        const isSel = selectedNfseLevel === t.tier;
                        const isCurrent = t.tier === currentNfseTier;
                        const isDowngrade = currentNfseTier != null && t.tier < currentNfseTier;
                        return (
                          <button
                            type="button"
                            role="radio"
                            aria-checked={isSel}
                            key={t.tier}
                            disabled={isDowngrade}
                            onClick={() => !isDowngrade && setSelectedNfseLevel(t.tier)}
                            className={cn(
                              'flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-colors',
                              isSel
                                ? 'border-primary/50 ring-1 ring-primary/40 bg-primary/5'
                                : isDowngrade
                                ? 'border-border/40 opacity-40 cursor-not-allowed'
                                : 'border-border/60 hover:bg-muted/50 hover:border-muted-foreground/30',
                            )}
                          >
                            <span className={cn(
                              'h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                              isSel ? 'border-primary' : 'border-muted-foreground/40',
                            )}>
                              {isSel && <span className="h-2 w-2 rounded-full bg-primary" />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className={cn('text-sm font-semibold', isSel && 'text-primary')}>
                                {t.name}
                                {isCurrent && (
                                  <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">({tBilling.nfseTierCurrent})</span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">{formatTierLimit(t.monthlyLimit)}</p>
                            </div>
                            <span className={cn('text-sm font-bold shrink-0', isSel ? 'text-primary' : 'text-foreground')}>
                              R$ {formatBRL(t.price)}
                              <span className="text-[10px] text-muted-foreground font-normal">/mês</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {currentNfseTier != null && selectedNfseLevel !== currentNfseTier && (
                      <p className="text-[11px] text-muted-foreground">{tBilling.nfseTierUpgradeNote}</p>
                    )}
                  </div>
                )}

                {/* Usuários extras */}
                <div className="space-y-1.5" ref={usersSectionRef}>
                  <h4 className="font-medium text-sm">Usuários adicionais:</h4>
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-muted/30">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{BASE_USERS + customExtraUsers} usuários</p>
                      <p className="text-[11px] text-muted-foreground">
                        {BASE_USERS} inclusos + {customExtraUsers} extra{customExtraUsers !== 1 ? 's' : ''} (R$ {formatBRL(EXTRA_USER_PRICE)}/cada)
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="outline" size="icon" className="h-8 w-8"
                        disabled={customExtraUsers <= 0}
                        onClick={() => setCustomExtraUsers((v) => Math.max(0, v - 1))}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-6 text-center font-bold">{customExtraUsers}</span>
                      <Button
                        variant="outline" size="icon" className="h-8 w-8"
                        onClick={() => setCustomExtraUsers((v) => v + 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <ChangeNotice newValue={customMonthly} />
              </TabsContent>
            </Tabs>

            {/* Painel "Seu Plano" no MOBILE — rodapé da área rolável, abaixo das abas */}
            <div className="md:hidden mt-4 rounded-xl bg-muted/30 border border-border/60 p-4">
              <PlanSummaryPanel />
            </div>
          </div>

          {/* DIREITA — painel "Seu Plano" sticky (só desktop) */}
          <aside className="hidden md:block w-72 shrink-0 ml-4 self-start sticky top-0">
            <div className="rounded-xl bg-muted/30 border border-border/60 p-4">
              <PlanSummaryPanel />
            </div>
          </aside>
        </div>
      </ResponsiveModal>

      <UserExcessModal
        open={excessOpen}
        onOpenChange={setExcessOpen}
        users={users}
        currentUserId={user?.id}
        targetMaxUsers={pendingChange?.targetMaxUsers ?? maxUsers}
        onReduced={handleUsersReduced}
      />
    </>
  );
}

import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { CreditCard, Calendar, CheckCircle2, AlertTriangle, Clock, ArrowRight, Sparkles, Zap, Users, Package, Lock, Receipt } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInDays } from 'date-fns';
import { useEffect, useState } from 'react';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { MODULE_INFO } from '@/components/ModuleGateModal';
import { formatBRL } from '@/utils/currency';
import { PriceAmount } from '@/components/ui/PriceAmount';
import { CancelSubscriptionModal } from '@/components/billing/CancelSubscriptionModal';
import { ModulesManagementCard } from '@/components/billing/ModulesManagementCard';
import { NfseTierCard } from '@/components/billing/NfseTierCard';
import { PaymentHistoryList } from '@/components/billing/PaymentHistoryList';
import { useSubscriptionPaymentHistory } from '@/hooks/useSubscriptionPaymentHistory';
import { hasActiveCustomPrice as hasActiveCustomPriceUtil } from '@/utils/subscriptionPricing';

export default function Billing() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.billing;
  const { modules, hasModule, allPlans } = useCompanyModules();
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [showCancel, setShowCancel] = useState(false);

  // Deep-link vindo do ModuleGateModal / UserLimitModal:
  //   ?addModule=<code> → abre "Gerenciar Meu Plano" na aba Personalizado com o módulo pré-marcado.
  //   ?addUsers=1        → abre na aba Personalizado focando em usuários extras.
  // Capturamos uma única vez (no mount) para o card auto-abrir; depois limpamos a query.
  const [deepLink] = useState(() => ({
    addModule: searchParams.get('addModule'),
    addUsers: searchParams.get('addUsers') === '1',
  }));
  const wantsDeepLink = !!deepLink.addModule || deepLink.addUsers;

  const clearDeepLinkParams = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('addModule');
    next.delete('addUsers');
    setSearchParams(next, { replace: true });
  };

  const { data: company, isLoading } = useQuery({
    queryKey: ['my-company'],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user!.id)
        .single();
      if (!profile?.company_id) return null;
      const { data } = await supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const { data: allModules = [] } = useQuery({
    queryKey: ['subscription-modules'],
    queryFn: async () => {
      const { data } = await supabase
        .from('subscription_modules')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      return data || [];
    },
  });

  const { data: paymentHistory = [], isLoading: isLoadingHistory } =
    useSubscriptionPaymentHistory({ companyId: company?.id ?? null });

  useEffect(() => {
    if (company?.subscription_expires_at) {
      const update = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const exp = new Date(company.subscription_expires_at!);
        exp.setHours(0, 0, 0, 0);
        setDaysRemaining(differenceInDays(exp, today));
      };
      update();
      const interval = setInterval(update, 60000);
      return () => clearInterval(interval);
    }
  }, [company?.subscription_expires_at]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold">{t.noCompanyTitle}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t.noCompanyDesc}
          </p>
        </div>
      </div>
    );
  }

  const isTesting = company.subscription_status === 'testing';
  const effectiveValue = company.subscription_value || 0;

  const pluralDay = (n: number, tpl: string) =>
    tpl.replace('{days}', String(n)).replace(/\{s\}/g, n === 1 ? '' : 's');

  const getStatusConfig = (days: number | null) => {
    if (days !== null && days < 0) {
      const abs = Math.abs(days);
      return {
        badge: <Badge className="bg-orange-500 text-white text-sm px-3 py-1">{t.statusExpired}</Badge>,
        icon: AlertTriangle,
        message: pluralDay(abs, t.statusMsgExpired),
      };
    }
    if (days !== null && days <= 7) {
      return {
        badge: <Badge className="bg-orange-500 text-white text-sm px-3 py-1">{t.statusExpiringSoon}</Badge>,
        icon: Clock,
        message: pluralDay(days, t.statusMsgExpiringSoon),
      };
    }
    return {
      badge: <Badge className="bg-emerald-500 text-white text-sm px-3 py-1">{t.statusActive}</Badge>,
      icon: CheckCircle2,
      message: days !== null ? t.statusMsgActive.replace('{days}', String(days)) : t.statusMsgActiveNoDate,
    };
  };

  const statusConfig = getStatusConfig(daysRemaining);
  const StatusIcon = statusConfig.icon;

  // Nome de exibição do plano vem do BANCO (subscription_plans.name) — assim os
  // nomes renomeados (Essencial/Pro/Business) aparecem sozinhos quando o banco
  // mudar, sem código. Fallback: capitaliza o code enquanto a lista carrega.
  const planDisplayName = company.subscription_plan
    ? (allPlans.find((p) => p.code === company.subscription_plan)?.name
        ?? company.subscription_plan.charAt(0).toUpperCase() + company.subscription_plan.slice(1))
    : 'Starter';

  const activeModuleCodes = modules.map(m => m.module_code);
  const availableAddons = allModules.filter(
    (m: any) => !activeModuleCodes.includes(m.code) && m.code !== 'extra_user' && m.code !== 'basic'
  );

  const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Preço promocional ainda ativo (promoção temporária custom_price).
  const hasActiveCustomPrice = hasActiveCustomPriceUtil(company);

  // Renovação automática ativa: assinatura Asaas + último pagamento de cartão confirmado.
  const hasValidCardPayment = paymentHistory.some(
    (p) => (p.billingType || '').toUpperCase() === 'CREDIT_CARD'
      && (p.status === 'RECEIVED' || p.status === 'CONFIRMED')
  );

  // Dados pendentes para emissão de NFS-e.
  const missingNfseFields: string[] = [];
  if (!company.cnpj) missingNfseFields.push('CNPJ/CPF');
  if (!company.email) missingNfseFields.push('Email');
  if (!company.contact_name) missingNfseFields.push('Nome do responsável');
  if (!company.phone) missingNfseFields.push('Telefone');

  // Valor a exibir no box de "Valor a pagar": aplica desconto anual só no display.
  const displayAmountDue = company.billing_cycle === 'yearly'
    ? effectiveValue * 12 * 0.8
    : effectiveValue;

  return (
    <div className="space-y-8 max-w-5xl mx-auto p-4 sm:p-6">
      {isTesting ? (
        <div className="relative overflow-hidden rounded-xl md:rounded-2xl bg-gradient-to-br from-primary/90 to-primary p-6 sm:p-8 md:p-12 text-primary-foreground text-center">
          <div className="absolute top-0 right-0 w-32 md:w-64 h-32 md:h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-24 md:w-48 h-24 md:h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
          <div className="relative z-10 space-y-4 max-w-lg mx-auto">
            <Sparkles className="h-10 w-10 mx-auto" />
            <h1 className="text-2xl md:text-3xl font-bold">{t.heroTrialTitle}</h1>
            <p className="text-primary-foreground/80 text-sm md:text-base">
              {t.heroTrialDesc}
            </p>
            {daysRemaining !== null && daysRemaining > 0 && (
              <p className="text-primary-foreground/60 text-xs">
                <Clock className="h-3.5 w-3.5 inline mr-1" />
                {pluralDay(daysRemaining, t.heroTrialDaysLeft)}
              </p>
            )}
            <Button
              size="lg"
              variant="secondary"
              className="mt-4 font-semibold text-base px-8"
              onClick={() => navigate('/checkout')}
            >
              {t.btnChoosePlan}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-xl md:rounded-2xl bg-gradient-to-br from-primary/90 to-primary p-4 sm:p-6 md:p-8 text-primary-foreground">
          <div className="absolute top-0 right-0 w-32 md:w-64 h-32 md:h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-24 md:w-48 h-24 md:h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
          <div className="relative z-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
              <div className="space-y-1 md:space-y-2">
                <div className="flex items-start gap-2 md:gap-3">
                  <Sparkles className="h-5 w-5 md:h-6 md:w-6 shrink-0 mt-0.5" />
                  <h1 className="text-lg sm:text-xl md:text-3xl font-bold break-words">{company.name}</h1>
                </div>
                <p className="text-primary-foreground/80 text-sm md:text-lg">{t.planLabel.replace('{name}', planDisplayName)}</p>
              </div>
              <div className="flex items-center justify-between md:flex-col md:items-end gap-2">
                {statusConfig.badge}
                <p className="text-primary-foreground/70 text-xs md:text-sm flex items-center gap-1.5">
                  <StatusIcon className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  {statusConfig.message}
                </p>
              </div>
            </div>

            <div className="mt-4 md:mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-6">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg md:rounded-xl p-3 md:p-4">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="p-1.5 md:p-2 bg-white/20 rounded-lg shrink-0">
                    <CreditCard className="h-4 w-4 md:h-5 md:w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs md:text-sm text-primary-foreground/70">{t.labelMonthlyValue}</p>
                    <PriceAmount
                      value={effectiveValue}
                      suffix="/mês"
                      className="text-lg md:text-2xl font-bold"
                    />
                  </div>
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg md:rounded-xl p-3 md:p-4">
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="p-1.5 md:p-2 bg-white/20 rounded-lg shrink-0">
                    <Calendar className="h-4 w-4 md:h-5 md:w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs md:text-sm text-primary-foreground/70">{t.labelExpiration}</p>
                    <p className="text-sm md:text-lg font-semibold">
                      {company.subscription_expires_at
                        ? format(new Date(company.subscription_expires_at), 'dd/MM/yy')
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Banners informativos condicionais (só fora do trial e só quando há dado). */}
      {!isTesting && (
        <>
          {/* Preço promocional ativo */}
          {hasActiveCustomPrice && (
            <div className="bg-blue-600 rounded-xl p-4 flex items-start gap-3">
              <div className="p-1.5 bg-white/20 rounded-lg shrink-0 mt-0.5">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="font-medium text-white">{t.bannerPromoTitle}</p>
                <p className="text-sm text-white/80">
                  {t.bannerPromoDesc.replace('{value}', fmtBRL(company.subscription_value || 0))}
                </p>
              </div>
            </div>
          )}

          {/* Valor pendente (mudança agendada pelo admin) */}
          {company.pending_subscription_value ? (
            <div className="bg-orange-600 rounded-xl p-4 flex items-start gap-3">
              <div className="p-1.5 bg-white/20 rounded-lg shrink-0 mt-0.5">
                <AlertTriangle className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="font-medium text-white">{t.bannerPendingTitle}</p>
                <p className="text-sm text-white/80">
                  {t.bannerPendingDesc
                    .replace('{current}', fmtBRL(effectiveValue))
                    .replace('{new}', fmtBRL(company.pending_subscription_value))}
                </p>
              </div>
            </div>
          ) : null}

          {/* Renovação automática ativa */}
          {(company as any).asaas_subscription_id && hasValidCardPayment && (
            <div className="bg-background border rounded-xl p-4 flex items-start gap-3">
              <div className="p-1.5 bg-muted rounded-lg shrink-0 mt-0.5">
                <CreditCard className="h-4 w-4 text-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">{t.bannerRecurringTitle}</p>
                <p className="text-sm text-muted-foreground">{t.bannerRecurringDesc}</p>
              </div>
            </div>
          )}

          {/* Dados pendentes para NFS-e */}
          {missingNfseFields.length > 0 && (
            <div className="bg-background border rounded-xl p-4 flex items-start gap-3">
              <div className="p-1.5 bg-muted rounded-lg shrink-0 mt-0.5">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">{t.bannerNfseTitle}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t.bannerNfseDesc.replace('{fields}', missingNfseFields.join(', '))}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Pagamento + Resumo do plano (logo após os banners, como no EcoSistema). */}
      {!isTesting && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Payment Card */}
          <Card className="relative overflow-hidden border transition-all duration-300 hover:shadow-xl">
            <CardHeader className="relative p-4 md:p-6">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-[13px] font-semibold uppercase tracking-widest text-foreground/85 flex items-center gap-2">
                  <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-primary shrink-0">
                    <Zap className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
                  </div>
                  <span>{t.cardPaymentTitle}</span>
                </CardTitle>
                {daysRemaining !== null && daysRemaining <= 7 && (
                  <Badge variant="outline" className="animate-pulse bg-orange-500/10 text-orange-600 border-orange-300 text-xs shrink-0">
                    {t.statusExpiringSoon}
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-2 text-xs md:text-sm">
                {daysRemaining !== null && daysRemaining < 0
                  ? t.cardPaymentDescExpired
                  : t.cardPaymentDescActive}
              </CardDescription>
            </CardHeader>
            <CardContent className="relative p-4 md:p-6 pt-0">
              <div className="space-y-4 md:space-y-5">
                <div className="relative overflow-hidden rounded-xl md:rounded-2xl bg-gradient-to-br from-background to-muted/50 border p-4 md:p-6">
                  <div className="absolute top-0 right-0 w-16 md:w-20 h-16 md:h-20 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                    <div>
                      <p className="text-xs md:text-sm text-muted-foreground font-medium">{t.labelAmountDue}</p>
                      <p className="text-2xl md:text-4xl font-bold tracking-tight mt-1">
                        R$ {formatBRL(displayAmountDue)}
                      </p>
                      {company.billing_cycle === 'yearly' && (
                        <p className="text-xs text-emerald-500 mt-1">
                          {t.paymentYearlyDiscount}
                        </p>
                      )}
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{t.labelDueDate}</p>
                      <p className="font-semibold text-base md:text-lg">
                        {company.subscription_expires_at
                          ? format(new Date(company.subscription_expires_at), 'dd/MM/yyyy')
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>
                <Button
                  className="w-full h-12 md:h-14 text-base md:text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
                  size="lg"
                  onClick={() => {
                    // Trial ou empresa sem plano/valor definido → escolher plano.
                    // Senão → renovação direta com o valor atual.
                    if (company.subscription_status === 'testing' || !effectiveValue) {
                      navigate('/checkout');
                    } else {
                      navigate('/checkout?mode=renewal');
                    }
                  }}
                >
                  {t.btnPayNow}
                  <ArrowRight className="ml-2 h-4 w-4 md:h-5 md:w-5 -rotate-45" />
                </Button>

                <div className="flex items-center justify-center gap-3 md:gap-4 text-[10px] md:text-xs text-muted-foreground">
                  <div className="flex items-center gap-1 md:gap-1.5">
                    <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-emerald-500" />
                    <span>PIX</span>
                  </div>
                  <div className="flex items-center gap-1 md:gap-1.5">
                    <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-muted-foreground" />
                    <span>Boleto</span>
                  </div>
                  <div className="flex items-center gap-1 md:gap-1.5">
                    <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-primary" />
                    <span>Cartão</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Card */}
          <Card className="relative overflow-hidden border transition-all duration-300 hover:shadow-xl">
            <CardHeader className="relative p-4 md:p-6">
              <CardTitle className="text-[13px] font-semibold uppercase tracking-widest text-foreground/85 flex items-center gap-2">
                <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-primary shrink-0">
                  <Users className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
                </div>
                <span>{t.cardSummaryTitle}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative p-4 md:p-6 pt-0 space-y-4">
              <div className="flex justify-between text-sm py-2 border-b border-border">
                <span className="text-muted-foreground">{t.summaryPlan}</span>
                <span className="font-semibold capitalize">{planDisplayName}</span>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-border">
                <span className="text-muted-foreground">{t.summaryActiveModules}</span>
                <span className="font-semibold">{modules.length}</span>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-border">
                <span className="text-muted-foreground">{t.summaryMaxUsers}</span>
                <span className="font-semibold">{company.max_users || 5}</span>
              </div>
              <div className="flex justify-between text-sm py-2 border-b border-border">
                <span className="text-muted-foreground">{t.summaryCycle}</span>
                <span className="font-semibold capitalize">{company.billing_cycle === 'yearly' ? t.cycleYearly : t.cycleMonthly}</span>
              </div>
              <div className="flex justify-between text-sm py-2">
                <span className="text-muted-foreground">{t.summaryStatus}</span>
                {statusConfig.badge}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gerenciar plano (só fora do trial — no trial o fluxo é o checkout). */}
      {!isTesting && (
        <ModulesManagementCard
          autoOpen={wantsDeepLink}
          initialTab={wantsDeepLink ? 'custom' : undefined}
          preselectModule={deepLink.addModule}
          focusUsers={deepLink.addUsers}
          onAutoOpenConsumed={clearDeepLinkParams}
        />
      )}

      {/* Nível de Notas Fiscais (NFS-e) — só quando a empresa tem o módulo. */}
      {!isTesting && (
        <NfseTierCard companyId={company.id} hasNfeModule={hasModule('nfe')} />
      )}

      {/* Active Modules */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          {t.sectionActiveModules}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {modules.map((m) => {
            const info = MODULE_INFO[m.module_code];
            if (!info) return null;
            return (
              <Card key={m.module_code} className="border-primary/20 bg-primary/5">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{info.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{info.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Available Addons */}
      {availableAddons.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            {t.sectionAvailableModules}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {availableAddons.map((m: any) => {
              const info = MODULE_INFO[m.code];
              return (
                <Card key={m.code} className="border-dashed hover:border-primary/50 transition-colors group">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                        <Lock className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{info?.name || m.name}</p>
                        <p className="text-xs text-muted-foreground">R$ {formatBRL(m.price)}/mês</p>
                      </div>
                    </div>
                    {info?.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{info.description}</p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => navigate('/checkout')}
                    >
                      {t.btnHireModule}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Histórico de pagamentos */}
      <Card className="border">
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-[13px] font-semibold uppercase tracking-widest text-foreground/85 flex items-center gap-2">
            <div className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-primary shrink-0">
              <Receipt className="h-4 w-4 md:h-5 md:w-5 text-primary-foreground" />
            </div>
            <span>{t.cardPaymentHistoryTitle}</span>
          </CardTitle>
          <CardDescription className="mt-2 text-xs md:text-sm">
            {t.cardPaymentHistoryDesc}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <PaymentHistoryList payments={paymentHistory} isLoading={isLoadingHistory} />
        </CardContent>
      </Card>

      {/* Cancelar assinatura */}
      {!isTesting && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => setShowCancel(true)}
            className="text-sm text-muted-foreground hover:text-destructive underline-offset-4 hover:underline transition-colors"
          >
            {t.btnCancelSubscription}
          </button>
          <p className="text-xs text-muted-foreground/70 text-center max-w-sm">
            {t.cancelSubscriptionNote}
          </p>
        </div>
      )}

      <CancelSubscriptionModal
        open={showCancel}
        onOpenChange={setShowCancel}
        companyId={company.id}
        subscriptionExpiresAt={company.subscription_expires_at}
      />
    </div>
  );
}

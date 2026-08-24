import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  CreditCard,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Sparkles,
  Receipt,
  QrCode,
  Barcode,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInDays } from 'date-fns';
import { useEffect, useState } from 'react';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { formatBRL } from '@/utils/currency';
import { ModulesManagementCard } from '@/components/billing/ModulesManagementCard';
import { PaymentHistoryList } from '@/components/billing/PaymentHistoryList';
import { AccountUsageCard } from '@/components/billing/AccountUsageCard';
import { useSubscriptionPaymentHistory } from '@/hooks/useSubscriptionPaymentHistory';
import { hasActiveCustomPrice as hasActiveCustomPriceUtil } from '@/utils/subscriptionPricing';
import { cn } from '@/lib/utils';
export default function Billing() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.billing;
  const { modules, allPlans, effectiveValue: modulesEffectiveValue, plan: currentPlanCode } = useCompanyModules();
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);

  // Deep-link vindo do ModuleGateModal / UserLimitModal:
  //   ?addModule=<code> → abre "Gerenciar Meu Plano" na aba Personalizado com o módulo pré-marcado.
  //   ?addUsers=1        → abre na aba Personalizado focando em usuários extras.
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
          <p className="text-sm text-muted-foreground mt-1">{t.noCompanyDesc}</p>
        </div>
      </div>
    );
  }

  const isTesting = company.subscription_status === 'testing';
  // Fonte de verdade do valor efetivo: useCompanyModules().effectiveValue aplica
  // custom_price (promoção) sobre subscription_value — a mesma lógica que o
  // ModulesManagementCard e o /checkout usam. Fallback: subscription_value direto
  // da query local (para o caso raro de o hook ainda estar carregando).
  const effectiveValue = modulesEffectiveValue || company.subscription_value || 0;

  const pluralDay = (n: number, tpl: string) =>
    tpl.replace('{days}', String(n)).replace(/\{s\}/g, n === 1 ? '' : 's');

  const getStatusConfig = (days: number | null) => {
    if (days !== null && days < 0) {
      const abs = Math.abs(days);
      return {
        badge: <Badge className="bg-orange-500 text-white text-sm px-3 py-1">{t.statusExpired}</Badge>,
        icon: AlertTriangle,
        color: 'text-orange-600' as const,
        message: pluralDay(abs, t.statusMsgExpired),
      };
    }
    if (days !== null && days <= 7) {
      return {
        badge: <Badge className="bg-orange-500 text-white text-sm px-3 py-1">{t.statusExpiringSoon}</Badge>,
        icon: Clock,
        color: 'text-orange-600' as const,
        message: pluralDay(days, t.statusMsgExpiringSoon),
      };
    }
    return {
      badge: <Badge className="bg-emerald-500 text-white text-sm px-3 py-1">{t.statusActive}</Badge>,
      icon: CheckCircle2,
      color: 'text-emerald-600' as const,
      message: days !== null ? t.statusMsgActive.replace('{days}', String(days)) : t.statusMsgActiveNoDate,
    };
  };

  const statusConfig = getStatusConfig(daysRemaining);
  const StatusIcon = statusConfig.icon;

  // Nome de exibição do plano
  // Mesma lógica do card "Sua Assinatura" (ModulesManagementCard): nome do plano
  // pelo catálogo, com "Personalizado" quando é plano customizado.
  const planDisplayName = allPlans.find((p) => p.code === currentPlanCode)?.name
    || (currentPlanCode === 'personalizado' ? 'Personalizado' : currentPlanCode);

  const fmtBRL = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Promoção / preço custom ativo
  const hasActiveCustomPrice = hasActiveCustomPriceUtil(company);

  // Renovação automática ativa: assinatura Asaas + último pagamento de cartão confirmado
  const hasValidCardPayment = paymentHistory.some(
    (p) => (p.billingType || '').toUpperCase() === 'CREDIT_CARD'
      && (p.status === 'RECEIVED' || p.status === 'CONFIRMED')
  );

  // Dados pendentes para NFS-e
  const missingNfseFields: string[] = [];
  if (!company.cnpj) missingNfseFields.push('CNPJ/CPF');
  if (!company.email) missingNfseFields.push('Email');
  if (!company.contact_name) missingNfseFields.push('Nome do responsável');
  if (!company.phone) missingNfseFields.push('Telefone');

  // Valor a exibir: aplica desconto anual só no display
  const displayAmountDue = company.billing_cycle === 'yearly'
    ? effectiveValue * 12 * 0.8
    : effectiveValue;

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6">

      {/* ═══════════════════════════════════════════════════════════════════
          HERO: Trial → CTA de ativar | Ativo → não exibido (integrado abaixo)
          ══════════════════════════════════════════════════════════════════ */}
      {isTesting && (
        <div className="relative overflow-hidden rounded-xl md:rounded-2xl bg-gradient-to-br from-primary/90 to-primary p-6 sm:p-8 md:p-12 text-primary-foreground text-center">
          <div className="absolute top-0 right-0 w-32 md:w-64 h-32 md:h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-24 md:w-48 h-24 md:h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
          <div className="relative z-10 space-y-4 max-w-lg mx-auto">
            <Sparkles className="h-10 w-10 mx-auto" />
            <h1 className="text-2xl md:text-3xl font-bold">{t.heroTrialTitle}</h1>
            <p className="text-primary-foreground/80 text-sm md:text-base">{t.heroTrialDesc}</p>
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
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          GRID TOPO (plano+pagamento fundido ESQ | AccountUsageCard DIR)
          Só exibido fora do trial.
          ══════════════════════════════════════════════════════════════════ */}
      {!isTesting && (
        <div className="grid gap-4 md:gap-5 lg:grid-cols-2 items-stretch">
          {/* Coluna esquerda — Plano + Pagamento fundidos */}
          <Card className="flex flex-col border-0 shadow-none bg-transparent">
            <CardContent className="p-5 sm:p-6 flex flex-col gap-4 flex-1">
              {/* Cabeçalho: nome + status + plano */}
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg md:text-xl font-bold tracking-tight break-words">
                    {company.name}
                  </h2>
                  {statusConfig.badge}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t.planLabel.replace('{name}', planDisplayName)} · {modules.length} módulo{modules.length !== 1 ? 's' : ''}
                </p>
                <p className={cn('text-xs flex items-center gap-1.5', statusConfig.color)}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {statusConfig.message}
                </p>
              </div>

              {/* Vencimento */}
              <div className="flex items-center justify-between gap-4 pt-1 text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {t.labelExpiration}
                </span>
                <span className="font-semibold">
                  {company.subscription_expires_at
                    ? format(new Date(company.subscription_expires_at), 'dd/MM/yyyy')
                    : '—'}
                </span>
              </div>

              {/* Valor pendente (mudança agendada) */}
              {company.pending_subscription_value ? (
                <div className="pt-3 border-t border-border/40 flex items-start gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <p>
                    {t.bannerPendingDesc
                      .replace('{current}', fmtBRL(effectiveValue))
                      .replace('{new}', fmtBRL(company.pending_subscription_value))}
                  </p>
                </div>
              ) : null}

              {/* Bloco de pagamento fundido */}
              <div className="mt-auto pt-4 border-t border-border/40 space-y-4">
                {/* Valor */}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs md:text-sm text-muted-foreground font-medium">
                      {company.billing_cycle === 'yearly' ? t.labelAmountDue : t.labelMonthlyValue}
                    </p>
                    {daysRemaining !== null && daysRemaining <= 7 && (
                      <Badge
                        variant="outline"
                        className="bg-orange-500/10 text-orange-600 border-orange-300 text-xs shrink-0"
                      >
                        {t.statusExpiringSoon}
                      </Badge>
                    )}
                  </div>
                  <p className="text-3xl md:text-4xl font-bold tracking-tight mt-1">
                    R$ {formatBRL(displayAmountDue)}
                    {company.billing_cycle !== 'yearly' && (
                      <span className="text-base font-normal text-muted-foreground">/mês</span>
                    )}
                  </p>
                  {company.billing_cycle === 'yearly' && (
                    <p className="text-xs text-emerald-500 font-medium mt-1">
                      {t.paymentYearlyDiscount}
                    </p>
                  )}
                </div>

                {/* Formas de pagamento */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {MESSAGES[locale].app.settings.billing.accountUsage.paymentMethods}
                  </p>
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shrink-0">
                        <QrCode className="h-4 w-4" />
                      </span>
                      PIX
                    </span>
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white shrink-0">
                        <Barcode className="h-4 w-4" />
                      </span>
                      Boleto
                    </span>
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white shrink-0">
                        <CreditCard className="h-4 w-4" />
                      </span>
                      Cartão
                    </span>
                  </div>
                </div>

                {/* Botão Pagar Agora — renovação rota pro /checkout?mode=renewal;
                    trial/sem valor vai pro /checkout para escolher o plano. */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="block w-full">
                        <Button
                          className="w-full h-12 md:h-14 text-base md:text-lg font-semibold"
                          size="lg"
                          onClick={() => {
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
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t.cardPaymentDescActive}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>

          {/* Coluna direita — Uso da conta */}
          <AccountUsageCard />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          BANNERS INFORMATIVOS CONDICIONAIS
          ══════════════════════════════════════════════════════════════════ */}
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

      {/* ═══════════════════════════════════════════════════════════════════
          GERENCIAR PLANO (ModulesManagementCard)
          ══════════════════════════════════════════════════════════════════ */}
      {!isTesting && (
        <ModulesManagementCard
          autoOpen={wantsDeepLink}
          initialTab={wantsDeepLink ? 'custom' : undefined}
          preselectModule={deepLink.addModule}
          focusUsers={deepLink.addUsers}
          onAutoOpenConsumed={clearDeepLinkParams}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          HISTÓRICO DE PAGAMENTOS
          ══════════════════════════════════════════════════════════════════ */}
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


    </div>
  );
}

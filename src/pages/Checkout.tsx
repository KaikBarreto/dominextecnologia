import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowLeft, Loader2, Clock, AlertTriangle, Plus, Minus, Sparkles, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { differenceInDays, addMonths } from 'date-fns';
import { CheckoutLayout } from '@/components/checkout/CheckoutLayout';
import { toast } from 'sonner';
import { formatBRL } from '@/utils/currency';
import logoGreen from '@/assets/logo-horizontal-verde.png';
import logoBlack from '@/assets/logo-black-horizontal.png';

type PaymentMethod = 'pix' | 'boleto' | 'card' | null;
type BillingCycle = 'monthly' | 'yearly';
type CheckoutMode = 'plans' | 'custom';

const calculateYearlyPrice = (monthlyPrice: number) => monthlyPrice * 12 * 0.8;
const calculateMonthlyEquivalent = (yearlyPrice: number) => yearlyPrice / 12;

// Pre-built plans
const PREBUILT_PLANS = [
  {
    code: 'essencial',
    name: 'Essencial',
    description: 'Ideal para empresas iniciantes',
    price: 200,
    modules: ['basic'],
    maxUsers: 5,
    features: ['Ordens de Serviço', 'Agenda', 'Dashboard', 'Orçamentos', 'Serviços', 'Mapa ao Vivo', 'Clientes', 'Equipamentos', 'Estoque', 'Contratos/PMOC', 'Financeiro Básico', '5 Usuários inclusos'],
  },
  {
    code: 'avancado',
    name: 'Avançado',
    description: 'Para equipes em crescimento',
    price: 350,
    modules: ['basic', 'rh', 'finance_advanced'],
    maxUsers: 5,
    popular: true,
    features: ['Tudo do Essencial', 'Funcionários / RH', 'Ponto Eletrônico', 'Financeiro Avançado (DRE)', 'Contas a Pagar e Receber'],
  },
  {
    code: 'master',
    name: 'Master',
    description: 'Acesso completo a todos os módulos',
    price: 650,
    modules: ['basic', 'rh', 'crm', 'nfe', 'finance_advanced', 'pricing_advanced', 'customer_portal', 'white_label'],
    maxUsers: 10,
    features: ['Tudo do Avançado', 'CRM Completo', 'Emissão de Notas Fiscais', 'Precificação Avançada (BDI)', 'Portal do Cliente', 'White Label', '10 Usuários inclusos'],
  },
];

export default function Checkout() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const [mode, setMode] = useState<CheckoutMode>('plans');
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [showCheckout, setShowCheckout] = useState(false);
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Custom plan state
  const [selectedModules, setSelectedModules] = useState<string[]>(['basic']);
  const [extraUsers, setExtraUsers] = useState(0);

  const { data: companyData, isLoading: companyLoading } = useQuery({
    queryKey: ['checkout-company'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      if (!profile?.company_id) throw new Error('No company');
      const { data: company } = await supabase.from('companies').select('*').eq('id', profile.company_id).single();
      return { ...company, _userEmail: user.email };
    },
  });

  const { data: moduleCatalog = [], isLoading: modulesLoading } = useQuery({
    queryKey: ['subscription-modules-catalog'],
    queryFn: async () => {
      const { data } = await supabase
        .from('subscription_modules')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      return data || [];
    },
  });

  const isRenewal = companyData?.subscription_status === 'active';
  const isPendingPayment = companyData?.subscription_status === 'pending_payment';
  const skipPlanSelection = isRenewal || isPendingPayment;

  // For renewal/pending payment, build plan info from existing company data
  const lockedPlanInfo = skipPlanSelection && companyData ? (() => {
    const planMap: Record<string, { name: string; maxUsers: number; features: string[] }> = {
      start: { name: 'Start', maxUsers: 5, features: PREBUILT_PLANS[0].features },
      starter: { name: 'Start', maxUsers: 5, features: PREBUILT_PLANS[0].features },
      avancado: { name: 'Avançado', maxUsers: 5, features: PREBUILT_PLANS[1].features },
      pro: { name: 'Avançado', maxUsers: 5, features: PREBUILT_PLANS[1].features },
      master: { name: 'Master', maxUsers: 15, features: PREBUILT_PLANS[2].features },
      enterprise: { name: 'Master', maxUsers: 15, features: PREBUILT_PLANS[2].features },
    };
    const meta = planMap[companyData.subscription_plan as string] || { name: 'Atual', maxUsers: companyData.max_users || 5, features: [] };
    return {
      name: meta.name,
      price: companyData.subscription_value || 0,
      features: meta.features,
      maxUsers: companyData.max_users || meta.maxUsers,
    };
  })() : null;

  const trialDaysLeft = companyData?.subscription_expires_at
    ? differenceInDays(new Date(companyData.subscription_expires_at), new Date())
    : null;
  const trialExpired = trialDaysLeft !== null && trialDaysLeft <= 0;

  // Custom plan calculation
  const customPlanPrice = useMemo(() => {
    let total = 0;
    selectedModules.forEach(code => {
      const mod = moduleCatalog.find((m: any) => m.code === code);
      if (mod) total += Number(mod.price);
    });
    total += extraUsers * 50;
    return total;
  }, [selectedModules, extraUsers, moduleCatalog]);

  const toggleModule = (code: string) => {
    if (code === 'basic') return;
    setSelectedModules(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  // Get current selected plan info
  const currentPlanInfo = skipPlanSelection && lockedPlanInfo
    ? lockedPlanInfo
    : mode === 'custom'
      ? { name: 'Personalizado', price: customPlanPrice, features: selectedModules.map(code => moduleCatalog.find((m: any) => m.code === code)?.name || code), maxUsers: 5 + extraUsers }
      : PREBUILT_PLANS.find(p => p.code === selectedPlan);

  const planPrice = currentPlanInfo?.price || 0;
  const yearlyPrice = calculateYearlyPrice(planPrice);
  const finalPrice = skipPlanSelection ? planPrice : (billingCycle === 'yearly' ? yearlyPrice : planPrice);
  const renewalCycle = companyData?.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
  const effectiveCycle = skipPlanSelection ? renewalCycle as BillingCycle : billingCycle;
  const nextDueDate = addMonths(new Date(), effectiveCycle === 'yearly' ? 12 : 1).toISOString();

  if (companyLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-5xl space-y-8">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
          </div>
        </div>
      </div>
    );
  }

  const handleCreatePayment = async (method: PaymentMethod, cardData?: any) => {
    if (!currentPlanInfo) return;
    setIsCreatingPayment(true);
    setPaymentMethod(method);
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (method === 'pix') {
      setPaymentData({
        payment_id: 'mock_' + Date.now(),
        pix_qr_code: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        pix_copy_paste: '00020126580014br.gov.bcb.pix0136a0f0a0a0-0000-0000-0000-000000000000520400005303986540599.995802BR5925DOMINEX TECNOLOGIA LTDA6009SAO PAULO62070503***6304ABCD',
        pix_expiration_date: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
    } else if (method === 'boleto') {
      setPaymentData({
        payment_id: 'mock_' + Date.now(),
        invoice_url: '#',
        bank_slip_url: '#',
        identification_field: '23793.38128 60000.000003 00000.000400 1 84340000099900',
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      });
    } else if (method === 'card') {
      // Activate company → status active + push expiration to next billing cycle
      if (companyData?.id) {
        const newExpiration = addMonths(new Date(), effectiveCycle === 'yearly' ? 12 : 1);
        await supabase
          .from('companies')
          .update({
            subscription_status: 'active',
            subscription_expires_at: newExpiration.toISOString(),
          })
          .eq('id', companyData.id);
      }
      setPaymentData({ status: 'CONFIRMED' });
      toast.success('Pagamento processado com sucesso!');
      setPaymentSuccess(true);
      setTimeout(() => { window.location.href = '/dashboard'; }, 3000);
    }
    setIsCreatingPayment(false);
  };

  // Checkout payment screen — renewal skips plan selection
  if ((showCheckout || isRenewal) && currentPlanInfo) {
    return (
      <motion.div
        key="checkout-payment"
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <CheckoutLayout
          planName={currentPlanInfo.name}
          planPrice={planPrice}
          finalPrice={finalPrice}
          billingCycle={effectiveCycle}
          features={currentPlanInfo.features || []}
          maxUsers={currentPlanInfo.maxUsers || 5}
          cpfCnpj={cpfCnpj}
          onCpfCnpjChange={setCpfCnpj}
          paymentMethod={paymentMethod}
          paymentData={paymentData}
          isCreatingPayment={isCreatingPayment}
          onPaymentMethodSelect={setPaymentMethod}
          onCreatePayment={handleCreatePayment}
          onClearPayment={() => { setPaymentMethod(null); setPaymentData(null); }}
          paymentSuccess={paymentSuccess}
          nextDueDate={nextDueDate}
          companyName={companyData?.name}
          userEmail={companyData?._userEmail}
        />
      </motion.div>
    );
  }

  const modules = moduleCatalog.filter((m: any) => m.code !== 'extra_user' && m.code !== 'basic');

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-5xl space-y-8">
        {/* Progress stepper */}
        <div className="flex items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">1</div>
            <span className="text-sm font-medium hidden sm:inline">Escolha o plano</span>
          </div>
          <div className="w-12 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-bold">2</div>
            <span className="text-sm text-muted-foreground hidden sm:inline">Pagamento</span>
          </div>
        </div>

        <div className="text-center space-y-3">
          <img
            src={resolvedTheme === 'dark' ? logoGreen : logoBlack}
            alt="Dominex"
            className="h-10 mx-auto"
          />
          <h1 className="text-2xl font-bold">{isRenewal ? 'Renovar Assinatura' : 'Ative sua Assinatura'}</h1>

          {trialExpired ? (
            <div className="inline-flex items-center gap-2 bg-destructive/10 text-destructive px-4 py-2 rounded-lg">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Seu período de teste expirou.</span>
            </div>
          ) : trialDaysLeft !== null && trialDaysLeft <= 7 ? (
            <div className="inline-flex items-center gap-2 bg-background border border-orange-400 text-orange-500 dark:text-orange-400 px-4 py-2 rounded-lg">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">
                Teste expira em {trialDaysLeft} dia{trialDaysLeft !== 1 ? 's' : ''}.
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground">Escolha o plano ideal para o seu negócio.</p>
          )}
        </div>

        {/* Billing cycle toggle */}
        <div className="flex items-center justify-center gap-4">
          <span className={cn('text-sm font-medium', billingCycle === 'monthly' && 'text-primary')}>Mensal</span>
          <Switch checked={billingCycle === 'yearly'} onCheckedChange={(c) => setBillingCycle(c ? 'yearly' : 'monthly')} />
          <span className={cn('text-sm font-medium', billingCycle === 'yearly' && 'text-primary')}>Anual</span>
          <Badge className={cn('bg-emerald-500 text-white transition-opacity ml-5', billingCycle === 'yearly' ? 'opacity-100' : 'opacity-0 pointer-events-none')}>-20%</Badge>
        </div>

        {/* Mode tabs */}
        <div className="flex items-center justify-center gap-2">
          <Button
            variant={mode === 'plans' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setMode('plans'); setSelectedPlan(null); }}
            className="gap-2"
          >
            <Package className="h-4 w-4" />
            Planos Prontos
          </Button>
          <Button
            variant={mode === 'custom' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('custom')}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Monte o Seu
          </Button>
        </div>

        {mode === 'plans' ? (
          /* Pre-built plans */
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {PREBUILT_PLANS.map((plan, index) => {
              const isSelected = selectedPlan === plan.code;
              const me = billingCycle === 'yearly' ? calculateMonthlyEquivalent(calculateYearlyPrice(plan.price)) : plan.price;
              return (
                <motion.div
                  key={plan.code}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className={cn(plan.popular && 'md:-mt-4 md:mb-[-16px]')}
                >
                  <Card
                    className={cn(
                      'cursor-pointer transition-all relative overflow-hidden h-full flex flex-col',
                      'hover:shadow-xl hover:-translate-y-1',
                      plan.popular && 'border-primary shadow-lg ring-1 ring-primary/20',
                      isSelected && 'ring-2 ring-primary border-primary shadow-xl',
                    )}
                    onClick={() => setSelectedPlan(plan.code)}
                  >
                    {plan.popular && <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />}
                    {plan.popular && (
                      <div className="flex justify-center pt-4 pb-0">
                        <Badge className="bg-primary text-primary-foreground text-xs px-3 py-1">⭐ Mais Popular</Badge>
                      </div>
                    )}

                    <CardHeader className={cn('text-center pb-2', plan.popular ? 'pt-3' : 'pt-6')}>
                      <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                      <CardDescription className="text-xs min-h-[2rem]">{plan.description}</CardDescription>
                    </CardHeader>

                    <CardContent className="flex flex-col flex-1 gap-5">
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">
                          {billingCycle === 'yearly' ? 'equivalente a' : 'a partir de'}
                        </p>
                        <div className="flex items-baseline justify-center gap-1">
                          <span className="text-sm text-muted-foreground">R$</span>
                          <span className={cn('font-extrabold tracking-tight', plan.popular ? 'text-5xl text-primary' : 'text-4xl')}>
                            {me.toFixed(0)}
                          </span>
                          <span className="text-muted-foreground text-sm">/mês</span>
                        </div>
                        {billingCycle === 'yearly' && (
                          <div className="mt-1 space-y-0.5">
                            <p className="text-xs text-muted-foreground line-through">R$ {plan.price.toFixed(0)}/mês</p>
                            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              Total: R$ {calculateYearlyPrice(plan.price).toFixed(0)}/ano · Economize 20%
                            </p>
                          </div>
                        )}
                      </div>

                      <Button
                        variant={isSelected ? 'default' : 'outline'}
                        className={cn('w-full font-semibold', isSelected && 'bg-primary hover:bg-primary/90')}
                        onClick={(e) => { e.stopPropagation(); setSelectedPlan(plan.code); }}
                      >
                        {isSelected ? <><Check className="h-4 w-4 mr-1" /> Selecionado</> : 'Selecionar'}
                      </Button>

                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Recursos</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>

                      <div className="space-y-2.5 flex-1">
                        {plan.features.map((f) => (
                          <div key={f} className="flex items-center gap-2.5 text-sm">
                            <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          /* Custom plan builder */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Module selection */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Módulos</CardTitle>
                  <CardDescription className="text-xs">Selecione os módulos para montar seu plano</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Basic - always included */}
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <Checkbox checked disabled className="data-[state=checked]:bg-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Módulo Básico</p>
                      <p className="text-xs text-muted-foreground">OS, Agenda, Dashboard, Clientes, Equipamentos e mais</p>
                    </div>
                    <span className="text-sm font-bold shrink-0">R$ 200</span>
                  </div>

                  <Separator />

                  {modules.map((mod: any) => {
                    const isChecked = selectedModules.includes(mod.code);
                    return (
                      <div
                        key={mod.code}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                          isChecked ? 'bg-primary/5 border-primary/20' : 'hover:bg-muted/50'
                        )}
                        onClick={() => toggleModule(mod.code)}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleModule(mod.code)}
                          className="data-[state=checked]:bg-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{mod.name}</p>
                            <Badge variant="secondary" className="text-[10px]">{mod.type === 'module' ? 'Módulo' : 'Adicional'}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{mod.description}</p>
                        </div>
                        <span className="text-sm font-bold shrink-0">R$ {formatBRL(mod.price)}</span>
                      </div>
                    );
                  })}

                  <Separator />

                  {/* Extra users */}
                  <div className="p-3 rounded-lg border space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Usuários Extras</p>
                        <p className="text-xs text-muted-foreground">5 inclusos no básico. R$ 50/usuário extra</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setExtraUsers(Math.max(0, extraUsers - 1))}
                          disabled={extraUsers === 0}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="text-lg font-bold w-8 text-center">{extraUsers}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setExtraUsers(extraUsers + 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {extraUsers > 0 && (
                      <p className="text-xs text-muted-foreground text-right">
                        Total usuários: {5 + extraUsers} · Extra: R$ {formatBRL(extraUsers * 50)}/mês
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Summary sidebar */}
            <div className="space-y-4">
              <Card className="sticky top-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Resumo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Módulo Básico</span>
                      <span>R$ 200,00</span>
                    </div>
                    {selectedModules.filter(c => c !== 'basic').map(code => {
                      const mod = moduleCatalog.find((m: any) => m.code === code);
                      return mod ? (
                        <div key={code} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{mod.name}</span>
                          <span>R$ {formatBRL(mod.price)}</span>
                        </div>
                      ) : null;
                    })}
                    {extraUsers > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{extraUsers}x Usuário Extra</span>
                        <span>R$ {formatBRL(extraUsers * 50)}</span>
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="flex justify-between items-baseline">
                    <span className="font-semibold">Total mensal</span>
                    <span className="text-2xl font-bold text-primary">R$ {formatBRL(customPlanPrice)}</span>
                  </div>

                  {billingCycle === 'yearly' && (
                    <div className="text-center space-y-1">
                      <p className="text-xs text-muted-foreground line-through">R$ {formatBRL(customPlanPrice)}/mês</p>
                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        R$ {formatBRL(calculateMonthlyEquivalent(calculateYearlyPrice(customPlanPrice)))}/mês no anual · -20%
                      </p>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex justify-between">
                      <span>Usuários</span>
                      <span className="font-medium">{5 + extraUsers}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Módulos</span>
                      <span className="font-medium">{selectedModules.length}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full font-semibold gap-2"
                    size="lg"
                    disabled={customPlanPrice === 0}
                    onClick={() => setShowCheckout(true)}
                  >
                    Assinar por R$ {formatBRL(billingCycle === 'yearly' ? calculateYearlyPrice(customPlanPrice) : customPlanPrice)}
                    /{billingCycle === 'yearly' ? 'ano' : 'mês'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </motion.div>
        )}

        {/* CTA for pre-built plans */}
        {mode === 'plans' && selectedPlan && currentPlanInfo && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center pt-4"
          >
            <Button
              size="lg"
              className="text-lg px-8 py-6 gap-2"
              onClick={() => setShowCheckout(true)}
            >
              Assinar por R$ {formatBRL(billingCycle === 'yearly' ? yearlyPrice : planPrice)}/{billingCycle === 'yearly' ? 'ano' : 'mês'}
            </Button>
          </motion.div>
        )}

        <p className="text-muted-foreground text-xs text-center">
          Pagamento seguro • Cancele quando quiser
        </p>
      </div>
    </div>
  );
}

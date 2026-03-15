import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowLeft, Loader2, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { differenceInDays, addMonths } from 'date-fns';
import { CheckoutLayout } from '@/components/checkout/CheckoutLayout';
import { toast } from 'sonner';
import logoGreen from '@/assets/logo-horizontal-verde.png';
import logoBlack from '@/assets/logo-black-horizontal.png';

type PaymentMethod = 'pix' | 'boleto' | 'card' | null;
type BillingCycle = 'monthly' | 'yearly';

const calculateYearlyPrice = (monthlyPrice: number) => monthlyPrice * 12 * 0.8;
const calculateMonthlyEquivalent = (yearlyPrice: number) => yearlyPrice / 12;

// Plan order for display
const PLAN_ORDER = ['starter', 'pro', 'enterprise'];

export default function Checkout() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [showCheckout, setShowCheckout] = useState(false);
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

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

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      // Sort by PLAN_ORDER
      return (data || []).sort((a, b) => {
        const aIdx = PLAN_ORDER.indexOf(a.code);
        const bIdx = PLAN_ORDER.indexOf(b.code);
        return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
      });
    },
  });

  useEffect(() => {
    if (companyData && companyData.subscription_status === 'active') {
      navigate('/assinatura');
    }
  }, [companyData, navigate]);

  const trialDaysLeft = companyData?.subscription_expires_at
    ? differenceInDays(new Date(companyData.subscription_expires_at), new Date())
    : null;
  const trialExpired = trialDaysLeft !== null && trialDaysLeft <= 0;

  if (companyLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-4xl space-y-8">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const currentPlan = plans.find((p: any) => p.code === selectedPlan);
  const planPrice = currentPlan?.price || 0;
  const yearlyPrice = calculateYearlyPrice(planPrice);
  const finalPrice = billingCycle === 'yearly' ? yearlyPrice : planPrice;

  const nextDueDate = addMonths(new Date(), billingCycle === 'yearly' ? 12 : 1).toISOString();

  const handleCreatePayment = async (method: PaymentMethod, cardData?: any) => {
    if (!currentPlan) return;
    setIsCreatingPayment(true);
    setPaymentMethod(method);

    // Simulate payment creation (UI only - no actual Asaas integration)
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (method === 'pix') {
      // Mock PIX data
      setPaymentData({
        payment_id: 'mock_' + Date.now(),
        pix_qr_code: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', // tiny placeholder
        pix_copy_paste: '00020126580014br.gov.bcb.pix0136a0f0a0a0-0000-0000-0000-000000000000520400005303986540599.995802BR5925DOMINEX TECNOLOGIA LTDA6009SAO PAULO62070503***6304ABCD',
        pix_expiration_date: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
    } else if (method === 'boleto') {
      // Mock Boleto data
      setPaymentData({
        payment_id: 'mock_' + Date.now(),
        invoice_url: '#',
        bank_slip_url: '#',
        identification_field: '23793.38128 60000.000003 00000.000400 1 84340000099900',
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      });
    } else if (method === 'card') {
      // Mock card success
      setPaymentData({ status: 'CONFIRMED' });
      toast.success('Pagamento processado com sucesso!');
      setPaymentSuccess(true);
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 3000);
    }

    setIsCreatingPayment(false);
  };

  // Checkout payment screen
  if (showCheckout && currentPlan) {
    const features = (currentPlan.features || []) as string[];
    return (
      <motion.div
        key="checkout-payment"
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <CheckoutLayout
          planName={currentPlan.name}
          planPrice={planPrice}
          finalPrice={finalPrice}
          billingCycle={billingCycle}
          features={features}
          maxUsers={currentPlan.max_users || 5}
          cpfCnpj={cpfCnpj}
          onCpfCnpjChange={setCpfCnpj}
          paymentMethod={paymentMethod}
          paymentData={paymentData}
          isCreatingPayment={isCreatingPayment}
          onPaymentMethodSelect={setPaymentMethod}
          onCreatePayment={handleCreatePayment}
          onClearPayment={() => {
            setPaymentMethod(null);
            setPaymentData(null);
          }}
          paymentSuccess={paymentSuccess}
          nextDueDate={nextDueDate}
          companyName={companyData?.name}
          userEmail={companyData?._userEmail}
        />
      </motion.div>
    );
  }

  // Plan selection screen
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl space-y-8">
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
          <h1 className="text-2xl font-bold">Ative sua Assinatura</h1>
          
          {trialExpired ? (
            <div className="inline-flex items-center gap-2 bg-destructive/10 text-destructive px-4 py-2 rounded-lg">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Seu período de teste expirou. Ative agora para continuar usando.</span>
            </div>
          ) : trialDaysLeft !== null && trialDaysLeft <= 7 ? (
            <div className="inline-flex items-center gap-2 bg-background border border-orange-400 text-orange-500 dark:text-orange-400 px-4 py-2 rounded-lg">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">
                Seu teste expira em {trialDaysLeft} dia{trialDaysLeft !== 1 ? 's' : ''}. Escolha o plano ideal para continuar.
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Escolha o plano ideal para o seu negócio.
            </p>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 relative">
          <span className={cn('text-sm font-medium', billingCycle === 'monthly' && 'text-primary')}>Mensal</span>
          <Switch checked={billingCycle === 'yearly'} onCheckedChange={(c) => setBillingCycle(c ? 'yearly' : 'monthly')} />
          <span className={cn('text-sm font-medium', billingCycle === 'yearly' && 'text-primary')}>Anual</span>
          <Badge className={cn('bg-emerald-500 text-white transition-opacity ml-5', billingCycle === 'yearly' ? 'opacity-100' : 'opacity-0 pointer-events-none')}>-20%</Badge>
        </div>

        {plansLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-full flex flex-col">
                <CardHeader className="text-center pb-2 pt-6 space-y-3">
                  <Skeleton className="h-6 w-24 mx-auto" />
                  <Skeleton className="h-4 w-40 mx-auto" />
                </CardHeader>
                <CardContent className="flex flex-col flex-1 gap-5">
                  <div className="text-center space-y-2">
                    <Skeleton className="h-3 w-20 mx-auto" />
                    <Skeleton className="h-12 w-28 mx-auto" />
                  </div>
                  <Skeleton className="h-10 w-full" />
                  <div className="space-y-2.5">
                    {[1, 2, 3, 4, 5].map((j) => (
                      <Skeleton key={j} className="h-5 w-full" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {plans.map((plan: any, index: number) => {
              const isSelected = selectedPlan === plan.code;
              const yp = calculateYearlyPrice(plan.price);
              const me = calculateMonthlyEquivalent(yp);
              const isPopular = plan.code === 'pro';
              const displayPrice = billingCycle === 'monthly' ? plan.price : me;
              const features = (plan.features || []) as string[];

              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className={cn(isPopular && 'md:-mt-4 md:mb-[-16px]')}
                >
                  <Card
                    className={cn(
                      'cursor-pointer transition-all relative overflow-hidden h-full flex flex-col',
                      'hover:shadow-xl hover:-translate-y-1',
                      isPopular && 'border-primary shadow-lg ring-1 ring-primary/20',
                      isSelected && 'ring-2 ring-primary border-primary shadow-xl',
                      !isPopular && !isSelected && 'border-border'
                    )}
                    onClick={() => setSelectedPlan(plan.code)}
                  >
                    {isPopular && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
                    )}

                    {isPopular && (
                      <div className="flex justify-center pt-4 pb-0">
                        <Badge className="bg-primary text-primary-foreground text-xs px-3 py-1">
                          ⭐ Mais Popular
                        </Badge>
                      </div>
                    )}

                    <CardHeader className={cn('text-center pb-2', isPopular ? 'pt-3' : 'pt-6')}>
                      <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                      <CardDescription className="text-xs min-h-[2rem]">{plan.description}</CardDescription>
                    </CardHeader>

                    <CardContent className="flex flex-col flex-1 gap-5">
                      {plan.price > 0 ? (
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">
                            {billingCycle === 'yearly' ? 'equivalente a' : 'a partir de'}
                          </p>
                          <div className="flex items-baseline justify-center gap-1">
                            <span className="text-sm text-muted-foreground">R$</span>
                            <span className={cn('font-extrabold tracking-tight', isPopular ? 'text-5xl text-primary' : 'text-4xl')}>
                              {displayPrice.toFixed(0)}
                            </span>
                            <span className="text-muted-foreground text-sm">/mês</span>
                          </div>
                          {billingCycle === 'yearly' && (
                            <div className="mt-1 space-y-0.5">
                              <p className="text-xs text-muted-foreground line-through">R$ {plan.price.toFixed(0)}/mês</p>
                              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                Total: R$ {yp.toFixed(0)}/ano · Economize 20%
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center">
                          <p className="text-2xl font-bold">Sob consulta</p>
                        </div>
                      )}

                      <Button
                        variant={isSelected ? 'default' : 'outline'}
                        className={cn(
                          'w-full font-semibold',
                          isSelected && 'bg-primary hover:bg-primary/90'
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPlan(plan.code);
                        }}
                      >
                        {isSelected ? (
                          <><Check className="h-4 w-4 mr-1" /> Selecionado</>
                        ) : (
                          'Selecionar Plano'
                        )}
                      </Button>

                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Recursos</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>

                      <div className="space-y-2.5 flex-1">
                        {features.map((f: string) => (
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
        )}

        {/* CTA */}
        {selectedPlan && currentPlan && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center pt-4"
          >
            <Button
              size="lg"
              className="text-lg px-8 py-6 gap-2"
              onClick={() => {
                if (currentPlan.price > 0) {
                  setShowCheckout(true);
                } else {
                  window.open('https://wa.me/5500000000000?text=Olá! Gostaria de saber mais sobre o plano Enterprise', '_blank');
                }
              }}
            >
              {currentPlan.price > 0 ? (
                <>Assinar por R$ {(billingCycle === 'yearly' ? yearlyPrice : planPrice).toFixed(0)}/{billingCycle === 'yearly' ? 'ano' : 'mês'}</>
              ) : (
                'Falar com vendas'
              )}
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

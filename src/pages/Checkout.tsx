import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import logoWhite from '@/assets/logo-white-horizontal.png';
import logoDark from '@/assets/logo-horizontal-verde.png';

export default function Checkout() {
  const navigate = useNavigate();
  const [annual, setAnnual] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('pro');

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('price');
      if (error) throw error;
      return data;
    },
  });

  // Detect theme
  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');

  const currentPlan = plans.find((p: any) => p.code === selectedPlan);
  const finalPrice = currentPlan
    ? (annual ? Math.round(currentPlan.price * 0.8) : currentPlan.price)
    : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <div className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <img src={isDark ? logoWhite : logoDark} alt="Logo" className="h-8" />
          <Button variant="ghost" size="sm" onClick={() => navigate('/assinatura')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold">Planos que crescem com a sua operação</h1>
          <p className="text-muted-foreground text-sm">Selecione o plano ideal para sua operação</p>
        </div>

        {/* Toggle */}
        <div className="flex items-center justify-center gap-3">
          <span className={cn('text-sm', !annual ? 'text-foreground' : 'text-muted-foreground')}>Mensal</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={cn('relative h-7 w-12 rounded-full transition-colors', annual ? 'bg-primary' : 'bg-muted')}
          >
            <div className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform', annual ? 'translate-x-5' : 'translate-x-0.5')} />
          </button>
          <span className={cn('text-sm', annual ? 'text-foreground' : 'text-muted-foreground')}>
            Anual <span className="ml-1 rounded-full bg-primary/20 text-primary text-xs px-2 py-0.5">Economize 20%</span>
          </span>
        </div>

        {/* Plans */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            {plans.map((plan: any) => {
              const isPopular = plan.code === 'pro';
              const isSelected = selectedPlan === plan.code;
              const features = (plan.features || []) as string[];
              const price = plan.price > 0 ? (annual ? Math.round(plan.price * 0.8) : plan.price) : null;

              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.code)}
                  className={cn(
                    'relative rounded-2xl border p-8 flex flex-col cursor-pointer transition-all',
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20'
                      : 'border-border bg-card hover:border-primary/30',
                    isPopular && !isSelected && 'border-primary/50',
                    isPopular && 'scale-[1.02]'
                  )}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                      Mais popular
                    </div>
                  )}

                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mb-6">{plan.description}</p>

                  {price !== null ? (
                    <div className="mb-6">
                      <span className="text-4xl font-bold">R$ {price}</span>
                      <span className="text-muted-foreground text-sm">/mês</span>
                    </div>
                  ) : (
                    <div className="mb-6">
                      <span className="text-2xl font-bold">Sob consulta</span>
                    </div>
                  )}

                  <ul className="space-y-3 mb-8 flex-1">
                    {features.map((f: string) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="h-4 w-4 text-primary shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={cn(
                      'w-full',
                      isSelected
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'bg-muted text-foreground hover:bg-muted/80 border border-border'
                    )}
                    size="lg"
                  >
                    {isSelected ? 'Selecionado' : 'Selecionar'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <div className="text-center pt-4">
          {currentPlan && finalPrice > 0 ? (
            <Button
              size="lg"
              className="text-lg px-8 py-6"
              onClick={() => {
                window.open('https://wa.me/5500000000000?text=Olá! Gostaria de ativar o plano ' + selectedPlan, '_blank');
              }}
            >
              Assinar por R$ {finalPrice}/mês
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={() => {
                window.open('https://wa.me/5500000000000?text=Olá! Gostaria de saber mais sobre o plano Enterprise', '_blank');
              }}
            >
              Falar com vendas
            </Button>
          )}
          <p className="text-muted-foreground text-xs mt-3">
            Pagamento seguro • Cancele quando quiser
          </p>
        </div>
      </div>
    </div>
  );
}

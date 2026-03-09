import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

export default function Checkout() {
  const navigate = useNavigate();
  const [annual, setAnnual] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('pro');

  const { data: plans = [] } = useQuery({
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

  return (
    <div className="min-h-screen bg-secondary text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => navigate('/assinatura')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Planos que crescem com a sua operação</h1>
            <p className="text-white/50 text-sm mt-1">Selecione o plano ideal para sua operação</p>
          </div>
        </div>

        {/* Toggle */}
        <div className="flex items-center justify-center gap-3">
          <span className={cn('text-sm', !annual ? 'text-white' : 'text-white/40')}>Mensal</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={cn('relative h-7 w-12 rounded-full transition-colors', annual ? 'bg-primary' : 'bg-white/20')}
          >
            <div className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform', annual ? 'translate-x-5' : 'translate-x-0.5')} />
          </button>
          <span className={cn('text-sm', annual ? 'text-white' : 'text-white/40')}>
            Anual <span className="ml-1 rounded-full bg-primary/20 text-primary text-xs px-2 py-0.5">Economize 20%</span>
          </span>
        </div>

        {/* Plans */}
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
                    ? 'border-primary bg-[hsl(0,0%,10%)] shadow-brand-glow'
                    : 'border-white/10 bg-[hsl(0,0%,7%)] hover:border-white/20',
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
                <p className="text-sm text-white/40 mb-6">{plan.description}</p>

                {price !== null ? (
                  <div className="mb-6">
                    <span className="text-4xl font-bold">R$ {price}</span>
                    <span className="text-white/40 text-sm">/mês</span>
                  </div>
                ) : (
                  <div className="mb-6">
                    <span className="text-2xl font-bold">Sob consulta</span>
                  </div>
                )}

                <ul className="space-y-3 mb-8 flex-1">
                  {features.map((f: string) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-white/60">
                      <Check className="h-4 w-4 text-primary shrink-0" /> {f}
                    </li>
                  ))}
                </ul>

                <Button
                  className={cn(
                    'w-full',
                    isSelected
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                  )}
                  size="lg"
                >
                  {isSelected ? 'Selecionado' : 'Testar por 7 Dias Grátis'}
                </Button>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="text-center pt-4">
          <p className="text-white/40 text-sm mb-4">
            Integração de pagamento em breve. Entre em contato para ativar seu plano.
          </p>
          <Button
            size="lg"
            onClick={() => {
              window.open('https://wa.me/5500000000000?text=Olá! Gostaria de ativar o plano ' + selectedPlan, '_blank');
            }}
          >
            Falar com vendas
          </Button>
        </div>
      </div>
    </div>
  );
}

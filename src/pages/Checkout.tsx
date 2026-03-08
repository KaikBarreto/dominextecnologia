import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/assinatura')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Escolha seu plano</h1>
          <p className="text-muted-foreground text-sm">Selecione o plano ideal para sua operação</p>
        </div>
      </div>

      {/* Toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={cn('text-sm', !annual ? 'text-foreground font-medium' : 'text-muted-foreground')}>Mensal</span>
        <button
          onClick={() => setAnnual(!annual)}
          className={cn('relative h-7 w-12 rounded-full transition-colors', annual ? 'bg-primary' : 'bg-muted')}
        >
          <div className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform', annual ? 'translate-x-5' : 'translate-x-0.5')} />
        </button>
        <span className={cn('text-sm', annual ? 'text-foreground font-medium' : 'text-muted-foreground')}>
          Anual <span className="ml-1 rounded-full bg-primary/20 text-primary text-xs px-2 py-0.5">-20%</span>
        </span>
      </div>

      {/* Plans */}
      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan: any) => {
          const isPopular = plan.code === 'pro';
          const features = (plan.features || []) as string[];
          const price = plan.price > 0 ? (annual ? Math.round(plan.price * 0.8) : plan.price) : null;

          return (
            <Card
              key={plan.id}
              className={cn(
                'relative cursor-pointer transition-all',
                selectedPlan === plan.code ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/50',
                isPopular && 'scale-[1.02]'
              )}
              onClick={() => setSelectedPlan(plan.code)}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                  Mais popular
                </div>
              )}
              <CardContent className="p-6 pt-8">
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>

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

                <ul className="space-y-2 mb-6">
                  {features.map((f: string) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-primary shrink-0" /> {f}
                    </li>
                  ))}
                </ul>

                <Button
                  className={cn('w-full', selectedPlan === plan.code ? '' : 'variant-outline')}
                  variant={selectedPlan === plan.code ? 'default' : 'outline'}
                >
                  {selectedPlan === plan.code ? 'Selecionado' : 'Selecionar'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* CTA */}
      <div className="text-center pt-4">
        <p className="text-muted-foreground text-sm mb-4">
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
  );
}

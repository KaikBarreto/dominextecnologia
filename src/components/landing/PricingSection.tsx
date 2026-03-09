import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const plans = [
  {
    code: 'starter',
    name: 'Starter',
    desc: 'Para pequenas equipes focadas em eficiência',
    monthly: 197,
    annual: 157,
    popular: false,
    features: ['OS ilimitadas', '2 usuários inclusos', 'App para técnicos', 'Painel do gestor', 'Relatórios básicos', 'Suporte por email'],
    cta: 'Testar por 7 Dias Grátis',
    ctaLink: '/cadastro?origem=Site',
  },
  {
    code: 'pro',
    name: 'Pro',
    desc: 'Gestão completa + Integrações avançadas',
    monthly: 497,
    annual: 397,
    popular: true,
    features: [
      'Tudo do Starter +',
      '5 usuários inclusos',
      'Rastreamento em tempo real',
      'Manutenções recorrentes',
      'Avaliações de cliente',
      'Suporte prioritário',
    ],
    cta: 'Testar por 7 Dias Grátis',
    ctaLink: '/cadastro?origem=Site',
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    desc: 'Plano completo para operações de grande porte',
    monthly: null,
    annual: null,
    popular: false,
    features: [
      'Tudo do Pro +',
      'Usuários ilimitados',
      'Múltiplas filiais',
      'Gestão de frotas',
      'SLA com alertas',
      'Gestor de conta',
    ],
    cta: 'Testar por 7 Dias Grátis',
    ctaLink: '/cadastro?origem=Site',
  },
];

// Ensure order: starter, pro, enterprise
const sortedPlans = [...plans].sort((a, b) => {
  const order = ['starter', 'pro', 'enterprise'];
  return order.indexOf(a.code) - order.indexOf(b.code);
});

export default function PricingSection() {
  const [annual, setAnnual] = useState(false);
  const ref = useScrollReveal();

  return (
    <section id="pricing" className="py-24 bg-[hsl(0,0%,5%)]">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-4">
          Planos que crescem com a sua operação
        </h2>

        <div className="flex items-center justify-center gap-4 mb-16 relative">
          <span className={cn('text-sm font-medium', !annual ? 'text-white' : 'text-white/40')}>Mensal</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={cn('relative h-7 w-12 rounded-full transition-colors', annual ? 'bg-primary' : 'bg-white/20')}
          >
            <div
              className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform', annual ? 'translate-x-5' : 'translate-x-0.5')}
            />
          </button>
          <span className={cn('text-sm font-medium', annual ? 'text-white' : 'text-white/40')}>Anual</span>
          <Badge className={cn('bg-emerald-500 text-white transition-opacity ml-5', annual ? 'opacity-100' : 'opacity-0 pointer-events-none')}>-20%</Badge>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {sortedPlans.map((plan) => {
            const displayPrice = plan.monthly !== null ? (annual ? plan.annual : plan.monthly) : null;
            const yearlyTotal = plan.monthly !== null ? Math.round(plan.monthly * 12 * 0.8) : null;

            return (
              <div
                key={plan.code}
                className={cn(
                  'relative rounded-2xl border p-8 flex flex-col transition-all',
                  plan.popular
                    ? 'border-primary bg-white/5 shadow-brand-glow scale-[1.02] md:-mt-4 md:mb-[-16px]'
                    : 'border-white/10 bg-white/[0.03]'
                )}
              >
                {/* Top accent bar */}
                {plan.popular && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-primary rounded-t-2xl" />
                )}

                {plan.popular && (
                  <div className="flex justify-center -mt-4 mb-2">
                    <Badge className="bg-primary text-primary-foreground text-xs px-3 py-1">
                      ⭐ Mais popular
                    </Badge>
                  </div>
                )}

                <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                <p className="text-sm text-white/40 mb-6">{plan.desc}</p>

                {displayPrice !== null ? (
                  <div className="mb-6">
                    <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium mb-1">
                      {annual ? 'equivalente a' : 'a partir de'}
                    </p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm text-white/60">R$</span>
                      <span className={cn('font-extrabold tracking-tight text-white', plan.popular ? 'text-5xl text-primary' : 'text-4xl')}>
                        {displayPrice}
                      </span>
                      <span className="text-white/40 text-sm">/mês</span>
                    </div>
                    {annual && yearlyTotal && (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-xs text-white/40 line-through">R$ {plan.monthly}/mês</p>
                        <p className="text-xs font-medium text-emerald-400">
                          Total: R$ {yearlyTotal}/ano · Economize 20%
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mb-6">
                    <span className="text-2xl font-bold text-white">Sob consulta</span>
                  </div>
                )}

                <div className="flex items-center gap-2 mb-4">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[10px] uppercase tracking-widest text-white/40 font-medium">Recursos</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-white/60">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  className={cn(
                    'w-full font-semibold',
                    plan.popular
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                  )}
                  size="lg"
                  asChild
                >
                  <Link to={plan.ctaLink}>{plan.cta}</Link>
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

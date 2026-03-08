import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const plans = [
  {
    name: 'Starter',
    desc: 'Para até 5 técnicos',
    monthly: 197,
    annual: 157,
    popular: false,
    features: ['OS ilimitadas', 'App para técnicos', 'Painel do gestor', 'Relatórios básicos', 'Suporte por email'],
    cta: 'Começar grátis',
    ctaLink: '/cadastro?origem=Site',
  },
  {
    name: 'Pro',
    desc: 'Até 20 técnicos',
    monthly: 497,
    annual: 397,
    popular: true,
    features: [
      'Tudo do Starter +',
      'Rastreamento em tempo real',
      'Manutenções recorrentes',
      'Avaliações de cliente',
      'API de integração',
      'Suporte prioritário',
    ],
    cta: 'Começar grátis',
    ctaLink: '/cadastro?origem=Site',
  },
  {
    name: 'Enterprise',
    desc: 'Técnicos ilimitados',
    monthly: null,
    annual: null,
    popular: false,
    features: [
      'Tudo do Pro +',
      'Múltiplas filiais',
      'Gestão de frotas',
      'SLA com alertas',
      'Onboarding dedicado',
      'Gestor de conta',
    ],
    cta: 'Falar com especialista',
    ctaLink: '/cadastro?origem=Site',
  },
];

export default function PricingSection() {
  const [annual, setAnnual] = useState(false);
  const ref = useScrollReveal();

  return (
    <section id="pricing" className="py-24 bg-[hsl(0,0%,5%)]">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-4">
          Planos que crescem com a sua operação
        </h2>

        <div className="flex items-center justify-center gap-3 mb-16">
          <span className={`text-sm ${!annual ? 'text-white' : 'text-white/40'}`}>Mensal</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative h-7 w-12 rounded-full transition-colors ${annual ? 'bg-primary' : 'bg-white/20'}`}
          >
            <div
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
                annual ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className={`text-sm ${annual ? 'text-white' : 'text-white/40'}`}>
            Anual{' '}
            <span className="ml-1 rounded-full bg-primary/20 text-primary text-xs px-2 py-0.5">
              Economize 20%
            </span>
          </span>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-8 transition-all ${
                plan.popular
                  ? 'border-primary/50 bg-[hsl(0,0%,7%)] shadow-brand-glow scale-[1.02]'
                  : 'border-white/10 bg-[hsl(0,0%,6%)]'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                  Mais popular
                </div>
              )}

              <h3 className="text-xl font-bold text-white">{plan.name}</h3>
              <p className="text-sm text-white/40 mb-6">{plan.desc}</p>

              {plan.monthly !== null ? (
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">
                    R$ {annual ? plan.annual : plan.monthly}
                  </span>
                  <span className="text-white/40 text-sm">/mês</span>
                </div>
              ) : (
                <div className="mb-6">
                  <span className="text-2xl font-bold text-white">Sob consulta</span>
                </div>
              )}

              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white/60">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full ${
                  plan.popular
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                asChild
              >
                <Link to={plan.ctaLink}>{plan.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

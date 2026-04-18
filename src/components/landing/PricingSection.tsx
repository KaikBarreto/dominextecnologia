import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { buildCadastroUrl } from '@/utils/utmTracking';

const plans = [
  {
    code: 'essencial',
    name: 'Essencial',
    desc: 'Gestão básica para pequenas equipes',
    monthly: 200,
    annual: 160,
    popular: false,
    features: [
      'OS ilimitadas',
      '5 usuários inclusos',
      'App para técnicos',
      'Agenda e calendário',
      'Relatórios básicos',
      'Suporte por email',
    ],
    cta: 'Testar 7 Dias Grátis',
    ctaPlan: 'essencial',
  },
  {
    code: 'avancado',
    name: 'Avançado',
    desc: 'Para empresas que precisam de RH e finanças',
    monthly: 350,
    annual: 280,
    popular: true,
    features: [
      'Tudo do Essencial +',
      '10 usuários inclusos',
      'Módulo Funcionários / RH',
      'Financeiro avançado',
      'Contas a pagar/receber',
      'DRE e relatórios financeiros',
    ],
    cta: 'Testar 7 Dias Grátis',
    ctaPlan: 'avancado',
  },
  {
    code: 'master',
    name: 'Master',
    desc: 'Operação completa com CRM e portal',
    monthly: 650,
    annual: 520,
    popular: false,
    features: [
      'Tudo do Avançado +',
      '20 usuários inclusos',
      'CRM / Funil de vendas',
      'Precificação avançada',
      'Portal do cliente',
      'Suporte prioritário',
    ],
    cta: 'Testar 7 Dias Grátis',
    ctaPlan: 'master',
  },
];

const customPlan = {
  code: 'personalizado',
  name: 'Personalizado',
  desc: 'Para grandes operações e múltiplas filiais',
  features: [
    'Tudo do Master +',
    'Usuários ilimitados',
    'Múltiplas filiais',
    'NF-e integrada',
    'White Label',
    'Gestor de conta dedicado',
  ],
  cta: 'Falar com Consultor',
  ctaLink: `https://wa.me/5521966885044?text=${encodeURIComponent('Olá! Vim pelo site do Dominex e tenho interesse no plano Enterprise (Personalizado). Gostaria de conversar sobre uma solução sob medida.')}`,
};

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

        <div className="grid md:grid-cols-3 gap-5 items-stretch">
          {plans.map((plan) => {
            const displayPrice = annual ? plan.annual : plan.monthly;
            const yearlyTotal = Math.round(plan.monthly * 12 * 0.8);

            return (
              <div
                key={plan.code}
                className={cn(
                  'relative rounded-md border p-7 flex flex-col transition-all',
                  plan.popular
                    ? 'border-primary bg-white/5 shadow-brand-glow scale-[1.02]'
                    : 'border-white/10 bg-white/[0.03]'
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-px -left-px -right-px h-1 bg-primary rounded-t-md" />
                )}

                {plan.popular && (
                  <div className="flex justify-center -mt-4 mb-2">
                    <Badge className="bg-primary text-primary-foreground text-xs px-3 py-1">
                      ⭐ Mais popular
                    </Badge>
                  </div>
                )}

                <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                <p className="text-sm text-white/40 mb-5">{plan.desc}</p>

                <div className="mb-5">
                  <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium mb-1">
                    {annual ? 'equivalente a' : 'a partir de'}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-white/60">R$</span>
                    <span className={cn('font-extrabold tracking-tight text-white', plan.popular ? 'text-4xl text-primary' : 'text-3xl')}>
                      {displayPrice}
                    </span>
                    <span className="text-white/40 text-sm">/mês</span>
                  </div>
                  {annual && (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-xs text-white/40 line-through">R$ {plan.monthly}/mês</p>
                      <p className="text-xs font-medium text-emerald-400">
                        Total: R$ {yearlyTotal}/ano · Economize 20%
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[10px] uppercase tracking-widest text-white/40 font-medium">Recursos</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <ul className="space-y-2.5 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-white/60">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button
                  className={cn(
                    'w-full font-semibold rounded-md',
                    plan.popular
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                  )}
                  size="lg"
                  asChild
                >
                  <Link to={buildCadastroUrl({ plano: plan.ctaPlan, ciclo: annual ? 'annual' : 'monthly' })}>{plan.cta}</Link>
                </Button>
              </div>
            );
          })}
        </div>

        {/* Personalizado — linha horizontal abaixo */}
        <div className="mt-6 rounded-md border border-white/10 bg-white/[0.03] p-7">
          <div className="grid md:grid-cols-3 gap-6 items-center">
            {/* Coluna 1 — Identificação */}
            <div>
              <div className="inline-flex items-center gap-2 mb-2">
                <Badge className="bg-white/10 text-white/80 text-[10px] uppercase tracking-widest">Enterprise</Badge>
              </div>
              <h3 className="text-2xl font-bold text-white">{customPlan.name}</h3>
              <p className="text-sm text-white/50 mt-1">{customPlan.desc}</p>
              <p className="mt-3 text-lg font-semibold text-white">Sob consulta</p>
            </div>

            {/* Coluna 2 — Recursos */}
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {customPlan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-white/60">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            {/* Coluna 3 — CTA */}
            <div className="flex md:justify-end">
              <Button
                className="bg-[#25D366] hover:bg-[#1ebe5a] text-white font-semibold rounded-md w-full md:w-auto px-8 gap-2"
                size="lg"
                asChild
              >
                <a href={customPlan.ctaLink} target="_blank" rel="noopener noreferrer">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  {customPlan.cta}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

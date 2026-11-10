import { Check, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/lib/i18n';
import { localizeHash } from '@/lib/i18n/localizeHash';
import type { LocaleCode } from '@/lib/i18n/locales';
import WhatsAppCtaLink from '@/components/landing/WhatsAppCtaLink';

// Os preços dos planos prontos espelham o catálogo comercial. O personalizado
// continua sob consulta e cada CTA abre a conversa com o time comercial.
// O EXCEÇÃO NÃO entra aqui: é plano de concessão, atribuído só pelo time
// Dominex, e nunca deve aparecer em superfície pública ou de autoatendimento.
const PLAN_CONFIG = [
  { code: 'start', popular: false, monthlyPrice: 197 },
  { code: 'avancado', popular: true, monthlyPrice: 547 },
  { code: 'master', popular: false, monthlyPrice: 847 },
] as const;

// Fragmento específico do CTA Enterprise (plano Personalizado), por locale.
// Preserva a intenção mesmo dentro da frase montada pelo buildWhatsAppMessage.
// en generalizado; fr traduzido; es faz fallback ao pt-br até ser traduzido.
const ENTERPRISE_WHATSAPP_FRAGMENTS: Record<LocaleCode, string> = {
  'pt-br':
    'pela página de planos e tenho interesse no plano *Personalizado (Enterprise)*',
  en:
    'from the pricing page and I am interested in the *Enterprise Plan*',
  es:
    'pela página de planos e tenho interesse no plano *Personalizado (Enterprise)*',
  fr:
    'depuis la page des tarifs et je suis intéressé par le *Plan Enterprise*',
};

export default function PricingSection() {
  const ref = useScrollReveal();
  const { locale, messages } = useLocale();
  const t = messages.home.pricing;
  // Junta config visual + texto i18n (nome/desc/features) por code.
  const plans = PLAN_CONFIG.map((cfg) => {
    const copy = t.plans[cfg.code];
    return { ...cfg, name: copy.name, desc: copy.desc, features: copy.features, cta: t.ctaTrial };
  });
  const customPlan = {
    name: t.plans.enterprise.name,
    desc: t.plans.enterprise.desc,
    cta: t.plans.enterprise.cta,
  };

  const enterpriseFragment = ENTERPRISE_WHATSAPP_FRAGMENTS[locale] ?? ENTERPRISE_WHATSAPP_FRAGMENTS['pt-br'];

  return (
    <section id={localizeHash('precos', locale)} className="py-24">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-4 break-words">
          {t.heading}
        </h2>

        <p className="mx-auto mb-16 max-w-2xl text-center text-white/55">
          {t.contactForPricing}
        </p>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5 items-stretch">
          {plans.map((plan) => (
              <div
                key={plan.code}
                className={cn(
                  'relative rounded-md border p-7 flex flex-col transition-all',
                  plan.popular
                    ? 'border-primary bg-neutral-900/90 shadow-brand-glow scale-[1.02]'
                    : 'border-white/10 bg-neutral-900/80'
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-px -left-px -right-px h-1 bg-primary rounded-t-md" />
                )}

                {plan.popular && (
                  <div className="flex justify-center -mt-4 mb-2">
                    <Badge className="bg-primary text-white text-xs px-3 py-1">
                      {t.mostPopular}
                    </Badge>
                  </div>
                )}

                <h3 className="text-xl font-bold text-white break-words">{plan.name}</h3>
                <p className="text-sm text-white/55">{plan.desc}</p>
                <p className="mb-5 mt-4 text-white">
                  <span className="text-3xl font-bold tracking-tight">R$ {plan.monthlyPrice}</span>
                  <span className="ml-1 text-sm text-white/55">{t.perMonth}</span>
                </p>

                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[10px] uppercase tracking-widest text-white/55 font-medium">{t.featuresLabel}</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <ul className="space-y-2.5 mb-4 flex-1">
                  {plan.features.map((f, index) => {
                    const isLimitation = false;
                    const FeatureIcon = isLimitation ? X : Check;
                    return (
                      <li key={f} className={cn('flex items-center gap-2 text-sm', isLimitation ? 'text-white/45' : 'text-white/60')}>
                        <FeatureIcon className={cn('h-4 w-4 shrink-0', isLimitation ? 'text-rose-400' : 'text-emerald-500')} />
                        {f}
                      </li>
                    );
                  })}
                </ul>

                <Button
                  className={cn(
                    'w-full font-semibold rounded-md whitespace-normal h-auto py-3 text-center leading-tight',
                    plan.popular
                      ? 'bg-primary text-white hover:bg-[#00ad85]'
                      : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                  )}
                  size="lg"
                  asChild
                >
                  <WhatsAppCtaLink>
                    {plan.cta}
                    <ArrowRight className="ml-2 h-5 w-5 shrink-0" />
                  </WhatsAppCtaLink>
                </Button>
              </div>
          ))}
        </div>

        {/* Enterprise — linha horizontal abaixo, enxuta */}
        <div className="mt-6 rounded-md border border-white/10 bg-white/[0.03] p-7">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            {/* Identificação */}
            <div>
              <div className="inline-flex items-center gap-2 mb-2">
                <Badge className="bg-white/10 text-white/80 text-[10px] uppercase tracking-widest">{t.enterpriseBadge}</Badge>
              </div>
              <h3 className="text-2xl font-bold text-white break-words">{customPlan.name}</h3>
              <p className="text-sm text-white/50 mt-1">{customPlan.desc}</p>
            </div>

            {/* CTA */}
            <div className="flex md:justify-end">
              {/* #25D366 é a cor oficial do WhatsApp; texto e ícone seguem brancos. */}
              <Button
                className="bg-[#25D366] hover:bg-[#1ebe5a] text-white font-semibold rounded-md w-full md:w-auto px-8 gap-2 whitespace-normal h-auto py-3 text-center leading-tight"
                size="lg"
                asChild
              >
                <WhatsAppCtaLink fragmentOverride={enterpriseFragment}>
                  {customPlan.cta}
                </WhatsAppCtaLink>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

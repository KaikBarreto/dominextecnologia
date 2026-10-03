import { Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/lib/i18n';
import { localizeHash } from '@/lib/i18n/localizeHash';
import type { LocaleCode } from '@/lib/i18n/locales';
import WhatsAppCtaLink from '@/components/landing/WhatsAppCtaLink';

// Configuração não textual dos planos. Valores comerciais não ficam no site:
// cada CTA abre uma conversa com o Maicon para uma proposta adequada à operação.
const PLAN_CONFIG = [
  { code: 'start', popular: false },
  { code: 'avancado', popular: true },
  { code: 'master', popular: false },
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
    const videoChecklist = 'videoChecklist' in copy ? (copy as { videoChecklist?: string }).videoChecklist : undefined;
    return { ...cfg, name: copy.name, desc: copy.desc, features: copy.features, videoChecklist, cta: t.ctaTrial };
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

        <div className="grid md:grid-cols-3 gap-5 items-stretch">
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
                    <Badge className="bg-primary text-primary-foreground text-xs px-3 py-1">
                      {t.mostPopular}
                    </Badge>
                  </div>
                )}

                <h3 className="text-xl font-bold text-white break-words">{plan.name}</h3>
                <p className="text-sm text-white/55 mb-5">{plan.desc}</p>

                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[10px] uppercase tracking-widest text-white/55 font-medium">{t.featuresLabel}</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <ul className="space-y-2.5 mb-4 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-white/60">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {plan.videoChecklist && (
                  <p className="text-sm font-semibold mb-6 break-words hyphens-auto text-new-feature-gradient">
                    {plan.videoChecklist}
                  </p>
                )}

                <Button
                  className={cn(
                    'w-full font-semibold rounded-md whitespace-normal h-auto py-3 text-center leading-tight',
                    plan.popular
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
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
              <Button
                className="bg-[#25D366] hover:bg-[#1ebe5a] text-white font-semibold rounded-md w-full md:w-auto px-8 gap-2 whitespace-normal h-auto py-3 text-center leading-tight"
                size="lg"
                asChild
              >
                <WhatsAppCtaLink fragmentOverride={enterpriseFragment}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
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

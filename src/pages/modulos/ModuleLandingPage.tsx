import { useEffect, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, XCircle, CheckCircle2, Star, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { captureUtmParams } from '@/lib/whatsapp';
import LandingNavbar from '@/components/landing/LandingNavbar';
import LandingFooter from '@/components/landing/LandingFooter';
import WhatsAppFloatingButton from '@/components/landing/WhatsAppFloatingButton';
import DarkVeilBackground from '@/components/ui/DarkVeilBackground';
import type { ModuleData } from './modulesData';

// Degradê de acento de MARCA (verde Dominex) — espelha o SEG_ACCENT_BADGE_GRADIENT
// das landings de segmento, mas fixo na cor da marca (não varia por nicho).
// Preenche o "badge"/eyebrow acima do H1 (texto e ícone brancos por cima). O
// `... 85%, #000` escurece de leve pra garantir contraste do branco sobre o verde.
const MODULE_ACCENT_BADGE_GRADIENT =
  'linear-gradient(to right, color-mix(in srgb, hsl(160 100% 39%) 85%, #000), color-mix(in srgb, hsl(160 80% 55%) 85%, #000))';

// A landing de módulo (aba "Soluções") é pública e NUNCA herda o white-label do
// tenant logado. Restaura o brand Dominex em toda a subárvore (espelha
// Landing.tsx / SegmentLandingPage.tsx).
const DOMINEX_BRAND_VARS = {
  '--primary': '160 100% 39%',
  '--ring': '160 100% 39%',
  '--sidebar-primary': '160 100% 39%',
  '--sidebar-accent': '160 100% 39%',
  '--sidebar-ring': '160 100% 39%',
  '--gradient-brand': 'linear-gradient(135deg, hsl(160 100% 39%) 0%, hsl(160 85% 45%) 100%)',
} as CSSProperties;

/**
 * Renderiza uma landing de MÓDULO inteira a partir de um objeto `ModuleData`.
 * Arquitetura paralela à de segmentos (estilo Auvo: "Auvo PMOC", "Auvo
 * Financeiro"). Para adicionar um módulo novo: ver modulesData.ts.
 *
 * Mantém o MESMO design system das landings de segmento (não reinventa estética).
 */
export default function ModuleLandingPage({ data }: { data: ModuleData }) {
  useEffect(() => {
    document.title = data.metaTitle;
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content') ?? null;
    if (meta) meta.setAttribute('content', data.metaDescription);

    captureUtmParams(window.location.search);
    document.documentElement.classList.add('landing-scrollbar');
    window.scrollTo(0, 0);

    return () => {
      document.documentElement.classList.remove('landing-scrollbar');
      if (meta && prevDesc !== null) meta.setAttribute('content', prevDesc);
    };
  }, [data]);

  return (
    <div className="relative min-h-screen" style={DOMINEX_BRAND_VARS}>
      <div className="fixed inset-0 z-0 bg-[hsl(0,0%,4%)]">
        <DarkVeilBackground hueShift={53} speed={0.5} />
        <div className="absolute inset-0 bg-[hsl(0,0%,4%)]/60 pointer-events-none" />
      </div>

      <div className="relative z-10">
        <LandingNavbar />
        <ModuleHero data={data} />
        <ModuleMetrics data={data} />
        <ModulePains data={data} />
        <ModuleDeepDives data={data} />
        <ModuleFeatures data={data} />
        <ModuleTestimonials data={data} />
        <ModulePricingCta />
        <ModuleFaq data={data} />
        <ModuleFinalCta data={data} />
        <LandingFooter />
      </div>
      <WhatsAppFloatingButton />
    </div>
  );
}

/* ---------------------------- Hero --------------------------------- */

function ModuleHero({ data }: { data: ModuleData }) {
  const ref = useScrollReveal();
  const { hero, icon: Icon } = data;

  const idx = hero.h1.indexOf(hero.h1Highlight);
  const before = idx >= 0 ? hero.h1.slice(0, idx) : hero.h1;
  const after = idx >= 0 ? hero.h1.slice(idx + hero.h1Highlight.length) : '';

  return (
    <section className="relative min-h-[88vh] flex items-center pt-16 overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(160,100%,39%,0.08)_0%,transparent_70%)]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(hsl(0,0%,40%) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div ref={ref} className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-20 lg:py-28 text-center scroll-reveal">
        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-7"
          style={{ backgroundImage: MODULE_ACCENT_BADGE_GRADIENT }}
        >
          <Icon className="h-4 w-4 text-white" />
          <span className="text-xs font-semibold text-white">{hero.eyebrow}</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold text-white leading-[1.12] tracking-tight">
          {before}
          {idx >= 0 && (
            <span className="bg-gradient-to-r from-primary to-[hsl(160,80%,55%)] bg-clip-text text-transparent">
              {hero.h1Highlight}
            </span>
          )}
          {after}
        </h1>

        <p className="mt-7 text-lg text-white/50 max-w-2xl mx-auto leading-relaxed">
          {hero.subtitle}
        </p>

        <div className="mt-9 flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 text-base px-8 py-6 shadow-brand-glow w-full sm:w-auto"
            asChild
          >
            <Link to="/cadastro?origem=Site">Teste grátis 14 dias, sem cartão</Link>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="text-white border border-white/20 hover:bg-white/10 hover:text-white px-8 py-6 w-full sm:w-auto"
            asChild
          >
            <Link to="/#precos">Ver planos</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- Métricas ------------------------------ */

function ModuleMetrics({ data }: { data: ModuleData }) {
  const ref = useScrollReveal();
  return (
    <section className="py-12 border-y border-white/5">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {data.metrics.map((m) => (
            <div key={m.label} className="text-center">
              <p className="text-3xl sm:text-4xl font-extrabold text-primary tracking-tight">{m.value}</p>
              <p className="mt-2 text-sm text-white/50 leading-snug">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------ Dores → Solução -------------------------- */

function ModulePains({ data }: { data: ModuleData }) {
  const ref = useScrollReveal();
  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {data.painsHeading}
          </h2>
          <p className="text-white/40 max-w-2xl mx-auto">
            {data.painsSubheading}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {data.pains.map((p) => (
            <div
              key={p.pain}
              className="rounded-2xl border border-white/10 bg-[hsl(0,0%,6%)] p-7 transition-colors hover:border-primary/30"
            >
              <div className="flex items-start gap-3 mb-4">
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <p className="text-white font-semibold text-base leading-snug">{p.pain}</p>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <p className="text-white/55 text-sm leading-relaxed">{p.solution}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- Deep dives ---------------------------- */

function ModuleDeepDives({ data }: { data: ModuleData }) {
  const ref = useScrollReveal();
  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-6 scroll-reveal">
        {data.deepDives.map((d, i) => {
          const Icon = d.icon;
          return (
            <div
              key={d.title}
              className={`grid lg:grid-cols-12 gap-8 items-center rounded-2xl border border-white/10 bg-white/[0.02] p-8 lg:p-12 ${
                i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''
              }`}
            >
              <div className="lg:col-span-7">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mb-6">
                  <Icon className="h-7 w-7" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight">{d.title}</h2>
                <p className="text-white/55 text-base leading-relaxed">{d.body}</p>
              </div>
              <div className="lg:col-span-5">
                <div className="aspect-[4/3] rounded-xl border border-white/10 bg-gradient-to-br from-primary/[0.07] to-transparent flex items-center justify-center">
                  <Icon className="h-20 w-20 text-primary/30" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* --------------------------- Funcionalidades ----------------------- */

function ModuleFeatures({ data }: { data: ModuleData }) {
  const ref = useScrollReveal();
  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {data.featuresHeading}
          </h2>
          <p className="text-white/40 max-w-2xl mx-auto">
            {data.featuresSubheading}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {data.features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="rounded-2xl border border-white/10 bg-[hsl(0,0%,6%)] p-6 transition-colors hover:border-primary/30"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-white mb-2">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="flex justify-center mt-10">
          <Button
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 py-6 text-base rounded-xl"
            asChild
          >
            <Link to="/cadastro?origem=Site">
              Teste grátis 14 dias, sem cartão
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- Depoimentos --------------------------- */

function ModuleTestimonials({ data }: { data: ModuleData }) {
  const ref = useScrollReveal();
  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-16">
          {data.testimonialsHeading}
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {data.testimonials.map((t) => (
            <div key={t.name} className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-8">
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-warning text-warning" />
                ))}
              </div>
              <p className="text-white/70 text-sm leading-relaxed mb-6">"{t.quote}"</p>
              <div>
                <p className="text-sm font-semibold text-white">{t.name}</p>
                <p className="text-xs text-white/40">
                  {t.role} — {t.company}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------- Preços (ponte) ---------------------------- */

function ModulePricingCta() {
  const ref = useScrollReveal();
  return (
    <section className="py-20">
      <div ref={ref} className="mx-auto max-w-4xl px-4 scroll-reveal">
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] to-transparent p-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            Preços transparentes, sem surpresa
          </h2>
          <p className="text-white/50 mb-8 max-w-xl mx-auto">
            Planos a partir de R$ 197/mês com OS ilimitadas. Veja a tabela completa e escolha o que cabe na sua operação.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-6 text-base shadow-brand-glow"
              asChild
            >
              <Link to="/cadastro?origem=Site">Teste grátis 14 dias, sem cartão</Link>
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="text-white border border-white/20 hover:bg-white/10 hover:text-white px-8 py-6"
              asChild
            >
              <Link to="/#precos">
                Ver todos os planos <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ FAQ -------------------------------- */

function ModuleFaq({ data }: { data: ModuleData }) {
  const ref = useScrollReveal();
  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12">
          Perguntas frequentes
        </h2>
        <Accordion type="single" collapsible className="grid md:grid-cols-2 gap-3">
          {data.faq.map((faq, i) => (
            <AccordionItem
              key={i}
              value={`faq-${i}`}
              className="rounded-xl border border-white/10 bg-white/[0.02] px-6 data-[state=open]:border-primary/20 h-fit"
            >
              <AccordionTrigger className="text-sm text-white/80 hover:text-white hover:no-underline py-5 text-left">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-white/40 leading-relaxed pb-5">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

/* --------------------------- CTA final ----------------------------- */

function ModuleFinalCta({ data }: { data: ModuleData }) {
  const ref = useScrollReveal();
  return (
    <section className="relative py-32 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(hsl(0,0%,50%) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
      <div ref={ref} className="relative mx-auto max-w-3xl px-4 text-center scroll-reveal">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
          {data.finalCta.title}
        </h2>
        <p className="text-lg text-white/50 mb-10 max-w-xl mx-auto">{data.finalCta.subtitle}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-10 py-6 text-base shadow-brand-glow"
            asChild
          >
            <Link to="/cadastro?origem=Site">
              Teste grátis 14 dias, sem cartão <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="text-white border border-white/20 hover:bg-white/10 hover:text-white px-8 py-6"
            asChild
          >
            <Link to="/#precos">Ver planos</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

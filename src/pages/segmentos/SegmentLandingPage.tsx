import { useEffect, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, XCircle, CheckCircle2, Star, ChevronRight } from 'lucide-react';
import { useLocale, useCanonicalSlugRedirect } from '@/lib/i18n';
import { localizeInternal } from '@/lib/i18n/localizeInternal';
import { localizeHash } from '@/lib/i18n/localizeHash';
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
import ScrollSyncFeatures from '@/components/landing/ScrollSyncFeatures';
import DeepDiveSection from '@/components/landing/DeepDiveSection';
import DarkVeilBackground from '@/components/ui/DarkVeilBackground';
import type { SegmentData } from './segmentsData';

// Degradê de acento do segmento — MESMO usado no texto do H1. Preenche os
// "badges"/eyebrows de acento (texto e ícone brancos por cima). Para segmentos
// de cor clara (solar, elétrica), `color-mix(... 15%, #000)` escurece de leve só
// o necessário pro branco ficar legível, mantendo a cor do nicho reconhecível.
const SEG_ACCENT_BADGE_GRADIENT =
  'linear-gradient(to right, color-mix(in srgb, var(--seg-accent) 85%, #000), color-mix(in srgb, color-mix(in srgb, var(--seg-accent) 55%, #ffffff) 85%, #000))';

// Mapa slug-da-landing → value canônico do segmento (o mesmo de useCompanySegments
// / do cadastro). O cadastro lê `?segmento=<value>` e pré-seleciona o nicho.
// NÃO usamos o slug aqui de propósito: o cadastro espera o VALUE.
const SLUG_TO_SEGMENT_VALUE: Record<string, string> = {
  'sistema-para-refrigeracao': 'refrigeracao',
  'sistema-para-eletricistas': 'eletrica',
  'sistema-para-energia-solar': 'solar',
  'sistema-para-provedores': 'telecom',
  'sistema-para-cftv': 'cftv',
  'sistema-para-construcao-civil': 'construcao',
  'sistema-para-elevadores': 'elevadores',
  'sistema-para-limpeza-conservacao': 'limpeza',
  'sistema-para-dedetizacao': 'dedetizacao',
};

// Monta o link de cadastro com o segmento pré-selecionado. NÃO passamos
// `origem` de propósito: assim o cadastro exibe a etapa "Como nos conheceu"
// pro usuário escolher (passar origem=Site fazia o cadastro pular essa etapa).
// Se o slug não estiver no mapa (segmento sem nicho equivalente no cadastro),
// cai pro link padrão sem param de segmento.
function cadastroLink(slug: string): string {
  const value = SLUG_TO_SEGMENT_VALUE[slug];
  return value ? `/cadastro?segmento=${value}` : '/cadastro';
}

// A landing de segmento é pública e NUNCA herda o white-label do tenant logado.
// Restaura o brand Dominex em toda a subárvore (espelha Landing.tsx).
const DOMINEX_BRAND_VARS = {
  '--primary': '160 100% 39%',
  '--ring': '160 100% 39%',
  '--sidebar-primary': '160 100% 39%',
  '--sidebar-accent': '160 100% 39%',
  '--sidebar-ring': '160 100% 39%',
  '--gradient-brand': 'linear-gradient(135deg, hsl(160 100% 39%) 0%, hsl(160 85% 45%) 100%)',
} as CSSProperties;

/**
 * Renderiza uma landing de segmento inteira a partir de um objeto `SegmentData`.
 * Onda 2 = mais entradas em segmentsData + rota; ZERO conteúdo hard-coded aqui.
 */
export default function SegmentLandingPage({ data }: { data: SegmentData }) {
  // Redirect canônico: sob /:lang, leva o slug pt-br pro slug do idioma atual.
  useCanonicalSlugRedirect(data.slug);

  useEffect(() => {
    // <title>/<meta> por rota (sem react-helmet no projeto). usePageTitle roda
    // antes (componente irmão montado primeiro), então este effect vence e fixa
    // o título específico do segmento.
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

  // --seg-accent: cor do segmento, escopo local desta página. NÃO toca nas CSS
  // vars globais de marca (DOMINEX_BRAND_VARS continua o verde para herança),
  // só dá um token de acento pros destaques deste nicho.
  const pageStyle = {
    ...DOMINEX_BRAND_VARS,
    ['--seg-accent' as string]: data.accentColor,
  } as CSSProperties;

  return (
    <div className="relative min-h-screen" style={pageStyle}>
      {/* Dark veil de fundo (espelha Landing.tsx), tingido na cor do segmento */}
      <div className="fixed inset-0 z-0 bg-[hsl(0,0%,4%)]">
        <DarkVeilBackground
          accentColor={data.accentColor}
          veilHueShiftOverride={data.veilHueShift}
          speed={0.5}
        />
        <div className="absolute inset-0 bg-[hsl(0,0%,4%)]/60 pointer-events-none" />
      </div>

      <div className="relative z-10">
        <LandingNavbar />
        <SegmentHero data={data} />
        <SegmentMetrics data={data} />
        <SegmentPains data={data} />
        <SegmentDeepDives data={data} />
        <SegmentFeatures data={data} />
        <SegmentTestimonials data={data} />
        <SegmentPricingCta data={data} />
        <SegmentFaq data={data} />
        <SegmentFinalCta data={data} />
        <LandingFooter />
      </div>
      <WhatsAppFloatingButton />
    </div>
  );
}

/* ---------------------------- Hero --------------------------------- */

function SegmentHero({ data }: { data: SegmentData }) {
  const ref = useScrollReveal();
  const { locale, messages } = useLocale();
  const { hero, icon: Icon } = data;

  // Quebra o H1 ao redor do highlight pra colorir só a keyword, mantendo o H1
  // como um único nó semântico keyword-rico.
  const idx = hero.h1.indexOf(hero.h1Highlight);
  const before = idx >= 0 ? hero.h1.slice(0, idx) : hero.h1;
  const after = idx >= 0 ? hero.h1.slice(idx + hero.h1Highlight.length) : '';

  return (
    <section className="relative min-h-[88vh] flex items-center pt-16 overflow-hidden">
      <div className="absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, color-mix(in srgb, var(--seg-accent) 8%, transparent) 0%, transparent 70%)',
          }}
        />
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
          style={{ backgroundImage: SEG_ACCENT_BADGE_GRADIENT }}
        >
          <Icon className="h-4 w-4 text-white" />
          <span className="text-xs font-semibold text-white">{hero.eyebrow}</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold text-white leading-[1.12] tracking-tight">
          {before}
          {idx >= 0 && (
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  'linear-gradient(to right, var(--seg-accent), color-mix(in srgb, var(--seg-accent) 55%, #ffffff))',
              }}
            >
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
            className="text-white text-base px-8 py-6 w-full sm:w-auto border-0 transition-opacity hover:opacity-90"
            style={{
              backgroundColor: 'var(--seg-accent)',
              boxShadow: '0 0 40px -8px color-mix(in srgb, var(--seg-accent) 60%, transparent)',
            }}
            asChild
          >
            <Link to={cadastroLink(data.slug)}>{messages.pageChrome.ctaTrial}</Link>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="text-white border border-white/20 hover:bg-white/10 hover:text-white px-8 py-6 w-full sm:w-auto"
            asChild
          >
            <Link to={localizeInternal('/', locale) + '#' + localizeHash('precos', locale)}>{messages.pageChrome.seePlans}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- Métricas ------------------------------ */

function SegmentMetrics({ data }: { data: SegmentData }) {
  const ref = useScrollReveal();
  return (
    <section className="py-12 border-y border-white/5">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {data.metrics.map((m) => (
            <div key={m.label} className="text-center">
              <p
                className="text-3xl sm:text-4xl font-extrabold tracking-tight"
                style={{ color: 'var(--seg-accent)' }}
              >
                {m.value}
              </p>
              <p className="mt-2 text-sm text-white/50 leading-snug">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------ Dores → Solução -------------------------- */

function SegmentPains({ data }: { data: SegmentData }) {
  const ref = useScrollReveal();
  const { messages } = useLocale();
  const c = messages.pageChrome;
  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {c.segment.painsHeading}
          </h2>
          <p className="text-white/55 max-w-2xl mx-auto">
            {c.segment.painsSubheading}
          </p>
        </div>

        {/* MOBILE: cada par vira um card vertical limpo, com respiro generoso.
            "O problema" em cima (tom de alerta neutro) + "Com o Dominex" embaixo,
            destacado no acento do segmento. Sem setas espremidas, sem tabela. */}
        <div className="md:hidden space-y-5">
          {data.pains.map((p) => (
            <div
              key={p.pain}
              className="overflow-hidden rounded-2xl border border-white/10 bg-[hsl(0,0%,6%)]"
            >
              {/* O problema */}
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <XCircle className="h-4 w-4 text-destructive/80 shrink-0" />
                  <span className="text-[0.7rem] font-bold uppercase tracking-wider text-destructive/80">
                    {c.problemLabel}
                  </span>
                </div>
                <p className="text-white/55 text-[0.95rem] leading-relaxed">{p.pain}</p>
              </div>

              {/* Com o Dominex — destacado no acento */}
              <div
                className="px-5 pt-4 pb-5 border-t"
                style={{
                  borderColor: 'color-mix(in srgb, var(--seg-accent) 22%, hsl(0 0% 100% / 0.08))',
                  backgroundImage:
                    'linear-gradient(to bottom, color-mix(in srgb, var(--seg-accent) 9%, transparent), transparent)',
                }}
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--seg-accent)' }} />
                  <span
                    className="text-[0.7rem] font-bold uppercase tracking-wider"
                    style={{ color: 'var(--seg-accent)' }}
                  >
                    {c.withDominex}
                  </span>
                </div>
                <p className="text-white font-medium text-[0.95rem] leading-relaxed">
                  {p.solution}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* DESKTOP: tabela estilizada Problema × Solução (mantida). */}
        <div className="hidden md:block overflow-hidden rounded-2xl border border-white/10 bg-[hsl(0,0%,6%)]">
          <div className="grid grid-cols-2 border-b border-white/10">
            <div className="flex items-center justify-center gap-2.5 px-7 py-5">
              <XCircle className="h-6 w-6 text-destructive shrink-0" />
              <span className="text-lg sm:text-xl font-bold text-white text-center">
                {c.problemLabel}
              </span>
            </div>
            <div
              className="flex items-center justify-center gap-2.5 px-7 py-5 border-l border-white/10"
              style={{
                backgroundImage:
                  'linear-gradient(to right, color-mix(in srgb, var(--seg-accent) 7%, transparent), transparent)',
              }}
            >
              <CheckCircle2
                className="h-6 w-6 shrink-0"
                style={{ color: 'var(--seg-accent)' }}
              />
              <span className="text-lg sm:text-xl font-bold text-white text-center">
                {c.withDominex}
              </span>
            </div>
          </div>

          {/* Linhas pareadas */}
          {data.pains.map((p, i) => (
            <div
              key={p.pain}
              className={`group grid grid-cols-2 transition-colors hover:bg-white/[0.015] ${
                i > 0 ? 'border-t border-white/10' : ''
              }`}
            >
              <div className="flex items-start gap-3 px-7 py-6">
                <XCircle className="h-5 w-5 text-destructive/70 shrink-0 mt-0.5" />
                <p className="text-white/55 text-[0.95rem] leading-snug">{p.pain}</p>
              </div>
              <div
                className="relative flex items-start gap-3 px-7 py-6 border-l border-white/10"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, color-mix(in srgb, var(--seg-accent) 6%, transparent), transparent)',
                }}
              >
                <CheckCircle2
                  className="h-5 w-5 shrink-0 mt-0.5"
                  style={{ color: 'var(--seg-accent)' }}
                />
                <p className="text-white font-medium text-[0.95rem] leading-snug">
                  {p.solution}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------- Deep dives ---------------------------- */

/**
 * Deep dives do segmento. Usa a seção reutilizável `DeepDiveSection` (single
 * source of truth do efeito foto+parallax), passando a cor do nicho via
 * `--seg-accent` e preservando o chip de ícone saturado do segmento
 * (gradiente de acento + ícone branco).
 */
function SegmentDeepDives({ data }: { data: SegmentData }) {
  return (
    <DeepDiveSection
      dives={data.deepDives}
      accent="var(--seg-accent)"
      iconChipClassName="text-white"
      iconChipStyle={{ backgroundImage: SEG_ACCENT_BADGE_GRADIENT }}
    />
  );
}

/* --------------------------- Funcionalidades ----------------------- */

/**
 * Seção de funcionalidades (scroll-sync estilo SEMRUSH) — extraída para o
 * componente reutilizável `ScrollSyncFeatures`. Aqui só montamos os dados do
 * segmento e o CTA. O acento vem de `--seg-accent` (definido no pageStyle).
 * Mapeia `desc` → `description` (a prop do componente).
 */
function SegmentFeatures({ data }: { data: SegmentData }) {
  const { messages } = useLocale();
  const c = messages.pageChrome;
  const features = data.features.map((f) => ({
    icon: f.icon,
    title: f.title,
    description: f.desc,
  }));

  return (
    <ScrollSyncFeatures
      features={features}
      heading={c.segment.featuresHeading}
      subheading={c.segment.featuresSubheading}
      footer={
        <Button
          size="lg"
          className="text-white font-semibold px-8 py-6 text-base rounded-xl border-0 transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--seg-accent)' }}
          asChild
        >
          <Link to={cadastroLink(data.slug)}>
            {c.ctaTrial}
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </Button>
      }
    />
  );
}

/* --------------------------- Depoimentos --------------------------- */

function SegmentTestimonials({ data }: { data: SegmentData }) {
  const ref = useScrollReveal();
  const { messages } = useLocale();
  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-16">
          {messages.pageChrome.segment.testimonialsHeading}
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
                <p className="text-xs text-white/55">
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

function SegmentPricingCta({ data }: { data: SegmentData }) {
  const ref = useScrollReveal();
  const { locale, messages } = useLocale();
  const c = messages.pageChrome;
  return (
    <section className="py-20">
      <div ref={ref} className="mx-auto max-w-4xl px-4 scroll-reveal">
        <div
          className="rounded-2xl border p-10 text-center"
          style={{
            borderColor: 'color-mix(in srgb, var(--seg-accent) 20%, transparent)',
            backgroundImage:
              'linear-gradient(to bottom right, color-mix(in srgb, var(--seg-accent) 8%, transparent), transparent)',
          }}
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            {c.pricing.heading}
          </h2>
          <p className="text-white/50 mb-8 max-w-xl mx-auto">
            {c.pricing.subtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="text-white px-8 py-6 text-base border-0 transition-opacity hover:opacity-90"
              style={{
                backgroundColor: 'var(--seg-accent)',
                boxShadow: '0 0 40px -8px color-mix(in srgb, var(--seg-accent) 60%, transparent)',
              }}
              asChild
            >
              <Link to={cadastroLink(data.slug)}>{c.ctaTrial}</Link>
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="text-white border border-white/20 hover:bg-white/10 hover:text-white px-8 py-6"
              asChild
            >
              <Link to={localizeInternal('/', locale) + '#' + localizeHash('precos', locale)}>
                {c.seeAllPlans} <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ FAQ -------------------------------- */

function SegmentFaq({ data }: { data: SegmentData }) {
  const ref = useScrollReveal();
  const { messages } = useLocale();
  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12">
          {messages.pageChrome.faqHeading}
        </h2>
        <Accordion type="single" collapsible className="grid md:grid-cols-2 gap-3">
          {data.faq.map((faq, i) => (
            <AccordionItem
              key={i}
              value={`faq-${i}`}
              className="rounded-xl border border-white/10 bg-white/[0.02] px-6 data-[state=open]:[border-color:color-mix(in_srgb,var(--seg-accent)_20%,transparent)] h-fit"
            >
              <AccordionTrigger className="text-sm text-white/80 hover:text-white hover:no-underline py-5 text-left">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-white/55 leading-relaxed pb-5">
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

function SegmentFinalCta({ data }: { data: SegmentData }) {
  const ref = useScrollReveal();
  const { locale, messages } = useLocale();
  const c = messages.pageChrome;
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
            className="text-white px-10 py-6 text-base border-0 transition-opacity hover:opacity-90"
            style={{
              backgroundColor: 'var(--seg-accent)',
              boxShadow: '0 0 40px -8px color-mix(in srgb, var(--seg-accent) 60%, transparent)',
            }}
            asChild
          >
            <Link to={cadastroLink(data.slug)}>
              {c.ctaTrial} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="text-white border border-white/20 hover:bg-white/10 hover:text-white px-8 py-6"
            asChild
          >
            <Link to={localizeInternal('/', locale) + '#' + localizeHash('precos', locale)}>{c.seePlans}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

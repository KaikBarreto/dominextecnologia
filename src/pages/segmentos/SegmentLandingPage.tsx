import { useEffect, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, XCircle, CheckCircle2 } from 'lucide-react';
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
import WhatsAppCtaLink from '@/components/landing/WhatsAppCtaLink';
import MarketingHeroBackdrop from '@/components/landing/MarketingHeroBackdrop';
import { resolveWcagForeground } from '@/lib/colorContrast';
import type { SegmentData } from './segmentsData';

// Degradê de acento do segmento — MESMO usado no texto do H1. Preenche os
// "badges"/eyebrows de acento (texto e ícone brancos por cima). Para segmentos
// de cor clara (solar, elétrica), `color-mix(... 15%, #000)` escurece de leve só
// o necessário pro branco ficar legível, mantendo a cor do nicho reconhecível.
const SEG_ACCENT_BADGE_GRADIENT =
  'linear-gradient(to right, color-mix(in srgb, var(--seg-accent) 85%, #000), color-mix(in srgb, color-mix(in srgb, var(--seg-accent) 55%, #ffffff) 85%, #000))';

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
  // --seg-accent-fg: texto legível por cima de --seg-accent quando ele é FUNDO
  // (botões de CTA). Medido em produção: as 10 cores de segmento reprovam
  // 4,5:1 WCAG com texto branco (ex.: cyan #06b6d4 mede 2,43:1) — nunca
  // escurecemos a cor do segmento pra resolver isso, só derivamos o texto.
  const pageStyle = {
    ...DOMINEX_BRAND_VARS,
    ['--seg-accent' as string]: data.accentColor,
    ['--seg-accent-fg' as string]: resolveWcagForeground(data.accentColor),
  } as CSSProperties;

  return (
    <div className="relative min-h-screen bg-white text-[#101512] dark:bg-[#070908] dark:text-white" style={pageStyle}>
      <div className="relative">
        <LandingNavbar />
        <SegmentHero data={data} />
        <main className="[&>section:nth-child(odd)]:bg-white [&>section:nth-child(even)]:bg-[#f5f4ef] dark:[&>section:nth-child(odd)]:bg-[#070908] dark:[&>section:nth-child(even)]:bg-[#0b100d]">
          <SegmentMetrics data={data} />
          <SegmentPains data={data} />
          <SegmentDeepDives data={data} />
          <SegmentFeatures data={data} />
          <SegmentFaq data={data} />
        </main>
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
    <section className="relative min-h-[88vh] flex items-center bg-white pt-16 overflow-hidden dark:bg-[#070908]">
      <MarketingHeroBackdrop
        accentColor={data.accentColor}
        veilHueShiftOverride={data.veilHueShift}
      />
      <div className="absolute inset-0 z-0">
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

        <h1
          lang={locale === 'pt-br' ? 'pt-BR' : locale}
          className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold text-[#101512] dark:text-white leading-[1.12] tracking-tight break-words hyphens-auto"
        >
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

        <p className="mt-7 text-lg text-[#5c665f] dark:text-white/60 max-w-2xl mx-auto leading-relaxed">
          {hero.subtitle}
        </p>

        <div className="mt-9 flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="text-base px-8 py-6 w-full sm:w-auto border-0 transition-opacity hover:opacity-90 whitespace-normal h-auto text-center leading-tight"
            style={{
              backgroundColor: 'var(--seg-accent)',
              color: '#ffffff',
              boxShadow: '0 0 40px -8px color-mix(in srgb, var(--seg-accent) 60%, transparent)',
            }}
            asChild
          >
            <WhatsAppCtaLink>
              {messages.pageChrome.ctaTrial}
              <ArrowRight className="ml-2 h-5 w-5 shrink-0" />
            </WhatsAppCtaLink>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="text-[#202722] border border-[#ccd3cd] hover:bg-[#f0f3ef] hover:text-[#101512] dark:border-white/20 dark:text-white dark:hover:bg-white/10 dark:hover:text-white px-8 py-6 w-full sm:w-auto whitespace-normal h-auto text-center leading-tight"
            asChild
          >
            <Link to={localizeInternal('/', locale) + '#' + localizeHash('recursos', locale)}>{messages.pageChrome.seePlans}</Link>
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
    <section className="py-12 border-y border-[#e0e4e0]">
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
              <p className="mt-2 text-sm text-[#5c665f] dark:text-white/55 leading-snug">{m.label}</p>
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
          <h2 className="text-3xl sm:text-4xl font-bold text-[#101512] dark:text-white mb-4 break-words">
            {c.segment.painsHeading}
          </h2>
          <p className="text-[#5c665f] dark:text-white/55 max-w-2xl mx-auto">
            {c.segment.painsSubheading}
          </p>
        </div>

        {/* MOBILE: cada par vira um card vertical limpo, com respiro generoso.
            "O problema" em cima (tom de alerta neutro) + "Com a Dominex" embaixo,
            destacado no acento do segmento. Sem setas espremidas, sem tabela. */}
        <div className="md:hidden space-y-5">
          {data.pains.map((p) => (
            <div
              key={p.pain}
              className="overflow-hidden rounded-2xl border border-[#d9ded8] bg-white dark:border-white/10 dark:bg-white/[0.03]"
            >
              {/* O problema */}
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <XCircle className="h-4 w-4 text-destructive/80 shrink-0" />
                  <span className="text-[0.7rem] font-bold uppercase tracking-wider text-destructive/80">
                    {c.problemLabel}
                  </span>
                </div>
                <p className="text-[#646d67] dark:text-white/55 text-[0.95rem] leading-relaxed">{p.pain}</p>
              </div>

              {/* Com a Dominex — destacado no acento */}
              <div
                className="px-5 pt-4 pb-5 border-t"
                style={{
                  borderColor: 'color-mix(in srgb, var(--seg-accent) 28%, #d9ded8)',
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
                <p className="text-[#17201b] dark:text-white/80 font-medium text-[0.95rem] leading-relaxed">
                  {p.solution}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* DESKTOP: tabela estilizada Problema × Solução (mantida). */}
        <div className="hidden md:block overflow-hidden rounded-2xl border border-[#d9ded8] bg-white shadow-[0_28px_70px_-52px_rgba(16,36,27,0.35)] dark:border-white/10 dark:bg-white/[0.03]">
          <div className="grid grid-cols-2 border-b border-[#d9ded8] bg-[#f0f2ee] dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center justify-center gap-2.5 px-7 py-5">
              <XCircle className="h-6 w-6 text-destructive shrink-0" />
              <span className="text-lg sm:text-xl font-bold text-[#262d29] text-center">
                {c.problemLabel}
              </span>
            </div>
            <div
              className="flex items-center justify-center gap-2.5 px-7 py-5 border-l border-[#d9ded8]"
              style={{
                backgroundImage:
                  'linear-gradient(to right, color-mix(in srgb, var(--seg-accent) 7%, transparent), transparent)',
              }}
            >
              <CheckCircle2
                className="h-6 w-6 shrink-0"
                style={{ color: 'var(--seg-accent)' }}
              />
              <span className="text-lg sm:text-xl font-bold text-[#17201b] dark:text-white text-center">
                {c.withDominex}
              </span>
            </div>
          </div>

          {/* Linhas pareadas */}
          {data.pains.map((p, i) => (
            <div
              key={p.pain}
              className={`group grid grid-cols-2 transition-colors hover:bg-[#f8faf7] ${
                i > 0 ? 'border-t border-[#e2e6e1]' : ''
              }`}
            >
              <div className="flex items-start gap-3 px-7 py-6">
                <XCircle className="h-5 w-5 text-destructive/70 shrink-0 mt-0.5" />
                <p className="text-[#646d67] dark:text-white/55 text-[0.95rem] leading-snug">{p.pain}</p>
              </div>
              <div
                className="relative flex items-start gap-3 px-7 py-6 border-l border-[#e2e6e1]"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, color-mix(in srgb, var(--seg-accent) 6%, transparent), transparent)',
                }}
              >
                <CheckCircle2
                  className="h-5 w-5 shrink-0 mt-0.5"
                  style={{ color: 'var(--seg-accent)' }}
                />
                <p className="text-[#17201b] dark:text-white/80 font-medium text-[0.95rem] leading-snug">
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
      iconChipClassName="bg-white border border-[#dce1dc]"
      iconChipStyle={{ color: 'var(--seg-accent)' }}
      tone="light"
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
          className="font-semibold px-8 py-6 text-base rounded-xl border-0 transition-opacity hover:opacity-90 whitespace-normal h-auto text-center leading-tight"
          style={{ backgroundColor: 'var(--seg-accent)', color: 'var(--seg-accent-fg)' }}
          asChild
        >
          <WhatsAppCtaLink>
            {c.ctaTrial}
            <ArrowRight className="ml-2 h-5 w-5 shrink-0" />
          </WhatsAppCtaLink>
        </Button>
      }
    />
  );
}

/* ------------------------------ FAQ -------------------------------- */

function SegmentFaq({ data }: { data: SegmentData }) {
  const ref = useScrollReveal();
  const { messages } = useLocale();
  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#101512] dark:text-white text-center mb-12">
          {messages.pageChrome.faqHeading}
        </h2>
        <Accordion type="single" collapsible className="grid md:grid-cols-2 gap-3">
          {data.faq.map((faq, i) => (
            <AccordionItem
              key={i}
              value={`faq-${i}`}
              className="rounded-xl border border-[#d9ded8] bg-white px-6 data-[state=open]:[border-color:color-mix(in_srgb,var(--seg-accent)_35%,transparent)] h-fit dark:border-white/10 dark:bg-white/[0.03]"
            >
              <AccordionTrigger className="text-sm text-[#29312d] hover:text-[#101512] hover:no-underline py-5 text-left dark:text-white/80 dark:hover:text-white">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-[#626c66] leading-relaxed pb-5 dark:text-white/55">
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
    <section className="relative overflow-hidden bg-[#161b1a] py-32">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(hsl(0,0%,50%) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
      <div ref={ref} className="relative mx-auto max-w-3xl px-4 text-center scroll-reveal">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 break-words">
          {data.finalCta.title}
        </h2>
        <p className="text-lg text-white/50 mb-10 max-w-xl mx-auto">{data.finalCta.subtitle}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="px-10 py-6 text-base border-0 transition-opacity hover:opacity-90 whitespace-normal h-auto text-center leading-tight"
            style={{
              backgroundColor: 'var(--seg-accent)',
              color: 'var(--seg-accent-fg)',
              boxShadow: '0 0 40px -8px color-mix(in srgb, var(--seg-accent) 60%, transparent)',
            }}
            asChild
          >
            <WhatsAppCtaLink>
              {c.ctaTrial} <ArrowRight className="ml-2 h-5 w-5 shrink-0" />
            </WhatsAppCtaLink>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="text-white border border-white/20 hover:bg-white/10 hover:text-white px-8 py-6 whitespace-normal h-auto text-center leading-tight"
            asChild
          >
            <Link to={localizeInternal('/', locale) + '#' + localizeHash('recursos', locale)}>{c.seePlans}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, XCircle, CheckCircle2, Star, ChevronRight, Check, ChevronDown } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { captureUtmParams } from '@/lib/whatsapp';
import LandingNavbar from '@/components/landing/LandingNavbar';
import LandingFooter from '@/components/landing/LandingFooter';
import WhatsAppFloatingButton from '@/components/landing/WhatsAppFloatingButton';
import DarkVeilBackground from '@/components/ui/DarkVeilBackground';
import ScrollSyncFeatures from '@/components/landing/ScrollSyncFeatures';
import DeepDiveSection from '@/components/landing/DeepDiveSection';
import { getSiteSegments, getSegment } from '@/utils/companySegments';
import type { ModuleData } from './modulesData';
import { TOOLS_BY_SEGMENT } from './tecnicoNicheTools';

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
  // Acento usado pelos blocos espelhados das landings de segmento (tabela de
  // dores, ScrollSyncFeatures). Fixo no verde de marca Dominex (BRAND_GREEN).
  '--seg-accent': '#00C597',
} as CSSProperties;

/**
 * Renderiza uma landing de MÓDULO inteira a partir de um objeto `ModuleData`.
 * Arquitetura paralela à de segmentos (estilo Auvo: "Auvo PMOC", "Auvo
 * Financeiro"). Para adicionar um módulo novo: ver modulesData.ts.
 *
 * Mantém o MESMO design system das landings de segmento (não reinventa estética).
 */
export default function ModuleLandingPage({ data }: { data: ModuleData }) {
  // Redirect canônico: sob /:lang, leva o slug pt-br pro slug do idioma atual.
  useCanonicalSlugRedirect(data.slug);

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
  const { locale, messages } = useLocale();
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
            <Link to="/cadastro?origem=Site">{messages.pageChrome.ctaTrial}</Link>
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
  const { messages } = useLocale();
  const c = messages.pageChrome;
  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {data.painsHeading}
          </h2>
          <p className="text-white/55 max-w-2xl mx-auto">
            {data.painsSubheading}
          </p>
        </div>

        {/* MOBILE: cada par vira um card vertical limpo */}
        <div className="md:hidden space-y-5">
          {data.pains.map((p) => (
            <div
              key={p.pain}
              className="overflow-hidden rounded-2xl border border-white/10 bg-[hsl(0,0%,6%)]"
            >
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <XCircle className="h-4 w-4 text-destructive/80 shrink-0" />
                  <span className="text-[0.7rem] font-bold uppercase tracking-wider text-destructive/80">
                    {c.problemLabel}
                  </span>
                </div>
                <p className="text-white/55 text-[0.95rem] leading-relaxed">{p.pain}</p>
              </div>
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

        {/* DESKTOP: tabela estilizada Problema × Solução */}
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
              <CheckCircle2 className="h-6 w-6 shrink-0" style={{ color: 'var(--seg-accent)' }} />
              <span className="text-lg sm:text-xl font-bold text-white text-center">
                {c.withDominex}
              </span>
            </div>
          </div>

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
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" style={{ color: 'var(--seg-accent)' }} />
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

function ModuleDeepDives({ data }: { data: ModuleData }) {
  // Mesmo efeito foto+parallax das landings de segmento, via seção reutilizável.
  // Aqui o acento é o verde de marca (a página aplica DOMINEX_BRAND_VARS, então
  // `hsl(var(--primary))` é o verde Dominex — público, sem white-label). O chip
  // de ícone preserva o visual atual do módulo (bg-primary/10 + ícone primary).
  return (
    <DeepDiveSection
      dives={data.deepDives}
      accent="hsl(var(--primary))"
      iconChipClassName="bg-primary/10 text-primary"
    />
  );
}

/* --------------------------- Funcionalidades ----------------------- */

/** CTA verde reaproveitado no rodapé da seção de funcionalidades. */
function FeaturesCta() {
  const { messages } = useLocale();
  return (
    <Button
      size="lg"
      className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 py-6 text-base rounded-xl"
      asChild
    >
      <Link to="/cadastro?origem=Site">
        {messages.pageChrome.ctaTrial}
        <ArrowRight className="ml-2 h-5 w-5" />
      </Link>
    </Button>
  );
}

function ModuleFeatures({ data }: { data: ModuleData }) {
  // Opt-in EXCLUSIVO da landing /area-do-tecnico: seletor de nicho + ferramentas
  // reais do técnico. Subcomponente dedicado (stateful) pra não violar as regras
  // de hooks no caso comum.
  if (data.techNicheSelector) {
    return <ModuleFeaturesWithNiche data={data} />;
  }

  const features = data.features.map((f) => ({
    icon: f.icon,
    title: f.title,
    description: f.desc,
  }));

  return (
    <ScrollSyncFeatures
      features={features}
      heading={data.featuresHeading}
      subheading={data.featuresSubheading}
      footer={<FeaturesCta />}
    />
  );
}

/**
 * Variante da seção de funcionalidades SÓ da /area-do-tecnico: um seletor de
 * nicho centralizado acima do scroll travado troca, em runtime, o conjunto de
 * ferramentas mostrado. Default = primeiro grupo (refrigeração, 10 ferramentas
 * reais). Trocar de nicho muda `features` (e a altura do pin recalcula sozinha).
 */
function ModuleFeaturesWithNiche({ data }: { data: ModuleData }) {
  const segments = getSiteSegments();
  const [activeSeg, setActiveSeg] = useState(segments[0].value);
  const features = TOOLS_BY_SEGMENT[activeSeg] ?? [];

  // SÓ nesta seção (/area-do-tecnico): o destaque das ferramentas puxa a COR
  // DO SEGMENTO selecionado. Sobrescreve `--seg-accent` na subárvore — recolore
  // apenas o active tile/texto/ícone do ScrollSyncFeatures. Fora daqui o site
  // segue verde de marca. Default refrigeração → ciano (#06b6d4).
  const selectedSeg = getSegment(activeSeg);

  return (
    <div style={{ '--seg-accent': selectedSeg?.color ?? '#00C597' } as CSSProperties}>
      <ScrollSyncFeatures
        features={features}
        heading={data.featuresHeading}
        subheading={data.featuresSubheading}
        controlSlot={
          <div className="flex justify-center">
            <NicheSelect selected={activeSeg} onSelect={setActiveSeg} />
          </div>
        }
        footer={<FeaturesCta />}
      />
    </div>
  );
}

/* ---------------- Seletor de nicho (Área do Técnico™) --------------
   Espelha o visual do `SegmentToolsSwitcher` interno (Badge colorido +
   Popover + Command com busca), mas SEM exigir empresa logada: na landing
   pública não há `companySegment`, então some o selo "Incluído" e o trigger
   é o badge na cor do segmento selecionado. Só o select é colorido na cor do
   nicho; o destaque das ferramentas no scroll continua verde de marca. */

function NicheSelect({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (segment: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { messages } = useLocale();
  const segments = getSiteSegments();
  const selectedSeg = getSegment(selected);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-full transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2"
        >
          {selectedSeg ? (
            <Badge
              className="cursor-pointer gap-1.5 border-0 text-white px-3 py-1.5 text-sm"
              style={{ backgroundColor: selectedSeg.color }}
            >
              <selectedSeg.icon className="h-3.5 w-3.5" />
              <span className="truncate">{selectedSeg.label}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </Badge>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="z-[70] w-[260px] p-0 sm:w-[320px]">
        <Command>
          <CommandInput placeholder={messages.pageChrome.nicheSearchPlaceholder} />
          <CommandList>
            <CommandEmpty>{messages.pageChrome.nicheEmpty}</CommandEmpty>
            <CommandGroup>
              {segments.map((seg) => {
                const isSelected = seg.value === selected;
                return (
                  <CommandItem
                    key={seg.value}
                    value={seg.label}
                    onSelect={() => {
                      onSelect(seg.value);
                      setOpen(false);
                    }}
                    className="items-start gap-2"
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: seg.color }}
                    >
                      <seg.icon className="h-3 w-3 text-white" />
                    </span>
                    <span className="flex-1 whitespace-normal break-words leading-snug">
                      {seg.label}
                    </span>
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4 shrink-0',
                        isSelected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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

function ModulePricingCta() {
  const ref = useScrollReveal();
  const { locale, messages } = useLocale();
  const c = messages.pageChrome;
  return (
    <section className="py-20">
      <div ref={ref} className="mx-auto max-w-4xl px-4 scroll-reveal">
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] to-transparent p-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            {c.pricing.heading}
          </h2>
          <p className="text-white/50 mb-8 max-w-xl mx-auto">
            {c.pricing.subtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-6 text-base shadow-brand-glow"
              asChild
            >
              <Link to="/cadastro?origem=Site">{c.ctaTrial}</Link>
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

function ModuleFaq({ data }: { data: ModuleData }) {
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
              className="rounded-xl border border-white/10 bg-white/[0.02] px-6 data-[state=open]:border-primary/20 h-fit"
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

function ModuleFinalCta({ data }: { data: ModuleData }) {
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
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-10 py-6 text-base shadow-brand-glow"
            asChild
          >
            <Link to="/cadastro?origem=Site">
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

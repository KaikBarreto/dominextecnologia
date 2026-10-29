import { useEffect, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  XCircle,
  CheckCircle2,
  Check,
  ChevronDown,
  CirclePlay,
  Clapperboard,
  Volume2,
} from 'lucide-react';
import { useLocale, useCanonicalSlugRedirect } from '@/lib/i18n';
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
import DeepDiveSection from '@/components/landing/DeepDiveSection';
import WhatsAppCtaLink from '@/components/landing/WhatsAppCtaLink';
import ModuleFeatureCarousel from '@/components/landing/ModuleFeatureCarousel';
import MarketingHeroBackdrop from '@/components/landing/MarketingHeroBackdrop';
import DarkVeilBackground from '@/components/ui/DarkVeilBackground';
import DominexBrandLogo from '@/components/landing/DominexBrandLogo';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { getSiteSegments, getSegment } from '@/utils/companySegments';
import { resolveWcagForeground } from '@/lib/colorContrast';
import type { ModuleData } from './modulesData';
import { getModuleMotionAsset } from './moduleMotionVideos';
import { TOOLS_BY_SEGMENT } from './tecnicoNicheTools';

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

function interpolateCopy(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{${key}}`).join(value),
    template,
  );
}

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
    <div className="relative min-h-screen bg-white text-[#101512] dark:bg-[#070908] dark:text-white" style={DOMINEX_BRAND_VARS}>
      <div className="relative">
        <LandingNavbar />
        <ModuleHero data={data} />
        <main className="bg-white dark:bg-[#070908]">
          <ModuleVideoMock data={data} />
          <ModuleMetrics data={data} />
          <ModulePains data={data} />
          <ModuleDeepDives data={data} />
          <ModuleFeatures data={data} />
          <ModuleFaq data={data} />
        </main>
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
    <section className="relative flex items-center overflow-hidden bg-white pb-14 pt-28 dark:bg-[#070908] sm:pb-16 sm:pt-32 lg:pb-20 lg:pt-32">
      <MarketingHeroBackdrop />
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(160,100%,39%,0.08)_0%,transparent_70%)]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(hsl(0,0%,40%) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div ref={ref} className="relative mx-auto w-full max-w-[1380px] px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="grid items-center gap-11 lg:grid-cols-[minmax(0,0.98fr)_minmax(480px,1.02fr)] lg:gap-14 xl:gap-20">
          <div className="min-w-0 text-center lg:text-left">
            <div className="mb-6 inline-flex items-center gap-2 text-[#101512] dark:text-white">
              {data.slug === 'integracao-whatsapp' ? (
                <WhatsAppIcon className="h-4 w-4" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              <span className="text-xs font-bold uppercase tracking-[0.18em]">{hero.eyebrow}</span>
            </div>

            <h1
              lang={locale === 'pt-br' ? 'pt-BR' : locale}
              className="text-4xl font-bold leading-[1.05] tracking-[-0.04em] text-[#101512] dark:text-white sm:text-5xl lg:text-[3.45rem] xl:text-[3.7rem] break-words"
            >
              {before}
              {idx >= 0 && (
                <span className="text-primary">
                  {hero.h1Highlight}
                </span>
              )}
              {after}
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-[#5c665f] dark:text-white/60 sm:text-lg sm:leading-8 lg:mx-0">
              {hero.subtitle}
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Button
                size="lg"
                className="bg-primary text-white hover:bg-[#00ad85] text-base px-8 py-6 w-full sm:w-auto whitespace-normal h-auto text-center leading-tight"
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
                <a href="#recursos-modulo">{messages.pageChrome.seePlans}</a>
              </Button>
            </div>

            <div className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2.5 text-sm text-[#667069] dark:text-white/55 lg:justify-start">
              {data.features.slice(0, 3).map((feature) => (
                <span key={feature.title} className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  {feature.title}
                </span>
              ))}
            </div>
          </div>

          <ModuleProductPreview data={data} />
        </div>
      </div>
    </section>
  );
}

const MODULE_GUIDE_SCREENSHOTS: Record<string, { src: string; alt: string; fit?: 'cover' | 'contain'; position?: string }> = {
  'os-digital': {
    src: '/guia-tecnico/img/t5-ordens-servico.jpg',
    alt: 'Tela real da Dominex com a lista de ordens de serviço',
  },
  'sistema-pmoc': {
    src: '/guia-tecnico/img/t11-wizard-pmoc-unidade.jpg',
    alt: 'Tela real da Dominex para configurar uma unidade no PMOC',
  },
  'sistema-crm': {
    src: '/guia-tecnico/img/t10-crm.jpg',
    alt: 'Tela real do CRM da Dominex com o funil comercial',
  },
  'controle-financeiro': {
    src: '/guia-tecnico/img/t13-financeiro-contas.jpg',
    alt: 'Tela real do controle de contas no financeiro da Dominex',
  },
  'ponto-e-folha': {
    src: '/guia-tecnico/img/t15-ponto-hoje.jpg',
    alt: 'Tela real do ponto eletrônico na Dominex',
  },
  'emissao-de-nota-fiscal': {
    src: '/guia-tecnico/img/t14-notas-fiscais.jpg',
    alt: 'Tela real da emissão e gestão de notas fiscais na Dominex',
  },
  'portal-do-cliente': {
    src: '/guia-tecnico/img/t12-portal-cliente.jpg',
    alt: 'Tela real do portal do cliente da Dominex',
  },
  'controle-de-estoque': {
    src: '/guia-tecnico/img/t8-estoque.jpg',
    alt: 'Tela real do controle de estoque na Dominex',
  },
  'sistema-de-orcamentos': {
    src: '/guia-tecnico/img/t9-orcamentos.jpg',
    alt: 'Tela real da gestão de orçamentos na Dominex',
    fit: 'contain',
  },
  'gestao-de-contratos': {
    src: '/guia-tecnico/img/t11-contratos.jpg',
    alt: 'Tela real da gestão de contratos na Dominex',
    fit: 'contain',
  },
  'rastreamento-de-equipes': {
    src: '/guia-tecnico/img/t6-mapa.jpg',
    alt: 'Tela real do mapa de equipes na Dominex',
  },
  'area-do-tecnico': {
    src: '/guia-tecnico/img/t7-area-tecnico.jpg',
    alt: 'Tela real da Área do Técnico na Dominex',
  },
  'integracao-whatsapp': {
    src: '/guia-tecnico/img/t1-integracoes-whatsapp.jpg',
    alt: 'Tela real da integração com WhatsApp na Dominex',
  },
  'cobrancas-automaticas': {
    src: '/guia-tecnico/img/t13-cobrar-modal.jpg',
    alt: 'Tela real de criação de cobrança na Dominex',
    position: 'center top',
  },
  'pdv-e-loja': {
    src: '/guia-tecnico/img/t8-estoque.jpg',
    alt: 'Tela real do estoque integrado às vendas na Dominex',
  },
};

function ModuleProductPreview({ data }: { data: ModuleData }) {
  const { messages } = useLocale();
  const screenshot = MODULE_GUIDE_SCREENSHOTS[data.slug];
  if (!screenshot) return <ModuleMotionMock data={data} />;
  const moduleLabel =
    (messages.moduleLabels as Record<string, string>)[data.slug] ?? data.navLabel;
  const previewTitle = interpolateCopy(messages.pageChrome.motionMock.previewTitle, {
    module: moduleLabel,
  });

  return (
    <div className="relative mx-auto w-full max-w-[760px] overflow-hidden rounded-[1.4rem] border border-[#dce1dc] bg-white p-2.5 shadow-[0_32px_100px_-40px_rgba(16,21,18,0.38)] dark:border-white/10 dark:bg-[#101311] sm:rounded-[1.75rem] sm:p-4">
      <div className="flex items-center gap-1.5 px-1 pb-3 sm:px-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b63]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#f6c94c]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#32c86e]" />
        <span className="ml-3 truncate text-xs font-medium text-[#68736c] dark:text-white/50">
          {previewTitle}
        </span>
      </div>
      <div className="aspect-[16/10] overflow-hidden rounded-[1.05rem] border border-[#e0e4e0] bg-white dark:border-white/10 dark:bg-[#0a0d0b]">
        <img
          src={screenshot.src}
          alt={previewTitle}
          width={1180}
          height={897}
          loading="eager"
          decoding="async"
          className={cn(
            'h-full w-full',
            screenshot.fit === 'contain' ? 'object-contain' : 'object-cover',
          )}
          style={{ objectPosition: screenshot.position ?? 'center top' }}
        />
      </div>
    </div>
  );
}

/**
 * Placeholder 9:16 compartilhado por todas as landings de módulo. Quando o
 * motion final existir, o vídeo entra aqui sem alterar a composição da página.
 */
function ModuleMotionMock({ data }: { data: ModuleData }) {
  const { messages } = useLocale();
  const copy = messages.pageChrome.motionMock;
  const storyboard = data.features.slice(0, 3);

  return (
    <div className="relative mx-auto w-full max-w-[390px]" aria-label={`${copy.label}: ${data.hero.eyebrow}`}>
      <div className="absolute -inset-8 rounded-[3rem] bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="relative rounded-[2.4rem] border border-white/15 bg-[hsl(0,0%,7%)] p-2 shadow-2xl shadow-black/50">
        <div className="relative aspect-[9/16] overflow-hidden rounded-[1.95rem] border border-white/10 bg-[hsl(0,0%,4%)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_18%,hsl(160,100%,39%,0.2),transparent_35%)]" />
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage: 'linear-gradient(hsl(0 0% 100%) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100%) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />

          <div className="relative flex h-full flex-col p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary">{copy.label}</p>
                <p className="mt-1 text-xs text-white/45">{copy.placeholder}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[0.62rem] font-medium text-white/60">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 motion-safe:animate-pulse" />
                {copy.status}
              </span>
            </div>

            <div className="mt-auto mb-auto py-7">
              <div className="mb-5 flex items-center gap-2 text-white/55">
                <Clapperboard className="h-4 w-4" />
                <span className="text-xs font-medium">{copy.storyboard}</span>
              </div>
              <div className="space-y-3">
                {storyboard.map((item, index) => {
                  const StoryIcon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl border p-3.5 transition-colors',
                        index === 0
                          ? 'border-primary/35 bg-primary/[0.12]'
                          : 'border-white/10 bg-white/[0.035]',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                          index === 0
                            ? 'bg-primary text-white'
                            : 'bg-white/[0.06] text-white/55',
                        )}
                      >
                        <StoryIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.63rem] font-semibold uppercase tracking-wider text-white/35">
                          0{index + 1}
                        </span>
                        <span className="block truncate text-sm font-semibold text-white/85">{item.title}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-3 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[36%] rounded-full bg-primary" />
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  disabled
                  aria-label={copy.play}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/20"
                >
                  <CirclePlay className="h-6 w-6" />
                </button>
                <span className="font-mono text-[0.68rem] text-white/35">00:18 / 00:50</span>
                <Volume2 className="h-4 w-4 text-white/35" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Métricas ------------------------------ */

function ModuleMetrics({ data }: { data: ModuleData }) {
  const ref = useScrollReveal();
  return (
    <section id="visao-geral" className="scroll-mt-28 border-y border-[#e0e4e0] bg-white py-14 dark:border-white/10 dark:bg-[#070908]">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {data.metrics.map((m) => (
            <div key={m.label} className="text-center">
              <p className="text-3xl sm:text-4xl font-extrabold text-[#101512] tracking-tight dark:text-white">{m.value}</p>
              <p className="mt-2 text-sm leading-snug text-[#55615a] dark:text-white/55">{m.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------ Dores → Solução -------------------------- */

function WithDominexLabel({ label, compact = false }: { label: string; compact?: boolean }) {
  const prefix = label.replace(/dominex/iu, '').trim();

  return (
    <>
      <span>{prefix}</span>
      <DominexBrandLogo className={compact ? 'w-[82px]' : 'w-[118px]'} />
    </>
  );
}

function ModulePains({ data }: { data: ModuleData }) {
  const ref = useScrollReveal();
  const { messages } = useLocale();
  const c = messages.pageChrome;
  return (
    <section className="bg-[#f7f7f5] py-24 dark:bg-[#101014]">
      <div ref={ref} className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#101512] dark:text-white mb-4 break-words">
            {data.painsHeading}
          </h2>
          <p className="text-[#5b645f] dark:text-white/55 max-w-2xl mx-auto">
            {data.painsSubheading}
          </p>
        </div>

        {/* MOBILE: cada par vira um card vertical limpo */}
        <div className="md:hidden space-y-5">
          {data.pains.map((p) => (
            <div
              key={p.pain}
              className="overflow-hidden rounded-2xl border border-[#d9ded8] bg-white dark:border-white/10 dark:bg-white/[0.03]"
            >
              <div className="px-5 pt-5 pb-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <XCircle className="h-4 w-4 text-destructive/80 shrink-0" />
                  <span className="text-[0.7rem] font-bold uppercase tracking-wider text-destructive/80">
                    {c.problemLabel}
                  </span>
                </div>
                <p className="text-[#646d67] dark:text-white/55 text-[0.95rem] leading-relaxed">{p.pain}</p>
              </div>
              <div
                className="border-t border-[#d9ded8] bg-white px-5 pb-5 pt-4 dark:border-white/10 dark:bg-transparent"
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--seg-accent)' }} />
                  <span
                    className="inline-flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider"
                    style={{ color: 'var(--seg-accent)' }}
                  >
                    <WithDominexLabel label={c.withDominex} compact />
                  </span>
                </div>
                <p className="text-[#17201b] dark:text-white/80 font-medium text-[0.95rem] leading-relaxed">
                  {p.solution}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* DESKTOP: tabela estilizada Problema × Solução */}
        <div className="hidden md:block overflow-hidden rounded-[1.5rem] border border-[#d9ded8] bg-white shadow-[0_28px_70px_-52px_rgba(16,16,20,0.28)] dark:border-white/10 dark:bg-white/[0.03]">
          <div className="grid grid-cols-2 border-b border-[#d9ded8] bg-[#f2f2f0] dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-center justify-center gap-2.5 px-7 py-5">
              <XCircle className="h-6 w-6 text-destructive shrink-0" />
              <span className="text-lg sm:text-xl font-bold text-[#262d29] dark:text-white text-center">
                {c.problemLabel}
              </span>
            </div>
            <div className="flex items-center justify-center gap-2.5 border-l border-[#d9ded8] px-7 py-5 dark:border-white/10">
              <CheckCircle2 className="h-6 w-6 shrink-0" style={{ color: 'var(--seg-accent)' }} />
              <span className="flex items-center justify-center gap-2 text-center text-lg font-bold text-[#17201b] dark:text-white sm:text-xl">
                <WithDominexLabel label={c.withDominex} />
              </span>
            </div>
          </div>

          {data.pains.map((p, i) => (
            <div
              key={p.pain}
              className={`group grid grid-cols-2 transition-colors hover:bg-[#f7f7f5] dark:hover:bg-white/[0.025] ${
                i > 0 ? 'border-t border-[#e2e6e1]' : ''
              }`}
            >
              <div className="flex items-start gap-3 px-7 py-6">
                <XCircle className="h-5 w-5 text-destructive/70 shrink-0 mt-0.5" />
                <p className="text-[#646d67] dark:text-white/55 text-[0.95rem] leading-snug">{p.pain}</p>
              </div>
              <div className="relative flex items-start gap-3 border-l border-[#e2e6e1] px-7 py-6 dark:border-white/10">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" style={{ color: 'var(--seg-accent)' }} />
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

function ModuleDeepDives({ data }: { data: ModuleData }) {
  // Mesmo efeito foto+parallax das landings de segmento, via seção reutilizável.
  // Aqui o acento é o verde de marca (a página aplica DOMINEX_BRAND_VARS, então
  // `hsl(var(--primary))` é o verde Dominex — público, sem white-label). O chip
  // de ícone usa fundo saturado e ícone branco, sem superfície pastel.
  return (
    <div id="como-funciona" className="scroll-mt-28 bg-white dark:bg-[#070908]">
      <DeepDiveSection
        dives={data.deepDives}
        accent="hsl(var(--primary))"
        iconChipClassName="bg-primary text-white"
        tone="light"
      />
    </div>
  );
}

function ModuleVideoMock({ data }: { data: ModuleData }) {
  const { messages } = useLocale();
  const copy = messages.pageChrome.motionMock;
  const screenshot = data.deepDives.find((dive) => dive.image)?.image;
  const motion = getModuleMotionAsset(data.slug);
  const videoSrc = motion?.video;
  const moduleLabel =
    (messages.moduleLabels as Record<string, string>)[data.slug] ?? data.navLabel;

  return (
    <section className="relative overflow-hidden bg-[#080a09] px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <DarkVeilBackground speed={0.5} />
        <div className="absolute inset-0 bg-black/25" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-[1080px] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-20">
        <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            {copy.sectionEyebrow}
          </p>
          <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl sm:leading-[1.05]">
            {interpolateCopy(copy.sectionTitle, { module: moduleLabel })}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-white/65 sm:text-lg sm:leading-8 lg:mx-0">
            {videoSrc ? copy.sectionReady : copy.sectionPending}
          </p>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
            {copy.sectionFormat}
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[340px] sm:max-w-[360px]">
          <div className="absolute -inset-10 rounded-[4rem] bg-primary/10 blur-3xl" aria-hidden="true" />
          <div className="relative rounded-[2.55rem] border border-white/15 bg-[#080a09] p-2.5 shadow-[0_38px_100px_-34px_rgba(0,0,0,.82)]">
            <div
              data-module-motion-frame
              className="relative aspect-[9/16] w-full overflow-hidden rounded-[2.05rem] border border-white/10 bg-black"
            >
              {videoSrc ? (
                <video
                  data-module-motion-video
                  className="h-full w-full object-cover"
                  playsInline
                  controls
                  preload="metadata"
                  poster={motion?.poster ?? screenshot?.src}
                  aria-label={interpolateCopy(copy.videoAria, { module: moduleLabel })}
                >
                  <source src={videoSrc} type="video/mp4" />
                  {copy.unsupported}
                </video>
              ) : screenshot ? (
                <img
                  src={screenshot.src}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover object-top opacity-45 blur-[1px]"
                />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,197,151,.22),transparent_65%)]" />
              )}
              {!videoSrc && (
                <>
                  <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/30 to-black/75" />
                  <div className="absolute left-1/2 top-3 h-1.5 w-14 -translate-x-1/2 rounded-full bg-black/70" aria-hidden="true" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#101512] shadow-xl">
                      <CirclePlay className="h-8 w-8" />
                    </span>
                    <p className="mt-5 text-sm font-semibold text-white">{copy.frameStatus}</p>
                    <p className="mt-1 text-xs text-white/60">{copy.framePlaceholder}</p>
                  </div>
                  <div className="absolute inset-x-5 bottom-5 h-1 overflow-hidden rounded-full bg-white/20">
                    <div className="h-full w-1/3 rounded-full bg-primary" />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- Funcionalidades ----------------------- */

/** CTA verde reaproveitado no rodapé da seção de funcionalidades. */
function FeaturesCta() {
  const { messages } = useLocale();
  return (
    <Button
      size="lg"
      className="bg-primary text-white hover:bg-[#00ad85] font-semibold px-8 py-6 text-base rounded-xl whitespace-normal h-auto text-center leading-tight"
      asChild
    >
      <WhatsAppCtaLink>
        {messages.pageChrome.ctaTrial}
        <ArrowRight className="ml-2 h-5 w-5 shrink-0" />
      </WhatsAppCtaLink>
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
    <ModuleFeatureCarousel
      sectionId="recursos-modulo"
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
      <ModuleFeatureCarousel
        sectionId="recursos-modulo"
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
          className="rounded-full transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {selectedSeg ? (
            <Badge
              className="cursor-pointer gap-1.5 border-0 px-3 py-1.5 text-sm"
              style={{ backgroundColor: selectedSeg.color, color: resolveWcagForeground(selectedSeg.color) }}
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
                      style={{ backgroundColor: seg.color, color: resolveWcagForeground(seg.color) }}
                    >
                      <seg.icon className="h-3 w-3" />
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

/* ------------------------------ FAQ -------------------------------- */

function ModuleFaq({ data }: { data: ModuleData }) {
  const ref = useScrollReveal();
  const { messages } = useLocale();
  return (
    <section id="faq-modulo" className="scroll-mt-28 bg-white py-24 dark:bg-[#070908]">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-[#101512] dark:text-white text-center mb-12">
          {messages.pageChrome.faqHeading}
        </h2>
        <Accordion type="single" collapsible className="grid md:grid-cols-2 gap-3">
          {data.faq.map((faq, i) => (
            <AccordionItem
              key={i}
              value={`faq-${i}`}
              className="rounded-xl border border-[#d9ded8] bg-white px-6 data-[state=open]:border-primary/40 h-fit dark:border-white/10 dark:bg-white/[0.03]"
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

function ModuleFinalCta({ data }: { data: ModuleData }) {
  const ref = useScrollReveal();
  const { messages } = useLocale();
  const c = messages.pageChrome;
  return (
    <section className="relative overflow-hidden border-t border-[#e0e4e0] bg-[#f5f4ef] py-32 dark:border-white/10 dark:bg-[#0b100d]">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(hsl(0,0%,50%) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
      <div ref={ref} className="relative mx-auto max-w-3xl px-4 text-center scroll-reveal">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#101512] dark:text-white mb-6 break-words">
          {data.finalCta.title}
        </h2>
        <p className="text-lg text-[#5c665f] dark:text-white/55 mb-10 max-w-xl mx-auto">{data.finalCta.subtitle}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="bg-primary text-white hover:bg-[#00ad85] px-10 py-6 text-base whitespace-normal h-auto text-center leading-tight"
            asChild
          >
            <WhatsAppCtaLink>
              {c.ctaTrial} <ArrowRight className="ml-2 h-5 w-5 shrink-0" />
            </WhatsAppCtaLink>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="text-[#202722] border border-[#ccd3cd] hover:bg-white hover:text-[#101512] dark:border-white/20 dark:text-white dark:hover:bg-white/10 dark:hover:text-white px-8 py-6 whitespace-normal h-auto text-center leading-tight"
            asChild
          >
            <a href="#recursos-modulo">{c.seePlans}</a>
          </Button>
        </div>
      </div>
    </section>
  );
}

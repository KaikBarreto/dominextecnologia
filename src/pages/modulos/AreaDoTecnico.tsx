import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  Image as ImageIcon,
  PenLine,
  Wrench,
} from 'lucide-react';
import { useCanonicalSlugRedirect, useLocale } from '@/lib/i18n';
import { captureUtmParams } from '@/lib/whatsapp';
import { getSiteSegments } from '@/utils/companySegments';
import { TECH_TOOLS_BY_SEGMENT } from '@/config/technicianArea';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import LandingNavbar from '@/components/landing/LandingNavbar';
import LandingFooter from '@/components/landing/LandingFooter';
import WhatsAppFloatingButton from '@/components/landing/WhatsAppFloatingButton';
import WhatsAppCtaLink from '@/components/landing/WhatsAppCtaLink';
import MarketingHeroBackdrop from '@/components/landing/MarketingHeroBackdrop';
import TechnicianToolsOrbit from '@/components/landing/TechnicianToolsOrbit';
import DarkVeilBackground from '@/components/ui/DarkVeilBackground';
import { AreaTecnicoIcon } from '@/components/icons/MenuIcons';
import { localizeNicheTools, TOOLS_BY_SEGMENT } from './tecnicoNicheTools';
import { getModuleData } from './content/loader';

const DOMINEX_BRAND_VARS = {
  '--primary': '160 100% 39%',
  '--ring': '160 100% 39%',
  '--sidebar-primary': '160 100% 39%',
  '--sidebar-accent': '160 100% 39%',
  '--sidebar-ring': '160 100% 39%',
  '--gradient-brand': 'linear-gradient(135deg, hsl(160 100% 39%) 0%, hsl(160 85% 45%) 100%)',
} as CSSProperties;

const MOTION_VIDEO =
  'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/landingpage/motions/area-tecnico-9x16.mp4';

const FLOW_MEDIA = [
  {
    number: '01',
    icon: ClipboardCheck,
    image: '/guia-tecnico/img/t7-area-tecnico-inicio.jpg',
  },
  {
    number: '02',
    icon: Wrench,
    image: '/guia-tecnico/img/t7-area-tecnico.jpg',
  },
  {
    number: '03',
    icon: PenLine,
    image: '/guia-tecnico/img/t7-os-compartilhada.jpg',
  },
];

function interpolateCopy(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{${key}}`).join(value),
    template,
  );
}

function darken(hex: string, factor = 0.76) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => Math.round(parseInt(value.slice(offset, offset + 2), 16) * factor));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export default function AreaDoTecnico() {
  const { locale } = useLocale();
  const data = getModuleData('area-do-tecnico', locale);

  useCanonicalSlugRedirect('area-do-tecnico');

  useEffect(() => {
    if (!data) return undefined;
    document.title = data.metaTitle;
    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute('content') ?? null;
    if (meta) meta.setAttribute('content', data.metaDescription);

    captureUtmParams(window.location.search);
    document.documentElement.classList.add('landing-scrollbar');
    window.scrollTo(0, 0);

    return () => {
      document.documentElement.classList.remove('landing-scrollbar');
      if (meta && previousDescription !== null) meta.setAttribute('content', previousDescription);
    };
  }, [data]);

  if (!data) return null;

  return (
    <div
      className="relative min-h-screen overflow-x-clip bg-white text-[#101512] dark:bg-[#070908] dark:text-white"
      style={DOMINEX_BRAND_VARS}
    >
      <LandingNavbar />
      <TechnicianHero />
      <main>
        <TechnicianVideo />
        <SegmentToolExplorer />
        <FieldFlow />
        <TechnicianFaq faq={data.faq} />
      </main>
      <TechnicianFinalCta title={data.finalCta.title} subtitle={data.finalCta.subtitle} />
      <LandingFooter />
      <WhatsAppFloatingButton />
    </div>
  );
}

function TechnicianHero() {
  const { locale, messages } = useLocale();
  const copy = messages.pageChrome.areaTechnician;
  const productName =
    (messages.moduleLabels as Record<string, string>)['area-do-tecnico'] ?? 'Área do Técnico™';

  return (
    <section
      className="technician-hero relative grid min-h-[100svh] place-items-center overflow-hidden border-b border-[#e3e7e2] bg-[#f7f7f5] px-4 pb-16 pt-[112px] dark:border-white/10 dark:bg-[#101014] sm:px-6 sm:pb-20 sm:pt-[124px]"
    >
      <MarketingHeroBackdrop />
      <TechnicianToolsOrbit />
      <div className="technician-hero__scrim" aria-hidden="true" />

      <div className="relative z-20 mx-auto flex w-full max-w-[1160px] flex-col items-center text-center">
        <div className="mb-7 inline-flex items-center gap-3 text-[#101512] dark:text-white sm:mb-9">
          <AreaTecnicoIcon className="h-11 w-11 shrink-0 text-primary sm:h-14 sm:w-14" />
          <span className="text-xl font-semibold tracking-[-0.035em] sm:text-2xl">{productName}</span>
        </div>

        <h1
          lang={locale === 'pt-br' ? 'pt-BR' : locale}
          className="m-0 max-w-[1040px] text-balance text-[clamp(2.8rem,6vw,6rem)] font-semibold leading-[0.9] tracking-[-0.06em]"
        >
          {copy.heroPrefix}
          <span className="dominex-home-hero-highlight block pb-[0.08em]">{copy.heroHighlight}</span>
        </h1>

        <p className="mt-7 max-w-[720px] text-balance text-base leading-7 text-[#626b65] dark:text-white/65 sm:text-lg sm:leading-8">
          {copy.heroSubtitle}
        </p>

        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <Button
            size="lg"
            className="h-[52px] w-full rounded-xl border border-[#101512] bg-[#101512] px-6 text-sm font-semibold text-white shadow-[0_16px_35px_-22px_rgba(16,21,18,0.75)] hover:bg-black hover:text-white dark:border-primary dark:bg-primary dark:hover:bg-[#00ad85] sm:w-auto"
            asChild
          >
            <WhatsAppCtaLink>
              {messages.pageChrome.ctaTrial}
              <ArrowRight className="ml-1 h-4 w-4" />
            </WhatsAppCtaLink>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-[52px] w-full rounded-xl border-[#c9ceca] bg-white/75 px-6 text-sm font-semibold text-[#101512] backdrop-blur-md hover:border-[#101512] hover:bg-white hover:text-[#101512] dark:border-white/25 dark:bg-black/25 dark:text-white dark:hover:bg-black/45 dark:hover:text-white sm:w-auto"
            asChild
          >
            <a href="#ferramentas-area-tecnico">
              {copy.exploreTools}
              <ChevronRight className="ml-1 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

function TechnicianVideo() {
  const { messages } = useLocale();
  const copy = messages.pageChrome.areaTechnician;

  return (
    <section className="relative overflow-hidden bg-[#080a09] px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <DarkVeilBackground speed={0.5} />
        <div className="absolute inset-0 bg-black/25" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-[1120px] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_350px] lg:gap-24">
        <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{copy.videoEyebrow}</p>
          <h2 className="mt-5 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-5xl sm:leading-[1.04]">
            {copy.videoTitle}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-white/65 sm:text-lg sm:leading-8 lg:mx-0">
            {copy.videoSubtitle}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm font-medium text-white/72 lg:justify-start">
            {copy.videoBadges.map((item) => (
              <span key={item} className="inline-flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[330px]">
          <div className="absolute -inset-10 rounded-[4rem] bg-primary/10 blur-3xl" aria-hidden="true" />
          <div className="relative rounded-[2.55rem] border border-white/15 bg-[#080a09] p-2.5 shadow-[0_38px_100px_-34px_rgba(0,0,0,.82)]">
            <div className="relative aspect-[9/16] overflow-hidden rounded-[2.05rem] border border-white/10 bg-black">
              <video
                className="h-full w-full object-cover"
                playsInline
                controls
                preload="metadata"
                poster="/guia-tecnico/img/t7-area-tecnico-inicio.jpg"
                aria-label={copy.videoAria}
              >
                <source src={MOTION_VIDEO} type="video/mp4" />
                {copy.videoUnsupported}
              </video>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SegmentToolExplorer() {
  const { locale, messages } = useLocale();
  const copy = messages.pageChrome.areaTechnician;
  const segmentLabels = messages.app.technicianTools.segments as Record<string, string>;
  const registry = messages.app.technicianTools.toolsRegistry as Record<
    string,
    { label: string; description: string }
  >;
  const segments = getSiteSegments().map((segment) => ({
    ...segment,
    label: segmentLabels[segment.value] ?? segment.label,
  }));
  const [activeSegment, setActiveSegment] = useState(segments[0].value);
  const selected = segments.find((segment) => segment.value === activeSegment) ?? segments[0];
  const tools = localizeNicheTools(TOOLS_BY_SEGMENT[selected.value] ?? [], locale, registry);
  const available = (TECH_TOOLS_BY_SEGMENT[selected.value]?.length ?? 0) > 0;
  const displayColor = darken(selected.color);
  const SelectedIcon = selected.icon;

  const previewImage = useMemo(() => {
    if (selected.value === 'refrigeracao') return '/guia-tecnico/img/t7-carga-termica.jpg';
    if (selected.value === 'ti_assistencia') return '/guia-tecnico/img/t7-area-tecnico.jpg';
    return '/guia-tecnico/img/t7-ferramentas-cadeado.jpg';
  }, [selected.value]);

  return (
    <section id="ferramentas-area-tecnico" className="scroll-mt-24 bg-[#f6f6f3] py-20 dark:bg-[#0b0d0c] sm:py-28">
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{copy.toolsEyebrow}</p>
          <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.045em] text-[#101512] dark:text-white sm:text-5xl">
            {copy.toolsTitle}
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#616b64] dark:text-white/60 sm:text-lg sm:leading-8">
            {copy.toolsSubtitle}
          </p>
        </div>

        <div className="-mx-4 mt-10 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
          <div className="flex min-w-max gap-2" role="group" aria-label={copy.segmentPicker}>
            {segments.map((segment) => {
              const Icon = segment.icon;
              const active = segment.value === selected.value;
              return (
                <button
                  key={segment.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveSegment(segment.value)}
                  className="flex h-12 items-center gap-2.5 rounded-xl border px-3.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0b0d0c]"
                  style={
                    active
                      ? { backgroundColor: darken(segment.color), borderColor: darken(segment.color), color: '#fff' }
                      : { backgroundColor: 'transparent', borderColor: `${segment.color}66` }
                  }
                >
                  <span
                    className="grid h-7 w-7 place-items-center rounded-lg text-white"
                    style={{ backgroundColor: active ? 'rgba(255,255,255,.18)' : segment.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  {segment.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[1.75rem] border border-[#dadfda] bg-white shadow-[0_30px_80px_-55px_rgba(16,21,18,.4)] dark:border-white/10 dark:bg-[#111412]">
          <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
            <div className="relative overflow-hidden p-6 text-white sm:p-9 lg:min-h-[650px]" style={{ backgroundColor: displayColor }}>
              <div
                className="pointer-events-none absolute inset-0 opacity-20"
                style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }}
                aria-hidden="true"
              />
              <div className="relative z-10 flex h-full flex-col">
                <div className="flex items-start justify-between gap-4">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-[#101512] shadow-lg">
                    <SelectedIcon className="h-7 w-7" style={{ color: displayColor }} />
                  </span>
                  <span className="rounded-full border border-white/30 bg-black/15 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-white">
                    {available ? copy.available : copy.planned}
                  </span>
                </div>
                <h3 className="mt-8 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{selected.label}</h3>
                <p className="mt-4 max-w-md text-base leading-7 text-white/78">
                  {interpolateCopy(copy.genericSegmentDescription, { segment: selected.label })}
                </p>

                <div className="mt-9 overflow-hidden rounded-[1.3rem] border border-white/18 bg-black/20 p-2 shadow-2xl backdrop-blur-sm lg:mt-auto">
                  <div className="overflow-hidden rounded-[0.95rem] bg-white">
                    <img
                      key={previewImage}
                      src={previewImage}
                      alt={
                        available
                          ? interpolateCopy(copy.realPreviewAlt, { segment: selected.label })
                          : copy.plannedPreviewAlt
                      }
                      width={1180}
                      height={897}
                      loading="eager"
                      decoding="async"
                      className="aspect-[16/10] h-full w-full object-cover object-top"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-9 lg:p-12">
              <div className="flex flex-col gap-3 border-b border-[#e1e5e1] pb-7 dark:border-white/10 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: displayColor }}>
                    {tools.length} {tools.length === 1 ? copy.toolSingular : copy.toolPlural}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-[#101512] dark:text-white">
                    {copy.toolListTitle}
                  </h3>
                </div>
                {!available && (
                  <p className="max-w-[245px] text-sm leading-5 text-[#707973] dark:text-white/48">
                    {copy.plannedNote}
                  </p>
                )}
              </div>

              <div className="grid sm:grid-cols-2">
                {tools.map((tool, index) => {
                  const Icon = tool.icon;
                  return (
                    <div
                      key={tool.id}
                      className={`flex gap-4 border-[#e5e8e5] py-5 dark:border-white/10 sm:pr-5 ${index < tools.length - 2 ? 'border-b' : ''} ${index % 2 === 1 ? 'sm:border-l sm:pl-6 sm:pr-0' : ''}`}
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ backgroundColor: displayColor }}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-[#151b17] dark:text-white">{tool.title}</h4>
                        <p className="mt-1.5 text-sm leading-5 text-[#68716b] dark:text-white/52">{tool.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 border-t border-[#e1e5e1] pt-7 dark:border-white/10">
                <WhatsAppCtaLink className="inline-flex items-center gap-2 text-sm font-bold text-[#101512] hover:text-primary dark:text-white dark:hover:text-primary">
                  {copy.toolsCta}
                  <ArrowRight className="h-4 w-4" />
                </WhatsAppCtaLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FieldFlow() {
  const { messages } = useLocale();
  const copy = messages.pageChrome.areaTechnician;
  const flow = FLOW_MEDIA.map((media, index) => ({
    ...media,
    ...copy.flowSteps[index],
  }));
  const flowBadges = [
    { icon: Download, label: copy.flowBadges[0] },
    { icon: ImageIcon, label: copy.flowBadges[1] },
    { icon: Wrench, label: copy.flowBadges[2] },
  ];

  return (
    <section className="bg-white py-20 dark:bg-[#070908] sm:py-28">
      <div className="mx-auto max-w-[1260px] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{copy.flowEyebrow}</p>
            <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.045em] text-[#101512] dark:text-white sm:text-5xl">
              {copy.flowTitle}
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-[#616b64] dark:text-white/60 sm:text-lg sm:leading-8 lg:justify-self-end">
            {copy.flowSubtitle}
          </p>
        </div>

        <div className="mt-12 grid gap-px overflow-hidden rounded-[1.65rem] border border-[#dfe3df] bg-[#dfe3df] dark:border-white/10 dark:bg-white/10 lg:grid-cols-3">
          {flow.map((step) => {
            const Icon = step.icon;
            return (
              <article key={step.number} className="group bg-[#f8f8f6] p-4 dark:bg-[#101311] sm:p-5">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[1.1rem] bg-white dark:bg-black">
                  <img
                    src={step.image}
                    alt={step.alt}
                    width={1180}
                    height={897}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.025]"
                  />
                  <span className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-xl bg-primary text-white shadow-lg">
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
                <div className="px-1 pb-2 pt-6">
                  <span className="text-xs font-bold tracking-[0.15em] text-primary">{step.number}</span>
                  <h3 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-[#101512] dark:text-white">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#667069] dark:text-white/54">{step.description}</p>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm font-semibold text-[#4e5851] dark:text-white/62">
          {flowBadges.map(({ icon: Icon, label }) => (
            <span key={label} className="inline-flex items-center gap-2">
              <Icon className="h-4 w-4 text-primary" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function TechnicianFaq({ faq }: { faq: Array<{ q: string; a: string }> }) {
  const { messages } = useLocale();
  return (
    <section className="bg-[#f6f6f3] py-20 dark:bg-[#0b0d0c] sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-semibold tracking-[-0.04em] text-[#101512] dark:text-white sm:text-4xl">
          {messages.pageChrome.faqHeading}
        </h2>
        <Accordion type="single" collapsible className="mt-10 grid gap-3 md:grid-cols-2">
          {faq.map((item, index) => (
            <AccordionItem
              key={item.q}
              value={`faq-${index}`}
              className="h-fit rounded-xl border border-[#d9ded8] bg-white px-6 data-[state=open]:border-primary/45 dark:border-white/10 dark:bg-white/[0.03]"
            >
              <AccordionTrigger className="py-5 text-left text-sm text-[#29312d] hover:text-[#101512] hover:no-underline dark:text-white/80 dark:hover:text-white">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-sm leading-relaxed text-[#626c66] dark:text-white/55">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function TechnicianFinalCta({ title, subtitle }: { title: string; subtitle: string }) {
  const { messages } = useLocale();
  return (
    <section className="relative overflow-hidden border-t border-[#e0e4e0] bg-white py-24 dark:border-white/10 dark:bg-[#070908] sm:py-28">
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-[radial-gradient(ellipse_at_bottom,rgba(0,197,151,.13),transparent_68%)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-3xl px-4 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <h2 className="mt-6 text-balance text-3xl font-semibold tracking-[-0.045em] text-[#101512] dark:text-white sm:text-5xl">
          {title}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#5f6962] dark:text-white/58 sm:text-lg">{subtitle}</p>
        <Button
          size="lg"
          className="mt-9 h-[52px] rounded-xl bg-primary px-7 text-sm font-semibold text-white hover:bg-[#00ad85]"
          asChild
        >
          <WhatsAppCtaLink>
            {messages.pageChrome.ctaTrial}
            <ArrowRight className="ml-2 h-4 w-4" />
          </WhatsAppCtaLink>
        </Button>
      </div>
    </section>
  );
}

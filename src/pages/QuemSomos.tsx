import { useEffect, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Smartphone,
  HardHat,
  ShieldCheck,
  Gauge,
  HeartHandshake,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { captureUtmParams } from '@/lib/whatsapp';
import LandingNavbar from '@/components/landing/LandingNavbar';
import { useLocale } from '@/lib/i18n';
import { localizeInternal } from '@/lib/i18n/localizeInternal';
import { localizeHash } from '@/lib/i18n/localizeHash';
import LandingFooter from '@/components/landing/LandingFooter';
import WhatsAppFloatingButton from '@/components/landing/WhatsAppFloatingButton';
import WhatsAppCtaLink from '@/components/landing/WhatsAppCtaLink';
import MarketingHeroBackdrop from '@/components/landing/MarketingHeroBackdrop';

// Página institucional pública. NUNCA herda o white-label do tenant logado:
// restaura o brand Dominex em toda a subárvore (espelha Landing.tsx /
// ModuleLandingPage.tsx / SegmentLandingPage.tsx).
const DOMINEX_BRAND_VARS = {
  '--primary': '160 100% 39%',
  '--ring': '160 100% 39%',
  '--sidebar-primary': '160 100% 39%',
  '--sidebar-accent': '160 100% 39%',
  '--sidebar-ring': '160 100% 39%',
  '--gradient-brand': 'linear-gradient(135deg, hsl(160 100% 39%) 0%, hsl(160 85% 45%) 100%)',
} as CSSProperties;

const META_TITLE = 'Quem somos | Dominex | Gestão para equipes de campo';
const META_DESCRIPTION =
  'Conheça a Dominex: sistema de ordem de serviço, PMOC e gestão para empresas de refrigeração, elétrica, energia solar e outros serviços de campo. Feito para quem domina o campo.';

// Ícones dos valores, na ORDEM do array messages.quemSomos.values.
const VALUE_ICONS = [Smartphone, HardHat, Gauge, ShieldCheck, MapPin, HeartHandshake];

export default function QuemSomos() {
  useEffect(() => {
    document.title = META_TITLE;
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content') ?? null;
    if (meta) meta.setAttribute('content', META_DESCRIPTION);

    captureUtmParams(window.location.search);
    document.documentElement.classList.add('landing-scrollbar');
    window.scrollTo(0, 0);

    return () => {
      document.documentElement.classList.remove('landing-scrollbar');
      if (meta && prevDesc !== null) meta.setAttribute('content', prevDesc);
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-white text-[#101512] dark:bg-[#070908] dark:text-white" style={DOMINEX_BRAND_VARS}>
      <div className="relative">
        <LandingNavbar />
        <Hero />
        <main>
          <Mission />
          <Values />
        </main>
        <FinalCta />
        <LandingFooter />
      </div>
      <WhatsAppFloatingButton />
    </div>
  );
}

/* ------------------------------- Hero ------------------------------- */

function Hero() {
  const ref = useScrollReveal();
  const { locale, messages } = useLocale();
  const t = messages.quemSomos;
  return (
    <section className="relative min-h-[70vh] flex items-center overflow-hidden bg-white pt-16 dark:bg-[#070908]">
      <MarketingHeroBackdrop />
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(160,45%,38%,0.07)_0%,transparent_70%)]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(hsl(0,0%,40%) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div ref={ref} className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-20 lg:py-28 text-center scroll-reveal">
        <div className="mb-7 inline-flex items-center gap-2 text-[#101512] dark:text-white">
          <HeartHandshake className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-[0.18em]">{t.heroBadge}</span>
        </div>

        <h1
          lang={locale === 'pt-br' ? 'pt-BR' : locale}
          className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold text-[#101512] dark:text-white leading-[1.12] tracking-tight break-words hyphens-auto"
        >
          {t.heroTitlePre}{' '}
          <span className="text-primary">
            {t.heroTitleHighlight}
          </span>
        </h1>

        <p className="mt-7 text-lg text-[#5c665f] dark:text-white/60 max-w-2xl mx-auto leading-relaxed">
          {t.heroSubtitle}
        </p>

        <div className="mt-9 flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="bg-primary text-white hover:bg-[#00ad85] text-base px-8 py-6 w-full sm:w-auto whitespace-normal h-auto text-center leading-tight"
            asChild
          >
            <WhatsAppCtaLink>
              {t.ctaTrial}
              <ArrowRight className="ml-2 h-5 w-5 shrink-0" />
            </WhatsAppCtaLink>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="border border-[#ccd3cd] text-[#202722] hover:bg-[#f0f3ef] hover:text-[#101512] dark:border-white/20 dark:text-white dark:hover:bg-white/10 dark:hover:text-white px-8 py-6 w-full sm:w-auto whitespace-normal h-auto text-center leading-tight"
            asChild
          >
            <Link to={localizeInternal('/', locale) + '#' + localizeHash('recursos', locale)}>{t.ctaPricing}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Missão ------------------------------ */

function Mission() {
  const ref = useScrollReveal();
  const t = useLocale().messages.quemSomos;
  // missionP1 tem o marcador {strong}; renderiza a parte em negrito no meio.
  const [p1Before, p1After] = t.missionP1.split('{strong}');
  return (
    <section className="bg-[#f7f8f5] py-24 dark:bg-[#0b100d]">
      <div ref={ref} className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="rounded-2xl border border-[#dfe4df] bg-white p-8 lg:p-12 dark:border-white/10 dark:bg-white/[0.02]">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#101512] dark:text-white mb-6 leading-tight">
            {t.missionTitle}
          </h2>
          <div className="space-y-5 text-[#5c665f] dark:text-white/55 text-base leading-relaxed">
            <p>
              {p1Before}
              <strong className="text-[#26302a] dark:text-white/80">{t.missionP1Strong}</strong>
              {p1After}
            </p>
            <p>{t.missionP2}</p>
            <p>{t.missionP3}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Valores ----------------------------- */

function Values() {
  const ref = useScrollReveal();
  const t = useLocale().messages.quemSomos;
  const values = t.values.map((v, i) => ({ icon: VALUE_ICONS[i], title: v.title, body: v.body }));
  return (
    <section className="bg-white py-24 dark:bg-[#070908]">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#101512] dark:text-white mb-4">
            {t.valuesTitle}
          </h2>
          <p className="text-[#5c665f] dark:text-white/55 max-w-2xl mx-auto">
            {t.valuesSubtitle}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {values.map((v) => {
            const Icon = v.icon;
            return (
              <div
                key={v.title}
                className="rounded-2xl border border-[#dfe4df] bg-[#f7f8f5] p-6 transition-colors hover:border-[#9ca9a0] dark:border-white/10 dark:bg-[hsl(0,0%,6%)] dark:hover:border-primary/30"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[#dfe4df] bg-white text-primary dark:border-white/15 dark:bg-white dark:text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-[#101512] dark:text-white mb-2">{v.title}</h3>
                <p className="text-[#5c665f] dark:text-white/50 text-sm leading-relaxed">{v.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- CTA final ---------------------------- */

function FinalCta() {
  const ref = useScrollReveal();
  const { locale, messages } = useLocale();
  const t = messages.quemSomos;
  return (
    <section className="relative overflow-hidden bg-[#161b1a] py-32 text-white">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(hsl(0,0%,50%) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
      <div ref={ref} className="relative mx-auto max-w-3xl px-4 text-center scroll-reveal">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 break-words">
          {t.finalCtaTitle}
        </h2>
        <p className="text-lg text-white/50 mb-10 max-w-xl mx-auto">
          {t.finalCtaSubtitle}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="bg-primary text-white hover:bg-[#00ad85] px-10 py-6 text-base whitespace-normal h-auto text-center leading-tight"
            asChild
          >
            <WhatsAppCtaLink>
              {t.ctaTrial} <ArrowRight className="ml-2 h-5 w-5 shrink-0" />
            </WhatsAppCtaLink>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="text-white border border-white/20 hover:bg-white/10 hover:text-white px-8 py-6 whitespace-normal h-auto text-center leading-tight"
            asChild
          >
            <Link to={localizeInternal('/', locale) + '#' + localizeHash('recursos', locale)}>{t.ctaPricing}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

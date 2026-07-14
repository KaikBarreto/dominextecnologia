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
import DarkVeilBackground from '@/components/ui/DarkVeilBackground';

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

const META_TITLE = 'Quem somos — Dominex | Gestão para equipes de campo';
const META_DESCRIPTION =
  'Conheça a Dominex: sistema de ordem de serviço, PMOC e gestão para empresas de serviço e equipes de campo — refrigeração, elétrica, energia solar e mais. Feito para quem domina o campo.';

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
    <div className="relative min-h-screen" style={DOMINEX_BRAND_VARS}>
      <div className="fixed inset-0 z-0 bg-[hsl(0,0%,4%)]">
        <DarkVeilBackground hueShift={53} speed={0.5} />
        <div className="absolute inset-0 bg-[hsl(0,0%,4%)]/60 pointer-events-none" />
      </div>

      <div className="relative z-10">
        <LandingNavbar />
        <Hero />
        <Mission />
        <Values />
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
    <section className="relative min-h-[70vh] flex items-center pt-16 overflow-hidden">
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
        <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-[hsl(160,80%,55%)] px-4 py-1.5 mb-7">
          <HeartHandshake className="h-4 w-4 text-white" />
          <span className="text-xs font-semibold text-white">{t.heroBadge}</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold text-white leading-[1.12] tracking-tight">
          {t.heroTitlePre}{' '}
          <span className="bg-gradient-to-r from-primary to-[hsl(160,80%,55%)] bg-clip-text text-transparent">
            {t.heroTitleHighlight}
          </span>
        </h1>

        <p className="mt-7 text-lg text-white/50 max-w-2xl mx-auto leading-relaxed">
          {t.heroSubtitle}
        </p>

        <div className="mt-9 flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 text-base px-8 py-6 shadow-brand-glow w-full sm:w-auto"
            asChild
          >
            <Link to="/cadastro?origem=Site">{t.ctaTrial}</Link>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="text-white border border-white/20 hover:bg-white/10 hover:text-white px-8 py-6 w-full sm:w-auto"
            asChild
          >
            <Link to={localizeInternal('/', locale) + '#' + localizeHash('precos', locale)}>{t.ctaPricing}</Link>
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
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 lg:p-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6 leading-tight">
            {t.missionTitle}
          </h2>
          <div className="space-y-5 text-white/55 text-base leading-relaxed">
            <p>
              {p1Before}
              <strong className="text-white/80">{t.missionP1Strong}</strong>
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
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {t.valuesTitle}
          </h2>
          <p className="text-white/55 max-w-2xl mx-auto">
            {t.valuesSubtitle}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {values.map((v) => {
            const Icon = v.icon;
            return (
              <div
                key={v.title}
                className="rounded-2xl border border-white/10 bg-[hsl(0,0%,6%)] p-6 transition-colors hover:border-primary/30"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-white mb-2">{v.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{v.body}</p>
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
          {t.finalCtaTitle}
        </h2>
        <p className="text-lg text-white/50 mb-10 max-w-xl mx-auto">
          {t.finalCtaSubtitle}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-10 py-6 text-base shadow-brand-glow"
            asChild
          >
            <Link to="/cadastro?origem=Site">
              {t.ctaTrial} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="text-white border border-white/20 hover:bg-white/10 hover:text-white px-8 py-6"
            asChild
          >
            <Link to={localizeInternal('/', locale) + '#' + localizeHash('precos', locale)}>{t.ctaPricing}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

import { useEffect, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Newspaper, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { captureUtmParams } from '@/lib/whatsapp';
import LandingNavbar from '@/components/landing/LandingNavbar';
import LandingFooter from '@/components/landing/LandingFooter';
import WhatsAppFloatingButton from '@/components/landing/WhatsAppFloatingButton';
import DarkVeilBackground from '@/components/ui/DarkVeilBackground';

// Página institucional pública. NUNCA herda o white-label do tenant logado:
// restaura o brand Dominex em toda a subárvore (espelha Landing.tsx /
// QuemSomos.tsx / ModuleLandingPage.tsx / SegmentLandingPage.tsx).
const DOMINEX_BRAND_VARS = {
  '--primary': '160 100% 39%',
  '--ring': '160 100% 39%',
  '--sidebar-primary': '160 100% 39%',
  '--sidebar-accent': '160 100% 39%',
  '--sidebar-ring': '160 100% 39%',
  '--gradient-brand': 'linear-gradient(135deg, hsl(160 100% 39%) 0%, hsl(160 85% 45%) 100%)',
} as CSSProperties;

const META_TITLE = 'Blog — Dominex';
const META_DESCRIPTION =
  'Blog da Dominex: conteúdo sobre gestão de ordens de serviço, PMOC e operação de equipes de campo. Em breve, os primeiros artigos.';

export default function Blog() {
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
        <ComingSoon />
        <LandingFooter />
      </div>
      <WhatsAppFloatingButton />
    </div>
  );
}

/* ------------------------------- Hero ------------------------------- */

function Hero() {
  const ref = useScrollReveal();
  return (
    <section className="relative min-h-[60vh] flex items-center pt-16 overflow-hidden">
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

      <div ref={ref} className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-20 lg:py-24 text-center scroll-reveal">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 mb-7">
          <Newspaper className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-primary">Blog da Dominex</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold text-white leading-[1.12] tracking-tight">
          Conteúdo pra quem{' '}
          <span className="bg-gradient-to-r from-primary to-[hsl(160,80%,55%)] bg-clip-text text-transparent">
            domina o campo
          </span>
        </h1>

        <p className="mt-7 text-lg text-white/50 max-w-2xl mx-auto leading-relaxed">
          Conteúdo sobre gestão de ordens de serviço, PMOC e operação de equipes de campo — em
          breve.
        </p>
      </div>
    </section>
  );
}

/* ---------------------------- Em breve ------------------------------ */

function ComingSoon() {
  const ref = useScrollReveal();
  return (
    <section className="pb-32">
      <div ref={ref} className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 lg:p-12 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6">
            <PenLine className="h-7 w-7" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Estamos preparando os primeiros conteúdos
          </h2>
          <p className="text-white/50 text-base leading-relaxed mb-9 max-w-lg mx-auto">
            Em breve, artigos práticos sobre rotina de campo, PMOC, gestão de equipe e como tirar a
            operação do papel. Volte em breve — ou comece agora pela própria ferramenta.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-6 text-base shadow-brand-glow"
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
      </div>
    </section>
  );
}

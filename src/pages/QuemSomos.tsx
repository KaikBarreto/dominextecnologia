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

const VALUES = [
  {
    icon: Smartphone,
    title: 'Tudo no celular do técnico',
    body: 'Equipe em campo precisa de tudo na mão. O app é instalável no celular e o técnico abre a ordem de serviço, registra foto, checklist e assinatura direto no local do serviço — sem papel e sem voltar pro escritório.',
  },
  {
    icon: HardHat,
    title: 'Feito pra quem domina o campo',
    body: 'Nascemos perto da operação de serviço, não da planilha. Cada tela é pensada pro técnico na rua e pro gestor que precisa enxergar tudo de longe.',
  },
  {
    icon: Gauge,
    title: 'Rápido de começar',
    body: 'Sem implantação interminável. Você cria a conta, cadastra sua equipe e já está emitindo ordem de serviço no mesmo dia — sem cartão pra testar.',
  },
  {
    icon: ShieldCheck,
    title: 'Seus dados são seus',
    body: 'Isolamento por empresa, controle de acesso por permissão e documentos sempre rastreáveis. Cada cliente vê só o que é dele.',
  },
  {
    icon: MapPin,
    title: 'Do orçamento ao recibo',
    body: 'CRM, orçamento, ordem de serviço, PMOC, financeiro e folha no mesmo lugar. Um sistema só pra conduzir o serviço de ponta a ponta.',
  },
  {
    icon: HeartHandshake,
    title: 'Suporte que entende o ramo',
    body: 'Falamos a língua de quem presta serviço de campo. Quando você chama, do outro lado tem gente que conhece a sua rotina.',
  },
];

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
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 mb-7">
          <HeartHandshake className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-primary">Sobre a Dominex</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold text-white leading-[1.12] tracking-tight">
          Quem domina o campo,{' '}
          <span className="bg-gradient-to-r from-primary to-[hsl(160,80%,55%)] bg-clip-text text-transparent">
            domina a operação
          </span>
        </h1>

        <p className="mt-7 text-lg text-white/50 max-w-2xl mx-auto leading-relaxed">
          A Dominex existe para tirar da papelada o trabalho de quem presta serviço de campo. Um
          sistema só, no celular e no computador, pra conduzir a operação do orçamento ao recibo.
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
            <Link to="/#pricing">Ver planos</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Missão ------------------------------ */

function Mission() {
  const ref = useScrollReveal();
  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 lg:p-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6 leading-tight">
            Nossa missão
          </h2>
          <div className="space-y-5 text-white/55 text-base leading-relaxed">
            <p>
              A Dominex é um sistema de <strong className="text-white/80">ordem de serviço, PMOC e
              gestão</strong> feito para empresas de serviço e equipes de campo — refrigeração e
              climatização, elétrica, energia solar, CFTV, provedores de internet, elevadores,
              dedetização, limpeza e conservação, construção e muito mais.
            </p>
            <p>
              Acreditamos que o técnico não deveria perder tempo com ordem de serviço em papel,
              nem o gestor deveria ficar no escuro sobre o que acontece na rua. Por isso reunimos
              num lugar só o que antes vivia espalhado em caderno, grupo de WhatsApp e planilha:
              CRM, orçamento, contrato, ordem de serviço, PMOC, rastreamento de equipe, controle
              de estoque, financeiro e folha.
            </p>
            <p>
              Nosso compromisso é simples: deixar a operação organizada, rastreável e fácil de
              tocar — pra você focar no serviço bem feito, não na burocracia.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Valores ----------------------------- */

function Values() {
  const ref = useScrollReveal();
  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            No que a gente acredita
          </h2>
          <p className="text-white/40 max-w-2xl mx-auto">
            Os princípios que guiam cada decisão sobre o produto.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {VALUES.map((v) => {
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
          Experimente a Dominex na sua operação
        </h2>
        <p className="text-lg text-white/50 mb-10 max-w-xl mx-auto">
          São 14 dias grátis, sem cartão de crédito. Cadastre sua equipe e comece a emitir ordem
          de serviço hoje mesmo.
        </p>
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
            <Link to="/#pricing">Ver planos</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

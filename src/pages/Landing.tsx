import { useEffect, type CSSProperties } from 'react';
import LandingNavbar from '@/components/landing/LandingNavbar';
import HeroSection from '@/components/landing/HeroSection';
import LogosSection from '@/components/landing/LogosSection';
import ProblemSolutionSection from '@/components/landing/ProblemSolutionSection';
import FeaturesGrid from '@/components/landing/FeaturesGrid';
import HowItWorks from '@/components/landing/HowItWorks';
import ProductMockup from '@/components/landing/ProductMockup';
import TestimonialsSection from '@/components/landing/TestimonialsSection';
import SegmentsSection from '@/components/landing/SegmentsSection';
import PricingSection from '@/components/landing/PricingSection';
import FaqSection from '@/components/landing/FaqSection';
import CtaFinalSection from '@/components/landing/CtaFinalSection';
import LandingFooter from '@/components/landing/LandingFooter';
import WhatsAppFloatingButton from '@/components/landing/WhatsAppFloatingButton';
import DarkVeilBackground from '@/components/ui/DarkVeilBackground';
import { captureUtmParams } from '@/lib/whatsapp';

// A landing é página pública e NUNCA deve herdar o white-label do tenant logado.
// O white-label seta essas vars no :root (index.html boot + useWhiteLabel); aqui
// redefinimos na raiz da landing pra restaurar o brand Dominex em toda a subárvore.
const DOMINEX_BRAND_VARS = {
  '--primary': '160 100% 39%',
  '--ring': '160 100% 39%',
  '--sidebar-primary': '160 100% 39%',
  '--sidebar-accent': '160 100% 39%',
  '--sidebar-ring': '160 100% 39%',
  '--gradient-brand': 'linear-gradient(135deg, hsl(160 100% 39%) 0%, hsl(160 85% 45%) 100%)',
} as CSSProperties;

export default function Landing() {
  useEffect(() => {
    // Persiste os utm_* em sessionStorage pro CTA de WhatsApp incluir a origem.
    captureUtmParams(window.location.search);
    document.documentElement.classList.add('landing-scrollbar');
    return () => document.documentElement.classList.remove('landing-scrollbar');
  }, []);

  return (
    <div className="relative min-h-screen" style={DOMINEX_BRAND_VARS}>
      {/* Dark veil de fundo de TODA a landing — fixo, rola por baixo do conteúdo (igual login) */}
      <div className="fixed inset-0 z-0 bg-[hsl(0,0%,4%)]">
        <DarkVeilBackground hueShift={53} speed={0.5} />
        {/* abafador: deixa o veil DISCRETO. Ajustável: mais alpha = mais escuro/sutil */}
        <div className="absolute inset-0 bg-[hsl(0,0%,4%)]/60 pointer-events-none" />
      </div>

      {/* Conteúdo por cima do veil */}
      <div className="relative z-10">
        <LandingNavbar />
        <HeroSection />
        <LogosSection />
        <ProblemSolutionSection />
        <FeaturesGrid />
        <HowItWorks />
        <ProductMockup />
        <TestimonialsSection />
        <SegmentsSection />
        <PricingSection />
        <FaqSection />
        <CtaFinalSection />
        <LandingFooter />
      </div>
      <WhatsAppFloatingButton />
    </div>
  );
}

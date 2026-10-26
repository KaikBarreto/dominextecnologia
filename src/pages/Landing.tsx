import { useEffect, type CSSProperties } from 'react';
import LandingNavbar from '@/components/landing/LandingNavbar';
import HeroSection from '@/components/landing/HeroSection';
import LogosSection from '@/components/landing/LogosSection';
import ProblemSolutionSection from '@/components/landing/ProblemSolutionSection';
import HomeFeatures from '@/components/landing/HomeFeatures';
import HowItWorks from '@/components/landing/HowItWorks';
import ProductMockup from '@/components/landing/ProductMockup';
import SegmentsSection from '@/components/landing/SegmentsSection';
import FaqSection from '@/components/landing/FaqSection';
import CtaFinalSection from '@/components/landing/CtaFinalSection';
import LandingFooter from '@/components/landing/LandingFooter';
import WhatsAppFloatingButton from '@/components/landing/WhatsAppFloatingButton';
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
    <div className="relative min-h-screen bg-white text-[#101512] dark:bg-[#070908] dark:text-white" style={DOMINEX_BRAND_VARS}>
      <div className="relative">
        <LandingNavbar />
        <HeroSection />
        <main>
          <LogosSection />
          <ProblemSolutionSection />
          <HomeFeatures />
          <HowItWorks />
          <ProductMockup />
          <SegmentsSection />
          <FaqSection />
          <CtaFinalSection />
        </main>
        <LandingFooter />
      </div>
      <WhatsAppFloatingButton />
    </div>
  );
}

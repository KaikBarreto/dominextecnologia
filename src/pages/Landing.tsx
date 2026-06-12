import { useEffect } from 'react';
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
import { captureUtmParams } from '@/lib/whatsapp';

export default function Landing() {
  useEffect(() => {
    // Persiste os utm_* em sessionStorage pro CTA de WhatsApp incluir a origem.
    captureUtmParams(window.location.search);
    document.documentElement.classList.add('landing-scrollbar');
    return () => document.documentElement.classList.remove('landing-scrollbar');
  }, []);

  return (
    <div className="min-h-screen bg-[hsl(0,0%,4%)]">
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
      <WhatsAppFloatingButton />
    </div>
  );
}

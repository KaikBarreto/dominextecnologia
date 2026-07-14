import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useLocale } from '@/lib/i18n';

export default function CtaFinalSection() {
  const ref = useScrollReveal();
  const t = useLocale().messages.home.ctaFinal;

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
          {t.heading}
        </h2>
        <p className="text-lg text-white/50 mb-10 max-w-xl mx-auto">
          {t.subtitle}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-10 py-6 text-base shadow-brand-glow"
            asChild
          >
            <Link to="/cadastro?origem=Site">
              {t.ctaPrimary} <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="text-white border border-white/20 hover:bg-white/10 hover:text-white px-8 py-6"
            asChild
          >
            <Link to="/cadastro?origem=Site">{t.ctaSecondary}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

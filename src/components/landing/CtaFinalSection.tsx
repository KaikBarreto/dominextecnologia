import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useLocale } from '@/lib/i18n';
import WhatsAppCtaLink from '@/components/landing/WhatsAppCtaLink';

export default function CtaFinalSection() {
  const ref = useScrollReveal();
  const t = useLocale().messages.home.ctaFinal;

  return (
    <section className="relative overflow-hidden border-t border-[#e3e7e2] bg-[#f4f6f2] py-32 dark:border-white/10 dark:bg-[#050706]">

      <div ref={ref} className="relative mx-auto max-w-3xl px-4 text-center scroll-reveal">
        <h2 className="mb-6 break-words text-3xl font-bold tracking-[-0.035em] text-[#101512] dark:text-white sm:text-4xl lg:text-5xl">
          {t.heading}
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-[#657068] dark:text-white/55">
          {t.subtitle}
        </p>
        <div className="flex justify-center">
          <Button
            size="lg"
            className="h-auto whitespace-normal bg-primary px-10 py-6 text-center text-base leading-tight text-white shadow-[0_14px_30px_-16px_rgba(0,197,151,0.75)] hover:bg-[#00ad85]"
            asChild
          >
            <WhatsAppCtaLink>
              {t.ctaPrimary} <ArrowRight className="ml-2 h-5 w-5 shrink-0" />
            </WhatsAppCtaLink>
          </Button>
        </div>
      </div>
    </section>
  );
}

import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/i18n';
import { localizeHash } from '@/lib/i18n/localizeHash';
import WhatsAppCtaLink from '@/components/landing/WhatsAppCtaLink';
import HeroGalaxy from '@/components/landing/HeroGalaxy';
import DominexBrandLogo from '@/components/landing/DominexBrandLogo';

export default function HeroSection() {
  const { locale, messages } = useLocale();
  const t = messages.home.hero;

  return (
    <section
      data-dominex-home-hero
      className="dominex-home-hero relative grid min-h-[100svh] place-items-center overflow-hidden border-b border-[#e3e7e2] bg-[#f7f7f5] px-4 pb-16 pt-[108px] text-[#101512] dark:border-white/10 dark:bg-[#101014] dark:text-white sm:px-6 sm:pb-20 sm:pt-[124px]"
    >
      <HeroGalaxy />

      <div className="dominex-home-hero-copy relative z-20 mx-auto flex w-full max-w-[1450px] flex-col items-center text-center">
        <DominexBrandLogo className="dominex-home-hero-logo mb-7 w-[190px] sm:mb-9 sm:w-[270px]" />

        <h1
          lang={locale === 'pt-br' ? 'pt-BR' : locale}
          aria-label={t.srHeadline}
          className="m-0 max-w-[1220px] text-balance text-[clamp(2.75rem,6.2vw,6.2rem)] font-semibold leading-[0.9] tracking-[-0.06em]"
        >
          <span aria-hidden="true">
            <span>{t.typedPre}</span>
            <span className="dominex-home-hero-highlight block">{t.typedHighlight}</span>
          </span>
        </h1>

        <div className="dominex-home-hero-lower mt-7 flex w-full max-w-[760px] flex-col items-center gap-6 sm:mt-9 lg:max-w-[980px]">
          <p className="m-0 max-w-[720px] text-balance text-[0.95rem] leading-7 text-[#666f69] dark:text-white/[0.66] sm:text-base lg:max-w-[960px]">
            {t.subtitle}
          </p>

          <div className="flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <Button
              size="lg"
              className="h-[52px] w-full rounded-xl border border-[#101512] bg-[#101512] px-6 text-sm font-semibold text-white shadow-[0_16px_35px_-22px_rgba(16,21,18,0.75)] transition-transform hover:-translate-y-0.5 hover:bg-black hover:text-white dark:border-[#00C597] dark:bg-[#00C597] dark:text-white dark:hover:bg-[#00ad85] sm:w-auto"
              asChild
            >
              <WhatsAppCtaLink>
                {t.ctaPrimary}
                <ArrowRight className="ml-1 h-4 w-4 shrink-0" />
              </WhatsAppCtaLink>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-[52px] w-full rounded-xl border-[#c9ceca] bg-white/70 px-6 text-sm font-semibold text-[#101512] backdrop-blur-md hover:border-[#101512] hover:bg-white hover:text-[#101512] dark:border-white/25 dark:bg-black/25 dark:text-white dark:hover:border-white/50 dark:hover:bg-black/45 dark:hover:text-white sm:w-auto"
              asChild
            >
              <a href={`#${localizeHash('recursos', locale)}`}>{t.ctaSecondary}</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

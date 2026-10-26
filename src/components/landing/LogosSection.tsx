import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useLocale } from '@/lib/i18n';

const logos = [
  'TechFrio', 'SolarPrime', 'ElétricaMax', 'ConectTelecom', 'SafeGuard CFTV',
  'ClimaTec', 'VoltPower', 'NetLink', 'FrioPro', 'SunTech',
];

export default function LogosSection() {
  const ref = useScrollReveal();
  const { messages } = useLocale();

  return (
    <section className="relative border-y border-[#e3e7e2] bg-white py-16 dark:border-white/5 dark:bg-[#070908]">
      <div ref={ref} className="scroll-reveal">
        <p className="mb-8 text-center text-sm font-semibold uppercase tracking-[0.18em] text-[#6c766f] dark:text-white/60">
          {messages.home.logos.eyebrow}
        </p>
        <div className="overflow-hidden">
          <div className="flex animate-[marquee_30s_linear_infinite] gap-12 w-max">
            {[...logos, ...logos].map((name, i) => (
              <div
                key={i}
                className="flex items-center gap-2 whitespace-nowrap text-[#667169] transition-colors hover:text-[#101512] dark:text-white/50 dark:hover:text-white/80"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#dfe5e0] bg-[#f5f7f4] text-xs font-bold text-[#354039] dark:border-white/10 dark:bg-white/10 dark:text-white/70">
                  {name[0]}
                </div>
                <span className="text-sm font-medium">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

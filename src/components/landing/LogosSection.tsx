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
    <section className="relative py-16 border-y border-white/5">
      <div ref={ref} className="scroll-reveal">
        <p className="text-center text-sm text-white/60 uppercase tracking-widest mb-8">
          {messages.home.logos.eyebrow}
        </p>
        <div className="overflow-hidden">
          <div className="flex animate-[marquee_30s_linear_infinite] gap-12 w-max">
            {[...logos, ...logos].map((name, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-opacity whitespace-nowrap"
              >
                <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center text-xs font-bold text-white/70">
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

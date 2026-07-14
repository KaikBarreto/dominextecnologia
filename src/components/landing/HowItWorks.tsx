import { UserPlus, Send, TrendingUp } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useLocale } from '@/lib/i18n';

const STEP_ICONS = [UserPlus, Send, TrendingUp];
const STEP_NUMS = ['01', '02', '03'];

export default function HowItWorks() {
  const ref = useScrollReveal();
  const t = useLocale().messages.home.howItWorks;
  const steps = t.steps.map((s, i) => ({
    num: STEP_NUMS[i],
    icon: STEP_ICONS[i],
    title: s.title,
    desc: s.desc,
  }));

  return (
    <section id="como-funciona" className="py-24">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-16">
          {t.heading}
        </h2>

        <div className="grid md:grid-cols-3 gap-8 relative">
          <div className="hidden md:block absolute top-24 left-[16.67%] right-[16.67%] h-0.5 bg-gradient-to-r from-primary/0 via-primary/40 to-primary/0" />

          {steps.map((s) => (
            <div key={s.num} className="relative text-center">
              <div className="inline-flex flex-col items-center">
                <span className="text-5xl font-black text-primary/20 mb-4">{s.num}</span>
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 relative z-10">
                  <s.icon className="h-7 w-7 text-primary" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{s.title}</h3>
              <p className="text-sm text-white/55 max-w-xs mx-auto">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

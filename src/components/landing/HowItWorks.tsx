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
    <section id="como-funciona" className="bg-white py-24 dark:bg-[#070908]">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="mb-16 break-words text-center text-3xl font-bold tracking-[-0.025em] text-[#101512] dark:text-white sm:text-4xl">
          {t.heading}
        </h2>

        <div className="grid md:grid-cols-3 gap-8 relative">
          <div className="absolute left-[16.67%] right-[16.67%] top-24 hidden h-px bg-[#dbe2dc] dark:bg-white/10 md:block" />

          {steps.map((s) => (
            <div key={s.num} className="relative text-center">
              <div className="inline-flex flex-col items-center">
                {/* Numeral puramente decorativo (a ordem já está no grid + no
                    título) — aria-hidden tira do leitor de tela em vez de
                    forçar contraste de texto nele. Subimos a opacidade de
                    /20 (1,37:1) pra /[0.55] (~3,32:1) só pra bater o mínimo de
                    texto grande (48px bold, limiar 3:1), sem virar texto
                    "sério" que competiria com o título. */}
                <span className="mb-4 text-5xl font-black text-primary/70" aria-hidden="true">{s.num}</span>
                <div className="relative z-10 mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#dfe5e0] bg-white shadow-sm dark:border-white dark:bg-white dark:shadow-none">
                  <s.icon className="h-7 w-7 text-primary" />
                </div>
              </div>
              <h3 className="mb-2 break-words text-lg font-semibold text-[#101512] dark:text-white">{s.title}</h3>
              <p className="mx-auto max-w-xs text-sm leading-relaxed text-[#657068] dark:text-white/55">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

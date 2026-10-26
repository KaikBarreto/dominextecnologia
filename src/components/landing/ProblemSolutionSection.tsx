import { XCircle, CheckCircle2 } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useLocale } from '@/lib/i18n';

export default function ProblemSolutionSection() {
  const ref = useScrollReveal();
  const t = useLocale().messages.home.problemSolution;
  const problems = t.problems;
  const solutions = t.solutions;

  return (
    <section className="bg-[#f4f6f2] py-24 dark:bg-[#050706]">
      <div ref={ref} className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="overflow-hidden rounded-3xl border border-[#dfe5e0] bg-white shadow-[0_24px_70px_-48px_rgba(16,21,18,0.35)] dark:border-white/10 dark:bg-[#0b0e0c] dark:shadow-none">
          <div className="grid divide-y divide-[#e3e7e2] dark:divide-white/10 md:grid-cols-2 md:divide-x md:divide-y-0">
            <div className="p-8 lg:p-12">
              <div className="mb-7 flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-destructive text-white">
                  <XCircle className="h-6 w-6" />
                </span>
                <h2 className="text-xl font-bold text-[#101512] dark:text-white">
                  {t.problemsTitle}
                </h2>
              </div>
              <ul className="space-y-4">
                {problems.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-[#69736c] dark:text-white/50">
                    <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <span className="text-sm">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-[#fbfcfa] p-8 dark:bg-white/[0.02] lg:p-12">
              <div className="mb-7 flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                  <CheckCircle2 className="h-6 w-6" />
                </span>
                <h2 className="text-xl font-bold text-[#101512] dark:text-white">
                  {t.solutionsTitle}
                </h2>
              </div>
              <ul className="space-y-4">
                {solutions.map((s) => (
                  <li key={s} className="flex items-start gap-3 text-[#354039] dark:text-white/70">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

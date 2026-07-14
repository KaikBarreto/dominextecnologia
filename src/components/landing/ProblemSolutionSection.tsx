import { XCircle, CheckCircle2 } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useLocale } from '@/lib/i18n';

export default function ProblemSolutionSection() {
  const ref = useScrollReveal();
  const t = useLocale().messages.home.problemSolution;
  const problems = t.problems;
  const solutions = t.solutions;

  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="rounded-2xl border border-white/10 bg-[hsl(0,0%,6%)] overflow-hidden">
          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10">
            <div className="p-8 lg:p-12">
              <h2 className="text-xl font-bold text-white mb-6">
                {t.problemsTitle}
              </h2>
              <ul className="space-y-4">
                {problems.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-white/50">
                    <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <span className="text-sm">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-8 lg:p-12">
              <h2 className="text-xl font-bold text-white mb-6">
                {t.solutionsTitle}
              </h2>
              <ul className="space-y-4">
                {solutions.map((s) => (
                  <li key={s} className="flex items-start gap-3 text-white/70">
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

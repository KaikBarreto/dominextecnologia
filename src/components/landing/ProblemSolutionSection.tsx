import { XCircle, CheckCircle2 } from 'lucide-react';

const problems = [
  'OS em papel ou Excel perdido',
  'Técnico sem informação no campo',
  'Cliente ligando "cadê meu técnico?"',
  'Relatórios feitos na mão, horas depois',
  'Sem visibilidade do que está acontecendo agora',
];

const solutions = [
  'OS digital criada em segundos',
  'App para o técnico com tudo que precisa',
  'Rastreamento em tempo real no mapa',
  'Relatórios automáticos ao finalizar',
  'Dashboard com KPIs ao vivo',
];

export default function ProblemSolutionSection() {
  return (
    <section className="py-24 bg-[hsl(0,0%,4%)]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-white/10 bg-[hsl(0,0%,6%)] overflow-hidden">
          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10">
            {/* Problem */}
            <div className="p-8 lg:p-12">
              <h3 className="text-xl font-bold text-white mb-6">
                Sua operação travada no improviso?
              </h3>
              <ul className="space-y-4">
                {problems.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-white/50">
                    <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <span className="text-sm">{p}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Solution */}
            <div className="p-8 lg:p-12">
              <h3 className="text-xl font-bold text-white mb-6">
                Com o Dominex, você tem controle total
              </h3>
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

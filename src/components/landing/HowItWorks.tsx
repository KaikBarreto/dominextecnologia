import { UserPlus, Send, TrendingUp } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const steps = [
  {
    num: '01',
    icon: UserPlus,
    title: 'Cadastre seus clientes e técnicos',
    desc: 'Importe ou cadastre em minutos. Configure grupos, regiões e permissões para cada perfil.',
  },
  {
    num: '02',
    icon: Send,
    title: 'Crie e distribua ordens de serviço',
    desc: 'Abra uma OS em segundos, atribua ao técnico certo e acompanhe em tempo real no painel.',
  },
  {
    num: '03',
    icon: TrendingUp,
    title: 'Analise e cresça',
    desc: 'Relatórios automáticos, avaliações de clientes e métricas de desempenho para decisões mais rápidas.',
  },
];

export default function HowItWorks() {
  const ref = useScrollReveal();

  return (
    <section id="how-it-works" className="py-24 bg-[hsl(0,0%,4%)]">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-16">
          Simples de começar, poderoso para escalar
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
              <p className="text-sm text-white/40 max-w-xs mx-auto">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

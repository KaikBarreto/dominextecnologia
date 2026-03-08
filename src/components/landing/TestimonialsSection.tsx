import { Star } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const testimonials = [
  {
    quote: 'Antes perdíamos 3 horas por dia com relatórios manuais. Hoje fechamos tudo em 15 minutos. Resultado real.',
    name: 'Carlos M.',
    role: 'Gestor de Operações',
    company: 'TechFrio Refrigeração',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face',
  },
  {
    quote: 'A equipe de campo ganhou autonomia e nosso cliente passou a confiar mais no nosso serviço.',
    name: 'Ana P.',
    role: 'Diretora',
    company: 'SolarPrime Instalações',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face',
  },
  {
    quote: 'Em 2 semanas já tínhamos visibilidade total das OS. Nunca mais um chamado perdido.',
    name: 'Roberto L.',
    role: 'Fundador',
    company: 'ElétricaMax',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face',
  },
];

export default function TestimonialsSection() {
  const ref = useScrollReveal();

  return (
    <section className="py-24 bg-[hsl(0,0%,5%)]">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-16">
          Quem usa o Dominex, não volta para o improviso
        </h2>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-8"
            >
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-warning text-warning" />
                ))}
              </div>
              <p className="text-white/70 text-sm leading-relaxed mb-6">"{t.quote}"</p>
              <div className="flex items-center gap-3">
                <img
                  src={t.avatar}
                  alt={t.name}
                  loading="lazy"
                  className="h-10 w-10 rounded-full object-cover"
                />
                <div>
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-xs text-white/40">
                    {t.role} — {t.company}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

import { Star } from 'lucide-react';

const testimonials = [
  {
    quote: 'Antes perdíamos 3 horas por dia com relatórios manuais. Hoje fechamos tudo em 15 minutos. Resultado real.',
    name: 'Carlos M.',
    role: 'Gestor de Operações',
    company: 'TechFrio Refrigeração',
  },
  {
    quote: 'A equipe de campo ganhou autonomia e nosso cliente passou a confiar mais no nosso serviço.',
    name: 'Ana P.',
    role: 'Diretora',
    company: 'SolarPrime Instalações',
  },
  {
    quote: 'Em 2 semanas já tínhamos visibilidade total das OS. Nunca mais um chamado perdido.',
    name: 'Roberto L.',
    role: 'Fundador',
    company: 'ElétricaMax',
  },
];

export default function TestimonialsSection() {
  return (
    <section className="py-24 bg-[hsl(0,0%,5%)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/40 to-primary/10" />
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

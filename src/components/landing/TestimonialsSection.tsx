import { Star } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useLocale } from '@/lib/i18n';

// Nome/empresa/avatar são fixos (nomes próprios/marca fictícia); quote e role
// vêm do i18n por índice (pt-br idêntico ao texto anterior).
const TESTIMONIAL_META = [
  {
    name: 'Carlos M.',
    company: 'TechFrio Refrigeração',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face',
  },
  {
    name: 'Ana P.',
    company: 'SolarPrime Instalações',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face',
  },
  {
    name: 'Roberto L.',
    company: 'ElétricaMax',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face',
  },
];

export default function TestimonialsSection() {
  const ref = useScrollReveal();
  const t = useLocale().messages.home.testimonials;
  const testimonials = TESTIMONIAL_META.map((meta, i) => ({
    ...meta,
    quote: t.items[i].quote,
    role: t.items[i].role,
  }));

  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-16">
          {t.heading}
        </h2>

        <div className="grid gap-6 md:grid-cols-3">
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
                  alt={`Foto de ${t.name}, ${t.role} na ${t.company}`}
                  loading="lazy"
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover"
                />
                <div>
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-xs text-white/55">
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

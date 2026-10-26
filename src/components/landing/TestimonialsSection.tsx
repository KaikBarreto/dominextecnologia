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
    <section className="bg-white py-24 dark:bg-[#070908]">
      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <h2 className="mb-16 text-center text-3xl font-bold tracking-[-0.025em] text-[#101512] dark:text-white sm:text-4xl">
          {t.heading}
        </h2>

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="rounded-2xl border border-[#dfe5e0] bg-[#fbfcfa] p-8 shadow-[0_18px_45px_-38px_rgba(16,21,18,0.45)] dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none"
            >
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-warning text-warning" />
                ))}
              </div>
              <p className="mb-6 text-sm leading-relaxed text-[#455149] dark:text-white/70">"{t.quote}"</p>
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
                  <p className="text-sm font-semibold text-[#101512] dark:text-white">{t.name}</p>
                  <p className="text-xs text-[#69736c] dark:text-white/55">
                    {t.role}, {t.company}
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

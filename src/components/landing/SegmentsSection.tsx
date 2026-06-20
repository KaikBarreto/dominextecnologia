import { Thermometer, Zap, Sun, Radio, Shield, HardHat, Building, Sparkles, Droplets } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

// Para trocar por foto real depois: basta apontar `image` para o asset definitivo
// (ex: '/images/segments/refrigeracao.jpg'). O onError cai no placeholder.svg.
const PLACEHOLDER = '/placeholder.svg';

const segments = [
  { icon: Thermometer, label: 'Refrigeração e Climatização', image: '/images/segments/refrigeracao.jpg' },
  { icon: Zap, label: 'Instalações Elétricas', image: '/images/segments/eletrica.jpg' },
  { icon: Sun, label: 'Energia Solar', image: '/images/segments/solar.jpg' },
  { icon: Radio, label: 'Telecomunicações / Provedores', image: '/images/segments/telecom.jpg' },
  { icon: Shield, label: 'CFTV e Segurança Eletrônica', image: '/images/segments/cftv.jpg' },
  { icon: HardHat, label: 'Construção Civil', image: '/images/segments/construcao.jpg' },
  { icon: Building, label: 'Elevadores', image: '/images/segments/elevadores.jpg' },
  { icon: Sparkles, label: 'Limpeza e Conservação', image: '/images/segments/limpeza.jpg' },
  { icon: Droplets, label: 'Dedetização', image: '/images/segments/dedetizacao.jpg' },
];

// Lista duplicada: a track anda de translateX(0) até -50%, então a 2ª metade
// emenda exatamente onde a 1ª começou — loop infinito sem corte visível.
const marqueeItems = [...segments, ...segments];

export default function SegmentsSection() {
  const ref = useScrollReveal();

  return (
    <section id="segments" className="py-24 overflow-hidden">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          Para qualquer empresa com equipe em campo
        </h2>
        <p className="text-white/40 mb-12">Atendemos diversos segmentos de serviços externos</p>
      </div>

      {/* Carrossel infinito (marquee). Full-bleed: ignora o max-w pra rolar de borda a borda. */}
      <div className="group relative overflow-hidden">
        {/* Fades laterais pra esconder as bordas de entrada/saída dos cards */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[hsl(0,0%,4%)] to-transparent sm:w-24" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[hsl(0,0%,4%)] to-transparent sm:w-24" />

        <ul
          className="flex w-max gap-4 animate-marquee-slow sm:gap-6 md:animate-marquee-mid group-hover:[animation-play-state:paused] motion-reduce:animate-none"
          aria-label="Segmentos atendidos"
        >
          {marqueeItems.map((s, i) => (
            <li
              key={`${s.label}-${i}`}
              aria-hidden={i >= segments.length ? true : undefined}
              className="group/card relative aspect-[4/3] w-72 shrink-0 overflow-hidden rounded-2xl border border-white/10 transition-colors hover:border-primary/40 sm:w-80 lg:w-[26rem]"
            >
              {/* Imagem de fundo */}
              <img
                src={s.image}
                alt={s.label}
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = PLACEHOLDER;
                }}
                className="absolute inset-0 h-full w-full bg-white/[0.03] object-cover transition-transform duration-500 group-hover/card:scale-105"
              />

              {/* Degradê escuro pra leitura do título */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />

              {/* Ícone + título sobre o degradê */}
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-2 p-4 text-left sm:p-5">
                <s.icon className="h-6 w-6 text-primary/80 transition-colors group-hover/card:text-primary" />
                <h3 className="text-lg font-semibold leading-tight text-white sm:text-xl">
                  {s.label}
                </h3>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

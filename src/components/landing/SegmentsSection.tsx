import { Link } from 'react-router-dom';
import { Thermometer, Zap, Sun, Radio, Shield, HardHat, Building, Sparkles, Droplets } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { SEGMENTS } from '@/pages/segmentos/segmentsData';
import { useLocale } from '@/lib/i18n';
import { localizeInternal } from '@/lib/i18n/localizeInternal';

// Para trocar por foto real depois: basta apontar `image` para o asset definitivo
// (ex: '/images/segments/refrigeracao.jpg'). O onError cai no placeholder.svg.
const PLACEHOLDER = '/placeholder.svg';

// Fonte canônica de slug + cor de acento por segmento: SEGMENTS (keyed por slug,
// com `navLabel` espelhando os labels abaixo). Montamos um índice por label pra
// não duplicar slugs/cores aqui — consistência interna com as landings de nicho.
const SEGMENT_BY_LABEL = Object.fromEntries(
  Object.values(SEGMENTS).map((s) => [s.navLabel, { slug: s.slug, color: s.accentColor }]),
) as Record<string, { slug: string; color: string }>;

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
  const { locale, messages } = useLocale();
  const t = messages.home.segments;
  // Label pt-br (s.label) é a CHAVE de lookup de slug/cor (bate com navLabel de
  // SEGMENTS). O texto EXIBIDO sai do i18n por slug (pt-br idêntico ao anterior).
  const displayLabel = (ptLabel: string, slug?: string) =>
    (slug && (messages.segmentLabels as Record<string, string>)[slug]) || ptLabel;

  return (
    <section id="segmentos" className="py-24 overflow-hidden">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 break-words">
          {t.heading}
        </h2>
        <p className="text-white/55 mb-12">{t.subheading}</p>
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
          {marqueeItems.map((s, i) => {
            const meta = SEGMENT_BY_LABEL[s.label];
            const isClone = i >= segments.length;
            const label = displayLabel(s.label, meta?.slug);
            return (
              <li
                key={`${s.label}-${i}`}
                aria-hidden={isClone ? true : undefined}
                className="shrink-0"
              >
                <Link
                  to={meta ? localizeInternal(`/${meta.slug}`, locale) : '#'}
                  // O nome acessível CONTÉM o texto visível (o título s.label),
                  // exigência da regra label-content-name-mismatch do WCAG. O
                  // overlay decorativo "Clique para ver mais" é aria-hidden, logo
                  // não entra no nome — sem mismatch.
                  aria-label={`${label}: ${t.ariaSuffix}`}
                  tabIndex={isClone ? -1 : undefined}
                  className="group/card relative block aspect-[4/3] w-72 cursor-pointer overflow-hidden rounded-2xl border border-white/10 transition-colors hover:border-primary/40 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:w-80 lg:w-[26rem]"
                >
                  {/* Imagem de fundo */}
                  <img
                    src={s.image}
                    alt={`${t.imageAltPrefix} ${label}`}
                    loading="lazy"
                    width={416}
                    height={312}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = PLACEHOLDER;
                    }}
                    className="absolute inset-0 h-full w-full bg-white/[0.03] object-cover transition-transform duration-500 group-hover/card:scale-105"
                  />

                  {/* Degradê escuro pra leitura do título */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />

                  {/* Overlay "Clique para ver mais" — canto inferior direito, só hover/focus no desktop (touch não tem hover).
                      aria-hidden: é dica visual decorativa; sem isso entraria no
                      nome acessível do link e dispararia label-content-name-mismatch. */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-3 right-3 z-10 hidden translate-y-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white opacity-0 shadow-sm shadow-black/40 backdrop-blur-sm transition-all duration-300 group-hover/card:translate-y-0 group-hover/card:opacity-100 group-focus-visible/card:translate-y-0 group-focus-visible/card:opacity-100 sm:block">
                    {t.hoverHint}
                  </div>

                  {/* Ícone (na cor do segmento) + título sobre o degradê */}
                  <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-2 p-4 text-left sm:p-5">
                    <s.icon
                      className="h-6 w-6 transition-transform group-hover/card:scale-110"
                      style={{ color: meta?.color }}
                    />
                    <h3 className="text-lg font-semibold leading-tight text-white sm:text-xl break-words">
                      {label}
                    </h3>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

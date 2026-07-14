import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

/**
 * Seção "deep dive" reutilizável (zigzag de cards com foto + parallax leve).
 * Single source of truth do efeito que nasceu no pilot de refrigeração
 * (SegmentLandingPage). A COR é parametrizada via `accent` (expressão CSS),
 * então a mesma seção serve às landings de SEGMENTO (cor do nicho via
 * `var(--seg-accent)`) e às de MÓDULO (verde de marca via `hsl(var(--primary))`).
 */

export interface DeepDive {
  icon: LucideIcon;
  title: string;
  body: string;
  /** Foto semântica do tema. Sem ela, cai no fallback do ícone gigante. */
  image?: { src: string; alt: string };
}

/**
 * Lê prefers-reduced-motion de forma reativa. Espelha o hook de
 * ScrollSyncFeatures (SSR/prerender-safe: começa em false, só liga no client
 * após o mount, então o 1º render bate com o do servidor).
 */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);
  return reduced;
}

/**
 * Detecta viewport desktop (lg+ = 1024px). Reativo. SSR-safe: começa em false e
 * liga após o mount. Parallax só roda no desktop (mobile-first: zero custo de
 * scroll no celular).
 */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const apply = () => setIsDesktop(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);
  return isDesktop;
}

/** Amplitude do parallax em px (±). Translada dentro da folga do scale do frame. */
const PARALLAX_RANGE = 14;

/**
 * Parallax leve por elemento, no MESMO padrão do projeto (ScrollSyncFeatures):
 * rAF + listeners passivos de scroll/resize, SEM preventDefault, SEM
 * framer-motion, transform direto no DOM. Conforme o frame cruza a viewport
 * (centro do frame indo de baixo→cima), o offset Y vai de +RANGE a -RANGE.
 *
 * - Só age quando `enabled` (desktop && !reduced-motion).
 * - Prerender-safe: começa com offset 0 (transform neutro) no 1º render; o
 *   efeito liga após o mount, então não há divergência SSR↔client.
 */
function useParallaxOffset(
  ref: React.RefObject<HTMLElement>,
  enabled: boolean
) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setOffset(0);
      return;
    }
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // Centro do frame relativo ao centro da viewport, normalizado p/ [-1, 1]:
      // frame no fundo da tela → +1, no topo → -1.
      const frameCenter = rect.top + rect.height / 2;
      const progress = (frameCenter - vh / 2) / (vh / 2 + rect.height / 2);
      const clamped = Math.min(1, Math.max(-1, progress));
      setOffset(clamped * PARALLAX_RANGE);
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    compute();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [ref, enabled]);

  return offset;
}

/**
 * Card de deep-dive (zigzag). Painel-ilustração:
 *  - com `image` → foto semântica do tema, com parallax leve no desktop;
 *  - sem `image` → fallback do ícone gigante esmaecido.
 * A cor (borda, overlay da foto, gradiente/ícone do fallback) vem de `accent`.
 * O chip de ícone do lado do texto preserva o visual de CADA página via
 * `iconChipClassName`/`iconChipStyle` (o ícone herda a cor por currentColor).
 */
function DeepDiveCard({
  dive,
  flip,
  accent,
  iconChipClassName,
  iconChipStyle,
}: {
  dive: DeepDive;
  flip: boolean;
  accent: string;
  iconChipClassName: string;
  iconChipStyle?: CSSProperties;
}) {
  const Icon = dive.icon;
  const reduced = usePrefersReducedMotion();
  const isDesktop = useIsDesktop();
  const parallaxEnabled = Boolean(dive.image) && isDesktop && !reduced;

  const frameRef = useRef<HTMLDivElement>(null);
  const offset = useParallaxOffset(frameRef, parallaxEnabled);

  return (
    <div
      className={`grid lg:grid-cols-12 gap-8 items-center rounded-2xl border border-white/10 bg-white/[0.02] p-8 lg:p-12 ${
        flip ? 'lg:[&>*:first-child]:order-2' : ''
      }`}
    >
      <div className="min-w-0 lg:col-span-7">
        <div
          className={`inline-flex h-14 w-14 items-center justify-center rounded-xl mb-6 ${iconChipClassName}`}
          style={iconChipStyle}
        >
          <Icon className="h-7 w-7" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight break-words">{dive.title}</h2>
        <p className="text-white/55 text-base leading-relaxed break-words">{dive.body}</p>
      </div>
      <div className="lg:col-span-5">
        {dive.image ? (
          <div
            ref={frameRef}
            className="relative aspect-[4/3] rounded-xl overflow-hidden border"
            style={{
              borderColor: `color-mix(in srgb, ${accent} 22%, hsl(0 0% 100% / 0.08))`,
            }}
          >
            {/* img maior que o frame (h-[115%], -top-[7.5%]) pra a folga absorver o
                translate sem abrir buraco branco nas bordas. width/height
                intrínsecos fixos = ZERO layout shift. transform neutro no 1º
                render; o parallax liga após o mount (prerender-safe). */}
            <img
              src={dive.image.src}
              alt={dive.image.alt}
              width={1200}
              height={900}
              loading="lazy"
              decoding="async"
              className="absolute inset-x-0 -top-[7.5%] h-[115%] w-full object-cover"
              style={{
                transform: `translate3d(0, ${offset}px, 0)`,
                willChange: parallaxEnabled ? 'transform' : undefined,
              }}
            />
            {/* Overlay do acento pra integrar a foto à paleta. */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: `linear-gradient(to bottom right, color-mix(in srgb, ${accent} 18%, transparent), transparent 60%)`,
              }}
            />
          </div>
        ) : (
          <div
            className="aspect-[4/3] rounded-xl border border-white/10 flex items-center justify-center"
            style={{
              backgroundImage: `linear-gradient(to bottom right, color-mix(in srgb, ${accent} 7%, transparent), transparent)`,
            }}
          >
            <Icon
              className="h-20 w-20"
              style={{ color: `color-mix(in srgb, ${accent} 30%, transparent)` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Seção de deep dives. Renderiza um zigzag de `DeepDiveCard` (par/ímpar alterna
 * o lado da ilustração). `accent` é uma expressão CSS de cor aplicada a TODOS os
 * usos de acento do card. O chip de ícone preserva o visual de cada página via
 * `iconChipClassName`/`iconChipStyle`.
 */
export default function DeepDiveSection({
  dives,
  accent,
  iconChipClassName,
  iconChipStyle,
}: {
  dives: DeepDive[];
  accent: string;
  iconChipClassName: string;
  iconChipStyle?: CSSProperties;
}) {
  const ref = useScrollReveal();
  return (
    <section className="py-24">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-6 scroll-reveal">
        {dives.map((d, i) => (
          <DeepDiveCard
            key={d.title}
            dive={d}
            flip={i % 2 === 1}
            accent={accent}
            iconChipClassName={iconChipClassName}
            iconChipStyle={iconChipStyle}
          />
        ))}
      </div>
    </section>
  );
}

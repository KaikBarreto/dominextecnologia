import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type LucideIcon,
} from 'react';

/**
 * Seção de funcionalidades estilo SEMRUSH (scroll-sync), extraída de
 * SegmentLandingPage para reuso na home e nas landings de segmento.
 *
 * DESKTOP (lg+): "pin-scroll". A seção PRENDE na viewport e, conforme o usuário
 * rola DENTRO de um container alto, troca o recurso ativo um a um; ao passar de
 * todos, libera o scroll e a página continua. Implementado SEM sequestrar o
 * wheel (nada de preventDefault) — só um container alto + inner sticky. O scroll
 * nativo/trackpad continua funcionando.
 *
 * MOBILE (<lg): lista empilhada, scroll normal, ativo = card mais próximo do
 * centro do viewport (sem pin).
 *
 * Acessibilidade: respeita prefers-reduced-motion (cai no modo sem pin, lista
 * normal com ativo por centro).
 *
 * Prerender-safe: TODO o conteúdo (todos os títulos + descrições) existe no DOM
 * desde o início. O "ativo" é puramente visual (opacidade/realce), nunca
 * renderização condicional.
 *
 * Acento: usa `var(--seg-accent)` com fallback pro verde de marca Dominex —
 * funciona em segmento (que define --seg-accent) e na home (que não define,
 * caindo no verde).
 */

/** Verde de marca Dominex (#00C597) — fallback quando --seg-accent não existe. */
const BRAND_ACCENT_FALLBACK = '#00C597';

/** Resolve a cor de acento: o token do segmento OU o verde de marca. */
const ACCENT = `var(--seg-accent, ${BRAND_ACCENT_FALLBACK})`;

/** Degradê do acento usado nos tiles (espelha SEG_ACCENT_BADGE_GRADIENT). */
const ACCENT_GRADIENT = `linear-gradient(to right, color-mix(in srgb, ${ACCENT} 85%, #000), color-mix(in srgb, color-mix(in srgb, ${ACCENT} 55%, #ffffff) 85%, #000))`;

export interface ScrollSyncFeature {
  icon: LucideIcon;
  title: string;
  /** Descrição da funcionalidade. */
  description: string;
}

interface ScrollSyncFeaturesProps {
  features: ScrollSyncFeature[];
  heading: string;
  subheading: string;
  /** Slot opcional embaixo (ex: CTA). Renderizado centralizado. */
  footer?: React.ReactNode;
  /** id da <section> (ex: "recursos" pra ancorar o menu). */
  sectionId?: string;
}

/**
 * Lê prefers-reduced-motion de forma reativa (SSR/prerender-safe: começa em
 * false, só liga no client após o mount).
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
 * Detecta se estamos em viewport desktop (lg+ = 1024px). Reativo. SSR-safe:
 * começa em false e liga após mount.
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

/**
 * PIN-SCROLL (desktop). Recebe o ref do container ALTO (height ≈ (N+1)*100vh).
 * Conforme ele cruza a viewport, calcula o progresso 0→1 e mapeia pro índice
 * ativo 0→N-1. Usa rAF pra throttle. Só ativo quando `enabled` (desktop &&
 * !reduced-motion).
 */
function usePinScrollActiveIndex(
  containerRef: React.RefObject<HTMLElement>,
  count: number,
  enabled: boolean
) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!enabled || count <= 1) {
      setActive(0);
      return;
    }
    const el = containerRef.current;
    if (!el) return;

    let raf = 0;
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // Altura "rolável" dentro do container = altura total menos a janela
      // (o inner sticky ocupa 1 viewport). Quando rect.top vai de 0 a
      // -(scrollable), o progresso vai de 0 a 1.
      const scrollable = rect.height - vh;
      if (scrollable <= 0) {
        setActive(0);
        return;
      }
      const progress = Math.min(1, Math.max(0, -rect.top / scrollable));
      // Mapeia progresso → índice. Divide a barra em N faixas iguais.
      const idx = Math.min(count - 1, Math.floor(progress * count));
      setActive(idx);
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
  }, [containerRef, count, enabled]);

  return active;
}

/**
 * Scroll-sync por CENTRO do viewport (mobile e fallback reduced-motion). Mede
 * qual item está mais perto do centro real da tela. rAF-throttled.
 */
function useCenterActiveIndex(count: number, enabled: boolean) {
  const [active, setActive] = useState(0);
  const itemsRef = useRef<Array<HTMLElement | null>>([]);

  const setItemRef = (i: number) => (el: HTMLElement | null) => {
    itemsRef.current[i] = el;
  };

  useEffect(() => {
    if (!enabled) return;
    const els = itemsRef.current.filter(Boolean) as HTMLElement[];
    if (els.length === 0) return;

    let raf = 0;
    const pick = () => {
      const viewportCenter = window.innerHeight / 2;
      let best = 0;
      let bestDist = Infinity;
      itemsRef.current.forEach((el, i) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const dist = Math.abs(center - viewportCenter);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      setActive(best);
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(pick);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    pick();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [count, enabled]);

  return { active, setItemRef };
}

export default function ScrollSyncFeatures({
  features,
  heading,
  subheading,
  footer,
  sectionId,
}: ScrollSyncFeaturesProps) {
  const reduced = usePrefersReducedMotion();
  const isDesktop = useIsDesktop();

  // Pin só no desktop e sem reduced-motion. Senão, desktop cai no modo
  // "center" (sticky simples sem pin) — comportamento legado.
  const pinEnabled = isDesktop && !reduced;

  const tallRef = useRef<HTMLDivElement>(null);
  const pinActive = usePinScrollActiveIndex(tallRef, features.length, pinEnabled);

  // Fallback de centro: vale pro mobile sempre, e pro desktop quando o pin está
  // desligado (reduced-motion). Mantém refs próprios pra medição por rect.
  const { active: centerActive, setItemRef } = useCenterActiveIndex(
    features.length,
    !pinEnabled
  );

  return (
    <section id={sectionId} className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 lg:mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{heading}</h2>
          <p className="text-white/40 max-w-2xl mx-auto">{subheading}</p>
        </div>

        {/* ----------------------------- DESKTOP -----------------------------
            Pin-scroll: container ALTO (N+1 viewports) envolvendo um inner
            sticky (top:0, h-screen, centralizado). O índice ativo vem do
            progresso do scroll DENTRO do container. Quando reduced-motion, o
            container alto vira altura normal (sem pin) e o ativo vem do centro.

            TODO o conteúdo (títulos + descrições) existe no DOM sempre. */}
        <div
          ref={tallRef}
          className="hidden lg:block relative"
          style={
            pinEnabled
              ? ({ height: `${(features.length + 1) * 100}vh` } as CSSProperties)
              : undefined
          }
        >
          <div
            className={
              pinEnabled
                ? 'sticky top-0 h-screen flex items-center'
                : 'sticky top-28'
            }
          >
            <DesktopGrid
              features={features}
              active={pinEnabled ? pinActive : centerActive}
              // Sem pin (reduced-motion), precisamos medir cada título pelo centro.
              setItemRef={pinEnabled ? undefined : setItemRef}
            />
          </div>
        </div>

        {/* ------------------------------ MOBILE ----------------------------- */}
        <MobileList
          features={features}
          active={centerActive}
          setItemRef={setItemRef}
        />

        {footer ? <div className="flex justify-center mt-12">{footer}</div> : null}
      </div>
    </section>
  );
}

/* ----------------------------- Desktop grid ------------------------------- */

function DesktopGrid({
  features,
  active,
  setItemRef,
}: {
  features: ScrollSyncFeature[];
  active: number;
  setItemRef?: (i: number) => (el: HTMLElement | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-12 xl:gap-16 items-center w-full">
      {/* Coluna de títulos */}
      <ul className="space-y-2">
        {features.map((f, i) => {
          const Icon = f.icon;
          const isActive = i === active;
          return (
            <li key={f.title} ref={setItemRef ? setItemRef(i) : undefined}>
              <div
                className="flex items-center gap-4 rounded-2xl px-5 py-4 transition-all duration-300"
                style={
                  isActive
                    ? {
                        backgroundImage: ACCENT_GRADIENT,
                        boxShadow: `0 12px 32px -14px color-mix(in srgb, ${ACCENT} 70%, transparent)`,
                      }
                    : undefined
                }
              >
                {/* Ícone SOLTO — sem chip/tile atrás em nenhum estado. */}
                <Icon
                  className="h-6 w-6 shrink-0 transition-colors duration-300"
                  style={{
                    color: isActive
                      ? '#fff'
                      : `color-mix(in srgb, ${ACCENT} 55%, #9ca3af)`,
                  }}
                />
                <h3
                  className="text-lg font-bold transition-colors duration-300"
                  style={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.32)' }}
                >
                  {f.title}
                </h3>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Coluna de descrição — todas no DOM, só a ativa opaca (grid 1x1). */}
      <div
        className="relative rounded-3xl border p-10 min-h-[20rem] flex items-center"
        style={{
          borderColor: `color-mix(in srgb, ${ACCENT} 22%, hsl(0 0% 100% / 0.08))`,
          backgroundColor: 'hsl(0,0%,6%)',
          backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${ACCENT} 12%, transparent), transparent 65%)`,
        }}
      >
        <div
          className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full opacity-40 blur-3xl"
          style={{ backgroundColor: `color-mix(in srgb, ${ACCENT} 30%, transparent)` }}
          aria-hidden="true"
        />
        <div className="relative grid">
          {features.map((f, i) => {
            const Icon = f.icon;
            const isActive = i === active;
            return (
              <div
                key={f.title}
                className="col-start-1 row-start-1 transition-opacity duration-500"
                style={{ opacity: isActive ? 1 : 0 }}
                aria-hidden={!isActive}
              >
                {/* Ícone SOLTO também no painel de descrição (sem quadrado). */}
                <Icon
                  className="h-10 w-10 mb-6"
                  style={{ color: ACCENT }}
                />
                <h3 className="text-2xl font-bold text-white mb-4">{f.title}</h3>
                <p className="text-white/60 text-base leading-relaxed">
                  {f.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Mobile list ------------------------------ */

function MobileList({
  features,
  active,
  setItemRef,
}: {
  features: ScrollSyncFeature[];
  active: number;
  setItemRef: (i: number) => (el: HTMLElement | null) => void;
}) {
  return (
    <div className="lg:hidden space-y-4">
      {features.map((f, i) => {
        const Icon = f.icon;
        const isActive = i === active;
        return (
          <div
            key={f.title}
            ref={setItemRef(i)}
            className="rounded-2xl border p-5 transition-all duration-300"
            style={{
              borderColor: isActive
                ? `color-mix(in srgb, ${ACCENT} 40%, transparent)`
                : 'hsl(0 0% 100% / 0.08)',
              backgroundColor: 'hsl(0,0%,6%)',
              backgroundImage: isActive
                ? `linear-gradient(135deg, color-mix(in srgb, ${ACCENT} 14%, transparent), transparent 65%)`
                : 'none',
              opacity: isActive ? 1 : 0.45,
            }}
          >
            <div className="flex items-start gap-4">
              {/* Ícone SOLTO — sem quadrado de fundo em nenhum estado. */}
              <Icon
                className="h-7 w-7 shrink-0 mt-0.5 transition-colors duration-300"
                style={{
                  color: isActive
                    ? '#fff'
                    : `color-mix(in srgb, ${ACCENT} 60%, #9ca3af)`,
                }}
              />
              <div>
                <h3 className="text-base font-bold text-white mb-1.5">{f.title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">
                  {f.description}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

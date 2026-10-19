import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScrollEdges {
  /** Rolado até o topo (nada acima). */
  atTop: boolean;
  /** Rolado até o fim (nada abaixo). */
  atBottom: boolean;
  /** O conteúdo é maior que o container (há o que rolar). */
  hasOverflow: boolean;
}

const EDGE_TOLERANCE_PX = 2;

/**
 * Observa as bordas de rolagem vertical de um elemento (local, só pra uso do
 * `PdvScrollFadeContainer` abaixo — fica DENTRO deste arquivo de propósito,
 * não em `src/hooks/`, porque o escopo deste Dev é só `src/components/pdv/`
 * e `src/lib/pdv/`). Porta do `useScrollEdges` da EcoSistema.
 */
function useScrollEdges<T extends HTMLElement>(deps: unknown[]): {
  ref: React.RefObject<T>;
  edges: ScrollEdges;
  recompute: () => void;
} {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState<ScrollEdges>({ atTop: true, atBottom: true, hasOverflow: false });

  const recompute = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const hasOverflow = scrollHeight - clientHeight > EDGE_TOLERANCE_PX;
    const atTop = scrollTop <= EDGE_TOLERANCE_PX;
    const atBottom = scrollTop + clientHeight >= scrollHeight - EDGE_TOLERANCE_PX;
    setEdges((prev) =>
      prev.atTop === atTop && prev.atBottom === atBottom && prev.hasOverflow === hasOverflow
        ? prev
        : { atTop, atBottom, hasOverflow },
    );
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(recompute, deps);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('scroll', recompute, { passive: true });
    window.addEventListener('resize', recompute);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(recompute);
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    recompute();
    return () => {
      el.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
      ro?.disconnect();
    };
  }, [recompute]);

  return { ref, edges, recompute };
}

interface PdvScrollFadeContainerProps {
  /** Conteúdo rolável (a tabela de itens do carrinho). */
  children: React.ReactNode;
  /** Dependências que disparam recálculo das bordas (ex: contagem de itens). */
  recomputeDeps?: unknown[];
  /** Classes do container de scroll (altura fixa, etc). */
  className?: string;
  /** Editor inline aberto: mantém o conteúdo totalmente opaco durante a edição. */
  fadeDisabled?: boolean;
  /** Evento de adição: cada chave nova leva a lista ao item mais recente no fim. */
  scrollToEndKey?: number;
}

/**
 * Envolve uma lista rolável e mostra FADE nas bordas (topo/baixo) quando há
 * conteúdo escondido, com um chevron sutil embaixo sinalizando "tem mais,
 * role" — no molde do `ScrollFadeContainer` da EcoSistema (telas de
 * Compra/Venda, "Itens do Pedido"), pedido do CEO 2026-10-19.
 *
 * NÃO existe botão "ver mais" explícito nem na EcoSistema nem aqui: o
 * fade + chevron JÁ É o gesto — o conteúdo rola por dentro da altura fixa
 * pra sempre, sem nunca crescer. Isso resolve de graça a preocupação
 * "expandir não pode voltar a fazer a tela crescer sem fim": não tem
 * expandir, só scroll.
 *
 * FADE POR `mask-image` (régua da casa), NÃO por `from-background`/gradiente
 * de cor: `from-background` pressupõe UMA cor de fundo fixa por baixo e
 * quebra quando a superfície muda (já quebrou dentro de modal no
 * `MobilePillTabs`) — aqui o bloco do carrinho está sobre `bg-card`, não
 * `bg-background`. `mask-image` desvanece a OPACIDADE do conteúdo em si,
 * então funciona em cima de qualquer cor de fundo sem precisar saber qual é.
 */
export function PdvScrollFadeContainer({
  children,
  recomputeDeps = [],
  className,
  fadeDisabled = false,
  scrollToEndKey,
}: PdvScrollFadeContainerProps) {
  const { ref, edges, recompute } = useScrollEdges<HTMLDivElement>(recomputeDeps);
  const { atTop, atBottom, hasOverflow } = edges;
  const lastHandledScrollKeyRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (scrollToEndKey == null || lastHandledScrollKeyRef.current === scrollToEndKey) return;
    lastHandledScrollKeyRef.current = scrollToEndKey;

    const frame = window.requestAnimationFrame(() => {
      const element = ref.current;
      if (!element) return;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      if (typeof element.scrollTo === 'function') {
        element.scrollTo({ top: element.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
      } else {
        element.scrollTop = element.scrollHeight;
      }
      recompute();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [recompute, ref, scrollToEndKey]);

  const showTopFade = !fadeDisabled && hasOverflow && !atTop;
  const showBottomFade = !fadeDisabled && hasOverflow && !atBottom;

  // Máscara combinada: cada borda vira opaca→transparente só quando o fade
  // daquele lado está ativo (black = mostra, transparent = esconde). Quando
  // nenhum fade está ativo, a máscara é 100% opaca (nada escondido).
  const FADE_SIZE = '28px';
  const stops = [
    showTopFade ? 'transparent 0' : 'black 0',
    ...(showTopFade ? [`black ${FADE_SIZE}`] : []),
    ...(showBottomFade ? [`black calc(100% - ${FADE_SIZE})`] : []),
    showBottomFade ? 'transparent 100%' : 'black 100%',
  ];
  const maskImage = `linear-gradient(to bottom, ${stops.join(', ')})`;

  return (
    // `className` (ex: `flex-1 min-h-0` do chamador) vai no WRAPPER raiz, não
    // no filho — bug medido 2026-10-19: `flex-1` só tem efeito dentro de um
    // pai `display:flex`; postado um nível abaixo (no filho "overflow-y-auto"
    // dentro de um `relative` comum, SEM `display:flex`), virava no-op e o
    // container nunca ficava limitado, crescendo sempre com o conteúdo —
    // scrollHeight==clientHeight sempre, fade/chevron nunca apareciam.
    <div className={cn('relative min-h-0', className)}>
      <div
        ref={ref}
        className="h-full overflow-y-auto"
        style={{
          WebkitMaskImage: maskImage,
          maskImage,
        }}
      >
        {children}
      </div>

      {showBottomFade && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex h-5 items-end justify-center pb-0.5"
        >
          <ChevronDown className="h-3.5 w-3.5 animate-bounce text-muted-foreground/70" strokeWidth={2.5} />
        </div>
      )}
    </div>
  );
}

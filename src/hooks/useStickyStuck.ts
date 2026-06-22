import { useEffect, useRef, useState } from 'react';

/**
 * Detecta quando um cabeçalho `position: sticky` está "grudado" (stuck) no topo,
 * via um SENTINEL de 0px renderizado LOGO ACIMA do cabeçalho + IntersectionObserver.
 *
 * Ideia: o sentinel ocupa o lugar do cabeçalho no fluxo normal. Enquanto ele está
 * visível na viewport, o cabeçalho ainda NÃO grudou (rola junto). Quando o sentinel
 * sai por cima (interseção 0), o cabeçalho passou a ficar fixo no topo → stuck.
 *
 * Por que não `:stuck` (CSS)? Suporte praticamente nulo nos navegadores em campo.
 *
 * Uso:
 *   const { sentinelRef, isStuck } = useStickyStuck(topPx);
 *   ...
 *   <div ref={sentinelRef} aria-hidden className="h-0" />   // logo antes do header
 *   <Header className={isStuck ? 'shadow-lg' : ''} style={{ top: topPx }} />
 *
 * - `enabled=false` (ex.: sem sticky / impressão) → nunca observa, isStuck=false.
 * - `topPx` entra como `rootMargin` negativo no topo pra a interseção disparar
 *   exatamente quando o sentinel cruza a linha do header fixo da tela (não o 0 da
 *   viewport).
 */
export function useStickyStuck(topPx: number | undefined) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  const enabled = topPx !== undefined;

  useEffect(() => {
    if (!enabled) {
      setIsStuck(false);
      return;
    }
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Sentinel saiu da viewport por cima (acima da linha do header fixo) →
        // cabeçalho grudou. `boundingClientRect.top < topPx` confirma que saiu por
        // CIMA (e não por baixo, que não acontece aqui mas é defensivo).
        setIsStuck(!entry.isIntersecting && entry.boundingClientRect.top < (topPx ?? 0));
      },
      // Margem negativa no topo = a linha de disparo é a base do header fixo.
      { threshold: [0], rootMargin: `-${topPx ?? 0}px 0px 0px 0px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, topPx]);

  return { sentinelRef, isStuck };
}

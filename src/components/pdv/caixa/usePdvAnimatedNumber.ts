import { useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION_MS = 700;

/**
 * Interpola do valor atualmente exibido ate o proximo alvo.
 *
 * Diferente do `useCountUp` legado do dashboard, a origem nao volta para zero
 * a cada atualizacao. Assim uma venda conta para cima e uma sangria/estorno
 * conta para baixo, deixando visualmente claro o sentido da mudanca.
 */
export function usePdvAnimatedNumber(target: number, duration = DEFAULT_DURATION_MS) {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [displayed, setDisplayed] = useState(0);
  const displayedRef = useRef(0);

  useEffect(() => {
    const setExact = () => {
      displayedRef.current = safeTarget;
      setDisplayed(safeTarget);
    };

    if (
      typeof window === 'undefined'
      || typeof window.requestAnimationFrame !== 'function'
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      || duration <= 0
    ) {
      setExact();
      return;
    }

    const start = displayedRef.current;
    const delta = safeTarget - start;
    if (delta === 0) return;

    let frame = 0;
    let startedAt: number | null = null;

    const tick = (now: number) => {
      if (startedAt == null) startedAt = now;
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = start + delta * eased;

      displayedRef.current = next;
      setDisplayed(next);

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        setExact();
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, safeTarget]);

  return displayed;
}

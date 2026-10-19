import { useLayoutEffect, useRef, useState } from 'react';
import { truncateForTwoLines } from '@/lib/pdv/truncateMiddle';
import { cn } from '@/lib/utils';

interface PdvProductNameProps {
  name: string;
  className?: string;
}

/**
 * Nome do produto em até 2 LINHAS, usando a LARGURA REAL do container antes
 * de decidir cortar (correção 2026-10-19: a 1ª versão usava um orçamento de
 * caractere fixo — "Capacitor de partida 35uF" saía cortado pra "Capaci…35uF"
 * mesmo em card com 200px+ de sobra). Nome curto ou médio aparece INTEIRO,
 * quebrando em 1 ou 2 linhas normalmente; só corta no MEIO (`truncateMiddle`,
 * via `truncateForTwoLines`) quando de fato não cabe em 2 linhas na largura
 * medida — e aí preserva o FIM do nome, onde mora a medida que distingue um
 * item do outro ("35uF" x "45uF").
 *
 * Altura RESERVADA pra 2 linhas SEMPRE (`min-h` no `className` do chamador),
 * mesmo quando o nome cabe em 1 — senão nome curto ao lado de nome longo
 * deixa a grade serrilhada (cards de altura diferente lado a lado).
 */
export function PdvProductName({ name, className }: PdvProductNameProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(name);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    function recompute() {
      if (!el) return;
      const width = el.clientWidth;
      const font = typeof window !== 'undefined' ? window.getComputedStyle(el).font : '';
      setDisplay(truncateForTwoLines(name, width, font));
    }

    recompute();

    // `ResizeObserver` pode não existir (ambiente de teste/SSR) — degrada
    // graciosamente pra só a medição inicial, sem recalcular em resize.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [name]);

  return (
    <span ref={ref} title={name} className={cn('line-clamp-2 break-words', className)}>
      {display}
    </span>
  );
}

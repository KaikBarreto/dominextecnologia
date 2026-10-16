import { useEffect, useRef, useState } from 'react';

import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface OptimisticProgressProps {
  /** Enquanto true, a barra avança sozinha. Ao virar false, completa e some. */
  active: boolean;
  label?: string;
  className?: string;
  /** Segundos em que a curva atinge ~63%. Ajuste pela duração típica da espera. */
  halfLifeSeconds?: number;
}

/**
 * Barra de progresso otimista para espera de duração desconhecida.
 *
 * A curva é `teto * (1 - e^-(t/k)²)`: começa devagar (o expoente é quadrático,
 * então nos primeiros instantes quase não anda), acelera no meio e desacelera
 * ao se aproximar do teto.
 *
 * O teto é 92%, nunca 100%, e isso é deliberado: se a barra encher antes da
 * resposta chegar, ela fica parada em 100% enquanto nada acontece, que é a
 * sensação exata de travado. Os 8% que faltam só são preenchidos quando a
 * resposta chega de verdade, e aí o salto para 100% é a confirmação visual.
 */
export function OptimisticProgress({
  active,
  label,
  className,
  halfLifeSeconds = 6,
}: OptimisticProgressProps) {
  const [value, setValue] = useState(0);
  const [visible, setVisible] = useState(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (active) {
      setVisible(true);
      startedAt.current = Date.now();
      setValue(0);
      const timer = window.setInterval(() => {
        const elapsed = (Date.now() - (startedAt.current ?? Date.now())) / 1000;
        const ratio = elapsed / Math.max(0.5, halfLifeSeconds);
        setValue(92 * (1 - Math.exp(-(ratio * ratio))));
      }, 90);
      return () => window.clearInterval(timer);
    }

    if (!visible) return;
    // Terminou: completa e deixa o 100% respirar antes de sumir, senão o
    // usuário não chega a ver que a barra fechou.
    setValue(100);
    const timer = window.setTimeout(() => setVisible(false), 450);
    return () => window.clearTimeout(timer);
    // `visible` fora das deps de propósito: ele só decide se há o que limpar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, halfLifeSeconds]);

  if (!visible) return null;

  return (
    <div className={cn('space-y-1.5', className)} role="status" aria-live="polite">
      <Progress value={value} className="h-1.5" />
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
    </div>
  );
}

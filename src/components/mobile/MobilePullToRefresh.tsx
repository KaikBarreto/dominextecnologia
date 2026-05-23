import { useRef, useState, useCallback, type ReactNode } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobilePullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  /** Distância de pull necessária pra disparar refresh (default 70px) */
  threshold?: number;
  /** Distância máxima visível durante pull (default 100px) */
  maxPull?: number;
  /** Se desabilitado, comporta como passthrough (útil pra desktop). */
  disabled?: boolean;
  className?: string;
}

/**
 * Pull-to-refresh nativo-like pra mobile. Detecta swipe down no topo
 * da página, mostra spinner que cresce com o pull, dispara onRefresh
 * ao soltar passado o threshold.
 *
 * Requer que o container scrollável esteja em `window` ou o elemento
 * pai aceite o gesto (a maioria das pages do projeto rola no <main>
 * do AppLayout, que é onde isso é aplicado).
 */
export function MobilePullToRefresh({
  onRefresh,
  children,
  threshold = 70,
  maxPull = 100,
  disabled = false,
  className,
}: MobilePullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const isPullingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || isRefreshing) return;
      const scrollEl = containerRef.current;
      // Só inicia se o usuário está no topo do scroll
      if (scrollEl && scrollEl.scrollTop > 0) return;
      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    },
    [disabled, isRefreshing],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isPullingRef.current || disabled || isRefreshing) return;
      const currentY = e.touches[0].clientY;
      const delta = currentY - startYRef.current;
      if (delta > 0) {
        // Resistência: pull é mais lento que o dedo
        const resisted = Math.min(delta * 0.5, maxPull);
        setPullDistance(resisted);
      } else if (delta < 0) {
        // Reseta se voltou pra cima
        setPullDistance(0);
        isPullingRef.current = false;
      }
    },
    [disabled, isRefreshing, maxPull],
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current || disabled || isRefreshing) {
      setPullDistance(0);
      isPullingRef.current = false;
      return;
    }
    isPullingRef.current = false;
    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      const startTime = Date.now();
      const MIN_VISIBLE_MS = 800; // garante que spinner é perceptível mesmo se refresh for instantâneo
      try {
        await onRefresh();
      } finally {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(MIN_VISIBLE_MS - elapsed, 0);
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        }, remaining + 200);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, threshold, onRefresh, disabled, isRefreshing]);

  const showFullSpinner = isRefreshing;
  const progress = Math.min(pullDistance / threshold, 1);

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={cn('relative overflow-y-auto', className)}
      style={{ touchAction: pullDistance > 0 ? 'none' : 'pan-y' }}
    >
      {/* Indicador de pull */}
      <div
        className={cn(
          'pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-center transition-opacity',
          (pullDistance > 0 || isRefreshing) ? 'opacity-100' : 'opacity-0',
        )}
        style={{ height: showFullSpinner ? 56 : pullDistance, transition: isRefreshing ? 'height 200ms ease-out' : 'none' }}
      >
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full bg-card border shadow-md',
          )}
          style={{
            transform: isRefreshing ? 'rotate(0deg)' : `rotate(${progress * 180}deg) scale(${0.6 + progress * 0.4})`,
            transition: isRefreshing ? 'transform 200ms ease-out' : 'none',
          }}
        >
          {isRefreshing ? (
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          ) : (
            <ArrowDown
              className={cn('h-5 w-5', progress >= 1 ? 'text-primary' : 'text-muted-foreground')}
            />
          )}
        </div>
      </div>

      {/* Conteúdo — translada pra baixo conforme o pull */}
      <div
        style={{
          transform: `translateY(${showFullSpinner ? 56 : pullDistance}px)`,
          transition: isPullingRef.current ? 'none' : 'transform 200ms ease-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}

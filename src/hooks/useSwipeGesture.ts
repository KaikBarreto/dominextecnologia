import { useRef } from 'react';

// Hook genérico de swipe lateral (touch).
// Usado na Agenda mobile pra trocar Dia/Semana com gesto de varrer pra esquerda/direita.
// Ignora movimentos predominantemente verticais (scroll) e movimentos abaixo do threshold.

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

// Deslocamento horizontal mínimo (px) pra considerar swipe.
const SWIPE_THRESHOLD = 50;

export function useSwipeGesture({ onSwipeLeft, onSwipeRight }: SwipeHandlers) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;

    // Se o usuário moveu mais vertical que horizontal, é scroll — ignora.
    if (Math.abs(dy) > Math.abs(dx)) return;
    // Abaixo do threshold é tap acidental — ignora.
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;

    if (dx < 0) onSwipeLeft?.();
    else onSwipeRight?.();
  };

  return { onTouchStart: handleTouchStart, onTouchEnd: handleTouchEnd };
}

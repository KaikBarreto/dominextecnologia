import { useState, useCallback } from 'react';

/**
 * Simple "tap to pick, tap to drop" drag & drop for mobile.
 * - Long press or tap on a card picks it up (sets movingOrderId)
 * - Tapping on a time slot drops it there
 * - Tapping the same card or pressing cancel clears it
 */
export function useTouchDragDrop(onDrop: (orderId: string, date: string, time: string) => void) {
  const [movingOrderId, setMovingOrderId] = useState<string | null>(null);

  const pickUp = useCallback((orderId: string) => {
    setMovingOrderId((prev) => (prev === orderId ? null : orderId));
  }, []);

  const dropOn = useCallback(
    (date: string, time: string) => {
      if (movingOrderId) {
        onDrop(movingOrderId, date, time);
        setMovingOrderId(null);
      }
    },
    [movingOrderId, onDrop]
  );

  const cancel = useCallback(() => {
    setMovingOrderId(null);
  }, []);

  return { movingOrderId, pickUp, dropOn, cancel };
}

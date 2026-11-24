import { useEffect, useRef, useState } from 'react';

/** Resolve a entrada uma vez; um pedido explícito não pode cair no caixa próprio. */
export function useInitialCashSelection({ ownerKey, ready, ownSessionId, onSelect, requestedTarget }: {
  ownerKey: string | null; ready: boolean; ownSessionId: string | null;
  onSelect: (id: string) => void;
  requestedTarget?: { key: string; status: 'pending' | 'ready' | 'unavailable'; sessionId: string | null } | null;
}) {
  const signature = JSON.stringify([ownerKey, ready]);
  const current = useRef<{ signature: string; epoch: string } | null>(null);
  if (!current.current || current.current.signature !== signature) current.current = { signature, epoch: crypto.randomUUID() };
  const epoch = current.current.epoch;
  const [resolved, setResolved] = useState<{ epoch: string; requestKey: string | null; sessionId: string } | null>(null);
  const initialized = resolved?.epoch === epoch;
  const handledRequest = initialized && resolved.requestKey === requestedTarget?.key;
  const targetChanged = Boolean(handledRequest && requestedTarget?.status === 'ready' && requestedTarget.sessionId !== resolved.sessionId);
  useEffect(() => {
    if (!ready || !ownerKey) return;
    if (requestedTarget) {
      if (handledRequest || requestedTarget.status !== 'ready' || !requestedTarget.sessionId) return;
      onSelect(requestedTarget.sessionId);
      // A fila consome o parâmetro pedido ao abrir o pagamento. A entrada já
      // está resolvida e não deve voltar ao caixa próprio quando isso ocorrer.
      setResolved({ epoch, requestKey: requestedTarget.key, sessionId: requestedTarget.sessionId });
    } else if (!initialized) {
      onSelect(ownSessionId ?? 'home');
      setResolved({ epoch, requestKey: null, sessionId: ownSessionId ?? 'home' });
    }
  }, [epoch, handledRequest, initialized, ownerKey, ready, ownSessionId, onSelect, requestedTarget]);
  return { ready: Boolean(ready && ownerKey && initialized && !targetChanged && (!requestedTarget || handledRequest)), targetChanged, epoch };
}

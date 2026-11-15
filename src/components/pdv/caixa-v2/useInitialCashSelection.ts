import { useEffect, useRef } from 'react';

/** Escolhe o caixa próprio uma vez; depois respeita a navegação manual. */
export function useInitialCashSelection({ ownerKey, ready, ownSessionId, onSelect }: {
  ownerKey: string | null; ready: boolean; ownSessionId: string | null;
  onSelect: (id: string) => void;
}) {
  const initializedOwner = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !ownerKey || initializedOwner.current === ownerKey) return;
    initializedOwner.current = ownerKey;
    onSelect(ownSessionId ?? 'home');
  }, [ownerKey, ready, ownSessionId, onSelect]);
}

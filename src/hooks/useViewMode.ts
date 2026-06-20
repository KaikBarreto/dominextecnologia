import { useState, useCallback } from 'react';

export type ViewMode = 'list' | 'grid';

/**
 * Estado de modo de exibição (Lista/Grade) persistido em localStorage por tela.
 * Default 'list'. Guarda contra SSR.
 *
 * @param storageKey chave única por tela (ex.: 'customers-view-mode')
 */
export function useViewMode(storageKey: string): [ViewMode, (mode: ViewMode) => void] {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'list';
    const saved = window.localStorage.getItem(storageKey);
    return saved === 'grid' ? 'grid' : 'list';
  });

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setViewModeState(mode);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, mode);
      }
    },
    [storageKey],
  );

  return [viewMode, setViewMode];
}

import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useState } from "react";

export const OVERLAY_PRIORITY = {
  marketing: 10,
  reminder: 20,
  tutorial: 30,
  userAction: 50,
  destructive: 70,
  critical: 100,
} as const;

type Entry = { id: string; priority: number; order: number; parentId: string | null };
type OverlayContextValue = {
  activeIds: ReadonlySet<string>;
  register: (id: string, priority: number, parentId: string | null) => void;
  unregister: (id: string) => void;
};

const OverlayContext = createContext<OverlayContextValue | null>(null);
const OverlayParentContext = createContext<string | null>(null);

/**
 * Marca a identidade do modal atual para overlays renderizados dentro dele.
 * Portals preservam contexto React, então um Dialog/Drawer filho continua
 * sabendo quem é o pai mesmo sendo desenhado diretamente no <body>.
 */
export function OverlayNestingProvider({ id, children }: { id: string; children: React.ReactNode }) {
  return <OverlayParentContext.Provider value={id}>{children}</OverlayParentContext.Provider>;
}

export function OverlayCoordinatorProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const register = useCallback((id: string, priority: number, parentId: string | null) => {
    setEntries((current) => current.some((entry) => entry.id === id)
      ? current.map((entry) => entry.id === id ? { ...entry, priority, parentId } : entry)
      : [...current, { id, priority, parentId, order: Date.now() + Math.random() }]);
  }, []);
  const unregister = useCallback((id: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const activeIds = useMemo(() => {
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const isAncestorOf = (ancestorId: string, entry: Entry) => {
      const visited = new Set<string>();
      let parentId = entry.parentId;
      while (parentId && !visited.has(parentId)) {
        if (parentId === ancestorId) return true;
        visited.add(parentId);
        parentId = byId.get(parentId)?.parentId ?? null;
      }
      return false;
    };

    // Prioridade continua vencendo overlays concorrentes. Em empate, um filho
    // sempre fica acima do próprio pai, independentemente da ordem em que os
    // layout effects registraram cada portal. Entre irmãos, o mais novo vence.
    const top = [...entries].sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      if (isAncestorOf(a.id, b)) return 1;
      if (isAncestorOf(b.id, a)) return -1;
      return b.order - a.order;
    })[0];

    const chain = new Set<string>();
    const visited = new Set<string>();
    let current = top;
    while (current && !visited.has(current.id)) {
      chain.add(current.id);
      visited.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return chain;
  }, [entries]);

  const value = useMemo(
    () => ({ activeIds, register, unregister }),
    [activeIds, register, unregister],
  );

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}
export function useOverlaySlot(open: boolean, options?: { id?: string; priority?: number; parentId?: string | null }) {
  const generatedId = useId();
  const coordinator = useContext(OverlayContext);
  const contextualParentId = useContext(OverlayParentContext);
  const parentId = options && 'parentId' in options ? (options.parentId ?? null) : contextualParentId;
  const id = options?.id ?? `overlay-${generatedId}`;
  const priority = options?.priority ?? OVERLAY_PRIORITY.userAction;
  const register = coordinator?.register;
  const unregister = coordinator?.unregister;

  // O slot participa diretamente da visibilidade do modal. Registrar em um
  // effect passivo deixa o navegador pintar um frame com `activeId = null`:
  // a tela aparece, o overlay entra logo depois e, em consultas rápidas, sai
  // novamente. O resultado visual é um modal "piscando" sobre a página.
  //
  // Layout effect conclui a arbitragem antes do paint, mantendo a troca entre
  // overlays atômica para o usuário (inclusive no primeiro carregamento).
  useLayoutEffect(() => {
    if (!register || !unregister || !open) return;
    register(id, priority, parentId);
    return () => unregister(id);
  }, [id, open, parentId, priority, register, unregister]);

  return !coordinator || !open || coordinator.activeIds.has(id);
}

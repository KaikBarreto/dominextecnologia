import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";

export const OVERLAY_PRIORITY = {
  marketing: 10,
  reminder: 20,
  tutorial: 30,
  userAction: 50,
  destructive: 70,
  critical: 100,
} as const;

type Entry = { id: string; priority: number; order: number };
type OverlayContextValue = {
  activeId: string | null;
  register: (id: string, priority: number) => void;
  unregister: (id: string) => void;
};

const OverlayContext = createContext<OverlayContextValue | null>(null);

export function OverlayCoordinatorProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const register = useCallback((id: string, priority: number) => {
    setEntries((current) => current.some((entry) => entry.id === id)
      ? current.map((entry) => entry.id === id ? { ...entry, priority } : entry)
      : [...current, { id, priority, order: Date.now() + Math.random() }]);
  }, []);
  const unregister = useCallback((id: string) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);
  const activeId = useMemo(() => [...entries]
    .sort((a, b) => b.priority - a.priority || b.order - a.order)[0]?.id ?? null, [entries]);

  return <OverlayContext.Provider value={{ activeId, register, unregister }}>{children}</OverlayContext.Provider>;
}
export function useOverlaySlot(open: boolean, options?: { id?: string; priority?: number }) {
  const generatedId = useId();
  const coordinator = useContext(OverlayContext);
  const id = options?.id ?? `overlay-${generatedId}`;
  const priority = options?.priority ?? OVERLAY_PRIORITY.userAction;
  const register = coordinator?.register;
  const unregister = coordinator?.unregister;

  useEffect(() => {
    if (!register || !unregister || !open) return;
    register(id, priority);
    return () => unregister(id);
  }, [id, open, priority, register, unregister]);

  return !coordinator || !open || coordinator.activeId === id;
}

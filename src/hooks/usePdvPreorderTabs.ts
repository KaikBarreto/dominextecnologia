import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  emptyPreorderWorkspace, mergePreorderWorkspaces, parsePreorderWorkspace, preorderTabStorageKey,
  type PdvPreorderTab, type PdvPreorderTabOwner, type PdvPreorderWorkspace,
} from '@/lib/pdv/preorder-workspace';

type Persistence = 'local' | 'memory';
const STORAGE_ERROR = 'Não foi possível guardar as abas neste dispositivo. Mantenha o atendimento aberto e tente novamente.';

export function usePdvPreorderTabs<S extends object>(owner: PdvPreorderTabOwner | null, enabled = true) {
  const key = owner && enabled ? preorderTabStorageKey(owner) : null;
  const hydrated = useMemo(() => {
    if (!key || !owner) return null;
    try { return { data: parsePreorderWorkspace<S>(localStorage.getItem(key), owner), error: null }; }
    catch { return { data: emptyPreorderWorkspace<S>(owner), error: STORAGE_ERROR }; }
    // The full identity is encoded in key, including an explicit cash context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const [, setState] = useState<{ key: string | null; data: PdvPreorderWorkspace<S> | null; error: string | null }>({ key, data: hydrated?.data ?? null, error: hydrated?.error ?? null });
  const current = useRef({ key, data: hydrated?.data ?? null, base: hydrated?.data ?? null, error: hydrated?.error ?? null });
  if (current.current.key !== key) current.current = { key, data: hydrated?.data ?? null, base: hydrated?.data ?? null, error: hydrated?.error ?? null };
  const bucketIdentity = current.current;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const publish = useCallback((data: PdvPreorderWorkspace<S>, error: string | null = null) => {
    if (!key || current.current.key !== key) return;
    current.current.data = data; current.current.error = error;
    setState({ key, data, error });
  }, [key]);
  const persist = useCallback((desired: PdvPreorderWorkspace<S>, base: PdvPreorderWorkspace<S>) => {
    if (!key) return;
    const bucket = current.current;
    queue.current = queue.current.catch(() => undefined).then(async () => {
      const save = async () => {
        try {
          const remote = parsePreorderWorkspace<S>(localStorage.getItem(key), desired.owner);
          const latestBeforeWrite = bucket.data ?? desired;
          const merged = mergePreorderWorkspaces(bucket.base ?? base, latestBeforeWrite, remote);
          const raw = JSON.stringify(merged); localStorage.setItem(key, raw);
          if (localStorage.getItem(key) !== raw) throw new Error(STORAGE_ERROR);
          bucket.base = merged;
          // An older queued write must not erase edits made while it waited.
          const latest = bucket.data;
          bucket.data = latest === latestBeforeWrite ? merged : latest ? mergePreorderWorkspaces(latestBeforeWrite, latest, merged) : merged;
          if (current.current === bucket) publish(bucket.data);
        } catch { if (current.current === bucket && bucket.data) publish(bucket.data, STORAGE_ERROR); }
      };
      if (navigator.locks?.request) await navigator.locks.request(key, save); else await save();
    });
  }, [key, publish]);
  const commit = useCallback((change: (data: PdvPreorderWorkspace<S>) => PdvPreorderWorkspace<S>) => {
    const data = current.current.data, base = current.current.base;
    if (!key || current.current !== bucketIdentity || !data || !base) return;
    const next = change(data);
    if (next === data || JSON.stringify(next) === JSON.stringify(data)) return;
    publish(next, current.current.error);
    // A corrupt backup is never silently replaced by an empty new snapshot.
    if (!hydrated?.error) persist(next, base);
  }, [bucketIdentity, hydrated?.error, key, persist, publish]);
  useEffect(() => {
    if (!key || !owner) return;
    const changed = (event: StorageEvent) => {
      if (event.key !== key || current.current.key !== key || !current.current.data || !current.current.base) return;
      try {
        const remote = parsePreorderWorkspace<S>(event.newValue, owner);
        const merged = mergePreorderWorkspaces(current.current.base, current.current.data, remote);
        current.current.base = remote; publish(merged);
      } catch { publish(current.current.data, STORAGE_ERROR); }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, publish]);
  const create = useCallback((initial: Partial<PdvPreorderTab<S>> = {}) => {
    if (!key || current.current !== bucketIdentity || !current.current.data) return null;
    const id = crypto.randomUUID();
    const tab: PdvPreorderTab<S> = { id, draftId: id, preorderId: null, revision: null, customerId: null, number: null, total: 0, hasContent: false, ...initial, version: crypto.randomUUID(), updatedAt: Date.now() };
    commit(data => ({ ...data, tabs: [...data.tabs, tab], activeId: tab.id })); return tab;
  }, [bucketIdentity, commit, key]);
  const select = useCallback((id: string) => commit(data => data.tabs.some(tab => tab.id === id) ? { ...data, activeId: id } : data), [commit]);
  const update = useCallback((id: string, patch: Partial<Omit<PdvPreorderTab<S>, 'id' | 'version' | 'updatedAt'>>) => commit(data => {
    const tab = data.tabs.find(item => item.id === id); if (!tab) return data;
    const merged = { ...tab, ...patch };
    if (JSON.stringify(merged) === JSON.stringify(tab)) return data;
    return { ...data, tabs: data.tabs.map(item => item.id === id ? { ...merged, version: crypto.randomUUID(), updatedAt: Date.now() } : item) };
  }), [commit]);
  const close = useCallback((id: string) => commit(data => {
    const tab = data.tabs.find(item => item.id === id); if (!tab) return data;
    const tabs = data.tabs.filter(item => item.id !== id);
    const index = data.tabs.findIndex(item => item.id === id);
    return { ...data, tabs, activeId: data.activeId === id ? tabs[Math.min(index, tabs.length - 1)]?.id ?? null : data.activeId, closed: { ...data.closed, [id]: tab.version } };
  }), [commit]);
  const reorder = useCallback((ids: string[]) => commit(data => {
    if (ids.length !== data.tabs.length || new Set(ids).size !== ids.length || ids.some(id => !data.tabs.some(tab => tab.id === id))) return data;
    return { ...data, tabs: ids.map(id => data.tabs.find(tab => tab.id === id)!) };
  }), [commit]);
  const data = current.current.key === key ? current.current.data : null;
  const error = current.current.key === key ? current.current.error : null;
  return {
    ready: Boolean(key && data), tabs: key ? data?.tabs ?? [] : [], activeId: key ? data?.activeId ?? null : null,
    active: key ? data?.tabs.find(tab => tab.id === data.activeId) ?? null : null,
    storageKey: key, persistence: (error ? 'memory' : 'local') as Persistence, error,
    create, select, update, close, reorder,
  };
}

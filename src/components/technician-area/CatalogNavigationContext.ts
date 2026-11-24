import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import { useLocation, useNavigate, useSearchParams, type NavigateOptions, type SetURLSearchParams, type To } from 'react-router-dom';
import type { PageSizeOption } from '@/hooks/useDataPagination';

type ScrollPosition = { window: number; containers: number[] };
type ReturnContext = { owner: string; to: string; originKey: string; values: [string, unknown][]; scroll: ScrollPosition };
type NavigationState = { catalogReturn?: ReturnContext };
type Store = {
  owner: string;
  values: Map<string, unknown>;
  scroll: Map<string, ScrollPosition>;
  listeners: Set<() => void>;
};
export const CatalogNavigationContext = createContext<Store | null>(null);
const inertSubscribe = () => () => {};
const keyFor = (pathname: string, slot: string) => `${pathname}#${slot}`;

function readReturn(state: unknown, owner: string): ReturnContext | undefined {
  const value = (state as NavigationState | null)?.catalogReturn;
  if (!value || value.owner !== owner || typeof value.to !== 'string' || !value.to.includes('/catalogo/')) return;
  if (!value.to.startsWith('/') || value.to.startsWith('//') || typeof value.originKey !== 'string') return;
  if (!Array.isArray(value.values) || !value.values.every(item => Array.isArray(item) && item.length === 2 && typeof item[0] === 'string')) return;
  if (!value.scroll || !Number.isFinite(value.scroll.window) || !Array.isArray(value.scroll.containers) || !value.scroll.containers.every(position => Number.isFinite(position) && position >= 0)) return;
  return value;
}

export function createCatalogNavigationStore(owner: string, state: unknown): Store {
  const origin = owner === 'unavailable' ? undefined : readReturn(state, owner);
  return { owner, values: new Map(origin?.values ?? []), scroll: new Map(origin ? [[origin.to, origin.scroll]] : []), listeners: new Set() };
}

/** State survives list→detail→list without persisting searches in shared storage. */
export function useCatalogListState<T>(slot: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const store = useContext(CatalogNavigationContext);
  const location = useLocation();
  const key = keyFor(location.pathname, slot);
  const [local, setLocal] = useState(initial);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const subscribe = useCallback((listener: () => void) => {
    if (!store) return inertSubscribe();
    store.listeners.add(listener);
    return () => { store.listeners.delete(listener); };
  }, [store]);
  const snapshot = useCallback((): T => {
    if (!store) return local;
    if (!store.values.has(key)) store.values.set(key, typeof initialRef.current === 'function' ? (initialRef.current as () => T)() : initialRef.current);
    return store.values.get(key) as T;
  }, [key, store, local]);
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    if (!store) { setLocal(next); return; }
    const previous = store.values.get(key) as T;
    const updated = typeof next === 'function' ? (next as (current: T) => T)(previous) : next;
    if (Object.is(previous, updated)) return;
    store.values.set(key, updated);
    store.listeners.forEach(listener => listener());
  }, [key, store]);
  return [value, setValue];
}

/** A canonical URL update must keep the route's return origin intact. */
export function useCatalogSearchParams(): ReturnType<typeof useSearchParams> {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const set = useCallback<SetURLSearchParams>((next, options) => setParams(next, { state: location.state, ...options }), [setParams, location.state]);
  return [params, set];
}

function captureScroll(): ScrollPosition {
  return { window: window.scrollY, containers: [...document.querySelectorAll<HTMLElement>('main, [data-scroll-container]')].map(element => element.scrollTop) };
}

/** Only an app-originated visit uses history back; pasted links keep a safe parent. */
export function useCatalogNavigation() {
  const store = useContext(CatalogNavigationContext);
  const location = useLocation();
  const navigate = useNavigate();
  const open = useCallback((to: To, options?: NavigateOptions) => {
    if (!store || store.owner === 'unavailable') { navigate(to, options); return; }
    const current = location.pathname + location.search;
    const scroll = captureScroll();
    store.scroll.set(current, scroll);
    const origin: ReturnContext = { owner: store.owner, to: current, originKey: location.key, values: [...store.values], scroll };
    navigate(to, { ...options, state: { ...(options?.state ?? {}), catalogReturn: origin } });
  }, [store, location, navigate]);
  const back = useCallback((fallback: string) => {
    const origin = store && store.owner !== 'unavailable' ? readReturn(location.state, store.owner) : undefined;
    if (origin && origin.originKey !== location.key) navigate(-1);
    else navigate(fallback);
  }, [store, location, navigate]);
  const replace = useCallback((to: To) => navigate(to, { replace: true, state: location.state }), [navigate, location.state]);
  return { open, back, replace };
}

/** Runs after the app shell's route reset and after the list has loaded. */
export function useCatalogScrollRestore(ready: boolean) {
  const store = useContext(CatalogNavigationContext);
  const location = useLocation();
  const restored = useRef<string>();
  useEffect(() => {
    if (!ready || !store || restored.current === location.key) return;
    const saved = store.scroll.get(location.pathname + location.search);
    if (!saved) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: saved.window, behavior: 'instant' as ScrollBehavior });
      document.querySelectorAll<HTMLElement>('main, [data-scroll-container]').forEach((element, index) => { element.scrollTop = saved.containers[index] ?? 0; });
      restored.current = location.key;
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, store, location.key, location.pathname, location.search]);
}

export function useCatalogPagination<T>(items: T[], slot: string) {
  const [page, setPage] = useCatalogListState(`${slot}:page`, 1);
  const [pageSize, setPageSize] = useCatalogListState<PageSizeOption>(`${slot}:size`, 10);
  const effectiveSize = pageSize === 'all' ? Math.max(items.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(items.length / effectiveSize));
  const safePage = Math.min(page, totalPages);
  const paginatedItems = useMemo(() => pageSize === 'all' ? items : items.slice((safePage - 1) * effectiveSize, safePage * effectiveSize), [items, pageSize, safePage, effectiveSize]);
  return { page: safePage, setPage, pageSize, setPageSize, paginatedItems, totalPages, totalItems: items.length, from: items.length ? (safePage - 1) * effectiveSize + 1 : 0, to: Math.min(items.length, safePage * effectiveSize) };
}

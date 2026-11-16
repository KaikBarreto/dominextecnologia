/** Local preferences for global catalog model IDs; never customer equipment/data. */
export interface CatalogActivitySnapshot {
  readonly recentIds: readonly string[];
  readonly favoriteIds: readonly string[];
}

export const EMPTY_CATALOG_ACTIVITY: CatalogActivitySnapshot = Object.freeze({
  recentIds: Object.freeze([] as string[]),
  favoriteIds: Object.freeze([] as string[]),
});

const EVENT = 'dominex:catalog-activity-changed';
const RECENT_LIMIT = 30;

interface CacheEntry {
  raw: string | null;
  snapshot: CatalogActivitySnapshot;
}

// A failed storage write remains available in memory, under the same scope only.
const cache = new Map<string, CacheEntry>();

function validId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length < 128 && id.trim() === id;
}

export const isCatalogModelId = validId;

/** No unscoped key or migration from the legacy technician favorites. */
export function catalogActivityKey(userId?: string | null, companyId?: string | null): string | null {
  if (!validId(userId) || !validId(companyId)) return null;
  return `dominex:catalog-activity:v1:${encodeURIComponent(companyId)}:${encodeURIComponent(userId)}`;
}

function ids(value: unknown, limit?: number): readonly string[] {
  if (!Array.isArray(value)) return EMPTY_CATALOG_ACTIVITY.recentIds;
  const unique = [...new Set(value.filter(validId))];
  return Object.freeze(limit === undefined ? unique : unique.slice(0, limit));
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function snapshotWithIds(
  recentIds: readonly string[],
  favoriteIds: readonly string[],
  previous = EMPTY_CATALOG_ACTIVITY,
): CatalogActivitySnapshot {
  const recent = sameIds(recentIds, previous.recentIds) ? previous.recentIds : Object.freeze([...recentIds]);
  const favorite = sameIds(favoriteIds, previous.favoriteIds) ? previous.favoriteIds : Object.freeze([...favoriteIds]);
  if (recent === previous.recentIds && favorite === previous.favoriteIds) return previous;
  return Object.freeze({ recentIds: recent, favoriteIds: favorite });
}

function parse(raw: string | null, previous?: CatalogActivitySnapshot): CatalogActivitySnapshot {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1) {
      return EMPTY_CATALOG_ACTIVITY;
    }
    return snapshotWithIds(
      ids('recentIds' in value ? value.recentIds : null, RECENT_LIMIT),
      ids('favoriteIds' in value ? value.favoriteIds : null),
      previous,
    );
  } catch {
    return EMPTY_CATALOG_ACTIVITY;
  }
}

export function getCatalogActivitySnapshot(key: string | null, refresh = false): CatalogActivitySnapshot {
  if (!key || typeof window === 'undefined') return EMPTY_CATALOG_ACTIVITY;
  const previous = cache.get(key);
  try {
    const raw = window.localStorage.getItem(key);
    if (previous && previous.raw === raw && !refresh) return previous.snapshot;
    const snapshot = parse(raw, previous?.snapshot);
    cache.set(key, { raw, snapshot });
    return snapshot;
  } catch {
    return previous?.snapshot ?? EMPTY_CATALOG_ACTIVITY;
  }
}

function write(key: string, snapshot: CatalogActivitySnapshot): void {
  const previous = cache.get(key);
  if (previous?.snapshot === snapshot) return;
  let raw = previous?.raw ?? null;
  try {
    const serialized = JSON.stringify({ version: 1, ...snapshot });
    window.localStorage.setItem(key, serialized);
    raw = serialized;
  } catch {
    // Storage denied/full: keep the preference for this scoped browser session.
  }
  cache.set(key, { raw, snapshot });
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key } }));
}

export function recordCatalogView(key: string | null, modelId: string): void {
  if (!key || !validId(modelId) || typeof window === 'undefined') return;
  const current = getCatalogActivitySnapshot(key);
  const recentIds = [modelId, ...current.recentIds.filter((id) => id !== modelId)].slice(0, RECENT_LIMIT);
  write(key, snapshotWithIds(recentIds, current.favoriteIds, current));
}

/** Returns the resulting favorite state; false also covers an unavailable scope. */
export function toggleCatalogFavorite(key: string | null, modelId: string): boolean {
  if (!key || !validId(modelId) || typeof window === 'undefined') return false;
  const current = getCatalogActivitySnapshot(key);
  const favorite = !current.favoriteIds.includes(modelId);
  const favoriteIds = favorite
    ? [modelId, ...current.favoriteIds]
    : current.favoriteIds.filter((id) => id !== modelId);
  write(key, snapshotWithIds(current.recentIds, favoriteIds, current));
  return favorite;
}

/** Mirror of server-backed favorites; recent history remains local and untouched. */
export function setCatalogFavoriteIds(key: string | null, favoriteIds: readonly string[]): void {
  if (!key || typeof window === 'undefined') return;
  const current = getCatalogActivitySnapshot(key);
  write(key, snapshotWithIds(current.recentIds, ids(favoriteIds), current));
}

export function subscribeCatalogActivity(key: string | null, notify: () => void): () => void {
  if (!key || typeof window === 'undefined') return () => {};
  const onLocalChange = (event: Event) => {
    if ((event as CustomEvent<{ key?: string }>).detail?.key === key) notify();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== key) return;
    // Also clears an in-memory fallback when another tab explicitly clears storage.
    getCatalogActivitySnapshot(key, true);
    notify();
  };
  window.addEventListener(EVENT, onLocalChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onLocalChange);
    window.removeEventListener('storage', onStorage);
  };
}

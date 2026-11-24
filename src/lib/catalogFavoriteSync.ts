import { getCatalogActivitySnapshot, isCatalogModelId } from './catalogActivity';

export interface CatalogFavoriteRow {
  model_id: string;
  is_favorite: boolean;
  revision: number;
  last_operation_id: string | null;
  updated_at: string | null;
}
export interface CatalogFavoriteOperation {
  id: string;
  modelId: string;
  favorite: boolean;
  expectedRevision: number;
}
export interface CatalogFavoriteJournal {
  readonly rows: readonly CatalogFavoriteRow[];
  readonly pending: readonly CatalogFavoriteOperation[];
  readonly legacyIds: readonly string[];
  readonly initialized: boolean;
  readonly saving: boolean;
  readonly error: string | null;
  readonly backup: 'saved' | 'memory' | null;
}

export const FAVORITES_SYNC_UNAVAILABLE = 'Não foi possível sincronizar os favoritos. Tente novamente.';
export const FAVORITES_SYNC_CONFLICT = 'Os favoritos mudaram em outro aparelho. Confira a lista antes de tentar novamente.';
const EVENT = 'dominex:catalog-favorites-sync';
const EMPTY: CatalogFavoriteJournal = Object.freeze({ rows: [], pending: [], legacyIds: [], initialized: false, saving: false, error: null, backup: null });
const cache = new Map<string, { raw: string | null; state: CatalogFavoriteJournal }>();
const storageKey = (key: string) => `${key}:account-sync:v1`;
const validRevision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const validUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function isCatalogFavoriteRow(value: unknown): value is CatalogFavoriteRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as CatalogFavoriteRow;
  return isCatalogModelId(row.model_id) && typeof row.is_favorite === 'boolean'
    && validRevision(row.revision) && (row.last_operation_id === null || validUuid(row.last_operation_id))
    && (row.updated_at === null || typeof row.updated_at === 'string');
}

function isOperation(value: unknown): value is CatalogFavoriteOperation {
  if (!value || typeof value !== 'object') return false;
  const op = value as CatalogFavoriteOperation;
  return validUuid(op.id) && isCatalogModelId(op.modelId) && typeof op.favorite === 'boolean' && validRevision(op.expectedRevision);
}

function parse(raw: string): CatalogFavoriteJournal | null {
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || !Array.isArray(value.rows) || !Array.isArray(value.pending)
      || !Array.isArray(value.legacyIds) || typeof value.initialized !== 'boolean'
      || !value.rows.every(isCatalogFavoriteRow) || !value.pending.every(isOperation)
      || !value.legacyIds.every(isCatalogModelId)) return null;
    return Object.freeze({ ...EMPTY, rows: value.rows, pending: value.pending,
      legacyIds: value.legacyIds, initialized: value.initialized, backup: 'saved' });
  } catch { return null; }
}

export function getCatalogFavoriteJournal(key: string | null): CatalogFavoriteJournal {
  if (!key || typeof window === 'undefined') return EMPTY;
  const previous = cache.get(key);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey(key));
    if (previous?.raw === raw) return previous.state;
    const parsed = raw ? parse(raw) : null;
    if (parsed) { cache.set(key, { raw, state: parsed }); return parsed; }
  } catch {
    if (previous) return previous.state;
  }
  // Capture only the explicitly scoped preference. Never read ownerless legacy keys.
  const legacyIds = getCatalogActivitySnapshot(key).favoriteIds;
  const state = Object.freeze({ ...EMPTY, legacyIds, backup: legacyIds.length ? 'memory' as const : null });
  cache.set(key, { raw, state });
  return state;
}

function update(key: string, state: CatalogFavoriteJournal, persist = true): void {
  const previous = cache.get(key);
  let raw = previous?.raw ?? null;
  let backup = state.backup;
  if (persist) {
    try {
      const serialized = JSON.stringify({ version: 1, rows: state.rows, pending: state.pending,
        legacyIds: state.legacyIds, initialized: state.initialized });
      localStorage.setItem(storageKey(key), serialized);
      raw = serialized;
      backup = 'saved';
    } catch { backup = 'memory'; }
  }
  cache.set(key, { raw, state: Object.freeze({ ...state, backup }) });
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { key } }));
}

export function subscribeCatalogFavoriteJournal(key: string | null, notify: () => void): () => void {
  if (!key || typeof window === 'undefined') return () => {};
  const local = (event: Event) => { if ((event as CustomEvent<{ key?: string }>).detail?.key === key) notify(); };
  const storage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== storageKey(key)) return;
    cache.delete(key);
    notify();
  };
  window.addEventListener(EVENT, local);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(EVENT, local); window.removeEventListener('storage', storage); };
}

export function mergeCatalogFavoriteRows(current: readonly CatalogFavoriteRow[], received: readonly CatalogFavoriteRow[]): CatalogFavoriteRow[] {
  const rows = new Map(current.map(row => [row.model_id, row]));
  for (const row of received) {
    if (row.revision > 0 && row.revision >= (rows.get(row.model_id)?.revision ?? 0)) rows.set(row.model_id, row);
  }
  return [...rows.values()];
}

export function hydrateCatalogFavorites(key: string, received: readonly CatalogFavoriteRow[]): void {
  const current = getCatalogFavoriteJournal(key);
  const rows = mergeCatalogFavoriteRows(current.rows, received);
  const seen = new Set(rows.map(row => row.model_id));
  update(key, { ...current, rows, initialized: true, legacyIds: current.legacyIds.filter(id => !seen.has(id)) });
}

export function catalogJournalFavoriteIds(state: CatalogFavoriteJournal): readonly string[] {
  const ids = new Set([...state.legacyIds, ...state.rows.filter(row => row.is_favorite).map(row => row.model_id)]);
  for (const operation of state.pending) {
    if (operation.favorite) ids.add(operation.modelId);
    else ids.delete(operation.modelId);
  }
  return [...ids];
}

function operationId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function queueCatalogFavorite(key: string | null, modelId: string): boolean {
  if (!key || !isCatalogModelId(modelId)) return false;
  const current = getCatalogFavoriteJournal(key);
  const favorite = !catalogJournalFavoriteIds(current).includes(modelId);
  const operation = { id: operationId(), modelId, favorite,
    expectedRevision: current.rows.find(row => row.model_id === modelId)?.revision ?? 0 };
  // Never replace an unconfirmed operation: the server may have applied it while
  // its response was lost. Keep that idempotent anchor and at most one latest
  // opposite intent. Replaying the anchor safely obtains the tail's new revision.
  const anchor = current.pending.find(op => op.modelId === modelId);
  const pending = current.pending.filter(op => op.modelId !== modelId || op.id === anchor?.id);
  if (!anchor || anchor.favorite !== favorite) pending.push(operation);
  update(key, { ...current, error: null, legacyIds: current.legacyIds.filter(id => id !== modelId),
    pending });
  return favorite;
}

export function importCatalogLocalFavorites(key: string | null): void {
  if (!key) return;
  const current = getCatalogFavoriteJournal(key);
  if (!current.initialized || current.legacyIds.length === 0) return;
  const existing = new Set([...current.rows.map(row => row.model_id), ...current.pending.map(op => op.modelId)]);
  const added = current.legacyIds.filter(id => !existing.has(id)).map(modelId => ({
    id: operationId(), modelId, favorite: true, expectedRevision: 0,
  }));
  update(key, { ...current, error: null, legacyIds: [], pending: [...current.pending, ...added] });
}

export function setCatalogFavoriteSyncState(key: string, patch: Pick<Partial<CatalogFavoriteJournal>, 'saving' | 'error'>): void {
  const current = getCatalogFavoriteJournal(key);
  if (Object.entries(patch).every(([field, value]) => current[field as keyof typeof current] === value)) return;
  update(key, { ...current, ...patch }, false);
}

export function acknowledgeCatalogFavorite(key: string, operation: CatalogFavoriteOperation, row: CatalogFavoriteRow, applied: boolean): void {
  const current = getCatalogFavoriteJournal(key);
  const pending = current.pending.flatMap(op => {
    if (op.modelId !== operation.modelId) return [op];
    if (!applied || op.id === operation.id || op.favorite === row.is_favorite) return [];
    // A newer click in this same browser follows the acknowledged local operation.
    return [{ ...op, expectedRevision: row.revision }];
  });
  update(key, { ...current, rows: mergeCatalogFavoriteRows(current.rows, [row]), pending,
    legacyIds: current.legacyIds.filter(id => id !== operation.modelId),
    error: applied ? current.error : FAVORITES_SYNC_CONFLICT });
}

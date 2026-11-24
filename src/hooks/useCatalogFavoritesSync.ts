import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { onlineManager, QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  acknowledgeCatalogFavorite, catalogJournalFavoriteIds, FAVORITES_SYNC_UNAVAILABLE,
  getCatalogFavoriteJournal, hydrateCatalogFavorites, importCatalogLocalFavorites,
  isCatalogFavoriteRow, mergeCatalogFavoriteRows, queueCatalogFavorite,
  setCatalogFavoriteSyncState, subscribeCatalogFavoriteJournal,
  type CatalogFavoriteRow,
} from '@/lib/catalogFavoriteSync';

interface FavoriteScope { key: string; userId: string; companyId: string }
export type CatalogFavoritesSyncStatus = 'loading' | 'saving' | 'synced' | 'error' | 'local';
export const catalogFavoritesQueryKey = (userId?: string, companyId?: string) => ['catalog-favorites', userId, companyId] as const;
const flights = new WeakMap<QueryClient, Map<string, Promise<void>>>();
const subscribeOnline = (notify: () => void) => onlineManager.subscribe(notify);
const getOnline = () => onlineManager.isOnline();

async function readFavorites(scope: FavoriteScope, signal: AbortSignal): Promise<CatalogFavoriteRow[]> {
  const rows: CatalogFavoriteRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('catalog_model_favorites')
      .select('user_id,company_id,model_id,is_favorite,revision,last_operation_id,updated_at')
      .eq('user_id', scope.userId).eq('company_id', scope.companyId)
      .order('model_id').range(offset, offset + 999).abortSignal(signal);
    if (error || !Array.isArray(data)) throw new Error(FAVORITES_SYNC_UNAVAILABLE);
    for (const row of data) {
      if (row.user_id !== scope.userId || row.company_id !== scope.companyId || !isCatalogFavoriteRow(row)) {
        throw new Error(FAVORITES_SYNC_UNAVAILABLE);
      }
      rows.push(row);
    }
    if (data.length < 1000) return rows;
  }
}

function flushFavorites(scope: FavoriteScope, client: QueryClient, isCurrent: () => boolean): Promise<void> {
  let scopeFlights = flights.get(client);
  if (!scopeFlights) { scopeFlights = new Map(); flights.set(client, scopeFlights); }
  const running = scopeFlights.get(scope.key);
  if (running) return running;
  const queryKey = catalogFavoritesQueryKey(scope.userId, scope.companyId);
  const promise = Promise.resolve().then(async () => {
    if (!isCurrent()) return;
    setCatalogFavoriteSyncState(scope.key, { saving: true });
    try {
      while (isCurrent() && onlineManager.isOnline()) {
        const state = getCatalogFavoriteJournal(scope.key);
        if (state.error) break;
        const operation = state.pending[0];
        if (!operation) break;
        await client.cancelQueries({ queryKey });
        if (!isCurrent()) break;
        const { data, error } = await supabase.rpc('set_catalog_model_favorite', {
          p_company_id: scope.companyId, p_model_id: operation.modelId,
          p_is_favorite: operation.favorite, p_expected_revision: operation.expectedRevision,
          p_operation_id: operation.id,
        });
        if (!isCurrent()) break;
        const result = data?.[0];
        if (error || !result || typeof result.applied !== 'boolean'
          || !isCatalogFavoriteRow(result) || result.model_id !== operation.modelId) throw new Error(FAVORITES_SYNC_UNAVAILABLE);
        acknowledgeCatalogFavorite(scope.key, operation, result, result.applied);
        client.setQueryData<CatalogFavoriteRow[]>(queryKey, old => mergeCatalogFavoriteRows(old ?? [], [result]));
      }
    } catch {
      if (isCurrent()) setCatalogFavoriteSyncState(scope.key, { error: FAVORITES_SYNC_UNAVAILABLE });
    } finally {
      scopeFlights!.delete(scope.key);
      setCatalogFavoriteSyncState(scope.key, { saving: false });
    }
  });
  scopeFlights.set(scope.key, promise);
  return promise;
}

/** Canonical account favorites with a scoped durable outbox, never a whole-list overwrite. */
export function useCatalogFavoritesSync(scope: FavoriteScope | null) {
  const client = useQueryClient();
  const key = scope?.key ?? null;
  const activeKey = useRef(key);
  const mounted = useRef(true);
  activeKey.current = key;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const isCurrent = useCallback(() => mounted.current && activeKey.current === key, [key]);
  const subscribe = useCallback((notify: () => void) => subscribeCatalogFavoriteJournal(key, notify), [key]);
  const getSnapshot = useCallback(() => getCatalogFavoriteJournal(key), [key]);
  const journal = useSyncExternalStore(subscribe, getSnapshot, () => getCatalogFavoriteJournal(null));
  const online = useSyncExternalStore(subscribeOnline, getOnline, () => true);
  const query = useQuery({
    queryKey: catalogFavoritesQueryKey(scope?.userId, scope?.companyId),
    enabled: !!scope,
    queryFn: ({ signal }) => readFavorites(scope!, signal),
    retry: 1, staleTime: 0, refetchInterval: 30_000,
    refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchOnReconnect: 'always',
  });
  useEffect(() => {
    if (scope && query.data && isCurrent()) hydrateCatalogFavorites(key!, query.data);
  }, [key, scope, query.data, isCurrent]);

  useEffect(() => {
    if (scope && journal.initialized && journal.pending.length && !journal.error && !journal.saving
      && query.data && !query.isError && online && query.fetchStatus !== 'paused') {
      void flushFavorites(scope, client, isCurrent);
    }
  }, [key, scope, journal.initialized, journal.pending, journal.error,
    journal.saving, query.data, query.isError, query.fetchStatus, online, client, isCurrent]);

  const { refetch } = query;
  const retryFavoritesSync = useCallback(async () => {
    if (!scope || !isCurrent() || !onlineManager.isOnline()) return;
    setCatalogFavoriteSyncState(scope.key, { error: null });
    const result = await refetch();
    if (!isCurrent()) return;
    if (result.isError || !result.data) return;
    hydrateCatalogFavorites(scope.key, result.data);
    await flushFavorites(scope, client, isCurrent);
  }, [scope, refetch, client, isCurrent]);

  useEffect(() => {
    if (!scope) return;
    const reconnect = () => { void retryFavoritesSync(); };
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, [scope, retryFavoritesSync]);

  const toggleFavorite = useCallback((modelId: string) => queueCatalogFavorite(key, modelId), [key]);
  const importLocalFavorites = useCallback(() => importCatalogLocalFavorites(key), [key]);
  const favoriteIds = useMemo(() => catalogJournalFavoriteIds(journal), [journal]);
  const favoritesOffline = !online || query.fetchStatus === 'paused';
  let favoritesSyncStatus: CatalogFavoritesSyncStatus = 'loading';
  if (!scope) favoritesSyncStatus = 'local';
  else if (journal.saving) favoritesSyncStatus = 'saving';
  else if (journal.error || query.isError) favoritesSyncStatus = 'error';
  else if (favoritesOffline || journal.legacyIds.length > 0) favoritesSyncStatus = 'local';
  else if (journal.initialized && query.data && !journal.pending.length) favoritesSyncStatus = 'synced';

  const favoritesSyncError = journal.error || (query.isError ? FAVORITES_SYNC_UNAVAILABLE : null);
  return useMemo(() => ({
    favoriteIds, toggleFavorite, favoritesSyncStatus,
    favoritesPendingCount: journal.pending.length, favoritesOffline,
    favoritesSyncError,
    favoritesLocalBackup: journal.backup, retryFavoritesSync,
    localFavoritesToImport: journal.legacyIds, importLocalFavorites,
  }), [favoriteIds, toggleFavorite, favoritesSyncStatus, favoritesSyncError, journal.pending.length, favoritesOffline,
    journal.backup, retryFavoritesSync, journal.legacyIds, importLocalFavorites]);
}

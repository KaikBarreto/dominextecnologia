import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCatalogFavoritesSync } from './useCatalogFavoritesSync';
import {
  catalogActivityKey,
  EMPTY_CATALOG_ACTIVITY,
  getCatalogActivitySnapshot,
  recordCatalogView,
  subscribeCatalogActivity,
  setCatalogFavoriteIds,
} from '@/lib/catalogActivity';

/** Recent/favorite global model IDs, isolated by authenticated user and company. */
export function useCatalogActivity() {
  const { user, profile, loading, profileLoading } = useAuth();
  const userId = user?.id;
  const companyId = profile?.company_id;
  const profileMatchesUser = !profile?.user_id || profile.user_id === user?.id;
  const key = !loading && !profileLoading && profileMatchesUser && profile?.is_active !== false
    ? catalogActivityKey(userId, companyId)
    : null;
  // Scope is part of each snapshot closure: a session switch never renders the previous scope.
  const subscribe = useCallback((notify: () => void) => subscribeCatalogActivity(key, notify), [key]);
  const getSnapshot = useCallback(() => getCatalogActivitySnapshot(key), [key]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_CATALOG_ACTIVITY);
  const recordView = useCallback((id: string) => recordCatalogView(key, id), [key]);
  const favoriteScope = useMemo(() => key ? { key, userId: userId!, companyId: companyId! } : null,
    [key, userId, companyId]);
  const sync = useCatalogFavoritesSync(favoriteScope);
  const isFavorite = useCallback((id: string) => sync.favoriteIds.includes(id), [sync.favoriteIds]);
  useEffect(() => { setCatalogFavoriteIds(key, sync.favoriteIds); }, [key, sync.favoriteIds]);

  return useMemo(() => ({ recentIds: snapshot.recentIds, ...sync, isReady: key !== null, isFavorite, recordView }),
    [snapshot.recentIds, key, isFavorite, recordView, sync]);
}

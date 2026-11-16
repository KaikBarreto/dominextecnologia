import { Cloud, CloudOff, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import type { useCatalogActivity } from '@/hooks/useCatalogActivity';
import { FAVORITES_SYNC_CONFLICT } from '@/lib/catalogFavoriteSync';
import { catalogActivityCopy } from './catalogActivityCopy';

/** Um único acompanhamento por lista; nenhum selo adicional em cada equipamento. */
export function CatalogFavoritesSyncStatus({ activity }: { activity: ReturnType<typeof useCatalogActivity> }) {
  const { locale } = useAppLocaleContext();
  const t = catalogActivityCopy[locale];
  if (!activity.isReady) return null;
  const status = activity.favoritesSyncStatus;
  const localFavorites = activity.localFavoritesToImport ?? [];
  const offline = activity.favoritesOffline;
  const busy = !offline && (status === 'loading' || status === 'saving');
  const failed = status === 'error';
  const conflict = failed && activity.favoritesSyncError === FAVORITES_SYNC_CONFLICT;
  const label = offline ? t.favoritesOffline : status === 'loading' ? t.favoritesLoading
    : status === 'saving' ? t.favoritesSaving
      : status === 'synced' ? localFavorites.length ? t.favoritesConnected : t.favoritesSynced
        : conflict ? t.favoritesConflict : failed ? t.favoritesError : t.favoritesLocal;
  const Icon = busy ? LoaderCircle : failed || offline ? CloudOff : Cloud;
  const showBackup = failed && !conflict || offline && activity.favoritesPendingCount > 0;
  return <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p role="status" className="flex min-w-0 items-start gap-2">
        <Icon aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 ${busy ? 'motion-safe:animate-spin' : ''}`} />
        <span>{label}{showBackup && activity.favoritesLocalBackup && <> {activity.favoritesLocalBackup === 'saved' ? t.favoritesBackup : t.favoritesMemory}</>}</span>
      </p>
      {failed && !offline && <Button variant="ghost" size="sm" className="min-h-11 text-xs" onClick={() => { void activity.retryFavoritesSync(); }}>{t.retry}</Button>}
    </div>
    {localFavorites.length > 0 && <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p>{t.importLocalHelp}</p>
      <Button variant="outline" size="sm" className="min-h-11 text-xs" disabled={busy || offline} onClick={activity.importLocalFavorites}>{t.importLocal} ({localFavorites.length})</Button>
    </div>}
  </div>;
}

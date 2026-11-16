import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';

export const DOMILINK_SETTINGS_QUERY = '?tab=integracoes&integration=domilink';

/** A conexão pertence ao computador e atende tanto Estoque quanto PDV. */
export function useDomiLinkAccess() {
  const { hasScreenAccess, loading, profileLoading } = useAuth();
  const { hasScreen, isLoading } = useCompanyModules();
  const isPending = loading || profileLoading || isLoading;
  // Somente o pareamento deste usuário/computador; não concede Settings geral.
  const allowed = !isPending && [
    'screen:inventory', 'screen:pdv_settings', 'screen:pdv',
    'screen:pdv_preorders', 'screen:pdv_orders', 'screen:pdv_dispatch',
  ].some(screen => hasScreenAccess(screen) && hasScreen(screen));

  return { allowed, isPending };
}

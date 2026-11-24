import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';

export const DOMILINK_SETTINGS_QUERY = '?tab=integracoes&integration=domilink';

/** A conexão pertence ao computador e atende tanto Estoque quanto PDV. */
export function useDomiLinkAccess() {
  const { hasScreenAccess, loading, profileLoading } = useAuth();
  const { hasScreen, isLoading } = useCompanyModules();
  const isPending = loading || profileLoading || isLoading;
  const allowed = !isPending && (
    (hasScreenAccess('screen:inventory') && hasScreen('screen:inventory'))
    || (hasScreenAccess('screen:pdv_settings') && hasScreen('screen:pdv_settings'))
  );

  return { allowed, isPending };
}

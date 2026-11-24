import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

function readLayout(key: string | null) {
  if (!key) return false;
  try { return localStorage.getItem(key) === 'expanded'; } catch { return false; }
}

/** Guarda somente a apresentação; nunca carrinho, cliente ou valores. */
export function usePdvCheckoutLayoutPreference() {
  const { user, profile, loading, profileLoading } = useAuth();
  const key = useMemo(() => !loading && !profileLoading && user?.id && profile?.company_id
    ? `pdv:checkout-layout:${profile.company_id}:${user.id}` : null,
  [loading, profileLoading, profile?.company_id, user?.id]);
  const [preferences, setPreferences] = useState<Record<string, boolean>>({});
  const expanded = key ? preferences[key] ?? readLayout(key) : false;
  const setExpanded = useCallback((next: boolean) => {
    if (!key) return;
    setPreferences((current) => ({ ...current, [key]: next }));
    try { localStorage.setItem(key, next ? 'expanded' : 'compact'); } catch { /* A sessão continua com a preferência em memória. */ }
  }, [key]);
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (!key || event.key !== key) return;
      setPreferences((current) => ({ ...current, [key]: event.newValue === 'expanded' }));
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, [key]);
  return { expanded, setExpanded };
}

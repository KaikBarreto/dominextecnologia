import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { CatalogNavigationContext, createCatalogNavigationStore } from './CatalogNavigationContext';

/** Ephemeral list state belongs to the current authenticated catalog session. */
export function CatalogNavigationProvider({ children }: { children: ReactNode }) {
  const { user, profile, loading, profileLoading } = useAuth();
  const valid = !loading && !profileLoading && user?.id && profile?.company_id && (!profile.user_id || profile.user_id === user.id);
  const owner = valid ? `${user.id}:${profile.company_id}` : 'unavailable';
  return <SessionProvider key={owner} owner={owner}>{children}</SessionProvider>;
}

function SessionProvider({ owner, children }: { owner: string; children: ReactNode }) {
  const location = useLocation();
  const [store] = useState(() => createCatalogNavigationStore(owner, location.state));
  return <CatalogNavigationContext.Provider value={store}>{children}</CatalogNavigationContext.Provider>;
}

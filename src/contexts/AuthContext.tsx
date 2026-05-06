import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole, Profile } from '@/types/database';

// Same set of CSS variables that useWhiteLabel applies. Duplicated here to
// avoid a circular import (useWhiteLabel → useCompanySettings → useAuth).
const WHITE_LABEL_VARS = [
  '--primary',
  '--ring',
  '--sidebar-primary',
  '--sidebar-accent',
  '--sidebar-ring',
  '--gradient-brand',
];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  permissions: string[];
  adminPermissions: string[];
  isAdminUser: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdminOrGestor: () => boolean;
  hasPermission: (key: string) => boolean;
  hasScreenAccess: (screenKey: string) => boolean;
  hasAdminScreenAccess: (key: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [adminPermissions, setAdminPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // Race protection: guarda o userId atual para descartar resultados de
  // fetchUserData "em vôo" caso o usuário troque (logout + login rápido,
  // multi-aba). Sem isso, um fetch antigo pode sobrescrever o estado novo.
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Fallback de defesa em profundidade: se INITIAL_SESSION não disparar por
    // qualquer motivo (lock travado, bug do client), ainda assim soltamos o
    // skeleton em 5s. Limpado assim que o primeiro evento chega.
    const loadingFallback = setTimeout(() => {
      console.warn('[Auth] onAuthStateChange did not fire within 5s — releasing loading state');
      setLoading(false);
    }, 5000);

    // IMPORTANTE: callback é SÍNCRONO. A doc do Supabase é explícita:
    // "Avoid using async functions as callbacks. Calling other Supabase
    // functions inside the callback can cause deadlocks."
    // Ref: https://supabase.com/docs/reference/javascript/auth-onauthstatechange
    //
    // O callback segura um lock interno do GoTrue enquanto executa. Se
    // fizermos queries (await) aqui dentro, autoRefreshToken / getSession /
    // signOut e sincronização multi-aba ficam em fila atrás — é o deadlock
    // que causou o skeleton infinito (incidente 1.8.9 e residuais).
    //
    // Solução: deferir fetchUserData com setTimeout(..., 0), saindo da fila
    // de execução do GoTrue antes de tocar no banco. Lock libera na hora.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        clearTimeout(loadingFallback);

        setSession(session);
        setUser(session?.user ?? null);
        currentUserIdRef.current = session?.user?.id ?? null;

        if (session?.user) {
          const userId = session.user.id;
          // Defer pra fora do callback — não segurar o lock do GoTrue.
          setTimeout(() => {
            fetchUserData(userId).catch((err) => {
              console.error('[Auth] fetchUserData failed:', err);
            });
          }, 0);
        } else if (event === 'SIGNED_OUT' || !session) {
          setProfile(null);
          setRoles([]);
          setPermissions([]);
          setAdminPermissions([]);
        }

        // Soltar skeleton imediatamente. UI já tem session/user; profile/roles
        // chegam logo depois via setState do fetchUserData deferido. Consumers
        // que dependem de roles devem checar roles.length > 0 (já fazem).
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(loadingFallback);
      subscription.unsubscribe();
    };
  }, []);

  const fetchUserData = async (userId: string) => {
    // Helper: descarta resultado se o usuário trocou enquanto a query estava em vôo.
    const isStillCurrent = () => currentUserIdRef.current === userId;

    // Timeout de 5s envolvendo as 4 queries. Se estourar, segue com o que
    // conseguiu carregar — estado parcial é melhor que skeleton travado.
    const TIMEOUT_MS = 5000;
    const timeoutPromise = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), TIMEOUT_MS)
    );

    const fetchAll = async () => {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (profileData && isStillCurrent()) {
        setProfile(profileData as Profile);
      }

      // Fetch roles
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (rolesData && isStillCurrent()) {
        setRoles(rolesData.map(r => r.role as AppRole));
      }

      // Fetch permissions
      const { data: permData } = await supabase
        .from('user_permissions')
        .select('permissions, is_active')
        .eq('user_id', userId)
        .maybeSingle();

      if (isStillCurrent()) {
        if (permData && permData.is_active) {
          setPermissions((permData.permissions as any) || []);
        } else {
          setPermissions([]);
        }
      }

      // Fetch admin panel permissions (vendedores / admin users)
      const { data: adminPermData } = await supabase
        .from('admin_permissions')
        .select('permission')
        .eq('user_id', userId);

      if (isStillCurrent()) {
        setAdminPermissions((adminPermData ?? []).map((r: any) => r.permission as string));
      }
    };

    try {
      const result = await Promise.race([fetchAll(), timeoutPromise]);
      if (result === 'timeout') {
        console.warn('[Auth] fetchUserData timed out after 5s — proceeding with partial state');
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    // Clean up active session
    const sessionToken = localStorage.getItem('session_token');
    if (sessionToken && user) {
      await supabase
        .from('active_sessions')
        .delete()
        .eq('user_id', user.id)
        .eq('session_token', sessionToken);
      localStorage.removeItem('session_token');
    }
    await supabase.auth.signOut();
    // Invalidar cache do PWA para não vazar PII após logout
    if ('caches' in window) {
      try {
        const cache = await caches.open('supabase-cache');
        const keys = await cache.keys();
        await Promise.all(keys.map(key => cache.delete(key)));
      } catch (_) { /* service worker pode não estar disponível */ }
    }
    // Clear cross-tenant branding state. Without this the previous tenant's
    // white-label colors (CSS vars on <html>) and dark theme stay applied on
    // the login screen and would also bleed into the next user that logs in
    // before useWhiteLabel re-runs.
    const root = document.documentElement;
    WHITE_LABEL_VARS.forEach((v) => root.style.removeProperty(v));
    root.classList.remove('dark');
    localStorage.removeItem('theme');
    queryClient.clear();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    setPermissions([]);
    setAdminPermissions([]);
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdminOrGestor = () => hasRole('admin') || hasRole('gestor');
  
  // "Acesso total" = user has admin or super_admin role
  const isFullAccess = roles.includes('admin' as AppRole) || roles.includes('super_admin' as AppRole);

  // Permission check: admin role or full access always has full access.
  const hasPermission = (key: string) => {
    if (hasRole('admin') || isFullAccess) return true;
    if (permissions.length > 0) return permissions.includes(key);
    return roles.length > 0;
  };

  const hasScreenAccess = (screenKey: string) => {
    if (hasRole('admin') || isFullAccess) return true;
    if (permissions.length > 0) return permissions.includes(screenKey);
    return roles.length > 0;
  };

  // Master (super_admin) sees every admin screen; vendedores see only what's in admin_permissions.
  const isMaster = roles.includes('super_admin' as AppRole);
  const isAdminUser = isMaster || adminPermissions.length > 0;
  const hasAdminScreenAccess = (key: string) => {
    if (isMaster) return true;
    return adminPermissions.includes(key);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        permissions,
        adminPermissions,
        isAdminUser,
        loading,
        signIn,
        signUp,
        signOut,
        hasRole,
        isAdminOrGestor,
        hasPermission,
        hasScreenAccess,
        hasAdminScreenAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

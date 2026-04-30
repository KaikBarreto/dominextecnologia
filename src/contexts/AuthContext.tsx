import React, { createContext, useContext, useEffect, useState } from 'react';
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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Refetch profile/roles/permissions for the new user. We deliberately
          // await here so consumers (sidebar, white-label, route guards) only
          // re-render once the user's identity is fully resolved — otherwise
          // they get a brief window where roles=[] and may apply tenant
          // styling to a super_admin or vice-versa.
          await fetchUserData(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          setProfile(null);
          setRoles([]);
          setPermissions([]);
          setAdminPermissions([]);
        }
      }
    );

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await fetchUserData(session.user.id);
      }
      setLoading(false);
    })();

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (profileData) {
        setProfile(profileData as Profile);
      }

      // Fetch roles
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      
      if (rolesData) {
        setRoles(rolesData.map(r => r.role as AppRole));
      }

      // Fetch permissions
      const { data: permData } = await supabase
        .from('user_permissions')
        .select('permissions, is_active')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (permData && permData.is_active) {
        setPermissions((permData.permissions as any) || []);
      } else {
        setPermissions([]);
      }

      // Fetch admin panel permissions (vendedores / admin users)
      const { data: adminPermData } = await supabase
        .from('admin_permissions')
        .select('permission')
        .eq('user_id', userId);

      setAdminPermissions((adminPermData ?? []).map((r: any) => r.permission as string));
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

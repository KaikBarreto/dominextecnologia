import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole, Profile } from '@/types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  permissions: string[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdminOrGestor: () => boolean;
  hasPermission: (key: string) => boolean;
  hasScreenAccess: (screenKey: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setPermissions([]);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

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
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    setPermissions([]);
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdminOrGestor = () => hasRole('admin') || hasRole('gestor');
  
  // Permission check: admin role always has full access.
  // If user has no user_permissions row, fall back to role-based legacy access.
  const hasPermission = (key: string) => {
    if (hasRole('admin')) return true;
    if (permissions.length > 0) return permissions.includes(key);
    // Legacy fallback: if no permissions configured, allow based on roles
    return roles.length > 0;
  };

  const hasScreenAccess = (screenKey: string) => {
    if (hasRole('admin')) return true;
    if (permissions.length > 0) return permissions.includes(screenKey);
    // Legacy fallback
    return roles.length > 0;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        permissions,
        loading,
        signIn,
        signUp,
        signOut,
        hasRole,
        isAdminOrGestor,
        hasPermission,
        hasScreenAccess,
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

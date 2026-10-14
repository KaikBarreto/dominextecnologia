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
  hasPermissionRecord: boolean;
  adminPermissions: string[];
  isAdminUser: boolean;
  /**
   * Id da ficha em `affiliates` vinculada a este usuário (`affiliates.user_id`),
   * ou null. Afiliado é parceiro EXTERNO: ele NUNCA é admin (`isAdminUser`
   * continua false) e NUNCA ganha linha em `admin_permissions` — no SQL,
   * `is_admin_user()` é `is_super_admin OR tem QUALQUER linha em
   * admin_permissions`, então uma linha lá abriria TODAS as policies amplas do
   * painel (companies, company_payments, admin_financial_transactions,
   * salespeople) pra ele. O acesso dele é por VÍNCULO, isolado pelas policies
   * de self-scope (`current_affiliate_id()`).
   */
  linkedAffiliateId: string | null;
  /**
   * `true` = ainda NÃO sabemos se este usuário é afiliado (hidratação do
   * perfil/roles/admin_permissions em curso, ou a consulta de vínculo em vôo).
   * Nunca conclua "não é afiliado" com isto `true` — é o que evita redirect
   * errado e piscada (incidente `default_route_permission_loop`).
   */
  affiliateLoading: boolean;
  loading: boolean;
  profileLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
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
  // Indica se o usuário POSSUI uma linha em `user_permissions` (mesmo que o
  // array de permissões esteja vazio ou o registro esteja inativo). Distingue:
  //   - true  → permissionamento explícito; respeitamos ESTRITAMENTE a lista
  //             (vazio/inativo = sem acesso). Fecha o furo do default-allow.
  //   - false → usuário legado (nunca teve registro); mantemos o fallback por
  //             role pra não trancar técnicos antigos que dependem disso.
  const [hasPermissionRecord, setHasPermissionRecord] = useState(false);
  const [adminPermissions, setAdminPermissions] = useState<string[]>([]);
  const [linkedAffiliateId, setLinkedAffiliateId] = useState<string | null>(null);
  // Começa `false` (= "ainda não resolvido"); vira `true` no fim do
  // fetchUserData, tanto quando a consulta roda quanto quando ela é pulada por
  // o usuário não ser elegível. Resetado a cada troca de usuário.
  const [affiliateResolved, setAffiliateResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  // A sessão do Supabase chega antes do perfil/roles/permissões. Mantemos esse
  // carregamento separado para consumidores que não podem interpretar
  // `profile === null` como estado definitivo durante a hidratação inicial.
  const [profileLoading, setProfileLoading] = useState(true);
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
      setProfileLoading(false);
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

        const nextUserId = session?.user?.id ?? null;
        const userChanged = currentUserIdRef.current !== nextUserId;
        setSession(session);
        setUser(session?.user ?? null);
        currentUserIdRef.current = nextUserId;

        if (session?.user) {
          const userId = session.user.id;
          if (userChanged) {
            setProfileLoading(true);
            // Vínculo de afiliado é por usuário: zera e volta pro estado
            // "não resolvido" antes de qualquer gate decidir algo.
            setLinkedAffiliateId(null);
            setAffiliateResolved(false);
          }
          // Defer pra fora do callback — não segurar o lock do GoTrue.
          setTimeout(() => {
            fetchUserData(userId).catch((err) => {
              console.error('[Auth] fetchUserData failed:', err);
            });
          }, 0);

          // Auto-save da sessão atual no switcher de contas a cada SIGNED_IN
          // (login normal, refresh restaurando sessão em tab focus, etc).
          // Fire-and-forget + dynamic import pra evitar dependência circular
          // e não bloquear o callback do GoTrue.
          if (event === 'SIGNED_IN') {
            import('@/lib/savedSessions')
              .then((m) => m.addCurrentSessionToSavedStandalone())
              .catch((e) =>
                console.warn('[Auth] addCurrentSessionToSavedStandalone (SIGNED_IN) failed:', e),
              );
          }
        } else if (event === 'SIGNED_OUT' || !session) {
          setProfileLoading(false);
          setProfile(null);
          setRoles([]);
          setPermissions([]);
          setHasPermissionRecord(false);
          setAdminPermissions([]);
          setLinkedAffiliateId(null);
          setAffiliateResolved(false);
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
        // Existência da linha define o modo (estrito vs legado), independente de
        // estar ativa. Registro inativo é "sem acesso" intencional, não legado.
        setHasPermissionRecord(!!permData);
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

      const adminPerms = (adminPermData ?? []).map((r: any) => r.permission as string);
      if (isStillCurrent()) {
        setAdminPermissions(adminPerms);
      }

      // --- Vínculo de afiliado (parceiro externo) -----------------------
      // CUSTO: esta é uma 5ª consulta por sessão e SÓ pode rodar pra quem
      // PODE ser afiliado. Afiliado não é master, não tem linha em
      // `admin_permissions` (seria "admin" no SQL — ver comentário de
      // `linkedAffiliateId`) e não pertence a nenhum tenant. Usuário de tenant
      // e admin do painel não pagam nada por isto.
      //
      // Usamos as variáveis LOCAIS (profileData/rolesData/adminPerms), não o
      // state: o state é assíncrono e ainda não refletiu estas queries.
      const isMasterNow = (rolesData ?? []).some((r: any) => r.role === 'super_admin');
      const couldBeAffiliate =
        !isMasterNow && adminPerms.length === 0 && !(profileData as any)?.company_id;

      if (couldBeAffiliate) {
        // `affiliates` ainda não está em `types.ts` (regeneração em outra
        // tarefa) — o cast cai quando os tipos chegarem.
        const { data: affiliateData } = await (supabase as any)
          .from('affiliates')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        if (isStillCurrent()) {
          setLinkedAffiliateId((affiliateData as { id: string } | null)?.id ?? null);
        }
      } else if (isStillCurrent()) {
        setLinkedAffiliateId(null);
      }
      if (isStillCurrent()) {
        setAffiliateResolved(true);
      }
    };

    try {
      const result = await Promise.race([fetchAll(), timeoutPromise]);
      if (result === 'timeout') {
        console.warn('[Auth] fetchUserData timed out after 5s — proceeding with partial state');
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      if (isStillCurrent()) {
        setProfileLoading(false);
        // Mesmo em timeout/erro declaramos a detecção resolvida: com
        // `linkedAffiliateId` null o gate FECHA (mostra o erro retriável) em
        // vez de prender o usuário num spinner eterno. Se o fetch em vôo
        // terminar depois e achar o vínculo, o id entra e libera.
        setAffiliateResolved(true);
      }
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  // OAuth com Google. Redireciona o navegador pro Google e volta pra
  // /auth/callback (AuthCallback decide acesso/destino). `select_account` força
  // o seletor de contas do Google a cada vez (não loga silenciosamente na última).
  // O provider Google é habilitado no painel do Supabase (Client ID/Secret +
  // Redirect URLs) — nada de schema/SQL aqui.
  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    });
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
    // Logout é LOCAL (só este dispositivo). Sem `scope: 'local'` o default do
    // supabase-js v2 é 'global', que revoga os refresh tokens de TODOS os
    // dispositivos do usuário. Derrubar outras sessões é papel exclusivo do
    // mecanismo active_sessions + checkbox "desconectar outras sessões" no login.
    // Esse signOut também é chamado pelo useForcedLogout — com scope global
    // criava a cadeia: B desconecta A → A revoga global → derruba a sessão nova de B.
    await supabase.auth.signOut({ scope: 'local' });
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
    // Limpa a cache da marca usada no boot síncrono (index.html). Sem isto o
    // próximo usuário a logar neste aparelho veria a cor do tenant anterior
    // piscar no reload antes do useWhiteLabel re-rodar (regra-lei nº2).
    localStorage.removeItem('__wl_primary');
    localStorage.removeItem('__wl_gradient');
    queryClient.clear();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    setPermissions([]);
    setHasPermissionRecord(false);
    setAdminPermissions([]);
    setLinkedAffiliateId(null);
    setAffiliateResolved(false);
    setProfileLoading(false);
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdminOrGestor = () => hasRole('admin') || hasRole('gestor');
  
  // "Acesso total" = user has admin or super_admin role
  const isFullAccess = roles.includes('admin' as AppRole) || roles.includes('super_admin' as AppRole);

  // Permission check: admin / acesso total sempre liberam tudo. Para os demais:
  //   - Se há registro em user_permissions → respeita ESTRITAMENTE a lista
  //     (vazio = sem acesso). Fecha o furo do default-allow por role.
  //   - Sem registro (legado) → mantém o fallback por role.
  const hasPermission = (key: string) => {
    if (hasRole('admin') || isFullAccess) return true;
    // Curinga '*' = "Acesso Total" dinâmico: libera toda permissão, inclusive futuras.
    if (hasPermissionRecord) return permissions.includes('*') || permissions.includes(key);
    return roles.length > 0;
  };

  const hasScreenAccess = (screenKey: string) => {
    if (hasRole('admin') || isFullAccess) return true;
    // Curinga '*' = "Acesso Total" dinâmico: libera toda tela, inclusive futuras.
    if (hasPermissionRecord) return permissions.includes('*') || permissions.includes(screenKey);
    return roles.length > 0;
  };

  // Master (super_admin) sees every admin screen; vendedores see only what's in admin_permissions.
  const isMaster = roles.includes('super_admin' as AppRole);
  // Afiliado NUNCA entra aqui: ele não é admin (ver `linkedAffiliateId`).
  const isAdminUser = isMaster || adminPermissions.length > 0;
  const affiliateLoading = !!user && !affiliateResolved;
  const hasAdminScreenAccess = (key: string) => {
    if (isMaster) return true;
    // Afiliado externo entra no painel por VÍNCULO, sem `admin_permissions`.
    // A liberação é de UMA tela e só dela — qualquer outra `key` continua
    // caindo no `adminPermissions.includes`, que pro afiliado é sempre falso
    // (array vazio, pré-condição da própria detecção de vínculo).
    if (key === 'admin_afiliados' && !!linkedAffiliateId) return true;
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
        hasPermissionRecord,
        adminPermissions,
        isAdminUser,
        linkedAffiliateId,
        affiliateLoading,
        loading,
        profileLoading,
        signIn,
        signInWithGoogle,
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

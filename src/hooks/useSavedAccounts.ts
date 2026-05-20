// useSavedAccounts — gerenciador multi-conta em runtime.
//
// Cada SavedAccount é um login real (mesmas RLS, mesmo user_id), persistido
// localmente para o usuário trocar de sessão sem precisar digitar credenciais
// de novo. É 100% frontend + auth manipulation — zero migration, zero RPC.
//
// Storage: localStorage['dominex_saved_accounts'] = SavedAccount[]. A conta
// ATIVA NÃO entra na lista — a lista são as "outras contas". Ao trocar de A
// pra B, A é salva e B sai da lista.
//
// Por que `refreshSession` em vez de `setSession`? A implementação interna do
// Supabase exige `access_token` e `refresh_token` em `setSession` (string vazia
// é falsy e falha imediato). `refreshSession({ refresh_token })` aceita só o
// refresh_token, dispara o evento `SIGNED_IN` corretamente e cuida do refresh
// do access_token via /token endpoint.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { clearActiveSession, registerActiveSession } from '@/lib/sessionUtils';

const STORAGE_KEY = 'dominex_saved_accounts';
const MAX_ACCOUNTS = 5;

export type SavedAccount = {
  user_id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  company_name: string | null;
  is_super_admin: boolean;
  refresh_token: string;
  last_used_at: string; // ISO
};

export type ActiveAccount = Omit<SavedAccount, 'refresh_token'>;

function readStorage(): SavedAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is SavedAccount =>
        a && typeof a === 'object' && typeof a.user_id === 'string' && typeof a.refresh_token === 'string',
    );
  } catch {
    // Storage corrompido ou inacessível (Safari private mode) — retorna vazio
    // ao invés de quebrar UI. Próximo write sobrescreve com state limpo.
    return [];
  }
}

function writeStorage(accounts: SavedAccount[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    // Quota cheia / private mode — não vamos travar UI por isso.
  }
}

/**
 * Aplica regras de dedupe + limite ao adicionar/atualizar uma conta na lista.
 * Dedupe por user_id (atualiza refresh_token + last_used_at em vez de duplicar).
 * Limite 5 contas (FIFO por last_used_at — drop a mais antiga).
 */
function upsertAccount(accounts: SavedAccount[], next: SavedAccount): SavedAccount[] {
  const filtered = accounts.filter((a) => a.user_id !== next.user_id);
  const merged = [next, ...filtered];
  if (merged.length <= MAX_ACCOUNTS) return merged;
  // Drop oldest by last_used_at
  return [...merged]
    .sort((a, b) => b.last_used_at.localeCompare(a.last_used_at))
    .slice(0, MAX_ACCOUNTS);
}

async function fetchAccountMetadata(userId: string): Promise<{
  full_name: string;
  avatar_url: string | null;
  email: string;
  company_name: string | null;
  is_super_admin: boolean;
}> {
  // Profile + role + company_name em paralelo. Tudo defensivo — se falhar
  // alguma parte, usamos fallback (email do auth, nome vazio etc).
  const [profileRes, roleRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, avatar_url, email, company_id')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin')
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  const isSuperAdmin = !!roleRes.data;

  let companyName: string | null = null;
  if (profile?.company_id && !isSuperAdmin) {
    const { data: companyData } = await supabase
      .from('companies')
      .select('name')
      .eq('id', profile.company_id)
      .maybeSingle();
    companyName = companyData?.name ?? null;
  }

  // Email: profile.email é cópia do auth.users.email (existe na maioria),
  // fallback pro auth.user.email se possível.
  const { data: userResp } = await supabase.auth.getUser();
  const email = profile?.email ?? userResp.user?.email ?? '';

  return {
    full_name: profile?.full_name ?? email.split('@')[0] ?? 'Conta',
    avatar_url: profile?.avatar_url ?? null,
    email,
    company_name: companyName,
    is_super_admin: isSuperAdmin,
  };
}

export function useSavedAccounts() {
  const { user, profile, roles } = useAuth();
  const { toast } = useToast();
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>(() => readStorage());
  const [isSwitching, setIsSwitching] = useState(false);
  const [activeCompanyName, setActiveCompanyName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Mantém savedAccounts em sync com mudanças do localStorage feitas em outra
  // aba. Evento `storage` só dispara em ABAS DIFERENTES da que escreveu.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setSavedAccounts(readStorage());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Carrega nome da empresa da conta ativa (separado do profile pra não
  // depender de useCompanySettings — esse depende de useAuth e queremos
  // este hook reutilizável em qualquer canto).
  useEffect(() => {
    let cancelled = false;
    const isSuperAdmin = roles.includes('super_admin');
    if (!user || !profile?.company_id || isSuperAdmin) {
      setActiveCompanyName(null);
      return;
    }
    setIsLoading(true);
    supabase
      .from('companies')
      .select('name')
      .eq('id', profile.company_id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setActiveCompanyName(data?.name ?? null);
      })
      .then(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
      setIsLoading(false);
    };
  }, [user, profile?.company_id, roles]);

  const activeAccount: ActiveAccount | null = useMemo(() => {
    if (!user) return null;
    const isSuperAdmin = roles.includes('super_admin');
    return {
      user_id: user.id,
      email: user.email ?? profile?.email ?? '',
      full_name: profile?.full_name ?? user.email?.split('@')[0] ?? 'Conta',
      avatar_url: profile?.avatar_url ?? null,
      company_name: isSuperAdmin ? null : activeCompanyName,
      is_super_admin: isSuperAdmin,
      last_used_at: new Date().toISOString(),
    };
  }, [user, profile, roles, activeCompanyName]);

  /**
   * Salva a sessão ATUAL em `dominex_saved_accounts` antes de uma troca.
   * Retorna o snapshot salvo (com refresh_token), pra permitir rollback se
   * a troca subsequente falhar.
   */
  const snapshotCurrentSession = useCallback(async (): Promise<SavedAccount | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.refresh_token || !session.user) return null;

    const meta = await fetchAccountMetadata(session.user.id);
    const snapshot: SavedAccount = {
      user_id: session.user.id,
      email: meta.email || session.user.email || '',
      full_name: meta.full_name,
      avatar_url: meta.avatar_url,
      company_name: meta.company_name,
      is_super_admin: meta.is_super_admin,
      refresh_token: session.refresh_token,
      last_used_at: new Date().toISOString(),
    };

    const next = upsertAccount(readStorage(), snapshot);
    writeStorage(next);
    setSavedAccounts(next);
    return snapshot;
  }, []);

  const removeAccount = useCallback((userId: string) => {
    const next = readStorage().filter((a) => a.user_id !== userId);
    writeStorage(next);
    setSavedAccounts(next);
  }, []);

  /**
   * Restaura sessão anterior caso uma troca falhe no meio. Usa o snapshot
   * salvo antes da operação destrutiva (signOut local) pra não deixar o
   * usuário deslogado por causa de um erro.
   */
  const rollbackToSnapshot = useCallback(async (snapshot: SavedAccount) => {
    try {
      await supabase.auth.refreshSession({ refresh_token: snapshot.refresh_token });
      // Limpa a entrada que acabamos de salvar — agora é a sessão ativa de novo.
      const next = readStorage().filter((a) => a.user_id !== snapshot.user_id);
      writeStorage(next);
      setSavedAccounts(next);
    } catch {
      // Nada mais a fazer — usuário vai bater no /auth.
    }
  }, []);

  const switchToAccount = useCallback(
    async (targetUserId: string) => {
      if (isSwitching) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        toast({
          title: 'Sem conexão',
          description: 'Conecte-se à internet para trocar de conta.',
          variant: 'destructive',
        });
        return;
      }

      const target = readStorage().find((a) => a.user_id === targetUserId);
      if (!target) {
        toast({
          title: 'Conta não encontrada',
          description: 'Tente adicionar a conta novamente.',
          variant: 'destructive',
        });
        return;
      }

      // Capturado ANTES de qualquer signOut — precisamos do user_id da conta
      // ativa pra limpar a entrada certa em active_sessions.
      const currentUserId = user?.id ?? null;

      setIsSwitching(true);
      let snapshot: SavedAccount | null = null;
      try {
        // 1. Salva a conta atual ANTES de mexer na sessão.
        snapshot = await snapshotCurrentSession();

        // 2. Limpa active_session da conta atual ANTES do signOut — senão
        // a linha vira órfã (não há mais sessão pra ela em /token). Defensivo:
        // se falhar, segue o fluxo (UX > consistência absoluta).
        if (currentUserId) {
          await clearActiveSession(currentUserId);
        }

        // 3. Logout LOCAL apenas — não invalida refresh tokens no servidor,
        // senão o token que acabamos de salvar pra voltar deixa de funcionar.
        await supabase.auth.signOut({ scope: 'local' });

        // 4. Ativa a sessão alvo. refreshSession aceita só refresh_token e
        // dispara SIGNED_IN no AuthContext — não precisamos do access_token.
        const { data, error } = await supabase.auth.refreshSession({
          refresh_token: target.refresh_token,
        });

        if (error || !data.session) {
          throw error ?? new Error('Sessão inválida.');
        }

        // 5. Registra a nova active_session pra conta TARGET — agora é a
        // sessão ativa e precisa de uma entrada pra single-session funcionar.
        await registerActiveSession(targetUserId);

        // 6. Remove o alvo da lista — agora é a conta ativa.
        const next = readStorage().filter((a) => a.user_id !== targetUserId);
        writeStorage(next);

        // 7. Reload pra garantir estado limpo (queries, white-label, realtime).
        window.location.reload();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        // Token do alvo expirou ou foi revogado — remove da lista.
        removeAccount(targetUserId);
        toast({
          title: 'Esta conta expirou',
          description: 'Use "Adicionar conta" para entrar novamente.',
          variant: 'destructive',
        });
        // Restaura a sessão que acabamos de derrubar.
        if (snapshot) {
          await rollbackToSnapshot(snapshot);
          // Reativa o active_session da conta original — limpamos antes do
          // signOut, então precisa de uma nova entrada pra single-session voltar.
          await registerActiveSession(snapshot.user_id);
        }
        setIsSwitching(false);
        // Loga sem expor o refresh_token (apenas a mensagem do erro).
        console.warn('[useSavedAccounts] switch failed:', message);
      }
    },
    [isSwitching, snapshotCurrentSession, removeAccount, rollbackToSnapshot, toast, user?.id],
  );

  const addAccountAndSwitch = useCallback(
    async (email: string, password: string) => {
      if (isSwitching) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        toast({
          title: 'Sem conexão',
          description: 'Conecte-se à internet para adicionar uma conta.',
          variant: 'destructive',
        });
        return;
      }

      // Capturado ANTES do signIn — o signInWithPassword sobrescreve a
      // sessão ativa e perdemos o id da conta original.
      const currentUserId = user?.id ?? null;

      setIsSwitching(true);
      let snapshot: SavedAccount | null = null;
      try {
        // 1. Salva a sessão atual ANTES do signIn (que sobrescreve a sessão).
        snapshot = await snapshotCurrentSession();

        // 2. Limpa active_session da conta atual ANTES do signIn — senão a
        // linha vira órfã. Defensivo: pode não haver conta ativa (login
        // direto via AccountSwitcher sem sessão prévia).
        if (currentUserId) {
          await clearActiveSession(currentUserId);
        }

        // 3. Tenta login. Supabase troca automaticamente a sessão ativa.
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.session || !data.user) {
          throw error ?? new Error('Credenciais inválidas.');
        }

        // 4. Registra a active_session da NOVA conta — agora é a sessão ativa.
        await registerActiveSession(data.user.id);

        // 5. Se por acaso o usuário tentou adicionar a MESMA conta que já
        // estava ativa, removemos o snapshot duplicado da lista — fica como
        // "voltei pra mesma conta" e a list não cresce.
        if (snapshot && snapshot.user_id === data.user.id) {
          const cleaned = readStorage().filter((a) => a.user_id !== data.user!.id);
          writeStorage(cleaned);
        }

        // 6. Reload — AuthContext refaz tudo do zero, white-label novo etc.
        window.location.reload();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Credenciais inválidas.';
        // Reverter: se conseguimos salvar snapshot, tentamos voltar pra ele.
        // signInWithPassword com erro NÃO troca a sessão, então normalmente
        // não precisaria rollback — mas se algum efeito colateral derrubou,
        // garantimos.
        if (snapshot) {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            await rollbackToSnapshot(snapshot);
            // Limpamos o active_session antes do signIn — reativa pra conta original.
            await registerActiveSession(snapshot.user_id);
          } else {
            // Limpa snapshot salvo (não era pra estar lá — não trocamos).
            const cleaned = readStorage().filter((a) => a.user_id !== snapshot!.user_id);
            writeStorage(cleaned);
            setSavedAccounts(cleaned);
            // Sessão original ainda viva mas active_session foi limpa — reativa.
            await registerActiveSession(snapshot.user_id);
          }
        }
        toast({
          title: 'Não foi possível entrar',
          description: 'Verifique email e senha e tente novamente.',
          variant: 'destructive',
        });
        setIsSwitching(false);
        console.warn('[useSavedAccounts] add failed:', message);
        throw err;
      }
    },
    [isSwitching, snapshotCurrentSession, rollbackToSnapshot, toast, user?.id],
  );

  return {
    savedAccounts,
    activeAccount,
    isLoading,
    isSwitching,
    addAccountAndSwitch,
    switchToAccount,
    removeAccount,
  };
}

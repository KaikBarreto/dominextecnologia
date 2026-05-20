// Hook React do account switcher do Dominex. API alinhada com o
// EcoSistema (src/hooks/useSavedSessions.tsx), com integrações específicas
// do Dominex:
//   - sessionUtils.ts (active_sessions) — limpa entrada antiga e registra
//     entrada nova em todo fluxo de switch/add-account/remove. O EcoSistema
//     não tem essa tabela; o Dominex usa pra single-session enforcement
//     (useForcedLogout escuta deletes em realtime).
//
// Decisões de comportamento:
//   - `pruneLikelyExpired` no mount remove sessões >45d silenciosamente
//     ANTES do click. Margem do TTL 60d do refresh_token Supabase.
//   - `switchToSession` em sucesso PERSISTE o novo refresh_token rotacionado
//     pelo Supabase (sem isso, próxima troca pra mesma conta falha).
//   - `switchToSession` em falha NÃO faz rollback silencioso pra conta
//     atual — remove a conta morta + redirect pra /auth com email
//     pré-preenchido (decisão do Kaik: "clicar em conta expirada voltava
//     silenciosamente pra atual, confundindo").
//   - `clearAllSessions` faz signOut GLOBAL (sem scope) — invalida tudo
//     no servidor.
//   - Switch e add-account usam `scope: 'local'` no signOut intermediário
//     pra NÃO invalidar refresh_tokens salvos das outras contas.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SAVED_SESSIONS_STORAGE_KEY } from "@/lib/sessionCrypto";
import {
  loadStore,
  saveStore,
  addCurrentSessionToSavedStandalone,
  isAddingAccountStandalone,
  clearAddAccountFlagStandalone,
  setAddAccountFlagStandalone,
  EMPTY_STORE,
  MAX_SESSIONS,
  type SavedSession,
  type SavedSessionsStore,
} from "@/lib/savedSessions";
import { clearActiveSession, registerActiveSession } from "@/lib/sessionUtils";

export type { SavedSession } from "@/lib/savedSessions";

// Refresh token TTL padrão do Supabase é 60 dias rolling. Usamos margem
// CONSERVADORA de 45 dias — se passou disso sem uso, considera expirada
// e remove silenciosa. Evita mostrar contas mortas na UI que vão falhar
// no click. Validar via API teria custo (rotaciona token), então usamos
// last_used_at como proxy simples.
const SESSION_LIKELY_EXPIRED_MS = 45 * 24 * 60 * 60 * 1000; // 45 dias

function pruneLikelyExpired(store: SavedSessionsStore): {
  pruned: SavedSessionsStore;
  removedCount: number;
} {
  const now = Date.now();
  const valid = store.sessions.filter(
    (s) => now - s.last_used_at < SESSION_LIKELY_EXPIRED_MS,
  );
  const removedCount = store.sessions.length - valid.length;
  if (removedCount === 0) return { pruned: store, removedCount: 0 };
  return {
    pruned: {
      active_user_id: valid.some((s) => s.user_id === store.active_user_id)
        ? store.active_user_id
        : null,
      sessions: valid,
    },
    removedCount,
  };
}

export const useSavedSessions = () => {
  const [store, setStore] = useState<SavedSessionsStore>(EMPTY_STORE);
  const [isLoading, setIsLoading] = useState(true);

  // Load on mount + cleanup proativo de sessões provavelmente expiradas.
  // Threshold 45d (margem do TTL 60d do Supabase) — corta visualmente sem
  // precisar fazer chamada de API. Sessões válidas mas inativas (40-44d)
  // ainda aparecem; click ainda pode falhar e cai no flow de relogin.
  useEffect(() => {
    loadStore().then(async (s) => {
      const { pruned, removedCount } = pruneLikelyExpired(s);
      if (removedCount > 0) {
        console.info(
          `[useSavedSessions] ${removedCount} sessão(ões) > 45d removida(s) silenciosamente`,
        );
        await saveStore(pruned);
      }
      setStore(pruned);
      setIsLoading(false);
    });
  }, []);

  // Adiciona sessão atual ao store. Chamado após login bem-sucedido.
  const addCurrentSessionToSaved = useCallback(async () => {
    await addCurrentSessionToSavedStandalone();
    // Atualiza estado React após escrita
    const fresh = await loadStore();
    setStore(fresh);
  }, []);

  // Troca pra outra sessão salva. Faz full reload pra carregar contexto da nova empresa.
  //
  // Supabase rotaciona `refresh_token` a CADA uso — persistimos o novo
  // (`data.session.refresh_token`) na sessão alvo após refresh bem-sucedido.
  // Sem isso, o token salvo no store invalida após o primeiro uso.
  //
  // FALHA: se o refresh_token da conta clicada falhou (expirou, foi
  // invalidado por hard reload, etc), remove ela do store e manda pro
  // login com email pré-preenchido. SEM fallback silencioso pra outra
  // conta — user clicou em B porque QUER B, não outra.
  const switchToSession = useCallback(async (userId: string) => {
    const current = await loadStore();
    const target = current.sessions.find((s) => s.user_id === userId);
    if (!target) {
      console.warn("[useSavedSessions] Target session not found:", userId);
      return;
    }

    // Captura currentUserId pra limpar active_sessions antes do swap.
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const currentUserId = currentUser?.id ?? null;

    try {
      // 1. Limpa active_session da conta atual ANTES do refresh — senão
      // a linha vira órfã. Defensivo: se falhar, segue o fluxo.
      if (currentUserId) {
        await clearActiveSession(currentUserId);
      }

      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: target.refresh_token,
      });

      if (!error && data.session) {
        // SUCESSO — persistir NOVO refresh_token rotacionado pelo Supabase.
        // Sem isso, a próxima troca pra essa conta falha (token velho já
        // foi invalidado pelo refresh atual).
        const updated: SavedSession = {
          ...target,
          refresh_token: data.session.refresh_token,
          last_used_at: Date.now(),
        };
        const next: SavedSessionsStore = {
          active_user_id: userId,
          sessions: current.sessions.map((s) =>
            s.user_id === userId ? updated : s,
          ),
        };
        await saveStore(next);

        // Registra a nova active_session — agora ESTA é a sessão ativa.
        await registerActiveSession(userId);

        // Force refresh do profile/role pra refletir mudanças que possam
        // ter acontecido enquanto a conta estava inativa no switcher.
        try {
          await addCurrentSessionToSavedStandalone({ forceRefresh: true });
        } catch (e) {
          console.warn("[useSavedSessions] forceRefresh falhou, prosseguindo:", e);
        }

        // Full reload pra refetch tudo (modules, permissions, queries, etc.)
        window.location.replace("/dashboard");
        return;
      }

      // FALHA — remove a sessão expirada e vai pro login com email pré-preenchido.
      console.warn(
        "[useSavedSessions] Refresh token expirado pra",
        target.email,
        error,
      );

      const remaining = current.sessions.filter((s) => s.user_id !== userId);
      // active_user_id zerado se a conta clicada era a ativa (não deveria
      // acontecer no fluxo normal, mas defesa). Senão preserva.
      const nextStore: SavedSessionsStore = {
        active_user_id: current.active_user_id === userId ? null : current.active_user_id,
        sessions: remaining,
      };
      await saveStore(nextStore);
      setStore(nextStore);

      try {
        localStorage.setItem("__relogin_email", target.email);
      } catch { /* storage cheio: degrada silencioso */ }
      setAddAccountFlagStandalone();

      // scope: 'local' — só desloga ESSA aba/dispositivo. Sem 'local',
      // o signOut default é GLOBAL e invalida TODOS os refresh_tokens
      // salvos no switcher do user no servidor, quebrando troca de conta.
      await supabase.auth.signOut({ scope: "local" });
      window.location.replace("/auth");
    } catch (e) {
      console.error("[useSavedSessions] Auth error:", e);
    }
  }, []);

  // Remove uma sessão (logout local). Se for a ativa, faz signOut Supabase.
  const removeSession = useCallback(
    async (userId: string) => {
      const current = await loadStore();
      const isActive = current.active_user_id === userId;
      const remaining = current.sessions.filter((s) => s.user_id !== userId);

      if (isActive) {
        // Tenta switch automático pra mais recente das restantes
        if (remaining.length > 0) {
          const fallback = [...remaining].sort(
            (a, b) => b.last_used_at - a.last_used_at,
          )[0];
          await saveStore({ active_user_id: null, sessions: remaining });
          await switchToSession(fallback.user_id);
          return;
        }
        // Sem fallback — limpa active_session, signOut local e vai pra
        // /auth (preserva refresh_tokens de outras sessões no servidor
        // pra usuário voltar).
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await clearActiveSession(user.id);
        await supabase.auth.signOut({ scope: "local" });
        await saveStore({ active_user_id: null, sessions: [] });
        setStore({ active_user_id: null, sessions: [] });
        window.location.replace("/auth");
        return;
      }

      const next: SavedSessionsStore = {
        active_user_id: current.active_user_id,
        sessions: remaining,
      };
      await saveStore(next);
      setStore(next);
    },
    [switchToSession],
  );

  const clearAllSessions = useCallback(async () => {
    // signOut GLOBAL (sem scope) — invalida TODOS os refresh_tokens
    // do user no servidor. Limpa active_session da conta atual antes.
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await clearActiveSession(user.id);
    await supabase.auth.signOut();
    localStorage.removeItem(SAVED_SESSIONS_STORAGE_KEY);
    setStore(EMPTY_STORE);
    window.location.replace("/auth");
  }, []);

  // Inicia fluxo de "Adicionar conta": salva a sessão atual no store
  // criptografado, limpa active_session, desloga LOCAL do Supabase (pra
  // liberar a tela de login) e navega pra /auth. Após login bem-sucedido,
  // o AuthContext (SIGNED_IN) chama addCurrentSessionToSavedStandalone()
  // de novo pra incluir a nova conta no switcher.
  const startAddAccount = useCallback(async () => {
    // Garantir que conta atual está salva ANTES de deslogar
    await addCurrentSessionToSavedStandalone();
    // Setar flag pra Auth.tsx NÃO redirecionar automaticamente caso
    // Supabase auto-restaure sessão.
    setAddAccountFlagStandalone();
    // Limpar active_session da conta atual ANTES do signOut — senão a
    // linha vira órfã. (Dominex specific — sessionUtils.)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await clearActiveSession(user.id);
    // Deslogar do Supabase pra liberar a tela de login. scope: 'local'
    // CRÍTICO — sem isso, signOut default invalida TODOS os refresh_tokens
    // salvos no switcher (incluindo o que acabou de ser salvo da conta
    // atual!), quebrando a troca de conta posterior.
    await supabase.auth.signOut({ scope: "local" });
    // Navegar pra /auth (modo login normal — sem tela especial, mas com
    // flag que bloqueia redirect automático até novo login confirmar).
    window.location.replace("/auth");
  }, []);

  const isAddingAccount = (): boolean => {
    return isAddingAccountStandalone();
  };

  const clearAddAccountFlag = () => {
    clearAddAccountFlagStandalone();
  };

  const activeSession =
    store.sessions.find((s) => s.user_id === store.active_user_id) || null;
  const otherSessions = store.sessions.filter(
    (s) => s.user_id !== store.active_user_id,
  );

  return {
    sessions: store.sessions,
    activeSession,
    otherSessions,
    isLoading,
    canAddMore: store.sessions.length < MAX_SESSIONS,
    addCurrentSessionToSaved,
    switchToSession,
    removeSession,
    clearAllSessions,
    startAddAccount,
    isAddingAccount,
    clearAddAccountFlag,
  };
};

// sessionUtils — helpers compartilhados pra ciclo de vida de `active_sessions`.
//
// `active_sessions` é a tabela auxiliar que sustenta o single-session enforcement
// (`useForcedLogout`): cada sessão ativa do usuário tem uma linha com
// `session_token` único, e o token é persistido em `localStorage`. Quando um
// dispositivo desconecta o outro, deleta a linha do outro — o realtime escuta
// e força logout no dispositivo afetado.
//
// Esses helpers foram extraídos de `Auth.tsx` pra serem reusados no
// `useSavedAccounts` (troca de conta multi-login). Sem isso, ao trocar de A
// pra B sem passar pelo login normal, A fica órfã em `active_sessions` e B
// não ganha entrada — single-session quebra.
//
// Política de erros: ambos os helpers são DEFENSIVOS. Se a tabela retornar
// erro (RLS, network), apenas logamos com console.warn — NÃO bloqueamos o
// fluxo de switch. UX > consistência absoluta de tabela auxiliar.

import { supabase } from "@/integrations/supabase/client";

export const generateSessionToken = () => crypto.randomUUID();

export const getDeviceInfo = (): string => {
  const ua = navigator.userAgent;
  const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
  const browser = /Chrome/.test(ua)
    ? "Chrome"
    : /Firefox/.test(ua)
    ? "Firefox"
    : /Safari/.test(ua)
    ? "Safari"
    : "Outro";
  return `${isMobile ? "Mobile" : "Desktop"} - ${browser}`;
};

/**
 * Cria uma nova linha em active_sessions pro user dado, salva o token em localStorage.
 * Use após signIn / refreshSession bem-sucedido em fluxos fora do Auth.tsx (ex: AccountSwitcher).
 *
 * Idempotente em relação ao localStorage — se já houver um session_token salvo,
 * ele é sobrescrito (a linha anterior em active_sessions vira órfã caso não tenha
 * sido limpa antes; chame `clearActiveSession` primeiro pra evitar isso).
 */
export async function registerActiveSession(userId: string): Promise<string> {
  const sessionToken = generateSessionToken();
  const { error } = await supabase
    .from("active_sessions")
    .insert({
      user_id: userId,
      session_token: sessionToken,
      device_info: getDeviceInfo(),
      last_activity: new Date().toISOString(),
    });
  if (error) {
    // Não bloqueia o fluxo — só registra. RLS ou network podem falhar; o
    // switch ainda é melhor que travar a UX por inconsistência da tabela.
    console.warn("[sessionUtils] Falha ao registrar active_session:", error.message);
  }
  localStorage.setItem("session_token", sessionToken);
  return sessionToken;
}

/**
 * Remove a linha em active_sessions correspondente ao session_token atual em localStorage,
 * e limpa o session_token do localStorage. Idempotente — chama múltiplas vezes sem erro.
 * Use ANTES de trocar de conta no AccountSwitcher.
 */
export async function clearActiveSession(userId: string): Promise<void> {
  const sessionToken = localStorage.getItem("session_token");
  if (!sessionToken) return;
  // CRÍTICO: limpa localStorage ANTES do delete no banco. O realtime DELETE
  // dispara em paralelo no `useForcedLogout` (mesmo no próprio dispositivo).
  // Se chegar lá enquanto `localStorage.session_token` ainda existe, o hook
  // interpreta como "outra sessão me desconectou" e dispara `signOut()`
  // global, criando race condition com o `refreshSession` da nova conta
  // (incidente do AccountSwitcher 1.8.30: trocar de conta apagava a sessão
  // recém-aberta e jogava o user pra /login).
  //
  // Limpando localStorage antes, quando o realtime DELETE chega no callback
  // do useForcedLogout, o `getItem("session_token")` retorna null e o hook
  // ignora — o que é o comportamento certo pra self-deletion.
  localStorage.removeItem("session_token");
  const { error } = await supabase
    .from("active_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("session_token", sessionToken);
  if (error) {
    console.warn("[sessionUtils] Falha ao limpar active_session:", error.message);
    // Não bloqueia
  }
}

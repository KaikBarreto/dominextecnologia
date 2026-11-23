// postLogin — núcleo reutilizável do "depois do login bem-sucedido".
//
// Extraído de `Auth.tsx` para ser compartilhado entre o login email/senha e o
// retorno do OAuth (Google) em `AuthCallback.tsx`. Mantém UMA fonte da verdade
// para:
//   - registrar a sessão em `active_sessions` (single-session enforcement);
//   - decidir se a conta tem acesso ao sistema (super_admin OU ≥1 user_role);
//   - resolver o destino pós-login (admin / checkout / agenda / dashboard).
//
// IMPORTANTE: estes helpers NÃO emitem toast nem navegam — só calculam/efetuam
// o trabalho de dados. Quem chama (Auth.tsx, AuthCallback.tsx) decide UX.

import { supabase } from "@/integrations/supabase/client";
import { generateSessionToken, getDeviceInfo } from "@/lib/sessionUtils";

export const POST_LOGIN_TIMEOUT_MS = 12_000;

export class PostLoginTimeoutError extends Error {
  constructor(public readonly step: string) {
    super(`Post-login step timed out: ${step}`);
    this.name = "PostLoginTimeoutError";
  }
}

export async function withPostLoginTimeout<T>(
  operation: PromiseLike<T>,
  step: string,
  timeoutMs = POST_LOGIN_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new PostLoginTimeoutError(step)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function removeRegisteredSession(userId: string, sessionToken: string): Promise<void> {
  // O monitor realtime interpreta o DELETE da linha cujo token ainda está no
  // navegador como uma expulsão remota. Limpar primeiro transforma este caso
  // em self-deletion e evita que o rollback dispare um segundo signOut.
  if (localStorage.getItem("session_token") === sessionToken) {
    localStorage.removeItem("session_token");
  }
  const { error } = await supabase
    .from("active_sessions")
    .delete()
    .eq("user_id", userId)
    .eq("session_token", sessionToken);
  if (error) throw error;
}

async function disconnectOtherRegisteredSessions(
  userId: string,
  currentToken: string,
): Promise<void> {
  const { error } = await withPostLoginTimeout(
    supabase
      .from("active_sessions")
      .delete()
      .eq("user_id", userId)
      .neq("session_token", currentToken),
    "disconnect-other-sessions",
  );
  if (error) throw error;
}

/**
 * Cria a linha em `active_sessions` pro usuário e persiste o `session_token` no
 * localStorage. Corpo idêntico ao `registerSession` histórico do `Auth.tsx`.
 *
 * Sessão admin-como-usuário (Token de Acesso) NÃO entra em active_sessions: é
 * temporária e não pode expulsar nem aparecer entre as sessões reais do usuário.
 * Retorna o token criado, ou `null` quando for sessão de Token de Acesso.
 */
export async function registerSession(userId: string): Promise<string | null> {
  if (localStorage.getItem("is_admin_token_session") === "true") {
    return null;
  }
  const sessionToken = generateSessionToken();
  const previousToken = localStorage.getItem("session_token");
  const insertPromise = Promise.resolve(supabase.from("active_sessions").insert({
    user_id: userId,
    session_token: sessionToken,
    device_info: getDeviceInfo(),
    last_activity: new Date().toISOString(),
  }));

  try {
    const { error } = await withPostLoginTimeout(insertPromise, "register-active-session");
    if (error) throw error;
  } catch (error) {
    // O fetch não é cancelável. Se ele concluir após o timeout, removemos a
    // linha que teria ficado órfã sem liberar a sessão local.
    void insertPromise.then(({ error: lateError }) => {
      if (!lateError) void removeRegisteredSession(userId, sessionToken);
    });
    throw error;
  }

  localStorage.setItem("session_token", sessionToken);

  // Um reload interrompido podia deixar o token anterior deste dispositivo
  // na tabela. A limpeza é best-effort e não segura o caminho feliz.
  if (previousToken && previousToken !== sessionToken) {
    void removeRegisteredSession(userId, previousToken).catch((error) =>
      console.warn("[postLogin] stale active session cleanup failed:", error),
    );
  }
  return sessionToken;
}

/**
 * Define se a conta TEM acesso ao Dominex. Espelha o guard do app (incidente
 * Glacial): acesso real = super_admin OU possui ≥1 linha em `user_roles`.
 *
 * Usado pelo retorno do OAuth para barrar contas Google desconhecidas (sem
 * vínculo de empresa/role) — sem auto-cadastro. Defensivo: em erro de query,
 * retorna false (nega o acesso) pra não liberar conta sem vínculo confirmado.
 */
export async function hasSystemAccess(userId: string): Promise<boolean> {
  try {
    const { data, error } = await withPostLoginTimeout(
      supabase.from("user_roles").select("role").eq("user_id", userId),
      "check-system-access",
    );
    if (error) {
      console.warn("[postLogin] hasSystemAccess query failed:", error.message);
      return false;
    }
    return (data ?? []).length > 0;
  } catch (e) {
    console.warn("[postLogin] hasSystemAccess threw:", e);
    return false;
  }
}

/**
 * Resolve o destino pós-login para um usuário com acesso. Mesma árvore de
 * decisão do `completeLogin` do `Auth.tsx`:
 *   - super_admin → /admin/empresas
 *   - empresa pending_payment SEM payment_lock_bypass → /checkout
 *   - papel inclui 'tecnico' → /agenda
 *   - demais → /dashboard
 */
export async function resolvePostLoginRedirect(userId: string): Promise<string> {
  const [rolesResult, profileResult] = await Promise.all([
    withPostLoginTimeout(
      supabase.from("user_roles").select("role").eq("user_id", userId),
      "load-login-roles",
    ),
    withPostLoginTimeout(
      supabase.from("profiles").select("company_id").eq("user_id", userId).maybeSingle(),
      "load-login-profile",
    ),
  ]);

  if (rolesResult.error) throw rolesResult.error;
  if (profileResult.error) throw profileResult.error;

  const rolesData = rolesResult.data;
  const userRoles = (rolesData ?? []).map((row) => row.role);

  // O app e as policies consideram acesso real somente com papel explícito.
  // Em estado desconhecido ou sem vínculo, nunca cair no dashboard por padrão.
  if (userRoles.length === 0) {
    throw new Error("Authenticated user has no system role");
  }

  if (userRoles.includes("super_admin")) {
    return "/admin/empresas";
  }

  const profileData = profileResult.data;

  if (profileData?.company_id) {
    const { data: companyData, error: companyError } = await withPostLoginTimeout(
      supabase
        .from("companies")
        .select("subscription_status, payment_lock_bypass")
        .eq("id", profileData.company_id)
        .maybeSingle(),
      "load-login-company",
    );
    if (companyError) throw companyError;
    // pending_payment manda pro checkout, EXCETO se a empresa tem bypass
    // liberado (payment_lock_bypass === true). Comparação estrita:
    // null/undefined nunca abre exceção.
    const hasBypass = companyData?.payment_lock_bypass === true;
    if (companyData?.subscription_status === "pending_payment" && !hasBypass) {
      return "/checkout";
    }
  }

  if (userRoles.includes("tecnico")) {
    return "/agenda";
  }
  return "/dashboard";
}

export type RecentActiveSession = {
  device_info: string | null;
  last_activity: string;
};

export async function findRecentOtherSessions(
  userId: string,
  currentToken: string | null,
): Promise<RecentActiveSession[]> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await withPostLoginTimeout(
    supabase
      .from("active_sessions")
      .select("device_info, last_activity")
      .eq("user_id", userId)
      .neq("session_token", currentToken || "___none___")
      .gte("last_activity", oneHourAgo)
      .order("last_activity", { ascending: false })
      .limit(10),
    "check-active-sessions",
  );
  if (error) throw error;
  return (data ?? []) as RecentActiveSession[];
}

/**
 * Executa os dois ramos independentes do bootstrap em paralelo. Em falha,
 * desfaz o registro local criado nesta tentativa para não deixar sessão órfã.
 */
export async function bootstrapPostLoginSession(
  userId: string,
  options?: { disconnectOthers?: boolean },
): Promise<{
  destination: string;
  sessionToken: string | null;
}> {
  let registeredToken: string | null = null;
  const registration = registerSession(userId).then((token) => {
    registeredToken = token;
    return token;
  });
  const redirect = resolvePostLoginRedirect(userId);
  const [registrationResult, redirectResult] = await Promise.allSettled([
    registration,
    redirect,
  ]);

  if (registrationResult.status === "rejected" || redirectResult.status === "rejected") {
    if (registeredToken) {
      await removeRegisteredSession(userId, registeredToken).catch((cleanupError) =>
        console.warn("[postLogin] failed bootstrap cleanup failed:", cleanupError),
      );
    }
    if (registrationResult.status === "rejected") throw registrationResult.reason;
    throw redirectResult.status === "rejected" ? redirectResult.reason : new Error("Post-login failed");
  }

  const sessionToken = registrationResult.value;
  if (options?.disconnectOthers && sessionToken) {
    try {
      await disconnectOtherRegisteredSessions(userId, sessionToken);
    } catch (error) {
      await removeRegisteredSession(userId, sessionToken).catch((cleanupError) =>
        console.warn("[postLogin] failed disconnect rollback cleanup failed:", cleanupError),
      );
      throw error;
    }
  }

  return {
    destination: redirectResult.value,
    sessionToken,
  };
}

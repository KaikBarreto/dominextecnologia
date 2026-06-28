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
  await supabase.from("active_sessions").insert({
    user_id: userId,
    session_token: sessionToken,
    device_info: getDeviceInfo(),
    last_activity: new Date().toISOString(),
  });
  localStorage.setItem("session_token", sessionToken);
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
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
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
  const { data: rolesData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const userRoles = (rolesData ?? []).map((r: any) => r.role as string);

  if (userRoles.includes("super_admin")) {
    return "/admin/empresas";
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileData?.company_id) {
    const { data: companyData } = await supabase
      .from("companies")
      .select("subscription_status, payment_lock_bypass")
      .eq("id", profileData.company_id)
      .maybeSingle();
    // pending_payment manda pro checkout, EXCETO se a empresa tem bypass
    // liberado (payment_lock_bypass === true). Cast as any: coluna ainda não
    // está no types.ts. Comparação estrita: null/undefined nunca abre exceção.
    const hasBypass = (companyData as any)?.payment_lock_bypass === true;
    if (companyData?.subscription_status === "pending_payment" && !hasBypass) {
      return "/checkout";
    }
  }

  if (userRoles.includes("tecnico")) {
    return "/agenda";
  }
  return "/dashboard";
}

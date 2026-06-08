// Autorização compartilhada das edge functions Asaas (checkout de assinatura SaaS).
// ------------------------------------------------------------------------------
// Regra: o checkout é usado pelo PRÓPRIO CLIENTE (tenant) pagando a assinatura
// quando o trial acaba — NÃO só pelo super_admin da Auctus.
//
// Portanto a operação é permitida se:
//   - o usuário autenticado pertence à MESMA empresa do payload (company_id), OU
//   - o usuário é super_admin (painel master Auctus pode agir sobre qualquer empresa).
//
// Tenant do usuário resolvido pelo mesmo mecanismo canônico do app Dominex:
// profiles.company_id pelo user_id (ver generate-pmoc-*-pdf). super_admin via
// has_role (consistente com o resto das edge functions). Segurança é server-side:
// frontend só esconde botão.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AsaasAuthResult {
  /** true se a autorização passou. */
  ok: boolean;
  /** Quando ok=false: status HTTP a devolver. */
  status?: number;
  /** Quando ok=false: mensagem cliente-facing em PT-BR. */
  message?: string;
  /** Quando ok=true: id do usuário autenticado. */
  userId?: string;
  /** Quando ok=true: empresa do usuário (null se super_admin sem company). */
  userCompanyId?: string | null;
  /** Quando ok=true: se o usuário é super_admin. */
  isSuperAdmin?: boolean;
}

/**
 * Valida que o usuário autenticado pode agir sobre `companyId`.
 * O cliente Supabase precisa ser service_role (faz getUser do token + leituras).
 */
export async function authorizeAsaasCompany(
  supabase: SupabaseClient,
  authHeader: string | null,
  companyId: string | null | undefined,
): Promise<AsaasAuthResult> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Autenticação necessária." };
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { ok: false, status: 401, message: "Token inválido." };
  }

  // super_admin via has_role (bypass de tenant — pode agir sobre qualquer empresa).
  const { data: isSuperAdmin } = await supabase.rpc("has_role", {
    _user_id: user.id,
    _role: "super_admin",
  });

  // Tenant do usuário (mecanismo canônico: profiles.company_id pelo user_id).
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const userCompanyId = profileRow?.company_id ?? null;

  if (!companyId) {
    // company_id ausente é erro de validação do payload — deixa a função tratar,
    // mas já devolvemos o contexto de auth resolvido.
    return {
      ok: true,
      userId: user.id,
      userCompanyId,
      isSuperAdmin: Boolean(isSuperAdmin),
    };
  }

  const sameCompany = userCompanyId != null && userCompanyId === companyId;
  if (!isSuperAdmin && !sameCompany) {
    return { ok: false, status: 403, message: "Você não tem permissão para esta empresa." };
  }

  return {
    ok: true,
    userId: user.id,
    userCompanyId,
    isSuperAdmin: Boolean(isSuperAdmin),
  };
}

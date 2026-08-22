// Gate de auth comum às edge functions privilegiadas do add-on "Cobranças"
// (recebimento do cliente final via Asaas — modelo BYO, plano §9.5).
//
// Contrato (tenant-asaas-provision / tenant-asaas-create-charge, modo autenticado):
//   1. Authorization: Bearer <jwt> obrigatório → auth.getUser() → userId. 401 se falhar.
//   2. profiles.company_id do user (NUNCA do payload — anti-vazamento cross-tenant). 403 se null.
//   3. Gate de módulo: company_has_module(company_id, 'cobrancas'). 403 se false.
//   4. Gate de ação: can_manage_system(userId) (honra '*' Acesso Total no server). 403 se false.
//   5. Escritas via service_role client (bypassa RLS) sempre filtradas por company_id.
//
// Espelha _shared/whatsapp-auth.ts, trocando só o código do módulo pra 'cobrancas'.
// Segurança é SERVER-SIDE (regra-lei #6): o frontend só esconde botão.
//
// Retorna { ok: true, userId, companyId, supabase } ou { ok: false, response }.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "./cors.ts";

export function jsonResponse(
  req: Request,
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      ...extraHeaders,
    },
  });
}

export interface PaymentsAuthOk {
  ok: true;
  userId: string;
  companyId: string;
  /** Email do usuário autenticado (fallback pra campos obrigatórios de terceiros, ex.: webhook Asaas). */
  userEmail: string | null;
  /** service-role client (RLS bypass — filtrar por company_id sempre). */
  supabase: SupabaseClient;
}
export interface PaymentsAuthFail {
  ok: false;
  response: Response;
}
export type PaymentsAuthResult = PaymentsAuthOk | PaymentsAuthFail;

/**
 * Aplica o gate de auth/módulo/ação do add-on "Cobranças". Devolve o service-role
 * client e o companyId já resolvidos, ou uma Response de erro pronta.
 */
export async function authorizePaymentsManager(req: Request): Promise<PaymentsAuthResult> {
  // ---- 1. Authorization Bearer obrigatório
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      response: jsonResponse(req, {
        error: "Sessão expirada. Faça login novamente.",
      }, 401),
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Client autenticado só pra resolver o user a partir do JWT.
  const authedClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authedClient.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return {
      ok: false,
      response: jsonResponse(req, {
        error: "Sessão expirada. Faça login novamente.",
      }, 401),
    };
  }
  const userId = userData.user.id;
  const userEmail = userData.user.email ?? null;

  // ---- service-role client pra todas as queries/escritas (RLS bypass).
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ---- 2. company_id do profile (NUNCA do payload)
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  const companyId = profileRow?.company_id ?? null;
  if (!companyId) {
    return {
      ok: false,
      response: jsonResponse(req, {
        error: "Sua conta não está vinculada a uma empresa.",
      }, 403),
    };
  }

  // ---- 3. Gate de módulo: 'cobrancas' (add-on Cobranças)
  const { data: hasModule, error: moduleErr } = await supabase.rpc("company_has_module", {
    p_company_id: companyId,
    p_module_code: "cobrancas",
  });
  if (moduleErr) {
    console.error("[payments-auth] company_has_module error", { message: moduleErr.message });
    return {
      ok: false,
      response: jsonResponse(req, {
        error: "Falha ao verificar o módulo de Cobranças.",
      }, 500),
    };
  }
  if (hasModule !== true) {
    return {
      ok: false,
      response: jsonResponse(req, {
        error: "O módulo de Cobranças não está ativo no seu plano.",
      }, 403),
    };
  }

  // ---- 4. Gate de ação: can_manage_system (honra '*' Acesso Total no server)
  const { data: canManage, error: manageErr } = await supabase.rpc("can_manage_system", {
    _user_id: userId,
  });
  if (manageErr) {
    console.error("[payments-auth] can_manage_system error", { message: manageErr.message });
    return {
      ok: false,
      response: jsonResponse(req, {
        error: "Falha ao verificar suas permissões.",
      }, 500),
    };
  }
  if (canManage !== true) {
    return {
      ok: false,
      response: jsonResponse(req, {
        error:
          "Você não tem permissão para gerenciar Cobranças. Peça acesso ao administrador da sua empresa.",
      }, 403),
    };
  }

  return { ok: true, userId, companyId, userEmail, supabase };
}

// ---------------------------------------------------------------------------
// Helpers de Vault (por tenant). Os nomes de secret são determinísticos por
// company_id (idempotente na re-ativação), plano §9.1.
// ---------------------------------------------------------------------------

/** Nome do secret da API key BYO do tenant no Vault. */
export function vaultKeySecretName(companyId: string): string {
  return `tenant_asaas_key_${companyId}`;
}

/** Nome do secret do token do webhook (gerado por nós) no Vault. */
export function vaultWebhookTokenSecretName(companyId: string): string {
  return `tenant_asaas_webhook_token_${companyId}`;
}

/**
 * Grava/atualiza um secret no Vault via RPC SECURITY DEFINER (só service_role).
 * DEPENDÊNCIA: `vault_upsert_tenant_secret(p_name, p_secret)` — criada pelo dev-database.
 */
export async function vaultUpsertSecret(
  supabase: SupabaseClient,
  name: string,
  secret: string,
): Promise<void> {
  const { error } = await supabase.rpc("vault_upsert_tenant_secret", {
    p_name: name,
    p_secret: secret,
  });
  if (error) {
    throw new Error(`vault_upsert_tenant_secret falhou (${name}): ${error.message}`);
  }
}

/**
 * Lê (decripta) um secret do Vault via RPC SECURITY DEFINER (só service_role).
 * DEPENDÊNCIA: `vault_read_tenant_secret(p_name) returns text`.
 * Retorna null se não existir.
 */
export async function vaultReadSecret(
  supabase: SupabaseClient,
  name: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("vault_read_tenant_secret", {
    p_name: name,
  });
  if (error) {
    throw new Error(`vault_read_tenant_secret falhou (${name}): ${error.message}`);
  }
  const value = typeof data === "string" ? data : null;
  return value && value.length > 0 ? value : null;
}

/**
 * Apaga um secret do Vault via RPC SECURITY DEFINER (só service_role).
 * DEPENDÊNCIA: `vault_delete_tenant_secret(p_name)`. Usado no `deactivate`.
 */
export async function vaultDeleteSecret(
  supabase: SupabaseClient,
  name: string,
): Promise<void> {
  const { error } = await supabase.rpc("vault_delete_tenant_secret", {
    p_name: name,
  });
  if (error) {
    // Não-fatal: apagar secret inexistente não deve travar o deactivate.
    console.error(`[vault] delete falhou (${name}, não-fatal):`, error.message);
  }
}

/** Gera o token do webhook: 48 bytes → 96 chars hex (dentro do range Asaas 32–255). */
export function generateWebhookToken(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Gera um short code público (12 chars, base32 sem ambíguos) pra URL do checkout.
 * Espelha o padrão de `src/utils/prettyLinks.ts` (não importável em edge Deno).
 */
export function generateShortCode(): string {
  const alphabet = "abcdefghjklmnpqrstuvwxyz23456789"; // sem i, o, 0, 1 — minusculo, bate com SHORT_CODE_RE
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Slug simples a partir de um texto (pra compor a URL amigável do checkout). */
export function slugify(text: string): string {
  return (text || "cobranca")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "cobranca";
}

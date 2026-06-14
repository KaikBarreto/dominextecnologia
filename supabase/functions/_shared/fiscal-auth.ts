// Gate de auth comum às edge functions de onboarding fiscal (Fisqal / NFS-e).
//
// Contrato (todas as edges fiscais de gestão):
//   1. Authorization: Bearer <jwt> obrigatório → auth.getUser() → userId. 401 se falhar.
//   2. profiles.company_id do user. 403 se null.
//   3. Gate de módulo: company_has_module(company_id, 'nfe'). 403 'module_inactive' se false.
//   4. Gate de ação: can_manage_system(userId) (honra '*' Acesso Total no server). 403 se false.
//   5. Escritas via service_role client (bypassa RLS) sempre filtradas por company_id.
//
// Retorna { ok: true, userId, companyId, supabase } ou { ok: false, response }.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      ...extraHeaders,
    },
  });
}

export interface FiscalAuthOk {
  ok: true;
  userId: string;
  companyId: string;
  /** service-role client (RLS bypass — filtrar por company_id sempre). */
  supabase: SupabaseClient;
}
export interface FiscalAuthFail {
  ok: false;
  response: Response;
}
export type FiscalAuthResult = FiscalAuthOk | FiscalAuthFail;

/**
 * Aplica o gate de auth/módulo/ação comum. Devolve o service-role client e
 * o companyId já resolvidos, ou uma Response de erro pronta pra retornar.
 */
export async function authorizeFiscalManager(req: Request): Promise<FiscalAuthResult> {
  // ---- 1. Authorization Bearer obrigatório
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "unauthorized", message: "Sessão expirada. Faça login novamente." },
        401,
      ),
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
      response: jsonResponse(
        { error: "unauthorized", message: "Sessão expirada. Faça login novamente." },
        401,
      ),
    };
  }
  const userId = userData.user.id;

  // ---- service-role client pra todas as queries/escritas (RLS bypass).
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ---- 2. company_id do profile
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  const companyId = profileRow?.company_id ?? null;
  if (!companyId) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "no_company", message: "Sua conta não está vinculada a uma empresa." },
        403,
      ),
    };
  }

  // ---- 3. Gate de módulo: 'nfe' (Notas Fiscais)
  const { data: hasModule, error: moduleErr } = await supabase.rpc("company_has_module", {
    p_company_id: companyId,
    p_module_code: "nfe",
  });
  if (moduleErr) {
    console.error("[fiscal-auth] company_has_module error", { message: moduleErr.message });
    return {
      ok: false,
      response: jsonResponse(
        { error: "internal_error", message: "Falha ao verificar o módulo de Notas Fiscais." },
        500,
      ),
    };
  }
  if (hasModule !== true) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: "module_inactive",
          message: "O módulo de Notas Fiscais não está ativo no seu plano.",
        },
        403,
      ),
    };
  }

  // ---- 4. Gate de ação: can_manage_system (honra '*' Acesso Total no server)
  const { data: canManage, error: manageErr } = await supabase.rpc("can_manage_system", {
    _user_id: userId,
  });
  if (manageErr) {
    console.error("[fiscal-auth] can_manage_system error", { message: manageErr.message });
    return {
      ok: false,
      response: jsonResponse(
        { error: "internal_error", message: "Falha ao verificar suas permissões." },
        500,
      ),
    };
  }
  if (canManage !== true) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: "forbidden",
          message:
            "Você não tem permissão para configurar a emissão de notas fiscais. Peça acesso ao administrador da sua empresa.",
        },
        403,
      ),
    };
  }

  return { ok: true, userId, companyId, supabase };
}

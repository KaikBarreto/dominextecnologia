// Emissão de mercadorias usa ação granular; configurações mantêm authorizeFiscalManager.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  // supabase-js (functions.invoke) envia apikey + x-client-info no preflight;
  // sem eles listados, o OPTIONS falha e o browser bloqueia o invoke.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
export async function authorizeFiscalGoodsIssuer(req: Request): Promise<FiscalAuthResult> {
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
    .select("company_id, is_active")
    .eq("user_id", userId)
    .maybeSingle();
  const companyId = profileRow?.is_active === true ? profileRow.company_id : null;
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
    console.error("[fiscal-goods-auth] module_check_failed");
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
  const { data: canManage, error: manageErr } = await supabase.rpc("fiscal_user_can_emit_goods", {
    p_user_id: userId,
  });
  if (manageErr) {
    console.error("[fiscal-goods-auth] permission_check_failed");
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
            "Você não tem permissão para emitir notas fiscais. Peça acesso ao administrador da sua empresa.",
        },
        403,
      ),
    };
  }

  return { ok: true, userId, companyId, supabase };
}

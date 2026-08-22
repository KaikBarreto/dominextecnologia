// Gate de auth comum às edge functions do add-on "Avisos de WhatsApp".
//
// Contrato (edges de gestão whatsapp-connect / whatsapp-send no modo autenticado):
//   1. Authorization: Bearer <jwt> obrigatório → auth.getUser() → userId. 401 se falhar.
//   2. profiles.company_id do user. 403 se null.
//   3. Gate de módulo: company_has_module(company_id, 'whatsapp'). 403 se false.
//   4. Gate de ação: can_manage_system(userId) (honra '*' Acesso Total no server). 403 se false.
//   5. Escritas via service_role client (bypassa RLS) sempre filtradas por company_id.
//
// Espelha _shared/fiscal-auth.ts (mesmo mecanismo canônico de tenant/permissão),
// trocando só o código do módulo pra 'whatsapp'. Segurança é SERVER-SIDE
// (regra-lei 6): o frontend só esconde botão.
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

export interface WhatsappAuthOk {
  ok: true;
  userId: string;
  companyId: string;
  /** service-role client (RLS bypass — filtrar por company_id sempre). */
  supabase: SupabaseClient;
}
export interface WhatsappAuthFail {
  ok: false;
  response: Response;
}
export type WhatsappAuthResult = WhatsappAuthOk | WhatsappAuthFail;

/**
 * Aplica o gate de auth/módulo/ação. Devolve o service-role client e o companyId
 * já resolvidos, ou uma Response de erro pronta pra retornar.
 */
export async function authorizeWhatsappManager(req: Request): Promise<WhatsappAuthResult> {
  // ---- 1. Authorization Bearer obrigatório
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return {
      ok: false,
      response: jsonResponse(req, {
        error: "unauthorized",
        message: "Sessão expirada. Faça login novamente.",
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
        error: "unauthorized",
        message: "Sessão expirada. Faça login novamente.",
      }, 401),
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
      response: jsonResponse(req, {
        error: "no_company",
        message: "Sua conta não está vinculada a uma empresa.",
      }, 403),
    };
  }

  // ---- 3. Gate de módulo: 'whatsapp' (Avisos de WhatsApp)
  const { data: hasModule, error: moduleErr } = await supabase.rpc("company_has_module", {
    p_company_id: companyId,
    p_module_code: "whatsapp",
  });
  if (moduleErr) {
    console.error("[whatsapp-auth] company_has_module error", { message: moduleErr.message });
    return {
      ok: false,
      response: jsonResponse(req, {
        error: "internal_error",
        message: "Falha ao verificar o módulo de Avisos de WhatsApp.",
      }, 500),
    };
  }
  if (hasModule !== true) {
    return {
      ok: false,
      response: jsonResponse(req, {
        error: "module_inactive",
        message: "O módulo de Avisos de WhatsApp não está ativo no seu plano.",
      }, 403),
    };
  }

  // ---- 4. Gate de ação: can_manage_system (honra '*' Acesso Total no server)
  const { data: canManage, error: manageErr } = await supabase.rpc("can_manage_system", {
    _user_id: userId,
  });
  if (manageErr) {
    console.error("[whatsapp-auth] can_manage_system error", { message: manageErr.message });
    return {
      ok: false,
      response: jsonResponse(req, {
        error: "internal_error",
        message: "Falha ao verificar suas permissões.",
      }, 500),
    };
  }
  if (canManage !== true) {
    return {
      ok: false,
      response: jsonResponse(req, {
        error: "forbidden",
        message:
          "Você não tem permissão para gerenciar os Avisos de WhatsApp. Peça acesso ao administrador da sua empresa.",
      }, 403),
    };
  }

  return { ok: true, userId, companyId, supabase };
}

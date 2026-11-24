import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const TAG = "[admin-communication-provider-metrics]";
const TIMEOUT_MS = 10_000;

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

function unavailable(req: Request, code: string, message: string): Response {
  return json(req, {
    ok: true,
    resend: { available: false, error: { code, message } },
  });
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function usageWindow(value: unknown) {
  const row = typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
  return {
    used: finiteOrNull(row.used) ?? 0,
    limit: finiteOrNull(row.limit),
    sent: finiteOrNull(row.sent) ?? 0,
    received: finiteOrNull(row.received) ?? 0,
    resetsAt: typeof row.resets_at === "string" ? row.resets_at : null,
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("Authorization") ??
      req.headers.get("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return json(req, {
        ok: false,
        error: { code: "not_authenticated", message: "Sessão expirada. Faça login novamente." },
      }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      console.error(`${TAG} credenciais internas ausentes`);
      return json(req, {
        ok: false,
        error: { code: "internal_error", message: "Falha ao validar o acesso." },
      }, 500);
    }

    const caller = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser();
    const userId = userData?.user?.id;
    if (userError || !userId) {
      return json(req, {
        ok: false,
        error: { code: "not_authenticated", message: "Sessão expirada. Faça login novamente." },
      }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: isSuperAdmin, error: roleError } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (roleError) {
      console.error(`${TAG} has_role falhou`, { message: roleError.message });
      return json(req, {
        ok: false,
        error: { code: "internal_error", message: "Falha ao verificar suas permissões." },
      }, 500);
    }
    if (isSuperAdmin !== true) {
      return json(req, {
        ok: false,
        error: {
          code: "not_authorized",
          message: "Somente o administrador master pode consultar os provedores.",
        },
      }, 403);
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
    if (!resendApiKey) {
      return unavailable(
        req,
        "not_configured",
        "A consulta de consumo do Resend não está configurada neste ambiente.",
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch("https://api.resend.com/usage", {
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = (error as Error)?.name === "AbortError";
      console.error(`${TAG} consulta falhou`, {
        timedOut,
        message: (error as Error)?.message,
      });
      return unavailable(
        req,
        timedOut ? "timeout" : "network_error",
        timedOut
          ? "O Resend não respondeu a tempo."
          : "Não foi possível consultar o consumo do Resend.",
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      console.error(`${TAG} chave recusada`, { status: response.status });
      return unavailable(
        req,
        "provider_auth_error",
        "O Resend recusou a credencial de consulta. Verifique a chave configurada.",
      );
    }
    if (!response.ok) {
      console.error(`${TAG} status inesperado`, { status: response.status });
      return unavailable(
        req,
        "provider_error",
        `O Resend respondeu com erro (${response.status}).`,
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await response.json() as Record<string, unknown>;
    } catch {
      return unavailable(
        req,
        "invalid_response",
        "O Resend respondeu em um formato inesperado.",
      );
    }

    const emails = typeof body.emails === "object" && body.emails !== null
      ? body.emails as Record<string, unknown>
      : {};
    const rate = typeof body.rate_limit === "object" && body.rate_limit !== null
      ? body.rate_limit as Record<string, unknown>
      : {};

    return json(req, {
      ok: true,
      checkedAt: new Date().toISOString(),
      resend: {
        available: true,
        daily: usageWindow(emails.daily),
        monthly: usageWindow(emails.monthly),
        rateLimit: {
          limit: finiteOrNull(rate.limit),
          duration: typeof rate.duration === "string" ? rate.duration : null,
        },
      },
    });
  } catch (error) {
    console.error(`${TAG} erro inesperado`, { message: (error as Error)?.message });
    return json(req, {
      ok: false,
      error: { code: "internal_error", message: "Falha inesperada ao consultar os provedores." },
    }, 500);
  }
});

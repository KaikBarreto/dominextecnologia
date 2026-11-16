// Diagnostica e repara a configuracao do webhook master da Asaas.
// Auth exclusiva por CRON_SECRET, fail-closed. Nunca devolve tokens.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  asaas,
  AsaasApiError,
  AsaasConfigError,
} from "../_shared/asaas-client.ts";
import { ASAAS_MASTER_REQUIRED_WEBHOOK_EVENTS } from "../_shared/asaas-pix-automatic.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

function webhookUrl(): string {
  return `${
    (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "")
  }/functions/v1/asaas-webhook`;
}

function sameUrl(value: unknown, expected: string): boolean {
  return typeof value === "string" &&
    value.trim().replace(/\/+$/, "").toLowerCase() === expected.toLowerCase();
}

function safeWebhook(
  webhook: Record<string, unknown>,
): Record<string, unknown> {
  const { authToken, ...safe } = webhook;
  return {
    ...safe,
    authToken_present: typeof authToken === "string" && authToken.length > 0,
  };
}

async function allWebhooks(): Promise<Record<string, any>[]> {
  const rows: Record<string, any>[] = [];
  let offset = 0;
  for (let page = 0; page < 10; page += 1) {
    const response = await asaas.get("/webhooks", `limit=100&offset=${offset}`);
    const batch = Array.isArray(response?.data) ? response.data : [];
    rows.push(...batch);
    if (response?.hasMore !== true || batch.length === 0) break;
    offset += batch.length;
  }
  return rows;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const expectedSecret = (Deno.env.get("CRON_SECRET") || "").trim();
    const providedSecret = (req.headers.get("x-cron-secret") || "").trim();
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return json({ error: "Não autorizado." }, 401);
    }

    const input = await req.json().catch(() => ({}));
    const action = input?.action === "repair" ? "repair" : "diagnose";
    const expectedUrl = webhookUrl();
    const webhooks = await allWebhooks();
    const ours = webhooks.filter((webhook) =>
      sameUrl(webhook.url, expectedUrl)
    );

    const target = ours.length === 1 ? ours[0] : null;
    const configuredEvents = new Set<string>(
      Array.isArray(target?.events) ? target.events.map(String) : [],
    );
    const missingEvents = ASAAS_MASTER_REQUIRED_WEBHOOK_EVENTS.filter(
      (event) => !configuredEvents.has(event),
    );
    const penalized = Number(target?.penalizedRequestsCount) || 0;
    const healthy = !!target && target.enabled === true &&
      target.interrupted !== true &&
      penalized === 0 && missingEvents.length === 0 &&
      target.hasAuthToken === true;

    const result: Record<string, unknown> = {
      success: true,
      action,
      expected_url: expectedUrl,
      webhooks: {
        total: webhooks.length,
        ours_count: ours.length,
        healthy,
        missing_required_events: missingEvents,
        penalized_requests_count: penalized,
        before: webhooks.map(safeWebhook),
      },
    };

    if (action === "diagnose") {
      if (!healthy) {
        try {
          const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
            { auth: { autoRefreshToken: false, persistSession: false } },
          );
          const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000)
            .toISOString();
          const { data: recent } = await supabase
            .from("admin_notifications")
            .select("id")
            .eq("type", "asaas_webhook_queue_unhealthy")
            .gte("created_at", cutoff)
            .limit(1);
          if (!recent?.length) {
            await supabase.from("admin_notifications").insert({
              type: "asaas_webhook_queue_unhealthy",
              title: "Webhook da Asaas precisa de atenção",
              message:
                "A configuração do webhook de pagamentos está interrompida, incompleta ou penalizada. " +
                "Pagamentos podem ficar sem conciliação automática.",
              data: {
                expected_url: expectedUrl,
                ours_count: ours.length,
                missing_required_events: missingEvents,
                penalized_requests_count: penalized,
              },
            });
          }
        } catch (alertError) {
          console.error("[asaas-health] alerta não gravado", alertError);
        }
      }
      return json(result);
    }

    if (ours.length !== 1) {
      return json({
        ...result,
        error: ours.length === 0
          ? "Webhook master não encontrado."
          : "Mais de um webhook aponta para o endpoint master; reparo abortado.",
      }, 409);
    }

    const repairTarget = ours[0];

    const patch: Record<string, unknown> = {};
    if (repairTarget.enabled !== true) patch.enabled = true;
    if (repairTarget.interrupted === true) patch.interrupted = false;
    if (missingEvents.length > 0) {
      patch.events = [
        ...new Set([
          ...(Array.isArray(repairTarget.events)
            ? repairTarget.events.map(String)
            : []),
          ...ASAAS_MASTER_REQUIRED_WEBHOOK_EVENTS,
        ]),
      ];
    }
    if (repairTarget.hasAuthToken !== true) {
      const token = (Deno.env.get("ASAAS_WEBHOOK_TOKEN") || "").trim();
      if (!token) {
        return json({
          ...result,
          error:
            "Webhook sem token e ASAAS_WEBHOOK_TOKEN indisponível; reparo abortado.",
        }, 503);
      }
      patch.authToken = token;
    }

    if (Object.keys(patch).length > 0) {
      await asaas.put(`/webhooks/${repairTarget.id}`, patch);
    }
    if (penalized > 0) {
      await asaas.post(`/webhooks/${repairTarget.id}/removeBackoff`, {});
    }

    const after = await asaas.get(`/webhooks/${repairTarget.id}`);
    const afterEvents = new Set<string>(
      Array.isArray(after?.events) ? after.events.map(String) : [],
    );
    const afterMissing = ASAAS_MASTER_REQUIRED_WEBHOOK_EVENTS.filter(
      (event) => !afterEvents.has(event),
    );
    (result.webhooks as Record<string, unknown>).repair = {
      changed: Object.keys(patch).filter((key) => key !== "authToken"),
      auth_token_written: Object.hasOwn(patch, "authToken"),
      after: safeWebhook(after),
      missing_required_events: afterMissing,
      healthy: after?.enabled === true && after?.interrupted !== true &&
        (Number(after?.penalizedRequestsCount) || 0) === 0 &&
        afterMissing.length === 0 && after?.hasAuthToken === true,
    };
    return json(result);
  } catch (error) {
    console.error("admin-asaas-webhook-health error:", error);
    const status = error instanceof AsaasConfigError
      ? 503
      : error instanceof AsaasApiError
      ? 400
      : 500;
    return json(
      { error: "Erro ao verificar ou reparar o webhook da Asaas." },
      status,
    );
  }
});

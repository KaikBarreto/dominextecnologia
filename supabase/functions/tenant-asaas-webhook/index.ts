// tenant-asaas-webhook
// --------------------
// PÚBLICA (chamada pela Asaas da conta do TENANT, não pelo usuário). SEM Authorization
// Bearer — a segurança é o header `asaas-access-token`, validado timing-safe contra o
// token DAQUELE tenant lido do Vault (§9.2/9.3). Fail-closed: token ausente/errado → 401.
//
// Resolução multi-tenant (§9.3): a company é identificada por
//   payment.externalReference (= company_id, gravado no create-charge)  → O(1)
// com fallback por tenant_charges.asaas_payment_id (UNIQUE). O token VALIDA (prova que
// o POST veio mesmo da conta daquele tenant), não roteia.
//
// Idempotência: tenant_payment_webhook_events.event_id (dedupe de evento) +
// apply_tenant_charge_payment idempotente por asaas_payment_id (já pago = no-op).
//
// Eventos:
//   PAYMENT_RECEIVED / PAYMENT_CONFIRMED → apply_tenant_charge_payment (baixa automática).
//   PAYMENT_REFUNDED / PAYMENT_CHARGEBACK_* → reverte a baixa da tenant_charge.
//   demais → ack silencioso.
//
// ACK rápido: valida token + resolve company + dedupe (síncrono, barato); o
// processamento pesado (RPC/baixa) roda em waitUntil pra Asaas não re-enfileirar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import { vaultWebhookTokenSecretName } from "../_shared/payments-auth.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, asaas-access-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Resolve a company (§9.3): externalReference → fallback tenant_charges.asaas_payment_id. */
async function resolveCompanyId(
  supabase: any,
  payment: any,
): Promise<string | null> {
  const ext: string | null =
    typeof payment?.externalReference === "string" ? payment.externalReference : null;
  if (ext) {
    const { data } = await supabase
      .from("tenant_payment_accounts")
      .select("company_id")
      .eq("company_id", ext)
      .maybeSingle();
    if (data?.company_id) return data.company_id;
  }
  if (payment?.id) {
    const { data } = await supabase
      .from("tenant_charges")
      .select("company_id")
      .eq("asaas_payment_id", payment.id)
      .maybeSingle();
    if (data?.company_id) return data.company_id;
  }
  return null;
}

/** Lê o token do webhook daquele tenant do Vault (via RPC SECURITY DEFINER). */
async function readWebhookToken(supabase: any, companyId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("vault_read_tenant_secret", {
    p_name: vaultWebhookTokenSecretName(companyId),
  });
  if (error) {
    console.error("[tenant-webhook] vault_read_tenant_secret falhou:", error.message);
    return null;
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

/** Registra um pagamento sem company resolvida — nunca silencioso (§9.3). */
async function recordOrphan(supabase: any, event: string, payment: any) {
  try {
    await supabase.from("tenant_payment_webhook_events").upsert(
      {
        event_id: `orphan_${payment?.id ?? crypto.randomUUID()}_${event}`,
        event_type: event,
        asaas_payment_id: payment?.id ?? null,
        company_id: null,
        status: "orphan",
        last_error: "company não resolvida (externalReference/charge ausente)",
        raw_payload: payment ?? null,
      },
      { onConflict: "event_id", ignoreDuplicates: true },
    );
  } catch (e) {
    console.error("[tenant-webhook] orphan record falhou:", (e as Error).message);
  }
}

/**
 * Processa o evento. Retorna true se concluiu (marcou 'processed'), false se falhou
 * (marcou 'error'). O caller usa o boolean pra decidir ACK 200 vs 500 (re-entrega).
 */
async function processEvent(
  supabase: any,
  eventId: string,
  event: string,
  payment: any,
  companyId: string,
): Promise<boolean> {
  try {
    const status = String(payment?.status || "").toUpperCase();

    if (
      (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") &&
      (status === "RECEIVED" || status === "CONFIRMED")
    ) {
      const paidAt =
        payment.paymentDate || payment.confirmedDate || new Date().toISOString();
      const net = payment.netValue != null ? Number(payment.netValue) : null;
      const { data, error } = await supabase.rpc("apply_tenant_charge_payment", {
        p_asaas_payment_id: payment.id,
        p_paid_at: paidAt,
        p_net: net,
      });
      if (error) throw new Error(error.message);
      console.log(`[tenant-webhook] baixa aplicada ${payment.id}:`, JSON.stringify(data));
    } else if (event === "PAYMENT_REFUNDED" || event.startsWith("PAYMENT_CHARGEBACK")) {
      // Reverte a baixa: a RPC de pagamento não reverte. Predicado de posse por company_id.
      const newStatus = event === "PAYMENT_REFUNDED" ? "REFUNDED" : "CHARGEBACK";
      await supabase
        .from("tenant_charges")
        .update({ status: newStatus, payment_date: null, updated_at: new Date().toISOString() })
        .eq("asaas_payment_id", payment.id)
        .eq("company_id", companyId);
      // Reabre o recebível vinculado (mesma company).
      const { data: charge } = await supabase
        .from("tenant_charges")
        .select("id")
        .eq("asaas_payment_id", payment.id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (charge?.id) {
        await supabase
          .from("financial_transactions")
          .update({ is_paid: false, paid_date: null, amount_received: 0, updated_at: new Date().toISOString() })
          .eq("tenant_charge_id", charge.id)
          .eq("company_id", companyId)
          .eq("transaction_type", "entrada");
      }
      console.log(`[tenant-webhook] baixa revertida (${newStatus}) ${payment.id}`);
    }

    await supabase
      .from("tenant_payment_webhook_events")
      .update({ status: "processed", last_error: null })
      .eq("event_id", eventId);
    return true;
  } catch (e) {
    console.error(`[tenant-webhook] processamento falhou (${eventId}):`, (e as Error).message);
    await supabase
      .from("tenant_payment_webhook_events")
      .update({ status: "error", last_error: (e as Error).message })
      .eq("event_id", eventId);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  let supabase: any;
  try {
    supabase = serviceClient();
    const body = await req.json();
    const event: string = body?.event ?? "";
    const payment = body?.payment ?? null;
    const providedToken = (req.headers.get("asaas-access-token") || "").trim();

    if (!payment || !payment.id) {
      // Sem payment não dá pra resolver tenant/token; ack silencioso (nada a fazer).
      return json({ received: true, ignored: "sem payment" });
    }

    // 1) Resolve a company (externalReference → fallback charge).
    const companyId = await resolveCompanyId(supabase, payment);
    if (!companyId) {
      await recordOrphan(supabase, event, payment);
      // Órfão registrado; respondemos 200 pra Asaas não re-enfileirar infinitamente.
      return json({ received: true, matched: false, unmatched_recorded: true });
    }

    // 2) Valida o token daquele tenant (fail-closed). Regra-lei #6.
    const expectedToken = await readWebhookToken(supabase, companyId);
    if (!expectedToken || !providedToken || !timingSafeEqual(providedToken, expectedToken)) {
      console.error(`[tenant-webhook] token inválido (company ${companyId})`);
      return json({ error: "Unauthorized webhook" }, 401);
    }

    // 3) Idempotência de evento. event_id do Asaas quando presente; senão determinístico.
    const eventId: string = body?.id ?? `${payment.id}_${event}`;
    const { error: dedupeErr } = await supabase
      .from("tenant_payment_webhook_events")
      .insert({
        event_id: eventId,
        event_type: event,
        asaas_payment_id: payment.id,
        company_id: companyId,
        status: "received",
        raw_payload: body ?? null,
      });
    if (dedupeErr) {
      if (dedupeErr.code === "23505") {
        // Já vimos esse event_id. Se JÁ foi processado → no-op idempotente (200).
        // Se ficou em 'error'/'received' (tentativa anterior que falhou), é uma
        // RE-ENTREGA da Asaas: reprocessamos em vez de engolir calado.
        const { data: prior } = await supabase
          .from("tenant_payment_webhook_events")
          .select("status")
          .eq("event_id", eventId)
          .maybeSingle();
        if (prior?.status === "processed") {
          return json({ received: true, duplicate: true });
        }
        // Reprocessa (a idempotência da RPC/updates por company_id protege de duplicar).
        const ok = await processEvent(supabase, eventId, event, payment, companyId);
        return ok ? json({ received: true, reprocessed: true }) : json({ received: false, retry: true }, 500);
      }
      console.error("[tenant-webhook] dedupe insert falhou:", dedupeErr.message);
      // Sem dedupe confiável não processamos; pedimos re-entrega à Asaas.
      return json({ received: false, retry: true }, 500);
    }

    // 4) Processamento. Eventos que MEXEM EM DINHEIRO (baixa/estorno/chargeback)
    // rodam SÍNCRONOS antes do ACK: se a RPC falhar, respondemos != 200 pra Asaas
    // RE-ENTREGAR (a idempotência por asaas_payment_id/event_id protege de duplicar).
    // Se processássemos em waitUntil, o 200 já teria ido e a Asaas não re-tentaria —
    // uma falha transitória perderia a baixa pra sempre.
    const isMoneyEvent =
      event === "PAYMENT_RECEIVED" ||
      event === "PAYMENT_CONFIRMED" ||
      event === "PAYMENT_REFUNDED" ||
      event.startsWith("PAYMENT_CHARGEBACK") ||
      event === "PAYMENT_AWAITING_CHARGEBACK_REVERSAL";

    if (isMoneyEvent) {
      const ok = await processEvent(supabase, eventId, event, payment, companyId);
      if (!ok) {
        // Marcamos o evento como 'error' (dentro de processEvent) e pedimos re-entrega.
        return json({ received: false, retry: true }, 500);
      }
      return json({ received: true });
    }

    // Eventos sem impacto financeiro: ACK rápido + processamento best-effort em background.
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    const work = processEvent(supabase, eventId, event, payment, companyId);
    if (runtime?.waitUntil) {
      runtime.waitUntil(work);
    } else {
      await work;
    }
    return json({ received: true });
  } catch (error) {
    console.error("[tenant-webhook] erro inesperado:", (error as Error).message);
    // 500 controlado (sem vazar a mensagem interna): pede re-entrega à Asaas.
    // A idempotência (event_id UNIQUE + RPC no-op se já pago) protege de duplicar.
    return json({ received: false, retry: true }, 500);
  }
});

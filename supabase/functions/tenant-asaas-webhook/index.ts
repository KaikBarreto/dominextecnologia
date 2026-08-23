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
// Eventos (cobertura ABRANGENTE do ciclo Asaas — ver mapa evento→efeito abaixo):
//   PAYMENT (baixa):    PAYMENT_RECEIVED / PAYMENT_CONFIRMED / PAYMENT_RECEIVED_IN_CASH
//                       → apply_tenant_charge_payment (baixa automática, idempotente).
//   PAYMENT (estorno):  PAYMENT_REFUNDED / PAYMENT_REFUND_IN_PROGRESS / PAYMENT_CHARGEBACK_* /
//                       PAYMENT_AWAITING_CHARGEBACK_REVERSAL → reverte/marca a tenant_charge.
//   PAYMENT (vencido):  PAYMENT_OVERDUE → status OVERDUE (+ assinatura 'overdue' se for de ciclo).
//   PAYMENT (removido): PAYMENT_DELETED → status DELETED; PAYMENT_RESTORED → volta ao status Asaas.
//   PAYMENT (espelho):  PAYMENT_CREATED / PAYMENT_UPDATED → best-effort espelha status/valor
//                       na tenant_charges se já existir (ou ignora se não).
//   PAYMENT (info):     PAYMENT_BANK_SLIP_VIEWED / PAYMENT_CHECKOUT_VIEWED → só loga, 200.
//   SUBSCRIPTION_*:     atualiza status da tenant_subscriptions por asaas_subscription_id.
//   PIX AUTOMÁTICO:     eventos de autorização (aprovada/cancelada/expirada) refletem em
//                       tenant_subscriptions.pix_auto_status/status por pix_auto_authorization_id.
//                       Os DÉBITOS recorrentes chegam como PAYMENT_* com payment.subscription =
//                       aut_* e caem no MESMO caminho de materialização/baixa da assinatura comum.
//   desconhecido/info:  ack 200 (não re-enfileira), logando o tipo.
//
// ASSINATURAS (recorrência): cada ciclo de uma assinatura vira uma cobrança PELO
// ASAAS. Esses eventos PAYMENT_* trazem `payment.subscription` (id da assinatura).
// Quando chega um PAYMENT_* de uma cobrança que TEM subscription e ainda NÃO existe
// em tenant_charges (asaas_payment_id novo), materializamos a linha em tenant_charges
// (subscription_id preenchido) + o recebível — igual à cobrança avulsa. A partir daí,
// o RECEIVED/CONFIRMED cai no MESMO caminho de baixa (apply_tenant_charge_payment).
//
// ACK rápido: valida token + resolve company + dedupe (síncrono, barato); o
// processamento pesado (RPC/baixa) roda em waitUntil pra Asaas não re-enfileirar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import { vaultWebhookTokenSecretName, generateShortCode } from "../_shared/payments-auth.ts";

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
  // Fallback pra cobrança GERADA por assinatura cujo 1º ciclo ainda não foi
  // materializado em tenant_charges e cujo externalReference veio vazio: resolve
  // pela assinatura local (asaas_subscription_id). Cobre também Pix Automático, cujo
  // vínculo recorrente é o pix_auto_authorization_id (aut_*) — os PAYMENT_* de cada
  // ciclo do Pix Auto chegam com payment.subscription = aut_*.
  if (typeof payment?.subscription === "string" && payment.subscription) {
    const { data } = await supabase
      .from("tenant_subscriptions")
      .select("company_id")
      .eq("asaas_subscription_id", payment.subscription)
      .maybeSingle();
    if (data?.company_id) return data.company_id;
    const { data: pixData } = await supabase
      .from("tenant_subscriptions")
      .select("company_id")
      .eq("pix_auto_authorization_id", payment.subscription)
      .maybeSingle();
    if (pixData?.company_id) return pixData.company_id;
  }
  return null;
}

/**
 * Resolve a company de um evento de ASSINATURA (SUBSCRIPTION_*). O payload traz
 * `body.subscription` (não `body.payment`): usa externalReference (= company_id)
 * → fallback tenant_subscriptions.asaas_subscription_id.
 */
async function resolveCompanyForSubscription(
  supabase: any,
  subscription: any,
): Promise<string | null> {
  const ext: string | null =
    typeof subscription?.externalReference === "string" ? subscription.externalReference : null;
  if (ext) {
    const { data } = await supabase
      .from("tenant_payment_accounts")
      .select("company_id")
      .eq("company_id", ext)
      .maybeSingle();
    if (data?.company_id) return data.company_id;
  }
  if (subscription?.id) {
    const { data } = await supabase
      .from("tenant_subscriptions")
      .select("company_id")
      .eq("asaas_subscription_id", subscription.id)
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

/** Mapeia o status Asaas de uma assinatura pro status local de tenant_subscriptions. */
function mapSubscriptionStatus(event: string, asaasStatus: string): string | null {
  const s = (asaasStatus || "").toUpperCase();
  if (event === "SUBSCRIPTION_DELETED") return "cancelled";
  if (event === "SUBSCRIPTION_INACTIVATED") return "cancelled";
  if (s === "ACTIVE") return "active";
  if (s === "INACTIVE" || s === "EXPIRED") return "cancelled";
  // SUBSCRIPTION_CREATED/UPDATED sem status claro → não mexe (retorna null).
  return null;
}

/**
 * Processa um evento SUBSCRIPTION_* — só atualiza o status da assinatura local por
 * asaas_subscription_id (posse por company_id reaplicada). Idempotente. Retorna true
 * mesmo quando não há assinatura local (nada a fazer ≠ erro).
 */
async function processSubscriptionEvent(
  supabase: any,
  eventId: string,
  event: string,
  subscription: any,
  companyId: string,
): Promise<boolean> {
  try {
    const newStatus = mapSubscriptionStatus(event, String(subscription?.status || ""));
    if (newStatus) {
      await supabase
        .from("tenant_subscriptions")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("asaas_subscription_id", subscription.id)
        .eq("company_id", companyId);
    }
    await supabase
      .from("tenant_payment_webhook_events")
      .update({ status: "processed", last_error: null })
      .eq("event_id", eventId);
    return true;
  } catch (e) {
    console.error(`[tenant-webhook] subscription event falhou (${eventId}):`, (e as Error).message);
    await supabase
      .from("tenant_payment_webhook_events")
      .update({ status: "error", last_error: (e as Error).message })
      .eq("event_id", eventId);
    return false;
  }
}

/**
 * Materializa em tenant_charges uma cobrança GERADA por uma assinatura, quando o
 * payment tem `payment.subscription` e ainda não existe linha pro asaas_payment_id.
 * Cria também o recebível (respeitando auto_post_to_finance + conta/categoria default),
 * espelhando o create-charge. Idempotente: upsert por asaas_payment_id.
 *
 * Retorna true se garantiu a existência da charge (nova ou já existente), false se
 * não é uma cobrança de assinatura (segue o fluxo avulso normal).
 */
async function ensureChargeForSubscriptionPayment(
  supabase: any,
  payment: any,
  companyId: string,
): Promise<boolean> {
  const asaasSubId: string | null =
    typeof payment?.subscription === "string" && payment.subscription ? payment.subscription : null;
  if (!asaasSubId) return false; // não é cobrança de assinatura → fluxo avulso

  // Já existe? (cobrança avulsa OU ciclo já materializado) → nada a criar.
  const { data: existing } = await supabase
    .from("tenant_charges")
    .select("id")
    .eq("asaas_payment_id", payment.id)
    .maybeSingle();
  if (existing?.id) return true;

  // Resolve a assinatura local (pra subscription_id + customer_id). O vínculo pode
  // ser assinatura comum (asaas_subscription_id) OU Pix Automático, cujo id vem em
  // pix_auto_authorization_id (aut_*). Tenta o primeiro; cai no segundo.
  let { data: sub } = await supabase
    .from("tenant_subscriptions")
    .select("id, customer_id, description")
    .eq("asaas_subscription_id", asaasSubId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!sub?.id) {
    const { data: pixSub } = await supabase
      .from("tenant_subscriptions")
      .select("id, customer_id, description")
      .eq("pix_auto_authorization_id", asaasSubId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (pixSub?.id) sub = pixSub;
  }

  const value = payment?.value != null ? Number(payment.value) : null;
  if (value == null || !Number.isFinite(value) || value <= 0) {
    // Sem valor não dá pra materializar; deixa seguir (a baixa por RPC será no-op).
    console.warn(`[tenant-webhook] cobrança de assinatura sem value (${payment?.id}); pulando materialização`);
    return false;
  }

  const dueDate: string | null =
    typeof payment?.dueDate === "string" && payment.dueDate ? payment.dueDate : null;
  const description: string =
    (typeof payment?.description === "string" && payment.description) ||
    (sub?.description ?? null) ||
    "Cobrança de assinatura";

  const chargeRow = {
    company_id: companyId,
    asaas_payment_id: payment.id,
    source_type: "avulso", // origem da COBRANÇA; o vínculo recorrente é subscription_id
    source_id: null,
    subscription_id: sub?.id ?? null,
    customer_id: sub?.customer_id ?? null,
    value,
    net_value: payment?.netValue ?? null,
    billing_type: payment?.billingType ?? null,
    status: payment?.status ?? "PENDING",
    due_date: dueDate,
    payment_date: null,
    description,
    public_short_code: generateShortCode(),
    invoice_url: payment?.invoiceUrl ?? null,
    boleto_url: payment?.bankSlipUrl ?? null,
    created_by: null, // gerada por sistema (recorrência)
  };

  const { data: saved, error: insertErr } = await supabase
    .from("tenant_charges")
    .upsert(chargeRow, { onConflict: "asaas_payment_id" })
    .select("id")
    .maybeSingle();
  if (insertErr) {
    // Corrida com outra re-entrega: se já existe agora, segue; senão relança.
    if (insertErr.code === "23505") return true;
    throw new Error(`materializar cobrança de assinatura falhou: ${insertErr.message}`);
  }

  // Recebível (a receber), respeitando a config da conta. Não-fatal.
  if (saved?.id) {
    try {
      const { data: account } = await supabase
        .from("tenant_payment_accounts")
        .select("auto_post_to_finance, default_finance_account_id, default_income_category")
        .eq("company_id", companyId)
        .maybeSingle();
      if (account?.auto_post_to_finance !== false) {
        const { error: rpcErr } = await supabase.rpc("create_tenant_charge_receivable", {
          p_company_id: companyId,
          p_tenant_charge_id: saved.id,
          p_customer_id: sub?.customer_id ?? null,
          p_amount: value,
          p_due_date: dueDate,
          p_description: description,
          p_account_id: account?.default_finance_account_id ?? null,
          p_category: account?.default_income_category ?? null,
        });
        if (rpcErr) {
          console.warn("[tenant-webhook] create_tenant_charge_receivable (assinatura) falhou (não-fatal):", rpcErr.message);
        }
      }
    } catch (e) {
      console.warn("[tenant-webhook] recebível de assinatura exceção (não-fatal):", (e as Error).message);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// PIX AUTOMÁTICO — eventos de AUTORIZAÇÃO recorrente (consentimento).
//
// TODO(asaas-shape): confirmar na doc os NOMES EXATOS dos eventos e o SHAPE do
// payload. Pela doc/versão atual do Asaas os eventos de autorização de Pix
// Automático chegam com prefixo `PIX_RECURRING_` (ex.: PIX_RECURRING_CREATED,
// PIX_RECURRING_AUTHORIZED, PIX_RECURRING_CANCELED, PIX_RECURRING_EXPIRED,
// PIX_RECURRING_REJECTED). Há relatos de variação com `PIX_AUTOMATIC_*`. Tratamos
// AMBOS os prefixos aqui (isPixAutoAuthEvent) pra ser tolerante. O objeto da
// autorização vem em body.pixRecurring ?? body.authorization ?? body.pixAutomatic
// (allowlist), e o id da autorização (aut_*) casa com pix_auto_authorization_id.
// Os DÉBITOS recorrentes NÃO são tratados aqui — chegam como PAYMENT_* com
// payment.subscription = aut_* e caem no fluxo de materialização/baixa comum.
// ---------------------------------------------------------------------------

/** É um evento de AUTORIZAÇÃO de Pix Automático (não um débito PAYMENT_*)? */
function isPixAutoAuthEvent(event: string): boolean {
  const e = (event || "").toUpperCase();
  // Débitos vêm como PAYMENT_* (com payment.subscription) — não são autorização.
  if (e.startsWith("PAYMENT_")) return false;
  return e.startsWith("PIX_RECURRING") || e.startsWith("PIX_AUTOMATIC");
}

/** Extrai o objeto da autorização de Pix Automático do body (shape tolerante). */
function extractPixAuthObject(body: any): any {
  // TODO(asaas-shape): fixar a chave exata quando a doc confirmar.
  return body?.pixRecurring ?? body?.authorization ?? body?.pixAutomatic ?? body?.pix ?? null;
}

/**
 * Mapeia o evento/status de autorização Pix Automático pro par local
 * { pix_auto_status, subStatus } de tenant_subscriptions. Retorna null quando não
 * há mudança clara (ex.: CREATED sem status → não mexe).
 */
function mapPixAutoStatus(
  event: string,
  asaasStatus: string,
): { pixStatus: string; subStatus: string | null } | null {
  const e = (event || "").toUpperCase();
  const s = (asaasStatus || "").toUpperCase();
  // Aprovada/ativada → authorized + assinatura active.
  if (e.includes("AUTHORIZED") || e.includes("APPROVED") || e.includes("ACTIVATED") ||
      s === "AUTHORIZED" || s === "APPROVED" || s === "ACTIVE") {
    return { pixStatus: "authorized", subStatus: "active" };
  }
  // Cancelada → cancelled + assinatura cancelled.
  if (e.includes("CANCEL") || s === "CANCELLED" || s === "CANCELED") {
    return { pixStatus: "cancelled", subStatus: "cancelled" };
  }
  // Expirada → expired + assinatura cancelled (não há mais consentimento).
  if (e.includes("EXPIRED") || s === "EXPIRED") {
    return { pixStatus: "expired", subStatus: "cancelled" };
  }
  // Rejeitada/negada → rejected + assinatura cancelled.
  if (e.includes("REJECT") || e.includes("DENIED") || s === "REJECTED" || s === "DENIED") {
    return { pixStatus: "rejected", subStatus: "cancelled" };
  }
  // CREATED/PENDING sem transição clara → não mexe.
  return null;
}

/** Resolve a company de um evento de autorização Pix Automático (posse). */
async function resolveCompanyForPixAuth(supabase: any, authObj: any): Promise<string | null> {
  const ext: string | null =
    typeof authObj?.externalReference === "string" ? authObj.externalReference : null;
  if (ext) {
    const { data } = await supabase
      .from("tenant_payment_accounts")
      .select("company_id")
      .eq("company_id", ext)
      .maybeSingle();
    if (data?.company_id) return data.company_id;
  }
  const authId: string | null = typeof authObj?.id === "string" ? authObj.id : null;
  if (authId) {
    const { data } = await supabase
      .from("tenant_subscriptions")
      .select("company_id")
      .eq("pix_auto_authorization_id", authId)
      .maybeSingle();
    if (data?.company_id) return data.company_id;
  }
  return null;
}

/**
 * Processa um evento de AUTORIZAÇÃO de Pix Automático — reflete pix_auto_status +
 * status da tenant_subscriptions, casando por pix_auto_authorization_id (posse por
 * company_id). Idempotente. true = nada-a-fazer ou aplicado; false = erro (re-entrega).
 */
async function processPixAutoAuthEvent(
  supabase: any,
  eventId: string,
  event: string,
  authObj: any,
  companyId: string,
): Promise<boolean> {
  try {
    const authId: string | null = typeof authObj?.id === "string" ? authObj.id : null;
    const mapped = mapPixAutoStatus(event, String(authObj?.status || ""));
    if (authId && mapped) {
      const patch: Record<string, unknown> = {
        pix_auto_status: mapped.pixStatus,
        updated_at: new Date().toISOString(),
      };
      if (mapped.subStatus) patch.status = mapped.subStatus;
      await supabase
        .from("tenant_subscriptions")
        .update(patch)
        .eq("pix_auto_authorization_id", authId)
        .eq("company_id", companyId);
      console.log(`[tenant-webhook] pix-auto ${authId} → ${mapped.pixStatus}/${mapped.subStatus ?? "-"}`);
    }
    await supabase
      .from("tenant_payment_webhook_events")
      .update({ status: "processed", last_error: null })
      .eq("event_id", eventId);
    return true;
  } catch (e) {
    console.error(`[tenant-webhook] pix-auto auth event falhou (${eventId}):`, (e as Error).message);
    await supabase
      .from("tenant_payment_webhook_events")
      .update({ status: "error", last_error: (e as Error).message })
      .eq("event_id", eventId);
    return false;
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

    // Cobrança GERADA por assinatura (payment.subscription presente) que ainda não
    // existe em tenant_charges: materializa a linha + recebível ANTES da baixa, pra
    // o caminho de pagamento abaixo (apply_tenant_charge_payment) encontrar a charge.
    // No-op / retorna false pra cobrança avulsa comum (fluxo intocado).
    try {
      await ensureChargeForSubscriptionPayment(supabase, payment, companyId);
    } catch (matErr) {
      // Falha ao materializar é fatal pro evento (senão a baixa não acha a charge):
      // relança pra marcar 'error' e pedir re-entrega.
      throw matErr;
    }

    if (
      (event === "PAYMENT_RECEIVED" ||
        event === "PAYMENT_CONFIRMED" ||
        event === "PAYMENT_RECEIVED_IN_CASH") &&
      (status === "RECEIVED" || status === "CONFIRMED" || status === "RECEIVED_IN_CASH")
    ) {
      // BAIXA (dinheiro entrou). RECEIVED_IN_CASH = recebido em dinheiro/fora do Asaas,
      // mas ainda é uma quitação → mesma baixa idempotente por asaas_payment_id.
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
    } else if (
      event === "PAYMENT_REFUNDED" ||
      event === "PAYMENT_REFUND_IN_PROGRESS" ||
      event === "PAYMENT_AWAITING_CHARGEBACK_REVERSAL" ||
      event.startsWith("PAYMENT_CHARGEBACK")
    ) {
      // ESTORNO/CHARGEBACK — reverte a baixa (a RPC de pagamento não reverte). Posse
      // por company_id. Mapeia cada evento pro status local; reabre o recebível.
      //   REFUND_IN_PROGRESS            → REFUND_IN_PROGRESS (estorno solicitado, ainda não concluído)
      //   REFUNDED                      → REFUNDED
      //   CHARGEBACK_REQUESTED/DISPUTE  → CHARGEBACK
      //   AWAITING_CHARGEBACK_REVERSAL  → CHARGEBACK (aguardando reversão; ainda revertido pra nós)
      const newStatus =
        event === "PAYMENT_REFUNDED"
          ? "REFUNDED"
          : event === "PAYMENT_REFUND_IN_PROGRESS"
            ? "REFUND_IN_PROGRESS"
            : "CHARGEBACK";
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
    } else if (event === "PAYMENT_OVERDUE") {
      // VENCIDO. Marca a própria cobrança OVERDUE (posse por company_id). Se for ciclo
      // de uma assinatura, marca também a assinatura 'overdue' (só se ainda ativa —
      // não sobrescreve cancelada/pausada).
      await supabase
        .from("tenant_charges")
        .update({ status: "OVERDUE", updated_at: new Date().toISOString() })
        .eq("asaas_payment_id", payment.id)
        .eq("company_id", companyId);
      if (typeof payment?.subscription === "string" && payment.subscription) {
        await supabase
          .from("tenant_subscriptions")
          .update({ status: "overdue", updated_at: new Date().toISOString() })
          .eq("asaas_subscription_id", payment.subscription)
          .eq("company_id", companyId)
          .eq("status", "active");
        // Pix Automático: o vínculo do ciclo vem em pix_auto_authorization_id.
        await supabase
          .from("tenant_subscriptions")
          .update({ status: "overdue", updated_at: new Date().toISOString() })
          .eq("pix_auto_authorization_id", payment.subscription)
          .eq("company_id", companyId)
          .eq("status", "active");
        console.log(`[tenant-webhook] assinatura ${payment.subscription} marcada overdue`);
      }
      console.log(`[tenant-webhook] cobrança ${payment.id} marcada OVERDUE`);
    } else if (event === "PAYMENT_DELETED") {
      // Cobrança REMOVIDA no Asaas → marca DELETED (não apaga: preserva histórico/auditoria).
      // NÃO reverte baixa de cobrança já paga (delete no Asaas de cobrança quitada é raro;
      // se houver estorno, virá um evento de refund/chargeback próprio).
      await supabase
        .from("tenant_charges")
        .update({ status: "DELETED", updated_at: new Date().toISOString() })
        .eq("asaas_payment_id", payment.id)
        .eq("company_id", companyId);
      console.log(`[tenant-webhook] cobrança ${payment.id} marcada DELETED`);
    } else if (event === "PAYMENT_RESTORED") {
      // Cobrança RESTAURADA (undo do delete) → volta ao status atual do Asaas.
      const restored = status || "PENDING";
      await supabase
        .from("tenant_charges")
        .update({ status: restored, updated_at: new Date().toISOString() })
        .eq("asaas_payment_id", payment.id)
        .eq("company_id", companyId);
      console.log(`[tenant-webhook] cobrança ${payment.id} restaurada (${restored})`);
    } else if (event === "PAYMENT_CREATED" || event === "PAYMENT_UPDATED") {
      // ESPELHO best-effort: se a cobrança já existe localmente, atualiza status/valor/
      // due_date/urls pra refletir o Asaas. Se NÃO existe (cobrança criada direto no
      // painel Asaas, não pela nossa UI), ignoramos — a materialização só acontece no
      // pagamento (ensureChargeForSubscriptionPayment) ou não se aplica. Nunca cria aqui.
      const { data: existing } = await supabase
        .from("tenant_charges")
        .select("id")
        .eq("asaas_payment_id", payment.id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (existing?.id) {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (typeof payment?.status === "string" && payment.status) patch.status = payment.status;
        if (payment?.value != null && Number.isFinite(Number(payment.value))) patch.value = Number(payment.value);
        if (payment?.netValue != null) patch.net_value = payment.netValue;
        if (typeof payment?.dueDate === "string" && payment.dueDate) patch.due_date = payment.dueDate;
        if (typeof payment?.invoiceUrl === "string" && payment.invoiceUrl) patch.invoice_url = payment.invoiceUrl;
        if (typeof payment?.bankSlipUrl === "string" && payment.bankSlipUrl) patch.boleto_url = payment.bankSlipUrl;
        await supabase
          .from("tenant_charges")
          .update(patch)
          .eq("asaas_payment_id", payment.id)
          .eq("company_id", companyId);
        console.log(`[tenant-webhook] espelho ${event} aplicado ${payment.id}`);
      } else {
        console.log(`[tenant-webhook] ${event} sem charge local (${payment.id}) — ignorado`);
      }
    } else if (event === "PAYMENT_BANK_SLIP_VIEWED" || event === "PAYMENT_CHECKOUT_VIEWED") {
      // Informativos — sem efeito no estado. Só registra (o evento já foi dedupado/logado).
      console.log(`[tenant-webhook] informativo ${event} (${payment.id}) — sem efeito`);
    } else {
      // Evento de payment desconhecido: sem efeito, marca processed (não re-tenta à toa).
      console.log(`[tenant-webhook] payment event não mapeado (${event}, ${payment.id}) — ack`);
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
    const subscription = body?.subscription ?? null;
    const providedToken = (req.headers.get("asaas-access-token") || "").trim();

    // ---- Eventos de ASSINATURA (SUBSCRIPTION_*): payload em body.subscription,
    // NÃO em body.payment. Trata antes do check de payment (que não existe aqui).
    // Só atualiza status da tenant_subscriptions; sem impacto financeiro direto
    // (a movimentação de caixa vem dos PAYMENT_* de cada ciclo).
    if (event.startsWith("SUBSCRIPTION_")) {
      if (!subscription || !subscription.id) {
        return json({ received: true, ignored: "sem subscription" });
      }
      const subCompanyId = await resolveCompanyForSubscription(supabase, subscription);
      if (!subCompanyId) {
        await recordOrphan(supabase, event, { id: subscription.id, externalReference: subscription.externalReference });
        return json({ received: true, matched: false, unmatched_recorded: true });
      }
      const expectedTokenSub = await readWebhookToken(supabase, subCompanyId);
      if (!expectedTokenSub || !providedToken || !timingSafeEqual(providedToken, expectedTokenSub)) {
        console.error(`[tenant-webhook] token inválido em SUBSCRIPTION (company ${subCompanyId})`);
        return json({ error: "Unauthorized webhook" }, 401);
      }
      const subEventId: string = body?.id ?? `${subscription.id}_${event}`;
      const { error: subDedupeErr } = await supabase
        .from("tenant_payment_webhook_events")
        .insert({
          event_id: subEventId,
          event_type: event,
          asaas_payment_id: null,
          company_id: subCompanyId,
          status: "received",
          raw_payload: body ?? null,
        });
      if (subDedupeErr) {
        if (subDedupeErr.code === "23505") {
          const { data: prior } = await supabase
            .from("tenant_payment_webhook_events")
            .select("status")
            .eq("event_id", subEventId)
            .maybeSingle();
          if (prior?.status === "processed") return json({ received: true, duplicate: true });
          const okR = await processSubscriptionEvent(supabase, subEventId, event, subscription, subCompanyId);
          return okR ? json({ received: true, reprocessed: true }) : json({ received: false, retry: true }, 500);
        }
        console.error("[tenant-webhook] dedupe insert (subscription) falhou:", subDedupeErr.message);
        return json({ received: false, retry: true }, 500);
      }
      const okSub = await processSubscriptionEvent(supabase, subEventId, event, subscription, subCompanyId);
      return okSub ? json({ received: true }) : json({ received: false, retry: true }, 500);
    }

    // ---- Eventos de AUTORIZAÇÃO de PIX AUTOMÁTICO (PIX_RECURRING_* / PIX_AUTOMATIC_*):
    // payload em body.pixRecurring/authorization (NÃO body.payment). Reflete o
    // consentimento recorrente em tenant_subscriptions (pix_auto_status + status).
    // Roda SÍNCRONO antes do ACK (muda o estado da assinatura → re-entregar se falhar).
    // Os DÉBITOS recorrentes (dinheiro) chegam como PAYMENT_* e seguem o fluxo comum.
    if (isPixAutoAuthEvent(event)) {
      const authObj = extractPixAuthObject(body);
      if (!authObj || !authObj.id) {
        // Sem objeto de autorização não dá pra resolver tenant/token; ack (nada a fazer).
        console.log(`[tenant-webhook] pix-auto sem authorization no payload (${event}) — ack`);
        return json({ received: true, ignored: "sem authorization" });
      }
      const pixCompanyId = await resolveCompanyForPixAuth(supabase, authObj);
      if (!pixCompanyId) {
        await recordOrphan(supabase, event, { id: authObj.id, externalReference: authObj.externalReference });
        return json({ received: true, matched: false, unmatched_recorded: true });
      }
      const expectedTokenPix = await readWebhookToken(supabase, pixCompanyId);
      if (!expectedTokenPix || !providedToken || !timingSafeEqual(providedToken, expectedTokenPix)) {
        console.error(`[tenant-webhook] token inválido em PIX-AUTO (company ${pixCompanyId})`);
        return json({ error: "Unauthorized webhook" }, 401);
      }
      const pixEventId: string = body?.id ?? `${authObj.id}_${event}`;
      const { error: pixDedupeErr } = await supabase
        .from("tenant_payment_webhook_events")
        .insert({
          event_id: pixEventId,
          event_type: event,
          asaas_payment_id: null,
          company_id: pixCompanyId,
          status: "received",
          raw_payload: body ?? null,
        });
      if (pixDedupeErr) {
        if (pixDedupeErr.code === "23505") {
          const { data: prior } = await supabase
            .from("tenant_payment_webhook_events")
            .select("status")
            .eq("event_id", pixEventId)
            .maybeSingle();
          if (prior?.status === "processed") return json({ received: true, duplicate: true });
          const okR = await processPixAutoAuthEvent(supabase, pixEventId, event, authObj, pixCompanyId);
          return okR ? json({ received: true, reprocessed: true }) : json({ received: false, retry: true }, 500);
        }
        console.error("[tenant-webhook] dedupe insert (pix-auto) falhou:", pixDedupeErr.message);
        return json({ received: false, retry: true }, 500);
      }
      const okPix = await processPixAutoAuthEvent(supabase, pixEventId, event, authObj, pixCompanyId);
      return okPix ? json({ received: true }) : json({ received: false, retry: true }, 500);
    }

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
      // Baixa (dinheiro entrou).
      event === "PAYMENT_RECEIVED" ||
      event === "PAYMENT_CONFIRMED" ||
      event === "PAYMENT_RECEIVED_IN_CASH" ||
      // Estorno/chargeback (reverte baixa).
      event === "PAYMENT_REFUNDED" ||
      event === "PAYMENT_REFUND_IN_PROGRESS" ||
      event.startsWith("PAYMENT_CHARGEBACK") ||
      event === "PAYMENT_AWAITING_CHARGEBACK_REVERSAL" ||
      // Mudança de estado da cobrança/assinatura (vencido/removido/restaurado) →
      // roda síncrono pra Asaas re-entregar se falhar.
      event === "PAYMENT_OVERDUE" ||
      event === "PAYMENT_DELETED" ||
      event === "PAYMENT_RESTORED";

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

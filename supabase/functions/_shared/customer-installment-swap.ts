// customer-installment-swap
// -------------------------
// Peças do "cliente escolhe as parcelas" que falam com a Asaas e com a RPC de
// troca. Usadas por DOIS chamadores, com a MESMA régua:
//   • tenant-asaas-pay-charge-card → caminho principal (o pagador clicou);
//   • tenant-asaas-reconcile        → rede de segurança (cron a cada 6h) que
//                                     completa troca que ficou presa.
//
// A venda parcelada nova nasce com externalReference = tenant_charges.id (mesmo
// padrão do lote de boleto/pix): é o que deixa achar EXATAMENTE as vendas desta
// cobrança, sem heurística, mesmo quando a resposta do POST se perdeu.
//
// Doc da Asaas usada aqui (conferida pelo Tech Lead em 2026-11-26):
//   GET    /payments?externalReference=&billingType=   → lista
//   GET    /payments?installment=<id>                  → parcelas de um parcelamento
//   GET    /installments/{id}  → value (TOTAL), netValue, paymentValue,
//                                installmentCount, customer, deleted, refunds
//                                (o objeto NÃO tem externalReference)
//   POST   /installments/{id}/refund → estorno integral (corpo vazio); só com o
//                                      parcelamento CONFIRMADO ou RECEBIDO
//   DELETE /installments/{id}  → só com as cobranças aguardando pagamento ou
//                                vencidas (serve p/ AWAITING_RISK_ANALYSIS/PENDING)
//   DELETE /payments/{id}      → remove a cobrança 1x antiga (pendente)
//
// LOG: só ids internos/estado. Nunca dado de cartão (nem passa por aqui).

import { AsaasApiError, type AsaasTenantClient } from "./asaas-tenant-client.ts";

/** Status de parcela que significam "o cartão foi capturado". */
export const CAPTURED_STATUSES = new Set([
  "CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH", "AWAITING_RISK_ANALYSIS",
]);
/** Capturado e liquidado/confirmado (estorno é o desfazer certo). */
const SETTLED_STATUSES = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);
/** Ainda não capturado em definitivo (remover é o desfazer certo). */
const NOT_SETTLED_STATUSES = new Set(["AWAITING_RISK_ANALYSIS", "PENDING", "OVERDUE"]);
/** Já desfeito na Asaas. */
const UNDONE_STATUSES = new Set([
  "REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS", "DELETED", "CANCELLED", "CANCELED",
]);

const round2 = (v: number) => Math.round(v * 100) / 100;

export interface AsaasPaymentLite {
  id?: string;
  status?: string;
  customer?: string;
  billingType?: string;
  installment?: string | null;
  installmentNumber?: number | null;
  value?: number | null;
  netValue?: number | null;
  invoiceUrl?: string | null;
  externalReference?: string | null;
  paymentDate?: string | null;
  confirmedDate?: string | null;
  deleted?: boolean;
}

/** Venda parcelada com o cartão JÁ capturado, pronta para entrar na troca. */
export interface CapturedInstallment {
  /** payment.id da 1ª parcela (vira o asaas_payment_id da cobrança). */
  paymentId: string;
  installmentId: string;
  installmentCount: number;
  /** Total da venda (value do parcelamento). */
  billedValue: number;
  /** netValue da 1ª parcela (mesmo critério do create-charge parcelado). */
  netValue: number | null;
  status: string;
  /** invoiceUrl da venda nova (vira o invoice_url da cobrança na troca). */
  invoiceUrl: string | null;
}

function numOrNull(v: unknown): number | null {
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

/**
 * Procura uma venda parcelada desta cobrança (externalReference =
 * tenant_charges.id), no cartão, com o cartão capturado e que NÃO é a que a
 * cobrança já aponta. LANÇA se a consulta falhar: sem saber, não cobramos.
 */
export async function findCapturedInstallmentSale(
  asaas: AsaasTenantClient,
  chargeId: string,
  currentPaymentId: string | null,
): Promise<CapturedInstallment | null> {
  const list = await asaas.get<{ data?: AsaasPaymentLite[] }>(
    "/payments",
    `externalReference=${encodeURIComponent(chargeId)}&billingType=CREDIT_CARD&limit=100`,
  );
  const rows = (Array.isArray(list?.data) ? list.data : []).filter((p) =>
    typeof p?.id === "string" &&
    p.id !== currentPaymentId &&
    p.externalReference === chargeId &&
    typeof p.installment === "string" && p.installment.length > 0 &&
    p.deleted !== true
  );
  const groups = new Map<string, AsaasPaymentLite[]>();
  for (const p of rows) {
    const key = p.installment as string;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  for (const [installmentId, group] of groups) {
    const captured = group.find((p) => CAPTURED_STATUSES.has(String(p.status ?? "").toUpperCase()));
    if (!captured) continue;
    const first = [...group].sort((a, b) =>
      Number(a.installmentNumber ?? 99) - Number(b.installmentNumber ?? 99)
    )[0];

    // Contagem/total pela própria Asaas. A lista é só plano B (pode vir
    // paginada); o payload de payment não traz installmentCount.
    let installmentCount = group.length;
    let billedValue = round2(group.reduce((acc, p) => acc + Number(p.value ?? 0), 0));
    try {
      const inst = await asaas.get<{ installmentCount?: number; value?: number; deleted?: boolean }>(
        `/installments/${installmentId}`,
      );
      if (inst?.deleted === true) continue;
      if (Number.isInteger(Number(inst?.installmentCount)) && Number(inst?.installmentCount) > 1) {
        installmentCount = Number(inst.installmentCount);
      }
      if (Number.isFinite(Number(inst?.value)) && Number(inst?.value) > 0) {
        billedValue = round2(Number(inst.value));
      }
    } catch { /* plano B: agregado da lista */ }
    if (installmentCount < 2) continue;

    return {
      paymentId: String(first.id),
      installmentId,
      installmentCount,
      billedValue,
      netValue: numOrNull(first.netValue),
      status: String(first.status ?? captured.status ?? "").toUpperCase(),
      invoiceUrl: typeof first.invoiceUrl === "string" ? first.invoiceUrl : null,
    };
  }
  return null;
}

export type SwapOutcome =
  | { outcome: "swapped"; reason: string | null }
  | { outcome: "refused"; reason: string }
  | { outcome: "uncertain"; reason: string };

/**
 * Troca atômica (RPC replace_tenant_charge_gateway_payment, compare-and-swap
 * pelo id da 1x). Erro de RPC é re-tentado; depois de cada erro conferimos se
 * a troca já aconteceu (a RPC é idempotente: mesmo id novo → already_swapped).
 *   swapped   = a cobrança aponta pra venda nova;
 *   refused   = a RPC recusou (reason) OU errou de forma persistente com a
 *               releitura provando que NÃO trocou → desfazer a venda nova;
 *   uncertain = nem a RPC nem a releitura responderam → não desfazer às cegas.
 */
export async function swapToInstallmentSale(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  chargeId: string,
  oldPaymentId: string,
  captured: CapturedInstallment,
): Promise<SwapOutcome> {
  let lastReadOk = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.rpc("replace_tenant_charge_gateway_payment", {
      p_charge_id: chargeId,
      p_expected_payment_id: oldPaymentId,
      p_new_payment_id: captured.paymentId,
      p_new_installment_id: captured.installmentId,
      p_installment_count: captured.installmentCount,
      p_billed_value: captured.billedValue,
      p_net_value: captured.netValue,
      p_new_invoice_url: captured.invoiceUrl,
    });
    if (!error) {
      const r = (data ?? {}) as { swapped?: boolean; reason?: string | null };
      return r.swapped === true
        ? { outcome: "swapped", reason: r.reason ?? null }
        : { outcome: "refused", reason: String(r.reason ?? "sem_motivo") };
    }
    const { data: row, error: readErr } = await supabase
      .from("tenant_charges")
      .select("asaas_payment_id")
      .eq("id", chargeId)
      .maybeSingle();
    if (readErr) {
      lastReadOk = false;
      continue;
    }
    lastReadOk = true;
    if ((row as { asaas_payment_id?: string } | null)?.asaas_payment_id === captured.paymentId) {
      return { outcome: "swapped", reason: "confirmed_by_read" };
    }
  }
  return lastReadOk
    ? { outcome: "refused", reason: "rpc_error" }
    : { outcome: "uncertain", reason: "rpc_and_read_error" };
}

/** Remove a cobrança 1x substituída. true = removida (ou já não existia). */
export async function deleteSupersededPayment(
  asaas: AsaasTenantClient,
  oldPaymentId: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await asaas.delete(`/payments/${oldPaymentId}`);
      return true;
    } catch (e) {
      if (e instanceof AsaasApiError && e.status === 404) return true;
    }
  }
  return false;
}

/** Estado agregado de um parcelamento, lido da Asaas (pra decidir o desfazer). */
async function installmentState(
  asaas: AsaasTenantClient,
  installmentId: string,
): Promise<"undone" | "settled" | "not_settled" | "unknown"> {
  try {
    const inst = await asaas.get<{ deleted?: boolean }>(`/installments/${installmentId}`);
    if (inst?.deleted === true) return "undone";
  } catch (e) {
    if (e instanceof AsaasApiError && e.status === 404) return "undone";
  }
  try {
    const list = await asaas.get<{ data?: AsaasPaymentLite[] }>(
      "/payments",
      `installment=${encodeURIComponent(installmentId)}&limit=100`,
    );
    const statuses = (Array.isArray(list?.data) ? list.data : [])
      .filter((p) => p?.deleted !== true)
      .map((p) => String(p.status ?? "").toUpperCase());
    if (statuses.length === 0 || statuses.every((s) => UNDONE_STATUSES.has(s))) return "undone";
    if (statuses.some((s) => SETTLED_STATUSES.has(s))) return "settled";
    if (statuses.some((s) => NOT_SETTLED_STATUSES.has(s))) return "not_settled";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Desfaz a venda parcelada INTEIRA. A operação certa depende do status:
 *   confirmada/recebida   → POST /installments/{id}/refund (estorno integral);
 *   em análise/pendente   → DELETE /installments/{id}.
 * Resposta inconclusiva (timeout, 5xx, recusa) → CONSULTA o parcelamento antes
 * de repetir, e repete uma vez com a operação que o estado pede.
 * true = a Asaas desfez (ou já estava desfeito).
 */
export async function undoCapturedInstallment(
  asaas: AsaasTenantClient,
  installmentId: string,
  status: string,
): Promise<boolean> {
  const run = async (kind: "settled" | "not_settled") => {
    if (kind === "settled") await asaas.post(`/installments/${installmentId}/refund`, {});
    else await asaas.delete(`/installments/${installmentId}`);
  };
  const first: "settled" | "not_settled" = NOT_SETTLED_STATUSES.has(String(status).toUpperCase())
    ? "not_settled"
    : "settled";
  try {
    await run(first);
    return true;
  } catch { /* conferir antes de repetir */ }

  const state = await installmentState(asaas, installmentId);
  if (state === "undone") return true;
  if (state === "unknown") return false;
  try {
    await run(state);
    return true;
  } catch {
    return (await installmentState(asaas, installmentId)) === "undone";
  }
}

/**
 * Dá a baixa de TODAS as parcelas já confirmadas de um parcelamento pelo
 * caminho POR PARCELA (apply_tenant_charge_installment_payment, idempotente
 * por asaas_payment_id). Usado depois de uma troca feita pela recuperação/
 * reconcile: os eventos dessas parcelas podem já ter passado pelo webhook
 * antes da troca (e caído no fallback). Devolve quantas baixas foram aplicadas
 * sem erro.
 */
export async function applyCapturedInstallmentPayments(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  asaas: AsaasTenantClient,
  installmentId: string,
): Promise<{ applied: number; errors: number }> {
  const list = await asaas.get<{ data?: AsaasPaymentLite[] }>(
    "/payments",
    `installment=${encodeURIComponent(installmentId)}&limit=100`,
  );
  let applied = 0;
  let errors = 0;
  for (const p of Array.isArray(list?.data) ? list.data : []) {
    const st = String(p?.status ?? "").toUpperCase();
    if (!p?.id || p.deleted === true || !SETTLED_STATUSES.has(st)) continue;
    const value = numOrNull(p.value);
    if (value === null || value <= 0) continue;
    const { error } = await supabase.rpc("apply_tenant_charge_installment_payment", {
      p_asaas_payment_id: p.id,
      p_asaas_installment_id: installmentId,
      p_value: value,
      p_net_value: numOrNull(p.netValue),
      p_paid_at: p.paymentDate || p.confirmedDate || new Date().toISOString(),
      p_installment_number: p.installmentNumber ?? null,
    });
    if (error) errors++;
    else applied++;
  }
  return { applied, errors };
}

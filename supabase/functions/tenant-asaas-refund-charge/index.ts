// tenant-asaas-refund-charge
// ---------------------------
// PRIVILEGIADA (Bearer + módulo 'cobrancas' + can_manage_system). ESTORNA uma
// cobrança JÁ PAGA na conta Asaas DO TENANT (chave BYO lida do Vault), chamando
// POST /payments/{id}/refund (estorno TOTAL no MVP).
//
// company_id vem do profile (payments-auth), nunca do payload — posse garantida.
//
// FONTE ÚNICA DA VERDADE: NÃO alteramos tenant_charges nem o Financeiro aqui.
// Quem reverte a baixa (status → REFUNDED, reabre o recebível) é o webhook
// PAYMENT_REFUNDED/CHARGEBACK (já implementado). Este edge só dispara o estorno
// na Asaas e devolve o status que a Asaas retornou. Evita divergência de estado.
//
// Nunca loga a chave, nunca vaza net/custo.

import { handleCors } from "../_shared/cors.ts";
import {
  authorizePaymentsManager,
  jsonResponse,
  vaultReadSecret,
} from "../_shared/payments-auth.ts";
import { asaasFor, AsaasApiError } from "../_shared/asaas-tenant-client.ts";

interface RefundChargeInput {
  charge_id?: string;
  asaas_payment_id?: string;
}

/** Status que representam cobrança EFETIVAMENTE PAGA (estornável). */
const PAID_STATUSES: readonly string[] = ["RECEIVED", "CONFIRMED"];

/** Status que representam cobrança JÁ estornada/revertida (não estorna de novo). */
const ALREADY_REFUNDED_STATUSES: readonly string[] = ["REFUNDED", "CHARGEBACK"];

Deno.serve(async (req) => {
  // Rede de segurança de topo: nenhuma exceção escapa (senão o gateway devolve 502
  // cru, sem JSON, e o front não lê error.context). Tudo vira Response JSON PT-BR.
  try {
    return await handleRequest(req);
  } catch (e) {
    console.error("[refund-charge] exceção não tratada no topo:", (e as Error)?.message ?? e);
    return jsonResponse(req, {
      error: "Ocorreu um erro ao estornar a cobrança. Tente novamente em instantes.",
    }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await authorizePaymentsManager(req);
  if (!auth.ok) return auth.response;
  const { supabase, companyId } = auth;

  let input: RefundChargeInput;
  try {
    input = await req.json();
  } catch {
    return jsonResponse(req, { error: "Requisição inválida." }, 400);
  }

  const chargeId =
    typeof input.charge_id === "string" && input.charge_id.trim() ? input.charge_id.trim() : null;
  const asaasPaymentIdInput =
    typeof input.asaas_payment_id === "string" && input.asaas_payment_id.trim()
      ? input.asaas_payment_id.trim()
      : null;
  if (!chargeId && !asaasPaymentIdInput) {
    return jsonResponse(req, {
      error: "Informe a cobrança que deseja estornar.",
    }, 400);
  }

  try {
    // 1) Carrega a cobrança POR POSSE (company_id do profile). Filtra pelo
    //    identificador recebido (uuid interno OU asaas_payment_id). Cobrança de
    //    outro tenant simplesmente não é encontrada (mesma resposta 404 → não vaza).
    let query = supabase
      .from("tenant_charges")
      .select("id, asaas_payment_id, status")
      .eq("company_id", companyId);
    query = chargeId
      ? query.eq("id", chargeId)
      : query.eq("asaas_payment_id", asaasPaymentIdInput as string);

    const { data: charge } = await query.maybeSingle();
    if (!charge) {
      return jsonResponse(req, { error: "Cobrança não encontrada." }, 404);
    }

    const asaasPaymentId: string | null = (charge as any).asaas_payment_id ?? null;
    const status: string = String((charge as any).status ?? "").toUpperCase();
    if (!asaasPaymentId) {
      return jsonResponse(req, {
        error: "Esta cobrança não está vinculada à Asaas e não pode ser estornada.",
      }, 400);
    }

    // 2) Guarda de estado.
    if (ALREADY_REFUNDED_STATUSES.includes(status)) {
      return jsonResponse(req, { error: "Esta cobrança já foi estornada." }, 400);
    }
    if (!PAID_STATUSES.includes(status)) {
      // PENDING / OVERDUE / CANCELLED / etc. — nunca foi paga.
      return jsonResponse(req, {
        error:
          "Só é possível estornar uma cobrança já paga. Para uma cobrança em aberto, cancele-a.",
      }, 400);
    }

    // 3) Chave BYO do Vault → cliente Asaas do tenant.
    const { data: accountData } = await supabase
      .from("tenant_payment_accounts")
      .select("status, vault_secret_name")
      .eq("company_id", companyId)
      .maybeSingle();
    const account = accountData as any;
    if (!account || account.status !== "active" || !account.vault_secret_name) {
      return jsonResponse(req, {
        error: "Ative o recebimento de pagamentos em Configurações → Integrações antes de estornar cobranças.",
      }, 400);
    }
    const apiKey = await vaultReadSecret(supabase, account.vault_secret_name);
    if (!apiKey) {
      return jsonResponse(req, {
        error: "A chave da Asaas não foi encontrada. Reative a integração em Configurações → Integrações.",
      }, 400);
    }
    const asaas = asaasFor(apiKey);

    // 4) Estorno TOTAL: corpo vazio (a Asaas aceita { value } pra parcial; no MVP
    //    fazemos sempre total). Base já inclui /v3.
    const refund = await asaas.post<any>(`/payments/${asaasPaymentId}/refund`, {});

    // 5) NÃO tocamos tenant_charges nem o Financeiro. O webhook PAYMENT_REFUNDED
    //    reverte a baixa (fonte única da verdade). Só devolvemos o status do Asaas.
    return jsonResponse(req, {
      refund: {
        asaas_payment_id: asaasPaymentId,
        status: refund?.status ?? "REFUNDED",
      },
    }, 200);
  } catch (e) {
    const errStatus = e instanceof AsaasApiError ? e.status : 500;
    console.error("[refund-charge] erro:", (e as Error).message);
    return jsonResponse(req, {
      error: e instanceof AsaasApiError
        ? (e.message || "Falha ao estornar a cobrança na Asaas.")
        : "Ocorreu um erro ao estornar a cobrança. Tente novamente.",
    }, errStatus >= 400 && errStatus < 600 ? errStatus : 500);
  }
}

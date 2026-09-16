// tenant-asaas-delete-charge
// --------------------------
// PRIVILEGIADA (Bearer + módulo 'cobrancas' + can_manage_system). Exclui uma
// cobrança AINDA NÃO PAGA da conta Asaas DO TENANT (chave BYO lida do Vault) e
// só depois remove o registro do nosso banco.
//
// ORDEM É LEI: gateway PRIMEIRO, nosso banco depois. Apagar aqui antes de a
// Asaas confirmar deixaria a cobrança VIVA E PAGÁVEL no gateway enquanto o
// sistema acha que ela não existe — o cliente paga e ninguém vê entrar.
//   · gateway recusou  -> não encostamos no nosso banco (ok:false).
//   · gateway aceitou e o nosso banco falhou -> ok:true + finance_warning.
//
// POSSE: company_id vem do profile (payments-auth), NUNCA do payload.
//
// ESPELHO NO FINANCEIRO: o "a receber" ligado por tenant_charge_id é removido
// junto — MENOS quando já tem baixa, recebimento parcial, nota fiscal emitida
// ou orçamento apontando pra ele. Nesses casos a linha FICA, recebe um carimbo
// em `notes` (a pista sobrevive ao elo virar nulo) e o usuário é avisado por
// finance_warning. Dinheiro baixado não some em silêncio.
//
// CONTRATO COM A UI (fixado):
//   req  { charge_id }
//   200  { ok:true, deleted:true, finance_warning }
//   200  { ok:false, error_code, message }   // error_code: not_found |
//        not_editable | gateway_error | invalid_input
// (o corpo de erro também repete a mensagem em `error`, chave que os hooks
//  antigos já leem — extractEdgeError.)

import { handleCors } from "../_shared/cors.ts";
import {
  authorizePaymentsManager,
  jsonResponse,
  vaultReadSecret,
} from "../_shared/payments-auth.ts";
import { asaasFor, AsaasApiError } from "../_shared/asaas-tenant-client.ts";

type ErrorCode = "not_found" | "not_editable" | "gateway_error" | "invalid_input" | "unauthorized";

interface DeleteChargeInput {
  charge_id?: string;
}

/** Status (nossos e da Asaas) que travam a exclusão: dinheiro já andou. */
const LOCKED_STATUSES: readonly string[] = [
  "RECEIVED",
  "CONFIRMED",
  "RECEIVED_IN_CASH",
  "REFUNDED",
  "CHARGEBACK",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
];

/** Erro de negócio: HTTP 200 + ok:false (o front trata a mensagem, não o status). */
function fail(req: Request, code: ErrorCode, message: string): Response {
  return jsonResponse(req, { ok: false, error_code: code, message, error: message }, 200);
}

/** Reaproveita a Response do gate de auth (401/403) acrescentando ok/error_code/message. */
async function failFromAuth(req: Request, response: Response): Promise<Response> {
  let message = "Você não tem permissão para excluir cobranças.";
  try {
    const body = await response.clone().json();
    if (body?.error) message = String(body.error);
  } catch {
    /* corpo não-JSON — mantém a mensagem padrão */
  }
  // HTTP 200 de propósito, igual aos demais erros de negócio: com 4xx o
  // supabase-js devolve data=null e a UI perde a mensagem boa em PT-BR.
  return jsonResponse(
    req,
    { ok: false, error_code: "unauthorized", message, error: message },
    200,
  );
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (e) {
    console.error("[delete-charge] exceção não tratada no topo:", (e as Error)?.message ?? e);
    return fail(
      req,
      "gateway_error",
      "Ocorreu um erro ao excluir a cobrança. Tente novamente em instantes.",
    );
  }
});

async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await authorizePaymentsManager(req);
  if (!auth.ok) return await failFromAuth(req, auth.response);
  const { supabase, companyId } = auth;

  let input: DeleteChargeInput;
  try {
    input = await req.json();
  } catch {
    return fail(req, "invalid_input", "Requisição inválida.");
  }

  const chargeId =
    typeof input.charge_id === "string" && input.charge_id.trim() ? input.charge_id.trim() : null;
  if (!chargeId) {
    return fail(req, "invalid_input", "Informe a cobrança que deseja excluir.");
  }

  try {
    // ---- 1. Cobrança POR POSSE. Cobrança de outro tenant "não existe".
    const { data: chargeData } = await supabase
      .from("tenant_charges")
      .select("id, asaas_payment_id, status")
      .eq("id", chargeId)
      .eq("company_id", companyId)
      .maybeSingle();
    const charge = chargeData as any;
    if (!charge) {
      return fail(req, "not_found", "Cobrança não encontrada.");
    }

    const localStatus = String(charge.status ?? "").toUpperCase();
    if (LOCKED_STATUSES.includes(localStatus)) {
      return fail(
        req,
        "not_editable",
        "Esta cobrança já foi paga ou estornada e não pode ser excluída. Use o estorno.",
      );
    }

    const asaasPaymentId: string | null = charge.asaas_payment_id ?? null;

    // ---- 2. Sem asaas_payment_id: nunca chegou à Asaas, não há nada vivo no
    //         gateway. Limpa só aqui (registro legado/órfão).
    if (!asaasPaymentId) {
      return await applyLocally(req, supabase, companyId, charge.id, null);
    }

    // ---- 3. Chave BYO do Vault → cliente Asaas do tenant.
    const { data: accountData } = await supabase
      .from("tenant_payment_accounts")
      .select("status, vault_secret_name")
      .eq("company_id", companyId)
      .maybeSingle();
    const account = accountData as any;
    if (!account || account.status !== "active" || !account.vault_secret_name) {
      return fail(
        req,
        "gateway_error",
        "Ative o recebimento de pagamentos em Configurações → Integrações antes de excluir cobranças.",
      );
    }
    const apiKey = await vaultReadSecret(supabase, account.vault_secret_name);
    if (!apiKey) {
      return fail(
        req,
        "gateway_error",
        "A chave da Asaas não foi encontrada. Reative a integração em Configurações → Integrações.",
      );
    }
    const asaas = asaasFor(apiKey);

    // ---- 4. Estado AUTORITATIVO no gateway.
    let current: any = null;
    let alreadyGone = false;
    try {
      current = await asaas.get<any>(`/payments/${asaasPaymentId}`);
    } catch (e) {
      if (e instanceof AsaasApiError && e.status === 404) {
        // A cobrança não existe mais lá. O registro daqui é fantasma: limpar é
        // exatamente o que o usuário pediu, e não há risco de deixar cobrança
        // viva no gateway.
        alreadyGone = true;
      } else {
        throw e;
      }
    }

    if (!alreadyGone) {
      if (current?.deleted === true) {
        alreadyGone = true;
      } else {
        const gatewayStatus = String(current?.status ?? "").toUpperCase();
        if (LOCKED_STATUSES.includes(gatewayStatus)) {
          return fail(
            req,
            "not_editable",
            "Esta cobrança já foi paga ou estornada e não pode ser excluída. Use o estorno.",
          );
        }

        // ---- 5. Remoção no gateway.
        //         Cobrança parcelada: o id guardado é UMA parcela. Apagar só ela
        //         deixaria as outras vivas e pagáveis. Removemos o PARCELAMENTO
        //         inteiro, que é o que a linha daqui representa (valor total).
        const installmentId: string | null = current?.installment ?? null;
        const removed = installmentId
          ? await asaas.delete<any>(`/installments/${installmentId}`)
          : await asaas.delete<any>(`/payments/${asaasPaymentId}`);

        if (removed && removed.deleted === false) {
          return fail(
            req,
            "gateway_error",
            "A Asaas não conseguiu excluir esta cobrança. Tente novamente em instantes.",
          );
        }
      }
    }

    // ---- 6. Nosso banco acompanha (gateway já confirmou).
    return await applyLocally(
      req,
      supabase,
      companyId,
      charge.id,
      alreadyGone
        ? "Esta cobrança já não estava mais na sua conta de pagamentos. Removemos o registro aqui do sistema."
        : null,
    );
  } catch (e) {
    if (e instanceof AsaasApiError) {
      console.error("[delete-charge] Asaas recusou:", e.message);
      return fail(
        req,
        "gateway_error",
        e.message || "A Asaas não aceitou a exclusão desta cobrança.",
      );
    }
    console.error("[delete-charge] erro:", (e as Error)?.message ?? e);
    return fail(req, "gateway_error", "Ocorreu um erro ao excluir a cobrança. Tente novamente.");
  }
}

/**
 * Remove a cobrança e o "a receber" espelho do NOSSO banco via RPC transacional.
 * Chamado SÓ depois do gateway confirmar. Falha aqui NÃO vira erro: a exclusão
 * já vale lá fora e mandar "deu erro" faria o usuário tentar de novo à toa.
 */
async function applyLocally(
  req: Request,
  supabase: any,
  companyId: string,
  chargeId: string,
  extraWarning: string | null,
): Promise<Response> {
  let result: any = null;
  try {
    const { data, error } = await supabase.rpc("delete_tenant_charge_local", {
      p_company_id: companyId,
      p_charge_id: chargeId,
    });
    if (error) throw new Error(error.message);
    result = data;
  } catch (e) {
    console.error("[delete-charge] delete_tenant_charge_local falhou:", (e as Error)?.message ?? e);
    return jsonResponse(req, {
      ok: true,
      deleted: true,
      finance_warning:
        "A cobrança foi excluída da sua conta de pagamentos, mas não conseguimos remover o registro aqui no sistema. Ela pode continuar aparecendo na lista. Tente excluir de novo em instantes.",
    }, 200);
  }

  const warnings: string[] = [];
  if (extraWarning) warnings.push(extraWarning);

  if (!result || result.found !== true) {
    warnings.push("O registro desta cobrança já não existia aqui no sistema.");
    return jsonResponse(req, {
      ok: true,
      deleted: true,
      finance_warning: warnings.join(" "),
    }, 200);
  }

  const reasons: string[] = Array.isArray(result.mirror_reasons) ? result.mirror_reasons : [];
  if (Number(result.mirror_kept ?? 0) > 0) {
    if (reasons.includes("paid")) {
      warnings.push(
        "A cobrança foi excluída, mas o lançamento no Financeiro já estava baixado e foi mantido. Confira se ele precisa ser ajustado ou estornado.",
      );
    } else if (reasons.includes("partial")) {
      warnings.push(
        "A cobrança foi excluída, mas o lançamento no Financeiro já tinha recebimento parcial e foi mantido. Confira se ele precisa de ajuste.",
      );
    } else {
      warnings.push(
        "A cobrança foi excluída, mas o lançamento no Financeiro foi mantido porque tem vínculo com outro documento.",
      );
    }
    if (reasons.includes("nfse")) {
      warnings.push("Existe nota fiscal emitida ligada a este lançamento.");
    }
    if (reasons.includes("quote")) {
      warnings.push("Existe orçamento ligado a este lançamento.");
    }
  }

  return jsonResponse(req, {
    ok: true,
    deleted: true,
    finance_warning: warnings.length > 0 ? warnings.join(" ") : null,
  }, 200);
}

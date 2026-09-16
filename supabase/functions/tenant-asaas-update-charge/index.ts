// tenant-asaas-update-charge
// --------------------------
// PRIVILEGIADA (Bearer + módulo 'cobrancas' + can_manage_system). Altera VALOR,
// VENCIMENTO e/ou DESCRIÇÃO de uma cobrança AINDA NÃO PAGA na conta Asaas DO
// TENANT (chave BYO lida do Vault) e só depois alinha o nosso banco.
//
// ORDEM É LEI: gateway PRIMEIRO, nosso banco depois.
//   · gateway recusou  -> não encostamos no nosso banco (ok:false).
//   · gateway aceitou e o nosso banco falhou -> ok:true + finance_warning.
//     A verdade é o gateway; o usuário precisa saber que o nosso lado ficou
//     pra trás, não receber um "deu erro" que o faria tentar de novo.
//
// POSSE: company_id vem do profile (payments-auth), NUNCA do payload. RLS não
// cobre service_role, então o predicado de company_id é reaplicado à mão aqui
// e de novo dentro da RPC.
//
// ESPELHO NO FINANCEIRO: o "a receber" ligado por tenant_charge_id acompanha o
// novo valor/vencimento/descrição — MENOS quando já tem baixa (is_paid ou
// recebimento parcial). Nesse caso a linha fica intacta e o usuário é avisado
// por finance_warning. Dinheiro baixado não é sobrescrito em silêncio.
//
// CONTRATO COM A UI (fixado):
//   req  { charge_id, value?, due_date?, description? }
//   200  { ok:true, charge:{id,value,due_date,description,status,invoice_url}, finance_warning }
//   200  { ok:false, error_code, message }   // error_code: not_found |
//        not_editable | gateway_error | invalid_input
// (o corpo de erro também repete a mensagem em `error`, que é a chave que os
//  hooks antigos já leem — extractEdgeError.)

import { handleCors } from "../_shared/cors.ts";
import {
  authorizePaymentsManager,
  jsonResponse,
  vaultReadSecret,
} from "../_shared/payments-auth.ts";
import { asaasFor, AsaasApiError } from "../_shared/asaas-tenant-client.ts";

type ErrorCode = "not_found" | "not_editable" | "gateway_error" | "invalid_input" | "unauthorized";

interface UpdateChargeInput {
  charge_id?: string;
  value?: number;
  due_date?: string;
  description?: string;
}

/** Status (nossos e da Asaas) que travam qualquer alteração: dinheiro já andou. */
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

/** Valor mínimo aceito pela Asaas por cobrança (R$ 5,00). */
const MIN_CHARGE_VALUE = 5;

/** Erro de negócio: HTTP 200 + ok:false (o front trata a mensagem, não o status). */
function fail(req: Request, code: ErrorCode, message: string): Response {
  return jsonResponse(req, { ok: false, error_code: code, message, error: message }, 200);
}

/**
 * Converte a Response do gate de auth no formato de erro desta edge. A UI nova
 * lê `message`; os hooks antigos continuam lendo `error`.
 */
async function failFromAuth(req: Request, response: Response): Promise<Response> {
  let message = "Você não tem permissão para alterar cobranças.";
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

/** Valida AAAA-MM-DD, data real e não anterior a hoje (UTC, dia cheio). */
function validateDueDate(due: string): { ok: true } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return { ok: false, error: "A data de vencimento deve estar no formato AAAA-MM-DD." };
  }
  const parsed = new Date(`${due}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(due)) {
    return { ok: false, error: "A data de vencimento é inválida." };
  }
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (parsed.getTime() < todayUtc) {
    return { ok: false, error: "A data de vencimento não pode estar no passado." };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  // Rede de segurança de topo: nenhuma exceção escapa sem virar JSON PT-BR.
  try {
    return await handleRequest(req);
  } catch (e) {
    console.error("[update-charge] exceção não tratada no topo:", (e as Error)?.message ?? e);
    return fail(
      req,
      "gateway_error",
      "Ocorreu um erro ao alterar a cobrança. Tente novamente em instantes.",
    );
  }
});

async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await authorizePaymentsManager(req);
  if (!auth.ok) return await failFromAuth(req, auth.response);
  const { supabase, companyId } = auth;

  let input: UpdateChargeInput;
  try {
    input = await req.json();
  } catch {
    return fail(req, "invalid_input", "Requisição inválida.");
  }

  const chargeId =
    typeof input.charge_id === "string" && input.charge_id.trim() ? input.charge_id.trim() : null;
  if (!chargeId) {
    return fail(req, "invalid_input", "Informe a cobrança que deseja alterar.");
  }

  // ---- Campos opcionais: manda só o que mudou. Nenhum = nada a fazer.
  const wantsValue = input.value !== undefined && input.value !== null;
  const wantsDueDate = typeof input.due_date === "string" && input.due_date.trim() !== "";
  const wantsDescription = typeof input.description === "string";
  if (!wantsValue && !wantsDueDate && !wantsDescription) {
    return fail(req, "invalid_input", "Não há nada para alterar nesta cobrança.");
  }

  let newValue: number | null = null;
  if (wantsValue) {
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fail(req, "invalid_input", "Informe um valor válido para a cobrança.");
    }
    if (parsed < MIN_CHARGE_VALUE) {
      return fail(
        req,
        "invalid_input",
        `O valor mínimo de uma cobrança é R$ ${MIN_CHARGE_VALUE.toFixed(2).replace(".", ",")}.`,
      );
    }
    // A Asaas recusa mais de 2 casas decimais.
    newValue = Math.round(parsed * 100) / 100;
  }

  let newDueDate: string | null = null;
  if (wantsDueDate) {
    const raw = (input.due_date as string).trim();
    const check = validateDueDate(raw);
    if (!check.ok) return fail(req, "invalid_input", check.error);
    newDueDate = raw;
  }

  // Descrição vazia é intenção válida (limpar) — a Asaas aceita string vazia.
  const newDescription = wantsDescription ? (input.description as string).trim().slice(0, 500) : null;

  try {
    // ---- 1. Cobrança POR POSSE. Cobrança de outro tenant "não existe".
    const { data: chargeData } = await supabase
      .from("tenant_charges")
      .select(
        "id, asaas_payment_id, status, value, due_date, description, billing_type, invoice_url, boleto_url, pix_copy_paste",
      )
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
        "Esta cobrança já foi paga ou estornada e não pode mais ser alterada.",
      );
    }

    const asaasPaymentId: string | null = charge.asaas_payment_id ?? null;

    // ---- 2. Cobrança que nunca chegou à Asaas (sem asaas_payment_id): não há
    //         nada vivo no gateway, então alteramos só aqui. Caminho raro
    //         (registro legado/órfão), mas não pode dar erro na cara do usuário.
    if (!asaasPaymentId) {
      return await applyLocally(req, supabase, companyId, charge, {
        value: newValue ?? Number(charge.value),
        dueDate: newDueDate ?? charge.due_date ?? null,
        description: newDescription ?? charge.description ?? null,
        status: charge.status,
        invoiceUrl: charge.invoice_url ?? null,
        boletoUrl: charge.boleto_url ?? null,
        pixCopyPaste: charge.pix_copy_paste ?? null,
      });
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
        "Ative o recebimento de pagamentos em Configurações → Integrações antes de alterar cobranças.",
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

    // ---- 4. Estado AUTORITATIVO no gateway (nosso status pode estar velho se
    //         algum webhook se perdeu — quem manda é a Asaas).
    let current: any;
    try {
      current = await asaas.get<any>(`/payments/${asaasPaymentId}`);
    } catch (e) {
      if (e instanceof AsaasApiError && e.status === 404) {
        return fail(req, "not_found", "Esta cobrança não existe mais na sua conta de pagamentos.");
      }
      throw e;
    }
    if (current?.deleted === true) {
      return fail(req, "not_found", "Esta cobrança já foi removida da sua conta de pagamentos.");
    }
    const gatewayStatus = String(current?.status ?? "").toUpperCase();
    if (LOCKED_STATUSES.includes(gatewayStatus)) {
      return fail(
        req,
        "not_editable",
        "Esta cobrança já foi paga ou estornada e não pode mais ser alterada.",
      );
    }

    // Cobrança parcelada: o id que guardamos aponta pra UMA parcela, e o valor
    // que mostramos é o TOTAL do parcelamento. Alterar por aqui deixaria os dois
    // lados dizendo coisas diferentes. Recusamos com caminho alternativo claro.
    if (current?.installment) {
      return fail(
        req,
        "not_editable",
        "Esta cobrança foi parcelada e não pode ser alterada por aqui. Exclua e gere uma nova cobrança com os valores corretos.",
      );
    }

    // ---- 5. Imagem final enviada ao gateway. Campos que NÃO estão mudando são
    //         reenviados com o valor atual da Asaas (inclusive externalReference,
    //         multa, juros e desconto) pra um PUT não apagar configuração — sem
    //         o externalReference o webhook perde a resolução do tenant.
    const finalValue = newValue ?? Number(current?.value ?? charge.value);
    const finalDueDate = newDueDate ?? current?.dueDate ?? charge.due_date ?? null;
    const finalDescription =
      newDescription !== null ? newDescription : (current?.description ?? charge.description ?? null);
    const billingType = String(current?.billingType ?? charge.billing_type ?? "UNDEFINED");

    const putBody: Record<string, unknown> = {
      billingType,
      value: finalValue,
      dueDate: finalDueDate,
      description: finalDescription ?? undefined,
      externalReference: current?.externalReference ?? companyId,
    };
    if (current?.fine?.value) {
      putBody.fine = { value: current.fine.value, type: current.fine.type ?? "PERCENTAGE" };
    }
    if (current?.interest?.value) {
      putBody.interest = { value: current.interest.value, type: current.interest.type ?? "PERCENTAGE" };
    }
    if (current?.discount?.value) {
      putBody.discount = {
        value: current.discount.value,
        type: current.discount.type ?? "PERCENTAGE",
        dueDateLimitDays: current.discount.dueDateLimitDays ?? 0,
      };
    }

    const updated = await asaas.put<any>(`/payments/${asaasPaymentId}`, putBody);

    // ---- 6. Pix copia-e-cola: o payload CARREGA O VALOR. Mudou valor ou
    //         vencimento, o antigo vira armadilha (cliente paga o valor velho).
    //         Regeramos; se não vier, gravamos null de propósito — a página de
    //         pagamento cai no link hospedado da Asaas.
    let pixCopyPaste: string | null = null;
    const effectiveBilling = String(updated?.billingType ?? billingType).toUpperCase();
    if (effectiveBilling === "PIX" || effectiveBilling === "UNDEFINED") {
      try {
        const pix = await asaas.get<any>(`/payments/${asaasPaymentId}/pixQrCode`);
        pixCopyPaste = pix?.payload ?? null;
      } catch {
        pixCopyPaste = null;
      }
    }

    // ---- 7. Nosso banco acompanha (gateway já confirmou).
    return await applyLocally(req, supabase, companyId, charge, {
      value: Number(updated?.value ?? finalValue),
      dueDate: updated?.dueDate ?? finalDueDate,
      description: updated?.description ?? finalDescription,
      status: updated?.status ?? charge.status,
      invoiceUrl: updated?.invoiceUrl ?? charge.invoice_url ?? null,
      boletoUrl: updated?.bankSlipUrl ?? null,
      pixCopyPaste,
    });
  } catch (e) {
    if (e instanceof AsaasApiError) {
      console.error("[update-charge] Asaas recusou:", e.message);
      return fail(
        req,
        "gateway_error",
        e.message || "A Asaas não aceitou a alteração desta cobrança.",
      );
    }
    console.error("[update-charge] erro:", (e as Error)?.message ?? e);
    return fail(req, "gateway_error", "Ocorreu um erro ao alterar a cobrança. Tente novamente.");
  }
}

interface FinalImage {
  value: number;
  dueDate: string | null;
  description: string | null;
  status: string;
  invoiceUrl: string | null;
  boletoUrl: string | null;
  pixCopyPaste: string | null;
}

/**
 * Escreve a imagem final no NOSSO banco (cobrança + "a receber" espelho) via
 * RPC transacional. Chamado SÓ depois do gateway confirmar (ou quando não há
 * gateway envolvido). Falha aqui NÃO vira erro: a alteração já vale lá fora.
 */
async function applyLocally(
  req: Request,
  supabase: any,
  companyId: string,
  charge: any,
  img: FinalImage,
): Promise<Response> {
  const fallbackCharge = {
    id: charge.id,
    value: img.value,
    due_date: img.dueDate,
    description: img.description,
    status: img.status,
    invoice_url: img.invoiceUrl,
  };

  let result: any = null;
  try {
    const { data, error } = await supabase.rpc("update_tenant_charge_local", {
      p_company_id: companyId,
      p_charge_id: charge.id,
      p_value: img.value,
      p_due_date: img.dueDate,
      p_description: img.description,
      p_status: img.status,
      p_invoice_url: img.invoiceUrl,
      p_boleto_url: img.boletoUrl,
      p_pix_copy_paste: img.pixCopyPaste,
    });
    if (error) throw new Error(error.message);
    result = data;
  } catch (e) {
    console.error("[update-charge] update_tenant_charge_local falhou:", (e as Error)?.message ?? e);
    return jsonResponse(req, {
      ok: true,
      charge: fallbackCharge,
      finance_warning:
        "A cobrança foi alterada na sua conta de pagamentos, mas não conseguimos atualizar o registro aqui no sistema. Confira a cobrança e o lançamento no Financeiro.",
    }, 200);
  }

  if (!result || result.found !== true) {
    return jsonResponse(req, {
      ok: true,
      charge: fallbackCharge,
      finance_warning:
        "A cobrança foi alterada na sua conta de pagamentos, mas o registro aqui no sistema não foi encontrado para atualizar.",
    }, 200);
  }

  const warnings: string[] = [];
  if (Number(result.mirror_locked ?? 0) > 0) {
    warnings.push(
      "A cobrança foi alterada, mas o lançamento no Financeiro já estava baixado e não foi mexido. Ajuste manualmente se o valor ou o vencimento mudaram.",
    );
  }
  if (Number(result.mirror_nfse ?? 0) > 0) {
    warnings.push(
      "Existe nota fiscal emitida ligada a este lançamento. Confira se a nota precisa de ajuste.",
    );
  }

  return jsonResponse(req, {
    ok: true,
    charge: result.charge ?? fallbackCharge,
    finance_warning: warnings.length > 0 ? warnings.join(" ") : null,
  }, 200);
}

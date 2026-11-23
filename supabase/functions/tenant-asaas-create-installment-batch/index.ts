// Cria N cobranças SIMPLES e independentes para um parcelamento avulso.
// Não usa o carnê/parcelamento nativo do Asaas: cada parcela tem seu próprio
// vencimento, tenant_charge e (quando solicitado) recebível no Financeiro.
//
// Idempotência em três camadas:
//   1. (company_id, client_request_id) identifica a intenção e payload_hash
//      impede reutilizar o mesmo id com outro conteúdo;
//   2. (batch_id, installment_number) reserva cada tenant_charge antes do gateway;
//   3. tenant_charge.id vira externalReference no Asaas. Toda retentativa busca
//      essa referência antes de POSTar e um lease bloqueia POSTs concorrentes.

/* eslint-disable @typescript-eslint/no-explicit-any -- payloads do Asaas e client Supabase Deno não têm schema estático neste runtime */

import { handleCors } from "../_shared/cors.ts";
import {
  authorizePaymentsManager,
  jsonResponse,
  vaultReadSecret,
} from "../_shared/payments-auth.ts";
import {
  AsaasApiError,
  asaasFor,
  type AsaasTenantClient,
  buildQuery,
} from "../_shared/asaas-tenant-client.ts";
import { isValidDocument, unmaskDoc } from "../_shared/document-validation.ts";
import {
  buildInstallmentPlan,
  parseCivilDate,
  sha256Hex,
  todayInTimeZone,
} from "./domain.ts";

type BillingType = "PIX" | "BOLETO" | "UNDEFINED";
type FineType = "PERCENTAGE" | "FIXED";
type ResultStatus = "created" | "existing" | "failed";

const MIN_CHARGE_VALUE = 5;
const MAX_INSTALLMENTS = 12;
const CLAIM_TTL_MS = 2 * 60 * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_BILLING_TYPES: readonly BillingType[] = [
  "PIX",
  "BOLETO",
  "UNDEFINED",
];
const ALLOWED_FINE_TYPES: readonly FineType[] = ["PERCENTAGE", "FIXED"];

interface BatchInput {
  client_request_id?: string;
  customer_id?: string;
  total_value?: number;
  installment_count?: number;
  first_due_date?: string;
  billing_type?: BillingType;
  description?: string;
  fine_type?: FineType;
  fine_value?: number;
  fine_percent?: number;
  interest_percent?: number;
  discount_percent?: number;
  discount_days?: number;
  category?: string;
  cost_center_id?: string | null;
  post_to_finance?: boolean;
}

interface InstallmentResult {
  number: number;
  status: ResultStatus;
  charge?: Record<string, unknown>;
  error?: string;
}

function businessFail(
  req: Request,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse(req, {
    ok: false,
    error_code: code,
    message,
    error: message,
    ...extra,
  }, 200);
}

function optionalText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function installmentDescription(
  base: string,
  number: number,
  total: number,
): string {
  const suffix = ` — Parcela ${number}/${total}`;
  return `${base.slice(0, Math.max(0, 500 - suffix.length))}${suffix}`;
}

function safeInstallmentError(error: unknown): string {
  if (error instanceof AsaasApiError && error.status === 400) {
    return "A Asaas recusou esta parcela. Revise os dados do cliente e as condições da cobrança.";
  }
  return "Não foi possível emitir esta parcela agora. Tente novamente em instantes.";
}

function chargeResponse(row: any, financeWarning: string | null = null) {
  return {
    id: row.id,
    public_short_code: row.public_short_code ?? null,
    checkout_url: row.public_short_code
      ? `/pagar/${row.public_short_code}`
      : null,
    invoice_url: row.invoice_url ?? null,
    pix_copy_paste: row.pix_copy_paste ?? null,
    boleto_url: row.boleto_url ?? null,
    value: Number(row.value),
    due_date: row.due_date,
    billing_type: row.billing_type,
    status: row.status,
    ...(financeWarning ? { financeWarning } : {}),
  };
}

async function loadOwnedCustomer(
  supabase: any,
  companyId: string,
  customerId: string,
) {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, email, phone, celular, document")
    .eq("id", customerId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error || !data) {
    throw new AsaasApiError("Cliente não encontrado na sua empresa.", 404);
  }
  const document = unmaskDoc(data.document ? String(data.document) : "");
  if (!document) {
    throw new AsaasApiError(
      `O cliente "${
        data.name ?? "selecionado"
      }" não tem CPF/CNPJ cadastrado. Cadastre o documento antes de gerar a cobrança.`,
      400,
    );
  }
  if (!isValidDocument(document)) {
    throw new AsaasApiError(
      `O CPF/CNPJ do cliente "${
        data.name ?? "selecionado"
      }" é inválido. Corrija o cadastro antes de gerar a cobrança.`,
      400,
    );
  }
  return { ...data, normalizedDocument: document };
}

// Espelha o trecho privado de tenant-asaas-create-charge. Ele não é exportado
// e movê-lo agora para _shared ampliaria o risco de regressão no fluxo unitário;
// mantemos aqui só a validação/lookup/criação indispensáveis, com o mesmo
// externalReference=customers.id para deduplicar no gateway.
async function ensureAsaasCustomer(
  supabase: any,
  asaas: AsaasTenantClient,
  companyId: string,
  customer: any,
): Promise<string> {
  const { data: emailSettings, error: emailSettingsError } = await supabase
    .from("customer_email_settings")
    .select("enabled")
    .eq("company_id", companyId)
    .maybeSingle();
  if (emailSettingsError) {
    throw new Error("Não foi possível validar a configuração de e-mails de cobrança.");
  }
  const notificationDisabled = emailSettings?.enabled === true ? true : undefined;

  const existing = await asaas.get<any>(
    "/customers",
    buildQuery({ externalReference: customer.id, limit: 1 }),
  );
  const found = Array.isArray(existing?.data) ? existing.data[0] : null;
  if (found?.id) {
    if (notificationDisabled === true) {
      await asaas.put<any>(`/customers/${encodeURIComponent(found.id)}`, {
        notificationDisabled: true,
      });
    }
    return found.id;
  }

  const created = await asaas.post<any>("/customers", {
    name: customer.name,
    email: customer.email ?? undefined,
    phone: customer.phone ?? customer.celular ?? undefined,
    cpfCnpj: customer.normalizedDocument,
    externalReference: customer.id,
    notificationDisabled,
  });
  if (!created?.id) {
    throw new AsaasApiError(
      "Não foi possível cadastrar o cliente na Asaas.",
      502,
    );
  }
  return created.id;
}

async function findPaymentByExternalReference(
  asaas: AsaasTenantClient,
  externalReference: string,
): Promise<any | null> {
  const response = await asaas.get<any>(
    "/payments",
    buildQuery({ externalReference, limit: 1 }),
  );
  const payment = Array.isArray(response?.data) ? response.data[0] : null;
  return payment?.id ? payment : null;
}

async function releaseClaim(
  supabase: any,
  companyId: string,
  chargeId: string,
  token: string,
) {
  await supabase
    .from("tenant_charges")
    .update({
      gateway_creation_claim_token: null,
      gateway_creation_claimed_at: null,
    })
    .eq("id", chargeId)
    .eq("company_id", companyId)
    .eq("gateway_creation_claim_token", token);
}

async function hydrateCharge(
  supabase: any,
  asaas: AsaasTenantClient,
  companyId: string,
  batch: any,
  reserved: any,
  payment: any,
): Promise<Record<string, unknown>> {
  const paymentId = typeof payment?.id === "string" ? payment.id : null;
  if (!paymentId) throw new Error("missing_payment_id");

  let pixCopyPaste: string | null = reserved.pix_copy_paste ?? null;
  if (batch.billing_type === "PIX" || batch.billing_type === "UNDEFINED") {
    try {
      const pix = await asaas.get<any>(`/payments/${paymentId}/pixQrCode`);
      pixCopyPaste = pix?.payload ?? pixCopyPaste;
    } catch {
      // O Pix pode demorar alguns segundos para ficar disponível. O checkout
      // público busca novamente; a criação da cobrança não depende disso.
    }
  }

  // Não grava status nesta primeira atualização. O webhook pode ter chegado
  // durante o POST e já avançado a linha para RECEIVED/CONFIRMED; reescrever
  // aqui o PENDING da resposta de criação faria o pagamento "voltar no tempo".
  const { data: associated, error: associateError } = await supabase
    .from("tenant_charges")
    .update({
      asaas_payment_id: paymentId,
      net_value: payment?.netValue ?? null,
      invoice_url: payment?.invoiceUrl ?? null,
      pix_copy_paste: pixCopyPaste,
      boleto_url: payment?.bankSlipUrl ?? null,
      gateway_creation_claim_token: null,
      gateway_creation_claimed_at: null,
    })
    .eq("id", reserved.id)
    .eq("company_id", companyId)
    .or(
      `asaas_payment_id.is.null,asaas_payment_id.eq.${paymentId}`,
    )
    .select("id")
    .maybeSingle();
  if (associateError || !associated) {
    console.error(
      "[installment-batch] falha ao vincular pagamento à reserva:",
      {
        charge_id: reserved.id,
        company_id: companyId,
        message: associateError?.message ?? "linha não encontrada",
      },
    );
    throw new Error("charge_persistence_failed");
  }

  // Só a reserva ainda não processada recebe o status da resposta do POST.
  // Se o webhook venceu a corrida, o predicado não casa e preserva o status
  // financeiro mais avançado que ele acabou de aplicar.
  const { error: initialStatusError } = await supabase
    .from("tenant_charges")
    .update({ status: payment?.status ?? "PENDING" })
    .eq("id", reserved.id)
    .eq("company_id", companyId)
    .eq("status", "PENDING_CREATION");
  if (initialStatusError) throw new Error("charge_status_persistence_failed");

  const { data: saved, error: saveError } = await supabase
    .from("tenant_charges")
    .select(
      "id, public_short_code, invoice_url, pix_copy_paste, boleto_url, value, due_date, billing_type, status",
    )
    .eq("id", reserved.id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (saveError || !saved) {
    throw new Error("charge_read_after_persistence_failed");
  }

  let financeWarning: string | null = null;
  if (batch.post_to_finance === true) {
    const { error: receivableError } = await supabase.rpc(
      "create_tenant_charge_receivable",
      {
        p_company_id: companyId,
        p_tenant_charge_id: saved.id,
        p_customer_id: batch.customer_id,
        p_amount: Number(saved.value),
        p_due_date: saved.due_date,
        p_description: reserved.description,
        p_account_id: batch.finance_account_id ?? null,
        p_category: batch.category ?? null,
        p_cost_center_id: batch.cost_center_id ?? null,
        p_service_order_id: null,
      },
    );
    if (receivableError) {
      console.warn("[installment-batch] recebível não criado:", {
        charge_id: saved.id,
        company_id: companyId,
        message: receivableError.message,
      });
      financeWarning =
        "A parcela foi criada, mas não foi possível lançá-la no financeiro. Lance manualmente ou tente novamente.";
    }
  }

  return chargeResponse(saved, financeWarning);
}

async function processInstallment(args: {
  supabase: any;
  asaas: AsaasTenantClient;
  asaasCustomerId: string;
  companyId: string;
  batch: any;
  reserved: any;
}): Promise<InstallmentResult> {
  const { supabase, asaas, asaasCustomerId, companyId, batch, reserved } = args;
  const number = Number(reserved.installment_number);

  if (reserved.asaas_payment_id) {
    try {
      // Reexecuta a RPC idempotente se o gateway já estava vinculado mas o
      // lançamento financeiro falhou na tentativa anterior.
      const charge = await hydrateCharge(
        supabase,
        asaas,
        companyId,
        batch,
        reserved,
        {
          id: reserved.asaas_payment_id,
          status: reserved.status,
          netValue: reserved.net_value,
          invoiceUrl: reserved.invoice_url,
          bankSlipUrl: reserved.boleto_url,
        },
      );
      return { number, status: "existing", charge };
    } catch (error) {
      return { number, status: "failed", error: safeInstallmentError(error) };
    }
  }

  const token = crypto.randomUUID();
  const claimedAt = new Date().toISOString();
  const expiredBefore = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("tenant_charges")
    .update({
      gateway_creation_claim_token: token,
      gateway_creation_claimed_at: claimedAt,
    })
    .eq("id", reserved.id)
    .eq("company_id", companyId)
    .is("asaas_payment_id", null)
    .or(
      `gateway_creation_claimed_at.is.null,gateway_creation_claimed_at.lt.${expiredBefore}`,
    )
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error("[installment-batch] falha ao adquirir lease:", {
      charge_id: reserved.id,
      company_id: companyId,
      message: claimError.message,
    });
    return {
      number,
      status: "failed",
      error:
        "Não foi possível preparar esta parcela. Tente novamente em instantes.",
    };
  }

  if (!claimed) {
    // Outra chamada está processando a mesma reserva. Nunca faz POST sem lease.
    // A consulta ainda permite devolver sucesso se o primeiro POST já apareceu.
    try {
      const concurrentPayment = await findPaymentByExternalReference(
        asaas,
        reserved.id,
      );
      if (concurrentPayment) {
        const charge = await hydrateCharge(
          supabase,
          asaas,
          companyId,
          batch,
          reserved,
          concurrentPayment,
        );
        return { number, status: "existing", charge };
      }
    } catch {
      // Falha da busca não autoriza POST sem lease.
    }
    return {
      number,
      status: "failed",
      error:
        "Esta parcela ainda está sendo processada. Aguarde um instante e tente novamente.",
    };
  }

  let existingPayment: any | null;
  try {
    // Obrigatório antes de TODO POST, inclusive na primeira tentativa: se a
    // resposta anterior se perdeu, a referência determinística recupera a
    // cobrança sem duplicar.
    existingPayment = await findPaymentByExternalReference(asaas, reserved.id);
  } catch (error) {
    await releaseClaim(supabase, companyId, reserved.id, token);
    console.warn("[installment-batch] consulta por externalReference falhou:", {
      charge_id: reserved.id,
      company_id: companyId,
      message: (error as Error)?.message ?? String(error),
    });
    return {
      number,
      status: "failed",
      error:
        "Não foi possível confirmar esta parcela na Asaas. Tente novamente em instantes.",
    };
  }

  if (existingPayment) {
    try {
      const charge = await hydrateCharge(
        supabase,
        asaas,
        companyId,
        batch,
        reserved,
        existingPayment,
      );
      return { number, status: "existing", charge };
    } catch (error) {
      return { number, status: "failed", error: safeInstallmentError(error) };
    }
  }

  try {
    const payment = await asaas.post<any>("/payments", {
      customer: asaasCustomerId,
      billingType: batch.billing_type,
      value: Number(reserved.value),
      dueDate: reserved.due_date,
      description: reserved.description,
      externalReference: reserved.id,
      ...(Number(batch.fine_value) > 0
        ? { fine: { value: Number(batch.fine_value), type: batch.fine_type } }
        : {}),
      ...(Number(batch.interest_percent) > 0
        ? {
          interest: {
            value: Number(batch.interest_percent),
            type: "PERCENTAGE",
          },
        }
        : {}),
      ...(Number(batch.discount_percent) > 0
        ? {
          discount: {
            value: Number(batch.discount_percent),
            type: "PERCENTAGE",
            dueDateLimitDays: Number(batch.discount_days),
          },
        }
        : {}),
    });
    const charge = await hydrateCharge(
      supabase,
      asaas,
      companyId,
      batch,
      reserved,
      payment,
    );
    return { number, status: "created", charge };
  } catch (error) {
    // 4xx é uma recusa determinística: não houve cobrança e o lease pode sair.
    // Em timeout/5xx deixamos o lease expirar; assim damos tempo para a busca
    // por externalReference enxergar um POST cujo retorno tenha se perdido.
    if (
      error instanceof AsaasApiError && error.status >= 400 &&
      error.status < 500
    ) {
      await releaseClaim(supabase, companyId, reserved.id, token);
    }
    console.warn("[installment-batch] parcela não emitida:", {
      charge_id: reserved.id,
      company_id: companyId,
      status: error instanceof AsaasApiError ? error.status : null,
      message: (error as Error)?.message ?? String(error),
    });
    return { number, status: "failed", error: safeInstallmentError(error) };
  }
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (error) {
    console.error(
      "[installment-batch] exceção não tratada:",
      (error as Error)?.message ?? String(error),
    );
    return jsonResponse(req, {
      error:
        "Ocorreu um erro ao gerar as parcelas. Tente novamente em instantes.",
    }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await authorizePaymentsManager(req);
  if (!auth.ok) return auth.response;
  const { supabase, userId, companyId } = auth;

  let input: BatchInput;
  try {
    input = await req.json();
  } catch {
    return jsonResponse(req, { error: "Requisição inválida." }, 400);
  }

  const clientRequestId = typeof input.client_request_id === "string"
    ? input.client_request_id.trim()
    : "";
  const customerId = typeof input.customer_id === "string"
    ? input.customer_id.trim()
    : "";
  const totalValueRaw = Number(input.total_value);
  const totalValue = Math.round(totalValueRaw * 100) / 100;
  const installmentCount = Number(input.installment_count);
  const firstDueDate = typeof input.first_due_date === "string"
    ? input.first_due_date.trim()
    : "";
  const billingType = input.billing_type ?? "UNDEFINED";
  const fineType = input.fine_type ?? "PERCENTAGE";

  if (!UUID_RE.test(clientRequestId)) {
    return jsonResponse(req, {
      error: "Não foi possível identificar esta solicitação. Tente novamente.",
    }, 400);
  }
  if (!UUID_RE.test(customerId)) {
    return jsonResponse(
      req,
      { error: "Selecione o cliente da cobrança." },
      400,
    );
  }
  if (
    !Number.isFinite(totalValueRaw) || totalValue <= 0 ||
    totalValue >= 1_000_000_000_000
  ) {
    return jsonResponse(req, {
      error: "Informe um valor total válido para a cobrança.",
    }, 400);
  }
  if (
    !Number.isInteger(installmentCount) || installmentCount < 2 ||
    installmentCount > MAX_INSTALLMENTS
  ) {
    return jsonResponse(req, {
      error: `Escolha entre 2 e ${MAX_INSTALLMENTS} parcelas.`,
    }, 400);
  }
  if (!parseCivilDate(firstDueDate)) {
    return jsonResponse(req, {
      error: "Informe uma data válida para o primeiro vencimento.",
    }, 400);
  }
  const { data: companySettings, error: settingsError } = await supabase
    .from("company_settings")
    .select("timezone")
    .eq("company_id", companyId)
    .maybeSingle();
  if (settingsError) {
    console.warn(
      "[installment-batch] timezone da empresa indisponível; usando o padrão canônico",
      { company_id: companyId, message: settingsError.message },
    );
  }
  const companyToday = todayInTimeZone(
    (companySettings as any)?.timezone ?? null,
  );
  if (firstDueDate < companyToday) {
    return jsonResponse(req, {
      error: "O primeiro vencimento não pode estar no passado.",
    }, 400);
  }
  if (!ALLOWED_BILLING_TYPES.includes(billingType)) {
    return jsonResponse(req, {
      error:
        "Forma de pagamento inválida. Escolha Pix, boleto ou a opção definida pelo cliente.",
    }, 400);
  }
  if (!ALLOWED_FINE_TYPES.includes(fineType)) {
    return jsonResponse(req, {
      error: "Tipo de multa inválido. Use porcentagem ou valor em reais.",
    }, 400);
  }

  let plan;
  try {
    plan = buildInstallmentPlan(totalValue, installmentCount, firstDueDate);
  } catch {
    return jsonResponse(req, {
      error: "Não foi possível calcular as parcelas com os valores informados.",
    }, 400);
  }
  if (plan.some((item) => item.value < MIN_CHARGE_VALUE)) {
    return jsonResponse(req, {
      error: `Cada parcela precisa ter pelo menos R$ ${
        MIN_CHARGE_VALUE.toFixed(2).replace(".", ",")
      }. Reduza a quantidade de parcelas.`,
    }, 400);
  }

  const descriptionInput = optionalText(input.description, 500);
  const categoryInput = optionalText(input.category, 120);
  const costCenterId = optionalText(input.cost_center_id, 64);
  if (costCenterId && !UUID_RE.test(costCenterId)) {
    return jsonResponse(req, { error: "Centro de custo inválido." }, 400);
  }

  const explicitFine = optionalNumber(
    fineType === "FIXED" ? input.fine_value : input.fine_percent,
  );
  const explicitInterest = optionalNumber(input.interest_percent);
  const explicitDiscount = optionalNumber(input.discount_percent);
  const explicitDiscountDays = optionalNumber(input.discount_days);
  if (
    Number.isNaN(explicitFine) || (explicitFine !== null && explicitFine < 0) ||
    Number.isNaN(explicitInterest) ||
    (explicitInterest !== null &&
      (explicitInterest < 0 || explicitInterest > 10)) ||
    Number.isNaN(explicitDiscount) ||
    (explicitDiscount !== null &&
      (explicitDiscount < 0 || explicitDiscount > 100)) ||
    Number.isNaN(explicitDiscountDays) ||
    (explicitDiscountDays !== null &&
      (!Number.isInteger(explicitDiscountDays) || explicitDiscountDays < 0))
  ) {
    return jsonResponse(req, {
      error: "Revise os valores de multa, juros e desconto.",
    }, 400);
  }

  const payloadHash = await sha256Hex({
    customer_id: customerId,
    total_value: totalValue,
    installment_count: installmentCount,
    first_due_date: firstDueDate,
    billing_type: billingType,
    description: descriptionInput,
    fine_type: fineType,
    fine_value: explicitFine,
    interest_percent: explicitInterest,
    discount_percent: explicitDiscount,
    discount_days: explicitDiscountDays,
    category: categoryInput,
    cost_center_id: costCenterId,
    post_to_finance: typeof input.post_to_finance === "boolean"
      ? input.post_to_finance
      : null,
  });

  const { data: accountData, error: accountError } = await supabase
    .from("tenant_payment_accounts")
    .select(
      "status, vault_secret_name, auto_post_to_finance, default_fine_percent, " +
        "default_interest_percent, default_discount_percent, default_discount_days, " +
        "default_description, default_finance_account_id, default_income_category",
    )
    .eq("company_id", companyId)
    .maybeSingle();
  const account = accountData as any;
  if (
    accountError || !account || account.status !== "active" ||
    !account.vault_secret_name
  ) {
    return jsonResponse(req, {
      error:
        "Ative o recebimento de pagamentos em Configurações → Integrações antes de gerar cobranças.",
    }, 400);
  }
  let customer: any;
  try {
    customer = await loadOwnedCustomer(supabase, companyId, customerId);
  } catch (error) {
    const status = error instanceof AsaasApiError && error.status === 404
      ? 404
      : 400;
    return jsonResponse(req, {
      error: error instanceof AsaasApiError
        ? error.message
        : "Não foi possível verificar o cliente selecionado.",
    }, status);
  }

  if (costCenterId) {
    const { data: center, error: centerError } = await supabase
      .from("cost_centers")
      .select("id")
      .eq("id", costCenterId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (centerError || !center) {
      return jsonResponse(req, {
        error: "O centro de custo não foi encontrado na sua empresa.",
      }, 400);
    }
  }

  let financeAccountId = account.default_finance_account_id ?? null;
  if (financeAccountId) {
    const { data: financeAccount } = await supabase
      .from("financial_accounts")
      .select("id")
      .eq("id", financeAccountId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!financeAccount) financeAccountId = null;
  }

  const accountDescription = optionalText(account.default_description, 500);
  const effectiveDescription = descriptionInput ?? accountDescription ??
    `Cobrança de ${customer.name ?? "cliente"}`;
  const effectiveFine = explicitFine ??
    (fineType === "PERCENTAGE" ? Number(account.default_fine_percent ?? 0) : 0);
  const effectiveInterest = explicitInterest ??
    Number(account.default_interest_percent ?? 0);
  const effectiveDiscount = explicitDiscount ??
    Number(account.default_discount_percent ?? 0);
  const effectiveDiscountDays = explicitDiscountDays ??
    Number(account.default_discount_days ?? 0);
  const postToFinance = typeof input.post_to_finance === "boolean"
    ? input.post_to_finance
    : account.auto_post_to_finance !== false;

  if (
    !Number.isFinite(effectiveFine) || effectiveFine < 0 ||
    (fineType === "PERCENTAGE" && effectiveFine > 100) ||
    (fineType === "FIXED" && plan.some((item) => effectiveFine > item.value)) ||
    !Number.isFinite(effectiveInterest) || effectiveInterest < 0 ||
    effectiveInterest > 10 ||
    !Number.isFinite(effectiveDiscount) || effectiveDiscount < 0 ||
    effectiveDiscount > 100 ||
    !Number.isInteger(effectiveDiscountDays) || effectiveDiscountDays < 0
  ) {
    return jsonResponse(req, {
      error:
        "As configurações de multa, juros ou desconto não são válidas para estas parcelas.",
    }, 400);
  }

  const batchRead = await supabase
    .from("tenant_charge_batches")
    .select("*")
    .eq("company_id", companyId)
    .eq("client_request_id", clientRequestId)
    .maybeSingle();
  let batch = batchRead.data;
  const batchReadError = batchRead.error;
  if (batchReadError) {
    return jsonResponse(req, {
      error: "Não foi possível verificar esta solicitação. Tente novamente.",
    }, 500);
  }
  if (batch && batch.payload_hash !== payloadHash) {
    return businessFail(
      req,
      "request_conflict",
      "Esta solicitação já foi usada com outros dados. Feche e abra a cobrança novamente.",
    );
  }

  if (!batch) {
    const { data: inserted, error: insertError } = await supabase
      .from("tenant_charge_batches")
      .insert({
        company_id: companyId,
        client_request_id: clientRequestId,
        payload_hash: payloadHash,
        customer_id: customerId,
        total_value: totalValue,
        installment_count: installmentCount,
        first_due_date: firstDueDate,
        billing_type: billingType,
        description: effectiveDescription,
        category: categoryInput ??
          optionalText(account.default_income_category, 120),
        cost_center_id: costCenterId,
        finance_account_id: financeAccountId,
        post_to_finance: postToFinance,
        fine_type: fineType,
        fine_value: Math.round(effectiveFine * 10_000) / 10_000,
        interest_percent: Math.round(effectiveInterest * 10_000) / 10_000,
        discount_percent: Math.round(effectiveDiscount * 10_000) / 10_000,
        discount_days: effectiveDiscountDays,
        status: "processing",
        created_by: userId,
      })
      .select("*")
      .maybeSingle();

    if (insertError) {
      // Duas chamadas do mesmo client_request_id podem chegar juntas. A UNIQUE
      // escolhe a vencedora; a outra relê o lote e continua nele.
      const { data: concurrent } = await supabase
        .from("tenant_charge_batches")
        .select("*")
        .eq("company_id", companyId)
        .eq("client_request_id", clientRequestId)
        .maybeSingle();
      if (!concurrent) {
        console.error("[installment-batch] falha ao criar lote:", {
          company_id: companyId,
          message: insertError.message,
        });
        return jsonResponse(req, {
          error: "Não foi possível iniciar o parcelamento. Tente novamente.",
        }, 500);
      }
      if (concurrent.payload_hash !== payloadHash) {
        return businessFail(
          req,
          "request_conflict",
          "Esta solicitação já foi usada com outros dados. Feche e abra a cobrança novamente.",
        );
      }
      batch = concurrent;
    } else {
      batch = inserted;
    }
  }

  if (!batch) {
    return jsonResponse(req, {
      error: "Não foi possível iniciar o parcelamento. Tente novamente.",
    }, 500);
  }

  // Em retentativa, a fonte da verdade é o snapshot efetivo do lote. Assim uma
  // mudança posterior nos defaults da integração não altera parcelas já iniciadas.
  const batchPlan = buildInstallmentPlan(
    Number(batch.total_value),
    Number(batch.installment_count),
    batch.first_due_date,
  );
  const reservations = batchPlan.map((item) => ({
    id: crypto.randomUUID(),
    company_id: companyId,
    batch_id: batch.id,
    installment_number: item.number,
    installment_total: batch.installment_count,
    source_type: "avulso",
    source_id: null,
    customer_id: batch.customer_id,
    value: item.value,
    billing_type: batch.billing_type,
    status: "PENDING_CREATION",
    due_date: item.dueDate,
    description: installmentDescription(
      batch.description ?? `Cobrança de ${customer.name ?? "cliente"}`,
      item.number,
      Number(batch.installment_count),
    ),
    post_to_finance: batch.post_to_finance,
    created_by: batch.created_by ?? userId,
  }));

  const { error: reserveError } = await supabase
    .from("tenant_charges")
    .upsert(reservations, {
      onConflict: "batch_id,installment_number",
      ignoreDuplicates: true,
    });
  if (reserveError) {
    console.error("[installment-batch] falha ao reservar parcelas:", {
      batch_id: batch.id,
      company_id: companyId,
      message: reserveError.message,
    });
    return jsonResponse(req, {
      error: "Não foi possível preparar as parcelas. Tente novamente.",
    }, 500);
  }

  const { data: reservedRows, error: reservedReadError } = await supabase
    .from("tenant_charges")
    .select(
      "id, company_id, batch_id, installment_number, installment_total, customer_id, value, " +
        "net_value, billing_type, status, due_date, description, public_short_code, " +
        "asaas_payment_id, invoice_url, pix_copy_paste, boleto_url, post_to_finance",
    )
    .eq("company_id", companyId)
    .eq("batch_id", batch.id)
    .order("installment_number", { ascending: true });
  if (
    reservedReadError || !reservedRows ||
    reservedRows.length !== Number(batch.installment_count)
  ) {
    return jsonResponse(req, {
      error:
        "Não foi possível confirmar a reserva das parcelas. Tente novamente.",
    }, 500);
  }

  const apiKey = await vaultReadSecret(supabase, account.vault_secret_name);
  if (!apiKey) {
    return jsonResponse(req, {
      error:
        "A chave da Asaas não foi encontrada. Reative a integração em Configurações → Integrações.",
    }, 400);
  }
  const asaas = asaasFor(apiKey);

  let asaasCustomerId: string;
  try {
    asaasCustomerId = await ensureAsaasCustomer(supabase, asaas, companyId, customer);
  } catch (error) {
    console.warn("[installment-batch] cliente Asaas não resolvido:", {
      company_id: companyId,
      customer_id: customerId,
      status: error instanceof AsaasApiError ? error.status : null,
      message: (error as Error)?.message ?? String(error),
    });
    return jsonResponse(req, {
      error: error instanceof AsaasApiError && error.status === 400
        ? error.message
        : "Não foi possível preparar o cliente na Asaas. Tente novamente em instantes.",
    }, error instanceof AsaasApiError && error.status === 400 ? 400 : 502);
  }

  // Sequencial de propósito: evita rajadas no gateway e torna o retorno parcial
  // previsível. Uma falha não impede as demais parcelas nem perde as reservas.
  const installments: InstallmentResult[] = [];
  for (const reserved of reservedRows) {
    installments.push(
      await processInstallment({
        supabase,
        asaas,
        asaasCustomerId,
        companyId,
        batch,
        reserved,
      }),
    );
  }

  const created =
    installments.filter((item) => item.status === "created").length;
  const existing =
    installments.filter((item) => item.status === "existing").length;
  const failed = installments.filter((item) => item.status === "failed").length;
  const completed = failed === 0;
  const status = completed
    ? "completed"
    : created + existing > 0
    ? "partial"
    : "failed";
  let statusUpdate = supabase
    .from("tenant_charge_batches")
    .update({ status })
    .eq("id", batch.id)
    .eq("company_id", companyId);
  // Uma chamada concorrente mais lenta não pode rebaixar um lote que outra
  // chamada já concluiu por inteiro.
  if (!completed) statusUpdate = statusUpdate.neq("status", "completed");
  const { error: statusError } = await statusUpdate;
  if (statusError) {
    console.warn("[installment-batch] status do lote não atualizado:", {
      batch_id: batch.id,
      company_id: companyId,
      message: statusError.message,
    });
  }

  return jsonResponse(req, {
    // Um lote parcial é uma resposta processada com sucesso: a UI precisa dos
    // itens failed para oferecer retentativa. ok:false fica reservado a erro de
    // negócio que impede o lote inteiro (ex.: client_request_id reutilizado).
    ok: true,
    batch_id: batch.id,
    total: installments.length,
    created,
    existing,
    failed,
    completed,
    installments,
  }, 200);
}

// tenant-asaas-create-charge
// ---------------------------
// PRIVILEGIADA (Bearer + módulo 'cobrancas' + can_manage_system). Cria uma cobrança
// avulsa na conta Asaas DO TENANT (chave BYO lida do Vault) e grava tenant_charges.
//
// company_id vem do profile (payments-auth), nunca do payload.
//
// Fluxo (§9.5-B):
//   1. lê a chave BYO do Vault (via tenant_payment_accounts.vault_secret_name);
//   2. garante o asaas_customer_id do cliente final (cria via POST /v3/customers se faltar);
//   3. POST /v3/payments com externalReference = company_id (resolução multi-tenant §9.3);
//   4. busca o pix copia-e-cola / linha do boleto quando aplicável;
//   5. grava tenant_charges (idempotência por asaas_payment_id UNIQUE) + public_short_code.
//
// Nunca retorna custo/margem interna.

import { handleCors } from "../_shared/cors.ts";
import {
  authorizePaymentsManager,
  jsonResponse,
  vaultReadSecret,
  generateShortCode,
} from "../_shared/payments-auth.ts";
import { asaasFor, AsaasApiError } from "../_shared/asaas-tenant-client.ts";
import { isValidDocument, unmaskDoc } from "../_shared/document-validation.ts";

type BillingType = "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";

/** billing_types que a Asaas aceita neste fluxo (allowlist estrita). */
const ALLOWED_BILLING_TYPES: readonly BillingType[] = [
  "PIX",
  "BOLETO",
  "CREDIT_CARD",
  "UNDEFINED",
];

/** Valor mínimo aceito pela Asaas por cobrança (R$ 5,00). Abaixo disso a Asaas recusa. */
const MIN_CHARGE_VALUE = 5;

/** Asaas impõe teto de 10% ao mês nos juros; clampamos por segurança. */
const ASAAS_MAX_INTEREST_PERCENT = 10;

/** hoje + `days` em UTC, formatado YYYY-MM-DD (usado quando due_date não vem no corpo). */
function dueDateFromDays(days: number): string {
  const now = new Date();
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;
  const target = new Date(base + safeDays * 86_400_000);
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, "0");
  const d = String(target.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Normaliza um percentual vindo do corpo/config: número finito > 0, senão null. */
function toPositivePercent(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Valida `due_date` no formato YYYY-MM-DD e não no passado (compara em UTC, dia cheio). */
function validateDueDate(due: string): { ok: true } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return { ok: false, error: "A data de vencimento deve estar no formato AAAA-MM-DD." };
  }
  const parsed = new Date(`${due}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "A data de vencimento é inválida." };
  }
  // "Hoje" em UTC (só a data). Vencimento no passado é recusado.
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (parsed.getTime() < todayUtc) {
    return { ok: false, error: "A data de vencimento não pode estar no passado." };
  }
  return { ok: true };
}

/** Origem da cobrança (allowlist estrita). 'avulso' é o default histórico. */
type ChargeSourceType = "avulso" | "quote";
const ALLOWED_SOURCE_TYPES: readonly ChargeSourceType[] = ["avulso", "quote"];

/** Status que NÃO contam como cobrança válida no dedupe por orçamento (cobra de novo). */
const DEDUPE_DEAD_STATUSES: readonly string[] = [
  "CANCELLED",
  "CANCELED",
  "REFUNDED",
  "CHARGEBACK",
];

interface CreateChargeInput {
  customer_id?: string;
  value?: number;
  due_date?: string;
  billing_type?: BillingType;
  description?: string;
  // Origem da cobrança (Onda D — Orçamento → Cobrança). Opcionais; default 'avulso'.
  source_type?: ChargeSourceType;
  source_id?: string | null;
  // Overrides opcionais por cobrança (caem no default da conta quando ausentes).
  fine_percent?: number;
  interest_percent?: number;
  discount_percent?: number;
  discount_days?: number;
  installment_count?: number;
}

/**
 * Garante o asaas_customer_id do cliente final. DIVERGÊNCIA DA §9: a tabela `customers`
 * do tenant NÃO tem coluna asaas_customer_id (só `companies` tem, pro billing SaaS).
 * Sem lugar pra cachear, deduplicamos no PRÓPRIO Asaas: buscamos por
 * externalReference = customer.id (GET /v3/customers?externalReference=...); se existir,
 * reusamos; senão criamos. Idempotente na conta do tenant, sem coluna nova.
 */
async function ensureAsaasCustomer(
  supabase: any,
  asaas: ReturnType<typeof asaasFor>,
  companyId: string,
  customerId: string,
): Promise<string> {
  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, name, email, phone, celular, document")
    .eq("id", customerId)
    .eq("company_id", companyId) // posse: cliente tem que ser do tenant
    .maybeSingle();
  if (error || !customer) {
    // 404 → nunca vaza se o cliente existe em outro tenant (é o mesmo "não encontrado").
    throw new AsaasApiError("Cliente não encontrado na sua empresa.", 404);
  }

  // Documento (CPF/CNPJ) é OBRIGATÓRIO na Asaas pra emitir cobrança. Pré-validamos
  // aqui (antes de tocar a Asaas) pra devolver mensagem PT-BR clara e acionável.
  const rawDoc = customer.document ? String(customer.document) : "";
  const doc = unmaskDoc(rawDoc);
  if (!doc) {
    throw new AsaasApiError(
      `O cliente "${customer.name ?? "selecionado"}" não tem CPF/CNPJ cadastrado. Cadastre o documento antes de gerar a cobrança.`,
      400,
    );
  }
  if (!isValidDocument(doc)) {
    throw new AsaasApiError(
      `O CPF/CNPJ do cliente "${customer.name ?? "selecionado"}" é inválido. Corrija o cadastro antes de gerar a cobrança.`,
      400,
    );
  }

  // Dedupe no Asaas por externalReference.
  try {
    const existing = await asaas.get<any>(
      `/customers?externalReference=${encodeURIComponent(customer.id)}&limit=1`,
    );
    const found = Array.isArray(existing?.data) ? existing.data[0] : null;
    if (found?.id) return found.id;
  } catch {
    // Busca falhou (não-fatal): segue pra criação.
  }

  const created = await asaas.post<any>("/customers", {
    name: customer.name,
    email: customer.email ?? undefined,
    phone: customer.phone ?? customer.celular ?? undefined,
    cpfCnpj: doc, // já validado (CPF/CNPJ só-dígitos)
    externalReference: customer.id,
  });
  const asaasCustomerId: string | undefined = created?.id;
  if (!asaasCustomerId) {
    throw new AsaasApiError("Não foi possível cadastrar o cliente na Asaas.", 502);
  }
  return asaasCustomerId;
}

Deno.serve(async (req) => {
  // Rede de segurança de topo: nenhuma exceção escapa (senão o gateway devolve 502
  // cru, sem JSON, e o front não lê error.context). Tudo vira Response JSON PT-BR.
  try {
    return await handleRequest(req);
  } catch (e) {
    console.error("[create-charge] exceção não tratada no topo:", (e as Error)?.message ?? e);
    return jsonResponse(req, {
      error: "Ocorreu um erro ao gerar a cobrança. Tente novamente em instantes.",
    }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await authorizePaymentsManager(req);
  if (!auth.ok) return auth.response;
  const { supabase, userId, companyId } = auth;

  let input: CreateChargeInput;
  try {
    input = await req.json();
  } catch {
    return jsonResponse(req, { error: "Requisição inválida." }, 400);
  }

  const value = Number(input.value);
  if (!input.customer_id || typeof input.customer_id !== "string") {
    return jsonResponse(req, { error: "Selecione o cliente da cobrança." }, 400);
  }
  if (!Number.isFinite(value) || value <= 0) {
    return jsonResponse(req, { error: "Informe um valor válido para a cobrança." }, 400);
  }
  if (value < MIN_CHARGE_VALUE) {
    return jsonResponse(req, {
      error: `O valor mínimo de uma cobrança é R$ ${MIN_CHARGE_VALUE.toFixed(2).replace(".", ",")}.`,
    }, 400);
  }
  // Arredonda pra 2 casas (a Asaas recusa mais de 2 casas decimais).
  const chargeValue = Math.round(value * 100) / 100;
  // Vencimento: OPCIONAL. Se vier, valida agora; se não, resolve depois via
  // default_due_days da conta (hoje + N dias).
  const rawDueDate =
    typeof input.due_date === "string" && input.due_date.trim() ? input.due_date.trim() : null;
  if (rawDueDate) {
    const dueCheck = validateDueDate(rawDueDate);
    if (!dueCheck.ok) {
      return jsonResponse(req, { error: dueCheck.error }, 400);
    }
  }
  const billingType: BillingType = input.billing_type ?? "UNDEFINED";
  if (!ALLOWED_BILLING_TYPES.includes(billingType)) {
    return jsonResponse(req, {
      error: "Forma de pagamento inválida. Escolha Pix, boleto ou cartão.",
    }, 400);
  }
  // Descrição do corpo: opcional, limita (Asaas trunca em 500) e sanitiza tipo.
  // O fallback pro default_description da conta é aplicado após ler a conta.
  const inputDescription =
    typeof input.description === "string" && input.description.trim()
      ? input.description.trim().slice(0, 500)
      : null;

  // Origem da cobrança (Onda D). Ausente → 'avulso' (fluxo histórico, sem regressão).
  const sourceType: ChargeSourceType = input.source_type ?? "avulso";
  if (!ALLOWED_SOURCE_TYPES.includes(sourceType)) {
    return jsonResponse(req, { error: "Origem de cobrança inválida." }, 400);
  }
  const sourceId =
    typeof input.source_id === "string" && input.source_id.trim()
      ? input.source_id.trim()
      : null;
  if (sourceType === "quote" && !sourceId) {
    return jsonResponse(req, {
      error: "Informe o orçamento de origem da cobrança.",
    }, 400);
  }

  try {
    // 0) Dedupe por orçamento (idempotência da Onda D). Se ESTE orçamento já tem uma
    //    cobrança viva (não cancelada/estornada), NÃO cria outra na Asaas — devolve a
    //    existente no mesmo shape de sucesso. Evita cobrança duplicada em duplo clique.
    if (sourceType === "quote" && sourceId) {
      const { data: existingCharge } = await supabase
        .from("tenant_charges")
        .select(
          "id, public_short_code, invoice_url, pix_copy_paste, boleto_url, value, due_date, billing_type, status",
        )
        .eq("company_id", companyId)
        .eq("source_type", "quote")
        .eq("source_id", sourceId)
        .not("status", "in", `(${DEDUPE_DEAD_STATUSES.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingCharge) {
        const ex = existingCharge as any;
        return jsonResponse(req, {
          charge: {
            public_short_code: ex.public_short_code,
            checkout_url: ex.public_short_code ? `/pagar/${ex.public_short_code}` : null,
            invoice_url: ex.invoice_url ?? null,
            pix_copy_paste: ex.pix_copy_paste ?? null,
            boleto_url: ex.boleto_url ?? null,
            value: ex.value,
            due_date: ex.due_date,
            billing_type: ex.billing_type,
            status: ex.status,
          },
        }, 200);
      }
    }

    // 1) Conta ativa + chave do Vault + configuração de lançamento financeiro +
    //    defaults de multa/juros/desconto/vencimento/descrição/parcelamento +
    //    destino financeiro (conta + categoria de receita) do recebível.
    const { data: accountData } = await supabase
      .from("tenant_payment_accounts")
      .select(
        "status, vault_secret_name, auto_post_to_finance, " +
          "default_fine_percent, default_interest_percent, " +
          "default_discount_percent, default_discount_days, " +
          "default_due_days, default_description, default_max_installments, " +
          "default_finance_account_id, default_income_category",
      )
      .eq("company_id", companyId)
      .maybeSingle();
    const account = accountData as any;
    if (!account || account.status !== "active" || !account.vault_secret_name) {
      return jsonResponse(req, {
        error: "Ative o recebimento de pagamentos em Configurações → Integrações antes de gerar cobranças.",
      }, 400);
    }
    const apiKey = await vaultReadSecret(supabase, account.vault_secret_name);
    if (!apiKey) {
      return jsonResponse(req, {
        error: "A chave da Asaas não foi encontrada. Reative a integração em Configurações → Integrações.",
      }, 400);
    }
    const asaas = asaasFor(apiKey);

    // 2) Cliente final no Asaas.
    const asaasCustomerId = await ensureAsaasCustomer(supabase, asaas, companyId, input.customer_id);

    // --- Resolve config efetiva (override do corpo → default da conta → fallback) ---

    // Vencimento: usa o do corpo (já validado) ou calcula hoje + default_due_days.
    const dueDate = rawDueDate ?? dueDateFromDays(Number(account.default_due_days ?? 0));

    // Descrição: corpo → default da conta → nada.
    const accountDescription =
      typeof account.default_description === "string" && account.default_description.trim()
        ? account.default_description.trim().slice(0, 500)
        : null;
    const description = inputDescription ?? accountDescription;

    // Multa e juros por atraso (override por cobrança; senão default da conta).
    // Só envia quando > 0. Juros são clampados ao teto de 10% da Asaas.
    const fineValue = toPositivePercent(input.fine_percent ?? account.default_fine_percent) ?? 0;
    const rawInterest = toPositivePercent(input.interest_percent ?? account.default_interest_percent);
    const interestValue = rawInterest !== null ? Math.min(rawInterest, ASAAS_MAX_INTEREST_PERCENT) : 0;

    // Desconto por antecipação (override por cobrança; senão default da conta).
    // Envia o objeto discount só quando o percentual > 0.
    const discountPercent =
      toPositivePercent(input.discount_percent ?? account.default_discount_percent) ?? 0;
    const rawDiscountDays = Number(
      input.discount_days ?? account.default_discount_days ?? 0,
    );
    const discountDays = Number.isFinite(rawDiscountDays) && rawDiscountDays > 0
      ? Math.floor(rawDiscountDays)
      : 0;

    // Parcelamento: só no cartão E quando pedido > 1. Asaas parcela o totalValue.
    const rawInstallments = Number(input.installment_count ?? 1);
    const installmentCount =
      billingType === "CREDIT_CARD" && Number.isFinite(rawInstallments) && rawInstallments > 1
        ? Math.floor(rawInstallments)
        : 1;

    // 3) Cria a cobrança. externalReference = company_id (resolução multi-tenant §9.3).
    const payment = await asaas.post<any>("/payments", {
      customer: asaasCustomerId,
      billingType,
      // Parcelamento no cartão: Asaas espera installmentCount + totalValue (parcela
      // o total). Cobrança simples usa `value`.
      ...(installmentCount > 1
        ? { installmentCount, totalValue: chargeValue }
        : { value: chargeValue }),
      dueDate: dueDate,
      description: description ?? undefined,
      externalReference: companyId,
      ...(fineValue > 0 ? { fine: { value: fineValue, type: "PERCENTAGE" } } : {}),
      ...(interestValue > 0 ? { interest: { value: interestValue, type: "PERCENTAGE" } } : {}),
      ...(discountPercent > 0
        ? { discount: { value: discountPercent, type: "PERCENTAGE", dueDateLimitDays: discountDays } }
        : {}),
    });
    const asaasPaymentId: string | undefined = payment?.id;
    if (!asaasPaymentId) {
      return jsonResponse(req, { error: "A Asaas não retornou a cobrança. Tente novamente." }, 502);
    }

    // 4) Dados de pagamento (pix copia-e-cola / boleto), best-effort.
    let pixCopyPaste: string | null = null;
    let boletoUrl: string | null = payment?.bankSlipUrl ?? null;
    if (billingType === "PIX" || billingType === "UNDEFINED") {
      try {
        const pix = await asaas.get<any>(`/payments/${asaasPaymentId}/pixQrCode`);
        pixCopyPaste = pix?.payload ?? null;
      } catch {
        // Pix pode ainda não estar disponível na criação — o checkout busca depois.
      }
    }

    // 5) Grava tenant_charges (idempotência por asaas_payment_id UNIQUE).
    const shortCode = generateShortCode();
    const chargeRow = {
      company_id: companyId,
      asaas_payment_id: asaasPaymentId,
      source_type: sourceType,
      source_id: sourceType === "quote" ? sourceId : null,
      customer_id: input.customer_id,
      value: chargeValue,
      net_value: payment?.netValue ?? null,
      billing_type: billingType,
      status: payment?.status ?? "PENDING",
      due_date: dueDate,
      payment_date: null,
      description: description,
      public_short_code: shortCode,
      invoice_url: payment?.invoiceUrl ?? null,
      pix_copy_paste: pixCopyPaste,
      boleto_url: boletoUrl,
      created_by: userId,
    };
    const { data: saved, error: insertErr } = await supabase
      .from("tenant_charges")
      .upsert(chargeRow, { onConflict: "asaas_payment_id" })
      .select("id, public_short_code")
      .maybeSingle();
    if (insertErr) {
      // Cobrança órfã: existe na Asaas mas não gravou aqui. NÃO perdemos o link —
      // devolvemos a invoice_url (o tenant já pode cobrar) e sinalizamos a
      // inconsistência pro front avisar "salve/anote o link". A reconciliação
      // do webhook (por asaas_payment_id) ainda dá baixa quando pagar.
      console.error(
        "[create-charge] insert tenant_charges falhou (cobrança órfã na Asaas):",
        JSON.stringify({ asaas_payment_id: asaasPaymentId, company_id: companyId, error: insertErr.message }),
      );
      return jsonResponse(req, {
        warning: "A cobrança foi gerada, mas não conseguimos registrá-la no sistema. Guarde o link de pagamento abaixo.",
        charge: {
          public_short_code: null,
          checkout_url: payment?.invoiceUrl ?? null,
          invoice_url: payment?.invoiceUrl ?? null,
          pix_copy_paste: pixCopyPaste,
          boleto_url: boletoUrl,
          value: chargeValue,
          due_date: dueDate,
          billing_type: billingType,
          status: payment?.status ?? "PENDING",
        },
      }, 207);
    }
    const finalShortCode = saved?.public_short_code ?? shortCode;

    // 6) Lançamento automático no Financeiro (a receber), se habilitado.
    //    NÃO-FATAL: a cobrança já existe no Asaas e em tenant_charges — um erro
    //    aqui não pode invalidar nem desfazer o que foi gerado.
    //    A baixa automática (webhook PAYMENT_RECEIVED) quitará o lançamento.
    if (account.auto_post_to_finance !== false && saved?.id) {
      try {
        const { error: rpcErr } = await supabase.rpc("create_tenant_charge_receivable", {
          p_company_id: companyId,
          p_tenant_charge_id: saved.id,
          p_customer_id: input.customer_id,
          p_amount: chargeValue,
          p_due_date: dueDate,
          p_description: description,
          // Destino financeiro do recebível (ambos podem ser null → RPC decide default).
          p_account_id: account.default_finance_account_id ?? null,
          p_category: account.default_income_category ?? null,
        });
        if (rpcErr) {
          // Loga sem vazar segredo (só mensagem pública do Postgres).
          console.warn(
            "[create-charge] create_tenant_charge_receivable falhou (não-fatal):",
            rpcErr.message,
          );
        }
      } catch (receivableErr) {
        console.warn(
          "[create-charge] create_tenant_charge_receivable exceção (não-fatal):",
          (receivableErr as Error)?.message ?? String(receivableErr),
        );
      }
    }

    return jsonResponse(req, {
      charge: {
        public_short_code: finalShortCode,
        checkout_url: `/pagar/${finalShortCode}`,
        invoice_url: payment?.invoiceUrl ?? null,
        pix_copy_paste: pixCopyPaste,
        boleto_url: boletoUrl,
        value: chargeValue,
        due_date: dueDate,
        billing_type: billingType,
        status: payment?.status ?? "PENDING",
      },
    }, 200);
  } catch (e) {
    const status = e instanceof AsaasApiError ? e.status : 500;
    console.error("[create-charge] erro:", (e as Error).message);
    return jsonResponse(req, {
      error: e instanceof AsaasApiError
        ? (e.message || "Falha ao criar a cobrança na Asaas.")
        : "Ocorreu um erro ao gerar a cobrança. Tente novamente.",
    }, status >= 400 && status < 600 ? status : 500);
  }
}

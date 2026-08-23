// tenant-asaas-create-subscription
// ---------------------------------
// PRIVILEGIADA (Bearer + módulo 'cobrancas' + can_manage_system). Cria uma ASSINATURA
// recorrente na conta Asaas DO TENANT (chave BYO lida do Vault) e grava
// tenant_subscriptions. Aceita boleto/Pix (BOLETO | PIX | UNDEFINED) e, DORMENTE
// atrás do flag tenant_payment_accounts.card_recurring_enabled, CARTÃO recorrente
// (CREDIT_CARD) — a Asaas tokeniza o cartão e cobra sozinha a cada ciclo.
//
// company_id vem do profile (payments-auth), nunca do payload.
//
// Fluxo:
//   1. lê a chave BYO do Vault (via tenant_payment_accounts.vault_secret_name);
//   2. garante o asaas_customer_id do cliente final (dedupe por externalReference);
//   3. POST /v3/subscriptions com externalReference = company_id (resolução multi-tenant),
//      fine/interest do override → default da conta (juros clampado a 10%). No cartão,
//      manda creditCard + creditCardHolderInfo + remoteIp e recebe o token de volta;
//   4. no cartão, grava o token no Vault e a referência (+ last4/brand) na linha;
//   5. grava tenant_subscriptions (status 'active', asaas_subscription_id, next_due_date...).
//
// As cobranças de cada ciclo são criadas PELO ASAAS e chegam via webhook
// (tenant-asaas-webhook), que materializa cada uma em tenant_charges + recebível.
//
// Nunca retorna custo/margem interna. Nunca loga a chave.

import { handleCors } from "../_shared/cors.ts";
import {
  authorizePaymentsManager,
  jsonResponse,
  vaultReadSecret,
  vaultUpsertSecret,
} from "../_shared/payments-auth.ts";
import { asaasFor, AsaasApiError } from "../_shared/asaas-tenant-client.ts";
import { isValidDocument, unmaskDoc } from "../_shared/document-validation.ts";

/** billing_types de assinatura aceitos. Cartão fica dormente atrás do flag da conta. */
type BillingType = "PIX" | "BOLETO" | "UNDEFINED" | "CREDIT_CARD";
const ALLOWED_BILLING_TYPES: readonly BillingType[] = ["PIX", "BOLETO", "UNDEFINED", "CREDIT_CARD"];

/** Ciclos aceitos pela Asaas (mesmo vocabulário do CHECK de tenant_subscriptions). */
type Cycle = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY";
const ALLOWED_CYCLES: readonly Cycle[] = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUALLY",
  "YEARLY",
];

/** Valor mínimo aceito pela Asaas por cobrança (R$ 5,00). */
const MIN_VALUE = 5;

/** Asaas impõe teto de 10% ao mês nos juros; clampamos por segurança. */
const ASAAS_MAX_INTEREST_PERCENT = 10;

/** hoje + `days` em UTC, formatado YYYY-MM-DD (usado quando next_due_date não vem). */
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

/** Normaliza um percentual: número finito > 0, senão null. */
function toPositivePercent(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Valida `next_due_date` no formato YYYY-MM-DD e não no passado (UTC, dia cheio). */
function validateDueDate(due: string): { ok: true } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return { ok: false, error: "A data do primeiro vencimento deve estar no formato AAAA-MM-DD." };
  }
  const parsed = new Date(`${due}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "A data do primeiro vencimento é inválida." };
  }
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (parsed.getTime() < todayUtc) {
    return { ok: false, error: "A data do primeiro vencimento não pode estar no passado." };
  }
  return { ok: true };
}

/**
 * Dados do cartão. ATENÇÃO PCI (ver bloco CARTÃO no handler): number/ccv/expiry
 * SÓ transitam em memória pra chamar o Asaas — NUNCA são persistidos nem logados.
 */
interface CreditCardInput {
  holderName?: string;
  number?: string;
  expiryMonth?: string;
  expiryYear?: string;
  ccv?: string;
}

/** Dados do titular exigidos pela Asaas no antifraude do cartão. */
interface CreditCardHolderInfoInput {
  name?: string;
  email?: string;
  cpfCnpj?: string;
  postalCode?: string;
  addressNumber?: string;
  phone?: string;
}

interface CreateSubscriptionInput {
  customer_id?: string;
  value?: number;
  cycle?: Cycle;
  billing_type?: BillingType;
  next_due_date?: string;
  description?: string;
  fine_percent?: number;
  interest_percent?: number;
  // Origem opcional (avulso por padrão). source_id livre (fonte heterogênea).
  source_type?: "avulso" | "contract" | "quote";
  source_id?: string;
  // Só quando billing_type === 'CREDIT_CARD' (dados sensíveis, não persistidos).
  credit_card?: CreditCardInput;
  credit_card_holder_info?: CreditCardHolderInfoInput;
  remote_ip?: string;
}

/** Nome determinístico do secret do token de cartão no Vault (por assinatura Asaas). */
function cardTokenSecretName(companyId: string, asaasSubscriptionId: string): string {
  return `tenant_asaas_card_token_${companyId}_${asaasSubscriptionId}`;
}

/**
 * Valida os blocos de cartão (presença dos campos obrigatórios). NÃO loga valores.
 * Retorna erro PT-BR claro em qualquer campo faltando.
 */
function validateCreditCardPayload(
  card: CreditCardInput | undefined,
  holder: CreditCardHolderInfoInput | undefined,
  remoteIp: unknown,
): { ok: true } | { ok: false; error: string } {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (!card || typeof card !== "object") {
    return { ok: false, error: "Informe os dados do cartão para a assinatura no cartão." };
  }
  if (!s(card.holderName)) return { ok: false, error: "Informe o nome impresso no cartão." };
  if (!s(card.number)) return { ok: false, error: "Informe o número do cartão." };
  if (!s(card.expiryMonth) || !s(card.expiryYear)) {
    return { ok: false, error: "Informe o mês e o ano de validade do cartão." };
  }
  if (!s(card.ccv)) return { ok: false, error: "Informe o código de segurança (CVV) do cartão." };

  if (!holder || typeof holder !== "object") {
    return { ok: false, error: "Informe os dados do titular do cartão." };
  }
  if (!s(holder.name)) return { ok: false, error: "Informe o nome do titular do cartão." };
  if (!s(holder.email)) return { ok: false, error: "Informe o e-mail do titular do cartão." };
  if (!s(holder.cpfCnpj)) return { ok: false, error: "Informe o CPF/CNPJ do titular do cartão." };
  if (!s(holder.postalCode)) return { ok: false, error: "Informe o CEP do titular do cartão." };
  if (!s(holder.addressNumber)) return { ok: false, error: "Informe o número do endereço do titular do cartão." };
  if (!s(holder.phone)) return { ok: false, error: "Informe o telefone do titular do cartão." };

  if (!s(remoteIp)) {
    return { ok: false, error: "Não foi possível identificar o IP do pagador. Recarregue a página e tente novamente." };
  }
  return { ok: true };
}

/**
 * Garante o asaas_customer_id do cliente final. Mesma lógica do create-charge:
 * valida CPF/CNPJ, deduplica no PRÓPRIO Asaas por externalReference = customer.id,
 * cria se faltar.
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
    throw new AsaasApiError("Cliente não encontrado na sua empresa.", 404);
  }

  const rawDoc = customer.document ? String(customer.document) : "";
  const doc = unmaskDoc(rawDoc);
  if (!doc) {
    throw new AsaasApiError(
      `O cliente "${customer.name ?? "selecionado"}" não tem CPF/CNPJ cadastrado. Cadastre o documento antes de criar a assinatura.`,
      400,
    );
  }
  if (!isValidDocument(doc)) {
    throw new AsaasApiError(
      `O CPF/CNPJ do cliente "${customer.name ?? "selecionado"}" é inválido. Corrija o cadastro antes de criar a assinatura.`,
      400,
    );
  }

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
    cpfCnpj: doc,
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
    console.error("[create-subscription] exceção não tratada no topo:", (e as Error)?.message ?? e);
    return jsonResponse(req, {
      error: "Ocorreu um erro ao criar a assinatura. Tente novamente em instantes.",
    }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await authorizePaymentsManager(req);
  if (!auth.ok) return auth.response;
  const { supabase, userId, companyId } = auth;

  let input: CreateSubscriptionInput;
  try {
    input = await req.json();
  } catch {
    return jsonResponse(req, { error: "Requisição inválida." }, 400);
  }

  // ---- Validações de entrada
  if (!input.customer_id || typeof input.customer_id !== "string") {
    return jsonResponse(req, { error: "Selecione o cliente da assinatura." }, 400);
  }
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    return jsonResponse(req, { error: "Informe um valor válido para a assinatura." }, 400);
  }
  if (value < MIN_VALUE) {
    return jsonResponse(req, {
      error: `O valor mínimo de uma assinatura é R$ ${MIN_VALUE.toFixed(2).replace(".", ",")}.`,
    }, 400);
  }
  const subValue = Math.round(value * 100) / 100;

  const cycle = (input.cycle ?? "MONTHLY") as Cycle;
  if (!ALLOWED_CYCLES.includes(cycle)) {
    return jsonResponse(req, {
      error: "Frequência de cobrança inválida. Escolha semanal, mensal, trimestral, semestral ou anual.",
    }, 400);
  }

  const billingType: BillingType = input.billing_type ?? "UNDEFINED";
  if (!ALLOWED_BILLING_TYPES.includes(billingType)) {
    return jsonResponse(req, {
      error: "Forma de pagamento inválida. A assinatura aceita Pix, boleto ou cartão.",
    }, 400);
  }

  // No cartão, valida a presença dos blocos sensíveis ANTES de tocar o Asaas.
  // (O gate do flag card_recurring_enabled roda mais abaixo, junto com a conta.)
  const isCreditCard = billingType === "CREDIT_CARD";
  if (isCreditCard) {
    const cardCheck = validateCreditCardPayload(
      input.credit_card,
      input.credit_card_holder_info,
      input.remote_ip,
    );
    if (!cardCheck.ok) {
      return jsonResponse(req, { error: cardCheck.error }, 400);
    }
  }

  const rawDueDate =
    typeof input.next_due_date === "string" && input.next_due_date.trim()
      ? input.next_due_date.trim()
      : null;
  if (rawDueDate) {
    const dueCheck = validateDueDate(rawDueDate);
    if (!dueCheck.ok) {
      return jsonResponse(req, { error: dueCheck.error }, 400);
    }
  }

  const inputDescription =
    typeof input.description === "string" && input.description.trim()
      ? input.description.trim().slice(0, 500)
      : null;

  const sourceType =
    input.source_type === "contract" || input.source_type === "quote"
      ? input.source_type
      : "avulso";
  const sourceId =
    typeof input.source_id === "string" && input.source_id.trim() ? input.source_id.trim() : null;

  // GUARD anti-double-billing (só ramo 'contract'): um contrato não pode ter
  // DUAS assinaturas vivas. "Viva" = qualquer status que não seja 'cancelled'
  // (pending, active, paused, overdue). Roda ANTES de tocar o Asaas — não
  // criamos assinatura lá pra depois descobrir a duplicata.
  if (sourceType === "contract" && sourceId) {
    const { data: existingLive, error: guardErr } = await supabase
      .from("tenant_subscriptions")
      .select("id")
      .eq("company_id", companyId)
      .eq("source_type", "contract")
      .eq("source_id", sourceId)
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle();
    if (guardErr) {
      console.error("[create-subscription] guard contract falhou:", guardErr.message);
      return jsonResponse(req, {
        error: "Não foi possível verificar o faturamento deste contrato. Tente novamente em instantes.",
      }, 500);
    }
    if (existingLive) {
      return jsonResponse(req, {
        error: "Este contrato já tem um faturamento recorrente ativo. Cancele o atual antes de criar outro.",
      }, 409);
    }
  }

  try {
    // 1) Conta ativa + chave do Vault + defaults (multa/juros/vencimento/descrição/destino).
    const { data: accountData } = await supabase
      .from("tenant_payment_accounts")
      .select(
        "status, vault_secret_name, card_recurring_enabled, " +
          "default_fine_percent, default_interest_percent, " +
          "default_due_days, default_description",
      )
      .eq("company_id", companyId)
      .maybeSingle();
    const account = accountData as any;
    if (!account || account.status !== "active" || !account.vault_secret_name) {
      return jsonResponse(req, {
        error: "Ative o recebimento de pagamentos em Configurações → Integrações antes de criar assinaturas.",
      }, 400);
    }

    // GATE do cartão recorrente (feature dormente): só quando a conta está habilitada.
    if (isCreditCard && account.card_recurring_enabled !== true) {
      return jsonResponse(req, {
        error: "O pagamento recorrente no cartão ainda não está habilitado para a sua conta. Fale com o suporte.",
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

    // --- Config efetiva (override do corpo → default da conta → fallback) ---
    const nextDueDate = rawDueDate ?? dueDateFromDays(Number(account.default_due_days ?? 0));

    const accountDescription =
      typeof account.default_description === "string" && account.default_description.trim()
        ? account.default_description.trim().slice(0, 500)
        : null;
    const description = inputDescription ?? accountDescription;

    // Override por assinatura; senão default da conta. Persistimos SÓ o override
    // (null quando cai no default), como a coluna espera.
    const fineOverride = toPositivePercent(input.fine_percent);
    const interestOverride = toPositivePercent(input.interest_percent);

    const fineValue = fineOverride ?? toPositivePercent(account.default_fine_percent) ?? 0;
    const rawInterest = interestOverride ?? toPositivePercent(account.default_interest_percent);
    const interestValue = rawInterest !== null ? Math.min(rawInterest, ASAAS_MAX_INTEREST_PERCENT) : 0;

    // ─────────────────────────────────────────────────────────────────────────
    // BLOCO CARTÃO — REGRA DE SEGURANÇA (PCI):
    // O dado sensível do cartão (PAN/número, CVV/ccv e validade) SÓ transita em
    // MEMÓRIA aqui, exclusivamente pra montar o corpo do POST /subscriptions do
    // Asaas. NUNCA é persistido no banco e NUNCA é logado (não colocamos o objeto
    // creditCard em console.* nem gravamos number/ccv/expiry em coluna nenhuma).
    // Do retorno da Asaas guardamos APENAS: o token (no Vault) e last4/brand (só
    // exibição). A Asaas passa a cobrar o cartão sozinha a cada ciclo pelo token.
    // ─────────────────────────────────────────────────────────────────────────
    const creditCardBody = isCreditCard
      ? {
          creditCard: {
            holderName: input.credit_card!.holderName!.trim(),
            number: input.credit_card!.number!.trim(),
            expiryMonth: input.credit_card!.expiryMonth!.trim(),
            expiryYear: input.credit_card!.expiryYear!.trim(),
            ccv: input.credit_card!.ccv!.trim(),
          },
          creditCardHolderInfo: {
            name: input.credit_card_holder_info!.name!.trim(),
            email: input.credit_card_holder_info!.email!.trim(),
            cpfCnpj: unmaskDoc(String(input.credit_card_holder_info!.cpfCnpj)),
            postalCode: input.credit_card_holder_info!.postalCode!.trim(),
            addressNumber: input.credit_card_holder_info!.addressNumber!.trim(),
            phone: input.credit_card_holder_info!.phone!.trim(),
          },
          remoteIp: String(input.remote_ip).trim(),
        }
      : {};

    // 3) Cria a assinatura no Asaas. externalReference = company_id (resolução multi-tenant).
    const subscription = await asaas.post<any>("/subscriptions", {
      customer: asaasCustomerId,
      billingType,
      value: subValue,
      nextDueDate,
      cycle,
      description: description ?? undefined,
      externalReference: companyId,
      ...(fineValue > 0 ? { fine: { value: fineValue, type: "PERCENTAGE" } } : {}),
      ...(interestValue > 0 ? { interest: { value: interestValue, type: "PERCENTAGE" } } : {}),
      ...creditCardBody,
    });
    const asaasSubscriptionId: string | undefined = subscription?.id;
    if (!asaasSubscriptionId) {
      return jsonResponse(req, { error: "A Asaas não retornou a assinatura. Tente novamente." }, 502);
    }

    // No cartão, a Asaas tokeniza e devolve creditCard.{creditCardToken, creditCardNumber(=4 últimos), creditCardBrand}.
    // Guardamos o TOKEN no Vault (nunca no banco) e só last4/brand na linha (exibição).
    let cardTokenName: string | null = null;
    let cardLast4: string | null = null;
    let cardBrand: string | null = null;
    if (isCreditCard) {
      const returnedToken =
        typeof subscription?.creditCard?.creditCardToken === "string"
          ? subscription.creditCard.creditCardToken
          : null;
      const returnedLast4 =
        typeof subscription?.creditCard?.creditCardNumber === "string"
          ? subscription.creditCard.creditCardNumber.slice(-4)
          : null;
      const returnedBrand =
        typeof subscription?.creditCard?.creditCardBrand === "string"
          ? subscription.creditCard.creditCardBrand
          : null;

      if (returnedToken) {
        const secretName = cardTokenSecretName(companyId, asaasSubscriptionId);
        // Grava o token no Vault (RPC SECURITY DEFINER). Só o NOME do secret vai pro banco.
        await vaultUpsertSecret(supabase, secretName, returnedToken);
        cardTokenName = secretName;
      } else {
        // Assinatura criada no cartão, mas sem token no retorno: não conseguimos
        // reusar o cartão. Sinalizamos por log SEM dado sensível (só o id da assinatura).
        console.warn(
          "[create-subscription] cartão sem creditCardToken no retorno da Asaas:",
          JSON.stringify({ asaas_subscription_id: asaasSubscriptionId, company_id: companyId }),
        );
      }
      cardLast4 = returnedLast4;
      cardBrand = returnedBrand;
    }

    // 4) Grava tenant_subscriptions (idempotência por asaas_subscription_id UNIQUE).
    //    Status 'active' (assinatura já emitindo cobranças no Asaas).
    const subRow = {
      company_id: companyId,
      customer_id: input.customer_id,
      asaas_subscription_id: asaasSubscriptionId,
      source_type: sourceType,
      source_id: sourceId,
      cycle,
      value: subValue,
      billing_type: billingType === "UNDEFINED" ? "BOLETO" : billingType, // coluna não aceita UNDEFINED
      next_due_date: nextDueDate,
      status: "active",
      // Só o override (null quando cai no default da conta).
      fine_percent: fineOverride,
      interest_percent: interestOverride,
      description,
      created_by: userId,
      // Cartão: só referência do token (Vault) + last4/brand (exibição). Nunca PAN/CVV.
      ...(isCreditCard
        ? {
            credit_card_token_name: cardTokenName,
            credit_card_last4: cardLast4,
            credit_card_brand: cardBrand,
          }
        : {}),
    };
    const { data: saved, error: insertErr } = await supabase
      .from("tenant_subscriptions")
      .upsert(subRow, { onConflict: "asaas_subscription_id" })
      .select("id, asaas_subscription_id, status, next_due_date, value, cycle, billing_type")
      .maybeSingle();

    if (insertErr) {
      // Assinatura órfã: existe no Asaas mas não gravou aqui. Não perdemos o link —
      // o webhook reconcilia por asaas_subscription_id / externalReference. Sinalizamos.
      console.error(
        "[create-subscription] insert tenant_subscriptions falhou (assinatura órfã no Asaas):",
        JSON.stringify({
          asaas_subscription_id: asaasSubscriptionId,
          company_id: companyId,
          error: insertErr.message,
        }),
      );
      return jsonResponse(req, {
        warning: "A assinatura foi criada na Asaas, mas não conseguimos registrá-la no sistema. Ela continuará gerando cobranças normalmente.",
        subscription: {
          id: null,
          asaas_subscription_id: asaasSubscriptionId,
          status: "active",
          next_due_date: nextDueDate,
          value: subValue,
          cycle,
          billing_type: billingType,
        },
      }, 207);
    }

    return jsonResponse(req, {
      subscription: {
        id: saved?.id ?? null,
        asaas_subscription_id: asaasSubscriptionId,
        status: saved?.status ?? "active",
        next_due_date: saved?.next_due_date ?? nextDueDate,
        value: saved?.value ?? subValue,
        cycle: saved?.cycle ?? cycle,
        billing_type: saved?.billing_type ?? billingType,
      },
    }, 200);
  } catch (e) {
    const status = e instanceof AsaasApiError ? e.status : 500;
    console.error("[create-subscription] erro:", (e as Error).message);
    return jsonResponse(req, {
      error: e instanceof AsaasApiError
        ? (e.message || "Falha ao criar a assinatura na Asaas.")
        : "Ocorreu um erro ao criar a assinatura. Tente novamente.",
    }, status >= 400 && status < 600 ? status : 500);
  }
}

// tenant-asaas-create-subscription
// ---------------------------------
// PRIVILEGIADA (Bearer + módulo 'cobrancas' + can_manage_system). Cria uma ASSINATURA
// recorrente na conta Asaas DO TENANT (chave BYO lida do Vault) e grava
// tenant_subscriptions. Boleto/Pix criam a assinatura pela API. Cartão cria um
// checkout HOSPEDADO recorrente da Asaas: PAN, validade e CVV nunca passam pelo
// Dominex, pela Edge Function ou pelo banco.
//
// company_id vem do profile (payments-auth), nunca do payload.
//
// Fluxo:
//   1. lê a chave BYO do Vault (via tenant_payment_accounts.vault_secret_name);
//   2. garante o asaas_customer_id do cliente final (dedupe por externalReference);
//   3. boleto/Pix: POST /v3/subscriptions e status active;
//   4. cartão: POST /v3/checkouts RECURRENT/CREDIT_CARD e status pending;
//   5. grava somente IDs/URL/status do checkout — nunca dados do cartão.
//
// As cobranças de cada ciclo são criadas PELO ASAAS e chegam via webhook
// (tenant-asaas-webhook), que materializa cada uma em tenant_charges + recebível.
//
// Duração (opcional): na assinatura criada diretamente, `max_payments` vira
// `maxPayments`. No checkout hospedado, cujo DTO documentado não aceita esse
// campo, o limite é convertido em `subscription.endDate`. Ausente = contínua.
// O limite também é persistido no espelho para edição e auditoria fiéis.
//
// Nunca retorna custo/margem interna. Nunca loga a chave.

import { handleCors } from "../_shared/cors.ts";
import {
  authorizePaymentsManager,
  generateShortCode,
  jsonResponse,
  vaultReadSecret,
} from "../_shared/payments-auth.ts";
import {
  AsaasApiError,
  asaasFor,
  isMethodNotEnabledError,
  methodNotEnabledBody,
} from "../_shared/asaas-tenant-client.ts";
import { isValidDocument, unmaskDoc } from "../_shared/document-validation.ts";

/** billing_types de assinatura aceitos. */
type BillingType = "PIX" | "BOLETO" | "UNDEFINED" | "CREDIT_CARD";
const ALLOWED_BILLING_TYPES: readonly BillingType[] = [
  "PIX",
  "BOLETO",
  "UNDEFINED",
  "CREDIT_CARD",
];

/** Ciclos aceitos pela Asaas (mesmo vocabulário do CHECK de tenant_subscriptions). */
type Cycle =
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMIANNUALLY"
  | "YEARLY";
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
  const base = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;
  const target = new Date(base + safeDays * 86_400_000);
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, "0");
  const d = String(target.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Último vencimento de uma assinatura limitada (primeiro ciclo já conta como 1). */
function subscriptionEndDate(
  firstDueDate: string,
  cycle: Cycle,
  maxPayments: number,
): string {
  const date = new Date(`${firstDueDate}T00:00:00Z`);
  const periods = Math.max(0, maxPayments - 1);
  if (cycle === "WEEKLY" || cycle === "BIWEEKLY") {
    date.setUTCDate(
      date.getUTCDate() + periods * (cycle === "WEEKLY" ? 7 : 14),
    );
  } else {
    const monthsPerCycle = cycle === "MONTHLY"
      ? 1
      : cycle === "QUARTERLY"
      ? 3
      : cycle === "SEMIANNUALLY"
      ? 6
      : 12;
    const wantedDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + periods * monthsPerCycle);
    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(wantedDay, lastDay));
  }
  return date.toISOString().slice(0, 10);
}

function normalizeAsaasCheckoutUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      (host !== "asaas.com" && !host.endsWith(".asaas.com"))
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Normaliza um percentual: número finito > 0, senão null. */
function toPositivePercent(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Normaliza um valor em REAIS vindo do corpo: número finito > 0 arredondado a
 * 2 casas (a Asaas recusa mais que isso), senão null.
 */
function toPositiveAmount(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Como a multa por atraso é cobrada em CADA cobrança da assinatura. A Asaas
 * aceita os dois em `fine.type` (enum ["FIXED","PERCENTAGE"]), igual à cobrança
 * avulsa. Os JUROS não têm equivalente: o DTO de juros só tem `value` e é
 * sempre percentual ao mês, por isso não existe `interest_type` aqui.
 */
type FineType = "PERCENTAGE" | "FIXED";
const ALLOWED_FINE_TYPES: readonly FineType[] = ["PERCENTAGE", "FIXED"];

/** Valida `next_due_date` no formato YYYY-MM-DD e não no passado (UTC, dia cheio). */
function validateDueDate(
  due: string,
): { ok: true } | { ok: false; error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return {
      ok: false,
      error: "A data do primeiro vencimento deve estar no formato AAAA-MM-DD.",
    };
  }
  const parsed = new Date(`${due}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "A data do primeiro vencimento é inválida." };
  }
  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  if (parsed.getTime() < todayUtc) {
    return {
      ok: false,
      error: "A data do primeiro vencimento não pode estar no passado.",
    };
  }
  return { ok: true };
}

interface CreateSubscriptionInput {
  customer_id?: string;
  value?: number;
  cycle?: Cycle;
  billing_type?: BillingType;
  next_due_date?: string;
  description?: string;
  // Multa: `fine_type` escolhe COMO ela é cobrada nesta assinatura.
  //   ausente | 'PERCENTAGE' → lê `fine_percent` (%), com fallback no
  //                            default_fine_percent da conta (comportamento histórico)
  //   'FIXED'                → lê `fine_value` (R$), SEM fallback: o default da
  //                            conta é percentual, relê-lo como reais viraria
  //                            "2%" → "R$ 2,00" sem ninguém pedir.
  fine_percent?: number;
  fine_value?: number;
  fine_type?: FineType;
  interest_percent?: number;
  // Origem opcional (avulso por padrão). source_id livre (fonte heterogênea).
  source_type?: "avulso" | "contract" | "quote";
  source_id?: string;
  // Categoria (nome) do recebível no Financeiro, aplicada a CADA cobrança que esta
  // assinatura gerar. Ausente/null → cai no default_income_category da conta
  // (mesmo comportamento de hoje). Persistida em tenant_subscriptions.category;
  // o webhook lê daqui na hora de materializar cada ciclo.
  category?: string;
  // Centro de custo do recebível no Financeiro, aplicado a CADA ciclo. Ausente/
  // null → sem centro (sempre opcional, sem default de conta). Persistido em
  // tenant_subscriptions.cost_center_id; o webhook lê daqui em cada ciclo.
  // Posse validada na RPC (create_tenant_charge_receivable), não aqui.
  cost_center_id?: string | null;
  // Número máximo de ciclos (cobranças) gerados por esta assinatura. Ausente =
  // contínua (Asaas gera indefinidamente até cancelar). Mapeia pra `maxPayments`
  // no POST da Asaas e é persistido no espelho local.
  max_payments?: number;
}

/**
 * Teto do número de ciclos. É o MESMO número do motor de parcelamento do
 * Financeiro (`MAX_REPETITION_COUNT` em src/lib/finance-installments.ts): 120 =
 * 10 anos de mensalidade, o teto de qualquer contrato real do cliente. Não
 * inventar um limite próprio aqui — uma assinatura de 999 ciclos é sempre dedo
 * errado, e a Asaas cobraria mesmo assim, todo mês, por décadas.
 *
 * O front valida antes e mostra a mensagem em PT-BR; este é o limite físico,
 * que vale também pra quem chamar a edge direto. Um teste em
 * `src/lib/subscriptionSummary.test.ts` lê este arquivo e trava o número, pra
 * cliente e servidor não divergirem.
 */
const MAX_PAYMENTS_CEILING = 120;

/** Valida `max_payments`: inteiro positivo, opcional. */
function validateMaxPayments(
  raw: unknown,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: null };
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    return {
      ok: false,
      error: "O número de ciclos deve ser um número inteiro maior que zero.",
    };
  }
  if (n > MAX_PAYMENTS_CEILING) {
    return {
      ok: false,
      error:
        `O número de ciclos não pode ser maior que ${MAX_PAYMENTS_CEILING}. Para um prazo maior, deixe a assinatura contínua.`,
    };
  }
  return { ok: true, value: n };
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
      `O cliente "${
        customer.name ?? "selecionado"
      }" não tem CPF/CNPJ cadastrado. Cadastre o documento antes de criar a assinatura.`,
      400,
    );
  }
  if (!isValidDocument(doc)) {
    throw new AsaasApiError(
      `O CPF/CNPJ do cliente "${
        customer.name ?? "selecionado"
      }" é inválido. Corrija o cadastro antes de criar a assinatura.`,
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
    throw new AsaasApiError(
      "Não foi possível cadastrar o cliente na Asaas.",
      502,
    );
  }
  return asaasCustomerId;
}

Deno.serve(async (req) => {
  // Rede de segurança de topo: nenhuma exceção escapa (senão o gateway devolve 502
  // cru, sem JSON, e o front não lê error.context). Tudo vira Response JSON PT-BR.
  try {
    return await handleRequest(req);
  } catch (e) {
    console.error(
      "[create-subscription] exceção não tratada no topo:",
      (e as Error)?.message ?? e,
    );
    return jsonResponse(req, {
      error:
        "Ocorreu um erro ao criar a assinatura. Tente novamente em instantes.",
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
    return jsonResponse(
      req,
      { error: "Selecione o cliente da assinatura." },
      400,
    );
  }
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    return jsonResponse(req, {
      error: "Informe um valor válido para a assinatura.",
    }, 400);
  }
  if (value < MIN_VALUE) {
    return jsonResponse(req, {
      error: `O valor mínimo de uma assinatura é R$ ${
        MIN_VALUE.toFixed(2).replace(".", ",")
      }.`,
    }, 400);
  }
  const subValue = Math.round(value * 100) / 100;

  const cycle = (input.cycle ?? "MONTHLY") as Cycle;
  if (!ALLOWED_CYCLES.includes(cycle)) {
    return jsonResponse(req, {
      error:
        "Frequência de cobrança inválida. Escolha semanal, mensal, trimestral, semestral ou anual.",
    }, 400);
  }

  const billingType: BillingType = input.billing_type ?? "UNDEFINED";
  if (!ALLOWED_BILLING_TYPES.includes(billingType)) {
    return jsonResponse(req, {
      error:
        "Forma de pagamento inválida. A assinatura aceita Pix, boleto ou cartão.",
    }, 400);
  }

  // ── Multa: percentual (histórico) ou valor fixo em R$ ──────────────────────
  // Validado AQUI no servidor, não só na tela: a tela esconde o campo errado,
  // mas quem chama a edge direto continua podendo mandar qualquer coisa.
  const fineType: FineType = input.fine_type ?? "PERCENTAGE";
  if (!ALLOWED_FINE_TYPES.includes(fineType)) {
    return jsonResponse(req, {
      error: "Tipo de multa inválido. Use porcentagem ou valor em reais.",
    }, 400);
  }
  if (input.fine_value !== undefined) {
    const rawFineValue = Number(input.fine_value);
    if (!Number.isFinite(rawFineValue) || rawFineValue < 0) {
      return jsonResponse(req, {
        error: "Informe um valor válido para a multa.",
      }, 400);
    }
    // Multa maior que a própria cobrança do ciclo é sempre erro de digitação (e
    // não é permitida como multa moratória no Brasil). Recusar aqui é muito mais
    // barato que descobrir depois, com a assinatura já viva na Asaas cobrando
    // isso TODO MÊS.
    if (fineType === "FIXED" && rawFineValue > subValue) {
      return jsonResponse(req, {
        error: "A multa em reais não pode ser maior que o valor da assinatura.",
      }, 400);
    }
  }

  const isCreditCard = billingType === "CREDIT_CARD";

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

  const maxPaymentsCheck = validateMaxPayments(input.max_payments);
  if (!maxPaymentsCheck.ok) {
    return jsonResponse(req, { error: maxPaymentsCheck.error }, 400);
  }
  const maxPayments = maxPaymentsCheck.value;

  const inputDescription =
    typeof input.description === "string" && input.description.trim()
      ? input.description.trim().slice(0, 500)
      : null;

  // Categoria escolhida nesta assinatura (opcional). Ausente → NULL na coluna,
  // que significa "usa o default_income_category da conta" (lido no momento em
  // que cada cobrança é materializada, no webhook).
  const inputCategory =
    typeof input.category === "string" && input.category.trim()
      ? input.category.trim().slice(0, 120)
      : null;

  // Centro de custo escolhido nesta assinatura (opcional). Ausente → NULL na
  // coluna, que significa "sem centro de custo" (não existe default de conta
  // pra centro, ao contrário de categoria).
  const inputCostCenterId =
    typeof input.cost_center_id === "string" && input.cost_center_id.trim()
      ? input.cost_center_id.trim()
      : null;

  const sourceType =
    input.source_type === "contract" || input.source_type === "quote"
      ? input.source_type
      : "avulso";
  const sourceId = typeof input.source_id === "string" && input.source_id.trim()
    ? input.source_id.trim()
    : null;

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
      console.error(
        "[create-subscription] guard contract falhou:",
        guardErr.message,
      );
      return jsonResponse(req, {
        error:
          "Não foi possível verificar o faturamento deste contrato. Tente novamente em instantes.",
      }, 500);
    }
    if (existingLive) {
      return jsonResponse(req, {
        error:
          "Este contrato já tem um faturamento recorrente ativo. Cancele o atual antes de criar outro.",
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
        error:
          "Ative o recebimento de pagamentos em Configurações → Integrações antes de criar assinaturas.",
      }, 400);
    }

    // GATE do cartão recorrente (feature dormente): só quando a conta está habilitada.
    if (isCreditCard && account.card_recurring_enabled !== true) {
      return jsonResponse(req, {
        error:
          "O pagamento recorrente no cartão ainda não está habilitado para a sua conta. Fale com o suporte.",
      }, 400);
    }
    const apiKey = await vaultReadSecret(supabase, account.vault_secret_name);
    if (!apiKey) {
      return jsonResponse(req, {
        error:
          "A chave da Asaas não foi encontrada. Reative a integração em Configurações → Integrações.",
      }, 400);
    }
    const asaas = asaasFor(apiKey);

    // GATE REAL (conta Asaas): cartão recorrente só funciona se a conta do tenant
    // tiver o recurso liberado no Asaas. Tentamos um PRE-CHECK proativo e barato
    // via GET /myAccount/status (documentado) pra pegar o caso claro de "conta ainda
    // não pode receber" ANTES de mandar o cartão — evita lixo no Asaas. Só bloqueia
    // aqui quando a negativa é INEQUÍVOCA; o gate confiável de fato é a classificação
    // da negativa do POST (abaixo), porque o /myAccount/status NÃO expõe um booleano
    // estável de "cartão recorrente habilitado".
    if (isCreditCard) {
      try {
        const acctStatus = await asaas.get<any>("/myAccount/status");
        const canReceive = acctStatus?.canReceivePayments ??
          acctStatus?.general ??
          null;
        if (canReceive === false) {
          return jsonResponse(req, methodNotEnabledBody("credit_card"), 409);
        }
      } catch {
        // Pre-check não-fatal (endpoint ausente/variação de shape): seguimos e
        // deixamos a classificação da negativa do POST decidir.
      }
    }

    // 2) Assinaturas diretas precisam do customer id da Asaas. O checkout
    // hospedado não aceita esse id no DTO documentado: nele usamos somente
    // customerData e deixamos a própria página da Asaas completar os dados.
    const asaasCustomerId = isCreditCard ? null : await ensureAsaasCustomer(
      supabase,
      asaas,
      companyId,
      input.customer_id,
    );

    // --- Config efetiva (override do corpo → default da conta → fallback) ---
    const nextDueDate = rawDueDate ??
      dueDateFromDays(Number(account.default_due_days ?? 0));

    const accountDescription =
      typeof account.default_description === "string" &&
        account.default_description.trim()
        ? account.default_description.trim().slice(0, 500)
        : null;
    const description = inputDescription ?? accountDescription;

    // Configuração efetiva (override da assinatura ou default da conta). O schema
    // novo persiste fine_type/fine_value, então multa fixa não é mais perdida nem
    // reinterpretada como percentual na edição.
    const interestOverride = toPositivePercent(input.interest_percent);

    // Em FIXED a multa é o valor em reais, SEM fallback pro default da conta
    // (que é percentual). Vazio em FIXED = sem multa.
    const fineValue = fineType === "FIXED"
      ? toPositiveAmount(input.fine_value) ?? 0
      : toPositivePercent(input.fine_percent ?? account.default_fine_percent) ??
        0;
    const rawInterest = interestOverride ??
      toPositivePercent(account.default_interest_percent);
    const interestValue = rawInterest !== null
      ? Math.min(rawInterest, ASAAS_MAX_INTEREST_PERCENT)
      : 0;

    // CARTÃO: checkout hospedado Asaas. O Dominex não recebe nem encaminha PAN,
    // validade ou CVV. O checkout cria a assinatura somente depois de o pagador
    // concluir o formulário hospedado; até lá nosso espelho fica pending.
    if (isCreditCard) {
      const { data: checkoutCustomer, error: checkoutCustomerErr } =
        await supabase
          .from("customers")
          .select(
            "name, document, email, phone, celular, address, address_number, complement, neighborhood, zip_code",
          )
          .eq("id", input.customer_id)
          .eq("company_id", companyId)
          .maybeSingle();
      if (checkoutCustomerErr || !checkoutCustomer) {
        return jsonResponse(req, {
          error: "Cliente não encontrado na sua empresa.",
        }, 404);
      }
      const checkoutDocument = unmaskDoc(
        String(checkoutCustomer.document ?? ""),
      );
      if (!checkoutDocument) {
        return jsonResponse(req, {
          error: `O cliente "${
            checkoutCustomer.name ?? "selecionado"
          }" não tem CPF/CNPJ cadastrado. Cadastre o documento antes de criar o checkout.`,
        }, 400);
      }
      if (!isValidDocument(checkoutDocument)) {
        return jsonResponse(req, {
          error: `O CPF/CNPJ do cliente "${
            checkoutCustomer.name ?? "selecionado"
          }" é inválido. Corrija o cadastro antes de criar o checkout.`,
        }, 400);
      }
      const localSubscriptionId = crypto.randomUUID();
      const publicShortCode = generateShortCode();
      const minutesToExpire = 24 * 60;
      const checkoutExpiresAt = new Date(Date.now() + minutesToExpire * 60_000)
        .toISOString();
      const pendingRow = {
        id: localSubscriptionId,
        company_id: companyId,
        customer_id: input.customer_id,
        asaas_subscription_id: null,
        source_type: sourceType,
        source_id: sourceId,
        cycle,
        value: subValue,
        billing_type: "CREDIT_CARD",
        next_due_date: nextDueDate,
        status: "pending",
        fine_percent: fineType === "PERCENTAGE" ? fineValue : null,
        fine_type: fineType,
        fine_value: fineValue,
        interest_percent: interestValue,
        max_payments: maxPayments,
        description,
        category: inputCategory,
        cost_center_id: inputCostCenterId,
        public_short_code: publicShortCode,
        gateway_correlation_ref: localSubscriptionId,
        checkout_status: "CREATING",
        checkout_expires_at: checkoutExpiresAt,
        created_by: userId,
      };
      const { error: pendingErr } = await supabase
        .from("tenant_subscriptions")
        .insert(pendingRow);
      if (pendingErr) {
        console.error("[create-subscription] preinsert do checkout falhou", {
          company_id: companyId,
          error: pendingErr.message,
        });
        return jsonResponse(req, {
          error:
            "Não foi possível preparar o checkout seguro. Tente novamente em instantes.",
        }, pendingErr.code === "23505" ? 409 : 500);
      }

      const tombstonePending = async (reason: string) => {
        const now = new Date().toISOString();
        const { error } = await supabase
          .from("tenant_subscriptions")
          .update({
            status: "cancelled",
            checkout_status: reason,
            deleted_at: now,
            deleted_by: userId,
            archived_at: now,
            updated_at: now,
          })
          .eq("id", localSubscriptionId)
          .eq("company_id", companyId)
          .is("deleted_at", null);
        if (error) {
          console.error("[create-subscription] cleanup do pending falhou", {
            subscription_id: localSubscriptionId,
            error: error.message,
          });
        }
      };

      let checkout: any;
      try {
        checkout = await asaas.post<any>("/checkouts", {
          billingTypes: ["CREDIT_CARD"],
          chargeTypes: ["RECURRENT"],
          minutesToExpire,
          externalReference: localSubscriptionId,
          customerData: {
            name: checkoutCustomer.name,
            cpfCnpj: checkoutDocument,
            email: checkoutCustomer.email ?? undefined,
            phone: checkoutCustomer.phone ?? checkoutCustomer.celular ??
              undefined,
            address: checkoutCustomer.address ?? undefined,
            addressNumber: checkoutCustomer.address_number ?? undefined,
            complement: checkoutCustomer.complement ?? undefined,
            province: checkoutCustomer.neighborhood ?? undefined,
            postalCode: checkoutCustomer.zip_code ?? undefined,
          },
          items: [{
            name: (description ?? "Assinatura recorrente").substring(0, 50),
            description: description ?? undefined,
            quantity: 1,
            value: subValue,
          }],
          subscription: {
            cycle,
            nextDueDate,
            ...(maxPayments !== null
              ? {
                endDate: subscriptionEndDate(nextDueDate, cycle, maxPayments),
              }
              : {}),
          },
        });
      } catch (postErr) {
        const definitiveFailure = postErr instanceof AsaasApiError &&
          postErr.status >= 400 && postErr.status < 500;
        if (definitiveFailure) {
          await tombstonePending("CREATE_FAILED");
        } else {
          await supabase
            .from("tenant_subscriptions")
            .update({
              checkout_status: "CREATE_UNKNOWN",
              updated_at: new Date().toISOString(),
            })
            .eq("id", localSubscriptionId)
            .eq("company_id", companyId);
        }
        if (isMethodNotEnabledError(postErr, "credit_card")) {
          return jsonResponse(req, methodNotEnabledBody("credit_card"), 409);
        }
        throw postErr;
      }

      const checkoutId = typeof checkout?.id === "string" ? checkout.id : null;
      const checkoutUrl = normalizeAsaasCheckoutUrl(
        checkout?.url ?? checkout?.checkoutUrl ?? checkout?.link,
      );
      if (!checkoutId || !checkoutUrl) {
        console.error("[create-subscription] checkout Asaas sem id/url", {
          has_id: Boolean(checkoutId),
          has_url: Boolean(checkoutUrl),
          company_id: companyId,
        });
        let checkoutClosed = !checkoutId;
        if (checkoutId) {
          try {
            await asaas.delete(`/checkouts/${encodeURIComponent(checkoutId)}`);
            checkoutClosed = true;
          } catch {
            // Mantém a linha visível/correlacionável se o rollback remoto falhar.
            await supabase
              .from("tenant_subscriptions")
              .update({
                checkout_id: checkoutId,
                checkout_status: "INVALID_RESPONSE",
                updated_at: new Date().toISOString(),
              })
              .eq("id", localSubscriptionId)
              .eq("company_id", companyId);
          }
        }
        if (checkoutClosed) await tombstonePending("INVALID_RESPONSE");
        return jsonResponse(req, {
          error:
            "A Asaas não retornou o link seguro do cartão. Tente novamente em instantes.",
        }, 502);
      }

      const checkoutStatus = typeof checkout?.status === "string"
        ? checkout.status
        : "PENDING";
      const { data: saved, error: updateErr } = await supabase
        .from("tenant_subscriptions")
        .update({
          checkout_id: checkoutId,
          checkout_status: checkoutStatus,
          checkout_url: checkoutUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", localSubscriptionId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .select(
          "id, status, next_due_date, value, cycle, billing_type, checkout_status",
        )
        .maybeSingle();
      if (updateErr || !saved?.id) {
        console.error(
          "[create-subscription] checkout criado, atualização local falhou",
          {
            checkout_id: checkoutId,
            subscription_id: localSubscriptionId,
            company_id: companyId,
            error: updateErr?.message ?? "sem linha",
          },
        );
        return jsonResponse(req, {
          error:
            "O link foi criado na Asaas e está em reconciliação. Atualize a tela em instantes.",
        }, 500);
      }

      return jsonResponse(req, {
        subscription: {
          id: saved.id,
          asaas_subscription_id: null,
          status: saved.status ?? "pending",
          next_due_date: saved.next_due_date ?? nextDueDate,
          value: saved.value ?? subValue,
          cycle: saved.cycle ?? cycle,
          billing_type: "CREDIT_CARD",
          checkout_status: saved.checkout_status ?? "PENDING",
        },
        checkout_url: checkoutUrl,
        checkout_kind: "asaas",
      }, 200);
    }

    // 3) Cria a assinatura no Asaas. externalReference = company_id (resolução multi-tenant).
    // No cartão, a negativa "recurso não habilitado na conta" é capturada e convertida
    // numa resposta ESTRUTURADA (409 + code/method) — SEM persistir nada quebrado.
    let subscription: any;
    try {
      subscription = await asaas.post<any>("/subscriptions", {
        customer: asaasCustomerId as string,
        billingType,
        value: subValue,
        nextDueDate,
        cycle,
        description: description ?? undefined,
        externalReference: companyId,
        ...(fineValue > 0
          ? { fine: { value: fineValue, type: fineType } }
          : {}),
        ...(interestValue > 0
          ? { interest: { value: interestValue, type: "PERCENTAGE" } }
          : {}),
        // Ausente = contínua (sem maxPayments a Asaas nunca para sozinha).
        ...(maxPayments !== null ? { maxPayments } : {}),
      });
    } catch (postErr) {
      if (isCreditCard && isMethodNotEnabledError(postErr, "credit_card")) {
        // Nada foi persistido (a assinatura nem chegou a ser criada no Asaas).
        return jsonResponse(req, methodNotEnabledBody("credit_card"), 409);
      }
      throw postErr; // erro normal (valor inválido, cartão recusado, etc.) → catch de topo.
    }
    const asaasSubscriptionId: string | undefined = subscription?.id;
    if (!asaasSubscriptionId) {
      return jsonResponse(req, {
        error: "A Asaas não retornou a assinatura. Tente novamente.",
      }, 502);
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
      fine_percent: fineType === "PERCENTAGE" ? fineValue : null,
      fine_type: fineType,
      fine_value: fineValue,
      interest_percent: interestValue,
      max_payments: maxPayments,
      description,
      category: inputCategory,
      cost_center_id: inputCostCenterId,
      created_by: userId,
    };
    const { data: saved, error: insertErr } = await supabase
      .from("tenant_subscriptions")
      .upsert(subRow, { onConflict: "asaas_subscription_id" })
      .select(
        "id, asaas_subscription_id, status, next_due_date, value, cycle, billing_type",
      )
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
        warning:
          "A assinatura foi criada na Asaas, mas não conseguimos registrá-la no sistema. Ela continuará gerando cobranças normalmente.",
        subscription: {
          id: null,
          asaas_subscription_id: asaasSubscriptionId,
          status: "active",
          next_due_date: nextDueDate,
          value: subValue,
          cycle,
          billing_type: billingType,
        },
        checkout_url: null,
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
      checkout_url: null,
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

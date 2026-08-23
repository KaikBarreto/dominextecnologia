// tenant-asaas-pix-auto-authorize
// --------------------------------
// PRIVILEGIADA (Bearer + módulo 'cobrancas' + can_manage_system). Cria uma
// AUTORIZAÇÃO de Pix Automático (consentimento de débito recorrente via Pix) na
// conta Asaas DO TENANT (chave BYO lida do Vault). O cliente final aprova UMA vez
// (no app do banco dele, via QR/copia-e-cola/link) e passa a ser debitado
// automaticamente a cada ciclo — tipo débito automático por Pix.
//
// DORMENTE atrás do flag tenant_payment_accounts.pix_auto_enabled (default false):
// enquanto false, retorna 400 PT-BR e não toca a Asaas. Ativação depende de o
// tenant ter Pix Automático habilitado na conta Asaas + revisão do texto de
// consentimento (LGPD) — ver RESSALVA no relatório.
//
// company_id vem do profile (payments-auth), NUNCA do payload (anti-cross-tenant).
//
// Fluxo:
//   1. GATE do flag pix_auto_enabled (fail-closed);
//   2. conta ativa + chave BYO do Vault (via tenant_payment_accounts.vault_secret_name);
//   3. guard anti-double-billing por contrato (source_type='contract'), igual assinatura;
//   4. garante o asaas_customer_id do cliente final (dedupe por externalReference);
//   5. POST /v3/pix/automatic/authorizations com o consentimento recorrente
//      (frequency/startDate/value/customerId/contractId + immediateQrCode);
//   6. grava tenant_subscriptions (billing_type='PIX_AUTO', status='pending',
//      pix_auto_authorization_id, pix_auto_status='pending').
//
// A ativação da recorrência e os débitos de cada ciclo chegam via webhook
// (tenant-asaas-webhook): a autorização vira pix_auto_status='authorized' +
// status='active', e cada débito recorrente (PAYMENT_* com payment.subscription =
// aut_*) é materializado em tenant_charges + recebível — mesmo caminho da assinatura.
//
// Retorna { authorization: { id, qr_code, copy_paste, status } } (allowlist).
// Nunca retorna custo/margem interna. Nunca loga a chave.

import { handleCors } from "../_shared/cors.ts";
import {
  authorizePaymentsManager,
  jsonResponse,
  vaultReadSecret,
} from "../_shared/payments-auth.ts";
import {
  asaasFor,
  AsaasApiError,
  isMethodNotEnabledError,
  methodNotEnabledBody,
} from "../_shared/asaas-tenant-client.ts";
import { isValidDocument, unmaskDoc } from "../_shared/document-validation.ts";

/**
 * Ciclos aceitos pela nossa entrada (vocabulário do CHECK de tenant_subscriptions).
 * O Pix Automático da Asaas aceita frequências próprias (WEEKLY/MONTHLY/QUARTERLY/
 * SEMIANNUALLY/ANNUALLY): mapeamos o ciclo interno pra frequency do endpoint.
 * TODO(asaas-shape): confirmar o vocabulário EXATO de `frequency` aceito pelo
 * endpoint /pix/automatic/authorizations (a doc lista o conjunto por versão).
 */
type Cycle = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY";
const ALLOWED_CYCLES: readonly Cycle[] = [
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "SEMIANNUALLY",
  "YEARLY",
];

/**
 * Mapeia o ciclo interno pra `frequency` do Pix Automático Asaas.
 * TODO(asaas-shape): BIWEEKLY não tem equivalente óbvio no Pix Automático —
 * caímos em MONTHLY como aproximação segura; confirmar antes de habilitar em
 * produção (o gate pix_auto_enabled protege até lá).
 */
function cycleToPixAutoFrequency(cycle: Cycle): string {
  switch (cycle) {
    case "WEEKLY":
      return "WEEKLY";
    case "BIWEEKLY":
      return "MONTHLY"; // TODO(asaas-shape): confirmar suporte a quinzenal
    case "MONTHLY":
      return "MONTHLY";
    case "QUARTERLY":
      return "QUARTERLY";
    case "SEMIANNUALLY":
      return "SEMIANNUALLY";
    case "YEARLY":
      return "ANNUALLY"; // Asaas usa ANNUALLY (ver create-asaas-payment do SaaS)
    default:
      return "MONTHLY";
  }
}

/** Valor mínimo aceito pela Asaas por cobrança (R$ 5,00). */
const MIN_VALUE = 5;

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

interface PixAutoAuthorizeInput {
  customer_id?: string;
  value?: number;
  cycle?: Cycle;
  next_due_date?: string;
  description?: string;
  source_type?: "avulso" | "contract" | "quote";
  source_id?: string;
}

/**
 * Garante o asaas_customer_id do cliente final. Mesma lógica do create-subscription:
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
      `O cliente "${customer.name ?? "selecionado"}" não tem CPF/CNPJ cadastrado. Cadastre o documento antes de criar a autorização de Pix Automático.`,
      400,
    );
  }
  if (!isValidDocument(doc)) {
    throw new AsaasApiError(
      `O CPF/CNPJ do cliente "${customer.name ?? "selecionado"}" é inválido. Corrija o cadastro antes de criar a autorização.`,
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
    console.error("[pix-auto-authorize] exceção não tratada no topo:", (e as Error)?.message ?? e);
    return jsonResponse(req, {
      error: "Ocorreu um erro ao criar a autorização de Pix Automático. Tente novamente em instantes.",
    }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await authorizePaymentsManager(req);
  if (!auth.ok) return auth.response;
  const { supabase, userId, companyId } = auth;

  let input: PixAutoAuthorizeInput;
  try {
    input = await req.json();
  } catch {
    return jsonResponse(req, { error: "Requisição inválida." }, 400);
  }

  // ---- Validações de entrada
  if (!input.customer_id || typeof input.customer_id !== "string") {
    return jsonResponse(req, { error: "Selecione o cliente do Pix Automático." }, 400);
  }
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    return jsonResponse(req, { error: "Informe um valor válido para o Pix Automático." }, 400);
  }
  if (value < MIN_VALUE) {
    return jsonResponse(req, {
      error: `O valor mínimo de uma cobrança é R$ ${MIN_VALUE.toFixed(2).replace(".", ",")}.`,
    }, 400);
  }
  const subValue = Math.round(value * 100) / 100;

  const cycle = (input.cycle ?? "MONTHLY") as Cycle;
  if (!ALLOWED_CYCLES.includes(cycle)) {
    return jsonResponse(req, {
      error: "Frequência de cobrança inválida. Escolha semanal, mensal, trimestral, semestral ou anual.",
    }, 400);
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

  try {
    // 1) Conta ativa + chave do Vault + defaults + FLAG pix_auto_enabled.
    const { data: accountData } = await supabase
      .from("tenant_payment_accounts")
      .select(
        "status, vault_secret_name, pix_auto_enabled, " +
          "default_due_days, default_description",
      )
      .eq("company_id", companyId)
      .maybeSingle();
    const account = accountData as any;

    // GATE do flag (fail-closed): Pix Automático dormente até habilitação por conta.
    if (!account || account.pix_auto_enabled !== true) {
      return jsonResponse(req, {
        error: "O Pix Automático ainda não está habilitado para a sua conta.",
      }, 400);
    }

    if (account.status !== "active" || !account.vault_secret_name) {
      return jsonResponse(req, {
        error: "Ative o recebimento de pagamentos em Configurações → Integrações antes de usar o Pix Automático.",
      }, 400);
    }

    // GUARD anti-double-billing (só ramo 'contract'): um contrato não pode ter DUAS
    // recorrências vivas (assinatura OU Pix Automático). "Viva" = status != 'cancelled'.
    // Roda ANTES de tocar o Asaas — não criamos autorização lá pra depois achar duplicata.
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
        console.error("[pix-auto-authorize] guard contract falhou:", guardErr.message);
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

    const apiKey = await vaultReadSecret(supabase, account.vault_secret_name);
    if (!apiKey) {
      return jsonResponse(req, {
        error: "A chave da Asaas não foi encontrada. Reative a integração em Configurações → Integrações.",
      }, 400);
    }
    const asaas = asaasFor(apiKey);

    // GATE REAL (conta Asaas): Pix Automático só funciona se a conta do tenant tiver
    // o recurso liberado no Asaas. PRE-CHECK proativo e barato via GET /myAccount/status
    // (documentado) pra pegar o caso claro de "conta ainda não pode receber" ANTES de
    // criar a autorização — evita lixo no Asaas. O /myAccount/status NÃO expõe um
    // booleano estável de "Pix Automático habilitado", então o gate confiável de fato
    // é a classificação da negativa do POST (abaixo).
    try {
      const acctStatus = await asaas.get<any>("/myAccount/status");
      const canReceive =
        acctStatus?.canReceivePayments ??
        acctStatus?.general ??
        null;
      if (canReceive === false) {
        return jsonResponse(req, methodNotEnabledBody("pix_auto"), 409);
      }
    } catch {
      // Pre-check não-fatal (endpoint ausente/variação de shape): seguimos e deixamos
      // a classificação da negativa do POST decidir.
    }

    // 2) Cliente final no Asaas.
    const asaasCustomerId = await ensureAsaasCustomer(supabase, asaas, companyId, input.customer_id);

    // --- Config efetiva ---
    const startDate = rawDueDate ?? dueDateFromDays(Number(account.default_due_days ?? 0));
    const accountDescription =
      typeof account.default_description === "string" && account.default_description.trim()
        ? account.default_description.trim().slice(0, 500)
        : null;
    const description = inputDescription ?? accountDescription;
    const frequency = cycleToPixAutoFrequency(cycle);

    // contractId: identificador do consentimento recorrente (limite Asaas ~35 chars).
    // Espelha o create-asaas-payment do SaaS.
    const contractId = `DMX-${companyId.substring(0, 8)}-${Date.now().toString(36)}`.substring(0, 35);

    // 3) Cria a AUTORIZAÇÃO de Pix Automático no Asaas.
    // externalReference = company_id (resolução multi-tenant no webhook).
    //
    // TODO(asaas-shape): confirmar o SHAPE EXATO do endpoint e do corpo do
    // /pix/automatic/authorizations na versão atual da API (campos: frequency,
    // contractId, startDate, customerId, value, description, immediateQrCode).
    // O SaaS (create-asaas-payment) usa `customerId` + `immediateQrCode`; a
    // resposta traz `id` (aut_*), `encodedImage` (QR base64), `payload`
    // (copia-e-cola) e `status`. Confirmar campos opcionais antes de habilitar.
    // A negativa "Pix Automático não habilitado na conta" é capturada e convertida
    // numa resposta ESTRUTURADA (409 + code/method) — SEM persistir nada quebrado.
    let authorization: any;
    try {
      authorization = await asaas.post<any>("/pix/automatic/authorizations", {
        frequency,
        contractId,
        startDate,
        customerId: asaasCustomerId,
        value: subValue,
        description: (description ?? "Cobrança recorrente").substring(0, 35),
        externalReference: companyId,
        immediateQrCode: {
          expirationSeconds: 86400,
          originalValue: subValue,
        },
      });
    } catch (postErr) {
      if (isMethodNotEnabledError(postErr, "pix_auto")) {
        // Nada foi persistido (a autorização nem chegou a ser criada no Asaas).
        return jsonResponse(req, methodNotEnabledBody("pix_auto"), 409);
      }
      throw postErr; // erro normal → catch de topo.
    }

    const authorizationId: string | undefined = authorization?.id;
    if (!authorizationId) {
      return jsonResponse(req, {
        error: "A Asaas não retornou a autorização de Pix Automático. Tente novamente.",
      }, 502);
    }

    // Artefatos de consentimento (o cliente aprova no banco dele).
    // TODO(asaas-shape): confirmar os nomes exatos dos campos de QR/copia-e-cola
    // na resposta da autorização (encodedImage/payload são os do SaaS; algumas
    // versões aninham em `immediateQrCode`).
    const qrCode: string | null =
      authorization?.encodedImage ??
      authorization?.immediateQrCode?.encodedImage ??
      null;
    const copyPaste: string | null =
      authorization?.payload ??
      authorization?.immediateQrCode?.payload ??
      null;
    const authStatus: string =
      typeof authorization?.status === "string" && authorization.status
        ? authorization.status
        : "PENDING";

    // 4) Grava tenant_subscriptions (billing_type='PIX_AUTO', status='pending',
    //    pix_auto_status='pending'). asaas_subscription_id fica NULL (o vínculo
    //    recorrente é pix_auto_authorization_id = aut_*; os PAYMENT_* de cada ciclo
    //    chegam com payment.subscription = aut_*). Ativação vem pelo webhook.
    const subRow = {
      company_id: companyId,
      customer_id: input.customer_id,
      asaas_subscription_id: null,
      source_type: sourceType,
      source_id: sourceId,
      cycle,
      value: subValue,
      billing_type: "PIX_AUTO",
      next_due_date: startDate,
      status: "pending",
      pix_auto_authorization_id: authorizationId,
      pix_auto_status: "pending",
      description,
      created_by: userId,
    };
    const { data: saved, error: insertErr } = await supabase
      .from("tenant_subscriptions")
      .insert(subRow)
      .select("id, pix_auto_authorization_id, pix_auto_status, status, next_due_date, value, cycle")
      .maybeSingle();

    if (insertErr) {
      // Autorização órfã: existe no Asaas mas não gravou aqui. Não perdemos o link —
      // o webhook reconcilia por pix_auto_authorization_id / externalReference.
      console.error(
        "[pix-auto-authorize] insert tenant_subscriptions falhou (autorização órfã no Asaas):",
        JSON.stringify({
          pix_auto_authorization_id: authorizationId,
          company_id: companyId,
          error: insertErr.message,
        }),
      );
      return jsonResponse(req, {
        warning: "A autorização de Pix Automático foi criada na Asaas, mas não conseguimos registrá-la no sistema. O consentimento continua válido.",
        authorization: {
          id: authorizationId,
          qr_code: qrCode,
          copy_paste: copyPaste,
          status: authStatus,
        },
      }, 207);
    }

    return jsonResponse(req, {
      authorization: {
        id: authorizationId,
        qr_code: qrCode,
        copy_paste: copyPaste,
        status: authStatus,
      },
    }, 200);
  } catch (e) {
    const status = e instanceof AsaasApiError ? e.status : 500;
    console.error("[pix-auto-authorize] erro:", (e as Error).message);
    return jsonResponse(req, {
      error: e instanceof AsaasApiError
        ? (e.message || "Falha ao criar a autorização de Pix Automático na Asaas.")
        : "Ocorreu um erro ao criar a autorização de Pix Automático. Tente novamente.",
    }, status >= 400 && status < 600 ? status : 500);
  }
}

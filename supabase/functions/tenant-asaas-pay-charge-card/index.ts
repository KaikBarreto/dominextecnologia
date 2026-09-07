// tenant-asaas-pay-charge-card
// ----------------------------
// PÚBLICA (anon-safe, verify_jwt = false). Paga COM CARTÃO DE CRÉDITO uma cobrança
// que JÁ EXISTE na conta Asaas do tenant, sem tirar o pagador da nossa marca
// (checkout próprio em /pagar/:code — o link hospedado da Asaas vira só fallback).
//
// GATE = `public_short_code` válido (mesmo gate do get-tenant-payment-checkout).
// Não há sessão: quem tem o link paga. O link é o segredo (12 chars base32 ≈ 60 bits).
//
// ─────────────────────────────────────────────────────────────────────────────
// SEGURANÇA — regras inegociáveis desta função
//   1. PAN / CCV / validade NUNCA são persistidos (nenhum INSERT/UPDATE carrega
//      dado de cartão) e NUNCA vão pra log. Os `console.*` daqui só imprimem
//      short_code, status e código de erro. Não existe `console.log(body)`.
//   2. O VALOR nunca vem do client. Quem define quanto é cobrado é a própria
//      cobrança já criada na Asaas (payWithCreditCard não aceita valor). O corpo
//      só transporta cartão + titular.
//   3. company_id / chave Asaas saem do short_code no SERVIDOR (nunca do payload)
//      — white-label e posse não vazam entre tenants.
//   4. A resposta é ALLOWLIST: { status, message }. Nada de id da Asaas, chave,
//      netValue, nem a mensagem crua do gateway (é normalizada antes de sair).
//   5. Não escrevemos `status`/`payment_date` em tenant_charges: a baixa é do
//      webhook (`tenant-asaas-webhook` → apply_tenant_charge_payment, idempotente).
//      Gravar "pago" aqui criaria Pago-falso sem lançamento financeiro (incidente
//      CLIMATIZE no billing SaaS). A tela confirma por polling do estado real.
//
// ANTI DUPLO-PAGAMENTO / ANTI ORÁCULO DE CARTÃO
//   a) Single-flight DURÁVEL e cross-isolate: UPDATE condicional em
//      tenant_charges.updated_at (só passa se a linha não foi tocada nos últimos
//      SINGLE_FLIGHT_SECONDS). É atômico no Postgres — dois cliques simultâneos,
//      em isolates diferentes, só deixam UM seguir. Sem coluna nova.
//   b) Pré-checagem AUTORITATIVA no Asaas (GET /payments/{id}) antes de cobrar:
//      cobrança já paga / cancelada / removida / estornada nunca é re-cobrada.
//      A doc da Asaas é explícita: "não trate payWithCreditCard como idempotente"
//      — por isso consultamos o estado atual antes de cada tentativa.
//   c) Rate limit em memória por short_code e por IP (janela deslizante), como
//      camada extra. MEDIDO EM PRODUÇÃO (9 requests seguidas, contador nunca
//      acumulou): o Supabase serve cada request num isolate diferente, então
//      trate isso como bônus, NUNCA como proteção.
//
//   LIMITE CONHECIDO (documentado de propósito): a proteção durável é a janela
//   fixa de (a) — ~1 tentativa a cada SINGLE_FLIGHT_SECONDS por cobrança. NÃO dá
//   pra escalar a punição por recusa sem schema novo: `tenant_charges` tem um
//   trigger BEFORE UPDATE (`update_updated_at_column`) que sobrescreve qualquer
//   updated_at que a gente escreva com now() — qualquer "penalidade" gravada ali
//   seria no-op calado. O freio escalonado depende de tabela nova
//   (`tenant_charge_payment_attempts`, contrato no relatório da entrega, com o
//   dev-database) e não é feito aqui.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { vaultReadSecret } from "../_shared/payments-auth.ts";
import { asaasFor, AsaasApiError } from "../_shared/asaas-tenant-client.ts";
import { isValidDocument, unmaskDoc } from "../_shared/document-validation.ts";

// ── Parâmetros de proteção ───────────────────────────────────────────────────
/** Janela do single-flight durável (segundos) — 2 cliques dentro dela: só o 1º passa. */
// 20s: segura duplo-clique e afunila teste de cartão (3 tentativas/min por
// cobrança) sem punir quem erra a DIGITAÇÃO — erro de formato é barrado na
// validação, ANTES do lock, e não gasta a janela.
const SINGLE_FLIGHT_SECONDS = 20;
/** Tentativas máximas por short_code na janela (memória do isolate). */
const MAX_ATTEMPTS_PER_CODE = 5;
/** Tentativas máximas por IP na janela (memória do isolate). */
const MAX_ATTEMPTS_PER_IP = 12;
/** Janela deslizante do rate limit em memória (ms). */
const RATE_WINDOW_MS = 10 * 60 * 1000;

// ── Estados da cobrança ──────────────────────────────────────────────────────
/** Status Asaas que significam "dinheiro já entrou" (não re-cobrar NUNCA). */
const PAID_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
/** Status Asaas em que a cobrança AINDA pode ser paga. */
const PAYABLE_STATUSES = new Set(["PENDING", "OVERDUE"]);
/** Status locais/Asaas que encerram a cobrança (não dá pra pagar). */
const DEAD_STATUSES = new Set([
  "CANCELLED", "CANCELED", "DELETED", "REFUNDED", "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS", "CHARGEBACK", "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL",
]);

/** Resultado normalizado devolvido ao checkout (nunca o status cru da Asaas). */
type PayStatus = "approved" | "processing" | "already_paid" | "declined" | "not_payable";

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      // Resposta de pagamento NUNCA pode ser cacheada por proxy/browser.
      "Cache-Control": "private, no-store",
    },
  });
}

// ── Rate limit em memória (por isolate) ──────────────────────────────────────
const attemptLog = new Map<string, number[]>();

/** Registra e avalia uma tentativa. Retorna true quando ESTOUROU o limite. */
function hitRateLimit(key: string, max: number, now: number): boolean {
  const list = (attemptLog.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  attemptLog.set(key, list);
  // Poda preguiçosa pra o Map não crescer sem limite no isolate.
  if (attemptLog.size > 500) {
    for (const [k, v] of attemptLog) {
      if (v.length === 0 || now - v[v.length - 1] > RATE_WINDOW_MS) attemptLog.delete(k);
    }
  }
  return list.length > max;
}

/** IP do pagador (best-effort) só pra rate limit — não é persistido. */
function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return (fwd.split(",")[0] || req.headers.get("cf-connecting-ip") || "sem-ip").trim();
}

// ── Validação dos dados do cartão (formato apenas; nada é logado) ────────────
const onlyDigits = (v: unknown): string => String(v ?? "").replace(/\D/g, "");
const asText = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Luhn — evita gastar chamada na Asaas com número digitado errado. */
function luhnOk(pan: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = pan.length - 1; i >= 0; i--) {
    let d = pan.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Normaliza o ano pra 4 dígitos (o form manda 2). Asaas espera 4. */
function normalizeExpiryYear(raw: string): string {
  const d = onlyDigits(raw);
  if (d.length === 4) return d;
  if (d.length === 2) return `20${d}`;
  return "";
}

interface CardInput {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}
interface HolderInput {
  name: string;
  email: string;
  cpfCnpj: string;
  phone: string;
  postalCode: string;
  addressNumber: string;
  addressComplement?: string;
}

/**
 * Extrai e valida cartão + titular do corpo. Retorna erro PT-BR curto (que o
 * front usa pra abrir a seção certa do formulário) ou os dados normalizados.
 * IMPORTANTE: nenhum valor daqui vai pra log ou pro banco.
 */
function parseCardPayload(
  body: Record<string, unknown>,
): { ok: true; card: CardInput; holder: HolderInput } | { ok: false; error: string } {
  const rawCard = (body.card ?? {}) as Record<string, unknown>;
  const rawHolder = (body.holder ?? {}) as Record<string, unknown>;

  const pan = onlyDigits(rawCard.number);
  if (pan.length < 13 || pan.length > 19 || !luhnOk(pan)) {
    return { ok: false, error: "Número do cartão inválido. Confira os dados do cartão." };
  }

  const holderName = asText(rawCard.holder_name).slice(0, 100);
  if (holderName.length < 2) {
    return { ok: false, error: "Informe o nome impresso no cartão." };
  }

  const month = onlyDigits(rawCard.expiry_month).padStart(2, "0");
  const year = normalizeExpiryYear(String(rawCard.expiry_year ?? ""));
  const monthNum = Number(month);
  if (!year || monthNum < 1 || monthNum > 12) {
    return { ok: false, error: "Validade do cartão inválida. Confira mês e ano." };
  }
  const now = new Date();
  const expired =
    Number(year) < now.getUTCFullYear() ||
    (Number(year) === now.getUTCFullYear() && monthNum < now.getUTCMonth() + 1);
  if (expired) {
    return { ok: false, error: "Cartão vencido. Use outro cartão." };
  }

  const ccv = onlyDigits(rawCard.ccv);
  if (ccv.length < 3 || ccv.length > 4) {
    return { ok: false, error: "CVV inválido. Confira os dados do cartão." };
  }

  const doc = unmaskDoc(String(rawHolder.cpf_cnpj ?? ""));
  if (!isValidDocument(doc)) {
    return { ok: false, error: "CPF do titular inválido." };
  }

  const email = asText(rawHolder.email).slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, error: "E-mail do titular inválido." };
  }

  const phone = onlyDigits(rawHolder.phone);
  if (phone.length < 10 || phone.length > 11) {
    return { ok: false, error: "Telefone do titular inválido." };
  }

  const postalCode = onlyDigits(rawHolder.postal_code);
  if (postalCode.length !== 8) {
    return { ok: false, error: "CEP inválido. Confira o endereço de cobrança." };
  }

  const addressNumber = asText(rawHolder.address_number).slice(0, 20);
  if (!addressNumber) {
    return { ok: false, error: "Informe o número do endereço de cobrança." };
  }

  const holderFullName = asText(rawHolder.name).slice(0, 100) || holderName;

  return {
    ok: true,
    card: { holderName, number: pan, expiryMonth: month, expiryYear: year, ccv },
    holder: {
      name: holderFullName,
      email,
      cpfCnpj: doc,
      phone,
      postalCode,
      addressNumber,
      addressComplement: asText(rawHolder.address_complement).slice(0, 60) || undefined,
    },
  };
}

// ── Normalização da mensagem de erro da Asaas ────────────────────────────────
// NUNCA repassamos a `description` crua do gateway (pode carregar detalhe
// interno). Casamos padrões conhecidos e devolvemos COPY NOSSA em PT-BR — que
// já contém as palavras-chave que o `detectCardErrorSection` do front usa pra
// reabrir a seção certa do formulário.
function friendlyCardError(err: unknown): string {
  const GENERIC =
    "Não foi possível processar o pagamento com este cartão. Confira os dados ou tente outro cartão.";
  if (!(err instanceof AsaasApiError)) return GENERIC;

  const parts: string[] = [err.message ?? ""];
  const arr = err.asaasErrors;
  if (Array.isArray(arr)) {
    for (const e of arr) {
      const d = (e as { description?: unknown })?.description;
      if (typeof d === "string") parts.push(d);
    }
  }
  const text = parts
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  const has = (...needles: string[]) => needles.some((n) => text.includes(n));

  if (has("cep", "postal", "endereco")) {
    return "Não foi possível validar o endereço de cobrança. Confira o CEP e o número.";
  }
  if (has("cpf", "cnpj", "documento")) {
    return "CPF do titular não confere com o cartão. Confira os dados do titular.";
  }
  if (has("email", "e-mail")) {
    return "E-mail do titular inválido. Confira os dados do titular.";
  }
  if (has("telefone", "phone")) {
    return "Telefone do titular inválido. Confira os dados do titular.";
  }
  if (has("expirad", "vencid", "validade", "expiry")) {
    return "Cartão vencido ou com validade inválida. Confira os dados do cartão.";
  }
  if (has("ccv", "cvv", "codigo de seguranca", "security code")) {
    return "CVV do cartão inválido. Confira os dados do cartão.";
  }
  if (has("saldo", "limite", "insufficient", "fundos")) {
    return "Cartão sem limite disponível para esta compra. Use outro cartão.";
  }
  if (has("nao autorizad", "not authorized", "recusad", "denied", "declined", "invalid card", "cartao invalido")) {
    return "Pagamento não autorizado pelo banco emissor do cartão. Tente outro cartão ou pague com Pix.";
  }
  if (has("ja pag", "already", "nao pode ser paga", "status")) {
    return "Esta cobrança não está mais disponível para pagamento. Atualize a página.";
  }
  return GENERIC;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return json(req, { error: "Requisição inválida." }, 405);
  }

  // ---- corpo ---------------------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(req, { error: "Requisição inválida." }, 400);
  }

  const shortCode = asText(body.short_code).toLowerCase();
  // Mesma guarda barata do get-tenant-payment-checkout (base32 sem ambíguos).
  if (!/^[a-z2-9]{6,24}$/.test(shortCode)) {
    return json(req, { error: "Cobrança não encontrada." }, 404);
  }

  // ---- rate limit (camada de memória, antes de qualquer I/O) ---------------
  const now = Date.now();
  const ip = clientIp(req);
  if (hitRateLimit(`c:${shortCode}`, MAX_ATTEMPTS_PER_CODE, now) ||
      hitRateLimit(`i:${ip}`, MAX_ATTEMPTS_PER_IP, now)) {
    console.warn(`[pay-card] rate limit atingido (code=${shortCode})`);
    return json(req, {
      error: "Muitas tentativas de pagamento. Aguarde alguns minutos e tente novamente, ou pague com Pix.",
    }, 429);
  }

  const parsed = parseCardPayload(body);
  if (!parsed.ok) {
    return json(req, { error: parsed.error }, 400);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ---- 1) Cobrança pelo short_code (SELECT explícito; company_id vem daqui) --
    const { data: charge } = await supabase
      .from("tenant_charges")
      .select("id, company_id, asaas_payment_id, status, payment_date")
      .eq("public_short_code", shortCode)
      .maybeSingle();

    if (!charge) {
      return json(req, { error: "Cobrança não encontrada." }, 404);
    }

    const localStatus = String(charge.status ?? "").toUpperCase();
    if (charge.payment_date || PAID_STATUSES.has(localStatus)) {
      return json(req, {
        status: "already_paid" as PayStatus,
        message: "Esta cobrança já foi paga.",
      }, 200);
    }
    if (DEAD_STATUSES.has(localStatus)) {
      return json(req, {
        error: "Esta cobrança não está mais disponível para pagamento. Fale com quem a enviou.",
      }, 400);
    }
    if (!charge.asaas_payment_id) {
      return json(req, {
        error: "Esta cobrança não está disponível para pagamento com cartão.",
      }, 400);
    }

    // ---- 2) Single-flight DURÁVEL (atômico no Postgres, cross-isolate) -------
    // Só segue quem conseguir "marcar" a linha: UPDATE condicionado a
    // updated_at antigo. Dois cliques simultâneos → um único vencedor.
    const nowIso = new Date().toISOString();
    const cutoffIso = new Date(now - SINGLE_FLIGHT_SECONDS * 1000).toISOString();
    const { data: locked } = await supabase
      .from("tenant_charges")
      .update({ updated_at: nowIso })
      .eq("id", charge.id)
      .lt("updated_at", cutoffIso)
      .select("id");

    if (!locked || locked.length === 0) {
      return json(req, {
        error: "Já estamos processando uma tentativa desta cobrança. Aguarde alguns segundos antes de tentar de novo.",
      }, 429);
    }

    // ---- 3) Conta Asaas do tenant (chave BYO no Vault) ----------------------
    const { data: accountData } = await supabase
      .from("tenant_payment_accounts")
      .select("status, vault_secret_name, allow_card")
      .eq("company_id", charge.company_id)
      .maybeSingle();
    const account = accountData as
      | { status?: string; vault_secret_name?: string; allow_card?: boolean }
      | null;

    if (!account || account.status !== "active" || !account.vault_secret_name) {
      return json(req, {
        error: "O pagamento com cartão está indisponível nesta cobrança no momento.",
      }, 400);
    }
    // Preferência do tenant: cartão desligado → não processamos cartão aqui.
    if (account.allow_card === false) {
      return json(req, {
        error: "O pagamento com cartão não está habilitado para esta cobrança.",
      }, 400);
    }

    const apiKey = await vaultReadSecret(supabase, account.vault_secret_name);
    if (!apiKey) {
      return json(req, {
        error: "O pagamento com cartão está indisponível nesta cobrança no momento.",
      }, 400);
    }
    const asaas = asaasFor(apiKey);
    const paymentId = String(charge.asaas_payment_id);

    // ---- 4) Estado AUTORITATIVO na Asaas antes de cobrar --------------------
    // A doc diz explicitamente pra NÃO tratar payWithCreditCard como idempotente:
    // consultamos o estado atual pra nunca cobrar duas vezes a mesma cobrança.
    let remoteStatus = "";
    try {
      const remote = await asaas.get<{ status?: string }>(`/payments/${paymentId}`);
      remoteStatus = String(remote?.status ?? "").toUpperCase();
    } catch (e) {
      console.error(`[pay-card] falha ao consultar a cobrança (code=${shortCode}):`,
        e instanceof AsaasApiError ? `asaas ${e.status}` : "erro");
      return json(req, {
        error: "Não foi possível conferir a cobrança agora. Tente novamente em instantes.",
      }, 502);
    }

    if (PAID_STATUSES.has(remoteStatus)) {
      return json(req, {
        status: "already_paid" as PayStatus,
        message: "Esta cobrança já foi paga.",
      }, 200);
    }
    if (!PAYABLE_STATUSES.has(remoteStatus)) {
      return json(req, {
        status: "not_payable" as PayStatus,
        error: "Esta cobrança não está mais disponível para pagamento. Fale com quem a enviou.",
      }, 400);
    }

    // ---- 5) Pagamento -------------------------------------------------------
    // POST /v3/payments/{id}/payWithCreditCard — paga uma cobrança JÁ EXISTENTE.
    // O valor é o da própria cobrança (o endpoint não aceita valor nem parcelas),
    // então NADA do que o client mandou influencia quanto será cobrado.
    let result: { status?: string } | null = null;
    try {
      result = await asaas.post<{ status?: string }>(
        `/payments/${paymentId}/payWithCreditCard`,
        {
          creditCard: {
            holderName: parsed.card.holderName,
            number: parsed.card.number,
            expiryMonth: parsed.card.expiryMonth,
            expiryYear: parsed.card.expiryYear,
            ccv: parsed.card.ccv,
          },
          creditCardHolderInfo: {
            name: parsed.holder.name,
            email: parsed.holder.email,
            cpfCnpj: parsed.holder.cpfCnpj,
            postalCode: parsed.holder.postalCode,
            addressNumber: parsed.holder.addressNumber,
            ...(parsed.holder.addressComplement
              ? { addressComplement: parsed.holder.addressComplement }
              : {}),
            phone: parsed.holder.phone,
          },
        },
      );
    } catch (e) {
      // Log SEM dado de cartão: só short_code e o status HTTP da Asaas.
      console.error(`[pay-card] recusado (code=${shortCode}):`,
        e instanceof AsaasApiError ? `asaas ${e.status}` : "erro de rede");
      return json(req, { status: "declined" as PayStatus, error: friendlyCardError(e) }, 400);
    }

    const finalStatus = String(result?.status ?? "").toUpperCase();
    console.log(`[pay-card] tentativa concluída (code=${shortCode}, status=${finalStatus || "?"})`);

    // A BAIXA é do webhook (apply_tenant_charge_payment, idempotente por
    // asaas_payment_id). Aqui só devolvemos o resultado da tentativa — a tela
    // confirma o estado real por polling. Nunca gravamos "pago" por otimismo.
    if (PAID_STATUSES.has(finalStatus)) {
      return json(req, {
        status: "approved" as PayStatus,
        message: "Pagamento aprovado.",
      }, 200);
    }
    if (finalStatus === "AWAITING_RISK_ANALYSIS" || finalStatus === "PENDING") {
      return json(req, {
        status: "processing" as PayStatus,
        message: "Pagamento em análise pela operadora. Você receberá a confirmação em instantes.",
      }, 200);
    }
    return json(req, {
      status: "declined" as PayStatus,
      error: "Pagamento não autorizado pelo banco emissor do cartão. Tente outro cartão ou pague com Pix.",
    }, 400);
  } catch (e) {
    // Mensagem interna NUNCA vai pro pagador.
    console.error(`[pay-card] erro inesperado (code=${shortCode}):`, (e as Error).message);
    return json(req, {
      error: "Não foi possível concluir o pagamento agora. Tente novamente em instantes.",
    }, 500);
  }
});

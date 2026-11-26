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
//
// "CLIENTE ESCOLHE AS PARCELAS" (cobrança criada com customer_max_installments)
//   A Asaas NÃO deixa parcelar uma cobrança que já existe (payWithCreditCard e
//   PUT /payments não aceitam parcelas). Então, quando o pagador escolhe N ≥ 2:
//     a) POST /payments NOVO, já parcelado, com o cartão (captura na hora;
//        recusado = HTTP 400 e nada é criado). externalReference =
//        tenant_charges.id (mesmo padrão do lote): o webhook resolve a empresa
//        por ele e a RECUPERAÇÃO acha exatamente as vendas desta cobrança,
//        mesmo sem a resposta do POST. Evento de pagamento que chegar ANTES da
//        troca recebe 5xx do webhook por até 2 min (a Asaas reentrega);
//     b) troca ATÔMICA na tenant_charges (RPC replace_tenant_charge_gateway_
//        payment, compare-and-swap pelo id da cobrança 1x);
//     c) só depois da troca, DELETE da cobrança 1x antiga (best-effort; o id
//        fica em superseded_asaas_payment_ids e o webhook ignora eventos dele);
//     d) troca recusada com o cartão JÁ capturado → estorno da venda nova.
//   Regra 2 continua valendo: o TOTAL é recalculado aqui (base_value + quem
//   paga a taxa + tabela de taxa da conta), com a mesma régua do checkout
//   (_shared/customer-installments.ts). Do client só vem o NÚMERO de parcelas,
//   validado contra o teto da cobrança. `expected_total` (opcional) é só trava
//   de coerência: se o total mudou desde que a página abriu, recusamos em vez
//   de cobrar um valor que o pagador não viu.
//   RECUPERAÇÃO: antes de qualquer cobrança numa cobrança deste modo, listamos
//   GET /payments?externalReference=<tenant_charges.id>. Se uma tentativa
//   anterior CAPTUROU e não trocou (timeout, isolate morto entre a e b),
//   terminamos a troca com ela (e damos a baixa das parcelas) em vez de cobrar
//   o cartão de novo. O reconcile (cron) faz o mesmo como rede de segurança.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { vaultReadSecret } from "../_shared/payments-auth.ts";
import { asaasFor, AsaasApiError } from "../_shared/asaas-tenant-client.ts";
import { isValidDocument, unmaskDoc } from "../_shared/document-validation.ts";
import { resolveTenantCardFees } from "../_shared/asaas-card-fees.ts";
import {
  applyCapturedInstallmentPayments,
  type AsaasPaymentLite,
  CAPTURED_STATUSES,
  type CapturedInstallment,
  deleteSupersededPayment,
  findCapturedInstallmentSale,
  swapToInstallmentSale,
  undoCapturedInstallment,
} from "../_shared/customer-installment-swap.ts";
import {
  effectiveCustomerMaxInstallments,
  installmentMeetsMinimum,
  MAX_CUSTOMER_MAX_INSTALLMENTS,
  normalizeFeePayer,
  totalForInstallments,
} from "../_shared/customer-installments.ts";

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

/** Intervalo do "estou vivo" do single-flight enquanto o POST parcelado roda. */
const HEARTBEAT_MS = 8_000;

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Data de hoje no fuso da Asaas (BRT), YYYY-MM-DD. UTC viraria "amanhã" à noite. */
function todayBrt(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Só manda remoteIp se parecer IP de verdade (a Asaas exige o IP do PAGADOR). */
function looksLikeIp(ip: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || /^[0-9a-f:]+$/i.test(ip) && ip.includes(":");
}

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

// ── Venda parcelada: troca e desfazer (peças em _shared/customer-installment-swap)

/**
 * Troca a cobrança 1x pela venda parcelada já capturada e, só depois, remove a
 * 1x antiga na Asaas. Se a troca for RECUSADA (outra aba pagou, cobrança
 * cancelada), desfaz a venda nova: dinheiro capturado sem cobrança local não
 * pode ficar parado em silêncio.
 *
 * `recovered` = a venda veio da RECUPERAÇÃO (tentativa anterior): os eventos
 * das parcelas podem já ter passado pelo webhook antes da troca, então damos a
 * baixa por parcela aqui mesmo (idempotente por parcela).
 */
async function completeInstallmentSwap(
  req: Request,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  asaas: ReturnType<typeof asaasFor>,
  args: {
    shortCode: string;
    chargeId: string;
    oldPaymentId: string;
    captured: CapturedInstallment;
    recovered: boolean;
  },
): Promise<Response> {
  const { shortCode, chargeId, oldPaymentId, captured, recovered } = args;

  // b) troca atômica, IMEDIATAMENTE após a aprovação.
  const swap = await swapToInstallmentSale(supabase, chargeId, oldPaymentId, captured);

  if (swap.outcome === "swapped") {
    // c) a 1x antiga sai da Asaas. Best-effort: se falhar, o id já está em
    //    superseded_asaas_payment_ids (gravado pela RPC) e o reconcile limpa.
    if (!(await deleteSupersededPayment(asaas, oldPaymentId))) {
      console.error(`[pay-card] cobrança 1x substituída não foi removida na Asaas (code=${shortCode}); fica para a limpeza`);
    }
    if (recovered) {
      try {
        const r = await applyCapturedInstallmentPayments(supabase, asaas, captured.installmentId);
        if (r.errors > 0) {
          console.error(`[pay-card] baixa por parcela da recuperação com ${r.errors} erro(s) (code=${shortCode}); o reconcile repete`);
        }
      } catch {
        console.error(`[pay-card] baixa por parcela da recuperação falhou (code=${shortCode}); o reconcile repete`);
      }
    }
    console.log(`[pay-card] venda parcelada trocada (code=${shortCode}, status=${captured.status})`);
    if (captured.status === "AWAITING_RISK_ANALYSIS") {
      return json(req, {
        status: "processing" as PayStatus,
        message: "Pagamento em análise pela operadora. Você receberá a confirmação em instantes.",
      }, 200);
    }
    return json(req, { status: "approved" as PayStatus, message: "Pagamento aprovado." }, 200);
  }

  if (swap.outcome === "uncertain") {
    // Não deu pra saber se trocou (banco indisponível). NÃO desfazemos às
    // cegas: a próxima tentativa (ou o reconcile) passa pela recuperação e
    // termina a troca com esta mesma venda.
    console.error(`[pay-card] GRAVE: cartão capturado e troca sem confirmação (code=${shortCode})`);
    return json(req, {
      status: "processing" as PayStatus,
      message: "Pagamento recebido. Estamos confirmando com o sistema; não pague de novo. Esta página atualiza sozinha.",
    }, 200);
  }

  // d) troca recusada com o cartão capturado: desfaz a venda nova inteira.
  const undone = await undoCapturedInstallment(asaas, captured.installmentId, captured.status);
  console.error(
    `[pay-card] GRAVE: troca recusada com cartão capturado (code=${shortCode}, motivo=${swap.reason}, desfeito=${undone ? "ok" : "FALHOU"})`,
  );
  return json(req, {
    status: "not_payable" as PayStatus,
    error: undone
      ? "Esta cobrança não estava mais disponível para pagamento. O valor cobrado no seu cartão foi estornado."
      : "Esta cobrança não estava mais disponível para pagamento. Fale com quem a enviou para receber o estorno do cartão.",
  }, 409);
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

  // Número de parcelas escolhido no checkout (opcional). Ausente ou 1 → fluxo
  // de sempre (payWithCreditCard na cobrança 1x). Só o NÚMERO vem do client;
  // o valor é recalculado no servidor.
  let requestedInstallments = 1;
  const rawInstallments = body.installment_count;
  if (rawInstallments !== undefined && rawInstallments !== null && rawInstallments !== "") {
    const n = Number(rawInstallments);
    if (!Number.isInteger(n) || n < 1 || n > MAX_CUSTOMER_MAX_INSTALLMENTS) {
      return json(req, { error: "Número de parcelas inválido. Escolha uma das opções da lista." }, 400);
    }
    requestedInstallments = n;
  }
  const rawExpectedTotal = Number(body.expected_total);
  const expectedTotal = Number.isFinite(rawExpectedTotal) && rawExpectedTotal > 0
    ? round2(rawExpectedTotal)
    : null;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ---- 1) Cobrança pelo short_code (SELECT explícito; company_id vem daqui) --
    const { data: charge } = await supabase
      .from("tenant_charges")
      .select(
        "id, company_id, asaas_payment_id, status, payment_date, value, billing_type, description, customer_max_installments, card_fee_payer, base_value, batch_id, subscription_id",
      )
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

    // Parcelas pedidas: só em cobrança do modo "cliente escolhe" e até o teto
    // DELA. Barrado ANTES do lock (não gasta a janela do single-flight).
    const inCustomerMode = charge.customer_max_installments != null;
    if (requestedInstallments > 1) {
      const chargeMax = Number(charge.customer_max_installments);
      const baseValue = Number(charge.base_value);
      // Mesmas condições que a RPC de troca exige (charge_not_open,
      // charge_not_eligible, not_customer_installments_mode): conferidas AQUI,
      // antes de cobrar, pra troca recusada depois da captura ser exceção.
      if (
        !inCustomerMode ||
        String(charge.billing_type ?? "") !== "CREDIT_CARD" ||
        charge.batch_id != null ||
        charge.subscription_id != null ||
        !PAYABLE_STATUSES.has(localStatus) ||
        !Number.isFinite(baseValue) || baseValue <= 0
      ) {
        return json(req, { error: "Esta cobrança não pode ser parcelada no cartão." }, 400);
      }
      if (!Number.isFinite(chargeMax) || requestedInstallments > chargeMax) {
        return json(req, {
          error: `Esta cobrança pode ser parcelada em até ${chargeMax}x. Escolha uma das opções da lista.`,
        }, 400);
      }
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
      .select(
        "status, vault_secret_name, allow_card, default_max_installments, card_fee_override, card_fees_cache, card_fees_synced_at",
      )
      .eq("company_id", charge.company_id)
      .maybeSingle();
    const account = accountData as
      | {
        status?: string;
        vault_secret_name?: string;
        allow_card?: boolean;
        default_max_installments?: number | null;
        card_fee_override?: unknown;
        card_fees_cache?: unknown;
        card_fees_synced_at?: string | null;
      }
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
    let remoteCustomer = "";
    try {
      const remote = await asaas.get<{ status?: string; customer?: string }>(`/payments/${paymentId}`);
      remoteStatus = String(remote?.status ?? "").toUpperCase();
      remoteCustomer = typeof remote?.customer === "string" ? remote.customer : "";
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

    // ---- 4.1) Recuperação (só no modo "cliente escolhe") ---------------------
    // Uma tentativa parcelada anterior pode ter CAPTURADO o cartão e morrido
    // antes da troca (timeout, isolate encerrado). Cobrar de novo aqui seria
    // cobrar duas vezes: terminamos a troca com a venda que já existe.
    // Tabela de taxa (só no modo): total da recuperação e da venda nova saem
    // da MESMA régua do checkout.
    const feePayer = normalizeFeePayer(charge.card_fee_payer);
    let totalFor: ((count: number) => number) | null = null;
    if (inCustomerMode) {
      const { fees } = await resolveTenantCardFees({
        account,
        asaas,
        nowMs: Date.now(),
        persistCache: async (table) => {
          await supabase
            .from("tenant_payment_accounts")
            .update({ card_fees_cache: table, card_fees_synced_at: new Date().toISOString() })
            .eq("company_id", charge.company_id);
        },
      });
      totalFor = (count: number) =>
        totalForInstallments({
          baseValue: Number(charge.base_value),
          oneTimeValue: Number(charge.value),
          count,
          feePayer,
          fees,
        });
    }

    if (inCustomerMode) {
      let leftover: CapturedInstallment | null = null;
      try {
        leftover = await findCapturedInstallmentSale(asaas, String(charge.id), paymentId);
      } catch (e) {
        console.error(`[pay-card] falha ao conferir tentativas anteriores (code=${shortCode}):`,
          e instanceof AsaasApiError ? `asaas ${e.status}` : "erro");
        return json(req, {
          error: "Não foi possível conferir a cobrança agora. Tente novamente em instantes.",
        }, 502);
      }
      if (leftover) {
        console.warn(`[pay-card] recuperando venda parcelada já capturada (code=${shortCode})`);
        return await completeInstallmentSwap(req, supabase, asaas, {
          shortCode,
          chargeId: String(charge.id),
          oldPaymentId: paymentId,
          captured: leftover,
          recovered: true,
        });
      }
    }

    // ---- 4.2) Venda PARCELADA escolhida pelo pagador -------------------------
    if (requestedInstallments > 1) {
      const customerMax = effectiveCustomerMaxInstallments(
        charge.customer_max_installments,
        account.default_max_installments,
      );
      if (customerMax === null || requestedInstallments > customerMax) {
        return json(req, {
          error: "Este número de parcelas não está mais disponível. Atualize a página e escolha outra opção.",
        }, 400);
      }
      if (!remoteCustomer || !totalFor) {
        return json(req, {
          error: "Não foi possível conferir a cobrança agora. Tente novamente em instantes.",
        }, 502);
      }

      // TOTAL AUTORITATIVO (nunca do client): mesma régua do checkout.
      const totalValue = totalFor(requestedInstallments);
      // billed_below_base da RPC: o repasse nunca deixa o total abaixo do pedido.
      if (totalValue < Number(charge.base_value) - 0.01) {
        return json(req, { error: "Esta cobrança não pode ser parcelada no cartão." }, 400);
      }
      if (!installmentMeetsMinimum(totalValue, requestedInstallments)) {
        return json(req, {
          error: "Cada parcela precisa ser de pelo menos R$ 5,00. Escolha menos parcelas.",
        }, 400);
      }
      if (expectedTotal !== null && Math.abs(expectedTotal - totalValue) > 0.01) {
        return json(req, {
          error: "O valor do parcelamento foi atualizado. Recarregue a página para ver o valor certo antes de pagar.",
        }, 409);
      }

      // Single-flight "vivo": o POST com cartão pode levar dezenas de segundos
      // (a Asaas recomenda timeout ≥ 60s). Sem isto, um 2º clique depois de
      // SINGLE_FLIGHT_SECONDS passaria pelo lock com o 1º ainda em voo e as
      // duas tentativas capturariam o cartão.
      const heartbeat = setInterval(() => {
        supabase
          .from("tenant_charges")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", charge.id)
          .then(() => {}, () => {});
      }, HEARTBEAT_MS);

      let created: AsaasPaymentLite | null = null;
      let outcomeUnknown = false;
      try {
        created = await asaas.post<AsaasPaymentLite>("/payments", {
          customer: remoteCustomer,
          billingType: "CREDIT_CARD",
          installmentCount: requestedInstallments,
          totalValue,
          dueDate: todayBrt(),
          description: typeof charge.description === "string" && charge.description
            ? String(charge.description).slice(0, 500)
            : undefined,
          // = tenant_charges.id (padrão do lote): o webhook resolve a empresa
          // por aqui e a recuperação acha esta venda mesmo sem a resposta do
          // POST. Nenhuma cobrança fora do lote usa ensureBatchChargeGatewayLink.
          externalReference: String(charge.id),
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
          ...(looksLikeIp(ip) ? { remoteIp: ip } : {}),
        });
      } catch (e) {
        // 4xx = a Asaas respondeu e recusou: NADA foi criado (doc oficial).
        // Qualquer outra coisa (rede, timeout, 5xx) = desfecho DESCONHECIDO.
        if (e instanceof AsaasApiError && e.status >= 400 && e.status < 500) {
          clearInterval(heartbeat);
          console.error(`[pay-card] parcelado recusado (code=${shortCode}): asaas ${e.status}`);
          return json(req, { status: "declined" as PayStatus, error: friendlyCardError(e) }, 400);
        }
        outcomeUnknown = true;
        console.error(`[pay-card] parcelado sem resposta (code=${shortCode}):`,
          e instanceof AsaasApiError ? `asaas ${e.status}` : "erro de rede");
      } finally {
        clearInterval(heartbeat);
      }

      // Desfecho desconhecido: a doc manda CONFERIR antes de qualquer coisa.
      let captured: CapturedInstallment | null = null;
      if (outcomeUnknown) {
        try {
          captured = await findCapturedInstallmentSale(asaas, String(charge.id), paymentId);
        } catch {
          captured = null;
        }
        if (!captured) {
          // Não achamos captura AGORA. Pode aparecer daqui a pouco: a próxima
          // tentativa passa pela recuperação (4.1) e não cobra duas vezes.
          return json(req, {
            error: "Não conseguimos confirmar o pagamento com a operadora. Aguarde 1 minuto e atualize a página antes de tentar de novo.",
          }, 502);
        }
      } else {
        const status = String(created?.status ?? "").toUpperCase();
        const installmentId = typeof created?.installment === "string" ? created.installment : "";
        if (!created?.id || !installmentId || !CAPTURED_STATUSES.has(status)) {
          // Criou mas não capturou (status inesperado): não deixa venda
          // pendurada na conta do tenant.
          console.error(`[pay-card] parcelado criado sem captura (code=${shortCode}, status=${status || "?"})`);
          if (installmentId) {
            await asaas.delete(`/installments/${installmentId}`).catch(() => {});
          } else if (created?.id) {
            await asaas.delete(`/payments/${created.id}`).catch(() => {});
          }
          return json(req, {
            status: "declined" as PayStatus,
            error: "Pagamento não autorizado pelo banco emissor do cartão. Tente outro cartão ou pague com Pix.",
          }, 400);
        }
        captured = {
          paymentId: created.id,
          installmentId,
          installmentCount: requestedInstallments,
          billedValue: totalValue,
          netValue: created.netValue != null && Number.isFinite(Number(created.netValue))
            ? Number(created.netValue)
            : null,
          status,
          invoiceUrl: typeof created.invoiceUrl === "string" ? created.invoiceUrl : null,
        };
      }

      return await completeInstallmentSwap(req, supabase, asaas, {
        shortCode,
        chargeId: String(charge.id),
        oldPaymentId: paymentId,
        captured,
        // Desfecho desconhecido = venda achada pela consulta: mesma regra da
        // recuperação (eventos podem ter passado antes da troca).
        recovered: outcomeUnknown,
      });
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

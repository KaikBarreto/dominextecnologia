// Cliente HTTP Asaas MULTI-CONTA (uma instância por tenant).
//
// Diferente de `asaas-client.ts` (que usa a chave GLOBAL `ASAAS_API_KEY` da conta-mãe
// Auctus via Deno.env), aqui a chave vem do Supabase Vault, indexada por company_id
// (modelo BYO — "traga sua conta Asaas", plano §9). Cada request de tenant cria um
// cliente ligado à chave DAQUELE tenant.
//
// A chave decriptada existe SÓ na memória do isolate durante a request — nunca
// retorna pro browser, nunca vai pra log em claro (usar maskKey pra logar).

export const ASAAS_BASE_URL_PROD = "https://api.asaas.com/v3";
export const ASAAS_BASE_URL_SANDBOX = "https://api-sandbox.asaas.com/v3";

// Compat: default histórico (produção). Preferir `asaasBaseUrlForKey(apiKey)`.
export const ASAAS_BASE_URL = ASAAS_BASE_URL_PROD;

/**
 * Deriva o ambiente Asaas DA PRÓPRIA CHAVE, em runtime (sem coluna no schema).
 *
 * Chave de SANDBOX (homologação) carrega o segmento `_hmlg_`
 * (ex.: `$aact_hmlg_...`) e SÓ autentica contra o painel sandbox; chave de
 * PRODUÇÃO (ex.: `$aact_prod_...` / `$aact_YT...`) só contra produção. Bater no
 * endpoint errado devolve 401 (falso "chave inválida").
 *
 * Detecção case-insensitive por `_hmlg_` em qualquer posição da chave.
 */
export function asaasBaseUrlForKey(apiKey: string): string {
  return (apiKey || "").toLowerCase().includes("_hmlg_")
    ? ASAAS_BASE_URL_SANDBOX
    : ASAAS_BASE_URL_PROD;
}

/** Erro retornado pela própria API da Asaas (campo `errors`) ou HTTP não-2xx. */
export class AsaasApiError extends Error {
  status: number;
  asaasErrors: unknown;
  constructor(message: string, status = 502, asaasErrors?: unknown) {
    super(message);
    this.name = "AsaasApiError";
    this.status = status;
    this.asaasErrors = asaasErrors;
  }
}

/** Mascara a chave pra log seguro: só os 6 primeiros caracteres + reticências. */
export function maskKey(key: string): string {
  if (!key) return "(vazia)";
  return `${key.slice(0, 6)}…(${key.length} chars)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classificação de "recurso não habilitado na conta Asaas do tenant"
// -----------------------------------------------------------------------------
// Cartão recorrente e Pix Automático só funcionam se a CONTA ASAAS DO TENANT
// tiver o recurso liberado. Quando não tem, o Asaas NEGA a criação — mas devolve
// um erro cru/genérico (400/403 com uma `description` variada). Aqui identificamos,
// de forma CONSERVADORA, quando a negativa é "recurso não habilitado" pra o edge
// devolver uma resposta estruturada que a UI reconhece (code+method → passo a passo).
//
// Regra: só classificamos como "não habilitado" quando o status é de negação
// (400/401/403) E a mensagem casa um dos padrões abaixo. Qualquer outra coisa
// (valor inválido, cliente inexistente, indisponibilidade momentânea) NÃO é
// classificada — repassamos o erro normal.
// ─────────────────────────────────────────────────────────────────────────────

/** Método de cobrança recorrente cujo gate é a conta Asaas. */
export type RecurringMethod = "credit_card" | "pix_auto";

/**
 * Padrões (normalizados: minúsculas, sem acento) que indicam "recurso ainda não
 * liberado / aprovado / habilitado na conta". Genéricos (servem pros dois meios).
 */
const NOT_ENABLED_GENERIC_PATTERNS: readonly string[] = [
  "nao esta habilitad", // "não está habilitado/habilitada"
  "nao habilitad",
  "not enabled",
  "not allowed",
  "unauthorized feature",
  "feature not available",
  "recurso nao disponivel",
  "recurso indisponivel",
  "nao disponivel para sua conta",
  "nao esta disponivel para sua conta",
  "nao liberad", // "não liberado/liberada"
  "aguardando aprovacao",
  "em analise",
  "conta em analise",
  "pending approval",
  "awaiting approval",
  "under review",
  "nao autorizad", // "não autorizado" no sentido de feature (checado junto do status)
  "sem permissao para",
  "nao possui permissao",
  "does not have permission",
  "not permitted",
];

/** Padrões específicos de CARTÃO recorrente. */
const NOT_ENABLED_CARD_PATTERNS: readonly string[] = [
  "credit card disabled",
  "credit card is disabled",
  "cartao de credito nao",       // "cartão de crédito não (habilitado/liberado)"
  "cartao nao habilitad",
  "pagamento com cartao nao",
  "cartao de credito indisponivel",
  "cartao de credito desabilitad",
  "recurring credit card",
  "cobranca recorrente no cartao",
  "credit card recurring",
];

/** Padrões específicos de PIX AUTOMÁTICO. */
const NOT_ENABLED_PIX_AUTO_PATTERNS: readonly string[] = [
  "pix automatic not enabled",
  "pix automatico nao",          // "pix automático não (habilitado/liberado/disponível)"
  "pix automatico indisponivel",
  "pix automatico desabilitad",
  "automatic pix",
  "recurring pix",
  "pix recorrente nao",
];

/** Normaliza uma string pra casamento: minúsculas + remove acentos + colapsa espaços. */
function normalizeMsg(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai TODAS as descrições de erro de um AsaasApiError (message + asaasErrors[])
 * pra dar mais superfície ao casamento — o Asaas às vezes detalha melhor em
 * `errors[].description` do que na primeira linha.
 */
function collectErrorText(err: AsaasApiError): string {
  const parts: string[] = [];
  if (err.message) parts.push(err.message);
  const arr = err.asaasErrors;
  if (Array.isArray(arr)) {
    for (const e of arr) {
      const desc = (e as any)?.description;
      if (typeof desc === "string" && desc) parts.push(desc);
      const code = (e as any)?.code;
      if (typeof code === "string" && code) parts.push(code);
    }
  } else if (arr && typeof arr === "object") {
    const desc = (arr as any)?.description;
    if (typeof desc === "string" && desc) parts.push(desc);
  }
  return parts.join(" || ");
}

/**
 * Decide, de forma CONSERVADORA, se o AsaasApiError significa "recurso não
 * habilitado na conta" para o `method` dado. Só retorna true quando:
 *   1. o status é de negação (400 / 401 / 403), E
 *   2. o texto do erro casa um padrão genérico OU específico do método.
 *
 * Em qualquer dúvida retorna false (o chamador repassa o erro normal).
 */
export function isMethodNotEnabledError(
  err: unknown,
  method: RecurringMethod,
): boolean {
  if (!(err instanceof AsaasApiError)) return false;
  // Negação de recurso costuma vir como 400/401/403. 5xx/timeout = transitório,
  // NÃO classificamos (seria mascarar indisponibilidade momentânea).
  if (err.status !== 400 && err.status !== 401 && err.status !== 403) return false;

  const text = normalizeMsg(collectErrorText(err));
  if (!text) return false;

  const specific =
    method === "credit_card" ? NOT_ENABLED_CARD_PATTERNS : NOT_ENABLED_PIX_AUTO_PATTERNS;

  for (const p of specific) {
    if (text.includes(p)) return true;
  }
  for (const p of NOT_ENABLED_GENERIC_PATTERNS) {
    if (text.includes(p)) return true;
  }
  return false;
}

/** Mensagem PT-BR clara por método (pra UI abrir o passo a passo certo). */
export function methodNotEnabledMessage(method: RecurringMethod): string {
  return method === "credit_card"
    ? "A cobrança recorrente no cartão ainda não está liberada na sua conta Asaas. Ative esse recurso no Asaas para começar a usar."
    : "O Pix Automático ainda não está liberado na sua conta Asaas. Ative esse recurso no Asaas para começar a usar.";
}

/**
 * Corpo estruturado que a UI reconhece pra abrir o passo a passo de habilitação.
 * `code` é sempre "method_not_enabled"; `method` diz qual tutorial mostrar.
 */
export function methodNotEnabledBody(method: RecurringMethod): {
  error: string;
  code: "method_not_enabled";
  method: RecurringMethod;
} {
  return {
    error: methodNotEnabledMessage(method),
    code: "method_not_enabled",
    method,
  };
}

interface AsaasRequestOptions {
  query?: string;
  body?: unknown;
}

async function request<T = unknown>(
  apiKey: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  opts: AsaasRequestOptions = {},
): Promise<T> {
  // Base derivada da chave: garante que provision (myAccount + registro de
  // webhook), create-charge e qualquer chamada batam no ambiente CORRETO
  // (sandbox vs produção) daquela chave.
  const baseUrl = asaasBaseUrlForKey(apiKey);
  const url = `${baseUrl}${path}${opts.query ? `?${opts.query}` : ""}`;
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "access_token": apiKey,
      "User-Agent": "Dominex/1.0",
    },
  };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }

  const resp = await fetch(url, init);
  const text = await resp.text();
  const data: any = text ? JSON.parse(text) : null;

  // Asaas devolve erro de negócio com HTTP 400 e corpo { errors: [{ description }] }.
  if (data && Array.isArray(data.errors) && data.errors.length > 0) {
    const description = data.errors[0]?.description || "Erro na operação de pagamento.";
    throw new AsaasApiError(description, resp.status || 400, data.errors);
  }
  if (!resp.ok) {
    throw new AsaasApiError(
      `Falha na comunicação com a Asaas (HTTP ${resp.status}).`,
      resp.status,
      data,
    );
  }
  return data as T;
}

/** Monta uma querystring a partir de um objeto, ignorando undefined/null/''. */
export function buildQuery(
  params: Record<string, string | number | undefined | null>,
): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && `${v}` !== "") {
      usp.append(k, String(v));
    }
  }
  return usp.toString();
}

/** Cria um cliente Asaas ligado à `apiKey` de UM tenant específico. */
export function asaasFor(apiKey: string) {
  if (!apiKey || !apiKey.trim()) {
    throw new AsaasApiError("Chave da Asaas ausente para este tenant.", 400);
  }
  return {
    get: <T = unknown>(path: string, query?: string) =>
      request<T>(apiKey, "GET", path, { query }),
    post: <T = unknown>(path: string, body: unknown) =>
      request<T>(apiKey, "POST", path, { body }),
    put: <T = unknown>(path: string, body: unknown) =>
      request<T>(apiKey, "PUT", path, { body }),
    delete: <T = unknown>(path: string) => request<T>(apiKey, "DELETE", path),
  };
}

export type AsaasTenantClient = ReturnType<typeof asaasFor>;

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

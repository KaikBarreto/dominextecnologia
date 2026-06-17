// Wrapper de fetch para a API da Fisqal (NFS-e / documentos fiscais).
//
// Contrato: docs/integracoes/fisqal.md (auth §2, headers §3, idempotência §4,
// fluxo assíncrono/202 §6, erros §7).
//
// Decisões:
//  - Base URL fixa (`https://api.fisqal.com.br`); a versão `/v1` vai no PATH
//    chamado (ex: fisqal.post("/v1/nfse", ...)), espelhando como o asaas-client
//    mantém a versão na base mas aqui os endpoints da Fisqal já carregam `/v1`.
//  - Auth: header `Authorization: Bearer <FISQAL_API_KEY>` (Deno.env).
//  - Suporta body JSON e multipart (FormData) — este último pro upload de
//    certificado A1 (§10), onde o Content-Type NÃO é setado manualmente.
//
// Se FISQAL_API_KEY não estiver setada, lançamos erro claro em PT-BR.
// NUNCA fingimos sucesso — a integração fica inerte até o CEO setar a chave.

export const FISQAL_BASE_URL = "https://api.fisqal.com.br";

/** Erro de configuração da Fisqal (chave ausente). Mensagem cliente-facing em PT-BR. */
export class FisqalConfigError extends Error {
  status: number;
  constructor(message = "Integração fiscal (Fisqal) não configurada.") {
    super(message);
    this.name = "FisqalConfigError";
    this.status = 503;
  }
}

/** Erro retornado pela própria API da Fisqal (shape §7: { message, code, statusCode }). */
export class FisqalApiError extends Error {
  /** HTTP status devolvido pela Fisqal (ou nosso fallback). */
  status: number;
  /** Status fiscal do corpo (`statusCode`), quando presente. */
  statusCode?: number;
  /** Código de erro da Fisqal (ex: `VALIDATION_ERROR`, `NFSE_REJECTED`). */
  code?: string;
  /** Corpo de erro cru, para log/diagnóstico. */
  fisqalError: unknown;
  constructor(
    message: string,
    status = 502,
    opts: { code?: string; statusCode?: number; fisqalError?: unknown } = {},
  ) {
    super(message);
    this.name = "FisqalApiError";
    this.status = status;
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.fisqalError = opts.fisqalError;
  }
}

function getApiKey(): string {
  // Tolerante a maiúsculas/minúsculas: Deno.env.get é case-sensitive e o secret
  // pode ter sido salvo como `fisqal_api_key`. Nunca logar/imprimir o valor.
  const key = Deno.env.get("FISQAL_API_KEY") ?? Deno.env.get("fisqal_api_key");
  if (!key || !key.trim()) {
    throw new FisqalConfigError(
      "Integração fiscal (Fisqal) não configurada.",
    );
  }
  return key;
}

/**
 * Monta os headers da requisição.
 * - Sempre inclui `Authorization: Bearer <key>` e `User-Agent`.
 * - `Content-Type: application/json` por padrão; quando `multipart` é true
 *   (body FormData), o header é OMITIDO para o runtime montar o boundary.
 * - `extra` permite passar `Idempotency-Key`, `X-Correlation-Id`, etc.
 */
function buildHeaders(
  extra?: Record<string, string>,
  opts: { multipart?: boolean } = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${getApiKey()}`,
    "User-Agent": "Dominex/1.0",
    ...(extra ?? {}),
  };
  if (!opts.multipart) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

/** Monta uma querystring a partir de um objeto, ignorando undefined/null/vazio. */
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

interface FisqalFetchOptions {
  body?: unknown;
  /** Querystring já montada (sem o `?`). Use `buildQuery` para construir. */
  query?: string;
  /** Headers extra (ex: `Idempotency-Key`, `X-Correlation-Id`). */
  headers?: Record<string, string>;
  /** Se true (default), interpreta a resposta como JSON. */
  parseJson?: boolean;
}

async function request<T = any>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  opts: FisqalFetchOptions = {},
): Promise<T> {
  const isMultipart = opts.body instanceof FormData;
  const headers = buildHeaders(opts.headers, { multipart: isMultipart });
  const url = `${FISQAL_BASE_URL}${path}${opts.query ? `?${opts.query}` : ""}`;

  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) {
    init.body = isMultipart ? (opts.body as FormData) : JSON.stringify(opts.body);
  }

  const resp = await fetch(url, init);

  let data: any = null;
  if (opts.parseJson !== false) {
    const text = await resp.text();
    data = text ? JSON.parse(text) : null;
  }

  // Erros da Fisqal vêm com HTTP de erro e corpo { message, code, statusCode } (§7).
  // A Fisqal já manda `message` em PT-BR; preservamos. Código cru fica em `code`.
  if (!resp.ok) {
    const message = (data && typeof data.message === "string" && data.message.trim())
      ? data.message
      : `Falha na comunicação com a Fisqal (HTTP ${resp.status}).`;
    throw new FisqalApiError(message, resp.status, {
      code: data?.code,
      statusCode: data?.statusCode,
      fisqalError: data,
    });
  }

  return data as T;
}

/**
 * Gera um header `Idempotency-Key` pronto pra mesclar em POST fiscal (§4).
 * A chave deve ser única por operação de negócio (1 por emissão). O ideal é
 * gerar no client junto do ID da emissão (PWA offline); este helper só monta
 * o objeto de header a partir de uma chave já decidida.
 */
export function idempotencyHeader(key: string): Record<string, string> {
  return { "Idempotency-Key": key };
}

export const fisqal = {
  get: <T = any>(path: string, query?: string, headers?: Record<string, string>) =>
    request<T>("GET", path, { query, headers }),
  post: <T = any>(path: string, body: unknown, headers?: Record<string, string>) =>
    request<T>("POST", path, { body, headers }),
  put: <T = any>(path: string, body: unknown, headers?: Record<string, string>) =>
    request<T>("PUT", path, { body, headers }),
  delete: <T = any>(path: string, headers?: Record<string, string>) =>
    request<T>("DELETE", path, { headers }),
};

/** Verifica se a chave está setada sem disparar requisição (para mensagem antecipada). */
export function assertFisqalConfigured(): void {
  getApiKey();
}

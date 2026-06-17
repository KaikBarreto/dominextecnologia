// Wrapper de fetch para a API da Asaas (conta de PRODUÇÃO).
//
// Decisões (docs/decisoes/2026-06-04-asaas.md):
//  - SEM sandbox: base URL fixa de produção.
//  - Header de auth: `access_token: <ASAAS_API_KEY>` (Deno.env).
//
// Se ASAAS_API_KEY não estiver setada, lançamos erro claro em PT-BR.
// NUNCA fingimos sucesso — a integração fica inerte até o CEO setar a chave.

export const ASAAS_BASE_URL = "https://api.asaas.com/v3";

/** Erro de configuração da Asaas (chave ausente). Mensagem cliente-facing em PT-BR. */
export class AsaasConfigError extends Error {
  constructor(message = "Integração de pagamento não configurada. Tente novamente mais tarde.") {
    super(message);
    this.name = "AsaasConfigError";
  }
}

/** Erro retornado pela própria API da Asaas (campo `errors`). */
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

function getApiKey(): string {
  const key = Deno.env.get("ASAAS_API_KEY");
  if (!key || !key.trim()) {
    throw new AsaasConfigError(
      "Integração de pagamento (Asaas) não configurada: chave de API ausente.",
    );
  }
  return key;
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "access_token": getApiKey(),
    "User-Agent": "Dominex/1.0",
    ...(extra ?? {}),
  };
}

interface AsaasFetchOptions {
  /** Querystring já montada (sem o `?`). Use `buildQuery` para construir. */
  query?: string;
  body?: unknown;
  /** Se true (default), interpreta a resposta como JSON e lança em `errors`. */
  parseJson?: boolean;
}

async function request<T = any>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  opts: AsaasFetchOptions = {},
): Promise<T> {
  const headers = buildHeaders();
  const url = `${ASAAS_BASE_URL}${path}${opts.query ? `?${opts.query}` : ""}`;

  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }

  const resp = await fetch(url, init);

  let data: any = null;
  if (opts.parseJson !== false) {
    const text = await resp.text();
    data = text ? JSON.parse(text) : null;
  }

  // A Asaas devolve erros de negócio com HTTP 400 e corpo { errors: [{ description }] }.
  if (data && Array.isArray(data.errors) && data.errors.length > 0) {
    const description = data.errors[0]?.description || "Erro na operação de pagamento.";
    throw new AsaasApiError(description, resp.status || 400, data.errors);
  }

  if (!resp.ok && opts.parseJson !== false) {
    throw new AsaasApiError(
      `Falha na comunicação com a Asaas (HTTP ${resp.status}).`,
      resp.status,
      data,
    );
  }

  return data as T;
}

/** Monta uma querystring a partir de um objeto, ignorando undefined/null. */
export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && `${v}` !== "") {
      usp.append(k, String(v));
    }
  }
  return usp.toString();
}

export const asaas = {
  get: <T = any>(path: string, query?: string) => request<T>("GET", path, { query }),
  post: <T = any>(path: string, body: unknown) => request<T>("POST", path, { body }),
  put: <T = any>(path: string, body: unknown) => request<T>("PUT", path, { body }),
  delete: <T = any>(path: string) => request<T>("DELETE", path),
};

/** Verifica se a chave está setada sem disparar requisição (para mensagem antecipada). */
export function assertAsaasConfigured(): void {
  getApiKey();
}

/** Antecipação de recebível (subconjunto dos campos do AnticipationGetResponseDTO). */
export interface AsaasAnticipation {
  id: string;
  /** pay_* da cobrança antecipada (null em antecipação de parcelamento). */
  payment: string | null;
  /** ins_* do parcelamento antecipado (null em antecipação de cobrança avulsa). */
  installment: string | null;
  /** PENDING | DENIED | CREDITED | DEBITED | CANCELLED | OVERDUE | SCHEDULED */
  status: string;
  /** Taxa de antecipação cobrada pelo Asaas (R$). FONTE DA VERDADE do custo extra. */
  fee: number;
  /** Valor líquido creditado (totalValue − fee). */
  netValue: number;
  /** Valor total da cobrança antecipada. */
  totalValue: number;
  value: number;
}

/**
 * Lista as antecipações de uma cobrança específica (pay_*). FONTE ROBUSTA da taxa
 * de antecipação: re-consulta o Asaas em vez de confiar no payload do webhook (cujo
 * formato/wrapper não é garantido). Retorna [] se a cobrança não tem antecipação.
 */
export async function listAnticipationsByPayment(
  paymentId: string,
): Promise<AsaasAnticipation[]> {
  const res = await asaas.get<{ data?: AsaasAnticipation[] }>(
    "/anticipations",
    buildQuery({ payment: paymentId, limit: 100 }),
  );
  return Array.isArray(res?.data) ? res.data : [];
}

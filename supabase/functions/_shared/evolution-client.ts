// Wrapper de fetch para a Evolution API AUTO-HOSPEDADA (open source, NÃO a API
// oficial da Meta) que o tenant conecta via QR code num VPS brasileiro.
//
// Espelha os wrappers asaas-client.ts / fisqal-client.ts:
//  - Base URL vem de Deno.env (EVOLUTION_API_URL); NUNCA hardcoded (cada ambiente
//    aponta pro seu VPS). A versão/rotas ficam no PATH chamado.
//  - Auth: header global `apikey: <EVOLUTION_API_KEY>` (padrão da Evolution API).
//  - Se EVOLUTION_API_URL ou EVOLUTION_API_KEY não estiverem setadas, lançamos
//    erro claro em PT-BR (EvolutionConfigError). NUNCA fingimos sucesso — a
//    integração fica inerte até o CEO subir o VPS e setar os secrets.
//
// Endpoints usados (Evolution API v2, https://doc.evolution-api.com):
//  - POST   /instance/create               → cria instância + retorna QR (qrcode:true)
//  - GET    /instance/connect/{instance}    → (re)gera QR de uma instância existente
//  - GET    /instance/connectionState/{instance} → estado da conexão
//  - POST   /message/sendText/{instance}    → envia texto
// Os nomes de rota podem variar por versão do build da Evolution; ver README de
// setup. Deixamos TODO nos pontos a confirmar em homologação com o VPS real.

export class EvolutionConfigError extends Error {
  status: number;
  constructor(message = "Integração de WhatsApp não configurada.") {
    super(message);
    this.name = "EvolutionConfigError";
    this.status = 503;
  }
}

/** Erro retornado pela própria Evolution API (ou HTTP de erro). */
export class EvolutionApiError extends Error {
  status: number;
  evolutionError: unknown;
  constructor(message: string, status = 502, evolutionError?: unknown) {
    super(message);
    this.name = "EvolutionApiError";
    this.status = status;
    this.evolutionError = evolutionError;
  }
}

function getBaseUrl(): string {
  const url = Deno.env.get("EVOLUTION_API_URL");
  if (!url || !url.trim()) {
    throw new EvolutionConfigError(
      "Integração de WhatsApp (Evolution) não configurada: URL do servidor ausente.",
    );
  }
  // Remove barra final pra não duplicar no path.
  return url.trim().replace(/\/+$/, "");
}

function getApiKey(): string {
  const key = Deno.env.get("EVOLUTION_API_KEY");
  if (!key || !key.trim()) {
    throw new EvolutionConfigError(
      "Integração de WhatsApp (Evolution) não configurada: chave de API ausente.",
    );
  }
  return key;
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "apikey": getApiKey(),
    "User-Agent": "Dominex/1.0",
    ...(extra ?? {}),
  };
}

interface EvolutionFetchOptions {
  body?: unknown;
  parseJson?: boolean;
}

async function request<T = any>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  opts: EvolutionFetchOptions = {},
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const init: RequestInit = { method, headers: buildHeaders() };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

  const resp = await fetch(url, init);

  let data: any = null;
  if (opts.parseJson !== false) {
    const text = await resp.text();
    data = text ? JSON.parse(text) : null;
  }

  if (!resp.ok) {
    // A Evolution devolve { message } ou { response: { message } } em erro.
    const message = data?.message || data?.response?.message ||
      `Falha na comunicação com o servidor de WhatsApp (HTTP ${resp.status}).`;
    throw new EvolutionApiError(
      typeof message === "string" ? message : JSON.stringify(message),
      resp.status,
      data,
    );
  }

  return data as T;
}

export const evolution = {
  get: <T = any>(path: string) => request<T>("GET", path),
  post: <T = any>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  delete: <T = any>(path: string) => request<T>("DELETE", path),
};

/** Verifica se URL+chave estão setadas sem disparar requisição. */
export function assertEvolutionConfigured(): void {
  getBaseUrl();
  getApiKey();
}

// ---------------------------------------------------------------------------
// Helpers de alto nível (encapsulam as rotas da Evolution).
// ---------------------------------------------------------------------------

/** Nome de instância determinístico por company (1 instância por tenant). */
export function instanceNameForCompany(companyId: string): string {
  return `dominex_${companyId}`;
}

export interface EvolutionQrResult {
  /** QR em base64 (data URL ou payload cru, conforme a versão). */
  qr: string | null;
  /** Código pairing alternativo, quando a Evolution devolve. */
  pairingCode?: string | null;
  raw: unknown;
}

/**
 * Cria a instância do tenant (idempotente do lado do chamador: se já existe,
 * a Evolution devolve erro "already in use" e o chamador cai no connect).
 * O webhook é apontado pra whatsapp-webhook com o secret na URL/headers.
 */
export async function createInstance(
  instanceName: string,
  webhookUrl: string,
  webhookSecret: string,
): Promise<EvolutionQrResult> {
  // TODO(homologação): confirmar o shape EXATO do /instance/create do build do
  // VPS. Campos comuns na v2: instanceName, qrcode, integration, webhook.
  const data = await evolution.post("/instance/create", {
    instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
    webhook: {
      url: webhookUrl,
      byEvents: false,
      base64: true,
      // Secret enviado como header customizado; validado no whatsapp-webhook.
      headers: { "x-evolution-webhook-secret": webhookSecret },
      events: [
        "CONNECTION_UPDATE",
        "MESSAGES_UPSERT",
        "MESSAGES_UPDATE",
        "SEND_MESSAGE",
      ],
    },
  });
  return extractQr(data);
}

/** (Re)gera o QR de uma instância já criada. */
export async function connectInstance(instanceName: string): Promise<EvolutionQrResult> {
  const data = await evolution.get(`/instance/connect/${encodeURIComponent(instanceName)}`);
  return extractQr(data);
}

/** Extrai o QR/pairing de respostas com shapes diferentes entre versões. */
function extractQr(data: any): EvolutionQrResult {
  const qr = data?.qrcode?.base64 ?? data?.base64 ?? data?.qrcode?.code ?? data?.code ?? null;
  const pairingCode = data?.qrcode?.pairingCode ?? data?.pairingCode ?? null;
  return { qr, pairingCode, raw: data };
}

export type EvolutionConnState = "connected" | "qr" | "disconnected";

/** Consulta o estado atual da conexão da instância. */
export async function connectionState(instanceName: string): Promise<EvolutionConnState> {
  const data = await evolution.get(
    `/instance/connectionState/${encodeURIComponent(instanceName)}`,
  );
  // Evolution v2: { instance: { state: 'open'|'connecting'|'close' } }
  const state = data?.instance?.state ?? data?.state ?? "";
  return mapState(state);
}

/** Normaliza os estados da Evolution pro nosso enum de connection_status. */
export function mapState(state: string): EvolutionConnState {
  switch (String(state).toLowerCase()) {
    case "open":
    case "connected":
      return "connected";
    case "connecting":
    case "qr":
      return "qr";
    default:
      return "disconnected";
  }
}

/**
 * Envia uma mensagem de texto pela instância do tenant.
 * `phone` deve estar em formato E.164 sem símbolos (ex.: 5511999998888).
 */
export async function sendText(
  instanceName: string,
  phone: string,
  text: string,
): Promise<{ id: string | null; raw: unknown }> {
  // TODO(homologação): a v2 aceita `number` (JID/telefone) + `text`. Alguns builds
  // envolvem em `textMessage: { text }`. Confirmar no VPS.
  const data = await evolution.post(
    `/message/sendText/${encodeURIComponent(instanceName)}`,
    { number: phone, text },
  );
  const id = data?.key?.id ?? data?.id ?? null;
  return { id, raw: data };
}

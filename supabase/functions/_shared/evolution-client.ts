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

/** Config de proxy residencial/ISP (onda B do plano de WhatsApp). */
export interface EvolutionProxyConfig {
  host: string;
  port: number | string;
  protocol: "http" | "https" | "socks5";
  username?: string;
  password?: string;
}

/**
 * Versão da configuração de webhook aplicada em cada instância Evolution.
 *
 * Quando eventos ou formato mudarem, avance este valor. O worker reconcilia
 * instâncias antigas antes do próximo envio sem depender de novo QR Code.
 */
export const EVOLUTION_WEBHOOK_CONFIG_VERSION = "2026-10-19.1";

const EVOLUTION_WEBHOOK_EVENTS = [
  "CONNECTION_UPDATE",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "SEND_MESSAGE",
] as const;

function instanceWebhookConfig(webhookUrl: string, webhookSecret: string) {
  if (!webhookUrl.trim() || !webhookSecret.trim()) {
    throw new EvolutionConfigError(
      "Integração de WhatsApp não configurada: URL ou segredo do webhook ausente.",
    );
  }
  return {
    enabled: true,
    url: webhookUrl,
    byEvents: false,
    // Nunca precisamos receber mídia em base64 para ACK, leitura ou opt-out.
    base64: false,
    headers: { "x-evolution-webhook-secret": webhookSecret },
    events: [...EVOLUTION_WEBHOOK_EVENTS],
  };
}

/**
 * Reaplica o webhook por instância na rota canônica da Evolution 2.3.7.
 * Isto também atualiza conexões criadas antes de um novo evento ser assinado.
 */
export async function setInstanceWebhook(
  instanceName: string,
  webhookUrl: string,
  webhookSecret: string,
): Promise<void> {
  await evolution.post(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    webhook: instanceWebhookConfig(webhookUrl, webhookSecret),
  });
}

/**
 * Cria a instância do tenant (idempotente do lado do chamador: se já existe,
 * a Evolution devolve erro "already in use" e o chamador cai no connect).
 * O webhook é apontado pra whatsapp-webhook com o secret na URL/headers.
 *
 * `proxy` é opcional: quando presente, a instância NASCE atrás do proxy (o
 * IP da sessão nunca muda depois — regra de ouro da onda B: 1 IP fixo por
 * instância, pra sempre). Sem `proxy`, o body fica idêntico ao de antes.
 */
export async function createInstance(
  instanceName: string,
  webhookUrl: string,
  webhookSecret: string,
  proxy?: EvolutionProxyConfig,
): Promise<EvolutionQrResult> {
  // TODO(homologação): confirmar o shape EXATO do /instance/create do build do
  // VPS. Campos comuns na v2: instanceName, qrcode, integration, webhook.
  const body: Record<string, unknown> = {
    instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
    webhook: instanceWebhookConfig(webhookUrl, webhookSecret),
  };
  if (proxy) {
    // port/protocol vão como STRING: é esse o DTO que o /instance/create
    // (e o /proxy/set) da Evolution espera pros campos planos de proxy.
    body.proxyHost = proxy.host;
    body.proxyPort = String(proxy.port);
    body.proxyProtocol = proxy.protocol;
    if (proxy.username) body.proxyUsername = proxy.username;
    if (proxy.password) body.proxyPassword = proxy.password;
  }
  const data = await evolution.post("/instance/create", body);
  return extractQr(data);
}

/**
 * Liga/desliga o proxy de uma instância já existente.
 *
 * IMPORTANTE: o socket do Baileys só assume o proxy quando a conexão é
 * REABERTA — chamar isso numa instância já conectada não troca o IP em
 * voo. Pra efetivar, é preciso desconectar/reconectar (o tenant escaneia um
 * QR novo). Essa reconexão é decisão de produto já tomada na onda B do
 * plano de WhatsApp (`docs/planos/2026-10-16-whatsapp-proxy-residencial-
 * comportamento-humano.md`), não um TODO: quem chama esta função é
 * responsável por também pedir a reconexão.
 */
export async function setInstanceProxy(
  instanceName: string,
  proxy: EvolutionProxyConfig | null,
): Promise<void> {
  const body = proxy === null
    ? { enabled: false, host: "", port: "", protocol: "" }
    : {
      enabled: true,
      host: proxy.host,
      port: String(proxy.port),
      protocol: proxy.protocol,
      ...(proxy.username ? { username: proxy.username } : {}),
      ...(proxy.password ? { password: proxy.password } : {}),
    };
  await evolution.post(`/proxy/set/${encodeURIComponent(instanceName)}`, body);
}

/** Consulta o proxy atualmente configurado numa instância. */
export async function findInstanceProxy(instanceName: string): Promise<{
  enabled: boolean;
  host: string | null;
  port: string | null;
  protocol: string | null;
  raw: unknown;
}> {
  const data = await evolution.get(`/proxy/find/${encodeURIComponent(instanceName)}`);
  // Normaliza defensivamente: alguns builds aninham em `proxy`, outros
  // devolvem os campos direto na raiz.
  const source: any = (data as any)?.proxy ?? data ?? {};
  return {
    enabled: Boolean(source.enabled ?? false),
    host: source.host ?? null,
    port: source.port != null ? String(source.port) : null,
    protocol: source.protocol ?? null,
    raw: data,
  };
}

/** Chaves aceitas por `/settings/set/{instance}`. */
export interface EvolutionInstanceSettings {
  rejectCall?: boolean;
  msgCall?: string;
  groupsIgnore?: boolean;
  alwaysOnline?: boolean;
  readMessages?: boolean;
  readStatus?: boolean;
  syncFullHistory?: boolean;
}

/**
 * Aplica configurações de comportamento da instância. Manda só as chaves
 * presentes em `settings` — nunca sobrescreve o resto com o default da
 * Evolution.
 *
 * Defaults que o Dominex usa (decididos na onda de comportamento humano,
 * ver plano citado acima):
 *  - `alwaysOnline: false` → ficar "online" 24h é assinatura de servidor,
 *    não de humano; a pessoa de carne e osso fecha o app.
 *  - `groupsIgnore: true` → o número do tenant não participa de grupo;
 *    menos superfície de denúncia/engajamento estranho.
 *  - `readStatus: false` → não confirma "visto" de status/stories.
 *  - `syncFullHistory: false` → não baixa o histórico completo da conta ao
 *    conectar (a Evolution já roda com `DATABASE_SAVE_DATA_NEW_MESSAGE:
 *    false` — não é nosso dado pra guardar).
 *  - `readMessages: false` → a leitura é feita PONTUALMENTE antes de
 *    responder (ver `markMessagesAsRead`), nunca em massa: marcar tudo
 *    como lido apagaria o aviso de não-lida no celular real da equipe do
 *    cliente.
 */
export async function setInstanceSettings(
  instanceName: string,
  settings: EvolutionInstanceSettings,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (settings.rejectCall !== undefined) body.rejectCall = settings.rejectCall;
  if (settings.msgCall !== undefined) body.msgCall = settings.msgCall;
  if (settings.groupsIgnore !== undefined) body.groupsIgnore = settings.groupsIgnore;
  if (settings.alwaysOnline !== undefined) body.alwaysOnline = settings.alwaysOnline;
  if (settings.readMessages !== undefined) body.readMessages = settings.readMessages;
  if (settings.readStatus !== undefined) body.readStatus = settings.readStatus;
  if (settings.syncFullHistory !== undefined) {
    body.syncFullHistory = settings.syncFullHistory;
  }
  await evolution.post(`/settings/set/${encodeURIComponent(instanceName)}`, body);
}

/** (Re)gera o QR de uma instância já criada. */
export async function connectInstance(instanceName: string): Promise<EvolutionQrResult> {
  const data = await evolution.get(`/instance/connect/${encodeURIComponent(instanceName)}`);
  return extractQr(data);
}

/** Remove a instância e encerra a sessão no servidor Evolution. */
export async function deleteInstance(instanceName: string): Promise<void> {
  await evolution.delete(`/instance/delete/${encodeURIComponent(instanceName)}`);
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
  options?: { delayMs?: number; linkPreview?: boolean },
): Promise<{ id: string | null; raw: unknown }> {
  // TODO(homologação): a v2 aceita `number` (JID/telefone) + `text`. Alguns builds
  // envolvem em `textMessage: { text }`. Confirmar no VPS.
  const body: Record<string, unknown> = { number: phone, text };
  // `delay` (ms) no topo do body: por baixo o Baileys faz presenceSubscribe
  // → 'composing' → espera o delay → 'paused' → envia. Um único call já
  // simula o "digitando" server-side, sem segurar CPU da edge function.
  if (options?.delayMs !== undefined) body.delay = options.delayMs;
  if (options?.linkPreview !== undefined) body.linkPreview = options.linkPreview;
  const data = await evolution.post(
    `/message/sendText/${encodeURIComponent(instanceName)}`,
    body,
  );
  const id = data?.key?.id ?? data?.id ?? null;
  return { id, raw: data };
}

// ---------------------------------------------------------------------------
// Presença, leitura e validação de número (onda A — comportamento humano).
// ---------------------------------------------------------------------------

export type EvolutionPresence =
  | "available"
  | "unavailable"
  | "composing"
  | "recording"
  | "paused";

/**
 * Sinaliza presença pro número destino (ex.: `available` antes de enviar =
 * "abriu o app"; `unavailable` depois = "fechou o app").
 */
export async function sendPresence(
  instanceName: string,
  phone: string,
  presence: EvolutionPresence,
  delayMs = 0,
): Promise<void> {
  await evolution.post(`/chat/sendPresence/${encodeURIComponent(instanceName)}`, {
    number: phone,
    presence,
    delay: delayMs,
  });
}

/** Chave de mensagem aceita por `/chat/markMessageAsRead`. */
export interface EvolutionMessageKey {
  id: string;
  remoteJid: string;
  fromMe?: boolean;
}

/**
 * Marca mensagens como lidas. No-op silencioso se `keys` vier vazio (não
 * gasta request). Uso é pontual (antes de responder), nunca em massa — ver
 * `readMessages: false` em `setInstanceSettings`.
 */
export async function markMessagesAsRead(
  instanceName: string,
  keys: EvolutionMessageKey[],
): Promise<void> {
  if (!keys.length) return;
  await evolution.post(`/chat/markMessageAsRead/${encodeURIComponent(instanceName)}`, {
    readMessages: keys.map((k) => ({
      id: k.id,
      remoteJid: k.remoteJid,
      fromMe: k.fromMe ?? false,
    })),
  });
}

/**
 * Verifica quais números têm WhatsApp. No-op (`[]`) se `numbers` vier vazio.
 * Normaliza o shape, que varia um pouco entre builds (`exists`/
 * `numberExists`, `number`/`jid`).
 */
export async function checkWhatsappNumbers(
  instanceName: string,
  numbers: string[],
): Promise<Array<{ number: string; exists: boolean }>> {
  if (!numbers.length) return [];
  const data = await evolution.post<any>(
    `/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`,
    { numbers },
  );
  const list: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.response)
    ? data.response
    : [];
  return list.map((item) => ({
    number: String(item?.number ?? item?.jid ?? ""),
    exists: Boolean(item?.exists ?? item?.numberExists ?? false),
  }));
}

// ---------------------------------------------------------------------------
// Cálculos puros de comportamento humano (sem I/O — testáveis isoladamente).
// ---------------------------------------------------------------------------

/**
 * Calcula quanto tempo (ms) de "digitando" simular antes de enviar, a
 * partir do tamanho real do texto.
 *
 *  - Velocidade sorteada em 38–62 car/s: faixa de digitação rápida de
 *    celular (nem datilógrafo, nem pessoa procurando letra).
 *  - Jitter de ±20% pra não cair sempre no mesmo número em textos iguais.
 *  - Piso SORTEADO em 1900–2600ms: nem a mensagem mais curta soa
 *    instantânea (ninguém lê, digita e confirma em menos de 2s), mas o
 *    piso não pode ser uma constante. Um piso fixo faria toda mensagem
 *    curta sair com exatamente o mesmo tempo de digitação, que é
 *    exatamente o tipo de valor repetido que estamos tentando eliminar.
 *    Pela mesma razão o cálculo é em milissegundos, sem arredondar pra
 *    segundo inteiro antes do jitter.
 *  - Teto de 9000ms: texto longo NÃO vira 30s de "digitando" — ninguém
 *    fica isso tudo parado num balcão olhando pro celular, e um
 *    "digitando" eterno chama tanta atenção quanto nenhum.
 */
export function typingDelayMs(text: string): number {
  const length = text.length;
  const speed = 38 + Math.random() * (62 - 38); // caracteres por segundo
  const base = (length / Math.max(1, speed)) * 1000;
  const jitterFactor = 1 + (Math.random() * 0.4 - 0.2); // ±20%
  const withJitter = base * jitterFactor;
  const floorMs = 1900 + Math.random() * 700;
  return Math.round(Math.min(9000, Math.max(floorMs, withJitter)));
}

/**
 * Calcula o intervalo (segundos, inteiro ≥ 8) até o próximo envio da fila,
 * simulando a cadência de uma pessoa — não um intervalo uniforme (que é
 * assinatura estatística de máquina).
 *
 *  - Log-normal ASSIMÉTRICA: mediana ~35s. Um único sigma simétrico em log
 *    não bate P10~12s E P90~180s a partir da mesma mediana ao mesmo tempo
 *    (ln(35/12)≈1,07 contra ln(180/35)≈1,65 — a distância em log é maior
 *    pra cima do que pra baixo). Por isso usamos sigma diferente conforme
 *    o lado do sorteio (Box–Muller) caia abaixo ou acima da mediana:
 *      sigmaBelow ≈ 0,84 → calibrado em exp(mu + sigmaBelow·z10) ≈ 12
 *      sigmaAbove ≈ 1,28 → calibrado em exp(mu + sigmaAbove·z90) ≈ 180
 *    (z10=-1,2816 e z90=+1,2816 são os percentis da normal padrão). Isso
 *    É a "cauda longa": a parte de cima é mais esticada que a de baixo,
 *    de propósito — demorar muito mais que a mediana é bem mais plausível
 *    num humano do que responder muito mais rápido que ela.
 *  - Teto de 360s (6min) no ramo "normal" (sem pausa longa).
 *  - 1 em ~12 chamadas ignora a log-normal e devolve uma pausa longa de
 *    180–480s (café, deslocamento) — é esse achatamento ocasional e NÃO
 *    uniforme que mais lembra agenda humana.
 *  - Multiplicador ×1,6 nas horas 8, 9, 19 e 20 (começo/fim de expediente,
 *    mais lento pra responder) — nunca encurta, só alonga, então não
 *    ameaça o teto de 60/h já existente no worker.
 */
export function humanGapSeconds(nowLocalHour: number): number {
  const isLongPause = Math.random() < 1 / 12;

  let seconds: number;
  if (isLongPause) {
    seconds = 180 + Math.random() * (480 - 180);
  } else {
    // Box–Muller: gera Z ~ N(0,1) a partir de dois uniformes.
    const u1 = Math.random() || Number.EPSILON; // nunca log(0)
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    const mu = Math.log(35); // mediana ~35s
    const sigmaBelow = 0.84;
    const sigmaAbove = 1.28;
    const sigma = z < 0 ? sigmaBelow : sigmaAbove;

    seconds = Math.exp(mu + sigma * z);
    seconds = Math.min(360, seconds); // teto do ramo "normal"
  }

  const isSlowHour = nowLocalHour === 8 || nowLocalHour === 9 ||
    nowLocalHour === 19 || nowLocalHour === 20;
  const multiplier = isSlowHour ? 1.6 : 1.0;

  return Math.max(8, Math.round(seconds * multiplier));
}

// =============================================================================
// whatsapp-proxy-manage — pool de IPs residenciais do add-on de WhatsApp.
// =============================================================================
// Edge do PAINEL MASTER AUCTUS, não do tenant. O cliente não compra, não
// escolhe e não vê proxy: IP é detalhe de infra da Dominex, não benefício
// vendável (infra/whatsapp-evolution/README.md §5.4).
//
// GUARD — `super_admin` ESTRITO:
//   Authorization Bearer <jwt> → auth.getUser() → has_role(uid, 'super_admin').
//   Mesmo mecanismo canônico de `admin-infra-metrics`. ⚠️ NÃO usa
//   `is_admin_user()` (inclui vendedor-admin) e NÃO usa
//   `authorizeWhatsappManager` de `_shared/whatsapp-auth.ts` (aquele é gate de
//   TENANT: módulo 'whatsapp' + admin/gestor da empresa).
//   401 sem token, 403 sem papel. verify_jwt=false no config.toml porque o gate
//   é aqui dentro, igual às irmãs do painel master.
//
// AÇÕES (`{ action }` no corpo):
//   create      { label, kind, host, port, protocol, region?, monthly_cost?,
//                 notes?, username?, password? }
//   update      { proxy_id, label?, region?, monthly_cost?, notes?, status?,
//                 host?, port?, protocol?, username?, password? }
//   delete      { proxy_id }
//   assign      { connection_id, proxy_id }
//   release     { connection_id }
//   healthcheck { proxy_id? }   (sem proxy_id = todos os atribuídos)
//   list        {}
//
// REGRAS-LEI DESTE ARQUIVO:
//  1. A credencial do proxy NUNCA fica em coluna de tabela, NUNCA vai pra log e
//     NUNCA volta em resposta HTTP — nem mascarada. Mora no Vault, com o nome
//     `whatsapp_proxy_cred_<proxy_id>`, exatamente como o token da Meta
//     (`tenant_whatsapp_meta_token_<connection_id>`). Ponte: as RPCs
//     `vault_upsert_tenant_secret` / `vault_read_tenant_secret` /
//     `vault_delete_tenant_secret` (service_role only).
//  2. Um IP por conexão, nunca compartilhado entre tenants. Quem garante isso
//     atomicamente é a RPC `whatsapp_assign_proxy` (trava a linha, libera o IP
//     anterior, recusa IP bloqueado ou já atribuído a outra conexão).
//  3. O IP de uma sessão viva não muda. Aplicar/trocar proxy só vale quando o
//     socket do Baileys REABRE → exige QR novo. Toda resposta que muda IP diz
//     isso explicitamente em `requires_reconnect`.
//  4. NÃO EXISTE FALLBACK PRO IP DO VPS. Falha de proxy pausa a fila (conexão
//     vai pra `attention`, e `whatsapp_claim_send_jobs` só pega conexão
//     `connected`). Sair pelo IP do VPS depois de ter saído por residencial é
//     exatamente a troca de IP que a onda inteira existe pra evitar.
//  5. Copy de erro em PT-BR.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import {
  connectionState,
  EvolutionApiError,
  EvolutionConfigError,
  findInstanceProxy,
  setInstanceProxy,
} from "../_shared/evolution-client.ts";
import type { EvolutionProxyConfig } from "../_shared/evolution-client.ts";

const TAG = "[whatsapp-proxy-manage]";

// `datacenter_tunnel`: saída própria num VPS/nuvem (ex.: VM gratuita da Oracle
// com SOCKS5). Resolve só a separação entre tenants; o IP continua sendo de
// datacenter. Degrau intermediário, não substituto do residencial.
const KINDS = ["residential_static", "mobile", "datacenter_tunnel"] as const;
const PROTOCOLS = ["http", "https", "socks5"] as const;
/** Status que a mão humana pode setar. `assigned` é só da whatsapp_assign_proxy. */
const MANUAL_STATUSES = ["free", "blocked"] as const;

class ValidationError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function json(req: Request, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

// ---------------------------------------------------------------------------
// Vault — mesmo mecanismo canônico do BYO Asaas / token da Meta.
// ---------------------------------------------------------------------------

function proxySecretName(proxyId: string): string {
  return `whatsapp_proxy_cred_${proxyId}`;
}

async function vaultUpsert(supabase: SupabaseClient, name: string, secret: string): Promise<void> {
  const { error } = await supabase.rpc("vault_upsert_tenant_secret", {
    p_name: name,
    p_secret: secret,
  });
  // A mensagem do erro do Vault nunca ecoa o segredo; o nome do segredo não é
  // sensível (é derivável do id).
  if (error) throw new Error(`vault_upsert_tenant_secret falhou (${name}): ${error.message}`);
}

async function vaultRead(
  supabase: SupabaseClient,
  name: string,
): Promise<{ username?: string; password?: string }> {
  const { data, error } = await supabase.rpc("vault_read_tenant_secret", { p_name: name });
  if (error) throw new Error(`vault_read_tenant_secret falhou (${name}): ${error.message}`);
  const raw = typeof data === "string" ? data.trim() : "";
  if (!raw) return {};
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { username?: unknown; password?: unknown };
      const username = typeof parsed.username === "string" ? parsed.username : undefined;
      const password = typeof parsed.password === "string" ? parsed.password : undefined;
      if (username || password) return { username, password };
    } catch {
      // Cai no formato plano.
    }
  }
  const sep = raw.indexOf(":");
  if (sep > 0) return { username: raw.slice(0, sep), password: raw.slice(sep + 1) };
  return {};
}

/**
 * Remove usuário/senha de qualquer texto antes de logar ou gravar em coluna.
 *
 * POR QUE ISSO EXISTE: a mensagem de erro da Evolution é o corpo que ELA
 * devolve, e um erro de validação do /proxy/set pode ecoar o payload enviado —
 * payload que carrega a credencial do proxy. Sem este filtro, a credencial
 * acabaria em `whatsapp_proxies.last_error` (coluna de tabela) e no log. A lei
 * é: credencial só no Vault.
 */
function scrubCredential(text: string, config: EvolutionProxyConfig): string {
  let safe = text;
  for (const secret of [config.password, config.username]) {
    if (typeof secret === "string" && secret.length >= 3) {
      safe = safe.split(secret).join("***");
    }
  }
  return safe;
}

async function vaultDelete(supabase: SupabaseClient, name: string): Promise<void> {
  const { error } = await supabase.rpc("vault_delete_tenant_secret", { p_name: name });
  if (error) throw new Error(`vault_delete_tenant_secret falhou (${name}): ${error.message}`);
}

// ---------------------------------------------------------------------------
// Validação de entrada
// ---------------------------------------------------------------------------

function requiredText(value: unknown, field: string, max = 200): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ValidationError("invalid_request", `Informe ${field}.`);
  return text.slice(0, max);
}

function optionalText(value: unknown, max = 500): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function parsePort(value: unknown): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ValidationError("invalid_request", "A porta do proxy deve ser um número entre 1 e 65535.");
  }
  return port;
}

function parseProtocol(value: unknown): typeof PROTOCOLS[number] {
  const protocol = String(value ?? "").trim().toLowerCase();
  if (!(PROTOCOLS as readonly string[]).includes(protocol)) {
    throw new ValidationError("invalid_request", "Protocolo inválido. Use http, https ou socks5.");
  }
  return protocol as typeof PROTOCOLS[number];
}

function parseKind(value: unknown): typeof KINDS[number] {
  const kind = String(value ?? "residential_static").trim();
  if (!(KINDS as readonly string[]).includes(kind)) {
    throw new ValidationError(
      "invalid_request",
      "Tipo de IP inválido. Use residencial fixo (residential_static), móvel (mobile) "
        + "ou túnel próprio (datacenter_tunnel).",
    );
  }
  return kind as typeof KINDS[number];
}

function parseMonthlyCost(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const cost = Number(value);
  if (!Number.isFinite(cost) || cost < 0) {
    throw new ValidationError("invalid_request", "O custo mensal deve ser um valor igual ou maior que zero.");
  }
  return Math.round(cost * 100) / 100;
}

/** Credencial: ou vem usuário E senha, ou não vem nenhum dos dois. */
function parseCredential(
  body: Record<string, unknown>,
): { username: string; password: string } | null {
  const hasUser = typeof body.username === "string" && body.username.trim() !== "";
  const hasPass = typeof body.password === "string" && body.password.trim() !== "";
  if (!hasUser && !hasPass) return null;
  if (!hasUser || !hasPass) {
    throw new ValidationError(
      "invalid_request",
      "Informe usuário e senha do proxy juntos, ou deixe os dois em branco (fornecedor que autentica pelo IP de origem).",
    );
  }
  return {
    username: String(body.username).trim(),
    password: String(body.password),
  };
}

function uuidOf(value: unknown, field: string): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ValidationError("invalid_request", `Informe ${field}.`);
  }
  return id;
}

// ---------------------------------------------------------------------------
// Tipos do pool
// ---------------------------------------------------------------------------

interface ProxyRow {
  id: string;
  label: string;
  kind: string;
  host: string;
  port: number;
  protocol: string;
  region: string | null;
  secret_name: string | null;
  assigned_connection_id: string | null;
  status: string;
  monthly_cost: number | null;
  last_check_at: string | null;
  last_check_ok: boolean | null;
  last_error: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const PROXY_COLUMNS =
  "id, label, kind, host, port, protocol, region, secret_name, assigned_connection_id, status, monthly_cost, last_check_at, last_check_ok, last_error, notes, created_at, updated_at";

/**
 * Projeção cliente-facing do pool.
 *
 * `secret_name` SAI daqui, e isso é deliberado: ele é só o NOME do segredo
 * (derivável do id), não o segredo. Ler o Vault por esse nome exige
 * service_role, e a policy da tabela já deixa o super_admin dar SELECT na
 * linha inteira. O que NUNCA sai é usuário/senha — nem mascarado. Por
 * conveniência vai também `has_credential`, pra a tela não precisar inferir.
 */
function publicProxy(row: ProxyRow) {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    host: row.host,
    port: row.port,
    protocol: row.protocol,
    region: row.region,
    status: row.status,
    monthly_cost: row.monthly_cost,
    secret_name: row.secret_name,
    has_credential: Boolean(row.secret_name),
    assigned_connection_id: row.assigned_connection_id,
    last_check_at: row.last_check_at,
    last_check_ok: row.last_check_ok,
    last_error: row.last_error,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadProxy(supabase: SupabaseClient, proxyId: string): Promise<ProxyRow> {
  const { data, error } = await supabase
    .from("whatsapp_proxies")
    .select(PROXY_COLUMNS)
    .eq("id", proxyId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler o IP do pool: ${error.message}`);
  if (!data) throw new ValidationError("not_found", "IP não encontrado no pool.", 404);
  return data as ProxyRow;
}

/** Monta a config da Evolution pra uma linha do pool (credencial do Vault). */
async function buildProxyConfig(
  supabase: SupabaseClient,
  row: ProxyRow,
): Promise<EvolutionProxyConfig> {
  let credential: { username?: string; password?: string } = {};
  if (row.secret_name) {
    credential = await vaultRead(supabase, row.secret_name);
    if (!credential.username) {
      throw new ValidationError(
        "credential_missing",
        "A credencial deste IP não foi encontrada no cofre. Cadastre o usuário e a senha novamente antes de atribuí-lo.",
        409,
      );
    }
  }
  return {
    host: row.host,
    port: row.port,
    protocol: parseProtocol(row.protocol),
    ...(credential.username ? { username: credential.username } : {}),
    ...(credential.password ? { password: credential.password } : {}),
  };
}

interface ConnectionRow {
  id: string;
  company_id: string;
  provider: string;
  status: string;
  instance_name: string | null;
  proxy_id: string | null;
}

async function loadConnection(supabase: SupabaseClient, connectionId: string): Promise<ConnectionRow> {
  const { data, error } = await supabase
    .from("whatsapp_connections")
    .select("id, company_id, provider, status, instance_name, proxy_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler a conexão: ${error.message}`);
  if (!data) throw new ValidationError("not_found", "Conexão de WhatsApp não encontrada.", 404);
  return data as ConnectionRow;
}

// ---------------------------------------------------------------------------
// Healthcheck
// ---------------------------------------------------------------------------
// O QUE ESTE HEALTHCHECK VERIFICA DE VERDADE:
//   Ele pergunta à Evolution (a) se a instância está configurada com ESTE
//   host/porta e (b) em que estado o socket está. Isso responde a pergunta que
//   de fato importa em vigilância: "a sessão continua de pé saindo por aquele
//   IP, e não por outro?".
//
// O QUE ELE NÃO CONSEGUE VERIFICAR NO RUNTIME DAS EDGE FUNCTIONS:
//   não é um teste de IP de saída. `fetch` do Deno não suporta proxy por
//   parâmetro; o único caminho seria `Deno.createHttpClient({ proxy })`, que é
//   API instável (exige --unstable-http) e NÃO está exposta no runtime das edge
//   functions do Supabase. Tentamos usá-la por feature-detection abaixo; quando
//   existir, o resultado entra como INFORMAÇÃO (`exit_ip_check`) e nunca decide
//   o veredito — a ausência dela não pode virar falha falsa que pausa a fila
//   de um tenant.
//   A validação de ACEITAÇÃO de um IP comprado continua sendo manual, com
//   `curl -x` (infra/whatsapp-evolution/RUNBOOK.md, passos 10 e 11). Este
//   healthcheck é vigilância contínua, não aceitação.

const EXIT_IP_PROBE_URL = "https://api.ipify.org?format=json";
const EXIT_IP_PROBE_TIMEOUT_MS = 8_000;

type ExitIpCheck =
  | { status: "unsupported" }
  | { status: "ok"; ip: string }
  | { status: "failed"; reason: string };

async function probeExitIp(config: EvolutionProxyConfig): Promise<ExitIpCheck> {
  const factory = (Deno as unknown as {
    createHttpClient?: (options: Record<string, unknown>) => { close?: () => void };
  }).createHttpClient;
  // Indisponível no runtime da edge (o caso esperado) ou protocolo que o
  // cliente HTTP do Deno não sabe discar (socks5).
  if (typeof factory !== "function") return { status: "unsupported" };
  if (config.protocol === "socks5") return { status: "unsupported" };

  let client: { close?: () => void } | undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXIT_IP_PROBE_TIMEOUT_MS);
  try {
    client = factory({
      proxy: {
        url: `${config.protocol}://${config.host}:${config.port}`,
        ...(config.username
          ? { basicAuth: { username: config.username, password: config.password ?? "" } }
          : {}),
      },
    });
    const init = { client, signal: controller.signal } as unknown as RequestInit;
    const resp = await fetch(EXIT_IP_PROBE_URL, init);
    if (!resp.ok) return { status: "failed", reason: `HTTP ${resp.status} na sonda de IP de saída.` };
    const payload = await resp.json() as { ip?: unknown };
    const ip = typeof payload?.ip === "string" ? payload.ip : "";
    if (!ip) return { status: "failed", reason: "A sonda de IP de saída respondeu sem IP." };
    return { status: "ok", ip };
  } catch (error) {
    // NUNCA logar a config: ela carrega usuário/senha do proxy.
    return {
      status: "failed",
      reason: error instanceof Error ? error.message.slice(0, 200) : "falha na sonda de IP de saída",
    };
  } finally {
    clearTimeout(timer);
    try {
      client?.close?.();
    } catch {
      // Fechar o cliente é best-effort.
    }
  }
}

interface HealthResult {
  proxy_id: string;
  label: string;
  connection_id: string | null;
  company_id: string | null;
  /** null = não foi possível concluir (IP livre, sem instância pra consultar). */
  ok: boolean | null;
  evolution_proxy_enabled: boolean | null;
  address_matches: boolean | null;
  connection_state: string | null;
  exit_ip_check: ExitIpCheck;
  /** true quando a conexão foi pausada agora (2ª falha consecutiva). */
  paused_queue: boolean;
  message: string;
}

async function healthcheckProxy(supabase: SupabaseClient, row: ProxyRow): Promise<HealthResult> {
  const nowIso = new Date().toISOString();
  const base: HealthResult = {
    proxy_id: row.id,
    label: row.label,
    connection_id: row.assigned_connection_id,
    company_id: null,
    ok: null,
    evolution_proxy_enabled: null,
    address_matches: null,
    connection_state: null,
    exit_ip_check: { status: "unsupported" },
    paused_queue: false,
    message: "",
  };

  let config: EvolutionProxyConfig | null = null;
  try {
    config = await buildProxyConfig(supabase, row);
  } catch (error) {
    const message = error instanceof ValidationError
      ? error.message
      : "Não foi possível ler a credencial deste IP no cofre.";
    await supabase.from("whatsapp_proxies").update({
      last_check_at: nowIso,
      last_check_ok: false,
      last_error: message,
    }).eq("id", row.id);
    return { ...base, ok: false, message };
  }

  base.exit_ip_check = await probeExitIp(config);

  // IP livre: não existe instância pra consultar. Não é falha — é "não
  // verificável por aqui". Marcar como falha poria um IP novo e saudável em
  // suspeita só por ainda não ter dono.
  if (!row.assigned_connection_id) {
    const message = base.exit_ip_check.status === "ok"
      ? `IP livre. Saída confirmada por ${base.exit_ip_check.ip}.`
      : "IP livre, sem conexão vinculada: a verificação pela Evolution não se aplica.";
    await supabase.from("whatsapp_proxies").update({
      last_check_at: nowIso,
      last_check_ok: base.exit_ip_check.status === "ok" ? true : null,
      last_error: base.exit_ip_check.status === "failed" ? base.exit_ip_check.reason : null,
    }).eq("id", row.id);
    return {
      ...base,
      ok: base.exit_ip_check.status === "ok" ? true : null,
      message,
    };
  }

  let connection: ConnectionRow;
  try {
    connection = await loadConnection(supabase, row.assigned_connection_id);
  } catch {
    const message = "A conexão vinculada a este IP não existe mais.";
    await supabase.from("whatsapp_proxies").update({
      last_check_at: nowIso,
      last_check_ok: false,
      last_error: message,
    }).eq("id", row.id);
    return { ...base, ok: false, message };
  }
  base.company_id = connection.company_id;

  if (!connection.instance_name) {
    const message = "A conexão vinculada ainda não tem instância criada no servidor de WhatsApp.";
    await supabase.from("whatsapp_proxies").update({
      last_check_at: nowIso,
      last_check_ok: null,
      last_error: message,
    }).eq("id", row.id);
    return { ...base, ok: null, message };
  }

  let ok: boolean;
  let message: string;
  try {
    const applied = await findInstanceProxy(connection.instance_name);
    const state = await connectionState(connection.instance_name);
    base.connection_state = state;
    base.evolution_proxy_enabled = applied.enabled;
    base.address_matches = applied.enabled &&
      String(applied.host ?? "") === row.host &&
      String(applied.port ?? "") === String(row.port);

    // Veredito: a instância está REALMENTE saindo pelo IP que achamos?
    // O estado do socket entra como informação, não como critério: telefone
    // despareado é problema do tenant, não do IP, e a fila já está pausada por
    // status nesse caso.
    ok = Boolean(base.address_matches);
    message = ok
      ? "O servidor confirma a instância configurada com este IP."
      : applied.enabled
      ? "A instância está configurada com OUTRO endereço de proxy."
      : "A instância está SEM proxy configurado no servidor.";
  } catch (error) {
    if (error instanceof EvolutionConfigError) {
      // Ambiente sem Evolution configurada não é falha do IP.
      await supabase.from("whatsapp_proxies").update({
        last_check_at: nowIso,
        last_check_ok: null,
        last_error: error.message,
      }).eq("id", row.id);
      return { ...base, ok: null, message: error.message };
    }
    ok = false;
    message = error instanceof EvolutionApiError
      ? `O servidor de WhatsApp não confirmou este IP: ${error.message}`.slice(0, 400)
      : "Não foi possível falar com o servidor de WhatsApp para verificar este IP.";
  }

  // 2 falhas CONSECUTIVAS pausam a fila. O "consecutivas" sai do último
  // resultado gravado (last_check_ok === false), sem coluna de contador novo.
  const secondConsecutiveFailure = !ok && row.last_check_ok === false;

  await supabase.from("whatsapp_proxies").update({
    last_check_at: nowIso,
    last_check_ok: ok,
    last_error: ok ? null : message.slice(0, 500),
  }).eq("id", row.id);

  await supabase.from("whatsapp_connections").update({
    proxy_health_ok: ok,
    proxy_checked_at: nowIso,
  }).eq("id", connection.id);

  let pausedQueue = false;
  if (secondConsecutiveFailure && connection.status === "connected") {
    // PAUSA a fila: `whatsapp_claim_send_jobs` só pega conexão `connected`.
    // NÃO existe fallback pro IP do VPS — sair pelo IP do datacenter depois de
    // ter saído por residencial é a troca de IP que a onda inteira existe pra
    // evitar, e seria lida pelo WhatsApp como conta comprometida.
    const { error: pauseError } = await supabase.from("whatsapp_connections").update({
      status: "attention",
      last_error: "Envios pausados: a proteção de IP desta conexão falhou duas vezes seguidas.",
    }).eq("id", connection.id);
    if (pauseError) {
      console.error(`${TAG} falha ao pausar a conexão`, { message: pauseError.message });
    } else {
      pausedQueue = true;
    }
  }

  return { ...base, ok, paused_queue: pausedQueue, message };
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

async function actionList(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("whatsapp_proxies")
    .select(PROXY_COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Falha ao listar o pool de IPs: ${error.message}`);
  const rows = (data ?? []) as ProxyRow[];

  const connectionIds = rows
    .map((row) => row.assigned_connection_id)
    .filter((id): id is string => Boolean(id));

  interface AssignedConnection {
    id: string;
    company_id: string;
    status: string;
    instance_name: string | null;
    proxy_health_ok: boolean | null;
    proxy_checked_at: string | null;
  }
  const connectionsById = new Map<string, AssignedConnection>();
  const companyNameById = new Map<string, string>();

  if (connectionIds.length) {
    const { data: connections, error: connectionsError } = await supabase
      .from("whatsapp_connections")
      .select("id, company_id, status, instance_name, proxy_health_ok, proxy_checked_at")
      .in("id", connectionIds);
    if (connectionsError) {
      throw new Error(`Falha ao ler as conexões vinculadas: ${connectionsError.message}`);
    }
    for (const row of connections ?? []) {
      connectionsById.set(row.id as string, row as unknown as AssignedConnection);
    }

    const companyIds = [...new Set((connections ?? []).map((c) => c.company_id as string))];
    if (companyIds.length) {
      const { data: companies, error: companiesError } = await supabase
        .from("companies")
        .select("id, name")
        .in("id", companyIds);
      if (companiesError) {
        throw new Error(`Falha ao ler as empresas: ${companiesError.message}`);
      }
      for (const row of companies ?? []) {
        companyNameById.set(row.id as string, (row.name as string) ?? "");
      }
    }
  }

  const proxies = rows.map((row) => {
    const connection = row.assigned_connection_id
      ? connectionsById.get(row.assigned_connection_id)
      : undefined;
    return {
      ...publicProxy(row),
      // Chave plana que a tela consome direto; o objeto `assigned` abaixo traz
      // o resto (estado da conexão e saúde do IP) pra quem quiser detalhar.
      assigned_company_name: connection
        ? companyNameById.get(connection.company_id) ?? null
        : null,
      assigned: connection
        ? {
          connection_id: connection.id,
          company_id: connection.company_id,
          company_name: companyNameById.get(connection.company_id) ?? null,
          connection_status: connection.status,
          instance_name: connection.instance_name,
          proxy_health_ok: connection.proxy_health_ok,
          proxy_checked_at: connection.proxy_checked_at,
        }
        : null,
    };
  });

  const monthlyTotal = rows.reduce((sum, row) => sum + (Number(row.monthly_cost) || 0), 0);

  return {
    ok: true,
    proxies,
    summary: {
      total: rows.length,
      free: rows.filter((r) => r.status === "free").length,
      assigned: rows.filter((r) => r.status === "assigned").length,
      blocked: rows.filter((r) => r.status === "blocked").length,
      monthly_cost_total: Math.round(monthlyTotal * 100) / 100,
    },
  };
}

async function actionCreate(supabase: SupabaseClient, body: Record<string, unknown>) {
  const label = requiredText(body.label, "um nome para identificar o IP");
  const host = requiredText(body.host, "o endereço (host) do proxy");
  const port = parsePort(body.port);
  const protocol = parseProtocol(body.protocol);
  const kind = parseKind(body.kind);
  const region = optionalText(body.region, 120);
  const notes = optionalText(body.notes, 2000);
  const monthlyCost = parseMonthlyCost(body.monthly_cost);
  const credential = parseCredential(body);

  // Ordem obrigatória: insere pra ter o id → grava o segredo com o nome
  // derivado dele → só então aponta secret_name. Se a gravação no Vault
  // falhar, a linha é APAGADA: proxy no pool sem credencial é armadilha que só
  // aparece na hora de atribuir, quando o tenant está esperando o QR.
  const { data: inserted, error: insertError } = await supabase
    .from("whatsapp_proxies")
    .insert({
      label,
      kind,
      host,
      port,
      protocol,
      region,
      notes,
      monthly_cost: monthlyCost,
      status: "free",
    })
    .select(PROXY_COLUMNS)
    .single();
  if (insertError || !inserted) {
    throw new Error(`Falha ao cadastrar o IP: ${insertError?.message ?? "sem retorno"}`);
  }
  let row = inserted as ProxyRow;

  if (credential) {
    const secretName = proxySecretName(row.id);
    try {
      await vaultUpsert(
        supabase,
        secretName,
        JSON.stringify({ username: credential.username, password: credential.password }),
      );
    } catch (error) {
      await supabase.from("whatsapp_proxies").delete().eq("id", row.id);
      console.error(`${TAG} vault falhou no create; linha removida`, {
        proxy_id: row.id,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new ValidationError(
        "vault_failed",
        "Não foi possível guardar a credencial do proxy no cofre. O IP não foi cadastrado. Tente novamente.",
        502,
      );
    }
    const { data: updated, error: updateError } = await supabase
      .from("whatsapp_proxies")
      .update({ secret_name: secretName })
      .eq("id", row.id)
      .select(PROXY_COLUMNS)
      .single();
    if (updateError || !updated) {
      throw new Error(
        `IP cadastrado, mas falhou ao apontar a credencial: ${updateError?.message ?? "sem retorno"}`,
      );
    }
    row = updated as ProxyRow;
  }

  return {
    ok: true,
    proxy: publicProxy(row),
    message: "IP cadastrado no pool e disponível para atribuição.",
  };
}

async function actionUpdate(supabase: SupabaseClient, body: Record<string, unknown>) {
  const proxyId = uuidOf(body.proxy_id, "o IP que será editado");
  const row = await loadProxy(supabase, proxyId);

  const patch: Record<string, unknown> = {};
  if ("label" in body) patch.label = requiredText(body.label, "um nome para identificar o IP");
  if ("region" in body) patch.region = optionalText(body.region, 120);
  if ("notes" in body) patch.notes = optionalText(body.notes, 2000);
  if ("monthly_cost" in body) patch.monthly_cost = parseMonthlyCost(body.monthly_cost);

  if ("status" in body) {
    const status = String(body.status ?? "").trim();
    if (!(MANUAL_STATUSES as readonly string[]).includes(status)) {
      // `assigned` é derivado da atribuição, nunca digitado: setá-lo à mão
      // deixaria a tabela dizendo "em uso" sem nenhuma conexão apontada.
      throw new ValidationError(
        "invalid_request",
        "O status só pode ser alterado entre livre e bloqueado. Em uso é definido pela atribuição a uma empresa.",
      );
    }
    if (row.status === "assigned") {
      throw new ValidationError(
        "proxy_in_use",
        "Este IP está em uso por uma empresa. Libere o IP primeiro, porque a troca exige reconexão do WhatsApp.",
        409,
      );
    }
    patch.status = status;
  }

  // Endereço de proxy em uso NÃO muda por baixo de uma instância viva: seria
  // exatamente a troca de IP silenciosa que esta onda existe pra evitar.
  const addressFields = ["host", "port", "protocol"].filter((field) => field in body);
  if (addressFields.length) {
    if (row.status === "assigned") {
      throw new ValidationError(
        "proxy_in_use",
        "Não é possível mudar o endereço de um IP em uso. Libere o IP desta empresa primeiro: trocar o endereço com a sessão aberta é a troca de IP que derruba número.",
        409,
      );
    }
    if ("host" in body) patch.host = requiredText(body.host, "o endereço (host) do proxy");
    if ("port" in body) patch.port = parsePort(body.port);
    if ("protocol" in body) patch.protocol = parseProtocol(body.protocol);
  }

  const credential = parseCredential(body);
  let requiresReapply = false;
  if (credential) {
    const secretName = row.secret_name || proxySecretName(row.id);
    try {
      await vaultUpsert(
        supabase,
        secretName,
        JSON.stringify({ username: credential.username, password: credential.password }),
      );
    } catch (error) {
      console.error(`${TAG} vault falhou na rotação de credencial`, {
        proxy_id: row.id,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new ValidationError(
        "vault_failed",
        "Não foi possível guardar a nova credencial do proxy no cofre. Nada foi alterado na credencial.",
        502,
      );
    }
    patch.secret_name = secretName;
    // Credencial nova só vale pra Evolution depois de reaplicar o proxy na
    // instância (que por sua vez exige reconexão).
    requiresReapply = row.status === "assigned";
  }

  if (!Object.keys(patch).length) {
    throw new ValidationError("invalid_request", "Nada para alterar.");
  }

  const { data: updated, error: updateError } = await supabase
    .from("whatsapp_proxies")
    .update(patch)
    .eq("id", row.id)
    .select(PROXY_COLUMNS)
    .single();
  if (updateError || !updated) {
    throw new Error(`Falha ao atualizar o IP: ${updateError?.message ?? "sem retorno"}`);
  }

  return {
    ok: true,
    proxy: publicProxy(updated as ProxyRow),
    requires_reapply: requiresReapply,
    requires_reconnect: requiresReapply,
    message: requiresReapply
      ? "Credencial atualizada no cofre. Reatribua este IP à empresa para aplicar: o WhatsApp dela vai pedir um QR novo."
      : "IP atualizado.",
  };
}

async function actionDelete(supabase: SupabaseClient, body: Record<string, unknown>) {
  const proxyId = uuidOf(body.proxy_id, "o IP que será removido");
  const row = await loadProxy(supabase, proxyId);

  if (row.status === "assigned" || row.assigned_connection_id) {
    throw new ValidationError(
      "proxy_in_use",
      "Este IP está em uso por uma empresa. Libere o IP primeiro, o que já força a reconexão consciente do WhatsApp dela.",
      409,
    );
  }

  // Segredo ANTES da linha: apagar a linha primeiro deixaria o segredo órfão no
  // cofre, sem ninguém saber a qual IP ele pertencia.
  if (row.secret_name) {
    try {
      await vaultDelete(supabase, row.secret_name);
    } catch (error) {
      console.error(`${TAG} vault falhou no delete`, {
        proxy_id: row.id,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new ValidationError(
        "vault_failed",
        "Não foi possível apagar a credencial do proxy no cofre. O IP não foi removido. Tente novamente.",
        502,
      );
    }
  }

  const { error: deleteError } = await supabase
    .from("whatsapp_proxies")
    .delete()
    .eq("id", row.id);
  if (deleteError) throw new Error(`Falha ao remover o IP: ${deleteError.message}`);

  return { ok: true, proxy_id: row.id, message: "IP removido do pool." };
}

async function actionAssign(supabase: SupabaseClient, body: Record<string, unknown>) {
  const connectionId = uuidOf(body.connection_id, "a conexão de WhatsApp");
  const proxyId = uuidOf(body.proxy_id, "o IP do pool");

  const connection = await loadConnection(supabase, connectionId);
  if (connection.provider !== "evolution_qr") {
    throw new ValidationError(
      "provider_not_supported",
      "Esta conexão é oficial pela Meta e não sai por IP dedicado.",
      409,
    );
  }

  // A credencial é resolvida ANTES de mexer no banco: se o segredo do Vault
  // sumiu, nada foi mutado e o IP não fica reservado num meio-estado que só
  // aparece na próxima tentativa.
  const candidate = await loadProxy(supabase, proxyId);
  const config = await buildProxyConfig(supabase, candidate);

  // Atômica: trava a linha, libera o IP anterior desta conexão, recusa IP
  // bloqueado ou já atribuído a outra empresa (1 IP por conexão, pra sempre).
  const { data: assigned, error: assignError } = await supabase.rpc("whatsapp_assign_proxy", {
    p_connection_id: connectionId,
    p_proxy_id: proxyId,
  });
  if (assignError) {
    // A RPC já fala PT-BR nos casos de negócio (bloqueado, inexistente, em uso).
    throw new ValidationError("assign_failed", assignError.message, 409);
  }
  const row = (Array.isArray(assigned) ? assigned[0] : assigned) as ProxyRow | null;
  if (!row?.id) throw new Error("A atribuição não retornou o IP aplicado.");

  const proxyRow: ProxyRow = {
    ...row,
    secret_name: row.secret_name ?? null,
  };

  let appliedToInstance = false;
  let warning: string | null = null;

  if (!connection.instance_name) {
    warning =
      "A empresa ainda não tem instância criada. O IP será aplicado automaticamente quando ela conectar o WhatsApp.";
  } else {
    try {
      await setInstanceProxy(connection.instance_name, config);
      appliedToInstance = true;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      const message = scrubCredential(
        error instanceof Error ? error.message : String(error),
        config,
      );
      console.error(`${TAG} setInstanceProxy falhou`, { proxy_id: proxyRow.id, message });
      // O vínculo no banco PERMANECE (o IP continua reservado pra esta
      // conexão, que é o que queremos: IP fixo). O que não aconteceu foi a
      // aplicação na instância — e isso é dito na resposta, não escondido.
      await supabase.from("whatsapp_proxies").update({
        last_check_at: new Date().toISOString(),
        last_check_ok: false,
        last_error: `Não foi possível aplicar na instância: ${message}`.slice(0, 500),
      }).eq("id", proxyRow.id);
      await supabase.from("whatsapp_connections").update({
        proxy_health_ok: false,
        proxy_checked_at: new Date().toISOString(),
      }).eq("id", connection.id);
      throw new ValidationError(
        "apply_failed",
        "O IP foi reservado para esta empresa, mas o servidor de WhatsApp não aceitou a configuração agora. Tente atribuir novamente em instantes.",
        502,
      );
    }
  }

  return {
    ok: true,
    proxy: publicProxy(proxyRow),
    connection_id: connection.id,
    company_id: connection.company_id,
    applied_to_instance: appliedToInstance,
    // EXPLÍCITO de propósito: o socket do Baileys só assume o proxy quando
    // REABRE. Enquanto a empresa não escanear um QR novo, ela continua saindo
    // pelo IP antigo. Quem chama precisa avisar o cliente.
    requires_reconnect: appliedToInstance,
    ...(warning ? { warning } : {}),
    message: appliedToInstance
      ? "IP atribuído. A empresa precisa reconectar o WhatsApp (QR novo) para começar a sair por ele."
      : "IP atribuído.",
  };
}

async function actionRelease(supabase: SupabaseClient, body: Record<string, unknown>) {
  const connectionId = uuidOf(body.connection_id, "a conexão de WhatsApp");
  const connection = await loadConnection(supabase, connectionId);

  let removedFromInstance = false;
  let warning: string | null = null;

  if (connection.instance_name) {
    try {
      await setInstanceProxy(connection.instance_name, null);
      removedFromInstance = true;
    } catch (error) {
      if (error instanceof EvolutionConfigError || error instanceof EvolutionApiError) {
        // Best-effort: o vínculo no banco é desfeito de qualquer forma, senão o
        // IP fica preso num tenant que ninguém consegue mais mexer.
        warning =
          "O servidor de WhatsApp não confirmou a remoção do IP na instância. O vínculo foi desfeito aqui; confira a instância depois.";
        console.warn(`${TAG} setInstanceProxy(null) falhou`, { message: error.message });
      } else {
        throw error;
      }
    }
  }

  const { data: released, error: releaseError } = await supabase.rpc("whatsapp_release_proxy", {
    p_connection_id: connectionId,
  });
  if (releaseError) throw new Error(`Falha ao liberar o IP: ${releaseError.message}`);

  // Conexão que continua 'connected' depois de perder o IP é estado inconsistente
  // em dois sentidos, e os dois são ruins:
  //   1. A fila continuaria enviando, e na próxima reabertura de socket a
  //      instância sairia pelo IP do VPS — a troca de IP silenciosa que esta
  //      onda inteira existe pra evitar.
  //   2. `whatsapp_release_proxy` zera `warmup_started_at`, e quem grava o valor
  //      de volta é a transição para 'connected'. Sem passar por essa transição,
  //      a conexão ficaria presa no dia 0 do aquecimento (20 msgs/dia) pra sempre.
  // Por isso a liberação derruba a conexão para 'attention': pausa a fila (o
  // claim só pega 'connected') e força uma reconexão consciente, que religa o
  // aquecimento no ponto certo.
  let queuePaused = false;
  if (released === true && connection.status === "connected") {
    const { error: pauseError } = await supabase
      .from("whatsapp_connections")
      .update({
        status: "attention",
        last_error:
          "O IP de proteção desta conexão foi removido. Reconecte o WhatsApp lendo um QR Code novo para voltar a enviar.",
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("company_id", connection.company_id);
    if (pauseError) {
      console.error(`${TAG} falha ao pausar a conexão após liberar o IP`, {
        message: pauseError.message,
      });
    } else {
      queuePaused = true;
    }
  }

  return {
    ok: true,
    connection_id: connection.id,
    had_proxy: released === true,
    removed_from_instance: removedFromInstance,
    queue_paused: queuePaused,
    // Sem proxy, a instância volta a sair pelo IP do VPS na próxima reabertura
    // de socket — que é justamente por isso que liberar é operação consciente,
    // feita só quando o IP vai ser trocado ou descartado.
    requires_reconnect: removedFromInstance,
    ...(warning ? { warning } : {}),
    message: released !== true
      ? "Esta conexão não tinha IP vinculado."
      : queuePaused
      ? "IP liberado e devolvido ao pool. Os envios desta empresa estão pausados até ela reconectar o WhatsApp com um QR Code novo."
      : "IP liberado e devolvido ao pool.",
  };
}

async function actionHealthcheck(supabase: SupabaseClient, body: Record<string, unknown>) {
  let rows: ProxyRow[];
  if (body.proxy_id !== undefined && body.proxy_id !== null) {
    rows = [await loadProxy(supabase, uuidOf(body.proxy_id, "o IP que será testado"))];
  } else {
    const { data, error } = await supabase
      .from("whatsapp_proxies")
      .select(PROXY_COLUMNS)
      .eq("status", "assigned")
      .order("last_check_at", { ascending: true, nullsFirst: true });
    if (error) throw new Error(`Falha ao listar os IPs atribuídos: ${error.message}`);
    rows = (data ?? []) as ProxyRow[];
  }

  const results: HealthResult[] = [];
  for (const row of rows) {
    results.push(await healthcheckProxy(supabase, row));
  }

  return {
    ok: true,
    checked: results.length,
    failed: results.filter((r) => r.ok === false).length,
    paused: results.filter((r) => r.paused_queue).length,
    results,
    /** Honestidade de contrato: ver o comentário do bloco de healthcheck. */
    verification_mode: results.some((r) => r.exit_ip_check.status === "ok")
      ? "evolution_e_ip_de_saida"
      : "somente_evolution",
  };
}

// ---------------------------------------------------------------------------
// Gate + roteamento
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed", message: "Método não suportado." }, 405);
  }

  try {
    // ---- 1. Authorization Bearer obrigatório
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return json(req, {
        error: "unauthorized",
        message: "Sessão expirada. Faça login novamente.",
      }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Client com o JWT do chamador só pra resolver QUEM é.
    const withJwt = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await withJwt.auth.getUser();
    const userId = userData?.user?.id;
    if (userError || !userId) {
      return json(req, {
        error: "unauthorized",
        message: "Sessão expirada. Faça login novamente.",
      }, 401);
    }

    // ---- 2. super_admin ESTRITO (has_role, não is_admin_user).
    // is_admin_user() liga com QUALQUER linha em admin_permissions, o que
    // inclui vendedor-admin. Pool de IP é infra da Dominex: só o master.
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: isSuperAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (roleError) {
      console.error(`${TAG} has_role falhou`, { message: roleError.message });
      return json(req, {
        error: "internal_error",
        message: "Falha ao verificar suas permissões.",
      }, 500);
    }
    if (isSuperAdmin !== true) {
      return json(req, {
        error: "forbidden",
        message: "Somente o administrador master pode gerenciar os IPs de WhatsApp.",
      }, 403);
    }

    // ---- 3. Ação
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      // Corpo vazio cai no invalid_action abaixo.
    }
    const action = String(body?.action ?? "").trim();

    let payload: unknown;
    switch (action) {
      case "list":
        payload = await actionList(supabase);
        break;
      case "create":
        payload = await actionCreate(supabase, body);
        break;
      case "update":
        payload = await actionUpdate(supabase, body);
        break;
      case "delete":
        payload = await actionDelete(supabase, body);
        break;
      case "assign":
        payload = await actionAssign(supabase, body);
        break;
      case "release":
        payload = await actionRelease(supabase, body);
        break;
      case "healthcheck":
        payload = await actionHealthcheck(supabase, body);
        break;
      default:
        return json(req, {
          error: "invalid_action",
          message: "Ação inválida. Use list, create, update, delete, assign, release ou healthcheck.",
        }, 400);
    }

    return json(req, payload, 200);
  } catch (error) {
    if (error instanceof ValidationError) {
      return json(req, { error: error.code, message: error.message }, error.status);
    }
    if (error instanceof EvolutionConfigError) {
      return json(req, { error: "whatsapp_unconfigured", message: error.message }, 503);
    }
    if (error instanceof EvolutionApiError) {
      console.error(`${TAG} evolution error`, { message: error.message });
      return json(req, {
        error: "evolution_error",
        message: "Não foi possível falar com o servidor de WhatsApp. Tente novamente em instantes.",
      }, error.status >= 400 && error.status < 600 ? error.status : 502);
    }
    console.error(`${TAG} unexpected error`, {
      message: error instanceof Error ? error.message : String(error),
    });
    return json(req, {
      error: "internal_error",
      message: "Falha inesperada ao gerenciar os IPs de WhatsApp.",
    }, 500);
  }
});

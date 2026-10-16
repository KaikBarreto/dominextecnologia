// =============================================================================
// whatsapp-proxy-healthcheck — vigilância contínua do pool de IPs residenciais.
// =============================================================================
// Edge de PRIVILÉGIO MÍNIMO, chamada SÓ por pg_cron/pg_net a cada 15 minutos.
//
// POR QUE ELA EXISTE SEPARADA DA `whatsapp-proxy-manage`:
//   A `whatsapp-proxy-manage` é portão de JWT de `super_admin` e tem as 7 ações
//   do pool (create, update, delete, assign, release, list, healthcheck). Cron
//   NÃO tem JWT: o padrão do projeto pra edge de cron é
//   `Authorization: Bearer <CRON_SECRET>` + verify_jwt=false (igual
//   `whatsapp-send-worker`, `collect-db-health`, `dfe-sync-cron`).
//   Ampliar o portão da `whatsapp-proxy-manage` pra aceitar o CRON_SECRET
//   significaria que um vazamento daquele segredo daria poder de `create` e
//   `delete` no pool de IPs e de leitura de credencial. Então o cron não fala
//   com ela: fala com ESTA, que só olha e só escreve saúde.
//
// INVARIANTES DESTE ARQUIVO (não acrescente ação aqui — crie outra edge):
//  1. ESCRITA PERMITIDA, lista FECHADA:
//       whatsapp_proxies     → last_check_at, last_check_ok, last_error
//       whatsapp_connections → proxy_health_ok, proxy_checked_at
//                              + status='attention'/last_error na 2ª falha
//     NADA de create, update de dados do IP (host/porta/protocolo/label/custo/
//     status do pool), delete, assign ou release. Essas são da
//     `whatsapp-proxy-manage`, atrás de super_admin, e é assim que fica.
//  2. NUNCA lê o Vault. Não importa e não chama `vault_*`. Ela não precisa:
//     `findInstanceProxy` compara host/porta, e host/porta estão na tabela.
//     É exatamente isso que torna o privilégio mínimo real — o CRON_SECRET,
//     se vazar, não abre nenhuma credencial de proxy.
//  3. NUNCA grava credencial (nem trecho, nem mascarada) em coluna ou log.
//     Atenção: `whatsapp_connections.last_error` é LEGÍVEL PELO TENANT (policy
//     de SELECT por company_id). Todo texto persistido passa por
//     `scrubCredential()`.
//  4. NÃO EXISTE FALLBACK PRO IP DO VPS. Proxy com problema PAUSA a fila
//     (conexão vai pra `attention`, e `whatsapp_claim_send_jobs` só pega
//     conexão `connected`). Mandar a instância sair direto pelo IP do
//     datacenter depois de ter saído por residencial é exatamente a troca de
//     IP que a onda inteira existe pra evitar, e o WhatsApp lê isso como conta
//     comprometida.
//  5. Backward-compatible com a migration AUSENTE: sem a tabela
//     `whatsapp_proxies`, responde 200 `{ ok: true, checked: 0,
//     reason: "pool_indisponivel" }`. A edge pode subir antes da migration
//     (ordem de deploy: servidor antes do resto), e um cron de 15 minutos
//     gritando 500 polui o log pra sempre.
//  6. Copy de erro em PT-BR.
//
// Corpo (opcional): { proxy_id } pra checar um IP só. Sem corpo = todos os
// atribuídos.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  connectionState,
  EvolutionApiError,
  EvolutionConfigError,
  findInstanceProxy,
} from "../_shared/evolution-client.ts";

const TAG = "[whatsapp-proxy-healthcheck]";

/** Colunas lidas do pool. Só o necessário pro veredito — nem `secret_name`. */
const PROXY_COLUMNS = "id, label, host, port, status, assigned_connection_id, last_check_ok";

interface ProxyRow {
  id: string;
  label: string;
  host: string;
  port: number;
  status: string;
  assigned_connection_id: string | null;
  last_check_ok: boolean | null;
}

interface ConnectionRow {
  id: string;
  company_id: string;
  status: string;
  instance_name: string | null;
}

interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

/** Comparação em tempo constante. Cópia do `whatsapp-send-worker`. */
function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i++) result |= left[i] ^ right[i];
  return result === 0;
}

/**
 * Distingue "a migration da onda 3 ainda não foi aplicada neste ambiente" de um
 * erro de verdade. 42P01 = relation does not exist; PGRST205 = tabela fora do
 * schema cache do PostgREST. Cópia da `whatsapp-connect`.
 */
function isMissingTable(error: PostgrestLikeError | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  if (code === "42P01" || code === "PGRST205") return true;
  return /schema cache/i.test(String(error.message ?? ""));
}

/**
 * Remove credencial de qualquer texto antes de logar ou gravar em coluna.
 *
 * POR QUE ISSO EXISTE: a mensagem de erro da Evolution é o corpo que ELA
 * devolve, e um erro do `/proxy/find` pode ecoar a configuração da instância —
 * configuração que carrega usuário/senha do proxy. Sem este filtro, a
 * credencial acabaria em `whatsapp_proxies.last_error` e, pior, em
 * `whatsapp_connections.last_error`, que o TENANT lê.
 *
 * DIFERENÇA EM RELAÇÃO À `whatsapp-connect`/`whatsapp-proxy-manage`: lá o
 * `scrubCredential` recebe a `EvolutionProxyConfig` e apaga o valor exato do
 * segredo. Aqui NÃO temos a credencial em mãos de propósito (invariante 2: esta
 * edge não toca no Vault), então a limpeza é por FORMA, não por valor:
 * userinfo de URL e campos username/password de JSON ou querystring.
 */
function scrubCredential(text: string): string {
  return String(text)
    // socks5://usuario:senha@host:porta
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, "$1***@")
    // "password":"...", password=..., 'username': '...'
    .replace(/(["']?(?:pass|password|senha|user|username|usuario)["']?\s*[:=]\s*)(["']?)[^"'&,}\s]+\2/gi, "$1***");
}

/** Texto seguro pra coluna: limpo de credencial e capado. */
function safeColumnText(text: string, max = 500): string {
  return scrubCredential(text).slice(0, max);
}

interface HealthResult {
  proxy_id: string;
  label: string;
  connection_id: string | null;
  company_id: string | null;
  /** null = não foi possível concluir (sem instância, Evolution não configurada). */
  ok: boolean | null;
  evolution_proxy_enabled: boolean | null;
  address_matches: boolean | null;
  /** Informação, NUNCA critério — ver o comentário do veredito. */
  connection_state: string | null;
  /** true quando a conexão foi pausada agora (2ª falha consecutiva). */
  paused_queue: boolean;
  message: string;
}

/**
 * Grava o resultado nas colunas de SAÚDE do pool. Única escrita que esta edge
 * faz em `whatsapp_proxies` — lista fechada (invariante 1).
 */
async function writeProxyHealth(
  supabase: SupabaseClient,
  proxyId: string,
  nowIso: string,
  ok: boolean | null,
  errorMessage: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_proxies")
    .update({
      last_check_at: nowIso,
      last_check_ok: ok,
      last_error: errorMessage ? safeColumnText(errorMessage) : null,
    })
    .eq("id", proxyId);
  if (error) {
    console.error(`${TAG} falha ao gravar a saúde do IP`, {
      proxy_id: proxyId,
      message: scrubCredential(error.message),
    });
  }
}

async function checkProxy(supabase: SupabaseClient, row: ProxyRow): Promise<HealthResult> {
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
    paused_queue: false,
    message: "",
  };

  // Só IP atribuído é vigiado. IP livre não tem instância pra consultar, e
  // marcá-lo como falha poria um IP novo e saudável em suspeita só por ainda
  // não ter dono. Aqui nem gravamos nada: a varredura já filtra por
  // `status = 'assigned'`, então isto só acontece no modo { proxy_id }.
  if (!row.assigned_connection_id) {
    return {
      ...base,
      message: "IP sem conexão vinculada: a verificação pela Evolution não se aplica.",
    };
  }

  const { data: connectionData, error: connectionError } = await supabase
    .from("whatsapp_connections")
    .select("id, company_id, status, instance_name")
    .eq("id", row.assigned_connection_id)
    .maybeSingle();

  if (connectionError) {
    const message = "Não foi possível ler a conexão vinculada a este IP.";
    console.error(`${TAG} leitura da conexão falhou`, {
      proxy_id: row.id,
      message: scrubCredential(connectionError.message),
    });
    await writeProxyHealth(supabase, row.id, nowIso, null, message);
    return { ...base, message };
  }
  if (!connectionData) {
    const message = "A conexão vinculada a este IP não existe mais.";
    await writeProxyHealth(supabase, row.id, nowIso, false, message);
    return { ...base, ok: false, message };
  }
  const connection = connectionData as ConnectionRow;
  base.company_id = connection.company_id;

  if (!connection.instance_name) {
    const message = "A conexão vinculada ainda não tem instância criada no servidor de WhatsApp.";
    await writeProxyHealth(supabase, row.id, nowIso, null, message);
    return { ...base, message };
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

    // VEREDITO — idêntico ao da `whatsapp-proxy-manage` (ação `healthcheck`):
    // a instância está REALMENTE configurada com o IP que achamos?
    // O estado do socket entra como INFORMAÇÃO, não como critério: telefone
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
      // Ambiente sem Evolution configurada não é falha do IP — e não pode
      // pausar a fila de ninguém.
      await writeProxyHealth(supabase, row.id, nowIso, null, error.message);
      return { ...base, message: error.message };
    }
    ok = false;
    message = error instanceof EvolutionApiError
      ? `O servidor de WhatsApp não confirmou este IP: ${error.message}`
      : "Não foi possível falar com o servidor de WhatsApp para verificar este IP.";
  }

  // 2 falhas CONSECUTIVAS pausam a fila. O "consecutivas" sai do último
  // resultado gravado (`last_check_ok === false`), sem coluna de contador nova.
  // Uma falha isolada não pausa nada: oscilação de rede do fornecedor de proxy
  // é comum, e derrubar o WhatsApp do tenant a cada soluço seria pior que o
  // risco que estamos cobrindo.
  const secondConsecutiveFailure = !ok && row.last_check_ok === false;

  await writeProxyHealth(supabase, row.id, nowIso, ok, ok ? null : message);

  const { error: healthError } = await supabase
    .from("whatsapp_connections")
    .update({ proxy_health_ok: ok, proxy_checked_at: nowIso })
    .eq("id", connection.id);
  if (healthError) {
    console.error(`${TAG} falha ao gravar a saúde na conexão`, {
      connection_id: connection.id,
      message: scrubCredential(healthError.message),
    });
  }

  let pausedQueue = false;
  if (secondConsecutiveFailure && connection.status === "connected") {
    // PAUSA: `whatsapp_claim_send_jobs` só pega conexão `connected`.
    // Invariante 4 — não existe fallback pro IP do VPS.
    // `last_error` aqui é lido pelo TENANT: copy PT-BR, sem host, sem porta e
    // sem credencial. Pro operador, o detalhe técnico fica em
    // `whatsapp_proxies.last_error`, que é do painel master.
    const { error: pauseError } = await supabase
      .from("whatsapp_connections")
      .update({
        status: "attention",
        last_error: "Envios pausados: a proteção de IP desta conexão falhou duas vezes seguidas.",
      })
      .eq("id", connection.id);
    if (pauseError) {
      console.error(`${TAG} falha ao pausar a conexão`, {
        connection_id: connection.id,
        message: scrubCredential(pauseError.message),
      });
    } else {
      pausedQueue = true;
    }
  }

  return { ...base, ok, paused_queue: pausedQueue, message };
}

Deno.serve(async (req) => {
  // Sem CORS de propósito: não é edge de navegador. O único chamador é o
  // pg_cron via pg_net.
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed", message: "Método não suportado." }, 405);
  }

  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const provided = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || !provided || !timingSafeEqual(secret, provided)) {
    return json({ error: "unauthorized", message: "Acesso não autorizado." }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // Corpo vazio = varredura completa.
  }
  const rawProxyId = typeof body?.proxy_id === "string" ? body.proxy_id.trim() : "";
  const proxyId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawProxyId)
      ? rawProxyId
      : null;
  if (rawProxyId && !proxyId) {
    return json({ error: "invalid_request", message: "Informe um IP válido." }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let query = supabase.from("whatsapp_proxies").select(PROXY_COLUMNS);
  if (proxyId) {
    query = query.eq("id", proxyId);
  } else {
    // Só os que estão de fato em uso: `status = 'assigned'` E conexão apontada.
    query = query
      .eq("status", "assigned")
      .not("assigned_connection_id", "is", null)
      .order("last_check_at", { ascending: true, nullsFirst: true });
  }

  const { data, error } = await query;
  if (error) {
    // Migration da onda 3 ainda não aplicada neste ambiente: 200 silencioso
    // (invariante 5). Um cron de 15 min não pode virar 500 eterno no log.
    if (isMissingTable(error)) {
      return json({ ok: true, checked: 0, reason: "pool_indisponivel" }, 200);
    }
    console.error(`${TAG} falha ao listar os IPs atribuídos`, {
      message: scrubCredential(error.message),
    });
    return json(
      { error: "pool_read_failed", message: "Não foi possível listar os IPs do pool." },
      500,
    );
  }

  const rows = (data ?? []) as ProxyRow[];

  // `allSettled`: erro numa instância NUNCA aborta a varredura das outras —
  // mesmo padrão do `whatsapp-send-worker`.
  const settled = await Promise.allSettled(rows.map((row) => checkProxy(supabase, row)));
  const results: HealthResult[] = [];
  let crashed = 0;
  for (const item of settled) {
    if (item.status === "fulfilled") {
      results.push(item.value);
      continue;
    }
    crashed += 1;
    console.error(`${TAG} verificação de um IP falhou`, {
      message: scrubCredential(
        item.reason instanceof Error ? item.reason.message : String(item.reason),
      ),
    });
  }

  // Resposta sem credencial em NENHUM campo, nem mascarada — e sem host/porta
  // também: o log do cron não é lugar de endereço de proxy. Quem precisa do
  // endereço é o painel master, pela `whatsapp-proxy-manage`.
  return json(
    {
      ok: true,
      checked: results.length,
      ok_count: results.filter((r) => r.ok === true).length,
      failed_count: results.filter((r) => r.ok === false).length,
      /** Nem sucesso nem falha: sem instância, Evolution não configurada etc. */
      inconclusive_count: results.filter((r) => r.ok === null).length,
      ...(crashed ? { crashed } : {}),
      paused: results.filter((r) => r.paused_queue).map((r) => r.connection_id),
      results,
    },
    200,
  );
});

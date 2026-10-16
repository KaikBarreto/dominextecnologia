// =============================================================================
// whatsapp-connect — add-on "Avisos de WhatsApp".
// =============================================================================
// AUTENTICADA (verify_jwt=false; gate feito na função): Authorization Bearer +
// módulo 'whatsapp' ativo + role admin/gestor validada no servidor.
//
// Fluxo:
//   - Gate de auth via whatsapp-auth.ts → resolve company_id + service-role client.
//   - Nome de instância DETERMINÍSTICO por company (`dominex_<company_id>`).
//   - Consulta o estado REAL da instância na Evolution antes de decidir qualquer
//     coisa (sessão viva nunca troca de IP, nem é derrubada por falta de IP).
//   - Reserva um IP residencial do pool da Dominex e cria a instância JÁ atrás
//     dele (onda 3) — o socket do Baileys só assume proxy ao abrir.
//   - Aplica os defaults de comportamento humano da instância (/settings/set).
//   - Persiste instance_name / connection_status em company_whatsapp_settings.
//   - Devolve { qr, connection_status, instance_name } (PT-BR em erros).
//
// O tenant NÃO vê proxy em lugar nenhum da resposta: IP é detalhe de infra da
// Dominex, não benefício vendável (infra/whatsapp-evolution/README.md §5.4).
//
// Espelha o padrão asaas/fisqal: erro claro em PT-BR se a Evolution não estiver
// configurada (EvolutionConfigError). NUNCA finge sucesso.
// =============================================================================

import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { authorizeWhatsappManager, jsonResponse } from "../_shared/whatsapp-auth.ts";
import {
  assertEvolutionConfigured,
  connectInstance,
  connectionState,
  createInstance,
  EvolutionApiError,
  EvolutionConfigError,
  instanceNameForCompany,
  setInstanceProxy,
  setInstanceSettings,
} from "../_shared/evolution-client.ts";
import type { EvolutionProxyConfig } from "../_shared/evolution-client.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Proteção de IP (onda 3 — proxy residencial)
// ---------------------------------------------------------------------------
// REGRA DE PRODUTO, decidida pelo CEO: ou a conexão nasce protegida, ou o
// tenant é AVISADO. Não existe terceiro caminho "cria sem proxy e avisa
// depois". Quem vier "simplificar" isto num fallback silencioso está
// reintroduzindo exatamente o risco que a onda inteira existe pra remover:
// número saindo pelo IP de datacenter do VPS, junto com todos os outros
// tenants, é cluster de spam perfeito.
//
// A ÚNICA exceção é o pool VAZIO (zero linhas em whatsapp_proxies, ou a tabela
// ainda nem existe neste ambiente): aí o recurso simplesmente não está em
// operação — a Dominex não comprou IP nenhum — e a conexão é criada como
// sempre foi, com proxy_id = NULL. Pool COM IPs e nenhum livre é coisa
// diferente: é esgotamento, e aí a operação é recusada.

type ProxyPlan =
  /** Recurso desligado neste ambiente (pool vazio / tabela ausente). */
  | { state: "disabled" }
  /** A Dominex tem IPs, mas nenhum livre pra esta conexão. */
  | { state: "exhausted" }
  /** O pool existe mas não deu pra resolver um IP utilizável (erro técnico). */
  | { state: "unavailable"; reason: string }
  | { state: "ready"; proxyId: string; config: EvolutionProxyConfig };

interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
}

/**
 * Distingue "a migration da onda 3 ainda não foi aplicada neste ambiente" de
 * um erro de verdade. 42P01 = relation does not exist; PGRST205 = tabela fora
 * do schema cache do PostgREST. Isso é o que mantém o deploy desta edge
 * backward-compatible: subir a função antes da migration não derruba ninguém
 * (lei de ordem de deploy — servidor nunca passa a EXIGIR o que o resto do
 * sistema ainda não tem).
 */
function isMissingTable(error: PostgrestLikeError | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  if (code === "42P01" || code === "PGRST205") return true;
  return /schema cache/i.test(String(error.message ?? ""));
}

/**
 * Lê usuário/senha do proxy no Vault. Formato canônico gravado pela edge
 * `whatsapp-proxy-manage`: JSON {"username","password"}. Aceita também
 * "usuario:senha" por tolerância operacional.
 *
 * A credencial NUNCA é logada, nem devolvida em resposta HTTP.
 */
async function readProxyCredential(
  supabase: SupabaseClient,
  secretName: string,
): Promise<{ username?: string; password?: string }> {
  const { data, error } = await supabase.rpc("vault_read_tenant_secret", {
    p_name: secretName,
  });
  if (error) {
    throw new Error(`vault_read_tenant_secret falhou (${secretName}): ${error.message}`);
  }
  const raw = typeof data === "string" ? data.trim() : "";
  if (!raw) return {};
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { username?: unknown; password?: unknown };
      const username = typeof parsed.username === "string" ? parsed.username : undefined;
      const password = typeof parsed.password === "string" ? parsed.password : undefined;
      if (username || password) return { username, password };
    } catch {
      // Cai no formato plano abaixo.
    }
  }
  const sep = raw.indexOf(":");
  if (sep > 0) return { username: raw.slice(0, sep), password: raw.slice(sep + 1) };
  return {};
}

interface ProxyRow {
  id: string;
  host: string;
  port: number | string;
  protocol: string;
  secret_name: string | null;
  status?: string;
}

/** Monta a config da Evolution a partir da linha do pool + Vault. */
async function toReadyPlan(
  supabase: SupabaseClient,
  row: ProxyRow,
): Promise<ProxyPlan> {
  let credential: { username?: string; password?: string } = {};
  if (row.secret_name) {
    credential = await readProxyCredential(supabase, row.secret_name);
    // Proxy que declara ter credencial mas cuja credencial sumiu é armadilha:
    // configurar sem usuário/senha faria o fornecedor recusar o CONNECT e a
    // sessão nasceria morta. Melhor recusar e avisar.
    if (!credential.username) {
      return {
        state: "unavailable",
        reason: `credencial ausente no Vault para o proxy ${row.id}`,
      };
    }
  }
  const protocol = String(row.protocol ?? "http").toLowerCase();
  if (protocol !== "http" && protocol !== "https" && protocol !== "socks5") {
    return { state: "unavailable", reason: `protocolo inválido no proxy ${row.id}` };
  }
  return {
    state: "ready",
    proxyId: row.id,
    config: {
      host: row.host,
      port: row.port,
      protocol,
      ...(credential.username ? { username: credential.username } : {}),
      ...(credential.password ? { password: credential.password } : {}),
    },
  };
}

/**
 * Remove usuário/senha do proxy de qualquer texto antes de logar ou gravar.
 *
 * POR QUE: `whatsapp_connections.last_error` é LEGÍVEL PELO TENANT (policy de
 * SELECT por company_id). A mensagem de erro da Evolution é o corpo que ELA
 * devolve, e um erro de validação do /proxy/set pode ecoar o payload enviado,
 * que carrega a credencial do proxy da Dominex. Sem este filtro a credencial
 * sairia do Vault e apareceria numa coluna que o cliente lê.
 */
function scrubCredential(text: string, config: EvolutionProxyConfig | null): string {
  if (!config) return text;
  let safe = text;
  for (const secret of [config.password, config.username]) {
    if (typeof secret === "string" && secret.length >= 3) {
      safe = safe.split(secret).join("***");
    }
  }
  return safe;
}

/**
 * Resolve o IP desta conexão: reusa o que já está vinculado (o IP de uma
 * instância NUNCA muda) ou reserva um livre do pool, atomicamente, via
 * `whatsapp_assign_proxy` (que trava a linha e garante 1 IP por conexão).
 */
async function planProxy(
  supabase: SupabaseClient,
  connectionId: string,
): Promise<ProxyPlan> {
  // 1) O recurso está em operação neste ambiente?
  const { count, error: countError } = await supabase
    .from("whatsapp_proxies")
    .select("id", { count: "exact", head: true });
  if (countError) {
    if (isMissingTable(countError)) return { state: "disabled" };
    return { state: "unavailable", reason: `leitura do pool falhou: ${countError.message}` };
  }
  if (!count) return { state: "disabled" }; // pool VAZIO = recurso desligado

  // 2) Esta conexão já tem IP vinculado? Reusa — trocar de IP é o sinal que
  //    estamos tentando evitar. IP marcado como bloqueado é a exceção: aquele
  //    endereço queimou e precisa ser substituído.
  const { data: current, error: currentError } = await supabase
    .from("whatsapp_proxies")
    .select("id, host, port, protocol, secret_name, status")
    .eq("assigned_connection_id", connectionId)
    .maybeSingle();
  if (currentError) {
    return { state: "unavailable", reason: `leitura do IP atual falhou: ${currentError.message}` };
  }
  if (current && current.status !== "blocked") {
    return await toReadyPlan(supabase, current as ProxyRow);
  }

  // 3) Reserva um livre. Pega alguns candidatos: a reserva é atômica no banco,
  //    então duas conexões simultâneas disputando o mesmo IP fazem uma delas
  //    falhar — e ela tenta o próximo da lista em vez de devolver erro.
  const { data: candidates, error: candidatesError } = await supabase
    .from("whatsapp_proxies")
    .select("id, host, port, protocol, secret_name")
    .eq("status", "free")
    .is("assigned_connection_id", null)
    .order("created_at", { ascending: true })
    .limit(5);
  if (candidatesError) {
    return { state: "unavailable", reason: `busca de IP livre falhou: ${candidatesError.message}` };
  }
  if (!candidates?.length) return { state: "exhausted" }; // pool ESGOTADO

  for (const candidate of candidates) {
    const { data: assigned, error: assignError } = await supabase.rpc("whatsapp_assign_proxy", {
      p_connection_id: connectionId,
      p_proxy_id: (candidate as ProxyRow).id,
    });
    if (assignError) {
      // Corrida perdida, IP bloqueado nesse meio-tempo, etc. Tenta o próximo.
      console.warn("[whatsapp-connect] whatsapp_assign_proxy recusou um candidato", {
        proxy_id: (candidate as ProxyRow).id,
        message: assignError.message,
      });
      continue;
    }
    const row = (Array.isArray(assigned) ? assigned[0] : assigned) as ProxyRow | null;
    if (!row?.id) {
      return { state: "unavailable", reason: "whatsapp_assign_proxy devolveu linha vazia" };
    }
    // secret_name NULL é caso VÁLIDO: fornecedor que autentica pelo IP de
    // origem, sem usuário/senha. Não inventar nome de segredo aqui — isso
    // faria a edge procurar no Vault um segredo que nunca existiu e recusar a
    // conexão por "credencial ausente".
    return await toReadyPlan(supabase, { ...row, secret_name: row.secret_name ?? null });
  }

  return { state: "exhausted" };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed", message: "Método não suportado." }, 405);
  }

  try {
    const auth = await authorizeWhatsappManager(req);
    if (!auth.ok) return auth.response;
    const { companyId, supabase, userId } = auth;

    let body: { accepted_risk?: boolean; risk_terms_version?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Corpo vazio continua sendo rejeitado abaixo com uma mensagem de negócio.
    }
    if (body.accepted_risk !== true) {
      return jsonResponse(req, {
        error: "risk_acceptance_required",
        message: "Confirme que esta conexão por QR Code não é oficial e pode sofrer desconexão ou bloqueio.",
      }, 422);
    }

    // Falha cedo e claro se o VPS/chave não estiverem setados.
    assertEvolutionConfigured();

    const instanceName = instanceNameForCompany(companyId);

    // URL do webhook que a Evolution vai chamar (mesma base das edges).
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;
    const webhookSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET") ?? "";

    const acceptedAt = new Date().toISOString();
    const { data: connection, error: connectionError } = await supabase
      .from("whatsapp_connections")
      .upsert({
        company_id: companyId,
        provider: "evolution_qr",
        status: "connecting",
        instance_name: instanceName,
        risk_accepted_at: acceptedAt,
        risk_accepted_by: userId,
        risk_terms_version: body.risk_terms_version?.trim() || "2026-10-16",
        last_error: null,
      }, { onConflict: "company_id,provider" })
      .select("id")
      .single();
    if (connectionError || !connection) {
      throw new Error(connectionError?.message || "Falha ao registrar a conexão.");
    }

    // ---- Garante a linha de settings do tenant (idempotente).
    const { error: settingsError } = await supabase
      .from("company_whatsapp_settings")
      .upsert(
        { company_id: companyId, instance_name: instanceName },
        { onConflict: "company_id" },
      );
    if (settingsError) throw new Error(settingsError.message);

    // ---- Estado REAL da instância antes de decidir qualquer coisa sobre IP.
    // Sessão viva: (a) não troca de IP a quente — o socket do Baileys já está
    // aberto, e (b) não pode ser derrubada por pool esgotado. Por isso o probe
    // vem ANTES do planejamento de proxy.
    let liveState: "connected" | "qr" | "disconnected" | "absent" = "absent";
    try {
      liveState = await connectionState(instanceName);
    } catch (error) {
      if (error instanceof EvolutionConfigError) throw error;
      // 404 da Evolution = a instância ainda não existe. Qualquer outra falha
      // de rede cai no mesmo caminho e será reportada pelo create/connect.
      liveState = "absent";
    }

    let qr: string | null = null;
    let pairingCode: string | null = null;
    let connStatus: string = "qr";
    // Só o pool VAZIO (recurso desligado) grava proxy_id = NULL. Conexão
    // viva nunca tem o vínculo de IP apagado por aqui.
    let clearProxyLink = true;

    if (liveState === "connected") {
      // Já conectada: devolve o estado real e não mexe no IP.
      connStatus = "connected";
      clearProxyLink = false;
    } else {
      const plan = await planProxy(supabase, connection.id);
      clearProxyLink = plan.state === "disabled";

      if (plan.state === "exhausted" || plan.state === "unavailable") {
        if (plan.state === "unavailable") {
          console.error("[whatsapp-connect] proteção de IP indisponível", {
            company_id: companyId,
            reason: plan.reason,
          });
        } else {
          console.error("[whatsapp-connect] pool de IPs esgotado", { company_id: companyId });
        }
        // Não cria instância desprotegida. Devolve a conexão a um estado
        // honesto (desconectada) em vez de deixá-la presa em 'connecting'.
        await supabase.from("whatsapp_connections").update({
          status: "disconnected",
          last_error: "Sem IP de proteção disponível no pool para esta conexão.",
          last_seen_at: new Date().toISOString(),
        }).eq("id", connection.id).eq("company_id", companyId);
        await supabase.from("company_whatsapp_settings")
          .update({ connection_status: "disconnected" })
          .eq("company_id", companyId);

        return jsonResponse(req, {
          error: "proxy_unavailable",
          message: "A proteção de IP para esta conexão ainda não está disponível. Fale com o suporte.",
        }, 503);
      }

      const proxyConfig = plan.state === "ready" ? plan.config : null;

      // Instância existente com socket FECHADO: dá pra (re)aplicar o proxy
      // porque o connect a seguir reabre o socket — é a única janela em que o
      // Baileys assume um proxy novo. Quando não há proxy (recurso desligado),
      // NÃO chamamos setInstanceProxy(null): nunca removemos a proteção de uma
      // instância que já a tenha.
      const applyProxyAndReconnect = async () => {
        if (proxyConfig) await setInstanceProxy(instanceName, proxyConfig);
        const reconnected = await connectInstance(instanceName);
        qr = reconnected.qr;
        pairingCode = reconnected.pairingCode ?? null;
        connStatus = qr ? "qr" : "disconnected";
      };

      try {
        if (liveState === "absent") {
          try {
            // 4º parâmetro: a instância NASCE atrás do proxy, sem nunca ter
            // saído pelo IP do VPS.
            const created = await createInstance(
              instanceName,
              webhookUrl,
              webhookSecret,
              proxyConfig ?? undefined,
            );
            qr = created.qr;
            pairingCode = created.pairingCode ?? null;
            connStatus = qr ? "qr" : "disconnected";
          } catch (e) {
            // "already in use" / "already exists" → apareceu entre o probe e o
            // create (ou o probe falhou por rede): reaplica e reconecta.
            const alreadyExists = e instanceof EvolutionApiError &&
              /already|exists|in use|duplicate/i.test(e.message);
            if (!alreadyExists) throw e;
            await applyProxyAndReconnect();
          }
        } else {
          await applyProxyAndReconnect();
        }
      } catch (error) {
        const message = scrubCredential(
          error instanceof Error ? error.message : String(error),
          proxyConfig,
        );
        await supabase.from("whatsapp_connections").update({
          status: "error",
          last_error: message.slice(0, 500),
          last_seen_at: new Date().toISOString(),
        }).eq("id", connection.id).eq("company_id", companyId);
        throw error;
      }
    }

    // ---- Defaults de comportamento da instância (onda 3).
    // alwaysOnline: false → ficar online 24h é assinatura de servidor.
    // groupsIgnore: true → o número do tenant não participa de grupo.
    // readStatus/syncFullHistory: false → não confirma status nem baixa histórico.
    // readMessages: false → a leitura é PONTUAL antes de responder (feita pelo
    //   worker); marcar tudo como lido apagaria o aviso de não-lida no celular
    //   real da equipe do cliente.
    // Falha aqui NÃO pode impedir o tenant de receber o QR: loga e segue.
    try {
      await setInstanceSettings(instanceName, {
        alwaysOnline: false,
        groupsIgnore: true,
        readStatus: false,
        syncFullHistory: false,
        readMessages: false,
      });
    } catch (error) {
      console.warn("[whatsapp-connect] /settings/set falhou (não-fatal)", {
        company_id: companyId,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    // ---- Persiste o estado. connected_number só é conhecido no webhook de conexão.
    const connectionPatch: Record<string, unknown> = {
      status: connStatus,
      last_seen_at: new Date().toISOString(),
      last_error: null,
    };
    if (connStatus === "connected") connectionPatch.connected_at = new Date().toISOString();
    // Recurso de proxy desligado neste ambiente: registra explicitamente que
    // esta conexão não tem IP dedicado. (Com IP, quem grava proxy_id é a RPC
    // whatsapp_assign_proxy, atomicamente.)
    if (clearProxyLink) connectionPatch.proxy_id = null;

    const { error: connectionUpdateError } = await supabase
      .from("whatsapp_connections")
      .update(connectionPatch)
      .eq("id", connection.id)
      .eq("company_id", companyId);
    if (connectionUpdateError) throw new Error(connectionUpdateError.message);

    // ---- Aquecimento (onda 3): warmup_started_at É DIFERENTE de connected_at.
    // connected_at acima é reescrito a cada conexão (é "quando conectou da
    // última vez", legítimo e exibido em tela). warmup_started_at só pode
    // nascer UMA VEZ por reputação — reconectar no mesmo IP/número não zera a
    // reputação de ninguém, então não pode reiniciar o aquecimento.
    // Por isso este é um UPDATE SEPARADO e CONDICIONAL (.is("warmup_started_at",
    // null)): se fosse incluído no `connectionPatch` acima, o update único
    // sobrescreveria um warmup_started_at já existente a cada reconexão —
    // exatamente o bug que o CEO reportou (número maduro reiniciando pra
    // 20 msgs/dia por reconectar). A troca de NÚMERO (reputação nova de
    // verdade) é tratada no whatsapp-webhook, que é quem sabe o número
    // conectado; aqui não temos esse dado.
    if (connStatus === "connected") {
      const { error: warmupError } = await supabase
        .from("whatsapp_connections")
        .update({ warmup_started_at: new Date().toISOString() })
        .eq("id", connection.id)
        .eq("company_id", companyId)
        .is("warmup_started_at", null);
      if (warmupError) {
        console.warn("[whatsapp-connect] warmup_started_at não gravado (não-fatal)", {
          company_id: companyId,
          message: warmupError.message,
        });
      }
    }

    const settingsPatch: Record<string, unknown> = {
      instance_name: instanceName,
      connection_status: connStatus,
    };
    if (connStatus === "connected") settingsPatch.active_connection_id = connection.id;
    const { error: settingsUpdateError } = await supabase
      .from("company_whatsapp_settings")
      .update(settingsPatch)
      .eq("company_id", companyId);
    if (settingsUpdateError) throw new Error(settingsUpdateError.message);

    return jsonResponse(req, {
      connection_id: connection.id,
      instance_name: instanceName,
      connection_status: connStatus,
      qr,
      pairing_code: pairingCode,
      message: connStatus === "connected"
        ? "WhatsApp já conectado."
        : "Escaneie o QR code no WhatsApp do seu celular para conectar.",
    }, 200);
  } catch (err) {
    if (err instanceof EvolutionConfigError) {
      return jsonResponse(req, { error: "whatsapp_unconfigured", message: err.message }, 503);
    }
    if (err instanceof EvolutionApiError) {
      console.error("[whatsapp-connect] evolution error", { message: err.message });
      return jsonResponse(req, {
        error: "evolution_error",
        message: "Não foi possível conectar ao servidor de WhatsApp. Tente novamente em instantes.",
      }, err.status >= 400 && err.status < 600 ? err.status : 502);
    }
    console.error("[whatsapp-connect] unexpected error", {
      message: (err as Error)?.message ?? String(err),
    });
    // getCorsHeaders direto (auth pode não ter rodado).
    return new Response(
      JSON.stringify({ error: "internal_error", message: "Falha inesperada ao conectar o WhatsApp." }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json; charset=utf-8" } },
    );
  }
});

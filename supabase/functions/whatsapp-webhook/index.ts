// =============================================================================
// whatsapp-webhook — Onda 2 do add-on "Avisos de WhatsApp".
// =============================================================================
// SEM JWT de usuário (verify_jwt=false). Segurança = EVOLUTION_WEBHOOK_SECRET.
// A Evolution é configurada (em whatsapp-connect) pra mandar o secret no header
// `x-evolution-webhook-secret`. Comparamos em tempo constante. 401 se não bater.
//
// Eventos tratados (Evolution API v2):
//   - CONNECTION_UPDATE → atualiza connection_status em company_whatsapp_settings
//     (open→connected, connecting→qr, close→disconnected). Detecta BAN.
//   - MESSAGES_UPDATE / SEND_MESSAGE (ack de entrega) → marca whatsapp_events
//     como 'entregue' quando aplicável.
//   - MESSAGES_UPSERT (mensagem RECEBIDA do cliente) → detecta opt-out ("parar",
//     "sair", "cancelar") pra não enviar mais àquele número. Ver PENDÊNCIA: a
//     tabela whatsapp_opt_outs não está no contrato da Onda 1; gravamos de forma
//     tolerante (ignora se a tabela não existe). Grava também a CHAVE da
//     mensagem (remote_jid + message_id) em whatsapp_inbound_keys, pro worker
//     poder marcar a conversa como lida antes de responder — NUNCA o corpo da
//     mensagem, nem trecho, nem tamanho (a Evolution roda com
//     DATABASE_SAVE_DATA_NEW_MESSAGE: false justamente por isso).
//
// Resolve o tenant pelo `instance` do payload (== company_whatsapp_settings.instance_name).
// Sempre responde 200 pra eventos desconhecidos/não mapeados (evita retry infinito).
// =============================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseEvolutionDeliveryAck } from "../_shared/evolution-ack.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-evolution-webhook-secret",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Compara duas strings em tempo constante (anti timing-attack). */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** Estados da conexão da Evolution → nosso enum. 'close' com motivo de ban → 'banned'. */
function mapConnectionStatus(state: string, statusReason?: number): string {
  switch (String(state).toLowerCase()) {
    case "open":
      return "connected";
    case "connecting":
      return "qr";
    case "close":
      // 403 (DisconnectReason.forbidden) na Evolution/Baileys ≈ número banido.
      return statusReason === 403 ? "banned" : "disconnected";
    default:
      return "disconnected";
  }
}

/** Detecta intenção de opt-out numa mensagem recebida do cliente. */
function isOptOutText(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(parar|sair|cancelar|pare|stop|descadastrar|remover|nao quero|não quero)\b/.test(t);
}

/** Extrai o telefone (só dígitos, com DDI) do remoteJid do Baileys. */
function jidToPhone(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const digits = jid.split("@")[0]?.replace(/\D/g, "") ?? "";
  if (digits.length < 10) return null;
  return digits;
}

/**
 * É conversa 1:1 com um cliente? Grupo (`@g.us`), status/broadcast e canal
 * (`@newsletter`) não são — e não entram em `whatsapp_inbound_keys`.
 */
function isDirectChatJid(jid: string | null | undefined): boolean {
  if (!jid) return false;
  const lower = jid.toLowerCase();
  if (lower.endsWith("@g.us")) return false;
  if (lower.endsWith("@broadcast")) return false;
  if (lower.startsWith("status@")) return false;
  if (lower.includes("@newsletter")) return false;
  return true;
}

/**
 * Grava SÓ a CHAVE da mensagem recebida (remote_jid + message_id), pra que o
 * worker possa marcar a conversa como lida antes de responder.
 *
 * REGRA-LEI: nunca gravar o corpo da mensagem, nem um trecho, nem o tamanho.
 * A Evolution roda com `DATABASE_SAVE_DATA_NEW_MESSAGE: false` exatamente por
 * isso — a conversa do cliente do tenant não é dado nosso pra guardar.
 *
 * Falha aqui é engolida com `console.warn` e o webhook segue respondendo 200:
 * a Evolution reenfileira o evento INTEIRO em erro, e perder uma chave de
 * leitura é irrelevante perto de perder um opt-out.
 */
async function recordInboundKey(
  supabase: SupabaseClient,
  companyId: string,
  connectionId: string | null,
  remoteJid: string | null,
  messageId: unknown,
): Promise<void> {
  // Sem conexão resolvida não grava: o UNIQUE é (connection_id, message_id) e
  // NULL nunca conflita em Postgres — gravar assim acumularia duplicata.
  if (!connectionId) return;
  const id = String(messageId ?? "").trim();
  if (!id || !isDirectChatJid(remoteJid)) return;
  const phone = jidToPhone(remoteJid);
  if (!phone) return;
  try {
    const { error } = await supabase
      .from("whatsapp_inbound_keys")
      .upsert(
        {
          company_id: companyId,
          connection_id: connectionId,
          phone,
          remote_jid: remoteJid,
          message_id: id,
        },
        { onConflict: "connection_id,message_id", ignoreDuplicates: true },
      );
    if (error) {
      console.warn("[whatsapp-webhook] chave de mensagem recebida não gravada.", {
        message: error.message,
      });
    }
  } catch (err) {
    console.warn("[whatsapp-webhook] chave de mensagem recebida não gravada.", {
      message: (err as Error)?.message ?? String(err),
    });
  }
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

async function resolveCompanyByInstance(
  supabase: SupabaseClient,
  instanceName: string,
): Promise<{ company_id: string; connection_id: string | null } | null> {
  if (!instanceName) return null;
  const { data: connection } = await supabase
    .from("whatsapp_connections")
    .select("id, company_id")
    .eq("instance_name", instanceName)
    .maybeSingle();
  if (connection) return { company_id: connection.company_id, connection_id: connection.id };
  const { data: legacy } = await supabase
    .from("company_whatsapp_settings").select("company_id").eq("instance_name", instanceName).maybeSingle();
  return legacy ? { company_id: legacy.company_id, connection_id: null } : null;
}

type DeliveryEvent = { id: string; job_id: string | null; status: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * O ACK pode chegar enquanto o `sendText` ainda está retornando ao worker.
 * Espera brevemente pelo registro; se continuar ausente, o handler responde
 * 503 e a própria Evolution repete o webhook com backoff.
 */
async function findDeliveryEvent(
  supabase: SupabaseClient,
  companyId: string,
  providerMessageId: string | null,
  remotePhone: string | null,
): Promise<DeliveryEvent | null> {
  const delays = [0, 150, 350, 750];
  for (const delay of delays) {
    if (delay) await sleep(delay);

    if (providerMessageId) {
      const { data } = await supabase
        .from("whatsapp_events")
        .select("id, job_id, status")
        .eq("company_id", companyId)
        .eq("provider_message_id", providerMessageId)
        .maybeSingle();
      if (data) return data as DeliveryEvent;
      continue;
    }

    if (remotePhone) {
      const { data } = await supabase
        .from("whatsapp_events")
        .select("id, job_id, status")
        .eq("company_id", companyId)
        .eq("phone", remotePhone)
        .in("status", ["enviado", "entregue", "lido"])
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return data as DeliveryEvent;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // ---- Verificação do secret (header configurado no createInstance).
  const secret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  if (!secret || !secret.trim()) {
    console.error("[whatsapp-webhook] EVOLUTION_WEBHOOK_SECRET ausente — rejeitando.");
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const provided = req.headers.get("x-evolution-webhook-secret") ?? "";
  if (!provided || !timingSafeEqualStr(provided, secret)) {
    console.error("[whatsapp-webhook] secret do webhook inválido.");
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  // O payload da Evolution varia entre builds e eventos; a validação por evento
  // abaixo estreita cada campo antes de persistir.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: Record<string, any>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_body" }, 400);
  }

  // Evolution v2: { event, instance, data, ... }. Nome do evento pode vir
  // "connection.update" ou "CONNECTION_UPDATE" conforme o build.
  const event = String(payload?.event ?? "").toUpperCase().replace(/\./g, "_");
  const instanceName = String(payload?.instance ?? payload?.instanceName ?? "").trim();
  const data = payload?.data ?? {};

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const tenant = await resolveCompanyByInstance(supabase, instanceName);
  if (!tenant) {
    // 200 pra não gerar retry de uma instância que não conhecemos.
    console.warn("[whatsapp-webhook] instância desconhecida", { instanceName, event });
    return jsonResponse({ ok: true, ignored: "unknown_instance" }, 200);
  }
  const companyId = tenant.company_id;
  const connectionId = tenant.connection_id;

  try {
    // ----------------------------------------------------------------------
    // CONNECTION_UPDATE → connection_status (+ connected_number / connected_at /
    // warmup_started_at). connected_at é "quando conectou da última vez" (reescrito
    // sempre, aparece em tela). warmup_started_at é "quando a reputação atual
    // começou a contar" — só nasce uma vez por reputação, e só reinicia quando o
    // NÚMERO conectado muda de verdade (ver bloco de aquecimento abaixo).
    // ----------------------------------------------------------------------
    if (event === "CONNECTION_UPDATE") {
      const state = data?.state ?? data?.connection ?? "";
      const statusReason = Number(data?.statusReason ?? data?.lastDisconnect?.error?.output?.statusCode);
      const newStatus = mapConnectionStatus(state, Number.isFinite(statusReason) ? statusReason : undefined);

      const update: Record<string, unknown> = { connection_status: newStatus };
      let phone: string | null = null;
      if (newStatus === "connected") {
        // Número conectado: registra o telefone e marca o connected_at.
        phone = jidToPhone(data?.wuid ?? data?.jid ?? data?.me?.id ?? null);
        if (phone) update.connected_number = phone;
        update.connected_at = new Date().toISOString();
      }

      // ---- Lê o número/aquecimento ANTERIORES antes de sobrescrever qualquer
      // coisa: é a única forma de saber se o número que acabou de conectar é
      // o MESMO de antes (reconexão comum, não reinicia aquecimento) ou um
      // número DIFERENTE (reputação nova, reinicia incondicionalmente).
      // Fallback em company_whatsapp_settings.connected_number cobre o caso de
      // uma conexão legada sem display_number ainda preenchido em
      // whatsapp_connections.
      let previousDisplayNumber: string | null = null;
      let previousWarmupStartedAt: string | null = null;
      if (connectionId && newStatus === "connected") {
        const { data: prevConn } = await supabase
          .from("whatsapp_connections")
          .select("display_number, warmup_started_at")
          .eq("id", connectionId)
          .eq("company_id", companyId)
          .maybeSingle();
        previousDisplayNumber = prevConn?.display_number ?? null;
        previousWarmupStartedAt = prevConn?.warmup_started_at ?? null;
      }

      if (connectionId) {
        // `last_error` é LIDO PELO TENANT e renderizado como alarme vermelho.
        // Antes gravávamos `Sessão ${state}` com o estado cru do Baileys, o que
        // produzia "Sessão connecting" em tela: metade em inglês, e um alarme
        // vermelho para um estado perfeitamente normal (esperando a leitura do
        // QR). Estado intermediário não é erro: só desconexão de fato é.
        const connectionPatch: Record<string, unknown> = {
          status: newStatus,
          last_seen_at: new Date().toISOString(),
          last_error: newStatus === "disconnected"
            ? "O WhatsApp foi desconectado. Leia um QR Code novo para voltar a enviar."
            : null,
        };
        // Só zeramos o contador ao conectar. Escrever 1 aqui (como antes) em
        // qualquer evento não-conectado apagava a contagem real de falhas de
        // envio que o worker mantém, e podia tirar da pausa uma conexão que
        // já tinha batido 3 falhas e deveria estar em 'attention'.
        if (newStatus === "connected") connectionPatch.consecutive_failures = 0;
        if (phone) connectionPatch.display_number = phone;
        if (newStatus === "connected") connectionPatch.connected_at = new Date().toISOString();
        await supabase.from("whatsapp_connections").update(connectionPatch).eq("id", connectionId).eq("company_id", companyId);
      }

      const { data: currentSettings } = await supabase
        .from("company_whatsapp_settings")
        .select("active_connection_id, connected_number")
        .eq("company_id", companyId)
        .maybeSingle();
      if (newStatus === "connected" && connectionId && !currentSettings?.active_connection_id) {
        update.active_connection_id = connectionId;
      }
      await supabase
        .from("company_whatsapp_settings")
        .update(update)
        .eq("company_id", companyId);

      // ---- Aquecimento (onda 3): warmup_started_at.
      // Isolado em try/catch próprio e DEPOIS de tudo que importa pro resto do
      // evento (status, ban, propagação pra company_whatsapp_settings) já ter
      // sido gravado — falha aqui nunca pode atrasar nem quebrar detecção de
      // BAN nem opt-out. Só console.warn e segue, webhook continua 200.
      if (connectionId && newStatus === "connected") {
        try {
          const previousNumber = normalizePhone(previousDisplayNumber ?? currentSettings?.connected_number ?? null);
          const newNumber = normalizePhone(phone);
          // Só é "troca de número" quando os DOIS existem e são diferentes.
          // NULL → preenchido pela primeira vez (conexão nova, ou legado sem
          // display_number ainda) NÃO é troca — é a reputação nascendo, trata
          // igual ao fluxo normal (preenche só se null).
          const numberChanged = Boolean(previousNumber && newNumber && previousNumber !== newNumber);

          if (numberChanged) {
            // Número novo é reputação nova, mesmo que o IP não tenha mudado —
            // sobrescreve INCONDICIONALMENTE.
            const { error: warmupResetError } = await supabase
              .from("whatsapp_connections")
              .update({ warmup_started_at: new Date().toISOString() })
              .eq("id", connectionId)
              .eq("company_id", companyId);
            if (warmupResetError) {
              console.warn("[whatsapp-webhook] warmup_started_at (troca de número) não gravado", {
                message: warmupResetError.message,
              });
            }
          } else if (!previousWarmupStartedAt) {
            // Mesma regra do whatsapp-connect: só preenche se ainda está NULL
            // (update condicional) — nunca sobrescreve um aquecimento em curso
            // só porque a sessão reconectou.
            const { error: warmupFillError } = await supabase
              .from("whatsapp_connections")
              .update({ warmup_started_at: new Date().toISOString() })
              .eq("id", connectionId)
              .eq("company_id", companyId)
              .is("warmup_started_at", null);
            if (warmupFillError) {
              console.warn("[whatsapp-webhook] warmup_started_at (preenchimento inicial) não gravado", {
                message: warmupFillError.message,
              });
            }
          }
        } catch (warmupError) {
          console.warn("[whatsapp-webhook] aquecimento não processado (não-fatal)", {
            message: (warmupError as Error)?.message ?? String(warmupError),
          });
        }
      }

      return jsonResponse({ ok: true, connection_status: newStatus }, 200);
    }

    // ----------------------------------------------------------------------
    // Ack de ENTREGA → marca whatsapp_events e whatsapp_send_jobs.
    // Na Evolution 2.3.7 o payload é achatado: { keyId, remoteJid, status }.
    // Builds anteriores também podem mandar { key: { id }, update: { status } }.
    // ----------------------------------------------------------------------
    if (event === "MESSAGES_UPDATE" || event === "SEND_MESSAGE") {
      const updates = Array.isArray(data) ? data : [data];
      let unmatchedAcks = 0;
      for (const u of updates) {
        const ack = parseEvolutionDeliveryAck(u);
        if (!ack) continue;

        const remotePhone = jidToPhone(ack.remoteJid);
        const ev = await findDeliveryEvent(
          supabase,
          companyId,
          ack.providerMessageId,
          remotePhone,
        );
        if (!ev) {
          unmatchedAcks += 1;
          continue;
        }

        // Estado monotônico: uma entrega atrasada nunca rebaixa "lido" para
        // "entregue". Reprocessar o mesmo webhook também é idempotente.
        const read = ack.status === "read" || ev.status === "lido";
        const at = new Date().toISOString();
        const eventPatch = read
          ? { status: "lido", read_at: at, delivered_at: at }
          : { status: "entregue", delivered_at: at };
        const { error: eventUpdateError } = await supabase
          .from("whatsapp_events")
          .update(eventPatch)
          .eq("id", ev.id)
          .eq("company_id", companyId);
        if (eventUpdateError) {
          unmatchedAcks += 1;
          continue;
        }
        if (ev.job_id) {
          const { error: jobUpdateError } = await supabase.from("whatsapp_send_jobs")
            .update({ status: read ? "read" : "delivered" })
            .eq("id", ev.job_id)
            .eq("company_id", companyId);
          if (jobUpdateError) unmatchedAcks += 1;
        }
      }
      if (unmatchedAcks > 0) {
        // Evolution 2.3.7 repete webhooks 5xx com backoff. Não devolvemos 200
        // quando o worker ainda não gravou o provider_message_id, pois isso
        // perderia a confirmação para sempre.
        return jsonResponse({ error: "ack_pending", pending: unmatchedAcks }, 503);
      }
      return jsonResponse({ ok: true }, 200);
    }

    // ----------------------------------------------------------------------
    // MESSAGES_UPSERT (mensagem recebida) → detecção de OPT-OUT.
    // PENDÊNCIA: whatsapp_opt_outs não está no contrato da Onda 1. Gravamos de
    // forma tolerante (ignora se a tabela não existir). Não processa mensagens
    // que a PRÓPRIA instância enviou (fromMe).
    // ----------------------------------------------------------------------
    if (event === "MESSAGES_UPSERT") {
      const messages = Array.isArray(data?.messages)
        ? data.messages
        : Array.isArray(data)
        ? data
        : [data];
      for (const m of messages) {
        if (m?.key?.fromMe) continue;

        // Chave da mensagem recebida (nunca o corpo) → permite o worker marcar
        // a conversa como lida antes de responder. Não interfere no opt-out.
        await recordInboundKey(
          supabase,
          companyId,
          connectionId,
          typeof m?.key?.remoteJid === "string" ? m.key.remoteJid : null,
          m?.key?.id,
        );

        const text = m?.message?.conversation ??
          m?.message?.extendedTextMessage?.text ?? "";
        if (typeof text === "string" && text && isOptOutText(text)) {
          const phone = jidToPhone(m?.key?.remoteJid ?? null);
          if (phone) {
            try {
              await supabase
                .from("whatsapp_opt_outs")
                .upsert(
                  { company_id: companyId, phone, opted_out_at: new Date().toISOString() },
                  { onConflict: "company_id,phone" },
                );
              const { data: customers } = await supabase
                .from("customers")
                .select("id, phone, celular")
                .eq("company_id", companyId);
              const matchingIds = (customers ?? [])
                .filter((customer) => normalizePhone(customer.celular ?? customer.phone) === phone)
                .map((customer) => customer.id);
              if (matchingIds.length) {
                await supabase.from("customers").update({
                  whatsapp_notifications_enabled: false,
                  whatsapp_opt_out_at: new Date().toISOString(),
                }).eq("company_id", companyId).in("id", matchingIds);
              }
            } catch (_e) {
              console.warn("[whatsapp-webhook] whatsapp_opt_outs indisponível (pendência Onda 1).");
            }
          }
        }
      }
      return jsonResponse({ ok: true }, 200);
    }

    // Evento não mapeado — reconhece sem erro (anti-retry).
    return jsonResponse({ ok: true, ignored: event }, 200);
  } catch (err) {
    console.error("[whatsapp-webhook] erro ao processar", {
      event,
      message: (err as Error)?.message ?? String(err),
    });
    // 200 mesmo em erro pra não empilhar retry; o log guarda o problema.
    return jsonResponse({ ok: true, error_logged: true }, 200);
  }
});

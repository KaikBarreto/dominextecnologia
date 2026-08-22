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
//     tolerante (ignora se a tabela não existe).
//
// Resolve o tenant pelo `instance` do payload (== company_whatsapp_settings.instance_name).
// Sempre responde 200 pra eventos desconhecidos/não mapeados (evita retry infinito).
// =============================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function resolveCompanyByInstance(
  supabase: SupabaseClient,
  instanceName: string,
): Promise<{ company_id: string } | null> {
  if (!instanceName) return null;
  const { data } = await supabase
    .from("company_whatsapp_settings")
    .select("company_id")
    .eq("instance_name", instanceName)
    .maybeSingle();
  return data ?? null;
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

  try {
    // ----------------------------------------------------------------------
    // CONNECTION_UPDATE → connection_status (+ connected_number / connected_at).
    // ----------------------------------------------------------------------
    if (event === "CONNECTION_UPDATE") {
      const state = data?.state ?? data?.connection ?? "";
      const statusReason = Number(data?.statusReason ?? data?.lastDisconnect?.error?.output?.statusCode);
      const newStatus = mapConnectionStatus(state, Number.isFinite(statusReason) ? statusReason : undefined);

      const update: Record<string, unknown> = { connection_status: newStatus };
      if (newStatus === "connected") {
        // Número conectado: registra o telefone e marca o connected_at (base do aquecimento).
        const phone = jidToPhone(data?.wuid ?? data?.jid ?? data?.me?.id ?? null);
        if (phone) update.connected_number = phone;
        update.connected_at = new Date().toISOString();
      }
      await supabase
        .from("company_whatsapp_settings")
        .update(update)
        .eq("company_id", companyId);

      return jsonResponse({ ok: true, connection_status: newStatus }, 200);
    }

    // ----------------------------------------------------------------------
    // Ack de ENTREGA → marca whatsapp_events como 'entregue'.
    // MESSAGES_UPDATE traz updates de status (ack: 2=server, 3=delivered, 4=read).
    // ----------------------------------------------------------------------
    if (event === "MESSAGES_UPDATE" || event === "SEND_MESSAGE") {
      const updates = Array.isArray(data) ? data : [data];
      for (const u of updates) {
        const ack = Number(u?.update?.status ?? u?.status ?? u?.ack ?? 0);
        // ack >= 3 (DELIVERED) → entregue.
        if (ack >= 3) {
          const remotePhone = jidToPhone(u?.key?.remoteJid ?? u?.remoteJid ?? null);
          if (remotePhone) {
            // Marca o evento 'enviado' mais recente desse telefone como 'entregue'.
            const { data: ev } = await supabase
              .from("whatsapp_events")
              .select("id")
              .eq("company_id", companyId)
              .eq("phone", remotePhone)
              .eq("status", "enviado")
              .order("sent_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (ev) {
              await supabase
                .from("whatsapp_events")
                .update({ status: "entregue" })
                .eq("id", ev.id)
                .eq("company_id", companyId);
            }
          }
        }
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

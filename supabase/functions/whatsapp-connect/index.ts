// =============================================================================
// whatsapp-connect — Onda 2 do add-on "Avisos de WhatsApp".
// =============================================================================
// AUTENTICADA (verify_jwt=false; gate feito na função): Authorization Bearer +
// módulo 'whatsapp' ativo + can_manage_system (só quem gerencia o tenant).
//
// Fluxo:
//   - Gate de auth via whatsapp-auth.ts → resolve company_id + service-role client.
//   - Nome de instância DETERMINÍSTICO por company (`dominex_<company_id>`).
//   - Cria a instância na Evolution (se ainda não existe) OU reconecta uma
//     existente pra obter o QR code atual.
//   - Persiste instance_name / connection_status em company_whatsapp_settings.
//   - Devolve { qr, connection_status, instance_name } (PT-BR em erros).
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
} from "../_shared/evolution-client.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed", message: "Método não suportado." }, 405);
  }

  try {
    // Falha cedo e claro se o VPS/chave não estiverem setados.
    assertEvolutionConfigured();

    const auth = await authorizeWhatsappManager(req);
    if (!auth.ok) return auth.response;
    const { companyId, supabase } = auth;

    const instanceName = instanceNameForCompany(companyId);

    // URL do webhook que a Evolution vai chamar (mesma base das edges).
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;
    const webhookSecret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET") ?? "";

    // ---- Garante a linha de settings do tenant (idempotente).
    await supabase
      .from("company_whatsapp_settings")
      .upsert(
        { company_id: companyId, instance_name: instanceName },
        { onConflict: "company_id" },
      );

    // ---- Cria a instância; se já existe, reconecta pra pegar o QR atual.
    let qr: string | null = null;
    let pairingCode: string | null = null;
    let connStatus: string = "qr";

    try {
      const created = await createInstance(instanceName, webhookUrl, webhookSecret);
      qr = created.qr;
      pairingCode = created.pairingCode ?? null;
      connStatus = qr ? "qr" : "disconnected";
    } catch (e) {
      // "already in use" / "already exists" → a instância já existe: reconecta.
      const alreadyExists = e instanceof EvolutionApiError &&
        /already|exists|in use|duplicate/i.test(e.message);
      if (!alreadyExists) throw e;

      // Se já está conectada, não há QR — devolve o estado real.
      const state = await connectionState(instanceName);
      if (state === "connected") {
        connStatus = "connected";
      } else {
        const reconnected = await connectInstance(instanceName);
        qr = reconnected.qr;
        pairingCode = reconnected.pairingCode ?? null;
        connStatus = qr ? "qr" : "disconnected";
      }
    }

    // ---- Persiste o estado. connected_number só é conhecido no webhook de conexão.
    await supabase
      .from("company_whatsapp_settings")
      .update({ instance_name: instanceName, connection_status: connStatus })
      .eq("company_id", companyId);

    return jsonResponse(req, {
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

import { handleCors } from "../_shared/cors.ts";
import { authorizeWhatsappManager, jsonResponse } from "../_shared/whatsapp-auth.ts";
import { deleteInstance, EvolutionApiError, EvolutionConfigError } from "../_shared/evolution-client.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed", message: "Método não suportado." }, 405);
  }

  const auth = await authorizeWhatsappManager(req, { requireModule: false });
  if (!auth.ok) return auth.response;
  const { companyId, supabase } = auth;

  let connectionId = "";
  try {
    const body = await req.json();
    connectionId = String(body?.connection_id ?? "").trim();
  } catch {
    // Tratado abaixo.
  }
  if (!connectionId) {
    return jsonResponse(req, { error: "missing_connection", message: "Conexão não informada." }, 400);
  }

  const { data: connection } = await supabase
    .from("whatsapp_connections")
    .select("id, provider, instance_name")
    .eq("id", connectionId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!connection) return jsonResponse(req, { error: "not_found", message: "Conexão não encontrada." }, 404);

  // A remoção é best-effort: mesmo com a VPS indisponível, o servidor Dominex
  // pausa imediatamente a fila e não tenta redirecionar jobs pendentes.
  if (connection.provider === "evolution_qr" && connection.instance_name) {
    try {
      await deleteInstance(connection.instance_name);
    } catch (error) {
      if (!(error instanceof EvolutionApiError) && !(error instanceof EvolutionConfigError)) throw error;
      console.warn("[whatsapp-disconnect] Evolution indisponível; conexão local será pausada", {
        message: error.message,
      });
    }
  }

  await supabase
    .from("whatsapp_connections")
    .update({ status: "disconnected", next_send_at: null, last_seen_at: new Date().toISOString() })
    .eq("id", connection.id)
    .eq("company_id", companyId);
  await supabase
    .from("company_whatsapp_settings")
    .update({ active_connection_id: null, connection_status: "disconnected", connected_number: null })
    .eq("company_id", companyId)
    .eq("active_connection_id", connection.id);

  return jsonResponse(req, { ok: true }, 200);
});

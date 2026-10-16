import { handleCors } from "../_shared/cors.ts";
import { authorizeWhatsappManager, jsonResponse } from "../_shared/whatsapp-auth.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed", message: "Método não suportado." }, 405);
  }

  const auth = await authorizeWhatsappManager(req);
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

  const { data: connection, error } = await supabase
    .from("whatsapp_connections")
    .select("id, provider, status, instance_name, display_number, risk_accepted_at")
    .eq("id", connectionId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) return jsonResponse(req, { error: "query_failed", message: "Não foi possível consultar a conexão." }, 500);
  if (!connection) return jsonResponse(req, { error: "not_found", message: "Conexão não encontrada." }, 404);
  if (connection.status !== "connected") {
    return jsonResponse(req, { error: "not_connected", message: "Conecte o número antes de ativá-lo." }, 422);
  }
  if (connection.provider === "evolution_qr" && !connection.risk_accepted_at) {
    return jsonResponse(req, {
      error: "risk_acceptance_required",
      message: "Confirme os riscos da conexão por QR Code antes de ativá-la.",
    }, 422);
  }

  const settingsPatch: Record<string, unknown> = { active_connection_id: connection.id };
  if (connection.provider === "evolution_qr") {
    settingsPatch.instance_name = connection.instance_name;
    settingsPatch.connected_number = connection.display_number;
    settingsPatch.connection_status = "connected";
  }
  const { error: updateError } = await supabase
    .from("company_whatsapp_settings")
    .upsert({ company_id: companyId, ...settingsPatch }, { onConflict: "company_id" });
  if (updateError) {
    return jsonResponse(req, { error: "update_failed", message: "Não foi possível ativar a conexão." }, 500);
  }

  return jsonResponse(req, { ok: true, active_connection_id: connection.id }, 200);
});

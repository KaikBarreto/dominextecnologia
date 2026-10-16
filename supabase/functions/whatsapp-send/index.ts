// Entrada manual/autenticada. O envio real é sempre realizado pelo worker;
// esta função nunca conversa diretamente com a Evolution.
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { authorizeWhatsappManager, jsonResponse } from "../_shared/whatsapp-auth.ts";

const TRIGGERS = ["a_caminho", "em_andamento", "concluida"] as const;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed", message: "Método não suportado." }, 405);
  }

  try {
    const auth = await authorizeWhatsappManager(req);
    if (!auth.ok) return auth.response;
    const { companyId, supabase } = auth;

    let body: { os_id?: string; trigger?: string } = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse(req, { error: "invalid_body", message: "Requisição inválida." }, 400);
    }
    const osId = String(body.os_id ?? "").trim();
    const trigger = String(body.trigger ?? "").trim() as typeof TRIGGERS[number];
    if (!osId || !TRIGGERS.includes(trigger)) {
      return jsonResponse(req, { error: "invalid_request", message: "OS ou tipo de aviso inválido." }, 400);
    }

    const { data: os } = await supabase
      .from("service_orders")
      .select("id, company_id, customer_id")
      .eq("id", osId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!os) return jsonResponse(req, { error: "os_not_found", message: "Ordem de serviço não encontrada." }, 404);

    const eventKey = `os.${trigger}`;
    const { data: jobId, error } = await supabase.rpc("whatsapp_enqueue_transactional_job", {
      p_company_id: companyId,
      p_customer_id: os.customer_id,
      p_event_key: eventKey,
      p_source_type: "service_order",
      p_source_id: os.id,
      p_dedupe_key: `manual:${eventKey}:${os.id}:${crypto.randomUUID()}`,
      p_next_attempt_at: new Date().toISOString(),
    });
    if (error) throw error;
    if (!jobId) {
      return jsonResponse(req, {
        ok: true,
        skipped: "not_eligible",
        message: "Aviso não enfileirado. Verifique conexão, automação e autorização do cliente.",
      }, 200);
    }
    return jsonResponse(req, { ok: true, status: "queued", job_id: jobId, message: "Aviso adicionado à fila." }, 202);
  } catch (error) {
    console.error("[whatsapp-send] enqueue failed", { message: error instanceof Error ? error.message : String(error) });
    return new Response(JSON.stringify({ error: "internal_error", message: "Não foi possível adicionar o aviso à fila." }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
    });
  }
});

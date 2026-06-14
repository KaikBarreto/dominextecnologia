// =============================================================================
// fisqal-nfse-status (Fase 2.2) — consulta/atualiza o status de uma emissão.
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
//
// Caminho de polling do MVP (webhook é best-effort).
// Body: { emissionId } (id local de nfse_emissions).
//   - GET /v1/nfse/{fisqal_dps_id} + /v1/nfse/{id}/status → atualiza status.
//   - Quando authorized: pega URLs assinadas de PDF e XML, salva
//     numero_nfse/chave_acesso/protocolo/emitida_em.
//   - Insere nfse_events.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../_shared/fiscal-auth.ts";
import {
  fisqal,
  FisqalApiError,
  FisqalConfigError,
} from "../_shared/fisqal-client.ts";

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(
      { error: "method_not_allowed", message: "Método HTTP não suportado." },
      405,
    );
  }

  try {
    const auth = await authorizeFiscalManager(req);
    if (!auth.ok) return auth.response;
    const { companyId, supabase } = auth;

    let body: { emissionId?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "invalid_body", message: "Requisição inválida." }, 400);
    }

    const emissionId = clean(body?.emissionId);
    if (!emissionId) {
      return jsonResponse(
        { error: "missing_emission", message: "Informe a emissão da nota fiscal." },
        400,
      );
    }

    // ---- Localiza a emissão (filtro defensivo por company_id).
    const { data: emission } = await supabase
      .from("nfse_emissions")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", emissionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!emission) {
      return jsonResponse(
        { error: "emission_not_found", message: "Nota fiscal não encontrada." },
        404,
      );
    }

    const dpsId = clean(emission.fisqal_dps_id);
    if (!dpsId) {
      return jsonResponse(
        {
          error: "no_fisqal_id",
          message: "Esta nota ainda não possui identificador na emissão fiscal.",
        },
        409,
      );
    }

    // ---- Consulta o documento + timeline de status (§8).
    const doc = await fisqal.get<Record<string, any>>(`/v1/nfse/${dpsId}`);
    let timeline: Record<string, any> | null = null;
    try {
      timeline = await fisqal.get<Record<string, any>>(`/v1/nfse/${dpsId}/status`);
    } catch (_) {
      // Timeline é complementar; falha não impede atualizar pelo doc.
      timeline = null;
    }

    const newStatus = clean(doc?.status) || emission.status;

    const update: Record<string, unknown> = { status: newStatus };

    // ---- Quando autorizada: busca URLs assinadas de PDF/XML e dados fiscais.
    if (newStatus === "authorized") {
      try {
        const pdf = await fisqal.get<Record<string, any>>(`/v1/nfse/${dpsId}/pdf`);
        const pdfUrl = clean(pdf?.url) || clean(pdf?.pdfUrl) || clean(pdf?.signedUrl);
        if (pdfUrl) update.pdf_url = pdfUrl;
      } catch (_) { /* best-effort */ }
      try {
        const xml = await fisqal.get<Record<string, any>>(`/v1/nfse/${dpsId}/xml`);
        const xmlUrl = clean(xml?.url) || clean(xml?.xmlUrl) || clean(xml?.signedUrl);
        if (xmlUrl) update.xml_url = xmlUrl;
      } catch (_) { /* best-effort */ }

      const numero = clean(doc?.numero_nfse) || clean(doc?.numeroNfse) || clean(doc?.numero);
      const chave = clean(doc?.chave_acesso) || clean(doc?.chaveAcesso);
      const protocolo = clean(doc?.protocolo);
      if (numero) update.numero_nfse = numero;
      if (chave) update.chave_acesso = chave;
      if (protocolo) update.protocolo = protocolo;
      update.emitida_em = clean(doc?.emitida_em) || clean(doc?.emitidaEm) ||
        new Date().toISOString();
    }

    if (newStatus === "rejected" || newStatus === "failed") {
      update.error_message = clean(doc?.message) || clean(doc?.motivo) ||
        "A nota foi rejeitada pela prefeitura/SEFIN.";
    }

    const { data: updated, error: updErr } = await supabase
      .from("nfse_emissions")
      .update(update)
      .eq("id", emission.id)
      .eq("company_id", companyId)
      .select("*")
      .single();

    if (updErr) {
      console.error("[fisqal-nfse-status] update error", {
        company_id: companyId.slice(0, 8) + "...",
        message: updErr.message,
      });
      return jsonResponse(
        { error: "persist_failed", message: "Falha ao atualizar o status da nota." },
        500,
      );
    }

    // ---- Evento de auditoria.
    await supabase.from("nfse_events").insert({
      nfse_emission_id: emission.id,
      company_id: companyId,
      event_type: "status_consultado",
      status: newStatus,
      payload: { doc, timeline },
    });

    return jsonResponse({ emission: updated, status: newStatus }, 200);
  } catch (err) {
    if (err instanceof FisqalConfigError) {
      return jsonResponse({ error: "fisqal_unconfigured", message: err.message }, 503);
    }
    if (err instanceof FisqalApiError) {
      return jsonResponse(
        { error: "fisqal_error", message: err.message, code: err.code },
        err.status >= 400 && err.status < 600 ? err.status : 502,
      );
    }
    console.error("[fisqal-nfse-status] unexpected error", {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse(
      { error: "internal_error", message: "Falha inesperada ao consultar o status." },
      500,
    );
  }
});

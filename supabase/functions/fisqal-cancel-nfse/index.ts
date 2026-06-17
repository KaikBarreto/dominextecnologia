// =============================================================================
// fisqal-cancel-nfse (Fase 2.4) — cancela uma NFS-e já autorizada.
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
//
// Body: { emissionId, motivo? } (id local de nfse_emissions).
//   - Carrega a emissão (escopo defensivo por company_id).
//   - Idempotente: se já 'cancelada'/'cancelled', devolve o estado atual (200).
//   - Só cancela nota AUTORIZADA ('authorized'/'autorizada') → senão 422 PT-BR.
//   - POST /v1/nfse/{fisqal_dps_id}/cancel (envia `motivoCancelamento`, §8).
//   - Atualiza status (cancelamento_pendente → cancelada conforme resposta) e
//     insere nfse_events. Escritas via service_role (filtradas por company_id).
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

// Estados que já representam nota autorizada (aceita pt/en por robustez).
const AUTHORIZED = new Set(["authorized", "autorizada"]);
// Estados que já representam cancelamento concluído (idempotência).
const CANCELLED = new Set(["cancelled", "cancelada"]);

/** Normaliza o status devolvido pela Fisqal para o vocabulário local. */
function mapCancelStatus(raw: string, fallback: string): string {
  const s = clean(raw).toLowerCase();
  if (!s) return fallback;
  if (CANCELLED.has(s)) return "cancelada";
  // Fila assíncrona da Fisqal: cancelamento aceito mas ainda processando.
  if (
    s === "pending" || s === "processing" || s === "sent" ||
    s === "cancelamento_pendente"
  ) {
    return "cancelamento_pendente";
  }
  return s;
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

    let body: { emissionId?: string; motivo?: string };
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
    // `motivoCancelamento` é OBRIGATÓRIO na Fisqal (minLength 15, maxLength 255).
    // Default ≥15 chars quando ausente; valida/trunca quando informado.
    const DEFAULT_MOTIVO = "Cancelamento solicitado pelo emitente"; // 37 chars
    let motivo = clean(body?.motivo);
    if (!motivo) {
      motivo = DEFAULT_MOTIVO;
    } else if (motivo.length < 15) {
      return jsonResponse(
        {
          error: "motivo_too_short",
          message:
            "Descreva o motivo do cancelamento com mais detalhes (mínimo de 15 caracteres).",
        },
        422,
      );
    } else if (motivo.length > 255) {
      motivo = motivo.slice(0, 255);
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

    const currentStatus = clean(emission.status).toLowerCase();

    // ---- Idempotência: já cancelada → devolve o estado atual sem chamar a Fisqal.
    if (CANCELLED.has(currentStatus)) {
      return jsonResponse(
        { emission, status: "cancelada", already_cancelled: true },
        200,
      );
    }

    // ---- Só cancela nota autorizada.
    if (!AUTHORIZED.has(currentStatus)) {
      return jsonResponse(
        {
          error: "not_cancellable",
          message:
            "Só é possível cancelar uma nota fiscal que já foi autorizada pela prefeitura.",
        },
        422,
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

    // ---- Cancela na Fisqal (§8). CancelNfseDto exige `motivoCancelamento`
    //      (string obrigatória, 15-255 chars) — confirmado no OpenAPI ao vivo.
    const cancelBody: Record<string, unknown> = { motivoCancelamento: motivo };
    const result = await fisqal.post<Record<string, any>>(
      `/v1/nfse/${dpsId}/cancel`,
      cancelBody,
    );

    const newStatus = mapCancelStatus(clean(result?.status), "cancelamento_pendente");

    const { data: updated, error: updErr } = await supabase
      .from("nfse_emissions")
      .update({ status: newStatus })
      .eq("id", emission.id)
      .eq("company_id", companyId)
      .select("*")
      .single();

    if (updErr) {
      console.error("[fisqal-cancel-nfse] update error", {
        company_id: companyId.slice(0, 8) + "...",
        message: updErr.message,
      });
      return jsonResponse(
        { error: "persist_failed", message: "Falha ao atualizar o status da nota." },
        500,
      );
    }

    // ---- Evento de auditoria (motivo e resposta crua ficam no payload).
    await supabase.from("nfse_events").insert({
      nfse_emission_id: emission.id,
      company_id: companyId,
      event_type: "cancelamento_solicitado",
      status: newStatus,
      payload: { motivo: motivo || null, response: result },
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
    console.error("[fisqal-cancel-nfse] unexpected error", {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse(
      { error: "internal_error", message: "Falha inesperada ao cancelar a nota." },
      500,
    );
  }
});

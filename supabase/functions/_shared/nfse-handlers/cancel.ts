// =============================================================================
// Handler de CANCELAMENTO de NFS-e (rotas: nfse-cancel / fisqal-cancel-nfse).
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
//
// Body: { emissionId, motivo? } (id local de nfse_emissions).
//   - Carrega a emissão (escopo defensivo por company_id).
//   - Idempotente: se já cancelada, devolve o estado atual (200).
//   - Só cancela nota AUTORIZADA → senão 422 PT-BR.
//   - Delega ao provedor ativo; atualiza status e insere nfse_events.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../fiscal-auth.ts";
import { getProvider } from "../nfse-provider.ts";
import type { NfseProviderCtx } from "../nfse-provider.ts";
import { NFSE_STATUS } from "../nfse-status.ts";
import { clean, logId, providerErrorResponse } from "./common.ts";

const TAG = "[nfse-cancel]";

// Estados que já representam nota autorizada (aceita pt/en por robustez —
// linhas antigas podiam ter o status cru em inglês).
const AUTHORIZED = new Set(["authorized", "autorizada"]);
// Estados que já representam cancelamento concluído (idempotência).
const CANCELLED = new Set(["cancelled", "canceled", "cancelada"]);

export async function handleNfseCancel(req: Request): Promise<Response> {
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

    // Motivo do cancelamento é obrigatório no layout (15..255 chars).
    // Default >= 15 chars quando ausente; valida/trunca quando informado.
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

    // ---- Idempotência: já cancelada → devolve o estado atual sem chamar o provedor.
    if (CANCELLED.has(currentStatus)) {
      return jsonResponse(
        { emission, status: NFSE_STATUS.CANCELADA, already_cancelled: true },
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

    const referencia = clean(emission.fisqal_dps_id);
    if (!referencia) {
      return jsonResponse(
        {
          error: "no_fisqal_id",
          message: "Esta nota ainda não possui identificador na emissão fiscal.",
        },
        409,
      );
    }

    // ---- Provedor ativo.
    const { data: fiscal } = await supabase
      .from("company_fiscal_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    const ctx: NfseProviderCtx = {
      supabase,
      companyId,
      fiscal: (fiscal ?? {}) as Record<string, unknown>,
    };
    const provider = getProvider(fiscal as Record<string, unknown> | null);

    const resultado = await provider.cancelar(ctx, referencia, motivo);
    const newStatus = resultado.status;

    const { data: updated, error: updErr } = await supabase
      .from("nfse_emissions")
      .update({ status: newStatus })
      .eq("id", emission.id)
      .eq("company_id", companyId)
      .select("*")
      .single();

    if (updErr) {
      console.error(`${TAG} update error`, {
        company_id: logId(companyId),
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
      payload: { motivo: motivo || null, response: resultado.raw ?? null },
    });

    return jsonResponse({ emission: updated, status: newStatus }, 200);
  } catch (err) {
    const providerResp = providerErrorResponse(err);
    if (providerResp) return providerResp;

    console.error(`${TAG} unexpected error`, {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse(
      { error: "internal_error", message: "Falha inesperada ao cancelar a nota." },
      500,
    );
  }
}

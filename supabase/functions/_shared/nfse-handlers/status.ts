// =============================================================================
// Handler de CONSULTA de status de NFS-e (rotas: nfse-status / fisqal-nfse-status).
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
//
// Caminho de polling do MVP (webhook é best-effort).
// Body: { emissionId } (id local de nfse_emissions).
//   - Pergunta ao provedor ativo o estado do documento.
//   - Quando autorizada: grava numero/chave/protocolo/emitida_em + URLs de PDF e XML.
//   - Insere nfse_events. Toda escrita filtrada por company_id.
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

const TAG = "[nfse-status]";

export async function handleNfseStatus(req: Request): Promise<Response> {
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

    // ---- Provedor ativo (linha inteira de company_fiscal_settings vira o contexto).
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

    const resultado = await provider.consultar(ctx, referencia, {
      statusAtual: clean(emission.status) || NFSE_STATUS.PENDENTE,
    });

    const newStatus = resultado.status;
    const update: Record<string, unknown> = { status: newStatus };

    if (newStatus === NFSE_STATUS.AUTORIZADA) {
      if (resultado.pdfUrl) update.pdf_url = resultado.pdfUrl;
      if (resultado.xmlUrl) update.xml_url = resultado.xmlUrl;
      if (resultado.numero) update.numero_nfse = resultado.numero;
      if (resultado.chaveAcesso) update.chave_acesso = resultado.chaveAcesso;
      if (resultado.protocolo) update.protocolo = resultado.protocolo;
      update.emitida_em = resultado.emitidaEm || new Date().toISOString();
    }

    if (newStatus === NFSE_STATUS.REJEITADA || newStatus === NFSE_STATUS.FALHOU) {
      update.error_message = resultado.erro?.mensagem ||
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
      console.error(`${TAG} update error`, {
        company_id: logId(companyId),
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
      payload: resultado.raw ?? null,
    });

    return jsonResponse({ emission: updated, status: newStatus }, 200);
  } catch (err) {
    const providerResp = providerErrorResponse(err);
    if (providerResp) return providerResp;

    console.error(`${TAG} unexpected error`, {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse(
      { error: "internal_error", message: "Falha inesperada ao consultar o status." },
      500,
    );
  }
}

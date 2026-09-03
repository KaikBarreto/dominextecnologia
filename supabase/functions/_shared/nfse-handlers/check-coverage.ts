// =============================================================================
// Handler de COBERTURA MUNICIPAL (rotas: nfse-check-coverage / fisqal-check-coverage).
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
//
// Lê municipio_ibge de company_fiscal_settings (ou aceita { ibge } no body),
// pergunta ao provedor ativo e atualiza pode_emitir. Devolve a cobertura crua
// para a tela exibir o diagnóstico.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../fiscal-auth.ts";
import { getProvider } from "../nfse-provider.ts";
import type { NfseProviderCtx } from "../nfse-provider.ts";
import { logId, providerErrorResponse } from "./common.ts";

const TAG = "[nfse-check-coverage]";
const IBGE_REGEX = /^\d{7}$/;

export async function handleNfseCheckCoverage(req: Request): Promise<Response> {
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

    // ---- IBGE: do body (se enviado) ou de company_fiscal_settings.
    let bodyIbge: string | null = null;
    try {
      const body = await req.json().catch(() => null);
      if (body && typeof body.ibge === "string") bodyIbge = body.ibge.trim();
    } catch {
      // body opcional — segue pro fallback do banco.
    }

    const { data: fiscal } = await supabase
      .from("company_fiscal_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    let ibge = bodyIbge ?? "";
    if (!ibge) {
      ibge = String(fiscal?.municipio_ibge ?? "").trim();
    }

    if (!ibge) {
      return jsonResponse(
        {
          error: "missing_ibge",
          message:
            "Informe o código IBGE do município nas configurações fiscais antes de verificar a cobertura.",
        },
        422,
      );
    }
    if (!IBGE_REGEX.test(ibge)) {
      return jsonResponse(
        { error: "invalid_ibge", message: "Código IBGE inválido. Ele deve ter 7 dígitos." },
        422,
      );
    }

    const provider = getProvider(fiscal as Record<string, unknown> | null);
    if (!provider.checarCobertura) {
      return jsonResponse(
        {
          error: "provider_unsupported",
          message:
            "A verificação de cobertura não está disponível na emissão fiscal atual.",
        },
        501,
      );
    }

    const ctx: NfseProviderCtx = {
      supabase,
      companyId,
      fiscal: (fiscal ?? {}) as Record<string, unknown>,
    };

    const cobertura = await provider.checarCobertura(ctx, ibge);
    const podeEmitir = cobertura.podeEmitir === true;

    // ---- Atualiza pode_emitir + municipio_ibge. Upsert pra garantir a linha
    //      existir mesmo no fluxo só-de-cobertura.
    const { error: upsertErr } = await supabase
      .from("company_fiscal_settings")
      .upsert(
        { company_id: companyId, municipio_ibge: ibge, pode_emitir: podeEmitir },
        { onConflict: "company_id" },
      );

    if (upsertErr) {
      console.error(`${TAG} upsert error`, {
        company_id: logId(companyId),
        message: upsertErr.message,
      });
      // Não bloqueia: a cobertura foi consultada; só falhou ao persistir.
    }

    return jsonResponse(
      {
        ibge,
        pode_emitir: podeEmitir,
        municipio: cobertura.municipio ?? null,
        uf: cobertura.uf ?? null,
        coverage: cobertura.raw ?? null,
        message: podeEmitir
          ? "Este município já permite emissão de NFS-e."
          : "Este município ainda não permite emissão de NFS-e pela emissão fiscal.",
      },
      200,
    );
  } catch (err) {
    const providerResp = providerErrorResponse(err);
    if (providerResp) return providerResp;

    console.error(`${TAG} unexpected error`, {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse(
      {
        error: "internal_error",
        message: "Falha inesperada ao verificar a cobertura. Tente novamente.",
      },
      500,
    );
  }
}

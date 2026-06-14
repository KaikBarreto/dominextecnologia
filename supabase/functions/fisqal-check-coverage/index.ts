// =============================================================================
// fisqal-check-coverage — checa cobertura de NFS-e do município (§8.3).
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
// Fase 1 (onboarding fiscal).
//
// Lê municipio_ibge de company_fiscal_settings (ou aceita { ibge } no body).
// GET /v1/nfse/municipios/{ibge}/cobertura → atualiza pode_emitir + municipio/uf.
// Retorna o objeto de cobertura pro client exibir.
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

const IBGE_REGEX = /^\d{7}$/;

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

    // ---- IBGE: do body (se enviado) ou de company_fiscal_settings.
    let bodyIbge: string | null = null;
    try {
      const body = await req.json().catch(() => null);
      if (body && typeof body.ibge === "string") bodyIbge = body.ibge.trim();
    } catch {
      // body opcional — segue pro fallback do banco.
    }

    let ibge = bodyIbge ?? "";
    if (!ibge) {
      const { data: fiscal } = await supabase
        .from("company_fiscal_settings")
        .select("municipio_ibge")
        .eq("company_id", companyId)
        .maybeSingle();
      ibge = (fiscal?.municipio_ibge ?? "").trim();
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
        {
          error: "invalid_ibge",
          message: "Código IBGE inválido. Ele deve ter 7 dígitos.",
        },
        422,
      );
    }

    // ---- GET /v1/nfse/municipios/{ibge}/cobertura (§8.3).
    const coverage = await fisqal.get<{
      codigoMunicipioIbge?: string;
      municipio?: string;
      uf?: string;
      podeEmitir?: boolean;
      provedor?: string;
      padraoNfse?: string;
      ambiente?: string;
      nacionalAderido?: boolean;
      nacionalParametrizado?: boolean;
    }>(`/v1/nfse/municipios/${ibge}/cobertura`);

    const podeEmitir = coverage?.podeEmitir === true;
    const municipio = typeof coverage?.municipio === "string" ? coverage.municipio.trim() : "";
    const uf = typeof coverage?.uf === "string" ? coverage.uf.trim() : "";

    // ---- Atualiza pode_emitir + municipio_ibge (e nada além — municipio/uf vivem
    //      em companies; aqui só carimbamos o que company_fiscal_settings tem).
    //      Upsert pra garantir a linha existir mesmo no fluxo só-de-cobertura.
    const { error: upsertErr } = await supabase
      .from("company_fiscal_settings")
      .upsert(
        {
          company_id: companyId,
          municipio_ibge: ibge,
          pode_emitir: podeEmitir,
        },
        { onConflict: "company_id" },
      );

    if (upsertErr) {
      console.error("[fisqal-check-coverage] upsert error", {
        company_id: companyId.slice(0, 8) + "...",
        message: upsertErr.message,
      });
      // Não bloqueia: a cobertura foi consultada; só falhou ao persistir.
    }

    return jsonResponse(
      {
        ibge,
        pode_emitir: podeEmitir,
        municipio: municipio || null,
        uf: uf || null,
        coverage,
        message: podeEmitir
          ? "Este município já permite emissão de NFS-e."
          : "Este município ainda não permite emissão de NFS-e pela emissão fiscal.",
      },
      200,
    );
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
    console.error("[fisqal-check-coverage] unexpected error", {
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
});

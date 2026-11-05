// =============================================================================
// Handler de COBERTURA MUNICIPAL (rota: nfse-check-coverage).
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
//
// Lê municipio_ibge de company_fiscal_settings (ou aceita { ibge } no body),
// pergunta ao Portal Nacional e atualiza `pode_emitir`. Indisponibilidade é
// estado desconhecido: retorna erro e NÃO persiste liberação por inferência.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../fiscal-auth.ts";
import { getNfseEngine } from "../nfse-provider.ts";
import type { NfseProviderCtx } from "../nfse-provider.ts";
import { logId, providerErrorResponse } from "./common.ts";

const TAG = "[nfse-check-coverage]";
const IBGE_REGEX = /^\d{7}$/;

class CoveragePersistError extends Error {
  constructor() {
    super("coverage_persist_failed");
    this.name = "CoveragePersistError";
  }
}

/**
 * Invalida a cobertura anterior ANTES da rede. Assim, troca de município +
 * timeout nunca herda `pode_emitir=true` do IBGE antigo.
 */
export async function executarConsultaCobertura<
  T extends { podeEmitir: boolean },
>(
  persistir: (podeEmitir: boolean) => Promise<void>,
  consultar: () => Promise<T>,
): Promise<T> {
  await persistir(false);
  const cobertura = await consultar();
  await persistir(cobertura.podeEmitir === true);
  return cobertura;
}

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
        {
          error: "invalid_ibge",
          message: "Código IBGE inválido. Ele deve ter 7 dígitos.",
        },
        422,
      );
    }

    const engine = getNfseEngine();

    const ctx: NfseProviderCtx = {
      supabase,
      companyId,
      fiscal: (fiscal ?? {}) as Record<string, unknown>,
    };

    const persistir = async (podeEmitir: boolean): Promise<void> => {
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
        console.error(`${TAG} upsert error`, {
          company_id: logId(companyId),
          message: upsertErr.message,
        });
        throw new CoveragePersistError();
      }
    };

    const cobertura = await executarConsultaCobertura(
      persistir,
      () => engine.checarCobertura(ctx, ibge),
    );
    const podeEmitir = cobertura.podeEmitir === true;

    return jsonResponse(
      {
        ibge,
        pode_emitir: podeEmitir,
        municipio: cobertura.municipio ?? null,
        uf: cobertura.uf ?? null,
        message: podeEmitir
          ? "Município habilitado para emissão de NFS-e no Portal Nacional."
          : "Este município ainda não está habilitado para emissão de NFS-e no Portal Nacional.",
      },
      200,
    );
  } catch (err) {
    if (err instanceof CoveragePersistError) {
      return jsonResponse(
        {
          error: "coverage_persist_failed",
          message:
            "Não conseguimos salvar a verificação do município agora. Tente novamente.",
        },
        500,
      );
    }
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

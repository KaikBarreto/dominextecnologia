// =============================================================================
// Handler de CATÁLOGOS FISCAIS (rotas: nfse-tax-codes / fisqal-tax-codes).
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system.
//
// É LEITURA de catálogo oficial (sem efeito colateral, sem escrita no banco).
// O client NUNCA fala direto com o provedor — a credencial é secret do servidor.
//
// Contrato (body JSON): { type: 'servico' | 'nbs', q?: string, limit?: number }
//   type='servico' → códigos cTribNac / itens LC116 (~337 itens: default traz tudo).
//   type='nbs'     → Nomenclatura Brasileira de Serviços (tabela grande):
//                    exige q com >= 2 chars; sem isso retorna lista vazia + aviso.
//
// Sempre devolve { items: [{ codigo, descricao, itemLc116? }], total }.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../fiscal-auth.ts";
import { getProvider } from "../nfse-provider.ts";
import type { NfseProviderCtx } from "../nfse-provider.ts";
import { providerErrorResponse } from "./common.ts";

const TAG = "[nfse-tax-codes]";

// Limites de segurança pra não estourar o endpoint do provedor.
const SERVICO_DEFAULT_LIMIT = 400; // tabela cTribNac inteira (~337 itens)
const SERVICO_MAX_LIMIT = 400;
const NBS_DEFAULT_LIMIT = 50;
const NBS_MAX_LIMIT = 200;
const NBS_MIN_QUERY = 2;

function clampLimit(value: unknown, def: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

export async function handleNfseTaxCodes(req: Request): Promise<Response> {
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

    const body = (await req.json().catch(() => null)) as
      | { type?: unknown; q?: unknown; limit?: unknown }
      | null;

    const type = typeof body?.type === "string" ? body.type.trim() : "";
    const q = typeof body?.q === "string" ? body.q.trim() : "";

    if (type !== "servico" && type !== "nbs") {
      return jsonResponse(
        { error: "invalid_type", message: "Tipo de catálogo inválido. Use 'servico' ou 'nbs'." },
        422,
      );
    }

    const { data: fiscal } = await supabase
      .from("company_fiscal_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();

    const provider = getProvider(fiscal as Record<string, unknown> | null);
    if (!provider.buscarCatalogo) {
      return jsonResponse(
        {
          error: "provider_unsupported",
          message: "A busca de códigos fiscais não está disponível na emissão fiscal atual.",
        },
        501,
      );
    }

    const ctx: NfseProviderCtx = {
      supabase,
      companyId,
      fiscal: (fiscal ?? {}) as Record<string, unknown>,
    };

    // ---- type='nbs' — tabela grande: exige busca com >= 2 caracteres.
    if (type === "nbs") {
      if (q.length < NBS_MIN_QUERY) {
        return jsonResponse(
          {
            items: [],
            total: 0,
            message: "Digite ao menos 2 caracteres para buscar um código NBS.",
          },
          200,
        );
      }
      const limit = clampLimit(body?.limit, NBS_DEFAULT_LIMIT, NBS_MAX_LIMIT);
      const resultado = await provider.buscarCatalogo(ctx, { tipo: "nbs", q, limit });
      return jsonResponse(resultado, 200);
    }

    // ---- type='servico' — códigos de tributação (cTribNac / LC116).
    const limit = clampLimit(body?.limit, SERVICO_DEFAULT_LIMIT, SERVICO_MAX_LIMIT);
    const resultado = await provider.buscarCatalogo(ctx, {
      tipo: "servico",
      q: q || undefined,
      limit,
    });
    return jsonResponse(resultado, 200);
  } catch (err) {
    const providerResp = providerErrorResponse(err);
    if (providerResp) return providerResp;

    console.error(`${TAG} unexpected error`, {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse(
      {
        error: "internal_error",
        message: "Falha inesperada ao buscar os códigos fiscais. Tente novamente.",
      },
      500,
    );
  }
}

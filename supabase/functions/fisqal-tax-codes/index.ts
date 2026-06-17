// =============================================================================
// fisqal-tax-codes — busca catálogos fiscais oficiais via Fisqal (doc §8).
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system
// (mesmo gate das demais edges fiscais via fiscal-auth.ts).
//
// É LEITURA de catálogo do governo (sem efeitos colaterais, sem escrita no
// banco). O client NUNCA fala direto com a Fisqal — a chave é secret do
// servidor; por isso esta edge proxia.
//
// Contrato (body JSON):
//   { type: 'servico' | 'nbs', q?: string, limit?: number }
//
//   type='servico' → GET /v1/nfse/codigos-tributacao?q=&limit=
//                    (códigos cTribNac / itens LC116). São só ~337 itens, então
//                    default limit=400 traz a tabela inteira.
//   type='nbs'     → GET /v1/nfse/codigos-nbs?q=
//                    (Nomenclatura Brasileira de Serviços — tabela grande).
//                    Exige q com >= 2 chars; sem isso retorna lista vazia + aviso.
//
// Sempre normaliza a resposta para { items: [{ codigo, descricao, ... }], total }.
// Trata 503 (chave ausente) e erros em PT-BR.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../_shared/fiscal-auth.ts";
import {
  buildQuery,
  fisqal,
  FisqalApiError,
  FisqalConfigError,
} from "../_shared/fisqal-client.ts";

// Limites de segurança pra não estourar o endpoint da Fisqal.
const SERVICO_DEFAULT_LIMIT = 400; // tabela cTribNac inteira (~337 itens)
const SERVICO_MAX_LIMIT = 400;
const NBS_DEFAULT_LIMIT = 50;
const NBS_MAX_LIMIT = 200;
const NBS_MIN_QUERY = 2;

/** Resposta normalizada que devolvemos ao client. */
interface NormalizedItem {
  codigo: string;
  descricao: string;
  itemLc116?: string;
}

/**
 * Normaliza o retorno da Fisqal pra { items, total }. A Fisqal pode devolver
 * tanto { items, total } quanto um array cru — toleramos os dois shapes.
 */
function normalize(raw: unknown): { items: NormalizedItem[]; total: number } {
  let list: any[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.items)) list = obj.items as any[];
    else if (Array.isArray(obj.data)) list = obj.data as any[];
  }

  const items: NormalizedItem[] = list.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const item: NormalizedItem = {
      codigo: String(r.codigo ?? r.code ?? r.cTribNac ?? "").trim(),
      descricao: String(r.descricao ?? r.description ?? "").trim(),
    };
    const lc116 = r.itemLc116 ?? r.itemLC116 ?? r.lc116;
    if (lc116 !== undefined && lc116 !== null && `${lc116}` !== "") {
      item.itemLc116 = String(lc116).trim();
    }
    return item;
  });

  const totalRaw = (raw && typeof raw === "object")
    ? (raw as Record<string, unknown>).total
    : undefined;
  const total = typeof totalRaw === "number" ? totalRaw : items.length;

  return { items, total };
}

function clampLimit(value: unknown, def: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
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

    const body = (await req.json().catch(() => null)) as
      | { type?: unknown; q?: unknown; limit?: unknown }
      | null;

    const type = typeof body?.type === "string" ? body.type.trim() : "";
    const q = typeof body?.q === "string" ? body.q.trim() : "";

    if (type !== "servico" && type !== "nbs") {
      return jsonResponse(
        {
          error: "invalid_type",
          message: "Tipo de catálogo inválido. Use 'servico' ou 'nbs'.",
        },
        422,
      );
    }

    // -------------------------------------------------------------------------
    // type='nbs' — tabela grande: exige busca com >= 2 caracteres.
    // -------------------------------------------------------------------------
    if (type === "nbs") {
      if (q.length < NBS_MIN_QUERY) {
        return jsonResponse(
          {
            items: [],
            total: 0,
            message:
              "Digite ao menos 2 caracteres para buscar um código NBS.",
          },
          200,
        );
      }
      const limit = clampLimit(body?.limit, NBS_DEFAULT_LIMIT, NBS_MAX_LIMIT);
      const raw = await fisqal.get(
        "/v1/nfse/codigos-nbs",
        buildQuery({ q, limit }),
      );
      return jsonResponse(normalize(raw), 200);
    }

    // -------------------------------------------------------------------------
    // type='servico' — códigos de tributação (cTribNac / LC116). ~337 itens:
    // default limit=400 traz a tabela toda; q opcional pra filtrar no servidor.
    // -------------------------------------------------------------------------
    const limit = clampLimit(body?.limit, SERVICO_DEFAULT_LIMIT, SERVICO_MAX_LIMIT);
    const raw = await fisqal.get(
      "/v1/nfse/codigos-tributacao",
      buildQuery({ q: q || undefined, limit }),
    );
    return jsonResponse(normalize(raw), 200);
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
    console.error("[fisqal-tax-codes] unexpected error", {
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
});

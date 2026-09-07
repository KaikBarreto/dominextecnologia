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
//
// FONTE DO CATÁLOGO — cadeia de fallback:
//   1. Provedor ativo, SE ele implementa `buscarCatalogo` (Fisqal tinha API própria).
//   2. Catálogo LOCAL (`nfse_codigos_tributacao` / `nfse_codigos_nbs`, seed da
//      migration 20260903182000_nfse_catalogos_tributacao_e_nbs.sql) — usado quando
//      o provedor não implementa (motor próprio/Sefin: o governo não publica API
//      de catálogo, ver `_shared/providers/sefin.ts`) OU quando o provedor falha.
//   3. Só devolve erro se as DUAS rotas falharem.
// Catálogo é global (sem company_id) — não precisa filtrar por empresa.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../fiscal-auth.ts";
import { getProvider } from "../nfse-provider.ts";
import type { NfseCatalogoResultado, NfseProviderCtx } from "../nfse-provider.ts";
import { providerErrorResponse } from "./common.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// -----------------------------------------------------------------------------
// Fallback LOCAL (tabelas de catálogo, sem provedor)
// -----------------------------------------------------------------------------

/**
 * Normaliza pra busca acento-insensível — MESMA lógica de `public.fiscal_texto_busca`
 * (lower + remoção de acentos), só que em JS: NFD decompõe o acento em caractere
 * combinante separado, que o regex remove. Resultado equivalente ao `translate()`
 * usado na coluna gerada `descricao_busca`.
 */
function normalizarBusca(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Escapa `%` e `_` (curingas do LIKE/ILIKE) antes de embutir o termo no filtro. */
function escapeIlike(v: string): string {
  return v.replace(/[%_\\]/g, (m) => `\\${m}`);
}

interface CatalogoRow {
  codigo: string;
  descricao: string;
  item_lc116?: string | null;
}

/**
 * Busca no catálogo LOCAL (`nfse_codigos_tributacao` / `nfse_codigos_nbs`).
 * Usado quando o provedor ativo não implementa `buscarCatalogo`, ou quando ele
 * falha em runtime. Lança em caso de erro do banco — quem chama decide o que
 * fazer (aqui: só desiste depois que provedor E local falharam).
 */
async function buscarCatalogoLocal(
  supabase: SupabaseClient,
  params: { tipo: "servico" | "nbs"; q?: string; limit: number },
): Promise<NfseCatalogoResultado> {
  const q = (params.q ?? "").trim();

  if (params.tipo === "servico") {
    // Sem termo: devolve o catálogo inteiro (é o fluxo padrão do front — busca
    // tudo 1x e filtra no client). Com termo: filtra também no servidor (bônus,
    // não é o caminho usado hoje pelo TaxCodeCombobox pra `servico`).
    let query = supabase
      .from("nfse_codigos_tributacao")
      .select("codigo, item_lc116, descricao")
      .eq("ativo", true);

    if (q) {
      const qCodigo = escapeIlike(q);
      const qDescricao = escapeIlike(normalizarBusca(q));
      query = query.or(
        `codigo.ilike.${qCodigo}%,descricao_busca.ilike.%${qDescricao}%`,
      );
    }

    const { data, error } = await query
      .order("codigo", { ascending: true })
      .limit(params.limit);
    if (error) throw error;

    const items = ((data ?? []) as CatalogoRow[]).map((r) => ({
      codigo: r.codigo,
      descricao: r.descricao,
      itemLc116: r.item_lc116 ?? undefined,
    }));
    return { items, total: items.length };
  }

  // ---- nbs: o handler já garante q com >= NBS_MIN_QUERY chars antes de chegar aqui.
  const qCodigo = escapeIlike(q);
  const qDescricao = escapeIlike(normalizarBusca(q));

  // 1º lote: prefixo do CÓDIGO (mais intencional — o contador sabe o número).
  const { data: porCodigo, error: errCodigo } = await supabase
    .from("nfse_codigos_nbs")
    .select("codigo, descricao")
    .eq("ativo", true)
    .ilike("codigo", `${qCodigo}%`)
    .order("codigo", { ascending: true })
    .limit(params.limit);
  if (errCodigo) throw errCodigo;

  const linhas = [...((porCodigo ?? []) as CatalogoRow[])];
  const vistos = new Set(linhas.map((r) => r.codigo));
  const restante = params.limit - linhas.length;

  // 2º lote: completa com match por DESCRIÇÃO (pg_trgm acelera o ILIKE parcial
  // via o índice gin criado na migration 20260903182000), acento-insensível.
  if (restante > 0) {
    const { data: porDescricao, error: errDescricao } = await supabase
      .from("nfse_codigos_nbs")
      .select("codigo, descricao")
      .eq("ativo", true)
      .ilike("descricao_busca", `%${qDescricao}%`)
      .order("descricao_busca", { ascending: true })
      .limit(restante + vistos.size); // folga para descontar duplicata com o 1º lote
    if (errDescricao) throw errDescricao;

    for (const r of (porDescricao ?? []) as CatalogoRow[]) {
      if (linhas.length >= params.limit) break;
      if (vistos.has(r.codigo)) continue;
      linhas.push(r);
      vistos.add(r.codigo);
    }
  }

  const items = linhas.slice(0, params.limit).map((r) => ({
    codigo: r.codigo,
    descricao: r.descricao,
  }));
  return { items, total: items.length };
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
    const ctx: NfseProviderCtx = {
      supabase,
      companyId,
      fiscal: (fiscal ?? {}) as Record<string, unknown>,
    };

    /**
     * Resolve o catálogo pela cadeia de fallback: provedor (se implementa) →
     * catálogo local → propaga o erro (o catch externo decide a resposta).
     */
    async function resolverCatalogo(
      params: { tipo: "servico" | "nbs"; q?: string; limit: number },
    ): Promise<NfseCatalogoResultado> {
      if (provider.buscarCatalogo) {
        try {
          return await provider.buscarCatalogo(ctx, params);
        } catch (err) {
          console.error(`${TAG} provider buscarCatalogo failed, falling back to local`, {
            provider: provider.nome,
            message: (err as Error)?.message ?? String(err),
          });
        }
      }
      return await buscarCatalogoLocal(supabase, params);
    }

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
      const resultado = await resolverCatalogo({ tipo: "nbs", q, limit });
      return jsonResponse(resultado, 200);
    }

    // ---- type='servico' — códigos de tributação (cTribNac / LC116).
    const limit = clampLimit(body?.limit, SERVICO_DEFAULT_LIMIT, SERVICO_MAX_LIMIT);
    const resultado = await resolverCatalogo({
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

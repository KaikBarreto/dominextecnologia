// =============================================================================
// fisqal-save-nfse-draft (Onda 1b) — upsert de RASCUNHO de NFS-e.
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system
// (via fiscal-auth.ts). Grava/atualiza uma linha em nfse_emissions com
// status='rascunho' — NÃO chama a Fisqal, NÃO valida obrigatórios, NÃO consome
// cota. É o "salvar e continuar" do modal de nova nota em etapas.
//
// Fluxo:
//   - Body (todos OPCIONAIS — rascunho pode ser parcial):
//       { id?, customerId?, intermediarioCustomerId?, dataCompetencia?,
//         regimeApuracao?,
//         servico?: { codigoServico?, codigoNbs?, municipioIncidenciaIbge?, descricao? },
//         valores?: { valorServico?, aliquotaIssqn?, tribIssqn?, tpRetIssqn?,
//                     valorPis?, valorCofins?, valorCsll?, percentualTribSn? } }
//   - id presente  → UPDATE aquele rascunho (escopado por company + status='rascunho').
//     id ausente   → INSERT novo rascunho (company_id carimbado, idempotency_key=null).
//   - Retorna { emission: <row> }.
//
// SEGURANÇA: toda escrita é escopada por company_id = companyId (do auth). O UPDATE
// exige AND status='rascunho' — nunca toca uma nota já emitida nem rascunho de outro
// tenant. Invariante do domínio: escrita só via service_role aqui, nunca no client.
// =============================================================================

import {
  authorizeFiscalManager,
  corsHeaders,
  jsonResponse,
} from "../_shared/fiscal-auth.ts";

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Valida YYYY-MM-DD; devolve a string limpa ou null se ausente/inválida. */
function cleanDate(v: unknown): string | null {
  const s = clean(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Resolve um valor numérico (>= 0) a partir de um valor cru do body.
 * Aceita number ou string (vírgula ou ponto). Retorna null se ausente/inválido/negativo.
 */
function parseNonNegative(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

interface DraftBody {
  id?: string;
  customerId?: string;
  intermediarioCustomerId?: string;
  dataCompetencia?: string;
  regimeApuracao?: string;
  servico?: {
    codigoServico?: string;
    codigoNbs?: string;
    municipioIncidenciaIbge?: string;
    descricao?: string;
  };
  valores?: {
    valorServico?: number | string;
    aliquotaIssqn?: number | string;
    tribIssqn?: string;
    tpRetIssqn?: string;
    valorPis?: number | string;
    valorCofins?: number | string;
    valorCsll?: number | string;
    percentualTribSn?: number | string;
  };
}

/**
 * Monta o objeto de colunas a partir do body — SOMENTE as chaves presentes.
 * Usado tanto no INSERT quanto no UPDATE (no UPDATE, só sobrescreve o que veio).
 */
function mapBodyToColumns(body: DraftBody): Record<string, unknown> {
  const cols: Record<string, unknown> = {};

  // Identidade / partes.
  if ("customerId" in body) {
    cols.customer_id = clean(body.customerId) || null;
  }
  if ("intermediarioCustomerId" in body) {
    cols.intermediario_customer_id = clean(body.intermediarioCustomerId) || null;
  }

  // Competência / regime.
  if ("dataCompetencia" in body) {
    cols.data_competencia = cleanDate(body.dataCompetencia);
  }
  if ("regimeApuracao" in body) {
    cols.regime_apuracao = clean(body.regimeApuracao) || null;
  }

  // Serviço.
  const servico = body.servico;
  if (servico && typeof servico === "object") {
    if ("codigoServico" in servico) {
      cols.codigo_servico = clean(servico.codigoServico) || null;
    }
    if ("codigoNbs" in servico) {
      cols.codigo_nbs = clean(servico.codigoNbs) || null;
    }
    if ("municipioIncidenciaIbge" in servico) {
      cols.municipio_incidencia_ibge = clean(servico.municipioIncidenciaIbge) || null;
    }
    // descricao é a discriminação — reusa a coluna descricao_servico (não inventar coluna).
    if ("descricao" in servico) {
      cols.descricao_servico = clean(servico.descricao) || null;
    }
  }

  // Valores ricos.
  const valores = body.valores;
  if (valores && typeof valores === "object") {
    if ("valorServico" in valores) {
      cols.valor_servico = parseNonNegative(valores.valorServico);
    }
    if ("aliquotaIssqn" in valores) {
      cols.aliquota_issqn = parseNonNegative(valores.aliquotaIssqn);
    }
    if ("tribIssqn" in valores) {
      cols.trib_issqn = clean(valores.tribIssqn) || null;
    }
    if ("tpRetIssqn" in valores) {
      cols.tp_ret_issqn = clean(valores.tpRetIssqn) || null;
    }
    if ("valorPis" in valores) {
      cols.valor_pis = parseNonNegative(valores.valorPis);
    }
    if ("valorCofins" in valores) {
      cols.valor_cofins = parseNonNegative(valores.valorCofins);
    }
    if ("valorCsll" in valores) {
      cols.valor_csll = parseNonNegative(valores.valorCsll);
    }
    if ("percentualTribSn" in valores) {
      cols.percentual_trib_sn = parseNonNegative(valores.percentualTribSn);
    }
  }

  return cols;
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

    let body: DraftBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        { error: "invalid_body", message: "Requisição inválida." },
        400,
      );
    }

    const cols = mapBodyToColumns(body ?? {});
    const draftId = clean(body?.id);

    if (draftId) {
      // ---- UPDATE de rascunho existente (escopado por company + status='rascunho').
      // Só as colunas presentes no body são sobrescritas. updated_at explícito.
      const updatePayload = { ...cols, updated_at: new Date().toISOString() };
      const { data: updated, error: updateErr } = await supabase
        .from("nfse_emissions")
        .update(updatePayload)
        .eq("id", draftId)
        .eq("company_id", companyId)
        .eq("status", "rascunho")
        .select("*")
        .maybeSingle();

      if (updateErr) {
        console.error("[fisqal-save-nfse-draft] update error", {
          company_id: companyId.slice(0, 8) + "...",
          message: updateErr.message,
        });
        return jsonResponse(
          {
            error: "persist_failed",
            message: "Não foi possível salvar o rascunho. Tente novamente.",
          },
          500,
        );
      }
      if (!updated) {
        return jsonResponse(
          {
            error: "draft_not_found",
            message: "Rascunho não encontrado.",
          },
          404,
        );
      }
      return jsonResponse({ emission: updated }, 200);
    }

    // ---- INSERT de novo rascunho (company_id carimbado, status='rascunho').
    const insertPayload = {
      ...cols,
      company_id: companyId,
      status: "rascunho",
      idempotency_key: null,
    };
    const { data: inserted, error: insertErr } = await supabase
      .from("nfse_emissions")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertErr) {
      console.error("[fisqal-save-nfse-draft] insert error", {
        company_id: companyId.slice(0, 8) + "...",
        message: insertErr.message,
      });
      return jsonResponse(
        {
          error: "persist_failed",
          message: "Não foi possível salvar o rascunho. Tente novamente.",
        },
        500,
      );
    }

    return jsonResponse({ emission: inserted }, 201);
  } catch (err) {
    console.error("[fisqal-save-nfse-draft] unexpected error", {
      message: (err as Error)?.message ?? String(err),
    });
    return jsonResponse(
      {
        error: "internal_error",
        message: "Falha inesperada ao salvar o rascunho. Tente novamente.",
      },
      500,
    );
  }
});

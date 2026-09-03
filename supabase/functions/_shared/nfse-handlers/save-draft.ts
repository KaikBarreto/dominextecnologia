// =============================================================================
// Handler de RASCUNHO de NFS-e (rotas: nfse-save-draft / fisqal-save-nfse-draft).
// =============================================================================
// AUTENTICADA: Authorization Bearer + módulo 'nfe' ativo + can_manage_system
// (via fiscal-auth.ts). Grava/atualiza uma linha em nfse_emissions com
// status='rascunho' — NÃO fala com provedor, NÃO valida obrigatórios, NÃO consome
// cota. É o "salvar e continuar" do modal de nova nota em etapas.
//
// Fluxo:
//   - Body (todos OPCIONAIS — rascunho pode ser parcial):
//       { id?, customerId?, intermediarioCustomerId?, dataCompetencia?,
//         regimeApuracao?,
//         servico?: { serviceTypeId?, codigoServico?, codigoNbs?,
//                     municipioIncidenciaIbge?, descricao?,
//                     codigoTributacaoMunicipal? },
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
} from "../fiscal-auth.ts";
import {
  cleanCTribMun,
  COL_CTRIBMUN,
  COL_SERVICE_TYPE,
  isUnknownColumnError,
  withoutColumn,
} from "./common.ts";

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
    // A ESCOLHA do seletor de tipo de serviço (não só os códigos que ela
    // preencheu). null/"" = "nenhum serviço", que é como o seletor volta a ficar
    // vazio ao reabrir o rascunho.
    serviceTypeId?: string | null;
    codigoServico?: string;
    codigoNbs?: string;
    municipioIncidenciaIbge?: string;
    descricao?: string;
    // cTribMun (3 dígitos) — código da prefeitura, complementar ao cTribNac.
    // number aceito porque campo numérico no front manda 101, não "101".
    codigoTributacaoMunicipal?: string | number;
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
    // Vínculo nota↔tipo de serviço: guarda de ONDE vieram os códigos. Sem isso o
    // rascunho reabre com os campos preenchidos e o seletor vazio (parece defeito).
    if ("serviceTypeId" in servico) {
      cols[COL_SERVICE_TYPE] = clean(servico.serviceTypeId) || null;
    }
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
    // cTribMun: override por nota. Só grava o que tem o formato do layout
    // nacional (3 dígitos); qualquer outra coisa vira NULL e a nota herda do
    // tipo de serviço na emissão. Rascunho não é hora de barrar o usuário.
    if ("codigoTributacaoMunicipal" in servico) {
      cols[COL_CTRIBMUN] = cleanCTribMun(servico.codigoTributacaoMunicipal) || null;
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

/**
 * Colunas OPCIONAIS que podem não existir ainda em outro ambiente (janela de
 * deploy: edge nova + migration ainda não aplicada). Perder um campo opcional é
 * muito melhor que perder o rascunho inteiro.
 */
const COLUNAS_OPCIONAIS = [COL_CTRIBMUN, COL_SERVICE_TYPE];

type DbResult<T> = { data: T | null; error: { code?: string; message?: string } | null };

/**
 * Roda a gravação e, se o banco reclamar de uma coluna OPCIONAL inexistente,
 * remove aquela coluna do payload e tenta de novo (uma vez por coluna).
 */
async function gravarTolerandoColunaAusente<T>(
  run: (payload: Record<string, unknown>) => PromiseLike<DbResult<T>>,
  payload: Record<string, unknown>,
): Promise<DbResult<T>> {
  const pendentes = [...COLUNAS_OPCIONAIS];
  let atual = payload;
  let resultado = await run(atual);

  while (resultado.error && pendentes.length > 0) {
    const err = resultado.error;
    const idx = pendentes.findIndex((coluna) => isUnknownColumnError(err, coluna));
    if (idx === -1) break;
    const [coluna] = pendentes.splice(idx, 1);
    atual = withoutColumn(atual, coluna);
    resultado = await run(atual);
  }

  return resultado;
}

export async function handleNfseSaveDraft(req: Request): Promise<Response> {
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
      const runUpdate = (payload: Record<string, unknown>) =>
        supabase
          .from("nfse_emissions")
          .update(payload)
          .eq("id", draftId)
          .eq("company_id", companyId)
          .eq("status", "rascunho")
          .select("*")
          .maybeSingle();

      const { data: updated, error: updateErr } = await gravarTolerandoColunaAusente(
        runUpdate,
        updatePayload,
      );

      if (updateErr) {
        console.error("[nfse-save-draft] update error", {
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
    const runInsert = (payload: Record<string, unknown>) =>
      supabase.from("nfse_emissions").insert(payload).select("*").single();

    const { data: inserted, error: insertErr } = await gravarTolerandoColunaAusente(
      runInsert,
      insertPayload,
    );

    if (insertErr) {
      console.error("[nfse-save-draft] insert error", {
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
    console.error("[nfse-save-draft] unexpected error", {
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
}

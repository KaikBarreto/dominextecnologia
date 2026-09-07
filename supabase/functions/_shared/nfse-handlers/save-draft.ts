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
//         // Tomador/intermediário DIGITADO NA HORA (sem cadastro em customers).
//         // Alternativa a customerId/intermediarioCustomerId — nunca os dois.
//         tomadorAvulso?: { nome?, documento?, email?,
//                           endereco?: { logradouro?, numero?, complemento?,
//                                        bairro?, cidade?, uf?, cep?, ibge? } },
//         intermediarioAvulso?: { mesmo formato },
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
  COL_CREATED_BY,
  COL_CTRIBMUN,
  COL_INTERMEDIARIO_AVULSO,
  COL_SERVICE_TYPE,
  COL_TOMADOR_AVULSO,
  isUnknownColumnError,
  normalizarPessoaAvulsa,
  withoutColumn,
} from "./common.ts";
import type { PessoaAvulsa } from "./common.ts";

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
  /**
   * Tomador digitado na hora, sem virar cliente. ALTERNATIVA a `customerId`
   * (nunca os dois na mesma nota — há CHECK no banco garantindo isso).
   * O rascunho aceita o objeto PARCIAL: é "salvar e continuar".
   */
  tomadorAvulso?: unknown;
  /** Intermediário digitado na hora. Alternativa a `intermediarioCustomerId`. */
  intermediarioAvulso?: unknown;
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

/** Resultado do mapeamento do body: colunas a gravar OU erro PT-BR de 400. */
interface Mapeamento {
  cols: Record<string, unknown>;
  erro?: string;
}

/**
 * Resolve UMA das partes da nota (tomador ou intermediário) para as suas DUAS
 * colunas — a do cadastro e a do avulso — e devolve as duas SEMPRE juntas.
 *
 * Por que as duas juntas: o banco tem CHECK de exclusão mútua
 * (`nfse_emissions_tomador_exclusivo`). Num UPDATE parcial, gravar só o avulso
 * numa linha que já tem `customer_id` estouraria a constraint com um erro cru
 * de Postgres. Escrevendo o par, trocar de "cadastrado" para "digitado
 * manualmente" (e vice-versa) é sempre consistente.
 *
 * Devolve `null` quando NENHUMA das duas chaves veio no body — aí a coluna nem
 * entra no UPDATE (rascunho parcial não pode apagar o que já estava salvo).
 */
function resolverParte(
  body: DraftBody,
  chaveCadastro: "customerId" | "intermediarioCustomerId",
  chaveAvulso: "tomadorAvulso" | "intermediarioAvulso",
  colCadastro: string,
  colAvulso: string,
  rotulo: string,
): { cols: Record<string, unknown>; erro?: string } | null {
  const veioCadastro = chaveCadastro in body;
  const veioAvulso = chaveAvulso in body;
  if (!veioCadastro && !veioAvulso) return null;

  const idCadastro = clean(body[chaveCadastro]) || null;
  const avulso: PessoaAvulsa | null = veioAvulso
    ? normalizarPessoaAvulsa(body[chaveAvulso])
    : null;

  if (idCadastro && avulso) {
    return {
      cols: {},
      erro:
        `Escolha o ${rotulo} de UMA forma só: selecione um cliente cadastrado ou digite os dados manualmente.`,
    };
  }

  return { cols: { [colCadastro]: idCadastro, [colAvulso]: avulso } };
}

/**
 * Monta o objeto de colunas a partir do body — SOMENTE as chaves presentes.
 * Usado tanto no INSERT quanto no UPDATE (no UPDATE, só sobrescreve o que veio).
 */
function mapBodyToColumns(body: DraftBody): Mapeamento {
  const cols: Record<string, unknown> = {};

  // Identidade / partes. Cadastrado XOR avulso — ver `resolverParte`.
  const tomador = resolverParte(
    body,
    "customerId",
    "tomadorAvulso",
    "customer_id",
    COL_TOMADOR_AVULSO,
    "tomador",
  );
  if (tomador?.erro) return { cols: {}, erro: tomador.erro };
  if (tomador) Object.assign(cols, tomador.cols);

  const intermediario = resolverParte(
    body,
    "intermediarioCustomerId",
    "intermediarioAvulso",
    "intermediario_customer_id",
    COL_INTERMEDIARIO_AVULSO,
    "intermediário",
  );
  if (intermediario?.erro) return { cols: {}, erro: intermediario.erro };
  if (intermediario) Object.assign(cols, intermediario.cols);

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

  return { cols };
}

/**
 * Colunas OPCIONAIS que podem não existir ainda em outro ambiente (janela de
 * deploy: edge nova + migration ainda não aplicada). Perder um campo opcional é
 * muito melhor que perder o rascunho inteiro.
 */
const COLUNAS_OPCIONAIS = [COL_CTRIBMUN, COL_SERVICE_TYPE, COL_CREATED_BY];

// ⚠️ `tomador_avulso` / `intermediario_avulso` NÃO entram na lista acima de
// propósito. Elas não são "campo opcional": são a ÚNICA identidade do tomador
// numa nota sem cliente cadastrado. Descartá-las em silêncio salvaria um
// rascunho aparentemente OK e sem tomador nenhum, e o usuário só descobriria na
// emissão. Se a coluna faltar, o certo é falhar alto ("Não foi possível salvar
// o rascunho") — a migration 20260906210000 é pré-requisito deste deploy.

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
    const { companyId, supabase, userId } = auth;

    let body: DraftBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        { error: "invalid_body", message: "Requisição inválida." },
        400,
      );
    }

    const { cols, erro: erroMapeamento } = mapBodyToColumns(body ?? {});
    if (erroMapeamento) {
      return jsonResponse(
        { error: "tomador_ambiguo", message: erroMapeamento },
        400,
      );
    }
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

    // ---- Default do percentual do Simples Nacional (company_fiscal_settings)
    // SÓ no INSERT e SÓ quando a nota não trouxe o campo — o rascunho já nasce
    // preenchido com o que o contador configurou em Configurações fiscais >
    // Tributação, sem precisar redigitar em toda NFS-e. Não sobrescreve o que
    // o usuário digitou (mapBodyToColumns só grava `percentual_trib_sn` quando
    // "percentualTribSn" veio no body). Falha nessa leitura é NÃO-crítica: o
    // rascunho segue sem default, exatamente como hoje.
    if (!("percentual_trib_sn" in cols)) {
      const { data: fiscalRow } = await supabase
        .from("company_fiscal_settings")
        .select("percentual_trib_sn")
        .eq("company_id", companyId)
        .maybeSingle();
      if (fiscalRow?.percentual_trib_sn != null) {
        cols.percentual_trib_sn = fiscalRow.percentual_trib_sn;
      }
    }

    // ---- INSERT de novo rascunho (company_id carimbado, status='rascunho').
    // `created_by` é carimbado SÓ no INSERT (o UPDATE acima jamais reescreve o
    // autor original). A edge roda com service_role, então auth.uid() não vem
    // de graça — usamos o userId que o gate de auth já resolveu do JWT.
    const insertPayload = {
      ...cols,
      company_id: companyId,
      status: "rascunho",
      idempotency_key: null,
      [COL_CREATED_BY]: userId,
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

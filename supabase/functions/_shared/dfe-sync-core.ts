// =============================================================================
// _shared/dfe-sync-core.ts — UMA rodada de sincronização de notas destinadas.
// =============================================================================
// Compartilhado pelo botão do cliente (`dfe-sync`) e pela rotina automática
// (`dfe-sync-cron`). Handler único de propósito: as três obrigações anti-656 da
// §10.3 do RUNBOOK do `dominex-fiscal` NÃO podem existir em duas versões — se a
// versão do cron estiver certa e a do botão errada, um clique custa uma hora de
// nota do cliente.
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ AS TRÊS OBRIGAÇÕES (§10.3) — onde cada uma está implementada              │
// │                                                                           │
// │ 1. "Marcar a rodada ANTES de chamar a VPS."                               │
// │    → `dfe_sync_claim` faz `ultima_consulta_em = now()` E JÁ PAGA a janela  │
// │      cheia (`proxima_consulta_em = now() + 65min`) num único UPDATE        │
// │      condicional. A janela é ENCURTADA depois, e só quando a resposta      │
// │      chegou. Se nada voltar, o bloqueio já está gravado.                   │
// │                                                                           │
// │ 2. "Timeout conta como rodada consumida."                                  │
// │    → consequência direta de (1): o catch NÃO mexe em `proxima_consulta_em`,│
// │      e `dfe_sync_falhar` usa GREATEST() pra ser incapaz de encurtar.       │
// │                                                                           │
// │ 3. "Gravar `ultNsu` mesmo com `parcial: true`."                            │
// │    → `concluirRodada` grava o cursor ANTES de olhar `parcial`, e o parcial │
// │      só decide QUANDO voltar. Ver `aplicarResultado`.                      │
// └───────────────────────────────────────────────────────────────────────────┘
// =============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  carregarConfigFiscal,
  distribuicao,
  distribuicaoNfse,
  DfeServiceError,
  resolverIdentidadeFiscal,
  temCertificado,
} from "./dfe-client.ts";
import type {
  DistribuicaoNfseResposta,
  DistribuicaoResposta,
  DocumentoDfe,
  DocumentoNfseDfe,
  EventoNfseDfe,
} from "./dfe-client.ts";

const TAG = "[dfe-sync]";

// -----------------------------------------------------------------------------
// Janelas de espera
// -----------------------------------------------------------------------------

/**
 * A SEFAZ cobra a HORA CHEIA e não perdoa segundos: medido no EcoSistema em
 * 17/09/2026, uma rodada disparada 59min50s depois tomou 656. 65 min é a mesma
 * margem que o worker do Eco usa em produção. **Não baixar.**
 */
export const ESPERA_CHEIA_MIN = 65;

/**
 * Sobrou fila E o cursor andou: pode voltar logo. O 656 pune REPETIR NSU já
 * servido, não avançar — o próprio serviço encadeia até 20 páginas numa chamada
 * só. 5 min dá folga pro cron drenar um acervo grande sem virar martelo.
 */
export const ESPERA_CONTINUA_MIN = 5;

/**
 * Fila vazia há muito tempo. Depois de ~26h sem nota nenhuma, consultar de hora
 * em hora é ruído: a fila é passiva, ninguém está esperando nada específico.
 */
export const ESPERA_OCIOSA_MIN = 240;
export const CICLOS_ATE_OCIOSO = 24;

// -----------------------------------------------------------------------------
// Resultado
// -----------------------------------------------------------------------------

export interface ResultadoSync {
  ok: boolean;
  /** Código estável pro front decidir o que mostrar. Nunca é mensagem. */
  motivo:
    | "sincronizado"
    | "em_espera"
    | "desativado"
    | "sem_certificado"
    | "sem_config"
    | "cadastro_incompleto"
    | "consumo_indevido"
    /**
     * O governo RECUSOU a consulta (ADN: `distribuicao_rejeitada` / status
     * REJEICAO). Não é indisponibilidade: costuma ser cadastro do CNPJ no
     * Ambiente Nacional, e quem resolve é o cliente. Motivo próprio pra tela
     * poder dizer isso em vez de "tente mais tarde" pra sempre.
     */
    | "rejeitado"
    | "indisponivel"
    | "nao_suportado";
  novas: number;
  total: number;
  parcial: boolean;
  /** Texto PT-BR pra tela. `undefined` quando não há nada a dizer. */
  aviso?: string;
  /** Diagnóstico — a tela pode ignorar. */
  ultimoNsu?: string | null;
  maxNsu?: string | null;
  proximaConsultaEm?: string | null;
  /** HTTP sugerido quando esta rodada veio de um botão. 200 = estado legítimo. */
  httpStatus: number;
}

function resultado(
  motivo: ResultadoSync["motivo"],
  extras: Partial<ResultadoSync> = {},
): ResultadoSync {
  return {
    ok: motivo === "sincronizado",
    motivo,
    novas: 0,
    total: 0,
    parcial: false,
    httpStatus: 200,
    ...extras,
  };
}

// -----------------------------------------------------------------------------
// Normalização do documento → linha de inbound_nfe
// -----------------------------------------------------------------------------

/**
 * Situações que a coluna aceita. O serviço também devolve `"outra"` — que a
 * CHECK de `inbound_nfe.situacao_sefaz` recusa. Vira NULL ("ainda não sabemos"),
 * que é exatamente o que "outra" significa pra nós.
 */
const SITUACOES = new Set(["autorizada", "cancelada", "denegada"]);

function so44(v: unknown): string | null {
  const s = String(v ?? "").replace(/\D/g, "");
  return s.length === 44 ? s : null;
}

function inteiro(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Traduz o documento do fio pro shape da tabela.
 *
 * Devolve `null` pro documento que a tabela recusaria — melhor perder UMA linha
 * (contabilizada no log) do que a RPC inteira estourar numa CHECK e a rodada
 * toda ser descartada DEPOIS de o cursor já ter avançado no lado da SEFAZ.
 */
function paraLinha(doc: DocumentoDfe): Record<string, unknown> | null {
  const chave = so44(doc.chave);
  if (!chave) return null;

  const nsu = String(doc.nsu ?? "").replace(/\D/g, "");
  const situacao = String(doc.situacaoSefaz ?? "").toLowerCase();
  const xml = typeof doc.xml === "string" && doc.xml.trim() ? doc.xml : null;

  return {
    chave,
    origem: "dfe",
    nsu: nsu && nsu.length <= 15 ? nsu : null,
    numero: inteiro(doc.numero),
    serie: inteiro(doc.serie),
    emitente_cnpj: String(doc.emitenteCnpj ?? "").replace(/\D/g, "") || null,
    emitente_nome: (doc.emitenteNome ?? null) || null,
    valor: typeof doc.valor === "number" && Number.isFinite(doc.valor) ? doc.valor : null,
    data_emissao: (doc.dataEmissao ?? null) || null,
    natureza: (doc.natureza ?? null) || null,
    cfop_principal: String(doc.cfopPrincipal ?? "").replace(/\D/g, "") || null,
    fin_nfe: inteiro(doc.finNfe),
    ref_nfe_key: so44(doc.refNfeChave),
    situacao_sefaz: SITUACOES.has(situacao) ? situacao : null,
    xml_content: xml,
    // `resumo` é DERIVADO do que temos em mãos, não copiado do fio: se o XML
    // completo chegou, a nota não é resumo, e é isso que a tela lê pra decidir
    // se mostra o aviso "manifeste pra liberar o XML".
    resumo: xml === null,
  };
}

// -----------------------------------------------------------------------------
// A rodada
// -----------------------------------------------------------------------------

export interface EmpresaParaSync {
  companyId: string;
  /** Já carregada pelo chamador (evita reler no cron). */
  fiscal?: Record<string, unknown> | null;
}

/**
 * Executa UMA rodada de sincronização de NF-e destinada para UMA empresa.
 *
 * Não lança: toda falha vira `ResultadoSync` com `motivo` + `aviso` em PT-BR.
 * Quem chama decide o HTTP (`httpStatus` é sugestão).
 */
export async function sincronizarNfeDestinada(
  supabase: SupabaseClient,
  alvo: EmpresaParaSync,
): Promise<ResultadoSync> {
  const companyId = alvo.companyId;
  const curto = companyId.slice(0, 8) + "...";

  // ---- 1. Config fiscal + opt-in --------------------------------------------
  const fiscal = alvo.fiscal !== undefined
    ? alvo.fiscal
    : await carregarConfigFiscal(supabase, companyId);

  if (!fiscal) {
    return resultado("sem_config", {
      aviso:
        "Configure os dados fiscais da empresa antes de buscar notas recebidas.",
      httpStatus: 422,
    });
  }
  if (fiscal.dfe_nfe_ativo !== true) {
    // Nenhuma chamada ao governo sem o cliente ligar. Estado legítimo → 200.
    return resultado("desativado", {
      aviso:
        "A busca automática de notas recebidas está desligada. Ative nas configurações fiscais.",
    });
  }
  if (!temCertificado(fiscal)) {
    return resultado("sem_certificado", {
      aviso:
        "Envie o certificado digital A1 da empresa nas configurações fiscais. Sem ele a SEFAZ não entrega as notas recebidas.",
      httpStatus: 422,
    });
  }

  // ---- 2. CNPJ + UF ---------------------------------------------------------
  const ident = await resolverIdentidadeFiscal(supabase, companyId);
  if (!ident.ok) {
    return resultado("cadastro_incompleto", { aviso: ident.motivo, httpStatus: 422 });
  }

  // ---- 3. OBRIGAÇÃO 1: reivindicar a rodada ANTES de falar com a VPS --------
  // O claim é um UPDATE condicional atômico: duas chamadas simultâneas (botão +
  // cron, ou dois cliques) NÃO passam as duas. E ele já grava a janela CHEIA —
  // se a resposta se perder daqui pra frente, o bloqueio já está no banco.
  const { data: claimData, error: claimErr } = await supabase.rpc("dfe_sync_claim", {
    p_company_id: companyId,
    p_tipo: "nfe",
    p_espera_minutos: ESPERA_CHEIA_MIN,
  });
  if (claimErr) {
    console.error(`${TAG} claim`, { company_id: curto, message: claimErr.message });
    return resultado("indisponivel", {
      aviso: "Não foi possível iniciar a busca de notas agora. Tente novamente em alguns minutos.",
      httpStatus: 500,
    });
  }
  const claim = (Array.isArray(claimData) ? claimData[0] : claimData) as
    | {
      claimed: boolean;
      ultimo_nsu: string | null;
      max_nsu: string | null;
      proxima_consulta_em: string | null;
      ciclos_sem_documento: number | null;
    }
    | undefined;

  if (!claim?.claimed) {
    return resultado("em_espera", {
      aviso:
        "A SEFAZ permite uma consulta por hora para cada CNPJ. A próxima busca acontece automaticamente.",
      ultimoNsu: claim?.ultimo_nsu ?? null,
      maxNsu: claim?.max_nsu ?? null,
      proximaConsultaEm: claim?.proxima_consulta_em ?? null,
    });
  }

  const cursorAntes = Number(claim.ultimo_nsu ?? 0) || 0;

  // ---- 4. Chamar a VPS ------------------------------------------------------
  let resposta: DistribuicaoResposta;
  try {
    resposta = await distribuicao(
      { supabase, companyId, fiscal },
      { cnpj: ident.identidade.cnpj, uf: ident.identidade.uf, ultimoNsu: cursorAntes },
    );
  } catch (err) {
    return await tratarFalha(supabase, companyId, curto, err);
  }

  // ---- 5. Aplicar o resultado ----------------------------------------------
  return await aplicarResultado(supabase, companyId, curto, cursorAntes, resposta);
}

// -----------------------------------------------------------------------------
// Falha
// -----------------------------------------------------------------------------

/**
 * ⚠️ NENHUM caminho aqui encurta `proxima_consulta_em`. É a OBRIGAÇÃO 2: uma
 * resposta perdida pode ter vindo DEPOIS de a SEFAZ servir NSU. `dfe_sync_falhar`
 * usa GREATEST() no SQL justamente pra que nem um bug futuro consiga encurtar.
 */
async function tratarFalha(
  supabase: SupabaseClient,
  companyId: string,
  curto: string,
  err: unknown,
  /** Qual fila falhou. A mecânica é idêntica; muda só a linha de estado. */
  tipo: "nfe" | "nfse" = "nfe",
): Promise<ResultadoSync> {
  const erro = err instanceof DfeServiceError
    ? err
    : new DfeServiceError(
      "Não foi possível buscar as notas recebidas agora. Tente novamente em alguns minutos.",
      { status: 502, codigo: "erro_fiscal" },
    );

  // O 656 traz o ultNsu/maxNsu que a SEFAZ considera correntes.
  //
  // ⚠️ NÃO usamos esse ultNsu pra avançar o nosso cursor. Se o valor da SEFAZ
  // estiver à frente do nosso, pular até lá QUEIMARIA as notas do intervalo —
  // e um cursor atrasado não causa 656 (a SEFAZ serve normalmente a partir de
  // um NSU antigo). 656 é frequência, não posição. Guardamos só como
  // diagnóstico, no `max_nsu` e no texto do erro.
  const detalhe = (erro.detalhe ?? {}) as Record<string, unknown>;
  const maxNsuSefaz = typeof detalhe.maxNsu === "string" ? detalhe.maxNsu : null;

  const { error: falhaErr } = await supabase.rpc("dfe_sync_falhar", {
    p_company_id: companyId,
    p_tipo: tipo,
    p_cstat: typeof detalhe.cStat === "number" ? String(detalhe.cStat) : null,
    p_erro: `${erro.codigo}: ${erro.message}`.slice(0, 500),
    // Só a SEFAZ devolve maxNSU. Em 'nfse' isto é sempre null de propósito: o
    // ADN não diz até onde a fila vai, e gravar palpite ali faria a tela
    // prometer "faltam N notas" com número inventado.
    p_max_nsu: tipo === "nfe" ? maxNsuSefaz : null,
    p_espera_minutos: ESPERA_CHEIA_MIN,
  });
  if (falhaErr) {
    console.error(`${TAG} falhar`, { company_id: curto, tipo, message: falhaErr.message });
  }

  console.error(`${TAG} rodada falhou`, { company_id: curto, tipo, codigo: erro.codigo });

  if (erro.codigo === "consumo_indevido") {
    // Estado legítimo e esperado: o governo trancou o CNPJ por um período e nós
    // já agendamos o retorno. O usuário precisa LER isso, não ver "erro".
    // Mesmo código nos dois: 656 na SEFAZ, 429 no ADN — o front já fala esse.
    return resultado("consumo_indevido", { aviso: erro.message });
  }
  if (erro.codigo === "distribuicao_rejeitada" || erro.codigo === "dados_invalidos") {
    // O governo respondeu e RECUSOU. Mandar o cliente "tentar mais tarde"
    // esconderia a única informação útil: a mensagem do próprio órgão.
    return resultado("rejeitado", { aviso: erro.message, httpStatus: 422 });
  }
  return resultado("indisponivel", {
    aviso: erro.message,
    httpStatus: erro.status >= 400 && erro.status < 600 ? erro.status : 503,
  });
}

// -----------------------------------------------------------------------------
// Sucesso
// -----------------------------------------------------------------------------

async function aplicarResultado(
  supabase: SupabaseClient,
  companyId: string,
  curto: string,
  cursorAntes: number,
  resposta: DistribuicaoResposta,
): Promise<ResultadoSync> {
  const documentos = Array.isArray(resposta.documentos) ? resposta.documentos : [];
  const linhas: Record<string, unknown>[] = [];
  let descartados = 0;
  for (const doc of documentos) {
    const linha = paraLinha(doc);
    if (linha) linhas.push(linha);
    else descartados += 1;
  }

  // ---- Gravar as notas ------------------------------------------------------
  // Upsert por (company_id, chave) dentro de UMA RPC: idempotente por
  // construção, e a RPC preserva XML completo já guardado quando o documento
  // reaparece na fila como resumo (ver comentário da migration).
  let novas = 0;
  if (linhas.length > 0) {
    const { data, error } = await supabase.rpc("dfe_upsert_inbound_nfe", {
      p_company_id: companyId,
      p_documentos: linhas,
    });
    if (error) {
      // ⚠️ O cursor NÃO avança quando a gravação falhou: as notas não ficaram
      // guardadas, e o único jeito de reavê-las é pedir os mesmos NSU de novo.
      // A janela cheia já está paga pelo claim, então repetir é seguro.
      console.error(`${TAG} upsert`, { company_id: curto, message: error.message });
      await supabase.rpc("dfe_sync_falhar", {
        p_company_id: companyId,
        p_tipo: "nfe",
        p_cstat: String(resposta.cStat ?? ""),
        p_erro: `falha ao gravar as notas recebidas: ${error.message}`.slice(0, 500),
        p_max_nsu: resposta.maxNsu ?? null,
        p_espera_minutos: ESPERA_CHEIA_MIN,
      });
      return resultado("indisponivel", {
        aviso:
          "As notas foram recebidas, mas não puderam ser gravadas. A busca será refeita automaticamente.",
        httpStatus: 500,
      });
    }
    const linha = (Array.isArray(data) ? data[0] : data) as
      | { novas: number; total: number }
      | undefined;
    novas = Number(linha?.novas ?? 0);
  }

  // ---- OBRIGAÇÃO 3: gravar o cursor, INCLUSIVE no parcial ------------------
  // `parcial` significa "sobrou fila", NUNCA "não veio nada". Os NSU do
  // `ultNsu` JÁ SAÍRAM da fila da SEFAZ — descartá-los porque "deu erro no meio"
  // faz a rodada seguinte repetir NSU servido, que é exatamente o 656.
  const parcial = resposta.parcial === true;
  const drenada = resposta.filaDrenada === true;
  const cursorDepois = Number(resposta.ultNsu ?? "") || 0;
  const avancou = cursorDepois > cursorAntes;

  // Só encurtamos a janela quando SABEMOS que a resposta chegou (estamos aqui)
  // E que o cursor andou E que ainda sobrou fila. Qualquer outro caso paga a
  // hora cheia.
  const espera = avancou && parcial && !drenada
    ? ESPERA_CONTINUA_MIN
    : ESPERA_CHEIA_MIN;

  const { error: concluirErr } = await supabase.rpc("dfe_sync_concluir", {
    p_company_id: companyId,
    p_tipo: "nfe",
    p_ult_nsu: resposta.ultNsu ?? null,
    p_max_nsu: resposta.maxNsu ?? null,
    p_cstat: resposta.cStat !== undefined ? String(resposta.cStat) : null,
    p_documentos: linhas.length,
    p_espera_minutos: espera,
    p_ciclos_ate_ocioso: CICLOS_ATE_OCIOSO,
    p_espera_ociosa_minutos: ESPERA_OCIOSA_MIN,
  });
  if (concluirErr) {
    // Cursor não gravado = a rodada seguinte repete os mesmos NSU = 656 na cara.
    // Não dá pra consertar daqui; o que dá é gritar no log e manter a espera
    // cheia (que o claim já pagou).
    console.error(`${TAG} CURSOR NAO GRAVADO`, {
      company_id: curto,
      ult_nsu: resposta.ultNsu,
      message: concluirErr.message,
    });
  }

  if (descartados > 0) {
    console.warn(`${TAG} documentos descartados`, { company_id: curto, descartados });
  }
  console.log(`${TAG} rodada ok`, {
    company_id: curto,
    cStat: resposta.cStat,
    paginas: resposta.paginas,
    recebidos: linhas.length,
    novas,
    parcial,
    ult_nsu: resposta.ultNsu,
  });

  return resultado("sincronizado", {
    novas,
    total: linhas.length,
    parcial: parcial && !drenada,
    aviso: montarAviso(resposta, novas, parcial && !drenada),
    ultimoNsu: resposta.ultNsu ?? null,
    maxNsu: resposta.maxNsu ?? null,
  });
}

/** Texto PT-BR só quando há algo a dizer. Silêncio é resposta válida. */
function montarAviso(
  resposta: DistribuicaoResposta,
  novas: number,
  parcial: boolean,
): string | undefined {
  if (resposta.aviso?.mensagem) return resposta.aviso.mensagem;
  if (parcial) {
    return "Ainda há notas na fila da SEFAZ. A busca continua automaticamente em alguns minutos.";
  }
  if (novas === 0) return "Nenhuma nota nova foi encontrada.";
  return undefined;
}

// =============================================================================
// NFS-e RECEBIDA (serviço TOMADO) — Ambiente de Dados Nacional
// =============================================================================
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ O QUE MUDA EM RELAÇÃO À NF-e — E QUE NÃO DÁ PRA COPIAR E COLAR            │
// │                                                                           │
// │ 1. O FEED MISTURA EMITIDA E RECEBIDA. As notas que a própria empresa      │
// │    emitiu vêm no mesmo NSU sequencial, AVANÇAM O CURSOR e voltam só na    │
// │    contagem `emitidasIgnoradas`. Consequência: "0 notas novas" é o        │
// │    RESULTADO NORMAL de um feed saudável, não falha e não alarme.          │
// │                                                                           │
// │ 2. O ENVELOPE NÃO TEM maxNSU. O governo não diz até onde a fila vai, só   │
// │    `filaDrenada` sinaliza o fim. Logo é IMPOSSÍVEL dizer "faltam N notas" │
// │    — e `max_nsu` fica NULL, sem palpite.                                  │
// │                                                                           │
// │ 3. EVENTO CHEGA SEM A NOTA, em NSU próprio, às vezes meses depois. Se a   │
// │    nota existir, atualiza; se não existir, IGNORA EM SILÊNCIO. Criar a    │
// │    linha a partir do evento produziria uma "nota" cancelada sem valor,    │
// │    sem prestador e sem XML na tela do cliente.                            │
// │                                                                           │
// │ 4. `issRetido: null` É "NÃO INFORMADO", NÃO false. Colapsar em false      │
// │    subestima o que o cliente ainda deve ao prestador.                     │
// └───────────────────────────────────────────────────────────────────────────┘
//
// O que NÃO muda: as três obrigações anti-656 valem iguais. O ADN não devolve
// 656 (isso é vocabulário da SEFAZ), mas devolve 429 `consumo_indevido` pelo
// mesmo motivo de fundo — pedir demais, ou reler o feed inteiro. Então o mesmo
// `dfe_sync_claim` / `dfe_sync_concluir` / `dfe_sync_falhar` é usado aqui, com
// `p_tipo = 'nfse'`, SEM UMA LINHA DE SQL NOVA: as três RPCs já recebem o tipo
// por parâmetro e nenhuma delas tem regra específica de NF-e.
// =============================================================================

/** Situações que a CHECK de `inbound_nfse.situacao` aceita. */
const SITUACOES_NFSE = new Set(["autorizada", "cancelada", "substituida"]);

function so50(v: unknown): string | null {
  const s = String(v ?? "").replace(/\D/g, "");
  return s.length === 50 ? s : null;
}

function texto(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function decimal(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * ⚠️ PONTO 4. `true`/`false` passam; QUALQUER outra coisa (ausente, null,
 * string vazia) vira `null` — "não informado". Um `!!v` aqui transformaria
 * silêncio do governo em "não houve retenção" e o cliente pagaria o prestador
 * a mais.
 */
function booleanoOuNulo(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/**
 * Traduz o documento do fio pro shape da tabela (snake_case).
 *
 * Devolve `null` pro documento que a tabela recusaria — melhor perder UMA linha
 * (contabilizada no log) do que a RPC inteira estourar numa CHECK depois de o
 * cursor já ter andado do lado do governo.
 */
function paraLinhaNfse(doc: DocumentoNfseDfe): Record<string, unknown> | null {
  // Conferência dupla do ponto 1: com `somenteRecebidas` o serviço já devolve
  // só `direcao === 'recebida'` (descarta 'emitida' e também 'indefinida', que
  // é a nota em que nenhuma das partes casou com o CNPJ). Este teste é a
  // segunda tranca, e barra só o caso de dano definido: nota que a PRÓPRIA
  // empresa emitiu jamais pode virar despesa dela. Valor ausente ou
  // desconhecido continua entrando — o filtro do servidor é a régua primária e
  // rejeitar por omissão faria perder nota boa.
  const direcao = String(doc.direcao ?? "").trim().toLowerCase();
  if (direcao === "emitida") return null;

  const chave = so50(doc.chaveAcesso);
  const numero = texto(doc.numero);
  const prestador = texto(doc.prestadorDocumento);

  // Mesma condição da CONSTRAINT `inbound_nfse_identidade_check`: sem chave de
  // acesso E sem (prestador + número) a `chave_natural` de duas notas
  // diferentes colidiria em 'MUN:?|PRE:?|SER:?|NUM:?' e uma sobrescreveria a
  // outra.
  if (!chave && !(prestador && numero)) return null;

  const situacao = String(doc.situacao ?? "").trim().toLowerCase();
  const xml = typeof doc.xml === "string" && doc.xml.trim() ? doc.xml : null;
  const nsu = String(doc.nsu ?? "").replace(/\D/g, "");

  return {
    chave_acesso: chave,
    numero,
    serie: texto(doc.serie),
    codigo_verificacao: texto(doc.codigoVerificacao),
    municipio_incidencia_ibge: texto(doc.municipioIncidenciaIbge),
    data_emissao: texto(doc.dataEmissao),
    competencia: texto(doc.competencia),
    valor_servico: decimal(doc.valorServico),
    valor_liquido: decimal(doc.valorLiquido),
    valor_iss: decimal(doc.valorIss),
    // ⚠️ PONTO 4 — tri-estado preservado até o banco.
    iss_retido: booleanoOuNulo(doc.issRetido),
    prestador_documento: prestador,
    prestador_nome: texto(doc.prestadorNome),
    prestador_im: texto(doc.prestadorIm),
    prestador_municipio_ibge: texto(doc.prestadorMunicipioIbge),
    tomador_documento: texto(doc.tomadorDocumento),
    tomador_nome: texto(doc.tomadorNome),
    codigo_tributacao_nacional: texto(doc.codigoTributacaoNacional),
    codigo_tributacao_municipal: texto(doc.codigoTributacaoMunicipal),
    discriminacao: texto(doc.discriminacao),
    situacao: SITUACOES_NFSE.has(situacao) ? situacao : "autorizada",
    xml_content: xml,
    // `resumo` é DERIVADO do que temos em mãos, não copiado do fio.
    resumo: xml === null,
    origem_ref: texto(doc.origemRef),
    nsu: nsu && nsu.length <= 15 ? nsu : null,
  };
}

/**
 * Normaliza o evento pro contrato ESTÁVEL que a RPC entende.
 *
 * ⚠️ A SITUAÇÃO SAI DE `situacaoSugerida` E DE MAIS NADA. O envelope traz
 * também `tipoEvento` (enum cru do ADN, ex.: 'CANCELAMENTO') e `codigo` — os
 * dois existem pro suporte LER, não pro código INTERPRETAR. Procurar "cancel"
 * dentro de `tipoEvento` pareceria robusto e seria o contrário: o próprio motor
 * devolve `situacaoSugerida: null` justamente nos eventos que ele NÃO sabe
 * traduzir (análise fiscal, numeração não confirmada), e vários deles carregam
 * a palavra "cancelamento" no nome sem cancelar nada. O resultado seria
 * cancelar nota VÁLIDA do cliente — dano silencioso e difícil de rastrear.
 *
 * `situacaoSugerida: null` ⇒ devolve null aqui ⇒ o evento não vai pro banco e a
 * nota fica exatamente como está. É a instrução do motor, não um descarte.
 */
function paraEventoNfse(ev: EventoNfseDfe): Record<string, unknown> | null {
  const chave = so50(ev.chaveAcesso);
  if (!chave) return null;

  const situacao = String(ev.situacaoSugerida ?? "").trim().toLowerCase();
  if (situacao !== "cancelada" && situacao !== "substituida") return null;

  return {
    chave_acesso: chave,
    situacao,
    data_cancelamento: texto(ev.dataEvento),
    chave_substituta: so50(ev.chaveSubstituta),
  };
}

/**
 * Executa UMA rodada de sincronização de NFS-e recebida para UMA empresa.
 *
 * Não lança: toda falha vira `ResultadoSync` com `motivo` + `aviso` em PT-BR.
 */
export async function sincronizarNfseDestinada(
  supabase: SupabaseClient,
  alvo: EmpresaParaSync,
): Promise<ResultadoSync> {
  const companyId = alvo.companyId;
  const curto = companyId.slice(0, 8) + "...";

  // ---- 1. Config fiscal + opt-in --------------------------------------------
  const fiscal = alvo.fiscal !== undefined
    ? alvo.fiscal
    : await carregarConfigFiscal(supabase, companyId);

  if (!fiscal) {
    return resultado("sem_config", {
      aviso:
        "Configure os dados fiscais da empresa antes de buscar notas de serviço recebidas.",
      httpStatus: 422,
    });
  }
  // Opt-in PRÓPRIO: ligar NF-e não liga NFS-e. São credenciamentos diferentes.
  if (fiscal.dfe_nfse_ativo !== true) {
    return resultado("desativado", {
      aviso:
        "A busca automática de notas de serviço recebidas está desligada. Ative nas configurações fiscais.",
    });
  }
  if (!temCertificado(fiscal)) {
    return resultado("sem_certificado", {
      aviso:
        "Envie o certificado digital A1 da empresa nas configurações fiscais. Sem ele o Ambiente Nacional não entrega as notas de serviço recebidas.",
      httpStatus: 422,
    });
  }

  // ---- 2. CNPJ (sem UF: o Ambiente de Dados Nacional não é estadual) --------
  const ident = await resolverIdentidadeFiscal(supabase, companyId, { exigirUf: false });
  if (!ident.ok) {
    return resultado("cadastro_incompleto", { aviso: ident.motivo, httpStatus: 422 });
  }

  // ---- 3. OBRIGAÇÃO 1: reivindicar a rodada ANTES de falar com a VPS --------
  // Mesma RPC da NF-e, só mudando `p_tipo`. A linha de estado é por
  // (empresa, tipo), então as duas filas nunca disputam a mesma janela.
  const { data: claimData, error: claimErr } = await supabase.rpc("dfe_sync_claim", {
    p_company_id: companyId,
    p_tipo: "nfse",
    p_espera_minutos: ESPERA_CHEIA_MIN,
  });
  if (claimErr) {
    console.error(`${TAG} claim nfse`, { company_id: curto, message: claimErr.message });
    return resultado("indisponivel", {
      aviso:
        "Não foi possível iniciar a busca de notas de serviço agora. Tente novamente em alguns minutos.",
      httpStatus: 500,
    });
  }
  const claim = (Array.isArray(claimData) ? claimData[0] : claimData) as
    | { claimed: boolean; ultimo_nsu: string | null; proxima_consulta_em: string | null }
    | undefined;

  if (!claim?.claimed) {
    return resultado("em_espera", {
      aviso:
        "A busca de notas de serviço acontece uma vez por hora. A próxima já está agendada.",
      ultimoNsu: claim?.ultimo_nsu ?? null,
      // `maxNsu` é null por CONTRATO aqui, não por falta de dado a preencher:
      // o ADN não devolve "até onde a fila vai".
      maxNsu: null,
      proximaConsultaEm: claim?.proxima_consulta_em ?? null,
    });
  }

  const cursorAntes = Number(claim.ultimo_nsu ?? 0) || 0;

  // ---- 4. Chamar a VPS ------------------------------------------------------
  let resposta: DistribuicaoNfseResposta;
  try {
    resposta = await distribuicaoNfse(
      { supabase, companyId, fiscal },
      { cnpj: ident.identidade.cnpj, ultimoNsu: cursorAntes, somenteRecebidas: true },
    );
  } catch (err) {
    return await tratarFalha(supabase, companyId, curto, err, "nfse");
  }

  // ---- 5. Aplicar o resultado ----------------------------------------------
  return await aplicarResultadoNfse(supabase, companyId, curto, cursorAntes, resposta);
}

async function aplicarResultadoNfse(
  supabase: SupabaseClient,
  companyId: string,
  curto: string,
  cursorAntes: number,
  resposta: DistribuicaoNfseResposta,
): Promise<ResultadoSync> {
  const status = String(resposta.status ?? "").trim().toUpperCase();

  // ---- REJEICAO ------------------------------------------------------------
  // CINTO E SUSPENSÓRIO. No contrato atual do motor a rejeição do ADN vira
  // HTTP 422 `distribuicao_rejeitada` e é tratada lá em cima, no `catch`; este
  // ramo só dispara se um dia ela passar a voltar no corpo com 200. Custa uma
  // comparação de string e evita que uma recusa seja lida como rodada de
  // sucesso — que gravaria cursor e contaria "0 notas novas" como normalidade.
  //
  // Não avançamos o cursor: numa rejeição nada saiu da fila, então repetir o
  // mesmo NSU na próxima rodada é o certo — o oposto do "parcial", onde os NSU
  // já foram servidos.
  if (status === "REJEICAO") {
    return await tratarFalha(
      supabase,
      companyId,
      curto,
      new DfeServiceError(
        resposta.aviso?.mensagem?.trim() ||
          "O Ambiente Nacional recusou a consulta de notas de serviço recebidas. Verifique o credenciamento do CNPJ.",
        { status: 422, codigo: "distribuicao_rejeitada" },
      ),
      "nfse",
    );
  }

  const documentos = Array.isArray(resposta.documentos) ? resposta.documentos : [];
  const eventos = Array.isArray(resposta.eventos) ? resposta.eventos : [];

  const linhas: Record<string, unknown>[] = [];
  let descartados = 0;
  for (const doc of documentos) {
    const linha = paraLinhaNfse(doc);
    if (linha) linhas.push(linha);
    else descartados += 1;
  }

  const linhasEventos: Record<string, unknown>[] = [];
  for (const ev of eventos) {
    const linha = paraEventoNfse(ev);
    if (linha) linhasEventos.push(linha);
  }

  // ---- Gravar notas e eventos NA MESMA transação ---------------------------
  // Uma RPC só de propósito: um lote pode trazer a nota E o evento que a
  // cancela. Em duas chamadas haveria uma janela mostrando como válida uma nota
  // que o governo já derrubou.
  let novas = 0;
  let eventosIgnorados = 0;
  if (linhas.length > 0 || linhasEventos.length > 0) {
    const { data, error } = await supabase.rpc("dfe_upsert_inbound_nfse", {
      p_company_id: companyId,
      p_documentos: linhas,
      p_eventos: linhasEventos,
    });
    if (error) {
      // ⚠️ Cursor NÃO avança quando a gravação falhou: as notas não ficaram
      // guardadas e o único jeito de reavê-las é pedir os mesmos NSU de novo.
      // A janela cheia já está paga pelo claim, então repetir é seguro.
      console.error(`${TAG} upsert nfse`, { company_id: curto, message: error.message });
      await supabase.rpc("dfe_sync_falhar", {
        p_company_id: companyId,
        p_tipo: "nfse",
        p_cstat: status || null,
        p_erro: `falha ao gravar as notas de servico recebidas: ${error.message}`.slice(0, 500),
        p_max_nsu: null,
        p_espera_minutos: ESPERA_CHEIA_MIN,
      });
      return resultado("indisponivel", {
        aviso:
          "As notas de serviço foram recebidas, mas não puderam ser gravadas. A busca será refeita automaticamente.",
        httpStatus: 500,
      });
    }
    const linha = (Array.isArray(data) ? data[0] : data) as
      | { novas: number; total: number; eventos_aplicados: number; eventos_ignorados: number }
      | undefined;
    novas = Number(linha?.novas ?? 0);
    eventosIgnorados = Number(linha?.eventos_ignorados ?? 0);
  }

  // ---- OBRIGAÇÃO 3: gravar o cursor, INCLUSIVE no parcial ------------------
  const parcial = resposta.parcial === true;
  const drenada = resposta.filaDrenada === true;
  const cursorDepois = Number(resposta.ultimoNsu ?? "") || 0;
  const avancou = cursorDepois > cursorAntes;

  // ⚠️ PONTO 1 CODIFICADO. O que decide "a fila andou" é o que o GOVERNO
  // SERVIU, não o que gravamos: nota emitida pela própria empresa, evento,
  // DPS, item ilegível — tudo consome NSU e nada disso vira linha em
  // `inbound_nfse`. Passar só `linhas.length` faria `ciclos_sem_documento`
  // crescer com o feed correndo e jogaria a empresa no backoff de 4h justo
  // enquanto ela está drenando o acervo. Daí somar TODOS os contadores do
  // envelope, e não só os aproveitados.
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const documentosDoFeed = documentos.length + eventos.length +
    n(resposta.emitidasIgnoradas) + n(resposta.ignorados) +
    n(resposta.ilegiveis) + n(resposta.semIdentidade);

  const espera = avancou && parcial && !drenada ? ESPERA_CONTINUA_MIN : ESPERA_CHEIA_MIN;

  const { error: concluirErr } = await supabase.rpc("dfe_sync_concluir", {
    p_company_id: companyId,
    p_tipo: "nfse",
    p_ult_nsu: resposta.ultimoNsu ?? null,
    // ⚠️ PONTO 2. Sempre null: o ADN não devolve o teto da fila. A RPC ignora
    // null (mantém o que já estava), então `max_nsu` fica NULL pra sempre em
    // 'nfse' — e é isso que impede a tela de inventar "faltam N notas".
    p_max_nsu: null,
    p_cstat: status || null,
    p_documentos: documentosDoFeed,
    p_espera_minutos: espera,
    p_ciclos_ate_ocioso: CICLOS_ATE_OCIOSO,
    p_espera_ociosa_minutos: ESPERA_OCIOSA_MIN,
  });
  if (concluirErr) {
    // Cursor não gravado = a rodada seguinte relê os mesmos NSU. Não dá 656 no
    // ADN, mas repetir feed é o caminho pro 429. Gritar no log é o que dá pra
    // fazer daqui; a espera cheia o claim já pagou.
    console.error(`${TAG} CURSOR NFSE NAO GRAVADO`, {
      company_id: curto,
      ultimo_nsu: resposta.ultimoNsu,
      message: concluirErr.message,
    });
  }

  if (descartados > 0) {
    console.warn(`${TAG} documentos nfse descartados`, { company_id: curto, descartados });
  }
  console.log(`${TAG} rodada nfse ok`, {
    company_id: curto,
    status,
    paginas: resposta.paginas,
    recebidos: linhas.length,
    novas,
    // Não é anomalia: é o feed misturado fazendo o trabalho dele.
    emitidas_ignoradas: Number(resposta.emitidasIgnoradas ?? 0),
    eventos: linhasEventos.length,
    // ⚠️ PONTO 3. Evento sem nota no acervo é ESPERADO (a nota pode ser anterior
    // ao opt-in). Fica no log como contagem, nunca como erro e nunca na tela.
    eventos_sem_nota: eventosIgnorados,
    parcial,
    ultimo_nsu: resposta.ultimoNsu,
  });

  return resultado("sincronizado", {
    novas,
    total: linhas.length,
    parcial: parcial && !drenada,
    aviso: montarAvisoNfse(resposta, novas, parcial && !drenada),
    ultimoNsu: resposta.ultimoNsu ?? null,
    maxNsu: null,
  });
}

/**
 * Texto PT-BR só quando há algo a dizer.
 *
 * ⚠️ PONTO 1 NA COPY. "Nenhuma nota nova" NÃO é problema aqui e não pode soar
 * como um: o feed do ADN mistura o que a empresa emitiu, então uma rodada
 * inteira pode avançar o cursor sem trazer nada pra ela. O texto explica o
 * porquê em vez de deixar o usuário achando que a busca falhou.
 */
function montarAvisoNfse(
  resposta: DistribuicaoNfseResposta,
  novas: number,
  parcial: boolean,
): string | undefined {
  if (resposta.aviso?.mensagem) return resposta.aviso.mensagem;
  if (parcial) {
    return "Ainda há notas de serviço na fila. A busca continua automaticamente em alguns minutos.";
  }
  if (novas === 0) {
    return Number(resposta.emitidasIgnoradas ?? 0) > 0
      ? "Nenhuma nota de serviço nova recebida. As notas emitidas pela sua empresa chegam pelo mesmo caminho e não entram nesta lista."
      : "Nenhuma nota de serviço nova foi encontrada.";
  }
  return undefined;
}

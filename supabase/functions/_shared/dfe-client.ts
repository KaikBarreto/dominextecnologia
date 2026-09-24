// =============================================================================
// _shared/dfe-client.ts — adaptador HTTP das rotas de DF-e do motor próprio.
// =============================================================================
// DF-e = Documentos Fiscais eletrônicos DESTINADOS ao CNPJ do cliente (notas que
// OUTROS emitiram contra ele). Quatro rotas no `dominex-fiscal`
// (services/dominex-fiscal, §10 do RUNBOOK.md):
//
//   POST /v1/dfe/distribuicao        → fila de NF-e destinada (cursor de NSU, SEFAZ)
//   POST /v1/dfe/consulta-chave      → diagnóstico por chave (não mexe no cursor)
//   POST /v1/dfe/manifestar          → evento do destinatário (IRREVERSÍVEL)
//   POST /v1/dfe/nfse/distribuicao   → fila de NFS-e recebida (cursor de NSU, ADN)
//
// ⚠️ AS DUAS FILAS SÃO POR NSU. Uma versão anterior deste código supôs que a
// NFS-e recebida fosse consultada por JANELA DE PERÍODO (31 dias). Isso é a
// forma do WRAPPER que o EcoSistema usa (PlugNotas), que caminha a fila por
// dentro e expõe um recorte por datas. O Ambiente de Dados Nacional, direto, não
// expõe período nenhum: serve uma fila sequencial por NSU, mesmo desenho da
// SEFAZ. Ver a migration 20260924190000.
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ POR QUE ESTE ARQUIVO NÃO É UM `NfseProvider`                              │
// │                                                                           │
// │ `_shared/nfse-provider.ts` modela EMISSÃO (o cliente cria a nota). Aqui é  │
// │ o contrário: o cliente RECEBE. Não há DPS, não há rascunho, não há status  │
// │ canônico de emissão, e o erro que interessa (429 consumo_indevido) não     │
// │ existe no vocabulário de emissão. Espremer isto na interface de provider   │
// │ obrigaria a inventar métodos que nenhum provedor de emissão implementa.    │
// │                                                                           │
// │ O que É compartilhado — e de propósito — é a CUSTÓDIA: o bloco            │
// │ `certificado` vem de `providers/sefin.ts#corpoBase`, o mesmo que a emissão │
// │ usa. Custódia com duas implementações é custódia com duas superfícies de   │
// │ erro.                                                                     │
// └───────────────────────────────────────────────────────────────────────────┘
//
// ⚠️ A VPS é STATELESS e não guarda cursor. Quem lembra onde parou é
// `dfe_sync_state` (migration 20260924160000). As três obrigações anti-656 que
// só a edge pode cumprir estão documentadas em `dfe-sync/index.ts`.
// =============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corpoBase } from "./providers/sefin.ts";
import type { NfseProviderCtx } from "./nfse-provider.ts";

const TAG = "[dfe]";

/** Mesmo contexto da emissão: client service-role + empresa + config fiscal. */
export type DfeCtx = NfseProviderCtx;

// -----------------------------------------------------------------------------
// Erro
// -----------------------------------------------------------------------------

/**
 * Falha vinda do motor fiscal. `mensagem` já chega em PT-BR do serviço (regra-lei
 * do `app/errors.py`: a mensagem pode ir pra tela, o detalhe técnico não).
 *
 * `codigo` é o que separa reação de reação:
 *   consumo_indevido (429) → a SEFAZ bloqueou o CNPJ por 1h. NÃO retentar.
 *   certificado_invalido / acesso_negado (422/403) → problema do cliente, ele age.
 *   servico_indisponivel (503) → transitório, a fila retenta.
 *   tempo_esgotado (0)  → NOSSO timeout. Trate como RODADA CONSUMIDA (§10.3).
 */
export class DfeServiceError extends Error {
  status: number;
  codigo: string;
  detalhe: unknown;
  constructor(
    mensagem: string,
    opts: { status?: number; codigo?: string; detalhe?: unknown } = {},
  ) {
    super(mensagem);
    this.name = "DfeServiceError";
    this.status = opts.status ?? 502;
    this.codigo = opts.codigo ?? "erro_fiscal";
    this.detalhe = opts.detalhe ?? null;
  }
}

const INDISPONIVEL =
  "A consulta de notas fiscais está indisponível no momento. Tente novamente em alguns minutos.";

// -----------------------------------------------------------------------------
// Transporte
// -----------------------------------------------------------------------------

function env(nome: string): string {
  return (Deno.env.get(nome) ?? "").trim();
}

/**
 * Teto do nosso lado do fio.
 *
 * O serviço se autolimita em 75s (`SEFAZ_ORCAMENTO_SEGUNDOS`) e o Caddy corta em
 * 120s (`read_timeout`). 110s fica ENTRE os dois: damos ao serviço a chance de
 * devolver o parcial (com o cursor avançado, que é o que não pode se perder) e
 * ainda assim desistimos antes do proxy, pra a mensagem de erro ser nossa e não
 * um 504 de HTML.
 */
const TIMEOUT_PADRAO_MS = 110_000;

interface CorpoErro {
  erro?: { codigo?: string; mensagem?: string };
  detalhe?: unknown;
}

async function chamarDfe<T>(
  caminho: string,
  corpo: unknown,
  opts: { timeoutMs?: number; okStatus?: number } = {},
): Promise<T> {
  const base = env("FISCAL_SERVICE_URL").replace(/\/+$/, "");
  const token = env("FISCAL_SERVICE_TOKEN");
  if (!base || !token) {
    // Falta de configuração NOSSA. O usuário não tem o que fazer com o detalhe.
    console.error(`${TAG} sem FISCAL_SERVICE_URL/TOKEN`);
    throw new DfeServiceError(
      "A consulta de notas fiscais ainda não está configurada. Fale com o suporte.",
      { status: 503, codigo: "servico_nao_configurado" },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_PADRAO_MS);

  let resposta: Response;
  try {
    resposta = await fetch(`${base}${caminho}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(corpo),
      signal: controller.signal,
    });
  } catch (err) {
    const abortou = (err as Error)?.name === "AbortError";
    console.error(`${TAG} rede`, { caminho, abortou, message: (err as Error)?.message });
    // ⚠️ `tempo_esgotado` NÃO é "não aconteceu". A SEFAZ pode ter servido NSU e a
    // resposta ter se perdido. Quem chama TEM que tratar como rodada consumida.
    throw new DfeServiceError(
      abortou
        ? "A consulta de notas fiscais demorou demais e foi interrompida. A próxima tentativa acontece automaticamente."
        : INDISPONIVEL,
      { status: 503, codigo: abortou ? "tempo_esgotado" : "servico_indisponivel" },
    );
  } finally {
    clearTimeout(timer);
  }

  if (resposta.status === (opts.okStatus ?? 200) || (resposta.ok && resposta.status < 300)) {
    return (await resposta.json()) as T;
  }

  // 401 do microserviço = NOSSO token errado. Pro usuário é indisponibilidade;
  // pra nós é alarme no log. (403 NÃO entra aqui: o serviço só devolve 401 em
  // falha de token — 403 é `acesso_negado`, ou seja, o certificado DO CLIENTE
  // foi recusado no handshake com a SEFAZ, e isso ele precisa ler.)
  if (resposta.status === 401) {
    console.error(`${TAG} token do servico recusado`, { caminho });
    throw new DfeServiceError(INDISPONIVEL, { status: 503, codigo: "servico_indisponivel" });
  }

  let payload: CorpoErro = {};
  try {
    payload = (await resposta.json()) as CorpoErro;
  } catch {
    payload = {};
  }
  const codigo = (payload?.erro?.codigo ?? "").trim() || "erro_fiscal";
  const mensagem = (payload?.erro?.mensagem ?? "").trim() || INDISPONIVEL;
  console.error(`${TAG} erro`, { caminho, status: resposta.status, codigo });
  throw new DfeServiceError(mensagem, {
    status: resposta.status,
    codigo,
    detalhe: payload?.detalhe ?? null,
  });
}

// -----------------------------------------------------------------------------
// Contratos (camelCase no fio — `app/sefaz/schemas.py`)
// -----------------------------------------------------------------------------

export interface DocumentoDfe {
  nsu: string;
  chave?: string | null;
  emitenteCnpj?: string | null;
  emitenteNome?: string | null;
  valor?: number | null;
  dataEmissao?: string | null;
  natureza?: string | null;
  /** autorizada | cancelada | denegada | outra */
  situacaoSefaz?: string | null;
  numero?: number | null;
  serie?: number | null;
  cfopPrincipal?: string | null;
  finNfe?: number | null;
  refNfeChave?: string | null;
  /** true = só o resumo (resNFe), sem XML completo. */
  resumo?: boolean;
  xml?: string | null;
}

export interface AvisoDfe {
  codigo: string;
  mensagem: string;
  detalhe?: unknown;
}

export interface DistribuicaoResposta {
  cStat: number;
  xMotivo: string;
  /** ⚠️ O CURSOR. 15 dígitos. Ausente na consulta por chave. GRAVAR SEMPRE. */
  ultNsu?: string | null;
  maxNsu?: string | null;
  filaDrenada?: boolean;
  parcial?: boolean;
  paginas?: number;
  documentos?: DocumentoDfe[];
  eventosIgnorados?: number;
  ilegiveis?: number;
  semChave?: number;
  aviso?: AvisoDfe | null;
}

// -----------------------------------------------------------------------------
// NFS-e recebida (Ambiente de Dados Nacional)
// -----------------------------------------------------------------------------

/**
 * Documento do feed de NFS-e, **1:1 com as colunas de `inbound_nfse`** (o motor
 * entrega em camelCase de propósito, pra não existir camada de tradução entre o
 * fio e a tabela).
 *
 * ⚠️ `issRetido` é TRI-ESTADO: `null` significa "o governo não informou", NÃO
 * "não houve retenção". A diferença é dinheiro — tratar null como false
 * subestima o que o cliente ainda deve ao prestador. Por isso o tipo é
 * `boolean | null` e não `boolean`.
 */
export interface DocumentoNfseDfe {
  /** Chave de Acesso nacional, 50 dígitos. Ausente em nota municipal fora do ADN. */
  chaveAcesso?: string | null;
  numero?: string | null;
  serie?: string | null;
  codigoVerificacao?: string | null;
  municipioIncidenciaIbge?: string | null;
  dataEmissao?: string | null;
  competencia?: string | null;
  valorServico?: number | null;
  valorLiquido?: number | null;
  valorIss?: number | null;
  /** ⚠️ null = NÃO INFORMADO. Nunca colapsar em false. */
  issRetido?: boolean | null;
  prestadorDocumento?: string | null;
  prestadorNome?: string | null;
  prestadorIm?: string | null;
  prestadorMunicipioIbge?: string | null;
  tomadorDocumento?: string | null;
  tomadorNome?: string | null;
  codigoTributacaoNacional?: string | null;
  codigoTributacaoMunicipal?: string | null;
  discriminacao?: string | null;
  /** autorizada | cancelada | substituida */
  situacao?: string | null;
  /** true = só metadados, sem XML completo. */
  resumo?: boolean | null;
  xml?: string | null;
  /** Protocolo/id do lote na origem. Rastreio, nunca identidade. */
  origemRef?: string | null;
  /**
   * 'recebida' | 'emitida'. O feed do ADN MISTURA as duas, e o serviço já filtra
   * quando mandamos `somenteRecebidas`. Chega assim mesmo pra dar conferência
   * dupla do lado de cá — nota emitida pela própria empresa não é despesa dela.
   */
  direcao?: string | null;
  nsu?: string | null;
}

/**
 * Evento de NFS-e — NÃO é nota, é mudança de situação
 * (`app/adn/schemas.py#EventoNfse`).
 *
 * ⚠️ CHEGA SEM A NOTA, em NSU próprio e possivelmente MESES DEPOIS dela. Quem
 * consome tem que estar preparado pra não encontrar o documento no acervo — e
 * nesse caso IGNORAR, nunca criar linha (viraria nota fantasma na tela do
 * cliente).
 *
 * ⚠️ QUEM MANDA É `situacaoSugerida`, E SÓ ELA. `tipoEvento` é o enum CRU do
 * ADN, guardado pro suporte ler — NÃO é pra ser interpretado por código.
 * `situacaoSugerida: null` significa "o motor NÃO SABE traduzir este evento em
 * situação" (acontece nos eventos de análise fiscal, cuja numeração o serviço
 * não confirmou), e não "nada mudou": a instrução é DEIXAR A NOTA COMO ESTÁ.
 * Adivinhar a situação procurando "cancel" dentro de `tipoEvento` cancelaria
 * nota válida — por isso `tipoEvento` nem entra na normalização.
 */
export interface EventoNfseDfe {
  nsu?: string | null;
  chaveAcesso?: string | null;
  /** Código de 6 dígitos do XML (ex.: '101101'). Diagnóstico. */
  codigo?: string | null;
  /** Enum cru do ADN (ex.: 'CANCELAMENTO'). ⚠️ NÃO interpretar em código. */
  tipoEvento?: string | null;
  /** 'cancelada' | 'substituida' | null. ⚠️ null = deixar a nota como está. */
  situacaoSugerida?: string | null;
  chaveSubstituta?: string | null;
  dataEvento?: string | null;
  xml?: string | null;
}

/**
 * Envelope de `/v1/dfe/nfse/distribuicao`.
 *
 * ⚠️ DUAS AUSÊNCIAS QUE MUDAM O QUE A UI PODE DIZER:
 *   * NÃO tem `ultNSU`/`maxNSU` no sentido da SEFAZ — só `ultimoNsu` (o cursor
 *     pra próxima chamada). O governo NÃO devolve "até onde a fila vai", logo é
 *     IMPOSSÍVEL dizer "faltam N notas". Não inventar esse número e não gravar
 *     `max_nsu` com palpite.
 *   * O único sinal de fim é `filaDrenada`.
 */
export interface DistribuicaoNfseResposta {
  /**
   * DOCUMENTOS_LOCALIZADOS | NENHUM_DOCUMENTO_LOCALIZADO.
   *
   * REJEICAO NÃO chega aqui no contrato atual: vira HTTP 422
   * `distribuicao_rejeitada` e cai no `catch` de quem chama.
   */
  status: string;
  /** ⚠️ O CURSOR. 15 dígitos, formato já pronto pra `dfe_sync_state.ultimo_nsu`. */
  ultimoNsu?: string | null;
  filaDrenada?: boolean;
  parcial?: boolean;
  paginas?: number;
  documentos?: DocumentoNfseDfe[];
  eventos?: EventoNfseDfe[];
  /**
   * Notas que a PRÓPRIA empresa emitiu e que o feed trouxe misturadas. Elas
   * AVANÇAM O CURSOR e não viram linha nenhuma — é por isso que "0 notas novas"
   * é resultado normal aqui, e não falha.
   */
  emitidasIgnoradas?: number;
  ignorados?: number;
  ilegiveis?: number;
  semIdentidade?: number;
  aviso?: AvisoDfe | null;
  ambiente?: number;
}

export interface ManifestacaoResposta {
  status: string;
  tipo: string;
  tipoEvento: string;
  chave: string;
  cStat: number;
  cStatLote: number;
  motivo: string;
  protocolo?: string | null;
  registradaEm?: string | null;
  /** cStat 573: o evento JÁ existia na SEFAZ. É SUCESSO, não erro. */
  duplicada?: boolean;
  ambiente?: number;
  xml?: string | null;
}

/**
 * Tipos de evento do destinatário.
 *
 * ⚠️ Os códigos abaixo estão conferidos contra `app/sefaz/manifestacao.py` (e
 * contra o worker do EcoSistema, em produção desde 17/09/2026). Uma versão do
 * plano de 24/09 trocou 210200 por 210210 — vale esta tabela:
 *   ciencia        210210  (é ESTA que destrava o XML completo)
 *   confirmada     210200
 *   desconhecida   210220
 *   nao_realizada  210240  ← ÚNICA que exige justificativa (15..255)
 */
export const TIPOS_MANIFESTACAO = [
  "ciencia",
  "confirmada",
  "desconhecida",
  "nao_realizada",
] as const;
export type TipoManifestacao = typeof TIPOS_MANIFESTACAO[number];

/** Justificativa é obrigatória em UM tipo só. A NT 2020.001 v1.50 só serializa xJust aí. */
export const TIPO_EXIGE_JUSTIFICATIVA: TipoManifestacao = "nao_realizada";
export const JUSTIFICATIVA_MIN = 15;
export const JUSTIFICATIVA_MAX = 255;

// -----------------------------------------------------------------------------
// Identidade fiscal: CNPJ + UF
// -----------------------------------------------------------------------------

/**
 * `company_fiscal_settings` NÃO tem `cnpj` nem `uf` — só `municipio_ibge`. O
 * fallback é o cadastro da empresa (`companies.cnpj` / `companies.state`).
 *
 * ⚠️ A edge manda a SIGLA ("SP"). A conversão pra código IBGE do autor da
 * consulta é da VPS (`app/sefaz/uf.py`, tabela estática das 27 UFs). Refazer a
 * tabela aqui criaria duas listas pra manter, e a divergência só apareceria no
 * dia em que a SEFAZ recusasse a consulta de um cliente específico.
 */
export interface IdentidadeFiscal {
  cnpj: string;
  uf: string;
}

export async function resolverIdentidadeFiscal(
  supabase: SupabaseClient,
  companyId: string,
  /**
   * A UF só existe pra escolher o webservice ESTADUAL da SEFAZ. O Ambiente de
   * Dados Nacional é, como o nome diz, nacional: a rota de NFS-e não recebe UF.
   * Exigi-la ali bloquearia a busca de nota de serviço por causa de um campo de
   * cadastro que não muda nada na consulta — daí o gate ser opcional.
   */
  opts: { exigirUf?: boolean } = {},
): Promise<{ ok: true; identidade: IdentidadeFiscal } | { ok: false; motivo: string }> {
  const exigirUf = opts.exigirUf !== false;
  const { data } = await supabase
    .from("companies")
    .select("cnpj, state")
    .eq("id", companyId)
    .maybeSingle();

  const cnpj = String(data?.cnpj ?? "").replace(/\D/g, "");
  const uf = String(data?.state ?? "").trim().toUpperCase();

  if (cnpj.length !== 14) {
    return {
      ok: false,
      motivo:
        "Preencha o CNPJ da empresa no cadastro antes de buscar notas recebidas. A consulta é feita pelo CNPJ destinatário.",
    };
  }
  if (exigirUf && !/^[A-Z]{2}$/.test(uf)) {
    return {
      ok: false,
      motivo:
        "Preencha o estado (UF) da empresa no cadastro antes de buscar notas recebidas.",
    };
  }
  return { ok: true, identidade: { cnpj, uf } };
}

// -----------------------------------------------------------------------------
// Rotas
// -----------------------------------------------------------------------------

/**
 * Caminha a fila de notas destinadas a partir de `ultimoNsu`.
 *
 * ⚠️ `ultimoNsu` é o ÚLTIMO JÁ CONSUMIDO (0 na primeira vez). Mandar um valor
 * menor que um já servido é o gatilho do cStat 656 — 1 hora de bloqueio do CNPJ.
 */
export async function distribuicao(
  ctx: DfeCtx,
  args: { cnpj: string; uf: string; ultimoNsu: number; maxPaginas?: number },
): Promise<DistribuicaoResposta> {
  const base = await corpoBase(ctx, "dfe_distribuicao");
  const corpo: Record<string, unknown> = {
    ...base,
    cnpj: args.cnpj,
    uf: args.uf,
    ultimoNsu: args.ultimoNsu,
  };
  if (args.maxPaginas !== undefined) corpo.maxPaginas = args.maxPaginas;
  return await chamarDfe<DistribuicaoResposta>("/v1/dfe/distribuicao", corpo);
}

/**
 * Caminha a fila de NFS-e RECEBIDA (serviço tomado) no Ambiente de Dados
 * Nacional, a partir de `ultimoNsu`.
 *
 * ⚠️ MESMA SEMÂNTICA DE CURSOR DA NF-e: `ultimoNsu` é o ÚLTIMO JÁ CONSUMIDO
 * (0 na primeira vez). Aqui regredir não gera cStat 656 — isso é vocabulário da
 * SEFAZ — mas manda reler o feed inteiro, e feed inteiro é o que faz o ADN
 * devolver **429 `consumo_indevido`**, o mesmo código de erro da NF-e (o front
 * já fala esse código, não inventar outro).
 *
 * `somenteRecebidas` vai SEMPRE true: o feed mistura o que a empresa emitiu com
 * o que ela recebeu, e nota emitida por ela mesma não é despesa dela. O serviço
 * devolve quantas foram descartadas em `emitidasIgnoradas` — elas AVANÇAM O
 * CURSOR do mesmo jeito.
 *
 * O NSU vai como NÚMERO, igual à rota de NF-e. 15 dígitos cabem com folga no
 * inteiro seguro do JS (1e15 < 9.007e15), então não há perda de precisão; quem
 * guarda o formato com zeros à esquerda é a coluna `ultimo_nsu` (text).
 */
export async function distribuicaoNfse(
  ctx: DfeCtx,
  args: {
    cnpj: string;
    ultimoNsu: number;
    maxPaginas?: number;
    somenteRecebidas?: boolean;
  },
): Promise<DistribuicaoNfseResposta> {
  const base = await corpoBase(ctx, "dfe_nfse_distribuicao");
  const corpo: Record<string, unknown> = {
    ...base,
    cnpj: args.cnpj,
    ultimoNsu: args.ultimoNsu,
    somenteRecebidas: args.somenteRecebidas !== false,
  };
  if (args.maxPaginas !== undefined) corpo.maxPaginas = args.maxPaginas;
  return await chamarDfe<DistribuicaoNfseResposta>("/v1/dfe/nfse/distribuicao", corpo);
}

/**
 * Diagnóstico: um documento pela chave. NÃO mexe no cursor de NSU...
 *
 * ⚠️ ...mas GASTA A MESMA COTA HORÁRIA. Quem chamar tem que marcar a batida na
 * mesma trava anti-656, senão um teste inocente custa uma hora de nota do cliente.
 * Por isso não existe edge pública pra esta rota — ela é só de operação.
 */
export async function consultaChave(
  ctx: DfeCtx,
  args: { cnpj: string; uf: string; chave: string },
): Promise<DistribuicaoResposta> {
  const base = await corpoBase(ctx, "dfe_consulta_chave");
  return await chamarDfe<DistribuicaoResposta>("/v1/dfe/consulta-chave", {
    ...base,
    cnpj: args.cnpj,
    uf: args.uf,
    chave: args.chave,
  });
}

/**
 * Transmite o evento do destinatário. **NÃO TEM VOLTA** perante a Receita.
 *
 * 201 no sucesso — inclusive na duplicidade (cStat 573), que volta com
 * `duplicada: true` e é o retorno esperado quando a SEFAZ aceitou e a gravação
 * do nosso lado falhou depois. Reenviar é idempotente.
 */
export async function manifestar(
  ctx: DfeCtx,
  args: {
    cnpj: string;
    chave: string;
    tipo: TipoManifestacao;
    justificativa?: string | null;
    idLote?: string | null;
    /** Teto do nosso lado. Transmissão de evento é um SOAP curto. */
    timeoutMs?: number;
  },
): Promise<ManifestacaoResposta> {
  const base = await corpoBase(ctx, `dfe_manifestar:${args.chave}`);
  const corpo: Record<string, unknown> = {
    ...base,
    cnpj: args.cnpj,
    chave: args.chave,
    tipo: args.tipo,
  };
  // Só vai no fio quando o tipo exige — o serviço ignora nos demais, mas mandar
  // texto solto num evento que não o serializa só cria ruído de auditoria.
  if (args.tipo === TIPO_EXIGE_JUSTIFICATIVA && args.justificativa) {
    corpo.justificativa = args.justificativa;
  }
  if (args.idLote) corpo.idLote = args.idLote;
  return await chamarDfe<ManifestacaoResposta>("/v1/dfe/manifestar", corpo, {
    okStatus: 201,
    timeoutMs: args.timeoutMs,
  });
}

// -----------------------------------------------------------------------------
// Auxiliares de leitura da config fiscal
// -----------------------------------------------------------------------------

/** Linha de `company_fiscal_settings` + o que a custódia precisa. */
export async function carregarConfigFiscal(
  supabase: SupabaseClient,
  companyId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from("company_fiscal_settings")
    .select(
      "id, company_id, fiscal_ambiente, certificado_ref, certificado_dek_envelopada, " +
        "certificado_senha_cifrada, certificado_nonce, certificado_algoritmo, " +
        "dfe_nfe_ativo, dfe_nfse_ativo",
    )
    .eq("company_id", companyId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/** true quando o certificado A1 está custodiado (sem ele, nenhuma consulta sai). */
export function temCertificado(fiscal: Record<string, unknown> | null): boolean {
  if (!fiscal) return false;
  const s = (k: string) => String(fiscal[k] ?? "").trim();
  return !!s("certificado_ref") && !!s("certificado_dek_envelopada") &&
    !!s("certificado_senha_cifrada");
}

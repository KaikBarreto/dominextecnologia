// =============================================================================
// _shared/nfse-provider.ts — contrato do motor próprio de NFS-e.
// =============================================================================
// As edges `nfse-*` conhecem SÓ este contrato. A implementação única fala com o
// microserviço Dominex Fiscal, que assina e transmite direto ao padrão nacional.
//
// REGRAS DA FRONTEIRA:
//   1. `status` que sai daqui é SEMPRE o vocabulário canônico PT-BR de
//      `_shared/nfse-status.ts`. Status cru do motor não vaza.
//   2. Mensagem de erro que chega ao usuário é SEMPRE PT-BR amigável
//      (`friendlyFiscalMessage`).
//   3. O motor NUNCA escreve no banco. Persistência é do handler da edge,
//      sempre filtrada por `company_id`.
// =============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { NfseCanonicalStatus } from "./nfse-status.ts";

// -----------------------------------------------------------------------------
// Contexto
// -----------------------------------------------------------------------------

/**
 * Contexto de execução entregue ao motor.
 * `supabase` é service_role (RLS bypass) — o motor usa só para LEITURA
 * auxiliar; toda escrita é responsabilidade do handler, escopada por company_id.
 */
export interface NfseProviderCtx {
  supabase: SupabaseClient;
  companyId: string;
  /**
   * Linha de `company_fiscal_settings` do tenant (já carregada pelo handler).
   *
   * ⚠️ Tem que vir da MESMA leitura que produziu `companyId` (sempre
   * `.eq("company_id", companyId)`). O certificado A1 que ASSINA a nota sai
   * daqui; `companyId` vira o `empresaId` do microserviço e a linha de
   * `fiscal_certificate_audit`. Par de origens diferentes = nota assinada com o
   * certificado de outra empresa.
   */
  fiscal: Record<string, unknown>;
  /**
   * Contexto gravado em `fiscal_certificate_audit.contexto` quando o
   * certificado é decifrado. Opcional: ausente mantém o rótulo histórico de
   * cada operação (`"emitir_nfse"`, chave de acesso na consulta, etc.).
   *
   * Existe para a emissão AUTOMÁTICA poder carimbar `emitir_nfse_auto:<job_id>`
   * e a auditoria de custódia responder qual job usou a chave privada de qual
   * CNPJ.
   */
  contextoAuditoria?: string;
}

// -----------------------------------------------------------------------------
// Erros neutros do motor fiscal
// -----------------------------------------------------------------------------

/** Integração fiscal não configurada (chave/credencial ausente). HTTP 503. */
export class NfseProviderUnconfiguredError extends Error {
  status = 503;
  constructor(message = "Integração fiscal não configurada.") {
    super(message);
    this.name = "NfseProviderUnconfiguredError";
  }
}

/** Erro devolvido pelo motor fiscal. `mensagem` já em PT-BR. */
export class NfseProviderError extends Error {
  /** HTTP a propagar ao client (fallback 502). */
  status: number;
  /** Código técnico interno/oficial (ex.: `E0625`). Nunca vai direto à UI. */
  codigo?: string;
  /** Corpo cru, para log/diagnóstico. NUNCA vai pro usuário. */
  raw?: unknown;
  /** Orientação segura para o operador, sem payload técnico do motor. */
  orientacao?: Record<string, unknown>;
  constructor(
    message: string,
    status = 502,
    opts: {
      codigo?: string;
      raw?: unknown;
      orientacao?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "NfseProviderError";
    this.status = status;
    this.codigo = opts.codigo;
    this.raw = opts.raw;
    this.orientacao = opts.orientacao;
  }
}

/**
 * Traduz código de erro fiscal cru para mensagem amigável PT-BR.
 * Usado na fronteira, para o usuário nunca ver jargão técnico do motor.
 */
export function friendlyFiscalMessage(
  code: string | undefined,
  fallback: string,
): string {
  switch (code) {
    case "documento_rejeitado":
      return "A administração tributária rejeitou a nota fiscal. Confira a orientação e corrija os dados antes de tentar novamente.";
    case "dados_invalidos":
      return "Os dados enviados para a nota fiscal são inválidos. Revise o cadastro e tente novamente.";
    case "certificado_invalido":
      return "O certificado digital da empresa está inválido ou expirado. Atualize-o antes de emitir.";
    case "acesso_negado":
      return "O certificado não foi aceito pela administração tributária. Revise o certificado e tente novamente.";
    case "servico_indisponivel":
      return "A administração tributária está indisponível no momento. Tente novamente em instantes.";
    default:
      return fallback;
  }
}

// -----------------------------------------------------------------------------
// Entrada de emissão (vocabulário do LAYOUT NACIONAL da DPS)
// -----------------------------------------------------------------------------

/** Bloco `valores` da DPS. Campo ausente = NÃO enviar (não é o mesmo que zero). */
export interface NfseValores {
  /** Obrigatório. Valor bruto do serviço. */
  valorServico: number;
  /** Alíquota de ISSQN em % (ex.: 5 = 5%). Omitida na regra da E0625. */
  aliquotaIssqn?: number;
  /** Situação do ISSQN: '1' normal · '2' exportação · '3' imunidade · '4' não incidência. */
  tribIssqn?: string;
  /** Retenção do ISSQN: '1' não retido · '2' retido pelo tomador · '3' pelo intermediário. */
  tpRetIssqn?: string;
  valorPis?: number;
  valorCofins?: number;
  valorCsll?: number;
  /** Percentual total de tributos (Simples Nacional). */
  percentualTotalTributosSimplesNacional?: number;
}

/** Endereço do TOMADOR (nunca do prestador — ver `NfseDps`). */
export interface NfseEndereco {
  /** IBGE (7 dígitos). */
  municipioIbge?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
}

export interface NfseTomador {
  /** '1' = CPF · '2' = CNPJ. */
  tipoInscricao: string;
  /** CPF/CNPJ só dígitos. */
  inscricaoFederal: string;
  razaoSocial: string;
  email?: string;
  /** Endereço do cliente. O motor envia no XML quando o bloco está completo. */
  endereco?: NfseEndereco;
}

export interface NfseServico {
  /** cTribNac (código de tributação nacional / item LC116). */
  codigoServico: string;
  /** Código NBS. */
  codigoNbs: string;
  /** IBGE (7 dígitos) do município de incidência do ISSQN. */
  municipioIncidencia: string;
  discriminacao: string;
  /**
   * cTribMun — código de tributação municipal (EXATAMENTE 3 dígitos).
   * Complementa `codigoServico` (cTribNac): o município registra o serviço como
   * `14.01.01.001` = cTribNac(6) + cTribMun(3). Sem ele, prefeitura que administra
   * o código rejeita com E0312. O handler resolve (body → rascunho → tipo de
   * serviço) e já entrega validado; ausente = NÃO enviar.
   */
  codigoTributacaoMunicipal?: string;
}

/** Cabeçalho da DPS (dados do prestador/emissor e numeração). */
export interface NfseDps {
  /** Id da DPS (layout nacional, 45 chars). */
  idDps: string;
  serieDps: string;
  numeroDps: string;
  /** YYYY-MM-DD. */
  dataCompetencia: string;
  /** IBGE (7 dígitos) do município emissor. */
  codigoMunicipioEmissor: string;
  /** '1' = CPF · '2' = CNPJ do prestador. */
  tipoInscricaoPrestador: string;
  /** CNPJ/CPF do prestador, só dígitos. */
  inscricaoFederalPrestador: string;
  /** '1' não optante · '2' optante MEI · '3' optante Simples. Ausente = não enviar. */
  opSimpNac?: string | null;
  /** Obrigatório quando opSimpNac='3'. '1'|'2'|'3'. Ausente = não enviar. */
  regApTribSN?: string | null;
  /**
   * E-mail do prestador (campo `prest/email` do layout nacional).
   *
   * ⚠️ É o ÚNICO dado do prestador que vai no XML além do CNPJ e do regime.
   * Nome, endereço e Inscrição Municipal do prestador NÃO são enviados quando
   * ele é o emitente — o governo puxa do cadastro e rejeita com E0121/E0128/
   * E0120 se mandarmos. Não acrescentar campos de prestador aqui sem checar.
   */
  emailPrestador?: string | null;
}

export interface NfseEmitirInput {
  /** Chave de idempotência da operação de negócio (1 por emissão). */
  idempotencyKey: string;
  dps: NfseDps;
  tomador: NfseTomador;
  servico: NfseServico;
  valores: NfseValores;
}

// -----------------------------------------------------------------------------
// Resultado (mesma forma para emitir / consultar / cancelar)
// -----------------------------------------------------------------------------

export interface NfseResultado {
  /** SEMPRE canônico PT-BR (_shared/nfse-status.ts). */
  status: NfseCanonicalStatus | string;
  /** Referência fiscal do documento (chave de acesso no padrão nacional). */
  referencia?: string | null;
  /** Correlação interna, quando a operação não concluir de forma síncrona. */
  requisicaoId?: string | null;
  numero?: string | null;
  chaveAcesso?: string | null;
  protocolo?: string | null;
  /** ISO 8601, quando o provedor informa. */
  emitidaEm?: string | null;
  /** XML em conteúdo (motor próprio) — mutuamente exclusivo com xmlUrl na prática. */
  xml?: string | null;
  xmlUrl?: string | null;
  pdfUrl?: string | null;
  /** Motivo de rejeição/falha. `mensagem` SEMPRE PT-BR amigável. */
  erro?: { codigo?: string; mensagem: string } | null;
  /**
   * Só `true` permite gravar um status fiscal terminal na tela. A evidência
   * vem da consulta/documento oficial, nunca de inferência local ou timeout.
   */
  confirmadoPeloFisco?: boolean;
  evidenciaFiscal?: { fonte: string; codigo?: string | null } | null;
  /** Orientação segura devolvida pelo motor, quando houver. */
  orientacao?: Record<string, unknown> | null;
  /** Resposta crua do motor, para a trilha de auditoria (nfse_events.payload). */
  raw?: unknown;
}

export interface NfseDanfseResultado {
  pdfUrl?: string | null;
  pdfBase64?: string | null;
}

// -----------------------------------------------------------------------------
// Onboarding (certificado e cobertura)
// -----------------------------------------------------------------------------

/**
 * Material do certificado JÁ CIFRADO, para o handler persistir.
 *
 * A custódia é nossa. O que trafega/persiste é sempre ciphertext — a chave que
 * abre (KEK) vive só na VPS e NUNCA passa pela edge nem pelo banco.
 */
export interface NfseCustodiaCertificado {
  /** Caminho do ciphertext do .pfx no bucket privado do Storage. */
  certificadoRef: string;
  /** DEK da empresa cifrada pela KEK (base64). Inútil sem a VPS. */
  dekEnvelopada: string;
  /** Senha do .pfx cifrada pela DEK (base64). */
  senhaCifrada: string;
  /** Nonce/IV do AES-256-GCM (base64). */
  nonce: string;
  /** Ex.: 'AES-256-GCM'. */
  algoritmo: string;
}

export interface NfseCertificadoResultado {
  ok: boolean;
  referenciaCertificado?: string | null;
  status?: string | null;
  /** ISO 8601 da validade comprovada pelo motor. */
  validadeAte?: string | null;
  /** CNPJ comprovado dentro do A1, somente dígitos. Nunca é inferido. */
  cnpjTitular?: string | null;
  mensagem?: string;
  /** Presente só no motor próprio (custódia nossa). Ver NfseCustodiaCertificado. */
  custodia?: NfseCustodiaCertificado;
}

export interface NfseCoberturaResultado {
  podeEmitir: boolean;
  municipio?: string | null;
  uf?: string | null;
  /** Resposta crua, devolvida ao client para diagnóstico na tela. */
  raw?: unknown;
}

// -----------------------------------------------------------------------------
// Contrato
// -----------------------------------------------------------------------------

export interface NfseEngine {
  readonly nome: "sefin";

  emitir(ctx: NfseProviderCtx, input: NfseEmitirInput): Promise<NfseResultado>;

  /**
   * Consulta o documento no provedor.
   * `opts.statusAtual` é o status canônico já gravado — usado como fallback para
   * NUNCA rebaixar uma nota por causa de um valor que não sabemos ler.
   */
  consultar(
    ctx: NfseProviderCtx,
    referencia: string,
    opts?: { statusAtual?: string },
  ): Promise<NfseResultado>;

  cancelar(
    ctx: NfseProviderCtx,
    referencia: string,
    motivo: string,
  ): Promise<NfseResultado>;

  danfse(
    ctx: NfseProviderCtx,
    referencia: string,
  ): Promise<NfseDanfseResultado>;

  enviarCertificado(
    ctx: NfseProviderCtx,
    arquivo: File,
    senha: string,
    nome?: string,
  ): Promise<NfseCertificadoResultado>;

  checarCobertura(
    ctx: NfseProviderCtx,
    ibge: string,
  ): Promise<NfseCoberturaResultado>;
}

// -----------------------------------------------------------------------------
// Motor único
// -----------------------------------------------------------------------------

import { nfseEngine } from "./providers/sefin.ts";

/** Único motor de NFS-e do Dominex: integração direta com o padrão nacional. */
export function getNfseEngine(): NfseEngine {
  return nfseEngine;
}

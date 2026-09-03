// =============================================================================
// _shared/nfse-provider.ts — FRONTEIRA NEUTRA de provedor de NFS-e.
// =============================================================================
// Nada aqui pode citar fornecedor. As edges `nfse-*` conhecem SÓ este contrato;
// quem fala com a Fisqal é `_shared/providers/fisqal.ts` e quem vai falar com a
// API do governo (Sefin Nacional) é `_shared/providers/sefin.ts`.
//
// REGRAS DA FRONTEIRA:
//   1. `status` que sai daqui é SEMPRE o vocabulário canônico PT-BR de
//      `_shared/nfse-status.ts`. Status cru do provedor não vaza.
//   2. Mensagem de erro que chega ao usuário é SEMPRE PT-BR amigável
//      (`friendlyFiscalMessage`).
//   3. O provedor NUNCA escreve no banco. Persistência é do handler da edge,
//      sempre filtrada por `company_id`.
//   4. Seleção do provedor: `company_fiscal_settings.provedor`
//      ('fisqal' | 'sefin'). Ausente/desconhecido → 'fisqal' (default do banco).
// =============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { NfseCanonicalStatus } from "./nfse-status.ts";

// -----------------------------------------------------------------------------
// Contexto
// -----------------------------------------------------------------------------

/**
 * Contexto de execução entregue ao provedor.
 * `supabase` é service_role (RLS bypass) — o provedor usa só para LEITURA
 * auxiliar; toda escrita é responsabilidade do handler, escopada por company_id.
 */
export interface NfseProviderCtx {
  supabase: SupabaseClient;
  companyId: string;
  /** Linha de `company_fiscal_settings` do tenant (já carregada pelo handler). */
  fiscal: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Erros neutros (o handler nunca vê erro de fornecedor)
// -----------------------------------------------------------------------------

/** Integração fiscal não configurada (chave/credencial ausente). HTTP 503. */
export class NfseProviderUnconfiguredError extends Error {
  status = 503;
  constructor(message = "Integração fiscal não configurada.") {
    super(message);
    this.name = "NfseProviderUnconfiguredError";
  }
}

/** Erro devolvido pelo provedor fiscal. `mensagem` já em PT-BR. */
export class NfseProviderError extends Error {
  /** HTTP a propagar ao client (fallback 502). */
  status: number;
  /** Código cru do provedor (ex: 'NFSE_REJECTED', 'E0625'). */
  codigo?: string;
  /** Corpo cru, para log/diagnóstico. NUNCA vai pro usuário. */
  raw?: unknown;
  constructor(
    message: string,
    status = 502,
    opts: { codigo?: string; raw?: unknown } = {},
  ) {
    super(message);
    this.name = "NfseProviderError";
    this.status = status;
    this.codigo = opts.codigo;
    this.raw = opts.raw;
  }
}

/** Capacidade não suportada pelo provedor ativo. HTTP 501. */
export class NfseProviderUnsupportedError extends Error {
  status = 501;
  constructor(message = "Esta operação não está disponível na emissão fiscal atual.") {
    super(message);
    this.name = "NfseProviderUnsupportedError";
  }
}

/**
 * Traduz código de erro fiscal cru para mensagem amigável PT-BR.
 * Usado na fronteira, para o usuário nunca ver jargão do provedor.
 */
export function friendlyFiscalMessage(
  code: string | undefined,
  fallback: string,
): string {
  switch (code) {
    case "NFSE_REJECTED":
      return "A prefeitura rejeitou a nota fiscal. Confira os dados do serviço e do cliente e tente novamente.";
    case "VALIDATION_ERROR":
      return "Os dados enviados para a nota fiscal são inválidos. Revise o cadastro e tente novamente.";
    case "CERTIFICATE_INVALID":
      return "O certificado digital da empresa está inválido ou expirado. Atualize-o antes de emitir.";
    case "COMPANY_INACTIVE":
      return "A empresa está inativa na emissão fiscal e não pode emitir notas.";
    case "COMPANY_PLAN_LIMIT":
      return "O limite de emissões fiscais foi atingido. Tente novamente no próximo ciclo.";
    case "FISCAL_PROVIDER_ERROR":
      return "O sistema da prefeitura/SEFIN está indisponível no momento. Tente novamente em instantes.";
    case "RATE_LIMITED":
      return "Muitas emissões em sequência. Aguarde alguns instantes e tente novamente.";
    default:
      return fallback;
  }
}

// -----------------------------------------------------------------------------
// Entrada de emissão (vocabulário do LAYOUT NACIONAL da DPS, não de fornecedor)
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
  /**
   * Endereço do cliente. Opcional: provedor intermediado o ignora (ele já tem
   * o cadastro), o motor próprio envia no XML quando disponível.
   */
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
  /** Identificador do documento no provedor (dpsId na Fisqal, chaveAcesso no governo). */
  referencia?: string | null;
  /** Correlação assíncrona do provedor (fiscalRequestId na Fisqal). */
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
  /** Resposta crua do provedor, para a trilha de auditoria (nfse_events.payload). */
  raw?: unknown;
}

export interface NfseDanfseResultado {
  pdfUrl?: string | null;
  pdfBase64?: string | null;
}

// -----------------------------------------------------------------------------
// Onboarding (registro de empresa, certificado, cobertura, catálogos)
// -----------------------------------------------------------------------------

export interface NfseEmpresaInput {
  razaoSocial: string;
  nomeFantasia?: string;
  /** Só dígitos. */
  cnpj: string;
  inscricaoMunicipal: string;
  inscricaoEstadual?: string;
  /** IBGE (7 dígitos). */
  codigoMunicipio: string;
  municipio: string;
  uf: string;
  logradouro: string;
  numero?: string;
  bairro?: string;
  cep: string;
  email?: string;
  telefone?: string;
  /** 'homologacao' | 'producao'. */
  ambiente: string;
  /** Referência já existente da empresa no provedor (→ atualizar em vez de criar). */
  referenciaExistente?: string;
}

export interface NfseEmpresaResultado {
  ok: boolean;
  /** Id da empresa no provedor. Null quando o provedor não tem cadastro (motor próprio). */
  referenciaEmpresa?: string | null;
  /** true quando foi atualização (já estava registrada). */
  atualizado: boolean;
  mensagem?: string;
}

/**
 * Material do certificado JÁ CIFRADO, para o handler persistir.
 *
 * Só o motor próprio devolve isto: no provedor intermediado o certificado fica
 * com o fornecedor e nós guardamos apenas um id. Aqui a custódia é nossa, e o
 * que trafega/persiste é sempre ciphertext — a chave que abre (KEK) vive só na
 * VPS e NUNCA passa pela edge nem pelo banco.
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
  /** ISO 8601 da validade, quando o provedor informa. */
  validadeAte?: string | null;
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

export interface NfseCatalogoItem {
  codigo: string;
  descricao: string;
  itemLc116?: string;
}

export interface NfseCatalogoResultado {
  items: NfseCatalogoItem[];
  total: number;
}

// -----------------------------------------------------------------------------
// Contrato
// -----------------------------------------------------------------------------

export interface NfseProvider {
  readonly nome: "fisqal" | "sefin";

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

  danfse(ctx: NfseProviderCtx, referencia: string): Promise<NfseDanfseResultado>;

  /** Opcional: o motor próprio (governo) não tem cadastro prévio de empresa. */
  registrarEmpresa?(
    ctx: NfseProviderCtx,
    dados: NfseEmpresaInput,
  ): Promise<NfseEmpresaResultado>;

  /** Opcional: custódia de certificado difere por provedor. */
  enviarCertificado?(
    ctx: NfseProviderCtx,
    arquivo: File,
    senha: string,
    nome?: string,
  ): Promise<NfseCertificadoResultado>;

  /** Opcional: cobertura municipal. */
  checarCobertura?(
    ctx: NfseProviderCtx,
    ibge: string,
  ): Promise<NfseCoberturaResultado>;

  /** Opcional: catálogos oficiais (códigos de tributação / NBS). */
  buscarCatalogo?(
    ctx: NfseProviderCtx,
    params: { tipo: "servico" | "nbs"; q?: string; limit?: number },
  ): Promise<NfseCatalogoResultado>;
}

// -----------------------------------------------------------------------------
// Seleção de provedor
// -----------------------------------------------------------------------------

import { fisqalProvider } from "./providers/fisqal.ts";
import { sefinProvider } from "./providers/sefin.ts";

export const PROVEDOR_PADRAO = "fisqal" as const;

/**
 * Resolve o provedor a partir da linha de `company_fiscal_settings`.
 * Ausente, vazio ou desconhecido → 'fisqal' (mesmo default da coluna no banco).
 * Nunca lança: uma configuração estranha não pode derrubar a emissão.
 */
export function getProvider(
  fiscal: Record<string, unknown> | null | undefined,
): NfseProvider {
  const raw = typeof fiscal?.provedor === "string"
    ? fiscal.provedor.trim().toLowerCase()
    : "";
  if (raw === "sefin") return sefinProvider;
  return fisqalProvider;
}

/** Nome do provedor ativo, para log/diagnóstico (nunca expõe segredo). */
export function getProviderName(
  fiscal: Record<string, unknown> | null | undefined,
): string {
  return getProvider(fiscal).nome;
}

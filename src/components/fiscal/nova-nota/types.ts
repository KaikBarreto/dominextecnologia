/**
 * Tipos compartilhados do stepper de Nova Nota.
 * Espelha o conjunto de campos que a emissão aceita — NÃO inclui
 * INSS, IRRF, deduções da base, desconto condicionado nem desconto
 * incondicionado (não suportados).
 */

import type { Customer } from '@/types/database';

/** Subconjunto de Customer necessário como tomador/intermediário da NFS-e. */
export type NfseCustomer = Pick<
  Customer,
  | 'id'
  | 'name'
  | 'company_name'
  | 'nome_fantasia'
  | 'document'
  | 'address'
  | 'address_number'
  | 'complement'
  | 'neighborhood'
  | 'city'
  | 'state'
  | 'zip_code'
  | 'ibge_municipality_code'
  | 'inscricao_municipal'
>;

/**
 * Situação do ISSQN (layout nacional da NFS-e).
 * '1' = Operação tributada normalmente
 * '2' = Exportação de serviço
 * '3' = Imunidade
 * '4' = Não incidência
 */
export type TribIssqn = '1' | '2' | '3' | '4';

/**
 * Tipo de retenção do ISSQN (tabela do layout nacional da NFS-e).
 * '1' = NÃO retido (caso mais comum — o prestador recolhe o ISS)
 * '2' = retido pelo tomador
 * '3' = retido pelo intermediário
 */
export type TpRetIssqn = '1' | '2' | '3';

/** Estado da etapa Serviço. */
export interface NfseServicoState {
  /**
   * Tipo de serviço escolhido no seletor do topo da etapa (id de `service_types`).
   * Serve só de atalho de preenchimento e memória visual do que foi puxado —
   * a emissão continua usando os códigos abaixo, que seguem editáveis.
   * Vazio = nenhum serviço puxado (preenchimento manual).
   */
  serviceTypeId: string;
  /** Código de tributação / serviço (cTribNac — 6 dígitos). */
  codigoServico: string;
  /**
   * Código de tributação municipal (cTribMun — 3 dígitos).
   * Complementa o cTribNac: a prefeitura registra o serviço como
   * cTribNac + cTribMun (ex.: "14.01.01.001"). Vazio = herda do tipo de
   * serviço no momento da emissão. Sem ele a prefeitura pode recusar a nota.
   */
  codigoTributacaoMunicipal: string;
  /** Código NBS (Nomenclatura Brasileira de Serviços). */
  codigoNbs: string;
  /** Código IBGE do município de incidência. */
  municipioIncidenciaIbge: string;
  /** Nome do município de incidência (UX only). */
  municipioIncidenciaNome: string;
  /** Situação do ISSQN. */
  tribIssqn: TribIssqn;
  /** Discriminação do serviço (aparece na nota — obrigatória). */
  discriminacao: string;
}

/** Estado da etapa Valores (apenas campos suportados pela emissão). */
export interface NfseValoresState {
  /** Valor bruto do serviço (> 0 pra emitir). */
  valorServico: number;
  /** Alíquota de ISS em % (ex.: 3 = 3%). */
  aliquotaIssqn: number;
  /** Tipo de retenção do ISS. */
  tpRetIssqn: TpRetIssqn;
  /** PIS retido em R$ (valor absoluto, não %). */
  valorPis: number;
  /** COFINS retido em R$ (valor absoluto, não %). */
  valorCofins: number;
  /** CSLL retido em R$ (valor absoluto, não %). */
  valorCsll: number;
  /**
   * Percentual total de tributos do Simples Nacional (%).
   * Opcional — só informado quando a empresa está no Simples.
   */
  percentualTribSn: number;
}

/** Resultado do cálculo de impostos da nota (sem deduções — não suportadas). */
export interface NfseTaxResult {
  /** valorServico (sem deduções — não suportadas). */
  baseCalculo: number;
  /** baseCalculo × aliquotaIssqn/100 (2 casas). */
  issValor: number;
  /** PIS + COFINS + CSLL (R$). */
  totalRetencoesFederais: number;
  /**
   * valorServico − (valorPis + valorCofins + valorCsll) − (ISS se retido no tipo '1').
   */
  valorLiquido: number;
}

/** Props de rascunho inicial (Onda 3 — reabrir rascunho existente). */
export interface NfseInitialDraft {
  id: string;
  customerId?: string | null;
  intermediarioCustomerId?: string | null;
  dataCompetencia?: string | null;
  regimeApuracao?: string | null;
  servico?: Partial<NfseServicoState>;
  valores?: Partial<NfseValoresState>;
}

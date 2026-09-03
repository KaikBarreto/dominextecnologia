import type { NfseEmissionRow } from '@/hooks/useNfseEmissionsPaged';
import type { NfseEmission } from '@/hooks/useNfse';

/**
 * Linha da listagem paginada de NFS-e.
 *
 * Alias do tipo do hook — existe só pra dar um nome curto ao que a tela usa e
 * pra centralizar aqui os helpers de leitura da linha (data exibida, conversão
 * pro detalhe). A RPC devolve TODO o detalhe da nota desde a migration
 * 20260903210000, então a linha expandida NÃO faz round-trip por nota.
 */
export type NfseListRow = NfseEmissionRow;

/**
 * Data EXIBIDA de uma nota = COMPETÊNCIA (mês do serviço prestado).
 *
 * Regra única da tela. A listagem e a Visão Geral mostravam datas DIFERENTES
 * pra mesma nota porque liam `created_at` (timestamp) com tratamentos de fuso
 * distintos — nota criada 03/09 00h30 UTC aparecia como 02/09 numa superfície
 * e 03/09 na outra. A competência é data-pura (YYYY-MM-DD), imune a virada de
 * fuso, e é o que o contador olha. `created_at` fica só como último recurso
 * (rascunho salvo antes de escolher a competência).
 */
export function nfseDisplayDate(row: {
  data_competencia?: string | null;
  created_at?: string | null;
}): string | null {
  return row.data_competencia || row.created_at || null;
}

/**
 * Converte a linha da listagem no shape que o `NfseDetailModal` consome.
 *
 * SEM `as unknown as`: o cast escondia campo esquecido (a descrição do serviço
 * chegava na linha e o modal recebia `null`, mostrando "—" com o dado na mão).
 * Tipado como `NfseEmission`, o compilador cobra cada coluna nova do schema —
 * é de propósito que esta função "quebre" quando a tabela crescer.
 *
 * `company_id` fica vazio porque a RPC não devolve (nem deve: já isolou por
 * tenant no corpo) e nenhuma superfície do detalhe usa esse campo.
 */
export function nfseRowToEmission(row: NfseListRow): NfseEmission {
  const emission: NfseEmission = {
    id: row.id,
    company_id: '',
    status: row.status,
    customer_id: row.customer_id,
    intermediario_customer_id: null,
    financial_transaction_id: null,
    numero_nfse: row.numero_nfse,
    chave_acesso: row.chave_acesso,
    protocolo: row.protocolo,
    pdf_url: row.pdf_url,
    xml_url: row.xml_url,
    xml_autorizado: null,
    xml_cancelamento: null,
    valor_servico: row.valor_servico,
    valor_iss: row.valor_iss,
    valor_pis: row.valor_pis,
    valor_cofins: row.valor_cofins,
    valor_csll: row.valor_csll,
    aliquota_issqn: row.aliquota_issqn,
    percentual_trib_sn: row.percentual_trib_sn,
    trib_issqn: row.trib_issqn,
    tp_ret_issqn: row.tp_ret_issqn,
    descricao_servico: row.descricao_servico,
    codigo_servico: row.codigo_servico,
    codigo_tributacao_municipal: row.codigo_tributacao_municipal,
    codigo_nbs: row.codigo_nbs,
    municipio_incidencia_ibge: row.municipio_incidencia_ibge,
    service_type_id: row.service_type_id,
    regime_apuracao: null,
    data_competencia: row.data_competencia,
    idempotency_key: null,
    error_message: row.error_message,
    emitida_em: row.emitida_em,
    created_at: row.created_at,
    created_by: row.created_by,
    updated_at: row.created_at,
    fisqal_dps_id: null,
    fisqal_fiscal_request_id: null,
  };
  return emission;
}

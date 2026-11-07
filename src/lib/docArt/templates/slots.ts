// =============================================================================
// docArt/templates/slots.ts — Textos default dos slots do Certificado.
// =============================================================================
// As três artes compartilham o mesmo CONTEÚDO (é o mesmo certificado); o que
// muda entre elas é o desenho. Centralizar aqui garante que trocar de arte não
// troca o texto que o gestor já conhece.
//
// O texto é o mesmo do certificado em modo texto puro
// (`src/utils/pmocDocumentTemplates.ts#buildDefaultCertificadoHtml`), só que
// repartido nos slots da arte — o gestor que já editou o texto antigo reconhece
// cada pedaço.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type { DocArtSlotKey } from '../types.ts';

/** `<span data-pmoc-var="...">` — o mesmo nó que o editor rich-text produz. */
function v(key: string): string {
  return `<span data-pmoc-var="${key}"></span>`;
}

/**
 * Defaults do Certificado de Conformidade. Um slot com string vazia some do
 * desenho (ver `resolveText`), então todo slot aqui nasce preenchido.
 */
export const CERTIFICADO_DEFAULT_SLOTS: Partial<Record<DocArtSlotKey, string>> = {
  sobretitulo: 'Lei Federal nº 13.589/2018 · Portaria GM/MS nº 3.523/1998',

  titulo: 'CERTIFICADO DE CONFORMIDADE',

  subtitulo: 'AMBIENTES CLIMATIZADOS',

  corpo: [
    `<p>Certificamos que os equipamentos de climatização da unidade <strong>${v('cliente.nome')}</strong>, inscrita no CNPJ/CPF nº <strong>${v('cliente.documento')}</strong>, foram submetidos ao processo de manutenção, limpeza e higienização, em conformidade com a Lei Federal nº 13.589/2018, a Portaria GM/MS nº 3.523/1998 e as normas aplicáveis.</p>`,
    `<p>O atendimento foi executado sob responsabilidade técnica de <strong>${v('rt.nome')}</strong>, com os procedimentos e o produto identificados neste certificado e no relatório da execução.</p>`,
  ].join(''),

  destaque: 'Este certificado é válido mediante a apresentação do relatório de execução com a relação dos equipamentos atendidos.',

  produtoTitulo: 'PRODUTOS UTILIZADOS',

  produto: '<strong>Dados do produto</strong> conforme o relatório de execução vinculado.',

  assinaturaTitulo: 'RESPONSÁVEL TÉCNICO',

  assinaturaNome: `<strong>${v('rt.nome')}</strong>`,

  assinaturaCargo: `<strong>${v('rt.modalidade')}</strong><br>CFT/CREA <strong>${v('rt.cft_crea')}</strong> · Registro <strong>${v('rt.registro')}</strong>`,

  rodape: `<strong>EMPRESA RESPONSÁVEL</strong><br><strong>${v('empresa.nome')}</strong> · CNPJ <strong>${v('empresa.cnpj')}</strong><br>${v('empresa.telefone')}`,

  lateral: `Emitido em <strong>${v('documento.data_emissao')}</strong> · Válido até <strong>${v('documento.data_vencimento')}</strong>`,

  validacao: `Nº <strong>${v('documento.codigo_validacao')}</strong> · VALIDE EM ${v('documento.url_validacao')}`,
};

/** Conteúdo-base do certificado emitido para o contrato/estabelecimento. */
export const CERTIFICADO_CONTRACT_SLOTS: Partial<Record<DocArtSlotKey, string>> = {
  corpo: [
    `<p>Certificamos que os ambientes climatizados do estabelecimento <strong>${v('cliente.nome')}</strong>, inscrito no CNPJ/CPF nº <strong>${v('cliente.documento')}</strong>, estão abrangidos pelo Plano de Manutenção, Operação e Controle do contrato <strong>${v('contrato.nome')}</strong>, em conformidade com a Lei Federal nº 13.589/2018, a Portaria GM/MS nº 3.523/1998 e as normas aplicáveis.</p>`,
    `<p>O plano é conduzido sob responsabilidade técnica de <strong>${v('rt.nome')}</strong>, conforme a periodicidade e os procedimentos previstos para o estabelecimento.</p>`,
  ].join(''),
  destaque: 'Este certificado comprova a cobertura do contrato e do estabelecimento durante sua vigência. As execuções de cada atendimento permanecem registradas nos respectivos relatórios de serviço.',
  produtoTitulo: 'CONTRATO E ESTABELECIMENTO',
  produto: `<strong>${v('contrato.nome')}</strong><br>Estabelecimento: <strong>${v('cliente.nome')}</strong><br>Validade: <strong>${v('documento.validade')}</strong>`,
};

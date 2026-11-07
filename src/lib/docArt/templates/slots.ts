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
  sobretitulo: 'Lei Federal nº 13.589, de 4 de janeiro de 2018',

  titulo: 'CERTIFICADO DE CONFORMIDADE',

  subtitulo: 'AMBIENTES CLIMATIZADOS',

  corpo: [
    `<p>Certificamos que os equipamentos de climatização da unidade <strong>${v('cliente.nome')}</strong>, inscrita no CNPJ/CPF nº <strong>${v('cliente.documento')}</strong>, foram submetidos ao processo de manutenção, limpeza e higienização, em conformidade com a Lei Federal nº 13.589/2018 e as normas aplicáveis.</p>`,
    `<p>O atendimento foi executado sob responsabilidade técnica de <strong>${v('rt.nome')}</strong>, com os procedimentos e o produto identificados neste certificado e no relatório da execução.</p>`,
  ].join(''),

  destaque: 'Este certificado é válido mediante a apresentação do relatório de execução com a relação dos equipamentos atendidos.',

  produto: '<strong>PRODUTO UTILIZADO</strong><br>Dados do produto conforme o relatório de execução vinculado.',

  assinaturaNome: `<strong>RESPONSÁVEL TÉCNICO</strong><br><strong>${v('rt.nome')}</strong>`,

  assinaturaCargo: `${v('rt.modalidade')}<br>CFT/CREA ${v('rt.cft_crea')} · Registro ${v('rt.registro')}`,

  rodape: `${v('empresa.nome')} · ${v('empresa.telefone')}`,

  lateral: `Emitido em ${v('documento.data_emissao')} · Válido até ${v('documento.data_vencimento')}`,
};

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

  titulo: 'Certificado',

  subtitulo: 'de Conformidade',

  corpo: [
    `<p>A empresa <strong>${v('empresa.razao_social')}</strong>, inscrita no CNPJ nº <strong>${v('empresa.cnpj')}</strong>, certifica que a unidade <strong>${v('cliente.nome')}</strong>, inscrita no CNPJ nº <strong>${v('cliente.documento')}</strong>, localizada em ${v('cliente.endereco')}, está sob plano formal de manutenção preventiva e operacional, sob supervisão técnica de <strong>${v('rt.nome')}</strong> (${v('rt.modalidade')}, CFT ${v('rt.cft_crea')}).</p>`,
    `<p><strong>Periodicidade das manutenções:</strong> ${v('contrato.frequencia')}. <strong>Vigência:</strong> a partir de ${v('contrato.vigencia_inicio')}.</p>`,
  ].join(''),

  destaque: 'Plano de Manutenção, Operação e Controle',

  assinaturaNome: v('rt.nome'),

  assinaturaCargo: `${v('rt.modalidade')} · CFT ${v('rt.cft_crea')}`,

  rodape: `${v('empresa.nome')} · ${v('empresa.telefone')}`,

  lateral: `Emitido em ${v('documento.data_emissao')} · Válido até ${v('documento.data_vencimento')}`,
};

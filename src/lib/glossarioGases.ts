/**
 * Glossário de NOMENCLATURA dos gases refrigerantes (números, letras, séries).
 * 100% estático/offline. PT-BR, linguagem direta pro técnico de campo.
 *
 * Renderizado em accordion pela aba "Início" (Inicio.tsx), na seção
 * "Gases e Nomenclatura". Mesmo formato dos demais glossários.
 */

export interface TermoGlossarioGases {
  /** Identificador estável (usado como value do AccordionItem). */
  id: string;
  /** Nome do termo. */
  termo: string;
  /** Explicação clara do que é. */
  descricao: string;
  /** Exemplo prático (opcional). */
  exemplo?: string;
}

export const GLOSSARIO_GASES: TermoGlossarioGases[] = [
  {
    id: 'gas-puro',
    termo: 'Gás puro',
    descricao:
      'Refrigerante feito de uma única substância (uma molécula só). Ex.: R-22, R-32, R-290.',
  },
  {
    id: 'isomero',
    termo: 'Isômero (letra minúscula, ex. R-134a)',
    descricao:
      'Mesma fórmula química, com os átomos arranjados de forma diferente. A letra minúscula (a, b) marca a versão assimétrica da molécula. Ex.: R-134a, R-600a.',
  },
  {
    id: 'mistura-blend',
    termo: 'Mistura / Blend (letra MAIÚSCULA, ex. R-410A)',
    descricao:
      'Vários gases combinados. A letra maiúscula (A, B, C, D) diz QUAL proporção da mesma receita. Ex.: R-404A, R-407C, R-410A, R-438A.',
  },
  {
    id: 'series-400-500',
    termo: 'Séries 400 e 500',
    descricao:
      '400 = misturas zeotrópicas (têm glide). 500 = misturas azeotrópicas (comportam-se quase como um gás só).',
  },
  {
    id: 'glide',
    termo: 'Glide',
    descricao:
      'Variação de temperatura durante a mudança de fase nas misturas zeotrópicas. Por isso essas misturas se carregam SEMPRE pela fase líquida do cilindro.',
  },
  {
    id: 'porque-letra',
    termo: 'Por que o gás tem letra?',
    descricao:
      'Pra ser único: sem a letra, o mesmo número apontaria pra mais de um gás — outra forma da molécula (isômero) ou outra proporção da mistura.',
  },
];

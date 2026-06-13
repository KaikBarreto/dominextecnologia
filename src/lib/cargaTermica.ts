/**
 * Cálculo de carga térmica (estimativa de BTUs) para dimensionamento de ar-condicionado.
 *
 * ⚠️ ESTIMATIVA. Esta fórmula é uma referência simplificada inspirada nas
 * recomendações da NBR 5858 / ABNT para conforto térmico, mas NÃO substitui um
 * cálculo de carga térmica feito por profissional habilitado. O resultado serve
 * apenas como ponto de partida para a escolha do equipamento. Diferentes
 * realidades de instalação (isolamento, orientação solar, materiais, ocupação
 * real) alteram o valor final.
 *
 * Os fatores ficam isolados em CARGA_TERMICA_FATORES para ajuste fácil sem
 * mexer na lógica.
 */

export const CARGA_TERMICA_FATORES = {
  /** BTU por m² em ambiente NÃO ensolarado (sombra / pouca incidência solar). */
  btuPorM2Sombra: 600,
  /** BTU por m² em ambiente ensolarado (forte incidência solar). */
  btuPorM2Sol: 800,
  /** BTU adicionais por pessoa no ambiente. */
  btuPorPessoa: 600,
  /** BTU adicionais por equipamento eletroeletrônico. */
  btuPorEletronico: 600,
  /** BTU adicionais por janela (~2 x 1,5 m) em ambiente NÃO ensolarado. */
  btuPorJanelaSombra: 600,
  /** BTU adicionais por janela (~2 x 1,5 m) em ambiente ensolarado. */
  btuPorJanelaSol: 1000,
  /**
   * Fator de pé-direito alto. Para cada metro de altura acima de 3 m,
   * acrescenta 15% sobre a carga base do ambiente.
   */
  alturaReferencia: 3,
  fatorPeDireitoAlto: 0.15,
} as const;

export interface CargaTermicaInput {
  /** Altura do pé-direito, em metros. */
  altura: number;
  /** Largura do ambiente, em metros. */
  largura: number;
  /** Comprimento do ambiente, em metros. */
  comprimento: number;
  /** Quantidade de pessoas que ocupam o ambiente. */
  pessoas: number;
  /** Quantidade de equipamentos eletroeletrônicos. */
  eletronicos: number;
  /** Quantidade de janelas (~2 x 1,5 m). */
  janelas: number;
  /** Ambiente recebe forte incidência solar? */
  ensolarado: boolean;
}

/**
 * Calcula a capacidade necessária em BTUs (já arredondada pra cima).
 */
export function calcularCargaTermica(input: CargaTermicaInput): number {
  const F = CARGA_TERMICA_FATORES;
  const { altura, largura, comprimento, pessoas, eletronicos, janelas, ensolarado } = input;

  const area = largura * comprimento; // m²
  const base = area * (ensolarado ? F.btuPorM2Sol : F.btuPorM2Sombra);
  const pessoasBtu = pessoas * F.btuPorPessoa;
  const eletronicosBtu = eletronicos * F.btuPorEletronico;
  const janelasBtu = janelas * (ensolarado ? F.btuPorJanelaSol : F.btuPorJanelaSombra);
  const peDireitoExtra =
    altura > F.alturaReferencia
      ? base * F.fatorPeDireitoAlto * (altura - F.alturaReferencia)
      : 0;

  const total = base + pessoasBtu + eletronicosBtu + janelasBtu + peDireitoExtra;
  return Math.ceil(total);
}

/** Formata BTUs com separador de milhar PT-BR. Ex: 23006 → "23.006". */
export function formatarBtus(btus: number): string {
  return new Intl.NumberFormat('pt-BR').format(btus);
}

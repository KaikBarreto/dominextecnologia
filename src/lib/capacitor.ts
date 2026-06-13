/**
 * Cálculo de capacitor de partida a partir do BTU e da tensão da rede.
 *
 * 100% client-side / offline — apenas aritmética por fórmula, funciona para
 * QUALQUER BTU (inclusive personalizado).
 *
 * As fórmulas foram derivadas e validadas contra a referência do CEO,
 * ancoradas nos 2 pontos de mercado conhecidos: 9000 BTUs e 18000 BTUs.
 */

/** Tensões de rede disponíveis para o cálculo (V). */
export const TENSOES = [110, 220] as const;
export type Tensao = (typeof TENSOES)[number];

/** Opções padrão de BTU de ar-condicionado, ordem crescente. */
export const BTUS_PADRAO: number[] = [
  7000, 9000, 12000, 18000, 22000, 24000, 30000, 36000, 48000, 60000,
];

/**
 * Valores comerciais de capacitor (µF) disponíveis no mercado.
 * O resultado de BTU/450 é arredondado para o mais próximo desta lista.
 */
const CAPACITORES_COMERCIAIS = [
  5, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80,
] as const;

export interface ResultadoCapacitor {
  capacitorUF: number;
  amper: number;
  potenciaWatts: number;
}

/** Retorna o capacitor comercial mais próximo de um valor calculado. */
function capacitorComercialMaisProximo(valor: number): number {
  return CAPACITORES_COMERCIAIS.reduce((maisProximo, atual) =>
    Math.abs(atual - valor) < Math.abs(maisProximo - valor) ? atual : maisProximo,
  );
}

/**
 * Calcula o capacitor recomendado, a amperagem e a potência para um BTU/tensão.
 *
 * - capacitorUF: BTU/450 arredondado pro valor comercial mais próximo.
 *   Confere: 9000/450 = 20 µF ✓ ; 18000/450 = 40 µF ✓.
 * - potenciaWatts: modelo linear da média de potência dos modelos de mercado,
 *   ancorado em 9000→847W e 18000→1844W → BTU*0,110778 − 150 (piso em 0).
 *   Confere: 9000 → 847 ✓ ; 18000 → 1844 ✓.
 * - amper: potência / tensão (2 casas).
 */
export function calcularCapacitor(btu: number, tensao: number): ResultadoCapacitor | null {
  if (!btu || btu <= 0 || !tensao || tensao <= 0) return null;

  const capacitorUF = capacitorComercialMaisProximo(btu / 450);
  const potenciaWatts = Math.max(0, Math.round(btu * 0.110778 - 150));
  const amper = Math.round((potenciaWatts / tensao) * 100) / 100;

  return { capacitorUF, amper, potenciaWatts };
}

/** Formata número no padrão PT-BR (vírgula decimal, milhar), até 2 casas. Ex: 1844 → "1.844". */
export function formatarNumero(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/**
 * Dimensionamento de cabo elétrico + disjuntor para ar-condicionado,
 * baseado na NBR 5410.
 *
 * 100% client-side / offline — apenas aritmética. Nenhum acesso a rede/banco.
 *
 * TODAS as constantes ficam no objeto `CABO` abaixo, comentadas e tunáveis,
 * para ajuste fácil sem mexer na lógica de `calcularCaboEletrico`.
 *
 * Critério (resumo):
 *  1) Corrente de projeto = corrente nominal (por BTU/tensão) × FATOR_PROJETO.
 *  2) Seção do cabo = MENOR seção comercial que atende AMBOS:
 *     (a) ampacidade da seção ≥ corrente de projeto (NBR 5410, método B1);
 *     (b) queda de tensão ≤ LIMITE_QUEDA_PCT.
 *  3) Disjuntor = MENOR disjuntor comercial ≥ corrente de projeto E
 *     ≤ ampacidade da seção escolhida (o disjuntor protege o cabo).
 */

/** Tensões disponíveis. `rotulo` é o que aparece na UI; `valor` é o numérico real. */
export const TENSOES_CABO = [
  { value: '127', rotulo: '110v', valor: 127 },
  { value: '220', rotulo: '220v', valor: 220 },
] as const;

export type TensaoCaboValue = (typeof TENSOES_CABO)[number]['value'];

export const CABO = {
  /**
   * Corrente nominal típica (A) por BTU, separada por tensão.
   * Acima de 18000 BTU não se usa 127 (corrente alta demais p/ a rede monofásica 110v).
   */
  CORRENTE_NOMINAL: {
    '127': { 7000: 6, 9000: 8, 12000: 10, 18000: 15 } as Record<number, number>,
    '220': {
      7000: 4,
      9000: 5,
      12000: 8.2,
      18000: 11,
      24000: 14,
      30000: 17,
      36000: 20,
      48000: 26,
      60000: 32,
    } as Record<number, number>,
  },

  /** BTUs disponíveis no select, dependentes da tensão. */
  BTUS_POR_TENSAO: {
    '127': [7000, 9000, 12000, 18000],
    '220': [7000, 9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000],
  } as Record<TensaoCaboValue, number[]>,

  /** Fator de segurança aplicado à corrente nominal → corrente de projeto. */
  FATOR_PROJETO: 1.25,

  /** Resistividade do cobre a ~70 °C (Ω·mm²/m). Valor conservador. */
  RHO: 0.0225,

  /**
   * Limite de queda de tensão (%). A NBR 5410 permite até 4% em circuito
   * terminal, mas 2% é conservador e bate com apps de referência.
   * Tunável: suba para 4 se quiser seguir o teto da norma.
   */
  LIMITE_QUEDA_PCT: 2,

  /** Seções comerciais (mm²). Piso 2,5 mm² = circuito de força (NBR 5410). */
  SECOES_MM2: [2.5, 4, 6, 10, 16, 25] as number[],

  /**
   * Ampacidade NBR 5410 (método B1, cobre/PVC 70 °C, 2 condutores carregados),
   * em A por seção (mm²).
   */
  AMPACIDADE: {
    2.5: 24,
    4: 32,
    6: 41,
    10: 57,
    16: 76,
    25: 101,
  } as Record<number, number>,

  /** Disjuntores comerciais (A). Sempre curva C neste contexto. */
  DISJUNTORES_A: [6, 10, 16, 20, 25, 32, 40, 50, 63] as number[],
} as const;

export interface ResultadoCaboEletrico {
  /** Seção do cabo recomendada (mm²). */
  secaoMM2: number;
  /** Corrente nominal do disjuntor recomendado (A). */
  disjuntorA: number;
  /** Curva do disjuntor (sempre C neste contexto). */
  curva: 'C';
  /** Tipo do disjuntor por tensão: 127 → Monopolar; 220 → Bipolar. */
  tipo: 'Monopolar' | 'Bipolar';
  /** Tensão numérica usada (127 ou 220). */
  tensao: number;
  /** Corrente de projeto (A) = nominal × FATOR_PROJETO. */
  correnteProjeto: number;
  /** Queda de tensão (%) na seção escolhida, arredondada a 1 casa. */
  quedaPct: number;
  /**
   * true quando NENHUMA seção comercial atende ao limite de queda
   * (distância grande demais) — retornamos a maior seção como melhor esforço.
   */
  foraDeAlcance: boolean;
  /**
   * true quando o BTU informado caiu FORA da faixa tabelada e a corrente
   * nominal foi estimada por extrapolação (clamp no ponto mais próximo).
   */
  correnteEstimada: boolean;
  /**
   * true quando o BTU em 127V está acima do limite prático recomendado
   * (~18000 BTU) — permitido, mas com aviso.
   */
  alerta127Alto: boolean;
}

/**
 * Corrente nominal (A) para um BTU qualquer, por interpolação linear da tabela
 * `CORRENTE_NOMINAL[tensao]`.
 *
 * - BTU exato na tabela → valor direto.
 * - BTU entre dois pontos → interpolação linear entre os vizinhos.
 * - BTU fora da faixa → clamp no ponto extremo mais próximo (flag estimada).
 *
 * Retorna `{ corrente, estimada }` ou null se a tabela não existir / estiver vazia.
 */
export function correnteNominalInterpolada(
  btu: number,
  tensao: TensaoCaboValue,
): { corrente: number; estimada: boolean } | null {
  const tabela = CABO.CORRENTE_NOMINAL[tensao];
  if (!tabela) return null;

  const pontos = Object.keys(tabela)
    .map(Number)
    .sort((a, b) => a - b);
  if (pontos.length === 0) return null;

  // Match exato.
  if (tabela[btu] != null) return { corrente: tabela[btu], estimada: false };

  const min = pontos[0];
  const max = pontos[pontos.length - 1];

  // Fora da faixa: clamp no extremo mais próximo.
  if (btu <= min) return { corrente: tabela[min], estimada: true };
  if (btu >= max) return { corrente: tabela[max], estimada: true };

  // Dentro da faixa: interpola entre os dois vizinhos.
  let inferior = min;
  let superior = max;
  for (const p of pontos) {
    if (p <= btu) inferior = p;
    if (p >= btu) {
      superior = p;
      break;
    }
  }
  const yInf = tabela[inferior];
  const ySup = tabela[superior];
  const fracao = (btu - inferior) / (superior - inferior);
  const corrente = yInf + (ySup - yInf) * fracao;
  return { corrente: Math.round(corrente * 100) / 100, estimada: false };
}

/** Queda de tensão (%) para uma seção, distância e corrente. */
function quedaPercentual(
  secao: number,
  distanciaM: number,
  correnteProjeto: number,
  vNumerico: number,
): number {
  return ((2 * CABO.RHO * distanciaM * correnteProjeto) / (secao * vNumerico)) * 100;
}

/**
 * Dimensiona cabo + disjuntor para um ar-condicionado.
 *
 * Cross-check esperado:
 *  - 12000 / 220 / 40 m → 6 mm², C16 Bipolar ✓
 *  - 12000 / 127 / 40 m → 10 mm² ✓
 *
 * Retorna null se faltar dado válido (BTU/tensão inválidos ou distância ≤ 0).
 */
export function calcularCaboEletrico(
  btu: number,
  tensao: TensaoCaboValue | string,
  distanciaM: number,
): ResultadoCaboEletrico | null {
  const t = tensao as TensaoCaboValue;
  if (!btu || btu <= 0) return null;
  if (!distanciaM || distanciaM <= 0) return null;

  const nominal = correnteNominalInterpolada(btu, t);
  if (!nominal || nominal.corrente <= 0) return null;
  const correnteNominal = nominal.corrente;

  const meta = TENSOES_CABO.find((x) => x.value === t);
  if (!meta) return null;
  const vNumerico = meta.valor;

  // Em 127V, acima de ~18000 BTU a corrente fica alta demais p/ a rede monofásica.
  const alerta127Alto = t === '127' && btu > 18000;

  const correnteProjeto = correnteNominal * CABO.FATOR_PROJETO;

  // Seção: menor que atenda ampacidade E queda. Se nenhuma, usa a maior (flag).
  let secaoMM2 = CABO.SECOES_MM2[CABO.SECOES_MM2.length - 1];
  let foraDeAlcance = true;
  for (const secao of CABO.SECOES_MM2) {
    const ampacidadeOk = CABO.AMPACIDADE[secao] >= correnteProjeto;
    const quedaOk = quedaPercentual(secao, distanciaM, correnteProjeto, vNumerico) <= CABO.LIMITE_QUEDA_PCT;
    if (ampacidadeOk && quedaOk) {
      secaoMM2 = secao;
      foraDeAlcance = false;
      break;
    }
  }

  const quedaPct =
    Math.round(quedaPercentual(secaoMM2, distanciaM, correnteProjeto, vNumerico) * 10) / 10;

  // Disjuntor: menor ≥ corrente de projeto E ≤ ampacidade da seção (protege o cabo).
  const ampacidadeSecao = CABO.AMPACIDADE[secaoMM2];
  let disjuntorA = CABO.DISJUNTORES_A[CABO.DISJUNTORES_A.length - 1];
  for (const dj of CABO.DISJUNTORES_A) {
    if (dj >= correnteProjeto && dj <= ampacidadeSecao) {
      disjuntorA = dj;
      break;
    }
  }

  const tipo: 'Monopolar' | 'Bipolar' = t === '127' ? 'Monopolar' : 'Bipolar';

  return {
    secaoMM2,
    disjuntorA,
    curva: 'C',
    tipo,
    tensao: vNumerico,
    correnteProjeto: Math.round(correnteProjeto * 100) / 100,
    quedaPct,
    foraDeAlcance,
    correnteEstimada: nominal.estimada,
    alerta127Alto,
  };
}

/** Formata número no padrão PT-BR (vírgula decimal), até 2 casas. */
export function formatarCaboNumero(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

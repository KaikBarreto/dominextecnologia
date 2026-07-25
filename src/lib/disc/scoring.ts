// ─────────────────────────────────────────────────────────────────────────────
// DISC — scoring puro e determinístico.
//
// Fonte da regra: docs/planos/disc-content-fonte.md.
//   • computeScores: aplica `6 − resposta` nos itens reverse, soma por fator
//     (máx 35 = 7 itens × 5) e normaliza para 0–100: round(100 × soma / 35).
//   • classify: primário = maior escore; secundário = 2º maior. profileCode
//     é puro (1 letra) quando o secundário é baixo e o gap é largo; combinado
//     (2 letras) caso contrário. Também deriva blendAngle/intensity pra roda.
//
// Nenhuma dependência de i18n, React ou Supabase — só matemática. Testado em
// scoring.test.ts (TDD, é o coração da feature).
// ─────────────────────────────────────────────────────────────────────────────

import {
  DISC_ITEMS,
  DISC_FACTORS,
  LIKERT_MAX,
  LIKERT_MIN,
  type DiscFactor,
} from './questions';

/** Escores normalizados 0–100 por fator. */
export type DiscScores = Record<DiscFactor, number>;

/** Resultado da classificação de um conjunto de escores. */
export interface DiscClassification {
  /** Fator dominante (maior escore). */
  primary: DiscFactor;
  /** Segundo fator (2º maior escore). */
  secondary: DiscFactor;
  /**
   * Código do perfil: 1 letra quando puro, 2 letras (primário+secundário)
   * quando combinado. Ex.: 'D', 'DC'.
   */
  profileCode: string;
  /** true quando o perfil é considerado puro (dominado por um só fator). */
  isPure: boolean;
  /**
   * Ângulo (graus, 0–360) da posição na roda. Convenção SVG/tela:
   * D=270 (topo), I=0 (direita), S=90 (baixo), C=180 (esquerda),
   * sentido horário D→I→S→C. É o ângulo do vetor-soma dos fatores.
   */
  blendAngle: number;
  /**
   * Intensidade geral 0–1 (raio na roda): distância média dos escores em relação
   * à média 50, normalizada por 50. 0 = tudo em 50 (centro/adaptável),
   * 1 = escores nos extremos (borda/marcante).
   */
  intensity: number;
}

// MAX_RAW_PER_FACTOR foi removido: a normalização agora é DINÂMICA (por itens
// respondidos de cada fator), portanto não há mais um divisor fixo global.
// Fórmula: escore_fator = round(100 × soma_efetiva / (n_respondidos × 5)).
// Isso permite subconjuntos de qualquer tamanho (7/fator, 12/fator, etc.)
// produzirem escores 0–100 comparáveis entre si.

/** Média teórica da escala 0–100. */
const SCALE_MID = 50;

/** Gap mínimo primário↔secundário para considerar perfil puro. */
const PURE_GAP = 15;
/** Teto do secundário para considerar perfil puro. */
const PURE_SECONDARY_CEILING = 55;
/** Gap abaixo do qual primário e secundário são "combinado equilibrado". */
const BLEND_GAP = 10;

/**
 * Ângulo canônico de cada fator na roda (convenção SVG: 0°=direita, cresce no
 * sentido horário porque y aponta pra baixo na tela). D→I→S→C horário.
 */
export const FACTOR_ANGLE: Record<DiscFactor, number> = {
  D: 270, // topo
  I: 0, // direita
  S: 90, // baixo
  C: 180, // esquerda
};

const DEG2RAD = Math.PI / 180;

/** Arredonda para inteiro com clamp em [0, 100]. */
function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * Calcula os escores 0–100 por fator a partir das respostas cruas.
 *
 * `answers` mapeia itemId → resposta Likert (1..5). Itens ausentes (não
 * respondidos) são simplesmente ignorados — o divisor é o número de itens
 * RESPONDIDOS de cada fator, não o total do banco. Isso garante que qualquer
 * subconjunto (7/fator, 12/fator, ou outro) produza escores comparáveis.
 *
 * Fórmula por fator:
 *   max_fator = n_respondidos_do_fator × LIKERT_MAX (5)
 *   escore    = round(100 × soma_efetiva / max_fator)   clampado em [0, 100]
 *   se max_fator = 0 (nenhum item respondido): escore = 0
 *
 * Itens reverse: `effective = LIKERT_MIN + LIKERT_MAX − clamped` (= 6 − x).
 */
export function computeScores(answers: Record<string, number>): DiscScores {
  const rawByFactor: Record<DiscFactor, number> = { D: 0, I: 0, S: 0, C: 0 };
  const countByFactor: Record<DiscFactor, number> = { D: 0, I: 0, S: 0, C: 0 };

  for (const item of DISC_ITEMS) {
    const raw = answers[item.id];
    if (typeof raw !== 'number' || Number.isNaN(raw)) continue;
    // Trava a resposta na faixa válida antes de qualquer conversão.
    const clamped = Math.min(LIKERT_MAX, Math.max(LIKERT_MIN, raw));
    const effective = item.reverse ? LIKERT_MIN + LIKERT_MAX - clamped : clamped; // 6 − x
    rawByFactor[item.factor] += effective;
    countByFactor[item.factor] += 1;
  }

  const scoreForFactor = (f: DiscFactor): number => {
    const maxRaw = countByFactor[f] * LIKERT_MAX;
    if (maxRaw === 0) return 0;
    return clampScore((100 * rawByFactor[f]) / maxRaw);
  };

  return {
    D: scoreForFactor('D'),
    I: scoreForFactor('I'),
    S: scoreForFactor('S'),
    C: scoreForFactor('C'),
  };
}

/**
 * Ordena os fatores por escore desc. Desempate determinístico pela ordem
 * canônica D→I→S→C (garante saída estável em empates).
 */
function rankFactors(scores: DiscScores): DiscFactor[] {
  return [...DISC_FACTORS].sort((a, b) => {
    if (scores[b] !== scores[a]) return scores[b] - scores[a];
    // empate: mantém ordem canônica
    return DISC_FACTORS.indexOf(a) - DISC_FACTORS.indexOf(b);
  });
}

/**
 * Ângulo do vetor-soma dos 4 fatores. Cada fator empurra o ponto na sua direção
 * com peso = seu escore. Resultado em [0, 360). Determinístico.
 */
function computeBlendAngle(scores: DiscScores): number {
  let x = 0;
  let y = 0;
  for (const factor of DISC_FACTORS) {
    const weight = scores[factor];
    const rad = FACTOR_ANGLE[factor] * DEG2RAD;
    x += weight * Math.cos(rad);
    y += weight * Math.sin(rad);
  }
  // Sem direção resultante (tudo igual) → aponta pra D (topo), estável.
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return FACTOR_ANGLE.D;
  let deg = Math.atan2(y, x) / DEG2RAD;
  if (deg < 0) deg += 360;
  return Math.round(deg * 100) / 100; // 2 casas, determinístico
}

/**
 * Intensidade geral 0–1: média das distâncias absolutas dos 4 escores à média 50,
 * normalizada por 50 (distância máxima possível). Perfil "chapado" em 50 → 0;
 * escores nos extremos → 1.
 */
function computeIntensity(scores: DiscScores): number {
  const total = DISC_FACTORS.reduce(
    (acc, f) => acc + Math.abs(scores[f] - SCALE_MID),
    0,
  );
  const avg = total / DISC_FACTORS.length;
  const norm = avg / SCALE_MID;
  return Math.round(Math.min(1, Math.max(0, norm)) * 1000) / 1000; // 3 casas
}

/**
 * Classifica os escores em perfil (puro ou combinado) + posição na roda.
 * Regra (fonte): puro quando gap primário↔secundário ≥ 15 E secundário < ~55.
 * Combinado equilibrado quando gap < 10. Caso intermediário → combinado (2 letras).
 */
export function classify(scores: DiscScores): DiscClassification {
  const ranked = rankFactors(scores);
  const primary = ranked[0];
  const secondary = ranked[1];

  const gap = scores[primary] - scores[secondary];
  const isPure = gap >= PURE_GAP && scores[secondary] < PURE_SECONDARY_CEILING;

  const profileCode = isPure ? primary : `${primary}${secondary}`;

  return {
    primary,
    secondary,
    profileCode,
    isPure,
    blendAngle: computeBlendAngle(scores),
    intensity: computeIntensity(scores),
  };
}

/** Açúcar: escore → classificação num passo só. */
export function scoreAndClassify(
  answers: Record<string, number>,
): { scores: DiscScores; classification: DiscClassification } {
  const scores = computeScores(answers);
  return { scores, classification: classify(scores) };
}

// Reexporta a constante de combinação equilibrada pra quem quiser rotular na UI
// ("perfil combinado equilibrado" vs "combinado").
export { BLEND_GAP };

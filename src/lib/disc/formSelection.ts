// ─────────────────────────────────────────────────────────────────────────────
// DISC — seleção determinística do formulário (MISTO: escala + alternativa).
//
// Cada link de avaliação tem um `code` (short_code de 12 chars) único. Usando o
// `code` como seed de um PRNG (mulberry32), montamos um formulário MISTO:
//   • 5 itens de ESCALA (Likert) por fator → 20 itens;
//   • 8 itens de ALTERNATIVA (forced-choice), sorteados do banco de 20;
//   • total 28 itens, embaralhados GLOBALMENTE (escala e alternativa intercaladas).
//
// Propriedades garantidas:
//   • Determinístico: mesmo seed → mesmo subconjunto + mesma ordem (refresh seguro).
//   • Diferente por link: seeds distintos → formulários distintos.
//   • Sem dependência de Math.random (testável, reproduzível).
//   • Sem dependência de i18n, React ou Supabase.
//
// O retorno é `DiscFormItem[]`. A UI discrimina cada item por `isChoiceItem(i)`.
// ─────────────────────────────────────────────────────────────────────────────

import {
  DISC_ITEMS,
  DISC_CHOICE_ITEMS,
  DISC_FACTORS,
  type DiscLikertItem,
  type DiscChoiceItem,
  type DiscFormItem,
} from './questions';

/** Quantidade de itens de ESCALA (Likert) por fator em cada formulário. */
export const FORM_LIKERT_PER_FACTOR = 5;

/** Quantidade de itens de ALTERNATIVA (forced-choice) em cada formulário. */
export const FORM_CHOICE_ITEMS = 8;

/**
 * Total de itens por formulário:
 * (4 fatores × FORM_LIKERT_PER_FACTOR) + FORM_CHOICE_ITEMS = 20 + 8 = 28.
 */
export const FORM_TOTAL_ITEMS =
  DISC_FACTORS.length * FORM_LIKERT_PER_FACTOR + FORM_CHOICE_ITEMS;

// ─────────────────────────────────────────────────────────────────────────────
// PRNG: mulberry32 (seeded, 32-bit, de domínio público — Tommy Ettinger 2017)
// Retorna um número em [0, 1) a cada chamada; avança o estado interno.
// ─────────────────────────────────────────────────────────────────────────────

type Prng = () => number;

function mulberry32(seed: number): Prng {
  let s = seed >>> 0; // garante uint32
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hash de string → uint32.
// Algoritmo: djb2 (muito difundido, rápido, distribuição razoável para seeds).
// Não é criptográfico — precisamos apenas de dispersão para seeds distintos
// produzirem PRNGs distintos.
// ─────────────────────────────────────────────────────────────────────────────

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(hash, 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Embaralhamento Fisher-Yates in-place usando o PRNG fornecido.
// ─────────────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[], rng: Prng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sorteia o formulário MISTO determinístico para um link de avaliação.
 *
 * @param seed          String que identifica o formulário (ex.: short_code do link).
 *                      O mesmo seed sempre produz o mesmo resultado.
 * @param likertPerFactor  Itens de escala por fator (padrão 5).
 * @param choiceCount      Itens de alternativa (padrão 8).
 * @returns             Array `DiscFormItem[]` com exatamente
 *                      `4 × likertPerFactor + choiceCount` elementos, em ordem
 *                      aleatória (escala e alternativa embaralhadas juntas).
 *
 * Fluxo interno:
 *   1. Converte `seed` → uint32 via djb2.
 *   2. Instancia mulberry32(hash) — PRNG único compartilhado por todo o sorteio.
 *   3. Para cada fator (D→I→S→C): embaralha os Likert do fator e fatia `likertPerFactor`.
 *   4. Embaralha o banco de alternativas e fatia `choiceCount`.
 *   5. Junta escala + alternativa e embaralha a ordem GLOBAL (mesmo PRNG).
 */
export function selectFormItems(
  seed: string,
  likertPerFactor = FORM_LIKERT_PER_FACTOR,
  choiceCount = FORM_CHOICE_ITEMS,
): DiscFormItem[] {
  const rng = mulberry32(hashString(seed));

  const likertSelected: DiscLikertItem[] = [];
  for (const factor of DISC_FACTORS) {
    const factorItems = DISC_ITEMS.filter((item) => item.factor === factor);
    // Embaralha cópia (não muta o banco original)
    const shuffled = shuffle([...factorItems], rng);
    likertSelected.push(...shuffled.slice(0, likertPerFactor));
  }

  const choiceSelected: DiscChoiceItem[] = shuffle(
    [...DISC_CHOICE_ITEMS],
    rng,
  ).slice(0, choiceCount);

  // Junta os dois tipos e embaralha a ordem GLOBAL (intercala escala/alternativa).
  const combined: DiscFormItem[] = [...likertSelected, ...choiceSelected];
  return shuffle(combined, rng);
}

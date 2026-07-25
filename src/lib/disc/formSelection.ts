// ─────────────────────────────────────────────────────────────────────────────
// DISC — seleção determinística de subconjunto de itens por formulário.
//
// Cada link de avaliação tem um `code` (short_code de 12 chars) único.
// Usando o `code` como seed de um PRNG (mulberry32), sorteamos 7 itens por fator
// (= 28 itens no total) do banco de 48, e embaralhamos a ordem do formulário.
//
// Propriedades garantidas:
//   • Determinístico: mesmo seed → mesmo subconjunto + mesma ordem (refresh seguro).
//   • Diferente por link: seeds distintos → formulários distintos.
//   • Sem dependência de Math.random (testável, reproduzível).
//   • Sem dependência de i18n, React ou Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import { DISC_ITEMS, DISC_FACTORS, type DiscItem, type DiscFactor } from './questions';

/** Quantidade de itens por fator a sortear para cada formulário. */
export const FORM_ITEMS_PER_FACTOR = 7;

/** Total de itens por formulário (4 fatores × FORM_ITEMS_PER_FACTOR). */
export const FORM_TOTAL_ITEMS = DISC_FACTORS.length * FORM_ITEMS_PER_FACTOR;

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
 * Sorteia um subconjunto determinístico do banco de itens DISC para um formulário.
 *
 * @param seed       String que identifica o formulário (ex.: short_code do link).
 *                   O mesmo seed sempre produz o mesmo resultado.
 * @param perFactor  Quantos itens por fator sortear (padrão 7; total = 4 × perFactor).
 * @returns          Array de `DiscItem` com exatamente `4 × perFactor` elementos,
 *                   em ordem aleatória (embaralhados globalmente).
 *
 * Fluxo interno:
 *   1. Converte `seed` → uint32 via djb2.
 *   2. Instancia mulberry32(hash).
 *   3. Para cada fator (D→I→S→C em ordem canônica):
 *      a. Filtra os itens do fator no banco.
 *      b. Embaralha o subarray com o PRNG compartilhado.
 *      c. Fatia os primeiros `perFactor` elementos.
 *   4. Junta os 4 × perFactor itens e embaralha a ordem global (mesmo PRNG).
 */
export function selectFormItems(seed: string, perFactor = FORM_ITEMS_PER_FACTOR): DiscItem[] {
  const rng = mulberry32(hashString(seed));

  const selected: DiscItem[] = [];

  for (const factor of DISC_FACTORS) {
    const factorItems = DISC_ITEMS.filter((item) => item.factor === factor) as DiscItem[];
    // Embaralha cópia (não muta o banco original)
    const shuffled = shuffle([...factorItems], rng);
    selected.push(...shuffled.slice(0, perFactor));
  }

  // Embaralha a ordem global para misturar os fatores no formulário
  return shuffle(selected, rng);
}

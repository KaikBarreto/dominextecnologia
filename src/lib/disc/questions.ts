// ─────────────────────────────────────────────────────────────────────────────
// DISC — banco de itens Likert (56 itens, 14 por fator).
//
// Fonte canônica: docs/planos/disc-content-fonte.md. O par `factor`/`reverse` de
// cada item é IMUTÁVEL — o scoring depende deste mapa. O TEXTO de cada afirmação
// NÃO fica aqui: vem do i18n (`MESSAGES[locale].app.discProfile.items[id]`),
// resolvido por `id`. Isto mantém a lógica pura, testável e independente de idioma.
//
// Base de IP: itens derivados de IPIP/ODAT (domínio público) + variações nossas.
// Nunca copiar questionário de marca (DiSC®/Insights/TTI).
// ─────────────────────────────────────────────────────────────────────────────

/** Os 4 fatores DISC. */
export type DiscFactor = 'D' | 'I' | 'S' | 'C';

/**
 * Um item de escala (Likert). O texto vem do i18n pelo `id`.
 * Resposta esperada: número Likert 1..5.
 */
export interface DiscLikertItem {
  /** Identificador estável (d1..d14, i1..i14, s1..s14, c1..c14). Chave do i18n. */
  id: string;
  /** Fator ao qual o item pontua. */
  factor: DiscFactor;
  /** Se true, aplicar `6 − resposta` no scoring (item invertido). */
  reverse: boolean;
}

/**
 * Alias histórico. `DiscItem` sempre foi o item de escala (Likert). Mantido pra
 * não quebrar imports existentes.
 */
export type DiscItem = DiscLikertItem;

/**
 * Um item de alternativa (forced-choice). SEMPRE 4 opções, uma por fator
 * (D/I/S/C). O motor NÃO precisa do texto nem do mapa opção→fator: a UI resolve
 * o texto pelo i18n (`items[id].options`) e envia de volta a LETRA do fator da
 * opção escolhida. A resposta esperada é `'D' | 'I' | 'S' | 'C'`.
 */
export interface DiscChoiceItem {
  /** Identificador estável (ch1..ch20). Chave do i18n. */
  id: string;
  /** Discriminador de tipo de item. */
  kind: 'choice';
}

/** União dos dois tipos de item que podem compor um formulário. */
export type DiscFormItem = DiscLikertItem | DiscChoiceItem;

/** Type guard: `true` quando o item é de alternativa (forced-choice). */
export function isChoiceItem(i: DiscFormItem): i is DiscChoiceItem {
  return 'kind' in i && i.kind === 'choice';
}

/** Quantidade de itens por fator (banco completo). O scoring usa o subconjunto sorteado. */
export const ITEMS_PER_FACTOR = 14;

/** Escala Likert: 1 (discordo totalmente) a 5 (concordo totalmente). */
export const LIKERT_MIN = 1;
export const LIKERT_MAX = 5;

/**
 * Os 56 itens, na ordem canônica (D, I, S, C). O mapeamento factor/reverse bate
 * EXATAMENTE com docs/planos/disc-content-fonte.md. Não reordenar altera nada no
 * scoring (é somado por fator), mas mantemos a ordem-fonte por clareza.
 * Cada formulário sorteia um subconjunto deste banco (lógica em outra onda).
 */
export const DISC_ITEMS: readonly DiscItem[] = [
  // ── D — Dominância ──────────────────────────────────────────────────────
  { id: 'd1',  factor: 'D', reverse: false },
  { id: 'd2',  factor: 'D', reverse: false },
  { id: 'd3',  factor: 'D', reverse: false },
  { id: 'd4',  factor: 'D', reverse: false },
  { id: 'd5',  factor: 'D', reverse: false },
  { id: 'd6',  factor: 'D', reverse: true  },
  { id: 'd7',  factor: 'D', reverse: true  },
  { id: 'd8',  factor: 'D', reverse: false },
  { id: 'd9',  factor: 'D', reverse: false },
  { id: 'd10', factor: 'D', reverse: false },
  { id: 'd11', factor: 'D', reverse: true  },
  { id: 'd12', factor: 'D', reverse: false },
  { id: 'd13', factor: 'D', reverse: false },
  { id: 'd14', factor: 'D', reverse: false },

  // ── I — Influência ──────────────────────────────────────────────────────
  { id: 'i1',  factor: 'I', reverse: false },
  { id: 'i2',  factor: 'I', reverse: false },
  { id: 'i3',  factor: 'I', reverse: false },
  { id: 'i4',  factor: 'I', reverse: false },
  { id: 'i5',  factor: 'I', reverse: false },
  { id: 'i6',  factor: 'I', reverse: true  },
  { id: 'i7',  factor: 'I', reverse: true  },
  { id: 'i8',  factor: 'I', reverse: false },
  { id: 'i9',  factor: 'I', reverse: false },
  { id: 'i10', factor: 'I', reverse: false },
  { id: 'i11', factor: 'I', reverse: true  },
  { id: 'i12', factor: 'I', reverse: false },
  { id: 'i13', factor: 'I', reverse: false },
  { id: 'i14', factor: 'I', reverse: false },

  // ── S — Estabilidade ────────────────────────────────────────────────────
  { id: 's1',  factor: 'S', reverse: false },
  { id: 's2',  factor: 'S', reverse: false },
  { id: 's3',  factor: 'S', reverse: false },
  { id: 's4',  factor: 'S', reverse: false },
  { id: 's5',  factor: 'S', reverse: false },
  { id: 's6',  factor: 'S', reverse: true  },
  { id: 's7',  factor: 'S', reverse: true  },
  { id: 's8',  factor: 'S', reverse: false },
  { id: 's9',  factor: 'S', reverse: false },
  { id: 's10', factor: 'S', reverse: false },
  { id: 's11', factor: 'S', reverse: true  },
  { id: 's12', factor: 'S', reverse: false },
  { id: 's13', factor: 'S', reverse: false },
  { id: 's14', factor: 'S', reverse: false },

  // ── C — Conscienciosidade ───────────────────────────────────────────────
  { id: 'c1',  factor: 'C', reverse: false },
  { id: 'c2',  factor: 'C', reverse: false },
  { id: 'c3',  factor: 'C', reverse: false },
  { id: 'c4',  factor: 'C', reverse: false },
  { id: 'c5',  factor: 'C', reverse: false },
  { id: 'c6',  factor: 'C', reverse: true  },
  { id: 'c7',  factor: 'C', reverse: true  },
  { id: 'c8',  factor: 'C', reverse: false },
  { id: 'c9',  factor: 'C', reverse: false },
  { id: 'c10', factor: 'C', reverse: false },
  { id: 'c11', factor: 'C', reverse: true  },
  { id: 'c12', factor: 'C', reverse: false },
  { id: 'c13', factor: 'C', reverse: false },
  { id: 'c14', factor: 'C', reverse: false },
] as const;

/** Todos os ids na ordem canônica (útil pra iterar a tela typeform). */
export const DISC_ITEM_IDS: readonly string[] = DISC_ITEMS.map((i) => i.id);

/** Os 4 fatores na ordem canônica de exibição/roda (D→I→S→C, sentido horário). */
export const DISC_FACTORS: readonly DiscFactor[] = ['D', 'I', 'S', 'C'];

// ─────────────────────────────────────────────────────────────────────────────
// Banco de itens de ALTERNATIVA (forced-choice) — 20 itens (ch1..ch20).
//
// Cada item tem SEMPRE 4 opções, uma por fator D/I/S/C. O texto das afirmações e
// o mapa opção→fator vivem no i18n (`items[id].options`) — o motor só conhece o
// `id` e o `kind`. A resposta é a LETRA do fator escolhido, e no scoring vale
// LIKERT_MAX (5) pro fator escolhido e LIKERT_MIN (1) pros outros 3 (ver
// scoring.ts). Cada formulário sorteia um subconjunto (lógica em formSelection).
// ─────────────────────────────────────────────────────────────────────────────

/** Os 20 itens de alternativa, na ordem canônica (ch1..ch20). */
export const DISC_CHOICE_ITEMS: readonly DiscChoiceItem[] = Array.from(
  { length: 20 },
  (_, idx) => ({ id: `ch${idx + 1}`, kind: 'choice' as const }),
);

/** Todos os ids de alternativa na ordem canônica. */
export const DISC_CHOICE_ITEM_IDS: readonly string[] = DISC_CHOICE_ITEMS.map(
  (i) => i.id,
);

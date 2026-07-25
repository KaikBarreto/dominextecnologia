// ─────────────────────────────────────────────────────────────────────────────
// DISC — mapa de atributos profissionais (8 dimensoes).
//
// Transforma os 4 escores DISC (0–100 cada) em 8 atributos gerais de um
// profissional por meio de blends ponderados. Os pesos de cada formula somam 1.
//
// Formulas (fonte: briefing CEO 2026-07-24):
//   proactivity        = 0.6*D + 0.4*I
//   resultsFocus       = 0.7*D + 0.3*C
//   leadership         = 0.55*D + 0.45*I
//   communication      = 0.7*I + 0.3*S
//   teamwork           = 0.5*S + 0.5*I
//   patience           = 0.65*S + 0.35*C
//   discipline         = 0.6*C + 0.4*S
//   attentionToDetail  = 0.75*C + 0.25*D
//
// Nenhuma dependencia de i18n, React ou Supabase — so matematica.
// ─────────────────────────────────────────────────────────────────────────────

import type { DiscScores } from './scoring';

/** Chaves dos 8 atributos derivados. */
export type AttributeKey =
  | 'proactivity'
  | 'resultsFocus'
  | 'leadership'
  | 'communication'
  | 'teamwork'
  | 'patience'
  | 'discipline'
  | 'attentionToDetail';

/** Par chave→valor de um atributo calculado. */
export interface DiscAttribute {
  key: AttributeKey;
  value: number;
}

/** Ordem canonica de exibicao no radar (8 vertices). */
export const ATTRIBUTE_KEYS: readonly AttributeKey[] = [
  'proactivity',
  'resultsFocus',
  'leadership',
  'communication',
  'teamwork',
  'patience',
  'discipline',
  'attentionToDetail',
];

/** Clamp e arredondamento inteiro 0–100. */
function blend(raw: number): number {
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * Calcula os 8 atributos profissionais a partir dos escores DISC.
 * Retorna na ordem canonica de ATTRIBUTE_KEYS.
 */
export function computeAttributes(scores: DiscScores): DiscAttribute[] {
  const { D, I, S, C } = scores;
  return [
    { key: 'proactivity',       value: blend(0.6 * D + 0.4 * I) },
    { key: 'resultsFocus',      value: blend(0.7 * D + 0.3 * C) },
    { key: 'leadership',        value: blend(0.55 * D + 0.45 * I) },
    { key: 'communication',     value: blend(0.7 * I + 0.3 * S) },
    { key: 'teamwork',          value: blend(0.5 * S + 0.5 * I) },
    { key: 'patience',          value: blend(0.65 * S + 0.35 * C) },
    { key: 'discipline',        value: blend(0.6 * C + 0.4 * S) },
    { key: 'attentionToDetail', value: blend(0.75 * C + 0.25 * D) },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// DISC — Perfil Emocional (8 dimensoes emocionais).
//
// Transforma os 4 escores DISC (0-100 cada) em 8 dimensoes emocionais por meio
// de blends ponderados. Os pesos de cada formula somam 1 (conferido abaixo).
//
// Espelho de competencies.ts — mesma funcao blend() (clamp + round 0-100).
//
// Ordem canonica (gira D->I->S->C, igual ao radar de competencias):
//   1. selfConfidence = 0.75*D + 0.25*I   (pesos: 1.0 ok)
//   2. resilience     = 0.5*D  + 0.5*S     (1.0 ok)
//   3. enthusiasm     = 0.7*I  + 0.3*D     (1.0 ok)
//   4. optimism       = 0.6*I  + 0.4*D     (1.0 ok)
//   5. sociability    = 0.8*I  + 0.2*S     (1.0 ok)
//   6. empathy        = 0.6*S  + 0.4*I     (1.0 ok)
//   7. serenity       = 0.7*S  + 0.3*C     (1.0 ok)
//   8. selfControl    = 0.6*C  + 0.4*S     (1.0 ok)
//
// Nenhuma dependencia de i18n, React ou Supabase — so matematica.
// ─────────────────────────────────────────────────────────────────────────────

import type { DiscScores } from './scoring';

/** Chaves das 8 dimensoes emocionais. */
export type EmotionalKey =
  | 'selfConfidence'
  | 'resilience'
  | 'enthusiasm'
  | 'optimism'
  | 'sociability'
  | 'empathy'
  | 'serenity'
  | 'selfControl';

/** Par chave->valor de uma dimensao emocional calculada. */
export interface DiscEmotional {
  key: EmotionalKey;
  value: number;
}

/** Ordem canonica de exibicao no radar (8 vertices). */
export const EMOTIONAL_KEYS: readonly EmotionalKey[] = [
  'selfConfidence',
  'resilience',
  'enthusiasm',
  'optimism',
  'sociability',
  'empathy',
  'serenity',
  'selfControl',
];

/** Clamp e arredondamento inteiro 0-100. */
function blend(raw: number): number {
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * Calcula as 8 dimensoes emocionais a partir dos escores DISC.
 * Retorna na ordem canonica de EMOTIONAL_KEYS.
 */
export function computeEmotional(scores: DiscScores): DiscEmotional[] {
  const { D, I, S, C } = scores;
  return [
    { key: 'selfConfidence', value: blend(0.75 * D + 0.25 * I) },
    { key: 'resilience',     value: blend(0.5 * D + 0.5 * S) },
    { key: 'enthusiasm',     value: blend(0.7 * I + 0.3 * D) },
    { key: 'optimism',       value: blend(0.6 * I + 0.4 * D) },
    { key: 'sociability',    value: blend(0.8 * I + 0.2 * S) },
    { key: 'empathy',        value: blend(0.6 * S + 0.4 * I) },
    { key: 'serenity',       value: blend(0.7 * S + 0.3 * C) },
    { key: 'selfControl',    value: blend(0.6 * C + 0.4 * S) },
  ];
}

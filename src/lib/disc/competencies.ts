// ─────────────────────────────────────────────────────────────────────────────
// DISC — Radar das Competencias Comportamentais (13 dimensoes).
//
// Transforma os 4 escores DISC (0-100 cada) em 13 competencias por meio de
// blends ponderados. Os pesos de cada formula somam 1 (conferido abaixo).
//
// Ordem canonica (gira D->I->S->C no radar, igual ao print do CEO):
//   1.  competitiveness  = 0.8*D + 0.2*I     (pesos: 1.0 ok)
//   2.  agility          = 0.5*D + 0.5*I     (1.0 ok)
//   3.  confidence       = 0.6*D + 0.4*I     (1.0 ok)
//   4.  energy           = 0.7*I + 0.3*D     (1.0 ok)
//   5.  flexibility      = 0.6*I + 0.4*S     (1.0 ok)
//   6.  influence        = 0.85*I + 0.15*D   (1.0 ok)
//   7.  creativity       = 0.7*I + 0.3*D     (1.0 ok)
//   8.  consistency      = 0.5*S + 0.5*C     (1.0 ok)
//   9.  communication    = 0.7*I + 0.3*S     (1.0 ok)
//   10. empathy          = 0.7*S + 0.3*I     (1.0 ok)
//   11. planning         = 0.6*C + 0.4*S     (1.0 ok)
//   12. patience         = 0.7*S + 0.3*C     (1.0 ok)
//   13. discipline       = 0.6*C + 0.4*S     (1.0 ok)
//
// Removidas (decisao CEO): analysis, judgment, security.
//
// Nenhuma dependencia de i18n, React ou Supabase — so matematica.
// ─────────────────────────────────────────────────────────────────────────────

import type { DiscScores } from './scoring';

/** Chaves das 13 competencias comportamentais. */
export type CompetencyKey =
  | 'competitiveness'
  | 'agility'
  | 'confidence'
  | 'energy'
  | 'flexibility'
  | 'influence'
  | 'creativity'
  | 'consistency'
  | 'communication'
  | 'empathy'
  | 'planning'
  | 'patience'
  | 'discipline';

/** Par chave->valor de uma competencia calculada. */
export interface DiscCompetency {
  key: CompetencyKey;
  value: number;
}

/** Ordem canonica de exibicao no radar (13 vertices). */
export const COMPETENCY_KEYS: readonly CompetencyKey[] = [
  'competitiveness',
  'agility',
  'confidence',
  'energy',
  'flexibility',
  'influence',
  'creativity',
  'consistency',
  'communication',
  'empathy',
  'planning',
  'patience',
  'discipline',
];

/** Clamp e arredondamento inteiro 0-100. */
function blend(raw: number): number {
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * Calcula as 13 competencias comportamentais a partir dos escores DISC.
 * Retorna na ordem canonica de COMPETENCY_KEYS.
 * Removidas (decisao CEO): analysis, judgment, security.
 */
export function computeCompetencies(scores: DiscScores): DiscCompetency[] {
  const { D, I, S, C } = scores;
  return [
    { key: 'competitiveness', value: blend(0.8 * D + 0.2 * I) },
    { key: 'agility',         value: blend(0.5 * D + 0.5 * I) },
    { key: 'confidence',      value: blend(0.6 * D + 0.4 * I) },
    { key: 'energy',          value: blend(0.7 * I + 0.3 * D) },
    { key: 'flexibility',     value: blend(0.6 * I + 0.4 * S) },
    { key: 'influence',       value: blend(0.85 * I + 0.15 * D) },
    { key: 'creativity',      value: blend(0.7 * I + 0.3 * D) },
    { key: 'consistency',     value: blend(0.5 * S + 0.5 * C) },
    { key: 'communication',   value: blend(0.7 * I + 0.3 * S) },
    { key: 'empathy',         value: blend(0.7 * S + 0.3 * I) },
    { key: 'planning',        value: blend(0.6 * C + 0.4 * S) },
    { key: 'patience',        value: blend(0.7 * S + 0.3 * C) },
    { key: 'discipline',      value: blend(0.6 * C + 0.4 * S) },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// DISC — relações entre pares de perfis primários.
//
// A chave canônica de um par é formada pelos fatores PRIMÁRIOS dos dois perfis
// na ordem fixa D < I < S < C, concatenados. Ex.: um perfil D e um perfil I
// geram a chave "DI" (não "ID"). Isso garante que a chave seja única e
// simétrica — não importa quem é A e quem é B.
//
// Consumo:
//   • relationshipKey(pA, pB)  → chave canônica do par
//   • MESSAGES[locale].app.discProfile.relationships[key]
//       → { friction: string[], synergy: string[], communication: string }
// ─────────────────────────────────────────────────────────────────────────────

import type { DiscFactor } from '@/lib/disc/questions';

/** Ordem de ordenação canônica dos fatores (D < I < S < C). */
const FACTOR_ORDER: Record<DiscFactor, number> = { D: 0, I: 1, S: 2, C: 3 };

/**
 * Retorna a chave CANÔNICA para o par de fatores primários, com ordem fixa
 * D < I < S < C.
 *
 * @example
 * relationshipKey('I', 'D') // → 'DI'
 * relationshipKey('D', 'D') // → 'DD'
 * relationshipKey('C', 'S') // → 'SC'
 */
export function relationshipKey(a: DiscFactor, b: DiscFactor): string {
  return FACTOR_ORDER[a] <= FACTOR_ORDER[b] ? `${a}${b}` : `${b}${a}`;
}

/**
 * Todos os 10 pares não-ordenados dos 4 fatores DISC (combinações com
 * repetição C(4,2) + 4 pares iguais = 10).
 * Usados como chave de busca no i18n de relationships.
 */
export const RELATIONSHIP_KEYS = [
  'DD',
  'DI',
  'DS',
  'DC',
  'II',
  'IS',
  'IC',
  'SS',
  'SC',
  'CC',
] as const;

/** Tipo utilitário derivado das chaves canônicas. */
export type RelationshipKey = (typeof RELATIONSHIP_KEYS)[number];

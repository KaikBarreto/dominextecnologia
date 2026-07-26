// ─────────────────────────────────────────────────────────────────────────────
// DISC — descrição textual da EVOLUÇÃO entre duas avaliações (anterior → atual).
//
// Puro e determinístico (sem LLM em runtime): compara os 4 fatores D/I/S/C, mede
// a variação de cada um e compõe 2–4 frases naturais a partir de FRAGMENTOS de
// i18n passados por parâmetro. Também menciona a mudança do CÓDIGO de perfil
// (ex.: "CS" → "CI") por extenso.
//
// A lib não conhece idioma nem React: quem chama resolve o bundle i18n
// (EvolutionMessages) e os nomes de fator por extenso, e recebe a string pronta.
// Testável isoladamente (evolution.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { DISC_FACTORS, type DiscFactor } from './questions';
import type { DiscScores } from './scoring';

/** Acima disso (em pontos 0–100) uma variação conta como subida/queda real. */
export const EVOLUTION_THRESHOLD = 6;
/** Nº máximo de fatores destacados no parágrafo (evita frase-lista cansativa). */
const MAX_HIGHLIGHTED_FACTORS = 2;

/** Direção da variação de um fator. */
export type EvolutionDirection = 'up' | 'down' | 'stable';

/** Variação calculada de um fator. */
export interface FactorDelta {
  factor: DiscFactor;
  delta: number; // curr - prev (pode ser negativo)
  direction: EvolutionDirection;
}

/**
 * Fragmentos de i18n necessários para compor o parágrafo. Templates usam `{factor}`
 * para o nome do fator por extenso e `{from}`/`{to}` para o código de perfil.
 */
export interface EvolutionMessages {
  /** Frase de abertura quando houve mudança real. Ex.: "Comparando com a avaliação anterior:" */
  intro: string;
  /** Template de subida. Ex.: "sua {factor} subiu, você está assumindo mais o controle". */
  up: Record<DiscFactor, string>;
  /** Template de queda. Ex.: "sua {factor} recuou, você está dividindo mais o comando". */
  down: Record<DiscFactor, string>;
  /** Frase quando tudo ficou praticamente estável (nenhum fator passou do limiar). */
  stable: string;
  /** Frase quando o código de perfil mudou. Usa `{from}` e `{to}` (nomes por extenso). */
  profileChanged: string;
  /** Frase quando o código de perfil se manteve (opcional; reforça consistência). */
  profileSame: string;
  /** Conector de lista para 2 itens ("e") — pt: " e ", en: " and "… */
  and: string;
}

/** Nome de um perfil por extenso, resolvido por quem chama (i18n). */
export type ProfileNameResolver = (code: string) => string;

// ── Cálculo puro das variações ────────────────────────────────────────────────

/** Calcula a variação de cada fator (curr − prev) e classifica a direção. */
export function computeFactorDeltas(
  prevScores: DiscScores,
  currScores: DiscScores,
): FactorDelta[] {
  return DISC_FACTORS.map((factor) => {
    const delta = currScores[factor] - prevScores[factor];
    const direction: EvolutionDirection =
      delta >= EVOLUTION_THRESHOLD ? 'up' : delta <= -EVOLUTION_THRESHOLD ? 'down' : 'stable';
    return { factor, delta, direction };
  });
}

/** Junta uma lista de fragmentos numa frase com vírgulas + conector final. */
function joinNaturally(parts: string[], and: string): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]}${and}${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}${and}${parts[parts.length - 1]}`;
}

/** Capitaliza a primeira letra (frase começa com maiúscula depois do intro). */
function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * Compõe o parágrafo de evolução (2–4 frases) a partir das variações e da
 * mudança de código de perfil. Retorna string vazia se não houver o que dizer
 * (defensivo — quem chama só renderiza com 2+ avaliações).
 */
export function describeEvolution(
  prevScores: DiscScores,
  currScores: DiscScores,
  prevCode: string | null,
  currCode: string | null,
  m: EvolutionMessages,
  factorName: (f: DiscFactor) => string,
  profileName: ProfileNameResolver,
): string {
  const deltas = computeFactorDeltas(prevScores, currScores);

  // Fatores que se moveram de verdade, ordenados pela magnitude da variação.
  const moved = deltas
    .filter((d) => d.direction !== 'stable')
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, MAX_HIGHLIGHTED_FACTORS);

  const sentences: string[] = [];

  if (moved.length > 0) {
    const fragments = moved.map((d) => {
      const template = d.direction === 'up' ? m.up[d.factor] : m.down[d.factor];
      return template.replace('{factor}', factorName(d.factor));
    });
    sentences.push(`${m.intro} ${capitalize(joinNaturally(fragments, m.and))}.`);
  } else {
    sentences.push(m.stable);
  }

  // Mudança (ou manutenção) do código de perfil.
  if (prevCode && currCode) {
    if (prevCode !== currCode) {
      sentences.push(
        m.profileChanged
          .replace('{from}', profileName(prevCode))
          .replace('{to}', profileName(currCode)),
      );
    } else {
      sentences.push(m.profileSame.replace('{profile}', profileName(currCode)));
    }
  }

  return sentences.join(' ');
}

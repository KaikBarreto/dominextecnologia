// ─────────────────────────────────────────────────────────────────────────────
// DISC — metadados por perfil (puros + combinados).
//
// Cada perfil aponta para chaves de i18n; o TEXTO (nome + insights) vive em
// src/lib/i18n/messages/app/discProfile.ts, resolvido por `code`. Aqui só o que
// é estrutural e independente de idioma: cor do fator primário e chave de nome.
//
// Cores canônicas (livres, sem IP de marca):
//   D = vermelho, I = amarelo, S = verde, C = azul.
// A cor do PERFIL é sempre a do seu fator PRIMÁRIO (1ª letra do code).
// ─────────────────────────────────────────────────────────────────────────────

import type { DiscFactor } from './questions';

/** Hex canônico por fator. Consistente com o padrão do app (cores em hex). */
export const FACTOR_COLOR: Record<DiscFactor, string> = {
  D: '#E5484D', // vermelho
  I: '#F5C518', // amarelo
  S: '#30A46C', // verde
  C: '#2E7CF6', // azul
};

/** Metadados estruturais de um perfil DISC. */
export interface DiscProfileMeta {
  /** Código do perfil: 'D'|'I'|'S'|'C' (puro) ou 2 letras (combinado). */
  code: string;
  /** Chave i18n do NOME do perfil: discProfile.profiles[code].nome. */
  nameKey: string;
  /** Cor do fator primário (1ª letra), usada em badge/gráfico. */
  factorColor: string;
  /** Fator primário derivado do code. */
  primary: DiscFactor;
  /** Fator secundário (só nos combinados; null nos puros). */
  secondary: DiscFactor | null;
}

/** Códigos puros cobertos. */
export const PURE_PROFILE_CODES: readonly string[] = ['D', 'I', 'S', 'C'];

/**
 * Códigos combinados cobertos (primário domina, secundário modula).
 * Cobre os 12 pares da fonte: DI, ID, DC, CD, IS, SI, SC, CS, DS, IC, CI, SD.
 */
export const BLEND_PROFILE_CODES: readonly string[] = [
  'DI',
  'ID',
  'DC',
  'CD',
  'IS',
  'SI',
  'SC',
  'CS',
  'DS',
  'IC',
  'CI',
  'SD',
];

/** Todos os códigos com metadados curados. */
export const ALL_PROFILE_CODES: readonly string[] = [
  ...PURE_PROFILE_CODES,
  ...BLEND_PROFILE_CODES,
];

function buildMeta(code: string): DiscProfileMeta {
  const primary = code[0] as DiscFactor;
  const secondary = (code[1] as DiscFactor | undefined) ?? null;
  return {
    code,
    nameKey: `profiles.${code}.nome`,
    factorColor: FACTOR_COLOR[primary],
    primary,
    secondary,
  };
}

/** Mapa code → metadados. */
export const DISC_PROFILES: Record<string, DiscProfileMeta> = Object.fromEntries(
  ALL_PROFILE_CODES.map((code) => [code, buildMeta(code)]),
);

/**
 * Resolve o perfil de um `profileCode`. Se o combinado exato não estiver curado
 * (par sem conteúdo próprio), cai no perfil PURO do fator primário — garante que
 * a UI sempre tem insights pra mostrar, sem `undefined`.
 */
export function resolveProfile(profileCode: string): DiscProfileMeta {
  const exact = DISC_PROFILES[profileCode];
  if (exact) return exact;
  const primary = profileCode[0] as DiscFactor;
  return DISC_PROFILES[primary] ?? buildMeta('D');
}

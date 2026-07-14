// ─────────────────────────────────────────────────────────────────────────────
// localizeHash — traduz âncoras de seção (#recursos, #precos…) pelo idioma.
//
// Problema: links de seção da home usavam hash fixo em português mesmo nas
// rotas /en, /es, /fr. O Google e o usuário esperavam URL amigável no idioma.
//
// Solução: dicionário de chave-canônica (pt-br) → fragmento localizado.
// Usado tanto no <a href> quanto no `id=` da seção-alvo — os dois precisam
// casar pra a âncora funcionar.
//
// Âncoras mapeadas (resultado de grep nas seções da landing):
//   recursos      — ScrollSyncFeatures (HomeFeatures) — sectionId prop
//   precos        — PricingSection — id="precos"
//   como-funciona — HowItWorks    — id="como-funciona"
//   segmentos     — SegmentsSection — id="segmentos"
// ─────────────────────────────────────────────────────────────────────────────

import type { LocaleCode } from './locales';

/** Chaves canônicas (em pt-br) de todas as âncoras de seção da landing. */
export type AnchorKey = 'recursos' | 'precos' | 'como-funciona' | 'segmentos';

/** Dicionário completo: chave canônica -> fragmento por locale (sem `#`). */
const HASH_MAP: Record<AnchorKey, Record<LocaleCode, string>> = {
  recursos: {
    'pt-br': 'recursos',
    en:      'features',
    es:      'caracteristicas',
    fr:      'fonctionnalites',
  },
  precos: {
    'pt-br': 'precos',
    en:      'pricing',
    es:      'precios',
    fr:      'tarifs',
  },
  'como-funciona': {
    'pt-br': 'como-funciona',
    en:      'how-it-works',
    es:      'como-funciona',
    fr:      'comment-ca-marche',
  },
  segmentos: {
    'pt-br': 'segmentos',
    en:      'segments',
    es:      'segmentos',
    fr:      'segments',
  },
};

/**
 * Retorna o fragmento de âncora localizado para a chave e locale dados.
 * Sem o `#` — pronto para usar em `id=` e concatenar com `'#'` em `href`.
 *
 * @example
 * localizeHash('precos', 'en')  // → 'pricing'
 * localizeHash('recursos', 'fr') // → 'fonctionnalites'
 */
export function localizeHash(key: AnchorKey, locale: LocaleCode): string {
  return HASH_MAP[key]?.[locale] ?? HASH_MAP[key]?.['pt-br'] ?? key;
}

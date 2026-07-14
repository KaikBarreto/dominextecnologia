// ─────────────────────────────────────────────────────────────────────────────
// i18n — barrel público da camada de internacionalização do SITE PÚBLICO.
// ─────────────────────────────────────────────────────────────────────────────

export * from './locales';
export * from './paths';
export * from './detectLocale';
export { useLocale } from './useLocale';
export type { UseLocaleResult } from './useLocale';
export { MESSAGES } from './messages';
export type { Messages } from './messages';
export { localizeInternal } from './localizeInternal';
export { localizeHash } from './localizeHash';
export { useCanonicalSlugRedirect } from './useCanonicalSlugRedirect';
export type { AnchorKey } from './localizeHash';
export {
  slugFor,
  resolveSlug,
  isLocalizableSlugKey,
  allSegmentKeys,
  allModuleKeys,
  switchLocalePath,
} from './slugRegistry';

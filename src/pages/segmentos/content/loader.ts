// ─────────────────────────────────────────────────────────────────────────────
// Loader de segmentos com suporte a locale (Fase 2 i18n).
//
// API pública:
//  - getSegmentData(slug, locale)  → SegmentData completo (identidade + conteúdo)
//  - getAllSegmentSlugs()           → string[] dos slugs pt-br (para SSG iterar)
//
// Design:
//  - Aceita locale como PARÂMETRO EXPLÍCITO (não lê de hook React), para que a
//    Fase 3 (SSG) possa chamar passando o locale na mão, fora de componentes.
//  - Fallback explícito para pt-br quando o locale não tiver conteúdo do slug.
//  - "Identidade" (slug, accentColor, veilHueShift, navLabel, icon) vem do
//    SEGMENTS do segmentsData.ts (imutável por idioma).
//  - "Conteúdo" (todos os campos de texto) vem do mapa por locale.
// ─────────────────────────────────────────────────────────────────────────────

import type { LocaleCode } from '@/lib/i18n/locales';
import { SEGMENTS, type SegmentData } from '../segmentsData';
import ptBr from './pt-br';
import en from './en';
import es from './es';
import fr from './fr';
import type { SegmentContentMap } from './types';

/** Mapa locale → conteúdo. Adicionado aqui quando novo locale for suportado. */
const CONTENT_BY_LOCALE: Record<LocaleCode, SegmentContentMap> = {
  'pt-br': ptBr,
  en,
  es,
  fr,
};

/**
 * Retorna o SegmentData completo (identidade + conteúdo) para o slug e locale
 * informados. Se o locale não tiver o slug, cai em pt-br (fallback explícito).
 *
 * @param slug   - Slug pt-br do segmento (ex: 'sistema-para-refrigeracao').
 * @param locale - Locale alvo (ex: 'en', 'pt-br').
 * @returns SegmentData completo ou undefined se o slug não existir.
 */
export function getSegmentData(
  slug: string,
  locale: LocaleCode,
): SegmentData | undefined {
  // Identidade: nunca varia por idioma (slug, accentColor, icon, navLabel...).
  const identity = SEGMENTS[slug];
  if (!identity) return undefined;

  // Conteúdo: tenta o locale pedido, cai em pt-br se não encontrar.
  const localeMap = CONTENT_BY_LOCALE[locale];
  const content = localeMap?.[slug] ?? ptBr[slug];
  if (!content) return undefined;

  // Funde identidade + conteúdo numa única estrutura SegmentData.
  return {
    // Identidade (invariante por idioma)
    slug: identity.slug,
    accentColor: identity.accentColor,
    ...(identity.veilHueShift !== undefined && { veilHueShift: identity.veilHueShift }),
    navLabel: identity.navLabel,
    icon: identity.icon,
    // Conteúdo (traduzível)
    ...content,
  };
}

/**
 * Lista todos os slugs de segmentos registrados (slugs pt-br, canônicos).
 * Usado pela Fase 3 (SSG) para iterar slugs × locales e gerar páginas estáticas.
 */
export function getAllSegmentSlugs(): string[] {
  return Object.keys(SEGMENTS);
}

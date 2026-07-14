// ─────────────────────────────────────────────────────────────────────────────
// Loader de módulos com suporte a locale (Fase 2 i18n).
//
// API pública:
//  - getModuleData(key, locale)  → ModuleData completo (identidade + conteúdo)
//  - getAllModuleSlugs()         → string[] dos slugs de rota (para SSG iterar)
//
// Design:
//  - Aceita a CHAVE do MODULES record como primeiro parâmetro (ex: 'crm',
//    'os-digital'). A chave pode diferir do campo `slug` do objeto — por ex,
//    MODULES['crm'].slug === 'sistema-crm'. O loader usa identity.slug para
//    buscar o conteúdo no mapa de locale, onde a chave canônica é o slug da rota.
//  - Aceita locale como PARÂMETRO EXPLÍCITO (não lê de hook React), para que a
//    Fase 3 (SSG) possa chamar passando o locale na mão, fora de componentes.
//  - Fallback explícito para pt-br quando o locale não tiver conteúdo do slug.
//  - "Identidade" (slug, navLabel, icon, techNicheSelector?) vem de modulesData.ts
//    (imutável por idioma).
//  - "Conteúdo" (todos os campos de texto) vem do mapa por locale.
// ─────────────────────────────────────────────────────────────────────────────

import type { LocaleCode } from '@/lib/i18n/locales';
import { MODULES, type ModuleData } from '../modulesData';
import ptBr from './pt-br';
import en from './en';
import es from './es';
import fr from './fr';
import type { ModuleContentMap } from './types';

/** Mapa locale → conteúdo. Adicionado aqui quando novo locale for suportado. */
const CONTENT_BY_LOCALE: Record<LocaleCode, ModuleContentMap> = {
  'pt-br': ptBr,
  en,
  es,
  fr,
};

/**
 * Retorna o ModuleData completo (identidade + conteúdo) para a chave e locale
 * informados. Se o locale não tiver o slug, cai em pt-br (fallback explícito).
 *
 * @param key    - Chave do MODULES record (ex: 'crm', 'os-digital').
 *                 Pode diferir do campo slug do objeto (ex: 'crm' → slug 'sistema-crm').
 * @param locale - Locale alvo (ex: 'en', 'pt-br').
 * @returns ModuleData completo ou undefined se a chave não existir.
 */
export function getModuleData(
  key: string,
  locale: LocaleCode,
): ModuleData | undefined {
  // Identidade: nunca varia por idioma (slug, navLabel, icon, techNicheSelector).
  const identity = MODULES[key];
  if (!identity) return undefined;

  // O campo slug do objeto é a chave canônica no mapa de conteúdo.
  const contentKey = identity.slug;

  // Conteúdo: tenta o locale pedido, cai em pt-br se não encontrar.
  const localeMap = CONTENT_BY_LOCALE[locale];
  const content = localeMap?.[contentKey] ?? ptBr[contentKey];
  if (!content) return undefined;

  // Funde identidade + conteúdo numa única estrutura ModuleData.
  return {
    // Identidade (invariante por idioma)
    slug: identity.slug,
    navLabel: identity.navLabel,
    icon: identity.icon,
    ...(identity.techNicheSelector !== undefined && {
      techNicheSelector: identity.techNicheSelector,
    }),
    // Conteúdo (traduzível)
    ...content,
  };
}

/**
 * Lista todos os slugs de rota de módulos registrados (valores do campo .slug).
 * Usado pela Fase 3 (SSG) para iterar slugs × locales e gerar páginas estáticas.
 */
export function getAllModuleSlugs(): string[] {
  return Object.values(MODULES).map((m) => m.slug);
}

/**
 * Lista todas as chaves do MODULES record (ex: 'crm', 'os-digital').
 * Usado pelos wrappers ao chamar getModuleData(key, locale).
 */
export function getAllModuleKeys(): string[] {
  return Object.keys(MODULES);
}

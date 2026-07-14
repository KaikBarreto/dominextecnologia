// ─────────────────────────────────────────────────────────────────────────────
// i18n — REGISTRO DE SLUGS por (página, locale) — Fase 5.
//
// Fonte ÚNICA para "qual é o endereço (slug) de um segmento/módulo em cada
// idioma". Hoje en/es/fr caem no slug pt-br (fallback), então NADA muda visível;
// a fase de tradução só precisa preencher o campo `slug` nos content/{locale}.ts
// e este registro passa a usá-lo sozinho (rotas, hreflang, seletor de idioma).
//
// Conceitos:
//  • KEY (chave canônica): o slug pt-br da página. É a identidade estável que não
//    muda entre idiomas. Para segmentos = a chave de SEGMENTS (== slug pt-br).
//    Para módulos = o campo `.slug` do ModuleData (NÃO a chave do MODULES record,
//    que pode diferir: MODULES['crm'].slug === 'sistema-crm'). Usamos o slug como
//    key para que segmento e módulo compartilhem o MESMO espaço de chaves e as
//    rotas/hreflang tratem os dois de forma uniforme.
//  • slugFor(key, locale) → o slug daquele idioma (ou o pt-br, por fallback).
//  • resolveSlug(localizedSlug, locale) → a KEY canônica a partir do slug do
//    idioma (reverso), pra rota/loader acharem o conteúdo certo.
//
// De onde vem o slug do idioma: do campo OPCIONAL `slug` no conteúdo por locale
// (SegmentContent.slug / ModuleContent.slug). Se ausente → key pt-br (default).
// ─────────────────────────────────────────────────────────────────────────────

import { DEFAULT_LOCALE, LOCALES, type LocaleCode } from './locales';
import { localizePath, stripLocale } from './paths';
import segPtBr from '@/pages/segmentos/content/pt-br';
import segEn from '@/pages/segmentos/content/en';
import segEs from '@/pages/segmentos/content/es';
import segFr from '@/pages/segmentos/content/fr';
import type { SegmentContentMap } from '@/pages/segmentos/content/types';
import modPtBr from '@/pages/modulos/content/pt-br';
import modEn from '@/pages/modulos/content/en';
import modEs from '@/pages/modulos/content/es';
import modFr from '@/pages/modulos/content/fr';
import type { ModuleContentMap } from '@/pages/modulos/content/types';

/** Tipo do conteúdo por-locale que o registro consome (só precisa do slug opt). */
type SlugAwareContentMap = Record<string, { slug?: string }>;

/** Mapas de conteúdo por locale, por família de página (segmento/módulo). */
const SEGMENT_CONTENT: Record<LocaleCode, SegmentContentMap> = {
  'pt-br': segPtBr,
  en: segEn,
  es: segEs,
  fr: segFr,
};

const MODULE_CONTENT: Record<LocaleCode, ModuleContentMap> = {
  'pt-br': modPtBr,
  en: modEn,
  es: modEs,
  fr: modFr,
};

// ── Tabelas derivadas (montadas UMA vez no módulo) ────────────────────────────
//
// A KEY canônica de toda página é o slug pt-br (a chave do mapa pt-br). Para cada
// locale montamos:
//   forward[locale][key]        = slug daquele idioma (com fallback pt-br)
//   reverse[locale][localSlug]  = key canônica (pra resolver rota do idioma)
//
// Ambas as famílias (segmento/módulo) entram no MESMO par de tabelas porque as
// chaves nunca colidem (slugs distintos) e as rotas as tratam de forma uniforme.

type ForwardTable = Record<LocaleCode, Record<string, string>>;
type ReverseTable = Record<LocaleCode, Record<string, string>>;

function emptyByLocale<T>(make: () => T): Record<LocaleCode, T> {
  return LOCALES.reduce(
    (acc, l) => {
      acc[l.code] = make();
      return acc;
    },
    {} as Record<LocaleCode, T>,
  );
}

/**
 * Popula forward/reverse para UMA família de página. `ptBrKeys` são as chaves
 * canônicas (slugs pt-br). Para cada locale, o slug é `content[key].slug` OU a
 * própria key (fallback). A key pt-br SEMPRE mapeia pra si mesma (identidade).
 */
function indexFamily(
  ptBrKeys: string[],
  contentByLocale: Record<LocaleCode, SlugAwareContentMap>,
  forward: ForwardTable,
  reverse: ReverseTable,
): void {
  for (const l of LOCALES) {
    const map = contentByLocale[l.code] ?? {};
    for (const key of ptBrKeys) {
      // pt-br: a key JÁ é o slug canônico; ignora qualquer `slug` no conteúdo.
      const localized =
        l.code === DEFAULT_LOCALE ? key : (map[key]?.slug ?? key);
      forward[l.code][key] = localized;
      reverse[l.code][localized] = key;
      // Garante que o próprio slug pt-br também resolva em qualquer idioma
      // (defensivo: links/SSG que ainda passem o slug pt-br sob /en continuam
      // encontrando a página enquanto o slug traduzido não existir).
      if (!(key in reverse[l.code])) reverse[l.code][key] = key;
    }
  }
}

const FORWARD: ForwardTable = emptyByLocale<Record<string, string>>(() => ({}));
const REVERSE: ReverseTable = emptyByLocale<Record<string, string>>(() => ({}));

// Chaves canônicas = slugs pt-br de cada família.
const SEGMENT_KEYS = Object.keys(SEGMENT_CONTENT['pt-br']);
const MODULE_KEYS = Object.keys(MODULE_CONTENT['pt-br']);

indexFamily(SEGMENT_KEYS, SEGMENT_CONTENT, FORWARD, REVERSE);
indexFamily(MODULE_KEYS, MODULE_CONTENT, FORWARD, REVERSE);

/** Conjunto de TODAS as keys canônicas (segmento + módulo), pra checagens O(1). */
const ALL_KEYS = new Set<string>([...SEGMENT_KEYS, ...MODULE_KEYS]);

// ── API pública ───────────────────────────────────────────────────────────────

/** true se `key` (slug pt-br) é um segmento/módulo registrado. */
export function isLocalizableSlugKey(key: string): boolean {
  return ALL_KEYS.has(key);
}

/**
 * Slug de rota/URL de uma página (segmento/módulo) num idioma.
 * `key` = slug pt-br canônico. Se o idioma não tiver slug próprio, devolve o
 * pt-br (comportamento de hoje). Se a key não for conhecida, devolve-a intacta.
 */
export function slugFor(key: string, locale: LocaleCode): string {
  return FORWARD[locale]?.[key] ?? key;
}

/**
 * Reverso: a KEY canônica (slug pt-br) a partir do slug DAQUELE idioma.
 * `resolveSlug('refrigeration-service-software', 'en')` → 'sistema-para-refrigeracao'
 * (quando o slug en existir); enquanto não existir, o slug pt-br sob /en resolve
 * pra própria key. Retorna undefined se o slug não pertencer a nenhuma página.
 */
export function resolveSlug(localizedSlug: string, locale: LocaleCode): string | undefined {
  const clean = localizedSlug.replace(/^\/+|\/+$/g, '');
  return REVERSE[locale]?.[clean];
}

/**
 * Todas as KEYS canônicas de segmentos (slugs pt-br). Ordem = ordem de SEGMENTS.
 * Usado pelas rotas localizadas e pelo SSG pra iterar por segmento.
 */
export function allSegmentKeys(): string[] {
  return [...SEGMENT_KEYS];
}

/** Todas as KEYS canônicas de módulos (slugs pt-br == ModuleData.slug). */
export function allModuleKeys(): string[] {
  return [...MODULE_KEYS];
}

/**
 * Traduz um PATH COMPLETO do idioma `from` para o idioma `to`, mapeando o slug de
 * segmento/módulo (se houver) pela via slug→key→slug. Preserva query e hash.
 *
 * Uso: seletor de idioma — leva pra MESMA página no outro idioma, já com o slug
 * do idioma de destino. Enquanto os slugs traduzidos não existirem, o slug pt-br
 * é usado nos dois lados (fallback), então o comportamento é idêntico ao de hoje.
 *
 * @example
 * switchLocalePath('/en/refrigeration-service-software', 'en', 'es')
 *   → '/es/software-refrigeracion'  (quando os slugs existirem)
 * switchLocalePath('/sistema-para-refrigeracao', 'pt-br', 'en')
 *   → '/en/sistema-para-refrigeracao'  (hoje: slug en ainda é o pt-br)
 */
export function switchLocalePath(
  fullPath: string,
  from: LocaleCode,
  to: LocaleCode,
): string {
  // Separa path de ?query#hash pra remontar depois.
  const hashIdx = fullPath.indexOf('#');
  const queryIdx = fullPath.indexOf('?');
  const cut =
    hashIdx === -1 && queryIdx === -1
      ? fullPath.length
      : Math.min(...[hashIdx, queryIdx].filter((i) => i !== -1));
  const pathOnly = fullPath.slice(0, cut);
  const suffix = fullPath.slice(cut); // '?a=1#sec' | '#sec' | ''

  // Path canônico pt-br (sem prefixo de idioma).
  const base = stripLocale(pathOnly);
  const slug = base.replace(/^\/+/, '');

  // Se o primeiro segmento for slug de segmento/módulo, converte pro slug de `to`.
  let targetBase = base;
  if (slug && !slug.includes('/')) {
    // A partir do slug NO idioma de origem, acha a key canônica…
    const key = resolveSlug(slug, from) ?? (isLocalizableSlugKey(slug) ? slug : undefined);
    if (key) targetBase = `/${slugFor(key, to)}`;
  }

  return localizePath(targetBase, to) + suffix;
}

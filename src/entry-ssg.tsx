// ─────────────────────────────────────────────────────────────────────────────
// ENTRY DE SSG (Server-Side Generation) — Fase 1.
//
// Renderiza TODAS as rotas de marketing para HTML estático NO BUILD, usando o
// próprio React (renderToString) + StaticRouter, SEM navegador (Chrome/puppeteer)
// e SEM o tronco de providers do app logado (AuthProvider/Supabase/BrowserRouter).
//
// Por que isolado do App.tsx:
//   - O App.tsx monta BrowserRouter + AuthProvider (Supabase) + UsageTracker +
//     SwipeBackProvider, que tocam window/sessão/rede no load — inviáveis no SSR.
//   - As landings de marketing são puras de dados (data-driven em modulesData /
//     segmentsData): precisam só de StaticRouter + TooltipProvider +
//     QueryClientProvider. DarkVeil (WebGL/ogl) já é client-only via
//     DarkVeilBackground (lazy + `enabled` começa false), então no SSR sai só o
//     gradiente CSS de placeholder. Zero mismatch de hidratação.
//
// FASE 3 (i18n): cada rota BASE (pt-br sem prefixo) é gerada em 4 idiomas
// (pt-br + en/es/fr). buildRouteEntry(basePath, locale) resolve o componente e o
// head; segmentos/módulos vêm do loader com locale EXPLÍCITO (fallback pt-br). O
// head carrega <html lang>, canônica do idioma e bloco hreflang recíproco. A lista
// completa de tarefas (rota × idioma) sai em SSG_TASKS pro scripts/ssg.mjs iterar.
// ─────────────────────────────────────────────────────────────────────────────

// NOTA SSR: alguns módulos do app referenciam `localStorage`/`window` no momento
// do IMPORT (ex.: o cliente Supabase faz `storage: localStorage` ao criar). Como
// os imports ES são avaliados antes de qualquer statement deste módulo, o shim
// desses globals é instalado no PROCESSO NODE pelo scripts/ssg.mjs ANTES do
// import dinâmico deste bundle. Aqui não dá pra shimar a tempo.
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

import Landing from '@/pages/Landing';
import QuemSomos from '@/pages/QuemSomos';
import Blog from '@/pages/Blog';
import type { BlogProps } from '@/pages/Blog';
import BlogPost from '@/pages/BlogPost';
import type { BlogPostAlternate } from '@/pages/BlogPost';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsOfUse from '@/pages/TermsOfUse';

import SegmentLandingPage from '@/pages/segmentos/SegmentLandingPage';
import { getAllSegmentSlugs, getSegmentData } from '@/pages/segmentos/content/loader';
import ModuleLandingPage from '@/pages/modulos/ModuleLandingPage';
import { getAllModuleKeys, getAllModuleSlugs, getModuleData } from '@/pages/modulos/content/loader';
import { MARKETING_VIEWPORT } from '@/utils/publicMarketingRoutes';
import {
  DEFAULT_LOCALE,
  LOCALES,
  getLocaleDef,
  type LocaleCode,
} from '@/lib/i18n/locales';
import { MESSAGES } from '@/lib/i18n/messages';
import { localizePath } from '@/lib/i18n/paths';
import { isLocalizableSlugKey, slugFor } from '@/lib/i18n/slugRegistry';

import '@/index.css';
/* eslint-enable import/first */

/** Metadados de <head> de uma rota renderizada (injetados no HTML pelo ssg.mjs). */
export interface SsgHead {
  title: string;
  description: string;
  /** URL canônica absoluta (www). */
  canonical: string;
  /**
   * Conteúdo da meta viewport desta rota. Páginas de marketing (todas as do SSG)
   * usam o viewport ZOOMÁVEL (libera o zoom de pinça → passa no Lighthouse a11y),
   * substituindo o viewport FIXO do shell base (default do app logado).
   */
  viewport: string;
  ogTitle: string;
  ogDescription: string;
  ogUrl: string;
  /**
   * Valor da meta `og:locale` desta página (pt_BR, en_US, es_ES, fr_FR). O shell
   * (index.html) cravava `pt_BR` em todas as páginas; o ssg.mjs reescreve pelo
   * locale real desta rota.
   */
  ogLocale: string;
  /**
   * Blocos <script type="application/ld+json"> JÁ SERIALIZADOS e escapados, prontos
   * pra injeção no <head>. Quando presente (rotas de segmento/módulo), o ssg.mjs
   * REMOVE os blocos globais de JSON-LD do shell (FAQ/SoftwareApplication da home)
   * e injeta estes no lugar. A home (`/`) deixa este campo vazio e MANTÉM os blocos
   * globais do index.html (Organization/WebSite/SoftwareApplication/FAQ).
   */
  jsonLd: string;
  /**
   * Quando `true`, o ssg.mjs remove os blocos de JSON-LD globais do shell antes de
   * injetar `jsonLd` (evita FAQ/SoftwareApplication duplicados em páginas internas).
   * A home mantém os globais (`false`).
   */
  stripGlobalJsonLd: boolean;
  /**
   * Valor do atributo <html lang="..."> desta página (pt-BR, en, es, fr). O ssg.mjs
   * reescreve o `lang` do shell (que é sempre pt-BR) pelo idioma desta rota.
   */
  htmlLang: string;
  /**
   * Bloco COMPLETO de <link rel="alternate" hreflang="..."> JÁ SERIALIZADO (as 4
   * versões de idioma da MESMA página + x-default apontando pra versão pt-br).
   * É IDÊNTICO nas 4 versões de idioma da página (recíproco), como o Google exige.
   * Injetado no <head> pelo ssg.mjs.
   */
  hreflang: string;
  /**
   * Conteúdo da meta `keywords` desta rota, JÁ localizado. Quando presente
   * (home en/es/fr), o ssg.mjs reescreve a `<meta name="keywords">` do shell
   * (pt-br) por este valor. Quando ausente (`undefined`, ex.: home pt-br), o
   * shell mantém o keywords em pt-br. Keywords tem baixo peso de SEO, mas fecha
   * a lacuna de idioma na home.
   */
  keywords?: string;
}

export interface SsgRenderResult {
  /** HTML do conteúdo que vai DENTRO do #root. */
  html: string;
  head: SsgHead;
}

/** Domínio canônico do site público (www) — espelha o alvo do plano. */
export const SITE_URL = 'https://www.dominex.app';

/**
 * Path pt-br → path COM o slug do idioma, quando o path for de segmento/módulo.
 * O 1º segmento vira `slugFor(key, locale)` (fallback pt-br embutido no registro);
 * paths não-slug (home, institucionais, blog) passam intactos.
 * localizedSlugPath('/sistema-para-refrigeracao', 'en')
 *   → '/refrigeration-service-software' (quando o slug en existir; hoje = pt-br).
 */
function localizedSlugPath(basePath: string, locale: LocaleCode): string {
  const slug = basePath.replace(/^\/+/, '');
  if (slug && !slug.includes('/') && isLocalizableSlugKey(slug)) {
    return `/${slugFor(slug, locale)}`;
  }
  return basePath;
}

/**
 * URL absoluta de uma rota BASE (path pt-br sem prefixo) num dado locale, JÁ com o
 * slug traduzido do idioma (para segmento/módulo). absUrl('/os-digital', 'en') →
 * 'https://www.dominex.app/en/<slug-en>'; absUrl('/', 'pt-br') → '.../'.
 */
function absUrl(basePath: string, locale: LocaleCode): string {
  const localized = localizePath(localizedSlugPath(basePath, locale), locale);
  return localized === '/' ? `${SITE_URL}/` : `${SITE_URL}${localized}`;
}

/**
 * Monta o bloco recíproco de <link rel="alternate" hreflang="..."> pras 4 versões
 * de idioma da MESMA página BASE + x-default (versão pt-br). É IDÊNTICO nas 4
 * versões (Google exige reciprocidade). `basePath` é o path pt-br sem prefixo.
 */
function hreflangBlock(basePath: string): string {
  const links = LOCALES.map((loc) => {
    const href = absUrl(basePath, loc.code);
    return `<link rel="alternate" hreflang="${loc.htmlLang}" href="${href}" />`;
  });
  // x-default → versão pt-br (default sem prefixo).
  links.push(
    `<link rel="alternate" hreflang="x-default" href="${absUrl(basePath, DEFAULT_LOCALE)}" />`,
  );
  return links.join('\n    ');
}

// ── Head da home e das páginas institucionais/legais POR LOCALE ───────────────
// As landings de segmento/módulo têm metaTitle/metaDescription no próprio data
// (já traduzido por idioma); estas páginas não, então cravamos aqui.
//
// pt-br é BYTE-IDÊNTICO ao que vive no index.html/shell (referência de ranking).
// en/es/fr são GENERALIZADOS: sem citar PMOC, NFS-e, ISS, lei brasileira nem R$
// (termos locais do Brasil não fazem sentido pro leitor internacional). A marca
// "Dominex" é preservada e não há travessão (—) na copy.

const HOME_TITLES: Record<LocaleCode, string> = {
  'pt-br':
    'Dominex — Sistema de Ordem de Serviço, PMOC e Gestão para Refrigeração e Equipes de Campo',
  en: 'Dominex | Work Order and Field Service Management Software',
  es: 'Dominex | Software de Órdenes de Servicio y Gestión de Equipos de Campo',
  fr: 'Dominex | Logiciel de Bons de Travail et Gestion des Équipes Terrain',
};
const HOME_DESCRIPTIONS: Record<LocaleCode, string> = {
  'pt-br':
    'Sistema de ordem de serviço digital, PMOC e gestão para refrigeração, climatização e equipes de campo. App do técnico em campo. Teste grátis 14 dias, sem cartão.',
  en:
    'Digital work order software and management for service companies and field teams. Scheduling, technician app, customers and reports in one place. Free 14-day trial, no card required.',
  es:
    'Software de órdenes de servicio digital y gestión para empresas de servicio y equipos de campo. Agenda, app del técnico, clientes e informes en un solo lugar. Prueba gratis de 14 días, sin tarjeta.',
  fr:
    'Logiciel de bons de travail numériques et gestion pour les entreprises de service et les équipes terrain. Planning, application du technicien, clients et rapports au même endroit. Essai gratuit de 14 jours, sans carte.',
};

// ── Meta keywords da HOME por locale ─────────────────────────────────────────
// pt-br NÃO entra aqui: a home pt-br mantém EXATAMENTE a keywords do shell
// (index.html). en/es/fr são GENERALIZADOS (sem PMOC, NFS-e, ISS, R$ nem termos
// locais do Brasil). Keywords tem baixo peso de SEO; entra só pra fechar a
// lacuna de idioma na home. Sem travessão (—). Marca "Dominex" preservada.
const HOME_KEYWORDS: Partial<Record<LocaleCode, string>> = {
  en: 'work order software, digital work orders, field service management, field service software, technician app, service scheduling software, maintenance management, work order app, field team management',
  es: 'software de órdenes de servicio, órdenes de servicio digitales, gestión de equipos de campo, software de servicio de campo, app del técnico, software de agenda de servicios, gestión de mantenimiento, app de órdenes de servicio',
  fr: 'logiciel de bons de travail, bons de travail numériques, gestion des équipes terrain, logiciel de service terrain, application du technicien, logiciel de planning de service, gestion de la maintenance, application de bons de travail',
};

// ── Head das páginas institucionais/legais por locale ────────────────────────
// pt-br é inalterado (referência anterior). en/es/fr são generalizados: sem citar
// LGPD, lei brasileira, ISS, PMOC ou NFS-e (termos locais do Brasil). Sem
// travessão (—) na copy; marca "Dominex" preservada.

const QUEM_SOMOS_TITLES: Record<LocaleCode, string> = {
  'pt-br': 'Quem somos — Dominex | Gestão para equipes de campo',
  en: 'About Us — Dominex | Management for Field Service Teams',
  es: 'Quiénes somos — Dominex | Gestión para equipos de campo',
  fr: 'Qui sommes-nous — Dominex | Gestion pour les équipes terrain',
};
const QUEM_SOMOS_DESCRIPTIONS: Record<LocaleCode, string> = {
  'pt-br':
    'Conheça a Dominex: sistema de ordem de serviço, PMOC e gestão para empresas de serviço e equipes de campo — refrigeração, elétrica, energia solar e mais. Feito para quem domina o campo.',
  en:
    'Meet Dominex: work order, maintenance and management software for field service companies, covering HVAC, electrical, solar energy, pest control and more. Built for teams that master the field.',
  es:
    'Conoce Dominex: software de órdenes de servicio y gestión para empresas de servicio y equipos de campo, como climatización, electricidad, energía solar y más. Hecho para quien domina el campo.',
  fr:
    'Découvrez Dominex : logiciel de bons de travail et gestion pour les entreprises de service et les équipes terrain, comme le CVC, l’électricité, l’énergie solaire et plus. Conçu pour ceux qui maîtrisent le terrain.',
};

const BLOG_TITLES: Record<LocaleCode, string> = {
  'pt-br': 'Blog — Dominex | Gestão para equipes de campo',
  en: 'Blog — Dominex | Field Service Management',
  es: 'Blog — Dominex | Gestión para equipos de campo',
  fr: 'Blog — Dominex | Gestion pour les équipes terrain',
};
const BLOG_DESCRIPTIONS: Record<LocaleCode, string> = {
  'pt-br':
    'Artigos práticos sobre ordem de serviço, PMOC, gestão de equipe e como tirar a operação de campo do papel. Conteúdo da Dominex.',
  en:
    'Practical articles on work orders, maintenance plans, team management and how to bring your field operation under control. Content by Dominex.',
  es:
    'Artículos prácticos sobre órdenes de servicio, gestión de equipos y cómo llevar el control de tu operación de campo. Contenido de Dominex.',
  fr:
    'Articles pratiques sur les bons de travail, la gestion des équipes et comment maîtriser votre opération terrain. Contenu Dominex.',
};

const PRIVACIDADE_TITLES: Record<LocaleCode, string> = {
  'pt-br': 'Política de Privacidade — Dominex',
  en: 'Privacy Policy — Dominex',
  es: 'Política de Privacidad — Dominex',
  fr: 'Politique de Confidentialité — Dominex',
};
const PRIVACIDADE_DESCRIPTIONS: Record<LocaleCode, string> = {
  'pt-br':
    'Política de Privacidade da Dominex: como tratamos os dados pessoais na plataforma, conforme a Lei nº 13.709/2018 (LGPD).',
  en:
    'Dominex Privacy Policy: how we process personal data on the platform, following applicable data protection law.',
  es:
    'Política de Privacidad de Dominex: cómo tratamos los datos personales en la plataforma, conforme a la legislación de protección de datos aplicable.',
  fr:
    'Politique de confidentialité de Dominex: comment nous traitons les données personnelles sur la plateforme, conformément aux lois applicables en matière de protection des données.',
};

const TERMOS_TITLES: Record<LocaleCode, string> = {
  'pt-br': 'Termos de Uso — Dominex',
  en: 'Terms of Use — Dominex',
  es: 'Términos de Uso — Dominex',
  fr: "Conditions d'utilisation — Dominex",
};
const TERMOS_DESCRIPTIONS: Record<LocaleCode, string> = {
  'pt-br':
    'Termos de Uso da plataforma Dominex: condições de cadastro, uso do serviço e responsabilidades para empresas de serviço e equipes de campo.',
  en:
    'Dominex Terms of Use: registration conditions, service usage and responsibilities for service companies and field teams.',
  es:
    'Términos de Uso de la plataforma Dominex: condiciones de registro, uso del servicio y responsabilidades para empresas de servicio y equipos de campo.',
  fr:
    "Conditions d'utilisation de la plateforme Dominex: conditions d'inscription, utilisation du service et responsabilités pour les entreprises de service.",
};

/** Tipo de rota, pra montar o JSON-LD certo (Breadcrumb + App/Product + FAQ). */
type RouteKind = 'home' | 'segment' | 'module' | 'institutional';

/** FAQ no formato cru das landings ({ q, a }). */
interface RawFaq {
  q: string;
  a: string;
}

/** Entrada da tabela de rotas: o elemento React a renderizar + head próprio. */
interface RouteEntry {
  element: React.ReactElement;
  title: string;
  description: string;
  kind: RouteKind;
  /** Nome curto da página pro BreadcrumbList (navLabel do segmento/módulo). */
  breadcrumbName?: string;
  /** FAQ da landing (segmento/módulo) → vira FAQPage por-rota. */
  faq?: RawFaq[];
}

// ── JSON-LD por rota ──────────────────────────────────────────────────────────
// Serializamos com a MESMA proteção do api/blog-post.js: a única sequência
// perigosa dentro de <script> é "</", escapada pra "<\/" (válido em JSON, inócuo
// pro parser de JSON-LD). Aspas em atributos não entram aqui (é texto JSON).

/** Serializa um objeto JSON-LD com escape de `</script>` e o embrulha na tag. */
function jsonLdScript(obj: unknown): string {
  const json = JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1');
  return `<script type="application/ld+json">${json}</script>`;
}

/** BreadcrumbList: Início > Página. `homeUrl`/`pageUrl` são absolutos do idioma. */
function breadcrumbLd(homeUrl: string, pageUrl: string, name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Início',
        item: homeUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name,
        item: pageUrl,
      },
    ],
  };
}

/** SoftwareApplication da página (nome/descrição da própria rota). `pageUrl` absoluto. */
function softwareAppLd(pageUrl: string, name: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description,
    url: pageUrl,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'BRL',
      lowPrice: '197',
      highPrice: '697',
      offerCount: '3',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '3000',
    },
    creator: {
      '@type': 'Organization',
      name: 'Auctus',
      url: 'https://auctustech.com.br',
    },
  };
}

/** FAQPage a partir do faq cru da landing. Retorna null se não houver perguntas. */
function faqPageLd(faq: RawFaq[] | undefined) {
  if (!faq || faq.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/**
 * JSON-LD LOCALIZADO da HOME (só en/es/fr). Substitui os blocos globais do shell
 * (SoftwareApplication + FAQPage, que são pt-br) por versões no idioma da página:
 *   - SoftwareApplication: name "Dominex", description = metaDescription localizada
 *     da home; URL/offer/rating iguais aos das demais rotas (softwareAppLd).
 *   - FAQPage: montado a partir de MESSAGES[locale].home.faq.items ({ q, a }) já
 *     traduzido e generalizado (sem PMOC-lei/NFS-e/ISS).
 * Organization e WebSite do shell NÃO são tocados aqui (ficam, são site-wide). A
 * home pt-br NÃO chama esta função: mantém byte-a-byte o JSON-LD do shell.
 */
function buildHomeJsonLd(locale: LocaleCode, homeUrl: string): string {
  const description = HOME_DESCRIPTIONS[locale] ?? HOME_DESCRIPTIONS[DEFAULT_LOCALE];
  // `home.faq.items` vem `readonly` (as const no pt-br); normaliza pra RawFaq[]
  // mutável, pegando só { q, a } (mesma forma do FAQPage de segmento/módulo).
  const faqItems: RawFaq[] = (MESSAGES[locale]?.home?.faq?.items ?? []).map((f) => ({
    q: f.q,
    a: f.a,
  }));
  const blocks: string[] = [
    jsonLdScript(softwareAppLd(homeUrl, 'Dominex', description)),
  ];
  const faqLd = faqPageLd(faqItems);
  if (faqLd) blocks.push(jsonLdScript(faqLd));
  return blocks.join('\n    ');
}

/**
 * Monta a string completa de blocos JSON-LD por-rota (segmento/módulo):
 * BreadcrumbList + SoftwareApplication + FAQPage (quando há FAQ). A home não passa
 * por aqui (mantém os blocos globais do index.html).
 */
function buildRouteJsonLd(homeUrl: string, pageUrl: string, entry: RouteEntry): string {
  const blocks: string[] = [];
  const name = entry.breadcrumbName ?? entry.title;

  blocks.push(jsonLdScript(breadcrumbLd(homeUrl, pageUrl, name)));
  blocks.push(jsonLdScript(softwareAppLd(pageUrl, entry.title, entry.description)));

  const faqLd = faqPageLd(entry.faq);
  if (faqLd) blocks.push(jsonLdScript(faqLd));

  return blocks.join('\n    ');
}

/**
 * Monta o RouteEntry (elemento + head) de uma rota BASE (path pt-br sem prefixo)
 * PARA UM LOCALE. Segmentos/módulos resolvem conteúdo pelo loader com o locale
 * EXPLÍCITO (fallback pt-br já embutido no loader). Institucionais/home usam texto
 * pt-br fixo nesta fase (só URL/lang/hreflang/canônica mudam por idioma).
 */
function buildRouteEntry(basePath: string, locale: LocaleCode): RouteEntry | undefined {
  // Home.
  if (basePath === '/') {
    return {
      element: <Landing />,
      title: HOME_TITLES[locale] ?? HOME_TITLES['pt-br'],
      description: HOME_DESCRIPTIONS[locale] ?? HOME_DESCRIPTIONS['pt-br'],
      kind: 'home',
    };
  }

  const slug = basePath.replace(/^\/+/, '');

  // Segmento? (slug bate com um segmento registrado)
  if (getAllSegmentSlugs().includes(slug)) {
    const seg = getSegmentData(slug, locale);
    if (!seg) return undefined;
    return {
      element: <SegmentLandingPage data={seg} />,
      title: seg.metaTitle,
      description: seg.metaDescription,
      kind: 'segment',
      breadcrumbName: seg.navLabel,
      faq: seg.faq,
    };
  }

  // Módulo? (a rota usa data.slug; a chave do MODULES pode diferir)
  const moduleKey = getAllModuleKeys().find(
    (key) => getModuleData(key, DEFAULT_LOCALE)?.slug === slug,
  );
  if (moduleKey) {
    const mod = getModuleData(moduleKey, locale);
    if (!mod) return undefined;
    return {
      element: <ModuleLandingPage data={mod} />,
      title: mod.metaTitle,
      description: mod.metaDescription,
      kind: 'module',
      breadcrumbName: mod.navLabel,
      faq: mod.faq,
    };
  }

  // Institucional / blog / legais.
  switch (basePath) {
    case '/quem-somos':
      return {
        element: <QuemSomos />,
        title: QUEM_SOMOS_TITLES[locale] ?? QUEM_SOMOS_TITLES['pt-br'],
        description: QUEM_SOMOS_DESCRIPTIONS[locale] ?? QUEM_SOMOS_DESCRIPTIONS['pt-br'],
        kind: 'institutional',
        breadcrumbName:
          locale === 'en'
            ? 'About Us'
            : locale === 'es'
              ? 'Quiénes somos'
              : locale === 'fr'
                ? 'Qui sommes-nous'
                : 'Quem somos',
      };
    case '/blog':
      return {
        element: <Blog />,
        title: BLOG_TITLES[locale] ?? BLOG_TITLES['pt-br'],
        description: BLOG_DESCRIPTIONS[locale] ?? BLOG_DESCRIPTIONS['pt-br'],
        kind: 'institutional',
        breadcrumbName: 'Blog',
      };
    case '/privacidade':
      return {
        element: <PrivacyPolicy />,
        title: PRIVACIDADE_TITLES[locale] ?? PRIVACIDADE_TITLES['pt-br'],
        description: PRIVACIDADE_DESCRIPTIONS[locale] ?? PRIVACIDADE_DESCRIPTIONS['pt-br'],
        kind: 'institutional',
        breadcrumbName:
          locale === 'en'
            ? 'Privacy Policy'
            : locale === 'es'
              ? 'Política de Privacidad'
              : locale === 'fr'
                ? 'Politique de Confidentialité'
                : 'Política de Privacidade',
      };
    case '/termos':
      return {
        element: <TermsOfUse />,
        title: TERMOS_TITLES[locale] ?? TERMOS_TITLES['pt-br'],
        description: TERMOS_DESCRIPTIONS[locale] ?? TERMOS_DESCRIPTIONS['pt-br'],
        kind: 'institutional',
        breadcrumbName:
          locale === 'en'
            ? 'Terms of Use'
            : locale === 'es'
              ? 'Términos de Uso'
              : locale === 'fr'
                ? "Conditions d'utilisation"
                : 'Termos de Uso',
      };
    default:
      return undefined;
  }
}

/**
 * Lista das rotas BASE (path pt-br sem prefixo) que o SSG conhece, na ordem de
 * geração/sitemap: home → 9 segmentos → 11 módulos → institucionais/legais.
 * Deriva a lista dos loaders (fonte única) + as fixas institucionais.
 */
function buildBaseRoutes(): string[] {
  const segRoutes = getAllSegmentSlugs().map((slug) => `/${slug}`);
  const modRoutes = getAllModuleSlugs().map((slug) => `/${slug}`);
  return [
    '/',
    ...segRoutes,
    ...modRoutes,
    '/quem-somos',
    '/blog',
    '/privacidade',
    '/termos',
  ];
}

/** Rotas BASE (path pt-br, sem prefixo de idioma). */
export const SSG_BASE_ROUTES: string[] = buildBaseRoutes();

/**
 * Lista COMPLETA de tarefas de geração: cada rota base × cada locale. O ssg.mjs
 * itera isto pra escrever `dist/<...>/index.html` (pt-br) e `dist/<loc>/<...>/index.html`.
 * `outPath` é relativo a dist/ ('' = index.html na raiz). `url` é a canônica absoluta.
 */
export interface SsgTask {
  /** Path base (pt-br, sem prefixo) — chave pra resolver o conteúdo. */
  basePath: string;
  /** Locale desta tarefa. */
  locale: LocaleCode;
  /** Path localizado ('/', '/en/blog', ...). */
  localizedPath: string;
  /** Diretório de saída relativo a dist/ ('' = raiz). */
  outDir: string;
  /** URL canônica absoluta desta página. */
  url: string;
}

/** Diretório de saída (relativo a dist/) de um path localizado. */
function outDirForPath(localizedPath: string): string {
  return localizedPath === '/' ? '' : localizedPath.replace(/^\/+|\/+$/g, '');
}

export const SSG_TASKS: SsgTask[] = SSG_BASE_ROUTES.flatMap((basePath) =>
  LOCALES.map((loc) => {
    // localizedPath já leva o slug do idioma (fallback pt-br embutido).
    const localizedPath = localizePath(localizedSlugPath(basePath, loc.code), loc.code);
    return {
      basePath,
      locale: loc.code,
      localizedPath,
      outDir: outDirForPath(localizedPath),
      url: absUrl(basePath, loc.code),
    };
  }),
);

/**
 * Compat: lista de rotas BASE que o SSG sabe renderizar. Mantida pro ssg.mjs que
 * checa `SSG_ROUTES.includes('/blog')` pra decidir buscar dados do blog.
 */
export const SSG_ROUTES = SSG_BASE_ROUTES;

/**
 * Dados do blog injetados pelo scripts/ssg.mjs (buscados via REST no build) pra
 * que a listagem `/blog` saia com os POSTS já renderizados no HTML estático —
 * crítico pra SEO (cards, links internos e categorias visíveis sem JS).
 */
export interface SsgBlogData {
  posts?: BlogProps['initialPosts'];
  categories?: BlogProps['initialCategories'];
}

/** Opções de render: locale (default pt-br) + dados do blog (só pra /blog). */
export interface RenderRouteOptions {
  locale?: LocaleCode;
  blogData?: SsgBlogData;
}

/**
 * Renderiza UMA rota de marketing para string, num dado LOCALE, com shell de
 * providers mínimo e SSR-safe. Cada render usa um QueryClient novo. `route` é o
 * path BASE (pt-br, sem prefixo); o locale só afeta conteúdo (segmento/módulo),
 * URL canônica, <html lang> e o bloco hreflang. Pra `/blog`, `blogData` vira
 * initialData do React Query (cards no HTML). Assinatura antiga
 * `renderRoute(route, blogData)` continua funcionando (2º arg como blogData).
 */
export function renderRoute(
  route: string,
  optionsOrBlogData?: RenderRouteOptions | SsgBlogData,
): SsgRenderResult {
  // Compat: se o 2º arg tiver forma de blogData (posts/categories) e não de opts.
  const opts: RenderRouteOptions =
    optionsOrBlogData && ('locale' in optionsOrBlogData || 'blogData' in optionsOrBlogData)
      ? (optionsOrBlogData as RenderRouteOptions)
      : { blogData: optionsOrBlogData as SsgBlogData | undefined };

  const locale: LocaleCode = opts.locale ?? DEFAULT_LOCALE;
  const blogData = opts.blogData;

  const entry = buildRouteEntry(route, locale);
  if (!entry) {
    throw new Error(`[entry-ssg] Rota não mapeada no SSG: "${route}" (locale ${locale}).`);
  }

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });

  // Pra /blog, injeta os dados buscados no build como initialData (cards no HTML).
  const element =
    route === '/blog'
      ? <Blog initialPosts={blogData?.posts} initialCategories={blogData?.categories} />
      : entry.element;

  // O StaticRouter renderiza no PATH LOCALIZADO (com o slug do idioma) — assim os
  // links internos que o componente monta via useLocale/localizePath saem já com o
  // prefixo E o slug corretos do idioma.
  const localizedPath = localizePath(localizedSlugPath(route, locale), locale);

  const html = renderToString(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <StaticRouter location={localizedPath}>{element}</StaticRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>
  );

  const pageUrl = absUrl(route, locale);
  const homeUrl = absUrl('/', locale);

  // JSON-LD por-rota. URLs do JSON-LD são as absolutas DO IDIOMA da página.
  //  - Home pt-br: mantém os blocos globais do shell BYTE-A-BYTE (não injeta nem
  //    remove nada) — é a referência de ranking.
  //  - Home en/es/fr: remove os blocos globais da HOME que são pt-br (FAQPage +
  //    SoftwareApplication) e injeta versões LOCALIZADAS; Organization/WebSite do
  //    shell ficam (site-wide). Assim não há duplicação nem texto pt-br na home.
  //  - Segmento/módulo: Breadcrumb + SoftwareApplication + FAQPage própria.
  //  - Institucional: só Breadcrumb (sem FAQ/App), ainda removendo a FAQ global.
  const isNonDefaultHome = entry.kind === 'home' && locale !== DEFAULT_LOCALE;
  let jsonLd = '';
  // Strip do JSON-LD global do shell em TUDO que não é a home pt-br (a home
  // não-default agora também precisa strippar pra não duplicar os globais).
  const stripGlobalJsonLd = entry.kind !== 'home' || isNonDefaultHome;
  if (isNonDefaultHome) {
    jsonLd = buildHomeJsonLd(locale, homeUrl);
  } else if (entry.kind === 'segment' || entry.kind === 'module') {
    jsonLd = buildRouteJsonLd(homeUrl, pageUrl, entry);
  } else if (entry.kind === 'institutional') {
    jsonLd = jsonLdScript(breadcrumbLd(homeUrl, pageUrl, entry.breadcrumbName ?? entry.title));
  }

  const head: SsgHead = {
    title: entry.title,
    description: entry.description,
    canonical: pageUrl,
    // Toda rota do SSG é marketing → viewport zoomável (acessibilidade).
    viewport: MARKETING_VIEWPORT,
    ogTitle: entry.title,
    ogDescription: entry.description,
    ogUrl: pageUrl,
    ogLocale: getLocaleDef(locale).ogLocale,
    jsonLd,
    stripGlobalJsonLd,
    htmlLang: getLocaleDef(locale).htmlLang,
    hreflang: hreflangBlock(route),
    // Keywords localizada só na home en/es/fr (fecha a lacuna de idioma). Demais
    // rotas/idiomas não mexem no keywords do shell (undefined).
    keywords: isNonDefaultHome ? HOME_KEYWORDS[locale] : undefined,
  };

  return { html, head };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRERENDER DE POST DO BLOG (por idioma) — Fase 4.
//
// Cada post publicado sai como HTML estático na URL do seu locale (pt-br em
// /blog/<slug>, outros em /<lang>/blog/<slug>). O conteúdo é injetado sem fetch
// no client (initialPost/initialAlternates), e o <head> traz canônica do idioma,
// <html lang>, OG/Twitter, JSON-LD Article e hreflang recíproco por
// translation_group (só as versões PUBLICADAS existentes + x-default pt-br).
// ─────────────────────────────────────────────────────────────────────────────

/** Post cru vindo da REST (campos que o BlogPost e o head precisam). */
export interface SsgBlogPost {
  id: string;
  slug: string;
  locale: LocaleCode;
  translation_group: string;
  title: string;
  excerpt?: string | null;
  content?: string | null;
  cover_image_url?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  category?: string | null;
  author_name?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  [key: string]: unknown;
}

/** Opções do render de post: locale + alternates (versões do translation_group). */
export interface RenderBlogPostOptions {
  locale: LocaleCode;
  alternates?: BlogPostAlternate[];
}

/** Imagem OG padrão do site (espelha o default do BlogPost). */
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

/**
 * Monta o bloco hreflang de um post a partir das versões PUBLICADAS do mesmo
 * translation_group. Um <link> por idioma existente (com o SLUG daquela versão) +
 * x-default = versão pt-br (se existir; senão a própria canônica). NUNCA emite
 * alternate pra idioma sem tradução publicada.
 */
function blogPostHreflang(
  alternates: BlogPostAlternate[],
  fallback: { locale: LocaleCode; slug: string },
): string {
  const versions = alternates.length > 0 ? alternates : [fallback];
  const links = versions.map((v) => {
    const href = `${SITE_URL}${localizePath(`/blog/${v.slug}`, v.locale)}`;
    return `<link rel="alternate" hreflang="${getLocaleDef(v.locale).htmlLang}" href="${href}" />`;
  });
  const ptBr = versions.find((v) => v.locale === DEFAULT_LOCALE);
  const xDefaultSlug = ptBr ? ptBr.slug : fallback.slug;
  const xDefaultLocale = ptBr ? DEFAULT_LOCALE : fallback.locale;
  links.push(
    `<link rel="alternate" hreflang="x-default" href="${SITE_URL}${localizePath(
      `/blog/${xDefaultSlug}`,
      xDefaultLocale,
    )}" />`,
  );
  return links.join('\n    ');
}

/**
 * Renderiza UM post do blog para HTML estático, no seu locale, com o conteúdo já
 * no #root (initialPost) e o <head> completo de SEO por idioma. Sem fetch no
 * client no prerender: os dados vêm por prop.
 */
export function renderBlogPost(
  post: SsgBlogPost,
  opts: RenderBlogPostOptions,
): SsgRenderResult {
  const locale = opts.locale;
  const alternates = opts.alternates ?? [];

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });

  const localizedPath = localizePath(`/blog/${post.slug}`, locale);

  const html = renderToString(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <StaticRouter location={localizedPath}>
            <BlogPost initialPost={post} initialAlternates={alternates} />
          </StaticRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>,
  );

  const pageUrl = `${SITE_URL}${localizedPath}`;
  const homeUrl = absUrl('/', locale);
  const title = post.meta_title || post.title;
  const description = post.meta_description || post.excerpt || '';
  const fullTitle = `${title} — Blog Dominex`;
  const image = post.cover_image_url || DEFAULT_OG_IMAGE;

  // JSON-LD: Breadcrumb (Início > Blog > post) + Article. Removemos os globais da
  // home (stripGlobalJsonLd) pra não herdar FAQ/oferta da home no post.
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    image,
    inLanguage: getLocaleDef(locale).htmlLang,
    datePublished: post.published_at || post.created_at,
    dateModified: post.updated_at || post.published_at || post.created_at,
    author: { '@type': 'Organization', name: post.author_name || 'Dominex' },
    publisher: {
      '@type': 'Organization',
      name: 'Dominex',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
  };
  const blogUrl = `${SITE_URL}${localizePath('/blog', locale)}`;
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: homeUrl },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: blogUrl },
      { '@type': 'ListItem', position: 3, name: title, item: pageUrl },
    ],
  };
  const jsonLd = [jsonLdScript(breadcrumb), jsonLdScript(articleLd)].join('\n    ');

  const head: SsgHead = {
    title: fullTitle,
    description,
    canonical: pageUrl,
    viewport: MARKETING_VIEWPORT,
    ogTitle: fullTitle,
    ogDescription: description,
    ogUrl: pageUrl,
    ogLocale: getLocaleDef(locale).ogLocale,
    jsonLd,
    stripGlobalJsonLd: true,
    htmlLang: getLocaleDef(locale).htmlLang,
    hreflang: blogPostHreflang(alternates, { locale, slug: post.slug }),
  };

  return { html, head };
}

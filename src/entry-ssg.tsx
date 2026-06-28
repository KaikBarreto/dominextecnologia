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
// FASE 1: todas as 22 rotas de PRERENDER_ROUTES + /privacidade + /termos. Cada
// slug resolve para o componente certo via ROUTE_TABLE, com SEU head próprio.
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
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsOfUse from '@/pages/TermsOfUse';

import SegmentLandingPage from '@/pages/segmentos/SegmentLandingPage';
import { SEGMENTS } from '@/pages/segmentos/segmentsData';
import ModuleLandingPage from '@/pages/modulos/ModuleLandingPage';
import { MODULES } from '@/pages/modulos/modulesData';

import '@/index.css';
/* eslint-enable import/first */

/** Metadados de <head> de uma rota renderizada (injetados no HTML pelo ssg.mjs). */
export interface SsgHead {
  title: string;
  description: string;
  /** URL canônica absoluta (www). */
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogUrl: string;
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
}

export interface SsgRenderResult {
  /** HTML do conteúdo que vai DENTRO do #root. */
  html: string;
  head: SsgHead;
}

/** Domínio canônico do site público (www) — espelha o alvo do plano. */
const SITE_URL = 'https://www.dominex.app';

// ── Head da home e das páginas institucionais/legais ──────────────────────────
// As landings de segmento/módulo têm metaTitle/metaDescription no próprio data;
// estas não, então cravamos aqui (espelham o que o componente seta via
// document.title no client e o que vive no index.html da home).
const HOME_TITLE =
  'Dominex — Sistema de Ordem de Serviço, PMOC e Gestão para Refrigeração e Equipes de Campo';
const HOME_DESCRIPTION =
  'Sistema de ordem de serviço digital, PMOC e gestão para refrigeração, climatização e equipes de campo. App do técnico em campo. Teste grátis 14 dias, sem cartão.';

const QUEM_SOMOS_TITLE = 'Quem somos — Dominex | Gestão para equipes de campo';
const QUEM_SOMOS_DESCRIPTION =
  'Conheça a Dominex: sistema de ordem de serviço, PMOC e gestão para empresas de serviço e equipes de campo — refrigeração, elétrica, energia solar e mais. Feito para quem domina o campo.';

const BLOG_TITLE = 'Blog — Dominex | Gestão para equipes de campo';
const BLOG_DESCRIPTION =
  'Artigos práticos sobre ordem de serviço, PMOC, gestão de equipe e como tirar a operação de campo do papel. Conteúdo da Dominex.';

const PRIVACIDADE_TITLE = 'Política de Privacidade — Dominex';
const PRIVACIDADE_DESCRIPTION =
  'Política de Privacidade da Dominex: como tratamos os dados pessoais na plataforma, conforme a Lei nº 13.709/2018 (LGPD).';

const TERMOS_TITLE = 'Termos de Uso — Dominex';
const TERMOS_DESCRIPTION =
  'Termos de Uso da plataforma Dominex: condições de cadastro, uso do serviço e responsabilidades para empresas de serviço e equipes de campo.';

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

/** BreadcrumbList: Início > Página. */
function breadcrumbLd(route: string, name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Início',
        item: `${SITE_URL}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name,
        item: `${SITE_URL}${route}`,
      },
    ],
  };
}

/** SoftwareApplication da página (nome/descrição da própria rota). */
function softwareAppLd(route: string, name: string, description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description,
    url: `${SITE_URL}${route}`,
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
 * Monta a string completa de blocos JSON-LD por-rota (segmento/módulo):
 * BreadcrumbList + SoftwareApplication + FAQPage (quando há FAQ). A home não passa
 * por aqui (mantém os blocos globais do index.html).
 */
function buildRouteJsonLd(route: string, entry: RouteEntry): string {
  const blocks: string[] = [];
  const name = entry.breadcrumbName ?? entry.title;

  blocks.push(jsonLdScript(breadcrumbLd(route, name)));
  blocks.push(jsonLdScript(softwareAppLd(route, entry.title, entry.description)));

  const faqLd = faqPageLd(entry.faq);
  if (faqLd) blocks.push(jsonLdScript(faqLd));

  return blocks.join('\n    ');
}

/**
 * Resolve o segmento/módulo pelo SLUG da rota (sem barra). O slug do módulo CRM é
 * `/sistema-crm`, mas a chave em MODULES é `crm` (o path /crm é a tela logada).
 */
function moduleBySlug(slug: string) {
  const direct = MODULES[slug];
  if (direct) return direct;
  // Procura por data.slug (cobre o caso /sistema-crm → chave 'crm').
  return Object.values(MODULES).find((m) => m.slug === slug);
}

/** Monta a tabela de rotas de marketing → componente + head. */
function buildRouteTable(): Record<string, RouteEntry> {
  const table: Record<string, RouteEntry> = {};

  // Home — mantém os blocos JSON-LD globais do index.html (Organization/WebSite/
  // SoftwareApplication/FAQ da home), então NÃO injeta JSON-LD por-rota.
  table['/'] = {
    element: <Landing />,
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    kind: 'home',
  };

  // Landings de segmento (9). Head vem do próprio data (metaTitle/metaDescription).
  for (const seg of Object.values(SEGMENTS)) {
    table[`/${seg.slug}`] = {
      element: <SegmentLandingPage data={seg} />,
      title: seg.metaTitle,
      description: seg.metaDescription,
      kind: 'segment',
      breadcrumbName: seg.navLabel,
      faq: seg.faq,
    };
  }

  // Landings de módulo (11). A rota usa data.slug (ex.: /sistema-crm).
  for (const mod of Object.values(MODULES)) {
    table[`/${mod.slug}`] = {
      element: <ModuleLandingPage data={mod} />,
      title: mod.metaTitle,
      description: mod.metaDescription,
      kind: 'module',
      breadcrumbName: mod.navLabel,
      faq: mod.faq,
    };
  }

  // Institucional / blog / legais — sem FAQ/App por-rota; só removem a FAQ global
  // da home pra não herdar perguntas que não são da página.
  table['/quem-somos'] = {
    element: <QuemSomos />,
    title: QUEM_SOMOS_TITLE,
    description: QUEM_SOMOS_DESCRIPTION,
    kind: 'institutional',
    breadcrumbName: 'Quem somos',
  };
  table['/blog'] = {
    element: <Blog />,
    title: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    kind: 'institutional',
    breadcrumbName: 'Blog',
  };
  table['/privacidade'] = {
    element: <PrivacyPolicy />,
    title: PRIVACIDADE_TITLE,
    description: PRIVACIDADE_DESCRIPTION,
    kind: 'institutional',
    breadcrumbName: 'Política de Privacidade',
  };
  table['/termos'] = {
    element: <TermsOfUse />,
    title: TERMOS_TITLE,
    description: TERMOS_DESCRIPTION,
    kind: 'institutional',
    breadcrumbName: 'Termos de Uso',
  };

  return table;
}

const ROUTE_TABLE = buildRouteTable();

/** Lista de rotas que o SSG sabe renderizar (consumida pelo scripts/ssg.mjs). */
export const SSG_ROUTES = Object.keys(ROUTE_TABLE);

void moduleBySlug; // mantido para resolução por slug ad-hoc, se necessário.

/**
 * Renderiza UMA rota de marketing para string, com shell de providers mínimo e
 * SSR-safe. Cada render usa um QueryClient novo (sem cache compartilhado entre
 * rotas) — o useQuery não dispara fetch no SSR (effects não rodam), só precisa do
 * provider para não quebrar.
 */
export function renderRoute(route: string): SsgRenderResult {
  const entry = ROUTE_TABLE[route];
  if (!entry) {
    throw new Error(`[entry-ssg] Rota não mapeada no SSG: "${route}".`);
  }

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });

  const html = renderToString(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <StaticRouter location={route}>{entry.element}</StaticRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>
  );

  // JSON-LD por-rota. Home mantém os blocos globais do shell (não injeta nem
  // remove). Segmento/módulo: Breadcrumb + SoftwareApplication + FAQPage própria.
  // Institucional: só Breadcrumb (sem FAQ/App), mas ainda removendo a FAQ global.
  let jsonLd = '';
  const stripGlobalJsonLd = entry.kind !== 'home';
  if (entry.kind === 'segment' || entry.kind === 'module') {
    jsonLd = buildRouteJsonLd(route, entry);
  } else if (entry.kind === 'institutional') {
    jsonLd = jsonLdScript(breadcrumbLd(route, entry.breadcrumbName ?? entry.title));
  }

  const head: SsgHead = {
    title: entry.title,
    description: entry.description,
    canonical: `${SITE_URL}${route}`,
    ogTitle: entry.title,
    ogDescription: entry.description,
    ogUrl: `${SITE_URL}${route}`,
    jsonLd,
    stripGlobalJsonLd,
  };

  return { html, head };
}

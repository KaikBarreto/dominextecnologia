// ─────────────────────────────────────────────────────────────────────────────
// GERAÇÃO DE ARTEFATOS DE INDEXAÇÃO i18n — sitemap.xml + llms.txt por idioma.
//
// Roda no fim do SSG (chamado por scripts/ssg.mjs), consumindo a MESMA lista de
// tarefas (SSG_TASKS = rota base × idioma) que gerou as páginas. Fonte única de
// verdade → sitemap e llms.txt nunca desalinham das páginas realmente geradas.
//
// O que produz (em dist/, servido estático pela Vercel):
//   • dist/sitemap.xml   — TODAS as URLs × idioma, cada <url> com <xhtml:link
//                          rel="alternate" hreflang="..."> pras 4 versões + x-default.
//   • dist/llms.txt      — índice GEO em pt-br (default, sem prefixo).
//   • dist/en/llms.txt, dist/es/llms.txt, dist/fr/llms.txt — um por idioma, com as
//                          URLs prefixadas do idioma.
//
// Regras-lei respeitadas:
//   • Só páginas públicas de marketing/institucional/blog-listagem (nunca rota
//     autenticada nem dado de cliente).
//   • URL canônica sempre no domínio www (SITE_URL vindo do entry-ssg).
//   • Sem travessão (—) em texto visível; descrições em vírgula.
// ─────────────────────────────────────────────────────────────────────────────

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** lastmod único do build (data de hoje, YYYY-MM-DD). */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Prioridade de sitemap por path base (mesma régua da versão manual anterior). */
function priorityFor(basePath) {
  if (basePath === '/') return '1.0';
  if (basePath === '/blog') return '0.7';
  if (basePath === '/quem-somos') return '0.5';
  if (basePath === '/privacidade' || basePath === '/termos') return '0.3';
  return '0.9'; // segmentos e módulos
}

/** Escapa texto pra dentro de XML. */
function xmlEsc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Índice GEO (llms.txt) ─────────────────────────────────────────────────────
// O arquivo é um índice curto e factual, não uma cópia do site. Títulos e
// descrições vêm do próprio head renderizado; posts vêm da mesma consulta usada
// no SSG. Assim não existe tradução fictícia nem URL de artigo ausente.
const LLMS_ROUTE_GROUPS = [
  {
    key: 'company',
    paths: ['/', '/quem-somos'],
  },
  {
    key: 'industries',
    paths: [
      '/sistema-para-refrigeracao',
      '/sistema-para-eletricistas',
      '/sistema-para-energia-solar',
      '/sistema-para-provedores',
      '/sistema-para-cftv',
      '/sistema-para-construcao-civil',
      '/sistema-para-elevadores',
      '/sistema-para-limpeza-conservacao',
      '/sistema-para-dedetizacao',
      '/sistema-para-assistencia-tecnica',
    ],
  },
  {
    key: 'product',
    paths: [
      '/os-digital',
      '/sistema-pmoc',
      '/sistema-crm',
      '/controle-financeiro',
      '/ponto-e-folha',
      '/emissao-de-nota-fiscal',
      '/portal-do-cliente',
      '/controle-de-estoque',
      '/orcamentos-e-contratos',
      '/area-do-tecnico',
      '/integracao-whatsapp',
      '/cobrancas-automaticas',
      '/pdv-e-loja',
    ],
  },
  { key: 'resources', paths: ['/blog'] },
  { key: 'legal', paths: ['/privacidade', '/termos'] },
];

const LLMS_COPY = {
  'pt-br': {
    language: 'Português do Brasil',
    summary: 'Software de gestão de serviços de campo, ordens de serviço digitais, manutenção, equipes e operações técnicas.',
    intro: 'O Dominex é uma plataforma web para empresas de serviços técnicos. Centraliza ordens de serviço, agenda e despacho, acompanhamento de equipes, contratos de manutenção, PMOC, CRM, financeiro, estoque e experiência do cliente. O aplicativo do técnico funciona como PWA e permite check-in, fotos, checklists e assinatura digital.',
    sections: { company: 'Sobre a Dominex', industries: 'Soluções por segmento', product: 'Produto e módulos', resources: 'Recursos', articles: 'Artigos do blog', legal: 'Políticas', discovery: 'Descoberta e atualização', ai: 'Orientação para sistemas de IA' },
    updated: 'Atualizado',
    languageLabel: 'Idioma',
    website: 'Site oficial',
    sitemap: 'Sitemap das páginas',
    blogSitemap: 'Sitemap dos artigos',
    sitemapDesc: 'Sitemap XML das páginas públicas de produto, segmentos e institucionais.',
    blogSitemapDesc: 'Sitemap XML de todos os artigos publicados e suas alternativas de idioma.',
    aiNote: 'Use a URL canônica de cada página ao citar a Dominex. Para recursos, preços, disponibilidade e requisitos legais, confirme sempre a informação na página oficial mais específica e atualizada.',
  },
  en: {
    language: 'English',
    summary: 'Field service management software for digital work orders, maintenance, teams and technical operations.',
    intro: 'Dominex is a web platform for technical service businesses. It brings together work orders, scheduling and dispatch, field team tracking, maintenance contracts, CRM, finance, inventory and customer experience. The technician app is a PWA with check-in, photos, checklists and digital signatures.',
    sections: { company: 'About Dominex', industries: 'Industry solutions', product: 'Product and modules', resources: 'Resources', articles: 'Blog articles', legal: 'Policies', discovery: 'Discovery and updates', ai: 'Guidance for AI systems' },
    updated: 'Updated',
    languageLabel: 'Language',
    website: 'Official website',
    sitemap: 'Website sitemap',
    blogSitemap: 'Blog sitemap',
    sitemapDesc: 'XML sitemap for public product, industry and institutional pages.',
    blogSitemapDesc: 'XML sitemap for every published blog article and its language alternatives.',
    aiNote: 'Use each page’s canonical URL when citing Dominex. For features, pricing, availability and legal requirements, verify the information on the most specific and recently updated official page.',
  },
  es: {
    language: 'Español',
    summary: 'Software de gestión de servicios de campo, órdenes de trabajo digitales, mantenimiento, equipos y operaciones técnicas.',
    intro: 'Dominex es una plataforma web para empresas de servicios técnicos. Centraliza órdenes de trabajo, agenda y despacho, seguimiento de equipos, contratos de mantenimiento, CRM, finanzas, inventario y experiencia del cliente. La aplicación del técnico es una PWA con check-in, fotos, listas de verificación y firma digital.',
    sections: { company: 'Sobre Dominex', industries: 'Soluciones por sector', product: 'Producto y módulos', resources: 'Recursos', articles: 'Artículos del blog', legal: 'Políticas', discovery: 'Descubrimiento y actualizaciones', ai: 'Orientación para sistemas de IA' },
    updated: 'Actualizado',
    languageLabel: 'Idioma',
    website: 'Sitio web oficial',
    sitemap: 'Mapa del sitio',
    blogSitemap: 'Mapa de artículos',
    sitemapDesc: 'Mapa XML de las páginas públicas de producto, sectores e institucionales.',
    blogSitemapDesc: 'Mapa XML de todos los artículos publicados y sus alternativas de idioma.',
    aiNote: 'Utiliza la URL canónica de cada página al citar Dominex. Para funciones, precios, disponibilidad y requisitos legales, verifica la información en la página oficial más específica y actualizada.',
  },
  fr: {
    language: 'Français',
    summary: 'Logiciel de gestion des services terrain, bons de travail numériques, maintenance, équipes et opérations techniques.',
    intro: 'Dominex est une plateforme web pour les entreprises de services techniques. Elle centralise les bons de travail, la planification et la répartition, le suivi des équipes, les contrats de maintenance, le CRM, les finances, les stocks et l’expérience client. L’application technicien est une PWA avec check-in, photos, listes de contrôle et signature numérique.',
    sections: { company: 'À propos de Dominex', industries: 'Solutions par secteur', product: 'Produit et modules', resources: 'Ressources', articles: 'Articles du blog', legal: 'Politiques', discovery: 'Découverte et mises à jour', ai: 'Conseils pour les systèmes d’IA' },
    updated: 'Mis à jour',
    languageLabel: 'Langue',
    website: 'Site officiel',
    sitemap: 'Plan du site',
    blogSitemap: 'Plan des articles',
    sitemapDesc: 'Plan XML des pages publiques consacrées au produit, aux secteurs et à l’entreprise.',
    blogSitemapDesc: 'Plan XML de tous les articles publiés et de leurs versions linguistiques.',
    aiNote: 'Utilisez l’URL canonique de chaque page pour citer Dominex. Pour les fonctionnalités, les tarifs, la disponibilité et les exigences légales, vérifiez les informations sur la page officielle la plus précise et la plus récente.',
  },
};

/**
 * URL absoluta localizada de um path base num locale. Prefere a URL EXATA das
 * SSG_TASKS (que já leva o slug traduzido do idioma via slugRegistry); só cai no
 * cálculo pt-br (prefixo simples) se o path base não estiver nas tasks.
 */
function absUrlFor(siteUrl, basePath, locale, urlByBaseLocale) {
  const fromTasks = urlByBaseLocale?.get(basePath)?.get(locale);
  if (fromTasks) return fromTasks;
  const base = basePath === '/' ? '' : basePath;
  if (locale === 'pt-br') return `${siteUrl}${base || '/'}`;
  return base ? `${siteUrl}/${locale}${base}` : `${siteUrl}/${locale}/`;
}

/**
 * Gera o conteúdo de um llms.txt para um locale (URLs prefixadas do idioma).
 * Quando `descriptionsByBaseLocale` for fornecido, usa a metaDescription do
 * locale gerada pelo SSG (conteúdo real do módulo/segmento traduzido) em vez
 * do texto pt-br fixo do LLMS_SECTIONS. Fallback: texto pt-br do LLMS_SECTIONS.
 */
function oneLine(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPageTitle(value) {
  return oneLine(value).replace(/\s+(?:—|\|)\s+Dominex.*$/i, '').trim() || 'Dominex';
}

function blogPostUrl(siteUrl, post) {
  const locale = post.locale || 'pt-br';
  return locale === 'pt-br'
    ? `${siteUrl}/blog/${post.slug}`
    : `${siteUrl}/${locale}/blog/${post.slug}`;
}

function buildLlmsTxt(
  siteUrl,
  locale,
  urlByBaseLocale,
  titlesByBaseLocale,
  descriptionsByBaseLocale,
  posts,
) {
  const copy = LLMS_COPY[locale] || LLMS_COPY['pt-br'];
  const date = today();
  const lines = [
    '# Dominex',
    '',
    `> ${copy.summary}`,
    '',
    copy.intro,
    '',
    `- ${copy.website}: ${absUrlFor(siteUrl, '/', locale, urlByBaseLocale)}`,
    `- ${copy.languageLabel}: ${copy.language}`,
    `- ${copy.updated}: ${date}`,
    '',
  ];

  for (const group of LLMS_ROUTE_GROUPS) {
    lines.push(`## ${copy.sections[group.key]}`, '');
    for (const basePath of group.paths) {
      const url = absUrlFor(siteUrl, basePath, locale, urlByBaseLocale);
      const rawTitle =
        titlesByBaseLocale?.get(basePath)?.get(locale) ??
        titlesByBaseLocale?.get(basePath)?.get('pt-br') ??
        'Dominex';
      const description =
        descriptionsByBaseLocale?.get(basePath)?.get(locale) ??
        descriptionsByBaseLocale?.get(basePath)?.get('pt-br') ??
        '';
      lines.push(`- [${cleanPageTitle(rawTitle)}](${url}): ${oneLine(description)}`);
    }
    lines.push('');

    if (group.key === 'resources') {
      const localizedPosts = (Array.isArray(posts) ? posts : [])
        .filter((post) => (post.locale || 'pt-br') === locale && post.slug && post.title)
        .sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
      if (localizedPosts.length > 0) {
        lines.push(`## ${copy.sections.articles}`, '');
        for (const post of localizedPosts) {
          const description = oneLine(post.meta_description || post.excerpt || '');
          lines.push(
            `- [${oneLine(post.title)}](${blogPostUrl(siteUrl, post)})${description ? `: ${description}` : ''}`,
          );
        }
        lines.push('');
      }
    }
  }

  lines.push(
    `## ${copy.sections.discovery}`,
    '',
    `- [${copy.sitemap}](${siteUrl}/sitemap.xml): ${copy.sitemapDesc}`,
    `- [${copy.blogSitemap}](${siteUrl}/blog-sitemap.xml): ${copy.blogSitemapDesc}`,
    '',
    `## ${copy.sections.ai}`,
    '',
    copy.aiNote,
    '',
  );

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// hreflang code por locale (pt-BR, en, es, fr).
const HREFLANG = { 'pt-br': 'pt-BR', en: 'en', es: 'es', fr: 'fr' };

/**
 * Gera dist/sitemap.xml (páginas de marketing/institucional + LISTAGEM /blog ×
 * idioma, cada uma com alternates hreflang) e os llms.txt por idioma.
 * `tasks` = SSG_TASKS; `siteUrl` = SITE_URL do entry-ssg.
 *
 * Os POSTS individuais do blog NÃO entram aqui: eles são servidos pelo sitemap
 * DINÂMICO (api/blog-sitemap.js → /blog-sitemap.xml), que é a fonte única e
 * sempre fresca (pega post publicado pós-build, no idioma certo, com hreflang).
 * Colocá-los também no estático duplicaria URLs e ficaria defasado.
 *
 * `titlesByBaseLocale`/`descriptionsByBaseLocale` vêm do head realmente
 * renderizado. `posts` é a mesma lista publicada usada no prerender do blog.
 * Com isso cada llms.txt contém apenas URLs, títulos e artigos existentes no
 * próprio idioma.
 */
export function generateArtifacts({
  tasks,
  siteUrl,
  distDir,
  titlesByBaseLocale,
  descriptionsByBaseLocale,
  posts = [],
}) {
  const lastmod = today();

  // Agrupa as tasks por path base pra montar os <alternate> recíprocos.
  const byBase = new Map();
  for (const t of tasks) {
    if (!byBase.has(t.basePath)) byBase.set(t.basePath, []);
    byBase.get(t.basePath).push(t);
  }

  // Índice basePath → (locale → url) das tasks — fonte da URL localizada COM slug
  // traduzido, reusada pelo llms.txt (mesma verdade das páginas geradas).
  const urlByBaseLocale = new Map();
  for (const t of tasks) {
    if (!urlByBaseLocale.has(t.basePath)) urlByBaseLocale.set(t.basePath, new Map());
    urlByBaseLocale.get(t.basePath).set(t.locale, t.url);
  }

  // ── sitemap.xml ─────────────────────────────────────────────────────────────
  const urlBlocks = [];
  for (const [basePath, group] of byBase) {
    // Alternates: as 4 versões da MESMA página + x-default (pt-br). Idênticos em
    // TODAS as versões (recíproco), como o Google exige.
    const ptBrTask = group.find((g) => g.locale === 'pt-br');
    const alternates = group
      .map(
        (g) =>
          `    <xhtml:link rel="alternate" hreflang="${HREFLANG[g.locale]}" href="${xmlEsc(g.url)}" />`
      )
      .concat(
        ptBrTask
          ? [
              `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEsc(ptBrTask.url)}" />`,
            ]
          : []
      )
      .join('\n');

    const priority = priorityFor(basePath);
    for (const g of group) {
      urlBlocks.push(
        `  <url>\n` +
          `    <loc>${xmlEsc(g.url)}</loc>\n` +
          `    <lastmod>${lastmod}</lastmod>\n` +
          `    <priority>${priority}</priority>\n` +
          `${alternates}\n` +
          `  </url>`
      );
    }
  }

  // NOTA: os posts individuais do blog NÃO entram no sitemap estático — ficam no
  // sitemap DINÂMICO (api/blog-sitemap.js → /blog-sitemap.xml), fonte única sempre
  // fresca. Aqui só entra a LISTAGEM /blog (por idioma), já incluída em `tasks`.

  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    urlBlocks.join('\n') +
    `\n</urlset>\n`;

  const sitemapPath = join(distDir, 'sitemap.xml');
  writeFileSync(sitemapPath, sitemap, 'utf8');
  console.log(`[ssg] ✓ sitemap.xml → ${urlBlocks.length} URLs (com alternates hreflang).`);

  // ── llms.txt por idioma ─────────────────────────────────────────────────────
  const locales = ['pt-br', 'en', 'es', 'fr'];
  for (const locale of locales) {
    const content = buildLlmsTxt(
      siteUrl,
      locale,
      urlByBaseLocale,
      titlesByBaseLocale,
      descriptionsByBaseLocale,
      posts,
    );
    const outPath = locale === 'pt-br' ? join(distDir, 'llms.txt') : join(distDir, locale, 'llms.txt');
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, content, 'utf8');
    console.log(`[ssg] ✓ ${outPath.replace(distDir, 'dist')} (llms.txt ${locale})`);
  }
}

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

// ── Índice GEO (llms.txt): título + descrição de 1 linha por path base ──────────
// Textos em pt-br (o conteúdo das páginas de idioma ainda é pt-br nesta fase; a
// URL é a única coisa que muda por idioma). Sem travessão.
const LLMS_SECTIONS = [
  {
    title: 'Páginas principais',
    entries: [
      ['/', 'Home', 'visão geral do Dominex, planos, recursos e perguntas frequentes.'],
      ['/sistema-para-refrigeracao', 'Sistema para Refrigeração', 'gestão de OS e PMOC para empresas de refrigeração e climatização.'],
      ['/sistema-para-eletricistas', 'Sistema para Eletricistas', 'ordens de serviço e equipes de campo para instalações elétricas.'],
      ['/sistema-para-energia-solar', 'Sistema para Energia Solar', 'gestão de instalações e manutenção de energia solar.'],
      ['/sistema-para-provedores', 'Sistema para Provedores', 'OS e campo para provedores de internet e telecomunicações.'],
      ['/sistema-para-cftv', 'Sistema para CFTV', 'gestão de instalações de CFTV e segurança eletrônica.'],
      ['/sistema-para-construcao-civil', 'Sistema para Construção Civil', 'controle de equipes e serviços na construção civil.'],
      ['/sistema-para-elevadores', 'Sistema para Elevadores', 'manutenção e contratos recorrentes para empresas de elevadores.'],
      ['/sistema-para-limpeza-conservacao', 'Sistema para Limpeza e Conservação', 'gestão de equipes de limpeza e conservação predial.'],
      ['/sistema-para-dedetizacao', 'Sistema para Dedetização', 'ordens de serviço e contratos para empresas de dedetização.'],
    ],
  },
  {
    title: 'Módulos',
    entries: [
      ['/os-digital', 'Ordem de Serviço Digital', 'ordens de serviço digitais com fotos, checklist e assinatura, no celular do técnico.'],
      ['/sistema-pmoc', 'PMOC', 'geração automática de plano de manutenção por equipamento e calendário PMOC conforme a Lei 13.589/2018.'],
      ['/sistema-crm', 'CRM e Vendas', 'funil de vendas em kanban, do lead ao contrato, com conversão direta em ordem de serviço.'],
      ['/controle-financeiro', 'Financeiro', 'controle de contas a pagar e a receber, fluxo de caixa e DRE para empresas de serviço.'],
      ['/ponto-e-folha', 'Ponto e Folha', 'ponto eletrônico com selfie e geolocalização, banco de horas e folha de pagamento para equipes de campo.'],
      ['/emissao-de-nfse', 'NFS-e', 'emissão de nota fiscal de serviço por cliente, com conformidade municipal, sem sistema à parte.'],
      ['/portal-do-cliente', 'Portal do Cliente', 'área onde o cliente acompanha a ordem de serviço, vê o histórico e aprova o orçamento por link.'],
      ['/controle-de-estoque', 'Estoque', 'controle de peças e materiais com baixa automática por ordem de serviço e inventário.'],
      ['/orcamentos-e-contratos', 'Orçamentos e Contratos', 'orçamentos profissionais por link, contratos recorrentes que geram as ordens de serviço sozinhos.'],
      ['/rastreamento-de-equipes', 'Rastreamento e Agenda', 'localização da equipe em tempo real no mapa, agenda do dia e check-in validado pelo endereço do cliente.'],
      ['/area-do-tecnico', 'Área do Técnico', 'app instalável no celular com OS, ferramentas de cálculo técnico e catálogo de equipamentos para o técnico em campo.'],
    ],
  },
  {
    title: 'Blog e conteúdo',
    entries: [
      ['/blog', 'Blog', 'artigos práticos sobre ordem de serviço, PMOC, gestão de equipe e como tirar a operação de campo do papel.'],
    ],
  },
  {
    title: 'Institucional',
    entries: [
      ['/quem-somos', 'Quem somos', 'história e propósito da Dominex, gestão para empresas de serviço e equipes de campo.'],
      ['/privacidade', 'Política de Privacidade', 'como a Dominex trata os dados pessoais, conforme a LGPD.'],
      ['/termos', 'Termos de Uso', 'condições de cadastro, uso do serviço e responsabilidades na plataforma Dominex.'],
    ],
  },
];

/** Cabeçalho do llms.txt (mesmo texto do índice pt-br atual). Sem travessão. */
const LLMS_HEADER = `# Dominex

> Sistema de ordem de serviço, PMOC e gestão para empresas de refrigeração, climatização e equipes de campo.

O Dominex é um software web para empresas que prestam serviços técnicos em campo. Centraliza ordens de serviço digitais, agenda da equipe, rastreamento dos técnicos, contratos de manutenção e o calendário PMOC. O técnico atende pelo app (PWA) com check-in, fotos, checklist e assinatura digital. Atende refrigeração e climatização, elétrica, energia solar, provedores, CFTV, construção civil, elevadores, limpeza e dedetização. Teste grátis por 14 dias, sem cartão de crédito.`;

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
  return `${siteUrl}/${locale}${base}`;
}

/**
 * Gera o conteúdo de um llms.txt para um locale (URLs prefixadas do idioma).
 * Quando `descriptionsByBaseLocale` for fornecido, usa a metaDescription do
 * locale gerada pelo SSG (conteúdo real do módulo/segmento traduzido) em vez
 * do texto pt-br fixo do LLMS_SECTIONS. Fallback: texto pt-br do LLMS_SECTIONS.
 */
function buildLlmsTxt(siteUrl, locale, urlByBaseLocale, descriptionsByBaseLocale) {
  const lines = [LLMS_HEADER, ''];
  for (const section of LLMS_SECTIONS) {
    lines.push(`## ${section.title}`, '');
    for (const [basePath, title, desc] of section.entries) {
      const url = absUrlFor(siteUrl, basePath, locale, urlByBaseLocale);
      // Prefere a metaDescription do locale gerada pelo SSG; fallback ao pt-br fixo.
      const localeDesc =
        descriptionsByBaseLocale?.get(basePath)?.get(locale) ??
        descriptionsByBaseLocale?.get(basePath)?.get('pt-br') ??
        desc;
      lines.push(`- [${title}](${url}): ${localeDesc}`);
    }
    lines.push('');
  }
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
 * `descriptionsByBaseLocale` = Map basePath → (locale → description) gerado
 * pelo ssg.mjs durante a renderização das páginas; permite que o llms.txt emita
 * a descrição do módulo/segmento no idioma certo em vez de pt-br fixo.
 */
export function generateArtifacts({ tasks, siteUrl, distDir, descriptionsByBaseLocale }) {
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
    const content = buildLlmsTxt(siteUrl, locale, urlByBaseLocale, descriptionsByBaseLocale);
    const outPath = locale === 'pt-br' ? join(distDir, 'llms.txt') : join(distDir, locale, 'llms.txt');
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, content, 'utf8');
    console.log(`[ssg] ✓ ${outPath.replace(distDir, 'dist')} (llms.txt ${locale})`);
  }
}

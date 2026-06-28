// ─────────────────────────────────────────────────────────────────────────────
// RENDER SOB DEMANDA dos posts de blog — Vercel Serverless Function.
//
// PROBLEMA que resolve: antes, cada post `/blog/:slug` virava HTML estático no
// PRERENDER (build). Um post novo/editado só ficava crawlável no PRÓXIMO deploy.
// Aqui ele é renderizado A CADA request, então publicar/editar reflete na hora.
//
// COMO FUNCIONA (passo a passo):
//   1. Lê o `slug` da query (?slug=...), injetado pelo rewrite do vercel.json.
//   2. Busca o post PUBLICADO no Supabase via REST (anon key — só leitura).
//   3. Busca o "shell" HTML do deploy atual (/shell.html) — cópia limpa do
//      index.html buildado, com os hashes de <script> corretos do deploy.
//   4. Se o post existe: injeta no <head> os metas de SEO (title/description/
//      canonical/OG/Twitter) + JSON-LD Article, e injeta o CONTEÚDO do post
//      dentro do <div id="root">, pra crawlers sem JS verem o artigo. A SPA
//      monta por cima pra humanos (mesmo conteúdo).
//   5. Se o post NÃO existe (ou deu erro): devolve o shell puro — a SPA mostra
//      o 404 amigável de /blog/:slug. Nunca quebra.
//
// PRECEDÊNCIA na Vercel: arquivo estático ganha de rewrite. Por isso o prerender
// NÃO gera mais dist/blog/<slug>/index.html (senão sombrearia esta função). A
// lista /blog continua sendo estática (prerenderizada) e não cai aqui.
//
// SEGURANÇA: usa só a anon/publishable key (process.env.VITE_SUPABASE_*), em
// leitura, filtrando status=eq.published. Nenhum dado sensível.
// ─────────────────────────────────────────────────────────────────────────────

const SITE_URL = 'https://www.dominex.app';
const DEFAULT_OG_IMAGE = `${SITE_URL}/images/og-social.jpg`;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

/** Escapa texto para uso seguro em ATRIBUTO HTML (content="..."). */
function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escapa para texto dentro de <title>...</title> (não escapa aspas). */
function escapeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * JSON-LD precisa ir entre <script>...</script>. A única sequência perigosa é
 * "</" que poderia fechar a tag cedo; escapamos para "<\/" (válido em JSON e
 * inofensivo para o parser de JSON-LD).
 */
function jsonLdSafe(obj) {
  return JSON.stringify(obj).replace(/<\/(script)/gi, '<\\/$1');
}

/** Headers de leitura REST (anon key). */
function restHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept: 'application/json',
  };
}

/** Busca o post publicado no Supabase (REST). Devolve o objeto ou null. */
async function fetchPost(slug) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const url =
    `${SUPABASE_URL}/rest/v1/blog_posts` +
    `?slug=eq.${encodeURIComponent(slug)}` +
    `&status=eq.published` +
    `&select=*&limit=1`;
  try {
    const res = await fetch(url, { headers: restHeaders() });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

/**
 * Busca posts RELACIONADOS pro "Leia também": mesma categoria primeiro, completa
 * com recentes, exclui o próprio slug, limita a 3. Espelha a regra do
 * RelatedPosts.tsx. Em falha, devolve [] (a seção simplesmente não aparece).
 */
async function fetchRelated(slug, category) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const select = 'id,title,slug,excerpt,category,cover_image_url,published_at,author_name';
  const seen = new Set([slug]);
  const out = [];

  const pushRows = (rows) => {
    for (const r of Array.isArray(rows) ? rows : []) {
      if (seen.has(r.slug)) continue;
      seen.add(r.slug);
      out.push(r);
      if (out.length >= 3) break;
    }
  };

  try {
    if (category) {
      const catUrl =
        `${SUPABASE_URL}/rest/v1/blog_posts` +
        `?status=eq.published` +
        `&category=eq.${encodeURIComponent(category)}` +
        `&slug=neq.${encodeURIComponent(slug)}` +
        `&select=${select}&order=published_at.desc&limit=3`;
      const catRes = await fetch(catUrl, { headers: restHeaders() });
      if (catRes.ok) pushRows(await catRes.json());
    }
    if (out.length < 3) {
      const recentUrl =
        `${SUPABASE_URL}/rest/v1/blog_posts` +
        `?status=eq.published` +
        `&slug=neq.${encodeURIComponent(slug)}` +
        `&select=${select}&order=published_at.desc&limit=6`;
      const recentRes = await fetch(recentUrl, { headers: restHeaders() });
      if (recentRes.ok) pushRows(await recentRes.json());
    }
  } catch {
    return out;
  }
  return out.slice(0, 3);
}

/**
 * Pega o shell HTML do deploy atual. Faz fetch de /shell.html (cópia limpa do
 * index.html buildado, com os hashes de script corretos). NÃO usamos `/` nem
 * `/index.html` pra evitar recursão com o catch-all/rewrites.
 */
async function fetchShell(host) {
  const proto = host && host.startsWith('localhost') ? 'http' : 'https';
  const res = await fetch(`${proto}://${host}/shell.html`);
  if (!res.ok) throw new Error(`shell.html indisponível (HTTP ${res.status})`);
  return res.text();
}

/**
 * Monta o bloco de <head> de SEO do post. Remove do shell os metas que vamos
 * sobrescrever (title, description, canonical, og:*, twitter:*) pra não duplicar,
 * depois insere os novos antes de </head>.
 */
function injectHeadSeo(shell, post) {
  const title = post.meta_title || post.title || 'Blog Dominex';
  const description = post.meta_description || post.excerpt || '';
  const url = `${SITE_URL}/blog/${post.slug}`;
  const image = post.cover_image_url || DEFAULT_OG_IMAGE;
  const fullTitle = `${title} — Blog Dominex`;

  let head = shell;

  // Remove o <title> existente.
  head = head.replace(/<title>[\s\S]*?<\/title>/i, '');
  // Remove <meta name="description"> existente.
  head = head.replace(/<meta\s+name=["']description["'][^>]*>/gi, '');
  // Remove <link rel="canonical"> existente.
  head = head.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');
  // Remove og:* e twitter:* existentes (title/description/url/image/type).
  head = head.replace(
    /<meta\s+property=["']og:(title|description|url|image|type)["'][^>]*>/gi,
    ''
  );
  head = head.replace(
    /<meta\s+name=["']twitter:(title|description|image|card)["'][^>]*>/gi,
    ''
  );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    image,
    datePublished: post.published_at || post.created_at,
    dateModified: post.updated_at || post.published_at || post.created_at,
    author: {
      '@type': 'Organization',
      name: post.author_name || 'Dominex',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Dominex',
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo-horizontal-verde.png`,
      },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };

  const seoBlock = `
    <title>${escapeText(fullTitle)}</title>
    <meta name="description" content="${escapeAttr(description)}" />
    <link rel="canonical" href="${escapeAttr(url)}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeAttr(fullTitle)}" />
    <meta property="og:description" content="${escapeAttr(description)}" />
    <meta property="og:url" content="${escapeAttr(url)}" />
    <meta property="og:image" content="${escapeAttr(image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttr(fullTitle)}" />
    <meta name="twitter:description" content="${escapeAttr(description)}" />
    <meta name="twitter:image" content="${escapeAttr(image)}" />
    <script type="application/ld+json">${jsonLdSafe(jsonLd)}</script>
  </head>`;

  // Insere antes do primeiro </head>.
  return head.replace(/<\/head>/i, seoBlock);
}

/**
 * Monta o HTML da seção "Leia também" (relacionados) pra ir DENTRO do #root no
 * SSR. Cada card é um <a href="/blog/<slug>"> = link interno crawlável sem JS.
 * Devolve '' quando não há relacionados.
 */
function renderRelatedHtml(related) {
  if (!Array.isArray(related) || related.length === 0) return '';
  const cards = related
    .map((p) => {
      const cover = p.cover_image_url
        ? `<img src="${escapeAttr(p.cover_image_url)}" alt="${escapeAttr(p.title || '')}" loading="lazy" />`
        : '';
      const cat = p.category ? `<span>${escapeText(p.category)}</span>` : '';
      const excerpt = p.excerpt ? `<p>${escapeText(p.excerpt)}</p>` : '';
      const author = p.author_name ? `<small>${escapeText(p.author_name)}</small>` : '';
      return `<a href="/blog/${escapeAttr(p.slug)}">
          ${cover}
          ${cat}
          <h3>${escapeText(p.title || '')}</h3>
          ${excerpt}
          ${author}
        </a>`;
    })
    .join('\n        ');
  return `<section>
        <h2>Leia também</h2>
        ${cards}
      </section>`;
}

/**
 * Injeta o CONTEÚDO do post dentro do <div id="root"></div> pra crawlers sem JS.
 * O `content` é HTML confiável (vem do nosso editor admin). Mantém os scripts do
 * SPA intactos — o React re-renderiza por cima pra humanos. Inclui o "Leia
 * também" (relacionados) como links internos crawláveis.
 */
function injectBody(shell, post, related) {
  const coverImg = post.cover_image_url
    ? `<img src="${escapeAttr(post.cover_image_url)}" alt="${escapeAttr(
        post.title
      )}" />`
    : '';
  const meta = [];
  if (post.category) meta.push(escapeText(post.category));
  if (post.author_name) meta.push(escapeText(post.author_name));
  if (post.published_at) meta.push(escapeText(String(post.published_at).slice(0, 10)));

  const relatedHtml = renderRelatedHtml(related);

  // <article> com o conteúdo + "Leia também". O React substitui o innerHTML do
  // #root no mount; os crawlers sem JS leem este markup (incluindo os links
  // internos dos relacionados).
  const articleHtml = `<article>
      ${coverImg}
      ${post.category ? `<span>${escapeText(post.category)}</span>` : ''}
      <h1>${escapeText(post.title || '')}</h1>
      ${meta.length ? `<p>${meta.join(' · ')}</p>` : ''}
      <div>${post.content || ''}</div>
      ${relatedHtml}
    </article>`;

  // Substitui o root vazio pelo root com o artigo. Cobre tanto o caso vazio
  // (<div id="root"></div>) quanto eventual conteúdo já presente.
  if (/<div id="root">\s*<\/div>/i.test(shell)) {
    return shell.replace(
      /<div id="root">\s*<\/div>/i,
      `<div id="root">${articleHtml}</div>`
    );
  }
  return shell.replace(
    /(<div id="root">)([\s\S]*?)(<\/div>\s*<script)/i,
    `$1${articleHtml}$3`
  );
}

export default async function handler(req, res) {
  const slug = (req.query && req.query.slug) || '';
  const host = req.headers.host;

  // CACHE: priorizamos FRESCOR ("na hora") com proteção da CDN.
  //   s-maxage=10        → a CDN guarda a resposta por só 10s; edição reflete
  //                        em ~10s no crawler (bem mais rápido que rebuild).
  //   stale-while-revalidate=59 → durante a revalidação serve a versão velha,
  //                        sem latência pro visitante.
  // Se o CEO quiser 100% instantâneo (custo: 1 execução de função por request),
  // baixar s-maxage pra 0.
  res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=59');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  let shell;
  try {
    shell = await fetchShell(host);
  } catch (err) {
    // Sem shell não há o que servir; deixa a Vercel cair no fallback do SPA.
    res.status(500).send(`<!doctype html><html><head><title>Erro</title></head><body>Falha ao carregar a página.</body></html>`);
    return;
  }

  let post = null;
  if (slug) post = await fetchPost(slug);

  if (!post) {
    // Post inexistente/erro → shell puro; a SPA mostra o 404 amigável de /blog/:slug.
    // Status 200 pra não travar a hidratação do SPA (o 404 é "soft", em JS).
    res.status(200).send(shell);
    return;
  }

  // Relacionados pro "Leia também" (links internos crawláveis sem JS).
  const related = await fetchRelated(post.slug, post.category);

  let html = injectHeadSeo(shell, post);
  html = injectBody(html, post, related);
  res.status(200).send(html);
}

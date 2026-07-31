// ─────────────────────────────────────────────────────────────────────────────
// LÓGICA COMPARTILHADA DO RENDER DE BLOG — Cloudflare Pages Functions.
//
// Este módulo é o PORTE da lógica de negócio de `api/blog-post.js` (Vercel
// Serverless) para o runtime do Cloudflare (Workers). A LÓGICA de SEO/JSON-LD/
// hreflang/i18n/relacionados é IDÊNTICA à versão Vercel — só a casca de I/O muda:
//
//   Vercel (Node)                         →  Cloudflare (Workers)
//   ─────────────────────────────────────────────────────────────────────────
//   process.env.VITE_SUPABASE_*           →  env.VITE_SUPABASE_*   (secrets vêm
//                                            do `context.env`, não de process.env)
//   req.query.slug / req.query.locale     →  new URL(request.url).searchParams
//                                            OU context.params (rotas dinâmicas)
//   fetch(`${proto}://${host}/shell.html`)→  env.ASSETS.fetch(new URL('/shell.html', ...))
//   res.status(x).setHeader().send(body)  →  new Response(body, { status, headers })
//
// Consumido por:
//   functions/blog/[slug].js          (/blog/:slug        → pt-br)
//   functions/[lang]/blog/[slug].js   (/en|es|fr/blog/:slug)
//   functions/api/blog-post.js        (paridade/debug via ?slug=&locale=)
//
// SEGURANÇA: usa só a anon/publishable key (env.VITE_SUPABASE_*), em leitura,
// filtrando status=eq.published. Nenhum dado sensível. (Igual à Vercel.)
// ─────────────────────────────────────────────────────────────────────────────

const SITE_URL = 'https://www.dominex.app';
const DEFAULT_OG_IMAGE = `${SITE_URL}/images/og-social.jpg`;

// Locales suportados + hreflang code. pt-br é o default (URL sem prefixo).
const HREFLANG = { 'pt-br': 'pt-BR', en: 'en', es: 'es', fr: 'fr' };
const VALID_LOCALES = Object.keys(HREFLANG);

/** URL absoluta localizada de um post (pt-br sem prefixo, outros com /xx/). */
function postUrl(locale, slug) {
  return locale === 'pt-br'
    ? `${SITE_URL}/blog/${slug}`
    : `${SITE_URL}/${locale}/blog/${slug}`;
}

// MUDOU vs Vercel: as credenciais deixaram de ser lidas em module-scope de
// process.env — no Workers elas vêm do `env` em REQUEST time. Resolvemos por
// função a partir do `env` passado pelo caller.
function resolveSupabase(env) {
  const SUPABASE_URL = env.VITE_SUPABASE_URL;
  const SUPABASE_ANON_KEY =
    env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  return { SUPABASE_URL, SUPABASE_ANON_KEY };
}

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
function restHeaders(SUPABASE_ANON_KEY) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept: 'application/json',
  };
}

/**
 * Busca o post publicado no Supabase (REST) por (slug + locale). Um post só
 * resolve no idioma da URL; se não existir nesse locale, devolve null (a SPA
 * mostra o 404 — NUNCA cai no pt-br). Devolve o objeto ou null.
 */
async function fetchPost(sb, slug, locale) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = sb;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const url =
    `${SUPABASE_URL}/rest/v1/blog_posts` +
    `?slug=eq.${encodeURIComponent(slug)}` +
    `&locale=eq.${encodeURIComponent(locale)}` +
    `&status=eq.published` +
    `&select=*&limit=1`;
  try {
    const res = await fetch(url, { headers: restHeaders(SUPABASE_ANON_KEY) });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

/**
 * Busca as versões PUBLICADAS do mesmo artigo (mesmo translation_group) pra montar
 * o hreflang recíproco. Cada versão tem seu locale + slug próprios. Em falha,
 * devolve só a versão atual.
 */
async function fetchAlternates(sb, translationGroup, current) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = sb;
  const fallback = [{ locale: current.locale, slug: current.slug }];
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !translationGroup) return fallback;
  const url =
    `${SUPABASE_URL}/rest/v1/blog_posts` +
    `?translation_group=eq.${encodeURIComponent(translationGroup)}` +
    `&status=eq.published` +
    `&select=locale,slug`;
  try {
    const res = await fetch(url, { headers: restHeaders(SUPABASE_ANON_KEY) });
    if (!res.ok) return fallback;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0 ? rows : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Busca posts RELACIONADOS pro "Leia também": mesma categoria primeiro, completa
 * com recentes, exclui o próprio slug, limita a 3. Espelha a regra do
 * RelatedPosts.tsx. Em falha, devolve [] (a seção simplesmente não aparece).
 */
async function fetchRelated(sb, slug, category, locale) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = sb;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const select = 'id,title,slug,excerpt,category,cover_image_url,published_at,author_name';
  const seen = new Set([slug]);
  const out = [];
  const localeFilter = `&locale=eq.${encodeURIComponent(locale)}`;

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
        localeFilter +
        `&category=eq.${encodeURIComponent(category)}` +
        `&slug=neq.${encodeURIComponent(slug)}` +
        `&select=${select}&order=published_at.desc&limit=3`;
      const catRes = await fetch(catUrl, { headers: restHeaders(SUPABASE_ANON_KEY) });
      if (catRes.ok) pushRows(await catRes.json());
    }
    if (out.length < 3) {
      const recentUrl =
        `${SUPABASE_URL}/rest/v1/blog_posts` +
        `?status=eq.published` +
        localeFilter +
        `&slug=neq.${encodeURIComponent(slug)}` +
        `&select=${select}&order=published_at.desc&limit=6`;
      const recentRes = await fetch(recentUrl, { headers: restHeaders(SUPABASE_ANON_KEY) });
      if (recentRes.ok) pushRows(await recentRes.json());
    }
  } catch {
    return out;
  }
  return out.slice(0, 3);
}

/**
 * Pega o shell HTML do deploy atual (cópia limpa do index.html buildado, com os
 * hashes de script corretos). NÃO usamos `/` nem `/index.html` pra evitar
 * recursão com o catch-all/rewrites.
 *
 * MUDOU vs Vercel: a Vercel montava a URL com host+proto do header (`req.headers.
 * host`). No Cloudflare preferimos o binding de assets do Pages, `env.ASSETS.
 * fetch(...)`, que serve o arquivo estático do deploy SEM sair pra internet nem
 * reprocessar `_redirects` — o que evita qualquer recursão. Se o binding não
 * estiver disponível (ex.: `wrangler pages dev` sem ASSETS), fazemos fallback
 * pro fetch absoluto via `request.url` (mesma semântica da Vercel).
 */
async function fetchShell(env, request) {
  const shellUrl = new URL('/shell.html', request.url);
  // Preferir o binding de assets do Pages (não passa por _redirects → sem recursão).
  if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
    const res = await env.ASSETS.fetch(shellUrl);
    if (!res.ok) throw new Error(`shell.html indisponível (ASSETS HTTP ${res.status})`);
    return res.text();
  }
  // Fallback: fetch absoluto (equivalente ao que a Vercel fazia).
  const res = await fetch(shellUrl.toString());
  if (!res.ok) throw new Error(`shell.html indisponível (HTTP ${res.status})`);
  return res.text();
}

/**
 * Monta o bloco de <head> de SEO do post. Remove do shell os metas que vamos
 * sobrescrever (title, description, canonical, og:*, twitter:*) pra não duplicar,
 * depois insere os novos antes de </head>. (Lógica IDÊNTICA à Vercel.)
 */
function injectHeadSeo(shell, post, locale, alternates) {
  const title = post.meta_title || post.title || 'Blog Dominex';
  const description = post.meta_description || post.excerpt || '';
  const url = postUrl(locale, post.slug);
  const image = post.cover_image_url || DEFAULT_OG_IMAGE;
  const fullTitle = `${title} — Blog Dominex`;
  const langCode = HREFLANG[locale] || 'pt-BR';

  let head = shell;

  // <html lang="..."> do idioma da página (o shell é pt-BR).
  head = head.replace(/<html([^>]*)\slang=["'][^"']*["']/i, `<html$1 lang="${langCode}"`);
  if (!/<html[^>]*\slang=/i.test(head)) {
    head = head.replace(/<html/i, `<html lang="${langCode}"`);
  }

  // Remove o <title> existente.
  head = head.replace(/<title>[\s\S]*?<\/title>/i, '');
  // Remove <meta name="description"> existente.
  head = head.replace(/<meta\s+name=["']description["'][^>]*>/gi, '');
  // Remove <link rel="canonical"> existente.
  head = head.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');
  // Remove hreflang do shell (a home vazaria) pra reinjetar os do post.
  head = head.replace(/<link\s+rel=["']alternate["']\s+hreflang=["'][^"']*["'][^>]*>/gi, '');
  // Remove og:* e twitter:* existentes (title/description/url/image/type).
  head = head.replace(
    /<meta\s+property=["']og:(title|description|url|image|type)["'][^>]*>/gi,
    ''
  );
  head = head.replace(
    /<meta\s+name=["']twitter:(title|description|image|card)["'][^>]*>/gi,
    ''
  );

  // hreflang recíproco por translation_group: um <link> por versão PUBLICADA
  // existente (cada uma com seu slug/locale) + x-default = versão pt-br (se existir;
  // senão a própria canônica). NUNCA emite alternate pra idioma sem tradução.
  const versions =
    Array.isArray(alternates) && alternates.length > 0
      ? alternates
      : [{ locale, slug: post.slug }];
  const hreflangLinks = versions
    .filter((v) => VALID_LOCALES.includes(v.locale))
    .map(
      (v) =>
        `    <link rel="alternate" hreflang="${HREFLANG[v.locale]}" href="${escapeAttr(
          postUrl(v.locale, v.slug)
        )}" />`
    );
  const ptBr = versions.find((v) => v.locale === 'pt-br');
  hreflangLinks.push(
    `    <link rel="alternate" hreflang="x-default" href="${escapeAttr(
      ptBr ? postUrl('pt-br', ptBr.slug) : url
    )}" />`
  );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    image,
    inLanguage: langCode,
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
${hreflangLinks.join('\n')}
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
 * Devolve '' quando não há relacionados. (Lógica IDÊNTICA à Vercel.)
 */
function renderRelatedHtml(related, locale) {
  if (!Array.isArray(related) || related.length === 0) return '';
  const prefix = locale === 'pt-br' ? '/blog' : `/${locale}/blog`;
  const cards = related
    .map((p) => {
      const cover = p.cover_image_url
        ? `<img src="${escapeAttr(p.cover_image_url)}" alt="${escapeAttr(p.title || '')}" loading="lazy" />`
        : '';
      const cat = p.category ? `<span>${escapeText(p.category)}</span>` : '';
      const excerpt = p.excerpt ? `<p>${escapeText(p.excerpt)}</p>` : '';
      const author = p.author_name ? `<small>${escapeText(p.author_name)}</small>` : '';
      return `<a href="${prefix}/${escapeAttr(p.slug)}">
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
 * também" (relacionados) como links internos crawláveis. (Lógica IDÊNTICA à Vercel.)
 */
function injectBody(shell, post, related, locale) {
  const coverImg = post.cover_image_url
    ? `<img src="${escapeAttr(post.cover_image_url)}" alt="${escapeAttr(
        post.title
      )}" />`
    : '';
  const meta = [];
  if (post.category) meta.push(escapeText(post.category));
  if (post.author_name) meta.push(escapeText(post.author_name));
  if (post.published_at) meta.push(escapeText(String(post.published_at).slice(0, 10)));

  const relatedHtml = renderRelatedHtml(related, locale);

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

/**
 * ORQUESTRADOR — porta do corpo do `handler` da Vercel para o Workers.
 * Recebe { env, request, slug, rawLocale } e devolve um `Response` pronto.
 *
 * MUDOU vs Vercel: onde a Vercel fazia `res.status().setHeader().send()`, aqui
 * construímos e RETORNAMOS um `Response(body, { status, headers })`. Os mesmos
 * Cache-Control/Content-Type e os mesmos códigos de status são preservados.
 */
export async function renderBlogPost({ env, request, slug, rawLocale }) {
  const sb = resolveSupabase(env);
  const locale = VALID_LOCALES.includes(rawLocale) ? rawLocale : 'pt-br';

  // CACHE: priorizamos FRESCOR ("na hora") com proteção da CDN. Mesmos valores
  // da Vercel. s-maxage=10 → edição reflete em ~10s; SWR=59 serve versão velha
  // durante a revalidação, sem latência pro visitante.
  const htmlHeaders = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=59',
  };

  let shell;
  try {
    shell = await fetchShell(env, request);
  } catch (err) {
    // Sem shell não há o que servir. (Igual à Vercel: 500 com HTML mínimo.)
    return new Response(
      `<!doctype html><html><head><title>Erro</title></head><body>Falha ao carregar a página.</body></html>`,
      { status: 500, headers: htmlHeaders }
    );
  }

  let post = null;
  if (slug) post = await fetchPost(sb, slug, locale);

  if (!post) {
    // Post inexistente NESSE idioma/erro → shell puro; a SPA mostra o 404 amigável
    // de /blog/:slug (NUNCA cai no pt-br). 200 pra não travar a hidratação do SPA.
    return new Response(shell, { status: 200, headers: htmlHeaders });
  }

  // Versões traduzidas (translation_group) pro hreflang recíproco.
  const alternates = await fetchAlternates(sb, post.translation_group, post);
  // Relacionados pro "Leia também" (links internos crawláveis sem JS), do locale.
  const related = await fetchRelated(sb, post.slug, post.category, locale);

  let html = injectHeadSeo(shell, post, locale, alternates);
  html = injectBody(html, post, related, locale);
  return new Response(html, { status: 200, headers: htmlHeaders });
}

// ─────────────────────────────────────────────────────────────────────────────
// SITEMAP — porta de `api/blog-sitemap.js`. Lógica IDÊNTICA; só o I/O muda.
// ─────────────────────────────────────────────────────────────────────────────

/** Escapa texto para uso seguro dentro de um nó/atributo XML. */
function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Busca todos os posts publicados (slug + locale + grupo + datas). */
async function fetchPublishedPosts(sb) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = sb;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const url =
    `${SUPABASE_URL}/rest/v1/blog_posts` +
    `?status=eq.published` +
    `&select=slug,locale,translation_group,updated_at,published_at,created_at` +
    `&order=published_at.desc`;
  try {
    const res = await fetch(url, { headers: restHeaders(SUPABASE_ANON_KEY) });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** Normaliza a data do post pra <lastmod> (YYYY-MM-DD). */
function lastmodOf(post) {
  const raw = post.updated_at || post.published_at || post.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * ORQUESTRADOR do sitemap — porta do corpo do `handler` da Vercel.
 * Recebe { env } e devolve um `Response` XML pronto.
 */
export async function renderBlogSitemap({ env }) {
  const sb = resolveSupabase(env);

  // CACHE: posts mudam pouco; 5min na CDN com revalidação em background. (Vercel.)
  const xmlHeaders = {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
  };

  const posts = (await fetchPublishedPosts(sb)).filter((p) => p && p.slug);

  // Agrupa por translation_group (a mesma matéria nos vários idiomas). Post sem
  // grupo cai num grupo só dele (o próprio slug como chave) — sem alternate falso.
  const byTg = new Map();
  for (const p of posts) {
    const tg = p.translation_group || `__self__:${p.locale || 'pt-br'}:${p.slug}`;
    if (!byTg.has(tg)) byTg.set(tg, []);
    byTg.get(tg).push(p);
  }

  const urlBlocks = [];
  for (const versions of byTg.values()) {
    // Alternates RECÍPROCOS: todas as versões publicadas do grupo + x-default
    // (pt-br, se existir no grupo). Idênticos em cada <url> do grupo, como o
    // Google exige. Um grupo com uma só versão emite só o alternate dela própria.
    const ptBr = versions.find((v) => (v.locale || 'pt-br') === 'pt-br');
    const alt = versions
      .map((v) => {
        const loc = v.locale || 'pt-br';
        return `    <xhtml:link rel="alternate" hreflang="${HREFLANG[loc] || loc}" href="${escapeXml(
          postUrl(loc, v.slug)
        )}" />`;
      })
      .concat(
        ptBr
          ? [
              `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(
                postUrl('pt-br', ptBr.slug)
              )}" />`,
            ]
          : []
      )
      .join('\n');

    for (const v of versions) {
      const loc = v.locale || 'pt-br';
      const loc0 = postUrl(loc, v.slug);
      const lastmod = lastmodOf(v);
      urlBlocks.push(
        `  <url>\n` +
          `    <loc>${escapeXml(loc0)}</loc>\n` +
          (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '') +
          `${alt}\n` +
          `    <priority>0.6</priority>\n` +
          `  </url>`
      );
    }
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    `${urlBlocks.join('\n')}\n` +
    `</urlset>\n`;

  return new Response(xml, { status: 200, headers: xmlHeaders });
}

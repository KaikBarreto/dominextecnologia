// ─────────────────────────────────────────────────────────────────────────────
// SITEMAP DINÂMICO DO BLOG — Vercel Serverless Function.
//
// PROBLEMA que resolve: os posts publicados não entram em nenhum sitemap. O
// public/sitemap.xml é estático (build-time) e lista só as páginas de marketing
// (home, segmentos, módulos, institucional) + a LISTAGEM /blog por idioma. Posts
// individuais NÃO entram no estático (ficariam desatualizados a cada publicação
// pós-build) — este arquivo é a FONTE ÚNICA dos posts, sempre fresca.
//
// COMO FUNCIONA:
//   1. Lê todos os posts PUBLICADOS no Supabase via REST (anon key — só leitura),
//      exatamente como api/blog-post.js (mesmo client/env, mesma proteção).
//   2. Emite um <urlset> com a URL de cada post NO IDIOMA DELE:
//        pt-br → https://www.dominex.app/blog/<slug>
//        en/es/fr → https://www.dominex.app/<locale>/blog/<slug>
//   3. hreflang RECÍPROCO por translation_group: cada post lista <xhtml:link
//      rel="alternate"> pra TODAS as versões publicadas do mesmo artigo (a mesma
//      matéria nos vários idiomas) + x-default = versão pt-br. Post sem tradução
//      não emite alternate falso.
//
// Servido em /blog-sitemap.xml via rewrite do vercel.json e referenciado no
// robots.txt (linha Sitemap: adicional).
//
// SEGURANÇA: só anon/publishable key, em leitura, filtrando status=eq.published.
// ─────────────────────────────────────────────────────────────────────────────

const SITE_URL = 'https://www.dominex.app';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

// hreflang code por locale interno (pt-BR, en, es, fr).
const HREFLANG = { 'pt-br': 'pt-BR', en: 'en', es: 'es', fr: 'fr' };

/** Escapa texto para uso seguro dentro de um nó/atributo XML. */
function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** URL absoluta localizada de um post (pt-br sem prefixo, outros com /xx/). */
function postUrl(locale, slug) {
  const loc = locale || 'pt-br';
  return loc === 'pt-br'
    ? `${SITE_URL}/blog/${slug}`
    : `${SITE_URL}/${loc}/blog/${slug}`;
}

/** Busca todos os posts publicados (slug + locale + grupo + datas). */
async function fetchPublishedPosts() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const url =
    `${SUPABASE_URL}/rest/v1/blog_posts` +
    `?status=eq.published` +
    `&select=slug,locale,translation_group,updated_at,published_at,created_at` +
    `&order=published_at.desc`;
  try {
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
      },
    });
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

export default async function handler(req, res) {
  // CACHE: posts mudam pouco; 5min na CDN com revalidação em background.
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=300, stale-while-revalidate=600'
  );
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');

  const posts = (await fetchPublishedPosts()).filter((p) => p && p.slug);

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

  res.status(200).send(xml);
}

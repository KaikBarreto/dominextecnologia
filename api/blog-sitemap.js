// ─────────────────────────────────────────────────────────────────────────────
// SITEMAP DINÂMICO DO BLOG — Vercel Serverless Function.
//
// PROBLEMA que resolve: os posts publicados não entram em nenhum sitemap. O
// public/sitemap.xml é estático e lista só as páginas de marketing (home,
// segmentos, módulos, institucional). Posts novos ficavam invisíveis pro Google.
//
// COMO FUNCIONA:
//   1. Lê todos os posts PUBLICADOS no Supabase via REST (anon key — só leitura),
//      exatamente como api/blog-post.js (mesmo client/env, mesma proteção).
//   2. Devolve um <urlset> com https://www.dominex.app/blog/<slug> + <lastmod>.
//
// Servido em /blog-sitemap.xml via rewrite do vercel.json e referenciado no
// robots.txt (linha Sitemap: adicional). NÃO duplica posts no sitemap.xml
// estático — este é a fonte única dos posts.
//
// SEGURANÇA: só anon/publishable key, em leitura, filtrando status=eq.published.
// ─────────────────────────────────────────────────────────────────────────────

const SITE_URL = 'https://www.dominex.app';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

/** Escapa texto para uso seguro dentro de um nó XML (<loc>...</loc>). */
function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Busca todos os posts publicados (slug + data de atualização). */
async function fetchPublishedPosts() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const url =
    `${SUPABASE_URL}/rest/v1/blog_posts` +
    `?status=eq.published` +
    `&select=slug,updated_at,published_at,created_at` +
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

  const posts = await fetchPublishedPosts();

  const urls = posts
    .filter((p) => p && p.slug)
    .map((p) => {
      const loc = `${SITE_URL}/blog/${escapeXml(p.slug)}`;
      const lastmod = lastmodOf(p);
      return (
        `  <url>\n` +
        `    <loc>${loc}</loc>\n` +
        (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '') +
        `    <priority>0.6</priority>\n` +
        `  </url>`
      );
    })
    .join('\n');

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${urls}\n` +
    `</urlset>\n`;

  res.status(200).send(xml);
}

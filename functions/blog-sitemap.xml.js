// Rota pública direta do sitemap no Cloudflare Pages.
//
// O Pages resolve Functions antes de `_redirects`. Manter a Function no caminho
// final evita que `/blog-sitemap.xml` caia no fallback da SPA (`index.html`) em
// vez de alcançar a rota interna `/api/blog-sitemap`.

import { renderBlogSitemap } from './_lib/blog-render.js';

export async function onRequest(context) {
  const { env } = context;
  return renderBlogSitemap({ env });
}

// ─────────────────────────────────────────────────────────────────────────────
// /api/blog-sitemap — Cloudflare Pages Function (PORTE de api/blog-sitemap.js).
//
// MUDOU vs Vercel (só a casca de I/O; lógica em functions/_lib/blog-render.js):
//   • `export default async function handler(req, res)`  →  `export async function
//      onRequest(context)` com `const { env } = context;`
//   • `process.env.VITE_SUPABASE_*`  →  `env.VITE_SUPABASE_*` (dentro da lib).
//   • `res.status().setHeader().send(xml)`  →  `return new Response(xml, {...})`.
//
// Compatibilidade para chamadas diretas em /api/blog-sitemap. A URL pública
// /blog-sitemap.xml é servida por functions/blog-sitemap.xml.js, sem depender de
// rewrite entre rotas de Functions, e é referenciada no robots.txt.
// A montagem do XML/hreflang recíproco é IDÊNTICA à Vercel.
// ─────────────────────────────────────────────────────────────────────────────

import { renderBlogSitemap } from '../_lib/blog-render.js';

export async function onRequest(context) {
  const { env } = context;
  return renderBlogSitemap({ env });
}

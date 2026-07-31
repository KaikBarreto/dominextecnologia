// ─────────────────────────────────────────────────────────────────────────────
// /api/blog-post — Cloudflare Pages Function (PORTE de api/blog-post.js da Vercel).
//
// MUDOU vs Vercel (só a casca de I/O; a lógica vive em functions/_lib/blog-render.js):
//   • `export default async function handler(req, res)`  →  `export async function
//      onRequest(context)` com `const { request, env } = context;`
//   • `req.query.slug` / `req.query.locale`  →  lidos da query string via
//      `new URL(request.url).searchParams` (o roteamento de PRODUÇÃO usa as rotas
//      dinâmicas functions/blog/[slug].js — esta rota /api é paridade/debug e um
//      endpoint estável pra chamar com ?slug=&locale= diretamente).
//   • `process.env.VITE_SUPABASE_*`  →  `env.VITE_SUPABASE_*` (dentro da lib).
//   • `res.status().setHeader().send()`  →  `return new Response(body, {status,headers})`.
//
// A lógica de SEO/JSON-LD/hreflang/i18n/relacionados/cache é IDÊNTICA à Vercel.
// ─────────────────────────────────────────────────────────────────────────────

import { renderBlogPost } from '../_lib/blog-render.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') || '';
  // Locale via ?locale=xx. Default/validação são tratados na lib (inválido→pt-br).
  const rawLocale = url.searchParams.get('locale') || 'pt-br';
  return renderBlogPost({ env, request, slug, rawLocale });
}

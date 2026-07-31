// ─────────────────────────────────────────────────────────────────────────────
// ROTA DINÂMICA — /blog/:slug  (locale pt-br, sem prefixo de idioma).
//
// Esta é a ABORDAGEM DE ROTEAMENTO ESCOLHIDA (params de rota do Pages), em vez de
// depender de query string injetada por `_redirects`. O Cloudflare Pages casa
// este arquivo em /blog/<qualquer-coisa> e entrega o slug em `context.params.slug`
// de forma garantida pela plataforma — sem parsing frágil de query em rewrite 200.
//
// PRECEDÊNCIA: assets estáticos ganham desta Function. Posts PRERENDERIZADOS no
// build (dist/blog/<slug>/index.html) são servidos ESTÁTICOS (frescos do build).
// Só os posts SEM arquivo estático (publicados/editados APÓS o último build) caem
// aqui e são renderizados sob demanda — EXATAMENTE o mesmo contrato da Vercel.
//
// Encaminha pra lógica compartilhada em functions/_lib/blog-render.js.
// ─────────────────────────────────────────────────────────────────────────────

import { renderBlogPost } from '../_lib/blog-render.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  // context.params.slug vem do nome do arquivo [slug].js (garantido pelo Pages).
  const slug = params && params.slug ? String(params.slug) : '';
  return renderBlogPost({ env, request, slug, rawLocale: 'pt-br' });
}

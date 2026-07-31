// ─────────────────────────────────────────────────────────────────────────────
// ROTA DINÂMICA — /:lang/blog/:slug  (locale en / es / fr, com prefixo).
//
// Casa /en/blog/<slug>, /es/blog/<slug>, /fr/blog/<slug> (e qualquer outro 1º
// segmento). O `lang` vira o locale; se não for um idioma suportado, a lógica
// compartilhada normaliza pra pt-br (mesma tolerância da versão Vercel).
//
// GUARDA: se `lang` NÃO é um locale de blog conhecido (en/es/fr), este handler
// NÃO deve sequestrar a rota — devolve context.next() pra deixar o SPA/estáticos
// tratarem (ex.: uma futura rota /algo/blog/... que não seja i18n). Isso evita
// que URLs não-i18n caiam por engano no render de post.
//
// Como as rotas dinâmicas do Pages têm precedência sobre o SPA fallback, e o
// prerender também gera dist/<lang>/blog/<slug>/index.html, os posts do build são
// servidos estáticos; só os novos/editados pós-build caem aqui. Igual à Vercel.
// ─────────────────────────────────────────────────────────────────────────────

import { renderBlogPost } from '../../_lib/blog-render.js';

const BLOG_LOCALES = new Set(['en', 'es', 'fr']);

export async function onRequest(context) {
  const { request, env, params, next } = context;
  const lang = params && params.lang ? String(params.lang) : '';
  const slug = params && params.slug ? String(params.slug) : '';

  // Só tratamos os prefixos i18n de blog. Qualquer outro 1º segmento segue o
  // pipeline normal (assets/SPA), sem virar render de post.
  if (!BLOG_LOCALES.has(lang)) {
    return next();
  }

  return renderBlogPost({ env, request, slug, rawLocale: lang });
}

// ─────────────────────────────────────────────────────────────────────────────
// SSG (Server-Side Generation) — Fase 1.
//
// Gera HTML estático de TODAS as rotas de marketing NO BUILD, via React
// (renderToString) + StaticRouter, SEM Chrome/puppeteer. Substitui o antigo
// prerender.mjs (que abria um Chrome headless e quebrava no Vercel).
//
// Pipeline:
//   1. `vite build --ssr src/entry-ssg.tsx` → bundle Node em dist-ssg/ (resolve
//      aliases @/, asset imports, CSS como no-op de SSR). Não toca em dist/.
//   2. importa o bundle e renderiza cada rota de SSG_ROUTES → { html, head }.
//   3. lê dist/index.html (shell do build do cliente, com os <script> hasheados
//      corretos) e injeta: head correto da rota + o html dentro do #root.
//   4. escreve dist/<rota>/index.html (a home `/` vira dist/index.html).
//
// Roda no `npm run build` (depois de `vite build` + `copy-shell`). NÃO usa Chrome.
// ─────────────────────────────────────────────────────────────────────────────

import { build } from 'vite';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ── Shim de globals de browser para o processo Node do SSG ────────────────────
// Alguns módulos do app referenciam `localStorage`/`window` no MOMENTO DO IMPORT
// (ex.: o cliente Supabase faz `storage: localStorage` ao criar). Como os imports
// ES são avaliados ANTES de qualquer statement do módulo importador, o shim
// precisa existir no processo Node ANTES do `import()` dinâmico do bundle SSR.
// O renderToString não roda effects, então nenhum acesso REAL ocorre no render;
// basta um stub inofensivo para o módulo carregar.
(function installSsrBrowserShim() {
  const noopStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  };
  if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = noopStorage;
  if (typeof globalThis.sessionStorage === 'undefined') globalThis.sessionStorage = noopStorage;
})();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist');
const SSG_OUT = join(ROOT, 'dist-ssg');
const ENTRY = join(ROOT, 'src', 'entry-ssg.tsx');

// ── Env do Supabase pra buscar os posts do blog no build ──────────────────────
// Carrega o .env da raiz (se ainda não estiver no process.env) só pra ler as vars
// VITE_SUPABASE_* — as MESMAS que o cliente usa (anon/publishable, só leitura).
function loadEnvFromDotenv() {
  try {
    const envPath = join(ROOT, '.env');
    if (!existsSync(envPath)) return;
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* sem .env → segue com o que estiver no ambiente (Vercel injeta as vars) */
  }
}

const SUPABASE_URL = () => process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = () =>
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

/**
 * Busca posts publicados + categorias via REST do Supabase (anon key, leitura).
 * Devolve `{ posts, categories }` pro entry-ssg renderizar a listagem com cards
 * já no HTML. Em falha, devolve listas vazias (a SPA hidrata e busca no client) —
 * nunca derruba o build.
 */
async function fetchBlogData() {
  loadEnvFromDotenv();
  const url = SUPABASE_URL();
  const key = SUPABASE_ANON_KEY();
  if (!url || !key) {
    console.warn('[ssg] Sem VITE_SUPABASE_* — /blog sai sem posts no HTML (SPA hidrata).');
    return { posts: [], categories: [] };
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };
  try {
    // Traz `locale`, `translation_group` e os campos que a listagem E o post
    // precisam (o post é prerenderizado sem fetch no client — item 3 do plano).
    const postsUrl =
      `${url}/rest/v1/blog_posts` +
      `?status=eq.published` +
      `&select=id,title,slug,excerpt,category,cover_image_url,published_at,updated_at,created_at,view_count,likes_count,comments_count,author_name,content,meta_title,meta_description,locale,translation_group` +
      `&order=published_at.desc`;
    const catsUrl = `${url}/rest/v1/blog_categories?select=name,color,locale&order=name`;
    const [postsRes, catsRes] = await Promise.all([
      fetch(postsUrl, { headers }),
      fetch(catsUrl, { headers }),
    ]);
    const posts = postsRes.ok ? await postsRes.json() : [];
    const catsRaw = catsRes.ok ? await catsRes.json() : [];
    const categories = (Array.isArray(catsRaw) ? catsRaw : []).map((c) => ({
      name: c.name,
      color: c.color || 'hsl(160 100% 39%)',
      locale: c.locale || 'pt-br',
    }));
    console.log(
      `[ssg] Blog: ${Array.isArray(posts) ? posts.length : 0} posts, ${categories.length} categorias.`
    );
    return { posts: Array.isArray(posts) ? posts : [], categories };
  } catch (err) {
    console.warn('[ssg] Falha ao buscar dados do blog (segue sem posts):', err?.message || err);
    return { posts: [], categories: [] };
  }
}

/** Escapa o texto pra usar dentro de um atributo HTML (content="..."). */
function attr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Injeta o <head> correto da rota no shell base e troca o #root vazio pelo HTML
 * renderizado. Reusa o dist/index.html (mesmos <script>/<link> hasheados do
 * build) — só o conteúdo de SEO/marketing muda por rota.
 */
function buildHtml(baseHtml, html, head) {
  let out = baseHtml;

  // <html lang="..."> — o shell é sempre pt-BR; reescreve pro idioma da rota.
  out = out.replace(/<html lang="[^"]*"/i, `<html lang="${attr(head.htmlLang)}"`);

  // Bloco hreflang (as 4 versões da MESMA página + x-default). Recíproco: idêntico
  // nas 4 versões de idioma. O shell (index.html) já traz o bloco DA HOME; removemos
  // qualquer <link rel="alternate" hreflang> pré-existente e injetamos o desta rota
  // logo após a <link rel="canonical"> — senão a home vazaria nas outras páginas.
  out = out.replace(/[ \t]*<link rel="alternate" hreflang="[^"]*" href="[^"]*" \/>\n?/gi, '');
  if (head.hreflang) {
    out = out.replace(
      /(<link rel="canonical" href="[\s\S]*?" \/>)/,
      `$1\n    ${head.hreflang}`
    );
  }

  // meta viewport — troca o viewport FIXO do shell (app logado, user-scalable=no)
  // pelo viewport ZOOMÁVEL da rota de marketing (libera o zoom de pinça → passa no
  // Lighthouse a11y). O conteúdo já vem pronto do entry-ssg (MARKETING_VIEWPORT).
  out = out.replace(
    /<meta name="viewport" content="[\s\S]*?" \/>/,
    `<meta name="viewport" content="${attr(head.viewport)}" />`
  );

  // <title>
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${attr(head.title)}</title>`);

  // meta description
  out = out.replace(
    /<meta name="description" content="[\s\S]*?">/,
    `<meta name="description" content="${attr(head.description)}">`
  );

  // canonical — a canônica PRÓPRIA da rota (www).
  out = out.replace(
    /<link rel="canonical" href="[\s\S]*?" \/>/,
    `<link rel="canonical" href="${attr(head.canonical)}" />`
  );

  // OG/Twitter title + description + url (substitui os do shell pela rota).
  out = out
    .replace(
      /<meta property="og:title" content="[\s\S]*?">/,
      `<meta property="og:title" content="${attr(head.ogTitle)}">`
    )
    .replace(
      /<meta name="twitter:title" content="[\s\S]*?">/,
      `<meta name="twitter:title" content="${attr(head.ogTitle)}">`
    )
    .replace(
      /<meta property="og:description" content="[\s\S]*?">/,
      `<meta property="og:description" content="${attr(head.ogDescription)}">`
    )
    .replace(
      /<meta name="twitter:description" content="[\s\S]*?">/,
      `<meta name="twitter:description" content="${attr(head.ogDescription)}">`
    )
    .replace(
      /<meta property="og:url" content="[\s\S]*?" \/>/,
      `<meta property="og:url" content="${attr(head.ogUrl)}" />`
    );

  // JSON-LD por-rota. Em páginas internas (segmento/módulo/institucional) removemos
  // os blocos GLOBAIS específicos da home (FAQPage e SoftwareApplication) pra não
  // herdar a FAQ/oferta da home em toda página. Organization e WebSite ficam (são
  // site-wide e legítimos em qualquer URL). A home (stripGlobalJsonLd=false) mantém
  // tudo e não injeta nada.
  if (head.stripGlobalJsonLd) {
    out = stripGlobalJsonLdBlocks(out);
  }
  if (head.jsonLd) {
    // Injeta os blocos por-rota logo antes de </head>.
    out = out.replace(/<\/head>/i, `${head.jsonLd}\n  </head>`);
  }

  // #root vazio → preenchido com o HTML renderizado.
  out = out.replace(/<div id="root"><\/div>/, `<div id="root">${html}</div>`);

  return out;
}

/**
 * Remove do shell os blocos <script type="application/ld+json"> cujo @type é
 * `FAQPage` ou `SoftwareApplication` (os específicos da home). Preserva
 * Organization e WebSite. Detecção por conteúdo do bloco, robusta a formatação.
 */
function stripGlobalJsonLdBlocks(htmlStr) {
  return htmlStr.replace(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>\s*/gi,
    (full, body) => {
      return /"@type"\s*:\s*"(FAQPage|SoftwareApplication)"/.test(body) ? '' : full;
    }
  );
}

/**
 * Caminho de saída de uma TAREFA (rota × idioma): outDir '' → dist/index.html;
 * senão dist/<outDir>/index.html. Ex.: outDir 'en/os-digital' → dist/en/os-digital/index.html.
 */
function outPathForTask(task) {
  if (!task.outDir) return join(DIST, 'index.html');
  return join(DIST, task.outDir, 'index.html');
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('[ssg] dist/index.html não existe. Rode `vite build` (ou `npm run build:no-prerender`) antes.');
    process.exit(1);
  }

  console.log('[ssg] Buildando o bundle SSR (sem Chrome)…');
  await build({
    configFile: resolve(ROOT, 'vite.config.ts'),
    logLevel: 'warn',
    build: {
      ssr: ENTRY,
      outDir: SSG_OUT,
      emptyOutDir: true,
      ssrManifest: false,
      // Mantém o build SSR enxuto e previsível (sem minify p/ stack traces claras).
      minify: false,
      rollupOptions: { output: { entryFileNames: 'entry-ssg.js' } },
    },
  });

  const entryUrl = pathToFileURL(join(SSG_OUT, 'entry-ssg.js')).href;
  const { renderRoute, renderBlogPost, SSG_ROUTES, SSG_TASKS, SITE_URL } =
    await import(entryUrl);

  // Lê o shell base UMA vez (template do build do cliente, com scripts hasheados).
  // Importante: o copy-shell já preservou o index.html LIMPO como shell.html antes
  // do SSG mexer no index.html — a função serverless do blog usa shell.html.
  const baseHtml = readFileSync(join(DIST, 'index.html'), 'utf8');

  // Busca os dados do blog UMA vez (se houver /blog nas rotas) pra injetar os
  // posts no HTML estático da listagem.
  const blogData = SSG_ROUTES.includes('/blog')
    ? await fetchBlogData()
    : { posts: [], categories: [] };

  // Índice de posts publicados por translation_group (pra montar o hreflang
  // recíproco de cada post). Cada versão tem seu PRÓPRIO slug e locale.
  const postsByTg = new Map();
  for (const p of blogData.posts) {
    if (!postsByTg.has(p.translation_group)) postsByTg.set(p.translation_group, []);
    postsByTg.get(p.translation_group).push(p);
  }
  /** Alternates (locale+slug) das versões PUBLICADAS do mesmo artigo. */
  const alternatesFor = (post) =>
    (postsByTg.get(post.translation_group) || []).map((p) => ({
      locale: p.locale,
      slug: p.slug,
    }));

  /** Filtra a listagem `/blog` pelo locale da task (não vaza pt-br no /es). */
  const blogDataForLocale = (locale) => ({
    posts: blogData.posts.filter((p) => (p.locale || 'pt-br') === locale),
    categories: blogData.categories.filter((c) => (c.locale || 'pt-br') === locale),
  });

  // Itera cada TAREFA (rota base × idioma): ~25 rotas × 4 idiomas = ~100 páginas.
  const results = [];
  for (const task of SSG_TASKS) {
    try {
      const { html, head } = renderRoute(task.basePath, {
        locale: task.locale,
        blogData: task.basePath === '/blog' ? blogDataForLocale(task.locale) : undefined,
      });
      const finalHtml = buildHtml(baseHtml, html, head);
      const outPath = outPathForTask(task);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, finalHtml, 'utf8');
      results.push({ task, bytes: finalHtml.length, out: outPath, ok: true });
      console.log(
        `[ssg] ✓ ${task.localizedPath} (${task.locale}) → ${outPath.replace(ROOT + '/', '')} (${finalHtml.length} bytes)`
      );
    } catch (err) {
      results.push({ task, ok: false, error: err });
      console.error(`[ssg] ✗ ${task.localizedPath} (${task.locale}) falhou:`, err);
    }
  }

  // ── Prerender de CADA post publicado na URL do seu locale ───────────────────
  // pt-br → dist/blog/<slug>/index.html; outros → dist/<lang>/blog/<slug>/index.html.
  // Resolve o gap atual (posts não prerenderizados). O hreflang vem do
  // translation_group; quando houver traduções, entram automático.
  for (const post of blogData.posts) {
    const locale = post.locale || 'pt-br';
    const localizedPath =
      locale === 'pt-br' ? `/blog/${post.slug}` : `/${locale}/blog/${post.slug}`;
    const outDir = localizedPath.replace(/^\/+|\/+$/g, '');
    try {
      const { html, head } = renderBlogPost(post, {
        locale,
        alternates: alternatesFor(post),
      });
      const finalHtml = buildHtml(baseHtml, html, head);
      const outPath = join(DIST, outDir, 'index.html');
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, finalHtml, 'utf8');
      results.push({ task: { localizedPath, locale }, bytes: finalHtml.length, out: outPath, ok: true });
      console.log(
        `[ssg] ✓ ${localizedPath} (${locale}) → ${outPath.replace(ROOT + '/', '')} (${finalHtml.length} bytes)`
      );
    } catch (err) {
      results.push({ task: { localizedPath, locale }, ok: false, error: err });
      console.error(`[ssg] ✗ ${localizedPath} (${locale}) falhou:`, err);
    }
  }

  // Limpa o bundle SSR intermediário (não vai pra deploy).
  rmSync(SSG_OUT, { recursive: true, force: true });

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`[ssg] ${failed.length} página(s) falharam.`);
    process.exit(1);
  }

  // ── Artefatos de indexação (gerados, não mais manuais) ──────────────────────
  // sitemap.xml com todas as URLs × idioma + alternates hreflang, e llms.txt por
  // idioma. Fonte única = SSG_TASKS, então nunca desalinha das páginas geradas.
  await import('./gen-i18n-artifacts.mjs').then((m) =>
    m.generateArtifacts({ tasks: SSG_TASKS, siteUrl: SITE_URL, distDir: DIST, blogData })
  );

  console.log(
    `[ssg] Concluído sem Chrome/puppeteer. ${results.length} páginas geradas (${SSG_ROUTES.length} rotas × idiomas).`
  );
}

main().catch((err) => {
  console.error('[ssg] Falhou:', err);
  process.exit(1);
});

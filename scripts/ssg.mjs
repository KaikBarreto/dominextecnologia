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

  // #root vazio → preenchido com o HTML renderizado.
  out = out.replace(/<div id="root"><\/div>/, `<div id="root">${html}</div>`);

  return out;
}

/** Caminho de saída de uma rota: `/` → dist/index.html; senão dist/<rota>/index.html. */
function outPathFor(route) {
  if (route === '/') return join(DIST, 'index.html');
  const clean = route.replace(/^\/+|\/+$/g, '');
  return join(DIST, clean, 'index.html');
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
  const { renderRoute, SSG_ROUTES } = await import(entryUrl);

  // Lê o shell base UMA vez (template do build do cliente, com scripts hasheados).
  // Importante: o copy-shell já preservou o index.html LIMPO como shell.html antes
  // do SSG mexer no index.html — a função serverless do blog usa shell.html.
  const baseHtml = readFileSync(join(DIST, 'index.html'), 'utf8');

  const results = [];
  for (const route of SSG_ROUTES) {
    try {
      const { html, head } = renderRoute(route);
      const finalHtml = buildHtml(baseHtml, html, head);
      const outPath = outPathFor(route);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, finalHtml, 'utf8');
      results.push({ route, bytes: finalHtml.length, out: outPath, ok: true });
      console.log(
        `[ssg] ✓ ${route} → ${outPath.replace(ROOT + '/', '')} (${finalHtml.length} bytes)`
      );
    } catch (err) {
      results.push({ route, ok: false, error: err });
      console.error(`[ssg] ✗ ${route} falhou:`, err);
    }
  }

  // Limpa o bundle SSR intermediário (não vai pra deploy).
  rmSync(SSG_OUT, { recursive: true, force: true });

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`[ssg] ${failed.length} rota(s) falharam.`);
    process.exit(1);
  }

  console.log(`[ssg] Concluído sem Chrome/puppeteer. ${results.length} rotas geradas.`);
}

main().catch((err) => {
  console.error('[ssg] Falhou:', err);
  process.exit(1);
});

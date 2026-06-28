// ─────────────────────────────────────────────────────────────────────────────
// PRERENDER ESTÁTICO — roda DEPOIS do `vite build`.
//
// Sobe a app já buildada (dist/) num Chrome headless (Chrome do sistema via
// puppeteer-core — NÃO baixa Chromium), navega cada rota pública de marketing,
// espera o React renderizar o conteúdo, e salva o HTML "vivo" por rota. Esse
// HTML hidrata normalmente no client (o mesmo bundle continua sendo carregado).
//
// NÃO altera App.tsx / router / componentes. Lê dist/ como produto de build.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import {
  PRERENDER_ROUTES,
  MARKETING_CONTENT_MARKER,
  NOT_FOUND_MARKER,
  PREVIEW_PORT,
} from './prerender.config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist');
const BASE_URL = `http://localhost:${PREVIEW_PORT}`;

// ── Descobre o executável do Chrome ──────────────────────────────────────────
// Ordem: env var explícita → caminhos comuns por SO. Sem Chromium baixado.
function findChrome() {
  const fromEnv =
    process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const candidates = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    // Windows
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

// ── Sobe o `vite preview` servindo dist/ ─────────────────────────────────────
function startPreview() {
  return new Promise((resolvePreview, reject) => {
    const proc = spawn(
      'npx',
      ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' }
    );
    let settled = false;
    const onData = (buf) => {
      const s = buf.toString();
      if (!settled && /localhost:\d+/.test(s)) {
        settled = true;
        resolvePreview(proc);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);
    // Fallback: se não detectarmos o log em 8s, assume que subiu mesmo assim.
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolvePreview(proc);
      }
    }, 8000);
  });
}

// Espera a porta responder antes de navegar (evita corrida com o preview).
async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Preview não respondeu em ${url} dentro de ${timeoutMs}ms`);
}

function routeToOutputPath(route) {
  if (route === '/') return join(DIST, 'index.html');
  const clean = route.replace(/^\/+|\/+$/g, '');
  return join(DIST, clean, 'index.html');
}

// ── Renderiza UMA rota no headless e devolve o HTML "assentado" ───────────────
// Mesma lógica de settle (espera o #root encher e estabilizar) usada por TODAS
// as rotas — fixas e posts de blog. Devolve `null` se não conseguiu HTML.
async function renderRoute(browser, route) {
  const url = `${BASE_URL}${route}`;
  const page = await browser.newPage();
  // Marca pra qualquer código client que queira pular efeitos no prerender.
  await page.evaluateOnNewDocument(() => {
    // localStorage limpo: garante que NENHUM tenant/white-label vaze para o
    // HTML prerenderizado. O HTML sai com a marca padrão Dominex.
    try {
      window.localStorage.clear();
    } catch {
      /* noop */
    }
    // Sinaliza ambiente de prerender (disponível pra quem quiser checar).
    window.__PRERENDER__ = true;
  });
  await page.setViewport({ width: 1280, height: 900 });

  // Aborta mídia pesada (vídeo/imagem do hero, fontes externas): não afeta o
  // texto de marketing no DOM e impede que `networkidle` nunca settle por
  // causa de stream de vídeo. CSS/JS continuam carregando normalmente.
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (type === 'media' || type === 'image' || type === 'font') {
      req.abort().catch(() => {});
    } else {
      req.continue().catch(() => {});
    }
  });

  let html = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Espera o React montar conteúdo real dentro do #root.
    await page
      .waitForFunction(
        () => {
          const root = document.getElementById('root');
          return !!root && root.textContent && root.textContent.trim().length > 200;
        },
        { timeout: 20000 }
      )
      .catch(() => {});

    // SETTLE: rotas inexistentes caem no catch-all `/:osId` (OSRedirect) que
    // só renderiza <NotFound /> APÓS montar. E o `<Navigate>` de SegmentRoute
    // redireciona pra `/` depois do mount. No caso dos posts, o BlogPost faz um
    // fetch async no Supabase: o conteúdo (dangerouslySetInnerHTML) só aparece
    // DEPOIS que a query resolve. Esperar a app ficar ESTÁVEL (texto do #root
    // sem mudar) cobre os três casos antes de serializar.
    await page
      .waitForFunction(
        () => {
          const root = document.getElementById('root');
          if (!root) return false;
          const now = (root.textContent || '').length;
          const prev = window.__lastLen || 0;
          window.__lastLen = now;
          window.__stableCount = now === prev ? (window.__stableCount || 0) + 1 : 0;
          return window.__stableCount >= 3;
        },
        { timeout: 15000, polling: 300 }
      )
      .catch(() => {});

    html = await page.content();
  } finally {
    await page.close();
  }
  return html;
}

// ── Posts individuais do blog: AGORA SÃO RENDER SOB DEMANDA ───────────────────
// O prerender NÃO gera mais dist/blog/<slug>/index.html. Cada post `/blog/:slug`
// é renderizado a CADA request pela função serverless api/blog-post.js (via
// rewrite no vercel.json), buscando o post no Supabase em runtime. Assim um post
// novo/editado fica crawlável NA HORA, sem rebuild — antes só aparecia no próximo
// deploy. IMPORTANTE: na Vercel, arquivo estático tem precedência sobre rewrite;
// gerar o estático aqui SOMBREARIA a função. Por isso ele foi removido.
// A LISTA /blog continua sendo prerenderizada normalmente (PRERENDER_ROUTES).

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('[prerender] dist/index.html não existe. Rode `vite build` antes.');
    process.exit(1);
  }

  // Resolve o Chrome em duas frentes:
  //   1) Chrome do sistema (dev local / PUPPETEER_EXECUTABLE_PATH).
  //   2) @sparticuz/chromium — Chromium empacotado pra ambientes serverless/CI
  //      sem Chrome instalado, que é o caso do build do Vercel (Linux). Assim o
  //      prerender de SEO roda no deploy e as landings saem como HTML estático,
  //      visíveis pra Google e IAs.
  // Só PULA o prerender se NENHUM dos dois existir — sem derrubar o build (as
  // landings caem no fallback de SPA do vercel.json, /(.*) → /index.html).
  let chromePath = findChrome();
  let sparticuzArgs = null;
  if (!chromePath) {
    try {
      const { default: chromium } = await import('@sparticuz/chromium');
      chromePath = await chromium.executablePath();
      sparticuzArgs = chromium.args;
      console.log('[prerender] Chrome: @sparticuz/chromium (serverless)');
    } catch (err) {
      console.warn(
        '[prerender] Sem Chrome do sistema e @sparticuz/chromium indisponível — ' +
          'PULANDO prerender (build segue). Detalhe: ' + (err?.message || err)
      );
      return;
    }
  } else {
    console.log(`[prerender] Chrome: ${chromePath}`);
  }

  // Guarda o index.html original (template do build) pra reusar como base de
  // cada rota de segmento — assim toda rota nasce do MESMO <head> de SEO.
  const baseIndexHtml = readFileSync(join(DIST, 'index.html'), 'utf8');

  const preview = await startPreview();
  let browser;
  const results = [];
  try {
    await waitForServer(BASE_URL);

    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      // Com @sparticuz/chromium usamos os args que ele já fornece (tunados pro
      // ambiente serverless, incluindo o necessário pra WebGL via SwiftShader).
      // No Chrome do sistema usamos nossos próprios args. Em ambos, o SwiftShader
      // deixa o DarkVeil (ogl) criar contexto WebGL sem ruído de erro de GL.
      args: sparticuzArgs ?? [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--disable-gpu',
      ],
    });

    for (const route of PRERENDER_ROUTES) {
      const html = await renderRoute(browser, route);

      if (!html) {
        results.push({ route, status: 'skip', reason: 'sem HTML' });
        continue;
      }

      // Rota inexistente → caiu no NotFound da SPA (ou redirecionou). Não gravamos.
      if (html.includes(NOT_FOUND_MARKER)) {
        results.push({ route, status: 'skip', reason: 'rota inexistente (NotFound)' });
        continue;
      }
      // Marca POSITIVA específica de marketing: o CTA principal da landing/segmento.
      // NotFound nunca tem esse texto, então é uma confirmação forte de que é uma
      // página de marketing de verdade — e não apenas que contém a palavra "Dominex".
      if (!html.includes(MARKETING_CONTENT_MARKER)) {
        results.push({ route, status: 'skip', reason: 'sem conteúdo de marketing' });
        continue;
      }

      const outPath = routeToOutputPath(route);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, html, 'utf8');
      results.push({ route, status: 'ok', out: outPath });
    }
  } catch (err) {
    // Prerender é aditivo: qualquer falha de render (ex.: Chromium serverless
    // incompatível no Vercel) PULA o passo e deixa o build seguir. As landings
    // caem no fallback de SPA do vercel.json. NUNCA derrubar o deploy por isso.
    console.warn(
      '[prerender] Falha ao renderizar — PULANDO prerender (build segue). ' +
        'Detalhe: ' + (err?.message || err)
    );
    return;
  } finally {
    if (browser) await browser.close().catch(() => {});
    preview.kill('SIGTERM');
  }

  // Garante que o template base não foi perdido (sanidade — não usamos, mas
  // deixa explícito que a base de SEO permanece intacta).
  void baseIndexHtml;

  console.log('\n[prerender] Resultado:');
  for (const r of results) {
    if (r.status === 'ok') console.log(`  ✓ ${r.route} → ${r.out.replace(ROOT + '/', '')}`);
    else console.log(`  ⤬ ${r.route} — pulado: ${r.reason}`);
  }
  const okCount = results.filter((r) => r.status === 'ok').length;
  if (okCount === 0) {
    console.warn('[prerender] Nenhuma rota prerenderizada — PULANDO (build segue).');
    return;
  }
  console.log(`\n[prerender] ${okCount} rota(s) prerenderizada(s).`);
}

main().catch((err) => {
  // Último resguardo: prerender jamais derruba o deploy (o app já foi buildado
  // pelo vite antes deste passo). Loga e sai 0 pra o build do Vercel concluir.
  console.warn('[prerender] Erro inesperado — PULANDO prerender, build segue:', err?.message || err);
  process.exit(0);
});

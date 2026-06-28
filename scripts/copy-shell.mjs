// ─────────────────────────────────────────────────────────────────────────────
// COPY-SHELL — roda DEPOIS do `vite build` e ANTES do `prerender`.
//
// O prerender SOBRESCREVE dist/index.html com o HTML "vivo" da home (conteúdo
// dentro do #root). A função serverless api/blog-post.js, porém, precisa de um
// shell LIMPO (root vazio, mas com os <script> hasheados corretos do deploy) pra
// injetar o post nele. Por isso copiamos o dist/index.html recém-buildado (ainda
// limpo) para dist/shell.html ANTES do prerender mexer nele.
//
// shell.html é servido como arquivo estático normal pela Vercel; a função faz
// fetch de /shell.html em runtime (sem cair no catch-all/rewrites).
// ─────────────────────────────────────────────────────────────────────────────

import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist');
const SRC = join(DIST, 'index.html');
const OUT = join(DIST, 'shell.html');

if (!existsSync(SRC)) {
  console.error('[copy-shell] dist/index.html não existe. Rode `vite build` antes.');
  process.exit(1);
}

copyFileSync(SRC, OUT);
console.log('[copy-shell] dist/shell.html gerado a partir do index.html limpo do build.');

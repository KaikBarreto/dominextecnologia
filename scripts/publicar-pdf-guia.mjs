#!/usr/bin/env node
/**
 * Sobe o PDF do Guia Técnico para o Storage do Supabase.
 *
 * Por que não fica no repositório: o PDF tem alguns megabytes e é REGERADO
 * INTEIRO a cada release. Versionar isso significa uma cópia nova no
 * histórico do git toda vez, para sempre. Os prints ficam no repositório
 * (mudam pouco e um por vez, em public/guia-tecnico/img/); o PDF, que muda
 * por completo, mora no Storage — o mesmo precedente de public/videos/
 * (ver .gitignore) e do vídeo da hero da landing (HeroSection.tsx).
 *
 * Uso:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/publicar-pdf-guia.mjs
 *
 * URL pública resultante:
 *   https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/guia-tecnico/Guia-Tecnico-Dominex.pdf
 *
 * NÃO cria o bucket. O bucket público "guia-tecnico" precisa existir antes
 * (passo separado, responsabilidade do dev-database ou dev-plataforma).
 *
 * Baseado no script equivalente do EcoSistemaSaaS (scripts/publicar-pdf-guia.mjs).
 */

import fs from "node:fs";
import path from "node:path";

const PROJETO = process.env.GUIA_SUPABASE_REF || "byqldosixshhuiuarszp";
const BUCKET = "guia-tecnico";
const ORIGEM = path.resolve("docs/guia-tecnico/Guia-Tecnico-Dominex.pdf");
const NOME = path.basename(ORIGEM);

// aceita os dois nomes usados no repositório pra credencial de service role
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!CHAVE) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SERVICE_KEY) no ambiente. Rode:");
  console.error("  set -a; source .claude/secrets.local.env; set +a");
  process.exit(1);
}
if (!fs.existsSync(ORIGEM)) {
  console.error(`Não achei o PDF em ${ORIGEM}. Rode antes: node scripts/montar-guia-suporte.mjs`);
  process.exit(1);
}

const bytes = fs.readFileSync(ORIGEM);
const mb = (bytes.length / 1024 / 1024).toFixed(2);

const alvo = `https://${PROJETO}.supabase.co/storage/v1/object/${BUCKET}/${NOME}`;

const r = await fetch(alvo, {
  method: "POST",
  headers: {
    apikey: CHAVE,
    Authorization: `Bearer ${CHAVE}`,
    "Content-Type": "application/pdf",
    "cache-control": "max-age=300",
    "x-upsert": "true", // regeração sobrescreve
  },
  body: bytes,
});

if (!r.ok) {
  console.error(`Falhou (${r.status}): ${(await r.text()).slice(0, 300)}`);
  process.exit(1);
}

const publico = `https://${PROJETO}.supabase.co/storage/v1/object/public/${BUCKET}/${NOME}`;

// confere que está mesmo servindo, e com o tamanho certo
const check = await fetch(publico, { method: "HEAD" });
const tamanhoServido = Number(check.headers.get("content-length") || 0);

console.log(`✅ PDF publicado (${mb} MB)`);
console.log(`   ${publico}`);
if (!check.ok) {
  console.error(`⚠️  A URL pública respondeu ${check.status} — confira se o bucket está público.`);
  process.exitCode = 1;
} else if (tamanhoServido !== bytes.length) {
  console.error(`⚠️  Tamanho servido (${tamanhoServido}) diferente do arquivo (${bytes.length}).`);
  process.exitCode = 1;
} else {
  console.log(`   conferido: HTTP ${check.status}, ${tamanhoServido} bytes, igual ao arquivo local`);
}

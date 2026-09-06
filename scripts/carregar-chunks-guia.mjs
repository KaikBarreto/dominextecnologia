#!/usr/bin/env node
/**
 * Carrega os chunks do Guia Técnico pra tabela `public.guia_chunks`.
 *
 * Por que existe: `scripts/gerar-chunks-guia.py` produz o .jsonl a partir do
 * HTML do guia. Esse arquivo é a FONTE; a tabela é só o espelho pesquisável que
 * as LLMs consultam pela RPC `buscar_guia`. O guia é regerado inteiro toda vez,
 * então aqui a gente faz upsert por `id` e apaga o que não está mais no arquivo.
 *
 * Uso:
 *   set -a; source .claude/secrets.local.env; set +a
 *   node scripts/carregar-chunks-guia.mjs
 *
 * Opções:
 *   --arquivo=<caminho>   default docs/guia-tecnico/Guia-Tecnico-chunks.jsonl
 *   --lote=<n>            tamanho do lote de upsert (default 50)
 *   --dry-run             só mostra o que faria
 *
 * A chave NUNCA vai no comando: vem de SUPABASE_SERVICE_KEY (ou
 * SUPABASE_SERVICE_ROLE_KEY) no ambiente.
 *
 * Portado de EcoSistemaSaaS (scripts/carregar-chunks-guia.mjs). Adaptado pro
 * projeto Supabase da Dominex (byqldosixshhuiuarszp) e pro arquivo de chunks
 * do Guia Técnico.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const URL_BASE = process.env.SUPABASE_URL || "https://byqldosixshhuiuarszp.supabase.co";
const CHAVE = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const TABELA = "guia_chunks";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v === undefined ? true : v];
  })
);

const ARQUIVO = args.arquivo || "docs/guia-tecnico/Guia-Tecnico-chunks.jsonl";
const LOTE = Number(args.lote || 50);
const DRY = Boolean(args["dry-run"]);

if (!CHAVE) {
  console.error(
    "SUPABASE_SERVICE_KEY (ou SUPABASE_SERVICE_ROLE_KEY) não está no ambiente.\n" +
      "Rode antes:  set -a; source .claude/secrets.local.env; set +a"
  );
  process.exit(1);
}

const CAMPOS = [
  "id", "secao", "secao_titulo", "fase", "fase_titulo", "tipo", "titulo",
  "capitulo", "rotas", "sinonimos", "prints", "texto", "palavras", "chaves", "fonte",
];

const TIPOS = new Set(["visao_geral", "capitulo", "problema", "faq", "glossario"]);

function limpar(chunk) {
  const linha = {};
  for (const c of CAMPOS) {
    let v = chunk[c];
    if (v === undefined) v = null;
    if ((c === "rotas" || c === "prints" || c === "chaves") && !Array.isArray(v)) v = [];
    linha[c] = v;
  }
  return linha;
}

async function rest(metodo, caminho, { body, prefer } = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${caminho}`, {
    method: metodo,
    headers: {
      apikey: CHAVE,
      Authorization: `Bearer ${CHAVE}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const txt = await r.text();
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status} ${metodo} ${caminho} :: ${txt.slice(0, 400)}`);
    err.status = r.status;
    throw err;
  }
  return txt ? JSON.parse(txt) : null;
}

/**
 * Upsert de um lote. ARMADILHA CONHECIDA deste projeto: insert em LOTE no
 * PostgREST pode devolver 400 sem mensagem útil. Quando dá, a gente parte o
 * lote ao meio recursivamente até chegar em 1 linha — aí o erro aponta a linha
 * culpada e a gente reporta o id em vez de derrubar a carga inteira.
 */
async function upsertLote(linhas, falhas) {
  if (linhas.length === 0) return 0;
  try {
    await rest("POST", `${TABELA}?on_conflict=id`, {
      body: linhas,
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    return linhas.length;
  } catch (e) {
    if (linhas.length === 1) {
      falhas.push({ id: linhas[0].id, erro: e.message });
      console.error(`  ✗ ${linhas[0].id}: ${e.message}`);
      return 0;
    }
    const meio = Math.floor(linhas.length / 2);
    console.error(`  ! lote de ${linhas.length} falhou (${e.status}), partindo ao meio`);
    const a = await upsertLote(linhas.slice(0, meio), falhas);
    const b = await upsertLote(linhas.slice(meio), falhas);
    return a + b;
  }
}

async function idsNoBanco() {
  const ids = [];
  const passo = 1000;
  for (let inicio = 0; ; inicio += passo) {
    const r = await fetch(`${URL_BASE}/rest/v1/${TABELA}?select=id&order=id`, {
      headers: {
        apikey: CHAVE,
        Authorization: `Bearer ${CHAVE}`,
        Range: `${inicio}-${inicio + passo - 1}`,
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ao listar ids :: ${(await r.text()).slice(0, 300)}`);
    const parte = await r.json();
    ids.push(...parte.map((x) => x.id));
    if (parte.length < passo) break;
  }
  return ids;
}

async function main() {
  const caminho = path.resolve(ARQUIVO);
  if (!fs.existsSync(caminho)) {
    console.error(`Arquivo não encontrado: ${caminho}\nRode antes: python3 scripts/gerar-chunks-guia.py`);
    process.exit(1);
  }

  const linhas = fs
    .readFileSync(caminho, "utf8")
    .split("\n")
    .filter((l) => l.trim());

  const chunks = [];
  const vistos = new Set();
  for (const [i, l] of linhas.entries()) {
    let c;
    try {
      c = JSON.parse(l);
    } catch (e) {
      console.error(`linha ${i + 1} não é JSON válido, pulando: ${e.message}`);
      continue;
    }
    if (!c.id || !c.tipo || !c.texto) {
      console.error(`linha ${i + 1} sem id/tipo/texto, pulando`);
      continue;
    }
    if (!TIPOS.has(c.tipo)) {
      console.error(`linha ${i + 1} (${c.id}) tem tipo desconhecido "${c.tipo}", pulando`);
      continue;
    }
    if (vistos.has(c.id)) {
      console.error(`id duplicado no arquivo: ${c.id}, pulando a repetição`);
      continue;
    }
    vistos.add(c.id);
    chunks.push(limpar(c));
  }

  console.log(`arquivo: ${ARQUIVO}`);
  console.log(`chunks lidos: ${chunks.length}`);

  if (DRY) {
    console.log("(dry-run, nada foi escrito)");
    return;
  }

  const antes = await idsNoBanco();

  let gravados = 0;
  const falhas = [];
  for (let i = 0; i < chunks.length; i += LOTE) {
    const lote = chunks.slice(i, i + LOTE);
    gravados += await upsertLote(lote, falhas);
    process.stdout.write(`\r  upsert ${Math.min(i + LOTE, chunks.length)}/${chunks.length}`);
  }
  process.stdout.write("\n");

  // o guia é regerado inteiro: o que sumiu do arquivo tem que sumir da tabela,
  // senão a LLM continua achando texto de uma seção que não existe mais
  const sobrando = antes.filter((id) => !vistos.has(id));
  let apagados = 0;
  for (let i = 0; i < sobrando.length; i += 100) {
    const lista = sobrando.slice(i, i + 100);
    const filtro = lista.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",");
    await rest("DELETE", `${TABELA}?id=in.(${encodeURIComponent(filtro)})`, {
      prefer: "return=minimal",
    });
    apagados += lista.length;
  }

  const depois = await idsNoBanco();

  console.log("");
  console.log(`gravados (insert+update): ${gravados}`);
  console.log(`apagados (fora do arquivo): ${apagados}`);
  console.log(`total na tabela agora: ${depois.length}`);
  if (falhas.length) {
    console.log(`FALHAS: ${falhas.length}`);
    for (const f of falhas.slice(0, 20)) console.log(`  ${f.id}: ${f.erro}`);
    process.exit(1);
  }
  if (depois.length !== chunks.length) {
    console.log(`⚠️  tabela (${depois.length}) diverge do arquivo (${chunks.length})`);
    process.exit(1);
  }
  console.log("ok: tabela espelha o arquivo");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

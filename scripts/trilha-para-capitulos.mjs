#!/usr/bin/env node
/**
 * Conversor: docs/domiflix/trilha-de-tutoriais.md → docs/guia-tecnico/grade/capitulos.json
 *
 * A trilha (docs/domiflix/trilha-de-tutoriais.md) é a ÚNICA fonte de verdade.
 * Este script NÃO redigita conteúdo: ele só lê o markdown já aprovado e monta o
 * JSON que o montador do Guia Técnico consome. Se a trilha mudar, roda de novo.
 *
 * O montador do PDF NÃO interpreta markdown — todo texto de saída (nome de
 * capítulo, nota, resumo, abertura, recap, próximo) é texto puro:
 *   - `**negrito**` e `*itálico*` viram só o conteúdo, sem asterisco.
 *   - `` `código` `` vira só o conteúdo, sem crase.
 *   - Os marcadores de convenção da trilha (⚠️ atenção / 🔒 módulo pago /
 *     🚫 não prometer) NUNCA viram texto solto: viram flag booleana no
 *     capítulo (`atencao`/`modulo_pago`/`nao_prometer`, só quando true),
 *     campo de seção (`modulo_pago: "<nome do módulo>"` quando o 🔒 vem da
 *     linha de Duração/Pré-requisito, qualificando o tutorial inteiro) ou
 *     `tipos` dentro de uma nota (uma nota por linha marcada; combinação
 *     "⚠️ 🔒 ..." vira UMA nota com `tipos: ["atencao","modulo_pago"]`,
 *     nunca duas notas com o mesmo texto).
 *
 * Uso: node scripts/trilha-para-capitulos.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INPUT_PATH = join(ROOT, "docs/domiflix/trilha-de-tutoriais.md");
const OUTPUT_PATH = join(ROOT, "docs/guia-tecnico/grade/capitulos.json");

const TOTAL_TUTORIAIS_ESPERADO = 18; // T0..T17

// Mapa dos marcadores de convenção da trilha (ver seção "Convenções" do .md).
const TIPO_POR_MARCADOR = {
  "⚠️": "atencao",
  "🔒": "modulo_pago",
  "🚫": "nao_prometer",
};
const MARCADORES = Object.keys(TIPO_POR_MARCADOR);
const MARCADOR_ALT = MARCADORES.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

// Reconhece 1+ marcadores seguidos no INÍCIO de um trecho, ex: "⚠️ 🔒 texto"
// ou "🚫 texto". Usado tanto pras linhas de nota quanto pro nome de capítulo.
const RE_MARCADORES_INICIO = new RegExp(`^(?:(?:${MARCADOR_ALT})\\s*)+`);

/**
 * Separa marcadores do início de um trecho.
 * Devolve { marcadores: ["atencao","modulo_pago",...], resto: "texto puro" }.
 * `resto` ainda pode ter markdown — quem chama decide se limpa com cleanMarkdown.
 */
function separarMarcadores(trecho) {
  const bruto = trecho.trim();
  const m = bruto.match(RE_MARCADORES_INICIO);
  if (!m) return { marcadores: [], resto: bruto };
  const marcadoresBrutos = m[0].trim().split(/\s+/).filter(Boolean);
  const marcadores = [...new Set(marcadoresBrutos.map((mk) => TIPO_POR_MARCADOR[mk]))];
  const resto = bruto.slice(m[0].length).trim();
  return { marcadores, resto };
}

/**
 * Converte markdown inline (negrito, itálico, código) em texto puro,
 * preservando o CONTEÚDO. Não mexe em `×` nem `—` (não são markdown).
 * Ordem importa: negrito (**) tem que sair ANTES de itálico (*), senão o
 * regex de itálico morde só metade do par duplo e sobra asterisco solto.
 */
function cleanMarkdown(str) {
  if (str == null) return str;
  let s = str;
  s = s.replace(/\*\*(.+?)\*\*/g, "$1"); // **negrito**
  s = s.replace(/`([^`]+)`/g, "$1"); // `código`
  s = s.replace(/\*([^*\n]+)\*/g, "$1"); // *itálico*
  s = s.replace(/[ \t]{2,}/g, " ").trim();
  return s;
}

/** Verifica se ainda sobrou sintaxe markdown (bug de limpeza) numa string. */
function temMarkdownResidual(str) {
  if (str == null) return false;
  return /\*\*|`|\*[^*\n]+\*/.test(str) || /[⚠️🔒🚫]/u.test(str);
}

function main() {
  const md = readFileSync(INPUT_PATH, "utf8");

  // Âncora estrita: "# 🎬 T<n> — ..." com UM único "#" — nunca confundir com
  // "### T<n> — ..." dos prompts de capa (três "#") nem com hex de cor tipo
  // "#00C597" no início de linha (não tem "# 🎬 " na frente).
  const RE_HEADER = /^# 🎬 (T\d+) — (.+?)(?:\s*\(Inspiração visual:\s*\*(.+?)\*\))?\s*$/gm;

  const headers = [];
  let m;
  while ((m = RE_HEADER.exec(md)) !== null) {
    headers.push({
      code: m[1],
      titulo: cleanMarkdown(m[2].trim()),
      inspiracao: m[3] ? cleanMarkdown(m[3].trim()) : null,
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  if (headers.length === 0) {
    console.error("[trilha-para-capitulos] Nenhum cabeçalho de tutorial encontrado (padrão '# 🎬 T<n> — ...'). Abortando.");
    process.exit(1);
  }

  // --- Contadores de cobertura: TODA linha marcada do markdown tem que virar
  // nota, flag de capítulo ou campo de seção. Nada pode sumir calado. ---
  const fimDosTutoriais = headers[headers.length - 1].end; // será recalculado por seção abaixo
  let contLinhasNotaEsperadas = 0;
  let contLinhasCapituloEsperadas = 0;
  let contLinhasHeaderEsperadas = 0;
  let contLinhasNotaProcessadas = 0;
  let contLinhasCapituloProcessadas = 0;
  let contLinhasHeaderProcessadas = 0;

  const resultado = {};
  const camposFaltando = {};

  headers.forEach((header, i) => {
    const secaoInicio = header.end;
    const secaoFim = i + 1 < headers.length ? headers[i + 1].start : md.length;
    const secao = md.slice(secaoInicio, secaoFim);

    const faltando = [];

    // --- Contagem independente de cobertura desta seção (pra validar depois) ---
    contLinhasNotaEsperadas += (secao.match(new RegExp(`^(?:${MARCADOR_ALT})`, "gm")) ?? []).length;
    contLinhasCapituloEsperadas += (secao.match(new RegExp(`^\\d+\\.\\s+\`\\d{1,2}:\\d{2}\`\\s+(?:${MARCADOR_ALT})`, "gm")) ?? []).length;
    contLinhasHeaderEsperadas += (secao.match(new RegExp(`^\\*\\*Duração\\*\\*:.*(?:${MARCADOR_ALT})`, "gm")) ?? []).length;

    // --- Duração / Pré-requisito (+ eventual módulo pago 🔒 na mesma linha,
    // que qualifica o TUTORIAL INTEIRO — vira campo de seção, não nota) ---
    const linhaDuracao = secao.match(/^\*\*Duração\*\*:\s*(.+)$/m);
    let duracao = null;
    let prereq = null;
    let moduloPagoSecao = null;

    if (linhaDuracao) {
      const partes = linhaDuracao[1].split(" · ").map((p) => p.trim());
      const parteDuracao = partes.find((p) => /^~?.*min/i.test(p)) ?? partes[0] ?? null;
      duracao = parteDuracao ? parteDuracao.trim() : null;

      const partePrereq = partes.find((p) => /pré-requisito/i.test(p));
      if (partePrereq) {
        const mp = partePrereq.match(/\*\*Pré-requisito\*\*:\s*(.+)/i);
        prereq = mp ? mp[1].trim() : null;
      }

      // Qualquer parte além de duração/pré-requisito é o 🔒 de módulo pago
      // do tutorial inteiro. Vira string limpa (sem "módulo", sem markdown).
      const consumidas = new Set([parteDuracao, partePrereq]);
      for (const parte of partes) {
        if (consumidas.has(parte)) continue;
        const { marcadores, resto } = separarMarcadores(parte);
        if (marcadores.includes("modulo_pago")) {
          contLinhasHeaderProcessadas += 1;
          moduloPagoSecao = cleanMarkdown(resto).replace(/^módulo\s+/i, "").trim();
        }
      }
    } else {
      faltando.push("duracao/prereq");
    }

    // --- Resumo: 1ª linha de citação "> " logo após o cabeçalho ---
    const linhaResumo = secao.match(/^> (.+)$/m);
    const resumo = linhaResumo ? cleanMarkdown(linhaResumo[1].trim()) : null;
    if (!resumo) faltando.push("resumo");

    // --- Capítulos: "N. `HH:MM` texto" (marcador líder vira flag, resto some do texto) ---
    const capitulos = [];
    const RE_CAPITULO = /^\d+\.\s+`(\d{1,2}:\d{2})`\s+(.+)$/gm;
    let mc;
    while ((mc = RE_CAPITULO.exec(secao)) !== null) {
      const { marcadores, resto } = separarMarcadores(mc[2]);
      if (marcadores.length > 0) contLinhasCapituloProcessadas += 1;
      const capitulo = { t: mc[1], nome: cleanMarkdown(resto) };
      for (const marcador of marcadores) capitulo[marcador] = true;
      capitulos.push(capitulo);
    }
    if (capitulos.length === 0) faltando.push("capitulos");

    // --- Abertura / Recap / Próximo ---
    const abertura = secao.match(/^-\s+\*\*Abertura\*\*:\s+"(.+)"\s*$/m);
    const recap = secao.match(/^-\s+\*\*Recap\*\*:\s+"(.+)"\s*$/m);
    const proximo = secao.match(/^-\s+\*\*Próximo\*\*:\s+"(.+)"\s*$/m);
    if (!abertura) faltando.push("abertura");
    if (!recap) faltando.push("recap");
    if (!proximo) faltando.push("proximo");

    // --- Notas ⚠️/🔒/🚫: UMA linha marcada = UMA nota, com `tipos` (array),
    // nunca duplicando texto pra marcador combinado ("⚠️ 🔒 ..." → 1 nota
    // com tipos: ["atencao","modulo_pago"]). ---
    const notasDaSecao = [];
    const RE_LINHA_MARCADOR = new RegExp(`^(?:${MARCADOR_ALT}).*$`, "gm");
    let mn;
    while ((mn = RE_LINHA_MARCADOR.exec(secao)) !== null) {
      const { marcadores, resto } = separarMarcadores(mn[0]);
      const texto = cleanMarkdown(resto);
      if (marcadores.length === 0 || !texto) continue;
      contLinhasNotaProcessadas += 1;
      notasDaSecao.push({ tipos: marcadores, texto });
    }

    // Dedup por segurança: mesmo texto exato dentro da mesma seção vira 1 nota
    // só, com a união dos tipos (nunca deve acontecer no corpus atual, mas
    // evita nota repetida se a trilha crescer com marcador combinado igual).
    const notasDedupe = [];
    const indicePorTexto = new Map();
    for (const nota of notasDaSecao) {
      if (indicePorTexto.has(nota.texto)) {
        const existente = notasDedupe[indicePorTexto.get(nota.texto)];
        existente.tipos = [...new Set([...existente.tipos, ...nota.tipos])];
      } else {
        indicePorTexto.set(nota.texto, notasDedupe.length);
        notasDedupe.push({ tipos: [...nota.tipos], texto: nota.texto });
      }
    }

    if (faltando.length > 0) camposFaltando[header.code] = faltando;

    resultado[header.code] = {
      code: header.code,
      inspiracao: header.inspiracao,
      titulo: header.titulo,
      resumo,
      duracao,
      prereq,
      modulo_pago: moduloPagoSecao,
      capitulos,
      abertura: abertura ? cleanMarkdown(abertura[1].trim()) : null,
      recap: recap ? cleanMarkdown(recap[1].trim()) : null,
      proximo: proximo ? cleanMarkdown(proximo[1].trim()) : null,
      notas: notasDedupe,
    };
  });

  // --- Validação 1: exatamente T0..T17, sem buraco e sem repetição ---
  const chaves = Object.keys(resultado);
  const esperadas = Array.from({ length: TOTAL_TUTORIAIS_ESPERADO }, (_, n) => `T${n}`);
  const faltandoChave = esperadas.filter((k) => !chaves.includes(k));
  const chavesExtras = chaves.filter((k) => !esperadas.includes(k));
  const contagem = {};
  for (const h of headers) contagem[h.code] = (contagem[h.code] ?? 0) + 1;
  const repetidas = Object.entries(contagem).filter(([, n]) => n > 1).map(([k]) => k);

  const erros = [];
  if (faltandoChave.length > 0) erros.push(`Faltando: ${faltandoChave.join(", ")}`);
  if (chavesExtras.length > 0) erros.push(`Chaves inesperadas: ${chavesExtras.join(", ")}`);
  if (repetidas.length > 0) erros.push(`Repetidas no markdown: ${repetidas.join(", ")}`);

  // --- Validação 2: cobertura total dos marcadores ⚠️/🔒/🚫. Nenhuma linha
  // marcada do .md pode sumir sem virar nota, flag de capítulo ou campo de seção. ---
  if (contLinhasNotaProcessadas !== contLinhasNotaEsperadas) {
    erros.push(`Cobertura de notas quebrada: ${contLinhasNotaEsperadas} linha(s) marcada(s) no .md, mas ${contLinhasNotaProcessadas} viraram nota.`);
  }
  if (contLinhasCapituloProcessadas !== contLinhasCapituloEsperadas) {
    erros.push(`Cobertura de flags de capítulo quebrada: ${contLinhasCapituloEsperadas} linha(s) de capítulo marcada(s) no .md, mas ${contLinhasCapituloProcessadas} viraram flag.`);
  }
  if (contLinhasHeaderProcessadas !== contLinhasHeaderEsperadas) {
    erros.push(`Cobertura de módulo pago de seção quebrada: ${contLinhasHeaderEsperadas} linha(s) de Duração com 🔒 no .md, mas ${contLinhasHeaderProcessadas} viraram campo "modulo_pago".`);
  }

  // --- Validação 3: nenhum resíduo de markdown (** / ` / *itálico*) ou
  // marcador (⚠️/🔒/🚫) sobrando em texto que devia estar limpo. ---
  for (const t of Object.values(resultado)) {
    const camposTexto = [t.titulo, t.inspiracao, t.resumo, t.modulo_pago, t.abertura, t.recap, t.proximo];
    for (const campo of camposTexto) {
      if (temMarkdownResidual(campo)) erros.push(`${t.code}: resíduo de markdown/marcador em campo de seção: "${campo}"`);
    }
    for (const cap of t.capitulos) {
      if (temMarkdownResidual(cap.nome)) erros.push(`${t.code} [${cap.t}]: resíduo de markdown/marcador em capítulo: "${cap.nome}"`);
    }
    for (const nota of t.notas) {
      if (temMarkdownResidual(nota.texto)) erros.push(`${t.code}: resíduo de markdown/marcador em nota: "${nota.texto}"`);
    }
  }

  if (erros.length > 0) {
    console.error("[trilha-para-capitulos] Validação falhou — JSON NÃO foi gravado.");
    for (const erro of erros) console.error(`  - ${erro}`);
    process.exit(1);
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(resultado, null, 2) + "\n", "utf8");

  // --- Relatório no terminal ---
  const totalCapitulos = Object.values(resultado).reduce((acc, t) => acc + t.capitulos.length, 0);
  const totalNotas = Object.values(resultado).reduce((acc, t) => acc + t.notas.length, 0);
  const totalFlagsCapitulo = Object.values(resultado).reduce(
    (acc, t) => acc + t.capitulos.filter((c) => c.atencao || c.modulo_pago || c.nao_prometer).length,
    0
  );
  const totalModuloPagoSecao = Object.values(resultado).filter((t) => t.modulo_pago).length;

  console.log(`[trilha-para-capitulos] OK — ${chaves.length} tutoriais (T0..T${TOTAL_TUTORIAIS_ESPERADO - 1}) gravados em ${OUTPUT_PATH}`);
  console.log(`[trilha-para-capitulos] ${totalCapitulos} capítulos · ${totalNotas} notas · ${totalFlagsCapitulo} flags de capítulo · ${totalModuloPagoSecao} seções com módulo pago no cabeçalho`);
  for (const code of esperadas) {
    const t = resultado[code];
    console.log(`  ${code} — ${t.titulo} (${t.capitulos.length} capítulos, ${t.notas.length} notas)`);
  }
  if (Object.keys(camposFaltando).length > 0) {
    console.warn("[trilha-para-capitulos] ATENÇÃO — campos ausentes na trilha (gravados como null):");
    for (const [code, campos] of Object.entries(camposFaltando)) {
      console.warn(`  ${code}: ${campos.join(", ")}`);
    }
  }
}

main();

// =============================================================================
// docArt/inline.ts — HTML inline → runs, e runs → linhas quebradas.
// =============================================================================
// O texto de um slot é HTML inline SIMPLES (o que o gestor digita no editor):
// `<strong>`, `<b>`, `<em>`, `<i>`, `<br>` e os `<span data-pmoc-var="...">`
// (já substituídos antes de chegar aqui). Blocos (`<p>`) viram parágrafos.
//
// A quebra de linha mora aqui mas NÃO mede sozinha: quem mede é o renderizador,
// porque só ele conhece a própria fonte (canvas no navegador,
// `font.widthOfTextAtSize` no pdf-lib). `layoutParagraph` recebe a função de
// medida injetada — é o que mantém a mesma regra de quebra nos dois mundos.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type { InlineRun, LaidOutLine, LaidOutPiece } from './types.ts';

/** Mede a largura de um trecho (em pt) com a formatação dada. */
export type MeasureFn = (
  text: string,
  opts: { bold: boolean; italic: boolean; size: number },
) => number;

const ENTITIES: Array<[RegExp, string]> = [
  [/&nbsp;/gi, ' '],
  [/&amp;/gi, '&'],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&#39;/gi, "'"],
];

function decodeEntities(value: string): string {
  let out = value;
  for (const [re, to] of ENTITIES) out = out.replace(re, to);
  return out;
}

/**
 * Converte HTML inline em PARÁGRAFOS de runs.
 *
 * - `<p>`, `<div>`, `<h1..6>` e `<br>` separam parágrafos/linhas duras.
 * - `<strong>`/`<b>` e `<em>`/`<i>` ligam o estilo (aninhados acumulam).
 * - Qualquer outra tag é ignorada (o texto dentro dela é mantido).
 * - Espaços em branco colapsam, igual HTML.
 *
 * Um parágrafo vazio é preservado como `[]` — é assim que o gestor cria um
 * respiro entre blocos de texto.
 */
export function parseInlineHtml(html: string): InlineRun[][] {
  if (!html) return [];

  const paragraphs: InlineRun[][] = [];
  let current: InlineRun[] = [];
  let bold = 0;
  let italic = 0;

  const pushText = (raw: string) => {
    const text = decodeEntities(raw).replace(/\s+/g, ' ');
    if (!text) return;
    const last = current[current.length - 1];
    // Funde runs vizinhos de mesmo estilo pra não fragmentar a medição.
    if (last && last.bold === bold > 0 && last.italic === italic > 0) {
      last.text += text;
      return;
    }
    current.push({ text, bold: bold > 0, italic: italic > 0 });
  };

  const breakParagraph = () => {
    // Apara o espaço de borda que o colapso deixou.
    trimEdges(current);
    paragraphs.push(current);
    current = [];
  };

  const tagRe = /<\s*(\/?)\s*([a-z][a-z0-9]*)\b[^>]*>/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    pushText(html.slice(cursor, match.index));
    cursor = tagRe.lastIndex;

    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();

    if (tag === 'br') {
      breakParagraph();
    } else if (tag === 'strong' || tag === 'b') {
      bold += closing ? -1 : 1;
      if (bold < 0) bold = 0;
    } else if (tag === 'em' || tag === 'i') {
      italic += closing ? -1 : 1;
      if (italic < 0) italic = 0;
    } else if (/^(p|div|h[1-6]|li)$/.test(tag)) {
      // Abrir ou fechar um bloco sempre encerra o parágrafo corrente; o
      // parágrafo vazio resultante de `</p><p>` é descartado logo abaixo.
      if (current.length > 0) breakParagraph();
      else if (closing) paragraphs.push([]);
    }
  }
  pushText(html.slice(cursor));
  if (current.length > 0) breakParagraph();

  // Remove parágrafos vazios nas pontas (ruído do editor), preserva os do meio.
  while (paragraphs.length > 0 && paragraphs[0].length === 0) paragraphs.shift();
  while (paragraphs.length > 0 && paragraphs[paragraphs.length - 1].length === 0) {
    paragraphs.pop();
  }
  return paragraphs;
}

function trimEdges(runs: InlineRun[]): void {
  if (runs.length === 0) return;
  runs[0].text = runs[0].text.replace(/^\s+/, '');
  runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i].text === '') runs.splice(i, 1);
  }
}

/** Aplica `text-transform` da spec sobre os runs já parseados. */
export function transformRuns(
  paragraphs: InlineRun[][],
  transform: 'none' | 'uppercase' | undefined,
): InlineRun[][] {
  if (transform !== 'uppercase') return paragraphs;
  return paragraphs.map((runs) =>
    runs.map((r) => ({ ...r, text: r.text.toLocaleUpperCase('pt-BR') })),
  );
}

interface Word {
  text: string;
  bold: boolean;
  italic: boolean;
  /** Espaço que separa esta palavra da anterior (some quando quebra a linha). */
  leadingSpace: boolean;
}

function toWords(runs: InlineRun[]): Word[] {
  const words: Word[] = [];
  // O separador pode estar no FIM de um run e a palavra seguinte no COMEÇO do
  // próximo ("A empresa " + <strong>"Engetec"</strong>). Sem carregar esse
  // espaço pendente de um run pro outro, o negrito gruda na palavra anterior.
  let pendingSpace = false;

  for (const run of runs) {
    const parts = run.text.split(' ');
    parts.forEach((part, i) => {
      // Toda parte a partir da segunda veio depois de um separador.
      if (i > 0) pendingSpace = true;
      if (part === '') return;
      words.push({
        text: part,
        bold: run.bold,
        italic: run.italic,
        leadingSpace: pendingSpace && words.length > 0,
      });
      pendingSpace = false;
    });
  }
  return words;
}

/**
 * Quebra UM parágrafo em linhas que cabem em `maxWidth` (pt), usando `measure`,
 * e devolve cada palavra JÁ POSICIONADA (`x` em pt a partir do início da linha).
 *
 * Posicionar palavra a palavra, em vez de emendar trechos, é deliberado: o
 * espaço entre palavras vira distância, nunca um glifo na borda de um trecho —
 * que é o que fazia o negrito grudar na palavra anterior no PDF.
 *
 * Palavra que sozinha não cabe fica na própria linha sem ser cortada: PDF de
 * certificado prefere estourar 1 mm a picar o nome do cliente no meio.
 */
export function layoutParagraph(
  runs: InlineRun[],
  opts: { maxWidth: number; size: number; letterSpacing?: number; measure: MeasureFn },
): LaidOutLine[] {
  const { maxWidth, size, measure } = opts;
  const spacing = opts.letterSpacing ?? 0;

  const widthOf = (text: string, bold: boolean, italic: boolean) =>
    text ? measure(text, { bold, italic, size }) + spacing * text.length : 0;

  const empty = (): LaidOutLine[] => [{ pieces: [], width: 0, paragraphIndex: 0 }];
  if (runs.length === 0) return empty();

  const words = toWords(runs);
  if (words.length === 0) return empty();

  const lines: LaidOutLine[] = [];
  let pieces: LaidOutPiece[] = [];
  let cursor = 0;

  const flush = () => {
    if (pieces.length === 0) return;
    lines.push({ pieces, width: cursor, paragraphIndex: 0 });
    pieces = [];
    cursor = 0;
  };

  for (const word of words) {
    const gap =
      word.leadingSpace && pieces.length > 0 ? widthOf(' ', word.bold, word.italic) : 0;
    const wordWidth = widthOf(word.text, word.bold, word.italic);

    if (pieces.length > 0 && cursor + gap + wordWidth > maxWidth) {
      flush();
      pieces.push({ text: word.text, bold: word.bold, italic: word.italic, x: 0 });
      cursor = wordWidth;
      continue;
    }

    cursor += gap;
    pieces.push({ text: word.text, bold: word.bold, italic: word.italic, x: cursor });
    cursor += wordWidth;
  }
  flush();

  return lines.length > 0 ? lines : empty();
}

/**
 * Quebra todos os parágrafos de um slot e aplica `maxLines`. Parágrafo vazio
 * vira uma linha em branco (o respiro que o gestor pediu).
 */
export function layoutParagraphs(
  paragraphs: InlineRun[][],
  opts: {
    maxWidth: number;
    size: number;
    letterSpacing?: number;
    maxLines?: number;
    measure: MeasureFn;
  },
): LaidOutLine[] {
  const out: LaidOutLine[] = [];
  paragraphs.forEach((runs, paragraphIndex) => {
    for (const line of layoutParagraph(runs, opts)) {
      if (opts.maxLines && out.length >= opts.maxLines) return;
      out.push({ ...line, paragraphIndex });
    }
  });
  return out;
}

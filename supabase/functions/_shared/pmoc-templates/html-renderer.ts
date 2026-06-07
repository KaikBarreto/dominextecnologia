// =============================================================================
// pmoc-templates/html-renderer.ts — Renderiza HTML sanitizado em páginas PDF.
// =============================================================================
// Parser simples: tags whitelist viram blocos com tipografia e espaçamento.
// pdf-lib não renderiza HTML diretamente — esse módulo é o "motor de layout"
// pro Termo RT e Certificado.
//
// Suporte:
//   - Blocos: <p>, <h1>, <h2>, <h3>, <ul>, <ol>, <li>, <br>
//   - Inline: <strong>/<b>, <em>/<i>, <u>, <a>
//   - Quebra automática de linha (word wrap por largura)
//   - Paginação automática (cria nova página quando passa do bottom margin)
// =============================================================================

import {
  PDFDocument,
  PDFPage,
  PDFFont,
  rgb,
  StandardFonts,
} from "https://esm.sh/pdf-lib@1.17.1";

// -----------------------------------------------------------------------------
// Configurações de layout (A4 portrait, mm em pt)
// -----------------------------------------------------------------------------

export const A4_W = 595.28;
export const A4_H = 841.89;
export const MARGIN_X = 60; // ~2.1cm
export const MARGIN_Y = 70; // ~2.5cm
export const CONTENT_W = A4_W - 2 * MARGIN_X;

// Tipografia base (tamanhos em pt)
const SIZE_H1 = 18;
const SIZE_H2 = 14;
const SIZE_H3 = 12;
const SIZE_P = 11;
const LINE_HEIGHT_P = 16;
const LINE_HEIGHT_H1 = 24;
const LINE_HEIGHT_H2 = 20;
const LINE_HEIGHT_H3 = 18;
const SPACING_AFTER_P = 8;
const SPACING_AFTER_H = 10;

const BLACK = rgb(0, 0, 0);

// -----------------------------------------------------------------------------
// Tokens inline
// -----------------------------------------------------------------------------

interface InlineToken {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  hrefLabel?: string; // se vier de <a>, anota label pra renderizar
}

interface Block {
  kind: "h1" | "h2" | "h3" | "p" | "li-ul" | "li-ol";
  index?: number; // para ol
  tokens: InlineToken[];
}

// -----------------------------------------------------------------------------
// Parser blocos
// -----------------------------------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Parse inline: pega string com tags inline (<strong>, <em>, <u>, <a>, <br>)
 * e retorna lista de tokens com flags bold/italic/underline.
 *
 * Implementação stack-based simples. Tolerante a tags mal-formadas (apenas
 * ignora se não casar).
 */
function parseInline(html: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const stack: Array<"strong" | "em" | "u" | "a"> = [];

  // Substitui <br>/<br/> por marcador de quebra
  const NL_MARK = "";
  const normalized = html.replace(/<br\s*\/?>/gi, NL_MARK);

  let i = 0;
  let buffer = "";

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    // Quebrar em \n
    const parts = buffer.split(NL_MARK);
    parts.forEach((part, idx) => {
      if (part.length > 0) {
        tokens.push({
          // Colapsa whitespace (inclui \n, \r, \t vindos do HTML-fonte) num
          // espaço único — semântica HTML padrão. Sem isso, um \n cru chega
          // ao pdf-lib e o WinAnsi lança "cannot encode \n (0x000a)" → 500.
          text: decodeEntities(part).replace(/\s+/g, " "),
          bold: stack.includes("strong"),
          italic: stack.includes("em"),
          underline: stack.includes("u") || stack.includes("a"),
        });
      }
      if (idx < parts.length - 1) {
        // forced linebreak
        tokens.push({
          text: NL_MARK,
          bold: false,
          italic: false,
          underline: false,
        });
      }
    });
    buffer = "";
  };

  while (i < normalized.length) {
    const ch = normalized[i];
    if (ch === "<") {
      // Tenta capturar tag
      const close = normalized.indexOf(">", i);
      if (close === -1) {
        buffer += ch;
        i++;
        continue;
      }
      const inner = normalized.slice(i + 1, close);
      const isClose = inner.startsWith("/");
      const tagName = (isClose ? inner.slice(1) : inner.split(/\s/)[0]).toLowerCase();
      if (
        tagName === "strong" ||
        tagName === "b" ||
        tagName === "em" ||
        tagName === "i" ||
        tagName === "u" ||
        tagName === "a"
      ) {
        flushBuffer();
        const norm: "strong" | "em" | "u" | "a" =
          tagName === "b" ? "strong" : tagName === "i" ? "em" : (tagName as "strong" | "em" | "u" | "a");
        if (isClose) {
          // Pop até casar
          for (let k = stack.length - 1; k >= 0; k--) {
            if (stack[k] === norm) {
              stack.splice(k, 1);
              break;
            }
          }
        } else {
          stack.push(norm);
        }
        i = close + 1;
        continue;
      }
      // tag desconhecida no inline — skipa
      i = close + 1;
      continue;
    }
    buffer += ch;
    i++;
  }
  flushBuffer();
  return tokens;
}

/**
 * Parse blocos: separa o HTML em uma lista de blocos. Cada bloco tem `kind`
 * e tokens inline.
 */
function parseBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  // Greedy match de blocos top-level
  const blockRegex =
    /<(h1|h2|h3|p|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  // Texto puro fora de blocos vira <p> implícito
  const fallbackP = (s: string) => {
    const trimmed = s.trim();
    if (!trimmed) return;
    blocks.push({ kind: "p", tokens: parseInline(trimmed) });
  };

  while ((m = blockRegex.exec(html)) !== null) {
    if (m.index > lastIndex) {
      fallbackP(html.slice(lastIndex, m.index));
    }
    const tag = m[1].toLowerCase();
    const inner = m[2];
    if (tag === "ul" || tag === "ol") {
      // Itens <li>
      const liRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
      let li: RegExpExecArray | null;
      let idx = 1;
      while ((li = liRegex.exec(inner)) !== null) {
        blocks.push({
          kind: tag === "ul" ? "li-ul" : "li-ol",
          index: idx,
          tokens: parseInline(li[1]),
        });
        idx++;
      }
    } else {
      blocks.push({
        kind: tag as Block["kind"],
        tokens: parseInline(inner),
      });
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < html.length) {
    fallbackP(html.slice(lastIndex));
  }
  return blocks;
}

// -----------------------------------------------------------------------------
// Word wrap por largura
// -----------------------------------------------------------------------------

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

function pickFont(fonts: Fonts, bold: boolean, italic: boolean): PDFFont {
  if (bold && italic) return fonts.boldItalic;
  if (bold) return fonts.bold;
  if (italic) return fonts.italic;
  return fonts.regular;
}

interface VisualToken {
  text: string;
  font: PDFFont;
  size: number;
  underline: boolean;
}

/**
 * Quebra tokens em linhas que cabem em maxWidth. Trata o marcador de \n
 * como quebra forçada.
 */
function wrapTokens(
  tokens: InlineToken[],
  fonts: Fonts,
  size: number,
  maxWidth: number,
): VisualToken[][] {
  const lines: VisualToken[][] = [];
  let current: VisualToken[] = [];
  let currentWidth = 0;

  for (const tok of tokens) {
    const font = pickFont(fonts, tok.bold, tok.italic);
    if (tok.text === "") {
      // forced break
      lines.push(current);
      current = [];
      currentWidth = 0;
      continue;
    }
    // Quebra por palavras
    const parts = tok.text.split(/(\s+)/);
    for (const p of parts) {
      if (!p) continue;
      const w = font.widthOfTextAtSize(p, size);
      if (currentWidth + w > maxWidth && current.length > 0) {
        // Quebra linha
        lines.push(current);
        current = [];
        currentWidth = 0;
        // skip espaços iniciais
        if (/^\s+$/.test(p)) continue;
      }
      current.push({ text: p, font, size, underline: tok.underline });
      currentWidth += w;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

// -----------------------------------------------------------------------------
// Renderer principal
// -----------------------------------------------------------------------------

export interface RenderHtmlOptions {
  cursorY: number;
  marginX?: number;
  marginY?: number;
  contentWidth?: number;
  /** Permite começar na página existente (não cria nova logo de cara) */
  startPage?: PDFPage;
  /** Página em branco a usar quando precisar paginar (callback) */
  newPage: () => PDFPage;
}

export interface RenderHtmlResult {
  page: PDFPage;
  cursorY: number;
  pagesRendered: number;
}

/**
 * Renderiza HTML sanitizado nas páginas do PDF. Cria novas páginas quando o
 * cursor passa do bottom margin. Retorna a página final + cursor + número de
 * páginas usadas.
 */
export async function renderHtmlToPdf(
  pdf: PDFDocument,
  html: string,
  opts: RenderHtmlOptions,
): Promise<RenderHtmlResult> {
  const marginX = opts.marginX ?? MARGIN_X;
  const marginY = opts.marginY ?? MARGIN_Y;
  const contentWidth = opts.contentWidth ?? CONTENT_W;
  const bottom = marginY;

  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };

  let page = opts.startPage ?? opts.newPage();
  let cursorY = opts.cursorY;
  let pagesRendered = opts.startPage ? 0 : 1;

  const blocks = parseBlocks(html);

  const ensureSpace = (needed: number) => {
    if (cursorY - needed < bottom) {
      page = opts.newPage();
      pagesRendered++;
      cursorY = A4_H - marginY;
    }
  };

  const drawLine = (line: VisualToken[], baselineY: number) => {
    let x = marginX;
    for (const tok of line) {
      page.drawText(tok.text, {
        x,
        y: baselineY,
        size: tok.size,
        font: tok.font,
        color: BLACK,
      });
      const w = tok.font.widthOfTextAtSize(tok.text, tok.size);
      if (tok.underline) {
        page.drawLine({
          start: { x, y: baselineY - 2 },
          end: { x: x + w, y: baselineY - 2 },
          thickness: 0.5,
          color: BLACK,
        });
      }
      x += w;
    }
  };

  for (const block of blocks) {
    let size = SIZE_P;
    let lineHeight = LINE_HEIGHT_P;
    let spacingAfter = SPACING_AFTER_P;
    let indent = 0;
    let prefix = "";

    if (block.kind === "h1") {
      size = SIZE_H1;
      lineHeight = LINE_HEIGHT_H1;
      spacingAfter = SPACING_AFTER_H;
    } else if (block.kind === "h2") {
      size = SIZE_H2;
      lineHeight = LINE_HEIGHT_H2;
      spacingAfter = SPACING_AFTER_H;
    } else if (block.kind === "h3") {
      size = SIZE_H3;
      lineHeight = LINE_HEIGHT_H3;
      spacingAfter = SPACING_AFTER_H;
    } else if (block.kind === "li-ul") {
      prefix = "•  ";
      indent = 20;
    } else if (block.kind === "li-ol") {
      prefix = `${block.index ?? 1}.  `;
      indent = 20;
    }

    // Pra headings, force bold em todos os tokens
    const tokens = block.tokens.map((t) =>
      block.kind === "h1" || block.kind === "h2" || block.kind === "h3"
        ? { ...t, bold: true }
        : t,
    );

    // Adiciona prefix de lista como primeiro token
    const finalTokens: InlineToken[] = prefix
      ? [{ text: prefix, bold: false, italic: false, underline: false }, ...tokens]
      : tokens;

    const lines = wrapTokens(finalTokens, fonts, size, contentWidth - indent);

    for (const line of lines) {
      ensureSpace(lineHeight);
      cursorY -= lineHeight;
      // Ajuste pra indent
      const savedMarginX = marginX;
      if (indent > 0) {
        // Re-draw com offset
        let x = savedMarginX + indent;
        for (const tok of line) {
          page.drawText(tok.text, {
            x,
            y: cursorY,
            size: tok.size,
            font: tok.font,
            color: BLACK,
          });
          const w = tok.font.widthOfTextAtSize(tok.text, tok.size);
          if (tok.underline) {
            page.drawLine({
              start: { x, y: cursorY - 2 },
              end: { x: x + w, y: cursorY - 2 },
              thickness: 0.5,
              color: BLACK,
            });
          }
          x += w;
        }
      } else {
        drawLine(line, cursorY);
      }
    }

    cursorY -= spacingAfter;
  }

  return { page, cursorY, pagesRendered };
}

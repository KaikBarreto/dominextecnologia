// =============================================================================
// doc-art/spec-pdf.ts — Desenha uma spec de arte em uma página PDF (pdf-lib).
// =============================================================================
// Gêmeo do `DocArtSvgRenderer.tsx`: recebe a MESMA spec resolvida e desenha com
// pdf-lib. A regra de quebra de linha, as cores e a geometria vêm dos módulos
// compartilhados (`types.ts` / `inline.ts` / `resolve.ts`), que são cópias
// byte-a-byte das do front — `src/lib/docArt/parity.test.ts` quebra o build se
// divergirem.
//
// Diferenças de sistema de coordenadas tratadas aqui (e SÓ aqui):
//   - a spec tem origem no topo-esquerda com `y` pra baixo; o PDF tem origem
//     embaixo-esquerda com `y` pra cima  → `toPdfY()`;
//   - a spec gira no sentido horário visto na tela; no PDF o ângulo positivo
//     é anti-horário → o ângulo entra NEGADO.
//
// Este arquivo NÃO é compartilhado com o front (depende de pdf-lib).
// =============================================================================

import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  degrees,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";

import {
  DISPLAY_BOLD,
  DISPLAY_REGULAR,
  SANS_BOLD,
  SANS_REGULAR,
} from "./fonts/data.ts";

import type {
  DocArtConfig,
  DocArtImageRef,
  DocArtTemplate,
  ResolvedShape,
  ResolvedTextShape,
} from "./types.ts";
import { layoutParagraphs, type MeasureFn } from "./inline.ts";
import {
  alignOffsetMm,
  lineBaselineMm,
  mmToPt,
  parseHex,
  ptToMm,
  resolveDocArt,
  type ResolveOptions,
} from "./resolve.ts";

// -----------------------------------------------------------------------------
// Imagens
// -----------------------------------------------------------------------------

export interface DocArtImageBytes {
  data: Uint8Array;
  /** `png` e `jpg` são os únicos formatos que o pdf-lib embute. */
  format: "png" | "jpg";
}

export type DocArtImageSources = Partial<
  Record<DocArtImageRef, DocArtImageBytes | null | undefined>
>;

// -----------------------------------------------------------------------------
// Fontes
// -----------------------------------------------------------------------------

interface FontSet {
  regular: PDFFont;
  bold: PDFFont;
}

/** base64 → bytes, uma vez por face por execução do módulo. */
const decoded = new Map<string, Uint8Array>();
function toBytes(base64: string): Uint8Array {
  const cached = decoded.get(base64);
  if (cached) return cached;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  decoded.set(base64, bytes);
  return bytes;
}

async function embedFonts(
  pdf: PDFDocument,
): Promise<Record<"sans" | "display", FontSet>> {
  // `subset: true` deixa no PDF só os glifos usados — o certificado inteiro
  // acaba menor que o bundle das fontes.
  const embed = (data: string) =>
    pdf.embedFont(toBytes(data), { subset: true, customName: undefined });

  const [displayRegular, displayBold, sansRegular, sansBold] = await Promise.all([
    embed(DISPLAY_REGULAR),
    embed(DISPLAY_BOLD),
    embed(SANS_REGULAR),
    embed(SANS_BOLD),
  ]);

  return {
    display: { regular: displayRegular, bold: displayBold },
    sans: { regular: sansRegular, bold: sansBold },
  };
}

/**
 * Não embutimos faces itálicas: num certificado o itálico aparece em um ou
 * outro trecho e não compensa dobrar o peso do bundle por isso. `<em>` cai na
 * face normal do mesmo peso.
 */
function pickFont(set: FontSet, bold: boolean, _italic: boolean): PDFFont {
  return bold ? set.bold : set.regular;
}

/**
 * As fontes padrão do PDF usam WinAnsi, que cobre todo o português mas não
 * cobre símbolos soltos que podem vir colados de outro lugar. pdf-lib LANÇA ao
 * encontrar um caractere não codificável — e aí o gestor perde o PDF inteiro
 * por causa de um emoji no nome do cliente. Troca o que dá, descarta o resto.
 */
const WINANSI_SUBSTITUTIONS: Array<[RegExp, string]> = [
  [/[\u2018\u2019\u201B]/g, "'"],
  [/[\u201C\u201D\u201F]/g, '"'],
  [/[\u2010\u2011\u2212]/g, "-"],
  [/[\u00A0\u2007\u202F\u2009]/g, " "],
  [/\u2026/g, "..."],
  [/\u2022/g, "\u00B7"],
];

/**
 * Latin-1 imprimível + os poucos extras que o WinAnsi acrescenta e que
 * aparecem de verdade em texto PT-BR (euro, en dash, em dash).
 */
const WINANSI_ALLOWED = /[^\u0020-\u007E\u00A0-\u00FF\u20AC\u2013\u2014]/g;

export function sanitizeForWinAnsi(text: string): string {
  let out = text;
  for (const [re, to] of WINANSI_SUBSTITUTIONS) out = out.replace(re, to);
  // Sobrou algo fora da tabela? Fora — melhor perder um emoji que o PDF.
  return out.replace(WINANSI_ALLOWED, "");
}

/**
 * ⚠️ Mede CARACTERE A CARACTERE, de propósito.
 *
 * `font.widthOfTextAtSize(frase)` do pdf-lib soma o KERNING dos pares, mas o
 * `drawText` emite um `Tj` simples, que o leitor de PDF desenha SEM kerning.
 * Medir com kerning e desenhar sem deixa o traço mais largo que a medida, e a
 * sobra come o espaço da palavra seguinte — era o que fazia "São Paulo/SP, está"
 * sair "São Paulo/SP,está". Um caractere sozinho não forma par, então somar
 * caractere a caractere devolve exatamente a largura que será desenhada.
 */
function makeMeasure(set: FontSet): MeasureFn {
  return (text, { bold, italic, size }) => {
    const font = pickFont(set, bold, italic);
    try {
      let total = 0;
      for (const char of sanitizeForWinAnsi(text)) {
        total += font.widthOfTextAtSize(char, size);
      }
      return total;
    } catch {
      return text.length * size * 0.5;
    }
  };
}

// -----------------------------------------------------------------------------
// Cor
// -----------------------------------------------------------------------------

function toRgb(hex: string | undefined) {
  const parsed = parseHex(hex);
  if (!parsed) return undefined;
  return rgb(parsed[0] / 255, parsed[1] / 255, parsed[2] / 255);
}

// -----------------------------------------------------------------------------
// Desenho
// -----------------------------------------------------------------------------

export interface DrawDocArtOptions extends ResolveOptions {
  images?: DocArtImageSources;
}

/**
 * Adiciona ao `pdf` uma página com a arte desenhada e devolve a página.
 *
 * A orientação (retrato/paisagem) vem do template, não do chamador — é parte
 * do desenho, não uma preferência avulsa.
 */
export async function drawDocArtPage(
  pdf: PDFDocument,
  template: DocArtTemplate,
  config: DocArtConfig | undefined,
  options: DrawDocArtOptions = {},
): Promise<PDFPage> {
  const art = resolveDocArt(template, config, {
    substitute: options.substitute,
    brand: options.brand,
  });

  const pageW = mmToPt(art.page.w);
  const pageH = mmToPt(art.page.h);
  const page = pdf.addPage([pageW, pageH]);

  pdf.registerFontkit(fontkit);
  const fonts = await embedFonts(pdf);
  const measures: Record<"sans" | "display", MeasureFn> = {
    sans: makeMeasure(fonts.sans),
    display: makeMeasure(fonts.display),
  };

  const embedded = await embedImages(pdf, options.images);

  /** mm medido do topo → pt medido da base. */
  const toPdfY = (mm: number) => pageH - mmToPt(mm);

  for (const shape of art.shapes) {
    drawShape(page, shape, { fonts, measures, embedded, toPdfY, pageH });
  }

  return page;
}

async function embedImages(
  pdf: PDFDocument,
  images: DocArtImageSources | undefined,
): Promise<Partial<Record<DocArtImageRef, PDFImage>>> {
  const out: Partial<Record<DocArtImageRef, PDFImage>> = {};
  if (!images) return out;

  for (const key of Object.keys(images) as DocArtImageRef[]) {
    const entry = images[key];
    if (!entry || !entry.data || entry.data.length === 0) continue;
    try {
      out[key] =
        entry.format === "png" ? await pdf.embedPng(entry.data) : await pdf.embedJpg(entry.data);
    } catch (err) {
      // Logo corrompido não pode derrubar o certificado inteiro — o shape
      // simplesmente não aparece.
      console.warn(`[doc-art] falha ao embutir imagem "${key}":`, err);
    }
  }
  return out;
}

interface DrawCtx {
  fonts: Record<"sans" | "display", FontSet>;
  measures: Record<"sans" | "display", MeasureFn>;
  embedded: Partial<Record<DocArtImageRef, PDFImage>>;
  toPdfY: (mm: number) => number;
  pageH: number;
}

function drawShape(page: PDFPage, shape: ResolvedShape, ctx: DrawCtx): void {
  switch (shape.kind) {
    case "rect": {
      page.drawRectangle({
        x: mmToPt(shape.x),
        // pdf-lib ancora o retângulo no canto INFERIOR-esquerdo.
        y: ctx.toPdfY(shape.y + shape.h),
        width: mmToPt(shape.w),
        height: mmToPt(shape.h),
        color: toRgb(shape.fill),
        borderColor: toRgb(shape.stroke),
        borderWidth: shape.strokeWidth ? mmToPt(shape.strokeWidth) : undefined,
        opacity: shape.opacity,
        borderOpacity: shape.opacity,
      });
      return;
    }

    case "circle": {
      page.drawCircle({
        x: mmToPt(shape.cx),
        y: ctx.toPdfY(shape.cy),
        size: mmToPt(shape.r),
        color: toRgb(shape.fill),
        borderColor: toRgb(shape.stroke),
        borderWidth: shape.strokeWidth ? mmToPt(shape.strokeWidth) : undefined,
        opacity: shape.opacity,
        borderOpacity: shape.opacity,
      });
      return;
    }

    case "line": {
      page.drawLine({
        start: { x: mmToPt(shape.x1), y: ctx.toPdfY(shape.y1) },
        end: { x: mmToPt(shape.x2), y: ctx.toPdfY(shape.y2) },
        thickness: mmToPt(shape.strokeWidth),
        color: toRgb(shape.stroke),
        opacity: shape.opacity,
        dashArray: shape.dash ? shape.dash.map(mmToPt) : undefined,
      });
      return;
    }

    case "path": {
      // `drawSvgPath` já interpreta o path com y pra BAIXO a partir de (x, y).
      // Ancorando no topo-esquerdo da folha, o `d` em mm entra direto, só
      // escalado de mm pra pt.
      page.drawSvgPath(shape.d, {
        x: 0,
        y: ctx.pageH,
        scale: mmToPt(1),
        color: toRgb(shape.fill),
        borderColor: toRgb(shape.stroke),
        borderWidth: shape.strokeWidth ? mmToPt(shape.strokeWidth) : undefined,
        opacity: shape.opacity,
        borderOpacity: shape.opacity,
      });
      return;
    }

    case "image": {
      const image = ctx.embedded[shape.src];
      if (!image) return;

      // A plaqueta é desenhada aqui dentro, DEPOIS do early return acima: é o
      // que garante que ela não apareça sozinha quando não há imagem.
      if (shape.plate) {
        const pad = mmToPt(shape.platePadding ?? 3);
        page.drawRectangle({
          x: mmToPt(shape.x) - pad,
          y: ctx.toPdfY(shape.y + shape.h) - pad,
          width: mmToPt(shape.w) + pad * 2,
          height: mmToPt(shape.h) + pad * 2,
          color: toRgb(shape.plate),
        });
      }

      const box = { w: mmToPt(shape.w), h: mmToPt(shape.h) };
      // `contain`: encaixa preservando proporção, igual ao `meet` do SVG.
      const scale = Math.min(box.w / image.width, box.h / image.height);
      const w = image.width * scale;
      const h = image.height * scale;

      const freeX = box.w - w;
      const offsetX =
        shape.align === "left" ? 0 : shape.align === "right" ? freeX : freeX / 2;
      const freeY = box.h - h;
      // `valign` é medido do TOPO (como na spec); converte pro offset de baixo.
      const offsetFromTop =
        shape.valign === "top" ? 0 : shape.valign === "bottom" ? freeY : freeY / 2;

      page.drawImage(image, {
        x: mmToPt(shape.x) + offsetX,
        y: ctx.toPdfY(shape.y) - offsetFromTop - h,
        width: w,
        height: h,
        opacity: shape.opacity,
      });
      return;
    }

    case "text":
      drawText(page, shape, ctx);
      return;
  }
}

function drawText(page: PDFPage, shape: ResolvedTextShape, ctx: DrawCtx): void {
  const set = ctx.fonts[shape.font];
  const measure = ctx.measures[shape.font];
  const color = toRgb(shape.color) ?? rgb(0, 0, 0);
  const spacing = shape.letterSpacing ?? 0;

  const lines = layoutParagraphs(shape.paragraphs, {
    maxWidth: mmToPt(shape.w),
    size: shape.size,
    letterSpacing: shape.letterSpacing,
    maxLines: shape.maxLines,
    measure,
  });

  // A rotação da spec é horária na tela; no PDF o ângulo positivo é
  // anti-horário, então entra negado. O pivô é (x, y) da caixa.
  const rotation = shape.rotate ? -shape.rotate : 0;
  const pivot = rotation
    ? { x: mmToPt(shape.x), y: ctx.toPdfY(shape.y) }
    : null;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  /**
   * Converte um ponto do sistema NÃO rotacionado (pt, origem no PDF) pro
   * sistema final. Sem rotação é identidade.
   */
  const place = (x: number, y: number): { x: number; y: number } => {
    if (!pivot) return { x, y };
    const dx = x - pivot.x;
    const dy = y - pivot.y;
    return {
      x: pivot.x + dx * cos - dy * sin,
      y: pivot.y + dx * sin + dy * cos,
    };
  };

  lines.forEach((line, index) => {
    if (line.pieces.length === 0) return;

    const originX = mmToPt(shape.x + alignOffsetMm(shape.align, shape.w, line.width));
    const baselineY = ctx.toPdfY(
      lineBaselineMm(
        shape.y,
        shape.lineHeight,
        shape.size,
        index,
        (shape.paragraphSpacing ?? 0) * line.paragraphIndex,
      ),
    );

    for (const piece of line.pieces) {
      const font = pickFont(set, piece.bold, piece.italic);
      const text = sanitizeForWinAnsi(piece.text);
      if (!text) continue;

      // Cada palavra vai na posição que o layout calculou. Com letter-spacing
      // (títulos caixa-alta) não há opção nativa no pdf-lib, então o avanço
      // entre caracteres é feito aqui.
      let cursorX = originX + piece.x;
      const chunks = spacing > 0 ? Array.from(text) : [text];

      for (const chunk of chunks) {
        const at = place(cursorX, baselineY);
        try {
          page.drawText(chunk, {
            x: at.x,
            y: at.y,
            size: shape.size,
            font,
            color,
            opacity: shape.opacity,
            rotate: rotation ? degrees(rotation) : undefined,
          });
        } catch (err) {
          console.warn("[doc-art] trecho ignorado ao desenhar texto:", err);
        }
        cursorX += font.widthOfTextAtSize(chunk, shape.size) + spacing * chunk.length;
      }
    }
  });
}

/** Reexport pra quem só precisa do tipo no call site da edge function. */
export { ptToMm };

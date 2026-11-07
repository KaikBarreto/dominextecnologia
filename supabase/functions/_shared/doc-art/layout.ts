import { layoutParagraphs, type MeasureFn } from './inline.ts';
import { mmToPt, ptToMm } from './resolve.ts';
import type { DocArtLayoutRole, LaidOutLine, ResolvedDocArt, ResolvedShape, ResolvedTextShape } from './types.ts';

export type DocArtMeasures = Record<'sans' | 'display', MeasureFn>;
const labels = {
  sobretitulo: 'Referência', titulo: 'Título', subtitulo: 'Subtítulo', corpo: 'Texto do certificado',
  destaque: 'Plano de manutenção', assinaturaTitulo: 'Título do responsável técnico',
  assinaturaNome: 'Responsável técnico', assinaturaCargo: 'Registro profissional',
  produtoTitulo: 'Título dos produtos utilizados', produto: 'Produto utilizado',
  lateral: 'Emissão e validade', validacao: 'Validação do certificado', rodape: 'Dados da empresa',
};

function measureLines(shape: ResolvedTextShape, measures: DocArtMeasures): LaidOutLine[] {
  return layoutParagraphs(shape.paragraphs, {
    maxWidth: mmToPt(shape.w), size: shape.size, letterSpacing: shape.letterSpacing,
    measure: measures[shape.font], breakLongWords: true,
  });
}

function lineBottom(shape: ResolvedTextShape, line: LaidOutLine, index: number) {
  return ptToMm(index * shape.lineHeight + shape.size + (shape.paragraphSpacing ?? 0) * line.paragraphIndex);
}

function countFitting(shape: ResolvedTextShape, lines: LaidOutLine[], height: number) {
  let count = 0;
  for (const [index, line] of lines.entries()) {
    if (lineBottom(shape, line, index) > height + 0.01) break;
    count++;
  }
  return count;
}

function shapeVerticalBounds(shape: ResolvedShape): { top: number; bottom: number } | null {
  if (shape.kind === 'text') {
    const lines = shape.lines ?? [];
    const height = lines.length ? lineBottom(shape, lines[lines.length - 1], lines.length - 1) : 0;
    return { top: shape.y, bottom: shape.y + height };
  }
  if (shape.kind === 'rect' || shape.kind === 'image') return { top: shape.y, bottom: shape.y + shape.h };
  if (shape.kind === 'circle') return { top: shape.cy - shape.r, bottom: shape.cy + shape.r };
  if (shape.kind === 'line') return { top: Math.min(shape.y1, shape.y2), bottom: Math.max(shape.y1, shape.y2) };
  return null;
}

function roleBounds(shapes: ResolvedShape[], role: DocArtLayoutRole) {
  const bounds = shapes.flatMap(shape => shape.layoutRole === role ? [shapeVerticalBounds(shape)] : []).filter((value): value is { top: number; bottom: number } => value !== null);
  if (!bounds.length) return null;
  return { top: Math.min(...bounds.map(value => value.top)), bottom: Math.max(...bounds.map(value => value.bottom)) };
}

function shiftShapeVertically(shape: ResolvedShape, offset: number): ResolvedShape {
  if (!offset) return shape;
  if (shape.kind === 'text' || shape.kind === 'rect' || shape.kind === 'image') return { ...shape, y: shape.y + offset };
  if (shape.kind === 'circle') return { ...shape, cy: shape.cy + offset };
  if (shape.kind === 'line') return { ...shape, y1: shape.y1 + offset, y2: shape.y2 + offset };
  if (shape.kind === 'path') return { ...shape, d: translatePathVertically(shape.d, offset) };
  return shape;
}

function translatePathVertically(path: string, offset: number): string {
  const arity: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2 };
  const yParameters: Record<string, number[]> = { M: [1], L: [1], V: [0], C: [1, 3, 5], S: [1, 3], Q: [1, 3], T: [1] };
  let command = '';
  let index = 0;
  return path.replace(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi, token => {
    if (/^[A-Za-z]$/.test(token)) {
      command = token.toUpperCase();
      index = 0;
      return token;
    }
    const parameter = index++ % (arity[command] ?? 1);
    if (!(yParameters[command] ?? []).includes(parameter)) return token;
    return String(Number(token) + offset);
  });
}

/**
 * Distribui os quatro blocos centrais usando a altura que o texto realmente
 * ocupou. O último bloco mantém a âncora inferior da arte; os três intervalos
 * passam a ter exatamente a mesma medida, tanto em OS curta quanto em contrato.
 */
function balanceCertificateVerticalRhythm(shapes: ResolvedShape[]): ResolvedShape[] {
  const body = shapes.find((shape): shape is ResolvedTextShape => shape.kind === 'text' && shape.slot === 'corpo');
  const bodyBounds = body ? shapeVerticalBounds(body) : null;
  const meta = roleBounds(shapes, 'certificateMeta');
  const details = roleBounds(shapes, 'certificateDetails');
  const highlight = roleBounds(shapes, 'certificateHighlight');
  if (!bodyBounds || !meta || !details || !highlight) return shapes;

  const metaHeight = meta.bottom - meta.top;
  const detailsHeight = details.bottom - details.top;
  const highlightHeight = highlight.bottom - highlight.top;
  const free = highlight.bottom - bodyBounds.bottom - metaHeight - detailsHeight - highlightHeight;
  const gap = Math.max(2.5, free / 3);
  const metaTop = bodyBounds.bottom + gap;
  const detailsTop = metaTop + metaHeight + gap;
  const highlightTop = detailsTop + detailsHeight + gap;
  const offsets: Partial<Record<DocArtLayoutRole, number>> = {
    certificateMeta: metaTop - meta.top,
    certificateDetails: detailsTop - details.top,
    certificateHighlight: highlightTop - highlight.top,
  };
  return shapes.map(shape => shiftShapeVertically(shape, offsets[shape.layoutRole ?? 'validationSeal'] ?? 0));
}

/**
 * Mede as caixas sem truncar conteúdo. Ajustes curtos reduzem discretamente a
 * fonte; textos extensos ganham páginas de continuação, na mesma spec do PDF.
 */
export function paginateDocArt(art: ResolvedDocArt, measures: DocArtMeasures): ResolvedDocArt[] {
  const overflow: Array<{ shape: ResolvedTextShape; lines: LaidOutLine[] }> = [];
  const shapes = art.shapes.map((original): ResolvedShape => {
    if (original.kind !== 'text') return original;
    let shape = { ...original };
    const height = shape.h ?? ptToMm((shape.maxLines ?? 4) * shape.lineHeight + (shape.paragraphSpacing ?? 0));
    let lines = measureLines(shape, measures);
    const minSize = Math.min(shape.size, shape.slot === 'titulo' ? 22 : shape.slot === 'corpo' ? 9 : 7);
    while (countFitting(shape, lines, height) < lines.length && shape.size > minSize) {
      const size = Math.max(minSize, shape.size - 0.5);
      const ratio = size / shape.size;
      shape = { ...shape, size, lineHeight: shape.lineHeight * ratio, letterSpacing: (shape.letterSpacing ?? 0) * ratio };
      lines = measureLines(shape, measures);
    }
    const fitting = countFitting(shape, lines, height);
    if (fitting < lines.length) overflow.push({ shape, lines: lines.slice(fitting) });
    return { ...shape, maxLines: undefined, lines: lines.slice(0, fitting) };
  });
  const pages: ResolvedDocArt[] = [{ ...art, shapes: balanceCertificateVerticalRhythm(shapes) }];
  const ink = art.shapes.find((s): s is ResolvedTextShape => s.kind === 'text' && s.slot === 'corpo')?.color ?? '#111815';
  const heading = (slot: ResolvedTextShape['slot'], text: string, y: number, size: number): ResolvedTextShape => ({
    kind: 'text', slot, x: 22, y, w: art.page.w - 44, h: 14, font: 'sans', weight: 'bold', size, lineHeight: size * 1.4,
    align: 'left', color: ink, paragraphs: [[{ text, bold: true, italic: false }]],
  });
  let continuation: ResolvedDocArt | null = null;
  let cursor = 0;
  const newPage = () => {
    continuation = { ...art, shapes: [
      { kind: 'rect', x: 0, y: 0, w: art.page.w, h: art.page.h, fill: art.theme.paper },
      { kind: 'rect', x: 0, y: 0, w: art.page.w, h: 2, fill: art.theme.accent },
      heading('subtitulo', 'Certificado de conformidade · continuação', 20, 14),
      { kind: 'line', x1: 22, y1: 35, x2: art.page.w - 22, y2: 35, stroke: ink, strokeWidth: 0.2, opacity: 0.2 },
    ] };
    pages.push(continuation);
    cursor = 44;
  };
  for (const { shape, lines: remaining } of overflow) {
    let offset = 0;
    while (offset < remaining.length) {
      if (!continuation || cursor + 24 > art.page.h - 24) newPage();
      continuation!.shapes.push(heading('subtitulo', labels[shape.slot], cursor, 9));
      cursor += 8;
      const firstParagraph = remaining[offset].paragraphIndex;
      const candidate = remaining.slice(offset).map(line => ({ ...line, paragraphIndex: line.paragraphIndex - firstParagraph }));
      const block = { ...shape, x: 22, y: cursor, w: shape.w, rotate: undefined, align: 'left' as const };
      const fit = Math.max(1, countFitting(block, candidate, art.page.h - 24 - cursor));
      const lines = candidate.slice(0, fit);
      continuation!.shapes.push({ ...block, h: undefined, maxLines: undefined, lines });
      cursor += lineBottom(block, lines[lines.length - 1], lines.length - 1) + 10;
      offset += fit;
    }
  }
  if (pages.length > 1) {
    pages.forEach((page, index) => {
      const logo = page.shapes.find(s => s.kind === 'image' && s.src === 'logo');
      page.shapes.push({
        ...heading('subtitulo', `Página ${index + 1} de ${pages.length}`, index === 0 ? 41 : 37, 6),
        x: logo && logo.kind === 'image' ? logo.x : 22, w: 53, h: 4,
      });
    });
  }
  return pages;
}

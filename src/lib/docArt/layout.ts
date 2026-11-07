import { layoutParagraphs, type MeasureFn } from './inline.ts';
import { mmToPt, ptToMm } from './resolve.ts';
import type { LaidOutLine, ResolvedDocArt, ResolvedShape, ResolvedTextShape } from './types.ts';

export type DocArtMeasures = Record<'sans' | 'display', MeasureFn>;
const labels = {
  sobretitulo: 'Referência', titulo: 'Título', subtitulo: 'Subtítulo', corpo: 'Texto do certificado',
  destaque: 'Plano de manutenção', assinaturaNome: 'Responsável técnico', assinaturaCargo: 'Registro profissional',
  lateral: 'Emissão e validade', rodape: 'Dados da empresa',
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
  const pages: ResolvedDocArt[] = [{ ...art, shapes }];
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

import type { DocArtConditionalShape, DocArtTemplate, Orientation } from '../types.ts';
import { CERTIFICADO_DEFAULT_SLOTS } from './slots.ts';
import { text } from './blocks.ts';

interface CertificateOptions {
  slug: string;
  name: string;
  orientation: Orientation;
  dark?: boolean;
  motif: 'frame' | 'wave' | 'seal' | 'split' | 'portal' | 'stripe' | 'grid' | 'prism' | 'circuit' | 'minimal';
}

/** Um sistema editorial comum, com artes vetoriais próprias e caixas protegidas. */
export function createCertificateTemplate(options: CertificateOptions): DocArtTemplate {
  const { slug, name, orientation, motif, dark = false } = options;
  const landscape = orientation === 'landscape';
  const w = landscape ? 297 : 210, h = landscape ? 210 : 297;
  const margin = landscape ? 25 : 22;
  const split = motif === 'split';
  const x = split ? 98 : margin;
  const contentW = w - x - margin;
  const shapes: DocArtConditionalShape[] = [];
  const rect = (x: number, y: number, width: number, height: number, fill: string, opacity = 1) =>
    shapes.push({ shape: { kind: 'rect', x, y, w: width, h: height, fill, opacity } });
  const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, opacity = 1, strokeWidth = 0.3) =>
    shapes.push({ shape: { kind: 'line', x1, y1, x2, y2, stroke, opacity, strokeWidth } });
  const path = (d: string, fill: string, opacity = 1) => shapes.push({ shape: { kind: 'path', d, fill, opacity } });
  rect(0, 0, w, h, 'paper');

  if (motif === 'frame') {
    rect(11, 11, w - 22, h - 22, 'paper');
    line(11, 11, w - 11, 11, 'accent', 0.8, 0.6);
    line(11, h - 11, w - 11, h - 11, 'ink', 0.15);
    line(11, 11, 11, 34, 'accent', 0.8, 0.6);
    line(w - 11, h - 34, w - 11, h - 11, 'accent', 0.8, 0.6);
  } else if (motif === 'wave') {
    path(`M 0,${h - 16} C ${w * 0.3},${h - 38} ${w * 0.65},${h + 3} ${w},${h - 25} L ${w},${h} L 0,${h} Z`, 'accent', 0.2);
    path(`M 0,${h - 8} C ${w * 0.4},${h - 27} ${w * 0.7},${h + 9} ${w},${h - 13} L ${w},${h} L 0,${h} Z`, 'primary');
  } else if (motif === 'seal') {
    rect(w - 62, 0, 62, 49, 'primary');
    path(`M ${w - 62},49 L ${w - 31},65 L ${w},49 Z`, 'primary');
    line(w - 48, 20, w - 37, 31, 'onPrimary', 1, 1.2);
    line(w - 37, 31, w - 16, 12, 'onPrimary', 1, 1.2);
    rect(0, h - 3, w, 3, 'accent');
  } else if (split) {
    rect(0, 0, 78, h, 'primary');
    rect(78, 0, 2, h, 'accent');
    for (let y = 20; y < h - 10; y += 9) line(16, y, 62, y, 'onPrimary', 0.06);
  } else if (motif === 'portal') {
    rect(0, 0, w, 10, 'primary');
    rect(w - 10, 10, 10, 60, 'accent');
    line(margin, 52, w - margin, 52, 'ink', 0.15);
  } else if (motif === 'stripe') {
    rect(0, 0, 9, h, 'primary');
    rect(9, 0, 2, h, 'accent');
    rect(w - 37, 18, 15, 3, 'accent');
  } else if (motif === 'grid') {
    for (let gx = 0; gx < w; gx += 7) line(gx, 0, gx, 48, 'ink', 0.055, 0.16);
    for (let gy = 0; gy <= 48; gy += 7) line(0, gy, w, gy, 'ink', 0.055, 0.16);
    line(margin, 49, w - margin, 49, 'accent', 1, 0.7);
  } else if (motif === 'prism') {
    path(`M ${w - 70},0 L ${w},0 L ${w},88 Z`, 'primary', 0.8);
    path(`M ${w - 46},0 L ${w},0 L ${w},58 Z`, 'accent', 0.7);
    path(`M ${w - 26},${h} L ${w},${h - 28} L ${w},${h} Z`, 'accent', 0.35);
  } else if (motif === 'circuit') {
    for (let i = 0; i < 4; i++) {
      const y = 17 + i * 10, start = w - 75 + i * 10;
      shapes.push({ shape: { kind: 'path', d: `M ${w},${y} L ${start + 13},${y} L ${start},${y + 13} L ${start - 12},${y + 13}`, stroke: 'accent', strokeWidth: 0.35, opacity: 0.4 } });
      shapes.push({ shape: { kind: 'circle', cx: start - 12, cy: y + 13, r: 0.9, fill: 'accent', opacity: 0.7 } });
    }
    rect(0, 0, 3, h, 'accent');
  } else {
    rect(0, 0, w, 3, 'accent');
    line(margin, 48, w - margin, 48, 'ink', 0.15);
  }

  // O logo é analisado pelos dois renderizadores. A placa neutra é só fallback
  // de segurança, nunca um retângulo branco imposto pelo tema escuro.
  rect(x, 18, 9, 1.1, 'primary');
  shapes.push({ shape: { kind: 'image', src: 'logo', x, y: 23, w: 53, h: 15, align: 'left', plate: '#757575', platePadding: 2.5 } });
  const titleY = landscape ? 58 : 69;
  const bodyY = landscape ? 103 : 119;
  const bodyH = landscape ? 34 : 72;
  const highlightY = bodyY + bodyH + 6;
  const signatureY = landscape ? 154 : 232;
  const addText = (slot: Parameters<typeof text>[0]['slot'], y: number, size: number, height: number, weight: 'regular' | 'bold' = 'regular', color = 'ink') => {
    const shape = text({ slot, x, y, w: contentW, size, lineHeight: size * 1.5, weight, color, paragraphSpacing: slot === 'corpo' ? 5 : 0 });
    if (shape.shape.kind === 'text') shape.shape.h = height;
    shapes.push(shape);
  };
  addText('sobretitulo', titleY - 12, 7.4, 8, 'regular', 'inkSoft');
  addText('titulo', titleY, landscape ? 36 : 31, 20, 'bold');
  addText('subtitulo', titleY + 22, 11, 11, 'regular', 'inkSoft');
  line(x, bodyY - 7, x + Math.min(contentW, 54), bodyY - 7, 'accent', 1, 0.9);
  addText('corpo', bodyY, landscape ? 10 : 10.5, bodyH);
  addText('destaque', highlightY, 11, landscape ? 9 : 13, 'bold');
  const signatureW = Math.min(92, contentW * 0.58);
  shapes.push(
    { requires: 'signature', shape: { kind: 'image', src: 'signature', x, y: signatureY - 1, w: signatureW, h: 11, align: 'left', valign: 'bottom' } },
    { requires: 'signature', shape: { kind: 'line', x1: x, y1: signatureY + 12, x2: x + signatureW, y2: signatureY + 12, stroke: 'inkSoft', strokeWidth: 0.25 } },
  );
  const nameShape = text({ slot: 'assinaturaNome', x, y: signatureY + 15, w: signatureW, size: 8.5, lineHeight: 11, weight: 'bold' });
  const roleShape = text({ slot: 'assinaturaCargo', x, y: signatureY + 24, w: signatureW, size: 7, lineHeight: 9.5, color: 'inkSoft' });
  if (nameShape.shape.kind === 'text') nameShape.shape.h = landscape ? 7 : 8;
  if (roleShape.shape.kind === 'text') roleShape.shape.h = landscape ? 6 : 7;
  shapes.push({ ...nameShape, requires: 'signature' }, { ...roleShape, requires: 'signature' });
  addText('lateral', landscape ? 178 : 270, 6.8, landscape ? 12 : 7, 'regular', 'inkSoft');
  const lateral = shapes[shapes.length - 1].shape;
  if (lateral.kind === 'text' && landscape) {
    lateral.x = x + signatureW + 8;
    lateral.w = contentW - signatureW - 8;
  }
  const footer = text({ slot: 'rodape', x, y: h - 17, w: contentW, size: 6.8, lineHeight: 9, color: 'inkSoft' });
  if (footer.shape.kind === 'text') footer.shape.h = 7;
  shapes.push({ ...footer, requires: 'footer' });
  return {
    slug, name, orientation, previewColor: dark ? '#111815' : '#00a878',
    defaultTheme: { primary: dark ? '#00a878' : '#111815', accent: '#00a878', bg: dark ? '#111815' : '#ffffff', paper: dark ? '#111815' : '#ffffff' },
    defaultSlots: CERTIFICADO_DEFAULT_SLOTS,
    slots: ['sobretitulo', 'titulo', 'subtitulo', 'corpo', 'destaque', 'assinaturaNome', 'assinaturaCargo', 'lateral', 'rodape'],
    toggles: ['signature', 'footer'], shapes,
  };
}

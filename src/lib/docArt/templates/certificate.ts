import type { ColorRef, DocArtConditionalShape, DocArtLayoutRole, DocArtTemplate, Orientation } from '../types.ts';
import { CERTIFICADO_DEFAULT_SLOTS } from './slots.ts';
import { text } from './blocks.ts';

interface CertificateOptions {
  slug: string;
  name: string;
  orientation: Orientation;
  dark?: boolean;
  motif: 'frame' | 'wave' | 'seal' | 'split' | 'portal' | 'stripe' | 'grid' | 'prism' | 'circuit' | 'minimal' | 'essential';
  backgroundArtwork?: boolean;
  titleColor?: ColorRef;
}

/** Um sistema editorial comum, com artes vetoriais próprias e caixas protegidas. */
export function createCertificateTemplate(options: CertificateOptions): DocArtTemplate {
  const { slug, name, orientation, motif, dark = false, backgroundArtwork = true, titleColor = 'primary' } = options;
  const landscape = orientation === 'landscape';
  const w = landscape ? 297 : 210, h = landscape ? 210 : 297;
  const margin = landscape ? 25 : 22;
  const split = motif === 'split';
  const shapes: DocArtConditionalShape[] = [];
  const rect = (x: number, y: number, width: number, height: number, fill: string, opacity = 1) =>
    shapes.push({ shape: { kind: 'rect', x, y, w: width, h: height, fill, opacity } });
  const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, opacity = 1, strokeWidth = 0.3, layoutRole?: DocArtLayoutRole) =>
    shapes.push({ shape: { kind: 'line', x1, y1, x2, y2, stroke, opacity, strokeWidth, layoutRole } });
  const path = (d: string, fill: string, opacity = 1) => shapes.push({ shape: { kind: 'path', d, fill, opacity } });
  rect(0, 0, w, h, 'paper');

  if (motif === 'frame') {
    line(8, 8, w - 8, 8, 'ink', 0.35, 0.7);
    line(8, h - 8, w - 8, h - 8, 'ink', 0.35, 0.7);
    line(8, 8, 8, h - 8, 'ink', 0.35, 0.7);
    line(w - 8, 8, w - 8, h - 8, 'ink', 0.35, 0.7);
    line(11, 11, w - 11, 11, 'accent', 0.85, 0.35);
    line(11, h - 11, w - 11, h - 11, 'accent', 0.85, 0.35);
    path(`M 8,34 L 8,8 L 34,8 L 24,13 L 13,24 Z`, 'primary', 0.85);
    path(`M ${w - 8},${h - 34} L ${w - 8},${h - 8} L ${w - 34},${h - 8} L ${w - 24},${h - 13} L ${w - 13},${h - 24} Z`, 'accent', 0.85);
  } else if (motif === 'wave') {
    path(`M 0,0 L ${w},0 L ${w},8 C ${w * 0.72},22 ${w * 0.45},-5 0,15 Z`, 'accent', 0.18);
    path(`M 0,${h - 16} C ${w * 0.3},${h - 38} ${w * 0.65},${h + 3} ${w},${h - 25} L ${w},${h} L 0,${h} Z`, 'accent', 0.2);
    path(`M 0,${h - 8} C ${w * 0.4},${h - 27} ${w * 0.7},${h + 9} ${w},${h - 13} L ${w},${h} L 0,${h} Z`, 'primary');
  } else if (motif === 'seal') {
    path(`M ${w - 48},0 L ${w},0 L ${w},48 L ${w - 13},26 Z`, 'primary');
    path(`M ${w - 31},0 L ${w},0 L ${w},30 Z`, 'accent', 0.82);
    line(w - 33, 13, w - 26, 20, 'onPrimary', 1, 1.05);
    line(w - 26, 20, w - 14, 9, 'onPrimary', 1, 1.05);
    rect(0, h - 4, w, 4, 'primary');
    rect(0, h - 5.2, w * 0.36, 1.2, 'accent');
  } else if (split) {
    rect(0, 0, 25, h, 'primary');
    rect(25, 0, 2, h, 'accent');
    for (let y = 18; y < h - 10; y += 9) line(7, y, 19, y, 'onPrimary', 0.12, 0.22);
    path(`M 0,${h - 42} L 25,${h - 67} L 25,${h} L 0,${h} Z`, 'accent', 0.35);
  } else if (motif === 'portal') {
    rect(0, 0, w, 8, 'primary');
    rect(0, 8, w, 2, 'accent');
    rect(0, 8, 7, h - 8, 'primary');
    rect(w - 7, 8, 7, h - 8, 'primary');
    line(12, 15, w - 12, 15, 'accent', 0.7, 0.35);
  } else if (motif === 'stripe') {
    rect(0, 0, 8, h, 'primary');
    rect(8, 0, 2, h, 'accent');
    path(`M ${w - 56},0 L ${w},0 L ${w},19 L ${w - 38},19 Z`, 'primary', 0.92);
    rect(w - 29, 19, 29, 2, 'accent');
  } else if (motif === 'grid') {
    rect(0, 0, w, 1.8, 'primary');
    for (let gx = 0; gx < w; gx += 7) line(gx, 0, gx, 48, 'ink', 0.055, 0.16);
    for (let gy = 0; gy <= 48; gy += 7) line(0, gy, w, gy, 'ink', 0.055, 0.16);
    line(margin, 49, w - margin, 49, 'accent', 1, 0.7);
    for (let gx = 0; gx < w; gx += 7) line(gx, h - 22, gx, h, 'accent', 0.07, 0.16);
  } else if (motif === 'prism') {
    path(`M 0,0 L ${w * 0.46},0 L ${w * 0.28},18 L 0,39 Z`, 'accent', 0.12);
    path(`M ${w - 78},0 L ${w},0 L ${w},74 Z`, 'primary', 0.72);
    path(`M ${w - 52},0 L ${w},0 L ${w},52 Z`, 'accent', 0.65);
    path(`M 0,${h - 30} L 54,${h} L 0,${h} Z`, 'accent', 0.18);
    line(10, 10, w - 10, 10, 'accent', 0.4, 0.35);
  } else if (motif === 'circuit') {
    for (let i = 0; i < 4; i++) {
      const y = 17 + i * 10, start = w - 75 + i * 10;
      shapes.push({ shape: { kind: 'path', d: `M ${w},${y} L ${start + 13},${y} L ${start},${y + 13} L ${start - 12},${y + 13}`, stroke: 'accent', strokeWidth: 0.35, opacity: 0.4 } });
      shapes.push({ shape: { kind: 'circle', cx: start - 12, cy: y + 13, r: 0.9, fill: 'accent', opacity: 0.7 } });
    }
    rect(0, 0, 3, h, 'accent');
    rect(w - 3, 0, 3, h, 'primary');
    line(9, h - 12, w - 9, h - 12, 'accent', 0.34, 0.35);
    for (let i = 0; i < 5; i++) {
      const cx = 19 + i * 15;
      shapes.push({ shape: { kind: 'circle', cx, cy: h - 12, r: 0.75, fill: 'accent', opacity: 0.72 } });
    }
  } else if (motif !== 'essential') {
    rect(0, 0, w, 4, 'accent');
    rect(0, h - 4, w, 4, 'primary');
    line(margin, 48, w - margin, 48, 'ink', 0.18, 0.28);
    line(margin, h - 27, w - margin, h - 27, 'accent', 0.45, 0.28);
  }

  // Cada tema usa uma arte autoral completa em alta resolução. Os modelos
  // essenciais são vetoriais e não dependem de bitmap.
  if (backgroundArtwork) {
    shapes.push({ shape: { kind: 'image', src: 'background', x: 0, y: 0, w, h, fit: 'stretch', align: 'left', valign: 'top' } });
  }

  // Estrutura inspirada em certificados técnicos de campo: título institucional
  // centralizado, declaração ampla e dados de execução distribuídos em quadros.
  const layoutX = landscape ? 22 : 20;
  const layoutRight = landscape ? 22 : 20;
  const layoutW = w - layoutX - layoutRight;
  const contentX = layoutX + 4;
  const contentW = layoutW - 8;
  const logoW = landscape ? 42 : 42;
  const logoX = (w - logoW) / 2;
  const titleX = contentX;
  const titleW = contentW;
  const titleY = landscape ? 27 : 45;
  const bodyY = landscape ? 67.5 : 92;
  const bodyH = landscape ? 36 : 67;
  const validationLength = landscape ? 118 : 128;
  const validationStripW = 7.5;
  const validationX = w - validationStripW;
  const validationY = (h - validationLength) / 2;
  const cardY = landscape ? 118 : 176;
  const cardH = landscape ? 46 : 36;
  const cardGap = landscape ? 8 : 7;
  const cardW = landscape ? (contentW - cardGap) / 2 : contentW;
  const productY = landscape ? cardY : cardY + cardH + cardGap;
  const highlightY = landscape ? 168.5 : 258;
  const addText = (
    slot: Parameters<typeof text>[0]['slot'],
    tx: number,
    y: number,
    width: number,
    size: number,
    height: number,
    weight: 'regular' | 'bold' = 'regular',
    color = 'ink',
    align: 'left' | 'center' | 'right' = 'left',
    outlineWidth?: number,
    layoutRole?: DocArtLayoutRole,
  ) => {
    const shape = text({ slot, x: tx, y, w: width, size, lineHeight: size * 1.4, weight, color, align, paragraphSpacing: slot === 'corpo' ? 4 : 0 });
    if (shape.shape.kind === 'text') shape.shape.outlineWidth = outlineWidth;
    if (shape.shape.kind === 'text') shape.shape.h = height;
    if (shape.shape.kind === 'text') shape.shape.layoutRole = layoutRole;
    shapes.push(shape);
  };

  // Cabeçalho vertical: logo do tenant acima e duas linhas de título com a
  // mesma escala, peso e fonte. O resolve aplica centro/esquerda/direita.
  shapes.push({ shape: { kind: 'image', src: 'logo', x: logoX, y: 7.5, w: logoW, h: 13.5, align: 'center', plate: '#757575', platePadding: 1.8 } });
  addText('titulo', titleX, titleY, titleW, landscape ? 25 : 22, landscape ? 11 : 12, 'bold', titleColor, 'center', 0.72);
  addText('subtitulo', titleX, titleY + (landscape ? 11 : 12), titleW, landscape ? 25 : 22, landscape ? 11 : 12, 'bold', titleColor, 'center', 0.72);
  addText('sobretitulo', titleX, titleY + (landscape ? 24.5 : 26), titleW, landscape ? 9.6 : 9, 7, 'bold', 'ink', 'center');
  line(contentX, bodyY - 4, contentX + contentW, bodyY - 4, 'accent', 0.72, 0.55);

  // Apenas a declaração longa fica alinhada à esquerda; os demais blocos
  // usam alinhamento central ou organização em colunas.
  addText('corpo', contentX + 3, bodyY, contentW - 6, landscape ? 12.2 : 11.4, bodyH, 'regular', 'ink', 'left');
  shapes.push({ shape: { kind: 'rect', x: validationX, y: validationY, w: validationStripW, h: validationLength, fill: 'primary', layoutRole: 'validationSeal' } });
  const validationTextW = validationLength - 10;
  const validationTextSize = 7.6;
  // Depois da rotação, o ascent vira deslocamento horizontal. Compensá-lo
  // coloca o centro ótico do texto exatamente no meio da faixa, enquanto o
  // pivô abaixo mantém o comprimento centralizado na altura da página.
  const validationAscentMm = validationTextSize * 0.76 * (25.4 / 72);
  const validationTextX = validationX + validationStripW / 2 - validationAscentMm;
  const validationTextY = h / 2 + validationTextW / 2;
  addText('validacao', validationTextX, validationTextY, validationTextW, validationTextSize, 4.8, 'regular', 'onPrimary', 'center', undefined, 'validationSeal');
  const validationText = shapes.at(-1)?.shape;
  if (validationText?.kind === 'text') validationText.rotate = -90;
  addText('lateral', contentX, landscape ? 108 : 166, contentW, landscape ? 9.8 : 9, 8, 'bold', 'ink', 'center', undefined, 'certificateMeta');

  // Todos os temas partem da mesma base minimalista: o conteúdo pertence ao
  // papel, sem um painel branco flutuante nem cartões internos. Linhas finas
  // organizam técnico e produto sem competir com a arte discreta das bordas.
  line(contentX, cardY, contentX + contentW, cardY, 'inkSoft', 0.55, 0.3, 'certificateDetails');
  if (landscape) {
    line(contentX + cardW + cardGap / 2, cardY + 5, contentX + cardW + cardGap / 2, cardY + cardH - 5, 'inkSoft', 0.45, 0.25, 'certificateDetails');
  }

  const techTextW = landscape ? cardW - 39 : cardW - 48;
  const productX = (landscape ? contentX + cardW + cardGap : contentX) + 6;
  const techIconX = contentX + 6;
  const techIconY = cardY + 2.7;
  shapes.push(
    { shape: { kind: 'path', d: `M ${techIconX + 0.7},${techIconY + 4.9} V ${techIconY + 4.2} C ${techIconX + 0.7},${techIconY + 2.2} ${techIconX + 1.8},${techIconY + 1.1} ${techIconX + 3.1},${techIconY + 1.1} C ${techIconX + 4.4},${techIconY + 1.1} ${techIconX + 5.5},${techIconY + 2.2} ${techIconX + 5.5},${techIconY + 4.2} V ${techIconY + 4.9}`, stroke: 'ink', strokeWidth: 0.7, layoutRole: 'certificateDetails', iconFor: 'assinaturaTitulo' } },
    { shape: { kind: 'path', d: `M ${techIconX + 2.5},${techIconY + 3.6} V ${techIconY + 0.8} H ${techIconX + 3.7} V ${techIconY + 3.6}`, stroke: 'ink', strokeWidth: 0.7, layoutRole: 'certificateDetails', iconFor: 'assinaturaTitulo' } },
    { shape: { kind: 'rect', x: techIconX + 0.2, y: techIconY + 4.8, w: 5.8, h: 1.1, stroke: 'ink', strokeWidth: 0.7, layoutRole: 'certificateDetails', iconFor: 'assinaturaTitulo' } },
  );
  const productIconX = productX;
  const productIconY = productY + 3.1;
  shapes.push(
    { unlessSlotContains: { slot: 'produtoTitulo', text: 'CONTRATO E ESTABELECIMENTO' }, shape: { kind: 'path', d: `M ${productIconX + 0.5},${productIconY + 2} L ${productIconX + 3.2},${productIconY + 0.6} L ${productIconX + 5.9},${productIconY + 2} L ${productIconX + 3.2},${productIconY + 3.5} Z`, stroke: 'ink', strokeWidth: 0.65, layoutRole: 'certificateDetails', iconFor: 'produtoTitulo' } },
    { unlessSlotContains: { slot: 'produtoTitulo', text: 'CONTRATO E ESTABELECIMENTO' }, shape: { kind: 'path', d: `M ${productIconX + 0.5},${productIconY + 2} V ${productIconY + 5} L ${productIconX + 3.2},${productIconY + 6.4} V ${productIconY + 3.5}`, stroke: 'ink', strokeWidth: 0.65, layoutRole: 'certificateDetails', iconFor: 'produtoTitulo' } },
    { unlessSlotContains: { slot: 'produtoTitulo', text: 'CONTRATO E ESTABELECIMENTO' }, shape: { kind: 'path', d: `M ${productIconX + 5.9},${productIconY + 2} V ${productIconY + 5} L ${productIconX + 3.2},${productIconY + 6.4}`, stroke: 'ink', strokeWidth: 0.65, layoutRole: 'certificateDetails', iconFor: 'produtoTitulo' } },
    { whenSlotContains: { slot: 'produtoTitulo', text: 'CONTRATO E ESTABELECIMENTO' }, shape: { kind: 'rect', x: productIconX + 0.5, y: productIconY + 0.2, w: 5.4, h: 6.2, stroke: 'ink', strokeWidth: 0.7, layoutRole: 'certificateDetails', iconFor: 'produtoTitulo' } },
    { whenSlotContains: { slot: 'produtoTitulo', text: 'CONTRATO E ESTABELECIMENTO' }, shape: { kind: 'rect', x: productIconX + 1.3, y: productIconY + 1.1, w: 1, h: 1, fill: 'ink', layoutRole: 'certificateDetails', iconFor: 'produtoTitulo' } },
    { whenSlotContains: { slot: 'produtoTitulo', text: 'CONTRATO E ESTABELECIMENTO' }, shape: { kind: 'rect', x: productIconX + 4.1, y: productIconY + 1.1, w: 1, h: 1, fill: 'ink', layoutRole: 'certificateDetails', iconFor: 'produtoTitulo' } },
    { whenSlotContains: { slot: 'produtoTitulo', text: 'CONTRATO E ESTABELECIMENTO' }, shape: { kind: 'rect', x: productIconX + 1.3, y: productIconY + 3, w: 1, h: 1, fill: 'ink', layoutRole: 'certificateDetails', iconFor: 'produtoTitulo' } },
    { whenSlotContains: { slot: 'produtoTitulo', text: 'CONTRATO E ESTABELECIMENTO' }, shape: { kind: 'rect', x: productIconX + 4.1, y: productIconY + 3, w: 1, h: 1, fill: 'ink', layoutRole: 'certificateDetails', iconFor: 'produtoTitulo' } },
    { whenSlotContains: { slot: 'produtoTitulo', text: 'CONTRATO E ESTABELECIMENTO' }, shape: { kind: 'rect', x: productIconX + 2.6, y: productIconY + 4.6, w: 1.3, h: 1.8, stroke: 'ink', strokeWidth: 0.55, layoutRole: 'certificateDetails', iconFor: 'produtoTitulo' } },
  );
  addText('assinaturaTitulo', contentX + 13, cardY + 3.5, techTextW - 7, 16.4, 9, 'bold', 'ink', 'left', 0.42, 'certificateDetails');
  addText('assinaturaNome', contentX + 6, cardY + 13.5, techTextW, 11.2, 7, 'regular', 'ink', 'left', undefined, 'certificateDetails');
  addText('assinaturaCargo', contentX + 6, cardY + 21.5, techTextW, 9.2, 11, 'regular', 'ink', 'left', undefined, 'certificateDetails');
  addText('produtoTitulo', productX + 7, productY + 3.5, cardW - 19, 16.4, 9, 'bold', 'ink', 'left', 0.42, 'certificateDetails');
  addText('produto', productX, productY + 13.5, cardW - 12, 10.2, cardH - 17.5, 'regular', 'ink', 'left', undefined, 'certificateDetails');

  shapes.push(
    { requires: 'signature', shape: { kind: 'image', src: 'signature', x: contentX + cardW - (landscape ? 35 : 44), y: cardY + 8, w: landscape ? 30 : 39, h: cardH - 16, align: 'right', valign: 'middle', layoutRole: 'certificateDetails' } },
  );

  addText('destaque', contentX + contentW * 0.08, highlightY, contentW * 0.84, landscape ? 9.4 : 8.6, landscape ? 13 : 12, 'bold', 'ink', 'center', undefined, 'certificateHighlight');
  const footer = text({ slot: 'rodape', x: contentX + 6, y: landscape ? cardY + 34 : 273.5, w: landscape ? techTextW : contentW, size: 7.6, lineHeight: 8.8, weight: 'regular', color: 'ink', align: landscape ? 'left' : 'center' });
  if (footer.shape.kind === 'text') footer.shape.h = landscape ? 10 : 9;
  if (footer.shape.kind === 'text' && landscape) footer.shape.layoutRole = 'certificateDetails';
  shapes.push({ ...footer, requires: 'footer' });
  return {
    slug, name, orientation, previewColor: dark ? '#111815' : '#00a878',
    defaultTheme: { primary: dark ? '#f8fafc' : '#111815', accent: dark ? '#f8fafc' : '#111815', bg: dark ? '#0b1220' : '#ffffff', paper: dark ? '#0b1220' : '#ffffff' },
    defaultSlots: CERTIFICADO_DEFAULT_SLOTS,
    slots: ['titulo', 'subtitulo', 'sobretitulo', 'corpo', 'validacao', 'assinaturaTitulo', 'assinaturaNome', 'assinaturaCargo', 'produtoTitulo', 'produto', 'destaque', 'lateral', 'rodape'],
    toggles: ['signature', 'footer'], shapes,
  };
}

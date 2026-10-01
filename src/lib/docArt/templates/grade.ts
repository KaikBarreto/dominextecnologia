// =============================================================================
// docArt/templates/grade.ts — Arte "Grade" (A4 retrato, técnica clara).
// =============================================================================
// Uma malha fina no topo, como papel milimetrado, e todo o conteúdo pendurado
// numa coluna à esquerda. Tipografia em sans do título ao rodapé: o ar aqui é
// de relatório técnico bem feito, não de diploma.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type { DocArtConditionalShape, DocArtTemplate } from '../types.ts';
import { CERTIFICADO_DEFAULT_SLOTS } from './slots.ts';
import { label, signatureBlock, text } from './blocks.ts';

/** Malha de linhas finas cobrindo (x, y) até (x+w, y+h), passo de `step` mm. */
function mesh(x: number, y: number, w: number, h: number, step: number): DocArtConditionalShape[] {
  const out: DocArtConditionalShape[] = [];
  for (let gx = x; gx <= x + w + 0.01; gx += step) {
    out.push({ shape: { kind: 'line', x1: gx, y1: y, x2: gx, y2: y + h, stroke: 'primary', strokeWidth: 0.12, opacity: 0.3 } });
  }
  for (let gy = y; gy <= y + h + 0.01; gy += step) {
    out.push({ shape: { kind: 'line', x1: x, y1: gy, x2: x + w, y2: gy, stroke: 'primary', strokeWidth: 0.12, opacity: 0.3 } });
  }
  return out;
}

export const gradeTemplate: DocArtTemplate = {
  slug: 'grade',
  name: 'Grade',
  orientation: 'portrait',
  previewColor: '#1e293b',
  defaultTheme: { primary: '#1e293b', accent: '#0ea5e9', bg: '#f8fafc', paper: '#f8fafc' },
  defaultSlots: CERTIFICADO_DEFAULT_SLOTS,
  slots: ['sobretitulo', 'titulo', 'subtitulo', 'corpo', 'destaque', 'assinaturaNome', 'assinaturaCargo', 'lateral', 'rodape'],
  toggles: ['signature', 'footer'],
  shapes: [
    { shape: { kind: 'rect', x: 0, y: 0, w: 210, h: 297, fill: 'bg' } },
    ...mesh(0, 0, 210, 72, 6),
    { shape: { kind: 'rect', x: 0, y: 72, w: 210, h: 1.6, fill: 'accent' } },

    { shape: { kind: 'image', src: 'logo', x: 22, y: 22, w: 46, h: 13, align: 'left' } },

    label({ slot: 'sobretitulo', x: 22, y: 90, w: 166, color: 'accent' }),
    text({ slot: 'titulo', x: 22, y: 100, w: 166, weight: 'bold', size: 34, lineHeight: 38, color: 'primary', maxLines: 1 }),
    label({ slot: 'subtitulo', x: 22, y: 126, w: 166, size: 8.5, letterSpacing: 3.2 }),

    { shape: { kind: 'line', x1: 22, y1: 140, x2: 188, y2: 140, stroke: 'inkSoft', strokeWidth: 0.2 } },
    text({ slot: 'corpo', x: 22, y: 150, w: 166, size: 10, lineHeight: 16, paragraphSpacing: 7, maxLines: 9 }),
    text({ slot: 'destaque', x: 22, y: 208, w: 166, weight: 'bold', size: 12, lineHeight: 16, color: 'accent', maxLines: 2 }),

    ...signatureBlock({ x: 22, y: 230, w: 74, align: 'left' }),
    text({ slot: 'lateral', x: 22, y: 276, w: 166, size: 6.8, color: 'inkSoft', maxLines: 1 }),
    { requires: 'footer', ...text({ slot: 'rodape', x: 22, y: 284, w: 166, size: 7.5, color: 'inkSoft', maxLines: 1 }) },
  ],
};

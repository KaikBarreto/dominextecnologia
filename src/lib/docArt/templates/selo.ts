// =============================================================================
// docArt/templates/selo.ts — Arte "Selo" (A4 paisagem, clara).
// =============================================================================
// Um disco cheio na cor da marca atrás do canto superior esquerdo, com o logo
// dentro, e o texto correndo à direita. O disco sangra de propósito: cortado
// pela borda ele vira forma, inteiro viraria adesivo.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type { DocArtTemplate } from '../types.ts';
import { CERTIFICADO_DEFAULT_SLOTS } from './slots.ts';
import { label, signatureBlock, text } from './blocks.ts';

export const seloTemplate: DocArtTemplate = {
  slug: 'selo',
  name: 'Selo',
  orientation: 'landscape',
  previewColor: '#115e59',
  defaultTheme: { primary: '#115e59', accent: '#f59e0b', bg: '#ffffff', paper: '#ffffff' },
  defaultSlots: CERTIFICADO_DEFAULT_SLOTS,
  slots: ['sobretitulo', 'titulo', 'subtitulo', 'corpo', 'destaque', 'assinaturaNome', 'assinaturaCargo', 'lateral', 'rodape'],
  toggles: ['signature', 'footer'],
  shapes: [
    { shape: { kind: 'rect', x: 0, y: 0, w: 297, h: 210, fill: 'bg' } },
    { shape: { kind: 'circle', cx: 22, cy: 22, r: 58, fill: 'primary' } },
    { shape: { kind: 'circle', cx: 22, cy: 22, r: 70, stroke: 'primary', strokeWidth: 0.4, opacity: 0.35 } },
    { shape: { kind: 'rect', x: 0, y: 198, w: 297, h: 12, fill: 'primary' } },
    { shape: { kind: 'rect', x: 0, y: 198, w: 74, h: 12, fill: 'accent' } },

    { shape: { kind: 'image', src: 'logo', x: 22, y: 31, w: 48, h: 12, align: 'left', plate: '#ffffff' } },

    label({ slot: 'sobretitulo', x: 118, y: 46, w: 150, color: 'accent' }),
    text({ slot: 'titulo', x: 118, y: 56, w: 160, font: 'display', weight: 'bold', size: 40, lineHeight: 44, color: 'primary', maxLines: 1 }),
    label({ slot: 'subtitulo', x: 118, y: 86, w: 160, size: 8.5, letterSpacing: 3.2 }),

    text({ slot: 'corpo', x: 118, y: 100, w: 160, size: 9, lineHeight: 14.5, paragraphSpacing: 6, maxLines: 6 }),
    text({ slot: 'destaque', x: 118, y: 140, w: 160, font: 'display', weight: 'bold', size: 13, lineHeight: 18, color: 'primary', maxLines: 2 }),

    ...signatureBlock({ x: 30, y: 150, w: 70, align: 'left' }),
    text({ slot: 'lateral', x: 118, y: 178, w: 160, size: 6.8, color: 'inkSoft', maxLines: 1 }),
    { requires: 'footer', ...text({ slot: 'rodape', x: 30, y: 200, w: 248, size: 7, align: 'right', color: 'onPrimary', maxLines: 1 }) },
  ],
};

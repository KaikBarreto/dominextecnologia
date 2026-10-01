// =============================================================================
// docArt/templates/marca.ts — Arte "Marca" (A4 retrato, clara).
// =============================================================================
// Uma faixa estreita de cor correndo a altura inteira pela esquerda, com os
// dados do documento girados dentro dela. O conteúdo ocupa o resto da folha
// sem nenhuma moldura.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type { DocArtTemplate } from '../types.ts';
import { CERTIFICADO_DEFAULT_SLOTS } from './slots.ts';
import { label, signatureBlock, text } from './blocks.ts';

export const marcaTemplate: DocArtTemplate = {
  slug: 'marca',
  name: 'Marca',
  orientation: 'portrait',
  previewColor: '#7c2d12',
  defaultTheme: { primary: '#7c2d12', accent: '#ea580c', bg: '#ffffff', paper: '#ffffff' },
  defaultSlots: CERTIFICADO_DEFAULT_SLOTS,
  slots: ['sobretitulo', 'titulo', 'subtitulo', 'corpo', 'destaque', 'assinaturaNome', 'assinaturaCargo', 'lateral', 'rodape'],
  toggles: ['signature', 'footer'],
  shapes: [
    { shape: { kind: 'rect', x: 0, y: 0, w: 210, h: 297, fill: 'bg' } },
    { shape: { kind: 'rect', x: 0, y: 0, w: 26, h: 297, fill: 'primary' } },
    { shape: { kind: 'rect', x: 0, y: 0, w: 26, h: 52, fill: 'accent' } },

    // Dados do documento girados dentro da faixa.
    text({ slot: 'lateral', x: 11, y: 270, w: 160, size: 7, align: 'left', color: 'onPrimary', letterSpacing: 1, rotate: -90, maxLines: 1, opacity: 0.85 }),

    { shape: { kind: 'image', src: 'logo', x: 46, y: 28, w: 46, h: 13, align: 'left' } },

    label({ slot: 'sobretitulo', x: 46, y: 62, w: 142, color: 'accent' }),
    text({ slot: 'titulo', x: 46, y: 72, w: 142, font: 'display', weight: 'bold', size: 36, lineHeight: 40, color: 'primary', maxLines: 1 }),
    label({ slot: 'subtitulo', x: 46, y: 100, w: 142, size: 8.5, letterSpacing: 3.2 }),

    { shape: { kind: 'line', x1: 46, y1: 114, x2: 188, y2: 114, stroke: 'inkSoft', strokeWidth: 0.2 } },
    text({ slot: 'corpo', x: 46, y: 124, w: 142, size: 10, lineHeight: 16, paragraphSpacing: 7, maxLines: 10 }),
    text({ slot: 'destaque', x: 46, y: 196, w: 142, font: 'display', weight: 'bold', size: 13, lineHeight: 18, color: 'primary', maxLines: 2 }),

    ...signatureBlock({ x: 46, y: 224, w: 74, align: 'left' }),
    { requires: 'footer', ...text({ slot: 'rodape', x: 46, y: 276, w: 142, size: 7.5, color: 'inkSoft', maxLines: 1 }) },
  ],
};

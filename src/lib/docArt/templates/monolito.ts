// =============================================================================
// docArt/templates/monolito.ts — Arte "Monolito" (A4 retrato, tema escuro).
// =============================================================================
// Folha escura inteira, sem grafismo nenhum além de um fio de cor no topo e do
// peso da tipografia. É a mais sóbria das escuras, e a que mais depende de
// impressão boa — vale avisar quem for imprimir em laser doméstico.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type { DocArtTemplate } from '../types.ts';
import { CERTIFICADO_DEFAULT_SLOTS } from './slots.ts';
import { label, signatureBlock, text } from './blocks.ts';

export const monolitoTemplate: DocArtTemplate = {
  slug: 'monolito',
  name: 'Monolito',
  orientation: 'portrait',
  previewColor: '#18181b',
  defaultTheme: { primary: '#fafafa', accent: '#a3e635', bg: '#18181b', paper: '#18181b' },
  defaultSlots: CERTIFICADO_DEFAULT_SLOTS,
  slots: ['sobretitulo', 'titulo', 'subtitulo', 'corpo', 'destaque', 'assinaturaNome', 'assinaturaCargo', 'lateral', 'rodape'],
  toggles: ['signature', 'footer'],
  shapes: [
    { shape: { kind: 'rect', x: 0, y: 0, w: 210, h: 297, fill: 'bg' } },
    { shape: { kind: 'rect', x: 0, y: 0, w: 210, h: 5, fill: 'accent' } },

    { shape: { kind: 'image', src: 'logo', x: 26, y: 29, w: 48, h: 12, align: 'left', plate: '#ffffff' } },

    label({ slot: 'sobretitulo', x: 22, y: 64, w: 166, color: 'accent' }),
    text({ slot: 'titulo', x: 22, y: 74, w: 166, font: 'display', weight: 'bold', size: 38, lineHeight: 42, color: 'primary', maxLines: 1 }),
    label({ slot: 'subtitulo', x: 22, y: 104, w: 166, size: 8.5, letterSpacing: 3.2 }),

    { shape: { kind: 'line', x1: 22, y1: 118, x2: 188, y2: 118, stroke: 'inkSoft', strokeWidth: 0.25 } },
    text({ slot: 'corpo', x: 22, y: 128, w: 166, size: 10, lineHeight: 16, paragraphSpacing: 7, maxLines: 10 }),
    text({ slot: 'destaque', x: 22, y: 200, w: 166, weight: 'bold', size: 12, lineHeight: 16, color: 'accent', maxLines: 2 }),

    ...signatureBlock({ x: 22, y: 226, w: 74, align: 'left' }),
    text({ slot: 'lateral', x: 22, y: 274, w: 166, size: 6.8, color: 'inkSoft', maxLines: 1 }),
    { requires: 'footer', ...text({ slot: 'rodape', x: 22, y: 283, w: 166, size: 7.5, color: 'inkSoft', maxLines: 1 }) },
  ],
};

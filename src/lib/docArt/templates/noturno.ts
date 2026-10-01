// =============================================================================
// docArt/templates/noturno.ts — Arte "Noturno" (A4 paisagem, tema escuro).
// =============================================================================
// A Aurora à noite: mesma composição centrada e serena, invertida para fundo
// escuro. O logo do tenant ganha uma plaqueta clara atrás — logo colorido em
// fundo escuro é o tipo de coisa que só aparece depois de impresso.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type { DocArtTemplate } from '../types.ts';
import { CERTIFICADO_DEFAULT_SLOTS } from './slots.ts';
import { label, signatureBlock, text } from './blocks.ts';

function corner(vx: number, vy: number, dx: number, dy: number, len = 26): string {
  return `M ${vx},${vy + dy * len} L ${vx},${vy} L ${vx + dx * len},${vy}`;
}

export const noturnoTemplate: DocArtTemplate = {
  slug: 'noturno',
  name: 'Noturno',
  orientation: 'landscape',
  previewColor: '#0b1220',
  defaultTheme: { primary: '#c8a558', accent: '#c8a558', bg: '#0b1220', paper: '#0b1220' },
  defaultSlots: CERTIFICADO_DEFAULT_SLOTS,
  slots: ['sobretitulo', 'titulo', 'subtitulo', 'corpo', 'destaque', 'assinaturaNome', 'assinaturaCargo', 'lateral', 'rodape'],
  toggles: ['signature', 'footer'],
  shapes: [
    { shape: { kind: 'rect', x: 0, y: 0, w: 297, h: 210, fill: 'bg' } },

    { shape: { kind: 'path', d: corner(16, 16, 1, 1), stroke: 'accent', strokeWidth: 0.5 } },
    { shape: { kind: 'path', d: corner(281, 16, -1, 1), stroke: 'accent', strokeWidth: 0.5 } },
    { shape: { kind: 'path', d: corner(16, 194, 1, -1), stroke: 'accent', strokeWidth: 0.5 } },
    { shape: { kind: 'path', d: corner(281, 194, -1, -1), stroke: 'accent', strokeWidth: 0.5 } },

    // `plate`: fundo claro que só existe se houver logo, pra ele ficar
    // legível seja qual for a cor dele.
    { shape: { kind: 'image', src: 'logo', x: 123, y: 27, w: 51, h: 14, plate: '#ffffff' } },

    label({ slot: 'sobretitulo', x: 50, y: 54, w: 197, align: 'center' }),
    text({ slot: 'titulo', x: 40, y: 64, w: 217, font: 'display', weight: 'bold', size: 46, lineHeight: 50, align: 'center', color: 'ink', maxLines: 1 }),
    { shape: { kind: 'line', x1: 133, y1: 90, x2: 164, y2: 90, stroke: 'accent', strokeWidth: 0.8 } },
    label({ slot: 'subtitulo', x: 50, y: 96, w: 197, size: 8.5, align: 'center', letterSpacing: 3.6 }),

    text({ slot: 'corpo', x: 54, y: 110, w: 189, size: 9, lineHeight: 14.5, paragraphSpacing: 6, align: 'center', maxLines: 5 }),
    text({ slot: 'destaque', x: 50, y: 142, w: 197, font: 'display', weight: 'bold', size: 15, lineHeight: 20, align: 'center', color: 'primary', maxLines: 1 }),

    ...signatureBlock({ x: 38, y: 164, w: 66 }),
    text({ slot: 'lateral', x: 180, y: 181, w: 76, size: 6.8, align: 'right', color: 'inkSoft', maxLines: 2 }),
    { requires: 'footer', ...text({ slot: 'rodape', x: 50, y: 198, w: 197, size: 6.8, align: 'center', color: 'inkSoft', maxLines: 1 }) },
  ],
};

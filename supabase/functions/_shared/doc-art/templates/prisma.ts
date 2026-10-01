// =============================================================================
// docArt/templates/prisma.ts — Arte "Prisma" (A4 paisagem, escuro geométrico).
// =============================================================================
// Fundo escuro com planos translúcidos que se cruzam no canto direito, como
// vidro sobreposto. O texto fica todo à esquerda, fora da área dos planos.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type { DocArtTemplate } from '../types.ts';
import { CERTIFICADO_DEFAULT_SLOTS } from './slots.ts';
import { label, signatureBlock, text } from './blocks.ts';

export const prismaTemplate: DocArtTemplate = {
  slug: 'prisma',
  name: 'Prisma',
  orientation: 'landscape',
  previewColor: '#111827',
  defaultTheme: { primary: '#818cf8', accent: '#f472b6', bg: '#111827', paper: '#111827' },
  defaultSlots: CERTIFICADO_DEFAULT_SLOTS,
  slots: ['sobretitulo', 'titulo', 'subtitulo', 'corpo', 'destaque', 'assinaturaNome', 'assinaturaCargo', 'lateral', 'rodape'],
  toggles: ['signature', 'footer'],
  shapes: [
    { shape: { kind: 'rect', x: 0, y: 0, w: 297, h: 210, fill: 'bg' } },

    // Planos de vidro: a sobreposição translúcida é o grafismo inteiro.
    { shape: { kind: 'path', d: 'M 196,0 L 297,0 L 297,146 Z', fill: 'primary', opacity: 0.26 } },
    { shape: { kind: 'path', d: 'M 297,44 L 297,210 L 168,210 Z', fill: 'accent', opacity: 0.2 } },
    { shape: { kind: 'path', d: 'M 244,0 L 297,0 L 297,74 Z', fill: 'primary', opacity: 0.3 } },

    { shape: { kind: 'image', src: 'logo', x: 30, y: 27, w: 48, h: 12, align: 'left', plate: '#ffffff' } },

    label({ slot: 'sobretitulo', x: 26, y: 56, w: 140, color: 'primary' }),
    text({ slot: 'titulo', x: 26, y: 66, w: 150, font: 'display', weight: 'bold', size: 40, lineHeight: 44, color: 'ink', maxLines: 1 }),
    label({ slot: 'subtitulo', x: 26, y: 94, w: 150, size: 8.5, letterSpacing: 3.2 }),

    text({ slot: 'corpo', x: 26, y: 108, w: 150, size: 9, lineHeight: 14.5, paragraphSpacing: 6, maxLines: 6 }),
    text({ slot: 'destaque', x: 26, y: 148, w: 150, weight: 'bold', size: 11.5, lineHeight: 16, color: 'accent', maxLines: 2 }),

    ...signatureBlock({ x: 186, y: 150, w: 66, align: 'left' }),
    text({ slot: 'lateral', x: 26, y: 180, w: 120, size: 6.8, color: 'inkSoft', maxLines: 2 }),
    { requires: 'footer', ...text({ slot: 'rodape', x: 26, y: 192, w: 150, size: 6.8, color: 'inkSoft', maxLines: 1 }) },
  ],
};

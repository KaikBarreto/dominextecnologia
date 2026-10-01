// =============================================================================
// docArt/templates/onda.ts — Arte "Onda" (A4 paisagem, clara).
// =============================================================================
// Duas curvas cheias no pé da folha, uma sobre a outra. O resto é branco e o
// texto fica centrado em cima — a cor entra como base, não como moldura.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type { DocArtTemplate } from '../types.ts';
import { CERTIFICADO_DEFAULT_SLOTS } from './slots.ts';
import { label, signatureBlock, text } from './blocks.ts';

export const ondaTemplate: DocArtTemplate = {
  slug: 'onda',
  name: 'Onda',
  orientation: 'landscape',
  previewColor: '#0369a1',
  defaultTheme: { primary: '#0369a1', accent: '#38bdf8', bg: '#ffffff', paper: '#ffffff' },
  defaultSlots: CERTIFICADO_DEFAULT_SLOTS,
  slots: ['sobretitulo', 'titulo', 'subtitulo', 'corpo', 'destaque', 'assinaturaNome', 'assinaturaCargo', 'lateral', 'rodape'],
  toggles: ['signature', 'footer'],
  shapes: [
    { shape: { kind: 'rect', x: 0, y: 0, w: 297, h: 210, fill: 'bg' } },

    // Curvas do pé: a de trás é só um eco mais claro da da frente.
    { shape: { kind: 'path', d: 'M 0,186 C 74,166 150,208 297,174 L 297,210 L 0,210 Z', fill: 'accent', opacity: 0.45 } },
    { shape: { kind: 'path', d: 'M 0,198 C 88,180 164,214 297,190 L 297,210 L 0,210 Z', fill: 'primary' } },
    // E um eco discreto no topo, pra folha não ficar pesada embaixo.
    { shape: { kind: 'path', d: 'M 0,0 L 297,0 L 297,16 C 190,32 96,6 0,22 Z', fill: 'primary', opacity: 0.1 } },

    { shape: { kind: 'image', src: 'logo', x: 124, y: 34, w: 49, h: 13 } },
    label({ slot: 'sobretitulo', x: 50, y: 56, w: 197, align: 'center' }),
    text({ slot: 'titulo', x: 40, y: 66, w: 217, font: 'display', weight: 'bold', size: 44, lineHeight: 48, align: 'center', color: 'primary', maxLines: 1 }),
    label({ slot: 'subtitulo', x: 50, y: 94, w: 197, size: 8.5, align: 'center', letterSpacing: 3.6 }),

    text({ slot: 'corpo', x: 54, y: 108, w: 189, size: 9, lineHeight: 14.5, paragraphSpacing: 6, align: 'center', maxLines: 5 }),
    text({ slot: 'destaque', x: 50, y: 140, w: 197, font: 'display', weight: 'bold', size: 15, lineHeight: 20, align: 'center', color: 'primary', maxLines: 1 }),

    ...signatureBlock({ x: 38, y: 154, w: 66 }),
    text({ slot: 'lateral', x: 180, y: 171, w: 76, size: 6.8, align: 'right', color: 'inkSoft', maxLines: 2 }),
    { requires: 'footer', ...text({ slot: 'rodape', x: 50, y: 199, w: 197, size: 6.8, align: 'center', color: 'onPrimary', maxLines: 1 }) },
  ],
};

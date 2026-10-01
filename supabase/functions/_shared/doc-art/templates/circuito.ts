// =============================================================================
// docArt/templates/circuito.ts — Arte "Circuito" (A4 paisagem, escuro técnico).
// =============================================================================
// Fundo escuro com trilhas ortogonais e nós no canto direito, como uma placa
// vista de cima. Tipografia toda em sans, alinhada à esquerda: é a arte para
// quem quer o certificado parecendo engenharia, não diploma.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type { DocArtConditionalShape, DocArtTemplate } from '../types.ts';
import { CERTIFICADO_DEFAULT_SLOTS } from './slots.ts';
import { label, signatureBlock, text } from './blocks.ts';

/** Uma trilha com nó na ponta, no estilo de placa de circuito. */
function trace(d: string, nodeX: number, nodeY: number): DocArtConditionalShape[] {
  return [
    { shape: { kind: 'path', d, stroke: 'accent', strokeWidth: 0.35, opacity: 0.55 } },
    { shape: { kind: 'circle', cx: nodeX, cy: nodeY, r: 1.4, fill: 'accent', opacity: 0.8 } },
  ];
}

export const circuitoTemplate: DocArtTemplate = {
  slug: 'circuito',
  name: 'Circuito',
  orientation: 'landscape',
  previewColor: '#070b14',
  defaultTheme: { primary: '#22d3ee', accent: '#22d3ee', bg: '#070b14', paper: '#070b14' },
  defaultSlots: CERTIFICADO_DEFAULT_SLOTS,
  slots: ['sobretitulo', 'titulo', 'subtitulo', 'corpo', 'destaque', 'assinaturaNome', 'assinaturaCargo', 'lateral', 'rodape'],
  toggles: ['signature', 'footer'],
  shapes: [
    { shape: { kind: 'rect', x: 0, y: 0, w: 297, h: 210, fill: 'bg' } },

    // Trilhas sangrando pelo canto superior direito.
    ...trace('M 297,34 L 236,34 L 222,48 L 182,48', 182, 48),
    ...trace('M 297,56 L 252,56 L 240,68 L 206,68', 206, 68),
    ...trace('M 297,78 L 266,78 L 256,88 L 228,88', 228, 88),
    ...trace('M 297,14 L 212,14 L 200,26 L 166,26', 166, 26),
    // E pelo canto inferior esquerdo, invertidas.
    ...trace('M 0,176 L 61,176 L 75,162 L 115,162', 115, 162),
    ...trace('M 0,196 L 45,196 L 57,184 L 91,184', 91, 184),

    // Barra de acento à esquerda, ancorando a coluna de texto.
    { shape: { kind: 'rect', x: 24, y: 40, w: 1.6, h: 96, fill: 'primary' } },

    { shape: { kind: 'image', src: 'logo', x: 28, y: 23, w: 48, h: 12, align: 'left', plate: '#ffffff' } },

    label({ slot: 'sobretitulo', x: 34, y: 44, w: 150, color: 'accent' }),
    text({ slot: 'titulo', x: 34, y: 54, w: 180, weight: 'bold', size: 38, lineHeight: 42, color: 'ink', maxLines: 1 }),
    label({ slot: 'subtitulo', x: 34, y: 82, w: 180, size: 8.5, letterSpacing: 3.2 }),

    text({ slot: 'corpo', x: 34, y: 96, w: 175, size: 9, lineHeight: 14.5, paragraphSpacing: 6, maxLines: 5 }),
    text({ slot: 'destaque', x: 34, y: 128, w: 175, weight: 'bold', size: 11.5, lineHeight: 16, color: 'primary', maxLines: 2 }),

    ...signatureBlock({ x: 34, y: 156, w: 66, align: 'left' }),
    text({ slot: 'lateral', x: 180, y: 173, w: 83, size: 6.8, align: 'right', color: 'inkSoft', maxLines: 2 }),
    { requires: 'footer', ...text({ slot: 'rodape', x: 180, y: 190, w: 83, size: 6.8, align: 'right', color: 'inkSoft', maxLines: 1 }) },
  ],
};

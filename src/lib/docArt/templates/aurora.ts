// =============================================================================
// docArt/templates/aurora.ts — Arte "Aurora" (A4 paisagem, elegante).
// =============================================================================
// Folha branca, quatro cantos em "L" finíssimos na cor de realce, e o título em
// Playfair Display grande no centro. É a leitura contemporânea do certificado
// clássico: a formalidade vem da tipografia e do espaço em branco, não de
// moldura ornamentada nem de filete com losango.
//
// Os cantos em L são o único grafismo — marcam a área útil sem fechar a folha,
// que é o que deixava a versão com moldura dupla com cara de diploma dos anos 90.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type { DocArtTemplate } from '../types.ts';
import { CERTIFICADO_DEFAULT_SLOTS } from './slots.ts';

/** Canto em "L": duas pernas de `len` mm a partir do vértice (vx, vy). */
function corner(vx: number, vy: number, dx: number, dy: number, len = 26): string {
  return `M ${vx},${vy + dy * len} L ${vx},${vy} L ${vx + dx * len},${vy}`;
}

export const auroraTemplate: DocArtTemplate = {
  slug: 'aurora',
  name: 'Aurora',
  orientation: 'landscape',
  previewColor: '#111827',

  defaultTheme: {
    primary: '#111827',
    accent: '#b08b4f',
    bg: '#ffffff',
    paper: '#ffffff',
  },

  defaultSlots: CERTIFICADO_DEFAULT_SLOTS,

  slots: [
    'sobretitulo',
    'titulo',
    'subtitulo',
    'corpo',
    'destaque',
    'assinaturaNome',
    'assinaturaCargo',
    'lateral',
    'rodape',
  ],

  toggles: ['signature', 'footer'],

  shapes: [
    { shape: { kind: 'rect', x: 0, y: 0, w: 297, h: 210, fill: 'bg' } },

    // ── Cantos ─────────────────────────────────────────────────────────────
    { shape: { kind: 'path', d: corner(16, 16, 1, 1), stroke: 'accent', strokeWidth: 0.5 } },
    { shape: { kind: 'path', d: corner(281, 16, -1, 1), stroke: 'accent', strokeWidth: 0.5 } },
    { shape: { kind: 'path', d: corner(16, 194, 1, -1), stroke: 'accent', strokeWidth: 0.5 } },
    { shape: { kind: 'path', d: corner(281, 194, -1, -1), stroke: 'accent', strokeWidth: 0.5 } },

    // ── Cabeçalho ──────────────────────────────────────────────────────────
    { shape: { kind: 'image', src: 'logo', x: 124, y: 28, w: 49, h: 12 } },
    {
      shape: {
        kind: 'text',
        slot: 'sobretitulo',
        x: 50,
        y: 50,
        w: 197,
        font: 'sans',
        weight: 'regular',
        size: 7,
        lineHeight: 10,
        align: 'center',
        color: 'inkSoft',
        transform: 'uppercase',
        letterSpacing: 2.6,
        maxLines: 1,
      },
    },
    {
      shape: {
        kind: 'text',
        slot: 'titulo',
        x: 40,
        y: 60,
        w: 217,
        font: 'display',
        weight: 'bold',
        size: 46,
        lineHeight: 50,
        align: 'center',
        color: 'primary',
        maxLines: 1,
      },
    },
    { shape: { kind: 'line', x1: 133, y1: 86, x2: 164, y2: 86, stroke: 'accent', strokeWidth: 0.8 } },
    {
      shape: {
        kind: 'text',
        slot: 'subtitulo',
        x: 50,
        y: 92,
        w: 197,
        font: 'sans',
        weight: 'regular',
        size: 8.5,
        lineHeight: 12,
        align: 'center',
        color: 'inkSoft',
        transform: 'uppercase',
        letterSpacing: 3.6,
        maxLines: 1,
      },
    },

    // ── Corpo ──────────────────────────────────────────────────────────────
    {
      shape: {
        kind: 'text',
        slot: 'corpo',
        x: 54,
        y: 106,
        w: 189,
        font: 'sans',
        weight: 'regular',
        size: 9,
        lineHeight: 14.5,
        paragraphSpacing: 6,
        align: 'center',
        color: 'ink',
        maxLines: 5,
      },
    },
    {
      shape: {
        kind: 'text',
        slot: 'destaque',
        x: 50,
        y: 138,
        w: 197,
        font: 'display',
        weight: 'bold',
        size: 15,
        lineHeight: 20,
        align: 'center',
        color: 'primary',
        maxLines: 1,
      },
    },

    // ── Pé: assinatura à esquerda, dados à direita ─────────────────────────
    {
      requires: 'signature',
      shape: { kind: 'image', src: 'signature', x: 42, y: 163, w: 58, h: 13, valign: 'bottom' },
    },
    {
      requires: 'signature',
      shape: { kind: 'line', x1: 38, y1: 179, x2: 104, y2: 179, stroke: 'inkSoft', strokeWidth: 0.25 },
    },
    {
      requires: 'signature',
      shape: {
        kind: 'text',
        slot: 'assinaturaNome',
        x: 34,
        y: 181,
        w: 74,
        font: 'sans',
        weight: 'bold',
        size: 8,
        lineHeight: 11,
        align: 'center',
        color: 'ink',
        maxLines: 1,
      },
    },
    {
      requires: 'signature',
      shape: {
        kind: 'text',
        slot: 'assinaturaCargo',
        x: 34,
        y: 186,
        w: 74,
        font: 'sans',
        weight: 'regular',
        size: 6.8,
        lineHeight: 9.5,
        align: 'center',
        color: 'inkSoft',
        maxLines: 1,
      },
    },
    {
      shape: {
        kind: 'text',
        slot: 'lateral',
        x: 180,
        y: 181,
        w: 76,
        font: 'sans',
        weight: 'regular',
        size: 6.8,
        lineHeight: 10,
        align: 'right',
        color: 'inkSoft',
        maxLines: 2,
      },
    },
    {
      requires: 'footer',
      shape: {
        kind: 'text',
        slot: 'rodape',
        x: 50,
        y: 198,
        w: 197,
        font: 'sans',
        weight: 'regular',
        size: 6.8,
        lineHeight: 9.5,
        align: 'center',
        color: 'inkSoft',
        maxLines: 1,
      },
    },
  ],
};

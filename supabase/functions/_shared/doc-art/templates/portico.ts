// =============================================================================
// docArt/templates/portico.ts — Arte "Pórtico" (A4 retrato).
// =============================================================================
// A única em pé. Um bloco cheio de cor ocupa o terço superior e carrega o
// título; o resto da folha é campo claro com o texto alinhado à esquerda. Um
// retângulo de realce desce do bloco pela direita, quebrando a horizontal.
//
// Retrato é o formato que o cliente imprime e arquiva na pasta do PMOC — por
// isso o corpo aqui é maior que o das paisagens.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type { DocArtTemplate } from '../types.ts';
import { CERTIFICADO_DEFAULT_SLOTS } from './slots.ts';

export const porticoTemplate: DocArtTemplate = {
  slug: 'portico',
  name: 'Pórtico',
  orientation: 'portrait',
  previewColor: '#047857',

  defaultTheme: {
    primary: '#047857',
    accent: '#f43f5e',
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
    { shape: { kind: 'rect', x: 0, y: 0, w: 210, h: 297, fill: 'bg' } },

    // ── Bloco superior ─────────────────────────────────────────────────────
    { shape: { kind: 'rect', x: 0, y: 0, w: 210, h: 86, fill: 'primary' } },
    // Realce descendo do bloco pela direita. Discreto de propósito: grande
    // demais, vira mancha e rouba a atenção do título.
    { shape: { kind: 'rect', x: 178, y: 56, w: 32, h: 38, fill: 'accent' } },

    {
      shape: {
        kind: 'text',
        slot: 'sobretitulo',
        x: 22,
        y: 26,
        w: 120,
        font: 'sans',
        weight: 'regular',
        size: 7.5,
        lineHeight: 10.5,
        align: 'left',
        color: 'onPrimary',
        opacity: 0.75,
        transform: 'uppercase',
        letterSpacing: 1.8,
        maxLines: 2,
      },
    },
    {
      shape: {
        kind: 'text',
        slot: 'titulo',
        x: 22,
        y: 40,
        w: 126,
        font: 'display',
        weight: 'bold',
        size: 34,
        lineHeight: 37,
        align: 'left',
        color: 'onPrimary',
        maxLines: 1,
      },
    },
    {
      shape: {
        kind: 'text',
        slot: 'subtitulo',
        x: 22,
        y: 64,
        w: 120,
        font: 'sans',
        weight: 'regular',
        size: 10.5,
        lineHeight: 14,
        align: 'left',
        color: 'onPrimary',
        opacity: 0.85,
        maxLines: 1,
      },
    },

    // ── Campo claro ────────────────────────────────────────────────────────
    { shape: { kind: 'image', src: 'logo', x: 22, y: 104, w: 46, h: 13, align: 'left' } },
    {
      shape: { kind: 'line', x1: 22, y1: 128, x2: 188, y2: 128, stroke: 'inkSoft', strokeWidth: 0.2 },
    },
    {
      shape: {
        kind: 'text',
        slot: 'corpo',
        x: 22,
        y: 138,
        w: 166,
        font: 'sans',
        weight: 'regular',
        size: 10.5,
        lineHeight: 16.5,
        paragraphSpacing: 7,
        align: 'left',
        color: 'ink',
        maxLines: 9,
      },
    },
    {
      shape: {
        kind: 'text',
        slot: 'destaque',
        x: 22,
        y: 200,
        w: 166,
        font: 'display',
        weight: 'bold',
        size: 12.5,
        lineHeight: 17,
        align: 'left',
        color: 'primary',
        maxLines: 2,
      },
    },

    // ── Assinatura ─────────────────────────────────────────────────────────
    {
      requires: 'signature',
      shape: { kind: 'image', src: 'signature', x: 22, y: 222, w: 64, h: 16, align: 'left', valign: 'bottom' },
    },
    {
      requires: 'signature',
      shape: {
        kind: 'line',
        x1: 22,
        y1: 241,
        x2: 96,
        y2: 241,
        stroke: 'inkSoft',
        strokeWidth: 0.25,
      },
    },
    {
      requires: 'signature',
      shape: {
        kind: 'text',
        slot: 'assinaturaNome',
        x: 22,
        y: 244,
        w: 140,
        font: 'sans',
        weight: 'bold',
        size: 9,
        lineHeight: 12,
        align: 'left',
        color: 'ink',
        maxLines: 1,
      },
    },
    {
      requires: 'signature',
      shape: {
        kind: 'text',
        slot: 'assinaturaCargo',
        x: 22,
        y: 249.5,
        w: 140,
        font: 'sans',
        weight: 'regular',
        size: 7.5,
        lineHeight: 10,
        align: 'left',
        color: 'inkSoft',
        maxLines: 1,
      },
    },

    // ── Pé ─────────────────────────────────────────────────────────────────
    {
      shape: {
        kind: 'text',
        slot: 'lateral',
        x: 22,
        y: 277,
        w: 166,
        font: 'sans',
        weight: 'regular',
        size: 7.5,
        lineHeight: 10,
        align: 'left',
        color: 'inkSoft',
        maxLines: 1,
      },
    },
    {
      requires: 'footer',
      shape: {
        kind: 'text',
        slot: 'rodape',
        x: 22,
        y: 284,
        w: 166,
        font: 'sans',
        weight: 'regular',
        size: 8,
        lineHeight: 11,
        align: 'left',
        color: 'inkSoft',
        maxLines: 1,
      },
    },
  ],
};

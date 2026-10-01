// =============================================================================
// docArt/templates/bloco.ts — Arte "Bloco" (A4 paisagem).
// =============================================================================
// Coluna sólida na cor da marca à esquerda com o título grande em branco, e o
// conteúdo respirando no campo claro à direita. Um retângulo de realce cavalga
// a borda da coluna — a sobreposição geométrica é o único ornamento.
//
// Linguagem deliberadamente contemporânea, depois de o CEO reprovar a primeira
// leva por "antiquada": sem moldura, sem serifa, sem filete decorativo, nada
// centralizado. Hierarquia por TAMANHO e PESO, alinhamento à esquerda, e muito
// branco. Caixa alta só nos micro-rótulos.
//
// O logo do tenant fica sempre no campo CLARO: logo escuro sobre bloco escuro
// é o tipo de acidente que só aparece no cliente.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type { DocArtTemplate } from '../types.ts';
import { CERTIFICADO_DEFAULT_SLOTS } from './slots.ts';

export const blocoTemplate: DocArtTemplate = {
  slug: 'bloco',
  name: 'Bloco',
  orientation: 'landscape',
  previewColor: '#1d4ed8',

  defaultTheme: {
    primary: '#1d4ed8',
    accent: '#f59e0b',
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

    // ── Coluna da marca ────────────────────────────────────────────────────
    { shape: { kind: 'rect', x: 0, y: 0, w: 105, h: 210, fill: 'primary' } },
    // Realce: um filete no topo da coluna. Era um retângulo solto no pé, que
    // ficava parecendo colagem.
    { shape: { kind: 'rect', x: 0, y: 0, w: 105, h: 6, fill: 'accent' } },

    {
      shape: {
        kind: 'text',
        slot: 'sobretitulo',
        x: 20,
        y: 46,
        w: 68,
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
        x: 20,
        y: 54,
        w: 74,
        font: 'display',
        weight: 'bold',
        size: 36,
        lineHeight: 39,
        align: 'left',
        color: 'onPrimary',
        maxLines: 2,
      },
    },
    {
      shape: {
        kind: 'text',
        slot: 'subtitulo',
        x: 20,
        y: 76,
        w: 68,
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
    { shape: { kind: 'image', src: 'logo', x: 126, y: 22, w: 46, h: 13, align: 'left' } },

    {
      shape: {
        kind: 'text',
        slot: 'corpo',
        x: 126,
        y: 50,
        w: 145,
        font: 'sans',
        weight: 'regular',
        size: 10,
        lineHeight: 15.5,
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
        x: 126,
        y: 112,
        w: 145,
        font: 'display',
        weight: 'bold',
        size: 12,
        lineHeight: 16,
        align: 'left',
        color: 'accent',
        maxLines: 2,
      },
    },

    // ── Assinatura ─────────────────────────────────────────────────────────
    {
      requires: 'signature',
      shape: { kind: 'image', src: 'signature', x: 126, y: 134, w: 62, h: 16, align: 'left', valign: 'bottom' },
    },
    {
      requires: 'signature',
      shape: {
        kind: 'line',
        x1: 126,
        y1: 153,
        x2: 196,
        y2: 153,
        stroke: 'inkSoft',
        strokeWidth: 0.25,
      },
    },
    {
      requires: 'signature',
      shape: {
        kind: 'text',
        slot: 'assinaturaNome',
        x: 126,
        y: 156,
        w: 100,
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
        x: 126,
        y: 161.5,
        w: 100,
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
    // Os dados do documento ocupam o pé da coluna — é o que dá propósito ao
    // espaço e equilibra o peso do bloco de cor.
    {
      shape: {
        kind: 'text',
        slot: 'lateral',
        x: 20,
        y: 176,
        w: 68,
        font: 'sans',
        weight: 'regular',
        size: 7.5,
        lineHeight: 11,
        align: 'left',
        color: 'onPrimary',
        opacity: 0.7,
        maxLines: 3,
      },
    },
    {
      requires: 'footer',
      shape: {
        kind: 'text',
        slot: 'rodape',
        x: 126,
        y: 192,
        w: 151,
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

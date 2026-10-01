// =============================================================================
// docArt/templates/blocks.ts — Peças que toda arte repete.
// =============================================================================
// Assinatura, rodapé e linha de dados aparecem em todas as artes com a mesma
// estrutura, mudando só posição, alinhamento e cor. Deixar isso espalhado em
// dez arquivos é como as artes começam a divergir em silêncio (uma ganha um
// ajuste, as outras não). Aqui cada peça tem uma definição só.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type {
  ColorRef,
  DocArtConditionalShape,
  DocArtSlotKey,
  Mm,
  TextAlign,
} from '../types.ts';

export interface TextBlockOptions {
  slot: DocArtSlotKey;
  x: Mm;
  y: Mm;
  w: Mm;
  size: number;
  lineHeight?: number;
  align?: TextAlign;
  color?: ColorRef;
  weight?: 'regular' | 'bold';
  font?: 'sans' | 'display';
  uppercase?: boolean;
  letterSpacing?: number;
  paragraphSpacing?: number;
  maxLines?: number;
  opacity?: number;
  rotate?: number;
}

/** Caixa de texto com os defaults que as artes usam quase sempre. */
export function text(opts: TextBlockOptions): DocArtConditionalShape {
  return {
    shape: {
      kind: 'text',
      slot: opts.slot,
      x: opts.x,
      y: opts.y,
      w: opts.w,
      font: opts.font ?? 'sans',
      weight: opts.weight ?? 'regular',
      size: opts.size,
      lineHeight: opts.lineHeight ?? opts.size * 1.45,
      align: opts.align ?? 'left',
      color: opts.color ?? 'ink',
      transform: opts.uppercase ? 'uppercase' : undefined,
      letterSpacing: opts.letterSpacing,
      paragraphSpacing: opts.paragraphSpacing,
      maxLines: opts.maxLines,
      opacity: opts.opacity,
      rotate: opts.rotate,
    },
  };
}

/** Rótulo fino em caixa alta — o "micro-título" das artes modernas. */
export function label(
  opts: Omit<TextBlockOptions, 'uppercase' | 'size'> & { size?: number },
): DocArtConditionalShape {
  return text({
    ...opts,
    size: opts.size ?? 7,
    uppercase: true,
    letterSpacing: opts.letterSpacing ?? 2.4,
    color: opts.color ?? 'inkSoft',
    maxLines: opts.maxLines ?? 1,
  });
}

export interface SignatureBlockOptions {
  /** Canto esquerdo da coluna da assinatura. */
  x: Mm;
  /** Topo da imagem da assinatura. */
  y: Mm;
  /** Largura da linha de assinatura. */
  w: Mm;
  /** Cor do texto do nome. Default `ink`. */
  color?: ColorRef;
  /** Cor da linha e do cargo. Default `inkSoft`. */
  softColor?: ColorRef;
  align?: TextAlign;
}

/**
 * Imagem da assinatura + linha + nome + cargo. Tudo condicionado ao toggle
 * `signature`: desligado, o certificado sai com espaço limpo pra assinar à mão.
 */
export function signatureBlock(opts: SignatureBlockOptions): DocArtConditionalShape[] {
  const { x, y, w } = opts;
  const color = opts.color ?? 'ink';
  const soft = opts.softColor ?? 'inkSoft';
  const align = opts.align ?? 'center';
  const lineY = y + 17;

  return [
    {
      requires: 'signature',
      shape: {
        kind: 'image',
        src: 'signature',
        x: x + 3,
        y,
        w: w - 6,
        h: 14,
        valign: 'bottom',
        align,
      },
    },
    {
      requires: 'signature',
      shape: {
        kind: 'line',
        x1: x,
        y1: lineY,
        x2: x + w,
        y2: lineY,
        stroke: soft,
        strokeWidth: 0.25,
      },
    },
    { requires: 'signature', ...text({ slot: 'assinaturaNome', x, y: lineY + 2, w, size: 8, weight: 'bold', align, color, maxLines: 1 }) },
    { requires: 'signature', ...text({ slot: 'assinaturaCargo', x, y: lineY + 7, w, size: 6.8, align, color: soft, maxLines: 1 }) },
  ];
}
